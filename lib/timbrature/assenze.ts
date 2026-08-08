/**
 * Assenze su piu' giorni consecutivi.
 *
 * Sta in un file suo e non dentro `righe.ts` perche' e' un mestiere diverso:
 * `righe.ts` scrive UNA voce e sa dire di no; qui si lavora su un periodo, dove
 * il "no" su una singola giornata non ferma le altre e va invece raccontato a
 * fine corsa. E' anche il motivo per cui l'esito non e' un booleano ma quattro
 * elenchi.
 *
 * Solo giornate intere: per prendere qualche ora si va sul singolo giorno, dove
 * si scelgono gli orari.
 */

import { monteToSettimana, profiloVigente, servizioById } from '@/lib/timbrature/anagrafica'
import { addGiorni, weekdayIso } from '@/lib/timbrature/date'
import { festivitaAnno } from '@/lib/timbrature/festivita'
import {
  assertScrivibile,
  eliminaTimbratura,
  inserisci,
  listTimbrature,
  type OpzioniScrittura,
} from '@/lib/timbrature/righe'
import type { EsitoAssenzaPeriodo } from '@/types/timbrature'

/** Le date da `dal` a `al` compresi, in ordine. */
function giorniDelPeriodo(dal: string, al: string): string[] {
  const out: string[] = []
  for (let d = dal; d <= al; d = addGiorni(d, 1)) {
    out.push(d)
    if (out.length > 400) break // paracadute contro un periodo assurdo
  }
  return out
}

/**
 * Inserisce un giustificativo a giornata intera su un periodo.
 *
 * Serve perche' due settimane di ferie non si inseriscono aprendo quattordici
 * giornate.
 *
 * Salta, e lo dice:
 *   - i giorni a monte ore zero (domeniche, festivi): una riga da zero ore non
 *     serve a nulla;
 *   - i giorni che hanno gia' qualcosa scritto: le ferie non si mettono sopra
 *     una giornata lavorata.
 *
 * Un periodo che scavalca il mese funziona: i giustificativi si programmano in
 * anticipo, e il mese non ancora arrivato e' aperto. Se il mese di destinazione
 * e' invece gia' validato, quei giorni finiscono fra gli errori con il motivo.
 */
export async function creaAssenzaPeriodo(
  dipendenteId: number,
  servizioId: number,
  dal: string,
  al: string,
  creataDa: string,
  opts: OpzioniScrittura = {},
): Promise<EsitoAssenzaPeriodo> {
  if (al < dal) throw new Error('La data finale e\' precedente a quella iniziale')
  const serv = await servizioById(servizioId)
  if (serv.tipoVoce !== 'giustificativo') {
    throw new Error('Su un periodo si inseriscono solo assenze, non ore di lavoro')
  }

  const giorni = giorniDelPeriodo(dal, al)
  const festivita = { ...festivitaAnno(Number(dal.slice(0, 4))), ...festivitaAnno(Number(al.slice(0, 4))) }
  const monte = monteToSettimana(await profiloVigente(dipendenteId, dal))
  const esistenti = new Set((await listTimbrature(dipendenteId, dal, al)).map((t) => t.data))

  const esito: EsitoAssenzaPeriodo = { inserite: [], nonLavorativi: [], giaCompilati: [], errori: [] }
  for (const g of giorni) {
    const attese = festivita[g] ? 0 : monte[weekdayIso(g)]
    if (attese <= 0) {
      esito.nonLavorativi.push(g)
      continue
    }
    if (esistenti.has(g)) {
      esito.giaCompilati.push(g)
      continue
    }
    try {
      await assertScrivibile(dipendenteId, g, 'giustificativo', !!opts.perConto)
      await inserisci(
        dipendenteId,
        { data: g, servizioId },
        serv,
        creataDa,
        !!opts.perConto,
        { data: g, oraInizio: null, oraFine: null, ore: attese },
      )
      esito.inserite.push(g)
    } catch (e) {
      esito.errori.push({ data: g, motivo: e instanceof Error ? e.message : 'Errore' })
    }
  }
  return esito
}

/**
 * Toglie da un periodo le righe di un giustificativo.
 * Cancellare quattordici giorni uno per uno e' la stessa noia rovesciata.
 */
export async function eliminaAssenzaPeriodo(
  dipendenteId: number,
  servizioId: number,
  dal: string,
  al: string,
  opts: OpzioniScrittura = {},
): Promise<EsitoAssenzaPeriodo> {
  if (al < dal) throw new Error('La data finale e\' precedente a quella iniziale')
  const righe = (await listTimbrature(dipendenteId, dal, al)).filter((t) => t.servizioId === servizioId)

  const esito: EsitoAssenzaPeriodo = { inserite: [], rimosse: [], nonLavorativi: [], giaCompilati: [], errori: [] }
  for (const r of righe) {
    try {
      await eliminaTimbratura(dipendenteId, r.id, opts)
      esito.rimosse!.push(r.data)
    } catch (e) {
      esito.errori.push({ data: r.data, motivo: e instanceof Error ? e.message : 'Errore' })
    }
  }
  return esito
}
