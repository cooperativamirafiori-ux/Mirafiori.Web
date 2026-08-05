/**
 * Caricamento diretto browser → SharePoint, a blocchi.
 *
 * Il nostro server non vede mai i byte del file: apre solo la sessione di
 * upload su Graph e restituisce al browser un URL pre-autorizzato. Prima il
 * file transitava dalla memoria di una funzione serverless su Vercel, e da lì
 * derivava il limite dei 4 MB dell'upload semplice di Graph.
 *
 * ⚠️ Sull'URL della sessione NON va inviato nessun header Authorization: è già
 * autorizzato in sé, e aggiungerne uno fa rifiutare la richiesta da SharePoint.
 *
 * Modulo condiviso lato client: NON importare nulla di server-side qui.
 */

/**
 * Dimensione dei blocchi: 5 MiB.
 *
 * Graph richiede che ogni blocco, tranne l'ultimo, sia un multiplo di 320 KiB —
 * 5 MiB lo è esattamente (16 × 320 KiB). Blocchi più piccoli danno una barra di
 * avanzamento più fluida ma più round trip; questo è un compromesso ragionevole.
 */
export const BLOCCO_UPLOAD = 5 * 1024 * 1024

/** Tetto condiviso client/server per tutti gli upload diretti dell'app. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export function maxUploadMb(): number {
  return Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)
}

/**
 * Invia il file all'`uploadUrl` della sessione Graph, un blocco per volta.
 * `onAvanzamento` riceve la percentuale completata (0-100).
 */
export async function inviaFileABlocchi(
  uploadUrl: string,
  file: File | Blob,
  onAvanzamento?: (percentuale: number) => void,
): Promise<void> {
  const totale = file.size

  // File vuoto: una sola PUT senza Content-Range, altrimenti Graph rifiuta.
  if (totale === 0) {
    const r = await fetch(uploadUrl, { method: 'PUT', body: file })
    if (!r.ok) throw new Error(`Caricamento rifiutato da SharePoint (${r.status}).`)
    onAvanzamento?.(100)
    return
  }

  for (let inizio = 0; inizio < totale; inizio += BLOCCO_UPLOAD) {
    const fine = Math.min(inizio + BLOCCO_UPLOAD, totale)
    const r = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${inizio}-${fine - 1}/${totale}` },
      body: file.slice(inizio, fine),
    })
    // 202 = blocco accettato, ne aspetta altri. 200/201 = file completo.
    if (r.status !== 202 && r.status !== 200 && r.status !== 201) {
      const dettaglio = await r.text().catch(() => '')
      throw new Error(
        `Caricamento interrotto al ${Math.round((inizio / totale) * 100)}% ` +
          `(${r.status}). ${dettaglio.slice(0, 160)}`,
      )
    }
    onAvanzamento?.(Math.round((fine / totale) * 100))
  }
}

/** Estrae il messaggio d'errore da una risposta JSON delle nostre API. */
export async function erroreRisposta(res: Response, fallback: string): Promise<string> {
  try {
    const d = await res.json()
    return d?.error ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Ciclo completo: apre la sessione sulla nostra API, invia i blocchi a
 * SharePoint, poi chiama la conferma. `apriSessione` e `conferma` sono le due
 * sole chiamate che passano dal nostro server.
 */
export async function caricaDirettamente<T = unknown>(opzioni: {
  file: File
  /** URL della nostra API che apre la sessione (POST JSON) */
  urlSessione: string
  /** Campi extra da inviare insieme a filename/dimensione */
  datiSessione?: Record<string, unknown>
  /** URL della nostra API di conferma (POST JSON con { nomeFile }) */
  urlConferma: string
  /** Campi extra da inviare alla conferma */
  datiConferma?: Record<string, unknown>
  onAvanzamento?: (percentuale: number) => void
}): Promise<T> {
  const { file, urlSessione, datiSessione, urlConferma, datiConferma, onAvanzamento } = opzioni

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File troppo grande (max ${maxUploadMb()} MB): ${file.name}`)
  }

  const resSessione = await fetch(urlSessione, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      dimensione: file.size,
      contentType: file.type || 'application/octet-stream',
      ...datiSessione,
    }),
  })
  if (!resSessione.ok) {
    throw new Error(await erroreRisposta(resSessione, 'Errore apertura caricamento'))
  }
  const { uploadUrl, nomeFile } = (await resSessione.json()) as {
    uploadUrl: string
    nomeFile: string
  }

  await inviaFileABlocchi(uploadUrl, file, onAvanzamento)

  const resConferma = await fetch(urlConferma, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nomeFile, ...datiConferma }),
  })
  if (!resConferma.ok) {
    throw new Error(await erroreRisposta(resConferma, 'Errore conferma caricamento'))
  }
  return (await resConferma.json()) as T
}
