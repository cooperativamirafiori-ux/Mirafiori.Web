/**
 * Dalla fattura elettronica (FatturaPA, XML o .xml.p7m) ai dati che servono
 * ai Flussi fatture: chi, quanto, quando, come si paga, dove.
 *
 * Tutto deterministico: il tracciato è quello dell'Agenzia delle Entrate,
 * uguale per ogni fornitore. Niente interpretazione del testo.
 *
 * Un file può contenere più fatture (un "lotto": un Header, più Body):
 * per questo si restituisce un elenco.
 */

import { estraiDaP7m } from './p7m'
import { cerca, leggiXml, numero, testo, trova, tutti, type Elemento } from './xml'
import type { FamigliaModalita } from '@/types/pagamenti'

/** Cosa fare del documento, deciso dal TipoDocumento. */
export type NaturaDocumento =
  | 'fattura'       // si paga
  | 'nota_credito'  // riduce un'altra fattura, non si paga
  | 'integrazione'  // autofattura / integrazione reverse charge: la emettiamo noi, nessuno da pagare

export interface RataSdi {
  modalita: string | null          // MP05…
  modalitaDescrizione: string
  famiglia: FamigliaModalita
  scadenza: string | null          // ISO
  importo: number | null
  iban: string | null
  istituto: string | null
}

export interface AllegatoSdi {
  nome: string
  formato: string | null
  /** Contenuto in base64, così com'è nell'XML. */
  base64: string
}

export interface FatturaSdi {
  nomeFile: string
  fornitore: string
  piva: string | null              // senza prefisso paese se italiana
  pivaPaese: string | null
  codiceFiscale: string | null
  tipoDocumento: string            // TD01…
  natura: NaturaDocumento
  numero: string
  data: string                     // ISO
  divisa: string
  totale: number | null            // ImportoTotaleDocumento (può mancare)
  imponibile: number
  iva: number
  ritenuta: number                 // somma delle ritenute
  /** Netto da pagare: somma delle rate, o totale − ritenuta se le rate mancano. */
  daPagare: number
  rate: RataSdi[]
  causale: string | null
  /** Le prime righe di dettaglio, per capire cos'è senza aprire il documento. */
  descrizione: string | null
  /** Riferimenti testuali nelle righe (es. "C04749 LOCANDA NEL PARCO"): aiutano a indovinare il servizio. */
  riferimenti: string[]
  allegati: AllegatoSdi[]
}

// ------------------------------------------------------------
// Tabelle dell'Agenzia delle Entrate
// ------------------------------------------------------------

const MODALITA: Record<string, [string, FamigliaModalita]> = {
  MP01: ['contanti', 'negozio'],
  MP02: ['assegno', 'bonifico'],
  MP03: ['assegno circolare', 'bonifico'],
  MP04: ['contanti presso Tesoreria', 'altro'],
  MP05: ['bonifico', 'bonifico'],
  MP06: ['vaglia cambiario', 'bonifico'],
  MP07: ['bollettino bancario', 'bonifico'],
  MP08: ['carta di pagamento', 'negozio'],
  MP09: ['RID', 'automatica'],
  MP10: ['RID utenze', 'automatica'],
  MP11: ['RID veloce', 'automatica'],
  MP12: ['RIBA', 'automatica'],
  MP13: ['MAV', 'bonifico'],
  MP14: ['quietanza erario', 'automatica'],
  MP15: ['giroconto su conti di contabilità speciale', 'altro'],
  MP16: ['domiciliazione bancaria', 'automatica'],
  MP17: ['domiciliazione postale', 'automatica'],
  MP18: ['bollettino di c/c postale', 'bonifico'],
  MP19: ['SEPA Direct Debit', 'automatica'],
  MP20: ['SEPA Direct Debit CORE', 'automatica'],
  MP21: ['SEPA Direct Debit B2B', 'automatica'],
  MP22: ['trattenuta su somme già riscosse', 'altro'],
  MP23: ['PagoPA', 'bonifico'],
}

