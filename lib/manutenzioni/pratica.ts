/**
 * La "pratica" di una richiesta di manutenzione: conversazione fra gestione e
 * richiedente e cose da fare. Dati su Supabase (supabase/manutenzioni_pratica.sql),
 * la richiesta resta su SharePoint. Piano: docs/manutenzioni-piano.md.
 */

import { supabase } from '@/lib/core/supabase'
import type {
  LatoPratica,
  MessaggioPratica,
  Pratica,
  RichiestaManutenzione,
  TipoMessaggio,
  VocePratica,
} from '@/types/manutenzioni'

const MAX_TESTO = 4000

function mapMessaggio(r: any): MessaggioPratica {
  return {
    id: r.id,
    lato: r.lato,
    tipo: r.tipo,
    testo: r.testo,
    autoreNome: r.autore_nome || r.autore_email,
    creatoIl: r.creato_il,
    lettoIl: r.letto_il,
  }
}

function mapVoce(r: any): VocePratica {
  return {
    id: r.id,
    testo: r.testo,
    fatta: r.fatta,
    fattaIl: r.fatta_il,
    creataDaLato: r.creata_da_lato,
    creataIl: r.creata_il,
  }
}

export function pulisciTesto(t: unknown): string {
  return typeof t === 'string' ? t.trim().slice(0, MAX_TESTO) : ''
}

/**
 * Legge la pratica e segna come letti i messaggi dell'altra parte: chi apre la
 * finestra li ha visti. `chiLegge` = il lato di chi sta guardando.
 */
export async function leggiPratica(spItemId: string, chiLegge: LatoPratica): Promise<Pratica> {
  const db = supabase()
  const altro: LatoPratica = chiLegge === 'gestione' ? 'richiedente' : 'gestione'
  const [m, v] = await Promise.all([
    db.from('manutenzione_messaggio').select('*').eq('richiesta_sp_id', spItemId).order('creato_il'),
    db.from('manutenzione_voce').select('*').eq('richiesta_sp_id', spItemId).order('creata_il'),
  ])
  if (m.error) throw new Error(m.error.message)
  if (v.error) throw new Error(v.error.message)

  const daSegnare = (m.data ?? []).filter((r: any) => r.lato === altro && !r.letto_il).map((r: any) => r.id)
  if (daSegnare.length) {
    const ora = new Date().toISOString()
    await db.from('manutenzione_messaggio').update({ letto_il: ora }).in('id', daSegnare)
  }
  return { messaggi: (m.data ?? []).map(mapMessaggio), voci: (v.data ?? []).map(mapVoce) }
}

/**
 * Messaggi non ancora letti, per richiesta, scritti dal lato indicato.
 * La gestione vuole sapere quelli del richiedente e viceversa.
 */
export async function nonLettiPerRichiesta(scrittiDa: LatoPratica): Promise<Record<string, number>> {
  const { data, error } = await supabase()
    .from('manutenzione_messaggio')
    .select('richiesta_sp_id')
    .eq('lato', scrittiDa)
    .is('letto_il', null)
  if (error) throw new Error(error.message)
  const conti: Record<string, number> = {}
  for (const r of data ?? []) conti[r.richiesta_sp_id] = (conti[r.richiesta_sp_id] ?? 0) + 1
  return conti
}

export async function scriviMessaggio(opts: {
  richiesta: RichiestaManutenzione
  lato: LatoPratica
  tipo?: TipoMessaggio
  testo: string
  autoreEmail: string
  autoreNome?: string | null
}): Promise<MessaggioPratica> {
  const { data, error } = await supabase()
    .from('manutenzione_messaggio')
    .insert({
      richiesta_sp_id: opts.richiesta.spItemId,
      id_richiesta: opts.richiesta.idRichiesta,
      lato: opts.lato,
      tipo: opts.tipo ?? 'messaggio',
      testo: opts.testo,
      autore_email: opts.autoreEmail,
      autore_nome: opts.autoreNome ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapMessaggio(data)
}

/**
 * Lascia una riga nella conversazione accanto a un'operazione su SharePoint
 * (assegnazione tecnico, chiusura). Non deve mai far fallire l'operazione vera.
 */
export async function annotaInConversazione(opts: Parameters<typeof scriviMessaggio>[0]): Promise<void> {
  try {
    await scriviMessaggio(opts)
  } catch (e) {
    console.error('[manutenzioni/pratica] annotazione non scritta:', e)
  }
}

export async function aggiungiVoce(opts: {
  richiesta: RichiestaManutenzione
  testo: string
  lato: LatoPratica
  email: string
}): Promise<VocePratica> {
  const { data, error } = await supabase()
    .from('manutenzione_voce')
    .insert({
      richiesta_sp_id: opts.richiesta.spItemId,
      id_richiesta: opts.richiesta.idRichiesta,
      testo: opts.testo,
      creata_da: opts.email,
      creata_da_lato: opts.lato,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapVoce(data)
}

/** Le voci si leggono sempre nel perimetro della loro richiesta: un id da solo non basta. */
export async function leggiVoce(spItemId: string, voceId: string): Promise<VocePratica | null> {
  const { data, error } = await supabase()
    .from('manutenzione_voce')
    .select('*')
    .eq('id', voceId)
    .eq('richiesta_sp_id', spItemId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapVoce(data) : null
}

export async function spuntaVoce(spItemId: string, voceId: string, fatta: boolean, email: string): Promise<VocePratica> {
  const { data, error } = await supabase()
    .from('manutenzione_voce')
    .update(fatta
      ? { fatta: true, fatta_il: new Date().toISOString(), fatta_da: email }
      : { fatta: false, fatta_il: null, fatta_da: null })
    .eq('id', voceId)
    .eq('richiesta_sp_id', spItemId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapVoce(data)
}

export async function eliminaVoce(spItemId: string, voceId: string): Promise<void> {
  const { error } = await supabase()
    .from('manutenzione_voce')
    .delete()
    .eq('id', voceId)
    .eq('richiesta_sp_id', spItemId)
  if (error) throw new Error(error.message)
}
