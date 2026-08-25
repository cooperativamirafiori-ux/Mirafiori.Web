#!/usr/bin/env node
/**
 * Fase 0 dell'area IT e Dispositivi (docs/it-dispositivi-piano.md).
 *
 * Legge le quattro liste fatte a mano sul sito `gruppo_it`, normalizza quello che
 * si può normalizzare da solo, segnala il resto, e scrive un xlsx di bonifica.
 *
 * Quel foglio **è l'input della migrazione**: si corregge lì, non sulle liste
 * originali, che restano intatte come archivio e continuano a essere usate
 * dall'IT finché non si passa all'app.
 *
 * Cosa fa il foglio:
 *   - un foglio per lista, con le colonne come arriveranno nell'Inventario;
 *   - le celle da compilare a mano sono colorate, con menu a tendina dove serve
 *     (centri di costo letti dalla lista vera, stati, tipi);
 *   - una colonna PROBLEMI per riga e un foglio "Anomalie" con l'elenco completo;
 *   - la colonna "Modificato il" serve alla migrazione per accorgersi se qualcuno
 *     ha toccato la riga su SharePoint dopo l'estrazione.
 *
 * Uso (dalla cartella web/):
 *   node scripts/it-anomalie.mjs
 *   node scripts/it-anomalie.mjs --sito=gruppo_it --out=../it-bonifica.xlsx
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * e per il menu dei centri di costo SHAREPOINT_SITE_ID + SP_LIST_CENTRI_COSTO.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ============================================================
// Infrastruttura: env, token, Graph
// ============================================================

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
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

let TOKEN = null
async function g(path) {
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`GET ${path.slice(0, 120)} → ${res.status}: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : {}
}

/** Tutti gli item di una lista, seguendo la paginazione. */
async function items(siteId, listId) {
  const out = []
  let url = `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`
  while (url) {
    const p = await g(url)
    out.push(...(p.value || []))
    url = p['@odata.nextLink'] || null
  }
  return out
}

// ============================================================
// Normalizzazioni
// ============================================================

const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
/** Data solo-giorno: le liste IT salvano a 07:00/08:00Z, il giorno è quello dell'ISO. */
const giorno = (v) => {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
}
const chiave = (s) => txt(s).toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Da Categoria + Sottotipo della lista IT al TipoIT dell'inventario.
 * Il NAS e i Watchguard non sono periferiche: vanno in Rete.
 */
function tipoIT(categoria, sottotipo) {
  const c = txt(categoria)
  const s = chiave(sottotipo)
  if (c === 'PC') return 'PC'
  if (c === 'Smartphone') return 'Smartphone'
  if (c === 'Tablet') return 'Tablet'
  if (c === 'Stampante') return 'Stampante'
  if (s === 'nas' || s.includes('firewall') || s.includes('watchguard') || s.includes('router') || s.includes('switch')) return 'Rete'
  if (s.includes('stampante') || s.includes('fax')) return 'Stampante'
  if (c === 'Periferiche') return 'Periferiche'
  return ''
}

/**
 * Per ogni gruppo di varianti dello stesso testo ("CISA12" / "Cisa 12") sceglie
 * la forma più frequente e la propone come canonica.
 */
function canonizza(valori) {
  const gruppi = new Map()
  for (const v of valori) {
    const k = chiave(v)
    if (!k) continue
    if (!gruppi.has(k)) gruppi.set(k, new Map())
    const m = gruppi.get(k)
    m.set(txt(v), (m.get(txt(v)) ?? 0) + 1)
  }
  const canonico = new Map()
  for (const [k, m] of gruppi) {
    const migliore = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    canonico.set(k, { valore: migliore, varianti: [...m.keys()] })
  }
  return canonico
}

// ============================================================
// Foglio Excel
// ============================================================

const GRIGIO = 'FFF3F4F6'   // colonne di sola lettura
const GIALLO = 'FFFFF9C4'   // da compilare o confermare a mano
const ROSSO = 'FFFFE4E6'    // riga con problemi

