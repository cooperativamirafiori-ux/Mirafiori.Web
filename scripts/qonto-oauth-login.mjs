#!/usr/bin/env node
/**
 * Login OAuth a Qonto, una tantum (e poi ogni 90 giorni, o se si perde il file).
 *
 * Apre il browser sulla pagina di consenso di Qonto; dopo il tuo "Autorizza",
 * Qonto rimanda a http://localhost:3737/callback, dove questo script è in
 * ascolto: scambia il codice con i token e li salva in `web/.qonto-oauth.json`
 * (escluso da git). Da lì in poi gli script Qonto usano OAuth da soli.
 *
 * Uso (dalla cartella web/):
 *   node scripts/qonto-oauth-login.mjs
 *
 * Richiede in .env.local:
 *   QONTO_CLIENT_ID, QONTO_CLIENT_SECRET   (Developer Portal → la tua app → Production)
 *   QONTO_REDIRECT_URI                     facoltativo, default http://localhost:3737/callback
 *                                          (deve essere IDENTICO a quello registrato sul portale)
 *   QONTO_SCOPES                           facoltativo, default qui sotto
 */

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { exec } from 'node:child_process'
import { loadEnvLocal, tokenEndpoint, salvaToken, OAUTH, TOKEN_FILE } from './_qonto.mjs'

loadEnvLocal()
const { QONTO_CLIENT_ID, QONTO_CLIENT_SECRET } = process.env
const REDIRECT = process.env.QONTO_REDIRECT_URI || 'http://localhost:3737/callback'
const SCOPES =
  process.env.QONTO_SCOPES ||
  'offline_access organization.read bank_account.write internal_transfer.write attachment.read attachment.write request_transfers.write'

if (!QONTO_CLIENT_ID || !QONTO_CLIENT_SECRET) {
  console.error('ERRORE: mancano QONTO_CLIENT_ID / QONTO_CLIENT_SECRET in .env.local')
  process.exit(1)
}

const url = new URL(REDIRECT)
const state = randomBytes(32).toString('hex')
const auth = new URL(`${OAUTH}/auth`)
auth.search = new URLSearchParams({
  client_id: QONTO_CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPES,
  state,
}).toString()

const server = createServer(async (req, res) => {
  const q = new URL(req.url, REDIRECT)
  if (q.pathname !== url.pathname) return res.writeHead(404).end()
  const fine = (msg, ok) => {
    res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<meta charset="utf-8"><body style="font:18px system-ui;padding:40px">${msg}</body>`)
    console.log(ok ? `\n✓ ${msg.replace(/<[^>]+>/g, '')}` : `\nERRORE: ${msg}`)
    server.close()
    if (!ok) process.exitCode = 1
  }
  if (q.searchParams.get('error')) return fine(`Qonto ha risposto: ${q.searchParams.get('error')} — ${q.searchParams.get('error_description') || ''}`, false)
  if (q.searchParams.get('state') !== state) return fine('state non corrisponde: login annullato per sicurezza.', false)
  try {
    const t = salvaToken(
      await tokenEndpoint({ grant_type: 'authorization_code', code: q.searchParams.get('code'), redirect_uri: REDIRECT }),
    )
    fine(`Collegato a Qonto. Permessi: ${t.scope}.<br>Token salvati in ${TOKEN_FILE}. Puoi chiudere questa pagina.`, true)
  } catch (e) {
    fine(e.message, false)
  }
})

server.listen(Number(url.port) || 80, url.hostname, () => {
  console.log(`In ascolto su ${REDIRECT}`)
  console.log(`Permessi richiesti: ${SCOPES}\n`)
  console.log('Si apre il browser. Se non succede, apri questo indirizzo:\n')
  console.log(auth.toString() + '\n')
  exec(`open "${auth.toString()}"`)
})
