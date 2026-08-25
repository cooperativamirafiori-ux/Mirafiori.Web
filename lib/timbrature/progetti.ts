/**
 * Consuntivo ore per progetto.
 *
 * E' il motivo per cui il progetto esiste: il centro di costo della
 * progettazione resta uno solo (cc23), quindi senza questo taglio le ore di
 * Impatto, Serigrafia o Piazza Ragazzabile sarebbero indistinguibili.
 *
 * Come tutto il resto della sezione, non c'e' nessun contatore memorizzato: si
 * somma dalle righe a ogni lettura.
 */

import { supabase } from '@/lib/core/supabase'
import { getProgetti } from '@/lib/timbrature/anagrafica'
import { round4 } from '@/lib/timbrature/date'
import type { OrePerProgetto } from '@/types/timbrature'

/** Etichetta della riga senza progetto: si mostra, non si nasconde. */
export const SENZA_PROGETTO = 'Senza progetto'

/**
 * Ore per progetto nel periodo, con lo spaccato per persona.
 *
 * Si guardano solo le righe dei servizi che chiedono il progetto (oggi
 * Progettazione): il resto delle ore non c'entra, e includerlo gonfierebbe la
 * riga "senza progetto" con tutte le ore della cooperativa.
 *
 * `referente` restringe ai propri collaboratori: e' lo stesso criterio del
 * cruscotto, un responsabile non vede le ore di chi non gli risponde. Le HR
 * passano `null` e vedono tutti.
 */
export async function orePerProgetto(
  dal: string,
  al: string,
  referente?: string | null,
): Promise<OrePerProgetto[]> {
  const db = supabase()

  const { data: serv, error: eServ } = await db
    .from('servizio')
    .select('id')
    .eq('chiede_progetto', true)
  if (eServ) throw new Error(eServ.message)
  const serviziIds = (serv ?? []).map((s: any) => s.id)
  if (serviziIds.length === 0) return []

  const { data: righe, error } = await db
    .from('timbratura')
    .select('ore, progetto_id, dipendente_id')
    .in('servizio_id', serviziIds)
    .gte('data', dal)
    .lte('data', al)
  if (error) throw new Error(error.message)
  if (!righe || righe.length === 0) return []

  // Le persone si leggono dalla tabella e non da getDipendenti(): qui servono
  // anche i disattivati, altrimenti le ore di chi ha chiuso il rapporto a
  // meta' progetto spariscono dal consuntivo del bando.
  const ids = [...new Set(righe.map((r: any) => r.dipendente_id))]
  const { data: dips, error: eDip } = await db
    .from('dipendente')
    .select('id, cognome_nome, referente_email')
    .in('id', ids)
  if (eDip) throw new Error(eDip.message)

  const nomi = new Map<number, string>()
  const ammessi = new Set<number>()
  const filtro = referente ? referente.toLowerCase() : null
  for (const d of dips ?? []) {
    nomi.set(d.id, d.cognome_nome)
    if (!filtro || (d.referente_email ?? '').toLowerCase() === filtro) ammessi.add(d.id)
  }

  const progetti = await getProgetti(false)
  const nomeProgetto = new Map<number, string>(progetti.map((p) => [p.id, p.nome]))

  // chiave: id del progetto, o 0 per la riga senza progetto
  const acc = new Map<number, { ore: number; persone: Map<number, number> }>()
  for (const r of righe as any[]) {
    if (!ammessi.has(r.dipendente_id)) continue
    const k = r.progetto_id ?? 0
    const voce = acc.get(k) ?? { ore: 0, persone: new Map<number, number>() }
    voce.ore += Number(r.ore)
    voce.persone.set(r.dipendente_id, (voce.persone.get(r.dipendente_id) ?? 0) + Number(r.ore))
    acc.set(k, voce)
  }

  const out: OrePerProgetto[] = []
  for (const [k, v] of acc) {
    out.push({
      progettoId: k === 0 ? null : k,
      nome: k === 0 ? SENZA_PROGETTO : (nomeProgetto.get(k) ?? `Progetto #${k}`),
      ore: round4(v.ore),
      persone: [...v.persone.entries()]
        .map(([dipendenteId, ore]) => ({
          dipendenteId,
          cognomeNome: nomi.get(dipendenteId) ?? '—',
          ore: round4(ore),
        }))
        .sort((a, b) => b.ore - a.ore),
    })
  }
  // Piu' ore in cima; la riga senza progetto per ultima, qualunque sia il totale:
  // e' un residuo da sistemare, non un progetto.
  return out.sort((a, b) => {
    if (a.progettoId === null) return 1
    if (b.progettoId === null) return -1
    return b.ore - a.ore
  })
}
