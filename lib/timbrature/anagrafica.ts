/**
 * Anagrafiche della sezione Timbrature: servizi (e centri di costo), dipendenti
 * abilitati, monte ore settimanale.
 *
 * Sono i dati che stanno fermi mentre le righe di ore vanno e vengono. Da qui
 * non si importa nulla degli altri file dell'area: e' il gradino piu' basso
 * sopra `date.ts`.
 */

import { supabase } from '@/lib/core/supabase'
import { weekdayIso } from '@/lib/timbrature/date'
import type {
  Servizio,
  Dipendente,
  ProfiloOrario,
  MonteOreSettimana,
  VariazioneOrarioInput,
} from '@/types/timbrature'

// ------------------------------------------------------------------ servizi

export function mapServizio(r: any): Servizio {
  return {
    id: r.id,
    nome: r.nome,
    macroGruppo: r.centro_costo,
    centroCostoCodice: r.centro_costo_codice ?? null,
    centroCostoNome: r.centro_costo_nome ?? null,
    categoria: r.categoria ?? null,
    tipoVoce: r.tipo_voce,
    attivo: r.attivo,
    ordine: r.ordine,
    adOre: !!r.ad_ore,
  }
}

export async function getServizi(soloAttivi = true): Promise<Servizio[]> {
  let q = supabase().from('servizio').select('*').order('ordine', { ascending: true })
  if (soloAttivi) q = q.eq('attivo', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapServizio)
}

export async function servizioById(id: number): Promise<Servizio> {
  const { data, error } = await supabase().from('servizio').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return mapServizio(data)
}

/** Il servizio con questo nome esatto, se esiste ed e' attivo. */
export async function servizioPerNome(nome: string): Promise<Servizio | null> {
  const { data, error } = await supabase()
    .from('servizio')
    .select('*')
    .eq('nome', nome)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapServizio(data) : null
}

// --------------------------------------------------------------- dipendenti

export function mapDip(r: any): Dipendente {
  return {
    id: r.id,
    email: r.email,
    cognomeNome: r.cognome_nome,
    referenteEmail: r.referente_email ?? null,
    attivo: r.attivo,
  }
}

export async function getDipendenti(soloAttivi = true): Promise<Dipendente[]> {
  let q = supabase().from('dipendente').select('*').order('cognome_nome', { ascending: true })
  if (soloAttivi) q = q.eq('attivo', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapDip)
}

export async function getDipendenteById(id: number): Promise<Dipendente | null> {
  const { data, error } = await supabase().from('dipendente').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapDip(data) : null
}

export async function getDipendenteByEmail(email: string): Promise<Dipendente | null> {
  const { data, error } = await supabase()
    .from('dipendente')
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapDip(data) : null
}

/**
 * Dipendente abilitato alle timbrature, oppure null.
 *
 * Non crea nulla: l'anagrafica timbrature è alimentata SOLO dall'anagrafica
 * Risorse Umane, spuntando "Timbratura attiva" sulla scheda della persona
 * (vedi lib/timbrature/sync.ts). Prima si usava un auto-provisioning al primo
 * accesso, che riempiva il cruscotto HR di persone senza monte ore.
 */
export async function dipendenteAbilitato(email: string): Promise<Dipendente | null> {
  const d = await getDipendenteByEmail(email)
  return d && d.attivo ? d : null
}

/** Dati che l'anagrafica RU detta all'anagrafica timbrature. */
export interface DatiDaRU {
  cognomeNome: string
  /** Mail del referente, finisce nell'intestazione del foglio ore. */
  referenteEmail: string | null
  attivo: boolean
}

export type AzioneSync = 'creato' | 'attivato' | 'disattivato' | 'aggiornato' | 'invariato'

/**
 * Allinea l'anagrafica timbrature a una scheda dell'anagrafica RU.
 * La chiave è l'email (mail aziendale).
 *
 * L'anagrafica RU è la fonte di verità per nominativo, referente e stato attivo:
 * se il referente è vuoto in RU viene svuotato anche qui. Il monte ore
 * settimanale invece resta di competenza delle HR e non viene mai toccato.
 *
 * Se la persona non è abilitata e non esiste ancora non viene creata: il
 * cruscotto contiene esattamente le persone volute.
 */
