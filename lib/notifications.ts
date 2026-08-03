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
// Timbrature — sollecito ALERT chiusura foglio ore → dipendente
// Inviato ogni giorno nei giorni 1-5 del mese, finché il mese precedente
// non è chiuso. Tono perentorio.
// ============================================================

export async function notificaSollecitoTimbrature(opts: {
  to: string
  cognomeNome: string
  meseNome: string
  anno: number
  scadenza: string // YYYY-MM-DD
  giorniRimasti: number
  giorniIncompleti: number
  scostamento: number
  linkApp: string
}): Promise<void> {
  const scadFmt = opts.scadenza.split('-').reverse().join('/')
  const urgenza = opts.giorniRimasti <= 1 ? '#C00000' : opts.giorniRimasti <= 2 ? '#E36C09' : '#B8860B'
  const problemi: string[] = []
  if (opts.giorniIncompleti > 0) problemi.push(`${opts.giorniIncompleti} giorno/i incompleto/i`)
  if (opts.scostamento < 0) problemi.push(`mancano ${Math.abs(opts.scostamento)} ore rispetto al monte ore`)

  await sendEmail({
    to: opts.to,
    subject: `⚠️ AZIONE RICHIESTA — completa il foglio ore di ${opts.meseNome} entro il ${scadFmt}`,
    html: `
      <div style="border:2px solid ${urgenza};border-radius:10px;padding:16px 18px;font-family:sans-serif">
        <p style="margin:0 0 8px;font-size:18px;font-weight:800;color:${urgenza};text-transform:uppercase">
          ⚠️ Foglio ore da chiudere — ${opts.giorniRimasti === 0 ? 'ULTIMO GIORNO' : `mancano ${opts.giorniRimasti} giorni`}
        </p>
        <p style="margin:0 0 10px">${opts.cognomeNome}, il tuo foglio ore di
          <strong>${opts.meseNome} ${opts.anno}</strong> deve essere completo e corretto
          <strong>entro e non oltre il ${scadFmt}</strong>.</p>
        ${
          problemi.length
            ? `<p style="margin:0 0 10px;color:${urgenza};font-weight:700">Da sistemare: ${problemi.join('; ')}.</p>`
            : `<p style="margin:0 0 10px">Verifica che tutte le ore siano inserite e attribuite al servizio corretto.</p>`
        }
        <p style="margin:0 0 6px;font-weight:700">Dopo il ${scadFmt} il mese verrà chiuso e non sarà più modificabile.</p>
        <p style="margin:16px 0 4px">
          <a href="${opts.linkApp}"
             style="background:${urgenza};color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;display:inline-block">
            Apri e completa il foglio ore →
          </a>
        </p>
      </div>
    `,
  })
}

// ============================================================
// Richieste Acquisto
//
// Regole di notifica:
//   - al richiedente: una mail a ogni cambio di stato che lo riguarda;
//   - ai gestori: solo le urgenti in tempo reale, il resto nel digest
//     giornaliero. Una mail per richiesta renderebbe la casella inutile.
// ============================================================

