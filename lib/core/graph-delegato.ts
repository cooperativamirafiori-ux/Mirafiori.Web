/**
 * Client Microsoft Graph con l'identità dell'utente (accesso delegato).
 *
 * Espone le stesse operazioni di lib/graph.ts, ma dietro un'interfaccia
 * (`GraphClient`) passata come parametro, così in ogni punto del codice è
 * evidente con quale identità si sta scrivendo. Usato dall'area Risorse Umane
 * perché il log nativo Microsoft riporti la persona reale.
 *
 * Vedi docs/piano-ru-sito-dedicato-accesso-delegato.md §6.
 *
 * ⚠️ NESSUNA CACHE DI MODULO DEL TOKEN. A differenza di lib/graph.ts, che cacha
 * il token applicativo in una variabile globale, qui il token vive solo dentro
 * l'oggetto client, per la durata della singola richiesta: le funzioni
 * serverless vengono riutilizzate fra richieste di utenti diversi, e una cache
 * globale significherebbe operare con l'identità di un'altra persona.
 */

import {
  graphGet,
  graphGetOrNull,
  graphPost,
  graphPatch,
  graphDelete,
  graphPutBinary,
  graphGetBinary,} from '@/lib/core/graph'
import { getDelegatedToken, RiautenticazioneRichiesta } from '@/lib/core/ms-token'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

/**
 * L'utente è autenticato ma SharePoint gli nega l'operazione. Con
 * `Sites.Selected` l'accesso effettivo è l'intersezione fra i siti concessi
 * all'app e i diritti reali della persona: un 403 significa quasi sempre che
 * non è fra i membri del sito Risorse Umane.
 */
export class AccessoNegatoRU extends Error {
  readonly codice = 'permessi-sito' as const
  constructor(
    messaggio = 'Non hai i permessi sul sito Risorse Umane. Contatta Amministrazione.',
  ) {
    super(messaggio)
    this.name = 'AccessoNegatoRU'
  }
}

export interface GraphClient {
  /** Identità con cui opera il client: utile nei log e nei messaggi d'errore. */
  readonly identita: string
  get<T>(path: string, extraHeaders?: Record<string, string>): Promise<T>
  getOrNull<T>(path: string, extraHeaders?: Record<string, string>): Promise<T | null>
  /** Contenuto binario di un file (usato per la conversione in PDF). */
  getBinary(path: string, extraHeaders?: Record<string, string>): Promise<Buffer>
  post<T>(path: string, body: unknown): Promise<T>
  patch<T>(path: string, body: unknown): Promise<T>
  del(path: string): Promise<void>
  putBinary<T>(
    path: string,
    data: ArrayBuffer | Uint8Array,
    contentType?: string,
  ): Promise<T>
}

/**
 * Client con l'identità dell'utente indicato.
 *
 * Il token viene recuperato una sola volta e trattenuto nella chiusura di
 * QUESTO oggetto: va quindi creato per ogni richiesta, non riusato.
 */
