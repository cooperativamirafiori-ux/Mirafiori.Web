/**
 * Qonto con OAuth, lato server: serve SOLO per le richieste di bonifico, che
 * Qonto non accetta con la chiave API (401, provato il 26/09/2026). Tutte le
 * letture restano sulla chiave (client.ts).
 *
 * Il token sta nella tabella `qonto_token` (una riga, RLS senza policy: la
 * legge solo il service role). Ci arriva da `scripts/qonto-oauth-a-supabase.mjs`
 * dopo il login dal Mac.
 *
 * ⚠️ Il refresh token è MONOUSO. Chi deve rinnovare prende prima il turno con
 * un update condizionato su `rinnovo_fino`: lo ottiene uno solo; gli altri
 * aspettano e rileggono il token nuovo. Senza, due clic insieme brucerebbero
 * il token e servirebbe rifare il login.
 *
 * Il refresh token vale circa 90 giorni dall'ultimo rinnovo: il giro notturno
 * chiama `mantieniVivo()` e lo rinnova quando ha più di 30 giorni.
 *
 * Env: QONTO_CLIENT_ID, QONTO_CLIENT_SECRET.
 */

import { randomUUID } from 'node:crypto'
import { supabase } from '@/lib/core/supabase'

const API = 'https://thirdparty.qonto.com/v2'
const TOKEN_URL = 'https://oauth.qonto.com/oauth2/token'

interface Riga {
  access_token: string | null
  access_scade_il: string | null
  refresh_token: string
  refresh_rinnovato_il: string
  rinnovo_fino: string | null
}

export function qontoOAuthConfigurato(): boolean {
  return Boolean(process.env.QONTO_CLIENT_ID && process.env.QONTO_CLIENT_SECRET)
}

async function leggi(): Promise<Riga> {
  const { data, error } = await supabase()
    .from('qonto_token')
    .select('access_token, access_scade_il, refresh_token, refresh_rinnovato_il, rinnovo_fino')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new Error(`Token Qonto: ${error.message}`)
  if (!data) throw new Error('Qonto non è collegato all’app: manca il token OAuth (scripts/qonto-oauth-a-supabase.mjs)')
  return data as Riga
}

const valido = (r: Riga) => !!r.access_token && !!r.access_scade_il && Date.parse(r.access_scade_il) > Date.now() + 120_000

async function rinnova(forza = false): Promise<string> {
  for (let tentativo = 0; tentativo < 10; tentativo++) {
    const r = await leggi()
    if (!forza && valido(r)) return r.access_token!

    // Prendere il turno: vince uno solo.
    const ora = new Date()
    const { data: turno, error: eT } = await supabase()
      .from('qonto_token')
      .update({ rinnovo_fino: new Date(ora.getTime() + 30_000).toISOString() })
      .eq('id', 1)
      .eq('refresh_token', r.refresh_token)
      .or(`rinnovo_fino.is.null,rinnovo_fino.lt.${ora.toISOString()}`)
      .select('id')
    if (eT) throw new Error(`Token Qonto (turno): ${eT.message}`)

    if (!turno?.length) {
      // Qualcun altro sta rinnovando: si aspetta e si rilegge.
      await new Promise((ok) => setTimeout(ok, 1500))
      forza = false
      continue
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: r.refresh_token,
        client_id: process.env.QONTO_CLIENT_ID ?? '',
        client_secret: process.env.QONTO_CLIENT_SECRET ?? '',
      }),
      cache: 'no-store',
    })
    const testo = await res.text()
    if (!res.ok) {
      await supabase().from('qonto_token').update({ rinnovo_fino: null }).eq('id', 1)
      throw new Error(`Rinnovo del token Qonto non riuscito (${res.status}): ${testo.slice(0, 200)}. Va rifatto il login dal Mac.`)
    }
    const t = JSON.parse(testo) as { access_token: string; refresh_token: string; expires_in: number; scope?: string }
    const adesso = Date.now()
    const { error: eU } = await supabase()
      .from('qonto_token')
      .update({
        access_token: t.access_token,
        access_scade_il: new Date(adesso + (t.expires_in - 60) * 1000).toISOString(),
        refresh_token: t.refresh_token,
        refresh_rinnovato_il: new Date(adesso).toISOString(),
        ...(t.scope ? { scope: t.scope } : {}),
        rinnovo_fino: null,
        aggiornato_il: new Date(adesso).toISOString(),
      })
      .eq('id', 1)
    // Se questo salvataggio fallisse il refresh token nuovo andrebbe perso:
    // non c'è rimedio automatico, lo si dice chiaro.
    if (eU) throw new Error(`Token Qonto rinnovato ma NON salvato (${eU.message}): va rifatto il login dal Mac.`)
    return t.access_token
  }
  throw new Error('Token Qonto occupato da un altro rinnovo: riprova fra un minuto')
}

/** Chiamata Qonto con OAuth. `idempotenza`: stessa chiave → Qonto non la ripete. */
export async function qontoOAuth<T>(metodo: 'GET' | 'POST', path: string, corpo?: unknown, idempotenza?: string): Promise<T> {
  const chiama = async (token: string) =>
    fetch(API + path, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
        ...(metodo === 'POST' ? { 'X-Qonto-Idempotency-Key': idempotenza ?? randomUUID() } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
    })
  let res = await chiama(await rinnova())
  // Token scaduto prima del previsto: un solo nuovo tentativo, stessa chiave di idempotenza.
  if (res.status === 401) res = await chiama(await rinnova(true))
  const testo = await res.text()
  if (!res.ok) throw new Error(`Qonto ${metodo} ${path.split('?')[0]} → ${res.status}: ${testo.slice(0, 400)}`)
  return (testo ? JSON.parse(testo) : null) as T
}

/** Giro notturno: rinnova il refresh token se ha più di 30 giorni, così non scade mai. */
export async function mantieniVivo(): Promise<'rinnovato' | 'fresco' | 'non collegato'> {
  if (!qontoOAuthConfigurato()) return 'non collegato'
  let r: Riga
  try {
    r = await leggi()
  } catch {
    return 'non collegato'
  }
  if (Date.now() - Date.parse(r.refresh_rinnovato_il) < 30 * 86_400_000) return 'fresco'
  await rinnova(true)
  return 'rinnovato'
}
