/**
 * Mail dell'area Acquisti.
 *
 * Le richieste non urgenti passano dal digest giornaliero: una mail per
 * richiesta renderebbe la casella inutilizzabile.
 */

import { sendEmail, BOX, RIGA, TABELLA } from '@/lib/core/mailer'
import type { Struttura } from '@/types/manutenzioni'

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
