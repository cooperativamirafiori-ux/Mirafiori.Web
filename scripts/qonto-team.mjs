#!/usr/bin/env node
/**
 * Team su Qonto: elenca quelli che ci sono e ne crea uno nuovo (idempotente).
 *
 * Uso (dalla cartella web/):
 *   node scripts/qonto-team.mjs                                   # elenca i team
 *   node scripts/qonto-team.mjs --crea "Locanda nel Parco"        # mostra cosa farebbe
 *   node scripts/qonto-team.mjs --crea "Locanda nel Parco" --apply
 *
 * Qonto accetta /v2/teams SOLO via OAuth con gli scope team.read / team.write.
 * NON sono nei default del login: l'8/10/2026 Qonto ha risposto invalid_scope
 * ("The OAuth 2.0 Client is not allowed to request scope 'team.read'") perché
 * l'app sul Developer Portal non li ha abilitati. Quando lo saranno:
 *   QONTO_SCOPES="offline_access organization.read bank_account.write internal_transfer.write attachment.read attachment.write request_transfers.write team.read team.write" node scripts/qonto-oauth-login.mjs
 * Assegnare membri e sottoconti al team via API non si può: si fa dalla web app.
 */

import { loadEnvLocal, qonto, modoAccesso } from './_qonto.mjs'

const APPLY = process.argv.includes('--apply')
const iCrea = process.argv.indexOf('--crea')
const NOME = iCrea > -1 ? (process.argv[iCrea + 1] || '').trim() : ''

async function tuttiITeam() {
  const out = []
  for (let page = 1; page; ) {
    const r = await qonto('GET', `/teams?per_page=100&page=${page}`)
    out.push(...(r.teams || []))
    page = r.meta?.next_page || null
  }
  return out
}

async function main() {
  loadEnvLocal()
  const modo = await modoAccesso()
  console.log(`Accesso a Qonto via ${modo}\n`)
  if (modo !== 'OAuth') throw new Error('I team richiedono OAuth: lancia prima  node scripts/qonto-oauth-login.mjs')

  let team
  try {
    team = await tuttiITeam()
  } catch (e) {
    if (/→ (401|403)/.test(e.message)) {
      throw new Error(`${e.message}\nIl token non ha i permessi sui team: rilancia  node scripts/qonto-oauth-login.mjs`)
    }
    throw e
  }
  console.log(`Team su Qonto: ${team.length}`)
  for (const t of team) console.log(`  · ${t.name}  (${t.id})`)

  if (!NOME) return
  if (iCrea > -1 && NOME.length < 2) throw new Error('Nome del team mancante o troppo corto')
  const gia = team.find((t) => t.name.trim().toLowerCase() === NOME.toLowerCase())
  if (gia) return console.log(`\nIl team "${gia.name}" c'è già: niente da fare.`)
  if (!APPLY) return console.log(`\nCREEREI il team "${NOME}". Rilancia con --apply.`)

  const r = await qonto('POST', '/teams', { name: NOME })
  const t = r.team || r
  console.log(`\n✓ Creato il team "${t.name}"  (${t.id})`)
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