const ACQUISTI_MAIL_TO = (
  process.env.ACQUISTI_MAIL_TO || 'ufficio.rendicontazione@cooperativamirafiori.com'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

/** Destinatari del digest: ufficio + eventuali gestori passati dal chiamante. */
export function destinatariAcquisti(gestori: string[] = []): string[] {
  return Array.from(new Set([...ACQUISTI_MAIL_TO, ...gestori].filter((e) => e?.includes('@'))))
}

const BOX = (contenuto: string) =>
  `<div style="font-family:sans-serif;font-size:14px;color:#333;max-width:560px">${contenuto}</div>`

const RIGA = (label: string, valore: string) =>
  `<tr><td style="padding:4px 14px 4px 0;color:#666;white-space:nowrap;vertical-align:top">${label}</td><td><strong>${valore || '—'}</strong></td></tr>`

const TABELLA = (righe: string) =>
  `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;margin:10px 0">${righe}</table>`

/** Nuova richiesta urgente → gestori, subito. Le altre passano dal digest. */
export async function notificaAcquistoUrgente(opts: {
  to: string[]
  codice: string
  richiedente: string
  struttura: string
  descrizione: string
  quantita: number
  categoria: string
  serveEntro?: string
  link?: string
  linkApp: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `[URGENTE] ${opts.codice} — ${opts.descrizione.slice(0, 60)}`,
    html: BOX(`
      <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#C00000">
        🛒 Richiesta di acquisto urgente
      </p>
      ${TABELLA(
        RIGA('Codice', opts.codice) +
        RIGA('Richiedente', opts.richiedente) +
        RIGA('Struttura', opts.struttura) +
        RIGA('Cosa serve', `${opts.descrizione} — quantità ${opts.quantita}`) +
        RIGA('Categoria', opts.categoria) +
        (opts.serveEntro ? RIGA('Serve entro', opts.serveEntro) : '') +
        (opts.link ? RIGA('Link', `<a href="${opts.link}">${opts.link}</a>`) : ''),
      )}
      <p style="margin:16px 0 0">
        <a href="${opts.linkApp}" style="background:#E36C09;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:10px;display:inline-block">
          Apri la richiesta →
        </a>
      </p>
    `),
  })
}

/**
 * Richiesta assegnata → solo all'operatore assegnato, subito.
 *
 * Non passa dal digest: il digest dice "c'è del lavoro", questa dice "il lavoro
 * è tuo". Chi si assegna una richiesta da sé non viene notificato: lo sa già.
 */
