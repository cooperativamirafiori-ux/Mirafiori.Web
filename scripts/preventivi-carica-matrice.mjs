#!/usr/bin/env node
/**
 * Carica la matrice di Andrea (20/11/2026) nel tariffario dei preventivi e
 * riempie la lista "Enti Preventivi".
 *
 * La matrice sta in scripts/dati/matrice-preventivi.json: è la
 * Matrice_App_Preventivi.xlsx di Andrea già sistemata con le decisioni di
 * Dennis del 20/11/2026 (vedi docs/preventivi.md § Matrice):
 *   - IVA «5%» → iva5, «Esclusa» → spese F.I.C.;
 *   - ASL Città di Torino 2 scritta in un modo solo;
 *   - Casa Artemisia, Educativa individuale: 23 € per Comune e ASL di Torino,
 *     28 € per gli altri enti;
 *   - CRP Co.S.Mi.C.A.: con la coppia di Torino le due quote (ASL 142,70 +
 *     Comune 59,09), con qualunque altro ente la retta da 240 € dell'inserimento
 *     da fuori regione;
 *   - Privati: niente riga «Ore indirette» (diventa una spunta nel preventivo).
 *
 * Uso (dalla cartella web/, dopo node scripts/provision-preventivi.mjs):
 *   node scripts/preventivi-carica-matrice.mjs                 → prova: dice cosa farebbe
 *   node scripts/preventivi-carica-matrice.mjs --sostituisci   → cancella il tariffario
 *        di prima e carica la matrice; aggiunge gli enti che mancano
 *
 * Gli enti già presenti non si toccano (salvo la chiave delle coppie di
 * Torino, se manca). I preventivi non si toccano.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SOSTITUISCI = process.argv.includes('--sostituisci')
const MATRICE = JSON.parse(readFileSync(join(__dirname, 'dati', 'matrice-preventivi.json'), 'utf8'))

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
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
  for (let tentativo = 1; ; tentativo++) {
    const res = await fetch(path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if ((res.status === 429 || res.status === 503) && tentativo < 6) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') || 2) * 1000))
      continue
    }
    const text = await res.text()
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
    return text ? JSON.parse(text) : {}
  }
}

async function tutti(token, base) {
  const out = []
  let url = `${base}?$expand=fields&$top=200`
  while (url) {
    const r = await graph(token, 'GET', url)
    out.push(...(r.value || []))
    url = r['@odata.nextLink'] || null
  }
  return out
}

const mezzogiorno = (d) => `${d}T12:00:00Z`

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_TARIFFARIO_PREVENTIVI', 'SP_LIST_ENTI_PREVENTIVI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k} (prima lancia node scripts/provision-preventivi.mjs)`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const baseTariffe = `/sites/${site}/lists/${process.env.SP_LIST_TARIFFARIO_PREVENTIVI}/items`
  const baseEnti = `/sites/${site}/lists/${process.env.SP_LIST_ENTI_PREVENTIVI}/items`
  const token = await getToken()

  const esistenti = await tutti(token, baseTariffe)
  const enti = await tutti(token, baseEnti)
  const perNome = new Map(enti.map((e) => [String(e.fields?.Title ?? '').trim().toLowerCase(), e]))
  const entiNuovi = MATRICE.enti.filter((e) => !perNome.has(e.nome.toLowerCase()))
  const chiaviDaMettere = MATRICE.enti.filter((e) => e.chiave && perNome.has(e.nome.toLowerCase()) && !perNome.get(e.nome.toLowerCase()).fields?.Chiave)

  console.log(`Matrice: ${MATRICE.tariffe.length} tariffe, ${MATRICE.enti.length} enti (${MATRICE.fonte})`)
  console.log(`Tariffario attuale: ${esistenti.length} righe → ${SOSTITUISCI ? 'le cancello' : 'verrebbero cancellate'}`)
  console.log(`Enti: ${enti.length} già presenti, ${entiNuovi.length} da aggiungere`)

  if (!SOSTITUISCI) {
    console.log('\nProva finita, non ho cambiato niente. Per farlo davvero:\n  node scripts/preventivi-carica-matrice.mjs --sostituisci\n')
    return
  }

  for (const e of entiNuovi) {
    await graph(token, 'POST', baseEnti, {
      fields: { Title: e.nome, Chiave: e.chiave || null, Servizi: e.servizi || null, Attivo: true },
    })
  }
  for (const e of chiaviDaMettere) {
    await graph(token, 'PATCH', `${baseEnti}/${perNome.get(e.nome.toLowerCase()).id}/fields`, { Chiave: e.chiave })
  }
  console.log(`✓ Enti: ${entiNuovi.length} aggiunti${chiaviDaMettere.length ? `, ${chiaviDaMettere.length} chiavi messe` : ''}`)

  let cancellate = 0
  for (const it of esistenti) {
    await graph(token, 'DELETE', `${baseTariffe}/${it.id}`)
    cancellate++
    if (cancellate % 20 === 0) console.log(`  … cancellate ${cancellate}`)
  }
  console.log(`✓ Tariffario di prima cancellato (${cancellate} righe)`)

  let caricate = 0
  for (const t of MATRICE.tariffe) {
    await graph(token, 'POST', baseTariffe, {
      fields: {
        Title: t.voce,
        Codice: t.codice,
        Servizio: t.servizio,
        Sottotipo: t.sottotipo || null,
        Ente: t.ente,
        Gruppo: t.gruppo,
        Unita: t.unita,
        Prezzo: t.prezzo,
        RegimeIva: t.iva,
        ValidoDal: mezzogiorno(MATRICE.validoDal),
        Ordine: t.ordine,
        Note: t.note || null,
      },
    })
    caricate++
    if (caricate % 20 === 0) console.log(`  … caricate ${caricate}`)
  }
  console.log(`✓ Matrice caricata: ${caricate} tariffe, valide dal ${MATRICE.validoDal.split('-').reverse().join('/')}\n`)
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
