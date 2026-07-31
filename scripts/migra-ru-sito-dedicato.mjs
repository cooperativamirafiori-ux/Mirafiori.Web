#!/usr/bin/env node
/**
 * Migrazione dell'area Risorse Umane dal sito gruppo_ControlloGestione al sito
 * dedicato RisorseUmane: item delle liste + cartelle personali dei dipendenti.
 *
 * Passo 5 di docs/piano-ru-sito-dedicato-accesso-delegato.md
 *
 * ─── Cose da sapere prima di lanciarlo ─────────────────────────────────────
 *
 * • **Copia, non sposta.** Le liste sorgente restano intatte. Quindi fra la copia
 *   e il cutover delle variabili c'è una finestra in cui una modifica fatta
 *   sulla lista vecchia si perderebbe: migrazione e cutover vanno fatti di
 *   seguito, in un momento in cui nessuno lavora sulle anagrafiche.
 *
 * • **Gli spItemId cambiano.** Il Log Attività contiene i vecchi id in EntitaId:
 *   le righe storiche non saranno più risolvibili verso l'item. È accettato nel
 *   piano, ma è irreversibile.
 *
 * • **Identità applicativa.** La migrazione gira app-only, di proposito: in
 *   SharePoint gli item migrati risulteranno creati da "App Mirafiori". È
 *   corretto — non è la persona ad averli scritti, è una migrazione tecnica.
 *   Da qui in avanti le modifiche degli HR saranno a loro nome.
 *
 * • **Idempotente.** Il collegamento fra vecchio e nuovo è il codice fiscale,
 *   con ripiego su IdAccess+CategoriaRU e poi su cognome+nome (vedi `chiave()`,
 *   dove è spiegato perché IdAccess da solo non basta). Rilanciarlo non duplica
 *   nulla: riprende da dove si era interrotto.
 *
 * ─── Uso (da web/) ─────────────────────────────────────────────────────────
 *
 *   node scripts/migra-ru-sito-dedicato.mjs                 # DRY-RUN: non scrive
 *   node scripts/migra-ru-sito-dedicato.mjs --apply         # esegue
 *   node scripts/migra-ru-sito-dedicato.mjs --apply --solo=item
 *   node scripts/migra-ru-sito-dedicato.mjs --apply --solo=cartelle
 *   node scripts/migra-ru-sito-dedicato.mjs --entita=tirocini
 *
 * Legge sorgente e destinazione dal blocco "Assetto area Risorse Umane" di
 * .env.local, anche dalle righe commentate: così i GUID stanno in un solo posto
 * e non vanno ribattuti (vedi scripts/ru-assetto.mjs).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV = join(__dirname, '..', '.env.local')

const APPLY = process.argv.includes('--apply')
const SOLO = process.argv.find((a) => a.startsWith('--solo='))?.slice(7) ?? 'tutto'
const ENTITA_ARG = process.argv.find((a) => a.startsWith('--entita='))?.slice(9)
const DUPLICATI = process.argv.includes('--duplicati')

const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`)
const ko = (s) => console.log(`  \x1b[31m✗\x1b[0m ${s}`)
const nota = (s) => console.log(`    ${s}`)
const titolo = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`)

// ===========================================================================
// Configurazione: letta dai due assetti in .env.local, righe commentate incluse
// ===========================================================================

function leggiAssetti() {
  const righe = readFileSync(ENV, 'utf8').split('\n')
  const iA = righe.findIndex((r) => r.startsWith('# [A] ATTUALE'))
  const iB = righe.findIndex((r) => r.startsWith('# [B] NUOVO'))
  const iFine = righe.findIndex((r, i) => i > iB && r.startsWith('# ====='))
  if (iA < 0 || iB < 0 || iFine < 0) {
    throw new Error(
      'Blocco "Assetto area Risorse Umane" non trovato in .env.local.\n' +
        '  Servono i marcatori "# [A] ATTUALE", "# [B] NUOVO" e la chiusura "# ====".',
    )
  }
  const estrai = (da, a) => {
    const out = {}
    for (const r of righe.slice(da, a)) {
      // accetta sia "CHIAVE=valore" sia "# CHIAVE=valore"
      const m = r.match(/^\s*#?\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && m[2]) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    return out
  }
  return { A: estrai(iA + 1, iB), B: estrai(iB + 1, iFine) }
}

function leggiEnvGenerale() {
  const out = {}
  for (const r of readFileSync(ENV, 'utf8').split('\n')) {
    const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

// ===========================================================================
// Graph
// ===========================================================================

let _token = null
async function token(env) {
  if (_token) return _token
  const res = await fetch(`https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.GRAPH_CLIENT_ID,
      client_secret: env.GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) throw new Error(`token Graph ${res.status}: ${(await res.text()).slice(0, 200)}`)
  _token = (await res.json()).access_token
  return _token
}

const attendi = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Chiamata Graph con gestione del throttling: su 429/503 rispetta Retry-After.
 * Su 275 item più 275 cartelle il throttling non è un'ipotesi remota.
 */
