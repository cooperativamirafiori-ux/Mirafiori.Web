/**
 * Carburante — letture, scritture e il giro completo (leggi i file, segna le
 * fatture dei fornitori noti, dividi). Le regole stanno in `divisione.ts` e
 * `tracciato.ts`, funzioni pure; qui solo il database e SharePoint.
 *
 * Chi paga: la fattura resta sul centro di costo che la paga (cc23,
 * Amministrazione, o quello scelto da chi la segna); il costo si vede diviso
 * nel cruscotto, che legge `carburante_quota`. Docs: docs/carburante.md
 */

import { supabase, tutteLeRighe } from '@/lib/core/supabase'
import { elencaFileCarburante, scaricaFileCarburante } from './cartella'
import { dividiFatture, type Divisione, type FatturaCarburante, type RifornimentoDaDividere } from './divisione'
import { rifornimentiDaFile } from './lettura'
import type { CentroNome, Rifornimento } from './tracciato'

/** Il centro di costo che paga le fatture carburante segnate in automatico. */
export const ccPagamentoCarburante = () => (process.env.CARBURANTE_CC_PAGAMENTO || 'cc23').toLowerCase()

/** Quanto indietro guarda il ricalcolo: le fatture più vecchie restano come sono. */
const MESI_RICALCOLO = 14

// ---------------------------------------------------------------------------
// Lettura dei file
// ---------------------------------------------------------------------------

export interface EsitoFile {
  nome: string
  esito: 'letto' | 'scartato' | 'errore' | 'invariato'
  righe: number
  avvisi: string[]
}

export interface RicevutaCarburante {
  file: EsitoFile[]
  rifornimenti: number
  fattureSegnate: number
  divise: number
  inAttesa: number
}

async function centriNomi(): Promise<CentroNome[]> {
  const { data, error } = await supabase().from('centro_di_costo').select('codice, nome')
  if (error) throw new Error(`Centri di costo: ${error.message}`)
  return (data ?? []) as CentroNome[]
}

const aRiga = (r: Rifornimento, file: string) => ({
  protocollo: r.protocollo,
  data: r.data,
  ora: r.ora,
  carta: r.carta,
  targa: r.targa,
  cc_file: r.ccFile,
  cc_codice: r.cc,
  prodotto: r.prodotto,
  litri: r.litri,
  importo: r.importo,
  imponibile: r.imponibile,
  numero_fattura: r.numeroFattura,
  data_fattura: r.dataFattura,
  file_nome: file,
  letto_il: new Date().toISOString(),
})

/**
 * Legge i file nuovi o cambiati della cartella. `tutti` rilegge anche quelli
 * già letti (serve dopo una correzione delle regole del tracciato).
 */
export async function leggiCartella(opz: { tutti?: boolean } = {}): Promise<{ file: EsitoFile[]; rifornimenti: number }> {
  const db = supabase()
  const [file, centri, { data: giaLetti, error }] = await Promise.all([
    elencaFileCarburante(),
    centriNomi(),
    db.from('carburante_file').select('item_id, modificato_il'),
  ])
  if (error) throw new Error(`File già letti: ${error.message}`)
  const letti = new Map((giaLetti ?? []).map((r: any) => [r.item_id as string, r.modificato_il as string | null]))

  const esiti: EsitoFile[] = []
  let totale = 0
  for (const f of file) {
    const prima = letti.get(f.id)
    if (!opz.tutti && prima !== undefined && prima && f.modificatoIl && Date.parse(prima) >= Date.parse(f.modificatoIl)) {
      esiti.push({ nome: f.nome, esito: 'invariato', righe: 0, avvisi: [] })
      continue
    }
    let esito: EsitoFile
    try {
      const bytes = await scaricaFileCarburante(f.id)
      const r = rifornimentiDaFile(bytes, f.nome, centri)
      if (r.scartato) {
        esito = { nome: f.nome, esito: 'scartato', righe: 0, avvisi: r.avvisi }
      } else {
        for (let i = 0; i < r.rifornimenti.length; i += 500) {
          const blocco = r.rifornimenti.slice(i, i + 500).map((x) => aRiga(x, f.nome))
          const { error: eU } = await db.from('carburante_rifornimento').upsert(blocco, { onConflict: 'protocollo' })
          if (eU) throw new Error(eU.message)
        }
        totale += r.rifornimenti.length
        esito = { nome: f.nome, esito: 'letto', righe: r.rifornimenti.length, avvisi: r.avvisi }
      }
    } catch (e) {
      esito = { nome: f.nome, esito: 'errore', righe: 0, avvisi: [e instanceof Error ? e.message : String(e)] }
    }
    esiti.push(esito)
    const { error: eF } = await db.from('carburante_file').upsert(
      {
        item_id: f.id,
        nome: f.nome,
        // Un errore non registra la data: il file si riprova al giro dopo.
        modificato_il: esito.esito === 'errore' ? null : f.modificatoIl,
        letto_il: new Date().toISOString(),
        righe: esito.righe,
        esito: esito.esito === 'invariato' ? 'letto' : esito.esito,
        avvisi: esito.avvisi.join(' · ') || null,
      },
      { onConflict: 'item_id' },
    )
    if (eF) throw new Error(`Registro dei file: ${eF.message}`)
  }
  return { file: esiti, rifornimenti: totale }
}

