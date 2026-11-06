#!/usr/bin/env node
/**
 * Corregge una mail aziendale sbagliata, in anagrafica RU E nella scheda
 * timbrature, nello stesso momento.
 *
 * Perche' tutte e due insieme: le timbrature riconoscono la persona dalla mail.
 * Se si corregge solo l'anagrafica, la sincronizzazione non trova piu' la scheda
 * vecchia e ne crea una nuova: la persona si ritrova con due schede, quella
 * vecchia continua a chiedere validazioni e manda l'avviso "non e' in
 * anagrafica" (casi Cominetti e Lo Sardo, 06/11/2026).
 *
 * Prima di scrivere controlla che la mail nuova sia un account Microsoft vero.
 *
 * Uso (da web/):
 *   node scripts/correggi-mail-aziendale.mjs vecchia@dominio nuova@dominio            # anteprima
 *   node scripts/correggi-mail-aziendale.mjs vecchia@dominio nuova@dominio --apply    # scrive
 *
 * Legge GRAPH_*, SP_* e SUPABASE_* da .env.local.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  for (const r of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
    const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const APPLY = process.argv.includes('--apply')
const [VECCHIA, NUOVA] = args.map((a) => a.trim().toLowerCase())
if (!VECCHIA || !NUOVA || !VECCHIA.includes('@') || !NUOVA.includes('@')) {
  console.error('Uso: node scripts/correggi-mail-aziendale.mjs vecchia@dominio nuova@dominio [--apply]')
  process.exit(1)
}

async function token() {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.GRAPH_CLIENT_ID,
      client_secret: process.env.GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d.error_description || 'token non ottenuto')
  return d.access_token
}

async function graph(tk, url, init = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tk}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const t = await res.text()
  const d = t ? JSON.parse(t) : {}
  if (!res.ok) throw new Error(d.error?.message || `Graph ${res.status}`)
  return d
}

async function sb(path, init = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function main() {
  const tk = await token()

  // 1. la mail nuova deve essere un account vero e attivo
  const f = encodeURIComponent(`mail eq '${NUOVA}' or userPrincipalName eq '${NUOVA}'`)
  const u = (await graph(tk, `/users?$filter=${f}&$select=displayName,mail,userPrincipalName,accountEnabled`)).value || []
  if (!u.length) throw new Error(`${NUOVA} non e' un account Microsoft: niente da fare, controlla l'indirizzo.`)
  if (u[0].accountEnabled === false) throw new Error(`${NUOVA} esiste ma l'account e' DISABILITATO.`)
  console.log(`✓ account Microsoft: ${u[0].displayName} <${NUOVA}>`)

  // 2. anagrafica RU
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  const liste = [['Dipendenti', process.env.SP_LIST_DIPENDENTI], ['Tirocini', process.env.SP_LIST_TIROCINI]].filter(([, id]) => id)
  const daCorreggere = []
  for (const [nome, listId] of liste) {
    let next = `/sites/${site}/lists/${listId}/items?$select=id,fields&$expand=fields($select=Title,Cognome,Nome,MailAziendale,StatoRapporto)&$top=200`
    while (next) {
      const d = await graph(tk, next)
      for (const it of d.value || []) {
        if ((it.fields?.MailAziendale || '').trim().toLowerCase() === VECCHIA) daCorreggere.push({ lista: nome, listId, it })
      }
      next = d['@odata.nextLink'] ? d['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null
    }
  }
  console.log(`\nAnagrafica RU — schede con ${VECCHIA}: ${daCorreggere.length}`)
  for (const r of daCorreggere) {
    const fl = r.it.fields || {}
    console.log(`  · ${r.lista} #${r.it.id}  ${`${fl.Cognome || ''} ${fl.Nome || ''}`.trim() || fl.Title}  ${fl.StatoRapporto ? `[${fl.StatoRapporto}]` : ''}`)
  }

  // 3. scheda timbrature
  const vecchie = await sb(`dipendente?select=id,email,cognome_nome,attivo&email=eq.${encodeURIComponent(VECCHIA)}`)
  const nuove = await sb(`dipendente?select=id,email,cognome_nome,attivo&email=eq.${encodeURIComponent(NUOVA)}`)
  console.log(`\nTimbrature — scheda con ${VECCHIA}: ${vecchie.map((d) => `id ${d.id}`).join(', ') || 'nessuna'}`)
  console.log(`Timbrature — scheda con ${NUOVA}: ${nuove.map((d) => `id ${d.id}`).join(', ') || 'nessuna'}`)
  if (vecchie.length && nuove.length) {
    throw new Error(
      `Esistono gia' DUE schede timbrature (vecchia e nuova): e' un doppione da unire a mano, ` +
        `non si corregge con questo script. Chiedi a Claude.`,
    )
  }

  if (!APPLY) {
    console.log('\nANTEPRIMA: non ho scritto niente. Rilancia con --apply per correggere.\n')
    return
  }

  for (const r of daCorreggere) {
    await graph(tk, `/sites/${site}/lists/${r.listId}/items/${r.it.id}/fields`, {
      method: 'PATCH',
      body: JSON.stringify({ MailAziendale: NUOVA }),
    })
    console.log(`✓ anagrafica ${r.lista} #${r.it.id} → ${NUOVA}`)
  }
  for (const d of vecchie) {
    await sb(`dipendente?id=eq.${d.id}`, { method: 'PATCH', body: JSON.stringify({ email: NUOVA }) })
    console.log(`✓ scheda timbrature id ${d.id} → ${NUOVA}`)
  }
  console.log('\nFatto.\n')
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