export async function graphPerUtente(email: string): Promise<GraphClient> {
  if (!email) throw new RiautenticazioneRichiesta('Utente non identificato.')

  let token: string | null = null
  async function auth(): Promise<string> {
    if (!token) token = await getDelegatedToken(email)
    return token
  }

  async function chiama(
    method: string,
    path: string,
    opzioni: {
      body?: BodyInit
      contentType?: string
      extraHeaders?: Record<string, string>
      nullSu404?: boolean
    } = {},
  ): Promise<unknown> {
    const t = await auth()
    const headers: Record<string, string> = {
      Authorization: `Bearer ${t}`,
      ...opzioni.extraHeaders,
    }
    if (opzioni.contentType) headers['Content-Type'] = opzioni.contentType

    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method,
      headers,
      body: opzioni.body,
      cache: 'no-store',
    })

    if (res.status === 404 && opzioni.nullSu404) return null
    if (res.status === 404 && method === 'DELETE') return {} // già eliminato

    if (res.status === 401) {
      // Il token è stato accettato dal nostro store ma rifiutato da Graph:
      // tipicamente revocato dopo il rilascio. Un rinnovo non aiuta.
      throw new RiautenticazioneRichiesta()
    }
    if (res.status === 403) {
      throw new AccessoNegatoRU()
    }
    if (!res.ok) {
      const err = (await res.text()).slice(0, 500)
      throw new Error(`Graph ${method} ${path} (delegato) fallito (${res.status}): ${err}`)
    }

    if (res.status === 202 || res.status === 204) return {}
    const testo = await res.text()
    return testo ? JSON.parse(testo) : {}
  }

  return {
    identita: email,
    get: <T>(path: string, extraHeaders?: Record<string, string>) =>
      chiama('GET', path, { extraHeaders }) as Promise<T>,
    getOrNull: <T>(path: string, extraHeaders?: Record<string, string>) =>
      chiama('GET', path, { extraHeaders, nullSu404: true }) as Promise<T | null>,
    getBinary: async (path: string, extraHeaders?: Record<string, string>) => {
      const t = await auth()
      const res = await fetch(`${GRAPH_BASE}${path}`, {
        headers: { Authorization: `Bearer ${t}`, ...extraHeaders },
        cache: 'no-store',
      })
      if (res.status === 401) throw new RiautenticazioneRichiesta()
      if (res.status === 403) throw new AccessoNegatoRU()
      if (!res.ok) {
        const err = (await res.text()).slice(0, 500)
        throw new Error(`Graph GET ${path} (binario, delegato) fallito (${res.status}): ${err}`)
      }
      return Buffer.from(await res.arrayBuffer())
    },
    post: <T>(path: string, body: unknown) =>
      chiama('POST', path, {
        body: JSON.stringify(body),
        contentType: 'application/json',
      }) as Promise<T>,
    patch: <T>(path: string, body: unknown) =>
      chiama('PATCH', path, {
        body: JSON.stringify(body),
        contentType: 'application/json',
      }) as Promise<T>,
    del: async (path: string) => {
      await chiama('DELETE', path)
    },
    putBinary: <T>(
      path: string,
      data: ArrayBuffer | Uint8Array,
      contentType = 'application/octet-stream',
    ) => chiama('PUT', path, { body: data as BodyInit, contentType }) as Promise<T>,
  }
}

/**
 * Client con l'identità APPLICATIVA, da usare solo dove non c'è un utente.
 *
 * Va invocato in modo esplicito e commentato: se compare in un punto dove
 * l'utente c'è, il log nativo perde il nome della persona ed è come non avere
 * fatto questo lavoro. Oggi serve per gli script e come ripiego dichiarato
 * nella chiusura mensile delle timbrature, se dovesse diventare automatica.
 */
export function graphApplicativo(): GraphClient {
  return {
    identita: 'app',
    get: graphGet,
    getOrNull: graphGetOrNull,
    getBinary: graphGetBinary,
    post: graphPost,
    patch: graphPatch,
    del: graphDelete,
    putBinary: graphPutBinary,
  }
}

/**
 * Client da usare per l'area Risorse Umane. È l'unico punto in cui si decide
 * con quale identità si opera, e regge la transizione al sito dedicato:
 *
 * - `SP_SITE_RU` **assente** → assetto precedente: liste RU sul sito Controllo
 *   di Gestione, identità applicativa. Il canale delegato non funzionerebbe,
 *   perché il grant `Sites.Selected` è stato dato solo sul sito RU.
 * - `SP_SITE_RU` **presente** → assetto nuovo: sito dedicato e identità utente.
 *
 * L'interruttore è unico di proposito: `SP_SITE_RU`, `SP_LIST_DIPENDENTI`,
 * `SP_LIST_TIROCINI`, `SP_RU_DRIVE_ID` e `SP_RU_FOLDER` vanno cambiati **tutti
 * insieme**. Metà nuovi e metà vecchi significa cercare liste inesistenti.
 *
 * Il ramo di ripiego va rimosso quando il cutover è consolidato.
 */
export async function graphRU(email: string | null | undefined): Promise<GraphClient> {
  if (!process.env.SP_SITE_RU) return graphApplicativo()
  if (!email) {
    throw new RiautenticazioneRichiesta(
      'Utente non identificato: impossibile accedere ai dati Risorse Umane.',
    )
  }
  return graphPerUtente(email)
}

/** True se l'errore richiede un nuovo login dell'utente. */
export function isRiautenticazione(e: unknown): e is RiautenticazioneRichiesta {
  return e instanceof RiautenticazioneRichiesta
}

/** True se l'errore è una mancanza di permessi sul sito RU. */
export function isAccessoNegato(e: unknown): e is AccessoNegatoRU {
  return e instanceof AccessoNegatoRU
}

export { RiautenticazioneRichiesta }
