/**
 * Client Graph API con autenticazione app (client credentials).
 * Usato dalle API routes server-side — NON esporre al client.
 *
 * Permessi app necessari (Azure portal → App registration → API permissions):
 *   Sites.ReadWrite.All (Application)
 *   ChannelMessage.Send (Application)
 *   Mail.Send (Application)
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

let _tokenCache: { token: string; expiresAt: number } | null = null

async function getAppToken(): Promise<string> {
  const now = Date.now()
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) {
    return _tokenCache.token
  }

  const tenantId = process.env.GRAPH_TENANT_ID!
  const clientId = process.env.GRAPH_CLIENT_ID!
  const clientSecret = process.env.GRAPH_CLIENT_SECRET!

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph token error: ${err}`)
  }

  const data = await res.json()
  _tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  }
  return _tokenCache.token
}

export async function graphGet<T>(
  path: string,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph GET ${path} failed (${res.status}): ${err}`)
  }
  return res.json()
}

/**
 * Come graphGet, ma segue `@odata.nextLink` e ritorna tutti gli elementi.
 *
 * Serve perché **Graph pagina gli item di lista a 200 a prescindere dal `$top`**:
 * chiedere `$top=2000` e leggere solo `value` significa perdere in silenzio tutto
 * quello che sta oltre la duecentesima riga. Su una lista che cresce a ogni
 * movimento — le assegnazioni — è un guaio che arriva da sé col tempo.
 *
 * `limite` è una cintura di sicurezza contro un ciclo che non finisce: se si
 * raggiunge, la lista è più grande di quanto questa funzione debba leggere.
 */
export async function graphGetAll<T>(
  path: string,
  extraHeaders?: Record<string, string>,
  limite = 20_000,
): Promise<T[]> {
  const out: T[] = []
  let url: string | null = path
  while (url && out.length < limite) {
    const p: { value?: T[]; '@odata.nextLink'?: string } = await graphGet(url, extraHeaders)
    out.push(...(p.value ?? []))
    const next = p['@odata.nextLink']
    url = next ? next.replace(GRAPH_BASE, '') : null
  }
  return out
}

/** Come graphGet ma ritorna null sui 404 (utile per verificare l'esistenza di una cartella) */
export async function graphGetOrNull<T>(
  path: string,
  extraHeaders?: Record<string, string>
): Promise<T | null> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph GET ${path} failed (${res.status}): ${err}`)
  }
  return res.json()
}

/**
 * GET binario. Serve per scaricare il contenuto di un file da un Drive, in
 * particolare per la conversione automatica in PDF di Graph
 * (`/drives/{id}/items/{id}/content?format=pdf`): e' il modo per ottenere un
 * PDF senza portarsi dietro un motore di stampa.
 *
 * Segue i redirect (Graph risponde 302 verso lo storage), che fetch gestisce
 * da solo.
 */
export async function graphGetBinary(
  path: string,
  extraHeaders?: Record<string, string>,
): Promise<Buffer> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    cache: 'no-store',
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph GET (binario) ${path} failed (${res.status}): ${err}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Upload binario semplice su un Drive (file < 4 MB).
 * `path` deve essere un endpoint Graph che termina con :/content
 */
export async function graphPutBinary<T>(
  path: string,
  data: ArrayBuffer | Uint8Array,
  contentType = 'application/octet-stream'
): Promise<T> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    },
    body: data as BodyInit,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph PUT ${path} failed (${res.status}): ${err}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : ({} as T)
}

export async function graphPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph POST ${path} failed (${res.status}): ${err}`)
  }
  // 202 / 204 ritornano body vuoto (es. sendMail, sendActivity)
  if (res.status === 202 || res.status === 204) return {} as T
  const text = await res.text()
  return text ? JSON.parse(text) : {} as T
}

export async function graphPatch<T>(path: string, body: unknown): Promise<T> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph PATCH ${path} failed (${res.status}): ${err}`)
  }
  // PATCH spesso ritorna 204 No Content
  if (res.status === 204) return {} as T
  return res.json()
}

export async function graphDelete(path: string): Promise<void> {
  const token = await getAppToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 404) {
    const err = await res.text()
    throw new Error(`Graph DELETE ${path} failed (${res.status}): ${err}`)
  }
}