export async function notificaAssegnazioneAcquisto(opts: {
  to: string
  assegnatoNome?: string
  assegnataDa: string
  codice: string
  descrizione: string
  quantita: number
  struttura: string
  richiedente: string
  categoria: string
  urgenza: string
  serveEntro?: string
  stato: string
  link?: string
  linkApp: string
}): Promise<void> {
  const colore =
    opts.urgenza === 'Urgente' ? '#C00000' : opts.urgenza === 'Alta' ? '#E36C09' : '#1F4E79'

  await sendEmail({
    to: opts.to,
    subject: `${opts.codice} — assegnata a te${opts.urgenza === 'Urgente' ? ' [URGENTE]' : ''}`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:${colore}">
        📌 Richiesta di acquisto assegnata a te
      </p>
      ${opts.assegnatoNome ? `<p style="margin:0 0 6px">Ciao ${opts.assegnatoNome},</p>` : ''}
      <p style="margin:0 0 4px"><strong>${opts.assegnataDa}</strong> ti ha assegnato la richiesta
      <strong>${opts.codice}</strong>.</p>
      ${TABELLA(
        RIGA('Cosa serve', `${opts.descrizione} — quantità ${opts.quantita}`) +
        RIGA('Richiedente', opts.richiedente) +
        RIGA('Struttura', opts.struttura) +
        RIGA('Categoria', opts.categoria) +
        RIGA('Urgenza', `<span style="color:${colore}">${opts.urgenza}</span>`) +
        (opts.serveEntro ? RIGA('Serve entro', opts.serveEntro) : '') +
        RIGA('Stato', opts.stato) +
        (opts.link ? RIGA('Link', `<a href="${opts.link}">${opts.link}</a>`) : ''),
      )}
      <p style="margin:16px 0 0">
        <a href="${opts.linkApp}" style="background:${colore};color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:10px;display:inline-block">
          Gestisci la richiesta →
        </a>
      </p>
    `),
  })
}

/** Digest giornaliero delle nuove richieste → ufficio + gestori. */
export async function notificaDigestAcquisti(opts: {
  to: string[]
  righe: Array<{
    codice: string
    richiedente: string
    struttura: string
    descrizione: string
    quantita: number
    urgenza: string
    serveEntro?: string
  }>
  linkApp: string
}): Promise<void> {
  if (!opts.righe.length) return

  const celle = opts.righe
    .map(
      (r) => `
      <tr>
        <td style="padding:7px 10px;border-bottom:1px solid #eee"><strong>${r.codice}</strong></td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee">${r.descrizione} <span style="color:#888">×${r.quantita}</span></td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee">${r.struttura}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee">${r.richiedente}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;${r.urgenza === 'Urgente' ? 'color:#C00000;font-weight:700' : r.urgenza === 'Alta' ? 'color:#E36C09' : 'color:#888'}">${r.urgenza}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;color:#666">${r.serveEntro ?? '—'}</td>
      </tr>`,
    )
    .join('')

  await sendEmail({
    to: opts.to,
    subject: `Richieste di acquisto — ${opts.righe.length} nuova/e da valutare`,
    html: `
      <div style="font-family:sans-serif;font-size:14px;color:#333">
        <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#1F4E79">
          🛒 ${opts.righe.length} nuova/e richiesta/e di acquisto
        </p>
        <table style="border-collapse:collapse;font-size:13px;min-width:520px">
          <tr style="background:#1F4E79;color:#fff">
            <th style="padding:7px 10px;text-align:left">Codice</th>
            <th style="padding:7px 10px;text-align:left">Cosa</th>
            <th style="padding:7px 10px;text-align:left">Struttura</th>
            <th style="padding:7px 10px;text-align:left">Chi</th>
            <th style="padding:7px 10px;text-align:left">Urgenza</th>
            <th style="padding:7px 10px;text-align:left">Entro</th>
          </tr>
          ${celle}
        </table>
        <p style="margin:16px 0 0">
          <a href="${opts.linkApp}" style="background:#E36C09;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:10px;display:inline-block">
            Apri la gestione acquisti →
          </a>
        </p>
      </div>`,
  })
}

/** Cambio di stato → richiedente. Un solo punto per approvata/rifiutata/annullata. */
export async function notificaEsitoValutazione(opts: {
  to: string
  richiedenteNome: string
  codice: string
  descrizione: string
  esito: 'approvata' | 'rifiutata' | 'annullata'
  motivo?: string
}): Promise<void> {
  const testi = {
    approvata: {
      subject: `Acquisto ${opts.codice} — approvato`,
      titolo: '✅ Richiesta approvata',
      corpo: 'Procediamo con l’acquisto. Ti avvisiamo quando l’ordine è partito, con la data di consegna prevista.',
      colore: '#1E7B34',
    },
    rifiutata: {
      subject: `Acquisto ${opts.codice} — non approvato`,
      titolo: 'Richiesta non approvata',
      corpo: 'La richiesta non è stata approvata.',
      colore: '#6B7280',
    },
    annullata: {
      subject: `Acquisto ${opts.codice} — annullato`,
      titolo: 'Richiesta annullata',
      corpo: 'La richiesta è stata annullata.',
      colore: '#6B7280',
    },
  }[opts.esito]

  await sendEmail({
    to: opts.to,
    subject: testi.subject,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:${testi.colore}">${testi.titolo}</p>
      <p style="margin:0 0 6px">Ciao ${opts.richiedenteNome},</p>
      <p style="margin:0 0 8px">la tua richiesta <strong>${opts.codice}</strong> — ${opts.descrizione} — è stata aggiornata.</p>
      <p style="margin:0 0 8px">${testi.corpo}</p>
      ${
        opts.motivo
          ? `<p style="margin:12px 0 0;padding:10px 12px;background:#f8f8f8;border-left:3px solid ${testi.colore}"><strong>Motivo:</strong><br>${opts.motivo.replace(/\n/g, '<br>')}</p>`
          : ''
      }
    `),
  })
}

