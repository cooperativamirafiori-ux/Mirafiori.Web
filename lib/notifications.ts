/**
 * Notifiche via Microsoft Graph API — solo email (Mail.Send).
 * Replica la logica dei Flussi 2A, 2B, 2C — sincrona in-process.
 */

import { graphPost } from '@/lib/core/graph'

/**
 * Casella di sistema: mittente di default (acquisti, manutenzioni) e
 * destinatario degli avvisi admin delle manutenzioni.
 */
const ADMIN_EMAIL = process.env.MAIL_SENDER_EMAIL!

/**
 * Mittente delle mail dell'area Timbrature.
 *
 * Un sollecito sul foglio ore deve arrivare da Risorse Umane, non dalla casella
 * che gestisce gli acquisti: il dipendente risponde a chi gli scrive, e la
 * risposta deve finire nella casella giusta.
 */
const TIMBRATURE_MAIL_FROM =
  process.env.TIMBRATURE_MAIL_FROM || 'risorseumane@cooperativamirafiori.com'

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
// non è chiuso. Tono perentorio. Mittente: Risorse Umane.
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
    from: TIMBRATURE_MAIL_FROM,
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
 * I pulsanti sono link tokenizzati: rispondere non richiede login.
 */
export async function notificaConfermaConsegna(opts: {
  to: string | string[]
  richiedenteNome: string
  codice: string
  descrizione: string
  luogoConsegna: string
  urlBase: string // .../consegna/{token}
  sollecito?: boolean
  giorniAllaChiusura?: number
  /**
   * Nome del richiedente, valorizzato solo per le consegne presidiate: la mail
   * va ai referenti dell'ufficio e deve dire di chi è l'ordine, non dare del
   * "tuo" a chi non l'ha chiesto.
   */
  perRichiedente?: string
  /** Dove il richiedente verrà mandato a ritirare, da citare ai referenti. */
  luogoRitiro?: string
}): Promise<void> {
  const presidiata = Boolean(opts.perRichiedente)
  const bottone = (esito: string, etichetta: string, colore: string) =>
    `<a href="${opts.urlBase}?esito=${encodeURIComponent(esito)}"
        style="background:${colore};color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;display:inline-block;margin:0 8px 8px 0">
       ${etichetta}
     </a>`

  await sendEmail({
    to: opts.to,
    subject: opts.sollecito
      ? `Promemoria: com’è andata la consegna di ${opts.codice}?`
      : presidiata
        ? `${opts.codice} — è arrivato l’ordine di ${opts.perRichiedente}?`
        : `${opts.codice} — è arrivato tutto?`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1F4E79">
        ${opts.sollecito ? '⏰ Manca solo la conferma' : '📬 Consegna prevista oggi'}
      </p>
      ${
        presidiata
          ? `<p style="margin:0 0 10px">Ciao, la richiesta <strong>${opts.codice}</strong> —
             ${opts.descrizione} — di <strong>${opts.perRichiedente}</strong> era prevista in consegna
             presso <strong>${opts.luogoConsegna}</strong>.</p>
             <p style="margin:0 0 14px">È arrivata? Rispondi con un clic: appena confermi,
             ${opts.perRichiedente} riceve l’avviso che può passare a ritirarla${
               opts.luogoRitiro ? ` in ${opts.luogoRitiro}` : ''
             }.</p>`
          : `<p style="margin:0 0 6px">Ciao ${opts.richiedenteNome},</p>
             <p style="margin:0 0 10px">per la richiesta <strong>${opts.codice}</strong> — ${opts.descrizione} —
             la consegna era prevista presso <strong>${opts.luogoConsegna}</strong>.</p>
             <p style="margin:0 0 14px">Com’è andata? Rispondi con un clic:</p>`
      }
      <p style="margin:0">
        ${bottone('Tutto ok', '✅ Tutto ok', '#1E7B34')}
        ${bottone('Da restituire', '↩️ Da restituire', '#E36C09')}
      </p>
      ${
        opts.giorniAllaChiusura != null
          ? `<p style="margin:14px 0 0;color:#888;font-size:12px">Senza risposta, fra ${opts.giorniAllaChiusura} giorni la richiesta viene chiusa come consegnata senza riscontro${
              presidiata ? ' e nessuno avvisa il richiedente' : ''
            }.</p>`
          : ''
      }
    `),
  })
}

/**
 * Consegna presidiata confermata dai referenti → richiedente.
 *
 * È l'unico avviso che riceve: la merce è arrivata in un ufficio dove lui non
 * passa, quindi senza questa mail non saprebbe di doverla ritirare.
 */
export async function notificaOrdineDaRitirare(opts: {
  to: string
  richiedenteNome: string
  codice: string
  descrizione: string
  quantita: number
  luogoRitiro: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `${opts.codice} — il tuo ordine è arrivato, puoi ritirarlo`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1E7B34">
        📦 Il tuo ordine è arrivato
      </p>
      ${opts.richiedenteNome ? `<p style="margin:0 0 6px">Ciao ${opts.richiedenteNome},</p>` : ''}
      <p style="margin:0 0 10px">
        <strong>${opts.descrizione}</strong>${opts.quantita > 1 ? ` ×${opts.quantita}` : ''}
        è stato consegnato: vieni a prenderlo in <strong>${opts.luogoRitiro}</strong>.
      </p>
      ${TABELLA(RIGA('Richiesta', opts.codice) + RIGA('Ritiro presso', opts.luogoRitiro))}
      <p style="margin:12px 0 0;color:#888;font-size:12px">
        Non serve rispondere a questa mail: la consegna è già stata registrata.
      </p>
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


// ============================================================
// Timbrature — flusso di validazione mensile
//
// Quattro momenti, quattro toni diversi:
//   1. la giornata sta per uscire dalla finestra   → allarme al dipendente
//   2. il mese e' passato al responsabile           → richiesta al responsabile
//   3. il foglio e' validato                        → PDF + conferma al dipendente
//   4. il dipendente contesta                       → ritorno al responsabile
// ============================================================

const BTN = (href: string, testo: string, colore: string) =>
  `<a href="${href}" style="background:${colore};color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block;margin:0 8px 8px 0">${testo}</a>`

const dataBreveIt = (ymd: string) => ymd.split('-').reverse().join('/')

/**
 * Giornate che stanno per uscire dalla finestra dei 3 giorni.
 *
 * Il tono e' volutamente duro: e' l'unico momento in cui la persona puo' ancora
 * rimediare da sola. Dopo, la correzione esiste comunque ma deve passare dal
 * responsabile, e questo va detto chiaramente invece di lasciarlo scoprire.
 */
export async function notificaGiornateInScadenza(opts: {
  to: string
  cognomeNome: string
  /** Giornate senza ore, dalla piu' vecchia: { data, ultimoGiorno } */
  giornate: { data: string; ultimoGiorno: string; oreAttese: number }[]
  linkApp: string
}): Promise<void> {
  if (!opts.giornate.length) return
  const oggiScade = opts.giornate.filter((g) => g.ultimoGiorno === opts.giornate[0].ultimoGiorno)
  const urgente = oggiScade.length > 0

  const righe = opts.giornate
    .map(
      (g) =>
        `<tr><td style="padding:3px 14px 3px 0"><strong>${dataBreveIt(g.data)}</strong></td>` +
        `<td style="padding:3px 14px 3px 0;color:#666">${g.oreAttese} h previste</td>` +
        `<td style="padding:3px 0;color:#C00000;font-weight:600">si chiude il ${dataBreveIt(g.ultimoGiorno)}</td></tr>`,
    )
    .join('')

  await sendEmail({
    to: opts.to,
    from: TIMBRATURE_MAIL_FROM,
    subject: `⚠️ ${opts.giornate.length === 1 ? 'Una giornata' : `${opts.giornate.length} giornate`} senza ore — stanno per chiudersi`,
    html: `
      <div style="border:2px solid #C00000;border-radius:10px;padding:16px 18px;font-family:sans-serif;font-size:14px;color:#333;max-width:560px">
        <p style="margin:0 0 10px;font-size:17px;font-weight:800;color:#C00000;text-transform:uppercase">
          ${urgente ? '⚠️ Ultimo giorno per timbrare' : '⚠️ Giornate da completare'}
        </p>
        <p style="margin:0 0 10px">${opts.cognomeNome}, su queste giornate non risulta nessuna ora:</p>
        <table style="border-collapse:collapse;margin:0 0 12px">${righe}</table>
        <p style="margin:0 0 12px;font-weight:700;color:#C00000">
          Se non le inserisci entro la data indicata, quelle ore non verranno conteggiate nel foglio ore
          del mese: per aggiungerle dovrai chiederlo al tuo responsabile.
        </p>
        <p style="margin:14px 0 4px">${BTN(opts.linkApp, 'Inserisci le ore adesso →', '#C00000')}</p>
        <p style="margin:10px 0 0;color:#888;font-size:12px">
          Ferie, permessi e malattia non hanno questo limite: puoi registrarli anche prima o dopo.
        </p>
      </div>
    `,
  })
}

/** Il mese e' chiuso ai dipendenti: i fogli aspettano il responsabile. */
export async function notificaFogliDaValidare(opts: {
  to: string
  meseNome: string
  anno: number
  nominativi: string[]
  linkApp: string
  sollecito?: boolean
  giorniFermi?: number
}): Promise<void> {
  if (!opts.nominativi.length) return
  const elenco = opts.nominativi.map((n) => `<li style="margin:2px 0">${n}</li>`).join('')
  await sendEmail({
    to: opts.to,
    from: TIMBRATURE_MAIL_FROM,
    subject: opts.sollecito
      ? `Promemoria: ${opts.nominativi.length} fogli ore di ${opts.meseNome} aspettano la tua validazione`
      : `Fogli ore di ${opts.meseNome} ${opts.anno} da validare (${opts.nominativi.length})`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1F4E79">
        ${opts.sollecito ? '⏰ Ci sono ancora fogli ore in attesa' : '📋 Fogli ore da validare'}
      </p>
      <p style="margin:0 0 10px">
        Il mese di <strong>${opts.meseNome} ${opts.anno}</strong> e' chiuso alla compilazione.
        Questi fogli ore aspettano il tuo controllo:
      </p>
      <ul style="margin:0 0 12px;padding-left:20px">${elenco}</ul>
      <p style="margin:0 0 12px">
        Se qualcosa non torna puoi correggere le righe tu stesso e poi validare. Alla validazione il
        dipendente riceve il PDF del suo foglio ore e ti conferma che e' corretto.
      </p>
      ${opts.giorniFermi ? `<p style="margin:0 0 12px;color:#C00000;font-weight:600">Fermi da ${opts.giorniFermi} giorni.</p>` : ''}
      <p style="margin:14px 0 4px">${BTN(opts.linkApp, 'Apri i fogli ore da validare →', '#1F4E79')}</p>
    `),
  })
}

