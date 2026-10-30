/**
 * Domanda di ammissione socio — la mail a Claudia.
 *
 * Parte alla registrazione, con la scheda progressiva in allegato: Claudia la
 * stampa sul libro vidimato (29/10/2026). Il file è anche già salvato in
 * SCHEDE PROGRESSIVE DA STAMPARE, insieme alle altre.
 *
 * Destinatari: SOCI_MAIL_TO (uno o più indirizzi separati da virgola o punto e
 * virgola), altrimenti la casella delle Risorse Umane.
 */

import { BOX, BTN, RIGA, TABELLA, sendEmail } from '@/lib/core/mailer'
import { etichettaTipo, MODALITA_VERSAMENTO, NUMERO_QUOTE, totaleQuote, type DatiDomanda } from '@/types/soci'

const CT_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function destinatariSoci(): string[] {
  return String(process.env.SOCI_MAIL_TO || 'risorseumane@cooperativamirafiori.com')
    .split(/[;,\s]+/)
    .filter((e) => e.includes('@'))
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const dataIt = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
const euro = (n: number) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €`

export async function mailNuovoSocio(p: {
  numero: number
  dati: DatiDomanda
  dataDomanda: string
  domandaUrl: string
  schedaUrl: string
  schedaNome: string
  xlsx: Buffer
  differenze: { campo: string; scheda: string; domanda: string }[]
  avvisi: string[]
  tipoRapportoAggiornato: boolean
}): Promise<void> {
  const to = destinatariSoci()
  if (!to.length) return
  const d = p.dati
  const nominativo = `${d.cognome} ${d.nome}`.trim()
  const modalita = MODALITA_VERSAMENTO.find((m) => m.valore === d.modalita)?.etichetta ?? ''

  const differenze = p.differenze.length
    ? `<p style="margin-top:18px"><strong>Da controllare:</strong> nella domanda alcuni dati sono diversi da quelli della scheda RU.
       La scheda <u>non</u> l'ho cambiata.</p>
       ${TABELLA(p.differenze.map((x) => RIGA(esc(x.campo), `scheda: ${esc(x.scheda)}<br>domanda: ${esc(x.domanda)}`)).join(''))}`
    : ''
  const avvisi = p.avvisi.length
    ? `<p style="margin-top:18px"><strong>Avvisi:</strong></p><ul>${p.avvisi.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`
    : ''

  const html = BOX(`
    <p><strong>${esc(nominativo)}</strong> ha caricato la domanda di ammissione firmata.
    L'app l'ha registrata con il numero <strong>${p.numero}</strong> dell'Elenco Generale.</p>
    ${TABELLA(
      RIGA('N. Elenco Generale', String(p.numero)) +
        RIGA('Tipo di socio', esc(etichettaTipo(d.tipoSocio))) +
        RIGA('Codice fiscale', esc(d.codiceFiscale)) +
        RIGA('Data della domanda', dataIt(p.dataDomanda)) +
        RIGA('Capitale sottoscritto', `${NUMERO_QUOTE} quote = ${euro(totaleQuote())}`) +
        RIGA('Versamento', esc(modalita)),
    )}
    <p>Nella scheda RU ho segnato <em>Socio: Sì</em>, il numero e la quota sottoscritta${
      p.tipoRapportoAggiornato ? ', e il tipo di rapporto ora è <em>Socio lavoratore</em>' : ''
    }. La <strong>data di ammissione</strong> resta vuota: va inserita dopo la delibera del CdA.</p>
    <p>La scheda progressiva è in allegato e salvata in <em>SCHEDE PROGRESSIVE DA STAMPARE</em>.</p>
    ${differenze}
    ${avvisi}
    <p style="margin-top:18px">
      ${BTN(p.schedaUrl, 'Apri la scheda progressiva', '#00728F')}
      ${BTN(p.domandaUrl, 'Apri la domanda firmata', '#64748b')}
    </p>
  `)

  await sendEmail({
    to,
    subject: `Nuovo socio n. ${p.numero} — ${nominativo}`,
    html,
    attachments: [{ filename: p.schedaNome, contentBase64: p.xlsx.toString('base64'), contentType: CT_XLSX }],
  })
}
