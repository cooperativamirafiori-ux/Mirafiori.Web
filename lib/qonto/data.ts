/**
 * Letture Qonto: conti (con saldo) e movimenti di un conto.
 *
 * Aggancio conto → centro di costo: il codice all'inizio del nome del
 * sottoconto ("cc18 · Condominio Solidale"). È una convenzione scelta apposta
 * il 24/09/2026 (script `provision-qonto-sottoconti.mjs`): il nome dopo il
 * " · " si può cambiare su Qonto senza rompere niente, il codice no. Un conto
 * senza codice e non principale resta visibile solo a chi vede tutto.
 */

import { qontoGet } from './client'
import type { ContoQonto, MovimentoQonto } from '@/types/qonto'

const PREFISSO = /^(cc\d+)\s*·\s*/i

interface QontoBankAccount {
  id: string
  name?: string
  iban?: string
  main?: boolean
  status?: string
  currency?: string
  balance?: number | string | null
  balance_cents?: number | null
  authorized_balance?: number | string | null
  authorized_balance_cents?: number | null
}

/**
 * Importo in euro dai centesimi, o dal valore in euro se i centesimi mancano.
 *
 * ⚠️ `GET /v2/bank_accounts` manda `balance` come STRINGA ("51.0"), mentre
 * `/v2/organization` lo manda come numero (25/09/2026): i centesimi sono
 * l'unico campo coerente, e un intero non ha arrotondamenti.
 */
function importo(cents: number | null | undefined, euro: number | string | null | undefined): number | null {
  if (typeof cents === 'number' && Number.isFinite(cents)) return cents / 100
  const n = typeof euro === 'string' ? Number(euro) : euro
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

interface QontoTransaction {
  id: string
  amount: number | string
  amount_cents?: number
  side: 'credit' | 'debit'
  operation_type: string
  label?: string | null
  clean_counterparty_name?: string | null
  settled_at?: string | null
  emitted_at: string
  status: MovimentoQonto['stato']
  note?: string | null
  reference?: string | null
  attachment_ids?: string[]
  attachment_required?: boolean
  card_last_digits?: string | null
  transfer?: { counterparty_account_number?: string | null } | null
  income?: { counterparty_account_number?: string | null } | null
}

const soloLettere = (x: string) => x.replace(/\s+/g, '').toUpperCase()

function mappaConto(a: QontoBankAccount): ContoQonto {
  const nomeQonto = (a.name ?? '').trim()
  const m = nomeQonto.match(PREFISSO)
  return {
    id: a.id,
    nomeQonto,
    nome: m ? nomeQonto.replace(PREFISSO, '').trim() : nomeQonto || 'Conto',
    iban: a.iban ?? '',
    ccCodice: m ? m[1].toLowerCase() : null,
    principale: Boolean(a.main),
    saldo: importo(a.balance_cents, a.balance),
    saldoDisponibile: importo(a.authorized_balance_cents, a.authorized_balance),
    valuta: a.currency ?? 'EUR',
  }
}

/** Conti attivi: prima il principale, poi i sottoconti in ordine di codice. */
export async function getContiQonto(): Promise<ContoQonto[]> {
  const res = await qontoGet<{ bank_accounts: QontoBankAccount[] }>('/bank_accounts?per_page=100')
  return (res.bank_accounts ?? [])
    .filter((a) => (a.status ?? 'active') !== 'closed')
    .map(mappaConto)
    .sort((a, b) => {
      if (a.principale !== b.principale) return a.principale ? -1 : 1
      const na = Number(a.ccCodice?.slice(2) ?? 9999)
      const nb = Number(b.ccCodice?.slice(2) ?? 9999)
      return na - nb || a.nome.localeCompare(b.nome, 'it')
    })
}

/**
 * Ultimi movimenti di un conto, compresi quelli in attesa (una spesa con
 * carta appena fatta è "pending" per qualche giorno: se non la mostrassimo,
 * il coordinatore non capirebbe perché il disponibile è sceso).
 * Ordinati per data di emissione: i pending non hanno ancora una data di
 * contabilizzazione e con l'ordinamento di default finirebbero in fondo.
 */
export async function getMovimentiQonto(
  contoId: string,
  /** Tutti i conti nostri: servono a riconoscere i giroconti dall'IBAN della controparte. */
  contiNostri: ContoQonto[] = [],
  quanti = 30,
): Promise<MovimentoQonto[]> {
  const q = new URLSearchParams({
    bank_account_id: contoId,
    per_page: String(quanti),
    sort_by: 'emitted_at:desc',
  })
  q.append('status[]', 'pending')
  q.append('status[]', 'completed')
  const res = await qontoGet<{ transactions: QontoTransaction[] }>(`/transactions?${q.toString()}`)
  const perIban = new Map(contiNostri.filter((c) => c.iban).map((c) => [soloLettere(c.iban), c]))

  return (res.transactions ?? []).map((t) => {
    const entrata = t.side === 'credit'
    const ibanControparte = soloLettere(t.transfer?.counterparty_account_number ?? t.income?.counterparty_account_number ?? '')
    const contoNostro = ibanControparte ? perIban.get(ibanControparte) : undefined
    const nome = (t.clean_counterparty_name || t.label || '—').trim()
    // Ripiego se Qonto non porta l'IBAN: la controparte è la cooperativa stessa.
    const giroconto = Boolean(contoNostro) || /cooperativa sociale mirafiori/i.test(nome)
    const controparte = giroconto
      ? `Giroconto ${entrata ? 'da' : 'verso'} ${contoNostro?.nome ?? 'un altro conto della cooperativa'}`
      : nome
    return {
      id: t.id,
      data: t.settled_at ?? t.emitted_at,
      controparte,
      importo: (entrata ? 1 : -1) * Math.abs(importo(t.amount_cents, t.amount) ?? 0),
      stato: t.status,
      tipo: t.operation_type,
      nota: t.note ?? null,
      riferimento: t.reference ?? null,
      conAllegato: (t.attachment_ids?.length ?? 0) > 0,
      // Lo scontrino si chiede solo per le spese vere: Qonto lo segna come
      // "richiesto" anche sulle ricariche e sulle entrate, dove non esiste.
      allegatoObbligatorio: Boolean(t.attachment_required) && !entrata && !giroconto,
      carta: t.card_last_digits ?? null,
      giroconto,
    }
  })
}
