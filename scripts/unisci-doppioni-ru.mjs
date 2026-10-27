#!/usr/bin/env node
/**
 * Unisce le schede RU doppie (stesso CODICE FISCALE) in una sola.
 *
 * Nate così (casi Corio, Dotto, Roberti, Guido, Ravelli, ago-set 2026): al
 * passaggio da dipendente a socio lavoratore le HR hanno aperto una scheda nuova
 * invece di aggiornare quella migrata da Access, rimasta "Cessato" con la stessa
 * mail aziendale. Due schede con la stessa mail confondono le timbrature.
 * Regola decisa con Dennis il 27/10/2026: UNA scheda per persona.
 *
 * Per ogni coppia (una scheda Cessato + una in corso):
 *   - si TIENE la scheda in corso (rapporto attuale, matricola nuova, referente);
 *   - i dati PERSONALI che lì sono vuoti vengono presi dalla vecchia
 *     (anagrafica, contatti, residenza, IBAN, socio, svantaggio...);
 *   - i dati del RAPPORTO precedente (matricola, date, contratto, livello...)
 *     NON sovrascrivono niente: finiscono in testa alle Note;
 *   - la cartella documenti della vecchia scheda passa alla nuova (rinominata se
 *     la nuova non ne ha una, altrimenti spostata dentro come sottocartella);
 *   - la vecchia scheda viene eliminata (finisce nel cestino del sito RU).
 *
 * USO (dalla cartella web/):
 *   node scripts/unisci-doppioni-ru.mjs            anteprima, non scrive niente
 *   node scripts/unisci-doppioni-ru.mjs --apply    esegue
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const v = (x) => (typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim())
const vuoto = (x) => x == null || v(x) === ''

try {
  for (const r of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
    const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

// Campi della scheda Dipendenti, letti dalla configurazione dell'app.
const tipi = readFileSync(join(__dirname, '..', 'types', 'risorse-umane.ts'), 'utf8')
const CAMPI_APP = new Set([...tipi.matchAll(/key:\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]))

// Dati del rapporto: restano quelli della scheda nuova, i vecchi vanno in nota.
const RAPPORTO = [
  ['TipoRapporto', 'tipo'], ['Matricola', 'matricola'], ['MatricolaPulse', 'matricola PULSE'],
  ['DataAssunzione', 'assunzione'], ['DataDimissioneLavoratore', 'dimissione'],
  ['TipoContratto', 'contratto'], ['DataScadenzaContratto', 'scadenza contratto'],
  ['LivelloContrattuale', 'livello'], ['OreLavoroPreviste', 'ore previste'],
  ['Mansione', 'mansione'], ['ServizioAppartenenza', 'servizio'], ['AreaAssunzione', 'cooperativa'],
  ['StatoRapporto', 'stato'], ['StatoServizio', 'note contrattuali'],
]
const NON_COPIARE = new Set([
  ...RAPPORTO.map(([k]) => k),
  'TimbraturaAttiva', 'NonTimbra', 'ReferenteFoglioOre', 'CartellaUrl', 'Note', 'Title', 'IdAccess',
  // "Socio" sulla vecchia scheda era quello del rapporto da dipendente: non vale per il socio lavoratore.
  'Socio',
])

const tkRes = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.GRAPH_CLIENT_ID,
    client_secret: process.env.GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
})
const tk = (await tkRes.json()).access_token
const SITE = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
const LISTA = process.env.SP_LIST_DIPENDENTI
const DRIVE = process.env.SP_RU_DRIVE_ID
const RADICE = process.env.SP_RU_FOLDER || 'Risorse Umane/Dipendenti'

async function graph(metodo, url, body) {
  const res = await fetch(url.startsWith('http') ? url : `https://graph.microsoft.com/v1.0${url}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json', Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 404 && metodo === 'GET') return null
  const t = await res.text()
  if (!res.ok) throw new Error(`${metodo} ${url.slice(0, 80)} → ${res.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/')
const sanitize = (s) => (s || '').replace(/[\\/:*?"<>|#%]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)
const nomeCartella = (f) => {
  const base = `${v(f.Cognome)} ${v(f.Nome)}`.trim()
  const rif = v(f.Matricola) || v(f.IdAccess)
  return sanitize(rif ? `${base} - ${rif}` : base)
}
const cartella = async (nome) => (DRIVE ? graph('GET', `/drives/${DRIVE}/root:/${enc(`${RADICE}/${nome}`)}?$select=id,name,webUrl,folder`) : null)

// --- lettura -----------------------------------------------------------------
const items = []
let next = `/sites/${SITE}/lists/${LISTA}/items?$expand=fields&$top=200`
while (next) {
  const d = await graph('GET', next)
  items.push(...d.value)
  next = d['@odata.nextLink'] || null
}
const perCF = new Map()
for (const it of items) {
  const cf = v(it.fields?.CodiceFiscale).toUpperCase()
  if (!cf) continue
  if (!perCF.has(cf)) perCF.set(cf, [])
  perCF.get(cf).push(it)
}
const coppie = [...perCF.values()].filter((g) => g.length > 1)

console.log(APPLY ? '\n▶ MODALITÀ SCRITTURA (--apply)\n' : '\n▶ ANTEPRIMA — niente viene scritto. Aggiungi --apply per eseguire.\n')
console.log(`Schede Dipendenti: ${items.length} · persone con più schede: ${coppie.length}`)

const oggi = new Date().toLocaleDateString('it-IT')
for (const g of coppie) {
  const vecchie = g.filter((it) => v(it.fields.StatoRapporto) === 'Cessato')
  const nuove = g.filter((it) => v(it.fields.StatoRapporto) !== 'Cessato')
  const chi = `${v(g[0].fields.Cognome)} ${v(g[0].fields.Nome)}`
  if (nuove.length !== 1 || vecchie.length !== g.length - 1) {
    console.log(`\n✗ ${chi}: ${g.length} schede, ${nuove.length} in corso — caso non previsto, SALTATO (va visto a mano)`)
    continue
  }
  const nuova = nuove[0]
  const fN = nuova.fields
  console.log(`\n=== ${chi}  →  tengo item ${nuova.id} (${v(fN.TipoRapporto) || 'tipo vuoto'}, matr. ${v(fN.Matricola) || '-'})`)

  for (const vecchia of vecchie) {
    const fV = vecchia.fields
    // 1. dati personali mancanti nella nuova
    const copia = {}
    for (const k of Object.keys(fV)) {
      if (!CAMPI_APP.has(k) || NON_COPIARE.has(k)) continue
      if (!vuoto(fV[k]) && vuoto(fN[k])) copia[k] = fV[k]
    }
    // 2. nota con il rapporto precedente
    const testo = (x) => (/^\d{4}-\d{2}-\d{2}T/.test(v(x)) ? v(x).slice(0, 10) : v(x))
    const pezzi = RAPPORTO.map(([k, et]) => (vuoto(fV[k]) ? null : `${et} ${testo(fV[k])}`)).filter(Boolean)
    const nota = `Rapporto precedente (scheda ${vecchia.id} unita il ${oggi}): ${pezzi.join(', ')}.`
    const noteNuove = [nota, v(fV.Note) && `Note della scheda precedente: ${v(fV.Note)}`, v(fN.Note)].filter(Boolean).join('\n\n')

    console.log(`  · scheda vecchia ${vecchia.id} (${v(fV.TipoRapporto) || '-'}, matr. ${v(fV.Matricola) || '-'})`)
    console.log(`    copio nella nuova ${Object.keys(copia).length} campi vuoti: ${Object.keys(copia).join(', ') || '(nessuno)'}`)
    console.log(`    nota: ${nota}`)

    // 3. cartella documenti
    const cV = await cartella(nomeCartella(fV))
    const cN = await cartella(nomeCartella(fN))
    let azioneCartella = null
    if (!DRIVE) console.log('    cartella: SP_RU_DRIVE_ID mancante, non controllata')
    else if (!cV) console.log(`    cartella vecchia "${nomeCartella(fV)}": non esiste, niente da spostare`)
    else if (vuoto(fN.Matricola)) {
      console.log(`    cartella: la scheda tenuta non ha matricola, lascio "${cV.name}" com'è (da sistemare quando le HR la inseriscono)`)
    } else if (!cN) {
      azioneCartella = { tipo: 'rinomina', id: cV.id, nome: nomeCartella(fN) }
      console.log(`    cartella: rinomino "${cV.name}" → "${nomeCartella(fN)}"`)
    } else {
      azioneCartella = { tipo: 'sposta', id: cV.id, dentro: cN.id, nome: `Rapporto precedente - ${v(fV.Matricola) || vecchia.id}` }
      console.log(`    cartella: sposto "${cV.name}" dentro "${cN.name}" come "${azioneCartella.nome}"`)
    }
    console.log(`    elimino la scheda ${vecchia.id} (va nel cestino del sito RU)`)

    if (!APPLY) continue
    await graph('PATCH', `/sites/${SITE}/lists/${LISTA}/items/${nuova.id}/fields`, { ...copia, Note: noteNuove })
    Object.assign(fN, copia, { Note: noteNuove })
    if (azioneCartella?.tipo === 'rinomina') {
      const c = await graph('PATCH', `/drives/${DRIVE}/items/${azioneCartella.id}`, { name: azioneCartella.nome })
      await graph('PATCH', `/sites/${SITE}/lists/${LISTA}/items/${nuova.id}/fields`, { CartellaUrl: c.webUrl })
    } else if (azioneCartella?.tipo === 'sposta') {
      await graph('PATCH', `/drives/${DRIVE}/items/${azioneCartella.id}`, { name: azioneCartella.nome, parentReference: { id: azioneCartella.dentro } })
    }
    await graph('DELETE', `/sites/${SITE}/lists/${LISTA}/items/${vecchia.id}`)
    console.log('    ✓ fatto')
  }
  if (vuoto(fN.TipoRapporto) || vuoto(fN.Matricola)) {
    console.log(`  ⚠ la scheda tenuta non ha ${[vuoto(fN.TipoRapporto) && 'tipo di rapporto', vuoto(fN.Matricola) && 'matricola'].filter(Boolean).join(' né ')}: le HR devono completarla`)
  }
}
console.log(APPLY ? '\nFinito. Ora riallinea le timbrature: node scripts/sync-timbrature-anagrafica.mjs\n' : '\nAnteprima finita.\n')
