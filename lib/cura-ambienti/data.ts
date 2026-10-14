/**
 * Lavori di Cura Ambienti su Supabase (`lavoro_cura_ambienti`), tariffe
 * (`tariffa_interna`) e ore timbrate sul servizio Cura Ambienti.
 *
 * Gli importi non si salvano: si calcolano qui a ogni lettura (vedi
 * supabase/cura_ambienti_lavori.sql). Il registro arriverà al passo 3.
 */

import { supabase } from '@/lib/core/supabase'
import { getStrutture } from '@/lib/strutture/data'
import { getCentriDiCosto } from '@/lib/centri-costo/data'
import {
  CC_CURA_AMBIENTI,
  type DatiLavoro,
  type Figura,
  type Lavoro,
  type LavoroConImporti,
  type RiepilogoMese,
  type Ricorrenza,
  type StatoLavoro,
  type StatoRicorrenza,
  type StrutturaScelta,
  type Tariffe,
  type TariffeStrutture,
} from '@/types/cura-ambienti'
import {
  consuntivoCompleto,
  importiLavoro,
  mesePrecedente,
  modificabile,
  oreConsuntivo,
  orePreventivo,
  puoPassare,
  tariffeDi,
  volte,
} from './flusso'

const TABELLA = 'lavoro_cura_ambienti'
const RICORRENZE = 'ricorrenza_cura_ambienti'
/** Il lavoro con le due cose della sua ricorrenza che servono alla scheda. */
const CON_RICORRENZA = '*, ricorrenza:ricorrenza_cura_ambienti ( frequenza, giorno_settimana )'

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function daRiga(r: any): Lavoro {
  return {
    id: r.id,
    numero: Number(r.numero),
    mese: String(r.mese).slice(0, 10),
    destinatario: r.destinatario,
    strutturaCodice: r.struttura_codice ?? null,
    strutturaNome: r.struttura_nome ?? null,
    ccCodice: r.cc_codice ?? null,
    cliente: r.cliente ?? null,
    titolo: r.titolo,
    descrizione: r.descrizione ?? null,
    ricorrente: !!r.ricorrente || !!r.ricorrenza_id,
    copiatoDa: r.copiato_da ?? null,
    ricorrenzaId: r.ricorrenza_id ?? null,
    frequenza: r.ricorrenza?.frequenza ?? null,
    giornoSettimana: r.ricorrenza?.giorno_settimana ?? null,
    stato: r.stato as StatoLavoro,
    prevOrePulizie: Number(r.prev_ore_pulizie ?? 0),
    prevOreManutenzione: Number(r.prev_ore_manutenzione ?? 0),
    prevMateriali: Number(r.prev_materiali ?? 0),
    consOrePulizie: n(r.cons_ore_pulizie),
    consOreManutenzione: n(r.cons_ore_manutenzione),
    consMateriali: n(r.cons_materiali),
    noteConsuntivo: r.note_consuntivo ?? null,
    vistoDa: r.visto_da ?? null,
    vistoIl: r.visto_il ?? null,
    creatoDa: r.creato_da,
    creatoIl: r.creato_il,
    aggiornatoIl: r.aggiornato_il,
    consuntivatoIl: r.consuntivato_il ?? null,
  }
}

function daRigaRicorrenza(r: any): Ricorrenza {
  return {
    id: r.id,
    destinatario: r.destinatario,
    strutturaCodice: r.struttura_codice ?? null,
    strutturaNome: r.struttura_nome ?? null,
    ccCodice: r.cc_codice ?? null,
    cliente: r.cliente ?? null,
    titolo: r.titolo,
    descrizione: r.descrizione ?? null,
    frequenza: r.frequenza,
    giornoSettimana: r.giorno_settimana ?? null,
    orePulizie: Number(r.ore_pulizie ?? 0),
    oreManutenzione: Number(r.ore_manutenzione ?? 0),
    materiali: Number(r.materiali ?? 0),
    stato: r.stato as StatoRicorrenza,
    dalMese: String(r.dal_mese).slice(0, 10),
  }
}

