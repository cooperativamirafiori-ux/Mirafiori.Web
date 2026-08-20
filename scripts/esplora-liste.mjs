#!/usr/bin/env node
/**
 * Fotografa le liste SharePoint di un sito: colonne (nome interno, tipo, scelte,
 * lookup) e contenuto, e scrive tutto in un JSON che si può leggere/allegare.
 *
 * Serve quando si deve capire una lista fatta da altri prima di scriverci codice.
 *
 * Uso (dalla cartella web/):
 *   node scripts/esplora-liste.mjs gruppo_it
 *   node scripts/esplora-liste.mjs gruppo_it "Lista dispositivi" "Lista SIM"
 *   node scripts/esplora-liste.mjs https://tenant.sharepoint.com/sites/gruppo_it --out=/tmp/x.json
 *
 * Opzioni:
 *   --out=<file>     dove scrivere il JSON (default: esplorazione-<sito>.json in cwd)
 *   --max=<n>        righe massime per lista (default 500)
 *   --solo-colonne   non scarica le righe, solo lo schema
 *
 * Identità applicativa: GRAPH_TENANT_ID / _CLIENT_ID / _CLIENT_SECRET in .env.local.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* env già impostate */ }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

/** Da URL o nome sito ricava "host:/sites/nome" nel formato accettato da Graph. */
function percorsoGraph(arg, hostDefault) {
  if (/^https?:\/\//i.test(arg)) {
    const u = new URL(arg)
    return `${u.hostname}:${u.pathname.replace(/\/$/, '')}`
  }
  if (arg.includes('/')) return arg.replace(/^\/+/, `${hostDefault}:/`)
  return `${hostDefault}:/sites/${arg}`
}

/** Riduce una colonna Graph all'essenziale: tipo e vincoli. */
function sintesiColonna(c) {
  const tipo = c.text ? 'testo'
    : c.number ? 'numero'
    : c.dateTime ? 'data'
    : c.boolean ? 'sì/no'
    : c.choice ? 'scelta'
    : c.lookup ? 'lookup'
    : c.personOrGroup ? 'persona'
    : c.currency ? 'valuta'
    : c.hyperlinkOrPicture ? 'link'
    : c.calculated ? 'calcolata'
    : c.term || c.termSet ? 'metadati'
    : 'altro'
  const out = {
    nomeInterno: c.name,
    etichetta: c.displayName,
    tipo,
    obbligatoria: !!c.required || undefined,
    indicizzata: c.indexed || undefined,
    soloLettura: c.readOnly || undefined,
    descrizione: c.description || undefined,
  }
  if (c.choice) out.scelte = c.choice.choices
  if (c.lookup) out.lookup = { lista: c.lookup.listId, campo: c.lookup.columnName, multiplo: !!c.lookup.allowMultipleValues }
  if (c.text?.maxLength) out.maxLunghezza = c.text.maxLength
  if (c.dateTime) out.formatoData = c.dateTime.format
  if (c.calculated) out.formula = c.calculated.formula
  if (c.personOrGroup) out.personaMultipla = !!c.personOrGroup.allowMultipleSelection
  return out
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  const argv = process.argv.slice(2)
  const opzioni = argv.filter((a) => a.startsWith('--'))
  const liberi = argv.filter((a) => !a.startsWith('--'))
  const sitoArg = liberi[0]
  const filtroListe = liberi.slice(1).map((s) => s.toLowerCase())
  if (!sitoArg) {
    console.error('Uso: node scripts/esplora-liste.mjs <url-o-nome-sito> ["Lista A" "Lista B" ...]')
    process.exit(1)
  }
  const soloColonne = opzioni.includes('--solo-colonne')
  const max = Number(opzioni.find((o) => o.startsWith('--max='))?.slice(6) || 500)
  const hostDefault = (process.env.SHAREPOINT_SITE_URL || 'https://x.sharepoint.com')
    .replace(/^https?:\/\//, '').split('/')[0]

  const token = await getToken()
  const g = async (p) => {
    const r = await fetch(p.startsWith('http') ? p : `https://graph.microsoft.com/v1.0${p}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const t = await r.text()
    if (!r.ok) throw new Error(`GET ${p.slice(0, 120)} → ${r.status}: ${t.slice(0, 400)}`)
    return t ? JSON.parse(t) : {}
  }

  const site = await g(`/sites/${percorsoGraph(sitoArg, hostDefault)}?$select=id,displayName,webUrl`)
  console.log(`Sito: ${site.displayName} — ${site.webUrl}`)
  console.log(`  id: ${site.id}\n`)

  const tutte = (await g(`/sites/${site.id}/lists?$select=id,displayName,description,list,webUrl&$top=200`)).value || []
  const liste = tutte
    .filter((l) => l.list?.template === 'genericList' && !l.list?.hidden)
    .filter((l) => !filtroListe.length || filtroListe.includes(l.displayName.toLowerCase()))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  const report = { sito: { id: site.id, nome: site.displayName, url: site.webUrl }, liste: [] }

  for (const l of liste) {
    console.log(`— ${l.displayName}`)
    const colonne = ((await g(`/sites/${site.id}/lists/${l.id}/columns?$top=200`)).value || [])
      .filter((c) => !c.hidden && !['ContentType', 'Attachments', 'Edit', 'LinkTitleNoMenu', 'LinkTitle', 'DocIcon', 'ItemChildCount', 'FolderChildCount', '_ComplianceFlags', '_ComplianceTag', '_ComplianceTagWrittenTime', '_ComplianceTagUserId', '_IsRecord', 'AppAuthor', 'AppEditor', '_UIVersionString'].includes(c.name))
      .map(sintesiColonna)

    const righe = []
    if (!soloColonne) {
      let url = `/sites/${site.id}/lists/${l.id}/items?$expand=fields&$top=200`
      while (url && righe.length < max) {
        const p = await g(url)
        for (const it of p.value || []) {
          const f = { ...it.fields }
          for (const k of Object.keys(f)) {
            if (f[k] === null || f[k] === '' || /^(@odata|_ComplianceFlags|_ComplianceTag|_IsRecord|_UIVersionString|AppAuthor|AppEditor|ContentType|Attachments|Edit|LinkTitle|DocIcon|FileSizeDisplay|ItemChildCount|FolderChildCount|_x005f_)/.test(k)) delete f[k]
          }
          righe.push(f)
        }
        url = p['@odata.nextLink'] || null
      }
    }
    console.log(`   ${colonne.length} colonne, ${righe.length} righe`)
    report.liste.push({ nome: l.displayName, id: l.id, descrizione: l.description || undefined, url: l.webUrl, colonne, righe })
  }

  const out = opzioni.find((o) => o.startsWith('--out='))?.slice(6)
    || join(process.cwd(), `esplorazione-${(sitoArg.split('/').pop() || 'sito')}.json`)
  writeFileSync(out, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\n✓ Scritto: ${out}`)
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
