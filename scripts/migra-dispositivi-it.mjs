#!/usr/bin/env node
/**
 * Migrazione delle liste IT di `gruppo_it` dentro l'app.
 *
 *   Lista DISPOSITIVI        → Inventario Beni      (con TipoIT e IdListaIT)
 *   Assegnazioni_DISPOSITIVI → Assegnazioni Beni
 *   Lista SIM                → SIM e Utenze
 *   Assegnazioni_SIM         → Assegnazioni SIM
 *
 * **Le liste di origine non vengono toccate**: restano l'archivio, e l'ufficio
 * IT può continuare a usarle finché non si passa all'app. Le incoerenze decise
 * con Dennis stanno in `it-correzioni.json` e vengono applicate qui.
 *
 * Prova a vuoto per default, scrive solo con `--applica`. Rieseguibile: la
 * chiave è `IdListaIT` (`DISP-43`, `ASG-62`, `SIM-2`, `ASGSIM-1`), quindi una
 * riga già migrata viene saltata e non duplicata.
 *
 * Uso (dalla cartella web/):
 *   node scripts/migra-dispositivi-it.mjs
 *   node scripts/migra-dispositivi-it.mjs --applica
 *   node scripts/migra-dispositivi-it.mjs --applica --solo=dispositivi
 *
 * Richiede: GRAPH_TENANT_ID/_CLIENT_ID/_CLIENT_SECRET, SHAREPOINT_SITE_ID,
 * SP_LIST_INVENTARIO, SP_LIST_ASSEGNAZIONI, SP_LIST_SIM, SP_LIST_ASSEGNAZIONI_SIM.
 * Lanciare prima `provision-inventario.mjs` e `provision-it.mjs`.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const APPLICA = process.argv.includes('--applica')
const SOLO = process.argv.find((a) => a.startsWith('--solo='))?.slice(7) ?? 'tutto'
const SITO_IT = process.argv.find((a) => a.startsWith('--sito='))?.slice(7) ?? 'gruppo_it'

const CORREZIONI = JSON.parse(readFileSync(join(__dirname, 'it-correzioni.json'), 'utf8'))
const DATA_IMPIANTO = CORREZIONI.regole?.dataImpianto ?? '2025-11-01'

// Devono coincidere con types/inventario.ts e types/it.ts: le colonne Choice di
// SharePoint rifiutano quello che non è in elenco, e lo fanno a metà scrittura.
const STATI_BENE = ['In uso', 'In riparazione', 'In magazzino', 'Dismesso', 'Alienato', 'Smarrito', 'Annullato']
const MODI_ACQUISIZIONE = ['Acquisto', 'Noleggio', 'Donazione']
const STATI_SIM = ['Attiva', 'Cessata', 'In attesa', 'Bloccata']
const TIPI_PIANO = ['Voce + Dati', 'Dati', 'Voce', 'Altro']

/** Controlla che un valore sia fra le scelte ammesse, o si ferma dicendo dove. */
function scelta(valore, ammessi, dove) {
  if (ammessi.includes(valore)) return valore
  throw new Error(
    `${dove}: "${valore}" non è fra le scelte della colonna (${ammessi.join(', ')}). ` +
      'Correggilo su gruppo_it, oppure aggiungi la scelta con provision-inventario.mjs / provision-it.mjs.',
  )
}

// ============================================================
// Infrastruttura
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

let TOKEN = null
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

async function graph(method, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path.slice(0, 90)} → ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : {}
}

