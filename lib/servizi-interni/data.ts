/**
 * Addebiti interni e ripartizione dei costi generali — letture e scritture
 * su Supabase (supabase/servizi_interni.sql). Piano: docs/servizi-interni-piano.md.
 */

import { supabase } from '@/lib/core/supabase'
import { getCentriDiCostoRegistro } from '@/lib/gestione/registro'
import { bloccato, forfaitDelMese, totaleAddebito } from './flusso'
import type { AccessoServiziInterni } from './accesso'
import type {
  AddebitoInterno,
  CentroScelta,
  DatiAddebito,
  RipartizioneGenerali,
} from '@/types/servizi-interni'

export async function getForfait(): Promise<Array<{ dal: string; euroOra: number }>> {
  const { data, error } = await supabase().from('forfait_orario').select('dal, euro_ora').order('dal')
  if (error) throw new Error(`Forfait orario: ${error.message}`)
  return (data ?? []).map((r: any) => ({ dal: String(r.dal), euroOra: Number(r.euro_ora) }))
}

/** Centri di costo attivi, per le tendine (il segnaposto escluso). */
export async function getCentriScelta(): Promise<CentroScelta[]> {
  return (await getCentriDiCostoRegistro(true))
    .filter((c) => c.codice !== 'DA_ATTRIBUIRE')
    .map((c) => ({ codice: c.codice.toLowerCase(), nome: c.nome, area: c.area ?? null }))
}

const CAMPI = 'id, numero, cc_da, cc_a, mese, descrizione, ore, visto, visto_nota, visto_da, visto_il, creato_da, creato_il, origine_tipo, origine_id, struttura_codice, struttura_nome, addebito_interno_costo ( descrizione, importo, ordine )'

function mapAddebito(r: any, forfait: Array<{ dal: string; euroOra: number }>): AddebitoInterno {
  const mese = String(r.mese)
  const euroOra = forfaitDelMese(forfait, mese)
  const altriCosti = [...(r.addebito_interno_costo ?? [])]
    .sort((a: any, b: any) => a.ordine - b.ordine)
    .map((c: any) => ({ descrizione: c.descrizione, importo: Number(c.importo) }))
  const ore = Number(r.ore)
  return {
    id: r.id,
    numero: r.numero,
    ccDa: r.cc_da,
    ccA: r.cc_a,
    mese,
    descrizione: r.descrizione,
    ore,
    euroOra,
    altriCosti,
    totale: totaleAddebito(ore, euroOra, altriCosti),
    visto: r.visto ?? null,
    vistoNota: r.visto_nota ?? null,
    vistoDa: r.visto_da ?? null,
    vistoIl: r.visto_il ?? null,
    creatoDa: r.creato_da,
    creatoIl: r.creato_il,
    bloccato: bloccato(mese),
    origine: r.origine_tipo ?? 'manuale',
    origineId: r.origine_id ?? null,
    strutturaCodice: r.struttura_codice ?? null,
    strutturaNome: r.struttura_nome ?? null,
  }
}

/** Addebiti di un anno visibili a chi guarda: fatti dai suoi servizi o ricevuti. */
export async function getAddebiti(anno: number, a: AccessoServiziInterni): Promise<AddebitoInterno[]> {
  if (!a.tutti && a.codici.length === 0) return []
  let q = supabase()
    .from('addebito_interno')
    .select(CAMPI)
    .gte('mese', `${anno}-01-01`)
    .lte('mese', `${anno}-12-01`)
    .order('mese', { ascending: false })
    .order('numero', { ascending: false })
  if (!a.tutti) {
    const lista = a.codici.join(',')
    q = q.or(`cc_da.in.(${lista}),cc_a.in.(${lista})`)
  }
  const [{ data, error }, forfait] = await Promise.all([q, getForfait()])
  if (error) throw new Error(`Addebiti interni: ${error.message}`)
  return (data ?? []).map((r) => mapAddebito(r, forfait))
}

export async function getAddebito(id: string): Promise<AddebitoInterno | null> {
  const [{ data, error }, forfait] = await Promise.all([
    supabase().from('addebito_interno').select(CAMPI).eq('id', id).maybeSingle(),
    getForfait(),
  ])
  if (error) throw new Error(`Addebito interno: ${error.message}`)
  return data ? mapAddebito(data, forfait) : null
}

