'use client'

/**
 * La domanda e i bottoni grandi per rispondere.
 *
 * Nati per il modulo a passi della Richiesta Fattura, spostati nel kit il
 * 25 set 2026 quando è servita la stessa forma al modulo pubblico del nuovo
 * cliente (`app/nuovo-cliente/`).
 *
 * I bottoni sono alti almeno 56 px e col testo a 16 px: si toccano col pollice
 * anche con la mano che trema, e si leggono senza occhiali. Il colore è il blu
 * `primary` e non l'azzurro del logo: col bianco sopra, l'azzurro non arriva al
 * contrasto minimo per un testo leggibile (3:1 contro i 4,5:1 richiesti).
 */

export interface Opzione {
  valore: string
  etichetta: string
  /** Una riga in più sotto l'etichetta, per spiegare senza allungare la domanda. */
  sotto?: string
}

/** Titolo e spiegazione di una domanda. */
export function Domanda({
  titolo,
  spiegazione,
  children,
}: {
  titolo: string
  spiegazione?: string
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-bold text-gray-800">{titolo}</h3>
        {spiegazione && <p className="text-base text-gray-600 mt-0.5">{spiegazione}</p>}
      </div>
      {children}
    </div>
  )
}

/**
 * Una scelta fra pochi bottoni grandi. Al tocco la risposta è data: niente
 * tendine da aprire, niente da confermare.
 */
export function BottoniScelta({
  opzioni,
  valore,
  onScegli,
  colonne = 1,
  errore,
}: {
  opzioni: readonly Opzione[]
  valore: string
  onScegli: (v: string) => void
  /** Due colonne per le risposte corte (Sì/No), una per quelle lunghe. */
  colonne?: 1 | 2
  errore?: string
}) {
  return (
    <div>
      <div
        role="radiogroup"
        className={`grid gap-3 ${colonne === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
      >
        {opzioni.map((o) => {
          const scelto = o.valore === valore
          return (
            <button
              key={o.valore}
              type="button"
              role="radio"
              aria-checked={scelto}
              onClick={() => onScegli(o.valore)}
              className={`min-h-[56px] w-full rounded-2xl border-2 px-4 py-3 text-left transition ${
                scelto
                  ? 'border-primary bg-blue-50 text-gray-900'
                  : errore
                    ? 'border-red-300 bg-white text-gray-800'
                    : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    scelto ? 'border-primary bg-primary text-white' : 'border-gray-300'
                  }`}
                >
                  {scelto && (
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M3 8.5l3.2 3L13 4.5" />
                    </svg>
                  )}
                </span>
                <span>
                  <span className="block text-base font-semibold">{o.etichetta}</span>
                  {o.sotto && <span className="block text-sm text-gray-500">{o.sotto}</span>}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {errore && <p className="text-sm font-medium text-red-600 mt-2">{errore}</p>}
    </div>
  )
}

/** Piccoli bottoni tondi per riempire un campo con un tocco («Pranzo», «Cena»…). */
export function Scorciatoie({
  voci,
  onScegli,
  attiva,
}: {
  voci: readonly string[]
  onScegli: (v: string) => void
  attiva?: string
}) {
  if (!voci.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {voci.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onScegli(v)}
          className={`min-h-[44px] rounded-full border-2 px-4 text-base font-medium ${
            attiva === v
              ? 'border-primary bg-blue-50 text-gray-900'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

/** Un'azione secondaria scritta come un link: «Cambia», «Ha pagato un altro giorno?». */
export function Link({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] text-base font-medium text-primary underline underline-offset-2"
    >
      {children}
    </button>
  )
}

/** Un interruttore sì/no scritto come una frase, per le domande secondarie. */
export function Spunta({
  etichetta,
  valore,
  onChange,
}: {
  etichetta: string
  valore: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex min-h-[48px] items-center gap-3 text-base text-gray-800">
      <input
        type="checkbox"
        checked={valore}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6 rounded border-gray-300 text-primary focus:ring-primary"
      />
      {etichetta}
    </label>
  )
}
