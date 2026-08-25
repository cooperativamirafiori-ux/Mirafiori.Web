/**
 * Autorizzazioni: chi è admin e chi può entrare in quale area.
 *
 * Sta in core perché la usano tutte le aree *e* l'autenticazione: se stesse in
 * un modulo d'area, core dipenderebbe da un'area. Si amministra dalla pagina
 * app/(app)/amministrazione/permessi.
 */

import { graphGet, graphPost, graphDelete } from '@/lib/core/graph'
import { listBase, PREFER_NON_INDEXED } from '@/lib/core/sp'

export async function isAdmin(email: string): Promise<boolean> {
  try {
    const filter = encodeURIComponent(`fields/Utente eq '${email}'`)
    const res = await graphGet<{ value: any[] }>(
      `${listBase('admin')}?$filter=${filter}&$top=1&$select=id`
    )
    return res.value.length > 0
  } catch {
    // Se la lista non esiste ancora o c'è errore, fallback su lista hardcoded
    const fallback = [
      'dennis.maseri@cooperativamirafiori.com',
      'stefano.martino@cooperativamirafiori.com',
      'gabriele.uscello@cooperativamirafiori.com',
    ]
    return fallback.includes(email.toLowerCase())
  }
}

// ============================================================
// Permessi per area — lista SP "Autorizzazioni"
// Ogni riga = un permesso concesso a un utente.
// Colonne: Utente (Person, salva l'email) + Area (Choice/Testo, es. "Amministrazione")
// Per dare accesso a un'area: aggiungi una riga (Utente + Area) nella lista SP.
// ============================================================

// Aree note dell'app. Aggiungi qui le nuove aree man mano che le crei.
//
// ⚠️ "Risorse Umane" è stato RIMOSSO il 31/07/2026. Dopo il passaggio dell'area
// anagrafiche al sito dedicato con accesso delegato, il cancello di accesso è
// l'appartenenza al gruppo Microsoft 365 del sito (lib/gruppo-ru.ts): un
// permesso applicativo qui sarebbe un secondo elenco destinato a divergere, e
// un interruttore che non comanda niente è peggio di nessun interruttore —
// fa credere di aver revocato un accesso.
//
// Il cruscotto HR delle timbrature, che legge da Supabase e con SharePoint non
// c'entra, ha invece il suo permesso: "Timbrature HR". Vedi il punto 14 di
// docs/piano-ru-sito-dedicato-accesso-delegato.md.
export const AREE_PERMESSI = ['Amministrazione', 'Prestazioni Occasionali', 'Timbrature HR', 'Acquisti'] as const

export type AreaPermesso = (typeof AREE_PERMESSI)[number]

/**
 * Cosa apre davvero ogni permesso, in una riga.
 *
 * Sta qui accanto all'elenco perché un'area senza spiegazione, nel pannello,
 * è solo un interruttore col nome tecnico: chi assegna gli accessi deve poter
 * capire cosa sta concedendo senza andare a leggere il codice. Aggiungendo
 * un'area nuova ad `AREE_PERMESSI`, aggiungere la riga anche qui.
 */
export const DESCRIZIONI_AREE: Record<string, string> = {
  Amministrazione:
    'Pannello Amministrazione: assegnazione dei permessi, gestione software e abbonamenti.',
  'Prestazioni Occasionali':
    'Ritenute d’acconto: nuove prestazioni, prestazioni attive, notule e documenti.',
  'Timbrature HR':
    'Cruscotto presenze di tutto il personale, validazione mensile dei fogli ore.',
  Acquisti:
    'Gestione delle richieste d’acquisto: approvazione, ordini, consegne e inventario beni.',
}

// Fallback usato se la lista SP non esiste ancora o Graph fallisce.
// Mappa email -> aree concesse.
const PERMESSI_FALLBACK: Record<string, string[]> = {
  'dennis.maseri@cooperativamirafiori.com': ['Amministrazione'],
}

/**
 * Ritorna l'elenco delle aree a cui l'utente ha accesso.
 * Legge la lista SP "Autorizzazioni"; in caso di errore usa il fallback.
 */
export async function getPermessi(email: string): Promise<string[]> {
  const e = email.toLowerCase()
  try {
    const filter = encodeURIComponent(`fields/Utente eq '${email}'`)
    const res = await graphGet<{ value: Array<{ fields?: { Area?: string } }> }>(
      `${listBase('autorizzazioni')}?$filter=${filter}&$select=id&$expand=fields($select=Area)&$top=200`,
      PREFER_NON_INDEXED
    )
    const aree = res.value
      .map((r) => r.fields?.Area)
      .filter((a): a is string => typeof a === 'string' && a.length > 0)
    // De-duplica preservando l'ordine
    return Array.from(new Set(aree))
  } catch {
    return PERMESSI_FALLBACK[e] ?? []
  }
}

export interface Autorizzazione {
  id: string
  utente: string
  area: string
}

/** Legge tutte le righe della lista Autorizzazioni (per il pannello di gestione). */

export async function getTutteAutorizzazioni(): Promise<Autorizzazione[]> {
  const res = await graphGet<{
    value: Array<{ id: string; fields?: { Utente?: string; Area?: string } }>
  }>(
    `${listBase('autorizzazioni')}?$select=id&$expand=fields($select=Utente,Area)&$top=500`
  )
  return res.value
    .filter((r) => r.fields?.Utente && r.fields?.Area)
    .map((r) => ({
      id: r.id,
      utente: (r.fields!.Utente as string).toLowerCase(),
      area: r.fields!.Area as string,
    }))
}

/** Concede un'area a un utente. Idempotente: non duplica se già presente. */

export async function aggiungiAutorizzazione(
  email: string,
  area: string
): Promise<Autorizzazione> {
  const e = email.toLowerCase().trim()
  const filter = encodeURIComponent(`fields/Utente eq '${e}' and fields/Area eq '${area}'`)
  const esistente = await graphGet<{ value: Array<{ id: string }> }>(
    `${listBase('autorizzazioni')}?$filter=${filter}&$select=id&$top=1`,
    PREFER_NON_INDEXED
  )
  if (esistente.value.length > 0) {
    return { id: esistente.value[0].id, utente: e, area }
  }
  const creato = await graphPost<{ id: string }>(listBase('autorizzazioni'), {
    fields: { Title: e, Utente: e, Area: area },
  })
  return { id: creato.id, utente: e, area }
}

/** Revoca un'autorizzazione dato l'ID della riga SP. */

export async function rimuoviAutorizzazione(itemId: string): Promise<void> {
  await graphDelete(`${listBase('autorizzazioni')}/${itemId}`)
}

/**
 * Email di chi ha accesso a un'area. Serve per sapere a chi notificare senza
 * dover manutenere una seconda lista di destinatari: chi gestisce l'area è
 * esattamente chi riceve gli avvisi dell'area.
 *
 * Non lancia: in caso di errore ritorna un array vuoto, così una notifica
 * mancata non blocca l'operazione dell'utente.
 */
export async function getUtentiPerArea(area: string): Promise<string[]> {
  try {
    const tutte = await getTutteAutorizzazioni()
    return Array.from(
      new Set(tutte.filter((a) => a.area === area).map((a) => a.utente)),
    )
  } catch (err) {
    console.error('[SP] getUtentiPerArea fallito', area, err)
    return []
  }
}