export async function upsertDipendenteDaRU(email: string, dati: DatiDaRU): Promise<AzioneSync> {
  const em = email.trim().toLowerCase()
  if (!em) throw new Error('Mail aziendale mancante')
  const nome = dati.cognomeNome.trim() || em
  const referente = dati.referenteEmail?.trim().toLowerCase() || null

  const esistente = await getDipendenteByEmail(em)

  if (!esistente) {
    if (!dati.attivo) return 'invariato'
    const { error } = await supabase()
      .from('dipendente')
      .insert({ email: em, cognome_nome: nome, referente_email: referente, attivo: true })
    if (error) throw new Error(error.message)
    return 'creato'
  }

  const cambiaAttivo = esistente.attivo !== dati.attivo
  const cambiaAltro =
    esistente.cognomeNome !== nome || (esistente.referenteEmail ?? null) !== referente
  if (!cambiaAttivo && !cambiaAltro) return 'invariato'

  const { error } = await supabase()
    .from('dipendente')
    .update({ cognome_nome: nome, referente_email: referente, attivo: dati.attivo })
    .eq('id', esistente.id)
  if (error) throw new Error(error.message)

  if (cambiaAttivo) return dati.attivo ? 'attivato' : 'disattivato'
  return 'aggiornato'
}

// ------------------------------------------------------------- responsabili

/** Le persone che rispondono a questo referente (chiave: mail aziendale). */
export async function getSubordinati(email: string): Promise<Dipendente[]> {
  const em = (email || '').trim().toLowerCase()
  if (!em) return []
  const { data, error } = await supabase()
    .from('dipendente')
    .select('*')
    .eq('referente_email', em)
    .order('cognome_nome', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapDip)
}

/** Ha almeno un collaboratore: e' il criterio che apre il cruscotto di validazione. */
export async function eResponsabile(email: string): Promise<boolean> {
  return (await getSubordinati(email)).length > 0
}

// --------------------------------------------------------------- monte ore

function mapProfilo(r: any): ProfiloOrario {
  return {
    id: r.id,
    dipendenteId: r.dipendente_id,
    decorrenza: r.decorrenza,
    oreLun: Number(r.ore_lun),
    oreMar: Number(r.ore_mar),
    oreMer: Number(r.ore_mer),
    oreGio: Number(r.ore_gio),
    oreVen: Number(r.ore_ven),
    oreSab: Number(r.ore_sab),
    oreDom: Number(r.ore_dom),
    aggiornatoDa: r.aggiornato_da ?? null,
    aggiornatoIl: r.aggiornato_il,
    motivo: r.motivo ?? null,
    fileUrl: r.file_url ?? null,
    fileNome: r.file_nome ?? null,
  }
}

