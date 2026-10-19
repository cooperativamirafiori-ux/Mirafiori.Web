/**
 * Preventivi — i testi delle mail.
 *
 *   - preventivo accettato → ad Andrea (chi fattura), con il PDF definitivo:
 *     è il momento in cui sa cosa fatturare, e non prima (riunione 19/10);
 *   - promemoria ogni GIORNI_SOLLECITO giorni a chi ha emesso un preventivo
 *     ancora senza esito: "è stato accettato? ti basta un clic".
 *
 * Destinatario di "accettato": PREVENTIVI_MAIL_TO, altrimenti FATTURE_MAIL_TO
 * (la casella che riceve già le richieste fattura), infine Andrea.
 */

import { BOX, BTN, RIGA, TABELLA, sendEmail } from '@/lib/core/mailer'
import { MODELLI, type Preventivo } from '@/types/preventivi'
import { dataIt, euro } from './calcoli'
import { nomeFile } from './documento'

const APP = () => (process.env.APP_BASE_URL || 'https://mirafiori-web.vercel.app').replace(/\/+$/, '')
export const linkPreventivo = (id: string) => `${APP()}/preventivi/${id}`

export function destinatariFatturazione(): string[] {
  return String(process.env.PREVENTIVI_MAIL_TO || process.env.FATTURE_MAIL_TO || 'andrea.granato@cooperativamirafiori.com')
    .split(/[;,\s]+/)
    .filter((e) => e.includes('@'))
}

export async function notificaAccettato(p: Preventivo, pdf: Buffer | null, chi: string): Promise<void> {
  const to = destinatariFatturazione()
  if (!to.length) return
  const html = BOX(`
    <p><strong>Preventivo accettato</strong>: da qui in poi è un intervento da fatturare.</p>
    ${TABELLA(
      RIGA('Protocollo', `${p.numero}${p.revisione > 1 ? ` (rev. ${p.revisione})` : ''}`) +
        RIGA('Servizio', p.ccNome || p.ccCodice) +
        RIGA('Ente', p.destinatario.ente) +
        RIGA('A favore di', p.beneficiario) +
        RIGA('Tipo', p.tipoProgetto || MODELLI[p.modello]) +
        RIGA('Ripartizione', p.ripartizione) +
        RIGA('Periodo', `${dataIt(p.dal)} – ${dataIt(p.al)}`) +
        RIGA('Totale mensile', euro(p.totaleMensile)) +
        RIGA('Accettato il', dataIt(p.esitoIl)) +
        RIGA('Segnato da', chi) +
        (p.notaEsito ? RIGA('Nota', p.notaEsito) : ''),
    )}
    ${pdf ? '<p>Il PDF definitivo è allegato ed è archiviato in "Preventivi accettati".</p>' : '<p>⚠️ Il PDF non si è potuto generare: aprilo dall’app.</p>'}
    ${BTN(linkPreventivo(p.spItemId), 'Apri nell’app', '#00728F')}
  `)
  await sendEmail({
    to,
    subject: `Preventivo accettato ${p.numero} — ${p.ccNome || p.ccCodice}`,
    html,
    attachments: pdf
      ? [{ filename: nomeFile(p, 'pdf'), contentBase64: pdf.toString('base64'), contentType: 'application/pdf' }]
      : undefined,
  })
}

export async function notificaSollecito(to: string, elenco: Preventivo[]): Promise<void> {
  const righe = elenco
    .map(
      (p) =>
        `<li style="margin-bottom:8px"><strong>${p.numero}</strong> · ${p.destinatario.ente || '—'} · ${p.beneficiario || '—'}<br>
         <span style="color:#666">inviato il ${dataIt(p.emessoIl)}</span><br>
         <a href="${linkPreventivo(p.spItemId)}">Segna l’esito</a></li>`,
    )
    .join('')
  await sendEmail({
    to,
    subject:
      elenco.length === 1
        ? `Il preventivo ${elenco[0].numero} è stato accettato?`
        : `${elenco.length} preventivi aspettano l’esito`,
    html: BOX(`
      <p>Questi preventivi sono partiti ma nell’app non risulta ancora com’è andata.</p>
      <ul style="padding-left:18px">${righe}</ul>
      <p>Se è stato accettato ti basta aprirlo e premere <strong>«È stato accettato»</strong>:
      Andrea riceve il definitivo e sa cosa fatturare. Se l’ente ha chiesto modifiche,
      <strong>«Riapri per correggere»</strong>.</p>
      ${BTN(`${APP()}/preventivi?stato=emesso`, 'I miei preventivi in attesa', '#00728F')}
    `),
  })
}
