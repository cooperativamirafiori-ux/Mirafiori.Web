/**
 * Verifica lo stato di firma DocuSign di una prestazione e, se completata,
 * scarica i documenti firmati e li archivia nella cartella SharePoint,
 * portando lo stato a "Contratto firmato".
 *
 * Usato sia dal pulsante "Verifica firma" sia dal cron giornaliero.
 */

import {
  getPrestazioneById,
  aggiornaPrestazione,
  ensureCartellaPrestazione,
  uploadAllegato,
} from '@/lib/prestazioni'
import {
  isDocusignConfigured,
  getEnvelopeStatus,
  downloadEnvelopeCombined,
} from '@/lib/docusign'
import { notificaContrattoFirmato } from '@/lib/notifications'
import type { Prestazione } from '@/types/prestazioni'

const PDF_MIME = 'application/pdf'

export interface EsitoVerificaFirma {
  firmato: boolean
  status: string // stato DocuSign (o 'non-configurato' / 'nessuna-busta')
}

export async function verificaEScaricaFirma(
  prestazione: Prestazione,
): Promise<EsitoVerificaFirma> {
  if (!isDocusignConfigured()) return { firmato: false, status: 'non-configurato' }
  if (!prestazione.docusignEnvelopeId) return { firmato: false, status: 'nessuna-busta' }

  const status = await getEnvelopeStatus(prestazione.docusignEnvelopeId)
  if (status !== 'completed') return { firmato: false, status }

  // Busta completata → scarica il PDF firmato e archivialo
  const pdf = await downloadEnvelopeCombined(prestazione.docusignEnvelopeId)
  const { prestazione: cartella } = await ensureCartellaPrestazione({
    nome: prestazione.nome,
    cognome: prestazione.cognome,
    codiceFiscale: prestazione.codiceFiscale,
    dataCartella: prestazione.dataInserimento,
  })
  await uploadAllegato(
    cartella.path,
    `${prestazione.idPrestazione}_Documenti_firmati.pdf`,
    new Uint8Array(pdf),
    PDF_MIME,
  )
  await aggiornaPrestazione(prestazione.spItemId, { Stato: 'Contratto firmato' })

  // Mail di conferma al responsabile (non bloccante)
  notificaContrattoFirmato({
    responsabileEmail: prestazione.responsabileEmail,
    responsabileNome: prestazione.responsabileNome,
    prestatoreNome: `${prestazione.cognome} ${prestazione.nome}`.trim(),
    idPrestazione: prestazione.idPrestazione,
    cartellaUrl: prestazione.cartellaUrl,
  }).catch(console.error)

  return { firmato: true, status }
}

/** Variante che parte dallo spItemId (carica la prestazione e poi verifica) */
export async function verificaFirmaById(spItemId: string): Promise<EsitoVerificaFirma> {
  const prestazione = await getPrestazioneById(spItemId)
  return verificaEScaricaFirma(prestazione)
}
