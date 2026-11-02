/**
 * Quali guide mandare all'assistente per una domanda (1 nov 2026, docs/assistente.md).
 *
 * Mandare tutta la guida a ogni domanda costa poco ma ci porta a ridosso dei
 * 100.000 token, oltre i quali Haiku fa pagare TUTTA la richiesta cinque volte
 * tanto. Quindi si manda:
 *   - sempre `generale.md`;
 *   - la guida dell'area della pagina dove si trova la persona;
 *   - le guide che una prima chiamata, piccolissima, giudica utili leggendo
 *     solo l'indice delle aree (nome + descrizione + titoli delle pagine).
 *
 * Se la scelta non riesce (errore, risposta strana, tempo scaduto) si mandano
 * tutte le guide come prima: la risposta arriva lo stesso, solo a prezzo pieno.
 */

import { paginaDi, type Guida, type GuidaArea } from './guida'
import type { Messaggio } from './chiedi'

const API_URL = 'https://api.anthropic.com/v1/messages'
const MODELLO_SCELTA = 'claude-haiku-5-5'
/** Quante guide in più oltre a generale e area della pagina. */
const MAX_SCELTE = 3
/** Tetto di sicurezza sul testo delle guide scelte (~2,45 caratteri per token → ~60.000 token). */
const MAX_CARATTERI = 150_000
const TEMPO_MASSIMO_MS = 8000

export interface Scelta {
  guide: GuidaArea[]
  /** 'scelte' = solo alcune; 'tutte' = ripiego. Finisce nei log. */
  modo: 'scelte' | 'tutte'
}

function indice(guida: Guida): string {
  return guida.guide
    .filter((g) => g.chiave !== 'generale')
    .map((g) => {
      const titoli = guida.pagine.filter((p) => p.area === g.area).map((p) => p.titolo).filter(Boolean)
      return `- ${g.chiave}: ${g.area}. ${g.descrizione}${titoli.length ? ` Pagine: ${titoli.join(', ')}.` : ''}`
    })
    .join('\n')
}

async function chiediAree(opts: { domanda: string; storia: Messaggio[]; guida: Guida; chiave: string }): Promise<string[]> {
  const ultime = opts.storia
    .slice(-2)
    .map((m) => `${m.ruolo === 'utente' ? 'Persona' : 'Assistente'}: ${m.testo.slice(0, 500)}`)
    .join('\n')

  const sistema = `Scegli quali sezioni della guida di un'app gestionale servono per rispondere alla domanda.
Rispondi SOLO con JSON nella forma {"aree":["chiave1","chiave2"]}, al massimo ${MAX_SCELTE} chiavi prese dall'elenco, dalla più utile. Se nessuna serve, {"aree":[]}.
Nel dubbio fra due aree simili, mettile entrambe.

Sezioni:
${indice(opts.guida)}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TEMPO_MASSIMO_MS)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.chiave,
        'anthropic-version': '2023-06-01',
        ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : {}),
      },
      body: JSON.stringify({
        model: process.env.ASSISTENTE_MODELLO_SCELTA || MODELLO_SCELTA,
        max_tokens: 100,
        system: sistema,
        messages: [{ role: 'user', content: `${ultime ? `Conversazione recente:\n${ultime}\n\n` : ''}Domanda: ${opts.domanda}` }],
      }),
      cache: 'no-store',
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}`)
    const data = await res.json()
    const testo: string = (data.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
    const json = testo.match(/\{[\s\S]*\}/)
    if (!json) throw new Error('risposta senza JSON')
    const aree = JSON.parse(json[0])?.aree
    if (!Array.isArray(aree)) throw new Error('risposta senza "aree"')
    return aree.filter((a: unknown): a is string => typeof a === 'string')
  } finally {
    clearTimeout(timer)
  }
}

export async function scegliGuide(opts: {
  domanda: string
  storia: Messaggio[]
  pagina: string | null
  guida: Guida
  chiave: string
}): Promise<Scelta> {
  const { guida } = opts
  const perChiave = new Map(guida.guide.map((g) => [g.chiave, g]))
  const generale = perChiave.get('generale')

  let proposte: string[]
  try {
    proposte = await chiediAree(opts)
  } catch (e) {
    console.warn('[assistente] scelta delle guide non riuscita, mando tutte:', e instanceof Error ? e.message : e)
    return { guide: guida.guide, modo: 'tutte' }
  }

  const scelte: GuidaArea[] = []
  const aggiungi = (g: GuidaArea | undefined) => {
    if (g && !scelte.includes(g)) scelte.push(g)
  }
  aggiungi(generale)
  // L'area della pagina aperta entra sempre: spesso la domanda è «qui come si fa?».
  const qui = opts.pagina ? paginaDi(opts.pagina, guida.pagine) : undefined
  if (qui) aggiungi(guida.guide.find((g) => g.area === qui.area))
  for (const c of proposte.slice(0, MAX_SCELTE)) aggiungi(perChiave.get(c))

  // Tetto: le prime (generale, pagina, più utili) restano, le ultime cadono.
  let caratteri = 0
  const dentro = scelte.filter((g) => {
    caratteri += g.testo.length
    return g === generale || caratteri <= MAX_CARATTERI
  })
  return { guide: dentro, modo: 'scelte' }
}