const fineMese = (mese: string) => {
  const [a, m] = mese.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

// ------------------------------------------------------------
// Anagrafiche
// ------------------------------------------------------------

/** Tariffa per figura valida nel mese: quella con `dal` più recente che lo copre. */
export async function getTariffe(mese: string): Promise<Tariffe> {
  const { data, error } = await supabase()
    .from('tariffa_interna')
    .select('figura, dal, al, euro_ora')
    .lte('dal', fineMese(mese))
    .order('dal', { ascending: false })
  if (error) throw new Error(`Tariffe: ${error.message}`)
  const t: Tariffe = { pulizie: null, manutenzione: null }
  for (const r of data ?? []) {
    if (r.al && String(r.al) < mese) continue
    const f = r.figura as keyof Tariffe
    if (t[f] === null) t[f] = Number(r.euro_ora)
  }
  return t
}

/**
 * Tariffe proprie delle strutture valide nel mese (`tariffa_struttura`).
 * Oggi solo Locanda: detersivi ordinati a parte, tariffa pulizie più bassa.
 */
export async function getTariffeStrutture(mese: string): Promise<TariffeStrutture> {
  const { data, error } = await supabase()
    .from('tariffa_struttura')
    .select('struttura_codice, figura, dal, al, euro_ora')
    .lte('dal', fineMese(mese))
    .order('dal', { ascending: false })
  if (error) throw new Error(`Tariffe per struttura: ${error.message}`)
  const t: TariffeStrutture = {}
  for (const r of data ?? []) {
    if (r.al && String(r.al) < mese) continue
    const s = (t[r.struttura_codice] ??= {})
    const f = r.figura as Figura
    if (s[f] === undefined) s[f] = Number(r.euro_ora)
  }
  return t
}

/** Strutture con il loro centro di costo: l'addebito va lì. */
export async function getStruttureScelta(): Promise<StrutturaScelta[]> {
  const [strutture, centri] = await Promise.all([getStrutture(), getCentriDiCosto()])
  const perId = new Map(centri.map((c) => [c.id, c]))
  return strutture
    .filter((s) => s.codice)
    .map((s) => {
      const cc = s.centroCosto ? perId.get(s.centroCosto.id) : undefined
      return {
        codice: s.codice,
        nome: s.title,
        ccCodice: cc?.codice?.toLowerCase() ?? null,
        ccNome: cc?.nome ?? null,
      }
    })
}

/**
 * Ore timbrate sul servizio Cura Ambienti nel mese, voci di lavoro soltanto.
 * È il tetto con cui si confrontano i consuntivi.
 */
export async function getOreTimbrate(mese: string): Promise<number> {
  const db = supabase()
  const { data: servizi, error: eS } = await db
    .from('servizio')
    .select('id')
    .eq('centro_costo_codice', CC_CURA_AMBIENTI)
  if (eS) throw new Error(`Servizio Cura Ambienti: ${eS.message}`)
  const ids = (servizi ?? []).map((s: any) => s.id)
  if (!ids.length) return 0

  let totale = 0
  const PAGINA = 1000
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await db
      .from('timbratura')
      .select('ore')
      .in('servizio_id', ids)
      .eq('tipo_voce', 'lavoro')
      .gte('data', mese)
      .lte('data', fineMese(mese))
      .range(da, da + PAGINA - 1)
    if (error) throw new Error(`Ore timbrate: ${error.message}`)
    for (const r of data ?? []) totale += Number(r.ore ?? 0)
    if (!data || data.length < PAGINA) break
  }
  return Math.round(totale * 100) / 100
}

// ------------------------------------------------------------
// Letture
// ------------------------------------------------------------

export async function getLavori(mese: string): Promise<Lavoro[]> {
  const { data, error } = await supabase()
    .from(TABELLA)
    .select(CON_RICORRENZA)
    .eq('mese', mese)
    .order('numero', { ascending: false })
  if (error) throw new Error(`Lavori: ${error.message}`)
  return (data ?? []).map(daRiga)
}

export async function getLavoro(id: string): Promise<Lavoro | null> {
  const { data, error } = await supabase().from(TABELLA).select(CON_RICORRENZA).eq('id', id).maybeSingle()
  if (error) throw new Error(`Lavoro: ${error.message}`)
  return data ? daRiga(data) : null
}

/** Le ricorrenze ancora vive (attive o in pausa), le attive prima. */
export async function getRicorrenze(): Promise<Ricorrenza[]> {
  const { data, error } = await supabase()
    .from(RICORRENZE)
    .select('*')
    .neq('stato', 'chiusa')
    .order('stato')
    .order('titolo')
  if (error) throw new Error(`Ricorrenze: ${error.message}`)
  return (data ?? []).map(daRigaRicorrenza)
}

