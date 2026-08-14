#!/usr/bin/env node
/**
 * Fusione di strutture in anagrafica, storico compreso.
 *
 * A02 confluisce in A01, A06 confluisce in A05, e A05 si chiamerà solo
 * "Pian della Mussa".
 *
 * Quattro liste puntano a Strutture con una colonna lookup — costi, richieste
 * (manutenzioni), acquisti, inventario. SharePoint memorizza il riferimento e
 * non il testo, quindi:
 *   - RINOMINARE una struttura non richiede alcuna migrazione: il nome nuovo
 *     compare da sé anche sui record del 2024.
 *   - FONDERE due strutture invece sì: ogni record che punta ad A02 va
 *     ripuntato ad A01, altrimenti quando A02 sparisce restano lookup orfani.
 *
 * Le strutture assorbite NON vengono cancellate: vengono rinominate
 * "ZZ_<nome> (unificata in <codice>)", coerentemente con la convenzione usata
 * per le liste dismesse. Cancellarle è un attimo, recuperarle no; e finché la
 * riga esiste, un lookup rimasto indietro mostra ancora qualcosa di leggibile
 * invece di una casella vuota.
 *
 * Uso (dalla cartella web/):
 *   node scripts/unifica-strutture.mjs                     SIMULAZIONE, non tocca nulla
 *   node scripts/unifica-strutture.mjs --apply             esegue
 *   node scripts/unifica-strutture.mjs --elimina --apply   seconda fase, a collaudo
 *                                                          finito: toglie le righe ZZ_
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_STRUTTURE, SP_LIST_COSTI, SP_LIST_RICHIESTE,
 * SP_LIST_ACQUISTI, SP_LIST_INVENTARIO.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
// Seconda fase, a collaudo finito: toglie dall'anagrafica le righe già
// archiviate ZZ_. Da usare solo dopo aver verificato che i costi e le
// manutenzioni ripuntati siano finiti dove dovevano.
const ELIMINA = process.argv.includes('--elimina')

// --- che cosa fare -----------------------------------------------------------

/** Strutture da assorbire: `da` confluisce in `a`, storico compreso. */
const FUSIONI = [
  { da: 'A02', a: 'A01' },
  { da: 'A06', a: 'A05' },
]

/**
 * Rinomine: nessuna migrazione, il lookup segue da sé.
 *
 * Si scrive solo `Title`. `StrutturaLabel` — quella che l'utente legge nei menù
 * e nel cruscotto, con il codice davanti ("A01 - Cascina (CRP)") — è una colonna
 * CALCOLATA da `Codice` e `Title`: SharePoint la rifiuta in scrittura con un 403
 * "read-only" e la ricalcola da sé appena cambia il Title.
 */
const RINOMINE = [
  { codice: 'A05', nuovoNome: 'Pian della Mussa' },
]

/** Liste che puntano a Strutture con la colonna lookup `Struttura`. */
const DIPENDENTI = [
  { etichetta: 'Costi',        env: 'SP_LIST_COSTI' },
  { etichetta: 'Manutenzioni', env: 'SP_LIST_RICHIESTE' },
  { etichetta: 'Acquisti',     env: 'SP_LIST_ACQUISTI' },
  { etichetta: 'Inventario',   env: 'SP_LIST_INVENTARIO' },
]

