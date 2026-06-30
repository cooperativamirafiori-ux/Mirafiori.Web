/**
 * Notifiche via Microsoft Graph API — solo email (Mail.Send).
 * Replica la logica dei Flussi 2A, 2B, 2C — sincrona in-process.
 */

import { graphPost } from '@/lib/graph'

const ADMIN_EMAIL = process.env.MAIL_SENDER_EMAIL!

// Destinatari del riepilogo prestazioni (override via env, default info@ + Claudia)
const PRESTAZIONI_MAIL_TO = (
  process.env.PRESTAZIONI_MAIL_TO ||
  'info@cooperativamirafiori.com,claudia.carena@cooperativamirafiori.com'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// ============================================================
// Email via Graph (Mail.Send — Application permission)
// ============================================================

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

export async function notificaRiepilogoPrestazione(opts: {
  idPrestazione: string
  nome: string
  cognome: string
  dataNascita: string
  luogoNascita: string
  codiceFiscale: string
  residenza: string
  ruolo: string
  email: string
  telefono: string
  iban: string
  giorni: number
  dataInizio: string
  dataFine: string
  attivita: string
  compensoPrevisto: number
  responsabileNome: string
  responsabileEmail: string
  cartellaUrl?: string
}): Promise<void> {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap">${label}</td><td><strong>${value || '—'}</strong></td></tr>`

  const html = `
    <p><strong>Nuova prestazione occasionale — riepilogo per Agenzia Entrate</strong></p>
    <p style="color:#555">ID pratica: <strong>${opts.idPrestazione}</strong> · attivata da ${opts.responsabileNome}</p>
    <h4 style="margin:14px 0 4px">Prestatore</h4>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      ${row('Nome', opts.nome)}
      ${row('Cognome', opts.cognome)}
      ${row('Data di nascita', opts.dataNascita)}
      ${row('Luogo di nascita', opts.luogoNascita)}
      ${row('Codice fiscale', opts.codiceFiscale)}
      ${row('Residenza', opts.residenza)}
      ${row('Ruolo', opts.ruolo)}
      ${row('Email', opts.email)}
      ${row('Telefono', opts.telefono)}
      ${row('IBAN', opts.iban)}
    </table>
    <h4 style="margin:14px 0 4px">Prestazione</h4>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      ${row('N. giorni', String(opts.giorni))}
      ${row('Data inizio', opts.dataInizio)}
      ${row('Data fine', opts.dataFine)}
      ${row('Compenso previsto', opts.compensoPrevisto ? `€ ${opts.compensoPrevisto.toFixed(2)}` : '')}
      ${row('Attività', opts.attivita)}
    </table>
    ${opts.cartellaUrl ? `<p style="margin-top:14px">📁 <a href="${opts.cartellaUrl}">Cartella SharePoint della prestazione</a></p>` : ''}
  `

  await Promise.all(
    PRESTAZIONI_MAIL_TO.map((to) =>
      sendEmail({
        to,
        from: opts.responsabileEmail,
        subject: `Nuova prestazione ${opts.idPrestazione} — ${opts.cognome} ${opts.nome}`,
        html,
      }),
    ),
  )
}

// ============================================================
// Prestazioni — moduli informativi → prestatore (mail semplice)
// Foglio ore in bianco + informativa fornitore (NON via DocuSign)
// ============================================================

export async function notificaModuliInformativi(opts: {
  to: string
  from?: string
  prestatoreNome: string
  idPrestazione: string
  attachments: EmailAttachment[]
}): Promise<void> {
  if (!opts.attachments.length) return
  await sendEmail({
    to: opts.to,
    from: opts.from,
    subject: `Moduli informativi — prestazione ${opts.idPrestazione} · Cooperativa Mirafiori`,
    attachments: opts.attachments,
    html: `
      <p>Ciao ${opts.prestatoreNome},</p>
      <p>in allegato trovi il <strong>foglio ore</strong> da compilare durante la prestazione
      e l'<strong>informativa fornitore</strong>.</p>
      <p>I documenti da firmare (contratto, privacy, riservatezza) ti arrivano separatamente
      via DocuSign.</p>
      <p>Grazie!</p>
    `,
  })
}

// ============================================================
// Prestazioni — contratto firmato → responsabile (mail di conferma)
// Inviata quando i moduli firmati rientrano da DocuSign e vengono archiviati
// ============================================================

export async function notificaContrattoFirmato(opts: {
  responsabileEmail: string
  responsabileNome?: string
  prestatoreNome: string
  idPrestazione: string
  cartellaUrl?: string
}): Promise<void> {
  await sendEmail({
    to: opts.responsabileEmail,
    from: opts.responsabileEmail,
    subject: `Contratto firmato — ${opts.idPrestazione} (${opts.prestatoreNome})`,
    html: `
      <p>Ciao ${opts.responsabileNome || ''},</p>
      <p>✅ <strong>${opts.prestatoreNome}</strong> ha firmato i documenti della prestazione
      <strong>${opts.idPrestazione}</strong>. I moduli firmati sono stati archiviati nella
      cartella SharePoint della pratica.</p>
      ${opts.cartellaUrl ? `<p>📁 <a href="${opts.cartellaUrl}">Apri la cartella della prestazione</a></p>` : ''}
      <p>La prestazione può iniziare regolarmente.</p>
    `,
  })
}

// ============================================================
// Prestazioni — notula precompilata → prestatore (con allegato + link upload)
// ============================================================

export async function notificaNotulaAlPrestatore(opts: {
  to: string
  from?: string
  prestatoreNome: string
  idPrestazione: string
  uploadUrl: string
  importoLordo: number
  ritenuta: number
  netto: number
  notula?: EmailAttachment
}): Promise<void> {
  const euro = (n: number) =>
    (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  await sendEmail({
    to: opts.to,
    from: opts.from,
    subject: `Notula prestazione ${opts.idPrestazione} — da firmare e caricare`,
    attachments: opts.notula ? [opts.notula] : undefined,
    html: `
      <p>Ciao ${opts.prestatoreNome},</p>
      <p>in allegato trovi la <strong>notula precompilata</strong> relativa alla tua prestazione
      <strong>${opts.idPrestazione}</strong>.</p>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;margin:12px 0">
        <tr><td style="padding:3px 12px 3px 0;color:#555">Compenso lordo</td><td><strong>€ ${euro(opts.importoLordo)}</strong></td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#555">Ritenuta d'acconto 20%</td><td>€ ${euro(opts.ritenuta)}</td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#555">Netto a pagare</td><td><strong>€ ${euro(opts.netto)}</strong></td></tr>
      </table>
      <p>Puoi firmare la notula precompilata <em>oppure</em> caricare una notula tua. Quando è pronta, caricala qui:</p>
      <p style="margin:18px 0">
        <a href="${opts.uploadUrl}"
           style="background:#6D31A2;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;display:inline-block">
          📎 Carica notula
        </a>
      </p>
      <p style="color:#888;font-size:12px">Se il pulsante non funziona, copia questo link nel browser:<br>${opts.uploadUrl}</p>
    `,
  })
}

// ============================================================
// Prestazioni — notula caricata → info@ + Claudia + responsabile
// ============================================================

export async function notificaNotulaCaricata(opts: {
  idPrestazione: string
  prestatoreNome: string
  responsabileEmail: string
  notulaUrl?: string
  cartellaUrl?: string
}): Promise<void> {
  const destinatari = [...PRESTAZIONI_MAIL_TO, opts.responsabileEmail].filter(Boolean)
  await sendEmail({
    to: destinatari,
    from: opts.responsabileEmail,
    subject: `Notula ricevuta — ${opts.idPrestazione} (${opts.prestatoreNome})`,
    html: `
      <p>✅ <strong>${opts.prestatoreNome}</strong> ha caricato la notula firmata per la prestazione
      <strong>${opts.idPrestazione}</strong>.</p>
      ${opts.notulaUrl ? `<p>📄 <a href="${opts.notulaUrl}">Apri la notula caricata</a></p>` : ''}
      ${opts.cartellaUrl ? `<p>📁 <a href="${opts.cartellaUrl}">Cartella SharePoint della prestazione</a></p>` : ''}
    `,
  })
}

// ============================================================
// Prestazioni — promemoria foglio ore → prestatore
// ============================================================

export async function notificaPromemoriaFoglioOre(opts: {
  to: string
  prestatoreNome: string
  idPrestazione: string
  dataFine: string
  responsabileEmail: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    from: opts.responsabileEmail,
    subject: `Promemoria: invia il foglio ore — prestazione ${opts.idPrestazione}`,
    html: `
      <p>Ciao ${opts.prestatoreNome},</p>
      <p>la tua prestazione <strong>${opts.idPrestazione}</strong> termina il <strong>${opts.dataFine}</strong>.</p>
      <p>Ti chiediamo di inviare il <strong>foglio ore compilato</strong> a questo indirizzo:</p>
      <p style="margin:14px 0"><a href="mailto:${opts.responsabileEmail}" style="font-weight:600;color:#6D31A2">${opts.responsabileEmail}</a></p>
      <p>Grazie!</p>
    `,
  })
}

// ============================================================
// Gestione Software — alert scadenza abbonamento
// Destinatario: ufficio.rendicontazione (override via SOFTWARE_ALERT_EMAIL)
// ============================================================

const SOFTWARE_ALERT_EMAIL =
  process.env.SOFTWARE_ALERT_EMAIL || 'ufficio.rendicontazione@cooperativamirafiori.com'

export async function notificaScadenzaSoftware(opts: {
  servizio: string
  scadenza: string // gg/mm/aaaa
  giorni: number
  costo?: number
  periodicita?: string
  referente?: string
  cartaPagamento?: string
  rinnovoAutomatico?: boolean
  /** destinatario aggiuntivo, oltre a ufficio.rendicontazione */
  to?: string | string[]
}): Promise<void> {
  const euroFmt = (n?: number) =>
    n == null ? '—' : `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap">${label}</td><td><strong>${value || '—'}</strong></td></tr>`

  const destinatari = [SOFTWARE_ALERT_EMAIL, ...(Array.isArray(opts.to) ? opts.to : opts.to ? [opts.to] : [])]

  await sendEmail({
    to: destinatari,
    subject: `Scadenza abbonamento tra ${opts.giorni} giorni — ${opts.servizio}`,
    html: `
      <p><strong>Promemoria scadenza software</strong></p>
      <p>L'abbonamento a <strong>${opts.servizio}</strong> scade il <strong>${opts.scadenza}</strong>
      (tra ${opts.giorni} giorni).</p>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;margin:12px 0">
        ${row('Costo', `${euroFmt(opts.costo)}${opts.periodicita ? ` · ${opts.periodicita}` : ''}`)}
        ${row('Rinnovo automatico', opts.rinnovoAutomatico ? 'Sì' : 'No')}
        ${row('In uso a', opts.referente || '')}
        ${row('Carta di pagamento', opts.cartaPagamento || '')}
      </table>
      <p style="color:#555">${opts.rinnovoAutomatico
        ? 'Il rinnovo è automatico: verifica la carta di pagamento e che la copertura sia sufficiente.'
        : 'Il rinnovo NON è automatico: valuta se rinnovare o disdire prima della scadenza.'}</p>
    `,
  })
}

// ============================================================
// Flusso 2A — Nuova richiesta → admin
// ============================================================

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
