/**
 * Esporta in Excel, dal browser, quello che l'utente ha sotto gli occhi.
 *
 * Nessuna chiamata al server: le righe sono già in pagina (con la ricerca già
 * applicata), si costruisce il file con ExcelJS e si scarica. ExcelJS si carica
 * solo al clic (import dinamico), così non pesa sull'apertura della pagina.
 *
 * Uso: esportaXlsx('flussi-fatture-da-pagare', [{ nome: 'Da pagare', colonne, righe }])
 * Le colonne dicono il tipo: 'data' accetta "YYYY-MM-DD" (o ISO completo) e
 * diventa una vera data Excel; 'euro' e 'numero' diventano numeri.
 */

export type TipoColonna = 'testo' | 'data' | 'euro' | 'numero'

export interface Colonna<R> {
  titolo: string
  valore: (r: R) => unknown
  tipo?: TipoColonna
  larghezza?: number
}

export interface Foglio<R = any> {
  nome: string
  colonne: Colonna<R>[]
  righe: R[]
}

const HEAD_FILL = '1F4E79'

function comeData(v: unknown): Date | null {
  if (v == null || v === '') return null
  const s = String(v).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function comeNumero(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function cella(v: unknown, tipo: TipoColonna): unknown {
  if (tipo === 'data') return comeData(v)
  if (tipo === 'euro' || tipo === 'numero') return comeNumero(v)
  if (v == null) return null
  if (typeof v === 'boolean') return v ? 'sì' : 'no'
  return String(v)
}

/** Nome foglio valido per Excel: max 31 caratteri, niente : \ / ? * [ ] */
function nomeFoglio(s: string): string {
  return s.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Foglio'
}

export async function esportaXlsx(nomeFile: string, fogli: Foglio[]): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mirafiori Web'
  wb.created = new Date()

  for (const f of fogli) {
    const ws = wb.addWorksheet(nomeFoglio(f.nome), { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = f.colonne.map((c) => ({
      header: c.titolo,
      width: c.larghezza ?? (c.tipo === 'data' ? 12 : c.tipo === 'euro' ? 14 : Math.min(Math.max(c.titolo.length + 4, 12), 40)),
      style:
        c.tipo === 'data'
          ? { numFmt: 'dd/mm/yyyy' }
          : c.tipo === 'euro'
            ? { numFmt: '#,##0.00 "€"' }
            : {},
    }))
    for (const r of f.righe) {
      ws.addRow(f.colonne.map((c) => cella(c.valore(r), c.tipo ?? 'testo')))
    }
    const testa = ws.getRow(1)
    testa.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    testa.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEAD_FILL}` } }
    testa.alignment = { vertical: 'middle' }
    if (f.righe.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: f.colonne.length } }
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const oggi = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `${nomeFile}-${oggi}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
