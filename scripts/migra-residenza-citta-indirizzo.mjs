#!/usr/bin/env node
/**
 * ⚠️ SUPERATO dall'08-08-2026: lo schema è passato da 2 a 6 campi indirizzo
 * (Indirizzo/CAP/Comune per Residenza E per Domicilio — vedi
 * types/risorse-umane.ts) e i campi CittaResidenza/IndirizzoResidenza scritti
 * da questo script sono a loro volta storici. Per i dati reali si è preferito
 * un file rivisto a mano da Dennis ("Dipendenti_indirizzi_split.xlsx") invece
 * di questo split automatico: vedi scripts/applica-indirizzi-split.mjs.
 * Tenuto per riferimento storico, non rilanciare senza motivo.
 *
 * Migrazione del vecchio campo unico "Residenza" (lista SharePoint Dipendenti,
 * che include anche i Collaboratori) nei due nuovi campi CittaResidenza +
 * IndirizzoResidenza (vedi types/risorse-umane.ts, cambio del 2026-08-07).
 *
 * PREREQUISITO: aver già rilanciato node scripts/provision-risorse-umane.mjs
 * (deve esistere la colonna CittaResidenza e IndirizzoResidenza sulla lista).
 *
 * COME SPLITTA (best-effort, 3 livelli di confidenza):
 *   1) CERTO — spezza il testo sulle virgole e cerca il pezzo con un CAP
 *      (5 cifre) o una provincia tra parentesi, es. "10015 IVREA (TO)" o
 *      "Ivrea (TO)": quel pezzo è la CITTÀ, gli altri (uniti con ", ")
 *      sono l'INDIRIZZO. Funziona indipendentemente dall'ordine e anche se
 *      il testo è un pezzo unico (es. solo "IVREA (TO)", indirizzo vuoto).
 *   2) ASSUNTO — se non c'è CAP/provincia ma ci sono ESATTAMENTE due pezzi,
 *      si assume l'ordine con cui li scrive l'import cedolini ("indirizzo,
 *      comune"): 1° pezzo = indirizzo, 2° pezzo = città. Se c'è un solo
 *      pezzo senza CAP/provincia, si guarda se inizia con una parola da
 *      indirizzo (via, corso, viale, piazza, ...): in tal caso è indirizzo,
 *      altrimenti si assume sia il nome del comune.
 *      Questi casi vengono scritti ma segnalati con "~" per un controllo
 *      veloce a campione.
 *   3) AMBIGUO — 3+ pezzi senza CAP/provincia: l'ordine non è deducibile.
 *      Città lasciata vuota, tutto il testo originale in Indirizzo.
 *
 * Non tocca né elimina la colonna "Residenza" originale (resta come backup/
 * storico — stesso criterio già usato per le colonne dismesse di Tirocini).
 *
 * Idempotente: salta i record che hanno già CittaResidenza o IndirizzoResidenza
 * compilati. Con --rifai-ambigui riprova ANCHE i record già scritti ma
 * classificati AMBIGUO in un run precedente (si riconoscono perché hanno
 * Città vuota e Indirizzo pieno) — utile dopo aver affinato l'euristica,
 * senza toccare quelli già risolti con CERTO/ASSUNTO.
 *
 * USO (dalla cartella web/):
 *   node scripts/migra-residenza-citta-indirizzo.mjs                        # dry-run
 *   node scripts/migra-residenza-citta-indirizzo.mjs --apply                # applica
 *   node scripts/migra-residenza-citta-indirizzo.mjs --apply --rifai-ambigui  # applica + riprova i vecchi ambigui
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SP_LIST_DIPENDENTI, e il sito (SP_SITE_RU se impostato, altrimenti SHAREPOINT_SITE_ID).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const RIFAI_AMBIGUI = process.argv.includes('--rifai-ambigui')

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

async function getAll(token, site, listId, select) {
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

const has = (v) => v != null && String(v).trim() !== ''

// Pattern che identifica il pezzo "città": CAP (5 cifre) o provincia tra parentesi
// (tollera spazi dentro le parentesi, es. "( TO )").
const RE_CITTA = /\b\d{5}\b|\(\s*[A-Za-z]{2}\s*\)/
// Parole che, in testa a un pezzo, indicano quasi certamente un indirizzo e non un comune.
const RE_VIA = /^(via|viale|corso|piazza|piazzale|strada|vicolo|largo|frazione|loc\.?|localit[aà]|regione|borgata|vico|c\.so)\b/i

/** Spezza il testo libero in { citta, indirizzo, livello }. livello: 'certo' | 'assunto' | 'ambiguo'. */
function splitResidenza(testoOriginale) {
  const testo = testoOriginale.trim()
  const pezzi = testo.split(',').map((p) => p.trim()).filter(Boolean)
  if (pezzi.length === 0) return { citta: '', indirizzo: '', livello: 'ambiguo' }

  // 1) CERTO: un pezzo qualsiasi (anche se è l'unico) contiene CAP o provincia.
  const idxCitta = pezzi.findIndex((p) => RE_CITTA.test(p))
  if (idxCitta !== -1) {
    const citta = pezzi[idxCitta]
    const indirizzo = pezzi.filter((_, i) => i !== idxCitta).join(', ')
    return { citta, indirizzo, livello: 'certo' }
  }

  // 2) ASSUNTO: due pezzi, nessun CAP/provincia -> convenzione import cedolini
  // ("indirizzo, comune", indirizzo per primo).
  if (pezzi.length === 2) {
    return { citta: pezzi[1], indirizzo: pezzi[0], livello: 'assunto' }
  }

  // 2b) ASSUNTO: un pezzo unico senza CAP/provincia -> lo si riconosce da
  // "sembra un indirizzo" (via/corso/piazza...) o, in mancanza, si assume comune.
  if (pezzi.length === 1) {
    const unico = pezzi[0]
    if (RE_VIA.test(unico)) return { citta: '', indirizzo: unico, livello: 'assunto' }
    return { citta: unico, indirizzo: '', livello: 'assunto' }
  }

  // 3) AMBIGUO: 3+ pezzi senza alcun ancoraggio -> non si indovina l'ordine.
  return { citta: '', indirizzo: testo, livello: 'ambiguo' }
}

