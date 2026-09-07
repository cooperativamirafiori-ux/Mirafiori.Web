#!/usr/bin/env node
/**
 * Perche' questa persona "non riesce a timbrare".
 *
 * Risponde alla segnalazione piu' frequente dell'area Timbrature mettendo in
 * fila, per una sola persona, tutte le cose che possono fermarla — nell'ordine
 * in cui l'app le controlla:
 *
 *   1. l'account Microsoft esiste e con quale indirizzo (e' la chiave: si entra
 *      con quello, e se differisce dalla mail aziendale in anagrafica l'app la
 *      tratta come una persona che non c'e');
 *   2. la scheda in anagrafica timbrature: presente? attiva? "non timbra"?
 *      chi e' il referente che le validera' il foglio;
 *   3. l'orario teorico (monte ore): senza, le ore attese sono zero e il foglio
 *      ore non dice niente;
 *   4. lo stato dei mesi: un mese "da validare" o oltre e' chiuso in scrittura
 *      per il dipendente, e questa e' quasi sempre la risposta;
 *   5. la finestra mobile: le ore di LAVORO si inseriscono solo per oggi e i due
 *      giorni precedenti (i giustificativi no, quelli si programmano).
 *
 * Uso (da web/):
 *   node scripts/diagnosi-timbratore.mjs simona.finetti@cooperativamirafiori.com
 *
 * Sola lettura. Legge SUPABASE_* e GRAPH_* da .env.local. Il controllo
 * dell'account Microsoft si salta da se' se le GRAPH_* non ci sono.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Giorni indietro consentiti per le ore di lavoro (deve seguire lib/timbrature/date.ts). */
const GIORNI_INDIETRO = 2

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* env già impostate */ }
}

