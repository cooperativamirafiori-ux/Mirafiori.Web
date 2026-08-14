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
import type { GraphClient } from '@/lib/core/graph-delegato'
import {
  listTimbrature,
  riepilogoPeriodo,
  profiloVigente,
  primoUltimoGiorno,
  monteToSettimana,
} from '@/lib/timbrature/data'
import type { Dipendente } from '@/types/timbrature'
// L'archiviazione passa tutta dal modulo RU (`caricaDocumentoDipendente`,
// `caricaDocumentoInCartella`): e' lui che governa il drive del sito RU. Qui non
// si parla piu' direttamente con Graph — prima serviva per la cartella di
// ripiego, che non esiste piu'.

const GIORNI_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MESI_IT = ['', 'GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE']

const HEAD_FILL = '1F4E79'

function giornoNome(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return GIORNI_IT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/**
 * Riga di stato stampata in testa al foglio: chi ha validato e chi ha
 * confermato. Su un documento che viene approvato e archiviato, "chi ha detto
 * di si' e quando" deve stare sul documento, non solo nel database.
 */
export interface NotaValidazione {
  validatoDa?: string | null
  validatoIl?: string | null
  confermatoDa?: string | null
  confermatoIl?: string | null
  /** Conferma messa dal responsabile in assenza di risposta del dipendente. */
  forzato?: boolean
}

function dataOraIt(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/** Costruisce il buffer .xlsx del foglio ore per (dipendente, anno, mese). */
export async function generaFoglioOreBuffer(
  dip: Dipendente,
  anno: number,
  mese: number,
  nota?: NotaValidazione,
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
  const ws = wb.addWorksheet('Foglio Ore', {
    views: [{ state: 'frozen', ySplit: 8 }],
    // Il foglio viene convertito in PDF da Graph e finisce in mano alle
    // persone: senza queste impostazioni uscirebbe spezzato su piu' pagine in
    // larghezza, cioe' illeggibile.
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      printTitlesRow: '7:7',
    },
  })
  ws.columns = [
    { key: 'data', width: 12 },
    { key: 'giorno', width: 12 },
    { key: 'festivita', width: 16 },
    { key: 'attese', width: 10 },
    { key: 'servizio', width: 30 },
    // Larga: adesso ci sta il nome del centro di costo, non più un numero.
    { key: 'centro', width: 30 },
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

  if (nota?.validatoDa || nota?.confermatoDa) {
    const parti: string[] = []
    if (nota.validatoDa) parti.push(`Validato da ${nota.validatoDa} il ${dataOraIt(nota.validatoIl)}`)
    if (nota.confermatoDa) {
      parti.push(
        nota.forzato
          ? `Chiuso dal responsabile (${nota.confermatoDa}) il ${dataOraIt(nota.confermatoIl)} in assenza di riscontro del dipendente`
          : `Confermato dal dipendente (${nota.confermatoDa}) il ${dataOraIt(nota.confermatoIl)}`,
      )
    }
    ws.mergeCells('A5:J5')
    const c = ws.getCell('A5')
    c.value = parti.join('  ·  ')
    c.font = { italic: true, size: 9, color: { argb: 'FF1E7B34' } }
  }

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
      // Le tre spunte viaggiano sul documento: sono l'unico modo in cui le HR
      // vedono notti e reperibilita', su cui si liquidano forfait e indennita'.
      const marchi = [t.notte && 'Notte', t.reperibilita && 'Reperibilità', t.mutua && 'Mutua']
        .filter(Boolean)
        .join(', ')
      row.getCell(5).value = marchi ? `${t.servizioNome} (${marchi})` : t.servizioNome
      row.getCell(6).value = t.centroCostoNome ?? '—'
      row.getCell(7).value = t.oraInizio ?? ''
      row.getCell(8).value = t.oraFine ?? ''
      row.getCell(9).value = t.ore
      row.getCell(10).value = [t.perConto ? 'inserita dal responsabile' : '', t.note ?? '']
        .filter(Boolean)
        .join(' · ')
      if (t.tipoVoce === 'giustificativo') row.getCell(5).font = { italic: true, color: { argb: 'FF7030A0' } }
      // Una riga scritta da qualcun altro deve vedersi: e' il minimo perche' la
      // conferma del dipendente abbia senso.
      if (t.perConto) row.getCell(10).font = { italic: true, color: { argb: 'FFC55A11' } }
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
  // I due movimenti di flessibilita' del mese, con gli stessi nomi che usa il
  // cedolino (causali 907 e 908): cosi' la riconciliazione con le paghe si fa
  // riga per riga, invece di ricavare i numeri a mano.
  setTot('Flessibilità lavorata:', riepilogo.flessibilitaLavorata)
  setTot('Flessibilità recuperata:', riepilogo.flessibilitaRecuperata)
  // Forfait e indennita' si liquidano a evento, non a ore: qui si contano.
  if (riepilogo.notti) setTot('Notti:', riepilogo.notti)
  if (riepilogo.turniReperibilita) setTot('Turni in reperibilità:', riepilogo.turniReperibilita)
  if (riepilogo.scostamento < 0) {
    ws.getCell(`H${r}`).value =
      'Le ore rendicontate sono inferiori alle ore lavorative del mese. Giustificare le ore mancanti.'
    ws.getCell(`H${r}`).font = { italic: true, color: { argb: 'FFC00000' } }
  }

  // -------------------------------------------------------------- Rendicontazione
  const rc = wb.addWorksheet('Rendicontazione')
  rc.columns = [
    { key: 'a', width: 34 },
    { key: 'b', width: 34 },
    { key: 'c', width: 12 },
  ]
  // Più servizi possono confluire nello stesso centro di costo: l'educativa
  // territoriale Nord ne ha tre, la Sud quattro. Il raggruppamento sotto è
  // proprio il motivo per cui esiste questo foglio.
  const perServizio = new Map<string, { centro: string; ore: number }>()
  const perCentro = new Map<string, number>()
  const perGiust = new Map<string, number>()
  const senzaCentro = 'Senza centro di costo'
  for (const t of timbrature) {
    if (t.tipoVoce === 'giustificativo') {
      perGiust.set(t.servizioNome!, (perGiust.get(t.servizioNome!) ?? 0) + t.ore)
    } else {
      const centro = t.centroCostoNome ?? senzaCentro
      const s = perServizio.get(t.servizioNome!) ?? { centro, ore: 0 }
      s.ore += t.ore
      perServizio.set(t.servizioNome!, s)
      perCentro.set(centro, (perCentro.get(centro) ?? 0) + t.ore)
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
  rc.getCell(`B${rr}`).value = 'Centro di costo'
  rc.getCell(`C${rr}`).value = 'Ore'
  rc.getRow(rr).font = { bold: true }
  rr++
  ;[...perServizio.entries()]
    .sort((a, b) => a[1].centro.localeCompare(b[1].centro, 'it') || a[0].localeCompare(b[0], 'it'))
    .forEach(([nome, v]) => {
      rc.getCell(`A${rr}`).value = nome
      rc.getCell(`B${rr}`).value = v.centro
      rc.getCell(`C${rr}`).value = v.ore
      rr++
    })
  rr++
  sectionHead('Ore per centro di costo')
  ;[...perCentro.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'it'))
    .forEach(([centro, ore]) => {
      rc.getCell(`A${rr}`).value = centro
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

/**
 * Cartella HR dove finisce la copia dei fogli definitivi: tutti i dipendenti
 * dello stesso mese insieme, che e' la forma comoda per il passaggio alle paghe.
 * Aprire una cartella e avere il mese completo, invece di pescare cento file da
 * cento cartelle personali.
 */
function cartellaHr(anno: number, mese: number): string {
  return `Fogli Ore/${anno}/${String(mese).padStart(2, '0')}`
}

/**
 * Il dipendente non e' in anagrafica RU.
 *
 * Non e' un caso da aggirare: appena una persona viene assunta le si crea la
 * mail e la si mette in anagrafica, quindi se non c'e' e' un errore da
 * correggere, non una situazione da gestire con una cartella di ripiego. Prima
 * il foglio veniva archiviato di nascosto in "Foglio Ore/<Nominativo>" e nessuno
 * se ne accorgeva: adesso il flusso si ferma e chiede di sistemare l'anagrafica.
 */
export class DipendenteFuoriAnagrafica extends Error {
  constructor(readonly email: string, readonly cognomeNome: string) {
    super(
      `${cognomeNome} non risulta nell'anagrafica Risorse Umane con la mail ${email}. ` +
        `Inseriscilo in anagrafica (o correggi la mail aziendale) e riprova: senza scheda ` +
        `non esiste la cartella personale in cui archiviare il foglio ore.`,
    )
    this.name = 'DipendenteFuoriAnagrafica'
  }
}

export interface FoglioOrePubblicato {
  /** URL del .xlsx nella cartella personale (resta il formato per HR/rendicontazione). */
  xlsxUrl: string
  /** URL del .pdf nella cartella personale: e' la copia che la persona firma. */
  pdfUrl: string | null
  /** URL del .pdf nella cartella HR del mese. Valorizzato solo per i definitivi. */
  hrUrl: string | null
  /** Contenuto del PDF, per allegarlo alla mail senza riscaricarlo. */
  pdf: Buffer | null
}

/** Nome file (senza estensione) del foglio ore di un mese. */
function nomeBase(dip: Dipendente, anno: number, mese: number): string {
  return `FoglioOre_${dip.cognomeNome.replace(/[^\w]+/g, '_')}_${anno}-${String(mese).padStart(2, '0')}`
}

const CT_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Genera il foglio ore, lo carica nella cartella personale del dipendente e ne
 * ricava il PDF.
 *
 * Il PDF non viene disegnato qui: si carica l'xlsx e si chiede a Graph la
 * conversione (`?format=pdf`). Un motore di stampa in piu' su Vercel non
 * varrebbe la differenza.
 *
 * Archivia in DUE posti quando `copiaHr` e' attivo:
 *   1. la cartella personale del dipendente (xlsx + pdf), sempre;
 *   2. la cartella HR del mese (solo pdf), solo per il foglio definitivo.
 *
 * Se il dipendente non e' in anagrafica RU **non archivia niente** e lancia
 * `DipendenteFuoriAnagrafica`: la cartella di ripiego non c'e' piu'.
 *
 * ⚠️ RIPIEGO APPLICATIVO ESPLICITO. Se `gRU` non viene passato — chiusura da
 * cron, oppure conferma che arriva dal link nella mail, dove per definizione
 * non c'e' nessuno autenticato — si opera con l'identita' dell'applicazione.
 * Funziona grazie a Sites.ReadWrite.All (Application), ma nel log nativo la
 * scrittura risulta fatta dall'app. E' una scelta consapevole: l'alternativa
 * sarebbe obbligare il dipendente a fare login per confermare.
 */
export async function pubblicaFoglioOre(
  dip: Dipendente,
  anno: number,
  mese: number,
  gRU?: GraphClient,
  nota?: NotaValidazione,
  opts: { copiaHr?: boolean } = {},
): Promise<FoglioOrePubblicato> {
  const buffer = await generaFoglioOreBuffer(dip, anno, mese, nota)
  const base = nomeBase(dip, anno, mese)

  const ru = await import('@/lib/risorse-umane/data')
  const { graphApplicativo } = await import('@/lib/core/graph-delegato')
  const gc = gRU ?? graphApplicativo()

  const match = await ru.trovaSchedaPerEmail(gc, dip.email)
  if (!match) throw new DipendenteFuoriAnagrafica(dip.email, dip.cognomeNome)

  const spId = String(match.spItemId)
  const xlsx = await ru.caricaDocumentoDipendente(gc, spId, `${base}.xlsx`, buffer, CT_XLSX)

  let pdf: Buffer | null = null
  let pdfUrl: string | null = null
  let hrUrl: string | null = null
  try {
    pdf = await ru.pdfDocumentoDipendente(gc, xlsx.id)
    const doc = await ru.caricaDocumentoDipendente(gc, spId, `${base}.pdf`, pdf, 'application/pdf')
    pdfUrl = doc.url
  } catch (e) {
    // Il PDF e' importante ma non deve far fallire la validazione: senza,
    // la mail parte con il solo link al foglio.
    console.error('[foglio-ore] conversione PDF fallita:', e)
  }

  // Copia HR: solo il definitivo, solo il PDF. Se il PDF non c'e' si mette
  // l'xlsx, perche' meglio il formato sbagliato che il buco.
  if (opts.copiaHr) {
    try {
      const doc = await ru.caricaDocumentoInCartella(
        gc,
        cartellaHr(anno, mese),
        pdf ? `${base}.pdf` : `${base}.xlsx`,
        pdf ?? buffer,
        pdf ? 'application/pdf' : CT_XLSX,
      )
      hrUrl = doc.url
    } catch (e) {
      // La conferma della persona non si perde per una copia mancata: resta
      // quella nella cartella personale, e il cruscotto mostra il buco.
      console.error('[foglio-ore] copia nella cartella HR fallita:', e)
    }
  }

  return { xlsxUrl: xlsx.url, pdfUrl, hrUrl, pdf }
}