async function graph(env, method, path, body, extra = {}) {
  const t = await token(env)
  for (let tentativo = 1; ; tentativo++) {
    const res = await fetch(path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${t}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...extra.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })

    if ((res.status === 429 || res.status === 503) && tentativo <= 5) {
      const dopo = Number(res.headers.get('retry-after')) || tentativo * 5
      nota(`throttling ${res.status}: attendo ${dopo}s (tentativo ${tentativo})`)
      await attendi(dopo * 1000)
      continue
    }
    if (extra.grezza) return res
    const testo = await res.text()
    if (!res.ok) throw new Error(`${method} ${path.slice(0, 90)} → ${res.status}: ${testo.slice(0, 300)}`)
    return testo ? JSON.parse(testo) : {}
  }
}

/** Segue @odata.nextLink: le liste hanno più di 200 item. */
async function graphTutti(env, path) {
  let url = path
  const tutti = []
  while (url) {
    const res = await graph(env, 'GET', url)
    tutti.push(...(res.value || []))
    url = res['@odata.nextLink'] || null
  }
  return tutti
}

// ===========================================================================
// Item delle liste
// ===========================================================================

/**
 * Campi scrivibili della lista di destinazione: è la fonte di verità di cosa
 * copiare. Meglio che riscrivere qui lo schema di types/risorse-umane.ts, che
 * poi divergerebbe, e meglio di una lista di esclusioni dei campi di sistema,
 * che sono decine e cambiano.
 */
async function campiScrivibili(env, site, listId) {
  const cols = await graphTutti(env, `/sites/${site}/lists/${listId}/columns?$select=name,readOnly,hidden&$top=300`)
  return new Set(
    cols.filter((c) => !c.readOnly && !c.hidden && c.name && !c.name.startsWith('_')).map((c) => c.name),
  )
}

/**
 * Chiave di appaiamento fra record sorgente e record già in destinazione.
 *
 * L'ordine di preferenza conta, e la prima versione lo aveva sbagliato mettendo
 * IdAccess davanti al codice fiscale.
 *
 * ⚠️ `IdAccess` NON è univoco sulla lista Dipendenti. Nel database Access le
 * tabelle PROFILO SOGGETTO e COLLABORATORI avevano numerazioni indipendenti,
 * entrambe a partire da 1; con l'unificazione dei collaboratori nella lista
 * Dipendenti (2026-07) le due numerazioni si sono sovrapposte. Risultato: per
 * ogni valore 1..14 esistono due persone diverse. Usare IdAccess come chiave
 * primaria faceva scartare 12 collaboratori come se fossero doppioni.
 *
 * Il codice fiscale è l'identificatore reale di una persona, quindi viene
 * prima. Dove manca — diversi collaboratori non l'hanno — si usa IdAccess
 * qualificato con `CategoriaRU`, che separa le due numerazioni. Ultimo ripiego
 * cognome+nome, che non distingue gli omonimi ma è meglio di niente.
 */
function chiave(fields) {
  const cf = String(fields.CodiceFiscale ?? '').trim().toUpperCase()
  if (cf) return `CF:${cf}`
  if (fields.IdAccess != null && fields.IdAccess !== '') {
    const categoria = String(fields.CategoriaRU ?? 'Dipendente').trim() || 'Dipendente'
    return `A:${categoria}:${fields.IdAccess}`
  }
  return `N:${String(fields.Cognome ?? '').trim().toUpperCase()}|${String(fields.Nome ?? '').trim().toUpperCase()}`
}

