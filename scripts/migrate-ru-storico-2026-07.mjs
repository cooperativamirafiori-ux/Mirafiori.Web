#!/usr/bin/env node
/**
 * Migrazione campi "storico" di Collaboratori e Tirocini (luglio 2026),
 * dopo l'armonizzazione dello schema col blocco comune.
 *
 * Travasa i vecchi campi nei campi comuni nuovi e (con --apply) svuota
 * il campo storico una volta copiato:
 *
 *   Collaboratori:  RecapitoTelefonico  ->  CellPrivato
 *   Tirocini:       RecapitoTelefonico  ->  CellPrivato
 *                   LivelloIstruzione   ->  TitoloStudio (normalizzato, best-effort)
 *
 * REGOLE DI SICUREZZA (idempotente, rilanciabile):
 *   - copia solo se il campo di destinazione è VUOTO;
 *   - se la destinazione ha già un valore DIVERSO -> conflitto: non tocca
 *     nulla e lo segnala per revisione manuale;
 *   - svuota il campo storico solo dopo che il valore è al sicuro nella
 *     destinazione (a meno di --keep-storico).
 *
 * Uso (dalla cartella web/):
 *   node scripts/migrate-ru-storico-2026-07.mjs                # dry-run
 *   node scripts/migrate-ru-storico-2026-07.mjs --apply        # applica (copia + svuota storico)
 *   node scripts/migrate-ru-storico-2026-07.mjs --apply --keep-storico   # copia ma NON svuota
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_COLLABORATORI, SP_LIST_TIROCINI.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const KEEP_STORICO = process.argv.includes('--keep-storico')

// ------------------------------------------------------------------
// Normalizzazione "Livello di istruzione" (testo libero) -> Titolo di studio.
// Valori ammessi dallo schema (types/risorse-umane.ts, TITOLO_STUDIO).
// Best-effort: mappa i casi chiari, altrimenti copia il testo così com'è
// (la colonna SP accetta testo libero) e lo segnala.
// ------------------------------------------------------------------
function normalizzaTitolo(raw) {
  const s = String(raw).trim()
  const t = s.toLowerCase()
  if (!t) return { value: null, esatto: true }
  const has = (...w) => w.every((x) => t.includes(x))

  if (has('dottorato')) return { value: 'Dottorato di ricerca', esatto: true }
  if (has('master') && (t.includes('ii') || t.includes('2'))) return { value: 'Master II livello', esatto: true }
  if (has('master')) return { value: 'Master I livello', esatto: true }
  if (has('magistrale') || has('specialistica') || has('vecchio ordinamento'))
    return { value: 'Laurea magistrale', esatto: true }
  if (has('triennale')) return { value: 'Laurea triennale', esatto: true }
  if (has('laurea')) return { value: 'Laurea', esatto: true }
  if (has('qualifica')) return { value: 'Qualifica Professionale', esatto: true }
  if (has('licenza') && has('media')) return { value: 'Licenza media', esatto: true }
  if (has('media')) return { value: 'Licenza media', esatto: true }
  if (has('diploma') || has('superiore') || has('maturit') || has('perito') || has('ragionier'))
    return { value: 'Diploma scuola superiore', esatto: true }

  // nessuna corrispondenza sicura: copia verbatim (da rivedere a mano)
  return { value: s, esatto: false }
}

// Regole di migrazione per lista: [campoStorico, campoDestinazione, trasforma?]
const REGOLE = {
  collaboratori: {
    env: 'SP_LIST_COLLABORATORI',
    campi: ['RecapitoTelefonico', 'CellPrivato'],
    mappe: [{ da: 'RecapitoTelefonico', a: 'CellPrivato' }],
  },
  tirocini: {
    env: 'SP_LIST_TIROCINI',
    campi: ['RecapitoTelefonico', 'CellPrivato', 'LivelloIstruzione', 'TitoloStudio'],
    mappe: [
      { da: 'RecapitoTelefonico', a: 'CellPrivato' },
      { da: 'LivelloIstruzione', a: 'TitoloStudio', trasforma: normalizzaTitolo },
    ],
  },
}

// ------------------------------------------------------------------
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = val
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

async function graph(token, method, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${t}`)
  return t ? JSON.parse(t) : {}
}

async function getAll(token, site, listId, campi) {
  const select = ['Cognome', 'Nome', ...campi].join(',')
  const out = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=${select})&$top=200`
  while (url) {
    const res = await graph(token, 'GET', url)
    out.push(...(res.value || []))
    const next = res['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

const vuoto = (v) => v == null || String(v).trim() === ''

async function migraLista(token, site, entity) {
  const def = REGOLE[entity]
  const listId = process.env[def.env]
  if (!listId) throw new Error(`Variabile mancante: ${def.env}`)

  const items = await getAll(token, site, listId, def.campi)
  console.log(`\n=== ${entity} — ${items.length} record ===`)

  let copiati = 0
  let svuotati = 0
  let conflitti = 0
  let daRivedere = 0

  for (const it of items) {
    const f = it.fields || {}
    const nome = `${f.Cognome ?? ''} ${f.Nome ?? ''}`.trim() || `#${it.id}`
    const patch = {}

    for (const { da, a, trasforma } of def.mappe) {
      const sorgente = f[da]
      if (vuoto(sorgente)) continue

      const conv = trasforma ? trasforma(sorgente) : { value: String(sorgente).trim(), esatto: true }
      const destAttuale = f[a]

      if (vuoto(destAttuale)) {
        // destinazione libera -> copia
        patch[a] = conv.value
        copiati++
        if (!conv.esatto) {
          daRivedere++
          console.log(`  ⚠ ${nome}: ${da}="${sorgente}" -> ${a}="${conv.value}" (normalizzazione incerta, verificare)`)
        }
        if (!KEEP_STORICO) { patch[da] = null; svuotati++ }
      } else if (String(destAttuale).trim() === String(conv.value).trim()) {
        // già uguale -> basta svuotare lo storico
        if (!KEEP_STORICO) { patch[da] = null; svuotati++ }
      } else {
        // destinazione occupata con valore diverso -> conflitto, non tocco
        conflitti++
        console.log(`  ✗ CONFLITTO ${nome}: ${da}="${sorgente}" ma ${a}="${destAttuale}" già valorizzato — lasciato invariato`)
      }
    }

    if (Object.keys(patch).length === 0) continue
    if (APPLY) {
      await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/items/${it.id}/fields`, patch)
    } else {
      console.log(`  #${it.id} ${nome}:`, patch)
    }
  }

  console.log(`  → copiati: ${copiati} | storico svuotati: ${svuotati} | da rivedere: ${daRivedere} | conflitti: ${conflitti}`)
  return { copiati, svuotati, daRivedere, conflitti }
}

async function main() {
  loadEnvLocal()
  const site = process.env.SHAREPOINT_SITE_ID
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_COLLABORATORI', 'SP_LIST_TIROCINI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  console.log(`→ Modalità: ${APPLY ? 'APPLICA' : 'DRY-RUN (nessuna modifica)'}${KEEP_STORICO ? ' | mantiene i campi storico' : ''}`)
  const token = await getToken()

  const tot = { copiati: 0, svuotati: 0, daRivedere: 0, conflitti: 0 }
  for (const entity of ['collaboratori', 'tirocini']) {
    const r = await migraLista(token, site, entity)
    for (const k of Object.keys(tot)) tot[k] += r[k]
  }

  console.log('\n============================================================')
  console.log(`TOTALE  copiati: ${tot.copiati} | storico svuotati: ${tot.svuotati} | da rivedere: ${tot.daRivedere} | conflitti: ${tot.conflitti}`)
  if (tot.daRivedere) console.log('⚠ Alcuni titoli di studio sono stati copiati senza corrispondenza sicura: controllali a mano.')
  if (tot.conflitti) console.log('✗ Alcuni conflitti sono stati saltati: risolvili a mano e rilancia se serve.')
  if (!APPLY) console.log('\nRilancia con --apply per applicare (aggiungi --keep-storico per non svuotare i campi storico).')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