// --- impianto ---------------------------------------------------------------

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env.local assente: si presume env già impostate
  }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(
    `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: GRAPH_CLIENT_ID,
        client_secret: GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  )
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

async function graph(token, method, path, body) {
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

/** Scorre tutte le pagine di una lista (le liste superano il $top). */
async function tuttiGliItem(token, path) {
  const fuori = []
  let next = path
  while (next) {
    const res = await graph(token, 'GET', next)
    fuori.push(...(res.value || []))
    next = res['@odata.nextLink'] || null
  }
  return fuori
}

// --- lavoro -----------------------------------------------------------------

async function main() {
  loadEnvLocal()
  const richieste = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_STRUTTURE', ...DIPENDENTI.map((d) => d.env)]
  for (const k of richieste) if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)

  const site = process.env.SHAREPOINT_SITE_ID
  const listaStrutture = process.env.SP_LIST_STRUTTURE
  const token = await getToken()

  console.log('')
  console.log('======================================================================')
  console.log(APPLY ? 'UNIFICAZIONE STRUTTURE — ESECUZIONE' : 'UNIFICAZIONE STRUTTURE — SIMULAZIONE (aggiungi --apply per eseguire)')
  console.log('======================================================================')

  // 1. anagrafica
  const items = await tuttiGliItem(
    token,
    `/sites/${site}/lists/${listaStrutture}/items?$select=id&$expand=fields($select=Title,Codice,StrutturaLabel)&$top=200`,
  )
  const perCodice = new Map()
  for (const i of items) {
    const cod = (i.fields?.Codice ?? '').trim().toUpperCase()
    if (cod) perCodice.set(cod, { id: Number(i.id), title: i.fields?.Title ?? '', label: i.fields?.StrutturaLabel ?? '' })
  }

  const codiciServiti = [...FUSIONI.flatMap((f) => [f.da, f.a]), ...RINOMINE.map((r) => r.codice)]
  const assenti = codiciServiti.filter((c) => !perCodice.has(c))
  if (assenti.length) throw new Error(`Codici non trovati in anagrafica: ${assenti.join(', ')}`)

  console.log('\nAnagrafica coinvolta:')
  for (const c of [...new Set(codiciServiti)].sort()) {
    const s = perCodice.get(c)
    console.log(`  ${c}  id=${String(s.id).padEnd(4)} ${s.title}${s.label && s.label !== s.title ? `  (${s.label})` : ''}`)
  }

  // 2. censimento dei riferimenti da spostare
  const daId = new Map(FUSIONI.map((f) => [perCodice.get(f.da).id, perCodice.get(f.a).id]))
  let totale = 0

  for (const dip of DIPENDENTI) {
    const lista = process.env[dip.env]
    const righe = await tuttiGliItem(
      token,
      `/sites/${site}/lists/${lista}/items?$select=id&$expand=fields($select=Title,StrutturaLookupId)&$top=500`,
    )
    const daSpostare = righe.filter((r) => daId.has(Number(r.fields?.StrutturaLookupId)))
    totale += daSpostare.length
    console.log(`\n${dip.etichetta}: ${righe.length} record totali, ${daSpostare.length} da ripuntare`)

    for (const r of daSpostare) {
      const vecchio = Number(r.fields.StrutturaLookupId)
      const nuovo = daId.get(vecchio)
      const etichetta = r.fields?.Title || `item ${r.id}`
      if (APPLY) {
        await graph(token, 'PATCH', `/sites/${site}/lists/${lista}/items/${r.id}/fields`, { StrutturaLookupId: nuovo })
        console.log(`  ✓ ${etichetta}  ${vecchio} → ${nuovo}`)
      } else {
        console.log(`  · ${etichetta}  ${vecchio} → ${nuovo}`)
      }
    }
  }

  // 3. rinomine (nessuna migrazione: il lookup segue il riferimento)
  console.log('\nRinomine:')
  for (const r of RINOMINE) {
    const s = perCodice.get(r.codice)
    if (s.title === r.nuovoNome) {
      console.log(`  = ${r.codice} è già "${r.nuovoNome}"`)
      continue
    }
    if (APPLY) {
      await graph(token, 'PATCH', `/sites/${site}/lists/${listaStrutture}/items/${s.id}/fields`, {
        Title: r.nuovoNome,
      })
    }
    console.log(`  ${APPLY ? '✓' : '·'} ${r.codice}  "${s.title}" → "${r.nuovoNome}"`)
    console.log(`      label calcolata: "${s.label}" → "${r.codice} - ${r.nuovoNome}"`)
  }

  // 4. archiviazione (o eliminazione) delle strutture assorbite
  //
  // Anche qui si scrive solo il Title: la label calcolata si aggiorna da sé e
  // il prefisso ZZ_ compare nei menù senza bisogno di toccarla.
  console.log(ELIMINA ? '\nStrutture assorbite — ELIMINAZIONE:' : '\nStrutture assorbite:')
  for (const f of FUSIONI) {
    const s = perCodice.get(f.da)

    if (ELIMINA) {
      if (!s.title.startsWith('ZZ_')) {
        console.log(`  ! ${f.da} non è archiviata: esegui prima --apply. Saltata.`)
        continue
      }
      if (APPLY) {
        await graph(token, 'DELETE', `/sites/${site}/lists/${listaStrutture}/items/${s.id}`)
      }
      console.log(`  ${APPLY ? '✓' : '·'} ${f.da} eliminata (recuperabile dal cestino di SharePoint)`)
      continue
    }

    if (s.title.startsWith('ZZ_')) {
      console.log(`  = ${f.da} già archiviata`)
      continue
    }
    const nuovoTitle = `ZZ_${s.title} (unificata in ${f.a})`
    if (APPLY) {
      await graph(token, 'PATCH', `/sites/${site}/lists/${listaStrutture}/items/${s.id}/fields`, {
        Title: nuovoTitle,
      })
    }
    console.log(`  ${APPLY ? '✓' : '·'} ${f.da}  "${s.title}" → "${nuovoTitle}"`)
  }

  console.log('')
  if (APPLY && ELIMINA) {
    console.log('✓ Righe archiviate eliminate. Recuperabili dal cestino di SharePoint.')
  } else if (APPLY) {
    console.log(`✓ Fatto. ${totale} record ripuntati.`)
    console.log('  Le righe ZZ_ restano in anagrafica e restano visibili nei menù,')
    console.log('  ma con il prefisso ZZ_ che le rende inequivocabili.')
    console.log('  A collaudo finito:  node scripts/unifica-strutture.mjs --elimina --apply')
  } else if (ELIMINA) {
    console.log('Verranno eliminate le righe archiviate elencate sopra. Nulla è stato modificato.')
    console.log('Per eseguire:  node scripts/unifica-strutture.mjs --elimina --apply')
  } else {
    console.log(`Verranno ripuntati ${totale} record. Nulla è stato modificato.`)
    console.log('Per eseguire:  node scripts/unifica-strutture.mjs --apply')
  }
  console.log('')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
