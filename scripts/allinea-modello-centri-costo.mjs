#!/usr/bin/env node
/**
 * Allinea la lista SharePoint "Centri di Costo" al modello di controllo di
 * gestione (Aree_e_Centri_di_Costo_Mirafiori_v6.xlsx, deciso con Dennis il
 * 12/10/2026).
 *
 * Cosa fa, riga per riga (riconosce le righe dal Codice):
 *   - Area: le dodici aree del modello (Educativa / Educativa Residenziale,
 *     Autonomie / Autonomie Adulti, Contrasto violenza di genere, …);
 *   - Coordinatori → colonna di testo EmailCoordinatori (email separate da
 *     ";"). AGGIUNGE quelli del modello e ci copia chi stava nella vecchia
 *     colonna persona "Coordinatori", che poi svuota. Non toglie mai nessuno;
 *   - Responsabile d'area → colonna EmailResponsabileArea, ripetuta su ogni
 *     centro dell'area. Vede i conti Qonto di tutta l'area;
 *   - Attivo: cc6 Toc Toc Roberto si spegne (deciso 12/10). Non si cancella.
 *
 * Prima ancora: crea le due colonne di testo se mancano e mette nella colonna
 * Area le scelte nuove.
 *
 * Perché email e non colonne persona: una colonna persona accetta solo chi ha
 * già aperto il sito SharePoint almeno una volta, e molti coordinatori usano
 * solo l'app. Da qui in poi si modificano da Amministrazione → Centri di costo.
 *
 * Uso (dalla cartella web/):
 *   node scripts/allinea-modello-centri-costo.mjs           # mostra cosa farebbe
 *   node scripts/allinea-modello-centri-costo.mjs --apply   # scrive
 *
 * Idempotente. Dopo l'--apply: node scripts/sync-centri-costo-supabase.mjs --apply
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_CENTRI_COSTO
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const USER_INFO_LIST = '3f6b4698-931e-4540-a681-d6a436b26bdb'
const COL_COORD = 'EmailCoordinatori'
const COL_RA = 'EmailResponsabileArea'
const D = '@cooperativamirafiori.com'

const AREE = [
  'Educativa',
  'Educativa Residenziale',
  'Autonomie',
  'Autonomie Adulti',
  'Socio Sanitaria',
  'Socio Culturale',
  'Contrasto violenza di genere',
  'Ristorazione',
  'Lavoro',
  'Ricettività',
  'Commercio',
  'Servizi Generali',
]

/** Responsabile d'area, dal modello. */
const RESP_AREA = {
  Educativa: 'flora.debenedittis',
  'Educativa Residenziale': 'michela.debenedittis',
  Autonomie: 'flora.debenedittis',
  'Autonomie Adulti': 'luca.cordaro',
  'Socio Sanitaria': 'simona.bortolai',
  'Socio Culturale': 'stefania.melissari',
  'Contrasto violenza di genere': 'adriana.sumini',
  Ristorazione: 'michela.debenedittis',
  Lavoro: 'stefano.martino',
  Ricettività: 'luca.cordaro',
  Commercio: 'stefano.martino',
  'Servizi Generali': 'luca.cordaro',
}

/** Codice → area e coordinatori, dal modello. */
const MODELLO = {
  cc1: { area: 'Lavoro', coord: ['stefano.martino'] },
  cc2: { area: 'Ristorazione', coord: ['cinzia.mosca'] },
  cc3: { area: 'Ristorazione', coord: ['federico.palumbo'] },
  cc4: { area: 'Contrasto violenza di genere', coord: ['maddalena.saponara'] },
  cc5: { area: 'Contrasto violenza di genere', coord: ['simona.finetti'] },
  cc6: { area: 'Contrasto violenza di genere', coord: [], spento: true },
  cc7: { area: 'Socio Culturale', coord: ['massimiliano.giannelli'] },
  cc8: { area: 'Socio Culturale', coord: ['federico.palumbo'] },
  cc9: { area: 'Socio Sanitaria', coord: ['giorgia.picatto'] },
  cc10: { area: 'Socio Sanitaria', coord: ['annalisa.perziano'] },
  cc11: { area: 'Socio Sanitaria', coord: ['simona.bortolai'] },
  cc12: { area: 'Socio Sanitaria', coord: ['anna.scarso'] },
  cc13: { area: 'Socio Sanitaria', coord: ['massimiliano.giannelli'] },
  cc14: { area: 'Educativa Residenziale', coord: ['valentina.profeta'] },
  cc15: { area: 'Educativa', coord: ['giorgia.gulli'] },
  cc16: { area: 'Educativa', coord: ['olga.casini'] },
  cc17: { area: 'Autonomie', coord: ['giorgia.gulli'] },
  cc18: { area: 'Autonomie', coord: ['giorgia.gulli'] },
  cc19: { area: 'Autonomie', coord: ['giorgia.gulli'] },
  cc20: { area: 'Autonomie Adulti', coord: ['simona.finetti'] },
  cc21: { area: 'Ricettività', coord: ['dennis.maseri'] },
  cc22: { area: 'Commercio', coord: ['stefano.martino'] },
  cc23: { area: 'Servizi Generali', coord: ['stefano.martino'] },
  cc24: { area: 'Servizi Generali', coord: ['marika.armandi'] },
}

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env.local assente
  }
}

let TOKEN
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
  TOKEN ??= await getToken()
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

let SITE, LISTA

async function emailDaLookup(id) {
  const r = await graph('GET', `/sites/${SITE}/lists/${USER_INFO_LIST}/items/${id}?$expand=fields($select=EMail,UserName)`)
  return String(r.fields?.EMail || r.fields?.UserName || '').toLowerCase()
}

