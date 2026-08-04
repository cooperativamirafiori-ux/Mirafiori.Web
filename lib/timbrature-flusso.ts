/**
 * Flusso di validazione del foglio ore mensile, separato dalle route perche'
 * gli stessi passaggi partono da tre posti diversi:
 *   - il cruscotto (responsabile o HR autenticati);
 *   - la pagina pubblica raggiunta dal link nella mail (nessun login);
 *   - il cron giornaliero (nessun utente).
 *
 * Il percorso:
 *   aperto  --(finestra scaduta, cron)-->  da_validare
 *           --(il responsabile valida)-->  validato   [PDF via mail al dipendente]
 *           --(il dipendente conferma)-->  confermato [PDF definitivo in cartella]
 *           --(il dipendente contesta)-->  contestato [torna al responsabile]
 */

import {
  getChiusura,
  getDipendenteById,
  getSubordinati,
  marcaConfermato,
  marcaContestato,
  marcaValidato,
  primoUltimoGiorno,
  riepilogoPeriodo,
  statoMese,
} from '@/lib/timbrature'
import { pubblicaFoglioOre, type NotaValidazione } from '@/lib/foglio-ore-xlsx'
import { graphRU, type GraphClient } from '@/lib/graph-delegato'
import { getUtentiPerArea } from '@/lib/sharepoint'
import { AREA_HR } from '@/lib/timbrature-guard'
import {
  notificaContestazioneFoglioOre,
  notificaFoglioDaConfermare,
} from '@/lib/notifications'
import type { ChiusuraMese, Dipendente } from '@/types/timbrature'