async function sb(path) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`Supabase ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/**
 * L'account nel tenant, se le credenziali app-only sono a portata di mano.
 *
 * Non deve mai far cadere la diagnosi: e' il primo dei cinque controlli, e i
 * quattro che contano davvero stanno su Supabase. Quindi ogni inciampo —
 * credenziali assenti, rete che non arriva a Microsoft — diventa una riga di
 * esito e non un'eccezione.
 */
async function accountEntra(mail) {
  try {
    return await interrogaEntra(mail)
  } catch (e) {
    return { errore: e instanceof Error ? e.message : String(e) }
  }
}

async function interrogaEntra(mail) {
  const t = process.env.GRAPH_TENANT_ID
  const c = process.env.GRAPH_CLIENT_ID
  const s = process.env.GRAPH_CLIENT_SECRET
  if (!t || !c || !s) return { saltato: 'GRAPH_* non impostate' }
  const body = new URLSearchParams({
    client_id: c,
    client_secret: s,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const tk = await (await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: 'POST',
    body,
  })).json()
  if (!tk.access_token) return { errore: tk.error_description ?? 'token non rilasciato' }
  const cognome = mail.split('@')[0].split('.').pop()
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users?$search="displayName:${cognome}"` +
      `&$select=displayName,userPrincipalName,mail,accountEnabled&$top=10`,
    { headers: { Authorization: `Bearer ${tk.access_token}`, ConsistencyLevel: 'eventual' } },
  )
  if (!res.ok) return { errore: `Graph ${res.status}: ${(await res.text()).slice(0, 200)}` }
  return { trovati: (await res.json()).value ?? [] }
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function main() {
  loadEnvLocal()
  const mail = (process.argv[2] || '').trim().toLowerCase()
  if (!mail) throw new Error('Uso: node scripts/diagnosi-timbratore.mjs <mail.aziendale@cooperativamirafiori.com>')

  console.log(`\n=== ${mail} ===\n`)

  // 1. account Microsoft
  const acc = await accountEntra(mail)
  if (acc.saltato) console.log(`1. Account Microsoft: controllo saltato (${acc.saltato})`)
  else if (acc.errore) console.log(`1. Account Microsoft: non verificabile — ${acc.errore}`)
  else {
    const esatto = acc.trovati.find(
      (u) => [u.mail, u.userPrincipalName].filter(Boolean).some((v) => v.toLowerCase() === mail),
    )
    if (esatto) {
      console.log(`1. Account Microsoft: OK — ${esatto.displayName} (${esatto.userPrincipalName})` +
        `${esatto.accountEnabled === false ? ' ⚠ ACCOUNT DISABILITATO' : ''}`)
    } else {
      console.log('1. Account Microsoft: ⚠ nessun account con questo indirizzo. Simili trovati:')
      for (const u of acc.trovati) console.log(`     - ${u.displayName}: ${u.userPrincipalName} / mail ${u.mail ?? '—'}`)
      console.log('   Se la persona entra con un altro indirizzo, l\'app non la riconosce: si corregge')
      console.log('   la Mail aziendale sulla scheda in Risorse Umane, non qui.')
    }
  }

  // 2. scheda in anagrafica timbrature
  const [dip] = await sb(`dipendente?email=eq.${encodeURIComponent(mail)}&select=*`)
  if (!dip) {
    console.log('\n2. Anagrafica timbrature: ⚠ NESSUNA SCHEDA. Serve la spunta "Timbratura attiva"')
    console.log('   sulla scheda in Risorse Umane, poi "Sincronizza da anagrafica" nel cruscotto.')
    return
  }
  console.log(`\n2. Anagrafica timbrature: ${dip.cognome_nome} (id ${dip.id})`)
  console.log(`   attiva: ${dip.attivo ? 'sì' : '⚠ NO — non può entrare nella sezione'}`)
  console.log(`   non timbra: ${dip.non_timbra ? 'sì (il mese si genera dall\'orario teorico)' : 'no'}`)
  console.log(`   referente foglio ore: ${dip.referente_email ?? '⚠ nessuno — il foglio resta alle HR'}`)

  // 3. orario teorico
  const profili = await sb(`profilo_orario?dipendente_id=eq.${dip.id}&select=decorrenza&order=decorrenza.desc`)
  console.log(
    `\n3. Orario teorico: ${profili.length ? `${profili.length} profili, ultimo dal ${profili[0].decorrenza}` : '⚠ NESSUNO — ore attese a zero, il foglio ore non dice niente'}`,
  )

  // 4. stato dei mesi
  const chiusure = await sb(
    `chiusura_mese?dipendente_id=eq.${dip.id}&select=anno,mese,stato,validato_da&order=anno.desc,mese.desc&limit=12`,
  )
  console.log('\n4. Stato dei mesi (il dipendente scrive solo su un mese "aperto"):')
  if (!chiusure.length) console.log('   nessuna chiusura registrata: i mesi non scaduti sono aperti')
  for (const c of chiusure) {
    const bloccato = c.stato !== 'aperto'
    console.log(`   ${c.anno}-${String(c.mese).padStart(2, '0')}: ${c.stato}${bloccato ? ' → chiuso in scrittura' : ''}`)
  }

  // 5. righe e finestra mobile
  const righe = await sb(`timbratura?dipendente_id=eq.${dip.id}&select=data&order=data.desc&limit=1`)
  const oggi = new Date()
  const limite = new Date(oggi)
  limite.setDate(limite.getDate() - GIORNI_INDIETRO)
  console.log(`\n5. Righe inserite: ${righe.length ? `ultima il ${righe[0].data}` : '⚠ MAI NESSUNA'}`)
  console.log(`   Finestra ore di lavoro, oggi: dal ${ymd(limite)} al ${ymd(oggi)}.`)
  console.log('   Fuori da questa finestra, e sui mesi non aperti, deve intervenire il responsabile')
  console.log('   dal cruscotto di validazione (inserisce lui la riga, resta segnata come sua).\n')
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`)
  process.exit(1)
})
