/**
 * Utenze: l'anagrafica (lista SharePoint "Mappatura Utenze") e le bollette
 * (Supabase `bolletta` + `bolletta_quota`).
 *
 * Il percorso di una bolletta:
 *   1. l'import notturno degli XML SDI legge le forniture della fattura
 *      (lib/pagamenti/sdi/forniture.ts) e chiama `registraBollette`;
 *   2. per ogni codice si cerca la riga della Mappatura: se c'è, la bolletta
 *      nasce già divisa sulle strutture (quote) e la fattura prende da sola il
 *      centro di costo; se non c'è, resta "da collegare";
 *   3. chi collega il codice dalla schermata Utenze (`collegaCodice`) sistema
 *      tutte le bollette di quel codice ancora in attesa.
 *
 * Regola che regge tutto: struttura e centro di costo si COPIANO sulla quota
 * al momento del collegamento e non si ricalcolano. Cambiare la Mappatura
 * vale per le bollette future; per riscrivere quelle passate c'è l'opzione
 * esplicita `riapplica`.
 */

import { graphDelete, graphGetAll, graphPatch, graphPost } from '@/lib/core/graph'
import { PREFER_NON_INDEXED, SITE } from '@/lib/core/sp'
import { supabase } from '@/lib/core/supabase'
import { getStrutture } from '@/lib/strutture/data'
import { getCentriDiCosto } from '@/lib/centri-costo/data'
import {
  TIPO_SP,
  codiceValido,
  normCodice,
  tipoDaSp,
  type Bolletta,
  type DaCollegare,
  type DatiMappatura,
  type FornituraSdi,
  type RigaMappatura,
  type StrutturaCc,
  type UtenzaConUltima,
} from '@/types/utenze'

const LISTA = () => {
  const id = process.env.SP_LIST_MAPPATURA_UTENZE
  if (!id) throw new Error('Variabile SP_LIST_MAPPATURA_UTENZE mancante: vedi docs/utenze.md')
  return id
}
const base = () => `/sites/${SITE()}/lists/${LISTA()}/items`

/** Chi firma i collegamenti automatici. */
export const AUTOMATICO = 'utenze (automatico)'

// ------------------------------------------------------------
// Anagrafiche
// ------------------------------------------------------------

export async function getStruttureCc(): Promise<StrutturaCc[]> {
  const [strutture, centri] = await Promise.all([getStrutture(), getCentriDiCosto()])
  const perId = new Map(centri.map((c) => [c.id, c]))
  return strutture
    .filter((s) => s.codice && !/^ZZ_/i.test(s.codice))
    .map((s) => {
      const cc = s.centroCosto ? perId.get(s.centroCosto.id) : undefined
      return {
        id: s.id,
        codice: s.codice,
        nome: s.title,
        ccCodice: cc?.codice?.toLowerCase() ?? null,
        ccNome: cc?.nome ?? null,
      }
    })
}

export async function getMappatura(): Promise<RigaMappatura[]> {
  const voci = await graphGetAll<any>(
    `${base()}?$select=id&$expand=fields($select=Title,TipoFornitura,StrutturaLookupId,Percentuale,Fornitore,Note)&$top=999`,
    PREFER_NON_INDEXED,
  )
  return voci.map((i) => {
    const f = i.fields ?? {}
    const codice = String(f.Title ?? '').trim()
    return {
      id: Number(i.id),
      codice,
      tipo: tipoDaSp(f.TipoFornitura),
      strutturaId: Number(f.StrutturaLookupId ?? 0) || null,
      percentuale: Number(f.Percentuale ?? 100) || 100,
      fornitore: String(f.Fornitore ?? '').trim(),
      note: String(f.Note ?? '').trim(),
      segnaposto: !codiceValido(codice),
    }
  })
}

function campiSp(d: DatiMappatura) {
  return {
    Title: d.codice.trim(),
    TipoFornitura: TIPO_SP[d.tipo],
    StrutturaLookupId: d.strutturaId,
    CodiceStrutturaLookupId: d.strutturaId,
    Percentuale: d.percentuale,
    Fornitore: d.fornitore || null,
    Note: d.note || null,
  }
}

export async function creaUtenza(d: DatiMappatura): Promise<number> {
  const r = await graphPost<{ id: string }>(base(), { fields: campiSp(d) })
  return Number(r.id)
}

export async function aggiornaUtenza(id: number, d: DatiMappatura): Promise<void> {
  await graphPatch(`${base()}/${id}/fields`, campiSp(d))
}

/** Solo per le righe doppie: dall'app non c'è un "elimina" (vedi docs/utenze.md). */
export async function eliminaUtenzaSp(id: number): Promise<void> {
  await graphDelete(`${base()}/${id}`)
}

// ------------------------------------------------------------
// Quote: dalla Mappatura alla bolletta
// ------------------------------------------------------------

