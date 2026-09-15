/**
 * Traduzione dalla `Categoria` dei costi alla voce del piano dei conti
 * analitico.
 *
 * La mappa vive nella tabella `mappa_categoria_voce` su Supabase, non qui:
 * `Categoria` su SharePoint è testo libero con suggerimenti, non una scelta
 * chiusa, quindi prima o poi comparirà un valore nuovo — e la risposta giusta
 * è aggiungere una riga alla tabella, non modificare una costante e fare un
 * deploy. La stessa tabella la legge anche `scripts/travaso-costi-registro.mjs`,
 * che è JavaScript e non potrebbe importare da qui.
 *
 * **`undefined` è una risposta legittima**, non un errore: vuol dire che quella
 * categoria non dice di cosa è fatta la spesa. 'Altro' e 'Acquisti' sono
 * esattamente questo. Tradurle in "Altri costi" sarebbe peggio che lasciarle
 * vuote, perché una riga classificata ha l'aria di essere a posto e nessuno la
 * va più a rivedere; una riga vuota resta nella lista di cosa manca.
 */

import { supabase } from '@/lib/core/supabase'

/** Mappa categoria → voce. `null` = categoria conosciuta ma senza voce. */
export type MappaCategorie = Map<string, string | null>

let _cache: { mappa: MappaCategorie; il: number } | null = null
const DURATA_CACHE = 5 * 60 * 1000 // 5 minuti

function normalizza(categoria: string): string {
  return categoria.trim().toLowerCase()
}

/**
 * Legge la mappa. In cache per cinque minuti: la si consulta a ogni costo
 * creato e cambia due volte l'anno.
 */
export async function getMappaCategorie(): Promise<MappaCategorie> {
  if (_cache && Date.now() - _cache.il < DURATA_CACHE) return _cache.mappa

  const { data, error } = await supabase()
    .from('mappa_categoria_voce')
    .select('categoria, voce')
  if (error) throw new Error(`voci: lettura mappa categorie — ${error.message}`)

  const mappa: MappaCategorie = new Map()
  for (const r of data ?? []) mappa.set(normalizza(r.categoria), r.voce ?? null)
  _cache = { mappa, il: Date.now() }
  return mappa
}

/**
 * La voce analitica di una categoria, o `undefined` se non si sa.
 *
 * Non lancia e non ripiega su 'ALTR': una categoria mai vista lascia la riga
 * senza voce, e la riga compare nella lista delle categorie da mappare. È il
 * comportamento voluto — vedi il commento in testa al file.
 */
export async function voceDiCategoria(
  categoria: string | undefined,
): Promise<string | undefined> {
  if (!categoria?.trim()) return undefined
  const mappa = await getMappaCategorie()
  return mappa.get(normalizza(categoria)) ?? undefined
}

/**
 * Le categorie che compaiono nel registro senza una voce: la lista di cosa
 * resta da mappare. Corta per definizione, e si chiude con un `insert` in
 * `mappa_categoria_voce` più un ricalcolo.
 */
export async function categorieSenzaVoce(): Promise<{ nota: string; righe: number }[]> {
  const { data, error } = await supabase()
    .from('movimento')
    .select('note')
    .is('voce', null)
    .eq('tipo', 'costo')
    .limit(1000)
  if (error) throw new Error(`voci: categorie senza voce — ${error.message}`)

  const conteggio = new Map<string, number>()
  for (const r of data ?? []) {
    const nota = (r as any).note?.trim() || '(nessuna categoria)'
    conteggio.set(nota, (conteggio.get(nota) ?? 0) + 1)
  }
  return [...conteggio.entries()]
    .map(([nota, righe]) => ({ nota, righe }))
    .sort((a, b) => b.righe - a.righe)
}

/** Svuota la cache. Serve dopo aver aggiunto una riga alla mappa. */
export function scordaMappaCategorie(): void {
  _cache = null
}
