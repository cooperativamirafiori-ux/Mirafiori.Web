#!/usr/bin/env node
/**
 * Riversa nel registro analitico (`movimento` su Supabase) i costi della lista
 * SharePoint "Costi Strutture": costi diretti, chiusure di manutenzione e
 * consegne di richieste d'acquisto.
 *
 * **Non è un travaso una volta sola: è lo strumento di quadratura.**
 * `origine_id` è l'id dell'item SharePoint, quindi rilanciarlo non duplica
 * niente — riscrive le stesse righe. Serve in tre momenti:
 *
 *   1. adesso, per portare nel registro lo storico;
 *   2. quando un riversamento in diretta è fallito (`creaCosto()` non fa
 *      fallire l'operazione se il registro non risponde: il costo su
 *      SharePoint è la cosa che conta, e il buco si richiude da qui);
 *   3. quando qualcuno corregge un importo o un centro di costo a mano su
 *      SharePoint — che il registro, da solo, non può sapere. È il prezzo
 *      della doppia scrittura, e questo script è il modo di pagarlo.
 *
 * Uso (dalla cartella web/):
 *   node scripts/travaso-costi-registro.mjs           # mostra cosa farebbe
 *   node scripts/travaso-costi-registro.mjs --apply   # scrive
 *   node scripts/travaso-costi-registro.mjs --apply --anno 2026
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SHAREPOINT_SITE_ID
 *   SP_LIST_COSTI, SP_LIST_CENTRI_COSTO, SP_LIST_RICHIESTE, SP_LIST_ACQUISTI
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * ⚠️ Va lanciato dal Mac: dalla sandbox non si raggiunge Microsoft Graph.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const ANNO = (() => {
  const i = process.argv.indexOf('--anno')
  return i > -1 ? Number(process.argv[i + 1]) : null
})()

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
  if (!GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    throw new Error('Mancano GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET')
  }
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

async function graph(token, path) {
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

async function tuttiGliItem(token, path) {
  const fuori = []
  let next = path
  while (next) {
    const res = await graph(token, next)
    fuori.push(...(res.value || []))
    next = res['@odata.nextLink'] || null
  }
  return fuori
}

async function sb(metodo, path, body) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  if (!base || !key) throw new Error('Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const res = await fetch(`${base}/rest/v1${path}`, {
    method: metodo,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const testo = await res.text()
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${testo.slice(0, 400)}`)
  return testo ? JSON.parse(testo) : null
}

/** Chiama la funzione SQL: è l'unica porta di scrittura del registro. */
async function riscrivi(origineTipo, origineId, righe) {
  return sb('POST', '/rpc/registro_riscrivi', {
    p_origine_tipo: origineTipo,
    p_origine_id: String(origineId),
    p_righe: righe,
  })
}

const euro = (n) =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

