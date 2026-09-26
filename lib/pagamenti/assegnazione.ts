/**
 * Il coordinatore segna "mie" le fatture del suo servizio.
 *
 * Regole decise con Dennis il 26/09/2026:
 *  - si vedono **solo le fatture libere** (nessun centro di costo), e solo
 *    quelle arrivate dagli XML dello SDI: lo storico dell'Excel resta fuori;
 *  - **vince il primo**: la scrittura è `update … where cc_codice is null`,
 *    quindi due coordinatori che premono insieme non si sovrascrivono;
 *  - chi ha segnato per sbaglio **libera da solo**, finché la fattura non è
 *    stata pagata dopo la sua scelta. Dopo, solo il Controllo di Gestione.
 *
 * Chi può cosa (`accessoAssegnazione`):
 *  - coordinatore di un centro di costo → segna solo sui suoi centri;
 *  - permesso "Controllo di Gestione" o "Pagamenti" → vede tutto, segna,
 *    libera e sposta su qualunque centro. Chi paga deve poterlo fare: è il
 *    servizio a dire da quale sottoconto Qonto parte il bonifico.
 */

import { supabase } from '@/lib/core/supabase'
import { getCentriCoordinati } from '@/lib/centri-costo/data'
import { AREA_CONTROLLO_GESTIONE, AREA_PAGAMENTI } from '@/types/pagamenti'
import type { AccessoQonto } from '@/lib/qonto/accesso'

export async function accessoAssegnazione(
  user: { email?: string | null; permessi?: string[] } | undefined | null,
): Promise<AccessoQonto> {
  if (!user?.email) return { tutti: false, codici: [] }
  const p = user.permessi ?? []
  if (p.includes(AREA_CONTROLLO_GESTIONE) || p.includes(AREA_PAGAMENTI)) return { tutti: true, codici: [] }
  return { tutti: false, codici: await getCentriCoordinati(user.email) }
}

export const puoAssegnare = (a: AccessoQonto) => a.tutti || a.codici.length > 0

export interface FatturaDaSegnare {
  id: string
  fornitore: string
  piva: string | null
  numero: string | null
  data: string | null
  totale: number | null
  descrizione: string | null
  notaCredito: boolean
  pdfUrl: string | null
  fileSdiUrl: string | null
  /** Centro di costo: null se libera. */
  cc: string | null
  segnataDa: string | null
  segnataIl: string | null
  /** Centri di costo a cui lo stesso fornitore è già stato attribuito. */
  suggeriti: string[]
  /** Pagata (anche solo in parte) dopo che è stata segnata: non si libera più da soli. */
  bloccata: boolean
}

const CAMPI = 'id, fornitore, piva, numero_fornitore, data_fornitore, totale, descrizione, tipo_documento, pdf_url, file_sdi_url, cc_codice, cc_rivendicata_da, cc_rivendicata_il'

interface Row {
  id: string
  fornitore: string
  piva: string | null
  numero_fornitore: string | null
  data_fornitore: string | null
  totale: number | string | null
  descrizione: string | null
  tipo_documento: string
  pdf_url: string | null
  file_sdi_url: string | null
  cc_codice: string | null
  cc_rivendicata_da: string | null
  cc_rivendicata_il: string | null
}

const aFattura = (r: Row, suggeriti: string[] = [], bloccata = false): FatturaDaSegnare => ({
  id: r.id,
  fornitore: r.fornitore,
  piva: r.piva,
  numero: r.numero_fornitore,
  data: r.data_fornitore,
  totale: r.totale === null ? null : Number(r.totale),
  descrizione: r.descrizione,
  notaCredito: r.tipo_documento === 'nota_credito',
  pdfUrl: r.pdf_url,
  fileSdiUrl: r.file_sdi_url,
  cc: r.cc_codice,
  segnataDa: r.cc_rivendicata_da,
  segnataIl: r.cc_rivendicata_il,
  suggeriti,
  bloccata,
})

/** Le fatture libere, con i centri di costo già usati per lo stesso fornitore. */
export async function fattureLibere(): Promise<FatturaDaSegnare[]> {
  const db = supabase()
  const { data, error } = await db
    .from('fattura_passiva')
    .select(CAMPI)
    .not('identificativo_sdi', 'is', null)
    .is('cc_codice', null)
    .order('data_fornitore', { ascending: false })
    .limit(1000)
  if (error) throw new Error(`Lettura fatture libere: ${error.message}`)
  const righe = (data ?? []) as Row[]

  // Suggerimento: dove sono andate le altre fatture dello stesso fornitore.
  const pive = [...new Set(righe.map((r) => r.piva).filter((p): p is string => !!p))]
  const perPiva = new Map<string, Set<string>>()
  if (pive.length) {
    const { data: prese } = await db
      .from('fattura_passiva')
      .select('piva, cc_codice')
      .in('piva', pive)
      .not('cc_codice', 'is', null)
      .limit(5000)
    for (const p of (prese ?? []) as Array<{ piva: string; cc_codice: string }>) {
      if (!perPiva.has(p.piva)) perPiva.set(p.piva, new Set())
      perPiva.get(p.piva)!.add(p.cc_codice)
    }
  }
  return righe.map((r) => aFattura(r, r.piva ? [...(perPiva.get(r.piva) ?? [])] : []))
}

