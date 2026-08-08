/**
 * Le righe di ore: lettura, scrittura, cancellazione.
 *
 * Una riga sta sempre dentro una giornata. I turni che scavallano la mezzanotte
 * vengono spezzati in ingresso (vedi `spezzaAMezzanotte`), quindi da qui in giu'
 * nessuna riga attraversa la data e ogni conteggio per giorno e' una somma
 * semplice.
 */

import { supabase } from '@/lib/core/supabase'
import { monteToSettimana, profiloVigente, servizioById } from '@/lib/timbrature/anagrafica'
import {
  calcolaOre,
  dataIt,
  GIORNI_INDIETRO,
  normalizzaOrario,
  oggiRoma,
  primaDataUtile,
  spezzaAMezzanotte,
  weekdayIso,
} from '@/lib/timbrature/date'
import { MOTIVO_STATO, statoMese } from '@/lib/timbrature/stati'
import type {
  EsitoScrittura,
  Servizio,
  Timbratura,
  TimbraturaInput,
  TipoVoce,
} from '@/types/timbrature'

// ------------------------------------------------------------------ lettura

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
    notte: !!r.notte,
    reperibilita: !!r.reperibilita,
    mutua: !!r.mutua,
    note: r.note ?? null,
    creataDa: r.creata_da ?? null,
    modificataDa: r.modificata_da ?? null,
    modificataIl: r.modificata_il ?? null,
    perConto: !!r.per_conto,
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

// ----------------------------------------------------------- chi puo' scrivere

/**
 * Il dipendente puo' scrivere questa riga?
 *
 * Due regole diverse di proposito:
 *   - ore di LAVORO: solo oggi e i due giorni precedenti, e mai in anticipo.
 *     E' il vincolo che fa compilare il foglio giorno per giorno.
 *   - GIUSTIFICATIVI: nessun limite oltre lo stato del mese. Le ferie si
 *     programmano prima di partire (ed e' cosi' che si evitano i solleciti
 *     mentre si e' in vacanza) e la malattia si registra quando il certificato
 *     arriva, non entro tre giorni.
 */
async function assertModificabile(dipendenteId: number, dataYmd: string, tipoVoce: TipoVoce) {
  const anno = Number(dataYmd.slice(0, 4))
  const mese = Number(dataYmd.slice(5, 7))
  const stato = await statoMese(dipendenteId, anno, mese)
  if (stato !== 'aperto') {
    throw new Error(`${MOTIVO_STATO[stato]}. Per una correzione rivolgiti al tuo responsabile.`)
  }
  if (tipoVoce !== 'lavoro') return

  const oggi = oggiRoma()
  if (dataYmd > oggi) {
    throw new Error('Le ore di lavoro si registrano a giornata conclusa: non si inseriscono in anticipo.')
  }
  const limite = primaDataUtile(oggi)
  if (dataYmd < limite) {
    throw new Error(
      `Puoi inserire o correggere le ore solo di oggi e dei ${GIORNI_INDIETRO} giorni precedenti ` +
        `(dal ${dataIt(limite)}). Per una correzione piu' vecchia scrivi al tuo responsabile.`,
    )
  }
}

/**
 * Controllo per chi scrive PER CONTO del dipendente (responsabile o HR).
 * Nessuna finestra mobile: e' esattamente la valvola di sfogo che impedisce
 * alle giornate dimenticate di diventare ore perse. Si ferma pero' davanti a un
 * foglio gia' validato: quello si riapre prima, non si corregge di nascosto.
 */
async function assertModificabilePerConto(dipendenteId: number, dataYmd: string) {
  const anno = Number(dataYmd.slice(0, 4))
  const mese = Number(dataYmd.slice(5, 7))
  const stato = await statoMese(dipendenteId, anno, mese)
  if (stato === 'validato' || stato === 'confermato') {
    throw new Error(
      'Il foglio ore di questo mese e\' gia\' stato validato: va riaperto prima di poterlo correggere.',
    )
  }
}

/** Il controllo giusto in base a chi sta scrivendo. */
export async function assertScrivibile(
  dipendenteId: number,
  dataYmd: string,
  tipoVoce: TipoVoce,
  perConto: boolean,
) {
  if (perConto) await assertModificabilePerConto(dipendenteId, dataYmd)
  else await assertModificabile(dipendenteId, dataYmd, tipoVoce)
}

/**
 * Come sopra, ma per il giorno su cui e' finita la coda di un turno notturno.
 * Il messaggio secco di `assertModificabile` sarebbe fuorviante: la persona ha
 * inserito il giorno di ieri, non un giorno futuro, e va detto perche' il
 * sistema si sta lamentando di una data che lei non ha digitato.
 */
async function assertScrivibileCoda(
  dipendenteId: number,
  dataYmd: string,
  tipoVoce: TipoVoce,
  perConto: boolean,
) {
  try {
    await assertScrivibile(dipendenteId, dataYmd, tipoVoce, perConto)
  } catch (e) {
    const dettaglio = e instanceof Error ? e.message : 'non e\' scrivibile'
    throw new Error(
      `Il turno scavalca la mezzanotte, quindi una parte delle ore va sul ${dataIt(dataYmd)}, ` +
        `e quel giorno non e' scrivibile: ${dettaglio}`,
    )
  }
}

