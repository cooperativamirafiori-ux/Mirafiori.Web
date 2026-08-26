/**
 * Mail dell'area Assistenza IT.
 *
 * Stessa regola di Acquisti: i ticket ordinari passano dal **digest**
 * giornaliero, perché una mail per ticket rende la casella dell'IT illeggibile
 * e quindi ignorata. Vanno subito solo i critici — quelli che fermano tutta la
 * cooperativa — e le mail indirizzate a **una** persona: "il lavoro è tuo",
 * "ti serve rispondere", "il tuo problema è risolto".
 *
 * L'altra metà dei destinatari è il richiedente: chi apre un ticket e non
 * riceve più niente pensa che sia caduto nel vuoto e telefona, che è esattamente
 * il canale che questa sezione dovrebbe togliere di mezzo.
 */

import { sendEmail, BOX, RIGA, TABELLA, BTN } from '@/lib/core/mailer'
import { PRIORITA_COLORE } from '@/types/assistenza'

/**
 * Casella dell'ufficio, se ne esiste una. Facoltativa: senza, i destinatari
 * sono i soli gestori: meglio nessun indirizzo che un indirizzo inventato che
 * rimbalza in silenzio.
 */
const ASSISTENZA_MAIL_TO = (process.env.ASSISTENZA_MAIL_TO || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.includes('@'))

export function destinatariAssistenza(gestori: string[] = []): string[] {
  return Array.from(
    new Set([...ASSISTENZA_MAIL_TO, ...gestori].filter((e) => e?.includes('@'))),
  )
}

const colore = (priorita: string) => PRIORITA_COLORE[priorita] ?? '#1F4E79'

/** Le righe di dettaglio che compaiono in quasi tutte le mail. */
function dettaglio(opts: {
  richiedente?: string
  tipologia?: string
  categoria?: string
  dispositivo?: string
  impatto?: string
  priorita?: string
  struttura?: string
  recapito?: string
  disponibilita?: string
  problema?: string
}): string {
  return TABELLA(
    (opts.richiedente ? RIGA('Richiedente', opts.richiedente) : '') +
      (opts.tipologia ? RIGA('Tipologia', opts.tipologia) : '') +
      (opts.categoria ? RIGA('Riguarda', opts.categoria) : '') +
      (opts.dispositivo ? RIGA('Dispositivo', opts.dispositivo) : '') +
      (opts.impatto ? RIGA('Impatto', opts.impatto) : '') +
      (opts.priorita
        ? RIGA(
            'Priorità',
            `<span style="color:${colore(opts.priorita)}">${opts.priorita}</span>`,
          )
        : '') +
      (opts.struttura ? RIGA('Dove', opts.struttura) : '') +
      (opts.recapito ? RIGA('Telefono', opts.recapito) : '') +
      (opts.disponibilita ? RIGA('Reperibile', opts.disponibilita) : '') +
      (opts.problema ? RIGA('Problema', opts.problema) : ''),
  )
}

// ============================================================
// Verso l'IT
// ============================================================

/**
 * Ticket critico → subito a tutta la squadra.
 *
 * "Critico" vuol dire impatto sull'azienda **e** lavoro fermo: se la soglia
 * scendesse, questa mail diventerebbe il digest e il digest diventerebbe
 * inutile.
 */
export async function notificaTicketCritico(opts: {
  to: string[]
  codice: string
  richiedente: string
  tipologia: string
  categoria: string
  dispositivo?: string
  impatto: string
  priorita: string
  problema: string
  struttura?: string
  recapito?: string
  disponibilita?: string
  linkApp: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `[CRITICO] ${opts.codice} — ${opts.problema.slice(0, 60)}`,
    html: BOX(`
      <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#C00000">
        🛠 Richiesta di assistenza critica
      </p>
      ${dettaglio({ ...opts, dispositivo: opts.dispositivo })}
      <p style="margin:16px 0 0">${BTN(opts.linkApp, 'Apri il ticket →', '#C00000')}</p>
    `),
  })
}

