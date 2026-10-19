/**
 * Preventivi — il documento.
 *
 * Si genera un .xlsx con exceljs, sullo schema del Preventivo_MASTER di Andrea
 * (protocollo in alto, "costo dell'intervento a favore di", voci per sezione,
 * totale spese, IVA 5%, spese F.I.C., totale mensile, firma della Presidente),
 * e lo si converte in PDF con Graph (`?format=pdf`), come il foglio ore: nessun
 * motore di stampa su Vercel.
 *
 * Dove finiscono i file (scelta di Andrea, 19/10/2026): solo i preventivi
 * ACCETTATI si archiviano, in "Preventivi accettati/<cartella>" dentro la
 * cartella Preventivi di sempre. Gli altri vivono nell'app e il PDF si rigenera
 * quando serve; il file di lavoro della conversione si cancella subito.
 *
 *   SP_PREVENTIVI_DRIVE_ID  drive del sito "docs" (Documenti condivisi)
 *   SP_PREVENTIVI_FOLDER    default "AMMINISTRAZIONE/CLIENTI/Preventivi"
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { graphDelete, graphGetBinary, graphGetOrNull, graphPost, graphPutBinary } from '@/lib/core/graph'
import { MODELLI, REGIMI_IVA, UNITA, numeroPerFile, type Preventivo } from '@/types/preventivi'
import { dataIt, importoRiga, iniziali, numero, quantitaMensile, totali } from './calcoli'

const FIRMA = () => process.env.PREVENTIVI_FIRMA || 'MELISSARI Stefania'
const RADICE = () => (process.env.SP_PREVENTIVI_FOLDER || 'AMMINISTRAZIONE/CLIENTI/Preventivi').replace(/^\/+|\/+$/g, '')
const CARTELLA_ACCETTATI = 'Preventivi accettati'
const CT_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const BLU = 'FF00728F'

function driveId(): string {
  const id = process.env.SP_PREVENTIVI_DRIVE_ID
  if (!id) throw new Error('Manca SP_PREVENTIVI_DRIVE_ID: il drive dove stanno i preventivi')
  return id
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')
const pulisci = (s: string) =>
  s.replace(/[\\/:*?"<>|#%~&{}]/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').slice(0, 90) || 'documento'

/** Nome del file: protocollo + iniziali, mai il nome intero del ragazzo. */
export function nomeFile(p: Preventivo, est: 'pdf' | 'xlsx'): string {
  const num = p.numero ? numeroPerFile(p.numero) : `BOZZA-${p.spItemId}`
  const rev = p.revisione > 1 ? ` rev${p.revisione}` : ''
  const ini = iniziali(p.beneficiario)
  return `${pulisci(`${num}${rev}${ini ? ` ${ini}` : ''}`)}.${est}`
}

// ============================================================
// Il foglio
// ============================================================

