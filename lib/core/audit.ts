/**
 * Log applicativo delle azioni utente su SharePoint (lista "Log Attività").
 *
 * Registra CHI (utente loggato in app) fa COSA (azione) su QUALE entità.
 * Serve perché tutte le scritture verso SharePoint/Graph avvengono con il
 * token app-only (client credentials): nei log nativi di SharePoint l'autore
 * risulta sempre l'app, non il vero utente. Qui invece salviamo l'identità
 * reale presa dalla sessione NextAuth.
 *
 * REGOLE:
 *   - Fire-and-forget "sicuro": un errore di logging NON deve MAI far fallire
 *     l'operazione dell'utente. Ogni eccezione viene inghiottita e loggata a console.
 *   - Se la lista non è configurata (SP_LIST_LOG assente) la funzione è un no-op.
 *
 * Env richiesta:
 *   SHAREPOINT_SITE_ID   (già usata dal resto dell'app)
 *   SP_LIST_LOG=<guid lista "Log Attività">
 *
 * Colonne attese nella lista SP (nomi INTERNI, senza spazi/accenti):
 *   Title       (single line)  → codice azione, es. "manutenzione.crea"
 *   Utente      (single line)  → email dell'utente
 *   UtenteNome  (single line)  → nome visualizzato
 *   Entita      (single line)  → tipo entità, es. "RichiestaManutenzione"
 *   EntitaId    (single line)  → id del record interessato
 *   Esito       (single line)  → "ok" | "errore"
 *   Dettagli    (multiple lines)→ payload JSON (campi modificati, importi, ecc.)
 *   Created     (automatico SP) → timestamp
 */

import { graphPost } from '@/lib/core/graph'

export interface LogInput {
  /** Email dell'utente che compie l'azione (dalla sessione NextAuth). */
  utente: string | null | undefined
  /** Nome visualizzato dell'utente. */
  nome?: string | null
  /** Codice macchina dell'azione, es. "software.elimina". */
  azione: string
  /** Tipo di entità coinvolta, es. "Software", "Timbratura". */
  entita?: string
  /** Id del record interessato. */
  entitaId?: string | number | null
  /** Esito dell'operazione. Default "ok". */
  esito?: 'ok' | 'errore'
  /** Dettagli liberi, serializzati in JSON (evitare dati sensibili: CF, IBAN, password). */
  dettagli?: unknown
}

const MAX_DETTAGLI = 30_000

/**
 * Scrive una riga nel log. Non lancia mai: in caso di errore logga a console
 * e prosegue. Attendere il completamento (await) è consigliato in ambiente
 * serverless per garantire che la riga venga effettivamente scritta prima
 * che la funzione termini.
 */
export async function logAzione(input: LogInput): Promise<void> {
  try {
    const site = process.env.SHAREPOINT_SITE_ID
    const list = process.env.SP_LIST_LOG
    if (!site || !list) return // log non configurato → no-op silenzioso

    let dettagliStr = ''
    if (input.dettagli != null) {
      try {
        dettagliStr = JSON.stringify(input.dettagli)
      } catch {
        dettagliStr = String(input.dettagli)
      }
      if (dettagliStr.length > MAX_DETTAGLI) {
        dettagliStr = dettagliStr.slice(0, MAX_DETTAGLI) + '…'
      }
    }

    await graphPost(`/sites/${site}/lists/${list}/items`, {
      fields: {
        Title: input.azione,
        Utente: input.utente ?? '(sconosciuto)',
        UtenteNome: input.nome ?? '',
        Entita: input.entita ?? '',
        EntitaId: input.entitaId != null ? String(input.entitaId) : '',
        Esito: input.esito ?? 'ok',
        Dettagli: dettagliStr,
      },
    })
  } catch (err) {
    console.error('[audit] logAzione fallito (ignorato):', err)
  }
}
