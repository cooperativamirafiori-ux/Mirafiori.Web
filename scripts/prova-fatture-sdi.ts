/**
 * Prova del lettore delle fatture elettroniche sui file veri della cartella
 * SharePoint. SOLO LETTURA: non sposta file e non scrive nel database.
 *
 * Stampa cosa ha capito di ogni fattura, un riepilogo e i casi da guardare,
 * e salva tutto in ../prova-fatture-sdi.csv (cartella del progetto, fuori da git; va lanciato da web/).
 *
 * Uso (dalla cartella web/):
 *   npx --yes tsx scripts/prova-fatture-sdi.ts
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID. Cartella: SP_CARTELLA_FATTURE_SDI (default "General/fatture da SDI").
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  eRicevutaSdi,
  leggiFatturaSdi,
  leggiMetadatiSdi,
  type FatturaSdi,
} from '../lib/pagamenti/sdi/fattura'

for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const CARTELLA = process.env.SP_CARTELLA_FATTURE_SDI || 'General/fatture da SDI'
const SITE = process.env.SHAREPOINT_SITE_ID!

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
  if (!r.ok) throw new Error(`${path.slice(0, 80)} → ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r
}

const euro = (n: number | null) => (n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

async function main() {
  const percorso = encodeURIComponent(CARTELLA).replace(/%2F/g, '/')
  let url: string | undefined = `/sites/${SITE}/drive/root:/${percorso}:/children?$select=id,name,size,file&$top=200`
  const file: Array<{ id: string; name: string; size: number }> = []
  while (url) {
    const j: any = await (await graph(url)).json()
    for (const f of j.value) if (f.file) file.push(f)
    url = j['@odata.nextLink']
  }
  console.log(`Cartella "${CARTELLA}": ${file.length} file\n`)

  const scarica = async (id: string) =>
    new Uint8Array(await (await graph(`/sites/${SITE}/drive/items/${id}/content`)).arrayBuffer())

  // 1. Le ricevute SDI: nome file → identificativo
  const idSdi = new Map<string, string>()
  for (const f of file.filter((f) => eRicevutaSdi(f.name))) {
    const md = leggiMetadatiSdi(await scarica(f.id))
    if (md) idSdi.set(md.nomeFile.toLowerCase(), md.identificativoSdi)
  }

  // 2. Le fatture
  const lette: Array<FatturaSdi & { idSdi: string | null }> = []
  const errori: Array<[string, string]> = []
  for (const f of file.filter((f) => !eRicevutaSdi(f.name))) {
    try {
      const pulito = f.name.replace(/\s*\(\d+\)/, '').toLowerCase()
      for (const x of leggiFatturaSdi(f.name, await scarica(f.id))) {
        lette.push({ ...x, idSdi: idSdi.get(pulito) ?? idSdi.get(pulito.replace(/\.p7m$/, '')) ?? null })
      }
    } catch (e: any) {
      errori.push([f.name, e.message])
    }
  }

  // 3. Doppioni: stessa P.IVA + numero + data
  const chiave = (x: FatturaSdi) => `${x.piva}|${x.numero}|${x.data}`
  const visti = new Map<string, number>()
  for (const x of lette) visti.set(chiave(x), (visti.get(chiave(x)) ?? 0) + 1)
  const unici = lette.filter((x, i) => lette.findIndex((y) => chiave(y) === chiave(x)) === i)

  // 4. Stampa
  for (const x of unici.sort((a, b) => a.data.localeCompare(b.data))) {
    const fam = [...new Set(x.rate.map((r) => r.famiglia))].join('+') || 'nessuna rata'
    const scad = x.rate.map((r) => r.scadenza).filter(Boolean).join(', ') || '—'
    const iban = [...new Set(x.rate.map((r) => r.iban).filter(Boolean))].join(', ') || '—'
    console.log(
      `${x.data}  ${x.tipoDocumento} ${x.natura.padEnd(12)} ${x.fornitore.slice(0, 32).padEnd(32)} n.${x.numero.slice(0, 14).padEnd(14)} ` +
        `${euro(x.daPagare).padStart(10)} €  ${fam.padEnd(10)} scad ${scad}  IBAN ${iban}${x.allegati.length ? `  📎${x.allegati.length}` : ''}`,
    )
  }

  const conta = (f: (x: (typeof unici)[number]) => string) =>
    Object.entries(unici.reduce<Record<string, number>>((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {}))
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ')

  console.log(`\n=== RIEPILOGO ===`)
  console.log(`fatture lette: ${lette.length} · uniche: ${unici.length} · doppioni: ${lette.length - unici.length} · file illeggibili: ${errori.length}`)
  console.log(`per natura:    ${conta((x) => x.natura)}`)
  console.log(`per pagamento: ${conta((x) => [...new Set(x.rate.map((r) => r.famiglia))].join('+') || 'nessuna rata')}`)
  console.log(`con identificativo SDI: ${unici.filter((x) => x.idSdi).length}/${unici.length} · con PDF allegato: ${unici.filter((x) => x.allegati.length).length}`)
  const bonificoSenzaIban = unici.filter((x) => x.natura === 'fattura' && x.rate.some((r) => r.famiglia === 'bonifico') && !x.rate.some((r) => r.iban))
  console.log(`da pagare con bonifico ma SENZA IBAN: ${bonificoSenzaIban.length}${bonificoSenzaIban.length ? ' → ' + bonificoSenzaIban.map((x) => x.fornitore).join(', ') : ''}`)

  // IBAN diversi per lo stesso fornitore
  const perFornitore = new Map<string, Set<string>>()
  for (const x of unici) for (const r of x.rate) if (r.iban) (perFornitore.get(x.piva ?? x.fornitore) ?? perFornitore.set(x.piva ?? x.fornitore, new Set()).get(x.piva ?? x.fornitore)!).add(r.iban)
  const piuIban = [...perFornitore].filter(([, s]) => s.size > 1)
  console.log(`fornitori con più IBAN diversi: ${piuIban.length}${piuIban.length ? ' → ' + piuIban.map(([p, s]) => `${p} (${s.size})`).join(', ') : ''}`)
  if (errori.length) {
    console.log(`\n=== FILE ILLEGGIBILI ===`)
    for (const [n, e] of errori) console.log(`  ${n}: ${e}`)
  }

  const righe = [
    ['data', 'tipo', 'natura', 'fornitore', 'piva', 'numero', 'totale', 'ritenuta', 'da_pagare', 'modalita', 'famiglia', 'scadenze', 'iban', 'id_sdi', 'allegati', 'riferimenti', 'descrizione', 'file'].join(';'),
    ...unici.map((x) =>
      [x.data, x.tipoDocumento, x.natura, x.fornitore, x.piva, x.numero, x.totale, x.ritenuta, x.daPagare,
        x.rate.map((r) => r.modalita).join(' '), x.rate.map((r) => r.famiglia).join(' '),
        x.rate.map((r) => `${r.scadenza} ${r.importo}`).join(' | '), [...new Set(x.rate.map((r) => r.iban).filter(Boolean))].join(' '),
        x.idSdi, x.allegati.map((a) => a.nome).join(' '), x.riferimenti.join(' | '), x.descrizione, x.nomeFile].map(csv).join(';'),
    ),
  ]
  const out = join(process.cwd(), '..', 'prova-fatture-sdi.csv')
  writeFileSync(out, '﻿' + righe.join('\n'))
  console.log(`\nDettaglio in: ${out}`)
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
