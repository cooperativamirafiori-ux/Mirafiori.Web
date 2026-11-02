/**
 * I costi di una richiesta di manutenzione (fase 2, docs/manutenzioni-piano.md).
 *
 * Tutto passa da Cura Ambienti (cc24): le fatture si prendono su cc24 e si
 * collegano alla manutenzione, anche divise fra più manutenzioni; le ore del
 * personale valgono la tariffa interna del mese; le spese senza fattura si
 * scrivono a mano. Il cruscotto Costi per struttura legge da qui
 * (`costiDellAnno`), sulla struttura della richiesta.
 *
 * ⚠️ L'importo delle ore NON si salva: ore × tariffa del mese, ricalcolato a
 * ogni lettura, come i Lavori di Cura Ambienti.
 * ⚠️ Delle fatture conta l'IMPONIBILE (IVA esclusa), come nel cruscotto del
 * controllo di gestione (5/10/2026). Se un giorno si decide il totale con IVA,
 * si cambia `IMPORTO_FATTURA` e basta.
 */

import { supabase } from '@/lib/core/supabase'
import { getTariffe, getTariffeStrutture } from '@/lib/cura-ambienti/data'
import { tariffeDi } from '@/lib/cura-ambienti/flusso'
import { segna } from '@/lib/pagamenti/assegnazione'
import { getStruttureCc } from '@/lib/utenze/data'
import { meseChiuso, meseDiAddebito } from '@/lib/servizi-interni/automatici'
import type { Tariffe, TariffeStrutture } from '@/types/cura-ambienti'
import type {
  CostoPratica,
  FatturaCollegabile,
  NuovoCostoPratica,
  RichiestaManutenzione,
} from '@/types/manutenzioni'

/** Il centro di costo di Cura Ambienti: le fatture delle manutenzioni stanno lì. */
export const CC_CURA_AMBIENTI = 'cc24'

/** Quale importo della fattura si distribuisce. Vedi intestazione. */
const IMPORTO_FATTURA = 'imponibile' as const

const tondo = (n: number) => Math.round(n * 100) / 100

const CAMPI = `id, richiesta_sp_id, id_richiesta, struttura_id, struttura_codice, cc_codice, tipo, data,
  importo, ore, figura, descrizione, fornitore, creato_il, mese_addebito,
  fattura_passiva ( id, numero_fornitore, data_fornitore, imponibile, totale, pdf_url )`

/** Tariffe per mese, lette una volta sola per chiamata. */
function lettoreTariffe() {
  const cache = new Map<string, Promise<{ base: Tariffe; strutture: TariffeStrutture }>>()
  return (mese: string) => {
    let p = cache.get(mese)
    if (!p) {
      p = Promise.all([getTariffe(mese), getTariffeStrutture(mese)]).then(([base, strutture]) => ({ base, strutture }))
      cache.set(mese, p)
    }
    return p
  }
}

async function mapCosti(righe: any[]): Promise<Array<CostoPratica & { strutturaId: number | null; idRichiesta: string; richiestaSpId: string }>> {
  const tariffe = lettoreTariffe()
  return Promise.all(righe.map(async (r) => {
    let importo: number | null = r.importo == null ? null : Number(r.importo)
    if (r.tipo === 'ore') {
      const mese = `${String(r.data).slice(0, 7)}-01`
      const { base, strutture } = await tariffe(mese)
      const euro = tariffeDi(base, strutture, r.struttura_codice)[r.figura as 'manutenzione' | 'pulizie']
      importo = euro == null ? null : tondo(Number(r.ore) * euro)
    }
    const f = r.fattura_passiva
    return {
      id: r.id,
      tipo: r.tipo,
      data: String(r.data),
      meseAddebito: r.mese_addebito ? String(r.mese_addebito) : null,
      importo,
      ore: r.ore == null ? null : Number(r.ore),
      figura: r.figura ?? null,
      descrizione: r.descrizione ?? null,
      fornitore: r.fornitore ?? null,
      fattura: f
        ? {
            id: f.id,
            numero: f.numero_fornitore ?? null,
            data: f.data_fornitore ?? null,
            imponibile: Number(f[IMPORTO_FATTURA] ?? f.totale ?? 0),
            pdfUrl: f.pdf_url ?? null,
          }
        : null,
      strutturaId: r.struttura_id ?? null,
      idRichiesta: r.id_richiesta,
      richiestaSpId: r.richiesta_sp_id,
    }
  }))
}

