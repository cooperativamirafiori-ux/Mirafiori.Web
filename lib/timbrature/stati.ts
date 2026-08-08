/**
 * Stato del mese: dove sta il foglio ore di una persona nel suo percorso.
 *
 *   aperto -> da_validare -> validato -> confermato
 *                        \-> contestato -> (torna al responsabile)
 *
 * Qui c'e' solo la scrittura dello stato. Chi decide *quando* passare da uno
 * stato all'altro e cosa fare nel passaggio (documenti, mail) sta in
 * `lib/timbrature/flusso.ts`.
 */

import { randomBytes } from 'crypto'
import { supabase } from '@/lib/core/supabase'
import { getDipendenteById, mapDip } from '@/lib/timbrature/anagrafica'
import { meseScaduto, oggiRoma, primaDataUtile, ultimoGiornoUtile } from '@/lib/timbrature/date'
import type { ChiusuraMese, Dipendente, FinestraMese, StatoMese } from '@/types/timbrature'

/** Perche' il mese non e' piu' scrivibile: da mostrare, non da nascondere. */
export const MOTIVO_STATO: Record<Exclude<StatoMese, 'aperto'>, string> = {
  da_validare: 'Il mese e\' chiuso e attende la validazione del responsabile',
  validato: 'Il foglio ore e\' stato validato e attende la tua conferma',
  confermato: 'Il foglio ore del mese e\' definitivo',
  contestato: 'Il foglio ore e\' tornato al responsabile per una correzione',
}

function mapChiusura(r: any): ChiusuraMese {
  return {
    id: r.id,
    dipendenteId: r.dipendente_id,
    anno: r.anno,
    mese: r.mese,
    stato: r.stato,
    chiusoDa: r.chiuso_da ?? null,
    chiusoIl: r.chiuso_il ?? null,
    fileUrl: r.file_url ?? null,
    filePdfUrl: r.file_pdf_url ?? null,
    fileHrUrl: r.file_hr_url ?? null,
    validatoDa: r.validato_da ?? null,
    validatoIl: r.validato_il ?? null,
    confermatoDa: r.confermato_da ?? null,
    confermatoIl: r.confermato_il ?? null,
    confermatoForzato: !!r.confermato_forzato,
    contestatoIl: r.contestato_il ?? null,
    noteContestazione: r.note_contestazione ?? null,
    token: r.token ?? null,
    ultimoSollecito: r.ultimo_sollecito ?? null,
  }
}

export async function getChiusura(
  dipendenteId: number,
  anno: number,
  mese: number,
): Promise<ChiusuraMese | null> {
  const { data, error } = await supabase()
    .from('chiusura_mese')
    .select('*')
    .eq('dipendente_id', dipendenteId)
    .eq('anno', anno)
    .eq('mese', mese)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapChiusura(data) : null
}

/**
 * Stato effettivo del mese. Se la riga di chiusura non esiste ancora lo si
 * deduce dal calendario: il dipendente non deve poter scrivere solo perche' il
 * lavoro notturno non e' ancora passato.
 */
export async function statoMese(
  dipendenteId: number,
  anno: number,
  mese: number,
): Promise<StatoMese> {
  const ch = await getChiusura(dipendenteId, anno, mese)
  if (ch) return ch.stato
  return meseScaduto(anno, mese) ? 'da_validare' : 'aperto'
}

/** Cosa puo' fare il dipendente su questo mese, e da quando. */
export async function finestraMese(
  dipendenteId: number,
  anno: number,
  mese: number,
): Promise<FinestraMese> {
  const stato = await statoMese(dipendenteId, anno, mese)
  return {
    stato,
    aperta: stato === 'aperto',
    motivo: stato === 'aperto' ? undefined : MOTIVO_STATO[stato],
    daGiorno: primaDataUtile(),
    ultimoGiorno: ultimoGiornoUtile(anno, mese),
  }
}

/** Segreto del link "conferma il tuo foglio ore" recapitato via mail. */
function nuovoToken(): string {
  return randomBytes(24).toString('base64url')
}

