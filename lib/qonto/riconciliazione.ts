/**
 * Riconciliazione Qonto ↔ fatture: legge le uscite di Qonto, le abbina alle
 * scadenze e registra quello che le persone decidono a mano.
 *
 * Le regole stanno in abbina.ts (funzioni pure); qui solo letture e scritture.
 * Decisioni di Dennis del 1/11/2026: docs/riconciliazione-qonto.md.
 *
 * Gira ogni notte nel cron fatture-sdi, dopo l'import degli XML e dopo
 * l'allineamento delle richieste di bonifico, e a richiesta ("Controlla Qonto
 * adesso", e dopo "Importa adesso").
 */

import { supabase } from '@/lib/core/supabase'
import { qontoGet } from './client'
import { getContiQonto, mappaIban, mappaMovimento, type QontoTransaction } from './data'
import { PARTENZA_QONTO } from '@/lib/pagamenti/sdi/regole'
import {
  abbina,
  candidatiManuali,
  chiaveIban,
  chiaveNome,
  giaSuQonto,
  normIbanQ,
  normNome,
  type Controparte,
  type MovimentoDaAbbinare,
  type ScadenzaCandidata,
} from './abbina'

type Db = ReturnType<typeof supabase>

const FUSO = 'Europe/Rome'
const giornoRoma = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date(iso))
/** Movimenti letti da Qonto: dal 1/11/2026, al massimo gli ultimi 120 giorni. */
const GIORNI_FINESTRA = 120

/**
 * Giro una tantum sullo storico (Dennis, 1/11/2026): le uscite da quando c'è
 * Qonto, per trovare fatture ancora aperte che in realtà erano già pagate.
 */
export const STORICO_DAL = '2026-09-01'

function inizioFinestra(): Date {
  const partenza = new Date(`${PARTENZA_QONTO}T00:00:00+01:00`)
  const limite = new Date(Date.now() - GIORNI_FINESTRA * 86_400_000)
  return partenza > limite ? partenza : limite
}

// ------------------------------------------------------------------
// 1. Lettura delle uscite da Qonto
// ------------------------------------------------------------------

export interface EsitoLettura {
  conti: number
  letti: number
  tolti: number
  errori: string[]
}

/**
 * Copia in `qonto_movimento` le uscite di tutti i conti (contabilizzate e in
 * attesa), giroconti esclusi. Lo stato dell'abbinamento non si tocca: l'upsert
 * scrive solo i campi che vengono da Qonto.
 * Le uscite in attesa che Qonto non restituisce più (carta rifiutata,
 * autorizzazione scaduta) e che nessuno ha toccato si cancellano.
 */
