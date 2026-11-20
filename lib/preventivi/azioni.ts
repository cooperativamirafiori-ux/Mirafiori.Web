/**
 * Preventivi — le operazioni complete, quelle che chiamano le route.
 *
 * Qui si mettono insieme le regole (flusso.ts), i conti (calcoli.ts), le liste
 * (data.ts), il documento e le mail. Le route restano sottili: leggono il
 * corpo, controllano l'accesso e chiamano una di queste.
 */

import { getCentriDiCosto } from '@/lib/centri-costo/data'
import { type DatiPreventivo, type Preventivo, type Tariffa } from '@/types/preventivi'
import { type AccessoPreventivi, vedeCentro } from './accesso'
import { aggiungiGiorni, allineaPrezzi, entiDestinatari, oggiIso } from './calcoli'
import {
  aggiornaCampi,
  campiStato,
  creaPreventivo,
  getEnti,
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

/** Gli enti a cui va (la coppia di Torino sono due) e il controllo delle voci. */
async function controllaTariffe(d: DatiPreventivo, a: AccessoPreventivi): Promise<string[]> {
  const [tariffe, elencoEnti] = await Promise.all([getTariffe(), getEnti()])
  const enti = entiDestinatari(d.ente, d.servizio, elencoEnti)
  const problemi = problemiTariffe(d, enti, tariffe, dataPrezzi(d), a.tutti)
  if (problemi.length) throw new ErrorePreventivo(problemi.join(' · '))
  return enti
}

export async function crea(d: DatiPreventivo, a: AccessoPreventivi, autore: { email: string; nome: string }) {
  controllaCentro(d, a)
  const enti = await controllaTariffe(d, a)
  return creaPreventivo(d, await nomeCentro(d.ccCodice), enti, autore)
}

export async function salva(id: string, d: DatiPreventivo, a: AccessoPreventivi) {
  const p = await preventivoPer(id, a)
  if (p.stato !== 'bozza') throw new ErrorePreventivo('Si modifica solo una bozza: riaprilo prima')
  controllaCentro(d, a)
  const enti = await controllaTariffe(d, a)
  return salvaDati(id, d, await nomeCentro(d.ccCodice), enti)
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
  await controllaTariffe(p, a)

  await inCoda(async () => {
    const anno = p.anno ?? Number(oggiIso().slice(0, 4))
    const assegnato = p.numero && p.progressivo ? { numero: p.numero, progressivo: p.progressivo } : await prossimoNumero(anno)
    await aggiornaCampi(id, campiStato.emesso(assegnato.numero, anno, assegnato.progressivo, (p.revisione || 0) + 1))
  })
  for (const persona of p.persone) await ricordaContatto(persona)
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
 * Copia in una bozza nuova. Il rinnovo parte il giorno dopo la fine del
 * precedente, con la stessa durata (se l'inizio era da definire resta da
 * definire), e porta i prezzi al tariffario in vigore (dopo un adeguamento
 * ISTAT il rinnovo esce già aggiornato).
 */
export async function copia(
  id: string,
  a: AccessoPreventivi,
  autore: { email: string; nome: string },
  modo: 'rinnova' | 'duplica',
): Promise<{ preventivo: Preventivo; cambiate: { voce: string; prima: number; dopo: number }[]; senzaTariffa: string[] }> {
  const p = await preventivoPer(id, a)
  const dal = modo === 'rinnova' && p.al ? aggiungiGiorni(p.al, 1) : modo === 'rinnova' ? '' : p.dal
  const [tariffe, elencoEnti]: [Tariffa[], Awaited<ReturnType<typeof getEnti>>] = await Promise.all([getTariffe(), getEnti()])
  const allineate = allineaPrezzi(p.righe, tariffe, dal || oggiIso())
  const d: DatiPreventivo = {
    ccCodice: p.ccCodice,
    cartella: p.cartella,
    servizio: p.servizio,
    sottotipo: p.sottotipo,
    ente: p.ente,
    persone: p.persone,
    beneficiario: p.beneficiario,
    oggetto: modo === 'rinnova' && p.oggetto && !/rinnovo/i.test(p.oggetto) ? `Rinnovo — ${p.oggetto}` : p.oggetto,
    tipoProgetto: p.tipoProgetto,
    ripartizione: p.ripartizione,
    dal,
    durataMesi: p.durataMesi,
    righe: allineate.righe.filter((r) => !allineate.senzaTariffa.includes(r.voce)),
    note: p.note,
    maggiorazione: p.maggiorazione,
    referente2: p.referente2,
  }
  controllaCentro(d, a)
  const enti = entiDestinatari(d.ente, d.servizio, elencoEnti)
  const nuovo = await creaPreventivo(d, p.ccNome, enti.length ? enti : p.enti, autore, modo === 'rinnova' ? p.spItemId : undefined)
  return { preventivo: nuovo, cambiate: allineate.cambiate, senzaTariffa: allineate.senzaTariffa }
}
