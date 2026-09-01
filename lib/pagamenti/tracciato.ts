/**
 * Lettura dell'export «Elenco scadenze» di Fattura SMART (Webdesk).
 *
 * Qui c'è solo la traduzione da foglio Excel a righe tipizzate: nessuna
 * scrittura, nessuna regola di coda. Sta a parte da import.ts perché è il
 * pezzo che si può provare da solo, ed è quello che si romperà per primo il
 * giorno in cui il gestionale cambierà una intestazione.
 *
 * Forma del file (verificata il 27/08/2026 su 2.053 scadenze):
 *   intestazioni a riga 4, dati dalla 5, 17 colonne, una riga = una scadenza.
 *
 * ⚠️ Le intestazioni si cercano, non si contano. Il numero di riga è scritto
 * come suggerimento, ma se il gestionale ne aggiunge una in cima il file va
 * letto lo stesso: si cerca la riga che contiene «Scadenza».
 *
 * ⚠️ `Stato` e `Data Pagamento` si leggono, ma **valgono in una direzione
 * sola**: possono chiudere una scadenza, mai riaprirne una chiusa in app, e
 * solo quando chi carica lo chiede (vedi `chiusuraDaGestionale` in import.ts).
 * Riflettono la registrazione contabile, che arriva dopo il bonifico: se
 * potessero riaprire, al caricamento successivo la coda si ripopolerebbe da
 * sola con le righe che qualcuno aveva appena chiuso. `Pagato` e
 * `Di cui Abbuono` non si leggono affatto.
 */

import { leggiFoglio, type Cella, type Griglia } from '@/lib/pagamenti/xlsx'
import type { FamigliaModalita, TipoDocumento } from '@/types/pagamenti'

export interface RigaFile {
  protocolloNumero: string
  protocolloSuffisso: string
  protocolloData: string // ISO
  numeroFornitore: string | null
  dataFornitore: string | null
  piva: string | null
  codiceFiscale: string | null
  fornitore: string
  tipoDocumento: TipoDocumento
  dataScadenza: string // ISO
  /** Netto da pagare. Già col segno giusto: negativo sulle note di credito. */
  importo: number
  modalita: string | null
  famiglia: FamigliaModalita
  /** `Stato` del gestionale: vale solo in chiusura, e solo se richiesto. */
  pagataSecondoGestionale: boolean
  /** `Data Pagamento` del gestionale, usata solo insieme al flag di cui sopra. */
  dataPagamentoGestionale: string | null
  note: string | null
  /** Numero di riga nel foglio, per poter dire dove sta l'errore. */
  riga: number
}

export interface EsitoLettura {
  righe: RigaFile[]
  /** Righe illeggibili, con il motivo. Non si scartano in silenzio. */
  scarti: Array<{ riga: number; motivo: string }>
  intestazioni: string[]
}

// ------------------------------------------------------------
// Riconoscimento delle colonne
// ------------------------------------------------------------
// Ogni campo ha più nomi possibili: il gestionale può cambiare un'etichetta
// senza avvisare, e un import che si rompe per uno spazio è un import che
// qualcuno smette di usare.

const norm = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const COLONNE = {
  protocolloNumero: ['numero documento', 'numero', 'n documento', 'numero doc'],
  protocolloSuffisso: ['suffisso documento', 'suffisso', 'suff'],
  protocolloData: ['data documento', 'data'],
  numeroFornitore: ['numero riferimento', 'numero rif fornitore', 'numero rif', 'n rif fornitore'],
  dataFornitore: ['data riferimento', 'data rif fornitore', 'data rif'],
  piva: ['partita iva', 'p iva', 'piva'],
  codiceFiscale: ['codice fiscale', 'cod fiscale', 'cf'],
  fornitore: ['ragione sociale', 'fornitore', 'denominazione', 'cliente fornitore', 'soggetto'],
  tipoDocumento: ['tipo documento', 'tipo doc', 'tipo'],
  dataScadenza: ['scadenza', 'data scadenza'],
  importo: ['totale', 'importo', 'importo scadenza'],
  modalita: ['tipologia', 'modalita pagamento', 'modalita di pagamento', 'pagamento'],
  statoGestionale: ['stato'],
  dataPagamentoGestionale: ['data pagamento'],
  note: ['note', 'annotazioni'],
} as const

type Campo = keyof typeof COLONNE

const OBBLIGATORIE: Campo[] = ['protocolloNumero', 'protocolloData', 'dataScadenza', 'importo', 'fornitore']

