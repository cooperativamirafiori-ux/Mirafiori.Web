/**
 * Esplorazione per l'area Utenze. SOLO LETTURA: non sposta file, non scrive niente.
 *
 * Risponde a due domande prima di scrivere l'area:
 *  1. Com'è fatta la lista SharePoint delle utenze che esiste già sul sito
 *     Controllo Gestione (colonne + righe).
 *  2. Negli XML delle bollette ci sono POD/PDR e i CONSUMI (kWh, Smc, m³)?
 *     E in quale campo, fornitore per fornitore?
 *
 * Uso (dalla cartella web/):
 *   npx --yes tsx scripts/esplora-utenze.ts
 *
 * Risultato: riepilogo a video + ../esplorazione-utenze.json (fuori da git).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { eRicevutaSdi, xmlDaFile } from '../lib/pagamenti/sdi/fattura'
import { leggiXml, tutti, testo, trova, cerca, type Elemento } from '../lib/pagamenti/sdi/xml'

for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const SITE = process.env.SHAREPOINT_SITE_ID!
const CARTELLA = process.env.SP_CARTELLA_FATTURE_SDI || 'General/fatture da SDI'

let token = ''
async function graph(path: string): Promise<Response> {
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
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`${path.slice(0, 90)} → ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r
}
async function tutte(path: string): Promise<any[]> {
  const out: any[] = []
  let url: string | undefined = path
  while (url) {
    const j: any = await (await graph(url)).json()
    out.push(...j.value)
    url = j['@odata.nextLink']
  }
  return out
}

// --- 1. Liste del sito che parlano di utenze --------------------------------
async function listeUtenze() {
  const liste = await tutte(`/sites/${SITE}/lists?$select=id,displayName,list&$top=200`)
  const tutteLeListe = liste.filter((l) => l.list?.template === 'genericList').map((l) => l.displayName)
  const candidate = liste.filter((l) => /utenz|pod|pdr|contator|fornitur|energia|bollett/i.test(l.displayName))
  const out: any[] = []
  for (const l of candidate) {
    const colonne = (await tutte(`/sites/${SITE}/lists/${l.id}/columns?$top=200`))
      .filter((c) => !c.readOnly || c.name === 'Title')
      .map((c) => ({ nome: c.name, etichetta: c.displayName, tipo: Object.keys(c).find((k) => ['text', 'choice', 'number', 'lookup', 'dateTime', 'boolean', 'personOrGroup', 'currency', 'calculated'].includes(k)) ?? '?', scelte: c.choice?.choices }))
    const righe = (await tutte(`/sites/${SITE}/lists/${l.id}/items?expand=fields&$top=500`)).map((i) => i.fields)
    out.push({ id: l.id, nome: l.displayName, colonne, righe })
    console.log(`\n📋 Lista "${l.displayName}" (${l.id}): ${righe.length} righe`)
    for (const c of colonne) console.log(`   - ${c.etichetta} [${c.nome}] ${c.tipo}${c.scelte ? ' ' + c.scelte.join('/') : ''}`)
  }
  if (!candidate.length) console.log('\n⚠ Nessuna lista con "utenze/POD/PDR" nel nome. Liste del sito:\n   ' + tutteLeListe.join(' · '))
  return { liste: tutteLeListe, utenze: out }
}

// --- 2. Bollette negli XML ----------------------------------------------------
const RE_POD = /\bIT\d{3}E\d{8}[A-Z0-9]?\b/g
const RE_PDR = /\b\d{14}\b/g
const UNITA = /^(kwh|kw|kvarh|smc|mc|m3|m³|sm3|mwh|litri|l)$/i

function percorsoDi(radice: Elemento, cerca: RegExp): string[] {
  const trovati: string[] = []
  const giro = (e: Elemento, p: string) => {
    if (e.testo && cerca.test(e.testo)) trovati.push(`${p}/${e.nome}`)
    cerca.lastIndex = 0
    for (const f of e.figli) giro(f, `${p}/${e.nome}`)
  }
  giro(radice, '')
  return [...new Set(trovati.map((x) => x.replace(/^.*FatturaElettronicaBody/, 'Body')))]
}

async function bollette() {
  const drive = `/sites/${SITE}/drive`
  const enc = (p: string) => encodeURIComponent(p).replace(/%2F/g, '/')
  const file: any[] = []
  for (const p of [CARTELLA, `${CARTELLA}/Importate`]) {
    try {
      file.push(...(await tutte(`${drive}/root:/${enc(p)}:/children?$select=id,name,size,file&$top=200`)).filter((f) => f.file))
    } catch (e) { console.log(`(cartella ${p}: ${(e as Error).message})`) }
  }
  const xml = file.filter((f) => /\.xml(\.p7m)?$/i.test(f.name) && !eRicevutaSdi(f.name))
  console.log(`\n📂 ${xml.length} fatture XML da guardare (in arrivo + Importate)…`)

  const risultati: any[] = []
  let n = 0
  for (const f of xml) {
    if (++n % 50 === 0) console.log(`   …${n}/${xml.length}`)
    let t: string
    try {
      t = xmlDaFile(f.name, new Uint8Array(await (await graph(`${drive}/items/${f.id}/content`)).arrayBuffer()))
    } catch { continue }
    const senzaAllegati = t.replace(/<([a-z0-9]+:)?Attachment>[\s\S]*?<\/([a-z0-9]+:)?Attachment>/gi, '')
    const pod = [...new Set(senzaAllegati.match(RE_POD) ?? [])]
    const radice = leggiXml(senzaAllegati)
    const ced = cerca(radice, 'CedentePrestatore')
    const fornitore = testo(ced, 'DatiAnagrafici/Anagrafica/Denominazione') ?? [testo(ced, 'DatiAnagrafici/Anagrafica/Nome'), testo(ced, 'DatiAnagrafici/Anagrafica/Cognome')].filter(Boolean).join(' ')
    const piva = testo(ced, 'DatiAnagrafici/IdFiscaleIVA/IdCodice')
    const linee = tutti(cerca(radice, 'DatiBeniServizi'), 'DettaglioLinee')
    const conUnita = linee.filter((l) => UNITA.test((testo(l, 'UnitaMisura') ?? '').trim()))
    const tipiAdg = [...new Set(tutti(radice, 'AltriDatiGestionali').length ? [] : [])]
    const adg: Array<{ tipo: string | null; testo: string | null; numero: string | null }> = []
    const giroAdg = (e: Elemento) => { if (e.nome === 'AltriDatiGestionali') adg.push({ tipo: testo(e, 'TipoDato'), testo: testo(e, 'RiferimentoTesto'), numero: testo(e, 'RiferimentoNumero') }); e.figli.forEach(giroAdg) }
    giroAdg(radice)
    const descr = linee.map((l) => testo(l, 'Descrizione') ?? '').join(' | ')
    const causale = tutti(cerca(radice, 'DatiGeneraliDocumento'), 'Causale').map((c) => testo(c)).join(' ')
    const tuttoTesto = `${descr} ${causale} ${adg.map((a) => `${a.tipo} ${a.testo}`).join(' ')}`
    const pdr = /pdr|gas|smc/i.test(tuttoTesto) ? [...new Set(senzaAllegati.match(RE_PDR) ?? [])].filter((x) => !/^(19|20)\d{12}$/.test(x)) : []
    const eUtenza = pod.length > 0 || pdr.length > 0 || conUnita.length > 0 || /\b(pod|pdr|energia elettrica|gas naturale|servizio idrico|acquedotto|fognatura|depurazione)\b/i.test(tuttoTesto)
    if (!eUtenza) continue
    const periodi = linee.map((l) => [testo(l, 'DataInizioPeriodo'), testo(l, 'DataFinePeriodo')]).filter((p) => p[0] || p[1])
    risultati.push({
      file: f.name, fornitore, piva,
      numero: testo(cerca(radice, 'DatiGeneraliDocumento'), 'Numero'),
      data: testo(cerca(radice, 'DatiGeneraliDocumento'), 'Data'),
      totale: testo(cerca(radice, 'DatiGeneraliDocumento'), 'ImportoTotaleDocumento'),
      pod, pdr,
      dove_pod: pod.length ? percorsoDi(radice, /IT\d{3}E\d{8}/) : [],
      righe: linee.length,
      righe_con_consumo: conUnita.map((l) => ({ descr: testo(l, 'Descrizione'), q: testo(l, 'Quantita'), um: testo(l, 'UnitaMisura'), prezzo: testo(l, 'PrezzoTotale') })).slice(0, 15),
      periodo_su_righe: periodi.length, periodo_esempio: periodi[0] ?? null,
      altri_dati_gestionali: adg.slice(0, 25),
      causale: causale.slice(0, 400),
      descrizioni: descr.slice(0, 600),
      allegato_pdf: /<([a-z0-9]+:)?Attachment>/i.test(t),
    })
  }

  // riepilogo per fornitore
  const per = new Map<string, any[]>()
  for (const r of risultati) per.set(r.fornitore, [...(per.get(r.fornitore) ?? []), r])
  console.log(`\n⚡ Bollette riconosciute: ${risultati.length}\n`)
  for (const [forn, rr] of per) {
    const conPod = rr.filter((r) => r.pod.length || r.pdr.length).length
    const conCons = rr.filter((r) => r.righe_con_consumo.length).length
    const conPer = rr.filter((r) => r.periodo_su_righe).length
    const tipi = [...new Set(rr.flatMap((r) => r.altri_dati_gestionali.map((a: any) => a.tipo)).filter(Boolean))].slice(0, 12)
    console.log(`• ${forn} (${rr[0].piva}) — ${rr.length} fatture`)
    console.log(`    codice POD/PDR: ${conPod}/${rr.length}   consumi in kWh/Smc/m³: ${conCons}/${rr.length}   periodo sulle righe: ${conPer}/${rr.length}`)
    if (rr[0].dove_pod.length) console.log(`    POD sta in: ${rr[0].dove_pod.join(', ')}`)
    if (tipi.length) console.log(`    AltriDatiGestionali.TipoDato: ${tipi.join(', ')}`)
    const es = rr.find((r) => r.righe_con_consumo.length)
    if (es) console.log(`    es. consumo: ${es.righe_con_consumo.slice(0, 3).map((c: any) => `${c.q} ${c.um} "${(c.descr ?? '').slice(0, 40)}"`).join(' · ')}`)
  }
  return risultati
}

async function main() {
  const liste = await listeUtenze()
  const xml = await bollette()
  const out = join(process.cwd(), '..', 'esplorazione-utenze.json')
  writeFileSync(out, JSON.stringify({ quando: new Date().toISOString(), liste, bollette: xml }, null, 2))
  console.log(`\n✓ Salvato ${out}`)
}
main().catch((e) => { console.error('✗', e); process.exit(1) })
