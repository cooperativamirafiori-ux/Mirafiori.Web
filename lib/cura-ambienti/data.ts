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
  type Lavoro,
  type LavoroConImporti,
  type RiepilogoMese,
  type StatoLavoro,
  type StrutturaScelta,
  type Tariffe,
} from '@/types/cura-ambienti'
import {
  consuntivoCompleto,
  importiLavoro,
  mesePrecedente,
  modificabile,
  oreConsuntivo,
  orePreventivo,
  puoPassare,
} from './flusso'

const TABELLA = 'lavoro_cura_ambienti'

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
    ricorrente: !!r.ricorrente,
    copiatoDa: r.copiato_da ?? null,
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
    .select('*')
    .eq('mese', mese)
    .order('numero', { ascending: false })
  if (error) throw new Error(`Lavori: ${error.message}`)
  return (data ?? []).map(daRiga)
}

export async function getLavoro(id: string): Promise<Lavoro | null> {
  const { data, error } = await supabase().from(TABELLA).select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Lavoro: ${error.message}`)
  return data ? daRiga(data) : null
}

/** Lavori del mese con importi, più il riepilogo che mette a confronto ore timbrate e consuntivi. */
export async function getMese(mese: string): Promise<{ lavori: LavoroConImporti[]; riepilogo: RiepilogoMese }> {
  const [lavori, tariffe, oreTimbrate] = await Promise.all([getLavori(mese), getTariffe(mese), getOreTimbrate(mese)])
  const conImporti = lavori.map((l) => ({ ...l, importi: importiLavoro(l, tariffe) }))
  const vivi = conImporti.filter((l) => l.stato !== 'annullato')
  const chiusi = vivi.filter((l) => l.stato === 'consuntivato' || l.stato === 'addebitato')
  const riepilogo: RiepilogoMese = {
    mese,
    tariffe,
    oreTimbrate,
    orePreventivate: Math.round(vivi.reduce((s, l) => s + orePreventivo(l), 0) * 100) / 100,
    oreConsuntivate: Math.round(chiusi.reduce((s, l) => s + oreConsuntivo(l), 0) * 100) / 100,
    importoConsuntivato: Math.round(chiusi.reduce((s, l) => s + (l.importi.consuntivo ?? 0), 0) * 100) / 100,
    lavoriAperti: vivi.length - chiusi.length,
  }
  return { lavori: conImporti, riepilogo }
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

const colonneOre = (d: DatiLavoro) => ({
  prev_ore_pulizie: d.prevOrePulizie,
  prev_ore_manutenzione: d.prevOreManutenzione,
  prev_materiali: d.prevMateriali,
  cons_ore_pulizie: d.consOrePulizie,
  cons_ore_manutenzione: d.consOreManutenzione,
  cons_materiali: d.consMateriali,
  note_consuntivo: d.noteConsuntivo,
})

export async function creaLavoro(d: DatiLavoro, email: string): Promise<Lavoro> {
  const { data, error } = await supabase()
    .from(TABELLA)
    .insert({
      mese: d.mese,
      destinatario: d.destinatario,
      ...(await colonneDestinatario(d)),
      titolo: d.titolo,
      descrizione: d.descrizione,
      ricorrente: d.ricorrente,
      ...colonneOre(d),
      stato: 'bozza',
      creato_da: email,
      aggiornato_da: email,
    })
    .select('*')
    .single()
  if (error) throw new Error(`Salvataggio non riuscito: ${error.message}`)
  return daRiga(data)
}

export async function aggiornaLavoro(id: string, d: DatiLavoro, email: string): Promise<Lavoro> {
  const prima = await getLavoro(id)
  if (!prima) throw new Error('Lavoro non trovato')
  if (!modificabile(prima.stato)) throw new Error('Un lavoro addebitato o annullato non si modifica')
  if ((prima.stato === 'consuntivato') && !consuntivoCompleto(d)) {
    throw new Error('Il lavoro è consuntivato: ore e materiali del consuntivo vanno scritti (anche zero)')
  }
  const { data, error } = await supabase()
    .from(TABELLA)
    .update({
      mese: d.mese,
      destinatario: d.destinatario,
      ...(await colonneDestinatario(d)),
      titolo: d.titolo,
      descrizione: d.descrizione,
      ricorrente: d.ricorrente,
      ...colonneOre(d),
      aggiornato_da: email,
      aggiornato_il: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
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
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Cambio di stato non riuscito: ${error.message}`)
  if (!data) throw new Error('Qualcuno ha appena cambiato questo lavoro: ricarica la pagina')
  return daRiga(data)
}

/**
 * Prepara il mese: copia i lavori ricorrenti del mese prima, con il loro
 * consuntivo (se c'è) come nuovo preventivo. Rilanciarlo non crea doppioni:
 * lo impedisce `unique (copiato_da, mese)`.
 */
export async function preparaMese(mese: string, email: string): Promise<{ creati: number; giaPresenti: number }> {
  const prima = (await getLavori(mesePrecedente(mese))).filter((l) => l.ricorrente && l.stato !== 'annullato')
  if (!prima.length) return { creati: 0, giaPresenti: 0 }
  const righe = prima.map((l) => ({
    mese,
    destinatario: l.destinatario,
    struttura_codice: l.strutturaCodice,
    struttura_nome: l.strutturaNome,
    cc_codice: l.ccCodice,
    cliente: l.cliente,
    titolo: l.titolo,
    descrizione: l.descrizione,
    ricorrente: true,
    copiato_da: l.id,
    stato: 'preventivato',
    prev_ore_pulizie: l.consOrePulizie ?? l.prevOrePulizie,
    prev_ore_manutenzione: l.consOreManutenzione ?? l.prevOreManutenzione,
    prev_materiali: l.consMateriali ?? l.prevMateriali,
    creato_da: email,
    aggiornato_da: email,
  }))
  const { data, error } = await supabase()
    .from(TABELLA)
    .upsert(righe, { onConflict: 'copiato_da,mese', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error(`Preparazione del mese non riuscita: ${error.message}`)
  const creati = data?.length ?? 0
  return { creati, giaPresenti: righe.length - creati }
}
