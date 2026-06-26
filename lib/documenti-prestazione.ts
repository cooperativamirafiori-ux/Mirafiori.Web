/**
 * Generazione dei documenti precompilati per una prestazione occasionale.
 *
 * Riempie i 3 modelli .docx (contratto, autorizzazione GDPR, impegno riservatezza)
 * con i dati della pratica, usando docxtemplater (segnaposto {tag}).
 * I file restano .docx: la firma sarà gestita da DocuSign tramite gli anchor
 * invisibili già presenti nei modelli (\s1\ = firma, \d1\ = data).
 *
 * I modelli stanno in lib/templates/prestazione-occasionale/ (inclusi nel bundle
 * Vercel tramite outputFileTracingIncludes in next.config.mjs).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import type { Prestazione } from '@/types/prestazioni'

const TEMPLATES_DIR = join(process.cwd(), 'lib', 'templates', 'prestazione-occasionale')
// Moduli informativi inviati al prestatore via mail semplice (non DocuSign)
const ALLEGATI_DIR = join(process.cwd(), 'lib', 'allegati-prestatore')

export interface AllegatoStatico {
  filename: string
  buffer: Buffer
  contentType: string
}

/**
 * Legge i moduli informativi da allegare alla mail al prestatore
 * (foglio ore in bianco + informativa fornitore). Salta i file mancanti.
 */
