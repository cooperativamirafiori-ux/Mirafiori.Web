'use client'

/**
 * Lettura degli errori delle API dell'area Risorse Umane, lato client.
 *
 * L'area RU scrive su SharePoint con l'identità dell'utente, quindi ha due
 * fallimenti che le altre sezioni non hanno e che vanno distinti, altrimenti
 * ogni problema di permessi diventa una richiesta di assistenza:
 *
 * - `401 { codice: 'riautenticazione' }` — il token Microsoft è scaduto o
 *   revocato. Nessun ritentativo aiuta: serve un nuovo accesso, quindi si
 *   reindirizza al login.
 * - `403 { codice: 'permessi-sito' }` — l'utente è autenticato ma non è fra i
 *   membri del sito Risorse Umane. Si mostra il messaggio del server, che dice
 *   cosa fare, senza reindirizzare da nessuna parte.
 *
 * Uso:
 *   if (!res.ok) throw new Error(await messaggioErrore(res, 'Errore salvataggio'))
 */

export async function messaggioErrore(res: Response, fallback: string): Promise<string> {
  let dati: { error?: string; codice?: string } | null = null
  try {
    dati = await res.json()
  } catch {
    /* risposta senza corpo JSON */
  }

  if (res.status === 401 && dati?.codice === 'riautenticazione') {
    if (typeof window !== 'undefined') {
      // Sostituisce la voce nella cronologia: tornando indietro non si finisce
      // su una pagina che rifarebbe subito la stessa chiamata fallita.
      window.location.replace('/login?motivo=sessione-scaduta')
    }
    return dati?.error ?? 'Sessione scaduta: reindirizzamento all’accesso…'
  }

  return dati?.error ?? fallback
}