/** Digest giornaliero: i ticket nuovi e quelli che stanno invecchiando. */
export async function notificaDigestAssistenza(opts: {
  to: string[]
  nuovi: {
    codice: string
    richiedente: string
    categoria: string
    dispositivo?: string
    priorita: string
    problema: string
  }[]
  arretrati: { codice: string; giorni: number; stato: string; problema: string }[]
  linkApp: string
}): Promise<void> {
  const righeNuovi = opts.nuovi
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 12px 6px 0;white-space:nowrap"><strong>${r.codice}</strong></td>
        <td style="padding:6px 12px 6px 0;white-space:nowrap;color:${colore(r.priorita)}">${r.priorita}</td>
        <td style="padding:6px 12px 6px 0">${r.richiedente}</td>
        <td style="padding:6px 12px 6px 0">${r.categoria}${r.dispositivo ? ` · ${r.dispositivo}` : ''}</td>
        <td style="padding:6px 0">${r.problema.slice(0, 90)}</td>
      </tr>`,
    )
    .join('')

  const righeArretrati = opts.arretrati
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 12px 6px 0;white-space:nowrap"><strong>${r.codice}</strong></td>
        <td style="padding:6px 12px 6px 0;white-space:nowrap">${r.giorni} giorni</td>
        <td style="padding:6px 12px 6px 0;white-space:nowrap">${r.stato}</td>
        <td style="padding:6px 0">${r.problema.slice(0, 90)}</td>
      </tr>`,
    )
    .join('')

  const quanti = opts.nuovi.length
  await sendEmail({
    to: opts.to,
    subject: `Assistenza IT — ${quanti} ${quanti === 1 ? 'nuova richiesta' : 'nuove richieste'}${
      opts.arretrati.length ? ` · ${opts.arretrati.length} in attesa da giorni` : ''
    }`,
    html: BOX(`
      <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#1F4E79">
        🛠 Assistenza IT — riepilogo del giorno
      </p>
      ${
        quanti
          ? `<p style="margin:0 0 4px;font-weight:700">Nuove richieste</p>
             <table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;margin:0 0 16px">${righeNuovi}</table>`
          : '<p style="margin:0 0 16px;color:#666">Nessuna nuova richiesta.</p>'
      }
      ${
        opts.arretrati.length
          ? `<p style="margin:0 0 4px;font-weight:700;color:#E36C09">Aperte da un po'</p>
             <table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;margin:0 0 16px">${righeArretrati}</table>`
          : ''
      }
      <p style="margin:8px 0 0">${BTN(opts.linkApp, 'Vai alla gestione →', '#1F4E79')}</p>
    `),
  })
}

/**
 * Ticket assegnato → solo all'operatore, subito.
 *
 * Il digest dice "c'è del lavoro", questa dice "il lavoro è tuo". Chi si
 * assegna un ticket da sé non la riceve: lo sa già.
 */
export async function notificaAssegnazioneTicket(opts: {
  to: string
  assegnatoNome?: string
  assegnataDa: string
  codice: string
  richiedente: string
  tipologia: string
  categoria: string
  dispositivo?: string
  priorita: string
  problema: string
  struttura?: string
  recapito?: string
  disponibilita?: string
  linkApp: string
}): Promise<void> {
  const c = colore(opts.priorita)
  await sendEmail({
    to: opts.to,
    subject: `${opts.codice} — assegnato a te${opts.priorita === 'Critica' ? ' [CRITICO]' : ''}`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:${c}">
        📌 Richiesta di assistenza assegnata a te
      </p>
      ${opts.assegnatoNome ? `<p style="margin:0 0 6px">Ciao ${opts.assegnatoNome},</p>` : ''}
      <p style="margin:0 0 4px"><strong>${opts.assegnataDa}</strong> ti ha assegnato il ticket
      <strong>${opts.codice}</strong>.</p>
      ${dettaglio(opts)}
      <p style="margin:16px 0 0">${BTN(opts.linkApp, 'Gestisci il ticket →', c)}</p>
    `),
  })
}

