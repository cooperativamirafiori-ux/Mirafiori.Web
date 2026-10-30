/**
 * Registro delle domande all'assistente — ANONIMO (scelta di Dennis, 30 ott 2026).
 *
 * Due tabelle separate di proposito (supabase/assistente.sql):
 *   - `assistente_domanda`: pagina, domanda, risposta, utile sì/no. Nessuna
 *     traccia di chi l'ha fatta: serve a capire dove l'app è poco chiara.
 *   - `assistente_uso`: solo un contatore al giorno per persona, per il tetto
 *     di domande. La persona è un'impronta (hash) che cambia ogni giorno e non
 *     è collegata alle domande: dal registro non si risale a chi ha chiesto cosa.
 */

import crypto from 'node:crypto'
import { supabase } from '@/lib/core/supabase'

export const LIMITE_GIORNO = Number(process.env.ASSISTENTE_LIMITE_GIORNO) || 40

function oggiRoma(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date())
}

function impronta(email: string, giorno: string): string {
  const segreto = process.env.AUTH_SECRET ?? ''
  return crypto.createHash('sha256').update(`${email.trim().toLowerCase()}|${giorno}|${segreto}`).digest('hex')
}

/**
 * Conta una domanda e dice se si è oltre il tetto. Se il contatore non
 * risponde si lascia passare: il tetto è una protezione dei costi, non deve
 * spegnere l'assistente.
 */
export async function contaDomanda(email: string): Promise<{ superato: boolean }> {
  const giorno = oggiRoma()
  try {
    const { data, error } = await supabase().rpc('assistente_conta', {
      p_chi: impronta(email, giorno),
      p_giorno: giorno,
    })
    if (error) throw error
    return { superato: Number(data) > LIMITE_GIORNO }
  } catch (e) {
    console.error('[assistente] contatore non disponibile:', e instanceof Error ? e.message : e)
    return { superato: false }
  }
}

export interface DomandaRegistrata {
  id: number
  creataIl: string
  pagina: string | null
  domanda: string
  risposta: string
  utile: boolean | null
}

export async function registraDomanda(r: {
  pagina: string | null
  domanda: string
  risposta: string
  modello: string
  tokenIn: number
  tokenOut: number
}): Promise<number | null> {
  try {
    const { data, error } = await supabase()
      .from('assistente_domanda')
      .insert({
        pagina: r.pagina,
        domanda: r.domanda,
        risposta: r.risposta,
        modello: r.modello,
        token_in: r.tokenIn,
        token_out: r.tokenOut,
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id as number
  } catch (e) {
    // Il registro non deve mai far perdere la risposta a chi ha chiesto.
    console.error('[assistente] registro non scritto:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function segnaUtile(id: number, utile: boolean): Promise<void> {
  const { error } = await supabase().from('assistente_domanda').update({ utile }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function elencoDomande(opts: { soloNonUtili?: boolean; limite?: number } = {}): Promise<DomandaRegistrata[]> {
  let q = supabase()
    .from('assistente_domanda')
    .select('id, creata_il, pagina, domanda, risposta, utile')
    .order('creata_il', { ascending: false })
    .limit(opts.limite ?? 300)
  if (opts.soloNonUtili) q = q.eq('utile', false)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    creataIl: r.creata_il,
    pagina: r.pagina,
    domanda: r.domanda,
    risposta: r.risposta,
    utile: r.utile,
  }))
}