export interface ContestoUtenze {
  mappatura: RigaMappatura[]
  strutture: StrutturaCc[]
}

export async function caricaContesto(): Promise<ContestoUtenze> {
  const [mappatura, strutture] = await Promise.all([getMappatura(), getStruttureCc()])
  return { mappatura, strutture }
}

/**
 * Le quote di un codice secondo la Mappatura di oggi; [] se il codice non c'è,
 * non ha struttura, o le percentuali superano il 100% (contare due volte la
 * stessa bolletta è peggio che lasciarla "da collegare": la schermata Utenze
 * segnala le percentuali che non tornano). Due righe sulla stessa struttura si
 * sommano in una quota sola.
 */
export function quoteDi(ctx: ContestoUtenze, codice: string) {
  const c = normCodice(codice)
  const perId = new Map(ctx.strutture.map((s) => [s.id, s]))
  const righe = ctx.mappatura.filter((m) => normCodice(m.codice) === c && m.strutturaId && perId.has(m.strutturaId))
  const totale = righe.reduce((t, m) => t + m.percentuale, 0)
  if (totale > 100.01) {
    console.warn(`[utenze] ${c}: percentuali al ${totale}% nella Mappatura, bollette lasciate da collegare`)
    return []
  }
  const perStruttura = new Map<number, { percentuale: number; mappatura_sp_id: number }>()
  for (const m of righe) {
    const p = perStruttura.get(m.strutturaId!)
    perStruttura.set(m.strutturaId!, { percentuale: (p?.percentuale ?? 0) + m.percentuale, mappatura_sp_id: p?.mappatura_sp_id ?? m.id })
  }
  return [...perStruttura.entries()].map(([id, q]) => {
    const s = perId.get(id)!
    return {
      struttura_sp_id: s.id,
      struttura_codice: s.codice,
      struttura_nome: s.nome,
      cc_codice: s.ccCodice,
      percentuale: q.percentuale,
      mappatura_sp_id: q.mappatura_sp_id,
    }
  })
}

/**
 * Se tutte le quote delle bollette di una fattura stanno su UN centro di
 * costo, la fattura lo prende — solo se è ancora libera (vince chi c'è già).
 */
async function ccAutomatico(fatturaId: string): Promise<void> {
  const db = supabase()
  const { data } = await db
    .from('bolletta')
    .select('id, bolletta_quota(cc_codice)')
    .eq('fattura_passiva_id', fatturaId)
  const cc = new Set<string | null>()
  let senzaQuote = false
  for (const b of data ?? []) {
    const q = (b as any).bolletta_quota as Array<{ cc_codice: string | null }>
    if (!q?.length) senzaQuote = true
    for (const x of q ?? []) cc.add(x.cc_codice)
  }
  if (senzaQuote || cc.size !== 1) return
  const [codice] = [...cc]
  if (!codice) return
  await db
    .from('fattura_passiva')
    .update({ cc_codice: codice, cc_rivendicata_da: AUTOMATICO, cc_rivendicata_il: new Date().toISOString() })
    .eq('id', fatturaId)
    .is('cc_codice', null)
}

async function scriviQuote(ctx: ContestoUtenze, bollettaId: string, codice: string, utente: string): Promise<boolean> {
  const quote = quoteDi(ctx, codice)
  if (!quote.length) return false
  const { error } = await supabase()
    .from('bolletta_quota')
    .insert(quote.map((q) => ({ ...q, bolletta_id: bollettaId, collegata_da: utente })))
  if (error) throw new Error(`quote bolletta: ${error.message}`)
  return true
}

/** Quello che serve di una fattura letta dall'XML (sottoinsieme di FatturaSdi). */
export interface FatturaPerUtenze {
  forniture: FornituraSdi[]
  testoUtenze: string
  imponibile: number
  natura: string
}

/**
 * Registra le bollette di una fattura appena importata. Idempotente: una
 * bolletta già presente non si tocca. Ritorna quante bollette ha trovato.
 */