/** Un record scritto in un run precedente con livello "ambiguo" (città vuota, indirizzo pieno). */
function eraAmbiguoPrima(f) {
  return !has(f.CittaResidenza) && has(f.IndirizzoResidenza)
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SP_LIST_DIPENDENTI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  if (!site) throw new Error('Sito non indicato: imposta SP_SITE_RU o SHAREPOINT_SITE_ID')
  const lista = process.env.SP_LIST_DIPENDENTI
  console.log(`→ Sito: ${site}  |  Lista: ${lista}`)
  console.log(`→ Modalità: ${APPLY ? 'APPLICA (scrive su SharePoint)' : 'DRY-RUN (nessuna modifica)'}${RIFAI_AMBIGUI ? '  |  riprova anche i vecchi AMBIGUI' : ''}\n`)

  const token = await getToken()

  const cols = await graph(token, 'GET', `/sites/${site}/lists/${lista}/columns?$select=name&$top=300`)
  for (const nome of ['CittaResidenza', 'IndirizzoResidenza']) {
    if (!(cols.value || []).some((c) => c.name === nome)) {
      throw new Error(`La colonna "${nome}" non esiste ancora. Esegui prima: node scripts/provision-risorse-umane.mjs`)
    }
  }

  const items = await getAll(token, site, lista, 'Cognome,Nome,Residenza,CittaResidenza,IndirizzoResidenza')
  console.log(`→ Record totali: ${items.length}\n`)

  let certi = 0
  let assunti = 0
  let ambigui = 0
  let saltatiGiaFatti = 0
  let saltatiVuoti = 0

  for (const it of items) {
    const f = it.fields || {}
    const nome = `${f.Cognome ?? ''} ${f.Nome ?? ''}`.trim() || `#${it.id}`

    if (!has(f.Residenza)) { saltatiVuoti++; continue }

    const giaFatto = has(f.CittaResidenza) || has(f.IndirizzoResidenza)
    if (giaFatto && !(RIFAI_AMBIGUI && eraAmbiguoPrima(f))) { saltatiGiaFatti++; continue }

    const { citta, indirizzo, livello } = splitResidenza(String(f.Residenza))
    if (livello === 'certo') {
      certi++
      console.log(`  ✓ "${nome}"  Residenza="${f.Residenza}"  → Città="${citta}"  Indirizzo="${indirizzo}"`)
    } else if (livello === 'assunto') {
      assunti++
      console.log(`  ~ "${nome}"  Residenza="${f.Residenza}"  → Città="${citta}"  Indirizzo="${indirizzo}"  (assunto, verificare a campione)`)
    } else {
      ambigui++
      console.log(`  ⚠ AMBIGUO  "${nome}"  Residenza="${f.Residenza}"  → Indirizzo="${indirizzo}" (Città lasciata vuota, da rivedere a mano)`)
    }

    if (APPLY) {
      await graph(token, 'PATCH', `/sites/${site}/lists/${lista}/items/${it.id}/fields`, {
        CittaResidenza: citta || null,
        IndirizzoResidenza: indirizzo || null,
      })
    }
  }

  console.log('\n============================================================')
  console.log(`Certi (CAP/provincia trovati):   ${certi}`)
  console.log(`Assunti (da verificare a campione): ${assunti}`)
  console.log(`Ambigui (da rivedere a mano):     ${ambigui}`)
  console.log(`Record già migrati (saltati):     ${saltatiGiaFatti}`)
  console.log(`Record senza Residenza (saltati): ${saltatiVuoti}`)
  if (!APPLY) console.log('\nRilancia con --apply per scrivere le modifiche su SharePoint.')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