export function totaleDi(costi: CostoPratica[]): { totale: number; incompleto: boolean } {
  return {
    totale: tondo(costi.reduce((s, c) => s + (c.importo ?? 0), 0)),
    incompleto: costi.some((c) => c.importo == null),
  }
}

export async function leggiCosti(spItemId: string): Promise<CostoPratica[]> {
  const { data, error } = await supabase()
    .from('manutenzione_costo')
    .select(CAMPI)
    .eq('richiesta_sp_id', spItemId)
    .order('data')
    .order('creato_il')
  if (error) throw new Error(`Costi: ${error.message}`)
  return (await mapCosti(data ?? [])).map(({ strutturaId, idRichiesta, richiestaSpId, ...c }) => c)
}

/** Quanto di ogni fattura è già stato distribuito sulle manutenzioni. */
async function usatoPerFattura(ids: string[]): Promise<Map<string, number>> {
  const usato = new Map<string, number>()
  if (!ids.length) return usato
  const { data, error } = await supabase()
    .from('manutenzione_costo')
    .select('fattura_passiva_id, importo')
    .in('fattura_passiva_id', ids)
  if (error) throw new Error(`Costi: ${error.message}`)
  for (const r of data ?? []) {
    usato.set(r.fattura_passiva_id, (usato.get(r.fattura_passiva_id) ?? 0) + Number(r.importo ?? 0))
  }
  return usato
}

/**
 * Fatture che si possono collegare: arrivate dagli XML SDI, su cc24 o ancora
 * libere (collegarla la prende su cc24), non note di credito, con imponibile
 * non ancora distribuito del tutto. Le più recenti prima.
 */
export async function fattureCollegabili(cerca: string): Promise<FatturaCollegabile[]> {
  const dal = new Date(Date.now() - 548 * 86_400_000).toISOString().slice(0, 10)
  let q = supabase()
    .from('fattura_passiva')
    .select('id, fornitore, numero_fornitore, data_fornitore, imponibile, totale, descrizione, tipo_documento, cc_codice, pdf_url')
    .not('identificativo_sdi', 'is', null)
    .or(`cc_codice.is.null,cc_codice.eq.${CC_CURA_AMBIENTI}`)
    .gte('data_fornitore', dal)
    .order('data_fornitore', { ascending: false })
    .limit(60)
  const t = cerca.trim().replace(/[%,()*]/g, ' ').trim()
  if (t) q = q.or(`fornitore.ilike.%${t}%,numero_fornitore.ilike.%${t}%,descrizione.ilike.%${t}%`)
  const { data, error } = await q
  if (error) throw new Error(`Fatture: ${error.message}`)

  const righe = (data ?? []).filter((r: any) => !/nota/i.test(String(r.tipo_documento ?? '')))
  const usato = await usatoPerFattura(righe.map((r: any) => r.id))
  return righe
    .map((r: any) => {
      const imponibile = Number(r[IMPORTO_FATTURA] ?? r.totale ?? 0)
      return {
        id: r.id,
        fornitore: r.fornitore,
        numero: r.numero_fornitore ?? null,
        data: r.data_fornitore ?? null,
        imponibile,
        disponibile: tondo(imponibile - (usato.get(r.id) ?? 0)),
        descrizione: r.descrizione ?? null,
        libera: r.cc_codice == null,
        pdfUrl: r.pdf_url ?? null,
      }
    })
    .filter((f) => f.imponibile > 0 && f.disponibile > 0.004)
}

function dataValida(d: unknown): string | null {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d)) ? d : null
}

/**
 * Aggiunge un costo alla richiesta. Lancia un Error con un messaggio da mostrare.
 * Ritorna il mese in cui il costo si addebita (vedi `meseDiAddebito`): chi chiama
 * riscrive l'addebito di quel mese (lib/manutenzioni/ribaltamento.ts).
 */
