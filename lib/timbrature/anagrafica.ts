/**
 * Anagrafiche della sezione Timbrature: servizi (e centri di costo), dipendenti
 * abilitati, monte ore settimanale.
 *
 * Sono i dati che stanno fermi mentre le righe di ore vanno e vengono. Da qui
 * non si importa nulla degli altri file dell'area: e' il gradino piu' basso
 * sopra `date.ts`.
 */

import { supabase } from '@/lib/core/supabase'
import { calcolaOre, normalizzaOrario, orarioInMinuti, round4, weekdayIso } from '@/lib/timbrature/date'
import type {
  Servizio,
  Progetto,
  Dipendente,
  FasciaProfilo,
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
    chiedeProgetto: !!r.chiede_progetto,
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

// ----------------------------------------------------------------- progetti

export function mapProgetto(r: any): Progetto {
  return { id: r.id, nome: r.nome, attivo: !!r.attivo, ordine: r.ordine }
}

/**
 * I progetti su cui si possono imputare le ore.
 *
 * Di default solo gli attivi: un progetto chiuso non deve piu' comparire nella
 * tendina, ma le righe che lo citano restano — per questo non si cancella mai,
 * si disattiva (`scripts/progetti-timbrature.mjs`).
 */
export async function getProgetti(soloAttivi = true): Promise<Progetto[]> {
  let q = supabase().from('progetto').select('*').order('ordine', { ascending: true })
  if (soloAttivi) q = q.eq('attivo', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapProgetto)
}

// --------------------------------------------------------------- dipendenti

export function mapDip(r: any): Dipendente {
  return {
    id: r.id,
    email: r.email,
    cognomeNome: r.cognome_nome,
    referenteEmail: r.referente_email ?? null,
    attivo: r.attivo,
    nonTimbra: !!r.non_timbra,
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
  /** Spunta "Non timbra": il foglio ore si genera dall'orario teorico. */
  nonTimbra: boolean
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
      .insert({
        email: em,
        cognome_nome: nome,
        referente_email: referente,
        attivo: true,
        non_timbra: dati.nonTimbra,
      })
    if (error) throw new Error(error.message)
    return 'creato'
  }

  const cambiaAttivo = esistente.attivo !== dati.attivo
  const cambiaAltro =
    esistente.cognomeNome !== nome ||
    (esistente.referenteEmail ?? null) !== referente ||
    esistente.nonTimbra !== dati.nonTimbra
  if (!cambiaAttivo && !cambiaAltro) return 'invariato'

  const { error } = await supabase()
    .from('dipendente')
    .update({
      cognome_nome: nome,
      referente_email: referente,
      attivo: dati.attivo,
      non_timbra: dati.nonTimbra,
    })
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
    fasce: (r.fasce ?? []).map(mapFascia).sort(ordinaFasce),
  }
}

function mapFascia(r: any): FasciaProfilo {
  return {
    id: r.id,
    giorno: Number(r.giorno) as FasciaProfilo['giorno'],
    oraInizio: String(r.ora_inizio).slice(0, 5),
    oraFine: String(r.ora_fine).slice(0, 5),
    servizioId: r.servizio_id,
    servizioNome: r.servizio?.nome,
  }
}

/** Per giorno, poi per ora di ingresso: e' l'ordine in cui si legge un orario. */
function ordinaFasce(a: FasciaProfilo, b: FasciaProfilo): number {
  return a.giorno - b.giorno || a.oraInizio.localeCompare(b.oraInizio)
}

const SELECT_PROFILO =
  '*, fasce:profilo_fascia ( id, giorno, ora_inizio, ora_fine, servizio_id, servizio:servizio_id ( nome ) )'

/** Le ore di una giornata secondo le fasce dell'orario teorico. */
export function oreDaFasce(fasce: FasciaProfilo[], giorno: number): number {
  return round4(
    fasce
      .filter((f) => f.giorno === giorno)
      .reduce((tot, f) => tot + calcolaOre(f.oraInizio, f.oraFine).ore, 0),
  )
}

/**
 * Normalizza e valida un orario teorico in arrivo da una route.
 *
 * Le fasce dello stesso giorno non si possono sovrapporre: due righe che si
 * accavallano genererebbero ore contate due volte in un foglio ore che nessuno
 * ha guardato riga per riga, ed e' esattamente il tipo di errore che questo
 * meccanismo deve non poter fare.
 */
