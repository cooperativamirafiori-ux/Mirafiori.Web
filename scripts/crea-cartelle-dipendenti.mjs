#!/usr/bin/env node
/**
 * Crea in un colpo solo le cartelle personali su SharePoint di tutti i
 * dipendenti IN SERVIZIO che ancora non le hanno.
 *
 * Perché serve: la cartella personale nasceva solo "alla prima occasione" —
 * quando qualcuno apriva la scheda o quando ci si archiviava il primo documento.
 * Il risultato è che chi non ha ancora avuto un'occasione non ha la cartella, e
 * te ne accorgi nel momento peggiore (la chiusura del foglio ore, che da agosto
 * 2026 si ferma se l'archiviazione non riesce). Questo script chiude il buco su
 * tutta la pianta organica in una volta.
 *
 * Fa esattamente quello che fa `ensureCartellaDipendente` in
 * lib/risorse-umane/data.ts, con lo stesso nome di cartella e lo stesso
 * percorso — se le due cose divergessero nascerebbero cartelle doppie:
 *   percorso  = SP_RU_FOLDER (default "Risorse Umane/Dipendenti")
 *   cartella  = "Cognome Nome - Matricola"  (senza matricola: "Cognome Nome")
 * e al termine scrive l'URL della cartella nel campo CartellaUrl della scheda.
 *
 * CHI È "IN SERVIZIO": tutti tranne StatoRapporto = "Cessato". Chi ha lo stato
 * vuoto viene incluso (una scheda senza stato è quasi sempre un dato mancante,
 * non una persona uscita) e segnalato a parte nel riepilogo.
 *
 * L'esistenza della cartella si verifica SUL DRIVE, non fidandosi di
 * CartellaUrl: il campo può essere vuoto con la cartella già lì (creata da un
 * upload) o valorizzato con la cartella rinominata a mano. Quando la cartella
 * c'è ma il campo è vuoto, lo script si limita a riallineare il campo.
 *
 * USO (dalla cartella web/):
 *   node scripts/crea-cartelle-dipendenti.mjs            → dry-run, non scrive niente
 *   node scripts/crea-cartelle-dipendenti.mjs --apply    → crea davvero
 *   node scripts/crea-cartelle-dipendenti.mjs --apply --tutti
 *        include anche i cessati (serve solo se si vuole l'archivio completo)
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SP_LIST_DIPENDENTI, il sito (SP_SITE_RU se impostato, altrimenti
 * SHAREPOINT_SITE_ID) e, se presente, SP_RU_DRIVE_ID / SP_RU_FOLDER.
 *
 * Permesso Graph: Sites.ReadWrite.All (Application).
 *
 * Idempotente: rieseguirlo non crea nulla di nuovo.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const APPLY = process.argv.includes('--apply')
const TUTTI = process.argv.includes('--tutti')

const CESSATO = 'Cessato'
const CAMPI = 'Cognome,Nome,Matricola,IdAccess,StatoRapporto,MailAziendale,CartellaUrl'

// ---------------------------------------------------------------- ambiente

function caricaEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const riga of raw.split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    // niente .env.local: si usano le variabili d'ambiente
  }
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

async function graph(token, metodo, path, body) {
  const res = await fetch(path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${metodo} ${path} → ${res.status}: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : {}
}

/** GET che tollera il 404: serve a chiedere "questa cartella esiste?". */
async function graphOrNull(token, path) {
  try {
    return await graph(token, 'GET', path)
  } catch (e) {
    if (String(e.message).includes('→ 404')) return null
    throw e
  }
}

// ------------------------------------------------- nomi e percorsi (allineati a lib/)