/**
 * Trova la riga delle intestazioni e la mappa colonna → indice.
 * Cerca nelle prime 15 righe quella che contiene «Scadenza» e un importo.
 */
function trovaIntestazioni(griglia: Griglia): {
  riga: number
  indici: Partial<Record<Campo, number>>
  intestazioni: string[]
} {
  const limite = Math.min(griglia.length, 15)
  for (let r = 0; r < limite; r++) {
    const celle = griglia[r]
    if (!Array.isArray(celle)) continue
    const testi = celle.map(norm)
    const contiene = (nomi: readonly string[]) => testi.some((t) => t.length > 0 && nomi.includes(t))
    if (!contiene(COLONNE.dataScadenza) || !contiene(COLONNE.importo)) continue

    const indici: Partial<Record<Campo, number>> = {}
    const presi = new Set<number>()
    // I nomi si provano nell'ordine in cui sono elencati, dal più specifico:
    // «Data Riferimento» va assegnata prima che «Data» si prenda la colonna
    // sbagliata, e una colonna già presa non si riassegna.
    for (const campo of Object.keys(COLONNE) as Campo[]) {
      const nomi: readonly string[] = COLONNE[campo]
      for (const nome of nomi) {
        const idx = testi.findIndex((t, i) => t === nome && !presi.has(i))
        if (idx >= 0) {
          indici[campo] = idx
          presi.add(idx)
          break
        }
      }
    }
    return {
      riga: r,
      indici,
      intestazioni: testi.filter((t) => t.length > 0),
    }
  }
  throw new Error(
    'Non riconosco il file: non ho trovato le colonne «Scadenza» e «Totale». ' +
      'Assicurati di aver scaricato l’Elenco scadenze da Fattura SMART, non l’Elenco documenti.',
  )
}

// ------------------------------------------------------------
// Conversioni
// ------------------------------------------------------------

function testo(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string') return o.text.trim()
    if (typeof o.result === 'string') return o.result.trim()
    if (Array.isArray(o.richText)) {
      return o.richText.map((p: { text?: string }) => p.text ?? '').join('').trim()
    }
  }
  return String(v).trim()
}

/**
 * Date, nei tre modi in cui arrivano.
 *
 * Nel file di Fattura SMART sono **numeri seriali** (45994 = 25/11/2025): il
 * formato «data» sta nel foglio degli stili, che qui non leggiamo apposta —
 * sappiamo già quali colonne sono date, e gli stili sono la parte del file
 * scritta peggio. Restano gestiti anche `Date` e il testo `31/12/2026`.
 *
 * Il giorno zero di Excel è il 30/12/1899, non il 31: quel giorno inesistente
 * compensa il 29 febbraio 1900 che Excel crede esistito.
 */
