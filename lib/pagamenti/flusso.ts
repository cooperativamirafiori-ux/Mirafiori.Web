/**
 * Le due sole transizioni che passano da una persona: APPROVA e PAGATA.
 *
 * Tutto il resto lo decide la modalità di pagamento al momento dell'import
 * (vedi `statoIniziale` in import.ts). Qui ogni passaggio scrive **chi e
 * quando**: è la tracciabilità che oggi manca, ed è la ragione per cui una
 * decisione presa e una dimenticanza sono indistinguibili.
 *
 * Entrambe le azioni accettano più righe insieme. Non è una comodità: chi
 * paga sette fatture allo stesso fornitore con un bonifico solo, dovendo
 * cliccare sette volte, la settima volta sbaglia riga.
 */

import { supabase } from '@/lib/core/supabase'
import type { StatoScadenza } from '@/types/pagamenti'

export interface Esito {
  aggiornate: number
  /** Righe non toccate e perché: si dicono, non si ignorano. */
  ignorate: Array<{ id: string; motivo: string }>
}

async function stati(ids: string[]): Promise<Map<string, StatoScadenza>> {
  const { data, error } = await supabase().from('scadenza').select('id, stato').in('id', ids)
  if (error) throw new Error(`Lettura stato: ${error.message}`)
  return new Map((data ?? []).map((r) => [r.id as string, r.stato as StatoScadenza]))
}

/**
 * APPROVA: la scadenza passa nella coda di chi paga.
 *
 * Non esiste il gesto opposto. Non approvare **è** la decisione, ed è quella
 * che si prende quando non c'è liquidità; il silenzio resta visibile perché
 * ogni riga porta i giorni di attesa e le più vecchie stanno in cima.
 */
export async function approva(ids: string[], utente: string): Promise<Esito> {
  if (ids.length === 0) return { aggiornate: 0, ignorate: [] }
  const correnti = await stati(ids)
  const ignorate: Esito['ignorate'] = []
  const ok: string[] = []
  for (const id of ids) {
    const s = correnti.get(id)
    if (!s) ignorate.push({ id, motivo: 'scadenza non trovata' })
    else if (s === 'da_approvare') ok.push(id)
    else if (s === 'da_pagare') ignorate.push({ id, motivo: 'già approvata' })
    else ignorate.push({ id, motivo: `non è in approvazione (stato: ${s})` })
  }
  if (ok.length > 0) {
    const { error } = await supabase()
      .from('scadenza')
      .update({ stato: 'da_pagare', approvata_da: utente, approvata_il: new Date().toISOString() })
      .in('id', ok)
    if (error) throw new Error(`Approvazione: ${error.message}`)
  }
  return { aggiornate: ok.length, ignorate }
}

/**
 * PAGATA: chiude la scadenza.
 *
 * La data è modificabile — si può cliccare il martedì per un bonifico partito
 * il venerdì — perché una data finta rende finta anche la previsione di cassa.
 * Questo clic è **l'unica fonte di verità sul pagato** finché non arriva
 * l'estratto conto; il campo si chiama `data_pagamento` fin da ora, così
 * quando l'import bancario arriverà non cambierà niente nello schema.
 */
export async function segnaPagate(
  ids: string[],
  dataPagamento: string,
  utente: string,
): Promise<Esito> {
  if (ids.length === 0) return { aggiornate: 0, ignorate: [] }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
    throw new Error('Data di pagamento non valida')
  }
  const correnti = await stati(ids)
  const ignorate: Esito['ignorate'] = []
  const ok: string[] = []
  for (const id of ids) {
    const s = correnti.get(id)
    if (!s) ignorate.push({ id, motivo: 'scadenza non trovata' })
    else if (s === 'da_pagare') ok.push(id)
    else if (s === 'pagata') ignorate.push({ id, motivo: 'già registrata come pagata' })
    else if (s === 'da_approvare')
      ignorate.push({ id, motivo: 'sopra soglia: manca l’approvazione' })
    else ignorate.push({ id, motivo: `non è da pagare (stato: ${s})` })
  }
  if (ok.length > 0) {
    const { error } = await supabase()
      .from('scadenza')
      .update({
        stato: 'pagata',
        data_pagamento: dataPagamento,
        pagata_da: utente,
        pagata_il: new Date().toISOString(),
      })
      .in('id', ok)
    if (error) throw new Error(`Registrazione pagamento: ${error.message}`)
  }
  return { aggiornate: ok.length, ignorate }
}

/**
 * Annulla un pagamento registrato per sbaglio.
 *
 * Il clic dev'essere reversibile: chi sbaglia riga deve poter tornare indietro
 * da solo, senza chiedere aiuto a nessuno. Torna in coda dalla parte giusta —
 * se era stata approvata resta approvata, altrimenti la soglia decide di nuovo.
 */
export async function annullaPagamento(ids: string[]): Promise<Esito> {
  if (ids.length === 0) return { aggiornate: 0, ignorate: [] }
  const { data, error } = await supabase()
    .from('scadenza')
    .select('id, stato, importo, soglia_applicata, approvata_il')
    .in('id', ids)
  if (error) throw new Error(`Lettura scadenze: ${error.message}`)

  const ignorate: Esito['ignorate'] = []
  let aggiornate = 0
  for (const r of (data ?? []) as Array<{
    id: string
    stato: StatoScadenza
    importo: number | string
    soglia_applicata: number | string | null
    approvata_il: string | null
  }>) {
    if (r.stato !== 'pagata') {
      ignorate.push({ id: r.id, motivo: 'non risulta pagata' })
      continue
    }
    const soglia = Number(r.soglia_applicata ?? 0)
    const tornaIn: StatoScadenza =
      r.approvata_il || soglia <= 0 || Number(r.importo) <= soglia ? 'da_pagare' : 'da_approvare'
    const { error: eUp } = await supabase()
      .from('scadenza')
      .update({ stato: tornaIn, data_pagamento: null, pagata_da: null, pagata_il: null })
      .eq('id', r.id)
    if (eUp) throw new Error(`Annullamento pagamento: ${eUp.message}`)
    aggiornate++
  }
  return { aggiornate, ignorate }
}