/** Ordine registrato → richiedente, con data e luogo di consegna previsti. */
export async function notificaOrdineEffettuato(opts: {
  to: string
  richiedenteNome: string
  codice: string
  descrizione: string
  fornitore: string
  dataConsegnaPrevista: string
  luogoConsegna: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `Acquisto ${opts.codice} — ordinato`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#6D31A2">📦 Ordine effettuato</p>
      <p style="margin:0 0 6px">Ciao ${opts.richiedenteNome},</p>
      <p style="margin:0 0 4px">l’ordine per la richiesta <strong>${opts.codice}</strong> è partito.</p>
      ${TABELLA(
        RIGA('Cosa', opts.descrizione) +
        RIGA('Fornitore', opts.fornitore) +
        RIGA('Consegna prevista', opts.dataConsegnaPrevista) +
        RIGA('Luogo di consegna', opts.luogoConsegna),
      )}
      <p style="margin:10px 0 0;color:#666">Il giorno della consegna ti arriva una mail per confermare che sia tutto arrivato: basta un clic, non serve entrare in app.</p>
    `),
  })
}

/**
 * Consegna prevista oggi (o sollecito) → richiedente.
 * I tre pulsanti sono link tokenizzati: rispondere non richiede login.
 */
export async function notificaConfermaConsegna(opts: {
  to: string
  richiedenteNome: string
  codice: string
  descrizione: string
  luogoConsegna: string
  urlBase: string // .../consegna/{token}
  sollecito?: boolean
  giorniAllaChiusura?: number
}): Promise<void> {
  const bottone = (esito: string, etichetta: string, colore: string) =>
    `<a href="${opts.urlBase}?esito=${encodeURIComponent(esito)}"
        style="background:${colore};color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;display:inline-block;margin:0 8px 8px 0">
       ${etichetta}
     </a>`

  await sendEmail({
    to: opts.to,
    subject: opts.sollecito
      ? `Promemoria: com’è andata la consegna di ${opts.codice}?`
      : `${opts.codice} — è arrivato tutto?`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1F4E79">
        ${opts.sollecito ? '⏰ Ci manca solo la tua conferma' : '📬 Consegna prevista oggi'}
      </p>
      <p style="margin:0 0 6px">Ciao ${opts.richiedenteNome},</p>
      <p style="margin:0 0 10px">per la richiesta <strong>${opts.codice}</strong> — ${opts.descrizione} —
      la consegna era prevista presso <strong>${opts.luogoConsegna}</strong>.</p>
      <p style="margin:0 0 14px">Com’è andata? Rispondi con un clic:</p>
      <p style="margin:0">
        ${bottone('Tutto ok', '✅ Tutto ok', '#1E7B34')}
        ${bottone('Da restituire', '↩️ Da restituire', '#E36C09')}
        ${bottone('Non arrivato', '❌ Non arrivato', '#C00000')}
      </p>
      ${
        opts.giorniAllaChiusura != null
          ? `<p style="margin:14px 0 0;color:#888;font-size:12px">Se non ricevo risposta, fra ${opts.giorniAllaChiusura} giorni la richiesta viene chiusa come consegnata senza riscontro.</p>`
          : ''
      }
    `),
  })
}

/** Esito della consegna → gestore. Un problema deve tornare a chi ha ordinato. */
export async function notificaEsitoConsegna(opts: {
  to: string[]
  codice: string
  descrizione: string
  richiedente: string
  esito: string
  note?: string
  linkApp: string
}): Promise<void> {
  const problema = opts.esito !== 'Tutto ok'
  await sendEmail({
    to: opts.to,
    subject: problema
      ? `⚠️ ${opts.codice} — ${opts.esito}`
      : `${opts.codice} — consegna confermata`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:${problema ? '#C00000' : '#1E7B34'}">
        ${problema ? `⚠️ Problema sulla consegna: ${opts.esito}` : '✅ Consegna confermata'}
      </p>
      ${TABELLA(
        RIGA('Codice', opts.codice) +
        RIGA('Cosa', opts.descrizione) +
        RIGA('Richiedente', opts.richiedente) +
        RIGA('Esito', opts.esito),
      )}
      ${opts.note ? `<p style="margin:10px 0 0;padding:10px 12px;background:#f8f8f8;border-left:3px solid #ccc">${opts.note.replace(/\n/g, '<br>')}</p>` : ''}
      ${
        problema
          ? `<p style="margin:16px 0 0"><a href="${opts.linkApp}" style="background:#C00000;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:10px;display:inline-block">Gestisci il problema →</a></p>`
          : ''
      }
    `),
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