// ---------------------------------------------------------------------------
// Fornitori e fatture
// ---------------------------------------------------------------------------

/**
 * Le fatture LIBERE dei fornitori di carburante diventano carburante, pagate
 * dal centro di costo di pagamento. Vince chi è arrivato prima: si toccano
 * solo le fatture ancora senza centro di costo.
 */
export async function segnaFattureFornitoriNoti(): Promise<number> {
  const db = supabase()
  const { data: fornitori, error } = await db.from('carburante_fornitore').select('piva')
  if (error) throw new Error(`Fornitori carburante: ${error.message}`)
  const pive = (fornitori ?? []).map((f: any) => f.piva as string)
  if (!pive.length) return 0
  const { data, error: eU } = await db
    .from('fattura_passiva')
    .update({
      carburante: true,
      cc_codice: ccPagamentoCarburante(),
      cc_rivendicata_da: 'Carburante (fornitore riconosciuto)',
      cc_rivendicata_il: new Date().toISOString(),
    })
    .in('piva', pive)
    .is('cc_codice', null)
    .eq('carburante', false)
    .not('identificativo_sdi', 'is', null)
    .select('id')
  if (eU) throw new Error(`Segnatura carburante: ${eU.message}`)
  return data?.length ?? 0
}

/**
 * Segna a mano delle fatture come carburante e ricorda il fornitore. Una
 * fattura libera passa sul centro di costo di pagamento; una già segnata
 * tiene il suo (è chi paga). Solo per chi vede tutto: lo controlla la route.
 */
export async function segnaCarburante(ids: string[], email: string): Promise<number> {
  if (!ids.length) return 0
  const db = supabase()
  const { data: righe, error } = await db
    .from('fattura_passiva')
    .select('id, piva, fornitore, cc_codice')
    .in('id', ids)
  if (error) throw new Error(`Lettura fatture: ${error.message}`)
  const ora = new Date().toISOString()
  for (const r of (righe ?? []) as Array<{ id: string; piva: string | null; fornitore: string; cc_codice: string | null }>) {
    const cambi: Record<string, unknown> = { carburante: true }
    if (!r.cc_codice) Object.assign(cambi, { cc_codice: ccPagamentoCarburante(), cc_rivendicata_da: email, cc_rivendicata_il: ora })
    const { error: eU } = await db.from('fattura_passiva').update(cambi).eq('id', r.id)
    if (eU) throw new Error(`Segnatura: ${eU.message}`)
    if (r.piva) {
      const { error: eF } = await db
        .from('carburante_fornitore')
        .upsert({ piva: r.piva, nome: r.fornitore, aggiunto_da: email }, { onConflict: 'piva', ignoreDuplicates: true })
      if (eF) throw new Error(`Fornitore: ${eF.message}`)
    }
  }
  return righe?.length ?? 0
}

