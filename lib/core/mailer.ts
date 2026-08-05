/**
 * Spedizione email via Microsoft Graph (Mail.Send, permesso applicativo) e
 * mattoncini HTML condivisi.
 *
 * Qui sta il **come** si spedisce. Il **cosa** — i testi delle notifiche — sta
 * in lib/<area>/notifiche.ts, così ogni area possiede le proprie mail.
 */

import { graphPost } from '@/lib/core/graph'

/**
 * Casella di sistema: mittente di default (acquisti, manutenzioni) e
 * destinatario degli avvisi admin delle manutenzioni.
 */
export const ADMIN_EMAIL = process.env.MAIL_SENDER_EMAIL!

export interface EmailAttachment {
  filename: string
  contentBase64: string
  contentType: string
}

export async function sendEmail(opts: {
  to: string | string[]
  subject: string
  html: string
  attachments?: EmailAttachment[]
  /** Casella mittente (send-as). Default: MAIL_SENDER_EMAIL (casella di sistema). */
  from?: string
}): Promise<void> {
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter((a) => a?.includes('@'))
  if (!recipients.length) {
    console.warn('[notifications] sendEmail: nessun destinatario valido, skip →', JSON.stringify(opts.to))
    return
  }
  const sender = opts.from?.includes('@') ? opts.from : ADMIN_EMAIL
  try {
    const message: Record<string, unknown> = {
      subject: opts.subject,
      body: { contentType: 'HTML', content: opts.html },
      toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
    }
    if (opts.attachments?.length) {
      message.attachments = opts.attachments.map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.filename,
        contentType: a.contentType,
        contentBytes: a.contentBase64,
      }))
    }
    await graphPost(`/users/${sender}/sendMail`, {
      message,
      saveToSentItems: false,
    })
  } catch (err) {
    console.error('[notifications] Email error:', err)
  }
}

// ============================================================
// Prestazioni Occasionali — riepilogo nuova prestazione
// Destinatari: info@ (Luca → portale Agenzia Entrate) + Claudia
// ============================================================

export const BOX = (contenuto: string) =>
  `<div style="font-family:sans-serif;font-size:14px;color:#333;max-width:560px">${contenuto}</div>`

export const RIGA = (label: string, valore: string) =>
  `<tr><td style="padding:4px 14px 4px 0;color:#666;white-space:nowrap;vertical-align:top">${label}</td><td><strong>${valore || '—'}</strong></td></tr>`

export const TABELLA = (righe: string) =>
  `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;margin:10px 0">${righe}</table>`

/** Nuova richiesta urgente → gestori, subito. Le altre passano dal digest. */

export const BTN = (href: string, testo: string, colore: string) =>
  `<a href="${href}" style="background:${colore};color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block;margin:0 8px 8px 0">${testo}</a>`