/** Lavori del mese con importi, più il riepilogo che mette a confronto ore timbrate e consuntivi. */
export async function getMese(
  mese: string,
): Promise<{ lavori: LavoroConImporti[]; riepilogo: RiepilogoMese; ricorrenze: Ricorrenza[] }> {
  const [lavori, tariffe, tariffeStrutture, oreTimbrate, ricorrenze] = await Promise.all([
    getLavori(mese),
    getTariffe(mese),
    getTariffeStrutture(mese),
    getOreTimbrate(mese),
    getRicorrenze(),
  ])
  const conImporti = lavori.map((l) => ({
    ...l,
    importi: importiLavoro(l, tariffeDi(tariffe, tariffeStrutture, l.strutturaCodice)),
  }))
  const vivi = conImporti.filter((l) => l.stato !== 'annullato')
  const chiusi = vivi.filter((l) => l.stato === 'consuntivato' || l.stato === 'addebitato')
  const riepilogo: RiepilogoMese = {
    mese,
    tariffe,
    tariffeStrutture,
    oreTimbrate,
    orePreventivate: Math.round(vivi.reduce((s, l) => s + orePreventivo(l), 0) * 100) / 100,
    oreConsuntivate: Math.round(chiusi.reduce((s, l) => s + oreConsuntivo(l), 0) * 100) / 100,
    importoConsuntivato: Math.round(chiusi.reduce((s, l) => s + (l.importi.consuntivo ?? 0), 0) * 100) / 100,
    lavoriAperti: vivi.length - chiusi.length,
  }
  return { lavori: conImporti, riepilogo, ricorrenze }
}

// ------------------------------------------------------------
// Scritture
// ------------------------------------------------------------

async function colonneDestinatario(d: DatiLavoro) {
  if (d.destinatario === 'esterno') {
    return { struttura_codice: null, struttura_nome: null, cc_codice: null, cliente: d.cliente }
  }
  const s = (await getStruttureScelta()).find((x) => x.codice === d.strutturaCodice)
  if (!s) throw new Error(`Struttura ${d.strutturaCodice} non trovata`)
  if (!s.ccCodice) throw new Error(`La struttura ${s.nome} non ha un centro di costo: va assegnato nella lista Strutture`)
  return { struttura_codice: s.codice, struttura_nome: s.nome, cc_codice: s.ccCodice, cliente: null }
}

/**
 * Le ore del preventivo nel mese. Per un settimanale arrivano PER VOLTA: si
 * moltiplicano per le volte che quel giorno cade nel mese.
 */
const colonneOre = (d: DatiLavoro) => ({
  prev_ore_pulizie: d.prevOrePulizie * volte(d.mese, d.frequenza, d.giornoSettimana),
  prev_ore_manutenzione: d.prevOreManutenzione * volte(d.mese, d.frequenza, d.giornoSettimana),
  prev_materiali: d.prevMateriali,
  cons_ore_pulizie: d.consOrePulizie,
  cons_ore_manutenzione: d.consOreManutenzione,
  cons_materiali: d.consMateriali,
  note_consuntivo: d.noteConsuntivo,
})

/** La ricorrenza come la descrive il modulo: ore per volta, materiali al mese. */
const colonneRicorrenza = (d: DatiLavoro, dest: Record<string, unknown>) => ({
  ...dest,
  destinatario: d.destinatario,
  titolo: d.titolo,
  descrizione: d.descrizione,
  frequenza: d.frequenza,
  giorno_settimana: d.frequenza === 'settimanale' ? d.giornoSettimana : null,
  ore_pulizie: d.prevOrePulizie,
  ore_manutenzione: d.prevOreManutenzione,
  materiali: d.prevMateriali,
})

async function creaRicorrenza(d: DatiLavoro, dest: Record<string, unknown>, email: string): Promise<string> {
  const { data, error } = await supabase()
    .from(RICORRENZE)
    .insert({ ...colonneRicorrenza(d, dest), dal_mese: d.mese, creato_da: email, aggiornato_da: email })
    .select('id')
    .single()
  if (error) throw new Error(`Ricorrenza non salvata: ${error.message}`)
  return data.id as string
}

export async function creaLavoro(d: DatiLavoro, email: string): Promise<Lavoro> {
  const dest = await colonneDestinatario(d)
  const ricorrenzaId = d.frequenza ? await creaRicorrenza(d, dest, email) : null
  const { data, error } = await supabase()
    .from(TABELLA)
    .insert({
      mese: d.mese,
      destinatario: d.destinatario,
      ...dest,
      titolo: d.titolo,
      descrizione: d.descrizione,
      ricorrente: !!ricorrenzaId,
      ricorrenza_id: ricorrenzaId,
      ...colonneOre(d),
      stato: 'bozza',
      creato_da: email,
      aggiornato_da: email,
    })
    .select(CON_RICORRENZA)
    .single()
  if (error) {
    // Senza il lavoro la ricorrenza appena nata resterebbe orfana.
    if (ricorrenzaId) await supabase().from(RICORRENZE).delete().eq('id', ricorrenzaId)
    throw new Error(`Salvataggio non riuscito: ${error.message}`)
  }
  return daRiga(data)
}