async function upsertChiusura(
  dipendenteId: number,
  anno: number,
  mese: number,
  patch: Record<string, unknown>,
): Promise<ChiusuraMese> {
  const { data, error } = await supabase()
    .from('chiusura_mese')
    .upsert({ dipendente_id: dipendenteId, anno, mese, ...patch }, { onConflict: 'dipendente_id,anno,mese' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapChiusura(data)
}

/**
 * La finestra e' scaduta: il mese passa al responsabile. Idempotente, cosi' il
 * cron puo' girare piu' volte senza fare danni.
 */
export async function marcaDaValidare(dipendenteId: number, anno: number, mese: number): Promise<ChiusuraMese> {
  return upsertChiusura(dipendenteId, anno, mese, { stato: 'da_validare' })
}

/**
 * Il responsabile approva il foglio. Da qui nasce il token del link di
 * conferma: viene generato una volta sola e riutilizzato anche dopo una
 * contestazione, cosi' i solleciti gia' partiti restano validi.
 */
export async function marcaValidato(
  dipendenteId: number,
  anno: number,
  mese: number,
  validatoDa: string,
  file: { xlsx?: string | null; pdf?: string | null } = {},
): Promise<ChiusuraMese> {
  const prima = await getChiusura(dipendenteId, anno, mese)
  return upsertChiusura(dipendenteId, anno, mese, {
    stato: 'validato',
    validato_da: validatoDa,
    validato_il: new Date().toISOString(),
    token: prima?.token || nuovoToken(),
    file_url: file.xlsx ?? prima?.fileUrl ?? null,
    file_pdf_url: file.pdf ?? prima?.filePdfUrl ?? null,
    // una nuova validazione supera la contestazione precedente
    contestato_il: null,
    note_contestazione: null,
    ultimo_sollecito: null,
  })
}

/**
 * Il dipendente conferma (o il responsabile forza, quando la risposta non
 * arriva mai). `forzato` resta scritto: nei controlli la differenza fra un ok
 * dato e un ok presunto conta.
 *
 * `hrUrl` e' la copia nella cartella HR del mese: si scrive solo qui, perche'
 * in quella cartella ci vanno soltanto i fogli definitivi.
 */
export async function marcaConfermato(
  dipendenteId: number,
  anno: number,
  mese: number,
  confermatoDa: string,
  opts: { forzato?: boolean; pdfUrl?: string | null; hrUrl?: string | null } = {},
): Promise<ChiusuraMese> {
  const prima = await getChiusura(dipendenteId, anno, mese)
  return upsertChiusura(dipendenteId, anno, mese, {
    stato: 'confermato',
    confermato_da: confermatoDa,
    confermato_il: new Date().toISOString(),
    confermato_forzato: !!opts.forzato,
    file_pdf_url: opts.pdfUrl ?? prima?.filePdfUrl ?? null,
    file_hr_url: opts.hrUrl ?? prima?.fileHrUrl ?? null,
    chiuso_da: confermatoDa,
    chiuso_il: new Date().toISOString(),
    // il token ha esaurito il suo compito: non deve restare riutilizzabile
    token: null,
  })
}

/** Il dipendente segnala un errore: il foglio torna al responsabile. */
export async function marcaContestato(
  dipendenteId: number,
  anno: number,
  mese: number,
  note: string,
): Promise<ChiusuraMese> {
  return upsertChiusura(dipendenteId, anno, mese, {
    stato: 'contestato',
    contestato_il: new Date().toISOString(),
    note_contestazione: note.slice(0, 2000),
  })
}

/** Riapre il mese al dipendente (solo HR): annulla validazione e conferma. */
export async function riapriMese(
  dipendenteId: number,
  anno: number,
  mese: number,
): Promise<ChiusuraMese> {
  return upsertChiusura(dipendenteId, anno, mese, {
    stato: 'aperto',
    chiuso_da: null,
    chiuso_il: null,
    validato_da: null,
    validato_il: null,
    confermato_da: null,
    confermato_il: null,
    confermato_forzato: false,
    contestato_il: null,
    note_contestazione: null,
    token: null,
    ultimo_sollecito: null,
  })
}

/** Segna la data dell'ultimo sollecito, per non mandarne due nello stesso giorno. */
export async function segnaSollecito(dipendenteId: number, anno: number, mese: number): Promise<void> {
  await upsertChiusura(dipendenteId, anno, mese, { ultimo_sollecito: oggiRoma() })
}

/** Chiusura raggiunta dal link nella mail, con il dipendente gia' risolto. */
export async function getChiusuraByToken(
  token: string,
): Promise<{ chiusura: ChiusuraMese; dipendente: Dipendente } | null> {
  if (!token) return null
  const { data, error } = await supabase()
    .from('chiusura_mese')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const dip = await getDipendenteById(data.dipendente_id)
  if (!dip) return null
  return { chiusura: mapChiusura(data), dipendente: dip }
}

/** Chiusure ferme in uno degli stati indicati, con il dipendente collegato. */
export async function chiusureInStato(
  stati: StatoMese[],
): Promise<{ chiusura: ChiusuraMese; dipendente: Dipendente }[]> {
  const { data, error } = await supabase()
    .from('chiusura_mese')
    .select('*')
    .in('stato', stati)
    .order('anno', { ascending: true })
    .order('mese', { ascending: true })
  if (error) throw new Error(error.message)
  const righe = data ?? []
  if (!righe.length) return []
  const ids = [...new Set(righe.map((r: any) => Number(r.dipendente_id)))]
  const { data: dips, error: e2 } = await supabase().from('dipendente').select('*').in('id', ids)
  if (e2) throw new Error(e2.message)
  const byId = new Map<number, Dipendente>((dips ?? []).map((d: any) => [Number(d.id), mapDip(d)]))
  return righe
    .map((r: any) => ({ chiusura: mapChiusura(r), dipendente: byId.get(Number(r.dipendente_id))! }))
    .filter((x) => !!x.dipendente)
}
