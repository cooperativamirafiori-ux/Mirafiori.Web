#!/usr/bin/env node
/**
 * Completa e verifica .env.local in un solo passaggio.
 *
 * Perché esiste: alcune variabili non sono recuperabili automaticamente
 * (su Vercel le "sensitive" restituiscono "[SENSITIVE]") e altre sì (i GUID
 * delle liste si rileggono sempre da Graph). Questo script fa da sé tutto il
 * possibile, chiede solo l'indispensabile, e soprattutto VERIFICA che i valori
 * funzionino davvero invece di limitarsi a scriverli.
 *
 * Uso (da web/):
 *   node scripts/setup-env-locale.mjs             completa ciò che manca
 *   node scripts/setup-env-locale.mjs --verifica  solo diagnostica, non scrive
 *
 * Non tocca le righe già valorizzate e fa un backup prima di scrivere.
 */

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV = join(__dirname, '..', '.env.local')

const SOLO_VERIFICA = process.argv.includes('--verifica')

const ok = (s) => `  \x1b[32m✓\x1b[0m ${s}`
const ko = (s) => `  \x1b[31m✗\x1b[0m ${s}`
const info = (s) => `    ${s}`

// ---------------------------------------------------------------------------
// Lettura/scrittura .env.local preservandone la struttura
// ---------------------------------------------------------------------------

function righeEnv() {
  return readFileSync(ENV, 'utf8').split('\n')
}

function valori(righe) {
  const out = {}
  for (const r of righe) {
    const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    out[m[1]] = m[2].replace(/^["']|["']$/g, '') // dotenv: nel file vince l'ultima
  }
  return out
}

/** Imposta una chiave: sostituisce la riga se esiste (anche vuota), altrimenti la aggiunge. */
function imposta(righe, chiave, valore) {
  const i = righe.findIndex((r) => new RegExp(`^\\s*${chiave}\\s*=`).test(r))
  if (i >= 0) {
    righe[i] = `${chiave}=${valore}`
    return 'sostituita'
  }
  righe.push(`${chiave}=${valore}`)
  return 'aggiunta'
}

// ---------------------------------------------------------------------------
// Validazioni — servono a intercettare gli errori tipici prima che diventino
// un 401 incomprensibile fra due giorni
// ---------------------------------------------------------------------------

function validaSupabaseUrl(v) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(v.replace(/\/$/, ''))) {
    return 'Formato atteso: https://<progetto>.supabase.co (senza barra finale, senza /rest/v1)'
  }
  return null
}

/**
 * Distingue la service_role dalla anon, che è l'errore più facile da fare:
 * sembrano identiche a occhio ma la anon non vede la tabella ms_token, perché
 * ha RLS attiva senza policy.
 */
function validaSupabaseKey(v) {
  if (v.startsWith('sb_secret_')) return null
  if (v.startsWith('sb_publishable_')) {
    return 'Questa è la chiave PUBBLICABILE. Serve quella "secret" (sb_secret_…).'
  }
  if (v.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(v.split('.')[1], 'base64url').toString())
      if (payload.role === 'service_role') return null
      return `Questa chiave ha ruolo "${payload.role}". Serve quella con ruolo service_role.`
    } catch {
      return 'Non sembra un JWT valido.'
    }
  }
  return 'Formato non riconosciuto: attesa una chiave sb_secret_… oppure un JWT eyJ…'
}

// ---------------------------------------------------------------------------
// Prove di connessione
// ---------------------------------------------------------------------------

async function provaSupabase(url, key) {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/ms_token?select=email&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    const testo = await res.text()
    if (res.ok) return { ok: true, dettaglio: `tabella ms_token raggiungibile (${JSON.parse(testo).length} righe lette)` }
    if (res.status === 404 || /does not exist|Could not find the table/i.test(testo)) {
      return { ok: false, dettaglio: 'connessione riuscita ma la tabella ms_token non esiste: esegui supabase/ms_token.sql' }
    }
    if (res.status === 401) {
      return { ok: false, dettaglio: 'chiave rifiutata (401): probabilmente non è la service_role' }
    }
    return { ok: false, dettaglio: `HTTP ${res.status}: ${testo.slice(0, 160)}` }
  } catch (e) {
    return { ok: false, dettaglio: `rete: ${e.message}` }
  }
}

