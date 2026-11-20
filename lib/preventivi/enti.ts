/**
 * Enti dei preventivi (schermata Preventivi → Enti, 20/11/2026).
 *
 * Il nome dell'ente è l'intestazione usata in fattura ed è anche ciò che lega
 * l'ente alle sue tariffe (colonna "Ente" del tariffario). Per questo, quando
 * si corregge un nome, lo si corregge anche in tutte le righe del tariffario
 * che lo citano: altrimenti l'ente perderebbe le sue tariffe.
 *
 * Gli enti con una chiave (Comune di Torino, ASL Città di Torino 1 e 2,
 * Privato) formano le coppie di Torino: il nome si può correggere, la chiave
 * resta.
 */

import { ENTE_ALTRI, ENTE_TUTTI, type Ente } from '@/types/preventivi'
import { aggiornaEnte, aggiornaTariffa, creaEnte, getEnti, getTariffe } from './data'

const testo = (v: unknown, max = 255) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
const chiave = (s: string) => s.trim().toLowerCase()

export function leggiEnte(b: Record<string, any>): { nome: string; servizi: string; note: string } | { problema: string } {
  const nome = testo(b.nome, 200)
  if (!nome) return { problema: 'Scrivi il nome dell’ente, come compare in fattura' }
  if ([ENTE_TUTTI, ENTE_ALTRI].some((x) => chiave(x) === chiave(nome))) return { problema: 'Questo nome è riservato al tariffario' }
  return { nome, servizi: testo(b.servizi, 255), note: testo(b.note, 2000) }
}

export async function nuovoEnte(d: { nome: string; servizi: string; note: string }): Promise<Ente> {
  const doppio = (await getEnti()).find((e) => chiave(e.nome) === chiave(d.nome))
  if (doppio) throw new Error(`«${doppio.nome}» c’è già`)
  return creaEnte(d)
}

/** Modifica; se cambia il nome, segue anche il tariffario. Ritorna quante tariffe ha aggiornato. */
export async function modificaEnte(
  spItemId: string,
  d: Partial<{ nome: string; servizi: string; note: string; attivo: boolean }>,
): Promise<number> {
  const enti = await getEnti()
  const e = enti.find((x) => x.spItemId === spItemId)
  if (!e) throw new Error('Ente non trovato')
  if (d.attivo === false && e.chiave) throw new Error('Gli enti delle coppie di Torino e «Privato» non si nascondono')
  let tariffeAggiornate = 0
  if (d.nome && d.nome !== e.nome) {
    const doppio = enti.find((x) => x.spItemId !== spItemId && chiave(x.nome) === chiave(d.nome!))
    if (doppio) throw new Error(`«${doppio.nome}» c’è già`)
    for (const t of (await getTariffe()).filter((x) => x.ente === e.nome)) {
      await aggiornaTariffa(t.spItemId, { ente: d.nome })
      tariffeAggiornate++
    }
  }
  await aggiornaEnte(spItemId, d)
  return tariffeAggiornate
}
