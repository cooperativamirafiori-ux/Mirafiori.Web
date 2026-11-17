/**
 * Amazon pagato con carta Qonto (Dennis, 17/11/2026).
 *
 * Amazon fa una fattura sola per tanti prodotti, e spesso più fatture per una
 * spesa: abbinarle ai movimenti in automatico non torna. Quindi, per le spese
 * con CARTA dal 1/11/2026:
 *  - il costo nel cruscotto lo dà il movimento Qonto, sul centro di costo del
 *    sottoconto (stima IVA esclusa al 22%: vedi supabase/amazon_carta.sql);
 *  - la fattura Amazon nasce pagata, non conta come costo, e va nella scheda
 *    «Amazon» di Flussi fatture: Claudia la abbina a un movimento o la chiude;
 *  - l'abbinamento automatico non tocca i movimenti Amazon con carta.
 * Le fatture Amazon Business a BONIFICO (MP05, «Pagamento in fattura») sono
 * debiti veri: restano in coda Da pagare come tutte le altre.
 *
 * Le stesse regole di riconoscimento stanno in supabase/amazon_carta.sql.
 */

import { supabase } from '@/lib/core/supabase'

type Db = ReturnType<typeof supabase>

/** Fornitore Amazon in fattura («Amazon EU S.a r.l.», «Amazon Business EU…»). */
export const eFornitoreAmazon = (fornitore: string | null | undefined) => /amazon/i.test(fornitore ?? '')

/** Spesa Amazon con carta su Qonto («AMZN Mktp IT», «Amazon.it»…). */
export const eMovimentoAmazon = (m: { tipo: string | null; controparte: string | null; etichetta: string | null }) =>
  m.tipo === 'card' && /amzn|amazon/i.test(`${m.controparte ?? ''} ${m.etichetta ?? ''}`)

/**
 * Le fatture Amazon con carta dal 1/11 che non sono ancora nella scheda
 * Amazon (importate prima di questa regola, o da una versione vecchia
 * dell'import): ci vanno, e se erano in coda diventano pagate — con la carta
 * lo erano già. Idempotente: gira a ogni riconciliazione.
 */
export async function sistemaFattureAmazon(db: Db = supabase()): Promise<number> {
  const { data, error } = await db
    .from('scadenza')
    .select('id, stato, fattura_passiva!inner ( fornitore, data_fornitore )')
    .is('amazon', null)
    .eq('famiglia_modalita', 'negozio')
    .gt('importo', 0)
    .ilike('fattura_passiva.fornitore', '%amazon%')
    .gte('fattura_passiva.data_fornitore', '2026-11-01')
    .limit(500)
  if (error) throw new Error(`Lettura fatture Amazon: ${error.message}`)
  const adesso = new Date().toISOString()
  let fatte = 0
  for (const r of (data ?? []) as unknown as Array<{ id: string; stato: string; fattura_passiva: { data_fornitore: string | null } }>) {
    const inCoda = ['da_pagare', 'da_approvare', 'da_verificare'].includes(r.stato)
    const { data: ok } = await db
      .from('scadenza')
      .update({
        amazon: 'aperta',
        alert: null,
        ...(inCoda
          ? {
              stato: 'pagata',
              data_pagamento: r.fattura_passiva.data_fornitore,
              pagata_da: 'carta Amazon (scheda Amazon)',
              pagata_il: adesso,
              origine_pagamento: 'app',
            }
          : {}),
      })
      .eq('id', r.id)
      .eq('stato', r.stato)
      .is('amazon', null)
      .select('id')
    fatte += ok?.length ?? 0
  }
  return fatte
}

export interface FatturaAmazon {
  id: string
  fornitore: string
  numero: string | null
  dataFattura: string | null
  importo: number
  cc: string | null
  ccIndicato: string | null
}

const CAMPI = `id, importo, data_scadenza,
  fattura_passiva!inner ( fornitore, numero_fornitore, data_fornitore, cc_codice, cc_indicato )`

const aFattura = (r: any): FatturaAmazon => ({
  id: r.id,
  fornitore: r.fattura_passiva.fornitore,
  numero: r.fattura_passiva.numero_fornitore ?? null,
  dataFattura: r.fattura_passiva.data_fornitore ?? r.data_scadenza ?? null,
  importo: Number(r.importo),
  cc: r.fattura_passiva.cc_codice ?? null,
  ccIndicato: r.fattura_passiva.cc_indicato ?? null,
})

/** Fatture Amazon con carta ancora da sistemare: né abbinate a un movimento né chiuse. */
export async function fattureAmazonAperte(db: Db = supabase()): Promise<FatturaAmazon[]> {
  const { data, error } = await db
    .from('scadenza')
    .select(CAMPI)
    .eq('amazon', 'aperta')
    .is('qonto_movimento_id', null)
    .order('data_scadenza', { ascending: false })
    .limit(500)
  if (error) throw new Error(`Lettura fatture Amazon: ${error.message}`)
  return (data ?? []).map(aFattura)
}

export async function contaAmazon(): Promise<number | null> {
  const db = supabase()
  const [f, m] = await Promise.all([
    db.from('scadenza').select('id', { count: 'exact', head: true }).eq('amazon', 'aperta').is('qonto_movimento_id', null),
    db.from('qonto_movimento').select('id', { count: 'exact', head: true }).eq('amazon', true).eq('abbinamento', 'da_abbinare'),
  ])
  if (f.error || m.error) return null
  return (f.count ?? 0) + (m.count ?? 0)
}

/** Claudia chiude a mano una fattura Amazon (il costo è già registrato dal movimento). Chi l'ha fatto resta nel log attività. */
export async function chiudiFatturaAmazon(scadenzaId: string) {
  const db = supabase()
  const { data, error } = await db
    .from('scadenza')
    .update({ amazon: 'chiusa' })
    .eq('id', scadenzaId)
    .eq('amazon', 'aperta')
    .is('qonto_movimento_id', null)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Questa fattura è già stata sistemata')
  return { chiusa: true }
}

/** Torna nella scheda Amazon una fattura chiusa per sbaglio. */
export async function riapriFatturaAmazon(scadenzaId: string) {
  const db = supabase()
  const { data, error } = await db
    .from('scadenza')
    .update({ amazon: 'aperta' })
    .eq('id', scadenzaId)
    .eq('amazon', 'chiusa')
    .select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Questa fattura non è chiusa')
  return { riaperta: true }
}

/** Le fatture Amazon chiuse a mano negli ultimi 30 giorni (per poterle riaprire). */
export async function fattureAmazonChiuse(db: Db = supabase()): Promise<FatturaAmazon[]> {
  const { data, error } = await db
    .from('scadenza')
    .select(CAMPI)
    .eq('amazon', 'chiusa')
    .gte('data_scadenza', new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10))
    .order('data_scadenza', { ascending: false })
    .limit(200)
  if (error) throw new Error(`Lettura fatture Amazon: ${error.message}`)
  return (data ?? []).map(aFattura)
}