export async function generaXlsx(p: Preventivo): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'App Mirafiori — Preventivi'
  const ws = wb.addWorksheet('Preventivo', {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
    },
    headerFooter: { oddFooter: '&L&8Cooperativa Sociale Mirafiori&R&8Pagina &P di &N' },
  })
  ws.columns = [
    { key: 'voce', width: 44 },
    { key: 'qta', width: 11 },
    { key: 'unita', width: 9 },
    { key: 'prezzo', width: 12 },
    { key: 'iva', width: 13 },
    { key: 'importo', width: 14 },
  ]
  const t = totali(p.righe, p.dal, p.al)
  const bozza = p.stato === 'bozza' || !p.numero

  // Logo + protocollo
  try {
    const logo = wb.addImage({ buffer: readFileSync(join(process.cwd(), 'public', 'logo-mirafiori.png')) as any, extension: 'png' })
    ws.addImage(logo, { tl: { col: 0, row: 0 }, ext: { width: 170, height: 86 } })
  } catch {
    ws.getCell('A1').value = 'COOPERATIVA SOCIALE MIRAFIORI'
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: BLU } }
  }
  ws.getRow(1).height = 22
  ws.mergeCells('D1:F1')
  ws.getCell('D1').value = 'Allegato al N° di Protocollo:'
  ws.getCell('D1').alignment = { horizontal: 'right' }
  ws.getCell('D1').font = { size: 9, color: { argb: 'FF555555' } }
  ws.mergeCells('D2:F2')
  ws.getCell('D2').value = bozza ? 'BOZZA — non valida' : `${p.numero}${p.revisione > 1 ? ` (rev. ${p.revisione})` : ''}`
  ws.getCell('D2').alignment = { horizontal: 'right' }
  ws.getCell('D2').font = { bold: true, size: 13, color: { argb: bozza ? 'FFC0392B' : BLU } }
  ws.getRow(5).height = 8

  let r = 6
  const riga = (etichetta: string, valore: string, grassetto = false) => {
    if (!valore) return
    ws.getCell(`A${r}`).value = etichetta
    ws.getCell(`A${r}`).font = { color: { argb: 'FF555555' } }
    ws.mergeCells(`B${r}:F${r}`)
    ws.getCell(`B${r}`).value = valore
    ws.getCell(`B${r}`).font = { bold: grassetto }
    ws.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' }
    r++
  }
  const dest = p.destinatario
  riga('Spett.le', dest.ente, true)
  if (dest.nome) riga('Alla c.a. di', [dest.ruolo, dest.nome].filter(Boolean).join(' '))
  r++
  riga('Oggetto', p.oggetto || `Preventivo — ${MODELLI[p.modello]}`, true)
  riga('Costo dell’intervento a favore di', p.beneficiario, true)
  riga(p.modello === 'comunita' || p.modello === 'artemisia' ? 'Tipo di intervento' : 'Tipo progetto', p.tipoProgetto)
  riga('Ripartizione', p.ripartizione)
  riga('Periodo', p.dal && p.al ? `dal ${dataIt(p.dal)} al ${dataIt(p.al)}${t.mesi ? ` (${numero(t.mesi)} mesi)` : ''}` : '')
  r++

  // Intestazione voci
  const testa = ws.getRow(r)
  testa.values = ['Voce', 'Al mese', 'Unità', 'Prezzo', 'IVA', 'Importo']
  testa.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLU } }
    c.alignment = { horizontal: Number(c.col) === 1 ? 'left' : 'center', vertical: 'middle' }
  })
  r++

  for (const g of t.perGruppo) {
    ws.mergeCells(`A${r}:F${r}`)
    ws.getCell(`A${r}`).value = g.gruppo
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: BLU } }
    ws.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4F7' } }
    r++
    for (const x of p.righe.filter((y) => y.gruppo === g.gruppo)) {
      const dettagli = [
        x.perSettimana != null ? `${numero(x.perSettimana)} ${UNITA[x.unita].plurale} a settimana` : '',
        x.unita === 'km'
          ? `${x.percorso ? `da/a ${x.percorso}: ` : ''}${numero(x.accompagnamenti)} accompagnamenti × ${numero(x.kmAccompagnamento)} km (si fatturano solo quelli svolti)`
          : '',
        x.nota ?? '',
      ].filter(Boolean)
      const row = ws.getRow(r)
      row.values = [
        dettagli.length ? `${x.voce}\n${dettagli.join(' · ')}` : x.voce,
        quantitaMensile(x),
        UNITA[x.unita].plurale,
        x.prezzo,
        x.iva === 'fic' ? 'F.I.C.' : REGIMI_IVA[x.iva].etichetta,
        importoRiga(x),
      ]
      row.getCell(1).alignment = { wrapText: true, vertical: 'top' }
      row.getCell(2).numFmt = '#,##0.##'
      row.getCell(4).numFmt = '€ #,##0.00'
      row.getCell(6).numFmt = '€ #,##0.00'
      ;[2, 3, 4, 5, 6].forEach((c) => (row.getCell(c).alignment = { horizontal: c === 5 || c === 3 ? 'center' : 'right', vertical: 'top' }))
      row.getCell(5).font = { size: 9 }
      if (dettagli.length) row.height = 15 * (1 + Math.ceil(dettagli.join(' · ').length / 60))
      row.eachCell({ includeEmpty: true }, (c) => (c.border = { bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } } }))
      r++
    }
  }
  r++

  // Totali
  const totale = (etichetta: string, valore: number, forte = false) => {
    ws.mergeCells(`A${r}:E${r}`)
    ws.getCell(`A${r}`).value = etichetta
    ws.getCell(`A${r}`).alignment = { horizontal: 'right' }
    ws.getCell(`A${r}`).font = { bold: forte }
    ws.getCell(`F${r}`).value = valore
    ws.getCell(`F${r}`).numFmt = '€ #,##0.00'
    ws.getCell(`F${r}`).font = { bold: forte }
    if (forte) ws.getCell(`F${r}`).border = { top: { style: 'thin' } }
    r++
  }
  totale('Totale spese', t.spese)
  if (t.imponibile.iva5) totale('IVA 5%', arrotondaIva(t.imponibile.iva5, 5))
  if (t.imponibile.iva22) totale('IVA 22%', arrotondaIva(t.imponibile.iva22, 22))
  if (t.fic) totale('+ Spese F.I.C. (escluse ex art. 15 DPR 633/72)', t.fic)
  totale('Costo totale mensile dell’intervento (IVA compresa)', t.mensileIvato, true)
  totale('Totale a pagare (senza IVA)', t.mensileSenzaIva)
  if (t.mesi) totale(`Totale sul periodo (${numero(t.mesi)} mesi, IVA compresa)`, t.periodo, true)

  if (p.note) {
    r++
    ws.mergeCells(`A${r}:F${r}`)
    ws.getCell(`A${r}`).value = p.note
    ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' }
    ws.getRow(r).height = 15 * Math.max(1, Math.ceil(p.note.length / 95) + (p.note.match(/\n/g)?.length ?? 0))
    r++
  }

  r += 2
  ws.getCell(`A${r}`).value = `Torino, ${dataIt(p.emessoIl ?? '') || dataIt(new Date().toISOString())}`
  ws.mergeCells(`D${r}:F${r}`)
  ws.getCell(`D${r}`).value = 'Il Presidente'
  ws.getCell(`D${r}`).alignment = { horizontal: 'center' }
  r++
  ws.mergeCells(`D${r}:F${r}`)
  ws.getCell(`D${r}`).value = FIRMA()
  ws.getCell(`D${r}`).alignment = { horizontal: 'center' }
  ws.getCell(`D${r}`).font = { bold: true }

  ws.pageSetup.printArea = `A1:F${r}`
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const arrotondaIva = (imponibile: number, aliquota: number) => Math.round(imponibile * aliquota) / 100