export async function aggiungiCosto(r: RichiestaManutenzione, d: NuovoCostoPratica, email: string): Promise<string> {
  const struttura = (await getStruttureCc()).find((s) => s.id === r.struttura.id)
  const base = {
    richiesta_sp_id: r.spItemId,
    id_richiesta: r.idRichiesta,
    struttura_id: r.struttura.id || null,
    struttura_codice: struttura?.codice ?? null,
    cc_codice: struttura?.ccCodice ?? null,
    creato_da: email,
  }
  const testo = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)

  let riga: Record<string, unknown>
  if (d.tipo === 'fattura') {
    if (!d.fatturaId) throw new Error('Scegli la fattura')
    const { data: f, error } = await supabase()
      .from('fattura_passiva')
      .select('id, fornitore, data_fornitore, imponibile, totale, cc_codice, identificativo_sdi')
      .eq('id', d.fatturaId)
      .maybeSingle()
    if (error) throw new Error(`Fattura: ${error.message}`)
    if (!f) throw new Error('Fattura non trovata')
    if (f.cc_codice && f.cc_codice !== CC_CURA_AMBIENTI) {
      throw new Error(`La fattura è già sul centro di costo ${f.cc_codice}: per collegarla deve stare su ${CC_CURA_AMBIENTI} (Cura Ambienti)`)
    }
    const imponibile = Number(f[IMPORTO_FATTURA] ?? f.totale ?? 0)
    const usato = (await usatoPerFattura([f.id])).get(f.id) ?? 0
    const disponibile = tondo(imponibile - usato)
    const importo = d.importo == null ? disponibile : tondo(numero(d.importo))
    if (!(importo > 0)) throw new Error('L\'importo deve essere maggiore di zero')
    if (importo > disponibile + 0.005) throw new Error(`Di questa fattura restano da distribuire ${disponibile.toFixed(2)} €`)

    // Libera → si prende su cc24, con la stessa regola di Fatture del servizio (vince il primo).
    if (!f.cc_codice) {
      const esito = await segna([f.id], CC_CURA_AMBIENTI, email, { tutti: true, codici: [] })
      if (!esito.segnate) {
        const { data: ora } = await supabase().from('fattura_passiva').select('cc_codice').eq('id', f.id).maybeSingle()
        if (ora?.cc_codice !== CC_CURA_AMBIENTI) throw new Error('Nel frattempo qualcuno ha preso la fattura su un altro centro di costo')
      }
    }
    riga = {
      ...base,
      tipo: 'fattura',
      data: f.data_fornitore ?? new Date().toISOString().slice(0, 10),
      fattura_passiva_id: f.id,
      importo,
      fornitore: f.fornitore,
      descrizione: testo(d.descrizione, 300) || null,
    }
  } else if (d.tipo === 'ore') {
    const ore = tondo(numero(d.ore))
    if (!(ore > 0 && ore <= 999)) throw new Error('Scrivi le ore (per esempio 1,5)')
    const data = dataValida(d.data)
    if (!data) throw new Error('Scrivi la data del lavoro')
    riga = {
      ...base,
      tipo: 'ore',
      data,
      ore,
      figura: d.figura === 'pulizie' ? 'pulizie' : 'manutenzione',
      descrizione: testo(d.descrizione, 300) || null,
    }
  } else if (d.tipo === 'spesa') {
    const importo = tondo(numero(d.importo))
    if (!(importo > 0)) throw new Error('Scrivi l\'importo della spesa')
    const data = dataValida(d.data)
    if (!data) throw new Error('Scrivi la data della spesa')
    const descrizione = testo(d.descrizione, 300)
    if (!descrizione) throw new Error('Scrivi cosa è stato comprato')
    riga = { ...base, tipo: 'spesa', data, importo, descrizione, fornitore: testo(d.fornitore, 200) || null }
  } else {
    throw new Error('Tipo di costo non valido')
  }

  // Il mese dell'addebito si fissa adesso: il mese del costo se è ancora aperto,
  // altrimenti il primo mese aperto (si rettifica nel mese seguente, 2/11/2026).
  const meseAddebito = meseDiAddebito(String(riga.data))
  riga.mese_addebito = meseAddebito

  const { error } = await supabase().from('manutenzione_costo').insert(riga)
  if (error) {
    // Il tetto lo controlla anche il database: due collegamenti in contemporanea.
    if (/imponibile/.test(error.message)) throw new Error('Questa fattura è già stata distribuita tutta su altre manutenzioni')
    throw new Error(`Costo non salvato: ${error.message}`)
  }
  return meseAddebito
}