async function migraItem(env, cfg, entita) {
  const chiaveLista = entita === 'dipendenti' ? 'SP_LIST_DIPENDENTI' : 'SP_LIST_TIROCINI'
  const daLista = cfg.A[chiaveLista]
  const aLista = cfg.B[chiaveLista]
  if (!daLista || !aLista) throw new Error(`GUID lista mancante per ${entita} (${chiaveLista})`)

  titolo(`Item — ${entita}`)
  nota(`sorgente:     ${cfg.A.SHAREPOINT_SITE_ID.slice(0, 40)}… / ${daLista}`)
  nota(`destinazione: ${cfg.B.SP_SITE_RU.slice(0, 40)}… / ${aLista}`)

  const sorgenti = await graphTutti(
    env,
    `/sites/${cfg.A.SHAREPOINT_SITE_ID}/lists/${daLista}/items?$expand=fields&$top=200`,
  )
  ok(`${sorgenti.length} item letti dalla sorgente`)

  const esistenti = await graphTutti(
    env,
    `/sites/${cfg.B.SP_SITE_RU}/lists/${aLista}/items?$expand=fields&$top=200`,
  )
  const giaPresenti = new Map(esistenti.map((it) => [chiave(it.fields ?? {}), it]))
  ok(`${esistenti.length} item già presenti in destinazione`)

  const scrivibili = await campiScrivibili(env, cfg.B.SP_SITE_RU, aLista)
  nota(`${scrivibili.size} campi scrivibili nella lista di destinazione`)

  const mappa = new Map() // vecchio spItemId → nuovo spItemId
  let creati = 0
  let giaInDestinazione = 0
  let chiaviDuplicate = 0
  const duplicati = []
  const errori = []
  // Serve a distinguere "era già in destinazione prima di partire" da
  // "due record sorgente hanno la stessa chiave": il secondo caso è un dato che
  // NON viene copiato, e chiamarlo "già presente" lo nasconderebbe.
  const chiaviIniziali = new Set(giaPresenti.keys())

  for (const [i, it] of sorgenti.entries()) {
    const f = it.fields ?? {}
    const k = chiave(f)

    const esistente = giaPresenti.get(k)
    if (esistente) {
      mappa.set(it.id, esistente.id)
      if (chiaviIniziali.has(k)) {
        giaInDestinazione++
      } else {
        chiaviDuplicate++
        duplicati.push({
          id: it.id,
          chiave: k,
          nominativo: `${String(f.Cognome ?? '').trim()} ${String(f.Nome ?? '').trim()}`.trim(),
          idAccess: f.IdAccess ?? null,
          cf: f.CodiceFiscale ?? null,
          scontraCon: esistente.id,
        })
      }
      continue
    }

    const payload = {}
    for (const [nome, valore] of Object.entries(f)) {
      if (!scrivibili.has(nome)) continue
      if (valore === null || valore === '') continue
      payload[nome] = valore
    }
    if (!payload.Title) {
      payload.Title = `${String(f.Cognome ?? '').trim()} ${String(f.Nome ?? '').trim()}`.trim() || 'Senza nome'
    }

    if (!APPLY) {
      mappa.set(it.id, `(nuovo)`)
      creati++
      continue
    }

    try {
      const nuovo = await graph(env, 'POST', `/sites/${cfg.B.SP_SITE_RU}/lists/${aLista}/items`, { fields: payload })
      mappa.set(it.id, nuovo.id)
      giaPresenti.set(k, nuovo)
      creati++
      if (creati % 25 === 0) nota(`… ${creati} creati (${i + 1}/${sorgenti.length})`)
    } catch (e) {
      errori.push({ id: it.id, nominativo: payload.Title, errore: e.message })
    }
  }

  ok(`creati: ${creati}   già in destinazione: ${giaInDestinazione}   NON copiati per chiave duplicata: ${chiaviDuplicate}   errori: ${errori.length}`)
  for (const e of errori.slice(0, 10)) ko(`item ${e.id} "${e.nominativo}": ${e.errore.slice(0, 160)}`)
  if (errori.length > 10) nota(`… e altri ${errori.length - 10} errori`)

  if (chiaviDuplicate) {
    ko(`${chiaviDuplicate} record sorgente NON sono stati copiati: la loro chiave coincide con un altro record.`)
    nota('Elenco completo:  node scripts/migra-ru-sito-dedicato.mjs --duplicati')
    nota('Sono veri doppioni da non copiare, oppure omonimi senza IdAccess né codice fiscale')
    nota('che la chiave non riesce a distinguere. Va deciso caso per caso.')
  }

  return { mappa, sorgenti, creati, giaInDestinazione, chiaviDuplicate, duplicati, errori }
}