async function main() {
  loadEnvLocal()

  const site = process.env.SHAREPOINT_SITE_ID
  const lCosti = process.env.SP_LIST_COSTI
  const lCentri = process.env.SP_LIST_CENTRI_COSTO
  const lRichieste = process.env.SP_LIST_RICHIESTE
  const lAcquisti = process.env.SP_LIST_ACQUISTI
  if (!site || !lCosti || !lCentri) {
    throw new Error('Mancano SHAREPOINT_SITE_ID / SP_LIST_COSTI / SP_LIST_CENTRI_COSTO')
  }

  const token = await getToken()

  // --- Anagrafica: id item SharePoint → codice cc ---------------------------
  // Sui costi il centro di costo è un lookup, quindi porta l'id SharePoint. Il
  // registro vuole il codice: la traduzione si fa qui, una volta.
  const centri = await tuttiGliItem(
    token,
    `/sites/${site}/lists/${lCentri}/items?$select=id&$expand=fields($select=Title,Codice)&$top=500`,
  )
  const codiceDiItem = new Map(
    centri
      .map((i) => [Number(i.id), String(i.fields?.Codice ?? '').trim()])
      .filter(([, c]) => c),
  )

  // --- Manutenzioni: i Title delle richieste --------------------------------
  // La chiusura di un ticket scrive il costo con Title = id della richiesta.
  // Confrontare con questo elenco è l'unico modo NON inventato di distinguere
  // una manutenzione da un costo diretto: sulla lista Costi entrambe hanno
  // Fonte = 'Manuale'.
  const titoliManutenzioni = new Set()
  if (lRichieste) {
    const richieste = await tuttiGliItem(
      token,
      `/sites/${site}/lists/${lRichieste}/items?$select=id&$expand=fields($select=Title)&$top=2000`,
    )
    for (const r of richieste) {
      const t = String(r.fields?.Title ?? '').trim()
      if (t) titoliManutenzioni.add(t)
    }
  }

  // --- Acquisti: codice richiesta → categoria di spesa ----------------------
  // Sul costo la categoria è l'etichetta generica 'Acquisti', che non dice di
  // cosa è fatta la spesa. La categoria vera sta sulla richiesta, e il costo
  // porta il codice in testa al Title: si recupera da lì.
  const categoriaDiAcquisto = new Map()
  if (lAcquisti) {
    const acquisti = await tuttiGliItem(
      token,
      `/sites/${site}/lists/${lAcquisti}/items?$select=id&$expand=fields($select=Title,Categoria)&$top=2000`,
    )
    for (const a of acquisti) {
      const cod = String(a.fields?.Title ?? '').trim()
      const cat = String(a.fields?.Categoria ?? '').trim()
      if (cod && cat) categoriaDiAcquisto.set(cod, cat)
    }
  }

  // --- La mappa categoria → voce, dal database ------------------------------
  const mappaRighe = (await sb('GET', '/mappa_categoria_voce?select=categoria,voce')) || []
  const voceDiCategoria = new Map(
    mappaRighe.map((r) => [String(r.categoria).trim().toLowerCase(), r.voce ?? null]),
  )

  // --- I costi ---------------------------------------------------------------
  const costi = await tuttiGliItem(
    token,
    `/sites/${site}/lists/${lCosti}/items?$select=id&$expand=fields($select=Title,DataCosto,Categoria,Importo,CentroCosto,CentroCostoLookupId,Fornitore,Fonte,Note)&$top=2000`,
  )

  const daScrivere = []
  const saltati = []
  const senzaVoce = new Map()
  let totale = 0

  for (const item of costi) {
    const f = item.fields || {}
    const id = String(item.id)
    const titolo = String(f.Title ?? '').trim()
    const categoria = String(f.Categoria ?? '').trim()
    const importo = Number(f.Importo ?? 0)
    const ccItemId = Number(f.CentroCosto?.LookupId ?? f.CentroCostoLookupId ?? 0)

    const data = new Date(f.DataCosto ?? '')
    if (isNaN(data.getTime())) {
      saltati.push({ id, titolo, perche: `data "${f.DataCosto}" non valida` })
      continue
    }
    if (ANNO && data.getFullYear() !== ANNO) continue
    if (!importo) {
      saltati.push({ id, titolo, perche: 'importo a zero o assente' })
      continue
    }
    if (!ccItemId || !codiceDiItem.has(ccItemId)) {
      // Senza centro di costo il registro non accetta la riga, e non deve:
      // resta su SharePoint e si riprende al prossimo giro, quando qualcuno
      // gliene avrà assegnato uno.
      saltati.push({ id, titolo, perche: 'nessun centro di costo' })
      continue
    }

    const cc = codiceDiItem.get(ccItemId)
    const fonteSp = String(f.Fonte ?? '').trim()

    // La fonte: 'Acquisto' lo dice SharePoint; la manutenzione si riconosce
    // dal Title che coincide con l'id di una richiesta; tutto il resto è un
    // costo inserito nell'app.
    let fonte = 'costo_diretto'
    if (fonteSp === 'Acquisto') fonte = 'acquisto'
    else if (titoliManutenzioni.has(titolo)) fonte = 'manutenzione'

    // La categoria da tradurre: per un costo da richiesta d'acquisto è quella
    // della richiesta, non l'etichetta generica 'Acquisti'.
    let categoriaVera = categoria
    if (fonte === 'acquisto') {
      const codice = titolo.split('—')[0].trim()
      const catRichiesta = categoriaDiAcquisto.get(codice)
      if (catRichiesta) categoriaVera = catRichiesta
    }

    const voce = voceDiCategoria.get(categoriaVera.toLowerCase()) ?? null
    if (!voce) {
      const chiave = categoriaVera || '(vuota)'
      senzaVoce.set(chiave, (senzaVoce.get(chiave) ?? 0) + 1)
    }

    daScrivere.push({
      id,
      titolo,
      cc,
      riga: {
        data_competenza: data.toISOString().slice(0, 10),
        cc_codice: cc,
        tipo: 'costo',
        voce,
        importo: -Math.abs(importo),
        controparte: String(f.Fornitore ?? '').trim() || null,
        fonte,
        confidenza: 'certa',
        motivo: 'centro di costo scritto sul documento',
        note: categoriaVera || null,
      },
    })
    totale += Math.abs(importo)
  }

  // --- Rapporto --------------------------------------------------------------
  console.log(`\nCosti letti da SharePoint:  ${costi.length}${ANNO ? ` (filtro anno ${ANNO})` : ''}`)
  console.log(`Da riversare nel registro:  ${daScrivere.length}  —  ${euro(totale)} €`)
  console.log(`Saltati:                    ${saltati.length}\n`)

  const perFonte = new Map()
  for (const d of daScrivere) perFonte.set(d.riga.fonte, (perFonte.get(d.riga.fonte) ?? 0) + 1)
  if (perFonte.size) {
    console.log('Per fonte:')
    for (const [k, v] of [...perFonte].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(5)}  ${k}`)
    }
    console.log()
  }

  const perCc = new Map()
  for (const d of daScrivere) {
    const cur = perCc.get(d.cc) ?? { n: 0, tot: 0 }
    perCc.set(d.cc, { n: cur.n + 1, tot: cur.tot + Math.abs(d.riga.importo) })
  }
  if (perCc.size) {
    console.log('Per centro di costo:')
    for (const [cc, v] of [...perCc].sort((a, b) => b[1].tot - a[1].tot)) {
      console.log(`  ${cc.padEnd(6)} ${String(v.n).padStart(4)} righe  ${euro(v.tot).padStart(12)} €`)
    }
    console.log()
  }

  if (senzaVoce.size) {
    console.log('⚠️  Categorie senza voce analitica — la riga entra senza voce, non in "Altri costi":')
    for (const [cat, n] of [...senzaVoce].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)}  "${cat}"`)
    }
    console.log('   Per chiuderne una: insert in mappa_categoria_voce, poi rilancia questo script.\n')
  }

  if (saltati.length) {
    console.log('Saltati, uno per uno:')
    for (const s of saltati.slice(0, 40)) {
      console.log(`  #${s.id.padEnd(5)} ${(s.titolo || '(senza titolo)').slice(0, 45).padEnd(47)} ${s.perche}`)
    }
    if (saltati.length > 40) console.log(`  … e altri ${saltati.length - 40}`)
    console.log()
  }

  if (!APPLY) {
    console.log('Prova a vuoto. Per scrivere: node scripts/travaso-costi-registro.mjs --apply\n')
    return
  }

  let scritte = 0
  const errori = []
  for (const d of daScrivere) {
    try {
      await riscrivi('costo_sp', d.id, [d.riga])
      scritte++
    } catch (err) {
      errori.push({ id: d.id, titolo: d.titolo, err: err.message })
    }
  }

  console.log(`✓ Riversati ${scritte} costi su ${daScrivere.length}.`)
  if (errori.length) {
    console.log(`\n✗ ${errori.length} falliti:`)
    for (const e of errori.slice(0, 20)) console.log(`  #${e.id} ${e.titolo}: ${e.err}`)
  }

  const inRegistro = await sb('GET', '/movimento?select=id&origine_tipo=eq.costo_sp&limit=1')
  console.log(
    `\nRighe con origine costo_sp nel registro: ${
      Array.isArray(inRegistro) ? 'presenti' : 'nessuna'
    }. Controlla il cruscotto con registro_per_cc().\n`,
  )
}

main().catch((err) => {
  console.error('\n✗', err.message, '\n')
  process.exit(1)
})