/**
 * Toglie il carburante: la fattura torna un costo normale del centro di costo
 * che la paga. Il fornitore resta ricordato, ma le sue fatture già segnate non
 * vengono più toccate (si segnano da sole solo quelle libere).
 */
export async function togliCarburante(ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const db = supabase()
  const { error: eQ } = await db.from('carburante_quota').delete().in('fattura_passiva_id', ids)
  if (eQ) throw new Error(`Quote: ${eQ.message}`)
  const { error: eR } = await db.from('carburante_rifornimento').update({ fattura_passiva_id: null }).in('fattura_passiva_id', ids)
  if (eR) throw new Error(`Rifornimenti: ${eR.message}`)
  const { data, error } = await db
    .from('fattura_passiva')
    .update({ carburante: false, carburante_stato: null, carburante_nota: null, carburante_diviso_il: null })
    .in('id', ids)
    .eq('carburante', true)
    .select('id')
  if (error) throw new Error(`Carburante: ${error.message}`)
  return data?.length ?? 0
}

// ---------------------------------------------------------------------------
// Ricalcolo
// ---------------------------------------------------------------------------

const quoteUguali = (a: Array<{ cc: string; importo: number }>, b: Array<{ cc: string; importo: number }>) =>
  a.length === b.length && a.every((q) => b.some((x) => x.cc === q.cc && Math.abs(x.importo - q.importo) < 0.005))

/**
 * Rifà abbinamento e divisione di tutte le fatture carburante degli ultimi
 * mesi. Idempotente: scrive solo ciò che cambia.
 */
export async function ricalcolaCarburante(): Promise<{ divise: number; inAttesa: number; cambiate: number }> {
  const db = supabase()
  const da = new Date()
  da.setMonth(da.getMonth() - MESI_RICALCOLO)
  const dal = da.toISOString().slice(0, 10)

  const fattureRaw = await tutteLeRighe<any>((a, b) =>
    db
      .from('fattura_passiva')
      .select('id, numero_fornitore, data_fornitore, imponibile, descrizione, carburante_stato, carburante_nota, carburante_quota ( cc_codice, importo )')
      .eq('carburante', true)
      .gte('data_fornitore', dal)
      .order('id')
      .range(a, b),
  )
  const rifornimentiRaw = await tutteLeRighe<any>((a, b) =>
    db
      .from('carburante_rifornimento')
      .select('protocollo, data, cc_codice, imponibile, numero_fattura, fattura_passiva_id')
      .gte('data', new Date(da.getTime() - 40 * 86_400_000).toISOString().slice(0, 10))
      .order('protocollo')
      .range(a, b),
  )

  const fatture: FatturaCarburante[] = fattureRaw.map((f) => ({
    id: f.id,
    numero: f.numero_fornitore,
    data: f.data_fornitore,
    imponibile: f.imponibile === null ? null : Number(f.imponibile),
    descrizione: f.descrizione,
  }))
  const rifornimenti: RifornimentoDaDividere[] = rifornimentiRaw.map((r) => ({
    protocollo: r.protocollo,
    data: r.data,
    cc: r.cc_codice,
    imponibile: Number(r.imponibile),
    numeroFattura: r.numero_fattura,
  }))

  const esiti = dividiFatture(fatture, rifornimenti)
  let cambiate = 0
  for (const e of esiti) {
    const prima = fattureRaw.find((f) => f.id === e.id)
    const quotePrima = ((prima?.carburante_quota ?? []) as any[]).map((q) => ({ cc: q.cc_codice, importo: Number(q.importo) }))
    if (prima?.carburante_stato === e.stato && prima?.carburante_nota === e.nota && quoteUguali(quotePrima, e.quote)) continue
    const { error } = await db.rpc('carburante_quote_riscrivi', {
      p_fattura: e.id,
      p_stato: e.stato,
      p_nota: e.nota,
      p_quote: e.quote,
    })
    if (error) throw new Error(`Quote carburante: ${error.message}`)
    cambiate++
  }

  // Chi ha preso quale rifornimento (si legge nel dettaglio della fattura).
  const dovuto = new Map<string, string>()
  for (const e of esiti) for (const p of e.protocolli) dovuto.set(p, e.id)
  const perFattura = new Map<string | null, string[]>()
  for (const r of rifornimentiRaw) {
    const nuovo = dovuto.get(r.protocollo) ?? null
    if ((r.fattura_passiva_id ?? null) === nuovo) continue
    const l = perFattura.get(nuovo) ?? []
    l.push(r.protocollo)
    perFattura.set(nuovo, l)
  }
  for (const [fattura, protocolli] of perFattura) {
    for (let i = 0; i < protocolli.length; i += 300) {
      const { error } = await db
        .from('carburante_rifornimento')
        .update({ fattura_passiva_id: fattura })
        .in('protocollo', protocolli.slice(i, i + 300))
      if (error) throw new Error(`Rifornimenti: ${error.message}`)
    }
  }

  return {
    divise: esiti.filter((e) => e.stato === 'divisa').length,
    inAttesa: esiti.filter((e) => e.stato === 'in_attesa').length,
    cambiate,
  }
}

