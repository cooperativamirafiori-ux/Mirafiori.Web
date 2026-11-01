/** Mail dell'area Manutenzioni. */

import { sendEmail, ADMIN_EMAIL, BOX, BTN } from '@/lib/core/mailer'
import type { Struttura, Tecnico } from '@/types/manutenzioni'

const APP = () => (process.env.APP_BASE_URL || 'https://mirafiori-web.vercel.app').replace(/\/+$/, '')

/**
 * Chi riceve le risposte dei richiedenti: chi gestisce le manutenzioni, non la
 * casella di sistema (31 ott 2026, decisione di Dennis).
 */
const GESTIONE_MAIL_TO = () =>
  (process.env.MANUTENZIONI_MAIL_TO || 'dennis.maseri@cooperativamirafiori.com')
    .split(/[;,]/).map((s) => s.trim()).filter(Boolean)

/** Il testo scritto da una persona finisce in HTML: va neutralizzato. */
function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const CITAZIONE = (testo: string) =>
  `<p style="margin:12px 0;padding:10px 12px;background:#f6f7f9;border-left:3px solid #c9ced6;white-space:pre-line">${esc(testo)}</p>`

// ============================================================
// Pratica — presa in carico e conversazione (31 ott 2026)
// ============================================================

/** La gestione ha visto la richiesta: al richiedente, senza tecnico. */
export async function notificaPresaInCarico(opts: {
  spItemId: string
  idRichiesta: string
  struttura: string
  richiedenteEmail: string
  richiedenteNome: string
  nota: string
  lungoCorso: boolean
  previsione?: string
}): Promise<void> {
  const tempi = opts.lungoCorso
    ? `<p>È un lavoro che richiede tempo${opts.previsione ? `: la previsione è <strong>${esc(opts.previsione)}</strong>` : ''}. Ti aggiorneremo nella richiesta.</p>`
    : ''
  await sendEmail({
    to: opts.richiedenteEmail,
    subject: `Richiesta ${opts.idRichiesta} — Presa in carico`,
    html: BOX(`
      <p>Ciao ${esc(opts.richiedenteNome)},</p>
      <p>abbiamo visto la tua richiesta <strong>${opts.idRichiesta}</strong> (${esc(opts.struttura)}) e l'abbiamo presa in carico.</p>
      ${CITAZIONE(opts.nota)}
      ${tempi}
      <p>Puoi rispondere dalla richiesta, nell'app:</p>
      ${BTN(`${APP()}/mie-richieste?r=${encodeURIComponent(opts.spItemId)}`, 'Apri la richiesta', '#1f4e79')}
    `),
  })
}

/**
 * Nuovo messaggio nella conversazione. Se scrive la gestione la mail va al
 * richiedente, se scrive il richiedente va alla gestione.
 */
export async function notificaNuovoMessaggio(opts: {
  spItemId: string
  idRichiesta: string
  struttura: string
  daGestione: boolean
  autoreNome: string
  richiedenteEmail: string
  testo: string
}): Promise<void> {
  const link = opts.daGestione
    ? `${APP()}/mie-richieste?r=${encodeURIComponent(opts.spItemId)}`
    : `${APP()}/dashboard?r=${encodeURIComponent(opts.spItemId)}`
  await sendEmail({
    to: opts.daGestione ? opts.richiedenteEmail : GESTIONE_MAIL_TO(),
    subject: `Richiesta ${opts.idRichiesta} — Nuovo messaggio`,
    html: BOX(`
      <p>Hai un nuovo messaggio sulla richiesta <strong>${opts.idRichiesta}</strong> (${esc(opts.struttura)}) da <strong>${esc(opts.autoreNome)}</strong>:</p>
      ${CITAZIONE(opts.testo.length > 800 ? `${opts.testo.slice(0, 800)}…` : opts.testo)}
      ${BTN(link, 'Rispondi nella richiesta', '#1f4e79')}
    `),
  })
}