export async function registraBollette(ctx: ContestoUtenze, fatturaId: string, f: FatturaPerUtenze): Promise<number> {
  const db = supabase()
  if (f.natura === 'integrazione') {
    await db.from('fattura_passiva').update({ utenze_lette_il: new Date().toISOString() }).eq('id', fatturaId)
    return 0
  }
  const segno = f.natura === 'nota_credito' ? -1 : 1

  let forniture = f.forniture
  if (!forniture.length && f.testoUtenze) {
    // Nessun codice in riga: si cercano nel testo i codici veri già noti
    // (contratto SMAT, codice utenza) — solo se ne compare uno.
    const noti = [...new Set(ctx.mappatura.filter((m) => !m.segnaposto).map((m) => normCodice(m.codice)))]
    const trovati = noti.filter((c) => c.length >= 8 && f.testoUtenze.includes(c))
    if (trovati.length === 1) {
      const m = ctx.mappatura.find((x) => normCodice(x.codice) === trovati[0])!
      forniture = [{ codice: trovati[0], tipo: m.tipo, importo: f.imponibile, consumo: null, unita: null, periodoDal: null, periodoAl: null }]
    }
  }

  for (const fo of forniture) {
    const { data: gia } = await db
      .from('bolletta')
      .select('id')
      .eq('fattura_passiva_id', fatturaId)
      .eq('codice', fo.codice)
      .maybeSingle()
    if (gia) continue
    const { data, error } = await db
      .from('bolletta')
      .insert({
        fattura_passiva_id: fatturaId,
        codice: fo.codice,
        tipo: fo.tipo,
        importo: segno * Math.abs(fo.importo),
        consumo: fo.consumo == null ? null : segno * Math.abs(fo.consumo),
        unita: fo.unita,
        periodo_dal: fo.periodoDal,
        periodo_al: fo.periodoAl,
      })
      .select('id')
      .single()
    if (error) throw new Error(`bolletta: ${error.message}`)
    await scriviQuote(ctx, data.id, fo.codice, AUTOMATICO)
  }
  if (forniture.length) await ccAutomatico(fatturaId)
  await db.from('fattura_passiva').update({ utenze_lette_il: new Date().toISOString() }).eq('id', fatturaId)
  return forniture.length
}

/**
 * Applica la Mappatura di oggi alle bollette di un codice.
 *  - di base solo a quelle ancora senza quote (le "da collegare");
 *  - con `riapplica` anche a quelle già divise: le quote vecchie si tolgono.
 * Ritorna quante bollette ha sistemato.
 */
export async function collegaCodice(codice: string, utente: string, riapplica = false): Promise<number> {
  const db = supabase()
  const ctx = await caricaContesto()
  const c = normCodice(codice)
  const { data, error } = await db.from('bolletta').select('id, fattura_passiva_id, bolletta_quota(id)').eq('codice', c)
  if (error) throw new Error(`bollette del codice: ${error.message}`)
  let n = 0
  for (const b of data ?? []) {
    const haQuote = ((b as any).bolletta_quota ?? []).length > 0
    if (haQuote && !riapplica) continue
    if (haQuote) await db.from('bolletta_quota').delete().eq('bolletta_id', b.id)
    if (await scriviQuote(ctx, b.id, c, utente)) {
      n++
      await ccAutomatico(b.fattura_passiva_id)
    }
  }
  return n
}

// ------------------------------------------------------------
// Letture
// ------------------------------------------------------------

