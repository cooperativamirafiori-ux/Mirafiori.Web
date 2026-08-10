#!/usr/bin/env node
/**
 * Porta i task decisi in CDA dentro Microsoft Planner.
 *
 * Il verbale resta il documento ufficiale: questo script non lo legge e non lo
 * interpreta. Prende in input un JSON di task GIA' CONFERMATI (prodotto dalla
 * skill `verbale-cda-mirafiori` e validato a mano) e li scrive su Planner in un
 * bucket dedicato alla riunione.
 *
 * Uso (da web/):
 *   node scripts/verbale-a-planner.mjs --membri
 *   node scripts/verbale-a-planner.mjs --piani
 *   node scripts/verbale-a-planner.mjs --crea-piano "CDA"
 *   node scripts/verbale-a-planner.mjs task-cda.json --prova
 *   node scripts/verbale-a-planner.mjs task-cda.json
 *
 * Permesso applicativo necessario: Tasks.ReadWrite.All (Application) con
 * consenso admin. Legge GRAPH_*, PLANNER_GROUP_CDA e PLANNER_PLAN_CDA da
 * .env.local.
 *
 * Idempotenza: la chiave e' bucket + titolo del task. Rilanciare lo stesso JSON
 * non duplica nulla, salta i task gia' presenti in quel bucket. Non aggiorna i
 * task esistenti: se un titolo cambia, il vecchio task va chiuso a mano.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GRAPH = 'https://graph.microsoft.com/v1.0'

/* ------------------------------------------------------------------ env */

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* env già impostate dall'ambiente */ }
}

/* ---------------------------------------------------------------- graph */

let _token = null