/**
 * Toglie un costo. Se il suo mese di addebito è chiuso non si può: quel costo è
 * già stato addebitato alla struttura e il numero non deve cambiare.
 * Ritorna il mese di addebito del costo tolto (null se non trovato).
 */
export async function eliminaCosto(spItemId: string, costoId: string): Promise<string | null | false> {
  const { data: prima, error: e1 } = await supabase()
    .from('manutenzione_costo')
    .select('mese_addebito, data')
    .eq('id', costoId)
    .eq('richiesta_sp_id', spItemId)
    .maybeSingle()
  if (e1) throw new Error(`Costo: ${e1.message}`)
  if (!prima) return false
  const mese = prima.mese_addebito ? String(prima.mese_addebito) : `${String(prima.data).slice(0, 7)}-01`
  if (meseChiuso(mese)) {
    throw new Error(`MESE_CHIUSO: il costo è già stato addebitato alla struttura nel mese chiuso (${mese.slice(5, 7)}/${mese.slice(0, 4)}) e non si toglie più`)
  }
  const { data, error } = await supabase()
    .from('manutenzione_costo')
    .delete()
    .eq('id', costoId)
    .eq('richiesta_sp_id', spItemId)
    .select('id')
  if (error) throw new Error(`Costo non tolto: ${error.message}`)
  return (data?.length ?? 0) > 0 ? mese : false
}

/** Il totale di più richieste insieme, per gli elenchi (Le mie richieste). */
export async function totaliPerRichiesta(spItemIds: string[]): Promise<Record<string, number>> {
  if (!spItemIds.length) return {}
  const { data, error } = await supabase().from('manutenzione_costo').select(CAMPI).in('richiesta_sp_id', spItemIds)
  if (error) throw new Error(`Costi: ${error.message}`)
  const out: Record<string, number> = {}
  for (const c of await mapCosti(data ?? [])) out[c.richiestaSpId] = tondo((out[c.richiestaSpId] ?? 0) + (c.importo ?? 0))
  return out
}

/** Costo di manutenzione nell'anno, per il cruscotto Costi per struttura. */
export interface CostoManutenzioneAnno {
  data: string
  strutturaId: number | null
  idRichiesta: string
  tipo: CostoPratica['tipo']
  importo: number | null
  descrizione: string
  pdfUrl: string | null
}

export async function costiDellAnno(anno: number): Promise<CostoManutenzioneAnno[]> {
  const righe: any[] = []
  for (let da = 0; ; da += 1000) {
    const { data, error } = await supabase()
      .from('manutenzione_costo')
      .select(CAMPI)
      .gte('data', `${anno}-01-01`)
      .lte('data', `${anno}-12-31`)
      .order('id')
      .range(da, da + 999)
    if (error) throw new Error(`Costi manutenzioni: ${error.message}`)
    righe.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return (await mapCosti(righe)).map((c) => ({
    data: c.data,
    strutturaId: c.strutturaId,
    idRichiesta: c.idRichiesta,
    tipo: c.tipo,
    importo: c.importo,
    descrizione: [
      c.idRichiesta,
      c.tipo === 'fattura'
        ? `${c.fornitore ?? 'fattura'}${c.fattura?.numero ? ` n. ${c.fattura.numero}` : ''}`
        : c.tipo === 'ore'
          ? `${c.ore} h ${c.figura === 'pulizie' ? 'pulizie' : 'manutentore'} Cura Ambienti`
          : c.descrizione,
      c.tipo !== 'spesa' ? c.descrizione : c.fornitore,
    ].filter(Boolean).join(' · '),
    pdfUrl: c.fattura?.pdfUrl ?? null,
  }))
}

/** Le richieste che hanno costi in questo sistema (per non contare anche la vecchia riga di Costi Strutture). */
export async function richiesteConCosti(): Promise<Set<string>> {
  const out = new Set<string>()
  for (let da = 0; ; da += 1000) {
    const { data, error } = await supabase()
      .from('manutenzione_costo')
      .select('id_richiesta')
      .order('id')
      .range(da, da + 999)
    if (error) throw new Error(`Costi manutenzioni: ${error.message}`)
    for (const r of data ?? []) out.add(r.id_richiesta)
    if (!data || data.length < 1000) break
  }
  return out
}
