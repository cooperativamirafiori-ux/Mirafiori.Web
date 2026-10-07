#!/usr/bin/env node
/**
 * Diagnosi per la sincronizzazione automatica "soci → lista di distribuzione".
 * SOLA LETTURA: non modifica niente, né in SharePoint né in Entra/Exchange.
 *
 * Uso (da web/):
 *   node scripts/diagnosi-lista-soci.mjs
 *   node scripts/diagnosi-lista-soci.mjs soci@cooperativamirafiori.com
 *
 * Senza argomenti: quanti soci ci sono e quanti hanno un account Microsoft 365.
 * Con l'indirizzo di una lista esistente: che tipo di lista è (se Graph può
 * modificarla) e chi andrebbe aggiunto / tolto.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  for (const line of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* env già impostate */ }

const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SP_LIST_DIPENDENTI } = process.env
const SITO = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
const lista = (process.argv[2] || '').toLowerCase()

const tok = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: GRAPH_CLIENT_ID,
    client_secret: GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
}).then(r => r.json())
if (!tok.access_token) { console.error('Token non ottenuto:', tok.error_description); process.exit(1) }
const H = { Authorization: `Bearer ${tok.access_token}`, ConsistencyLevel: 'eventual' }
const get = async p => {
  const r = await fetch(p.startsWith('http') ? p : `https://graph.microsoft.com/v1.0${p}`, { headers: H })
  return r.ok ? r.json() : { _errore: r.status, ...(await r.json().catch(() => ({}))) }
}
const getAll = async p => {
  const out = []
  for (let u = p; u;) { const r = await get(u); if (r._errore) return r; out.push(...r.value); u = r['@odata.nextLink'] }
  return out
}

// 1. Soci dall'anagrafica RU
const righe = await getAll(`/sites/${SITO}/lists/${SP_LIST_DIPENDENTI}/items?expand=fields(select=Title,Cognome,Nome,Socio,MailAziendale,MailPersonale,StatoRapporto,CategoriaRU,DataDimissioneSocio)&$top=999`)
if (righe._errore) { console.error('Lettura anagrafica non riuscita:', righe._errore, righe.error?.message); process.exit(1) }
const f = righe.map(r => r.fields)
const soci = f.filter(r => r.Socio === 'Si' && !r.DataDimissioneSocio)
const nome = r => `${r.Cognome ?? ''} ${r.Nome ?? ''}`.trim() || r.Title
const mailA = r => (r.MailAziendale || '').trim().toLowerCase()

console.log(`\n\x1b[1mAnagrafica\x1b[0m  record ${f.length} · Socio=Si ${f.filter(r => r.Socio === 'Si').length} · di cui con data dimissione socio ${f.filter(r => r.Socio === 'Si' && r.DataDimissioneSocio).length}`)
console.log(`Soci attivi considerati: ${soci.length}`)
console.log('  per stato rapporto:', soci.reduce((a, r) => (a[r.StatoRapporto || '(vuoto)'] = (a[r.StatoRapporto || '(vuoto)'] || 0) + 1, a), {}))
console.log('  per categoria:', soci.reduce((a, r) => (a[r.CategoriaRU || '(vuoto)'] = (a[r.CategoriaRU || '(vuoto)'] || 0) + 1, a), {}))

// 2. Chi ha un account Microsoft 365 nel tenant
const conAccount = [], senzaAccount = [], soloPersonale = [], nessuna = []
for (const r of soci) {
  const m = mailA(r)
  if (!m) { (r.MailPersonale ? soloPersonale : nessuna).push(r); continue }
  const u = await get(`/users/${encodeURIComponent(m)}?$select=id,accountEnabled`)
  if (u._errore) senzaAccount.push(r); else conAccount.push({ ...r, _id: u.id, _attivo: u.accountEnabled })
}
console.log(`\n\x1b[1mCopertura mail dei soci\x1b[0m`)
console.log(`  con account M365 valido:            ${conAccount.length}${conAccount.some(r => !r._attivo) ? ` (di cui disabilitati ${conAccount.filter(r => !r._attivo).length})` : ''}`)
console.log(`  mail aziendale che NON è un account: ${senzaAccount.length}`)
console.log(`  solo mail personale:                ${soloPersonale.length}`)
console.log(`  nessuna mail:                       ${nessuna.length}`)
for (const [t, l] of [['Mail aziendale non trovata nel tenant', senzaAccount], ['Solo mail personale', soloPersonale], ['Nessuna mail', nessuna]])
  if (l.length) console.log(`\n  ${t}:\n` + l.map(r => `    - ${nome(r)}  ${mailA(r) || r.MailPersonale || ''}`).join('\n'))

// 3. Lista esistente (facoltativa)
if (lista) {
  console.log(`\n\x1b[1mLista ${lista}\x1b[0m`)
  const g = await get(`/groups?$filter=mail eq '${lista}' or proxyAddresses/any(x:x eq 'smtp:${lista}')&$count=true&$select=id,displayName,groupTypes,mailEnabled,securityEnabled,onPremisesSyncEnabled`)
  const gr = g.value?.[0]
  if (!gr) { console.log('  Non trovata tra i gruppi (o permesso mancante per leggerla).', g._errore ? `HTTP ${g._errore}` : ''); process.exit() }
  const tipo = gr.groupTypes?.includes('Unified') ? 'Gruppo Microsoft 365 → Graph PUÒ modificarlo'
    : gr.mailEnabled && !gr.securityEnabled ? 'Lista di distribuzione Exchange → Graph NON può modificarla (serve Exchange PowerShell)'
    : gr.mailEnabled && gr.securityEnabled ? 'Gruppo di sicurezza abilitato alla posta → Graph NON può modificarlo'
    : 'Gruppo di sicurezza (non di posta)'
  console.log(`  ${gr.displayName} — ${tipo}`)
  const membri = await getAll(`/groups/${gr.id}/members?$select=id,mail,userPrincipalName,displayName&$top=999`)
  if (membri._errore) { console.log('  Membri non leggibili:', membri._errore); process.exit() }
  const ids = new Set(membri.map(m => m.id))
  const idSoci = new Set(conAccount.map(r => r._id))
  const daAggiungere = conAccount.filter(r => !ids.has(r._id))
  const nonSoci = membri.filter(m => !idSoci.has(m.id))
  console.log(`  membri attuali ${membri.length} · da AGGIUNGERE ${daAggiungere.length} · presenti ma NON soci (da valutare) ${nonSoci.length}`)
  if (daAggiungere.length) console.log('  Da aggiungere:\n' + daAggiungere.map(r => `    + ${nome(r)}  ${mailA(r)}`).join('\n'))
  if (nonSoci.length) console.log('  Presenti ma non soci in anagrafica:\n' + nonSoci.map(m => `    ? ${m.displayName}  ${m.mail || m.userPrincipalName || '(contatto esterno)'}`).join('\n'))
}
console.log()