/**
 * Elenca i gruppi di record sorgente che condividono la stessa chiave di
 * appaiamento. Sono i record che la migrazione salta, quindi va guardato prima
 * di considerare la migrazione completa.
 */
async function elencaDuplicati(env, cfg, entita) {
  const chiaveLista = entita === 'dipendenti' ? 'SP_LIST_DIPENDENTI' : 'SP_LIST_TIROCINI'
  const daLista = cfg.A[chiaveLista]
  if (!daLista) return

  titolo(`Chiavi duplicate in sorgente — ${entita}`)
  const sorgenti = await graphTutti(
    env,
    `/sites/${cfg.A.SHAREPOINT_SITE_ID}/lists/${daLista}/items?$expand=fields&$top=200`,
  )

  const gruppi = new Map()
  for (const it of sorgenti) {
    const k = chiave(it.fields ?? {})
    if (!gruppi.has(k)) gruppi.set(k, [])
    gruppi.get(k).push(it)
  }

  const collisioni = [...gruppi.entries()].filter(([, v]) => v.length > 1)
  if (!collisioni.length) {
    ok('nessuna chiave duplicata')
    return
  }

  ko(`${collisioni.length} chiavi condivise da più record (${collisioni.reduce((n, [, v]) => n + v.length - 1, 0)} record non copiati)`)
  console.log('')
  console.log('  ' + 'Chiave'.padEnd(26) + 'Id'.padEnd(6) + 'Nominativo'.padEnd(30) + 'IdAccess'.padEnd(10) + 'CodiceFiscale')
  console.log('  ' + '-'.repeat(26 + 6 + 30 + 10 + 18))
  for (const [k, items] of collisioni) {
    for (const [i, it] of items.entries()) {
      const f = it.fields ?? {}
      const nome = `${String(f.Cognome ?? '').trim()} ${String(f.Nome ?? '').trim()}`.trim()
      console.log(
        '  ' +
          (i === 0 ? k.slice(0, 25).padEnd(26) : ' '.repeat(26)) +
          String(it.id).padEnd(6) +
          nome.slice(0, 29).padEnd(30) +
          String(f.IdAccess ?? '—').padEnd(10) +
          String(f.CodiceFiscale ?? '—'),
      )
    }
  }
  console.log('')
  nota('La chiave è: CodiceFiscale se presente, altrimenti IdAccess+CategoriaRU, altrimenti Cognome+Nome.')
  nota('Chiave "CF:…" duplicata = stessa persona inserita due volte: il salto è corretto.')
  nota('Chiave "N:…" con persone diverse = omonimi senza codice fiscale: da distinguere a mano.')
}

// ===========================================================================
// Cartelle personali
// ===========================================================================

async function driveDi(env, site) {
  const d = await graph(env, 'GET', `/sites/${site}/drive?$select=id`)
  return d.id
}

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/')

async function cartellaPerPercorso(env, driveId, percorso) {
  const res = await graph(env, 'GET', `/drives/${driveId}/root:/${encodePath(percorso)}?$select=id,name`, null, {
    grezza: true,
  })
  if (res.status === 404) return null
  const testo = await res.text()
  if (!res.ok) throw new Error(`risoluzione "${percorso}" → ${res.status}: ${testo.slice(0, 200)}`)
  return JSON.parse(testo)
}

