/**
 * Preventivi — le operazioni complete, quelle che chiamano le route.
 *
 * Qui si mettono insieme le regole (flusso.ts), i conti (calcoli.ts), le liste
 * (data.ts), il documento e le mail. Le route restano sottili: leggono il
 * corpo, controllano l'accesso e chiamano una di queste.
 */

import { getCentriDiCosto } from '@/lib/centri-costo/data'
import { CARTELLA_DEFAULT, type DatiPreventivo, type Preventivo, type Tariffa } from '@/types/preventivi'
import { type AccessoPreventivi, vedeCentro } from './accesso'
import { aggiungiGiorni, allineaPrezzi, finePeriodo, mesiPeriodo, oggiIso } from './calcoli'
import {
  aggiornaCampi,
  campiStato,
  creaPreventivo,
  getPreventivo,
  getTariffe,
  inCoda,
  prossimoNumero,
  ricordaContatto,
  salvaDati,
} from './data'
import { archiviaAccettato, pdfPreventivo } from './documento'
import { mancantiPerEmettere, problemiTariffe } from './flusso'
import { notificaAccettato } from './notifiche'

export class ErrorePreventivo extends Error {
  constructor(messaggio: string, public stato = 400) {
    super(messaggio)
  }
}

async function nomeCentro(cc: string): Promise<string> {
  const c = (await getCentriDiCosto()).find((x) => x.codice.toLowerCase() === cc.toLowerCase())
  return c?.nome ?? ''
}

/** Il preventivo, se chi chiede può vederlo; altrimenti un errore 404/403. */
export async function preventivoPer(id: string, a: AccessoPreventivi): Promise<Preventivo> {
  const p = await getPreventivo(id)
  if (!p) throw new ErrorePreventivo('Preventivo non trovato', 404)
  if (!vedeCentro(a, p.ccCodice)) throw new ErrorePreventivo('Non è un preventivo dei tuoi servizi', 403)
  return p
}

function controllaCentro(d: DatiPreventivo, a: AccessoPreventivi) {
  if (!vedeCentro(a, d.ccCodice)) throw new ErrorePreventivo('Puoi fare preventivi solo per i tuoi servizi', 403)
}

/** Data a cui valgono i prezzi: l'inizio del periodo se c'è, altrimenti oggi. */
const dataPrezzi = (d: Pick<DatiPreventivo, 'dal'>) => d.dal || oggiIso()

export async function crea(d: DatiPreventivo, a: AccessoPreventivi, autore: { email: string; nome: string }) {
  controllaCentro(d, a)
  const tariffe = await getTariffe()
  const problemi = problemiTariffe(d.righe, tariffe, dataPrezzi(d), d.ambito, a.tutti)
  if (problemi.length) throw new ErrorePreventivo(problemi.join(' · '))
  return creaPreventivo(d, await nomeCentro(d.ccCodice), autore)
}

export async function salva(id: string, d: DatiPreventivo, a: AccessoPreventivi) {
  const p = await preventivoPer(id, a)
  if (p.stato !== 'bozza') throw new ErrorePreventivo('Si modifica solo una bozza: riaprilo prima')
  controllaCentro(d, a)
  const tariffe = await getTariffe()
  const problemi = problemiTariffe(d.righe, tariffe, dataPrezzi(d), d.ambito, a.tutti)
  if (problemi.length) throw new ErrorePreventivo(problemi.join(' · '))
  return salvaDati(id, d, await nomeCentro(d.ccCodice))
}

/**
 * Emissione: controlla completezza e prezzi, assegna il protocollo (se è la
 * prima volta), sale la revisione, ricorda il destinatario in rubrica.
 */
export async function emetti(id: string, a: AccessoPreventivi): Promise<Preventivo> {
  const p = await preventivoPer(id, a)
  if (p.stato !== 'bozza') throw new ErrorePreventivo('È già stato emesso')
  const mancano = mancantiPerEmettere(p)
  if (mancano.length) throw new ErrorePreventivo(`Per emettere manca: ${mancano.join(', ')}`)
  const problemi = problemiTariffe(p.righe, await getTariffe(), dataPrezzi(p), p.ambito, a.tutti)
  if (problemi.length) throw new ErrorePreventivo(problemi.join(' · '))

  await inCoda(async () => {
    const anno = p.anno ?? Number(oggiIso().slice(0, 4))
    const assegnato = p.numero && p.progressivo ? { numero: p.numero, progressivo: p.progressivo } : await prossimoNumero(anno)
    await aggiornaCampi(id, campiStato.emesso(assegnato.numero, anno, assegnato.progressivo, (p.revisione || 0) + 1))
  })
  await ricordaContatto(p.destinatario)
  return (await getPreventivo(id))!
}

