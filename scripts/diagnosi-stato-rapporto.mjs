#!/usr/bin/env node
/**
 * Le schede Dipendenti senza `StatoRapporto`, con accanto i campi che servono a
 * decidere quale stato mettere.
 *
 * Perché non si può indovinare: lo stato non è "attivo oppure cessato", ha sette
 * valori (Attivo, Aspettativa, Maternità, Congedo parentale, Malattia lunga,
 * Sospeso, Cessato). Riempire tutto con "Attivo" perché manca la data di
 * dimissione cancellerebbe l'informazione di chi è in maternità o in aspettativa
 * — e nessuno se ne accorgerebbe, perché il campo risulterebbe pieno.
 *
 * Quindi qui si legge e si propone; a decidere sono le Risorse Umane.
 *
 * Lo stato conta al di là dell'ordine in anagrafica: è quello che stabilisce chi
 * compare come "in servizio" e quindi chi finisce nel cruscotto dei fogli ore.
 *
 * USO (dalla cartella web/):
 *   node scripts/diagnosi-stato-rapporto.mjs
 *   node scripts/diagnosi-stato-rapporto.mjs --csv > stati-da-sistemare.csv
 *
 * Sola lettura: non scrive niente su SharePoint, in nessun caso.
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SP_LIST_DIPENDENTI e il sito (SP_SITE_RU o SHAREPOINT_SITE_ID).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CSV = process.argv.includes('--csv')

const CAMPI = [
  'Cognome', 'Nome', 'Matricola', 'TipoRapporto', 'StatoRapporto',
  'DataAssunzione', 'DataDimissioneLavoratore', 'MailAziendale', 'TimbraturaAttiva',
].join(',')

function caricaEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const riga of raw.split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* env già impostate */ }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(`Token non ottenuto: ${d.error_description || res.status}`)
  return d.access_token
}

async function graph(token, url) {
  const res = await fetch(url.startsWith('http') ? url : `https://graph.microsoft.com/v1.0${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

const val = (v) => (v == null ? '' : String(v).trim())
const giorno = (v) => (val(v) ? val(v).slice(0, 10).split('-').reverse().join('/') : '')

/**
 * Lo stato che i dati suggeriscono — SUGGERIMENTO, non verdetto.
 * C'è una data di dimissione → Cessato, ed è l'unico caso in cui i dati parlano
 * chiaro. Altrimenti la persona è in servizio, ma "in che modo" (Attivo,
 * Maternità, Aspettativa…) i campi non lo sanno: lo sanno le HR.
 */
function suggerito(f) {
  if (val(f.DataDimissioneLavoratore)) return 'Cessato'
  return 'da decidere (Attivo? Maternità? Aspettativa?)'
}

async function main() {
  caricaEnv()
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  const listId = process.env.SP_LIST_DIPENDENTI
  if (!site || !listId) {
    console.error('✗ Mancano SP_SITE_RU (o SHAREPOINT_SITE_ID) e SP_LIST_DIPENDENTI in .env.local')
    process.exit(1)
  }

  const token = await getToken()
  const items = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=${CAMPI})&$top=200`
  while (url) {
    const res = await graph(token, url)
    items.push(...(res.value || []))
    url = res['@odata.nextLink'] || null
  }

  const senza = items
    .map((it) => ({ id: it.id, f: it.fields ?? {} }))
    .filter((x) => !val(x.f.StatoRapporto))
    .sort((a, b) => `${val(a.f.Cognome)} ${val(a.f.Nome)}`.localeCompare(`${val(b.f.Cognome)} ${val(b.f.Nome)}`, 'it'))

  if (CSV) {
    console.log('Cognome;Nome;Matricola;TipoRapporto;DataAssunzione;DataDimissione;MailAziendale;TimbraturaAttiva;StatoSuggerito;StatoDaMettere')
    for (const { f } of senza) {
      console.log([
        val(f.Cognome), val(f.Nome), val(f.Matricola), val(f.TipoRapporto),
        giorno(f.DataAssunzione), giorno(f.DataDimissioneLavoratore),
        val(f.MailAziendale), val(f.TimbraturaAttiva), suggerito(f), '',
      ].join(';'))
    }
    return
  }

  console.log(`Schede su ${items.length} senza StatoRapporto: ${senza.length}\n`)
  const cessati = senza.filter((x) => val(x.f.DataDimissioneLavoratore))
  const inServizio = senza.filter((x) => !val(x.f.DataDimissioneLavoratore))

  const stampa = (titolo, gruppo) => {
    if (!gruppo.length) return
    console.log(titolo)
    for (const { f } of gruppo) {
      const nome = `${val(f.Cognome)} ${val(f.Nome)}`.trim()
      const pezzi = [
        val(f.Matricola) ? `matr. ${val(f.Matricola)}` : 'matricola assente',
        val(f.TipoRapporto) || 'tipo rapporto assente',
        val(f.DataAssunzione) ? `assunto ${giorno(f.DataAssunzione)}` : 'data assunzione assente',
        val(f.DataDimissioneLavoratore) ? `dimesso ${giorno(f.DataDimissioneLavoratore)}` : null,
        val(f.TimbraturaAttiva) === 'Si' ? 'timbratura attiva' : null,
        val(f.MailAziendale) ? null : 'MAIL AZIENDALE ASSENTE',
      ].filter(Boolean)
      console.log(`  · ${nome.padEnd(30)} ${pezzi.join(' · ')}`)
    }
    console.log('')
  }

  stampa(
    `Hanno una data di dimissione → lo stato è "Cessato" (${cessati.length}):`,
    cessati,
  )
  stampa(
    `Nessuna data di dimissione → sono in servizio, ma lo stato preciso lo sapete voi (${inServizio.length}):`,
    inServizio,
  )

  console.log('Gli stati possibili: Attivo · Aspettativa · Maternità · Congedo parentale · Malattia lunga · Sospeso · Cessato')
  console.log('Per una tabella da compilare: node scripts/diagnosi-stato-rapporto.mjs --csv > stati-da-sistemare.csv')
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
