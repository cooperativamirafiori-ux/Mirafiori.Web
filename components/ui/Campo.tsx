'use client'

/**
 * Un campo di form completo: etichetta, controllo, aiuto, errore.
 *
 * Il controllo giusto lo scegli col parametro `tipo` — è lo stesso meccanismo di
 * `CampoInput` in GestioneRU, dove i campi sono generati da uno schema, portato
 * qui perché serve a tutti. Il vocabolario dei tipi è quello di `RUField`, così
 * un giorno uno schema può pilotare direttamente questo componente.
 *
 * Serve a sostituire i blocchi `label` + `input` scritti a mano: erano 21 in
 * NuovaPrestazioneForm, 15 in GestioneSoftware, 14 in GestioneAcquisti, ognuno
 * con le sue classi Tailwind leggermente diverse dalle altre.
 *
 * `maiuscolo`, i limiti numerici e le scelte con valore diverso dall'etichetta
 * non sono stati messi per completezza: li ha chiesti il primo form convertito
 * (codice fiscale, IBAN, numero giorni, casistica GDPR).
 *
 * I campi file stanno in `Allegato`: non hanno un valore da legare ma un
 * `File | null`, e hanno un limite di dimensione da controllare.
 */

export const inputCls =
  'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan'
export const labelCls = 'block text-xs font-semibold text-gray-600 mb-1'

export type TipoCampo =
  | 'text'
  | 'textarea'
  | 'choice'
  | 'date'
  | 'number'
  | 'currency'
  | 'email'
  | 'tel'

/** Una scelta: stringa secca quando valore ed etichetta coincidono, coppia quando no. */
export type Scelta = string | { valore: string; etichetta: string }

const TIPI_HTML: Record<Exclude<TipoCampo, 'textarea' | 'choice'>, string> = {
  text: 'text',
  date: 'date',
  number: 'number',
  currency: 'number',
  email: 'email',
  tel: 'tel',
}

const normalizza = (s: Scelta) => (typeof s === 'string' ? { valore: s, etichetta: s } : s)

export function Campo({
  etichetta,
  valore,
  onChange,
  tipo = 'text',
  scelte,
  obbligatorio,
  errore,
  aiuto,
  righe = 3,
  disabilitato,
  segnaposto,
  maiuscolo,
  min,
  max,
  maxLength,
  vuoto = '—',
  senzaVuoto,
}: {
  etichetta: string
  valore: string
  onChange: (v: string) => void
  tipo?: TipoCampo
  /** Opzioni per `tipo="choice"`. */
  scelte?: readonly Scelta[]
  obbligatorio?: boolean
  /** Se valorizzato, il bordo diventa rosso e il testo compare sotto. */
  errore?: string
  /** Nota di contesto sotto il campo, quando l'etichetta da sola non basta. */
  aiuto?: string
  righe?: number
  disabilitato?: boolean
  segnaposto?: string
  /** Forza il maiuscolo mentre si scrive: codici fiscali, IBAN, targhe. */
  maiuscolo?: boolean
  min?: number
  max?: number
  maxLength?: number
  /** Testo della prima opzione di un `choice`, quella che vale "niente". */
  vuoto?: string
  /**
   * Toglie del tutto la voce "niente" da un `choice`. Da usare quando il campo
   * ha già un valore di partenza e non sceglierlo non è una risposta possibile:
   * lasciarla farebbe comparire due volte la stessa parola (era il caso di
   * "Documento da emettere", che parte da «Fattura» e ha «Fattura» fra le scelte).
   */
  senzaVuoto?: boolean
}) {
  const cambia = (v: string) => onChange(maiuscolo ? v.toUpperCase() : v)

  const classi = [
    inputCls,
    errore ? 'border-red-400 focus:ring-red-300' : '',
    disabilitato ? 'bg-gray-50 text-gray-500' : '',
    maiuscolo ? 'uppercase' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label className="block">
      <span className={labelCls}>
        {etichetta}
        {obbligatorio && <span className="text-red-500 ml-0.5">*</span>}
      </span>

      {tipo === 'textarea' ? (
        <textarea
          value={valore}
          onChange={(e) => cambia(e.target.value)}
          rows={righe}
          maxLength={maxLength}
          disabled={disabilitato}
          placeholder={segnaposto}
          className={`${classi} resize-none`}
        />
      ) : tipo === 'choice' ? (
        <Scelte
          valore={valore}
          onChange={cambia}
          scelte={scelte}
          vuoto={vuoto}
          senzaVuoto={senzaVuoto}
          disabilitato={disabilitato}
          classi={classi}
        />
      ) : (
        <input
          type={TIPI_HTML[tipo]}
          step={tipo === 'currency' ? '0.01' : undefined}
          min={min}
          max={max}
          maxLength={maxLength}
          value={valore}
          onChange={(e) => cambia(e.target.value)}
          disabled={disabilitato}
          placeholder={segnaposto}
          className={classi}
        />
      )}

      {errore ? (
        <span className="block text-xs text-red-600 mt-1">{errore}</span>
      ) : aiuto ? (
        <span className="block text-xs text-gray-400 mt-1">{aiuto}</span>
      ) : null}
    </label>
  )
}

function Scelte({
  valore,
  onChange,
  scelte,
  vuoto,
  senzaVuoto,
  disabilitato,
  classi,
}: {
  valore: string
  onChange: (v: string) => void
  scelte?: readonly Scelta[]
  vuoto: string
  senzaVuoto?: boolean
  disabilitato?: boolean
  classi: string
}) {
  const opzioni = (scelte ?? []).map(normalizza)
  // Una lista SharePoint può contenere valori storici non più fra le scelte: se li
  // nascondessimo, aprire e salvare la scheda li cancellerebbe in silenzio.
  const fuoriLista = valore && !opzioni.some((o) => o.valore === valore)

  return (
    <select
      value={valore}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabilitato}
      className={classi}
    >
      {!senzaVuoto && <option value="">{vuoto}</option>}
      {fuoriLista && <option value={valore}>{valore} (valore attuale)</option>}
      {opzioni.map((o) => (
        <option key={o.valore} value={o.valore}>
          {o.etichetta}
        </option>
      ))}
    </select>
  )
}