function intestazioni(ws, colonne) {
  ws.columns = colonne.map((c) => ({ key: c.k, width: c.w ?? 18 }))
  const r = ws.addRow(Object.fromEntries(colonne.map((c) => [c.k, c.h])))
  r.font = { bold: true, size: 10 }
  r.alignment = { vertical: 'middle', wrapText: true }
  r.height = 30
  colonne.forEach((c, i) => {
    r.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.edit ? GIALLO : GRIGIO } }
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colonne.length } }
}

function scriviRighe(ws, colonne, righe) {
  for (const dati of righe) {
    const r = ws.addRow(dati)
    colonne.forEach((c, i) => {
      const cell = r.getCell(i + 1)
      cell.font = { size: 10 }
      if (c.edit) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GIALLO } }
      if (c.fmt) cell.numFmt = c.fmt
      if (c.lista) {
        cell.dataValidation = { type: 'list', allowBlank: true, formulae: [c.lista] }
      }
    })
    if (txt(dati.PROBLEMI)) {
      r.getCell(colonne.length).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSSO } }
    }
  }
}

// ============================================================
// Programma
// ============================================================

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const sitoArg = process.argv.find((a) => a.startsWith('--sito='))?.slice(7) || 'gruppo_it'
  const out = resolve(
    process.argv.find((a) => a.startsWith('--out='))?.slice(6)
    || join(process.cwd(), '..', `it-bonifica-${new Date().toISOString().slice(0, 10)}.xlsx`),
  )

  TOKEN = await getToken()
  const host = (process.env.SHAREPOINT_SITE_URL || '').replace(/^https?:\/\//, '').split('/')[0]
    || 'coopmirafiorionlus.sharepoint.com'
  const sito = await g(`/sites/${host}:/sites/${sitoArg}?$select=id,displayName,webUrl`)
  console.log(`Sito: ${sito.displayName} — ${sito.webUrl}`)

  // --- liste ---------------------------------------------------
  const tutte = (await g(`/sites/${sito.id}/lists?$select=id,displayName,list&$top=200`)).value || []
  const trova = (nome) => {
    const l = tutte.find((x) => x.displayName === nome)
    if (!l) throw new Error(`Lista non trovata su ${sitoArg}: "${nome}"`)
    return l.id
  }
  const idDisp = trova('Lista DISPOSITIVI')
  const idAsgDisp = trova('Assegnazioni_DISPOSITIVI')
  const idSim = trova('Lista SIM')
  const idAsgSim = trova('Assegnazioni_SIM')

  const [dispositivi, asgDisp, sim, asgSim] = await Promise.all(
    [idDisp, idAsgDisp, idSim, idAsgSim].map((id) => items(sito.id, id)),
  )
  console.log(`  ${dispositivi.length} dispositivi · ${asgDisp.length} assegnazioni · ${sim.length} SIM · ${asgSim.length} assegnazioni SIM`)

  // --- utenti: LookupId → mail ---------------------------------
  const uil = tutte.find((l) => l.list?.template === 'userInformationList')
    || tutte.find((l) => /informazioni utente|user information/i.test(l.displayName))
  const utenti = new Map()
  if (uil) {
    for (const u of await items(sito.id, uil.id)) {
      const f = u.fields || {}
      utenti.set(String(u.id), {
        mail: txt(f.EMail || f.UserName || ''),
        nome: txt(f.Title || ''),
      })
    }
    console.log(`  ${utenti.size} utenti nell'elenco informazioni utente`)
  } else {
    console.log('  ⚠ elenco informazioni utente non trovato: le mail andranno scritte a mano')
  }
  const utente = (id) => utenti.get(String(id ?? '')) ?? { mail: '', nome: '' }

  // --- centri di costo per il menu a tendina --------------------
  let centri = []
  if (process.env.SHAREPOINT_SITE_ID && process.env.SP_LIST_CENTRI_COSTO) {
    try {
      const cc = await items(process.env.SHAREPOINT_SITE_ID, process.env.SP_LIST_CENTRI_COSTO)
      centri = cc
        .filter((i) => i.fields?.Attivo !== false)
        .map((i) => ({ nome: txt(i.fields?.Title), ordine: Number(i.fields?.Ordine ?? 999) }))
        .filter((c) => c.nome)
        .sort((a, b) => a.ordine - b.ordine)
        .map((c) => c.nome)
      console.log(`  ${centri.length} centri di costo per il menu a tendina`)
    } catch (e) {
      console.log(`  ⚠ centri di costo non letti (${e.message}): niente menu a tendina`)
    }
  }

  // --- canonizzazioni ------------------------------------------
  const servizi = canonizza(asgDisp.concat(asgSim).map((a) => a.fields?.Servizio))
  const sottotipi = canonizza(dispositivi.map((d) => d.fields?.Sottotipo))

  const anomalie = []
  const segna = (lista, riga, campo, problema, proposta = '') =>
    anomalie.push({ lista, riga, campo, problema, proposta })

  // --- dispositivi ---------------------------------------------
  const attivePerBene = new Map()
  for (const a of asgDisp) {
    if (txt(a.fields?.Stato) !== 'Attiva') continue
    const k = String(a.fields?.DispositivoLookupId ?? '')
    attivePerBene.set(k, (attivePerBene.get(k) ?? 0) + 1)
  }

  const righeDisp = dispositivi.map((d) => {
    const f = d.fields || {}
    const idIT = `DISP-${d.id}`
    const problemi = []   // incoerenze: qualcuno deve decidere
    const mancanti = []   // dati assenti: qualcuno deve procurarli

    const sottoRaw = txt(f.Sottotipo)
    const sotto = sottotipi.get(chiave(sottoRaw))?.valore ?? sottoRaw
    if (sotto !== String(f.Sottotipo ?? '')) segna(idIT, idIT, 'Sottotipo', `"${f.Sottotipo}" normalizzato`, sotto)

    const tipo = tipoIT(f.Categoria, sotto)
    if (!tipo) { problemi.push('TipoIT da scegliere'); segna(idIT, idIT, 'TipoIT', `categoria "${f.Categoria}" / sottotipo "${sotto}" non riconducibili`, '') }

    if (!txt(f.SerialNumber)) { mancanti.push('serial number'); segna(idIT, idIT, 'SerialNumber', 'mancante') }
    if (!f.Dataacquisto && txt(f.Acquisizione) === 'Acquisto') { mancanti.push('data acquisto'); segna(idIT, idIT, 'DataAcquisto', 'mancante su un bene acquistato') }
    if (f.Costoacquisto == null && txt(f.Acquisizione) === 'Acquisto') { mancanti.push('valore'); segna(idIT, idIT, 'Valore', 'costo di acquisto mancante') }
    if (txt(f.Acquisizione) === 'Noleggio' && f.Canonenoleggiomensile == null) { mancanti.push('canone di noleggio'); segna(idIT, idIT, 'CanoneMensile', 'mancante su un bene a noleggio') }

    const nAttive = attivePerBene.get(String(d.id)) ?? 0
    if (nAttive > 1) { problemi.push(`${nAttive} assegnazioni attive`); segna(idIT, idIT, 'Assegnazioni', `${nAttive} assegnazioni attive: una sola può restare`) }
    if (txt(f.Stato) === 'In uso' && nAttive === 0) { problemi.push('"In uso" senza assegnazione attiva'); segna(idIT, idIT, 'Stato', '"In uso" ma nessuna assegnazione attiva') }
    if (['In magazzino', 'Dismesso', 'Smarrito'].includes(txt(f.Stato)) && nAttive > 0) { problemi.push(`"${txt(f.Stato)}" con assegnazione attiva`); segna(idIT, idIT, 'Stato', `"${txt(f.Stato)}" ma ha un'assegnazione attiva`) }

    // Firewall: oggi l'informazione sta nelle note delle assegnazioni.
    const noteAsg = asgDisp
      .filter((a) => String(a.fields?.DispositivoLookupId) === String(d.id))
      .map((a) => txt(a.fields?.Note)).join(' ')
    const senzaFirewall = /no\s*watchguard|senza\s*(firewall|watchguard)/i.test(noteAsg)
    const firewall = tipo === 'PC' ? (senzaFirewall ? 'NO' : 'SI') : ''
    if (tipo === 'PC' && senzaFirewall) segna(idIT, idIT, 'FirewallInstallato', `dalle note: "${noteAsg.trim()}"`, 'NO')
    else if (tipo === 'PC') segna(idIT, idIT, 'FirewallInstallato', 'assunto installato: da confermare', 'SI')

    return {
      IdIT: idIT,
      TipoIT: tipo,
      SottoTipo: sotto,
      Marca: txt(f.Marca),
      Modello: txt(f.Modello),
      SerialNumber: txt(f.SerialNumber),
      Descrizione: [txt(f.Marca), txt(f.Modello)].filter(Boolean).join(' '),
      FirewallInstallato: firewall,
      Acquisizione: txt(f.Acquisizione),
      Fornitore: txt(f.Fornitore),
      DataAcquisto: giorno(f.Dataacquisto),
      Valore: f.Costoacquisto ?? null,
      CanoneMensile: f.Canonenoleggiomensile ?? null,
      FineNoleggio: null,
      MesiGaranzia: null,
      FatturaRif: txt(f.Fatturarif_x002e_),
      GaranzieAccessorie: txt(f.Garanzieaccessorie),
      Stato: txt(f.Stato),
      DataDismissione: giorno(f.Datacessazione),
      Note: txt(f.Note),
      Modificato: giorno(f.Modified),
      PROBLEMI: problemi.join(' · '),
      DACOMPLETARE: mancanti.join(', '),
    }
  })

  // --- assegnazioni dispositivi --------------------------------
  const perId = new Map(dispositivi.map((d) => [String(d.id), d.fields || {}]))
  const righeAsg = asgDisp.map((a) => {
    const f = a.fields || {}
    const idIT = `ASG-${a.id}`
    const bene = `DISP-${f.DispositivoLookupId ?? ''}`
    const b = perId.get(String(f.DispositivoLookupId)) ?? {}
    const problemi = []
    const mancanti = []

    const u = utente(f.UtenteLookupId)
    if (!f.UtenteLookupId) { problemi.push('nessun assegnatario'); segna(idIT, idIT, 'AssegnatarioMail', 'assegnazione senza utente') }
    else if (!u.mail) { problemi.push('mail non risolta'); segna(idIT, idIT, 'AssegnatarioMail', `utente ${f.UtenteLookupId} senza email in SharePoint`, u.nome) }

    if (!perId.has(String(f.DispositivoLookupId))) { problemi.push('bene inesistente'); segna(idIT, idIT, 'Bene', `lookup ${f.DispositivoLookupId} non trovato`) }

    const nomeRaw = String(f.Nomeutenza ?? '')
    let nome = txt(nomeRaw)
    if (nome === '?' || nome === '-') { nome = ''; segna(idIT, idIT, 'NomeUtenza', `"${nomeRaw}" svuotato`) }
    else if (nome !== nomeRaw) segna(idIT, idIT, 'NomeUtenza', `"${nomeRaw}" ripulito`, nome)

    const servRaw = txt(f.Servizio)
    const serv = servizi.get(chiave(servRaw))?.valore ?? servRaw
    if (serv !== servRaw) segna(idIT, idIT, 'ServizioLegacy', `"${servRaw}" normalizzato`, serv)
    if (!serv) mancanti.push('servizio')
    if (!nome) mancanti.push('nome utenza')

    if (!f.Dataassegnazione) { problemi.push('senza data assegnazione'); segna(idIT, idIT, 'DataAssegnazione', 'mancante') }
    if (txt(f.Stato) === 'Chiusa' && !f.Datarestituzione) { problemi.push('chiusa senza data restituzione'); segna(idIT, idIT, 'DataRestituzione', 'assegnazione chiusa senza data') }
    if (txt(f.Stato) === 'Attiva' && f.Datarestituzione) { problemi.push('attiva con data restituzione'); segna(idIT, idIT, 'Stato', 'attiva ma con data di restituzione') }

    return {
      IdIT: idIT,
      Bene: bene,
      Dispositivo: [txt(b.Marca), txt(b.Modello)].filter(Boolean).join(' '),
      AssegnatarioMail: u.mail,
      AssegnatarioNome: u.nome,
      CentroDiCosto: '',
      ServizioLegacy: serv,
      NomeUtenza: nome,
      DataAssegnazione: giorno(f.Dataassegnazione),
      DataRestituzione: giorno(f.Datarestituzione),
      Stato: txt(f.Stato),
      Note: txt(f.Note),
      Modificato: giorno(f.Modified),
      PROBLEMI: problemi.join(' · '),
      DACOMPLETARE: mancanti.join(', '),
    }
  })

  // --- SIM ------------------------------------------------------
  const simAssegnate = new Set(asgSim.map((a) => String(a.fields?.NumeroLookupId ?? '')))
  const righeSim = sim.map((s) => {
    const f = s.fields || {}
    const idIT = `SIM-${s.id}`
    const problemi = []
    const mancanti = []
    for (const [campo, val] of [['Operatore', f.Operatore], ['TipoPiano', f.TipoPiano], ['NomePiano', f.NomePiano], ['CostoMensile', f.Costomensile]]) {
      if (val == null || val === '') { mancanti.push(campo); segna(idIT, idIT, campo, 'mancante') }
    }
    if (!simAssegnate.has(String(s.id))) { mancanti.push('assegnazione'); segna(idIT, idIT, 'Assegnazione', 'SIM in anagrafica senza nessuna assegnazione') }
    if (!txt(f.Title)) { problemi.push('senza ICCID'); segna(idIT, idIT, 'ICCID', 'mancante') }
    return {
      IdIT: idIT,
      ICCID: txt(f.Title),
      Numero: txt(f.Numero),
      Operatore: txt(f.Operatore),
      TipoPiano: txt(f.TipoPiano),
      NomePiano: txt(f.NomePiano),
      FornitoreIntermediario: txt(f.Fornitore_x002f_Intermediario),
      DataAttivazione: giorno(f.Dataattivazione),
      DataCessazione: giorno(f.Datacessazione),
      RiferimentoContratto: txt(f.RiferimentoContratto),
      Stato: txt(f.Stato),
      CostoMensile: f.Costomensile ?? null,
      BeneAssociato: '',
      Note: txt(f.Note),
      Modificato: giorno(f.Modified),
      PROBLEMI: problemi.join(' · '),
      DACOMPLETARE: mancanti.join(', '),
    }
  })

  const perIdSim = new Map(sim.map((s) => [String(s.id), s.fields || {}]))
  const righeAsgSim = asgSim.map((a) => {
    const f = a.fields || {}
    const idIT = `ASGSIM-${a.id}`
    const s = perIdSim.get(String(f.NumeroLookupId)) ?? {}
    const problemi = []
    const mancanti = []
    const u = utente(f.UtenteLookupId)
    if (!u.mail) { problemi.push('mail non risolta'); segna(idIT, idIT, 'AssegnatarioMail', `utente ${f.UtenteLookupId} senza email`, u.nome) }
    const servRaw = txt(f.Servizio)
    const serv = servizi.get(chiave(servRaw))?.valore ?? servRaw
    if (serv !== servRaw) segna(idIT, idIT, 'ServizioLegacy', `"${servRaw}" normalizzato`, serv)
    return {
      IdIT: idIT,
      Sim: `SIM-${f.NumeroLookupId ?? ''}`,
      Numero: txt(s.Numero),
      AssegnatarioMail: u.mail,
      AssegnatarioNome: u.nome,
      CentroDiCosto: '',
      ServizioLegacy: serv,
      DataAssegnazione: giorno(f.Dataassegnazione),
      DataCessazione: giorno(f.Datacessazione),
      Stato: txt(f.Stato),
      Note: txt(f.Note),
      Modificato: giorno(f.Modified),
      PROBLEMI: problemi.join(' · '),
      DACOMPLETARE: mancanti.join(', '),
    }
  })

  // ============================================================
  // Scrittura del foglio
  // ============================================================

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mirafiori Web — it-anomalie.mjs'
  wb.created = new Date()

  // Foglio nascosto con gli elenchi per i menu a tendina.
  const liste = wb.addWorksheet('Liste', { state: 'veryHidden' })
  const elenchi = {
    tipoIT: ['PC', 'Smartphone', 'Tablet', 'Stampante', 'Periferiche', 'Rete', 'Altro'],
    acquisizione: ['Acquisto', 'Noleggio', 'Donazione'],
    statoBene: ['In uso', 'In riparazione', 'In magazzino', 'Dismesso', 'Alienato', 'Smarrito', 'Annullato'],
    statoAsg: ['Attiva', 'Chiusa'],
    statoSim: ['Attiva', 'Cessata', 'In attesa', 'Bloccata'],
    siNo: ['SI', 'NO'],
    centri,
  }
  const rif = {}
  let col = 1
  for (const [nome, valori] of Object.entries(elenchi)) {
    if (!valori.length) continue
    const L = liste.getColumn(col)
    valori.forEach((v, i) => { liste.getCell(i + 1, col).value = v })
    rif[nome] = `Liste!$${L.letter}$1:$${L.letter}$${valori.length}`
    col++
  }

  // Istruzioni
  const nNoleggio = righeDisp.filter((r) => r.Acquisizione === 'Noleggio').length
  const nCanone = righeDisp.filter((r) => r.Acquisizione === 'Noleggio' && r.CanoneMensile != null).length
  const ist = wb.addWorksheet('Istruzioni')
  ist.getColumn(1).width = 110
  const testo = [
    ['BONIFICA DATI IT — DISPOSITIVI E SIM', true],
    ['', false],
    [`Estratto il ${new Date().toLocaleString('it-IT')} da ${sito.webUrl}`, false],
    ['', false],
    ['Questo foglio è l\'input della migrazione verso l\'Inventario dell\'app. Le liste su gruppo_it', false],
    ['non vengono toccate: restano come archivio.', false],
    ['', false],
    ['Come si usa', true],
    ['1. Le celle GIALLE sono da compilare o confermare a mano. Le GRIGIE arrivano da SharePoint.', false],
    ['2. Due colonne diverse, in fondo a ogni foglio:', false],
    ['   · PROBLEMI = qualcosa non torna e va deciso (riga colorata di rosso);', false],
    ['   · Da completare = un dato manca e va procurato, ma nulla è in contraddizione.', false],
    ['   Il foglio "Anomalie" le elenca tutte, una per riga.', false],
    ['3. Non aggiungere, spostare o rinominare colonne, e non cambiare la colonna IdIT:', false],
    ['   è la chiave con cui la migrazione ritrova la riga.', false],
    ['4. Per cancellare una riga dalla migrazione, scrivi ESCLUDI nella colonna PROBLEMI.', false],
    ['5. CentroDiCosto e FirewallInstallato hanno il menu a tendina: usa quei valori.', false],
    ['', false],
    ['Tre cose da sapere', true],
    ['· FirewallInstallato è stato assunto SI su tutti i PC, tranne dove le note dicevano NO WATCHGUARD.', false],
    ['  Va confermato PC per PC: è l\'unica colonna inventata da zero.', false],
    ['· Il CentroDiCosto è vuoto per tutti: va scelto riga per riga. Il vecchio Servizio resta accanto,', false],
    ['  in ServizioLegacy, e non viene cancellato.', false],
    [`· ${nNoleggio} dispositivi su ${righeDisp.length} risultano a noleggio ma solo ${nCanone} hanno il canone.`, false],
    ['  O il canone va aggiunto, o "Acquisizione" è impostata a Noleggio per difetto: da chiarire prima', false],
    ['  di migrare, perché è il dato con cui domani si calcolerà il costo per centro di costo.', false],
  ]
  for (const [t, grassetto] of testo) {
    const r = ist.addRow([t])
    r.getCell(1).font = { bold: grassetto, size: grassetto ? 12 : 10 }
  }

  const D = 'dd/mm/yyyy'
  const E = '#,##0.00'

  const colDisp = [
    { k: 'IdIT', h: 'ID IT', w: 10 },
    { k: 'TipoIT', h: 'Tipo IT', w: 13, edit: true, lista: rif.tipoIT },
    { k: 'SottoTipo', h: 'Sottotipo', w: 14, edit: true },
    { k: 'Marca', h: 'Marca', w: 12 },
    { k: 'Modello', h: 'Modello', w: 22 },
    { k: 'SerialNumber', h: 'Serial number', w: 18 },
    { k: 'Descrizione', h: 'Descrizione', w: 26, edit: true },
    { k: 'FirewallInstallato', h: 'Firewall installato', w: 12, edit: true, lista: rif.siNo },
    { k: 'Acquisizione', h: 'Acquisizione', w: 13, edit: true, lista: rif.acquisizione },
    { k: 'Fornitore', h: 'Fornitore', w: 18 },
    { k: 'DataAcquisto', h: 'Data acquisto', w: 13, edit: true, fmt: D },
    { k: 'Valore', h: 'Valore', w: 11, edit: true, fmt: E },
    { k: 'CanoneMensile', h: 'Canone mensile', w: 13, edit: true, fmt: E },
    { k: 'FineNoleggio', h: 'Fine noleggio', w: 13, edit: true, fmt: D },
    { k: 'MesiGaranzia', h: 'Mesi garanzia', w: 11, edit: true },
    { k: 'FatturaRif', h: 'Fattura rif.', w: 28 },
    { k: 'GaranzieAccessorie', h: 'Garanzie accessorie', w: 28 },
    { k: 'Stato', h: 'Stato bene', w: 14, edit: true, lista: rif.statoBene },
    { k: 'DataDismissione', h: 'Data dismissione', w: 13, fmt: D },
    { k: 'Note', h: 'Note', w: 30 },
    { k: 'Modificato', h: 'Modificato il', w: 13, fmt: D },
    { k: 'DACOMPLETARE', h: 'Da completare', w: 26 },
    { k: 'PROBLEMI', h: 'PROBLEMI', w: 34 },
  ]
  const wsD = wb.addWorksheet('Dispositivi')
  intestazioni(wsD, colDisp); scriviRighe(wsD, colDisp, righeDisp)

  const colAsg = [
    { k: 'IdIT', h: 'ID IT', w: 10 },
    { k: 'Bene', h: 'Bene', w: 10 },
    { k: 'Dispositivo', h: 'Dispositivo', w: 24 },
    { k: 'AssegnatarioMail', h: 'Assegnatario (mail)', w: 30, edit: true },
    { k: 'AssegnatarioNome', h: 'Assegnatario (nome)', w: 24 },
    { k: 'CentroDiCosto', h: 'Centro di costo', w: 26, edit: true, lista: rif.centri },
    { k: 'ServizioLegacy', h: 'Servizio (vecchio)', w: 20 },
    { k: 'NomeUtenza', h: 'Nome utenza', w: 22, edit: true },
    { k: 'DataAssegnazione', h: 'Data assegnazione', w: 14, edit: true, fmt: D },
    { k: 'DataRestituzione', h: 'Data restituzione', w: 14, edit: true, fmt: D },
    { k: 'Stato', h: 'Stato', w: 10, edit: true, lista: rif.statoAsg },
    { k: 'Note', h: 'Note', w: 30 },
    { k: 'Modificato', h: 'Modificato il', w: 13, fmt: D },
    { k: 'DACOMPLETARE', h: 'Da completare', w: 26 },
    { k: 'PROBLEMI', h: 'PROBLEMI', w: 34 },
  ]
  const wsA = wb.addWorksheet('Assegnazioni')
  intestazioni(wsA, colAsg); scriviRighe(wsA, colAsg, righeAsg)

  const colSim = [
    { k: 'IdIT', h: 'ID IT', w: 10 },
    { k: 'ICCID', h: 'ICCID', w: 24 },
    { k: 'Numero', h: 'Numero', w: 16 },
    { k: 'Operatore', h: 'Operatore', w: 13, edit: true },
    { k: 'TipoPiano', h: 'Tipo piano', w: 14, edit: true },
    { k: 'NomePiano', h: 'Nome piano', w: 28, edit: true },
    { k: 'FornitoreIntermediario', h: 'Fornitore / intermediario', w: 22, edit: true },
    { k: 'DataAttivazione', h: 'Data attivazione', w: 14, edit: true, fmt: D },
    { k: 'DataCessazione', h: 'Data cessazione', w: 14, fmt: D },
    { k: 'RiferimentoContratto', h: 'Riferimento contratto', w: 22, edit: true },
    { k: 'Stato', h: 'Stato', w: 12, edit: true, lista: rif.statoSim },
    { k: 'CostoMensile', h: 'Costo mensile', w: 12, edit: true, fmt: E },
    { k: 'BeneAssociato', h: 'Bene associato (DISP-…)', w: 18, edit: true },
    { k: 'Note', h: 'Note', w: 26 },
    { k: 'Modificato', h: 'Modificato il', w: 13, fmt: D },
    { k: 'DACOMPLETARE', h: 'Da completare', w: 26 },
    { k: 'PROBLEMI', h: 'PROBLEMI', w: 34 },
  ]
  const wsS = wb.addWorksheet('SIM')
  intestazioni(wsS, colSim); scriviRighe(wsS, colSim, righeSim)

  const colAsgSim = [
    { k: 'IdIT', h: 'ID IT', w: 12 },
    { k: 'Sim', h: 'SIM', w: 10 },
    { k: 'Numero', h: 'Numero', w: 16 },
    { k: 'AssegnatarioMail', h: 'Assegnatario (mail)', w: 30, edit: true },
    { k: 'AssegnatarioNome', h: 'Assegnatario (nome)', w: 24 },
    { k: 'CentroDiCosto', h: 'Centro di costo', w: 26, edit: true, lista: rif.centri },
    { k: 'ServizioLegacy', h: 'Servizio (vecchio)', w: 20 },
    { k: 'DataAssegnazione', h: 'Data assegnazione', w: 14, edit: true, fmt: D },
    { k: 'DataCessazione', h: 'Data cessazione', w: 14, edit: true, fmt: D },
    { k: 'Stato', h: 'Stato', w: 10, edit: true, lista: rif.statoAsg },
    { k: 'Note', h: 'Note', w: 26 },
    { k: 'Modificato', h: 'Modificato il', w: 13, fmt: D },
    { k: 'DACOMPLETARE', h: 'Da completare', w: 26 },
    { k: 'PROBLEMI', h: 'PROBLEMI', w: 34 },
  ]
  const wsAS = wb.addWorksheet('Assegnazioni SIM')
  intestazioni(wsAS, colAsgSim); scriviRighe(wsAS, colAsgSim, righeAsgSim)

  const colAn = [
    { k: 'lista', h: 'Riga', w: 14 },
    { k: 'campo', h: 'Campo', w: 22 },
    { k: 'problema', h: 'Problema', w: 62 },
    { k: 'proposta', h: 'Proposta dello script', w: 30 },
  ]
  const wsAn = wb.addWorksheet('Anomalie')
  intestazioni(wsAn, colAn)
  scriviRighe(wsAn, colAn, anomalie.map((a) => ({ lista: a.riga, campo: a.campo, problema: a.problema, proposta: a.proposta })))

  await wb.xlsx.writeFile(out)

  // --- riepilogo a schermo -------------------------------------
  const conta = (righe, campo) => righe.filter((r) => txt(r[campo])).length
  const riga = (nome, righe) =>
    `${nome.padEnd(18)}${String(righe.length).padStart(3)} righe · ${String(conta(righe, 'PROBLEMI')).padStart(2)} con problemi · ${String(conta(righe, 'DACOMPLETARE')).padStart(2)} da completare`
  console.log('\n' + '='.repeat(72))
  console.log(riga('Dispositivi', righeDisp))
  console.log(riga('Assegnazioni', righeAsg))
  console.log(riga('SIM', righeSim))
  console.log(riga('Assegnazioni SIM', righeAsgSim))
  console.log(`\nAnomalie in elenco  ${anomalie.length}`)
  console.log(`Noleggi senza canone ${nNoleggio - nCanone} su ${nNoleggio}`)
  console.log('='.repeat(72))
  console.log(`\n✓ Scritto: ${out}\n`)
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
