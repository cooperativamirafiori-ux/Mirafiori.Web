/**
 * Qonto — la mail del lunedì con l'estratto conto settimanale.
 *
 * Destinatari: ESTRATTI_QONTO_MAIL_TO (uno o più indirizzi separati da virgola
 * o punto e virgola), altrimenti Alessandro Buzzi — che fa la contabilità e
 * non deve entrare in Qonto (Claudia, 29/10/2026).
 */

import { BOX, RIGA, TABELLA, sendEmail } from '@/lib/core/mailer'
import { generaXlsxEstratto, nomeFileEstratto, type Estratto } from './estratto'

const CT_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function destinatariEstratto(): string[] {
  return String(process.env.ESTRATTI_QONTO_MAIL_TO || 'alessandro.buzzi@cooperativamirafiori.com')
    .split(/[;,\s]+/)
    .filter((e) => e.includes('@'))
}

const euro = (n: number) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const dataIt = (g: string) => g.split('-').reverse().join('/')

/** Manda l'estratto. `a` sostituisce i destinatari (invio di prova). Ritorna a chi è andato. */
export async function mandaEstratto(e: Estratto, a?: string[]): Promise<string[]> {
  const to = a?.length ? a : destinatariEstratto()
  if (!to.length) return []
  const xlsx = await generaXlsxEstratto(e)
  const movimenti = e.righe.reduce((n, r) => n + r.movimenti.length, 0)
  const entrate = e.righe.reduce((n, r) => n + r.entrate, 0)
  const uscite = e.righe.reduce((n, r) => n + r.uscite, 0)
  const periodo = `dal ${dataIt(e.settimana.dal)} al ${dataIt(e.settimana.al)}`

  await sendEmail({
    to,
    subject: `Estratto conti Qonto ${periodo}`,
    html: BOX(`
      <p>In allegato l'estratto di tutti i conti Qonto della cooperativa, ${periodo}.</p>
      ${TABELLA(
        RIGA('Conti', String(e.righe.length)) +
          RIGA('Movimenti', String(movimenti)) +
          RIGA('Entrate', euro(entrate)) +
          RIGA('Uscite', euro(uscite)),
      )}
      <p style="color:#666;font-size:12px">Solo movimenti contabilizzati. Entrate e uscite comprendono i giroconti fra conti della cooperativa, segnati nel foglio Movimenti.
      Mail automatica dell'app Mirafiori, ogni lunedì.</p>
    `),
    attachments: [{ filename: nomeFileEstratto(e.settimana), contentBase64: xlsx.toString('base64'), contentType: CT_XLSX }],
  })
  return to
}