export async function leggiMovimentiQonto(opz: { dal?: Date } = {}): Promise<EsitoLettura> {
  const db = supabase()
  const conti = await getContiQonto()
  const perIban = mappaIban(conti)
  const dal = opz.dal ?? inizioFinestra()
  const esito: EsitoLettura = { conti: conti.length, letti: 0, tolti: 0, errori: [] }
  const visti = new Set<string>()
  const adesso = new Date().toISOString()

  for (const conto of conti) {
    try {
      const righe: Record<string, unknown>[] = []
      for (let pagina = 1; pagina < 100; pagina++) {
        const q = new URLSearchParams({
          bank_account_id: conto.id,
          emitted_at_from: dal.toISOString(),
          side: 'debit',
          sort_by: 'emitted_at:asc',
          per_page: '100',
          current_page: String(pagina),
        })
        q.append('status[]', 'pending')
        q.append('status[]', 'completed')
        const res = await qontoGet<{ transactions: QontoTransaction[]; meta?: { next_page?: number | null } }>(
          `/transactions?${q.toString()}`,
        )
        for (const t of res.transactions ?? []) {
          if (t.side !== 'debit' || (t.status !== 'pending' && t.status !== 'completed')) continue
          const m = mappaMovimento(t, perIban)
          if (m.giroconto || m.importo === 0) continue
          visti.add(t.id)
          righe.push({
            id: t.id,
            conto_id: conto.id,
            conto_nome: conto.nomeQonto,
            conto_iban: conto.iban,
            cc_codice: conto.ccCodice,
            data: giornoRoma(t.settled_at ?? t.emitted_at),
            emesso_il: t.emitted_at,
            importo: Math.abs(m.importo),
            stato_qonto: t.status,
            tipo: t.operation_type ?? null,
            controparte: (t.clean_counterparty_name || t.label || '').trim() || null,
            controparte_iban: normIbanQ(t.transfer?.counterparty_account_number) || null,
            etichetta: t.label ?? null,
            riferimento: t.reference ?? null,
            nota: t.note ?? null,
            carta: t.card_last_digits ?? null,
            visto_il: adesso,
          })
        }
        if (!res.meta?.next_page) break
      }
      for (let i = 0; i < righe.length; i += 200) {
        const { error } = await db.from('qonto_movimento').upsert(righe.slice(i, i + 200), { onConflict: 'id' })
        if (error) throw new Error(error.message)
      }
      esito.letti += righe.length
    } catch (e) {
      esito.errori.push(`${conto.nomeQonto}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300))
    }
  }

  // Pulizia delle "in attesa" sparite: solo se tutti i conti si sono letti.
  if (esito.errori.length === 0) {
    const { data } = await db
      .from('qonto_movimento')
      .select('id')
      .eq('stato_qonto', 'pending')
      .eq('abbinamento', 'da_abbinare')
      .gte('emesso_il', dal.toISOString())
      .limit(2000)
    const sparite = (data ?? []).map((r) => r.id as string).filter((id) => !visti.has(id))
    if (sparite.length) {
      await db.from('scadenza').update({ qonto_movimento_id: null }).in('qonto_movimento_id', sparite)
      const { error } = await db.from('qonto_movimento').delete().in('id', sparite)
      if (!error) esito.tolti = sparite.length
    }
  }
  return esito
}

// ------------------------------------------------------------------
// Letture comuni
// ------------------------------------------------------------------

interface RigaMovimento {
  id: string
  conto_nome: string | null
  cc_codice: string | null
  data: string
  importo: number | string
  stato_qonto: 'pending' | 'completed'
  tipo: string | null
  controparte: string | null
  controparte_iban: string | null
  etichetta: string | null
  riferimento: string | null
  carta: string | null
  abbinamento: 'da_abbinare' | 'abbinato' | 'ignorato'
  modo: 'auto' | 'manuale' | null
  abbinato_da: string | null
  abbinato_il: string | null
  nota_abbinamento: string | null
  solo_a_mano: boolean
}

const CAMPI_MOV =
  'id, conto_nome, cc_codice, data, importo, stato_qonto, tipo, controparte, controparte_iban, etichetta, riferimento, carta, abbinamento, modo, abbinato_da, abbinato_il, nota_abbinamento, solo_a_mano'

const aMovimento = (r: RigaMovimento): MovimentoDaAbbinare => ({
  id: r.id,
  data: r.data,
  importo: Number(r.importo),
  ccCodice: r.cc_codice,
  tipo: r.tipo,
  controparte: r.controparte,
  controparteIban: r.controparte_iban,
  etichetta: r.etichetta,
  completato: r.stato_qonto === 'completed',
  soloAMano: r.solo_a_mano,
})

interface RigaScad {
  id: string
  stato: string
  importo: number | string
  iban: string | null
  data_scadenza: string
  data_pagamento: string | null
  segnalazione: string | null
  qonto_stato: string | null
  fattura_passiva: {
    id: string
    fornitore: string
    piva: string | null
    numero_fornitore: string | null
    data_fornitore: string | null
    cc_codice: string | null
    cc_indicato: string | null
    tipo_documento: string
  } | null
}

const CAMPI_SCAD = `id, stato, importo, iban, data_scadenza, data_pagamento, segnalazione, qonto_stato,
  fattura_passiva!inner ( id, fornitore, piva, numero_fornitore, data_fornitore, cc_codice, cc_indicato, tipo_documento )`

/**
 * Le scadenze che un movimento può pagare:
 *  - APERTE (da pagare, da approvare, da verificare) senza movimento, fuori dalle
 *    richieste di bonifico in volo (quelle le chiude la loro richiesta);
 *  - GIÀ PAGATE dal 1/11/2026 senza movimento: si collegano soltanto.
 * Solo fatture (`!inner`): le uscite a mano si abbinano a mano.
 */
async function scadenzeCandidate(db: Db, pagateDal = PARTENZA_QONTO): Promise<{ righe: RigaScad[]; candidate: ScadenzaCandidata[] }> {
  const [aperte, pagate] = await Promise.all([
    db.from('scadenza').select(CAMPI_SCAD)
      .in('stato', ['da_pagare', 'da_approvare', 'da_verificare'])
      .is('qonto_movimento_id', null)
      .gt('importo', 0)
      .limit(3000),
    db.from('scadenza').select(CAMPI_SCAD)
      .eq('stato', 'pagata')
      .is('qonto_movimento_id', null)
      .gte('data_pagamento', pagateDal)
      .gt('importo', 0)
      .limit(3000),
  ])
  if (aperte.error) throw new Error(`Lettura scadenze aperte: ${aperte.error.message}`)
  if (pagate.error) throw new Error(`Lettura scadenze pagate: ${pagate.error.message}`)
  const righe = [
    ...((aperte.data ?? []) as unknown as RigaScad[]).filter((r) => !['invio', 'pending'].includes(r.qonto_stato ?? '')),
    ...((pagate.data ?? []) as unknown as RigaScad[]),
  ].filter((r) => r.fattura_passiva && r.fattura_passiva.tipo_documento !== 'nota_credito')

  const pive = [...new Set(righe.map((r) => r.fattura_passiva!.piva).filter((p): p is string => !!p))]
  const ibanFornitore = new Map<string, string>()
  for (let i = 0; i < pive.length; i += 150) {
    const { data } = await db.from('fornitore').select('piva, iban').in('piva', pive.slice(i, i + 150))
    for (const f of data ?? []) if (f.iban) ibanFornitore.set(f.piva as string, f.iban as string)
  }

  const candidate = righe.map((r): ScadenzaCandidata => {
    const f = r.fattura_passiva!
    return {
      id: r.id,
      fatturaId: f.id,
      piva: f.piva,
      fornitore: f.fornitore,
      dataRif: f.data_fornitore ?? r.data_scadenza,
      importo: Number(r.importo),
      iban: r.iban,
      ibanFornitore: f.piva ? ibanFornitore.get(f.piva) ?? null : null,
      ccIndicato: f.cc_indicato,
      aperta: r.stato !== 'pagata',
    }
  })
  return { righe, candidate }
}

async function controparti(db: Db): Promise<Controparte[]> {
  const { data, error } = await db.from('qonto_controparte').select('chiave, piva, azione').limit(5000)
  if (error) throw new Error(`Lettura controparti: ${error.message}`)
  return (data ?? []) as Controparte[]
}

// ------------------------------------------------------------------
// Chiudere, collegare, centro di costo
// ------------------------------------------------------------------

/**
 * Chiude (o collega) le scadenze al movimento. Una scadenza aperta diventa
 * pagata con la data del movimento; una già pagata prende solo il collegamento.
 * Scrive in modo condizionato sullo stato letto: se nel frattempo qualcuno l'ha
 * toccata, non la si sovrascrive.
 */
async function chiudiConMovimento(
  db: Db,
  m: RigaMovimento,
  scadenze: RigaScad[],
  chi: string,
): Promise<number> {
  const adesso = new Date().toISOString()
  let fatte = 0
  for (const s of scadenze) {
    if (s.stato === 'pagata') {
      const { data } = await db.from('scadenza').update({ qonto_movimento_id: m.id })
        .eq('id', s.id).is('qonto_movimento_id', null).select('id')
      fatte += data?.length ?? 0
    } else {
      const { data } = await db.from('scadenza').update({
        stato: 'pagata',
        data_pagamento: m.data,
        pagata_da: chi,
        pagata_il: adesso,
        origine_pagamento: 'banca',
        qonto_movimento_id: m.id,
        stato_prima_abbinamento: s.stato,
        alert: null,
      }).eq('id', s.id).eq('stato', s.stato).is('qonto_movimento_id', null).select('id')
      fatte += data?.length ?? 0
    }
  }
  await allineaCentroDiCosto(db, m, scadenze)
  return fatte
}

/**
 * Il centro di costo lo dice Qonto (Dennis, 1/11/2026): la fattura pagata da un
 * sottoconto `ccN` va su `ccN`, anche se qualcuno l'aveva presa su un altro —
 * e allora la differenza resta scritta sulla riga. Pagata dal conto principale:
 * resta quello che c'è, e se non c'è niente si usa quello scritto in fattura.
 */
async function allineaCentroDiCosto(db: Db, m: RigaMovimento, scadenze: RigaScad[]) {
  const adesso = new Date().toISOString()
  const fatture = new Map(scadenze.map((s) => [s.fattura_passiva!.id, s.fattura_passiva!]))
  for (const f of fatture.values()) {
    const prima = f.cc_codice?.toLowerCase() ?? null
    const dopo = m.cc_codice?.toLowerCase() ?? (prima ? null : f.cc_indicato)
    if (!dopo || dopo === prima) continue
    await db.from('fattura_passiva').update({
      cc_codice: dopo,
      cc_rivendicata_da: m.cc_codice ? 'Qonto (sottoconto del pagamento)' : 'indicato in fattura',
      cc_rivendicata_il: adesso,
    }).eq('id', f.id)
    if (prima) {
      for (const s of scadenze.filter((x) => x.fattura_passiva!.id === f.id)) {
        const nota = `centro di costo cambiato da ${prima} a ${dopo}: pagata dal sottoconto ${dopo}`
        await db.from('scadenza').update({
          segnalazione: [s.segnalazione, nota].filter(Boolean).join('; ').slice(0, 1000),
        }).eq('id', s.id)
      }
    }
  }
}

// ------------------------------------------------------------------
// 2. L'abbinamento automatico
// ------------------------------------------------------------------

export interface EsitoAbbinamento {
  abbinati: number
  scadenzeChiuse: number
  ignorati: number
  daAbbinare: number
  /** Prova: niente scritto, solo cosa si farebbe. */
  prova?: boolean
  /** Una riga per abbinamento (fatto o, in prova, che si farebbe). */
  dettaglio?: Array<{
    movimentoId: string
    data: string
    importo: number
    controparte: string | null
    conto: string | null
    perche: string
    fatture: Array<{ fornitore: string; numero: string | null; data: string | null; importo: number; stato: string }>
  }>
}

export async function abbinaAutomatico(opz: { pagateDal?: string; prova?: boolean } = {}): Promise<EsitoAbbinamento> {
  const db = supabase()
  const { data, error } = await db.from('qonto_movimento').select(CAMPI_MOV).eq('abbinamento', 'da_abbinare').limit(5000)
  if (error) throw new Error(`Lettura movimenti: ${error.message}`)
  const righeMov = (data ?? []) as RigaMovimento[]
  const [{ righe, candidate }, cp] = await Promise.all([scadenzeCandidate(db, opz.pagateDal), controparti(db)])

  const { abbinamenti, ignorati } = abbina(righeMov.map(aMovimento), candidate, cp)
  const perId = new Map(righe.map((r) => [r.id, r]))
  const movPerId = new Map(righeMov.map((r) => [r.id, r]))
  const adesso = new Date().toISOString()
  const esito: EsitoAbbinamento = { abbinati: 0, scadenzeChiuse: 0, ignorati: 0, daAbbinare: 0, dettaglio: [] }

  for (const a of abbinamenti) {
    const m = movPerId.get(a.movimentoId)!
    const scadA = a.scadenzaIds.map((id) => perId.get(id)!).filter(Boolean)
    esito.dettaglio!.push({
      movimentoId: m.id,
      data: m.data, importo: Number(m.importo), controparte: m.controparte, conto: m.conto_nome, perche: a.perche,
      fatture: scadA.map((s) => ({
        fornitore: s.fattura_passiva?.fornitore ?? '—', numero: s.fattura_passiva?.numero_fornitore ?? null,
        data: s.fattura_passiva?.data_fornitore ?? null, importo: Number(s.importo), stato: s.stato,
      })),
    })
    if (opz.prova) {
      esito.abbinati++
      esito.scadenzeChiuse += scadA.filter((s) => s.stato !== 'pagata').length
      continue
    }
    // Prima si prende il movimento (condizionato): due giri insieme non lo usano due volte.
    const { data: preso } = await db.from('qonto_movimento').update({
      abbinamento: 'abbinato', modo: 'auto', abbinato_da: 'automatico', abbinato_il: adesso, nota_abbinamento: a.perche,
    }).eq('id', m.id).eq('abbinamento', 'da_abbinare').select('id')
    if (!preso?.length) continue
    const scad = a.scadenzaIds.map((id) => perId.get(id)!).filter(Boolean)
    const fatte = await chiudiConMovimento(db, m, scad, 'Qonto (abbinamento automatico)')
    if (fatte === 0) {
      // Le scadenze erano cambiate nel frattempo: il movimento torna libero.
      await db.from('qonto_movimento').update({ abbinamento: 'da_abbinare', modo: null, abbinato_da: null, abbinato_il: null, nota_abbinamento: null }).eq('id', m.id)
      continue
    }
    esito.abbinati++
    esito.scadenzeChiuse += scad.filter((s) => s.stato !== 'pagata').length
  }

  if (opz.prova) {
    esito.prova = true
    esito.ignorati = ignorati.length
    esito.daAbbinare = righeMov.length - esito.abbinati - ignorati.length
    return esito
  }

  if (ignorati.length) {
    const { data: ign } = await db.from('qonto_movimento').update({
      abbinamento: 'ignorato', modo: 'auto', abbinato_da: 'automatico', abbinato_il: adesso,
      nota_abbinamento: 'controparte segnata «non serve fattura»',
    }).in('id', ignorati).eq('abbinamento', 'da_abbinare').select('id')
    esito.ignorati = ign?.length ?? 0
  }

  const { count } = await db.from('qonto_movimento').select('id', { count: 'exact', head: true }).eq('abbinamento', 'da_abbinare')
  esito.daAbbinare = count ?? 0
  return esito
}

/** Il giro completo: lettura da Qonto + abbinamento. */
export async function riconciliaQonto(): Promise<{ lettura: EsitoLettura; abbinamento: EsitoAbbinamento }> {
  const lettura = await leggiMovimentiQonto()
  const abbinamento = await abbinaAutomatico()
  delete abbinamento.dettaglio
  return { lettura, abbinamento }
}

/**
 * Giro UNA TANTUM sullo storico (Dennis, 1/11/2026): legge le uscite da
 * STORICO_DAL e le confronta con le fatture ancora aperte, per trovare quelle
 * già pagate. Stesse regole del giro normale: chiude solo se è sicuro.
 * Le fatture già segnate pagate dall'agosto in poi si collegano al loro
 * movimento senza cambiare niente.
 *
 * Poi le uscite di prima del 1/11 che restano senza fattura e per cui non c'è
 * nessuna fattura aperta plausibile si archiviano («storico»): sono quasi tutte
 * spese con carta di fatture già chiuse con le regole vecchie, e intaserebbero
 * «Da abbinare». Restano da abbinare a mano solo quelle con un candidato aperto.
 *
 * Con `prova` non chiude né archivia niente: dice cosa farebbe. (La copia dei
 * movimenti in qonto_movimento si scrive comunque: è solo una copia.)
 */
export async function riconciliaStorico(opz: { prova?: boolean } = {}) {
  const lettura = await leggiMovimentiQonto({ dal: new Date(`${STORICO_DAL}T00:00:00+02:00`) })
  const abbinamento = await abbinaAutomatico({ pagateDal: '2026-08-01', prova: opz.prova })

  // Archivio delle uscite vecchie senza candidati aperti.
  const db = supabase()
  const { data, error } = await db.from('qonto_movimento').select(CAMPI_MOV)
    .eq('abbinamento', 'da_abbinare').lt('data', PARTENZA_QONTO).limit(5000)
  if (error) throw new Error(`Lettura movimenti storici: ${error.message}`)
  const [{ candidate }, cp] = await Promise.all([scadenzeCandidate(db, '2026-08-01'), controparti(db)])
  const aperte = candidate.filter((c) => c.aperta)
  // In prova i movimenti che si abbinerebbero sono ancora "da abbinare": si tolgono qui.
  const giaAbbinati = new Set(opz.prova ? (abbinamento.dettaglio ?? []).map((d) => d.movimentoId) : [])
  const vecchi = ((data ?? []) as RigaMovimento[]).filter((r) => !giaAbbinati.has(r.id))
  const senzaCandidati = vecchi.filter((r) => candidatiManuali(aMovimento(r), aperte, cp).length === 0)
  const conCandidati = vecchi.length - senzaCandidati.length
  if (!opz.prova && senzaCandidati.length) {
    for (let i = 0; i < senzaCandidati.length; i += 200) {
      await db.from('qonto_movimento').update({
        abbinamento: 'ignorato', modo: 'auto', abbinato_da: 'automatico', abbinato_il: new Date().toISOString(),
        nota_abbinamento: 'storico prima del 1/11/2026: nessuna fattura aperta da abbinare',
      }).in('id', senzaCandidati.slice(i, i + 200).map((r) => r.id)).eq('abbinamento', 'da_abbinare')
    }
  }
  return {
    prova: !!opz.prova,
    lettura,
    abbinamento,
    storico: { archiviati: senzaCandidati.length, restanoDaAbbinare: conCandidati },
  }
}

// ------------------------------------------------------------------
// 3. Per la schermata
// ------------------------------------------------------------------

export interface ScadenzaInBreve {
  id: string
  fornitore: string
  numero: string | null
  dataFattura: string | null
  importo: number
  stato: string
  cc: string | null
  ccIndicato: string | null
  stessoImporto?: boolean
  fornitoreRiconosciuto?: string | null
}

export interface MovimentoInElenco {
  id: string
  data: string
  importo: number
  conto: string | null
  cc: string | null
  tipo: string | null
  controparte: string | null
  riferimento: string | null
  carta: string | null
  inAttesa: boolean
  abbinamento: RigaMovimento['abbinamento']
  modo: RigaMovimento['modo']
  abbinatoDa: string | null
  abbinatoIl: string | null
  nota: string | null
  /** Da abbinare: le fatture proposte. Abbinati: quelle collegate. */
  scadenze: ScadenzaInBreve[]
}

const inBreve = (r: RigaScad): ScadenzaInBreve => ({
  id: r.id,
  fornitore: r.fattura_passiva?.fornitore ?? '—',
  numero: r.fattura_passiva?.numero_fornitore ?? null,
  dataFattura: r.fattura_passiva?.data_fornitore ?? null,
  importo: Number(r.importo),
  stato: r.stato,
  cc: r.fattura_passiva?.cc_codice ?? null,
  ccIndicato: r.fattura_passiva?.cc_indicato ?? null,
})

const inElenco = (r: RigaMovimento, scadenze: ScadenzaInBreve[]): MovimentoInElenco => ({
  id: r.id,
  data: r.data,
  importo: Number(r.importo),
  conto: r.conto_nome,
  cc: r.cc_codice,
  tipo: r.tipo,
  controparte: r.controparte,
  riferimento: r.riferimento,
  carta: r.carta,
  inAttesa: r.stato_qonto === 'pending',
  abbinamento: r.abbinamento,
  modo: r.modo,
  abbinatoDa: r.abbinato_da,
  abbinatoIl: r.abbinato_il,
  nota: r.nota_abbinamento,
  scadenze,
})

export async function elencoRiconciliazione(): Promise<{
  daAbbinare: MovimentoInElenco[]
  recenti: MovimentoInElenco[]
  ultimaLettura: string | null
}> {
  const db = supabase()
  const da30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [aperti, fatti, ultima] = await Promise.all([
    db.from('qonto_movimento').select(CAMPI_MOV).eq('abbinamento', 'da_abbinare').order('data', { ascending: false }).limit(300),
    db.from('qonto_movimento').select(CAMPI_MOV).neq('abbinamento', 'da_abbinare').gte('abbinato_il', da30)
      // L'archivio del giro sullo storico non è una decisione da rivedere: resta fuori.
      .or('nota_abbinamento.is.null,nota_abbinamento.not.like.storico*').order('abbinato_il', { ascending: false }).limit(200),
    db.from('qonto_movimento').select('visto_il').order('visto_il', { ascending: false }).limit(1),
  ])
  if (aperti.error) throw new Error(`Lettura movimenti: ${aperti.error.message}`)
  if (fatti.error) throw new Error(`Lettura abbinamenti: ${fatti.error.message}`)

  const [{ righe, candidate }, cp] = await Promise.all([scadenzeCandidate(db), controparti(db)])
  const perId = new Map(righe.map((r) => [r.id, r]))
  const daAbbinare = ((aperti.data ?? []) as RigaMovimento[]).map((r) =>
    inElenco(
      r,
      candidatiManuali(aMovimento(r), candidate, cp).map((x) => ({
        ...inBreve(perId.get(x.id)!),
        stessoImporto: x.stessoImporto,
        fornitoreRiconosciuto: x.fornitoreRiconosciuto,
      })),
    ),
  )

  const righeFatti = (fatti.data ?? []) as RigaMovimento[]
  const collegate = new Map<string, ScadenzaInBreve[]>()
  if (righeFatti.length) {
    const { data } = await db.from('scadenza').select(`qonto_movimento_id, ${CAMPI_SCAD}`)
      .in('qonto_movimento_id', righeFatti.map((r) => r.id))
    for (const s of (data ?? []) as unknown as Array<RigaScad & { qonto_movimento_id: string }>) {
      collegate.set(s.qonto_movimento_id, [...(collegate.get(s.qonto_movimento_id) ?? []), inBreve(s)])
    }
  }
  const recenti = righeFatti.map((r) => inElenco(r, collegate.get(r.id) ?? []))
  return { daAbbinare, recenti, ultimaLettura: (ultima.data?.[0]?.visto_il as string | undefined) ?? null }
}

export async function contaDaAbbinare(): Promise<number | null> {
  const { count, error } = await supabase().from('qonto_movimento').select('id', { count: 'exact', head: true }).eq('abbinamento', 'da_abbinare')
  return error ? null : count ?? 0
}

// ------------------------------------------------------------------
// 4. Le decisioni a mano
// ------------------------------------------------------------------

async function movimento(db: Db, id: string): Promise<RigaMovimento> {
  const { data, error } = await db.from('qonto_movimento').select(CAMPI_MOV).eq('id', id).maybeSingle()
  if (error) throw new Error(`Lettura movimento: ${error.message}`)
  if (!data) throw new Error('Movimento non trovato')
  return data as RigaMovimento
}

/** Chiave con cui ricordare la controparte: l'IBAN se c'è, altrimenti il nome. */
function chiaveDi(m: RigaMovimento): string | null {
  if (m.controparte_iban) return chiaveIban(m.controparte_iban)
  if (normNome(m.controparte)) return chiaveNome(m.controparte!)
  return null
}

export async function abbinaAMano(movimentoId: string, scadenzaIds: string[], utente: string) {
  const db = supabase()
  const m = await movimento(db, movimentoId)
  if (m.abbinamento !== 'da_abbinare') throw new Error('Questo movimento è già stato sistemato')
  if (!scadenzaIds.length) throw new Error('Scegli almeno una fattura')
  const { data, error } = await db.from('scadenza').select(CAMPI_SCAD).in('id', scadenzaIds)
  if (error) throw new Error(`Lettura scadenze: ${error.message}`)
  const scad = (data ?? []) as unknown as RigaScad[]
  if (scad.length !== scadenzaIds.length) throw new Error('Una delle fatture scelte non si trova più')
  for (const s of scad) {
    if (!['da_pagare', 'da_approvare', 'da_verificare', 'pagata'].includes(s.stato)) {
      throw new Error(`${s.fattura_passiva?.fornitore ?? 'Una fattura'}: non si può abbinare (stato ${s.stato})`)
    }
  }
  const somma = Math.round(scad.reduce((x, s) => x + Number(s.importo), 0) * 100) / 100
  const diff = Math.round((Number(m.importo) - somma) * 100) / 100
  const nota = diff === 0 ? null : `importi diversi: movimento ${Number(m.importo).toFixed(2)} €, fatture ${somma.toFixed(2)} €`

  const { data: preso } = await db.from('qonto_movimento').update({
    abbinamento: 'abbinato', modo: 'manuale', abbinato_da: utente, abbinato_il: new Date().toISOString(), nota_abbinamento: nota,
  }).eq('id', m.id).eq('abbinamento', 'da_abbinare').select('id')
  if (!preso?.length) throw new Error('Qualcun altro l’ha appena sistemato')
  const fatte = await chiudiConMovimento(db, m, scad, `${utente} (abbinata a Qonto)`)
  if (fatte === 0) {
    await db.from('qonto_movimento').update({ abbinamento: 'da_abbinare', modo: null, abbinato_da: null, abbinato_il: null, nota_abbinamento: null }).eq('id', m.id)
    throw new Error('Le fatture scelte sono cambiate nel frattempo (o sono già collegate a un altro movimento): ricarica la pagina')
  }

  // L'app impara: la prossima uscita verso questa controparte riconosce il fornitore.
  const chiave = chiaveDi(m)
  const pive = [...new Set(scad.map((s) => s.fattura_passiva?.piva).filter((p): p is string => !!p))]
  if (chiave && pive.length) {
    await db.from('qonto_controparte').upsert(
      pive.map((piva) => ({ chiave, piva, azione: 'fornitore', creato_da: utente })),
      { onConflict: 'chiave,piva', ignoreDuplicates: true },
    )
  }
  return { scadenze: fatte, nota }
}

export async function ignora(movimentoId: string, nota: string, sempre: boolean, utente: string) {
  const db = supabase()
  const m = await movimento(db, movimentoId)
  if (m.abbinamento !== 'da_abbinare') throw new Error('Questo movimento è già stato sistemato')
  const { data: preso } = await db.from('qonto_movimento').update({
    abbinamento: 'ignorato', modo: 'manuale', abbinato_da: utente, abbinato_il: new Date().toISOString(),
    nota_abbinamento: (nota.trim() || 'non serve fattura').slice(0, 300),
  }).eq('id', m.id).eq('abbinamento', 'da_abbinare').select('id')
  if (!preso?.length) throw new Error('Qualcun altro l’ha appena sistemato')
  const chiave = chiaveDi(m)
  if (sempre && chiave) {
    await db.from('qonto_controparte').upsert(
      [{ chiave, piva: '', azione: 'ignora', creato_da: utente }],
      { onConflict: 'chiave,piva', ignoreDuplicates: true },
    )
  }
  return { sempre: sempre && !!chiave }
}

/**
 * Annulla un abbinamento (automatico o a mano) o un "non serve fattura".
 * Le scadenze chiuse dall'abbinamento tornano allo stato di prima; quelle solo
 * collegate restano pagate. Il movimento torna da abbinare e da qui in avanti
 * si abbina solo a mano: il giro notturno non deve rifare lo stesso errore.
 */
export async function annullaAbbinamento(movimentoId: string, utente: string) {
  const db = supabase()
  const m = await movimento(db, movimentoId)
  if (m.abbinamento === 'da_abbinare') throw new Error('Non c’è niente da annullare')
  const { data, error } = await db.from('scadenza').select('id, stato, stato_prima_abbinamento').eq('qonto_movimento_id', m.id)
  if (error) throw new Error(`Lettura scadenze: ${error.message}`)
  let riaperte = 0
  for (const s of (data ?? []) as Array<{ id: string; stato: string; stato_prima_abbinamento: string | null }>) {
    if (s.stato_prima_abbinamento && s.stato === 'pagata') {
      await db.from('scadenza').update({
        stato: s.stato_prima_abbinamento, data_pagamento: null, pagata_da: null, pagata_il: null,
        origine_pagamento: null, qonto_movimento_id: null, stato_prima_abbinamento: null,
      }).eq('id', s.id)
      riaperte++
    } else {
      await db.from('scadenza').update({ qonto_movimento_id: null, stato_prima_abbinamento: null }).eq('id', s.id)
    }
  }
  await db.from('qonto_movimento').update({
    abbinamento: 'da_abbinare', modo: null, abbinato_da: null, abbinato_il: null,
    nota_abbinamento: `annullato da ${utente}`, solo_a_mano: true,
  }).eq('id', m.id)
  return { riaperte }
}

// ------------------------------------------------------------------
// 5. Prima di inviare un bonifico
// ------------------------------------------------------------------

/**
 * Per ogni scadenza, l'uscita non abbinata su Qonto che sembra già pagarla
 * (anche in attesa). Un guasto qui non deve fermare i bonifici: si restituisce
 * una mappa vuota e chi chiama va avanti.
 */
export async function giaPagateSuQonto(
  scadenze: Array<{ id: string; importo: number; iban: string | null; piva: string | null; fornitore: string; dataRif: string }>,
): Promise<Map<string, { data: string; importo: number; controparte: string | null }>> {
  const esito = new Map<string, { data: string; importo: number; controparte: string | null }>()
  if (!scadenze.length) return esito
  try {
    const db = supabase()
    const { data, error } = await db.from('qonto_movimento').select(CAMPI_MOV).eq('abbinamento', 'da_abbinare').limit(3000)
    if (error) throw error
    const righe = (data ?? []) as RigaMovimento[]
    const mov = righe.map(aMovimento)
    const cp = await controparti(db)
    const pive = [...new Set(scadenze.map((s) => s.piva).filter((p): p is string => !!p))]
    const ibanF = new Map<string, string>()
    if (pive.length) {
      const { data: f } = await db.from('fornitore').select('piva, iban').in('piva', pive)
      for (const x of f ?? []) if (x.iban) ibanF.set(x.piva as string, x.iban as string)
    }
    for (const s of scadenze) {
      const m = giaSuQonto(
        { id: s.id, fatturaId: null, piva: s.piva, fornitore: s.fornitore, dataRif: s.dataRif, importo: s.importo,
          iban: s.iban, ibanFornitore: s.piva ? ibanF.get(s.piva) ?? null : null, ccIndicato: null, aperta: true },
        mov, cp,
      )
      if (m) esito.set(s.id, { data: m.data, importo: m.importo, controparte: m.controparte })
    }
  } catch (e) {
    console.error('[qonto] controllo prima dell’invio', e)
  }
  return esito
}