async function scriviAltriCosti(id: string, d: DatiAddebito) {
  const db = supabase()
  const del = await db.from('addebito_interno_costo').delete().eq('addebito_id', id)
  if (del.error) throw new Error(`Altri costi: ${del.error.message}`)
  if (!d.altriCosti.length) return
  const ins = await db.from('addebito_interno_costo').insert(
    d.altriCosti.map((c, i) => ({ addebito_id: id, descrizione: c.descrizione, importo: c.importo, ordine: i })),
  )
  if (ins.error) throw new Error(`Altri costi: ${ins.error.message}`)
}

export async function creaAddebito(d: DatiAddebito, email: string): Promise<AddebitoInterno> {
  const { data, error } = await supabase()
    .from('addebito_interno')
    .insert({ cc_da: d.ccDa, cc_a: d.ccA, mese: d.mese, descrizione: d.descrizione, ore: d.ore, creato_da: email })
    .select('id')
    .single()
  if (error) throw new Error(`Addebito non salvato: ${error.message}`)
  try {
    await scriviAltriCosti(data.id, d)
  } catch (e) {
    // Senza i suoi altri costi l'addebito direbbe un numero sbagliato: meglio toglierlo.
    await supabase().from('addebito_interno').delete().eq('id', data.id)
    throw e
  }
  return (await getAddebito(data.id))!
}

/**
 * Modificare un addebito toglie il visto: chi riceve aveva visto un altro numero.
 */
export async function aggiornaAddebito(id: string, d: DatiAddebito, email: string): Promise<AddebitoInterno> {
  const { error } = await supabase()
    .from('addebito_interno')
    .update({
      cc_da: d.ccDa, cc_a: d.ccA, mese: d.mese, descrizione: d.descrizione, ore: d.ore,
      visto: null, visto_nota: null, visto_da: null, visto_il: null,
      aggiornato_da: email, aggiornato_il: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(`Addebito non salvato: ${error.message}`)
  await scriviAltriCosti(id, d)
  return (await getAddebito(id))!
}

export async function eliminaAddebito(id: string): Promise<void> {
  const { error } = await supabase().from('addebito_interno').delete().eq('id', id)
  if (error) throw new Error(`Addebito non tolto: ${error.message}`)
}

export async function vistaAddebito(
  id: string,
  visto: 'visto' | 'non_torna' | null,
  nota: string | null,
  email: string,
): Promise<AddebitoInterno> {
  const { error } = await supabase()
    .from('addebito_interno')
    .update(visto
      ? { visto, visto_nota: nota, visto_da: email, visto_il: new Date().toISOString() }
      : { visto: null, visto_nota: null, visto_da: null, visto_il: null })
    .eq('id', id)
  if (error) throw new Error(`Visto non salvato: ${error.message}`)
  return (await getAddebito(id))!
}

// ------------------------------------------------------------
// Ripartizione dei costi generali
// ------------------------------------------------------------

/** Tutte le versioni delle percentuali di un centro d'origine, la più recente prima. */
export async function getRipartizioni(ccOrigine: string): Promise<RipartizioneGenerali[]> {
  const { data, error } = await supabase()
    .from('ripartizione_generali')
    .select('id, cc_origine, dal, note, creato_da, creato_il, ripartizione_generali_quota ( cc_codice, percentuale )')
    .eq('cc_origine', ccOrigine)
    .order('dal', { ascending: false })
  if (error) throw new Error(`Ripartizione: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    ccOrigine: r.cc_origine,
    dal: String(r.dal),
    note: r.note ?? null,
    creatoDa: r.creato_da,
    creatoIl: r.creato_il,
    quote: (r.ripartizione_generali_quota ?? [])
      .map((q: any) => ({ ccCodice: q.cc_codice, percentuale: Number(q.percentuale) }))
      .sort((a: any, b: any) => b.percentuale - a.percentuale),
  }))
}

/**
 * Salva una versione delle percentuali, valida da `dal`. Le versioni precedenti
 * restano: valgono per i mesi prima. Una versione con la stessa data si sostituisce.
 */
export async function salvaRipartizione(
  ccOrigine: string,
  dal: string,
  quote: Array<{ ccCodice: string; percentuale: number }>,
  note: string | null,
  email: string,
): Promise<void> {
  const { error } = await supabase().rpc('ripartizione_generali_salva', {
    p_cc_origine: ccOrigine,
    p_dal: dal,
    p_note: note,
    p_creato_da: email,
    p_quote: quote.map((q) => ({ cc_codice: q.ccCodice, percentuale: q.percentuale })),
  })
  if (error) throw new Error(`Percentuali non salvate: ${error.message}`)
}