// ------------------------------------------------------------- scrittura

/**
 * Orari e ore di una voce, prima dello spezzamento a mezzanotte.
 *
 * - giustificativo "ad ore" (Ferie, Flessibilità, Congedo parentale, Legge 104,
 *   Permessi retribuiti) CON ingresso e uscita: si comporta come il lavoro,
 *   le ore sono calcolate dagli orari al minuto esatto.
 * - giustificativo (anche ad ore, se lasciato senza orario): nessun orario,
 *   ore = monte ore atteso di quel giorno (giornata intera).
 * - lavoro: ingresso e uscita OBBLIGATORI, ore calcolate dagli orari al minuto
 *   esatto. Il campo `ore` eventualmente ricevuto in input viene ignorato:
 *   le ore non sono un dato inserito ma un dato derivato.
 */
async function risolviVoce(
  dipendenteId: number,
  input: TimbraturaInput,
  serv: Servizio,
): Promise<{ oraInizio: string | null; oraFine: string | null; ore: number }> {
  if (serv.tipoVoce === 'giustificativo' && !(serv.adOre && (input.oraInizio || input.oraFine))) {
    const prof = await profiloVigente(dipendenteId, input.data)
    const monte = monteToSettimana(prof)
    return { oraInizio: null, oraFine: null, ore: monte[weekdayIso(input.data)] }
  }

  const lavoro = serv.tipoVoce === 'lavoro'
  const oraInizio = normalizzaOrario(input.oraInizio, lavoro ? 'Orario di ingresso' : 'Orario di inizio')
  const oraFine = normalizzaOrario(input.oraFine, lavoro ? 'Orario di uscita' : 'Orario di fine')
  if (!oraInizio || !oraFine) {
    throw new Error(lavoro ? 'Inserisci orario di ingresso e di uscita' : 'Inserisci l\'orario di inizio e di fine')
  }
  if (oraInizio === oraFine) {
    throw new Error(lavoro ? 'Ingresso e uscita non possono coincidere' : 'Inizio e fine non possono coincidere')
  }
  return { oraInizio, oraFine, ore: calcolaOre(oraInizio, oraFine).ore }
}

/**
 * Normalizza il corpo di una richiesta in una voce.
 *
 * Unico posto in cui si leggono i campi di una riga: quattro route scrivono
 * timbrature, e quando si aggiunge una spunta (e' appena successo con "notte" e
 * "reperibilita'") va aggiunta in un punto solo, non in quattro.
 */
export function leggiRiga(body: any): TimbraturaInput {
  return {
    data: String(body?.data ?? '').slice(0, 10),
    servizioId: Number(body?.servizioId),
    oraInizio: body?.oraInizio ?? null,
    oraFine: body?.oraFine ?? null,
    notte: !!body?.notte,
    reperibilita: !!body?.reperibilita,
    mutua: !!body?.mutua,
    note: body?.note ? String(body.note).slice(0, 1000) : null,
  }
}

/** Opzioni di scrittura di una riga. */
export interface OpzioniScrittura {
  /** Chi scrive non e' il diretto interessato (responsabile o HR). */
  perConto?: boolean
}

/** Le colonne che dipendono dall'input, comuni a inserimento e modifica. */
function campiVoce(input: TimbraturaInput, serv: Servizio) {
  const lavoro = serv.tipoVoce === 'lavoro'
  return {
    servizio_id: serv.id,
    tipo_voce: serv.tipoVoce,
    // Le tre spunte valgono solo per le ore di lavoro: un permesso retribuito
    // notturno non esiste. Il vincolo c'e' anche sul database.
    notte: lavoro && !!input.notte,
    reperibilita: lavoro && !!input.reperibilita,
    mutua: lavoro && !!input.mutua,
    note: input.note ?? null,
  }
}

/** Un tratto pronto per il database: come TrattoTurno, ma senza orari se e' una giornata intera. */
type TrattoScritto = { data: string; oraInizio: string | null; oraFine: string | null; ore: number }

/** Il messaggio che spiega lo spezzamento, da mostrare a chi ha salvato. */
function avvisoSpezzamento(tratti: { data: string; ore: number }[]): string | undefined {
  if (tratti.length < 2) return undefined
  const pezzi = tratti.map((t) => `${oreIt(t.ore)} h sul ${dataIt(t.data)}`)
  return `Il turno scavalca la mezzanotte: l'ho diviso in ${pezzi.join(' e ')}. Sono due righe distinte, si correggono separatamente.`
}

function oreIt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',').replace(/,?0+$/, '')
}

/**
 * Inserisce una voce. Se il turno scavalca la mezzanotte nascono DUE righe
 * indipendenti: una fino a 24:00 sul giorno indicato, una da 00:00 sul giorno
 * dopo. Le ore del secondo giorno sono ore lavorate di quel giorno a tutti gli
 * effetti — coprono il suo monte ore, e l'eccedenza va in flessibilita'.
 */