async function token() {
  if (_token) return _token
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  if (!GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    throw new Error('mancano GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET in .env.local')
  }
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
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 300)}`)
  _token = (await res.json()).access_token
  return _token
}

async function chiama(metodo, path, { body, etag } = {}) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${await token()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(etag ? { 'If-Match': etag } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const testo = (await res.text()).slice(0, 400)
    const err = new Error(`${metodo} ${path} → ${res.status}: ${testo}`)
    err.stato = res.status
    throw err
  }
  if (res.status === 204) return {}
  const testo = await res.text()
  return testo ? JSON.parse(testo) : {}
}

const get = (p) => chiama('GET', p)
const post = (p, body) => chiama('POST', p, { body })
const patch = (p, body, etag) => chiama('PATCH', p, { body, etag })
const del = (p, etag) => chiama('DELETE', p, { etag })

/* ------------------------------------------------------- modo --piani */

/**
 * Elenca i piani e i bucket. Serve una volta sola, per ricavare il valore da
 * mettere in PLANNER_PLAN_CDA.
 *
 * Se PLANNER_GROUP_CDA è impostata (o viene passato un groupId sulla riga di
 * comando) guarda solo quel gruppo; altrimenti scandisce tutti i gruppi M365 del
 * tenant, che è lento e richiede la lettura di tutti i gruppi.
 */
async function elencaPiani(groupId) {
  let ordinati
  if (groupId) {
    const g = await get(`/groups/${groupId}?$select=id,displayName`)
    ordinati = [g]
    console.log(`\nGruppo ${g.displayName}\n`)
  } else {
    const gruppi = await get("/groups?$filter=groupTypes/any(c:c eq 'Unified')&$select=id,displayName&$top=999")
    ordinati = gruppi.value.sort((a, b) => a.displayName.localeCompare(b.displayName))
    console.log(`\n${ordinati.length} gruppi M365 nel tenant.\n`)
  }

  let trovatiPiani = 0

  for (const g of ordinati) {
    let piani
    try {
      piani = await get(`/groups/${g.id}/planner/plans`)
    } catch (e) {
      if (e.stato === 403 || e.stato === 404) continue
      throw e
    }
    if (!piani.value?.length) {
      if (groupId) {
        console.log('Nessun piano Planner in questo gruppo.')
        console.log('Creane uno con:  node scripts/verbale-a-planner.mjs --crea-piano "CDA"\n')
      }
      continue
    }

    console.log(`\x1b[1m${g.displayName}\x1b[0m`)
    for (const p of piani.value) {
      trovatiPiani++
      console.log(`  piano  ${p.title}`)
      console.log(`         PLANNER_PLAN_CDA=${p.id}`)
      try {
        const bucket = await get(`/planner/plans/${p.id}/buckets`)
        for (const b of bucket.value) console.log(`         bucket · ${b.name}`)
      } catch (e) {
        console.log(`         (bucket non leggibili: ${e.message.slice(0, 80)})`)
      }
    }
    console.log('')
  }

  if (trovatiPiani) {
    console.log('Copia la riga PLANNER_PLAN_CDA del piano giusto in .env.local.\n')
  }
}

/* --------------------------------------------------------- modo --diagnosi */

/**
 * Perché un 403 su Planner. Distingue i due casi che si somigliano:
 * il permesso non è nel token (consenso mancante o non propagato) oppure c'è ma
 * Planner rifiuta comunque l'accesso al piano.
 */
async function diagnosi() {
  const t = await token()
  const claim = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString())

  console.log('\n\x1b[1mToken applicativo\x1b[0m')
  console.log(`  appid     ${claim.appid || claim.azp || '(assente)'}`)
  console.log(`  tenant    ${claim.tid}`)
  console.log(`  emesso    ${new Date(claim.iat * 1000).toISOString()}`)
  const ruoli = claim.roles || []
  console.log(`  ruoli     ${ruoli.length ? ruoli.join(', ') : '\x1b[31m(nessuno)\x1b[0m'}`)

  const haTasks = ruoli.includes('Tasks.ReadWrite.All')
  console.log(`\n  Tasks.ReadWrite.All nel token: ${haTasks ? '\x1b[32msì\x1b[0m' : '\x1b[31mNO\x1b[0m'}`)
  if (!haTasks) {
    console.log('\n  Il consenso admin non è stato concesso, oppure non è ancora propagato')
    console.log('  (può richiedere qualche minuto). Ricontrolla con:')
    console.log('    az ad app permission list --id <appId>')
  }

  const prove = [
    ['gruppo CDA', `/groups/${process.env.PLANNER_GROUP_CDA}?$select=id,displayName`],
    ['piani del gruppo', `/groups/${process.env.PLANNER_GROUP_CDA}/planner/plans`],
    ['piano CDA diretto', `/planner/plans/${process.env.PLANNER_PLAN_CDA}`],
    ['bucket del piano', `/planner/plans/${process.env.PLANNER_PLAN_CDA}/buckets`],
  ]

  console.log('\n\x1b[1mChiamate\x1b[0m')
  for (const [etichetta, path] of prove) {
    try {
      const r = await get(path)
      const sintesi = r.value ? `${r.value.length} elementi` : r.displayName || r.title || 'ok'
      console.log(`  \x1b[32mok\x1b[0m    ${etichetta} — ${sintesi}`)
    } catch (e) {
      console.log(`  \x1b[31m${e.stato || 'ko'}\x1b[0m   ${etichetta}`)
      console.log(`        ${e.message.split(': ').slice(1).join(': ').slice(0, 160)}`)
    }
  }
  console.log('')
}

/** Crea un piano Planner dentro il gruppo M365 indicato. */
async function creaPiano(groupId, titolo) {
  if (!groupId) throw new Error('manca PLANNER_GROUP_CDA in .env.local (o passa il groupId come argomento)')
  const gruppo = await get(`/groups/${groupId}?$select=id,displayName`)
  const piano = await post('/planner/plans', {
    title: titolo,
    container: { url: `https://graph.microsoft.com/v1.0/groups/${groupId}` },
  })
  console.log(`\nPiano "${piano.title}" creato nel gruppo ${gruppo.displayName}.`)
  console.log(`\nMetti questa riga in .env.local:\n  PLANNER_PLAN_CDA=${piano.id}\n`)
}

/* --------------------------------------------------------- utenti/bucket */

const cacheUtenti = new Map()
let _membri = null

/** Normalizza per il confronto: minuscolo, senza accenti, spazi collassati. */
function norm(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Membri del gruppo M365 del CDA. Sono le sole persone assegnabili sul piano. */
async function membriGruppo() {
  if (_membri) return _membri
  const groupId = process.env.PLANNER_GROUP_CDA
  if (!groupId) return (_membri = [])
  const r = await get(`/groups/${groupId}/members?$select=id,displayName,mail,userPrincipalName&$top=999`)
  _membri = r.value.map((m) => ({
    id: m.id,
    nome: m.displayName || '',
    mail: (m.mail || m.userPrincipalName || '').toLowerCase(),
  }))
  return _membri
}

/**
 * "responsabile" → userId. Accetta indifferentemente una mail o un nome e
 * cognome: i nomi si risolvono contro i membri del gruppo del piano, che sono
 * gli unici assegnabili, così non serve tenere una mappa nome→mail da nessuna
 * parte. Il confronto per nome ignora l'ordine (Nome Cognome = Cognome Nome).
 *
 * Ritorna null se non risolve, e in quel caso il task nasce non assegnato: mai
 * tirare a indovinare su chi è responsabile di cosa.
 */
async function risolviUtente(valore) {
  if (!valore) return null
  const chiave = norm(valore)
  if (cacheUtenti.has(chiave)) return cacheUtenti.get(chiave)

  let id = null
  const membri = await membriGruppo()

  if (valore.includes('@')) {
    const m = membri.find((x) => x.mail === chiave)
    if (m) {
      id = m.id
    } else {
      try {
        id = (await get(`/users/${encodeURIComponent(chiave)}?$select=id`)).id
      } catch (e) {
        if (e.stato !== 404) throw e
      }
    }
  } else {
    const token = chiave.split(' ').sort().join(' ')
    const lettere = chiave.replace(/[^a-z]/g, '').split('').sort().join('')
    const candidati = membri.filter((x) => {
      const n = norm(x.nome)
      return (
        n === chiave ||
        n.split(' ').sort().join(' ') === token ||
        // Assorbe gli spazi messi diversamente nei cognomi composti:
        // "Debenedittis" nel verbale, "De Benedittis" in anagrafica.
        n.replace(/[^a-z]/g, '').split('').sort().join('') === lettere
      )
    })
    // Ultima spiaggia: solo il cognome, come capita nelle trascrizioni
    // ("Melissari prepara il prospetto"). Solo se nient'altro ha agganciato, e
    // solo se identifica una persona sola.
    if (!candidati.length && lettere.length >= 4) {
      for (const m of membri) {
        if (norm(m.nome).replace(/[^a-z]/g, '').includes(chiave.replace(/[^a-z]/g, ''))) {
          candidati.push(m)
        }
      }
    }

    if (candidati.length === 1) {
      id = candidati[0].id
    } else if (candidati.length > 1) {
      throw new Error(
        `"${valore}" corrisponde a più membri del gruppo (${candidati.map((c) => c.mail).join(', ')}): usa la mail`
      )
    }
  }

  cacheUtenti.set(chiave, id)
  return id
}

/** Elenca i membri assegnabili. Serve per compilare il JSON senza indovinare le mail. */
async function elencaMembri() {
  const membri = await membriGruppo()
  if (!membri.length) {
    console.log('\nNessun membro leggibile: controlla PLANNER_GROUP_CDA in .env.local.\n')
    return
  }
  console.log(`\n${membri.length} membri del gruppo, assegnabili sul piano:\n`)
  const larghezza = Math.max(...membri.map((m) => m.nome.length))
  for (const m of membri.sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(`  ${m.nome.padEnd(larghezza)}  ${m.mail}`)
  }
  console.log('')
}

async function trovaOCreaBucket(planId, nome, prova) {
  const esistenti = await get(`/planner/plans/${planId}/buckets`)
  const trovato = esistenti.value.find((b) => b.name === nome)
  if (trovato) return { id: trovato.id, creato: false }
  if (prova) return { id: '(nuovo)', creato: true }
  const b = await post('/planner/buckets', { name: nome, planId, orderHint: ' !' })
  return { id: b.id, creato: true }
}

/* ------------------------------------------------------------ scrittura */

/**
 * Descrizione e checklist non stanno sul task ma su plannerTaskDetails, che
 * richiede If-Match con l'etag corrente: quindi GET details prima di ogni PATCH.
 */
async function scriviDettagli(taskId, descrizione, checklist) {
  const dettagli = await get(`/planner/tasks/${taskId}/details`)
  const corpo = { description: descrizione, previewType: 'description' }
  if (checklist?.length) {
    corpo.checklist = {}
    for (const voce of checklist.slice(0, 20)) {
      corpo.checklist[randomUUID()] = {
        '@odata.type': '#microsoft.graph.plannerChecklistItem',
        title: String(voce).slice(0, 255),
        isChecked: false,
        orderHint: ' !',
      }
    }
  }
  await patch(`/planner/tasks/${taskId}/details`, corpo, dettagli['@odata.etag'])
}

function noteTask(t, riunione, indice) {
  const righe = []
  if (t.note) righe.push(t.note.trim(), '')
  if (t.responsabile) righe.push(`Responsabile indicato in verbale: ${t.responsabile}`)
  righe.push(`Origine: verbale CDA del ${riunione}`)
  righe.push(`[verbale:${riunione}#${indice + 1}]`)
  return righe.join('\n')
}

async function creaTask(planId, bucketId, t, riunione, indice) {
  const corpo = {
    planId,
    bucketId,
    title: t.titolo.slice(0, 255),
    orderHint: ' !',
  }
  if (t.scadenza) corpo.dueDateTime = `${t.scadenza}T12:00:00Z`

  const userId = await risolviUtente(t.responsabile)
  if (userId) {
    corpo.assignments = {
      [userId]: { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: ' !' },
    }
  }

  const creato = await post('/planner/tasks', corpo)
  await scriviDettagli(creato.id, noteTask(t, riunione, indice), t.checklist)
  return { id: creato.id, assegnato: Boolean(userId) }
}

/* ------------------------------------------------- modo --elimina-bucket */

/**
 * Cancella un bucket e tutti i suoi task. Serve per ripulire dopo un invio
 * sbagliato (o dopo il bucket di prova): a mano sarebbero N clic.
 *
 * Senza --conferma mostra solo cosa cancellerebbe. Planner richiede If-Match su
 * ogni DELETE, e gli etag arrivano già nelle liste: nessuna GET aggiuntiva.
 */
async function eliminaBucket(nome, conferma) {
  const planId = process.env.PLANNER_PLAN_CDA
  if (!planId) throw new Error('manca PLANNER_PLAN_CDA in .env.local')

  const bucket = (await get(`/planner/plans/${planId}/buckets`)).value.find((b) => b.name === nome)
  if (!bucket) throw new Error(`nessun bucket "${nome}" in questo piano`)

  const task = (await get(`/planner/plans/${planId}/tasks`)).value.filter((t) => t.bucketId === bucket.id)

  console.log(`\nbucket   ${bucket.name}`)
  console.log(`task     ${task.length}\n`)
  for (const t of task) console.log(`  ${conferma ? '- elimino' : '- da eliminare'}  ${t.title}`)

  if (!conferma) {
    console.log('\nNiente è stato cancellato. Aggiungi --conferma per procedere.\n')
    return
  }

  for (const t of task) await del(`/planner/tasks/${t.id}`, t['@odata.etag'])
  await del(`/planner/buckets/${bucket.id}`, bucket['@odata.etag'])
  console.log(`\nEliminati ${task.length} task e il bucket "${nome}".\n`)
}

/* ----------------------------------------------------------------- invio */

async function invia(percorsoJson, prova) {
  const dati = JSON.parse(readFileSync(resolve(percorsoJson), 'utf8'))

  if (!dati.riunione || !Array.isArray(dati.task)) {
    throw new Error('il JSON deve avere i campi "riunione" (AAAA-MM-GG) e "task" (array)')
  }
  const senzaTitolo = dati.task.findIndex((t) => !t?.titolo)
  if (senzaTitolo >= 0) throw new Error(`il task #${senzaTitolo + 1} non ha "titolo"`)

  const planId = process.env.PLANNER_PLAN_CDA
  if (!planId) throw new Error('manca PLANNER_PLAN_CDA in .env.local (ricavalo con --piani)')

  const piano = await get(`/planner/plans/${planId}`)
  const nomeBucket = dati.bucket || `CDA ${dati.riunione}`

  // Risolvo tutti i responsabili prima di creare qualsiasi cosa: un nome
  // ambiguo deve fermare l'invio da fermo, non a metà del bucket.
  for (const t of dati.task) await risolviUtente(t.responsabile)

  console.log(`\npiano    ${piano.title}`)
  console.log(`bucket   ${nomeBucket}`)
  console.log(`task     ${dati.task.length} nel JSON`)
  if (prova) console.log('\n\x1b[33mMODO PROVA — nessuna scrittura su Planner\x1b[0m')

  const bucket = await trovaOCreaBucket(planId, nomeBucket, prova)
  console.log(`\nbucket ${bucket.creato ? 'da creare' : 'già esistente'}\n`)

  const esistenti = bucket.creato
    ? new Set()
    : new Set(
        (await get(`/planner/plans/${planId}/tasks?$select=id,title,bucketId`)).value
          .filter((t) => t.bucketId === bucket.id)
          .map((t) => t.title)
      )

  let creati = 0
  let saltati = 0
  const nonAssegnati = []

  for (const [i, t] of dati.task.entries()) {
    const titolo = t.titolo.slice(0, 255)
    if (esistenti.has(titolo)) {
      console.log(`  · già presente  ${titolo}`)
      saltati++
      continue
    }
    if (prova) {
      const userId = await risolviUtente(t.responsabile)
      const chi = t.responsabile ? (userId ? t.responsabile : `${t.responsabile} NON TROVATO`) : 'nessuno'
      console.log(`  + da creare     ${titolo}`)
      console.log(`                  a ${chi}${t.scadenza ? ` · scadenza ${t.scadenza}` : ' · senza scadenza'}`)
      if (t.responsabile && !userId) nonAssegnati.push(t.responsabile)
      creati++
      continue
    }
    const esito = await creaTask(planId, bucket.id, t, dati.riunione, i)
    console.log(`  + creato        ${titolo}${esito.assegnato ? '' : '  (non assegnato)'}`)
    if (t.responsabile && !esito.assegnato) nonAssegnati.push(t.responsabile)
    creati++
  }

  console.log(`\n${prova ? 'Da creare' : 'Creati'}: ${creati} · saltati perché già presenti: ${saltati}`)
  if (nonAssegnati.length) {
    console.log('\n\x1b[33mNon assegnabili\x1b[0m — non risolti fra i membri del gruppo:')
    for (const e of new Set(nonAssegnati)) console.log(`  ${e}`)
    console.log('Il nome resta nelle note del task. Chi non è membro del gruppo del piano')
    console.log('non è assegnabile: vedi l\'elenco con  node scripts/verbale-a-planner.mjs --membri')
  }
  console.log('')
}

/* ------------------------------------------------------------------ main */

async function main() {
  loadEnvLocal()
  const argomenti = process.argv.slice(2)
  const posizionali = argomenti.filter((a) => !a.startsWith('--'))
  const gruppo = process.env.PLANNER_GROUP_CDA || null

  if (argomenti.includes('--diagnosi')) return diagnosi()
  if (argomenti.includes('--membri')) return elencaMembri()
  if (argomenti.includes('--piani')) {
    return elencaPiani(posizionali[0] || gruppo)
  }
  if (argomenti.includes('--elimina-bucket')) {
    const nome = argomenti[argomenti.indexOf('--elimina-bucket') + 1]
    if (!nome || nome.startsWith('--')) {
      throw new Error('serve il nome del bucket: --elimina-bucket "CDA 2026-08-10"')
    }
    return eliminaBucket(nome, argomenti.includes('--conferma'))
  }
  if (argomenti.includes('--crea-piano')) {
    const titolo = argomenti[argomenti.indexOf('--crea-piano') + 1]
    if (!titolo || titolo.startsWith('--')) {
      throw new Error('serve il titolo del piano: --crea-piano "CDA"')
    }
    return creaPiano(gruppo, titolo)
  }

  const percorso = posizionali[0]
  if (!percorso) {
    console.error('Uso:')
    console.error('  node scripts/verbale-a-planner.mjs --diagnosi')
    console.error('  node scripts/verbale-a-planner.mjs --membri')
    console.error('  node scripts/verbale-a-planner.mjs --piani')
    console.error('  node scripts/verbale-a-planner.mjs --crea-piano "CDA"')
    console.error('  node scripts/verbale-a-planner.mjs task-cda.json --prova')
    console.error('  node scripts/verbale-a-planner.mjs task-cda.json')
    console.error('  node scripts/verbale-a-planner.mjs --elimina-bucket "CDA AAAA-MM-GG" --conferma')
    process.exit(1)
  }
  return invia(percorso, argomenti.includes('--prova'))
}

main().catch((e) => {
  console.error(`\n\x1b[31m${e.message}\x1b[0m\n`)
  if (e.stato === 403) {
    console.error('403 su Planner: controlla che Tasks.ReadWrite.All (Application) sia')
    console.error('presente E con consenso admin concesso sull\'app registration.\n')
  }
  process.exit(1)
})
