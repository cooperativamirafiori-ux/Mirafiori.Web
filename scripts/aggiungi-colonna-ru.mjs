#!/usr/bin/env node
/**
 * Aggiunge una colonna alla lista SharePoint dei Dipendenti (area Risorse Umane).
 *
 * L'area RU e' guidata dallo schema in `types/risorse-umane.ts`: aggiungere un
 * campo la' lo fa comparire da se' nella scheda, nei filtri e nell'export. Manca
 * solo la colonna sulla lista, e questo script la crea.
 *
 * Uso (dalla cartella web/):
 *   node scripts/aggiungi-colonna-ru.mjs DataRestituzioneQuota date
 *   node scripts/aggiungi-colonna-ru.mjs NomeCampo testo
 *   node scripts/aggiungi-colonna-ru.mjs NomeCampo numero
 *   node scripts/aggiungi-colonna-ru.mjs NomeCampo valuta
 *   node scripts/aggiungi-colonna-ru.mjs NomeCampo sino
 *
 * Il nome DEVE coincidere con la `key` usata nello schema, altrimenti l'app
 * scrive in un campo che sulla lista non esiste e il dato si perde in silenzio.
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SP_SITE_RU (o SHAREPOINT_SITE_ID) e SP_LIST_DIPENDENTI.
 * Permesso Graph: Sites.ReadWrite.All (Application).
 *
 * Idempotente: se la colonna c'e' gia' non fa nulla.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TIPI = {
  testo: () => ({ text: {} }),
  date: () => ({ dateTime: { format: 'dateOnly', displayAs: 'standard' } }),
  numero: () => ({ number: {} }),
  valuta: () => ({ currency: { locale: 'it-IT' } }),
  sino: () => ({ choice: { choices: ['Si', 'No'], displayAs: 'dropDownMenu' } }),
}

function caricaEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const riga of raw.split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    // niente .env.local: si usano le variabili d'ambiente
  }
}

async function token() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GRAPH_CLIENT_ID,
        client_secret: process.env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  )
  const d = await res.json()
  if (!res.ok) throw new Error(`Token non ottenuto: ${d.error_description || res.status}`)
  return d.access_token
}

async function graph(tk, metodo, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const testo = await res.text()
  const d = testo ? JSON.parse(testo) : {}
  if (!res.ok) throw new Error(`${metodo} ${path} → ${res.status}: ${d.error?.message || testo}`)
  return d
}

async function main() {
  caricaEnv()
  const [nome, tipo = 'testo'] = process.argv.slice(2)
  if (!nome) {
    console.error('Uso: node scripts/aggiungi-colonna-ru.mjs <NomeCampo> [testo|date|numero|valuta|sino]')
    process.exit(1)
  }
  if (!TIPI[tipo]) {
    console.error(`Tipo "${tipo}" non riconosciuto. Ammessi: ${Object.keys(TIPI).join(', ')}`)
    process.exit(1)
  }
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  const lista = process.env.SP_LIST_DIPENDENTI
  if (!site || !lista) {
    console.error('Mancano SP_SITE_RU (o SHAREPOINT_SITE_ID) e SP_LIST_DIPENDENTI.')
    process.exit(1)
  }

  const tk = await token()
  const cols = await graph(tk, 'GET', `/sites/${site}/lists/${lista}/columns?$select=name&$top=300`)
  if ((cols.value ?? []).some((c) => c.name === nome)) {
    console.log(`✓ La colonna "${nome}" esiste già: niente da fare.`)
    return
  }

  await graph(tk, 'POST', `/sites/${site}/lists/${lista}/columns`, { name: nome, ...TIPI[tipo]() })
  console.log(`✓ Colonna "${nome}" (${tipo}) creata sulla lista Dipendenti.`)
  console.log('  Ora compare da sé nella scheda del dipendente, nei filtri e nell\'export.')
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
