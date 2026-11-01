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
 *  3. Carta (MP08) → nata PAGATA: il denaro è già uscito.
 *     Contanti (MP01) NO (Dennis, 13/10/2026): in fattura c'è spesso scritto
 *     «contanti» anche quando non lo è. Si tratta come la regola 5: PAGATA solo
 *     se il fornitore è noto per pagare al momento, altrimenti "da verificare".
 *  4. RID, SDD, domiciliazioni → "automatica": esce da sola, nessuno la paga.
 *     Eccezione: i fornitori in SENZA_DOMICILIAZIONE (SMAT, 07/10/2026) scrivono
 *     SDD in fattura ma l'addebito non è attivo → vanno in coda come le altre.
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
 *
 * Dal 1/11/2026 (PARTENZA_QONTO, decisione di Dennis) per le fatture datate da
 * quel giorno il pagato si controlla su Qonto, non su quello che dice la
 * fattura: carta (regola 3), contanti (non ce ne sono più) e fornitori che si
 * pagano al momento (regola 5) nascono "da pagare" con l'avviso
 * `pagata_senza_movimento`. Subito dopo l'import gira l'abbinamento con le
 * uscite di Qonto (lib/qonto/riconciliazione.ts): se il movimento c'è, la
 * fattura si chiude da sola; se no resta in coda a Claudia con l'avviso.
 * Unica eccezione voluta alla regola sopra: Dennis ha scelto di vederle in
 * coda piuttosto che darle per pagate senza prova. RID/SDD restano come sono.
 * Vedi docs/riconciliazione-qonto.md.
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
  /** La fattura dice "già pagata" ma (ancora) nessun movimento su Qonto. */
  alert: 'pagata_senza_movimento' | null
}

/** Da questa data di fattura il pagato si controlla su Qonto. */
export const PARTENZA_QONTO = '2026-11-01'

/** 30 del mese successivo alla data della fattura (l'ultimo, se il mese è più corto). */
export function scadenzaStimata(dataFattura: string): string {
  const d = new Date(`${dataFattura}T12:00:00Z`)
  const anno = d.getUTCFullYear()
  const mese = d.getUTCMonth() + 1 // mese successivo, 0-based
  const ultimo = new Date(Date.UTC(anno, mese + 1, 0)).getUTCDate()
  return new Date(Date.UTC(anno, mese, Math.min(30, ultimo))).toISOString().slice(0, 10)
}

/**
 * Fornitori che in fattura scrivono RID/SDD ma da cui l'addebito non parte:
 * le loro fatture si pagano a mano (deciso con Dennis il 07/10/2026).
 * Chiave: partita IVA senza prefisso paese.
 */
export const SENZA_DOMICILIAZIONE: Record<string, string> = {
  '07937540016': 'SMAT',
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
      alert: null,
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
    const domiciliazioneFinta = !senzaModalita && r.famiglia === 'automatica' && !!f.piva && f.piva in SENZA_DOMICILIAZIONE
    const famiglia: FamigliaModalita = senzaModalita ? 'altro' : domiciliazioneFinta ? 'bonifico' : r.famiglia
    const importo = arrotonda(r.importo ?? f.daPagare)
    // Contanti dichiarati in fattura: non ci si fida, come se la modalità mancasse.
    const contanti = r.modalita === 'MP01'
    let stato: StatoScadenza
    let motivo: ScadenzaNuova['motivo_verifica'] = null
    let pagata = false
    let alert: ScadenzaNuova['alert'] = null
    // Dal 1/11/2026 niente contanti: «contanti» in fattura vale come «già pagata».
    const conQonto = !!f.data && f.data >= PARTENZA_QONTO
    const giaPagataSecondoFattura =
      famiglia === 'negozio' ||
      (conQonto && contanti) ||
      ((senzaModalita || contanti) && !!c.fornitore?.pagaAlMomento)

    if (giaPagataSecondoFattura) {
      if (conQonto) {
        // La prova la dà Qonto: finché il movimento non c'è, va in coda a Claudia.
        stato = 'da_pagare'
        alert = 'pagata_senza_movimento'
      } else {
        stato = 'pagata'
        pagata = true
      }
    } else if (famiglia === 'automatica') {
      stato = 'automatica'
    } else if (senzaModalita || contanti) {
      stato = 'da_verificare'
      motivo = 'senza_modalita'
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
    if (serveIban && famiglia === 'bonifico' && !domiciliazioneFinta) {
      if (!ibanFattura && !ibanNoto) blocco = 'iban_mancante'
      else if (ibanFattura && ibanNoto && c.fornitore?.ibanConfermato && ibanFattura !== ibanNoto) blocco = 'iban_cambiato'
    }

    const note = [
      domiciliazioneFinta ? `${SENZA_DOMICILIAZIONE[f.piva!]}: in fattura c'è l'addebito diretto ma non è attivo, va pagata` : null,
      r.stimata ? 'scadenza non indicata in fattura: stimata al 30 del mese successivo' : null,
      (senzaModalita || contanti) && stato === 'pagata' ? 'fornitore che si paga al momento' : null,
      senzaModalita && stato === 'da_verificare' ? 'la fattura non dice come si paga' : null,
      contanti && stato === 'da_verificare' ? 'in fattura c\'è «contanti», ma non è detto che sia stata pagata così' : null,
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
      alert,
    }
  })
}