/** Profilo orario vigente a una certa data (max decorrenza <= data). */
export async function profiloVigente(
  dipendenteId: number,
  dataYmd: string,
): Promise<ProfiloOrario | null> {
  const { data, error } = await supabase()
    .from('profilo_orario')
    .select('*')
    .eq('dipendente_id', dipendenteId)
    .lte('decorrenza', dataYmd)
    .order('decorrenza', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapProfilo(data) : null
}

/**
 * Tutte le variazioni di orario del dipendente, dalla più recente.
 *
 * E' lo storico, non "l'ultimo valore": il monte ore determina le ore attese di
 * ogni giornata, quindi la completezza, i solleciti, lo scostamento e la
 * flessibilità. Una variazione registrata con la decorrenza sbagliata riscrive
 * in silenzio le ore attese dei mesi passati, e senza lo storico non c'è modo
 * di accorgersene.
 */
export async function getProfili(dipendenteId: number): Promise<ProfiloOrario[]> {
  const { data, error } = await supabase()
    .from('profilo_orario')
    .select('*')
    .eq('dipendente_id', dipendenteId)
    .order('decorrenza', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapProfilo)
}

export async function getProfiloById(id: number): Promise<ProfiloOrario | null> {
  const { data, error } = await supabase()
    .from('profilo_orario')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapProfilo(data) : null
}

/**
 * Registra una variazione di orario (solo HR). Idempotente sulla decorrenza:
 * risalvare la stessa data corregge la variazione invece di crearne una seconda.
 *
 * La decorrenza è libera — un passaggio a part-time può partire il 16 — e il
 * motivo va scritto: fra un anno "chi ha cambiato le ore e perché" non si
 * ricava dai numeri.
 */
export async function salvaProfilo(input: {
  dipendenteId: number
  decorrenza: string
  ore: MonteOreSettimana
  aggiornatoDa: string
  motivo?: string | null
  file?: { url: string; nome: string } | null
}): Promise<ProfiloOrario> {
  const row: Record<string, unknown> = {
    dipendente_id: input.dipendenteId,
    decorrenza: input.decorrenza,
    ore_lun: input.ore[1],
    ore_mar: input.ore[2],
    ore_mer: input.ore[3],
    ore_gio: input.ore[4],
    ore_ven: input.ore[5],
    ore_sab: input.ore[6],
    ore_dom: input.ore[7],
    aggiornato_da: input.aggiornatoDa,
    aggiornato_il: new Date().toISOString(),
    motivo: input.motivo?.trim() || null,
  }
  // Il documento si tocca solo se ne arriva uno nuovo: risalvare le ore non
  // deve far sparire la lettera già allegata.
  if (input.file) {
    row.file_url = input.file.url
    row.file_nome = input.file.nome
  }
  const { data, error } = await supabase()
    .from('profilo_orario')
    .upsert(row, { onConflict: 'dipendente_id,decorrenza' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapProfilo(data)
}

/**
 * Cancella una variazione di orario.
 *
 * Serve perché una decorrenza sbagliata non è correggibile: `salvaProfilo` è
 * idempotente sulla data, quindi salvare quella giusta lascia in piedi anche
 * quella sbagliata, che continua a valere per il periodo in cui è la più
 * recente. Senza cancellazione l'errore resta per sempre.
 */
export async function eliminaProfilo(dipendenteId: number, id: number): Promise<void> {
  const { error } = await supabase()
    .from('profilo_orario')
    .delete()
    .eq('id', id)
    .eq('dipendente_id', dipendenteId)
  if (error) throw new Error(error.message)
}

export function monteToSettimana(p: ProfiloOrario | null): MonteOreSettimana {
  return {
    1: p?.oreLun ?? 0,
    2: p?.oreMar ?? 0,
    3: p?.oreMer ?? 0,
    4: p?.oreGio ?? 0,
    5: p?.oreVen ?? 0,
    6: p?.oreSab ?? 0,
    7: p?.oreDom ?? 0,
  }
}

/** Ore attese in una singola giornata secondo il profilo vigente in quella data. */
export async function oreAtteseDelGiorno(dipendenteId: number, dataYmd: string): Promise<number> {
  const prof = await profiloVigente(dipendenteId, dataYmd)
  return monteToSettimana(prof)[weekdayIso(dataYmd)]
}

/** Normalizza l'input di una variazione arrivato da una route. */
export function leggiVariazione(body: any): VariazioneOrarioInput {
  const o = body?.ore ?? {}
  const num = (v: unknown) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 24) return 0
    return Math.round(n * 100) / 100
  }
  return {
    dipendenteId: Number(body?.dipendenteId),
    decorrenza: String(body?.decorrenza ?? '').slice(0, 10),
    ore: { 1: num(o[1]), 2: num(o[2]), 3: num(o[3]), 4: num(o[4]), 5: num(o[5]), 6: num(o[6]), 7: num(o[7]) },
    motivo: body?.motivo ? String(body.motivo).slice(0, 500) : null,
    file:
      body?.file?.url && body?.file?.nome
        ? { url: String(body.file.url), nome: String(body.file.nome) }
        : null,
  }
}
