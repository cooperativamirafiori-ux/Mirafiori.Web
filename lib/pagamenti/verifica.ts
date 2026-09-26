/**
 * Le righe "da verificare" e l'IBAN dei fornitori.
 *
 * Una riga è da verificare quando nessuno sa ancora se va pagata:
 *  - senza_modalita: l'XML non dice come si paga (scontrini fatti fattura, ma
 *    anche parcelle di professionisti: non si indovina)
 *  - primo_import: bonifico già scaduto al primo import dagli XML, che può
 *    essere stato pagato fuori dall'app
 *
 * ⚠️ La regola sopra tutte: una fattura già pagata non deve mai finire in una
 * coda di pagamento. Per questo da qui si esce solo con una risposta esplicita
 * di una persona, e ogni risposta scrive chi e quando.
 */

import { supabase } from '@/lib/core/supabase'
import { sogliaApprovazione } from '@/lib/pagamenti/import'
import type { EsitoVerifica, StatoScadenza } from '@/types/pagamenti'
import type { Esito } from './flusso'

interface RigaVerifica {
  id: string
  stato: StatoScadenza
  importo: number | string
  data_scadenza: string
  motivo_verifica: string | null
  fattura_passiva: { piva: string | null; fornitore: string; data_fornitore: string | null } | null
}

async function leggi(ids: string[]): Promise<RigaVerifica[]> {
  const { data, error } = await supabase()
    .from('scadenza')
    .select('id, stato, importo, data_scadenza, motivo_verifica, fattura_passiva ( piva, fornitore, data_fornitore )')
    .in('id', ids)
  if (error) throw new Error(`Lettura scadenze: ${error.message}`)
  return (data ?? []) as unknown as RigaVerifica[]
}

/**
 * Risponde a una o più righe da verificare.
 *
 * `imparati`: le P.IVA dei fornitori che da ora in poi "si pagano al momento"
 * (solo con esito negozio). L'interfaccia le rimanda indietro se si annulla.
 */
export async function verifica(
  ids: string[],
  esito: EsitoVerifica,
  utente: string,
  dataPagamento?: string,
): Promise<Esito & { imparati: string[] }> {
  if (ids.length === 0) return { aggiornate: 0, ignorate: [], imparati: [] }
  if (esito === 'gia_pagata' && !/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento ?? '')) {
    throw new Error('Data di pagamento non valida')
  }
  const righe = await leggi(ids)
  const trovate = new Set(righe.map((r) => r.id))
  const ignorate: Esito['ignorate'] = ids.filter((id) => !trovate.has(id)).map((id) => ({ id, motivo: 'scadenza non trovata' }))
  const ok = righe.filter((r) => {
    if (r.stato === 'da_verificare') return true
    ignorate.push({ id: r.id, motivo: `non è da verificare (stato: ${r.stato})` })
    return false
  })

  const ora = new Date().toISOString()
  const soglia = esito === 'da_pagare' ? (await sogliaApprovazione()).valore : 0

  for (const r of ok) {
    let modifica: Record<string, unknown>
    if (esito === 'da_pagare') {
      modifica = { stato: Number(r.importo) > soglia ? 'da_approvare' : 'da_pagare', soglia_applicata: soglia }
    } else {
      // In negozio si paga il giorno della fattura; "già pagata" ha la sua data.
      const data = esito === 'negozio' ? (r.fattura_passiva?.data_fornitore ?? r.data_scadenza) : dataPagamento
      modifica = { stato: 'pagata', data_pagamento: data, pagata_da: utente, pagata_il: ora, origine_pagamento: 'app' }
    }
    const { error } = await supabase().from('scadenza').update(modifica).eq('id', r.id).eq('stato', 'da_verificare')
    if (error) throw new Error(`Verifica: ${error.message}`)
  }

  // L'app impara: i fornitori delle fatture senza modalità "pagate in negozio".
  const imparati: string[] = []
  if (esito === 'negozio') {
    const pive = new Map<string, string>()
    for (const r of ok) {
      const f = r.fattura_passiva
      if (r.motivo_verifica === 'senza_modalita' && f?.piva) pive.set(f.piva, f.fornitore)
    }
    for (const [piva, denominazione] of pive) {
      const { data: prima } = await supabase().from('fornitore').select('paga_al_momento').eq('piva', piva).maybeSingle()
      if (prima?.paga_al_momento) continue
      const { error } = await supabase().from('fornitore').upsert(
        { piva, denominazione, paga_al_momento: true, paga_al_momento_da: utente, paga_al_momento_il: ora, aggiornato_il: ora },
        { onConflict: 'piva' },
      )
      if (error) throw new Error(`Fornitore ${denominazione}: ${error.message}`)
      imparati.push(piva)
    }
  }
  return { aggiornate: ok.length, ignorate, imparati }
}

