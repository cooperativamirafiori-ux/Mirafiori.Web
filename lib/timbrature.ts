/**
 * Accesso dati e logica della sezione Timbrature (Supabase/Postgres).
 * Solo server-side (usa la service role key via lib/supabase).
 *
 * Regole chiave:
 *   - ore SENZA arrotondamento (valore esatto)
 *   - il servizio determina il centro di costo
 *   - finestra correzioni operatore: fino al 5 del mese successivo, e finché
 *     il mese non è stato chiuso dalle HR
 */

import { supabase } from '@/lib/supabase'
import { festivitaAnno } from '@/lib/festivita'
import type {
  Servizio,
  Dipendente,
  ProfiloOrario,
  MonteOreSettimana,
  Timbratura,
  TimbraturaInput,
  ChiusuraMese,
  RiepilogoGiorno,
  RiepilogoPeriodo,
  RiepilogoSettimana,
  StatoDipendenteMese,
} from '@/types/timbrature'

// ------------------------------------------------------------------ utilità

/** Data odierna (YYYY-MM-DD) nel fuso Europe/Rome. */
export function oggiRoma(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Scadenza correzioni: 5 del mese successivo a (anno, mese). */
export function scadenzaCorrezioni(anno: number, mese: number): string {
  const annoS = mese === 12 ? anno + 1 : anno
  const meseS = mese === 12 ? 1 : mese + 1
  return `${annoS}-${String(meseS).padStart(2, '0')}-05`
}

/** Weekday ISO 1..7 (lun..dom) per una data YYYY-MM-DD. */
function weekdayIso(dataYmd: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const [y, m, d] = dataYmd.split('-').map(Number)
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=dom..6=sab
  return (js === 0 ? 7 : js) as 1 | 2 | 3 | 4 | 5 | 6 | 7
}

/** Ore esatte tra due orari HH:mm; se fine <= inizio si assume oltre mezzanotte. */
export function calcolaOre(oraInizio: string, oraFine: string): { ore: number; notte: boolean } {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  let diff = toMin(oraFine) - toMin(oraInizio)
  let notte = false
  if (diff <= 0) {
    diff += 24 * 60
    notte = true
  }
  return { ore: Math.round((diff / 60) * 10000) / 10000, notte } // esatto (no arrotondamento a intervalli)
}

function primoUltimoGiorno(anno: number, mese: number): { from: string; to: string } {
  const mm = String(mese).padStart(2, '0')
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate()
  return { from: `${anno}-${mm}-01`, to: `${anno}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

// ------------------------------------------------------------------ servizi

function mapServizio(r: any): Servizio {
  return {
    id: r.id,
    nome: r.nome,
    centroCosto: r.centro_costo,
    categoria: r.categoria ?? null,
    tipoVoce: r.tipo_voce,
    attivo: r.attivo,
    ordine: r.ordine,
  }
}

export async function getServizi(soloAttivi = true): Promise<Servizio[]> {
  let q = supabase().from('servizio').select('*').order('ordine', { ascending: true })
  if (soloAttivi) q = q.eq('attivo', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapServizio)
}

// --------------------------------------------------------------- dipendenti

function mapDip(r: any): Dipendente {
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
 * Ritorna il dipendente per email; se non esiste lo crea (auto-provisioning al
 * primo accesso dell'operatore). Il monte ore e il referente li imposta poi HR.
 */
export async function ensureDipendente(email: string, cognomeNome: string): Promise<Dipendente> {
  const em = email.toLowerCase()
  const esistente = await getDipendenteByEmail(em)
  if (esistente) return esistente
  const { data, error } = await supabase()
    .from('dipendente')
    .insert({ email: em, cognome_nome: cognomeNome || em })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapDip(data)
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

export async function getProfili(dipendenteId: number): Promise<ProfiloOrario[]> {
  const { data, error } = await supabase()
    .from('profilo_orario')
    .select('*')
    .eq('dipendente_id', dipendenteId)
    .order('decorrenza', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapProfilo)
}

/** Imposta un profilo orario (solo HR). Idempotente sulla decorrenza. */
export async function salvaProfilo(input: {
  dipendenteId: number
  decorrenza: string
  ore: MonteOreSettimana
  aggiornatoDa: string
}): Promise<ProfiloOrario> {
  const row = {
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
  }
  const { data, error } = await supabase()
    .from('profilo_orario')
    .upsert(row, { onConflict: 'dipendente_id,decorrenza' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapProfilo(data)
}

function monteToSettimana(p: ProfiloOrario | null): MonteOreSettimana {
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

// --------------------------------------------------------------- timbrature

function mapTimbratura(r: any): Timbratura {
  const s = r.servizio
  return {
    id: r.id,
    dipendenteId: r.dipendente_id,
    data: r.data,
    servizioId: r.servizio_id,
    tipoVoce: r.tipo_voce,
    oraInizio: r.ora_inizio ? String(r.ora_inizio).slice(0, 5) : null,
    oraFine: r.ora_fine ? String(r.ora_fine).slice(0, 5) : null,
    ore: Number(r.ore),
    notte: r.notte,
    mutua: r.mutua,
    note: r.note ?? null,
    creataDa: r.creata_da ?? null,
    servizioNome: s?.nome,
    centroCosto: s?.centro_costo,
  }
}

const SELECT_TIMB = '*, servizio:servizio_id ( nome, centro_costo, tipo_voce )'

export async function listTimbrature(
  dipendenteId: number,
  from: string,
  to: string,
): Promise<Timbratura[]> {
  const { data, error } = await supabase()
    .from('timbratura')
    .select(SELECT_TIMB)
    .eq('dipendente_id', dipendenteId)
    .gte('data', from)
    .lte('data', to)
    .order('data', { ascending: true })
    .order('ora_inizio', { ascending: true, nullsFirst: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapTimbratura)
}

/** Verifica se l'operatore può ancora modificare il mese (anno,mese). */
export async function finestraAperta(
  dipendenteId: number,
  anno: number,
  mese: number,
): Promise<{ aperta: boolean; motivo?: string }> {
  const ch = await getChiusura(dipendenteId, anno, mese)
  if (ch?.stato === 'chiuso') return { aperta: false, motivo: 'Mese chiuso dalle Risorse Umane' }
  if (oggiRoma() > scadenzaCorrezioni(anno, mese)) {
    return { aperta: false, motivo: `Termine correzioni superato (${scadenzaCorrezioni(anno, mese)})` }
  }
  return { aperta: true }
}

async function assertModificabile(dipendenteId: number, dataYmd: string) {
  const anno = Number(dataYmd.slice(0, 4))
  const mese = Number(dataYmd.slice(5, 7))
  const f = await finestraAperta(dipendenteId, anno, mese)
  if (!f.aperta) throw new Error(f.motivo || 'Periodo non modificabile')
}

async function servizioById(id: number): Promise<Servizio> {
  const { data, error } = await supabase().from('servizio').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return mapServizio(data)
}

export async function creaTimbratura(
  dipendenteId: number,
  input: TimbraturaInput,
  creataDa: string,
): Promise<Timbratura> {
  await assertModificabile(dipendenteId, input.data)
  const serv = await servizioById(input.servizioId)

  let ore = 0
  let notte = !!input.notte
  let oraInizio: string | null = input.oraInizio ?? null
  let oraFine: string | null = input.oraFine ?? null

  if (serv.tipoVoce === 'giustificativo') {
    // occupa il monte ore atteso del giorno
    const prof = await profiloVigente(dipendenteId, input.data)
    const monte = monteToSettimana(prof)
    ore = monte[weekdayIso(input.data)]
    oraInizio = null
    oraFine = null
  } else {
    if (!oraInizio || !oraFine) throw new Error('Orario di inizio e fine obbligatori')
    const calc = calcolaOre(oraInizio, oraFine)
    ore = calc.ore
    notte = input.notte ?? calc.notte
  }

  const { data, error } = await supabase()
    .from('timbratura')
    .insert({
      dipendente_id: dipendenteId,
      data: input.data,
      servizio_id: input.servizioId,
      tipo_voce: serv.tipoVoce,
      ora_inizio: oraInizio,
      ora_fine: oraFine,
      ore,
      notte,
      mutua: !!input.mutua,
      note: input.note ?? null,
      creata_da: creataDa,
    })
    .select(SELECT_TIMB)
    .single()
  if (error) throw new Error(error.message)
  return mapTimbratura(data)
}

export async function aggiornaTimbratura(
  dipendenteId: number,
  id: string,
  input: TimbraturaInput,
  modificataDa: string,
): Promise<Timbratura> {
  await assertModificabile(dipendenteId, input.data)
  const serv = await servizioById(input.servizioId)

  let ore = 0
  let notte = !!input.notte
  let oraInizio: string | null = input.oraInizio ?? null
  let oraFine: string | null = input.oraFine ?? null

  if (serv.tipoVoce === 'giustificativo') {
    const prof = await profiloVigente(dipendenteId, input.data)
    ore = monteToSettimana(prof)[weekdayIso(input.data)]
    oraInizio = null
    oraFine = null
  } else {
    if (!oraInizio || !oraFine) throw new Error('Orario di inizio e fine obbligatori')
    const calc = calcolaOre(oraInizio, oraFine)
    ore = calc.ore
    notte = input.notte ?? calc.notte
  }

  const { data, error } = await supabase()
    .from('timbratura')
    .update({
      data: input.data,
      servizio_id: input.servizioId,
      tipo_voce: serv.tipoVoce,
      ora_inizio: oraInizio,
      ora_fine: oraFine,
      ore,
      notte,
      mutua: !!input.mutua,
      note: input.note ?? null,
      creata_da: modificataDa,
    })
    .eq('id', id)
    .eq('dipendente_id', dipendenteId)
    .select(SELECT_TIMB)
    .single()
  if (error) throw new Error(error.message)
  return mapTimbratura(data)
}

export async function eliminaTimbratura(dipendenteId: number, id: string): Promise<void> {
  // recupera la data per il controllo finestra
  const { data: row, error: e1 } = await supabase()
    .from('timbratura')
    .select('data')
    .eq('id', id)
    .eq('dipendente_id', dipendenteId)
    .maybeSingle()
  if (e1) throw new Error(e1.message)
  if (!row) return
  await assertModificabile(dipendenteId, row.data)
  const { error } = await supabase().from('timbratura').delete().eq('id', id).eq('dipendente_id', dipendenteId)
  if (error) throw new Error(error.message)
}

// --------------------------------------------------------------- riepiloghi

/** Costruisce il riepilogo giorno per giorno tra from e to (inclusi). */
export async function riepilogoPeriodo(
  dipendenteId: number,
  from: string,
  to: string,
): Promise<RiepilogoPeriodo> {
  const timb = await listTimbrature(dipendenteId, from, to)
  const annoFest = Number(from.slice(0, 4))
  const festivita = {
    ...festivitaAnno(annoFest),
    ...festivitaAnno(Number(to.slice(0, 4))),
  }

  // profili: prendi il vigente all'inizio periodo (assunzione: cambio raro)
  const profStart = await profiloVigente(dipendenteId, from)
  const monte = monteToSettimana(profStart)

  const perGiorno = new Map<string, RiepilogoGiorno>()
  const d0 = new Date(from + 'T00:00:00Z')
  const d1 = new Date(to + 'T00:00:00Z')
  for (let d = new Date(d0); d <= d1; d.setUTCDate(d.getUTCDate() + 1)) {
    const ymd = d.toISOString().slice(0, 10)
    const nome = festivita[ymd]
    const festivo = !!nome
    const attese = festivo ? 0 : monte[weekdayIso(ymd)]
    perGiorno.set(ymd, {
      data: ymd,
      oreLavorate: 0,
      oreGiustificativo: 0,
      oreAttese: attese,
      festivo,
      festivitaNome: nome,
      completo: attese === 0,
    })
  }

  for (const t of timb) {
    const g = perGiorno.get(t.data)
    if (!g) continue
    if (t.tipoVoce === 'giustificativo') g.oreGiustificativo += t.ore
    else g.oreLavorate += t.ore
  }

  let oreLavorate = 0
  let oreGiustificativo = 0
  let oreAttese = 0
  for (const g of perGiorno.values()) {
    g.completo = g.oreLavorate + g.oreGiustificativo >= g.oreAttese
    oreLavorate += g.oreLavorate
    oreGiustificativo += g.oreGiustificativo
    oreAttese += g.oreAttese
  }

  const giorni = [...perGiorno.values()]
  return {
    oreLavorate: round4(oreLavorate),
    oreGiustificativo: round4(oreGiustificativo),
    oreAttese: round4(oreAttese),
    scostamento: round4(oreLavorate + oreGiustificativo - oreAttese),
    giorni,
    settimane: raggruppaSettimane(giorni),
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Data YYYY-MM-DD + n giorni (in UTC). */
function addGiorni(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Lunedì (ISO) della settimana che contiene la data. */
function lunediIso(ymd: string): string {
  return addGiorni(ymd, -(weekdayIso(ymd) - 1))
}

/**
 * Raggruppa i giorni del periodo in settimane ISO (lun→dom) e calcola lo
 * scostamento di ciascuna. `inizio`/`fine` sono i giorni effettivi coperti nel
 * periodo (le settimane a cavallo dei bordi mese risultano parziali).
 * `conclusa`=true quando la settimana è già terminata (fine < oggi): solo allora
 * lo scostamento è definitivo (le settimane in corso non vanno segnalate).
 */
export function raggruppaSettimane(giorni: RiepilogoGiorno[]): RiepilogoSettimana[] {
  const oggi = oggiRoma()
  const acc = new Map<string, {
    inizio: string; fine: string
    oreLavorate: number; oreGiustificativo: number; oreAttese: number
  }>()
  for (const g of giorni) {
    const chiave = lunediIso(g.data)
    const cur = acc.get(chiave)
    if (!cur) {
      acc.set(chiave, {
        inizio: g.data,
        fine: g.data,
        oreLavorate: g.oreLavorate,
        oreGiustificativo: g.oreGiustificativo,
        oreAttese: g.oreAttese,
      })
    } else {
      if (g.data < cur.inizio) cur.inizio = g.data
      if (g.data > cur.fine) cur.fine = g.data
      cur.oreLavorate += g.oreLavorate
      cur.oreGiustificativo += g.oreGiustificativo
      cur.oreAttese += g.oreAttese
    }
  }
  return [...acc.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, s]) => ({
      inizio: s.inizio,
      fine: s.fine,
      oreLavorate: round4(s.oreLavorate),
      oreGiustificativo: round4(s.oreGiustificativo),
      oreAttese: round4(s.oreAttese),
      scostamento: round4(s.oreLavorate + s.oreGiustificativo - s.oreAttese),
      conclusa: s.fine < oggi,
    }))
}

// --------------------------------------------------------------- chiusura mese

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

/** Segna il mese come chiuso (HR). Registra chi/quando e l'eventuale file. */
export async function chiudiMese(
  dipendenteId: number,
  anno: number,
  mese: number,
  chiusoDa: string,
  fileUrl?: string,
): Promise<ChiusuraMese> {
  const { data, error } = await supabase()
    .from('chiusura_mese')
    .upsert(
      {
        dipendente_id: dipendenteId,
        anno,
        mese,
        stato: 'chiuso',
        chiuso_da: chiusoDa,
        chiuso_il: new Date().toISOString(),
        file_url: fileUrl ?? null,
      },
      { onConflict: 'dipendente_id,anno,mese' },
    )
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapChiusura(data)
}

export async function riapriMese(
  dipendenteId: number,
  anno: number,
  mese: number,
): Promise<ChiusuraMese> {
  const { data, error } = await supabase()
    .from('chiusura_mese')
    .upsert(
      { dipendente_id: dipendenteId, anno, mese, stato: 'aperto', chiuso_da: null, chiuso_il: null },
      { onConflict: 'dipendente_id,anno,mese' },
    )
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapChiusura(data)
}

/** Cruscotto HR: stato del mese per tutti i dipendenti attivi. */
export async function statoMeseTutti(anno: number, mese: number): Promise<StatoDipendenteMese[]> {
  const { from, to } = primoUltimoGiorno(anno, mese)
  const dips = await getDipendenti(true)
  const out: StatoDipendenteMese[] = []
  for (const d of dips) {
    const [rp, ch] = await Promise.all([
      riepilogoPeriodo(d.id, from, to),
      getChiusura(d.id, anno, mese),
    ])
    out.push({
      dipendenteId: d.id,
      cognomeNome: d.cognomeNome,
      email: d.email,
      oreLavorate: rp.oreLavorate,
      oreAttese: rp.oreAttese,
      scostamento: rp.scostamento,
      giorniIncompleti: rp.giorni.filter((g) => !g.completo && !g.festivo).length,
      stato: ch?.stato ?? 'aperto',
      fileUrl: ch?.fileUrl ?? null,
      settimane: rp.settimane,
    })
  }
  return out
}

export { primoUltimoGiorno, monteToSettimana, weekdayIso }
