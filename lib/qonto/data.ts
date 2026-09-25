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
  balance?: number | null
  authorized_balance?: number | null
}

interface QontoTransaction {
  id: string
  amount: number
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
}

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
    saldo: typeof a.balance === 'number' ? a.balance : null,
    saldoDisponibile: typeof a.authorized_balance === 'number' ? a.authorized_balance : null,
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
export async function getMovimentiQonto(contoId: string, quanti = 30): Promise<MovimentoQonto[]> {
  const q = new URLSearchParams({
    bank_account_id: contoId,
    per_page: String(quanti),
    sort_by: 'emitted_at:desc',
  })
  q.append('status[]', 'pending')
  q.append('status[]', 'completed')
  const res = await qontoGet<{ transactions: QontoTransaction[] }>(`/transactions?${q.toString()}`)
  return (res.transactions ?? []).map((t) => ({
    id: t.id,
    data: t.settled_at ?? t.emitted_at,
    controparte: (t.clean_counterparty_name || t.label || '—').trim(),
    importo: t.side === 'debit' ? -Math.abs(t.amount) : Math.abs(t.amount),
    stato: t.status,
    tipo: t.operation_type,
    nota: t.note ?? null,
    riferimento: t.reference ?? null,
    conAllegato: (t.attachment_ids?.length ?? 0) > 0,
    allegatoObbligatorio: Boolean(t.attachment_required),
    carta: t.card_last_digits ?? null,
  }))
}