function natura(td: string): NaturaDocumento {
  if (td === 'TD04' || td === 'TD08') return 'nota_credito'
  // TD16–TD23, TD26–TD28: integrazioni e autofatture. Documenti che la
  // cooperativa emette verso sé stessa (reverse charge, acquisti dall'estero):
  // nessun fornitore aspetta un bonifico per questi.
  if (/^TD(1[6-9]|2[0-3]|2[6-8])$/.test(td)) return 'integrazione'
  return 'fattura'
}

const arrotonda = (n: number) => Math.round(n * 100) / 100

// ------------------------------------------------------------
// Decodifica del file
// ------------------------------------------------------------

function eP7m(nome: string, b: Uint8Array): boolean {
  if (/\.p7m$/i.test(nome.replace(/\s*\(\d+\)(?=\.[^.]+$)/, ''))) return true
  // Nome che non lo dice ma contenuto che sì: primo byte di una SEQUENCE ASN.1.
  return b[0] === 0x30
}

function comeTesto(b: Uint8Array): string {
  let inizio = 0
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) inizio = 3 // BOM
  const testa = Buffer.from(b.subarray(inizio, inizio + 200)).toString('latin1')
  const enc = /encoding\s*=\s*["']([^"']+)["']/i.exec(testa)?.[1]?.toLowerCase() ?? 'utf-8'
  const latin = /8859|latin|windows-1252|cp1252/.test(enc)
  return new TextDecoder(latin ? 'latin1' : 'utf-8').decode(b.subarray(inizio))
}

/** Testo XML della fattura, dal file così come lo si scarica (xml o p7m). */
export function xmlDaFile(nome: string, dati: Uint8Array): string {
  return comeTesto(eP7m(nome, dati) ? estraiDaP7m(dati) : dati)
}

// ------------------------------------------------------------
// Lettura
// ------------------------------------------------------------

