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