export async function creaTimbratura(
  dipendenteId: number,
  input: TimbraturaInput,
  creataDa: string,
  opts: OpzioniScrittura = {},
): Promise<EsitoScrittura> {
  const serv = await servizioById(input.servizioId)
  const perConto = !!opts.perConto
  const { oraInizio, oraFine, ore } = await risolviVoce(dipendenteId, input, serv)

  // Giornata intera (giustificativo senza orari): niente da spezzare.
  if (!oraInizio || !oraFine) {
    await assertScrivibile(dipendenteId, input.data, serv.tipoVoce, perConto)
    const riga = await inserisci(dipendenteId, input, serv, creataDa, perConto, {
      data: input.data,
      oraInizio: null,
      oraFine: null,
      ore,
    })
    return { righe: [riga] }
  }

  const tratti = spezzaAMezzanotte(input.data, oraInizio, oraFine)
  await assertScrivibile(dipendenteId, tratti[0].data, serv.tipoVoce, perConto)
  for (const t of tratti.slice(1)) {
    await assertScrivibileCoda(dipendenteId, t.data, serv.tipoVoce, perConto)
  }

  const righe: Timbratura[] = []
  for (const t of tratti) {
    righe.push(await inserisci(dipendenteId, input, serv, creataDa, perConto, t))
  }
  return { righe, avviso: avvisoSpezzamento(tratti) }
}

export async function inserisci(
  dipendenteId: number,
  input: TimbraturaInput,
  serv: Servizio,
  creataDa: string,
  perConto: boolean,
  tratto: TrattoScritto,
): Promise<Timbratura> {
  const { data, error } = await supabase()
    .from('timbratura')
    .insert({
      dipendente_id: dipendenteId,
      data: tratto.data,
      ...campiVoce(input, serv),
      ora_inizio: tratto.oraInizio,
      ora_fine: tratto.oraFine,
      ore: tratto.ore,
      creata_da: creataDa,
      per_conto: perConto,
    })
    .select(SELECT_TIMB)
    .single()
  if (error) throw new Error(error.message)
  return mapTimbratura(data)
}

/**
 * Modifica una voce. Se i nuovi orari scavallano la mezzanotte la riga viene
 * ricondotta al primo tratto e la coda diventa una riga nuova sul giorno dopo:
 * l'avviso lo dice, perche' sul giorno dopo potrebbe esserci gia' qualcosa.
 */
export async function aggiornaTimbratura(
  dipendenteId: number,
  id: string,
  input: TimbraturaInput,
  modificataDa: string,
  opts: OpzioniScrittura = {},
): Promise<EsitoScrittura> {
  const serv = await servizioById(input.servizioId)
  const perConto = !!opts.perConto
  const { oraInizio, oraFine, ore } = await risolviVoce(dipendenteId, input, serv)

  const tratti: TrattoScritto[] =
    oraInizio && oraFine
      ? spezzaAMezzanotte(input.data, oraInizio, oraFine)
      : [{ data: input.data, oraInizio: null, oraFine: null, ore }]

  await assertScrivibile(dipendenteId, tratti[0].data, serv.tipoVoce, perConto)
  for (const t of tratti.slice(1)) {
    await assertScrivibileCoda(dipendenteId, t.data, serv.tipoVoce, perConto)
  }

  const { data, error } = await supabase()
    .from('timbratura')
    .update({
      data: tratti[0].data,
      ...campiVoce(input, serv),
      ora_inizio: tratti[0].oraInizio,
      ora_fine: tratti[0].oraFine,
      ore: tratti[0].ore,
      // creata_da non si tocca: dice chi ha inserito la riga la prima volta.
      modificata_da: modificataDa,
      modificata_il: new Date().toISOString(),
      per_conto: perConto,
    })
    .eq('id', id)
    .eq('dipendente_id', dipendenteId)
    .select(SELECT_TIMB)
    .single()
  if (error) throw new Error(error.message)

  const righe = [mapTimbratura(data)]
  for (const t of tratti.slice(1)) {
    righe.push(await inserisci(dipendenteId, input, serv, modificataDa, perConto, t))
  }
  const avviso = avvisoSpezzamento(tratti)
  return {
    righe,
    avviso: avviso && `${avviso} Controlla che la riga sul giorno seguente non si sovrapponga a quelle gia' presenti.`,
  }
}

export async function eliminaTimbratura(
  dipendenteId: number,
  id: string,
  opts: OpzioniScrittura = {},
): Promise<void> {
  const { data: row, error: e1 } = await supabase()
    .from('timbratura')
    .select('data, tipo_voce')
    .eq('id', id)
    .eq('dipendente_id', dipendenteId)
    .maybeSingle()
  if (e1) throw new Error(e1.message)
  if (!row) return
  await assertScrivibile(
    dipendenteId,
    row.data,
    (row.tipo_voce ?? 'lavoro') as TipoVoce,
    !!opts.perConto,
  )
  const { error } = await supabase().from('timbratura').delete().eq('id', id).eq('dipendente_id', dipendenteId)
  if (error) throw new Error(error.message)
}

