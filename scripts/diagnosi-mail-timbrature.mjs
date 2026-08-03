#!/usr/bin/env node
/**
 * Chi, in anagrafica Risorse Umane, NON ha la mail aziendale.
 *
 * La mail aziendale è la chiave che collega la scheda RU al foglio ore: è
 * l'account Microsoft 365 con cui la persona entra nell'app. Senza quella la
 * spunta "Timbratura attiva" non produce nulla, e l'unico segnale è un avviso al
 * salvataggio — facile da non notare su cento schede.
 *
 * Questo script fa il conto prima, così si sa quante schede completare.
 *
 * Uso (da web/):
 *   node scripts/diagnosi-mail-timbrature.mjs
 *
 * Sola lettura. Legge GRAPH_* e SP_* da .env.local.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

async function token() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.GRAPH_CLIENT_ID,
        client_secret: process.env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  )
  const d = await res.json()
  if (!res.ok) throw new Error(d.error_description || 'token non ottenuto')
  return d.access_token
}

/** GET su Graph seguendo la paginazione (@odata.nextLink). */
async function graphAll(tk, url) {
  const out = []
  let next = `https://graph.microsoft.com/v1.0${url}`
  while (next) {
    const res = await fetch(next, {
      headers: {
        Authorization: `Bearer ${tk}`,
        Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
      },
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error?.message || `Graph ${res.status}`)
    out.push(...(d.value || []))
    next = d['@odata.nextLink'] || null
  }
  return out
}

const val = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  if (!site) throw new Error('Variabile mancante: SP_SITE_RU (o SHAREPOINT_SITE_ID)')

  const liste = [
    ['Dipendenti', process.env.SP_LIST_DIPENDENTI],
    ['Tirocini', process.env.SP_LIST_TIROCINI],
  ].filter(([, id]) => !!id)
  if (!liste.length) throw new Error('Nessuna lista: manca SP_LIST_DIPENDENTI / SP_LIST_TIROCINI')

  const tk = await token()

  for (const [etichetta, listId] of liste) {
    const campi = 'Title,Cognome,Nome,MailAziendale,MailPersonale,TimbraturaAttiva,StatoRapporto,StatoTirocinio'
    const items = await graphAll(
      tk,
      `/sites/${site}/lists/${listId}/items?$select=id,fields&$expand=fields($select=${campi})&$top=200`,
    )

    const righe = items.map((it) => {
      const f = it.fields || {}
      const nominativo =
        `${val(f.Cognome)} ${val(f.Nome)}`.trim() || val(f.Title) || `item ${it.id}`
      return {
        nominativo,
        aziendale: val(f.MailAziendale),
        personale: val(f.MailPersonale),
        spuntata: val(f.TimbraturaAttiva) === 'Si',
        chiuso:
          val(f.StatoRapporto) === 'Cessato' ||
          ['INTERROTTO', 'TERMINATO'].includes(val(f.StatoTirocinio).toUpperCase()),
      }
    })

    const senzaMail = righe.filter((r) => !r.aziendale)
    const attivabili = righe.filter((r) => r.aziendale && !r.chiuso)

    console.log(`\n=== ${etichetta} — ${righe.length} schede`)
    console.log(`  con mail aziendale ......... ${righe.length - senzaMail.length}`)
    console.log(`  SENZA mail aziendale ....... ${senzaMail.length}`)
    console.log(`  spunta "Timbratura attiva" . ${righe.filter((r) => r.spuntata).length}`)
    console.log(`  attivabili subito .......... ${attivabili.length}  (mail presente, rapporto in corso)`)

    const bloccati = senzaMail.filter((r) => r.spuntata)
    if (bloccati.length) {
      console.log(`\n  ⚠ Spunta attiva ma SENZA mail aziendale — non possono timbrare:`)
      for (const r of bloccati) {
        console.log(`     · ${r.nominativo}${r.personale ? `   (personale: ${r.personale})` : ''}`)
      }
    }

    if (senzaMail.length) {
      console.log(`\n  Schede da completare con la mail aziendale:`)
      for (const r of senzaMail) {
        console.log(`     · ${r.nominativo}${r.personale ? `   (personale: ${r.personale})` : ''}${r.chiuso ? '   [rapporto chiuso]' : ''}`)
      }
    }
  }

  console.log('\nLa mail aziendale va inserita in Risorse Umane → scheda → Contatti e residenza.')
  console.log('Poi: Cruscotto Timbrature → "Sincronizza da anagrafica".\n')
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
