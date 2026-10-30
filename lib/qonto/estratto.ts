/**
 * Estratto conto settimanale di TUTTI i conti Qonto, in Excel, per Alessandro.
 *
 * Deciso il 29/10/2026 (Dennis con Claudia): ogni lunedì mattina Alessandro
 * riceve per mail i movimenti della settimana prima, da lunedì 00:00 a
 * domenica 23:59 (ora italiana), di tutti i conti. Così non entra mai in
 * Qonto né nell'app, e Claudia non deve più scaricarli e girarglieli.
 *
 * Formato (approvato da Dennis il 30/10/2026):
 *   - "Riepilogo": per conto saldo iniziale, entrate, uscite, saldo finale;
 *   - "Movimenti": tutti i movimenti, un conto dopo l'altro.
 * Solo movimenti CONTABILIZZATI (status completed, per data di
 * contabilizzazione): quelli in attesa possono ancora cambiare o sparire, e la
 * settimana dopo li troverebbe due volte. I giroconti fra conti nostri sono
 * segnati come tali.
 *
 * I conti si leggono da Qonto a ogni invio: conti aggiunti, tolti o rinominati
 * entrano da soli. Si leggono anche quelli chiusi, che compaiono solo se hanno
 * movimenti nella settimana.
 *
 * Saldi: Qonto dà solo il saldo di adesso. Il saldo a fine settimana si ricava
 * togliendo i movimenti contabilizzati dopo la domenica; quello iniziale
 * togliendo anche quelli della settimana.
 */

import ExcelJS from 'exceljs'
import { qontoGet } from './client'
import { getContiQonto, mappaIban, mappaMovimento, type QontoTransaction } from './data'
import type { ContoQonto, MovimentoQonto } from '@/types/qonto'

const FUSO = 'Europe/Rome'

// ------------------------------------------------------------------
// Il periodo
// ------------------------------------------------------------------

/** "2026-10-26" → Date dell'istante in cui a Roma scocca la mezzanotte di quel giorno. */
export function mezzanotteRoma(giorno: string): Date {
  const [a, m, g] = giorno.split('-').map(Number)
  const utc = Date.UTC(a, m - 1, g)
  // scarto di Roma da UTC in quel giorno (1 o 2 ore, ora legale compresa)
  const parti = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, timeZoneName: 'shortOffset' }).formatToParts(
    new Date(utc + 12 * 3600_000),
  )
  const off = parti.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1'
  const ore = Number(/GMT([+-]\d+)/.exec(off)?.[1] ?? 1)
  return new Date(utc - ore * 3600_000)
}

const giornoRoma = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(d)

