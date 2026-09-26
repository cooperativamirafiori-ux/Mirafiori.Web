/**
 * Dalla fattura letta alle scadenze da creare. Solo regole, niente database:
 * così si provano da sole, e l'import resta un travaso.
 *
 * Le regole, nell'ordine in cui si applicano (decise con Dennis il 25/09/2026):
 *
 *  1. Documenti che non sono debiti verso un fornitore → nessuna scadenza:
 *     integrazioni e autofatture (TD16–TD23, TD26–TD28).
 *     (Quelli con la NOSTRA partita IVA come fornitore si scartano prima,
 *     nell'import: non sono nemmeno fatture passive.)
 *  2. Nota di credito → una scadenza "stornata", importo negativo: riduce una
 *     fattura, non si paga.
 *  3. Contanti o carta (MP01, MP08) → nata PAGATA: il denaro è già uscito.
 *  4. RID, SDD, domiciliazioni → "automatica": esce da sola, nessuno la paga.
 *  5. Nessuna modalità nell'XML → PAGATA se il fornitore è noto per pagare al
 *     momento (Lidl, dopo la prima volta), altrimenti "da verificare".
 *     Non si indovina: fra queste ci sono gli scontrini fatti fattura, ma
 *     anche le parcelle dei professionisti.
 *  6. Primo import dagli XML: bonifici già scaduti → "da verificare", perché
 *     qualcuno può averli pagati fuori dall'app prima che l'app li conoscesse.
 *  7. Il resto → coda: "da approvare" sopra soglia, "da pagare" sotto.
 *
 * Sopra tutto: ⚠️ una fattura già pagata non deve MAI finire in una coda di
 * pagamento. Nel dubbio si va in "da verificare", mai in "da pagare".
 */

import type { FamigliaModalita, StatoScadenza } from '@/types/pagamenti'
import type { FatturaSdi } from './fattura'

export interface Contesto {
  soglia: number
  oggi: string                        // ISO
  primoImport: boolean
  fornitore: {
    pagaAlMomento: boolean
    iban: string | null
    ibanConfermato: boolean
  } | null
}

export interface ScadenzaNuova {
  posizione: number
  data_scadenza: string
  stimata: boolean
  importo: number
  modalita: string | null
  famiglia_modalita: FamigliaModalita
  stato: StatoScadenza
  motivo_verifica: 'senza_modalita' | 'primo_import' | null
  iban: string | null
  blocco: 'iban_mancante' | 'iban_cambiato' | null
  /** Per le nate pagate: la data da scrivere come data di pagamento. */
  pagata: boolean
  segnalazione: string | null
}

/** 30 del mese successivo alla data della fattura (l'ultimo, se il mese è più corto). */
export function scadenzaStimata(dataFattura: string): string {
  const d = new Date(`${dataFattura}T12:00:00Z`)
  const anno = d.getUTCFullYear()
  const mese = d.getUTCMonth() + 1 // mese successivo, 0-based
  const ultimo = new Date(Date.UTC(anno, mese + 1, 0)).getUTCDate()
  return new Date(Date.UTC(anno, mese, Math.min(30, ultimo))).toISOString().slice(0, 10)
}

const arrotonda = (n: number) => Math.round(n * 100) / 100

export function scadenzeDa(f: FatturaSdi, c: Contesto): ScadenzaNuova[] {
  if (f.natura === 'integrazione') return []

  if (f.natura === 'nota_credito') {
    return [{
      posizione: 1,
      data_scadenza: f.data,
      stimata: false,
      importo: -Math.abs(f.daPagare),
      modalita: f.rate[0]?.modalita ?? null,
      famiglia_modalita: f.rate[0]?.famiglia ?? 'altro',
      stato: 'stornata',
      motivo_verifica: null,
      iban: null,
      blocco: null,
      pagata: false,
      segnalazione: 'nota di credito: da appaiare alla fattura che riduce',
    }]
  }

  // Le rate con un importo. Se non ce n'è nessuna, una rata unica col netto.
  const rate = f.rate.filter((r) => (r.importo ?? 0) > 0)
  const senzaModalita = f.rate.length === 0 || f.rate.every((r) => !r.modalita)
  const base = rate.length
    ? rate
    : [{ modalita: f.rate[0]?.modalita ?? null, famiglia: f.rate[0]?.famiglia ?? ('altro' as FamigliaModalita),
         scadenza: f.rate[0]?.scadenza ?? null, importo: f.daPagare, iban: f.rate.find((r) => r.iban)?.iban ?? null }]

  const ordinate = base
    .map((r) => {
      const stimata = !r.scadenza
      return { ...r, data: r.scadenza ?? (senzaModalita ? f.data : scadenzaStimata(f.data)), stimata: stimata && !senzaModalita }
    })
    .sort((a, b) => a.data.localeCompare(b.data) || (a.importo ?? 0) - (b.importo ?? 0))

  return ordinate.map((r, i) => {
    const famiglia = senzaModalita ? 'altro' : r.famiglia
    const importo = arrotonda(r.importo ?? f.daPagare)
    let stato: StatoScadenza
    let motivo: ScadenzaNuova['motivo_verifica'] = null
    let pagata = false

    if (famiglia === 'negozio') {
      stato = 'pagata'
      pagata = true
    } else if (famiglia === 'automatica') {
      stato = 'automatica'
    } else if (senzaModalita) {
      if (c.fornitore?.pagaAlMomento) {
        stato = 'pagata'
        pagata = true
      } else {
        stato = 'da_verificare'
        motivo = 'senza_modalita'
      }
    } else if (c.primoImport && r.data <= c.oggi) {
      stato = 'da_verificare'
      motivo = 'primo_import'
    } else {
      stato = importo > c.soglia ? 'da_approvare' : 'da_pagare'
    }

    // IBAN: quello della fattura, altrimenti quello confermato del fornitore.
    // Serve solo a chi deve fare un bonifico.
    const serveIban = !pagata && stato !== 'automatica' && famiglia !== 'automatica'
    const ibanFattura = r.iban ?? f.rate.find((x) => x.iban)?.iban ?? null
    const ibanNoto = c.fornitore?.iban ?? null
    let blocco: ScadenzaNuova['blocco'] = null
    if (serveIban && famiglia === 'bonifico') {
      if (!ibanFattura && !ibanNoto) blocco = 'iban_mancante'
      else if (ibanFattura && ibanNoto && c.fornitore?.ibanConfermato && ibanFattura !== ibanNoto) blocco = 'iban_cambiato'
    }

    const note = [
      r.stimata ? 'scadenza non indicata in fattura: stimata al 30 del mese successivo' : null,
      senzaModalita && stato === 'pagata' ? 'fornitore che si paga al momento' : null,
      senzaModalita && stato === 'da_verificare' ? 'la fattura non dice come si paga' : null,
      motivo === 'primo_import' ? 'primo import dagli XML: verificare che non sia già stata pagata' : null,
      blocco === 'iban_cambiato' ? `IBAN in fattura ${ibanFattura} diverso da quello confermato ${ibanNoto}` : null,
    ].filter(Boolean).join('; ') || null

    return {
      posizione: i + 1,
      data_scadenza: r.data,
      stimata: r.stimata,
      importo,
      modalita: r.modalita,
      famiglia_modalita: famiglia,
      stato,
      motivo_verifica: motivo,
      iban: serveIban ? (ibanFattura ?? ibanNoto) : ibanFattura,
      blocco,
      pagata,
      segnalazione: note,
    }
  })
}