/** Tutti gli elementi di un indirizzo Graph, seguendo la paginazione a 200. */
async function tutte(path) {
  const out = []
  let url = path
  while (url) {
    const p = await graph('GET', url)
    out.push(...(p.value || []))
    url = p['@odata.nextLink'] ? p['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

const items = (siteId, listId) =>
  tutte(`/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`)

// ============================================================
// Normalizzazioni (le stesse di it-anomalie.mjs)
// ============================================================

const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const chiave = (s) => txt(s).toLowerCase().replace(/[^a-z0-9]/g, '')
const giorno = (v) => {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
/** Data solo-giorno a mezzogiorno UTC, come fa lib/inventario/data.ts. */
const spData = (ymd) => (ymd ? `${ymd}T12:00:00Z` : undefined)

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
  return 'Altro'
}

function canonizza(valori) {
  const gruppi = new Map()
  for (const v of valori) {
    const k = chiave(v)
    if (!k) continue
    if (!gruppi.has(k)) gruppi.set(k, new Map())
    const m = gruppi.get(k)
    m.set(txt(v), (m.get(txt(v)) ?? 0) + 1)
  }
  const out = new Map()
  for (const [k, m] of gruppi) {
    out.set(k, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0])
  }
  return out
}

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/')
const sanitizeNome = (s, fallback = 'senza nome') => {
  const pulito = (s || fallback)
    .replace(/[\\/:*?"<>|#%~&{}]/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '')
  return (pulito || fallback).slice(0, 90)
}

// ============================================================
// Programma
// ============================================================

async function main() {
  loadEnvLocal()
  const richieste = [
    'GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID',
    'SP_LIST_INVENTARIO', 'SP_LIST_ASSEGNAZIONI', 'SP_LIST_SIM', 'SP_LIST_ASSEGNAZIONI_SIM',
  ]
  for (const k of richieste) if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)

  const site = process.env.SHAREPOINT_SITE_ID
  const L = {
    beni: process.env.SP_LIST_INVENTARIO,
    asgBeni: process.env.SP_LIST_ASSEGNAZIONI,
    sim: process.env.SP_LIST_SIM,
    asgSim: process.env.SP_LIST_ASSEGNAZIONI_SIM,
  }

  TOKEN = await getToken()
  console.log(APPLICA ? '── MIGRAZIONE (scrive)' : '── PROVA A VUOTO (non scrive niente)')

  // --- origine ---------------------------------------------------------
  const host = (process.env.SHAREPOINT_SITE_URL || '').replace(/^https?:\/\//, '').split('/')[0]
    || 'coopmirafiorionlus.sharepoint.com'
  const sitoIT = await graph('GET', `/sites/${host}:/sites/${SITO_IT}?$select=id,displayName,webUrl`)
  const listeIT = (await graph('GET', `/sites/${sitoIT.id}/lists?$select=id,displayName,list&$top=200`)).value || []
  const trovaIT = (nome) => {
    const l = listeIT.find((x) => x.displayName === nome)
    if (!l) throw new Error(`Lista non trovata su ${SITO_IT}: "${nome}"`)
    return l.id
  }

  const [dispositivi, asgDisp, simOrig, asgSimOrig] = await Promise.all([
    items(sitoIT.id, trovaIT('Lista DISPOSITIVI')),
    items(sitoIT.id, trovaIT('Assegnazioni_DISPOSITIVI')),
    items(sitoIT.id, trovaIT('Lista SIM')),
    items(sitoIT.id, trovaIT('Assegnazioni_SIM')),
  ])
  console.log(`Origine: ${dispositivi.length} dispositivi · ${asgDisp.length} assegnazioni · ${simOrig.length} SIM · ${asgSimOrig.length} assegnazioni SIM`)

  // --- chi è l'assegnatario ---------------------------------------------
  //
  // `Utente` è un campo persona. Con `$expand=fields` secco arriva solo
  // `UtenteLookupId`, e l'elenco informazioni utente del sito è nascosto —
  // `GET /sites/{id}/lists` non lo elenca e non è raggiungibile né per titolo né
  // per GUID (provato con `it-sonda-utenti.mjs`). Chiedendo invece il campo **per
  // nome** si ottiene il nome visualizzato: quello lo prendiamo qui.
  //
  // L'indirizzo email no: si ricava dalla rubrica di Entra accoppiando per nome,
  // e lo fa `it-assegnatari.mjs` — un lavoro solo, in un posto solo.
  const nomiUtente = new Map()
  for (const [listaNome, pre] of [['Assegnazioni_DISPOSITIVI', 'ASG'], ['Assegnazioni_SIM', 'ASGSIM']]) {
    const righe = await tutte(
      `/sites/${sitoIT.id}/lists/${trovaIT(listaNome)}/items?$expand=fields($select=Utente)&$top=200`,
    )
    for (const r of righe) {
      const nome = txt(r.fields?.Utente)
      if (nome) nomiUtente.set(`${pre}-${r.id}`, nome)
    }
  }
  console.log(`Assegnatari con un nome: ${nomiUtente.size}`)
  const utente = (idIT) => ({ mail: '', nome: nomiUtente.get(idIT) ?? '' })

  // --- destinazione: cosa è già dentro ----------------------------------
  const [beniEsistenti, asgEsistenti, simEsistenti, asgSimEsistenti] = await Promise.all([
    items(site, L.beni), items(site, L.asgBeni), items(site, L.sim), items(site, L.asgSim),
  ])
  const giaMigrato = (righe) =>
    new Map(righe.filter((r) => txt(r.fields?.IdListaIT)).map((r) => [txt(r.fields.IdListaIT), r]))

  const mappaBeni = giaMigrato(beniEsistenti)
  const mappaAsg = giaMigrato(asgEsistenti)
  const mappaSim = giaMigrato(simEsistenti)
  const mappaAsgSim = giaMigrato(asgSimEsistenti)

  let progressivo = beniEsistenti.reduce((max, r) => {
    const m = String(r.fields?.Title ?? '').match(/^INV-(\d+)$/i)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  console.log(`Destinazione: ${beniEsistenti.length} beni già in inventario (ultimo INV-${String(progressivo).padStart(4, '0')})`)

  // --- canonizzazioni ----------------------------------------------------
  const servizi = canonizza(asgDisp.concat(asgSimOrig).map((a) => a.fields?.Servizio))
  const sottotipi = canonizza(dispositivi.map((d) => d.fields?.Sottotipo))

  const drive = process.env.SP_INVENTARIO_DRIVE_ID
    || (await graph('GET', `/sites/${site}/drive?$select=id`)).id
  const radice = (() => {
    const v = txt(process.env.SP_INVENTARIO_FOLDER)
    return !v || v === '.' || v === '/' ? '' : v.replace(/^\/+|\/+$/g, '')
  })()

  const fatto = { beni: 0, asg: 0, sim: 0, asgSim: 0, saltati: 0 }
  const avvisi = []
  /** DISP-n → { itemId, numero } del bene nell'inventario. */
  const idBene = new Map()

  // ============================================================
  // 1. Dispositivi
  // ============================================================
  if (SOLO === 'tutto' || SOLO === 'dispositivi') {
    console.log('\n── Dispositivi')
    for (const d of dispositivi) {
      const f = d.fields || {}
      const idIT = `DISP-${d.id}`
      const esistente = mappaBeni.get(idIT)
      if (esistente) {
        idBene.set(idIT, { itemId: String(esistente.id), numero: txt(esistente.fields?.Title) })
        fatto.saltati++
        continue
      }

      const corr = CORREZIONI.dispositivi?.[idIT] ?? {}
      const sotto = sottotipi.get(chiave(f.Sottotipo)) ?? txt(f.Sottotipo)
      const tipo = tipoIT(f.Categoria, sotto)
      const marca = txt(f.Marca)
      const modello = txt(f.Modello)
      const descrizione = [marca, modello].filter(Boolean).join(' ') || sotto || tipo

      // Firewall: l'informazione sta nelle note delle assegnazioni ("NO
      // WATCHGUARD"). Si spunta su tutti i PC tranne quelli che dicono di no.
      const noteAsg = asgDisp
        .filter((a) => String(a.fields?.DispositivoLookupId) === String(d.id))
        .map((a) => txt(a.fields?.Note)).join(' ')
      const firewall = tipo === 'PC' ? !/no\s*watchguard|senza\s*(firewall|watchguard)/i.test(noteAsg) : undefined

      const note = corr.svuotaNote && txt(f.Note) === corr.svuotaNote ? '' : txt(f.Note)
      const numero = `INV-${String(++progressivo).padStart(4, '0')}`

      // Le colonne Choice rifiutano un valore che non è tra le scelte, e lo fanno
      // a metà migrazione: meglio accorgersene qui, prima di scrivere niente.
      const stato = scelta(corr.stato || txt(f.Stato) || 'In uso', STATI_BENE, `${idIT}.Stato`)
      const acquisizione = txt(f.Acquisizione)
        ? scelta(txt(f.Acquisizione), MODI_ACQUISIZIONE, `${idIT}.Acquisizione`)
        : undefined

      const campi = {
        Title: numero,
        Descrizione: descrizione,
        Categoria: 'Informatica',
        TipoIT: tipo,
        SottoTipo: sotto,
        Marca: marca,
        Modello: modello,
        MarcaModello: descrizione,
        NumeroSerie: txt(f.SerialNumber),
        StatoBene: stato,
        Acquisizione: acquisizione,
        Fornitore: txt(f.Fornitore),
        DataAcquisto: spData(giorno(f.Dataacquisto)),
        Valore: f.Costoacquisto ?? undefined,
        CanoneMensile: f.Canonenoleggiomensile ?? undefined,
        FatturaRif: txt(f.Fatturarif_x002e_),
        GaranzieAccessorie: txt(f.Garanzieaccessorie),
        DataDismissione: spData(giorno(f.Datacessazione)),
        Note: note,
        IdListaIT: idIT,
      }
      if (firewall !== undefined) campi.FirewallInstallato = firewall

      console.log(
        `  ${idIT} → ${numero}  ${tipo.padEnd(11)} ${descrizione.slice(0, 34).padEnd(34)} ` +
        `${stato}${corr.stato ? ' ←corretto' : ''}${firewall === false ? ' · SENZA FIREWALL' : ''}`,
      )

      if (APPLICA) {
        let cartellaUrl = ''
        const percorso = radice
          ? `${radice}/${sanitizeNome(`${numero} - ${descrizione}`, numero)}`
          : sanitizeNome(`${numero} - ${descrizione}`, numero)
        try {
          await assicuraCartella(drive, percorso)
        } catch (e) {
          avvisi.push(`${idIT}: cartella del bene non creata — ${primaRiga(e)}`)
        }
        // Il webUrl è un vezzo: se non si legge, il bene nasce comunque.
        cartellaUrl =
          (await graph('GET', `/drives/${drive}/root:/${encodePath(percorso)}?$select=webUrl`)
            .catch(() => null))?.webUrl ?? ''
        const creato = await graph('POST', `/sites/${site}/lists/${L.beni}/items`, {
          fields: { ...puliti(campi), CartellaUrl: cartellaUrl },
        })
        idBene.set(idIT, { itemId: String(creato.id), numero })
      } else {
        idBene.set(idIT, { itemId: null, numero })
      }
      fatto.beni++
    }
  }

  // ============================================================
  // 2. Assegnazioni dei dispositivi
  // ============================================================
  if (SOLO === 'tutto' || SOLO === 'dispositivi') {
    console.log('\n── Assegnazioni dei dispositivi')
    for (const a of asgDisp) {
      const f = a.fields || {}
      const idIT = `ASG-${a.id}`
      if (mappaAsg.has(idIT)) { fatto.saltati++; continue }

      const bene = idBene.get(`DISP-${f.DispositivoLookupId}`)
      if (!bene) {
        avvisi.push(`${idIT}: il dispositivo DISP-${f.DispositivoLookupId} non è in inventario, assegnazione saltata`)
        continue
      }

      const corr = CORREZIONI.assegnazioni?.[idIT] ?? {}
      const u = corr.senzaPersona ? { mail: '', nome: '' } : utente(idIT)
      if (!corr.senzaPersona && f.UtenteLookupId && !u.nome) {
        avvisi.push(`${idIT}: utente ${f.UtenteLookupId} senza nome leggibile, assegnatario vuoto`)
      }

      let nomeUtenza = txt(f.Nomeutenza)
      if (nomeUtenza === '?' || nomeUtenza === '-') nomeUtenza = ''
      const servizio = servizi.get(chiave(f.Servizio)) ?? txt(f.Servizio)
      const dal = corr.dataAssegnazione ?? giorno(f.Dataassegnazione) ?? DATA_IMPIANTO
      const al = giorno(f.Datarestituzione)
      const stato = txt(f.Stato) === 'Chiusa' ? 'Chiusa' : 'Attiva'
      const note = corr.svuotaNote && txt(f.Note) === corr.svuotaNote ? '' : txt(f.Note)

      const campi = {
        Title: `${bene.numero} · ${dal}`,
        BeneLookupId: bene.itemId ? Number(bene.itemId) : undefined,
        AssegnatarioMail: u.mail,
        AssegnatarioNome: u.nome,
        ServizioLegacy: servizio,
        NomeUtenza: nomeUtenza,
        DataAssegnazione: spData(dal),
        DataFine: spData(al),
        Stato: stato,
        Note: note,
        IdListaIT: idIT,
      }

      console.log(
        `  ${idIT} → ${bene.numero}  ${(u.nome || 'in condivisione').padEnd(30)} ` +
        `${stato.padEnd(7)} dal ${dal}${al ? ` al ${al}` : ''}${corr.dataAssegnazione ? ' ←data di impianto' : ''}`,
      )
      if (APPLICA) {
        await graph('POST', `/sites/${site}/lists/${L.asgBeni}/items`, { fields: puliti(campi) })
      }
      fatto.asg++
    }
  }

  // ============================================================
  // 3. SIM
  // ============================================================
  const idSim = new Map()
  if (SOLO === 'tutto' || SOLO === 'sim') {
    console.log('\n── SIM')
    for (const s of simOrig) {
      const f = s.fields || {}
      const idIT = `SIM-${s.id}`
      const esistente = mappaSim.get(idIT)
      if (esistente) {
        idSim.set(idIT, { itemId: String(esistente.id), numero: txt(esistente.fields?.Numero) })
        fatto.saltati++
        continue
      }
      const numero = txt(f.Numero)
      const campi = {
        Title: txt(f.Title) || numero,
        Numero: numero,
        Operatore: txt(f.Operatore),
        TipoPiano: txt(f.TipoPiano)
          ? scelta(txt(f.TipoPiano), TIPI_PIANO, `${idIT}.TipoPiano`)
          : undefined,
        NomePiano: txt(f.NomePiano),
        FornitoreIntermediario: txt(f.Fornitore_x002f_Intermediario),
        DataAttivazione: spData(giorno(f.Dataattivazione)),
        DataCessazione: spData(giorno(f.Datacessazione)),
        RiferimentoContratto: txt(f.RiferimentoContratto),
        StatoSim: scelta(txt(f.Stato) || 'Attiva', STATI_SIM, `${idIT}.Stato`),
        CostoMensile: f.Costomensile ?? undefined,
        Note: txt(f.Note),
        IdListaIT: idIT,
      }
      console.log(`  ${idIT} → ${numero.padEnd(15)} ${(txt(f.Operatore) || '—').padEnd(10)} ${campi.StatoSim}`)
      if (APPLICA) {
        const creato = await graph('POST', `/sites/${site}/lists/${L.sim}/items`, { fields: puliti(campi) })
        idSim.set(idIT, { itemId: String(creato.id), numero })
      } else {
        idSim.set(idIT, { itemId: null, numero })
      }
      fatto.sim++
    }

    console.log('\n── Assegnazioni delle SIM')
    for (const a of asgSimOrig) {
      const f = a.fields || {}
      const idIT = `ASGSIM-${a.id}`
      if (mappaAsgSim.has(idIT)) { fatto.saltati++; continue }
      const sim = idSim.get(`SIM-${f.NumeroLookupId}`)
      if (!sim) {
        avvisi.push(`${idIT}: la SIM SIM-${f.NumeroLookupId} non è in anagrafica, assegnazione saltata`)
        continue
      }
      const corr = CORREZIONI.assegnazioni?.[idIT] ?? {}
      const u = corr.senzaPersona ? { mail: '', nome: '' } : utente(idIT)
      const dal = corr.dataAssegnazione ?? giorno(f.Dataassegnazione) ?? DATA_IMPIANTO
      const al = giorno(f.Datacessazione)
      const campi = {
        Title: `${sim.numero} · ${dal}`,
        SimLookupId: sim.itemId ? Number(sim.itemId) : undefined,
        AssegnatarioMail: u.mail,
        AssegnatarioNome: u.nome,
        ServizioLegacy: servizi.get(chiave(f.Servizio)) ?? txt(f.Servizio),
        DataAssegnazione: spData(dal),
        DataFine: spData(al),
        Stato: txt(f.Stato) === 'Chiusa' ? 'Chiusa' : 'Attiva',
        Note: txt(f.Note),
        IdListaIT: idIT,
      }
      console.log(`  ${idIT} → ${sim.numero.padEnd(15)} ${(u.nome || 'in condivisione').padEnd(30)} dal ${dal}`)
      if (APPLICA) {
        await graph('POST', `/sites/${site}/lists/${L.asgSim}/items`, { fields: puliti(campi) })
      }
      fatto.asgSim++
    }
  }

  // ============================================================
  // 4. Specchio sull'anagrafica: chi ce l'ha adesso
  // ============================================================
  if (APPLICA) {
    console.log('\n── Rispecchio gli assegnatari sull’anagrafica')
    let n = 0
    for (const a of asgDisp) {
      if (txt(a.fields?.Stato) !== 'Attiva') continue
      const bene = idBene.get(`DISP-${a.fields?.DispositivoLookupId}`)
      if (!bene?.itemId) continue
      const corr = CORREZIONI.assegnazioni?.[`ASG-${a.id}`] ?? {}
      const u = corr.senzaPersona ? { mail: '', nome: '' } : utente(`ASG-${a.id}`)
      await graph('PATCH', `/sites/${site}/lists/${L.beni}/items/${bene.itemId}/fields`, {
        AssegnatarioMail: u.mail, AssegnatarioNome: u.nome,
      })
      n++
    }
    for (const a of asgSimOrig) {
      if (txt(a.fields?.Stato) !== 'Attiva') continue
      const sim = idSim.get(`SIM-${a.fields?.NumeroLookupId}`)
      if (!sim?.itemId) continue
      const u = utente(`ASGSIM-${a.id}`)
      await graph('PATCH', `/sites/${site}/lists/${L.sim}/items/${sim.itemId}/fields`, {
        AssegnatarioMail: u.mail, AssegnatarioNome: u.nome,
      })
      n++
    }
    console.log(`  ${n} anagrafiche allineate`)
  }

  // ============================================================
  // Riepilogo
  // ============================================================
  console.log('\n' + '='.repeat(64))
  console.log(`Dispositivi        ${String(fatto.beni).padStart(3)} da creare`)
  console.log(`Assegnazioni       ${String(fatto.asg).padStart(3)} da creare`)
  console.log(`SIM                ${String(fatto.sim).padStart(3)} da creare`)
  console.log(`Assegnazioni SIM   ${String(fatto.asgSim).padStart(3)} da creare`)
  console.log(`Già dentro         ${String(fatto.saltati).padStart(3)} saltate (chiave IdListaIT)`)
  if (avvisi.length) {
    console.log(`\nAvvisi (${avvisi.length}):`)
    for (const a of avvisi) console.log(`  · ${a}`)
  }
  console.log('='.repeat(64))
  console.log(
    APPLICA
      ? '\n✓ Fatto. I centri di costo restano da assegnare a mano: li trovi in\n' +
        '  IT e Dispositivi › Da sistemare › "Assegnazioni attive senza centro di costo".\n'
      : '\nProva a vuoto: non è stato scritto niente. Per scrivere davvero:\n' +
        '  node scripts/migra-dispositivi-it.mjs --applica\n',
  )
}

/** La parte utile di un errore Graph, senza l'URL lunghissimo. */
function primaRiga(e) {
  return String(e?.message ?? e).split('→').pop().trim().slice(0, 90)
}

/** Via i campi non valorizzati: SharePoint preferisce l'assenza al vuoto. */
function puliti(campi) {
  return Object.fromEntries(Object.entries(campi).filter(([, v]) => v !== undefined))
}

async function assicuraCartella(driveId, relPath) {
  const segmenti = relPath.split('/').filter(Boolean)
  let corrente = ''
  for (const seg of segmenti) {
    const genitore = corrente
    corrente = corrente ? `${corrente}/${seg}` : seg
    const esiste = await graph('GET', `/drives/${driveId}/root:/${encodePath(corrente)}?$select=id`).catch(() => null)
    if (esiste) continue
    const endpoint = genitore
      ? `/drives/${driveId}/root:/${encodePath(genitore)}:/children`
      : `/drives/${driveId}/root/children`
    await graph('POST', endpoint, {
      name: seg, folder: {}, '@microsoft.graph.conflictBehavior': 'fail',
    }).catch(async (err) => {
      const ancora = await graph('GET', `/drives/${driveId}/root:/${encodePath(corrente)}?$select=id`).catch(() => null)
      if (!ancora) throw err
    })
  }
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
