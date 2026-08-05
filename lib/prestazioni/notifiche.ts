/** Mail dell'area Prestazioni Occasionali. */

import { sendEmail } from '@/lib/core/mailer'
import type { EmailAttachment } from '@/lib/core/mailer'

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
// Timbrature — sollecito ALERT chiusura foglio ore → dipendente
// Inviato ogni giorno nei giorni 1-5 del mese, finché il mese precedente
// non è chiuso. Tono perentorio. Mittente: Risorse Umane.
// ============================================================