function aggiungiGiorni(giorno: string, n: number): string {
  const d = new Date(`${giorno}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export interface Settimana {
  /** lunedì, YYYY-MM-DD */
  dal: string
  /** domenica, YYYY-MM-DD */
  al: string
  inizio: Date
  /** escluso: lunedì successivo 00:00 */
  fine: Date
}

/** La settimana (lun–dom) che contiene `giorno`. */
export function settimanaDi(giorno: string): Settimana {
  const dow = new Date(`${giorno}T12:00:00Z`).getUTCDay() // 0 = domenica
  const dal = aggiungiGiorni(giorno, -((dow + 6) % 7))
  const al = aggiungiGiorni(dal, 6)
  return { dal, al, inizio: mezzanotteRoma(dal), fine: mezzanotteRoma(aggiungiGiorni(dal, 7)) }
}

/** La settimana appena finita, rispetto a `adesso`. */
export function settimanaPrecedente(adesso = new Date()): Settimana {
  return settimanaDi(aggiungiGiorni(giornoRoma(adesso), -7))
}

// ------------------------------------------------------------------
// I dati
// ------------------------------------------------------------------

/** Movimenti contabilizzati di un conto in [da, a), tutte le pagine. */
async function movimentiContabilizzati(conto: ContoQonto, da: Date, a: Date | null): Promise<QontoTransaction[]> {
  const out: QontoTransaction[] = []
  for (let pagina = 1; pagina < 200; pagina++) {
    const q = new URLSearchParams({
      bank_account_id: conto.id,
      settled_at_from: da.toISOString(),
      sort_by: 'settled_at:asc',
      per_page: '100',
      current_page: String(pagina),
    })
    if (a) q.set('settled_at_to', new Date(a.getTime() - 1).toISOString())
    q.append('status[]', 'completed')
    const res = await qontoGet<{ transactions: QontoTransaction[]; meta?: { next_page?: number | null } }>(
      `/transactions?${q.toString()}`,
    )
    out.push(...(res.transactions ?? []))
    if (!res.meta?.next_page) break
  }
  return out
}

export interface RigaConto {
  conto: ContoQonto
  saldoIniziale: number | null
  entrate: number
  uscite: number
  saldoFinale: number | null
  movimenti: MovimentoQonto[]
}

export interface Estratto {
  settimana: Settimana
  righe: RigaConto[]
}

const somma = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100
const centesimi = (n: number) => Math.round(n * 100) / 100

export async function preparaEstratto(settimana: Settimana): Promise<Estratto> {
  const conti = await getContiQonto({ ancheChiusi: true })
  const perIban = mappaIban(conti)
  const righe: RigaConto[] = []

  for (const conto of conti) {
    // In sequenza, non in parallelo: sono ~25 conti e Qonto limita le chiamate.
    const settimanali = await movimentiContabilizzati(conto, settimana.inizio, settimana.fine)
    const dopo = await movimentiContabilizzati(conto, settimana.fine, null)
    if (conto.chiuso && settimanali.length === 0) continue

    const movimenti = settimanali.map((t) => mappaMovimento(t, perIban))
    const netto = somma(movimenti.map((m) => m.importo))
    const nettoDopo = somma(dopo.map((t) => mappaMovimento(t, perIban).importo))
    const saldoFinale = conto.saldo == null ? null : centesimi(conto.saldo - nettoDopo)
    righe.push({
      conto,
      saldoIniziale: saldoFinale == null ? null : centesimi(saldoFinale - netto),
      entrate: somma(movimenti.filter((m) => m.importo > 0).map((m) => m.importo)),
      uscite: somma(movimenti.filter((m) => m.importo < 0).map((m) => -m.importo)),
      saldoFinale,
      movimenti,
    })
  }
  return { settimana, righe }
}

// ------------------------------------------------------------------
// L'Excel
// ------------------------------------------------------------------

const TIPI: Record<string, string> = {
  card: 'Carta',
  transfer: 'Bonifico',
  income: 'Entrata',
  direct_debit: 'Addebito diretto',
  direct_debit_collection: 'Incasso SDD',
  direct_debit_hold: 'Addebito diretto',
  qonto_fee: 'Commissione Qonto',
  cheque: 'Assegno',
  recall: 'Richiamo',
  swift_income: 'Entrata SWIFT',
  pagopa_payment: 'PagoPA',
  f24: 'F24',
  financing_installment: 'Rata finanziamento',
}
export const tipoLeggibile = (t: string) => TIPI[t] ?? t

const nomeConto = (c: ContoQonto) => (c.principale ? `Principale – ${c.nome}` : c.nomeQonto || c.nome)
const dataIt = (giorno: string) => giorno.split('-').reverse().join('/')
const EURO = '#,##0.00 [$€-410];[Red]-#,##0.00 [$€-410]'
const BLU = 'FF00728F'

function intestazione(ws: ExcelJS.Worksheet, riga: number) {
  const r = ws.getRow(riga)
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  r.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLU } }
    c.alignment = { vertical: 'middle', wrapText: true }
  })
  r.height = 20
}

export async function generaXlsxEstratto(e: Estratto): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'App Mirafiori'
  const periodo = `dal ${dataIt(e.settimana.dal)} al ${dataIt(e.settimana.al)}`

  // --- Riepilogo ---
  const r = wb.addWorksheet('Riepilogo', { views: [{ state: 'frozen', ySplit: 3 }] })
  r.columns = [{ width: 42 }, { width: 30 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 11 }]
  r.getCell('A1').value = `Estratto conti Qonto – Cooperativa Sociale Mirafiori – ${periodo}`
  r.getCell('A1').font = { bold: true, size: 13 }
  r.addRow([])
  r.addRow(['Conto', 'IBAN', 'Saldo iniziale', 'Entrate', 'Uscite', 'Saldo finale', 'Movimenti'])
  intestazione(r, 3)
  for (const x of e.righe) {
    r.addRow([nomeConto(x.conto), x.conto.iban, x.saldoIniziale, x.entrate, x.uscite, x.saldoFinale, x.movimenti.length])
  }
  const ultima = r.rowCount
  const tot = r.addRow([
    'Totale', '',
    { formula: `SUM(C4:C${ultima})` }, { formula: `SUM(D4:D${ultima})` }, { formula: `SUM(E4:E${ultima})` },
    { formula: `SUM(F4:F${ultima})` }, { formula: `SUM(G4:G${ultima})` },
  ])
  tot.font = { bold: true }
  tot.eachCell((c) => (c.border = { top: { style: 'thin' } }))
  for (const col of ['C', 'D', 'E', 'F']) r.getColumn(col).numFmt = EURO
  r.addRow([])
  const nota = r.addRow(['Solo movimenti contabilizzati, per data di contabilizzazione. Le entrate e le uscite comprendono i giroconti fra conti della cooperativa, segnati nel foglio Movimenti.'])
  r.mergeCells(`A${nota.number}:G${nota.number}`)
  nota.getCell(1).font = { italic: true, color: { argb: 'FF666666' } }
  nota.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  nota.height = 30
  r.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  // --- Movimenti ---
  const m = wb.addWorksheet('Movimenti', { views: [{ state: 'frozen', ySplit: 1 }] })
  m.columns = [
    { header: 'Data', width: 12 },
    { header: 'Conto', width: 34 },
    { header: 'Controparte', width: 36 },
    { header: 'Tipo', width: 16 },
    { header: 'Entrata', width: 13 },
    { header: 'Uscita', width: 13 },
    { header: 'Nota', width: 34 },
    { header: 'Riferimento', width: 30 },
    { header: 'Giroconto', width: 10 },
    { header: 'Scontrino', width: 10 },
  ]
  intestazione(m, 1)
  for (const x of e.righe) {
    for (const mv of x.movimenti) {
      const giorno = giornoRoma(new Date(mv.data))
      m.addRow([
        new Date(`${giorno}T12:00:00Z`),
        nomeConto(x.conto),
        mv.controparte,
        tipoLeggibile(mv.tipo) + (mv.carta ? ` *${mv.carta}` : ''),
        mv.importo > 0 ? mv.importo : null,
        mv.importo < 0 ? -mv.importo : null,
        mv.nota ?? '',
        mv.riferimento ?? '',
        mv.giroconto ? 'Sì' : '',
        mv.importo < 0 && !mv.giroconto ? (mv.conAllegato ? 'Sì' : 'No') : '',
      ])
    }
  }
  m.getColumn(1).numFmt = 'dd/mm/yyyy'
  m.getColumn(5).numFmt = EURO
  m.getColumn(6).numFmt = EURO
  m.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  if (m.rowCount > 1) m.autoFilter = { from: 'A1', to: `J${m.rowCount}` }

  return Buffer.from(await wb.xlsx.writeBuffer())
}

export const nomeFileEstratto = (s: Settimana) => `Estratto Qonto ${s.dal} - ${s.al}.xlsx`