function unaFattura(nomeFile: string, header: Elemento | undefined, body: Elemento): FatturaSdi {
  const ced = trova(header, 'CedentePrestatore/DatiAnagrafici')
  const denominazione =
    testo(ced, 'Anagrafica/Denominazione') ??
    [testo(ced, 'Anagrafica/Nome'), testo(ced, 'Anagrafica/Cognome')].filter(Boolean).join(' ')
  const pivaPaese = testo(ced, 'IdFiscaleIVA/IdPaese')
  const pivaCodice = testo(ced, 'IdFiscaleIVA/IdCodice')

  const doc = trova(body, 'DatiGenerali/DatiGeneraliDocumento')
  const td = testo(doc, 'TipoDocumento') ?? 'TD01'
  const nat = natura(td)
  const totale = numero(doc, 'ImportoTotaleDocumento')

  const ritenuta = arrotonda(
    tutti(doc, 'DatiRitenuta').reduce((s, r) => s + (numero(r, 'ImportoRitenuta') ?? 0), 0),
  )

  const riepiloghi = tutti(trova(body, 'DatiBeniServizi'), 'DatiRiepilogo')
  const imponibile = arrotonda(riepiloghi.reduce((s, r) => s + (numero(r, 'ImponibileImporto') ?? 0), 0))
  const iva = arrotonda(riepiloghi.reduce((s, r) => s + (numero(r, 'Imposta') ?? 0), 0))

  const rate: RataSdi[] = tutti(body, 'DatiPagamento')
    .flatMap((dp) => tutti(dp, 'DettaglioPagamento'))
    .map((d) => {
      const mp = testo(d, 'ModalitaPagamento')?.toUpperCase() ?? null
      const [descr, famiglia] = (mp && MODALITA[mp]) || [mp ?? 'non indicata', 'altro' as FamigliaModalita]
      return {
        modalita: mp,
        modalitaDescrizione: descr,
        famiglia,
        scadenza: testo(d, 'DataScadenzaPagamento'),
        importo: numero(d, 'ImportoPagamento'),
        iban: testo(d, 'IBAN')?.replace(/\s+/g, '').toUpperCase() ?? null,
        istituto: testo(d, 'IstitutoFinanziario'),
      }
    })

  // Netto: le rate dicono quanto si paga davvero (già al netto di ritenuta,
  // split payment, anticipi). Se mancano o sono senza importo, totale − ritenuta.
  const sommaRate = rate.reduce((s, r) => s + (r.importo ?? 0), 0)
  const lordo = totale ?? arrotonda(imponibile + iva)
  const daPagare = arrotonda(sommaRate > 0 ? sommaRate : lordo - ritenuta)

  const linee = tutti(trova(body, 'DatiBeniServizi'), 'DettaglioLinee')
  const descrizione =
    linee
      .map((l) => testo(l, 'Descrizione'))
      .filter((d): d is string => Boolean(d))
      .slice(0, 3)
      .join(' · ')
      .replace(/<br\s*\/?>/gi, ' ')
      .slice(0, 300) || null
  const riferimenti = [
    ...new Set(
      linee
        .flatMap((l) => tutti(l, 'AltriDatiGestionali'))
        .map((a) => testo(a, 'RiferimentoTesto'))
        .filter((t): t is string => Boolean(t) && /[a-z]{3}/i.test(t!)),
    ),
  ].slice(0, 5)

  const causale = tutti(doc, 'Causale').map((c) => testo(c)).filter(Boolean).join(' ') || null

  const allegati: AllegatoSdi[] = tutti(body, 'Allegati').map((a) => ({
    nome: testo(a, 'NomeAttachment') ?? 'allegato',
    formato: testo(a, 'FormatoAttachment'),
    base64: (testo(a, 'Attachment') ?? '').replace(/\s+/g, ''),
  }))

  return {
    nomeFile,
    fornitore: (denominazione || '(senza nome)').replace(/\s+/g, ' ').trim(),
    piva: pivaCodice,
    pivaPaese,
    codiceFiscale: testo(ced, 'CodiceFiscale'),
    tipoDocumento: td,
    natura: nat,
    numero: testo(doc, 'Numero') ?? '(senza numero)',
    data: testo(doc, 'Data') ?? '',
    divisa: testo(doc, 'Divisa') ?? 'EUR',
    totale,
    imponibile,
    iva,
    ritenuta,
    daPagare,
    rate,
    causale,
    descrizione,
    riferimenti,
    allegati,
  }
}

/** Legge un file di fattura (xml o p7m). Lancia se non è una fattura. */
export function leggiFatturaSdi(nomeFile: string, dati: Uint8Array): FatturaSdi[] {
  const radice = leggiXml(xmlDaFile(nomeFile, dati))
  const fe = cerca(radice, 'FatturaElettronica')
  if (!fe) throw new Error('non è una FatturaElettronica')
  const header = trova(fe, 'FatturaElettronicaHeader')
  const bodies = tutti(fe, 'FatturaElettronicaBody')
  if (!bodies.length) throw new Error('fattura senza corpo')
  return bodies.map((b) => unaFattura(nomeFile, header, b))
}

/** Ricevuta SDI (`…_MT_001.xml`): l'identificativo unico e il file a cui si riferisce. */
export function leggiMetadatiSdi(dati: Uint8Array): { identificativoSdi: string; nomeFile: string } | null {
  const radice = leggiXml(comeTesto(dati))
  const md = cerca(radice, 'FileMetadati')
  const id = testo(md, 'IdentificativoSdI')
  const nf = testo(md, 'NomeFile')
  return id && nf ? { identificativoSdi: id, nomeFile: nf } : null
}

/** Nome del file di fattura a cui si riferisce una ricevuta, o null se non è una ricevuta. */
export const eRicevutaSdi = (nome: string) => /_MT_\d{3}(\s*\(\d+\))?\.xml$/i.test(nome)