export async function aggiornaLavoro(id: string, d: DatiLavoro, email: string): Promise<Lavoro> {
  const prima = await getLavoro(id)
  if (!prima) throw new Error('Lavoro non trovato')
  if (!modificabile(prima.stato)) throw new Error('Un lavoro addebitato o annullato non si modifica')
  if ((prima.stato === 'consuntivato') && !consuntivoCompleto(d)) {
    throw new Error('Il lavoro è consuntivato: ore e materiali del consuntivo vanno scritti (anche zero)')
  }
  const dest = await colonneDestinatario(d)
  let ricorrenzaId = prima.ricorrenzaId
  if (ricorrenzaId) {
    // Un lavoro legato a una ricorrenza non smette di ripetersi da qui: per
    // fermarla c'è la sezione Ricorrenti. Senza frequenza si tiene quella che c'era.
    if (!d.frequenza) {
      d = { ...d, frequenza: prima.frequenza ?? 'mensile', giornoSettimana: prima.giornoSettimana }
    }
    const { error: eR } = await supabase()
      .from(RICORRENZE)
      .update({ ...colonneRicorrenza(d, dest), aggiornato_da: email, aggiornato_il: new Date().toISOString() })
      .eq('id', ricorrenzaId)
    if (eR) throw new Error(`Ricorrenza non aggiornata: ${eR.message}`)
  } else if (d.frequenza) {
    ricorrenzaId = await creaRicorrenza(d, dest, email)
  }
  const { data, error } = await supabase()
    .from(TABELLA)
    .update({
      mese: d.mese,
      destinatario: d.destinatario,
      ...dest,
      titolo: d.titolo,
      descrizione: d.descrizione,
      ricorrente: !!ricorrenzaId,
      ricorrenza_id: ricorrenzaId,
      ...colonneOre(d),
      aggiornato_da: email,
      aggiornato_il: new Date().toISOString(),
    })
    .eq('id', id)
    .select(CON_RICORRENZA)
    .single()
  if (error) throw new Error(`Salvataggio non riuscito: ${error.message}`)
  return daRiga(data)
}

export async function cambiaStato(id: string, nuovo: StatoLavoro, email: string): Promise<Lavoro> {
  const prima = await getLavoro(id)
  if (!prima) throw new Error('Lavoro non trovato')
  if (!puoPassare(prima.stato, nuovo)) {
    throw new Error(`Da "${prima.stato}" non si passa a "${nuovo}"`)
  }
  if (nuovo === 'consuntivato' && !consuntivoCompleto(prima)) {
    throw new Error('Prima di chiudere scrivi il consuntivo: ore di pulizia, ore di manutenzione e materiali (anche zero)')
  }
  const ora = new Date().toISOString()
  const { data, error } = await supabase()
    .from(TABELLA)
    .update({
      stato: nuovo,
      aggiornato_da: email,
      aggiornato_il: ora,
      ...(nuovo === 'consuntivato' ? { consuntivato_da: email, consuntivato_il: ora } : {}),
      ...(prima.stato === 'consuntivato' ? { consuntivato_da: null, consuntivato_il: null } : {}),
    })
    .eq('id', id)
    .eq('stato', prima.stato)
    .select(CON_RICORRENZA)
    .maybeSingle()
  if (error) throw new Error(`Cambio di stato non riuscito: ${error.message}`)
  if (!data) throw new Error('Qualcuno ha appena cambiato questo lavoro: ricarica la pagina')
  return daRiga(data)
}

/**
 * Prepara il mese: crea il lavoro del mese per ogni ricorrenza ATTIVA (in
 * pausa e chiuse si saltano). Preventivo:
 *  - settimanale → ore per volta × volte che il giorno cade nel mese;
 *  - mensile     → il consuntivo del mese prima, se c'è (com'era prima delle
 *                  ricorrenze), altrimenti le ore della ricorrenza.
 * Rilanciarlo non crea doppioni: c'è l'indice unico (ricorrenza_id, mese).
 */
