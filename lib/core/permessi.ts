/**
 * Autorizzazioni: chi è admin e chi può entrare in quale area.
 *
 * Sta in core perché la usano tutte le aree *e* l'autenticazione: se stesse in
 * un modulo d'area, core dipenderebbe da un'area. Si amministra dalla pagina
 * app/(app)/amministrazione/permessi.
 */

import { graphGet, graphPost, graphDelete } from '@/lib/core/graph'
import { listBase, LIST, PREFER_NON_INDEXED } from '@/lib/core/sp'
import { AREA_IT } from '@/types/it'
import { AREA_MANUTENZIONI } from '@/types/manutenzioni'
import {
  AREA_CONTROLLO_GESTIONE,
  AREA_PAGAMENTI,
  AREA_APPROVAZIONE_PAGAMENTI,
} from '@/types/pagamenti'

/**
 * Gli amministratori scritti nel codice.
 *
 * Sono i tre che gestiscono le manutenzioni: pannello di controllo,
 * inserimento costi, cruscotto costi. Restano qui e non nella lista
 * Autorizzazioni perché non cambiano, e perché un elenco di tre nomi in
 * chiaro si legge senza aprire SharePoint.
 */
export const ADMIN_HARDCODED = [
  'dennis.maseri@cooperativamirafiori.com',
  'stefano.martino@cooperativamirafiori.com',
  'gabriele.uscello@cooperativamirafiori.com',
]

/**
 * Admin dell'app: lista SP "Admin" se configurata, altrimenti i tre qui sopra.
 *
 * Il controllo su `LIST('admin')` è esplicito e non affidato al `catch`:
 * `SP_LIST_ADMIN` oggi è vuota, e prima questo funzionava solo perché l'URL
 * malformato faceva sollevare Graph. Se un domani la lista venisse creata
 * vuota, senza questo controllo i tre perderebbero l'accesso in silenzio.
 */
export async function isAdmin(email: string): Promise<boolean> {
  const e = email.toLowerCase()
  if (!LIST('admin')) return ADMIN_HARDCODED.includes(e)
  try {
    const filter = encodeURIComponent(`fields/Utente eq '${email}'`)
    const res = await graphGet<{ value: any[] }>(
      `${listBase('admin')}?$filter=${filter}&$top=1&$select=id`
    )
    return res.value.length > 0
  } catch {
    // Lista non raggiungibile o errore Graph: si torna all'elenco in codice.
    return ADMIN_HARDCODED.includes(e)
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
// ⚠️ Il Controllo di Gestione ha TRE permessi, non uno, e non è un eccesso di
// zelo: la sezione conterrà i cruscotti dei costi, che vedranno in molti, e i
// flussi delle fatture, che devono restare a quattro persone. Il permesso sta
// quindi sulle sotto-sezioni, e la sezione si apre se se ne ha almeno uno
// (puoEntrareControlloGestione più sotto). Chi domani prenderà il permesso per
// guardare un cruscotto non guadagna niente sui pagamenti.
export const AREE_PERMESSI = [
  'Amministrazione',
  'Prestazioni Occasionali',
  'Timbrature HR',
  'Acquisti',
  // Importata e non riscritta: il nome dell'area serve anche alle route e alle
  // pagine, e due copie della stessa stringa prima o poi divergono di uno spazio.
  AREA_IT,
  AREA_MANUTENZIONI,
  AREA_CONTROLLO_GESTIONE,
  AREA_PAGAMENTI,
  AREA_APPROVAZIONE_PAGAMENTI,
] as const

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
  'IT e Dispositivi':
    'Dispositivi e SIM: anagrafica, assegnazione e restituzione, verbali di consegna. ' +
    'Chi non ha questo permesso vede comunque i propri strumenti in “I miei strumenti”.',
  [AREA_MANUTENZIONI]:
    'Richieste manutenzione: apertura di una nuova richiesta e stato delle proprie. ' +
    'Pensato per i responsabili di struttura. Non apre il pannello di controllo ' +
    'né i costi, che restano ai tre amministratori.',
  [AREA_CONTROLLO_GESTIONE]:
    'Cruscotti dei costi e dei ricavi di tutti i centri di costo. ' +
    'Da solo NON apre i Flussi fatture: le scadenze restano invisibili.',
  [AREA_PAGAMENTI]:
    'Flussi fatture: caricamento dello scadenzario e coda delle fatture da pagare, ' +
    'con il tasto “Pagata”. Le fatture sopra soglia si vedono ma non si approvano.',
  [AREA_APPROVAZIONE_PAGAMENTI]:
    'Approvazione delle fatture sopra soglia, prima che l’amministrazione le paghi. ' +
    'Il resto dei Flussi fatture si vede in sola lettura.',
}

/**
 * Apre la sezione Controllo di Gestione: basta uno qualsiasi dei suoi permessi.
 *
 * La porta non ha un permesso proprio di proposito. Se ne avesse uno, per
 * lasciar entrare un coordinatore ai cruscotti bisognerebbe dargli due
 * permessi, e prima o poi qualcuno gliene darebbe uno di troppo. Qui invece
 * ogni permesso apre esattamente le sue card e niente altro.
 */
export function puoEntrareControlloGestione(permessi: string[] | undefined): boolean {
  if (!permessi) return false
  return (
    permessi.includes(AREA_CONTROLLO_GESTIONE) ||
    permessi.includes(AREA_PAGAMENTI) ||
    permessi.includes(AREA_APPROVAZIONE_PAGAMENTI)
  )
}

/**
 * Può aprire una richiesta di manutenzione: i responsabili di struttura col
 * permesso, più gli admin.
 *
 * Gli admin passano senza avere la riga in Autorizzazioni: chi gestisce i
 * ticket deve poterne aprire uno, e dover ricordarsi di spuntare anche il
 * permesso "richiedente" è esattamente il passaggio che si dimentica.
 *
 * Prende `session.user` invece del solo array dei permessi perché la decisione
 * dipende da due campi: tenerli insieme evita che una pagina controlli il
 * permesso e si dimentichi l'admin.
 */
export function puoRichiedereManutenzione(
  user: { isAdmin?: boolean; permessi?: string[] } | undefined | null,
): boolean {
  if (!user) return false
  return Boolean(user.isAdmin) || (user.permessi?.includes(AREA_MANUTENZIONI) ?? false)
}

/** Vede i Flussi fatture — chi paga e chi approva, ciascuno col suo tasto. */
export function puoVedereFlussiFatture(permessi: string[] | undefined): boolean {
  if (!permessi) return false
  return permessi.includes(AREA_PAGAMENTI) || permessi.includes(AREA_APPROVAZIONE_PAGAMENTI)
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
