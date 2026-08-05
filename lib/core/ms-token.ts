/**
 * Token delegati Microsoft: conservazione cifrata, lettura e rinnovo.
 *
 * Serve all'area Risorse Umane, che scrive su SharePoint con l'IDENTITÀ
 * DELL'UTENTE (accesso delegato) affinché il log nativo Microsoft riporti la
 * persona reale. Vedi docs/piano-ru-sito-dedicato-accesso-delegato.md §5.
 *
 * ─── Due vincoli non negoziabili che spiegano le scelte di questo file ───
 *
 * 1. **Compatibilità Edge runtime.** `middleware.ts` fa
 *    `export { auth as middleware } from '@/lib/core/auth'`, e `lib/auth.ts` importa
 *    questo modulo per salvare i token al login. Il middleware Next.js gira in
 *    Edge runtime, dove `node:crypto` non esiste. Quindi qui si usa la **Web
 *    Crypto API** (`crypto.subtle`, presente sia in Node 18+ sia in Edge) e si
 *    parla con Supabase via **REST/fetch** anziché con `@supabase/supabase-js`.
 *    Non sostituire con `node:crypto` o con il client di `lib/supabase.ts`: il
 *    build del middleware si rompe.
 *
 * 2. **Nessuna cache di modulo.** Le funzioni serverless vengono riutilizzate
 *    fra richieste di utenti diversi. Un token in una variabile globale
 *    significherebbe operare con l'identità di un'altra persona.
 *
 * Env richieste:
 *   TOKEN_ENC_KEY                     32 byte in base64 (openssl rand -base64 32)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   AUTH_MICROSOFT_ENTRA_ID_TENANT_ID / _ID / _SECRET   (per il rinnovo)
 */

const TABELLA = 'ms_token'

/** Margine di sicurezza: si rinnova prima della scadenza effettiva. */
const MARGINE_MS = 5 * 60_000

/**
 * Scope richiesti al login. `offline_access` è ciò che produce il refresh
 * token; `Sites.Selected` limita la scrittura delegata ai soli siti
 * espressamente concessi all'app (per noi: il sito Risorse Umane).
 * Usato sia da lib/auth.ts sia dal rinnovo, che devono coincidere.
 */
export const SCOPE_DELEGATO =
  'openid profile email offline_access https://graph.microsoft.com/Sites.Selected'

/**
 * L'utente deve rifare l'accesso: nessun token memorizzato, oppure il refresh
 * token è scaduto/revocato. Le API la traducono in 401 con
 * `{ codice: 'riautenticazione' }`, così il frontend può reindirizzare al login.
 */
export class RiautenticazioneRichiesta extends Error {
  readonly codice = 'riautenticazione' as const
  constructor(messaggio = 'Sessione Microsoft scaduta: esci e rientra nell’app.') {
    super(messaggio)
    this.name = 'RiautenticazioneRichiesta'
  }
}

// ---------------------------------------------------------------------------
// Cifratura AES-256-GCM (Web Crypto)
// Formato memorizzato: base64( iv[12] || ciphertext || tag[16] )
// Il tag è già incluso in coda al ciphertext da crypto.subtle.encrypt.
// ---------------------------------------------------------------------------

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  // A blocchi: `String.fromCharCode(...bytes)` su token da qualche KB
  // rischia "Maximum call stack size exceeded".
  let bin = ''
  const BLOCCO = 0x8000
  for (let i = 0; i < bytes.length; i += BLOCCO) {
    bin += String.fromCharCode(...bytes.subarray(i, i + BLOCCO))
  }
  return btoa(bin)
}

async function chiave(): Promise<CryptoKey> {
  const b64 = process.env.TOKEN_ENC_KEY
  if (!b64) {
    throw new Error(
      'TOKEN_ENC_KEY non impostata: serve una chiave AES-256 (32 byte in base64). ' +
        'Generala con: openssl rand -base64 32',
    )
  }
  const raw = base64ToBytes(b64.trim())
  if (raw.length !== 32) {
    throw new Error(
      `TOKEN_ENC_KEY non valida: attesi 32 byte, trovati ${raw.length}. ` +
        'Rigenerala con: openssl rand -base64 32',
    )
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

async function cifra(testo: string): Promise<string> {
  const k = await chiave()
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
  const cifrato = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    k,
    new TextEncoder().encode(testo),
  )
  const out = new Uint8Array(new ArrayBuffer(iv.length + cifrato.byteLength))
  out.set(iv, 0)
  out.set(new Uint8Array(cifrato), iv.length)
  return bytesToBase64(out)
}

async function decifra(payload: string): Promise<string> {
  const bytes = base64ToBytes(payload)
  if (bytes.length <= 12 + 16) {
    throw new Error('Token memorizzato illeggibile: payload troppo corto.')
  }
  const k = await chiave()
  const iv = bytes.subarray(0, 12)
  const corpo = bytes.subarray(12)
  try {
    const chiaro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, corpo)
    return new TextDecoder().decode(chiaro)
  } catch {
    // Causa tipica: TOKEN_ENC_KEY cambiata dopo il salvataggio. I token vecchi
    // sono definitivamente illeggibili, l'unica via è un nuovo login.
    throw new RiautenticazioneRichiesta(
      'Token memorizzato non decifrabile (chiave di cifratura cambiata): rifai l’accesso.',
    )
  }
}

