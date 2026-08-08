/**
 * Date, orari e aritmetica delle ore della sezione Timbrature.
 *
 * Nessun accesso al database: sono funzioni pure, e per questo sono l'unico
 * pezzo della sezione che si puo' provare senza niente intorno. Tutto il resto
 * del modulo appoggia qui.
 */

/** Data odierna (YYYY-MM-DD) nel fuso Europe/Rome. */
export function oggiRoma(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Giorni indietro entro cui il dipendente puo' ancora registrare ore di lavoro:
 * oggi piu' i due precedenti. E' la regola che tiene viva la compilazione
 * quotidiana; tutto il resto del flusso discende da qui.
 */
export const GIORNI_INDIETRO = 2

/** Data in formato italiano, per i messaggi rivolti alle persone. */
export function dataIt(ymd: string): string {
  return ymd.split('-').reverse().join('/')
}

/** Data YYYY-MM-DD + n giorni (in UTC). */
export function addGiorni(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Prima data per cui il dipendente puo' ancora registrare ore di lavoro. */
export function primaDataUtile(oggi: string = oggiRoma()): string {
  return addGiorni(oggi, -GIORNI_INDIETRO)
}

export function primoUltimoGiorno(anno: number, mese: number): { from: string; to: string } {
  const mm = String(mese).padStart(2, '0')
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate()
  return { from: `${anno}-${mm}-01`, to: `${anno}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

/**
 * Ultimo giorno in cui il mese resta aperto al dipendente: l'ultimo giorno del
 * mese piu' la finestra, quindi il 2 del mese successivo per un mese di 31
 * giorni. Dal giorno dopo il foglio passa al responsabile.
 */
export function ultimoGiornoUtile(anno: number, mese: number): string {
  return addGiorni(primoUltimoGiorno(anno, mese).to, GIORNI_INDIETRO)
}

/** Il mese e' scaduto per il dipendente (calendario, a prescindere dallo stato). */
export function meseScaduto(anno: number, mese: number, oggi: string = oggiRoma()): boolean {
  return oggi > ultimoGiornoUtile(anno, mese)
}

/** Weekday ISO 1..7 (lun..dom) per una data YYYY-MM-DD. */
export function weekdayIso(dataYmd: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const [y, m, d] = dataYmd.split('-').map(Number)
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=dom..6=sab
  return (js === 0 ? 7 : js) as 1 | 2 | 3 | 4 | 5 | 6 | 7
}

/** Lunedì (ISO) della settimana che contiene la data. */
export function lunediIso(ymd: string): string {
  return addGiorni(ymd, -(weekdayIso(ymd) - 1))
}

/** Giorni interi trascorsi da un istante ISO a oggi. */
export function giorniDa(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// ------------------------------------------------------------------- orari

/** 'HH:mm' → minuti dalla mezzanotte. '24:00' vale 1440. */
export function orarioInMinuti(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** Minuti dalla mezzanotte → 'HH:mm'. 1440 resta '24:00'. */
export function minutiInOrario(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Ore esatte fra due orari HH:mm, senza arrotondamento a intervalli.
 *
 * Se la fine non e' successiva all'inizio si assume il giorno dopo (22:00→02:00
 * sono 4 ore). Chi scrive una riga non deve pero' mai salvare un turno cosi':
 * i turni oltre la mezzanotte si spezzano in due righe (vedi `spezzaAMezzanotte`),
 * quindi questa funzione lavora sempre su un intervallo dentro la giornata. Il
 * ramo del giorno dopo resta per non restituire numeri negativi a chi la chiama
 * prima dello spezzamento.
 */
export function calcolaOre(oraInizio: string, oraFine: string): { ore: number; oltreMezzanotte: boolean } {
  let diff = orarioInMinuti(oraFine) - orarioInMinuti(oraInizio)
  let oltreMezzanotte = false
  if (diff <= 0) {
    diff += 24 * 60
    oltreMezzanotte = true
  }
  return { ore: round4(diff / 60), oltreMezzanotte }
}

/**
 * Normalizza un orario in 'HH:mm'. Accetta 'H:m', 'HH:mm', 'HH:mm:ss'.
 * Restituisce null se il valore è assente; lancia se è presente ma non valido.
 *
 * '24:00' e' ammesso: e' l'uscita delle righe prodotte dallo spezzamento a
 * mezzanotte, e Postgres lo accetta come valore di tipo `time`.
 */
export function normalizzaOrario(v: unknown, campo: string): string | null {
  if (v == null || v === '') return null
  const m = String(v).trim().match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/)
  if (!m) throw new Error(`${campo} non valido (formato atteso HH:mm)`)
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59 || (h === 24 && min > 0)) {
    throw new Error(`${campo} non valido (formato atteso HH:mm)`)
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Un tratto di turno dentro una singola giornata. */
export interface TrattoTurno {
  data: string
  oraInizio: string
  oraFine: string
  ore: number
}

/**
 * Spezza un turno che scavalca la mezzanotte nei giorni che attraversa.
 *
 * Il dipendente digita una volta sola quello che ha fatto — giorno 1, dalle
 * 20:00 alle 08:00 — e da qui escono due tratti: 20:00→24:00 sul giorno 1 e
 * 00:00→08:00 sul giorno 2. Diventeranno due righe indipendenti: le ore del
 * secondo giorno valgono come ore lavorate di quel giorno a tutti gli effetti,
 * quindi ne coprono il monte ore e l'eventuale eccedenza va in flessibilita'.
 *
 * Un turno che sta dentro la giornata restituisce un solo tratto, identico a
 * quello che si e' inserito.
 */
export function spezzaAMezzanotte(data: string, oraInizio: string, oraFine: string): TrattoTurno[] {
  const inizio = orarioInMinuti(oraInizio)
  const fine = orarioInMinuti(oraFine)
  if (fine > inizio) {
    return [{ data, oraInizio, oraFine, ore: round4((fine - inizio) / 60) }]
  }
  const tratti: TrattoTurno[] = [
    { data, oraInizio, oraFine: '24:00', ore: round4((1440 - inizio) / 60) },
  ]
  if (fine > 0) {
    tratti.push({
      data: addGiorni(data, 1),
      oraInizio: '00:00',
      oraFine,
      ore: round4(fine / 60),
    })
  }
  return tratti
}