export async function notificaNuovaRichiesta(opts: {
  idRichiesta: string
  struttura: string
  richiedente: string
  tipoIntervento: string
  priorita: string
  descrizione: string
  isUrgente: boolean
}): Promise<void> {
  const subject = opts.isUrgente
    ? `[URGENTE] ${opts.idRichiesta} - ${opts.struttura}`
    : `Nuova richiesta ${opts.idRichiesta} - ${opts.struttura}`

  await sendEmail({
    to: ADMIN_EMAIL,
    subject,
    html: `
      <p><strong>Nuova richiesta di manutenzione</strong></p>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#555">ID</td><td><strong>${opts.idRichiesta}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Struttura</td><td>${opts.struttura}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Richiedente</td><td>${opts.richiedente}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Tipo</td><td>${opts.tipoIntervento}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Priorità</td><td>${opts.priorita}</td></tr>
      </table>
      <p style="margin-top:12px;color:#333">${opts.descrizione}</p>
    `,
  })
}

// ============================================================
// Flusso 2B — Tecnico assegnato → richiedente
// ============================================================

export async function notificaTecnicoAssegnato(opts: {
  idRichiesta: string
  richiedenteEmail: string
  richiedenteNome: string
  tecnicoNome: string
  tecnicoTelefono: string
  note?: string
}): Promise<void> {
  await sendEmail({
    to: opts.richiedenteEmail,
    subject: `Richiesta ${opts.idRichiesta} — Tecnico assegnato`,
    html: `
      <p>Ciao ${opts.richiedenteNome},</p>
      <p>la tua richiesta <strong>${opts.idRichiesta}</strong> è stata presa in carico.</p>
      <p>È stato assegnato il tecnico: <strong>${opts.tecnicoNome}</strong></p>
      ${opts.tecnicoTelefono ? `<p>📞 Telefono: ${opts.tecnicoTelefono}</p>` : ''}
      ${opts.note ? `<p style="margin-top:12px;padding:10px;background:#f9f9f9;border-left:3px solid #ccc;"><strong>Note dal responsabile:</strong><br>${opts.note.replace(/\n/g, '<br>')}</p>` : ''}
      <p>Puoi contattare il tecnico per concordare giorno e orario dell'intervento.</p>
    `,
  })
}

// ============================================================
// Flusso 2C — Richiesta chiusa → admin + richiedente
// ============================================================

export async function notificaChiusuraTicket(opts: {
  idRichiesta: string
  struttura: string
  importoTotale: number
  tecnicoNome: string
  richiedenteEmail: string
  richiedenteNome: string
}): Promise<void> {
  // Admin
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `Chiusa ${opts.idRichiesta} - ${opts.struttura}`,
    html: `
      <p>✅ <strong>Richiesta completata:</strong> ${opts.idRichiesta}</p>
      <p>Struttura: ${opts.struttura} | Tecnico: ${opts.tecnicoNome} | Importo totale: <strong>€${opts.importoTotale.toFixed(2)}</strong></p>
    `,
  })

  // Richiedente
  await sendEmail({
    to: opts.richiedenteEmail,
    subject: `Richiesta ${opts.idRichiesta} — Completata`,
    html: `
      <p>Ciao ${opts.richiedenteNome},</p>
      <p>la tua richiesta <strong>${opts.idRichiesta}</strong> è stata completata.</p>
      <p>Struttura: ${opts.struttura}</p>
    `,
  })
}


// ============================================================
// Timbrature — flusso di validazione mensile
//
// Quattro momenti, quattro toni diversi:
//   1. la giornata sta per uscire dalla finestra   → allarme al dipendente
//   2. il mese e' passato al responsabile           → richiesta al responsabile
//   3. il foglio e' validato                        → PDF + conferma al dipendente
//   4. il dipendente contesta                       → ritorno al responsabile
// ============================================================
