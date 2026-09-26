#!/usr/bin/env node
/**
 * Copia da .env.local su Vercel (production e development), sostituendo i
 * valori che ci sono già:
 *   QONTO_LOGIN, QONTO_SECRET          chiave API: letture (saldi, movimenti)
 *   QONTO_CLIENT_ID, QONTO_CLIENT_SECRET  app OAuth: rinnovo del token per le
 *                                      richieste di bonifico (lib/qonto/oauth.ts)
 *
 * Da rilanciare ogni volta che si rigenera la chiave API o il client secret
 * su Qonto, poi un redeploy (`vercel --prod`) perché l'app li legga.
 *
 * Preview non si tocca: la CLI chiede il branch in modo interattivo. Su un
 * deploy di anteprima la scheda Qonto dirà "non collegato", senza rompersi.
 *
 * Uso (dalla cartella web/, con la CLI vercel già collegata al progetto):
 *   node scripts/qonto-env-vercel.mjs
 */

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*(QONTO_LOGIN|QONTO_SECRET|QONTO_CLIENT_ID|QONTO_CLIENT_SECRET)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const NOMI = ['QONTO_LOGIN', 'QONTO_SECRET', 'QONTO_CLIENT_ID', 'QONTO_CLIENT_SECRET']
for (const k of NOMI) {
  if (!env[k]) {
    console.error(`ERRORE: manca ${k} in .env.local`)
    process.exit(1)
  }
}

let errori = 0
for (const nome of NOMI) {
  for (const ambiente of ['production', 'development']) {
    spawnSync('vercel', ['env', 'rm', nome, ambiente, '-y'], { stdio: 'ignore' })
    const r = spawnSync('vercel', ['env', 'add', nome, ambiente], { input: env[nome], encoding: 'utf8' })
    if (r.status === 0) console.log(`✓ ${nome} → ${ambiente}`)
    else {
      errori++
      console.log(`✗ ${nome} → ${ambiente}: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`)
    }
  }
}
process.exit(errori ? 1 : 0)