// ============================================================
// Conversione e archivio
// ============================================================

async function assicuraCartella(drive: string, rel: string): Promise<void> {
  let corrente = ''
  for (const seg of rel.split('/').filter(Boolean)) {
    const genitore = corrente
    corrente = corrente ? `${corrente}/${seg}` : seg
    if (await graphGetOrNull(`/drives/${drive}/root:/${encodePath(corrente)}?$select=id`)) continue
    const endpoint = genitore ? `/drives/${drive}/root:/${encodePath(genitore)}:/children` : `/drives/${drive}/root/children`
    await graphPost(endpoint, { name: seg, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }).catch(async (e) => {
      if (!(await graphGetOrNull(`/drives/${drive}/root:/${encodePath(corrente)}?$select=id`))) throw e
    })
  }
}

/** Il PDF del preventivo, così com'è adesso. */
export async function pdfPreventivo(p: Preventivo): Promise<Buffer> {
  const drive = driveId()
  const lavoro = `${RADICE()}/_app`
  await assicuraCartella(drive, lavoro)
  const xlsx = await generaXlsx(p)
  const nome = `${p.spItemId}-${Date.now()}.xlsx`
  const item = await graphPutBinary<{ id: string }>(
    `/drives/${drive}/root:/${encodePath(`${lavoro}/${nome}`)}:/content`,
    xlsx,
    CT_XLSX,
  )
  try {
    return await graphGetBinary(`/drives/${drive}/items/${item.id}/content?format=pdf`)
  } finally {
    await graphDelete(`/drives/${drive}/items/${item.id}`).catch((e) => console.error('[preventivi] file di lavoro non cancellato:', e))
  }
}

/** Archivia il PDF di un preventivo accettato e ritorna il link al file. */
export async function archiviaAccettato(p: Preventivo, pdf: Buffer): Promise<string> {
  const drive = driveId()
  const cartella = `${RADICE()}/${CARTELLA_ACCETTATI}/${pulisci(p.cartella || 'Altro')}`
  await assicuraCartella(drive, cartella)
  const res = await graphPutBinary<{ webUrl: string }>(
    `/drives/${drive}/root:/${encodePath(`${cartella}/${nomeFile(p, 'pdf')}`)}:/content`,
    pdf,
    'application/pdf',
  )
  return res.webUrl ?? ''
}

