/**
 * Eventi sul calendario Outlook via Microsoft Graph (Calendars API).
 *
 * Scrive l'evento DIRETTAMENTE sul calendario dell'account indicato
 * (POST /users/{email}/events, senza invitati) → nessun invito, l'appuntamento
 * compare e basta. Per più calendari si crea un evento per ciascuno.
 *
 * Permesso app necessario (Azure → App registration → API permissions):
 *   Calendars.ReadWrite (Application)  ← da concedere con consenso amministratore
 *
 * Finché il permesso non è concesso, le chiamate falliscono: chi le invoca
 * (lib/software.ts) le tratta come best-effort e NON blocca il salvataggio.
 */

import { graphPost, graphPatch, graphDelete } from '@/lib/core/graph'

const TIMEZONE = 'Europe/Rome'
// Promemoria Outlook: 20 giorni prima della scadenza
const REMINDER_MINUTI = 20 * 24 * 60

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** "a@x.it, b@y.it" → ['a@x.it','b@y.it'] (lowercase, dedup, solo email valide) */
export function parseEmails(s?: string): string[] {
  const list = (s ?? '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL_RE.test(e))
  return Array.from(new Set(list))
}

function euro(n?: number): string {
  return n == null
    ? '—'
    : `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** giorno successivo in formato YYYY-MM-DD (end esclusivo per eventi all-day) */
function giornoDopo(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export interface DatiEventoSoftware {
  servizio: string
  scadenza: string // YYYY-MM-DD
  costo?: number
  periodicita?: string
  referente?: string
  cartaPagamento?: string
  rinnovoAutomatico?: boolean
}

/** Costruisce il payload Graph di un evento all-day di scadenza */
export function buildEventoScadenza(d: DatiEventoSoftware): Record<string, unknown> {
  const giorno = d.scadenza.slice(0, 10)
  const rinnovo = d.rinnovoAutomatico ? 'Sì' : 'No'
  return {
    subject: `🔔 Scadenza software — ${d.servizio}`,
    isAllDay: true,
    start: { dateTime: `${giorno}T00:00:00.0000000`, timeZone: TIMEZONE },
    end: { dateTime: `${giornoDopo(giorno)}T00:00:00.0000000`, timeZone: TIMEZONE },
    isReminderOn: true,
    reminderMinutesBeforeStart: REMINDER_MINUTI,
    categories: ['Scadenza software'],
    body: {
      contentType: 'HTML',
      content: `
        <p><strong>${d.servizio}</strong> — scadenza abbonamento.</p>
        <ul>
          <li>Costo: <strong>${euro(d.costo)}</strong>${d.periodicita ? ` · ${d.periodicita}` : ''}</li>
          <li>Rinnovo automatico: <strong>${rinnovo}</strong></li>
          ${d.referente ? `<li>In uso a: ${d.referente}</li>` : ''}
          ${d.cartaPagamento ? `<li>Carta: ${d.cartaPagamento}</li>` : ''}
        </ul>
        <p style="color:#666">Evento generato automaticamente dalla sezione Gestione Software.</p>
      `,
    },
  }
}

/** Crea l'evento sul calendario dell'account → ritorna l'ID evento */
export async function creaEvento(email: string, payload: Record<string, unknown>): Promise<string> {
  const res = await graphPost<{ id: string }>(`/users/${encodeURIComponent(email)}/events`, payload)
  return res.id
}

/** Aggiorna un evento esistente */
export async function aggiornaEvento(
  email: string,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await graphPatch(`/users/${encodeURIComponent(email)}/events/${eventId}`, payload)
}

/** Elimina un evento (ignora 404) */
export async function eliminaEvento(email: string, eventId: string): Promise<void> {
  await graphDelete(`/users/${encodeURIComponent(email)}/events/${eventId}`)
}