/** Tutte le righe di una select, a pagine da 1000 (il tetto di PostgREST). */
async function tutteLeRighe(sel: string, nome: string): Promise<any[]> {
  const out: any[] = []
  const PAGINA = 1000
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await supabase().from('bolletta').select(sel).order('id').range(da, da + PAGINA - 1)
    if (error) throw new Error(`${nome}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  return out
}

const SEL_BOLLETTA =
  'id, fattura_passiva_id, codice, tipo, importo, consumo, unita, periodo_dal, periodo_al, ' +
  'fattura_passiva!inner(fornitore, numero_fornitore, data_fornitore, pdf_url), ' +
  'bolletta_quota(struttura_sp_id, struttura_nome, cc_codice, percentuale)'

function aBolletta(r: any): Bolletta {
  return {
    id: r.id,
    fatturaId: r.fattura_passiva_id,
    fornitore: r.fattura_passiva?.fornitore ?? '',
    numero: r.fattura_passiva?.numero_fornitore ?? '',
    dataFattura: r.fattura_passiva?.data_fornitore ?? '',
    codice: r.codice,
    tipo: r.tipo,
    importo: Number(r.importo),
    consumo: r.consumo == null ? null : Number(r.consumo),
    unita: r.unita ?? null,
    periodoDal: r.periodo_dal ?? null,
    periodoAl: r.periodo_al ?? null,
    pdfUrl: r.fattura_passiva?.pdf_url ?? null,
    quote: (r.bolletta_quota ?? []).map((q: any) => ({
      strutturaId: Number(q.struttura_sp_id),
      strutturaNome: q.struttura_nome ?? '',
      ccCodice: q.cc_codice ?? null,
      percentuale: Number(q.percentuale),
    })),
  }
}

/** Bollette con data fattura o periodo che tocca l'anno (si legge un mese prima e dopo per i periodi a cavallo). */
export async function getBollette(anno: number): Promise<Bolletta[]> {
  const db = supabase()
  const out: Bolletta[] = []
  const PAGINA = 1000
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await db
      .from('bolletta')
      .select(SEL_BOLLETTA)
      .order('id')
      .gte('fattura_passiva.data_fornitore', `${anno - 1}-11-01`)
      .lte('fattura_passiva.data_fornitore', `${anno + 1}-03-31`)
      .range(da, da + PAGINA - 1)
    if (error) throw new Error(`bollette: ${error.message}`)
    out.push(...(data ?? []).map(aBolletta))
    if (!data || data.length < PAGINA) break
  }
  return out
}

/** Codici arrivati in fattura senza riga in Mappatura (bollette senza quote). */
export async function getDaCollegare(): Promise<DaCollegare[]> {
  const data = await tutteLeRighe('codice, tipo, importo, bolletta_quota(id), fattura_passiva!inner(fornitore, data_fornitore)', 'da collegare')
  const perCodice = new Map<string, DaCollegare>()
  for (const r of (data ?? []) as any[]) {
    if ((r.bolletta_quota ?? []).length) continue
    const p = perCodice.get(r.codice) ?? { codice: r.codice, tipo: r.tipo, fornitore: r.fattura_passiva.fornitore, bollette: 0, importo: 0, ultima: '' }
    p.bollette++
    p.importo = Math.round((p.importo + Number(r.importo)) * 100) / 100
    if ((r.fattura_passiva.data_fornitore ?? '') > p.ultima) p.ultima = r.fattura_passiva.data_fornitore
    perCodice.set(r.codice, p)
  }
  return [...perCodice.values()].sort((a, b) => b.ultima.localeCompare(a.ultima))
}

/** Mappatura con l'ultima bolletta di ogni codice e quante ne sono arrivate nell'anno. */
export async function getUtenzeConUltima(mappatura: RigaMappatura[], anno: number): Promise<UtenzaConUltima[]> {
  const data = await tutteLeRighe('codice, importo, consumo, unita, periodo_dal, periodo_al, fattura_passiva!inner(data_fornitore)', 'ultime bollette')
  const ultima = new Map<string, UtenzaConUltima['ultima']>()
  const conta = new Map<string, number>()
  for (const r of (data ?? []) as any[]) {
    const d = r.fattura_passiva.data_fornitore ?? ''
    if (d.startsWith(String(anno))) conta.set(r.codice, (conta.get(r.codice) ?? 0) + 1)
    const u = ultima.get(r.codice)
    if (!u || d > u.data) {
      ultima.set(r.codice, {
        data: d,
        importo: Number(r.importo),
        consumo: r.consumo == null ? null : Number(r.consumo),
        unita: r.unita ?? null,
        periodoDal: r.periodo_dal ?? null,
        periodoAl: r.periodo_al ?? null,
      })
    }
  }
  return mappatura.map((m) => ({
    ...m,
    bolletteAnno: conta.get(normCodice(m.codice)) ?? 0,
    ultima: ultima.get(normCodice(m.codice)) ?? null,
  }))
}

/**
 * Fatture di utenze con il centro di costo diverso da quello delle loro quote:
 * succede se un coordinatore l'ha segnata prima del collegamento, o se la
 * bolletta è divisa su più centri. Non è un doppione (ogni cruscotto conta la
 * sua fonte una volta), ma i due cruscotti direbbero cose diverse: si mostra.
 */
export async function getConflittiCc(): Promise<Array<{ fatturaId: string; fornitore: string; numero: string; data: string; ccFattura: string | null; ccQuote: string[] }>> {
  const righe = await tutteLeRighe(
    'fattura_passiva_id, bolletta_quota(cc_codice), fattura_passiva!inner(fornitore, numero_fornitore, data_fornitore, cc_codice)',
    'conflitti',
  )
  const perFattura = new Map<string, { fatturaId: string; fornitore: string; numero: string; data: string; ccFattura: string | null; ccQuote: Set<string>; senzaQuote: boolean }>()
  for (const r of righe) {
    const f = r.fattura_passiva
    const p = perFattura.get(r.fattura_passiva_id) ?? { fatturaId: r.fattura_passiva_id, fornitore: f.fornitore, numero: f.numero_fornitore ?? '', data: f.data_fornitore ?? '', ccFattura: f.cc_codice ?? null, ccQuote: new Set<string>(), senzaQuote: false }
    const q = (r.bolletta_quota ?? []) as Array<{ cc_codice: string | null }>
    if (!q.length) p.senzaQuote = true
    for (const x of q) p.ccQuote.add(x.cc_codice ?? '—')
    perFattura.set(r.fattura_passiva_id, p)
  }
  return [...perFattura.values()]
    .filter((p) => !p.senzaQuote && p.ccQuote.size > 0 && (p.ccQuote.size > 1 || (p.ccFattura !== null && !p.ccQuote.has(p.ccFattura))))
    .map((p) => ({ ...p, ccQuote: [...p.ccQuote] }))
    .sort((a, b) => b.data.localeCompare(a.data))
}