export const MESI_IT = [
  '', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

export const baseApp = () =>
  (process.env.APP_BASE_URL || 'https://mirafiori-web.vercel.app').replace(/\/$/, '')

export const linkTimbrature = () => `${baseApp()}/timbrature`
export const linkValidazione = () => `${baseApp()}/timbrature/validazione`
export const linkConferma = (token: string) => `${baseApp()}/foglio-ore/${token}`

/**
 * A chi tocca validare il foglio di questa persona.
 *
 * Se il referente non e' impostato in anagrafica la palla non puo' restare per
 * aria: passa alle HR. Un foglio senza destinatario e' un foglio che non chiude
 * mai, e nessuno se ne accorge.
 */
export async function destinatariValidazione(dip: Dipendente): Promise<string[]> {
  if (dip.referenteEmail) return [dip.referenteEmail]
  try {
    return await getUtentiPerArea(AREA_HR)
  } catch {
    return []
  }
}

/**
 * Identita' con cui scrivere su SharePoint.
 *
 * Si prova sempre a usare una persona reale, cosi' il log nativo di Microsoft
 * dice chi ha archiviato il documento. Quando non c'e' (conferma dal link nella
 * mail, cron) si ripiega sull'identita' applicativa dentro pubblicaFoglioOre.
 */
async function clientRU(email?: string | null): Promise<GraphClient | undefined> {
  if (!email) return undefined
  try {
    return await graphRU(email)
  } catch {
    return undefined
  }
}

export interface EsitoValidazione {
  ok: boolean
  motivo?: string
  chiusura?: ChiusuraMese
  /** Il PDF non e' stato prodotto: la mail parte senza allegato. */
  senzaPdf?: boolean
}

/**
 * Il responsabile (o le HR) valida il foglio: si genera il documento, lo si
 * archivia nella cartella personale e parte la mail di conferma al dipendente.
 */
export async function validaFoglio(
  dipendenteId: number,
  anno: number,
  mese: number,
  attore: { email: string; nome?: string | null },
): Promise<EsitoValidazione> {
  const dip = await getDipendenteById(dipendenteId)
  if (!dip) return { ok: false, motivo: 'Dipendente non trovato' }

  const stato = await statoMese(dipendenteId, anno, mese)
  if (stato === 'aperto') {
    return {
      ok: false,
      motivo:
        'Il mese e ancora aperto alla compilazione: si valida quando la finestra dei tre giorni e scaduta.',
    }
  }
  if (stato === 'confermato') return { ok: false, motivo: 'Il foglio ore e gia definitivo.' }

  const gc = await clientRU(attore.email)
  const nota: NotaValidazione = {
    validatoDa: attore.nome || attore.email,
    validatoIl: new Date().toISOString(),
  }
  const pubblicato = await pubblicaFoglioOre(dip, anno, mese, gc, nota)
  const chiusura = await marcaValidato(dipendenteId, anno, mese, attore.email, {
    xlsx: pubblicato.xlsxUrl,
    pdf: pubblicato.pdfUrl,
  })

  await inviaRichiestaConferma(dip, chiusura, { pdf: pubblicato.pdf })
  return { ok: true, chiusura, senzaPdf: !pubblicato.pdf }
}

/** Manda (o rimanda) al dipendente il foglio validato da confermare. */
export async function inviaRichiestaConferma(
  dip: Dipendente,
  chiusura: ChiusuraMese,
  opts: { pdf?: Buffer | null; sollecito?: boolean; giorniInAttesa?: number } = {},
): Promise<boolean> {
  if (!chiusura.token || !dip.email) return false
  const { from, to } = primoUltimoGiorno(chiusura.anno, chiusura.mese)
  const rp = await riepilogoPeriodo(dip.id, from, to)

  await notificaFoglioDaConfermare({
    to: dip.email,
    cognomeNome: (dip.cognomeNome || '').split(' ').slice(-1)[0] || dip.cognomeNome,
    meseNome: MESI_IT[chiusura.mese],
    anno: chiusura.anno,
    oreLavorate: rp.oreLavorate,
    oreGiustificativo: rp.oreGiustificativo,
    oreAttese: rp.oreAttese,
    validatoDa: chiusura.validatoDa ?? 'il tuo responsabile',
    urlBase: linkConferma(chiusura.token),
    pdf: opts.pdf
      ? {
          filename: `FoglioOre_${chiusura.anno}-${String(chiusura.mese).padStart(2, '0')}.pdf`,
          base64: opts.pdf.toString('base64'),
        }
      : undefined,
    sollecito: opts.sollecito,
    giorniInAttesa: opts.giorniInAttesa,
  })
  return true
}

/**
 * Il dipendente conferma. Il foglio viene rigenerato con la riga di stato
 * ("validato da / confermato da") e riarchiviato: la copia definitiva porta
 * scritto addosso chi l'ha approvata.
 *
 * Idempotente: una seconda conferma non sovrascrive la prima.
 */
export async function confermaFoglio(
  dipendenteId: number,
  anno: number,
  mese: number,
  chi: string,
  opts: { forzato?: boolean } = {},
): Promise<EsitoValidazione> {
  const dip = await getDipendenteById(dipendenteId)
  if (!dip) return { ok: false, motivo: 'Dipendente non trovato' }
  const prima = await getChiusura(dipendenteId, anno, mese)
  if (!prima) return { ok: false, motivo: 'Foglio ore non trovato' }
  if (prima.stato === 'confermato') return { ok: false, motivo: 'Hai gia confermato questo foglio ore.', chiusura: prima }
  if (prima.stato !== 'validato' && prima.stato !== 'contestato') {
    return { ok: false, motivo: 'Il foglio ore non e in attesa di conferma.', chiusura: prima }
  }

  // Si scrive con l'identita' di chi ha validato: al momento della conferma,
  // che arriva dal link nella mail, non c'e' nessuno autenticato.
  const gc = await clientRU(prima.validatoDa)
  const nota: NotaValidazione = {
    validatoDa: prima.validatoDa,
    validatoIl: prima.validatoIl,
    confermatoDa: opts.forzato ? chi : dip.cognomeNome,
    confermatoIl: new Date().toISOString(),
    forzato: opts.forzato,
  }
  let pdfUrl: string | null = prima.filePdfUrl
  try {
    const pubblicato = await pubblicaFoglioOre(dip, anno, mese, gc, nota)
    pdfUrl = pubblicato.pdfUrl ?? pdfUrl
  } catch (e) {
    // La conferma della persona non va persa per un problema di archiviazione:
    // resta il PDF prodotto alla validazione, che ha lo stesso contenuto.
    console.error('[timbrature] archiviazione del definitivo fallita:', e)
  }

  const chiusura = await marcaConfermato(dipendenteId, anno, mese, chi, {
    forzato: opts.forzato,
    pdfUrl,
  })
  return { ok: true, chiusura }
}

/** Il dipendente segnala un errore: il foglio torna al responsabile. */
export async function contestaFoglio(
  dipendenteId: number,
  anno: number,
  mese: number,
  note: string,
): Promise<EsitoValidazione> {
  const dip = await getDipendenteById(dipendenteId)
  if (!dip) return { ok: false, motivo: 'Dipendente non trovato' }
  const prima = await getChiusura(dipendenteId, anno, mese)
  if (!prima) return { ok: false, motivo: 'Foglio ore non trovato' }
  if (prima.stato === 'confermato') return { ok: false, motivo: 'Il foglio ore e gia definitivo.', chiusura: prima }
  if (prima.stato === 'contestato') return { ok: false, motivo: 'Hai gia segnalato un errore su questo foglio ore.', chiusura: prima }

  const chiusura = await marcaContestato(dipendenteId, anno, mese, note)
  const to = await destinatariValidazione(dip)
  if (to.length) {
    await notificaContestazioneFoglioOre({
      to,
      cognomeNome: dip.cognomeNome,
      meseNome: MESI_IT[mese],
      anno,
      note,
      linkApp: linkValidazione(),
    }).catch(console.error)
  }
  return { ok: true, chiusura }
}

/** Elenco dei collaboratori di un responsabile, per le mail di riepilogo. */
export async function nominativiDi(referente: string): Promise<Map<number, Dipendente>> {
  const subs = await getSubordinati(referente)
  return new Map(subs.map((d) => [d.id, d]))
}
