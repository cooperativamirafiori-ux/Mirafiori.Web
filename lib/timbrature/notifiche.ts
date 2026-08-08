/**
 * Mail dell'area Timbrature · Foglio ore.
 *
 * Mittente dedicato: un sollecito sul foglio ore deve arrivare da Risorse Umane,
 * non dalla casella degli acquisti, perché la risposta del dipendente deve
 * finire nella casella giusta.
 */

import { sendEmail, BOX, RIGA, TABELLA, BTN } from '@/lib/core/mailer'

/**
 * Mittente delle mail dell'area Timbrature.
 *
 * Un sollecito sul foglio ore deve arrivare da Risorse Umane, non dalla casella
 * che gestisce gli acquisti: il dipendente risponde a chi gli scrive, e la
 * risposta deve finire nella casella giusta.
 */
const TIMBRATURE_MAIL_FROM =
  process.env.TIMBRATURE_MAIL_FROM || 'risorseumane@cooperativamirafiori.com'

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

/**
 * Il foglio ore non si puo' archiviare: la persona non e' in anagrafica RU.
 *
 * Va alle HR e non al responsabile che stava validando, perche' e' un buco che
 * solo loro possono chiudere. Prima il sistema archiviava in silenzio in una
 * cartella di ripiego e nessuno sapeva niente.
 */
export async function notificaDipendenteFuoriAnagrafica(opts: {
  to: string[]
  cognomeNome: string
  email: string
  linkApp: string
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    from: TIMBRATURE_MAIL_FROM,
    subject: `${opts.cognomeNome} non è in anagrafica: foglio ore bloccato`,
    html: BOX(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#C00000">⛔ Foglio ore non archiviato</p>
      <p style="margin:0 0 10px">
        <strong>${opts.cognomeNome}</strong> compila le timbrature, ma non risulta
        nell'anagrafica Risorse Umane con la mail <strong>${opts.email}</strong>.
        Senza scheda non esiste la cartella personale, quindi il foglio ore
        <strong>non e' stato archiviato</strong> e il mese non si chiude.
      </p>
      <p style="margin:0 0 12px">
        Inserisci la persona in anagrafica — o correggi la mail aziendale se e' solo
        diversa — e chiedi al responsabile di validare di nuovo.
      </p>
      <p style="margin:14px 0 4px">${BTN(opts.linkApp, 'Apri l\'anagrafica →', '#C00000')}</p>
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
