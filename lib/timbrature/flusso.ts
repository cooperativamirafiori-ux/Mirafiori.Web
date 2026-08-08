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
  meseCompleto,
  primoUltimoGiorno,
  riepilogoPeriodo,
  statoMese,
} from '@/lib/timbrature/data'
import {
  DipendenteFuoriAnagrafica,
  pubblicaFoglioOre,
  type NotaValidazione,
} from '@/lib/timbrature/foglio-ore-xlsx'
import { graphRU, type GraphClient } from '@/lib/core/graph-delegato'
import { getUtentiPerArea } from '@/lib/core/permessi'
import { AREA_HR } from '@/lib/timbrature/guard'
import {
  notificaContestazioneFoglioOre,
  notificaDipendenteFuoriAnagrafica,
  notificaFoglioDaConfermare,
} from '@/lib/timbrature/notifiche'
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
 * Come destinatariValidazione, ma senza il ripiego alle HR: usata dal
 * sollecito automatico ai responsabili (cron), che non deve piu' arrivare
 * alle HR quando manca il referente. Chi resta senza referente compare solo
 * nell'avviso "senza referente" del cruscotto HR, non per mail.
 */
export function destinatarioResponsabile(dip: Dipendente): string[] {
  return dip.referenteEmail ? [dip.referenteEmail] : []
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
  /** La persona non e' in anagrafica RU: niente e' stato archiviato. */
  fuoriAnagrafica?: boolean
}

/**
 * La persona non e' in anagrafica RU: il flusso si ferma qui.
 *
 * Chi sta validando e' un responsabile, e un buco in anagrafica non lo puo'
 * chiudere lui: l'avviso deve arrivare a chi ha le mani sull'anagrafica,
 * altrimenti resta un messaggio d'errore che qualcuno legge e nessuno risolve.
 */
async function fermaPerAnagrafica(
  dip: Dipendente,
  e: DipendenteFuoriAnagrafica,
): Promise<EsitoValidazione> {
  try {
    const to = await getUtentiPerArea(AREA_HR)
    if (to.length) {
      await notificaDipendenteFuoriAnagrafica({
        to,
        cognomeNome: dip.cognomeNome,
        email: dip.email,
        linkApp: `${baseApp()}/risorse-umane/dipendenti`,
      })
    }
  } catch (err) {
    console.error('[timbrature] avviso anagrafica non spedito:', err)
  }
  return { ok: false, motivo: e.message, fuoriAnagrafica: true }
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
  if (stato === 'confermato') return { ok: false, motivo: 'Il foglio ore e gia definitivo.' }

  // Chiusura anticipata: un mese ancora aperto si puo' validare, ma solo se non
  // ha piu' nemmeno una giornata scoperta. E' il caso "sono in ferie dal 20 al
  // 31, il mio foglio e' finito": non c'e' motivo di aspettare il calendario.
  // Un foglio con i buchi invece non si chiude, per nessuno.
  if (stato === 'aperto') {
    if (!(await meseCompleto(dipendenteId, anno, mese))) {
      return {
        ok: false,
        motivo:
          'Il mese ha ancora giornate scoperte: si valida quando sono tutte complete, ' +
          'oppure quando la finestra dei tre giorni e scaduta.',
      }
    }
  }

  const gc = await clientRU(attore.email)
  const nota: NotaValidazione = {
    validatoDa: attore.nome || attore.email,
    validatoIl: new Date().toISOString(),
  }
  let pubblicato: Awaited<ReturnType<typeof pubblicaFoglioOre>>
  try {
    pubblicato = await pubblicaFoglioOre(dip, anno, mese, gc, nota)
  } catch (e) {
    if (e instanceof DipendenteFuoriAnagrafica) return await fermaPerAnagrafica(dip, e)
    throw e
  }
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
  let hrUrl: string | null = prima.fileHrUrl
  try {
    // `copiaHr`: e' questo il momento in cui il foglio diventa definitivo, e la
    // cartella HR del mese contiene solo definitivi, non bozze.
    const pubblicato = await pubblicaFoglioOre(dip, anno, mese, gc, nota, { copiaHr: true })
    pdfUrl = pubblicato.pdfUrl ?? pdfUrl
    hrUrl = pubblicato.hrUrl ?? hrUrl
  } catch (e) {
    // La conferma della persona non va persa per un problema di archiviazione:
    // resta il PDF prodotto alla validazione, che ha lo stesso contenuto.
    console.error('[timbrature] archiviazione del definitivo fallita:', e)
  }

  const chiusura = await marcaConfermato(dipendenteId, anno, mese, chi, {
    forzato: opts.forzato,
    pdfUrl,
    hrUrl,
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
