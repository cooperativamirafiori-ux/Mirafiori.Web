/**
 * Tipi per la sezione Amministrazione → Gestione Password.
 *
 * La cassaforte delle credenziali della cooperativa: un posto solo per i portali
 * che servono a più persone (banca, INPS, fornitori, social), al posto del
 * foglio Excel o del post-it nel cassetto.
 *
 * ⚠️ Le password sono salvate **in chiaro** sulla lista SharePoint, come già in
 * Gestione Software: è una scelta esplicita di Dennis (15 set 2026), presa
 * sapendo che chiunque abbia accesso alla lista su SharePoint — o all'export in
 * Excel — le legge tutte. Se un domani si volesse cifrarle, il posto dove
 * intervenire sono `leggiSegreto`/`scriviSegreto` in `lib/password/data.ts`:
 * sono già le uniche due porte attraverso cui il valore passa, e la schermata
 * non cambierebbe di una riga. Vedi `docs/gestione-password.md`.
 */

/**
 * Le categorie dell'archivio. **L'ordine è quello dei bottoni di filtro**, e
 * ogni categoria ha un colore fisso in `app/(app)/amministrazione/password/
 * _componenti/colori.ts`: aggiungendone una qui, va aggiunta anche là (altrimenti
 * esce grigia) e in `scripts/provision-password.mjs`, che allinea le scelte della
 * colonna su SharePoint.
 */
export const CATEGORIE_PASSWORD = [
  'Banche e pagamenti',
  'Enti e portali PA',
  'Fornitori',
  'Posta e domini',
  'Sito e social',
  'Software',
  'Strutture',
  'Utenze',
  'WiFi',
  'Altro',
] as const
export type CategoriaPassword = (typeof CATEGORIE_PASSWORD)[number]

/**
 * Categoria di una voce, con il ripiego su "Altro".
 *
 * Una voce senza categoria esiste (il campo non è obbligatorio) e deve comunque
 * finire sotto un bottone, altrimenti sparisce da ogni filtro e la si ritrova
 * solo con la ricerca. Conteggio e filtro devono usare questa stessa funzione,
 * o i numeri sui bottoni non corrisponderebbero alle voci mostrate.
 */
export function categoriaDi(v: { categoria: string }): string {
  return v.categoria || 'Altro'
}

/**
 * Dopo quanti giorni una password viene segnalata come "da cambiare".
 * Un anno: non è una regola aziendale, è il promemoria che nessuno si ricorda
 * di darsi da solo. Vale sulla data dell'ultima modifica della password, non
 * su quella di inserimento della voce.
 */
export const GIORNI_PASSWORD_VECCHIA = 365

export interface VocePassword {
  /** ID riga SharePoint (string, usato dalle API Graph) */
  spItemId: string
  /** Nome della voce: a cosa serve questa credenziale (colonna Title in SP) */
  nome: string
  categoria: string
  /** Nome utente / email con cui si accede */
  nomeUtente: string
  /** Password — in chiaro su SharePoint (vedi nota in testa al file) */
  password: string
  /** PIN o codice numerico, se il servizio ne ha uno (facoltativo) */
  pin: string
  /** URL della pagina di accesso */
  linkSito: string
  /** Numero di telefono su cui arriva l'SMS/notifica del secondo fattore */
  telefonoVerifica: string
  /** Data in cui la voce è stata inserita in archivio (YYYY-MM-DD) */
  dataInserimento?: string
  /** Data dell'ultimo cambio della password (YYYY-MM-DD) */
  ultimaModificaPassword?: string
  note: string
}

/** Payload di creazione/aggiornamento dal form */
export interface VocePasswordInput {
  nome: string
  categoria: string
  nomeUtente: string
  password: string
  pin: string
  linkSito: string
  telefonoVerifica: string
  note: string
}

/** Giorni passati da una data YYYY-MM-DD. null se la data manca o non è valida. */
export function giorniDa(data?: string): number | null {
  if (!data) return null
  const d = new Date(`${data.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  return Math.round((oggi.getTime() - d.getTime()) / 86_400_000)
}

/** Password più vecchia di un anno: da cambiare. */
export function passwordVecchia(v: VocePassword): boolean {
  if (!v.password) return false
  const g = giorniDa(v.ultimaModificaPassword ?? v.dataInserimento)
  return g != null && g >= GIORNI_PASSWORD_VECCHIA
}