export async function riapri(id: string, a: AccessoPreventivi) {
  const p = await preventivoPer(id, a)
  if (p.stato !== 'emesso') throw new ErrorePreventivo('Si riapre solo un preventivo inviato e senza esito')
  await aggiornaCampi(id, { Stato: 'bozza' })
  return (await getPreventivo(id))!
}

/**
 * Accettato: si archivia il PDF definitivo in "Preventivi accettati" e lo si
 * manda ad Andrea. Se il PDF non riesce l'esito si registra lo stesso — è il
 * dato che conta — e la mail lo dice.
 */
export async function accetta(id: string, a: AccessoPreventivi, data: string, nota: string, chi: string) {
  const p = await preventivoPer(id, a)
  if (p.stato !== 'emesso') throw new ErrorePreventivo('Si accetta solo un preventivo inviato')
  await aggiornaCampi(id, campiStato.esito('accettato', data, chi, nota))
  const agg = (await getPreventivo(id))!
  let pdf: Buffer | null = null
  try {
    pdf = await pdfPreventivo(agg)
    const url = await archiviaAccettato(agg, pdf)
    if (url) await aggiornaCampi(id, { PdfUrl: url })
  } catch (e) {
    console.error('[preventivi] archiviazione del PDF accettato non riuscita:', e)
  }
  await notificaAccettato(agg, pdf, chi)
  return (await getPreventivo(id))!
}

export async function rifiuta(id: string, a: AccessoPreventivi, data: string, nota: string, chi: string) {
  const p = await preventivoPer(id, a)
  if (p.stato !== 'emesso') throw new ErrorePreventivo('Si rifiuta solo un preventivo inviato')
  await aggiornaCampi(id, campiStato.esito('rifiutato', data, chi, nota))
  return (await getPreventivo(id))!
}

export async function annulla(id: string, a: AccessoPreventivi) {
  const p = await preventivoPer(id, a)
  if (p.stato !== 'bozza') throw new ErrorePreventivo('Si annulla solo una bozza')
  await aggiornaCampi(id, { Stato: 'annullato' })
  return (await getPreventivo(id))!
}

/**
 * Copia in una bozza nuova. Il rinnovo sposta il periodo subito dopo il
 * precedente con la stessa durata e porta i prezzi al tariffario in vigore
 * (dopo un adeguamento ISTAT il rinnovo esce già aggiornato).
 */
export async function copia(
  id: string,
  a: AccessoPreventivi,
  autore: { email: string; nome: string },
  modo: 'rinnova' | 'duplica',
): Promise<{ preventivo: Preventivo; cambiate: { voce: string; prima: number; dopo: number }[]; senzaTariffa: string[] }> {
  const p = await preventivoPer(id, a)
  let dal = p.dal
  let al = p.al
  if (modo === 'rinnova') {
    const mesi = Math.max(1, Math.round(mesiPeriodo(p.dal, p.al)) || 6)
    dal = p.al ? aggiungiGiorni(p.al, 1) : oggiIso()
    al = finePeriodo(dal, mesi)
  }
  const tariffe: Tariffa[] = await getTariffe()
  const allineate = allineaPrezzi(p.righe, tariffe, dal || oggiIso(), p.ambito)
  const d: DatiPreventivo = {
    modello: p.modello,
    ccCodice: p.ccCodice,
    cartella: p.cartella || CARTELLA_DEFAULT[p.modello],
    ambito: p.ambito,
    destinatario: p.destinatario,
    beneficiario: p.beneficiario,
    oggetto: modo === 'rinnova' && p.oggetto && !/rinnovo/i.test(p.oggetto) ? `Rinnovo — ${p.oggetto}` : p.oggetto,
    tipoProgetto: p.tipoProgetto,
    ripartizione: p.ripartizione,
    dal,
    al,
    righe: allineate.righe.filter((r) => !allineate.senzaTariffa.includes(r.voce)),
    note: p.note,
  }
  controllaCentro(d, a)
  const nuovo = await creaPreventivo(d, p.ccNome, autore, modo === 'rinnova' ? p.spItemId : undefined)
  return { preventivo: nuovo, cambiate: allineate.cambiate, senzaTariffa: allineate.senzaTariffa }
}