export function normalizzaFasce(input: unknown): FasciaProfilo[] {
  if (!Array.isArray(input)) return []
  const out: FasciaProfilo[] = []
  for (const f of input) {
    const giorno = Number((f as any)?.giorno)
    if (!Number.isInteger(giorno) || giorno < 1 || giorno > 7) continue
    const servizioId = Number((f as any)?.servizioId)
    if (!Number.isFinite(servizioId) || servizioId <= 0) {
      throw new Error(`Manca il servizio su una fascia di ${NOME_GIORNO[giorno]}`)
    }
    const oraInizio = normalizzaOrario((f as any)?.oraInizio, `Ingresso di ${NOME_GIORNO[giorno]}`)
    const oraFine = normalizzaOrario((f as any)?.oraFine, `Uscita di ${NOME_GIORNO[giorno]}`)
    if (!oraInizio || !oraFine) {
      throw new Error(`Servono ingresso e uscita sulla fascia di ${NOME_GIORNO[giorno]}`)
    }
    if (orarioInMinuti(oraFine) <= orarioInMinuti(oraInizio)) {
      throw new Error(
        `${NOME_GIORNO[giorno]}: l'uscita (${oraFine}) deve essere dopo l'ingresso (${oraInizio}). ` +
          'Un orario teorico che scavalca la mezzanotte va scritto come due fasce, una per giornata.',
      )
    }
    out.push({ giorno: giorno as FasciaProfilo['giorno'], oraInizio, oraFine, servizioId })
  }

  out.sort(ordinaFasce)
  for (let i = 1; i < out.length; i++) {
    const prec = out[i - 1]
    const cur = out[i]
    if (cur.giorno === prec.giorno && orarioInMinuti(cur.oraInizio) < orarioInMinuti(prec.oraFine)) {
      throw new Error(
        `${NOME_GIORNO[cur.giorno]}: le fasce ${prec.oraInizio}-${prec.oraFine} e ` +
          `${cur.oraInizio}-${cur.oraFine} si sovrappongono.`,
      )
    }
  }
  return out
}

export const NOME_GIORNO: Record<number, string> = {
  1: 'lunedi', 2: 'martedi', 3: 'mercoledi', 4: 'giovedi',
  5: 'venerdi', 6: 'sabato', 7: 'domenica',
}

/** Profilo orario vigente a una certa data (max decorrenza <= data). */
export async function profiloVigente(
  dipendenteId: number,
  dataYmd: string,
): Promise<ProfiloOrario | null> {
  const { data, error } = await supabase()
    .from('profilo_orario')
    .select(SELECT_PROFILO)
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
    .select(SELECT_PROFILO)
    .eq('dipendente_id', dipendenteId)
    .order('decorrenza', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapProfilo)
}

export async function getProfiloById(id: number): Promise<ProfiloOrario | null> {
  const { data, error } = await supabase()
    .from('profilo_orario')
    .select(SELECT_PROFILO)
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
 *
 * Se arriva anche l'orario teorico (`fasce`), le ore dei giorni che hanno una
 * fascia vengono RICALCOLATE dalle fasce e il valore digitato viene ignorato.
 * Non è una gentilezza: sono lo stesso dato scritto due volte, e due copie che
 * possono divergere sono una copia sbagliata che aspetta. Le ore restano
 * digitabili sui giorni senza fasce, che è il caso di chi timbra.
 */
export async function salvaProfilo(input: {
  dipendenteId: number
  decorrenza: string
  ore: MonteOreSettimana
  aggiornatoDa: string
  motivo?: string | null
  file?: { url: string; nome: string } | null
  /** `undefined`/`null` = non toccare l'orario teorico; un array lo sostituisce. */
  fasce?: FasciaProfilo[] | null
}): Promise<ProfiloOrario> {
  const ore = { ...input.ore }
  if (input.fasce) {
    for (let g = 1 as 1 | 2 | 3 | 4 | 5 | 6 | 7; g <= 7; g++) {
      if (input.fasce.some((f) => f.giorno === g)) ore[g] = oreDaFasce(input.fasce, g)
    }
  }

  const row: Record<string, unknown> = {
    dipendente_id: input.dipendenteId,
    decorrenza: input.decorrenza,
    ore_lun: ore[1],
    ore_mar: ore[2],
    ore_mer: ore[3],
    ore_gio: ore[4],
    ore_ven: ore[5],
    ore_sab: ore[6],
    ore_dom: ore[7],
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
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  if (input.fasce) await sostituisciFasce(data.id, input.fasce)

  const salvato = await getProfiloById(data.id)
  if (!salvato) throw new Error('Variazione salvata ma non rileggibile')
  return salvato
}

/**
 * Riscrive in blocco l'orario teorico di una variazione.
 *
 * Cancella e reinserisce invece di fare il diff riga per riga: le fasce sono
 * poche (una decina), non hanno identità propria — nessuno "modifica la fascia
 * numero 4", si ridisegna la settimana — e nulla le referenzia. Il diff sarebbe
 * codice in più per lo stesso risultato.
 */
async function sostituisciFasce(profiloId: number, fasce: FasciaProfilo[]): Promise<void> {
  const { error: e1 } = await supabase().from('profilo_fascia').delete().eq('profilo_id', profiloId)
  if (e1) throw new Error(e1.message)
  if (!fasce.length) return

  const { error: e2 } = await supabase().from('profilo_fascia').insert(
    fasce.map((f) => ({
      profilo_id: profiloId,
      giorno: f.giorno,
      ora_inizio: f.oraInizio,
      ora_fine: f.oraFine,
      servizio_id: f.servizioId,
    })),
  )
  if (e2) throw new Error(e2.message)
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
    // Distinzione voluta fra "campo assente" e "array vuoto": il primo vuol dire
    // che si stanno salvando solo le ore (la UI di chi timbra non manda le
    // fasce, e non deve cancellarle); il secondo vuol dire "togli l'orario
    // teorico", ed e' un'azione deliberata.
    fasce: body?.fasce === undefined || body?.fasce === null ? null : normalizzaFasce(body.fasce),
  }
}
