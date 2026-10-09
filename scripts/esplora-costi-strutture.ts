/**
 * Esplorazione per il cruscotto unico "Costi per struttura". SOLO LETTURA.
 *
 * Stampa:
 *  1. l'anagrafica Strutture (id, codice, nome, centro di costo)
 *  2. la lista "Costi Ricorrenti Strutture" (colonne + righe)
 *  3. la lista Costi Strutture riassunta per Fonte e Categoria, per capire
 *     quali voci esistono e se qualcuno ci ha già messo le bollette a mano
 *  4. la Mappatura Utenze con il nome della struttura accanto
 *
 * Uso (dalla cartella web/):
 *   npx --yes tsx scripts/esplora-costi-strutture.ts
 *
 * Risultato: a video + ../esplorazione-costi-strutture.json (fuori da git).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const SITE = process.env.SHAREPOINT_SITE_ID!

let token = ''
async function graph(path: string): Promise<any> {
  if (!token) {
    const r = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.GRAPH_CLIENT_ID!,
        client_secret: process.env.GRAPH_CLIENT_SECRET!,
        scope: 'https://graph.microsoft.com/.default',
      }),
    })
    if (!r.ok) throw new Error(`token: ${r.status} ${await r.text()}`)
    token = (await r.json()).access_token
  }
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } })
  if (!r.ok) throw new Error(`${path.slice(0, 90)} → ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}
async function tutte(path: string): Promise<any[]> {
  const out: any[] = []
  let url: string | undefined = path
  while (url) {
    const j = await graph(url)
    out.push(...j.value)
    url = j['@odata.nextLink']
  }
  return out
}
const pulisci = (f: any) =>
  Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith('@') && !k.startsWith('_') && !['ContentType', 'Edit', 'LinkTitle', 'LinkTitleNoMenu', 'ItemChildCount', 'FolderChildCount', 'AppAuthorLookupId', 'AppEditorLookupId', 'AuthorLookupId', 'EditorLookupId', 'Attachments', 'Created', 'Modified', 'id'].includes(k)))

async function lista(nome: string) {
  const liste = await tutte(`/sites/${SITE}/lists?$select=id,displayName&$top=200`)
  const l = liste.find((x) => x.displayName === nome)
  if (!l) return null
  const colonne = (await tutte(`/sites/${SITE}/lists/${l.id}/columns?$top=200`))
    .filter((c) => !c.readOnly && !c.hidden)
    .map((c) => ({ nome: c.name, etichetta: c.displayName, scelte: c.choice?.choices, lookup: c.lookup?.listId }))
  const righe = (await tutte(`/sites/${SITE}/lists/${l.id}/items?expand=fields&$top=999`)).map((i): any => ({ id: i.id, ...pulisci(i.fields) }))
  return { id: l.id, nome, colonne, righe }
}

async function main() {
  const strutture = await lista('Anagrafica Strutture')
  const ricorrenti = await lista('Costi Ricorrenti Strutture')
  const costi = await lista('Costi Strutture')
  const mappatura = await lista('Mappatura Utenze')
  const cc = await lista('Centri di Costo')

  const nomeCc = new Map((cc?.righe ?? []).map((r: any) => [String(r.id), `${r.Codice} ${r.Title}`]))
  const nomeStr = new Map((strutture?.righe ?? []).map((r: any) => [String(r.id), `${r.Codice} ${r.Title}`]))

  console.log('\n🏠 STRUTTURE')
  for (const s of strutture?.righe ?? []) console.log(`  id ${s.id}\t${s.Codice}\t${s.Title}\t→ ${nomeCc.get(String(s.CentroCostoLookupId)) ?? '(senza CC)'}`)

  console.log('\n🔁 COSTI RICORRENTI STRUTTURE')
  if (!ricorrenti) console.log('  (lista non trovata)')
  else {
    console.log(`  ${ricorrenti.righe.length} righe · colonne: ${ricorrenti.colonne.map((c: any) => `${c.etichetta}[${c.nome}]${c.scelte ? '{' + c.scelte.join('/') + '}' : ''}`).join(', ')}`)
    for (const r of ricorrenti.righe.slice(0, 40)) console.log('  ', JSON.stringify(r).slice(0, 300))
  }

  console.log('\n💶 COSTI STRUTTURE per fonte e categoria')
  const agg = new Map<string, { n: number; tot: number; min: string; max: string }>()
  for (const r of costi?.righe ?? []) {
    const k = `${r.Fonte ?? '—'} | ${r.Categoria ?? '—'}`
    const a = agg.get(k) ?? { n: 0, tot: 0, min: '9999', max: '0000' }
    a.n++
    a.tot += Number(r.Importo ?? 0)
    const d = String(r.DataCosto ?? '').slice(0, 10)
    if (d && d < a.min) a.min = d
    if (d && d > a.max) a.max = d
    agg.set(k, a)
  }
  for (const [k, a] of [...agg].sort((x, y) => y[1].tot - x[1].tot)) console.log(`  ${k.padEnd(45)} ${String(a.n).padStart(4)} righe ${a.tot.toFixed(2).padStart(11)} €  ${a.min} → ${a.max}`)
  const sospette = (costi?.righe ?? []).filter((r: any) => /utenz|luce|energia|gas|acqua|smat|tari|bollett|chiurlo/i.test(`${r.Categoria} ${r.Title} ${r.Fornitore}`))
  console.log(`\n  Righe che sembrano bollette: ${sospette.length}`)
  for (const r of sospette.slice(0, 20)) console.log('   ', r.DataCosto?.slice(0, 10), r.Categoria, '|', r.Title, '|', r.Fornitore, '|', r.Importo)

  console.log('\n⚡ MAPPATURA UTENZE con le strutture')
  for (const r of mappatura?.righe ?? []) console.log(`  ${String(r.Title).padEnd(30)} ${String(r.TipoFornitura).padEnd(18)} ${String(r.Percentuale).padStart(4)}%  ${nomeStr.get(String(r.StrutturaLookupId)) ?? '(?)'}  ${r.Note ?? ''}`)

  const out = join(process.cwd(), '..', 'esplorazione-costi-strutture.json')
  writeFileSync(out, JSON.stringify({ quando: new Date().toISOString(), strutture, ricorrenti, costi, mappatura, cc }, null, 2))
  console.log(`\n✓ Salvato ${out}`)
}
main().catch((e) => { console.error('✗', e); process.exit(1) })