export function aData(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') {
    // Sotto l'1 è un orario senza data; sopra il 2958465 è oltre il 9999.
    if (!isFinite(v) || v < 1 || v > 2_958_465) return null
    const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Le date Excel arrivano a mezzanotte UTC: costruire la stringa dai campi
    // UTC evita che un fuso a ovest le sposti al giorno prima.
    const y = v.getUTCFullYear()
    const m = String(v.getUTCMonth() + 1).padStart(2, '0')
    const d = String(v.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = testo(v)
  if (!s) return null
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    const [, g, me, a] = m
    const anno = a.length === 2 ? `20${a}` : a
    return `${anno}-${me.padStart(2, '0')}-${g.padStart(2, '0')}`
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

/** Importi: 1.234,56 all'italiana oppure 1234.56, oppure già numero. */
export function aNumero(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const s = testo(v)
    .replace(/[€\s ]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return isFinite(n) ? n : null
}

// ------------------------------------------------------------
// Modalità di pagamento → famiglia
// ------------------------------------------------------------
// Le famiglie decidono la coda. Chi non riconosciamo finisce in `altro`, che
// passa comunque dalle code: una modalità sconosciuta deve farsi vedere da
// qualcuno, non sparire in un archivio di cose già pagate.

// ⚠️ Il confronto è su **parola intera**, non su sottostringa. Prima non lo
// era, e sul file vero del 01/09/2026 «Bollettino di c/c postale» finiva fra i
// pagamenti da negozio perché *postale* contiene *pos*: quattro bollettini da
// pagare sarebbero nati già pagati e nessuno li avrebbe più visti.
const NEGOZIO = [/\bcontant/, /\bcarta\b/, /\bbancomat\b/, /\bpos\b/, /\bcash\b/]
const AUTOMATICA = [
  /\brid\b/,
  /\bsdd\b/,
  /\bsepa direct/,
  /\bdomicili/,
  /\baddebito/,
  /\bmav\b/,
  /\brav\b/,
  /\bpagopa\b/,
  /\bquietanza/,
  /\briba\b/, // ricevuta bancaria: la presenta la banca, non la paga nessuno a mano
  /\bricevuta bancaria/,
]
const BONIFICO = [
  /\bbonifico/,
  /\bassegno/,
  /\bvaglia/,
  /\bcontrassegno/,
  /\brimessa/,
  /\bbollettino/, // qualcuno lo deve pagare: è una coda, non un archivio
]

export function famigliaDi(modalita: string | null): FamigliaModalita {
  const t = norm(modalita)
  if (!t) return 'altro'
  if (NEGOZIO.some((k) => k.test(t))) return 'negozio'
  if (AUTOMATICA.some((k) => k.test(t))) return 'automatica'
  if (BONIFICO.some((k) => k.test(t))) return 'bonifico'
  return 'altro'
}

// ------------------------------------------------------------
// Lettura
// ------------------------------------------------------------

export async function leggiScadenzario(buffer: ArrayBuffer): Promise<EsitoLettura> {
  const griglia = leggiFoglio(buffer)
  const { riga: rigaIntestazioni, indici, intestazioni } = trovaIntestazioni(griglia)

  const mancanti = OBBLIGATORIE.filter((c) => indici[c] == null)
  if (mancanti.length > 0) {
    throw new Error(
      `Nel file mancano colonne indispensabili (${mancanti.join(', ')}). ` +
        `Intestazioni trovate: ${intestazioni.join(' · ')}`,
    )
  }

  const righe: RigaFile[] = []
  const scarti: EsitoLettura['scarti'] = []

  const val = (celle: Cella[], campo: Campo): Cella => {
    const i = indici[campo]
    return i == null ? null : celle[i] ?? null
  }

  for (let r = rigaIntestazioni + 1; r < griglia.length; r++) {
    const celle = griglia[r]
    if (!Array.isArray(celle)) continue
    const vuota = celle.every((c) => c == null || testo(c) === '')
    if (vuota) continue

    const protocolloNumero = testo(val(celle, 'protocolloNumero'))
    const protocolloData = aData(val(celle, 'protocolloData'))
    const dataScadenza = aData(val(celle, 'dataScadenza'))
    const importoLetto = aNumero(val(celle, 'importo'))
    const fornitore = testo(val(celle, 'fornitore'))

    if (!protocolloNumero || !protocolloData) {
      scarti.push({ riga: r + 1, motivo: 'protocollo del documento assente' })
      continue
    }
    if (!dataScadenza) {
      scarti.push({ riga: r + 1, motivo: 'data di scadenza assente' })
      continue
    }
    if (importoLetto == null) {
      scarti.push({ riga: r + 1, motivo: 'importo non leggibile' })
      continue
    }

    const tipoTesto = norm(val(celle, 'tipoDocumento'))
    const isNota = tipoTesto.includes('nota di credito') || tipoTesto.includes('nota credito')

    // ⚠️ Le note di credito arrivano con Totale POSITIVO e non si riconoscono
    // dal segno: senza questa inversione finiscono in coda come fatture da
    // pagare (35 righe, 5.896 € nel campione di agosto).
    const importo = isNota ? -Math.abs(importoLetto) : importoLetto

    const modalita = testo(val(celle, 'modalita')) || null
    const statoGestionale = norm(val(celle, 'statoGestionale'))

    righe.push({
      protocolloNumero,
      protocolloSuffisso: testo(val(celle, 'protocolloSuffisso')),
      protocolloData,
      numeroFornitore: testo(val(celle, 'numeroFornitore')) || null,
      dataFornitore: aData(val(celle, 'dataFornitore')),
      piva: testo(val(celle, 'piva')) || null,
      codiceFiscale: testo(val(celle, 'codiceFiscale')) || null,
      fornitore: fornitore || '(fornitore non indicato)',
      tipoDocumento: isNota ? 'nota_credito' : 'fattura',
      dataScadenza,
      importo,
      modalita,
      famiglia: famigliaDi(modalita),
      // «Pagata» esatto, non «contiene pagata»: «Non pagata» o «Parz. pagata»
      // non devono passare per un match approssimativo.
      pagataSecondoGestionale: statoGestionale === 'pagata' || statoGestionale === 'pagato',
      dataPagamentoGestionale: aData(val(celle, 'dataPagamentoGestionale')),
      note: testo(val(celle, 'note')) || null,
      riga: r + 1,
    })
  }

  return { righe, scarti, intestazioni }
}