/** Le fatture già attribuite ai centri di costo che l'utente vede. */
export async function fattureSegnate(a: AccessoQonto): Promise<FatturaDaSegnare[]> {
  if (!a.tutti && a.codici.length === 0) return []
  let q = supabase()
    .from('fattura_passiva')
    .select(`${CAMPI}, scadenza ( stato, pagata_il )`)
    .not('identificativo_sdi', 'is', null)
    .not('cc_codice', 'is', null)
  if (!a.tutti) q = q.in('cc_codice', a.codici)
  const { data, error } = await q.order('cc_rivendicata_il', { ascending: false }).limit(1000)
  if (error) throw new Error(`Lettura fatture segnate: ${error.message}`)
  return ((data ?? []) as unknown as Array<Row & { scadenza: Array<{ stato: string; pagata_il: string | null }> }>).map((r) =>
    aFattura(r, [], bloccataDa(r.cc_rivendicata_il, r.scadenza ?? [])),
  )
}

function bloccataDa(segnataIl: string | null, scadenze: Array<{ stato: string; pagata_il: string | null }>): boolean {
  if (!segnataIl) return false
  return scadenze.some((s) => s.stato === 'pagata' && s.pagata_il !== null && s.pagata_il > segnataIl)
}

export interface EsitoSegna {
  segnate: number
  /** Fatture che qualcun altro ha preso prima, o non più libere. */
  giaPrese: number
}

/** Segna le fatture sul centro di costo. Vince il primo. */
export async function segna(ids: string[], cc: string, email: string, a: AccessoQonto): Promise<EsitoSegna> {
  const codice = cc.trim().toLowerCase()
  if (!codice) throw new Error('Scegli il centro di costo')
  if (!a.tutti && !a.codici.includes(codice)) throw new Error('Non coordini questo centro di costo')
  if (ids.length === 0) return { segnate: 0, giaPrese: 0 }
  const { data, error } = await supabase()
    .from('fattura_passiva')
    .update({ cc_codice: codice, cc_rivendicata_da: email, cc_rivendicata_il: new Date().toISOString() })
    .in('id', ids)
    .is('cc_codice', null)
    .not('identificativo_sdi', 'is', null)
    .select('id')
  if (error) throw new Error(`Segnatura: ${error.message}`)
  const segnate = data?.length ?? 0
  return { segnate, giaPrese: ids.length - segnate }
}

export interface EsitoLibera {
  liberate: number
  ignorate: Array<{ id: string; motivo: string }>
}

/** Rimette libere delle fatture segnate per sbaglio. */
export async function libera(ids: string[], a: AccessoQonto): Promise<EsitoLibera> {
  if (ids.length === 0) return { liberate: 0, ignorate: [] }
  const { data, error } = await supabase()
    .from('fattura_passiva')
    .select('id, cc_codice, cc_rivendicata_il, scadenza ( stato, pagata_il )')
    .in('id', ids)
  if (error) throw new Error(`Lettura fatture: ${error.message}`)

  const ignorate: EsitoLibera['ignorate'] = []
  let liberate = 0
  for (const r of (data ?? []) as unknown as Array<{
    id: string
    cc_codice: string | null
    cc_rivendicata_il: string | null
    scadenza: Array<{ stato: string; pagata_il: string | null }>
  }>) {
    if (!r.cc_codice) {
      ignorate.push({ id: r.id, motivo: 'è già libera' })
      continue
    }
    if (!a.tutti && !a.codici.includes(r.cc_codice)) {
      ignorate.push({ id: r.id, motivo: 'è di un centro di costo che non coordini' })
      continue
    }
    if (!a.tutti && bloccataDa(r.cc_rivendicata_il, r.scadenza ?? [])) {
      ignorate.push({ id: r.id, motivo: 'è già stata pagata: per spostarla chiedi al Controllo di Gestione' })
      continue
    }
    const { error: eU } = await supabase()
      .from('fattura_passiva')
      .update({ cc_codice: null, cc_rivendicata_da: null, cc_rivendicata_il: null })
      .eq('id', r.id)
      .eq('cc_codice', r.cc_codice)
    if (eU) throw new Error(`Liberazione: ${eU.message}`)
    liberate++
  }
  return { liberate, ignorate }
}

/**
 * Mette una fattura su un centro di costo, o la toglie (cc = null), qualunque
 * sia lo stato. Solo per chi vede tutto (CdG, Pagamenti): è la correzione, non
 * la scelta del coordinatore. Vale anche per le fatture arrivate dall'Excel.
 */
export async function sposta(id: string, cc: string | null, email: string, a: AccessoQonto): Promise<void> {
  if (!a.tutti) throw new Error('Serve il permesso Controllo di Gestione o Pagamenti')
  const codice = cc?.trim().toLowerCase() || null
  const { error } = await supabase()
    .from('fattura_passiva')
    .update(
      codice
        ? { cc_codice: codice, cc_rivendicata_da: email, cc_rivendicata_il: new Date().toISOString() }
        : { cc_codice: null, cc_rivendicata_da: null, cc_rivendicata_il: null },
    )
    .eq('id', id)
  if (error) throw new Error(`Assegnazione: ${error.message}`)
}