async function tokenGraph(env) {
  const res = await fetch(
    `https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.GRAPH_CLIENT_ID,
        client_secret: env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  )
  if (!res.ok) throw new Error(`token Graph ${res.status}: ${(await res.text()).slice(0, 160)}`)
  return (await res.json()).access_token
}

async function graph(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const testo = await res.text()
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${testo.slice(0, 200)}`)
  return testo ? JSON.parse(testo) : {}
}

// ---------------------------------------------------------------------------

async function main() {
  let righe = righeEnv()
  let env = valori(righe)
  const daScrivere = {}

  console.log('\n\x1b[1mSetup .env.local — area Risorse Umane\x1b[0m\n')

  // --- 1. Credenziali Graph: prerequisito di tutto il resto -----------------
  console.log('\x1b[1m1. Credenziali Microsoft Graph (identità applicativa)\x1b[0m')
  let token = null
  const mancantiGraph = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'].filter(
    (k) => !env[k],
  )
  if (mancantiGraph.length) {
    console.log(ko(`mancano: ${mancantiGraph.join(', ')}`))
  } else {
    try {
      token = await tokenGraph(env)
      console.log(ok('token applicativo ottenuto'))
    } catch (e) {
      console.log(ko(e.message))
    }
  }

  // --- 2. GUID liste: ricavabili da Graph -----------------------------------
  console.log('\n\x1b[1m2. GUID delle liste SharePoint\x1b[0m')
  const ENV_PER_LISTA = {
    Autorizzazioni: 'SP_LIST_AUTORIZZAZIONI',
    Strutture: 'SP_LIST_STRUTTURE',
    Tecnici: 'SP_LIST_TECNICI',
    Richieste: 'SP_LIST_RICHIESTE',
    Costi: 'SP_LIST_COSTI',
    Parametri: 'SP_LIST_PARAMETRI',
    Prestazioni: 'SP_LIST_PRESTAZIONI',
    Software: 'SP_LIST_SOFTWARE',
    'Log Attività': 'SP_LIST_LOG',
  }
  if (token && env.SHAREPOINT_SITE_ID) {
    try {
      const res = await graph(token, `/sites/${env.SHAREPOINT_SITE_ID}/lists?$select=id,displayName&$top=200`)
      const perNome = new Map((res.value || []).map((l) => [l.displayName, l.id]))
      let toccate = 0
      for (const [nome, chiave] of Object.entries(ENV_PER_LISTA)) {
        const guid = perNome.get(nome)
        if (!guid) continue
        if (env[chiave]) {
          if (env[chiave] !== guid) {
            console.log(ko(`${chiave}: in .env.local c'è ${env[chiave]}, su SharePoint ${guid}`))
            console.log(info('non lo cambio da solo: verifica quale dei due è quello giusto.'))
          }
          continue
        }
        daScrivere[chiave] = guid
        console.log(ok(`${chiave} ricavata da SharePoint (lista "${nome}")`))
        toccate++
      }
      if (!toccate) console.log(ok('nessun GUID mancante fra quelli ricavabili'))
    } catch (e) {
      console.log(ko(`lettura liste non riuscita: ${e.message}`))
    }
  } else {
    console.log(info('salto: servono le credenziali Graph e SHAREPOINT_SITE_ID'))
  }

  // --- 3. Supabase: solo da pannello ---------------------------------------
  console.log('\n\x1b[1m3. Supabase (timbrature + token delegati RU)\x1b[0m')
  const rl = readline.createInterface({ input, output })

  for (const [chiave, etichetta, valida] of [
    ['SUPABASE_URL', 'Project URL', validaSupabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', 'service_role key (quella "secret", NON la anon)', validaSupabaseKey],
  ]) {
    if (env[chiave]) {
      const errore = valida(env[chiave])
      if (errore) console.log(ko(`${chiave} presente ma non valida — ${errore}`))
      else console.log(ok(`${chiave} presente e di formato corretto`))
      continue
    }
    if (SOLO_VERIFICA) {
      console.log(ko(`${chiave} mancante`))
      continue
    }
    console.log(info(`Da Supabase → Settings → API → ${etichetta}`))
    for (;;) {
      const risposta = (await rl.question(`    ${chiave} = `)).trim()
      if (!risposta) {
        console.log(info('saltata.'))
        break
      }
      const errore = valida(risposta)
      if (errore) {
        console.log(ko(errore))
        continue
      }
      daScrivere[chiave] = risposta
      env[chiave] = risposta
      console.log(ok('formato corretto'))
      break
    }
  }
  rl.close()

  // --- 4. Chiave di cifratura ---------------------------------------------
  console.log('\n\x1b[1m4. Chiave di cifratura dei token\x1b[0m')
  if (!env.TOKEN_ENC_KEY) {
    console.log(ko('TOKEN_ENC_KEY mancante — generala con: openssl rand -base64 32'))
  } else {
    const byte = Buffer.from(env.TOKEN_ENC_KEY, 'base64').length
    if (byte === 32) console.log(ok('TOKEN_ENC_KEY valida (32 byte)'))
    else console.log(ko(`TOKEN_ENC_KEY di ${byte} byte invece di 32 — rigenerala`))
  }

  // --- 5. Scrittura --------------------------------------------------------
  if (Object.keys(daScrivere).length && !SOLO_VERIFICA) {
    const backup = `${ENV}.bak-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`
    copyFileSync(ENV, backup)
    for (const [k, v] of Object.entries(daScrivere)) imposta(righe, k, v)
    writeFileSync(ENV, righe.join('\n'))
    console.log(`\n\x1b[1m→ Scritte ${Object.keys(daScrivere).length} variabili\x1b[0m (backup: ${backup.split('/').pop()})`)
    righe = righeEnv()
    env = valori(righe)
  }

  // --- 6. Prove di connessione --------------------------------------------
  console.log('\n\x1b[1m5. Prove di connessione\x1b[0m')

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const esito = await provaSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    console.log(esito.ok ? ok(`Supabase — ${esito.dettaglio}`) : ko(`Supabase — ${esito.dettaglio}`))
  } else {
    console.log(info('Supabase: salto, variabili incomplete'))
  }

  if (token) {
    // Scaletta di diagnosi del piano RU: il primo passo che fallisce dice a che
    // livello sta il problema.
    const sito = env.SP_SITE_RU
    if (sito) {
      try {
        const s = await graph(token, `/sites/${sito}?$select=displayName,webUrl`)
        console.log(ok(`sito RU raggiungibile — ${s.displayName}`))
        for (const [nome, chiave] of [['Dipendenti', 'SP_LIST_DIPENDENTI'], ['Tirocini', 'SP_LIST_TIROCINI']]) {
          if (!env[chiave]) { console.log(info(`${chiave} non impostata, salto`)); continue }
          try {
            const l = await graph(token, `/sites/${sito}/lists/${env[chiave]}?$select=displayName`)
            console.log(ok(`lista ${nome} raggiungibile sul sito RU — "${l.displayName}"`))
          } catch (e) {
            console.log(ko(`lista ${nome} (${chiave}) — ${e.message}`))
            console.log(info('GUID di una lista di un altro sito? Controlla l’assetto: node scripts/ru-assetto.mjs'))
          }
        }
      } catch (e) {
        console.log(ko(`sito RU — ${e.message}`))
      }
    } else {
      console.log(info('SP_SITE_RU non impostata: assetto A (liste su Controllo di Gestione)'))
      for (const [nome, chiave] of [['Dipendenti', 'SP_LIST_DIPENDENTI'], ['Tirocini', 'SP_LIST_TIROCINI']]) {
        if (!env[chiave]) continue
        try {
          const l = await graph(token, `/sites/${env.SHAREPOINT_SITE_ID}/lists/${env[chiave]}?$select=displayName,items@odata.count`)
          console.log(ok(`lista ${nome} raggiungibile — "${l.displayName}"`))
        } catch (e) {
          console.log(ko(`lista ${nome} (${chiave}) — ${e.message}`))
        }
      }
    }
  }

  console.log('\n\x1b[1mProssimo passo\x1b[0m')
  console.log(info('riavvia `npm run dev`, poi esci e rientra nell’app per salvare il token delegato.'))
  console.log(info('verifica: node scripts/setup-env-locale.mjs --verifica\n'))
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