// ---------------------------------------------------------------------------
// Accesso a Supabase via REST (PostgREST)
// ---------------------------------------------------------------------------

interface RigaToken {
  email: string
  access_token: string
  refresh_token: string
  expires_at: string
  updated_at: string
}

async function sb<T>(
  percorso: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<T | null> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase non configurato: impostare SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY')
  }
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${percorso}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  })
  const testo = await res.text()
  if (!res.ok) {
    throw new Error(
      `Supabase ${init.method ?? 'GET'} ${percorso} → ${res.status}: ${testo.slice(0, 300)}`,
    )
  }
  return testo ? (JSON.parse(testo) as T) : null
}

const filtroEmail = (email: string) => `email=eq.${encodeURIComponent(email)}`

// ---------------------------------------------------------------------------
// API pubblica
// ---------------------------------------------------------------------------

/**
 * Salva (o sostituisce) i token dell'utente. Chiamata dal callback `jwt` di
 * lib/auth.ts al login, quando Entra restituisce `account`.
 */
export async function salvaTokenDelegato(p: {
  email: string
  accessToken: string
  refreshToken: string
  expiresAt: Date
}): Promise<void> {
  const riga = {
    email: p.email.toLowerCase(),
    access_token: await cifra(p.accessToken),
    refresh_token: await cifra(p.refreshToken),
    expires_at: p.expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }
  await sb(`${TABELLA}?on_conflict=email`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(riga),
  })
}

/** Cancella i token dell'utente. Da usare quando si revoca l'accesso a qualcuno. */
export async function eliminaTokenDelegato(email: string): Promise<void> {
  await sb(`${TABELLA}?${filtroEmail(email.toLowerCase())}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
}

/**
 * Restituisce un access token Graph valido per l'utente, rinnovandolo se serve.
 * Lancia `RiautenticazioneRichiesta` quando l'unica via d'uscita è un nuovo login.
 */
export async function getDelegatedToken(email: string): Promise<string> {
  const e = email.toLowerCase()
  const righe = await sb<RigaToken[]>(`${TABELLA}?${filtroEmail(e)}&select=*&limit=1`)
  const riga = Array.isArray(righe) ? righe[0] : null
  if (!riga) {
    throw new RiautenticazioneRichiesta(
      'Nessun token Microsoft memorizzato per questo utente: esci e rientra nell’app.',
    )
  }
  const scadenza = new Date(riga.expires_at).getTime()
  if (Number.isFinite(scadenza) && scadenza > Date.now() + MARGINE_MS) {
    return decifra(riga.access_token)
  }
  return rinnova(e, riga)
}

async function rinnova(email: string, riga: RigaToken): Promise<string> {
  const tenant = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID
  const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID
  const clientSecret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
  if (!tenant || !clientId || !clientSecret) {
    throw new Error(
      'Credenziali Entra non configurate: AUTH_MICROSOFT_ENTRA_ID_TENANT_ID / _ID / _SECRET',
    )
  }

  const refreshToken = await decifra(riga.refresh_token)

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      scope: SCOPE_DELEGATO,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const dettaglio = (await res.text()).slice(0, 300)
    // Refresh token scaduto, revocato, o consenso ritirato: la riga non serve
    // più a nulla e tenerla farebbe fallire ogni richiesta allo stesso modo.
    await eliminaTokenDelegato(email).catch(() => {})
    throw new RiautenticazioneRichiesta(
      `Rinnovo del token Microsoft non riuscito: esci e rientra nell’app. (${dettaglio})`,
    )
  }

  const dati = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  const nuovoAccess = dati.access_token
  const scadeIl = new Date(Date.now() + (dati.expires_in ?? 3600) * 1000)

  // Scrittura ottimistica: `updated_at=eq.<valore letto>` fa vincere una sola
  // richiesta se due arrivano insieme. Entra tollera il riuso del refresh token
  // per una breve finestra, quindi la richiesta che "perde" resta valida: il suo
  // access token funziona comunque, semplicemente non viene memorizzato.
  const aggiornamento: Record<string, string> = {
    access_token: await cifra(nuovoAccess),
    expires_at: scadeIl.toISOString(),
    updated_at: new Date().toISOString(),
  }
  // Entra ruota il refresh token: se ne arriva uno nuovo va riscritto, altrimenti
  // si conserva quello attuale.
  if (dati.refresh_token) {
    aggiornamento.refresh_token = await cifra(dati.refresh_token)
  }

  try {
    await sb(
      `${TABELLA}?${filtroEmail(email)}&updated_at=eq.${encodeURIComponent(riga.updated_at)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(aggiornamento),
      },
    )
  } catch (e) {
    // Il token in mano è valido: non far fallire la richiesta dell'utente per
    // un problema di sola persistenza.
    console.error('[ms-token] salvataggio del token rinnovato non riuscito', e)
  }

  return nuovoAccess
}