/**
 * Annulla una risposta data per sbaglio: la riga torna "da verificare".
 * Vale solo sulle righe che sono passate da lì (motivo_verifica valorizzato)
 * e non sono state approvate nel frattempo.
 */
export async function riapriVerifica(ids: string[], pive: string[], utente: string): Promise<Esito> {
  if (ids.length === 0) return { aggiornate: 0, ignorate: [] }
  const righe = await leggi(ids)
  const ignorate: Esito['ignorate'] = []
  const ok: string[] = []
  for (const r of righe) {
    if (!r.motivo_verifica) ignorate.push({ id: r.id, motivo: 'non è mai stata da verificare' })
    else if (!['pagata', 'da_pagare', 'da_approvare'].includes(r.stato)) ignorate.push({ id: r.id, motivo: `stato ${r.stato}` })
    else ok.push(r.id)
  }
  if (ok.length) {
    const { error } = await supabase()
      .from('scadenza')
      .update({ stato: 'da_verificare', data_pagamento: null, pagata_da: null, pagata_il: null, origine_pagamento: null, approvata_da: null, approvata_il: null })
      .in('id', ok)
      .is('approvata_il', null)
    if (error) throw new Error(`Annullamento: ${error.message}`)
  }
  if (pive.length) {
    await supabase()
      .from('fornitore')
      .update({ paga_al_momento: false, paga_al_momento_da: null, paga_al_momento_il: null, aggiornato_il: new Date().toISOString() })
      .in('piva', pive)
      .eq('paga_al_momento_da', utente)
  }
  return { aggiornate: ok.length, ignorate }
}

// ------------------------------------------------------------
// IBAN
// ------------------------------------------------------------

/** Toglie spazi, maiuscolo. */
export const normIban = (s: string) => s.replace(/\s+/g, '').toUpperCase()

/** Controllo ISO 13616 (mod 97). Non dice che l'IBAN è del fornitore: dice che non è scritto male. */
export function ibanValido(s: string): boolean {
  const iban = normIban(s)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  if (iban.startsWith('IT') && iban.length !== 27) return false
  const riordinato = iban.slice(4) + iban.slice(0, 4)
  let resto = 0
  for (const c of riordinato) {
    const v = /\d/.test(c) ? c : String(c.charCodeAt(0) - 55)
    for (const d of v) resto = (resto * 10 + Number(d)) % 97
  }
  return resto === 1
}

/**
 * Conferma l'IBAN di un fornitore (scritto a mano o preso dalla fattura) e
 * toglie il blocco dalle sue scadenze non ancora pagate.
 *
 * ⚠️ Confermare un IBAN cambiato è il gesto che la truffa vuole ottenere:
 * l'interfaccia chiede di averlo verificato al telefono, con un numero preso
 * altrove e non dalla fattura.
 */
export async function confermaIban(piva: string, ibanGrezzo: string, utente: string): Promise<{ sbloccate: number }> {
  const iban = normIban(ibanGrezzo)
  if (!ibanValido(iban)) throw new Error('IBAN non valido: controlla le cifre')

  const { data: fatture, error: eF } = await supabase().from('fattura_passiva').select('id, fornitore').eq('piva', piva).limit(2000)
  if (eF) throw new Error(`Lettura fatture: ${eF.message}`)
  if (!fatture?.length) throw new Error('Nessuna fattura di questo fornitore')

  const ora = new Date().toISOString()
  const { data: prima } = await supabase().from('fornitore').select('iban').eq('piva', piva).maybeSingle()
  const { error: eU } = await supabase().from('fornitore').upsert(
    {
      piva,
      denominazione: fatture[0].fornitore,
      iban,
      iban_fonte: prima?.iban === iban ? 'fattura' : 'manuale',
      iban_confermato_da: utente,
      iban_confermato_il: ora,
      aggiornato_il: ora,
    },
    { onConflict: 'piva' },
  )
  if (eU) throw new Error(`Salvataggio IBAN: ${eU.message}`)

  const { data: sbloccate, error: eS } = await supabase()
    .from('scadenza')
    .update({ iban, blocco: null })
    .in('fattura_passiva_id', fatture.map((f) => f.id))
    .not('blocco', 'is', null)
    .in('stato', ['da_verificare', 'da_approvare', 'da_pagare'])
    .select('id')
  if (eS) throw new Error(`Sblocco scadenze: ${eS.message}`)
  return { sbloccate: sbloccate?.length ?? 0 }
}
