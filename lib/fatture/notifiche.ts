/**
 * Mail dell'area Richiesta Fattura.
 *
 * Una sola mail: il riepilogo a chi emette materialmente la fattura, con dentro
 * tutti i dati così come sono stati compilati — deve poter fatturare senza
 * aprire l'app né rincorrere il richiedente.
 *
 * In copia va anche chi ha fatto la richiesta: è la sua ricevuta, e se ha
 * sbagliato un dato se ne accorge subito invece che a fattura emessa.
 *
 * Destinatario configurabile con FATTURE_MAIL_TO (più indirizzi separati da
 * virgola). Il default è nel codice di proposito: se la variabile manca su
 * Vercel la richiesta arriva lo stesso a qualcuno.
 */

import { sendEmail, BOX, RIGA, TABELLA } from '@/lib/core/mailer'
import { chiedeCondominio, intestatario, type RichiestaFattura } from '@/types/fatture'
import { nomeNazione, type Cliente } from '@/types/clienti'

const DESTINATARI = (
  process.env.FATTURE_MAIL_TO || 'andrea.granato@cooperativamirafiori.com'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export function destinatariFatture(): string[] {
  return DESTINATARI
}

const euro = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)

const giorno = (ymd: string) => {
  const s = String(ymd ?? '').slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}

/**
 * Riepilogo della richiesta → chi emette la fattura, con il richiedente in copia.
 *
 * Se il cliente è in anagrafica si aggiungono i dati che il modulo non chiede
 * (codice IPA, cellulare, condizioni di pagamento): sono già in casa, e
 * riportarli qui evita che vengano cercati a mano nel gestionale.
 */
export async function notificaRichiestaFattura(
  r: RichiestaFattura,
  anagrafica?: {
    cliente: Cliente
    esito: 'creato' | 'aggiornato' | 'invariato'
    cambiati: Array<{ campo: string; da: string; a: string }>
  },
): Promise<void> {
  const cliente = intestatario(r)
  const indirizzo = [
    r.indirizzo,
    [r.cap, r.citta, r.provincia ? `(${r.provincia})` : ''].filter(Boolean).join(' '),
    nomeNazione(r.nazione),
  ]
    .filter(Boolean)
    .join(' — ')

  const righeIntestatario =
    RIGA('Tipologia', r.tipoSoggetto) +
    RIGA('Nazionalità', r.nazionalita) +
    (chiedeCondominio(r.tipoSoggetto) ? RIGA('Condominio', r.condominio ? 'Sì' : 'No') : '') +
    (r.ragioneSociale ? RIGA('Ragione sociale', r.ragioneSociale) : '') +
    (r.cognome || r.nome ? RIGA('Cognome e nome', `${r.cognome} ${r.nome}`.trim()) : '') +
    (r.partitaIva ? RIGA('Partita IVA', r.partitaIva) : '') +
    (r.codiceFiscale ? RIGA('Codice fiscale', r.codiceFiscale) : '')

  const c = anagrafica?.cliente
  const recapiti =
    RIGA('Indirizzo', indirizzo) +
    (r.telefono ? RIGA('Telefono', r.telefono) : '') +
    (c?.cellulare ? RIGA('Cellulare', c.cellulare) : '') +
    RIGA('Email', r.email) +
    (r.pec ? RIGA('PEC', r.pec) : '') +
    (r.codiceSdi ? RIGA('Codice destinatario', r.codiceSdi) : '') +
    (c?.codiceIpa ? RIGA('Codice IPA', c.codiceIpa) : '') +
    (c?.codiceEstero ? RIGA('Codice identificativo estero', c.codiceEstero) : '')

  const condizioni = c
    ? (c.tipoPagamento ? RIGA('Tipo pagamento', c.tipoPagamento) : '') +
      (c.scadenza ? RIGA('Scadenza', c.scadenza) : '') +
      (c.addebitoBollo ? RIGA('Addebito bollo', c.addebitoBollo) : '')
    : ''

  /** Cosa è successo all'anagrafica. Va detto: la scheda cliente è cambiata. */
  const nota = !anagrafica
    ? ''
    : anagrafica.esito === 'creato'
      ? `<p style="margin:14px 0 0;padding:10px 12px;background:#FFF6E5;border-left:3px solid #E36C09;color:#7a4a00">
           <strong>Cliente nuovo</strong>: è stato aggiunto all'anagrafica.
         </p>`
      : anagrafica.cambiati.length
        ? `<p style="margin:14px 0 0;padding:10px 12px;background:#FFF6E5;border-left:3px solid #E36C09;color:#7a4a00">
             <strong>Anagrafica aggiornata</strong> su questi campi:<br>
             ${anagrafica.cambiati
               .map((d) => `${d.campo}: <s>${d.da}</s> → <strong>${d.a}</strong>`)
               .join('<br>')}
           </p>`
        : ''

  const fattura =
    RIGA('Descrizione', r.descrizione) +
    RIGA('Importo', euro(r.importo)) +
    RIGA('Data prestazione', giorno(r.dataPrestazione)) +
    RIGA('Centro di costo', r.centroCosto) +
    RIGA('Richiesta da', `${r.richiedenteNome || r.richiedente} (${r.richiedente})`) +
    (r.note ? RIGA('Note', r.note) : '')

  await sendEmail({
    to: Array.from(new Set([...DESTINATARI, r.richiedente])),
    subject: `[Fattura] ${r.numero} — ${cliente} · ${euro(r.importo)}`,
    html: BOX(`
      <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#005B7F">
        🧾 Nuova richiesta di fattura — ${r.numero}
      </p>
      <p style="margin:0 0 14px;color:#666">
        ${r.centroCosto} · richiesta da ${r.richiedenteNome || r.richiedente}
      </p>

      <p style="margin:14px 0 0;font-weight:700">Da fatturare</p>
      ${TABELLA(fattura)}

      <p style="margin:14px 0 0;font-weight:700">Intestatario</p>
      ${TABELLA(righeIntestatario)}

      <p style="margin:14px 0 0;font-weight:700">Recapiti</p>
      ${TABELLA(recapiti)}

      ${condizioni ? `<p style="margin:14px 0 0;font-weight:700">Condizioni in anagrafica</p>${TABELLA(condizioni)}` : ''}
      ${nota}

      <p style="margin:18px 0 0;font-size:12px;color:#999">
        Richiesta registrata nella lista «Fatture inviate» del sito Controllo Gestione.
        Se un dato è sbagliato, chi ha fatto la richiesta riceve questa stessa mail:
        basta rispondere a lui.
      </p>
    `),
  })
}