async function creaPercorso(env, driveId, percorso) {
  const segmenti = percorso.split('/').filter(Boolean)
  let corrente = ''
  for (const seg of segmenti) {
    const prossimo = corrente ? `${corrente}/${seg}` : seg
    const esiste = await cartellaPerPercorso(env, driveId, prossimo)
    if (!esiste) {
      const endpoint = corrente
        ? `/drives/${driveId}/root:/${encodePath(corrente)}:/children`
        : `/drives/${driveId}/root/children`
      await graph(env, 'POST', endpoint, {
        name: seg,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      })
    }
    corrente = prossimo
  }
  return cartellaPerPercorso(env, driveId, percorso)
}

/**
 * Copia una cartella. `/copy` è ASINCRONA: risponde 202 con un header Location
 * da interrogare fino a completamento. Preferita al download+upload perché non
 * ha il limite dei 4 MB per file.
 */
async function copiaCartella(env, srcDrive, srcItemId, dstDrive, dstParentId, nome) {
  const res = await graph(
    env,
    'POST',
    `/drives/${srcDrive}/items/${srcItemId}/copy`,
    { parentReference: { driveId: dstDrive, id: dstParentId }, name: nome },
    { grezza: true },
  )
  if (res.status !== 202) {
    throw new Error(`copy non accettata (${res.status}): ${(await res.text()).slice(0, 200)}`)
  }
  const monitor = res.headers.get('location')
  if (!monitor) return { stato: 'accettata-senza-monitor' }

  for (let i = 0; i < 60; i++) {
    await attendi(2000)
    const m = await fetch(monitor)
    if (!m.ok) return { stato: `monitor ${m.status}` }
    const s = await m.json()
    if (s.status === 'completed') return { stato: 'completed' }
    if (s.status === 'failed') return { stato: `failed: ${JSON.stringify(s.error ?? {}).slice(0, 200)}` }
  }
  return { stato: 'timeout (la copia può completarsi comunque)' }
}

async function migraCartelle(env, cfg) {
  titolo('Cartelle personali')

  const srcRoot = cfg.A.SP_RU_FOLDER || 'Risorse Umane/Dipendenti'
  const dstRoot = cfg.B.SP_RU_FOLDER || 'Risorse Umane App/Dipendenti'
  nota(`da:  ${srcRoot}`)
  nota(`a:   ${dstRoot}`)

  const srcDrive = await driveDi(env, cfg.A.SHAREPOINT_SITE_ID)
  const dstDrive = cfg.B.SP_RU_DRIVE_ID || (await driveDi(env, cfg.B.SP_SITE_RU))

  const src = await cartellaPerPercorso(env, srcDrive, srcRoot)
  if (!src) {
    ko(`la cartella sorgente "${srcRoot}" non esiste: niente da copiare`)
    return { copiate: 0, saltate: 0, errori: [] }
  }

  const figlie = (
    await graphTutti(env, `/drives/${srcDrive}/items/${src.id}/children?$select=id,name,folder&$top=200`)
  ).filter((c) => c.folder)
  ok(`${figlie.length} cartelle personali trovate`)

  let dst = await cartellaPerPercorso(env, dstDrive, dstRoot)
  if (!dst) {
    if (!APPLY) {
      nota(`la cartella di destinazione "${dstRoot}" va creata`)
      return { copiate: figlie.length, saltate: 0, errori: [], soloStima: true }
    }
    dst = await creaPercorso(env, dstDrive, dstRoot)
    ok(`creata la cartella di destinazione "${dstRoot}"`)
  }

  const giaLa = new Set(
    (await graphTutti(env, `/drives/${dstDrive}/items/${dst.id}/children?$select=id,name&$top=200`)).map((c) => c.name),
  )
  if (giaLa.size) nota(`${giaLa.size} cartelle già presenti in destinazione, verranno saltate`)

  let copiate = 0
  let saltate = 0
  const errori = []

  for (const [i, f] of figlie.entries()) {
    if (giaLa.has(f.name)) {
      saltate++
      continue
    }
    if (!APPLY) {
      copiate++
      continue
    }
    try {
      const esito = await copiaCartella(env, srcDrive, f.id, dstDrive, dst.id, f.name)
      if (esito.stato === 'completed' || esito.stato === 'accettata-senza-monitor') copiate++
      else errori.push({ nome: f.name, errore: esito.stato })
      if ((copiate + errori.length) % 10 === 0) {
        nota(`… ${copiate} copiate (${i + 1}/${figlie.length})`)
      }
    } catch (e) {
      errori.push({ nome: f.name, errore: e.message })
    }
  }

  ok(`da copiare/copiate: ${copiate}   già presenti: ${saltate}   errori: ${errori.length}`)
  for (const e of errori.slice(0, 10)) ko(`"${e.nome}": ${String(e.errore).slice(0, 160)}`)
  if (errori.length > 10) nota(`… e altri ${errori.length - 10} errori`)

  return { copiate, saltate, errori }
}