export async function preparaMese(mese: string, email: string): Promise<{ creati: number; giaPresenti: number }> {
  const db = supabase()
  const { data: rr, error: eR } = await db.from(RICORRENZE).select('*').eq('stato', 'attiva').lte('dal_mese', mese)
  if (eR) throw new Error(`Ricorrenze: ${eR.message}`)
  const ricorrenze = (rr ?? []).map(daRigaRicorrenza)
  if (!ricorrenze.length) return { creati: 0, giaPresenti: 0 }

  const ids = ricorrenze.map((r) => r.id)
  const prec = mesePrecedente(mese)
  const { data: esistenti, error: eE } = await db
    .from(TABELLA)
    .select('*')
    .in('ricorrenza_id', ids)
    .in('mese', [mese, prec])
  if (eE) throw new Error(`Lavori ricorrenti: ${eE.message}`)
  const gia = new Set((esistenti ?? []).filter((l: any) => String(l.mese).slice(0, 10) === mese).map((l: any) => l.ricorrenza_id))
  const delMesePrima = new Map(
    (esistenti ?? [])
      .filter((l: any) => String(l.mese).slice(0, 10) === prec && l.stato !== 'annullato')
      .map((l: any) => [l.ricorrenza_id as string, daRiga(l)]),
  )

  const righe = ricorrenze
    .filter((r) => !gia.has(r.id))
    .map((r) => {
      const n = volte(mese, r.frequenza, r.giornoSettimana)
      const prima = r.frequenza === 'mensile' ? delMesePrima.get(r.id) : undefined
      return {
        mese,
        destinatario: r.destinatario,
        struttura_codice: r.strutturaCodice,
        struttura_nome: r.strutturaNome,
        cc_codice: r.ccCodice,
        cliente: r.cliente,
        titolo: r.titolo,
        descrizione: r.descrizione,
        ricorrente: true,
        ricorrenza_id: r.id,
        copiato_da: prima?.id ?? null,
        stato: 'preventivato',
        prev_ore_pulizie: prima?.consOrePulizie ?? r.orePulizie * n,
        prev_ore_manutenzione: prima?.consOreManutenzione ?? r.oreManutenzione * n,
        prev_materiali: prima?.consMateriali ?? r.materiali,
        creato_da: email,
        aggiornato_da: email,
      }
    })
  if (righe.length) {
    const { error } = await db.from(TABELLA).insert(righe)
    if (error) throw new Error(`Preparazione del mese non riuscita: ${error.message}`)
  }
  return { creati: righe.length, giaPresenti: gia.size }
}

/**
 * Pausa, ripresa o chiusura di una ricorrenza. Tocca solo i mesi che verranno:
 * i lavori già creati restano come sono (si annullano a mano, se serve).
 */
export async function cambiaStatoRicorrenza(id: string, stato: StatoRicorrenza, email: string): Promise<Ricorrenza> {
  const { data: prima, error: e1 } = await supabase().from(RICORRENZE).select('stato').eq('id', id).maybeSingle()
  if (e1) throw new Error(`Ricorrenza: ${e1.message}`)
  if (!prima) throw new Error('Ricorrenza non trovata')
  if (prima.stato === 'chiusa') throw new Error('Una ricorrenza chiusa non si riapre: creane una nuova')
  const { data, error } = await supabase()
    .from(RICORRENZE)
    .update({ stato, aggiornato_da: email, aggiornato_il: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`Cambio non riuscito: ${error.message}`)
  return daRigaRicorrenza(data)
}

/**
 * Consuntivi dell'anno per struttura e mese: è ciò che Cura Ambienti addebita
 * alle strutture (lavori consuntivati o addebitati, destinatario struttura).
 * Lo usa il cruscotto Costi per struttura. Importo null se manca la tariffa.
 */
export async function getConsuntiviAnno(
  anno: number,
): Promise<Array<{ strutturaCodice: string; mese: string; titolo: string; importo: number | null }>> {
  const { data, error } = await supabase()
    .from(TABELLA)
    .select('*')
    .eq('destinatario', 'struttura')
    .in('stato', ['consuntivato', 'addebitato'])
    .gte('mese', `${anno}-01-01`)
    .lte('mese', `${anno}-12-01`)
  if (error) throw new Error(`Consuntivi Cura Ambienti: ${error.message}`)
  const lavori = (data ?? []).map(daRiga)
  const mesi = [...new Set(lavori.map((l) => l.mese))]
  const tariffe = new Map(
    await Promise.all(
      mesi.map(async (m) => [m, { base: await getTariffe(m), strutture: await getTariffeStrutture(m) }] as const),
    ),
  )
  return lavori
    .filter((l) => l.strutturaCodice)
    .map((l) => {
      const t = tariffe.get(l.mese)!
      return {
        strutturaCodice: l.strutturaCodice!,
        mese: l.mese,
        titolo: l.titolo,
        importo: importiLavoro(l, tariffeDi(t.base, t.strutture, l.strutturaCodice)).consuntivo,
      }
    })
}