const folderRoot = () => process.env.SP_RU_FOLDER || 'Risorse Umane/Dipendenti'

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** Stessa sanitizzazione di lib/risorse-umane/data.ts: non toccare a cuor leggero. */
function sanitize(s) {
  return (s || '')
    .replace(/[\\/:*?"<>|#%]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function nomeCartella(f, spItemId) {
  const base = `${f.Cognome ?? ''} ${f.Nome ?? ''}`.trim()
  const rif = f.Matricola || (f.IdAccess != null ? String(f.IdAccess) : '')
  return sanitize(rif ? `${base} - ${rif}` : base) || `Dipendente ${spItemId}`
}

async function getDriveId(token, site) {
  if (process.env.SP_RU_DRIVE_ID) return process.env.SP_RU_DRIVE_ID
  const d = await graph(token, 'GET', `/sites/${site}/drive?$select=id`)
  return d.id
}

/** Crea l'intero percorso, un segmento per volta, saltando quelli che ci sono. */
async function ensureFolderPath(token, driveId, fullPath) {
  const segmenti = fullPath.split('/').filter(Boolean)
  let parent = ''
  for (const seg of segmenti) {
    const corrente = parent ? `${parent}/${seg}` : seg
    const esiste = await graphOrNull(token, `/drives/${driveId}/root:/${encodePath(corrente)}?$select=id`)
    if (!esiste) {
      const endpoint = parent
        ? `/drives/${driveId}/root:/${encodePath(parent)}:/children`
        : `/drives/${driveId}/root/children`
      await graph(token, 'POST', endpoint, {
        name: seg,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      })
    }
    parent = corrente
  }
}

// ---------------------------------------------------------------- lettura lista

async function tuttiGliItem(token, site, listId) {
  const out = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=${CAMPI})&$top=200`
  while (url) {
    const res = await graph(token, 'GET', url)
    out.push(...(res.value || []))
    const next = res['@odata.nextLink']
    url = next || null
  }
  return out
}

// ---------------------------------------------------------------- corpo

async function main() {
  caricaEnv()
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  const listId = process.env.SP_LIST_DIPENDENTI
  if (!site || !listId) {
    console.error('✗ Mancano SP_SITE_RU (o SHAREPOINT_SITE_ID) e SP_LIST_DIPENDENTI in .env.local')
    process.exit(1)
  }

  console.log(APPLY ? '▶ Modalità APPLY: le cartelle vengono create.' : '▶ Dry-run: nessuna scrittura. Aggiungi --apply per creare davvero.')
  console.log(`  Percorso: ${folderRoot()}/<Cognome Nome - Matricola>`)

  const token = await getToken()
  const driveId = await getDriveId(token, site)
  const items = await tuttiGliItem(token, site, listId)
  console.log(`  Schede lette: ${items.length}\n`)

  const daFare = []
  let cessatiSaltati = 0
  const senzaStato = []

  for (const it of items) {
    const f = it.fields ?? {}
    const stato = String(f.StatoRapporto ?? '').trim()
    if (!TUTTI && stato === CESSATO) {
      cessatiSaltati++
      continue
    }
    if (!stato) senzaStato.push(`${f.Cognome ?? '?'} ${f.Nome ?? ''}`.trim())
    daFare.push({ spItemId: it.id, f, cartella: nomeCartella(f, it.id) })
  }

  const creati = []
  const soloCampo = []
  const giaOk = []
  const errori = []

  for (const d of daFare) {
    const relPath = `${folderRoot()}/${d.cartella}`
    try {
      const esistente = await graphOrNull(
        token,
        `/drives/${driveId}/root:/${encodePath(relPath)}?$select=id,webUrl`,
      )

      if (esistente) {
        // La cartella c'è. Resta da capire se la scheda lo sa.
        if (String(d.f.CartellaUrl ?? '') !== esistente.webUrl) {
          soloCampo.push(d.cartella)
          if (APPLY) {
            await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/items/${d.spItemId}/fields`, {
              CartellaUrl: esistente.webUrl,
            })
          }
        } else {
          giaOk.push(d.cartella)
        }
        continue
      }

      creati.push(d.cartella)
      if (APPLY) {
        await ensureFolderPath(token, driveId, relPath)
        const folder = await graph(
          token,
          'GET',
          `/drives/${driveId}/root:/${encodePath(relPath)}?$select=webUrl`,
        )
        await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/items/${d.spItemId}/fields`, {
          CartellaUrl: folder.webUrl,
        })
      }
    } catch (e) {
      errori.push({ cartella: d.cartella, motivo: e.message })
    }
  }

  // ------------------------------------------------------------- riepilogo
  const el = (v, max = 12) =>
    v.slice(0, max).map((x) => `    · ${x}`).join('\n') + (v.length > max ? `\n    … e altri ${v.length - max}` : '')

  console.log('─'.repeat(60))
  console.log(`Considerate in servizio: ${daFare.length}${TUTTI ? ' (incluso chi è cessato: --tutti)' : `  ·  cessati saltati: ${cessatiSaltati}`}`)
  console.log(`Cartella già a posto:    ${giaOk.length}`)
  console.log(`${APPLY ? 'Cartelle create:' : 'Cartelle DA creare:'}       ${creati.length}`)
  if (creati.length) console.log(el(creati))
  if (soloCampo.length) {
    console.log(`${APPLY ? 'CartellaUrl riallineato:' : 'CartellaUrl DA riallineare:'} ${soloCampo.length}`)
    console.log('  (la cartella esisteva già, ma la scheda non la indicava)')
    console.log(el(soloCampo))
  }
  if (senzaStato.length) {
    console.log(`\n✓ Incluse anche ${senzaStato.length} schede senza StatoRapporto: la cartella ${APPLY ? "l'hanno avuta" : "la avranno"} come le altre.`)
    console.log('  Non blocca niente. È solo un promemoria: lo stato in anagrafica va messo,')
    console.log('  e se qualcuna di queste persone non è più in servizio la cartella si toglie a mano.')
    console.log(el(senzaStato))
  }
  if (errori.length) {
    console.log(`\n✗ Errori: ${errori.length}`)
    for (const e of errori) console.log(`    · ${e.cartella}: ${e.motivo}`)
  }
  console.log('─'.repeat(60))
  if (!APPLY && (creati.length || soloCampo.length)) {
    console.log('Per applicare: node scripts/crea-cartelle-dipendenti.mjs --apply')
  }
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
