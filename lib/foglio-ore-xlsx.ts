/**
 * Generazione del foglio ore mensile in Excel (.xlsx) a partire dalle timbrature,
 * e pubblicazione nella cartella personale del dipendente (SharePoint).
 *
 * Scelta implementativa: si produce un workbook con VALORI GIÀ CALCOLATI
 * (nessuna formula), che riproduce il layout del foglio attuale — griglia
 * giornaliera + foglio "Rendicontazione" con ore per servizio e per centro di
 * costo. Approccio robusto e indipendente dalle formule ad array del template.
 * Se in futuro si vorrà l'esatto template con formule vive, si potrà sostituire
 * questa funzione mantenendo la stessa interfaccia.
 */

import ExcelJS from 'exceljs'
import {
  listTimbrature,
  riepilogoPeriodo,
  profiloVigente,
  primoUltimoGiorno,
  monteToSettimana,
} from '@/lib/timbrature'
import type { Dipendente } from '@/types/timbrature'
import {
  graphGet,
  graphGetOrNull,
  graphPost,
  graphPutBinary,
} from '@/lib/graph'

const GIORNI_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MESI_IT = ['', 'GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE']

const HEAD_FILL = '1F4E79'

function giornoNome(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return GIORNI_IT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** Costruisce il buffer .xlsx del foglio ore per (dipendente, anno, mese). */
export async function generaFoglioOreBuffer(
  dip: Dipendente,
  anno: number,
  mese: number,
): Promise<Buffer> {
  const { from, to } = primoUltimoGiorno(anno, mese)
  const [timbrature, riepilogo, prof] = await Promise.all([
    listTimbrature(dip.id, from, to),
    riepilogoPeriodo(dip.id, from, to),
    profiloVigente(dip.id, from),
  ])
  const monte = monteToSettimana(prof)
  const profiloSett = monte[1] + monte[2] + monte[3] + monte[4] + monte[5] + monte[6] + monte[7]

  const wb = new ExcelJS.Workbook()
  wb.creator = 'App Mirafiori — Timbrature'
  wb.created = new Date()

  // ---------------------------------------------------------------- Foglio Ore
  const ws = wb.addWorksheet('Foglio Ore', { views: [{ state: 'frozen', ySplit: 8 }] })
  ws.columns = [
    { key: 'data', width: 12 },
    { key: 'giorno', width: 12 },
    { key: 'festivita', width: 16 },
    { key: 'attese', width: 10 },
    { key: 'servizio', width: 30 },
    { key: 'centro', width: 8 },
    { key: 'ingresso', width: 10 },
    { key: 'uscita', width: 10 },
    { key: 'ore', width: 8 },
    { key: 'note', width: 24 },
  ]

  ws.mergeCells('A1:J1')
  const titolo = ws.getCell('A1')
  titolo.value = 'FOGLIO ORE'
  titolo.font = { bold: true, size: 16, color: { argb: 'FF' + HEAD_FILL } }
  ws.getCell('A3').value = 'Nominativo:'
  ws.getCell('B3').value = dip.cognomeNome
  ws.getCell('A4').value = 'Referente:'
  ws.getCell('B4').value = dip.referenteEmail ?? ''
  ws.getCell('E3').value = 'Mese:'
  ws.getCell('F3').value = `${MESI_IT[mese]} ${anno}`
  ws.getCell('E4').value = 'Profilo orario settimanale:'
  ws.getCell('F4').value = profiloSett
  ws.getCell('H3').value = 'Generato il:'
  ws.getCell('I3').value = new Date().toLocaleDateString('it-IT')
  ;['A3', 'A4', 'E3', 'E4', 'H3'].forEach((c) => (ws.getCell(c).font = { color: { argb: 'FF555555' } }))
  ws.getCell('B3').font = { bold: true }

  const headerRow = 7
  const headers = ['Data', 'Giorno', 'Festività', 'Ore attese', 'Servizio', 'C.costo', 'Ingresso', 'Uscita', 'Ore', 'Note']
  const hr = ws.getRow(headerRow)
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1)
    c.value = h
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + HEAD_FILL } }
    c.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  const byDay = new Map<string, typeof timbrature>()
  for (const t of timbrature) {
    const arr = byDay.get(t.data) ?? []
    arr.push(t)
    byDay.set(t.data, arr)
  }

  let r = headerRow + 1
  for (const g of riepilogo.giorni) {
    const righe = byDay.get(g.data) ?? []
    const dataFmt = g.data.split('-').reverse().join('/')
    const nGiorno = giornoNome(g.data)

    if (righe.length === 0) {
      const row = ws.getRow(r)
      row.getCell(1).value = dataFmt
      row.getCell(2).value = nGiorno
      row.getCell(3).value = g.festivitaNome ?? ''
      row.getCell(4).value = g.oreAttese
      if (g.festivo) row.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2DCDB' } }))
      else if (nGiorno === 'Sabato' || nGiorno === 'Domenica') row.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }))
      r++
      continue
    }

    righe.forEach((t, idx) => {
      const row = ws.getRow(r)
      if (idx === 0) {
        row.getCell(1).value = dataFmt
        row.getCell(2).value = nGiorno
        row.getCell(3).value = g.festivitaNome ?? ''
        row.getCell(4).value = g.oreAttese
      }
      row.getCell(5).value = t.mutua ? `${t.servizioNome} (Mutua)` : t.servizioNome
      row.getCell(6).value = t.centroCosto
      row.getCell(7).value = t.oraInizio ?? ''
      row.getCell(8).value = t.oraFine ?? ''
      row.getCell(9).value = t.ore
      row.getCell(10).value = t.note ?? ''
      if (t.tipoVoce === 'giustificativo') row.getCell(5).font = { italic: true, color: { argb: 'FF7030A0' } }
      r++
    })
  }

  // Totali
  r += 1
  const setTot = (label: string, val: number, bold = false) => {
    ws.getCell(`H${r}`).value = label
    ws.getCell(`H${r}`).font = { bold: true, color: { argb: 'FF555555' } }
    const c = ws.getCell(`I${r}`)
    c.value = val
    c.font = { bold }
    r++
  }
  setTot('Ore attese mese:', riepilogo.oreAttese)
  setTot('Ore lavorate:', riepilogo.oreLavorate, true)
  setTot('Ore giustificativo:', riepilogo.oreGiustificativo)
  setTot('Differenza:', riepilogo.scostamento, true)
  if (riepilogo.scostamento < 0) {
    ws.getCell(`H${r}`).value =
      'Le ore rendicontate sono inferiori alle ore lavorative del mese. Giustificare le ore mancanti.'
    ws.getCell(`H${r}`).font = { italic: true, color: { argb: 'FFC00000' } }
  }

  // -------------------------------------------------------------- Rendicontazione
  const rc = wb.addWorksheet('Rendicontazione')
  rc.columns = [
    { key: 'a', width: 34 },
    { key: 'b', width: 12 },
    { key: 'c', width: 12 },
  ]
  const perServizio = new Map<string, { centro: number; ore: number }>()
  const perCentro = new Map<number, number>()
  const perGiust = new Map<string, number>()
  for (const t of timbrature) {
    if (t.tipoVoce === 'giustificativo') {
      perGiust.set(t.servizioNome!, (perGiust.get(t.servizioNome!) ?? 0) + t.ore)
    } else {
      const s = perServizio.get(t.servizioNome!) ?? { centro: t.centroCosto!, ore: 0 }
      s.ore += t.ore
      perServizio.set(t.servizioNome!, s)
      perCentro.set(t.centroCosto!, (perCentro.get(t.centroCosto!) ?? 0) + t.ore)
    }
  }

  let rr = 1
  const sectionHead = (t: string) => {
    const c = rc.getCell(`A${rr}`)
    c.value = t
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + HEAD_FILL } }
    rc.getCell(`B${rr}`).fill = c.fill
    rc.getCell(`C${rr}`).fill = c.fill
    rr++
  }
  sectionHead('Ore per servizio')
  rc.getCell(`A${rr}`).value = 'Servizio'
  rc.getCell(`B${rr}`).value = 'C.costo'
  rc.getCell(`C${rr}`).value = 'Ore'
  rc.getRow(rr).font = { bold: true }
  rr++
  ;[...perServizio.entries()].sort((a, b) => a[1].centro - b[1].centro).forEach(([nome, v]) => {
    rc.getCell(`A${rr}`).value = nome
    rc.getCell(`B${rr}`).value = v.centro
    rc.getCell(`C${rr}`).value = v.ore
    rr++
  })
  rr++
  sectionHead('Ore per centro di costo')
  ;[...perCentro.entries()].sort((a, b) => a[0] - b[0]).forEach(([centro, ore]) => {
    rc.getCell(`A${rr}`).value = `Centro ${centro}`
    rc.getCell(`C${rr}`).value = ore
    rr++
  })
  if (perGiust.size) {
    rr++
    sectionHead('Giustificativi')
    ;[...perGiust.entries()].forEach(([nome, ore]) => {
      rc.getCell(`A${rr}`).value = nome
      rc.getCell(`C${rr}`).value = ore
      rr++
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as ArrayBuffer)
}

// ---------------------------------------------------------------- pubblicazione

const SITE = () => process.env.SHAREPOINT_SITE_ID!
let _driveId: string | null = null
async function driveId(): Promise<string> {
  if (process.env.SP_RU_DRIVE_ID) return process.env.SP_RU_DRIVE_ID
  if (_driveId) return _driveId
  const d = await graphGet<{ id: string }>(`/sites/${SITE()}/drive?$select=id`)
  _driveId = d.id
  return d.id
}
function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}
async function ensureFolder(drive: string, fullPath: string): Promise<void> {
  const segs = fullPath.split('/').filter(Boolean)
  let parent = ''
  for (const seg of segs) {
    const cur = parent ? `${parent}/${seg}` : seg
    const ex = await graphGetOrNull<{ id: string }>(`/drives/${drive}/root:/${encodePath(cur)}?$select=id`)
    if (!ex) {
      const ep = parent
        ? `/drives/${drive}/root:/${encodePath(parent)}:/children`
        : `/drives/${drive}/root/children`
      await graphPost(ep, { name: seg, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
    }
    parent = cur
  }
}

/**
 * Genera il foglio ore e lo carica nella cartella personale del dipendente.
 * Prova prima la cartella personale RU (match per email); se il dipendente non
 * è nell'anagrafica RU, usa la cartella di ripiego "Foglio Ore/<Nominativo>".
 * Ritorna l'URL SharePoint del file.
 */
export async function pubblicaFoglioOre(
  dip: Dipendente,
  anno: number,
  mese: number,
): Promise<string> {
  const buffer = await generaFoglioOreBuffer(dip, anno, mese)
  const filename = `FoglioOre_${dip.cognomeNome.replace(/[^\w]+/g, '_')}_${anno}-${String(mese).padStart(2, '0')}.xlsx`
  const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  // 1) prova la cartella personale RU (match per email aziendale/personale)
  try {
    const ru = await import('@/lib/risorse-umane')
    const dipendenti = await ru.getItems('dipendenti')
    const match = dipendenti.find(
      (d: any) =>
        String(d.MailAziendale ?? '').toLowerCase() === dip.email.toLowerCase() ||
        String(d.MailPersonale ?? '').toLowerCase() === dip.email.toLowerCase(),
    )
    if (match) {
      const doc = await ru.caricaDocumentoDipendente(String(match.spItemId), filename, buffer, contentType)
      return doc.url
    }
  } catch (e) {
    console.warn('[foglio-ore] match cartella RU fallito, uso ripiego:', e)
  }

  // 2) ripiego: document library del sito, cartella "Foglio Ore/<Nominativo>"
  const drive = await driveId()
  const rel = `Foglio Ore/${dip.cognomeNome.replace(/[\\/:*?"<>|]+/g, ' ').trim()}`
  await ensureFolder(drive, rel)
  const res = await graphPutBinary<{ webUrl: string }>(
    `/drives/${drive}/root:/${encodePath(`${rel}/${filename}`)}:/content`,
    buffer,
    contentType,
  )
  return res.webUrl
}
