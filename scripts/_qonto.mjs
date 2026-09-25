/**
 * Accesso a Qonto condiviso dagli script.
 *
 * Due modi, scelti da soli:
 *   1. OAuth, se esiste `web/.qonto-oauth.json` (lo crea `qonto-oauth-login.mjs`).
 *      Serve per le operazioni che Qonto riserva a OAuth anche quando la
 *      documentazione dice il contrario (es. rinominare un sottoconto: 401 con la chiave).
 *   2. Chiave API (QONTO_LOGIN / QONTO_SECRET), altrimenti.
 *
 * Token OAuth: l'access token dura 1 ora, il refresh token 90 giorni ed è
 * MONOUSO — ogni rinnovo lo invalida e ne restituisce uno nuovo, che va salvato
 * subito. Se il file si perde o passano 90 giorni: rilanciare il login.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const WEB = join(__dirname, '..')
export const TOKEN_FILE = join(WEB, '.qonto-oauth.json')
export const API = 'https://thirdparty.qonto.com/v2'
export const OAUTH = 'https://oauth.qonto.com/oauth2'

export function loadEnvLocal() {
  try {
    const raw = readFileSync(join(WEB, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env.local assente: si presume env già impostate
  }
}

export function salvaToken(t) {
  const dati = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    scope: t.scope,
    scade_il: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    refresh_scade_circa_il: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
  }
  writeFileSync(TOKEN_FILE, JSON.stringify(dati, null, 2), { mode: 0o600 })
  return dati
}

export async function tokenEndpoint(params) {
  const body = new URLSearchParams({
    ...params,
    client_id: process.env.QONTO_CLIENT_ID,
    client_secret: process.env.QONTO_CLIENT_SECRET,
  })
  const res = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`Qonto token → ${res.status}: ${txt}`)
  return JSON.parse(txt)
}

let cache = null
async function authHeader() {
  if (!existsSync(TOKEN_FILE)) {
    if (!process.env.QONTO_LOGIN || !process.env.QONTO_SECRET) {
      throw new Error('Né .qonto-oauth.json né QONTO_LOGIN/QONTO_SECRET: niente per autenticarsi')
    }
    return { header: `${process.env.QONTO_LOGIN}:${process.env.QONTO_SECRET}`, modo: 'chiave API' }
  }
  cache ??= JSON.parse(readFileSync(TOKEN_FILE, 'utf8'))
  if (new Date(cache.scade_il) <= new Date()) {
    cache = salvaToken(await tokenEndpoint({ grant_type: 'refresh_token', refresh_token: cache.refresh_token }))
  }
  return { header: `Bearer ${cache.access_token}`, modo: 'OAuth' }
}

export async function modoAccesso() {
  return (await authHeader()).modo
}

export async function qonto(method, path, body) {
  const { header } = await authHeader()
  const headers = { Authorization: header, Accept: 'application/json' }
  if (body) {
    headers['Content-Type'] = 'application/json'
    headers['X-Qonto-Idempotency-Key'] = randomUUID()
  }
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const txt = await res.text()
  if (!res.ok) throw new Error(`Qonto ${method} ${path} → ${res.status}: ${txt}`)
  return txt ? JSON.parse(txt) : null
}