/** Il giro completo: cron notturno e tasto "Leggi adesso". */
export async function aggiornaCarburante(opz: { tutti?: boolean } = {}): Promise<RicevutaCarburante> {
  const letti = await leggiCartella(opz)
  const fattureSegnate = await segnaFattureFornitoriNoti()
  const r = await ricalcolaCarburante()
  return { file: letti.file, rifornimenti: letti.rifornimenti, fattureSegnate, divise: r.divise, inAttesa: r.inAttesa }
}

// ---------------------------------------------------------------------------
// Dettaglio per la schermata
// ---------------------------------------------------------------------------

export interface DettaglioCarburante {
  stato: 'divisa' | 'in_attesa' | null
  nota: string | null
  quote: Array<{ cc: string; importo: number; rifornimenti: number }>
  rifornimenti: Array<{
    protocollo: string
    data: string
    targa: string | null
    prodotto: string | null
    litri: number | null
    imponibile: number
    cc: string | null
    ccFile: string | null
  }>
}

export async function dettaglioCarburante(id: string): Promise<DettaglioCarburante> {
  const db = supabase()
  const [{ data: f, error: eF }, { data: q, error: eQ }, { data: r, error: eR }] = await Promise.all([
    db.from('fattura_passiva').select('carburante_stato, carburante_nota').eq('id', id).maybeSingle(),
    db.from('carburante_quota').select('cc_codice, importo, rifornimenti').eq('fattura_passiva_id', id),
    db
      .from('carburante_rifornimento')
      .select('protocollo, data, targa, prodotto, litri, imponibile, cc_codice, cc_file')
      .eq('fattura_passiva_id', id)
      .order('data'),
  ])
  const errore = eF ?? eQ ?? eR
  if (errore) throw new Error(errore.message)
  return {
    stato: (f?.carburante_stato as DettaglioCarburante['stato']) ?? null,
    nota: f?.carburante_nota ?? null,
    quote: ((q ?? []) as any[])
      .map((x) => ({ cc: x.cc_codice, importo: Number(x.importo), rifornimenti: x.rifornimenti }))
      .sort((a, b) => b.importo - a.importo),
    rifornimenti: ((r ?? []) as any[]).map((x) => ({
      protocollo: x.protocollo,
      data: x.data,
      targa: x.targa,
      prodotto: x.prodotto,
      litri: x.litri === null ? null : Number(x.litri),
      imponibile: Number(x.imponibile),
      cc: x.cc_codice,
      ccFile: x.cc_file,
    })),
  }
}

/** Le ultime letture della cartella, per la schermata. */
export async function ultimiFile(): Promise<Array<{ nome: string; esito: string; righe: number; avvisi: string | null; lettoIl: string }>> {
  const { data, error } = await supabase()
    .from('carburante_file')
    .select('nome, esito, righe, avvisi, letto_il')
    .order('nome', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)
  return ((data ?? []) as any[]).map((x) => ({ nome: x.nome, esito: x.esito, righe: x.righe, avvisi: x.avvisi, lettoIl: x.letto_il }))
}

export type { Divisione }