function idsPersona(fields, nome) {
  const v = fields?.[nome]
  if (Array.isArray(v)) return v.map((x) => Number(x?.LookupId)).filter(Boolean)
  const ids = fields?.[`${nome}LookupId`]
  if (Array.isArray(ids)) return ids.map(Number).filter(Boolean)
  return ids ? [Number(ids)].filter(Boolean) : []
}

const daTesto = (v) => [...new Set(String(v ?? '').split(/[;,\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')))]
const aTesto = (a) => [...new Set(a)].join('; ')

async function main() {
  loadEnvLocal()
  SITE = process.env.SHAREPOINT_SITE_ID
  LISTA = process.env.SP_LIST_CENTRI_COSTO
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_CENTRI_COSTO']) {
    if (!process.env[k]) throw new Error(`Manca ${k} in .env.local`)
  }
  console.log(APPLY ? '— SCRIVO —\n' : '— PROVA: non scrivo niente (rilancia con --apply) —\n')

  // 1. Colonne
  const colonne = (await graph('GET', `/sites/${SITE}/lists/${LISTA}/columns?$top=200`)).value
  const colArea = colonne.find((c) => c.name === 'Area')
  const scelteOra = colArea?.choice?.choices ?? []
  const scelteDopo = [...AREE]
  const nuove = scelteDopo.filter((a) => !scelteOra.includes(a))
  const vecchie = scelteOra.filter((a) => !scelteDopo.includes(a))
  console.log(`Colonna Area: + ${nuove.join(', ') || '—'}`)
  console.log(`              − ${vecchie.join(', ') || '—'}`)
  if (APPLY && (nuove.length || vecchie.length)) {
    await graph('PATCH', `/sites/${SITE}/lists/${LISTA}/columns/${colArea.id}`, {
      choice: { ...colArea.choice, choices: scelteDopo },
    })
    console.log('  ✓ scelte aggiornate')
  }
  for (const [nome, etichetta] of [[COL_COORD, 'Coordinatori (email)'], [COL_RA, 'Responsabile Area (email)']]) {
    const c = colonne.some((x) => x.name === nome)
    console.log(`Colonna ${etichetta}: ${c ? "c'è già" : 'da creare'}`)
    if (APPLY && !c) {
      await graph('POST', `/sites/${SITE}/lists/${LISTA}/columns`, {
        name: nome,
        displayName: etichetta,
        text: { allowMultipleLines: true },
      })
      console.log('  ✓ creata')
    }
  }

  // 2. Righe
  const righe = (await graph('GET', `/sites/${SITE}/lists/${LISTA}/items?$select=id&$expand=fields&$top=500`)).value
  const perCodice = new Map(righe.map((r) => [String(r.fields?.Codice ?? '').trim().toLowerCase(), r]))

  let modifiche = 0
  for (const [codice, m] of Object.entries(MODELLO)) {
    const r = perCodice.get(codice)
    if (!r) {
      console.log(`\n${codice}: NON TROVATO in lista — salto`)
      continue
    }
    const f = r.fields
    const campi = {}
    const log = []

    if (f.Area !== m.area) {
      campi.Area = m.area
      log.push(`area: ${f.Area ?? '—'} → ${m.area}`)
    }
    const attivo = !m.spento
    if ((f.Attivo !== false) !== attivo) {
      campi.Attivo = attivo
      log.push(`attivo: ${attivo ? 'sì' : 'NO (spento)'}`)
    }

    const persona = (await Promise.all(idsPersona(f, 'Responsabile').map(emailDaLookup))).filter(Boolean)
    const coordOra = daTesto(f[COL_COORD])
    const coordModello = m.coord.map((n) => n + D)
    const coordDopo = [...new Set([...coordOra, ...persona, ...coordModello])]
    if (aTesto(coordDopo) !== aTesto(coordOra) || persona.length) {
      campi[COL_COORD] = aTesto(coordDopo)
      const nuovi = coordDopo.filter((e) => !coordOra.includes(e))
      if (nuovi.length) log.push(`coordinatori: + ${nuovi.join(', ')}`)
      if (persona.length) {
        campi['ResponsabileLookupId@odata.type'] = 'Collection(Edm.Int32)'
        campi.ResponsabileLookupId = []
        log.push(`vecchia colonna persona copiata nelle email e svuotata: ${persona.join(', ')}`)
      }
    }
    for (const e of [...coordOra, ...persona]) {
      if (!coordModello.includes(e)) log.push(`⚠ coordinatore non nel modello, LASCIATO: ${e}`)
    }

    const raOra = daTesto(f[COL_RA])
    const raDopo = [...new Set([...raOra, RESP_AREA[m.area] + D])]
    if (aTesto(raDopo) !== aTesto(raOra)) {
      campi[COL_RA] = aTesto(raDopo)
      log.push(`responsabile area: + ${RESP_AREA[m.area]}${D}`)
    }

    if (!log.length) continue
    console.log(`\n${codice.padEnd(5)} ${f.Title}`)
    for (const l of log) console.log(`  ${l}`)
    if (!Object.keys(campi).length) continue
    modifiche++
    if (APPLY) {
      await graph('PATCH', `/sites/${SITE}/lists/${LISTA}/items/${r.id}/fields`, campi)
      console.log('  ✓ salvato')
    }
  }

  console.log(`\nRighe da cambiare: ${modifiche}`)
  if (!APPLY && modifiche) console.log('\nRilancia con --apply per scrivere.')
  if (APPLY) console.log('\nOra: node scripts/sync-centri-costo-supabase.mjs --apply')
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