/** Il richiedente ha riaperto: il problema non era risolto. */
export async function notificaRiapertura(opts: {
  to: string[]
  codice: string
  richiedente: string
  problema: string
  perche?: string
  riaperture: number
  linkApp: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `${opts.codice} — riaperto dal richiedente`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#E36C09">
        ↩️ Il problema si è ripresentato
      </p>
      <p style="margin:0 0 4px"><strong>${opts.richiedente}</strong> ha riaperto il ticket
      <strong>${opts.codice}</strong>${
        opts.riaperture > 1
          ? ` — è la <strong>${opts.riaperture}ª</strong> volta.`
          : '.'
      }</p>
      ${TABELLA(
        RIGA('Problema', opts.problema) +
          (opts.perche ? RIGA('Cosa succede adesso', opts.perche) : ''),
      )}
      <p style="margin:16px 0 0">${BTN(opts.linkApp, 'Riprendi il ticket →', '#E36C09')}</p>
    `),
  })
}

// ============================================================
// Verso il richiedente
// ============================================================

/** Presa in carico: qualcuno ha visto la richiesta e ha un nome. */
export async function notificaPresaInCarico(opts: {
  to: string
  richiedenteNome?: string
  codice: string
  problema: string
  operatore: string
  priorita: string
  linkApp: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `${opts.codice} — la tua richiesta è stata presa in carico`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1F4E79">
        👀 Ci stiamo lavorando
      </p>
      ${opts.richiedenteNome ? `<p style="margin:0 0 6px">Ciao ${opts.richiedenteNome},</p>` : ''}
      <p style="margin:0 0 4px">la tua richiesta <strong>${opts.codice}</strong> è stata presa in
      carico da <strong>${opts.operatore}</strong>.</p>
      ${TABELLA(
        RIGA('Problema', opts.problema) +
          RIGA('Priorità', `<span style="color:${colore(opts.priorita)}">${opts.priorita}</span>`),
      )}
      <p style="margin:16px 0 0">${BTN(opts.linkApp, 'Vedi le tue richieste →', '#1F4E79')}</p>
    `),
  })
}

/** L'IT ha bisogno di sapere qualcosa: finché non risponde, la palla è sua. */
export async function notificaRichiestaInfo(opts: {
  to: string
  richiedenteNome?: string
  codice: string
  problema: string
  messaggio: string
  operatore: string
  linkApp: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `${opts.codice} — ci serve una informazione da te`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#E36C09">
        ❓ Domanda su ${opts.codice}
      </p>
      ${opts.richiedenteNome ? `<p style="margin:0 0 6px">Ciao ${opts.richiedenteNome},</p>` : ''}
      <p style="margin:0 0 4px"><strong>${opts.operatore}</strong> ti chiede:</p>
      <p style="margin:8px 0;padding:10px 12px;background:#FFF7ED;border-left:3px solid #E36C09">
        ${opts.messaggio}
      </p>
      <p style="margin:0 0 4px;color:#666">Rispondi a questa mail o chiamalo: il ticket resta in
      attesa finché non ci sentiamo.</p>
      ${TABELLA(RIGA('Problema segnalato', opts.problema))}
      <p style="margin:16px 0 0">${BTN(opts.linkApp, 'Vedi le tue richieste →', '#E36C09')}</p>
    `),
  })
}

/**
 * Risolto.
 *
 * Contiene cosa è stato fatto e come dire che non è vero: il pulsante di
 * riapertura è nella pagina "Le mie richieste", non in un link tokenizzato —
 * chi legge questa mail ha già un account.
 */
export async function notificaRisolto(opts: {
  to: string
  richiedenteNome?: string
  codice: string
  problema: string
  interventi?: string
  operatore: string
  giorniRiapertura: number
  linkApp: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `${opts.codice} — risolto`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#2E7D32">
        ✅ Richiesta risolta
      </p>
      ${opts.richiedenteNome ? `<p style="margin:0 0 6px">Ciao ${opts.richiedenteNome},</p>` : ''}
      <p style="margin:0 0 4px">la richiesta <strong>${opts.codice}</strong> è stata chiusa da
      <strong>${opts.operatore}</strong>.</p>
      ${TABELLA(
        RIGA('Problema segnalato', opts.problema) +
          (opts.interventi ? RIGA('Cosa abbiamo fatto', opts.interventi) : ''),
      )}
      <p style="margin:10px 0 0;color:#666">Se il problema si ripresenta, entro
      ${opts.giorniRiapertura} giorni puoi riaprire il ticket con un clic da "Le mie richieste":
      resta tutto lo storico, non serve riscrivere niente.</p>
      <p style="margin:16px 0 0">${BTN(opts.linkApp, 'Le mie richieste →', '#2E7D32')}</p>
    `),
  })
}

/** Annullato: si dice perché, sempre. */
export async function notificaAnnullato(opts: {
  to: string
  richiedenteNome?: string
  codice: string
  problema: string
  motivo: string
  operatore: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `${opts.codice} — richiesta annullata`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#555">
        Richiesta annullata
      </p>
      ${opts.richiedenteNome ? `<p style="margin:0 0 6px">Ciao ${opts.richiedenteNome},</p>` : ''}
      <p style="margin:0 0 4px">la richiesta <strong>${opts.codice}</strong> è stata annullata da
      <strong>${opts.operatore}</strong>.</p>
      ${TABELLA(RIGA('Problema segnalato', opts.problema) + RIGA('Motivo', opts.motivo))}
    `),
  })
}
