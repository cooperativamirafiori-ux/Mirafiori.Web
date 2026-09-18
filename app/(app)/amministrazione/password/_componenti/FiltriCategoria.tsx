'use client'

/**
 * I bottoni colorati per categoria, al posto della tendina.
 *
 * Perché non una tendina (18 set 2026, richiesta di Dennis): l'archivio si apre
 * per guardare *un gruppo* — «le password del WiFi», «quelle delle banche» — non
 * per filtrare una tabella. Con la tendina servono tre gesti (apri, scorri,
 * scegli) e non si vede quali categorie esistono davvero finché non l'apri. Qui
 * si vede tutto e si arriva col pollice in un tocco solo.
 *
 * Tre scelte, e il perché:
 *
 * 1. **Si mostrano solo le categorie che hanno voci.** Un bottone che porta a
 *    una schermata vuota è rumore. Il conteggio accanto al nome dice quante ne
 *    trova prima ancora di premere.
 * 2. **Il bottone acceso si spegne se lo ripremi**: chiudere il filtro è lo
 *    stesso gesto che l'ha aperto, senza tornare su "Tutte".
 * 3. **Le categorie non previste compaiono comunque**, in fondo e in grigio: se
 *    su SharePoint qualcuno scrive una categoria a mano, quelle voci restano
 *    raggiungibili invece di sparire dai filtri.
 *
 * I bottoni vanno a capo con `flex-wrap` (regola 5-bis): a 375px ne stanno due
 * per riga, nessuno esce dallo schermo.
 */

import { CATEGORIE_PASSWORD, categoriaDi, type VocePassword } from '@/types/password'
import { stileCategoria, STILE_TUTTE } from './colori'

const BASE =
  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors'

export function FiltriCategoria({
  lista,
  filtro,
  onFiltro,
}: {
  /** Tutte le voci, non quelle già filtrate: i conteggi devono restare fermi. */
  lista: VocePassword[]
  /** Categoria selezionata, stringa vuota = tutte */
  filtro: string
  onFiltro: (categoria: string) => void
}) {
  // Conteggio per categoria + categorie "fuori elenco" trovate nei dati.
  const conta = new Map<string, number>()
  for (const v of lista) {
    const c = categoriaDi(v)
    conta.set(c, (conta.get(c) ?? 0) + 1)
  }
  const previste = CATEGORIE_PASSWORD.filter((c) => conta.has(c))
  const impreviste = [...conta.keys()]
    .filter((c) => !(CATEGORIE_PASSWORD as readonly string[]).includes(c))
    .sort((a, b) => a.localeCompare(b, 'it'))
  const categorie = [...previste, ...impreviste]

  if (categorie.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onFiltro('')}
        aria-pressed={filtro === ''}
        className={`${BASE} ${filtro === '' ? STILE_TUTTE.attivo : STILE_TUTTE.spento}`}
      >
        Tutte
        <span className="text-xs font-normal opacity-70">{lista.length}</span>
      </button>

      {categorie.map((c) => {
        const attivo = filtro === c
        const stile = stileCategoria(c)
        return (
          <button
            key={c}
            type="button"
            // Ripremere la categoria accesa toglie il filtro.
            onClick={() => onFiltro(attivo ? '' : c)}
            aria-pressed={attivo}
            className={`${BASE} ${attivo ? stile.attivo : stile.spento}`}
          >
            {c}
            <span className="text-xs font-normal opacity-70">{conta.get(c)}</span>
          </button>
        )
      })}
    </div>
  )
}