export function leggiAllegatiInformativi(): AllegatoStatico[] {
  const files: { filename: string; contentType: string }[] = [
    {
      filename: 'Foglio_ore_bianco.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    { filename: 'INF05_Informativa_fornitore.pdf', contentType: 'application/pdf' },
  ]
  const out: AllegatoStatico[] = []
  for (const f of files) {
    try {
      out.push({ ...f, buffer: readFileSync(join(ALLEGATI_DIR, f.filename)) })
    } catch {
      console.warn('[documenti] allegato informativo mancante:', f.filename)
    }
  }
  return out
}

const RAPPRESENTANTE = process.env.RAPPRESENTANTE_LEGALE || 'LUCA CORDARO'
// Sede di svolgimento riportata all'art. 3 del contratto (default editabile via env)
const SEDE_SVOLGIMENTO = process.env.PRESTAZIONI_SEDE_SVOLGIMENTO || 'i servizi di educativa specialistica'

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

// ============================================================
// Helpers di formattazione
// ============================================================

/** Sesso desunto dal codice fiscale: nei caratteri 10-11 il giorno è +40 per le donne. */
export function sessoDaCF(cf: string): 'F' | 'M' {
  const giorno = parseInt((cf || '').toUpperCase().slice(9, 11), 10)
  return Number.isFinite(giorno) && giorno > 40 ? 'F' : 'M'
}

/** ISO (YYYY-MM-DD) → "08 Ottobre 2025". Se non parsabile, ritorna la stringa originale. */
export function dataEstesa(iso: string): string {
  const m = (iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso || ''
  const [, y, mm, dd] = m
  return `${dd} ${MESI[parseInt(mm, 10) - 1]} ${y}`
}

/** ISO → "gg/mm/aaaa" */
export function dataBreve(iso: string): string {
  const m = (iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso || ''
  const [, y, mm, dd] = m
  return `${dd}/${mm}/${y}`
}

/** 300 → "300,00" */
export function euro(n: number): string {
  return (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ============================================================
// Mapping pratica → segnaposto
// ============================================================

export function segnapostoContratto(p: Prestazione): Record<string, string> {
  const f = sessoDaCF(p.codiceFiscale) === 'F'
  const oggi = new Date()
  const luogoData = `Torino, ${String(oggi.getDate()).padStart(2, '0')}/${String(oggi.getMonth() + 1).padStart(2, '0')}/${oggi.getFullYear()}`
  return {
    rappresentante: RAPPRESENTANTE,
    titolo: f ? 'La Sig.ra' : 'Il Sig.',
    cognome_nome: `${p.cognome} ${p.nome}`.toUpperCase().trim(),
    nato: f ? 'nata' : 'nato',
    comune_nascita: p.luogoNascita,
    data_nascita: dataBreve(p.dataNascita),
    residenza: p.residenza,
    codice_fiscale: p.codiceFiscale.toUpperCase(),
    oggetto_incarico: p.attivita,
    sede_svolgimento: SEDE_SVOLGIMENTO,
    compenso: euro(p.compensoPrevisto),
    data_inizio: dataEstesa(p.dataInizio),
    data_fine: dataEstesa(p.dataFine),
    luogo_data_firma: luogoData,
  }
}

export function segnapostoGdpr(p: Prestazione): Record<string, string> {
  return {
    nome: p.nome.toUpperCase().trim(),
    cognome: p.cognome.toUpperCase().trim(),
    ruolo: p.ruolo.toUpperCase().trim(),
    luogo_data: 'Torino',
  }
}

export function segnapostoImpegno(p: Prestazione): Record<string, string> {
  return {
    cognome_nome: `${p.cognome} ${p.nome}`.toUpperCase().trim(),
  }
}

// ============================================================
// Compilazione
// ============================================================

function riempi(templateFile: string, dati: Record<string, string>): Buffer {
  const content = readFileSync(join(TEMPLATES_DIR, templateFile), 'binary')
  const zip = new PizZip(content)
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
  doc.render(dati)
  return doc.getZip().generate({ type: 'nodebuffer' })
}

export interface DocumentoGenerato {
  tipo: 'contratto' | 'gdpr' | 'impegno' | 'notula'
  filename: string
  buffer: Buffer
}

/**
 * Verifica che la pratica contenga tutti i dati necessari ai documenti.
 * Ritorna l'elenco (vuoto = tutto ok) delle etichette mancanti.
 */
export function campiMancantiPerDocumenti(p: Prestazione): string[] {
  const richiesti: [string, string][] = [
    [p.nome, 'Nome'],
    [p.cognome, 'Cognome'],
    [p.dataNascita, 'Data di nascita'],
    [p.luogoNascita, 'Luogo di nascita'],
    [p.codiceFiscale, 'Codice fiscale'],
    [p.residenza, 'Residenza'],
    [p.ruolo, 'Ruolo'],
    [p.attivita, 'Attività'],
    [p.dataInizio, 'Data inizio'],
    [p.dataFine, 'Data fine'],
  ]
  const mancanti = richiesti.filter(([v]) => !String(v ?? '').trim()).map(([, l]) => l)
  if (!(Number(p.compensoPrevisto) > 0)) mancanti.push('Compenso previsto')
  return mancanti
}

// ============================================================
// Notula (ritenuta d'acconto)
// ============================================================

/** Soglia oltre la quale è dovuta la marca da bollo da 2 € su documenti fuori campo IVA */
const SOGLIA_BOLLO = 77.47

export interface CalcoloNotula {
  lordo: number
  ritenuta: number // 20%
  netto: number
  bollo: number // 2,00 o 0,00
}

/** Calcolo standard: ritenuta d'acconto 20% sul lordo, netto, marca da bollo se > 77,47 € */
export function calcolaNotula(importoLordo: number): CalcoloNotula {
  const lordo = Math.round((Number(importoLordo) || 0) * 100) / 100
  const ritenuta = Math.round(lordo * 0.2 * 100) / 100
  const netto = Math.round((lordo - ritenuta) * 100) / 100
  const bollo = lordo > SOGLIA_BOLLO ? 2 : 0
  return { lordo, ritenuta, netto, bollo }
}

export function segnapostoNotula(p: Prestazione, importoLordo: number): Record<string, string> {
  const c = calcolaNotula(importoLordo)
  const oggi = new Date()
  const luogoDataNascita = [p.luogoNascita, dataBreve(p.dataNascita)]
    .filter(Boolean)
    .join(', ')
  return {
    id_prestazione: p.idPrestazione || '',
    cognome_nome: `${p.cognome} ${p.nome}`.toUpperCase().trim(),
    luogo_data_nascita: luogoDataNascita,
    codice_fiscale: p.codiceFiscale.toUpperCase(),
    residenza: p.residenza,
    data_oggi: dataBreve(oggi.toISOString()),
    causale: p.attivita,
    giorni: String(p.giorni ?? ''),
    periodo: `${dataBreve(p.dataInizio)} – ${dataBreve(p.dataFine)}`,
    compenso_lordo: euro(c.lordo),
    ritenuta: euro(c.ritenuta),
    netto: euro(c.netto),
    marca_bollo: euro(c.bollo),
  }
}

/** Genera la notula precompilata (.docx) dal modello Notula_TEMPLATE.docx */
export function generaNotula(p: Prestazione, importoLordo: number): DocumentoGenerato {
  const id = p.idPrestazione || 'prestazione'
  return {
    tipo: 'notula',
    filename: `${id}_Notula.docx`,
    buffer: riempi('Notula_TEMPLATE.docx', segnapostoNotula(p, importoLordo)),
  }
}

/** Genera i 3 documenti precompilati come buffer .docx */
export function generaDocumentiPrestazione(p: Prestazione): DocumentoGenerato[] {
  const id = p.idPrestazione || 'prestazione'
  return [
    { tipo: 'contratto', filename: `${id}_Contratto.docx`, buffer: riempi('Contratto_collaborazione_TEMPLATE.docx', segnapostoContratto(p)) },
    { tipo: 'gdpr', filename: `${id}_Autorizzazione_GDPR.docx`, buffer: riempi('Autorizzazione_GDPR_TEMPLATE.docx', segnapostoGdpr(p)) },
    { tipo: 'impegno', filename: `${id}_Impegno_riservatezza.docx`, buffer: riempi('Impegno_riservatezza_TEMPLATE.docx', segnapostoImpegno(p)) },
  ]
}