/**
 * Foglio validato → al dipendente, con il PDF allegato e due bottoni.
 *
 * Due, non uno: chi non e' d'accordo deve poterlo dire da qui, altrimenti
 * l'unica strada e' una telefonata e la contestazione non resta scritta da
 * nessuna parte.
 */
export async function notificaFoglioDaConfermare(opts: {
  to: string
  cognomeNome: string
  meseNome: string
  anno: number
  oreLavorate: number
  oreGiustificativo: number
  oreAttese: number
  validatoDa: string
  urlBase: string // .../foglio-ore/{token}
  pdf?: { filename: string; base64: string }
  sollecito?: boolean
  giorniInAttesa?: number
}): Promise<void> {
  const scost = Math.round((opts.oreLavorate + opts.oreGiustificativo - opts.oreAttese) * 100) / 100
  await sendEmail({
    to: opts.to,
    from: TIMBRATURE_MAIL_FROM,
    subject: opts.sollecito
      ? `Promemoria: conferma il tuo foglio ore di ${opts.meseNome} ${opts.anno}`
      : `Il tuo foglio ore di ${opts.meseNome} ${opts.anno} — controlla e conferma`,
    attachments: opts.pdf
      ? [{ filename: opts.pdf.filename, contentBase64: opts.pdf.base64, contentType: 'application/pdf' }]
      : undefined,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1F4E79">
        ${opts.sollecito ? '⏰ Manca solo la tua conferma' : '📄 Foglio ore validato'}
      </p>
      <p style="margin:0 0 6px">Ciao ${opts.cognomeNome},</p>
      <p style="margin:0 0 10px">
        il tuo foglio ore di <strong>${opts.meseNome} ${opts.anno}</strong> e' stato controllato e validato
        da <strong>${opts.validatoDa}</strong>. Lo trovi in allegato in PDF.
      </p>
      ${TABELLA(
        RIGA('Ore lavorate', `${opts.oreLavorate} h`) +
          RIGA('Ferie, permessi e altre voci', `${opts.oreGiustificativo} h`) +
          RIGA('Ore previste dal contratto', `${opts.oreAttese} h`) +
          RIGA('Differenza', `${scost >= 0 ? '+' : ''}${scost} h`),
      )}
      <p style="margin:10px 0 14px">Controllalo: se e' corretto bastano due secondi.</p>
      <p style="margin:0">
        ${BTN(`${opts.urlBase}?esito=conferma`, '✅ Confermo, è corretto', '#1E7B34')}
        ${BTN(`${opts.urlBase}?esito=errore`, '✋ Segnalo un errore', '#E36C09')}
      </p>
      ${
        opts.giorniInAttesa
          ? `<p style="margin:14px 0 0;color:#888;font-size:12px">In attesa della tua risposta da ${opts.giorniInAttesa} giorni. Finche' non rispondi il foglio resta in sospeso e ricevi questo promemoria ogni giorno.</p>`
          : ''
      }
    `),
  })
}

/** Il dipendente ha segnalato un errore → torna al responsabile. */
export async function notificaContestazioneFoglioOre(opts: {
  to: string[]
  cognomeNome: string
  meseNome: string
  anno: number
  note: string
  linkApp: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    from: TIMBRATURE_MAIL_FROM,
    subject: `${opts.cognomeNome} segnala un errore nel foglio ore di ${opts.meseNome} ${opts.anno}`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#E36C09">✋ Foglio ore contestato</p>
      <p style="margin:0 0 10px">
        <strong>${opts.cognomeNome}</strong> non ha confermato il foglio ore di
        <strong>${opts.meseNome} ${opts.anno}</strong>. Ha scritto:
      </p>
      <blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid #E36C09;background:#FFF7ED;white-space:pre-wrap">${opts.note || '(nessun dettaglio)'}</blockquote>
      <p style="margin:0 0 12px">Correggi le righe e valida di nuovo: partira' un nuovo PDF da confermare.</p>
      <p style="margin:14px 0 4px">${BTN(opts.linkApp, 'Apri il foglio ore →', '#E36C09')}</p>
    `),
  })
}
