#!/usr/bin/env node
/**
 * Le mail aziendali inserite nelle schede corrispondono a un account Microsoft
 * che esiste davvero?
 *
 * Nato il 06/11/2026 dal caso Cominetti: in anagrafica c'era "eilsa.cominetti",
 * l'account vero e' "elisa.cominetti", e il foglio ore restava bloccato. Un
 * refuso nella mail non da' errore al salvataggio: lo si scopre solo a fine mese.
 *
 * Controlla due fonti:
 *   1. le schede timbrature su Supabase (tabella dipendente);
 *   2. il campo MailAziendale dell'anagrafica RU (Dipendenti e Tirocini).
 * e confronta ogni indirizzo con gli account del tenant (mail, UPN e alias).
 *
 * Segnala anche le persone con DUE schede timbrature attive (stesso nominativo):
 * e' il segno che la mail e' stata corretta in anagrafica e la sincronizzazione
 * ha creato una scheda nuova invece di aggiornare quella vecchia.
 *
 * Uso (da web/):   node scripts/controlla-mail-account.mjs
 * Sola lettura. Legge GRAPH_*, SP_* e SUPABASE_* da .env.local.
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

const v = (x) => (typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim())
const low = (x) => v(x).toLowerCase()

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

async function graphAll(tk, url) {
  const out = []
  let next = `https://graph.microsoft.com/v1.0${url}`
  while (next) {
    const res = await fetch(next, {
      headers: { Authorization: `Bearer ${tk}`, Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error?.message || `Graph ${res.status}`)
    out.push(...(d.value || []))
    next = d['@odata.nextLink'] || null
  }
  return out
}

async function sb(path) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/** Distanza di Levenshtein: per suggerire l'account giusto quando c'e' un refuso. */
function dist(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) m[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return m[a.length][b.length]
}

async function main() {
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  const tk = await token()

  // --- account del tenant
  const utenti = await graphAll(tk, '/users?$select=displayName,mail,userPrincipalName,proxyAddresses,accountEnabled&$top=999')
  const perIndirizzo = new Map() // indirizzo -> { utente, tipo }
  const primari = []
  for (const u of utenti) {
    const prim = low(u.mail) || low(u.userPrincipalName)
    if (prim) primari.push({ addr: prim, u })
    for (const a of [low(u.mail), low(u.userPrincipalName)]) if (a && !perIndirizzo.has(a)) perIndirizzo.set(a, { u, tipo: 'primario' })
    for (const p of u.proxyAddresses || []) {
      const a = low(p.replace(/^smtp:/i, ''))
      if (a && !perIndirizzo.has(a)) perIndirizzo.set(a, { u, tipo: 'alias' })
    }
  }
  console.log(`\nAccount Microsoft nel tenant: ${utenti.length}`)

  function esito(mail) {
    const m = low(mail)
    const hit = perIndirizzo.get(m)
    if (!hit) {
      const vicini = primari
        .map((p) => ({ ...p, d: dist(m.split('@')[0], p.addr.split('@')[0]) }))
        .filter((p) => p.d <= 3)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .map((p) => p.addr)
      return { ok: false, motivo: 'NON ESISTE', suggerimento: vicini.join(' / ') }
    }
    if (hit.u.accountEnabled === false) return { ok: false, motivo: 'account DISABILITATO' }
    if (hit.tipo === 'alias') return { ok: false, motivo: `solo ALIAS di ${low(hit.u.mail) || low(hit.u.userPrincipalName)}` }
    return { ok: true }
  }

  function stampa(titolo, righe) {
    const ko = righe.map((r) => ({ ...r, e: esito(r.mail) })).filter((r) => !r.e.ok)
    console.log(`\n=== ${titolo} — ${righe.length} mail controllate, ${ko.length} da sistemare`)
    for (const r of ko) {
      console.log(`  ✗ ${r.nome.padEnd(36)} ${r.mail}   → ${r.e.motivo}${r.e.suggerimento ? `   (forse: ${r.e.suggerimento})` : ''}${r.extra ? `   ${r.extra}` : ''}`)
    }
  }

  // --- 1. schede timbrature (Supabase)
  const dip = await sb('dipendente?select=id,email,cognome_nome,attivo&order=cognome_nome')
  stampa(
    'Schede timbrature ATTIVE (Supabase)',
    dip.filter((d) => d.attivo).map((d) => ({ nome: d.cognome_nome, mail: d.email, extra: `[id ${d.id}]` })),
  )

  const perNome = new Map()
  for (const d of dip.filter((d) => d.attivo)) {
    const k = low(d.cognome_nome)
    perNome.set(k, [...(perNome.get(k) || []), d])
  }
  const doppie = [...perNome.values()].filter((g) => g.length > 1)
  console.log(`\n=== Persone con PIU' schede timbrature attive — ${doppie.length}`)
  for (const g of doppie) console.log(`  ⚠ ${g[0].cognome_nome}: ${g.map((d) => `${d.email} [id ${d.id}]`).join('  |  ')}`)

  // --- 2. anagrafica RU (SharePoint)
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  const liste = [['Dipendenti', process.env.SP_LIST_DIPENDENTI], ['Tirocini', process.env.SP_LIST_TIROCINI]].filter(([, id]) => id)
  for (const [etichetta, listId] of liste) {
    const campi = 'Title,Cognome,Nome,MailAziendale,StatoRapporto,StatoTirocinio'
    const items = await graphAll(tk, `/sites/${site}/lists/${listId}/items?$select=id,fields&$expand=fields($select=${campi})&$top=200`)
    const righe = items
      .map((it) => {
        const f = it.fields || {}
        const chiuso = v(f.StatoRapporto) === 'Cessato' || ['INTERROTTO', 'TERMINATO'].includes(v(f.StatoTirocinio).toUpperCase())
        return {
          nome: `${v(f.Cognome)} ${v(f.Nome)}`.trim() || v(f.Title) || `item ${it.id}`,
          mail: v(f.MailAziendale),
          extra: chiuso ? '[rapporto chiuso]' : '',
        }
      })
      .filter((r) => r.mail)
    stampa(`Anagrafica RU — ${etichetta} (campo Mail aziendale)`, righe)
  }

  console.log('\nLegenda: NON ESISTE = refuso o account mai creato · DISABILITATO = account spento in Microsoft ·')
  console.log('ALIAS = l\'indirizzo arriva in casella ma non e\' quello con cui la persona entra nell\'app.\n')
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