// ===========================================================================
// CartellaUrl sui nuovi item
// ===========================================================================

async function ricalcolaCartellaUrl(env, cfg) {
  titolo('Campo CartellaUrl sui nuovi item')
  const aLista = cfg.B.SP_LIST_DIPENDENTI
  const dstDrive = cfg.B.SP_RU_DRIVE_ID || (await driveDi(env, cfg.B.SP_SITE_RU))
  const dstRoot = cfg.B.SP_RU_FOLDER || 'Risorse Umane App/Dipendenti'

  const dst = await cartellaPerPercorso(env, dstDrive, dstRoot)
  if (!dst) {
    ko('cartella di destinazione assente: eseguire prima la copia delle cartelle')
    return { aggiornati: 0 }
  }
  const perNome = new Map(
    (await graphTutti(env, `/drives/${dstDrive}/items/${dst.id}/children?$select=id,name,webUrl&$top=200`)).map((c) => [
      c.name,
      c,
    ]),
  )

  const items = await graphTutti(env, `/sites/${cfg.B.SP_SITE_RU}/lists/${aLista}/items?$expand=fields&$top=200`)
  let aggiornati = 0
  let senzaCartella = 0

  for (const it of items) {
    const f = it.fields ?? {}
    // Stessa regola di nomeCartella() in lib/risorse-umane.ts
    const base = `${f.Cognome ?? ''} ${f.Nome ?? ''}`.trim()
    const rif = f.Matricola || (f.IdAccess != null ? String(f.IdAccess) : '')
    const atteso = (rif ? `${base} - ${rif}` : base)
      .replace(/[\\/:*?"<>|#%]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)

    const cartella = perNome.get(atteso)
    if (!cartella) {
      senzaCartella++
      continue
    }
    if (f.CartellaUrl === cartella.webUrl) continue
    if (!APPLY) {
      aggiornati++
      continue
    }
    try {
      await graph(env, 'PATCH', `/sites/${cfg.B.SP_SITE_RU}/lists/${aLista}/items/${it.id}/fields`, {
        CartellaUrl: cartella.webUrl,
      })
      aggiornati++
    } catch (e) {
      ko(`item ${it.id}: ${e.message.slice(0, 160)}`)
    }
  }

  ok(`CartellaUrl da aggiornare/aggiornati: ${aggiornati}`)
  if (senzaCartella) nota(`${senzaCartella} dipendenti senza cartella personale (normale: si crea al primo accesso)`)
  return { aggiornati, senzaCartella }
}

// ===========================================================================

async function main() {
  const env = leggiEnvGenerale()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID']) {
    if (!env[k]) throw new Error(`Variabile mancante in .env.local: ${k}`)
  }

  const assetti = leggiAssetti()
  const cfg = {
    A: { ...assetti.A, SHAREPOINT_SITE_ID: env.SHAREPOINT_SITE_ID },
    B: assetti.B,
  }
  if (!cfg.B.SP_SITE_RU) throw new Error('SP_SITE_RU non trovata nel blocco [B] di .env.local')
  if (!cfg.A.SP_LIST_DIPENDENTI) throw new Error('SP_LIST_DIPENDENTI non trovata nel blocco [A] di .env.local')
  // Il sito sorgente delle cartelle è quello principale; il prefisso vecchio è
  // il default storico del codice, non una env di [A].
  cfg.A.SP_RU_FOLDER = cfg.A.SP_RU_FOLDER || 'Risorse Umane/Dipendenti'

  console.log('\n' + '='.repeat(74))
  console.log(
    APPLY
      ? '\x1b[1mMIGRAZIONE RU — ESECUZIONE REALE\x1b[0m'
      : '\x1b[1mMIGRAZIONE RU — DRY-RUN (nessuna scrittura)\x1b[0m',
  )
  console.log('='.repeat(74))
  if (!APPLY) nota('Per eseguire davvero: aggiungi --apply')

  const entita = ENTITA_ARG ? [ENTITA_ARG] : ['dipendenti', 'tirocini']
  const riepilogo = {}

  if (DUPLICATI) {
    for (const e of entita) {
      await elencaDuplicati(env, cfg, e)
    }
    return
  }

  if (SOLO === 'tutto' || SOLO === 'item') {
    for (const e of entita) {
      riepilogo[e] = await migraItem(env, cfg, e)
    }
  }

  if (SOLO === 'tutto' || SOLO === 'cartelle') {
    riepilogo.cartelle = await migraCartelle(env, cfg)
    if (APPLY || SOLO === 'cartelle') {
      riepilogo.cartellaUrl = await ricalcolaCartellaUrl(env, cfg)
    }
  }

  // --- riepilogo finale ----------------------------------------------------
  titolo('Riepilogo')
  for (const e of entita) {
    const r = riepilogo[e]
    if (!r) continue
    console.log(
      `  ${e.padEnd(14)} sorgente ${String(r.sorgenti.length).padStart(4)}   creati ${String(r.creati).padStart(4)}` +
        `   già in dest. ${String(r.giaInDestinazione).padStart(4)}   duplicati NON copiati ${String(r.chiaviDuplicate).padStart(4)}   errori ${r.errori.length}`,
    )
    const trattati = r.creati + r.giaInDestinazione + r.chiaviDuplicate
    if (r.sorgenti.length !== trattati) {
      ko(`${e}: i conti non tornano — ${r.sorgenti.length} in sorgente, ${trattati} trattati`)
    }
    if (r.chiaviDuplicate) {
      ko(`${e}: in destinazione ci sono ${r.creati + r.giaInDestinazione} record su ${r.sorgenti.length}. Chiarire i duplicati prima del cutover.`)
    }
  }
  if (riepilogo.cartelle) {
    const c = riepilogo.cartelle
    console.log(`  cartelle       copiate ${String(c.copiate).padStart(4)}   già presenti ${String(c.saltate).padStart(4)}   errori ${c.errori.length}`)
  }

  // Mappa vecchio→nuovo id, utile per capire cosa è diventato cosa.
  if (APPLY) {
    const mappaFile = join(__dirname, 'ru-data', `mappa-migrazione-${new Date().toISOString().slice(0, 10)}.json`)
    const contenuto = {}
    for (const e of entita) {
      if (riepilogo[e]) contenuto[e] = Object.fromEntries(riepilogo[e].mappa)
    }
    try {
      writeFileSync(mappaFile, JSON.stringify(contenuto, null, 2))
      nota(`mappa vecchio→nuovo spItemId salvata in scripts/ru-data/${mappaFile.split('/').pop()}`)
    } catch (e) {
      nota(`mappa non salvata (${e.message}) — non è bloccante`)
    }
  }

  titolo('Dopo la migrazione')
  if (!APPLY) {
    nota('1. controlla che i conteggi sopra siano quelli attesi')
    nota('2. rilancia con --apply')
  } else {
    nota('1. verifica: node scripts/ru-chi-ha-scritto.mjs')
    nota('2. cutover env locale: node scripts/ru-assetto.mjs --nuovo  (già su B se hai provato)')
    nota('3. env su Vercel + TOKEN_ENC_KEY diversa da quella locale')
    nota('4. avvisa le 13 persone: devono uscire e rientrare nell’app')
    nota('5. collaudo con la checklist del punto 10 del piano')
    nota('6. solo dopo: rinomina le liste sorgente ZZ_*_dismessa')
  }
  console.log('')
}

main().catch((err) => {
  console.error(`\n\x1b[31m✗ ERRORE:\x1b[0m ${err.message}\n`)
  process.exit(1)
})
