/**
 * Ponte fra l'anagrafica Risorse Umane (SharePoint) e l'anagrafica delle
 * timbrature (Supabase).
 *
 * Chi compila il foglio ore è chi ha "Timbratura attiva = Si" sulla propria
 * scheda RU (dipendenti o tirocini) E ha il rapporto ancora in corso.
 * Il collegamento fra i due mondi è la MAIL AZIENDALE, che è anche l'account
 * Microsoft 365 con cui la persona entra nell'app: senza quella non c'è modo di
 * riconoscerla.
 *
 * Due punti di ingresso:
 *   - `sincronizzaRecordRU`  → chiamato al salvataggio di una scheda RU, per
 *     applicare subito la spunta appena messa o togliata.
 *   - `sincronizzaTuttoRU`   → chiamato dal pulsante "Sincronizza da anagrafica"
 *     nel cruscotto HR, per il primo popolamento e per riallineare in blocco.
 *
 * Nota: la disattivazione è sempre "morbida" (`attivo = false`). Le righe di ore
 * già inserite e i mesi già chiusi restano al loro posto: servono per i
 * conguagli e non vanno persi quando una persona esce.
 */

import { getItems } from '@/lib/risorse-umane/data'
import { upsertDipendenteDaRU, type AzioneSync } from '@/lib/timbrature/data'
import type { GraphClient } from '@/lib/core/graph-delegato'
import { RU_CONFIG, type RUEntity, type RURecord } from '@/types/risorse-umane'

/** Valore del campo RU che abilita le timbrature. */
const ATTIVA = 'Si'

/** Stato del rapporto di lavoro che chiude l'accesso (dipendenti). */
const RAPPORTO_CHIUSO = 'Cessato'

/** Stati del tirocinio che chiudono l'accesso. */
const TIROCINIO_CHIUSO: readonly string[] = ['INTERROTTO', 'TERMINATO']

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

/**
 * Il rapporto è terminato? Vale sia per i dipendenti (`StatoRapporto`) sia per i
 * tirocini (`StatoTirocinio`): la stessa scheda ha solo uno dei due campi.
 */
export function rapportoChiuso(rec: RURecord): boolean {
  if (str(rec.StatoRapporto) === RAPPORTO_CHIUSO) return true
  return TIROCINIO_CHIUSO.includes(str(rec.StatoTirocinio).toUpperCase())
}

/**
 * Chi lavora per la cooperativa, e quindi può avere un foglio ore.
 * Deciso con Dennis il 7 ott 2026: in anagrafica ci sono anche soci volontari,
 * fruitori e sovventori, che le timbrature non le devono vedere.
 */
const TIPI_LAVORATORE: readonly string[] = [
  'Dipendente', 'Socio lavoratore', 'Apprendista', 'Libero professionista',
  'Socio libero professionista', 'Collaborazione Coordinate Continuativa',
  'Tirocinante e/o Stagista', 'Volontario in servizio civile',
]
const TIPI_NON_LAVORATORE: readonly string[] = [
  'Socio volontario', 'Socio fruitore', 'Socio persona giuridica', 'Socio sovventore e finanziatore',
]

export type ClasseLavoro = 'lavoratore' | 'non-lavoratore' | 'incerto'

/**
 * La scheda è di un lavoratore?
 *
 * Fa fede il "Tipo di rapporto". Se è vuoto, un tipo di contratto o una
 * matricola bastano a dire che lavora; senza nessuno dei tre è "incerto" e non
 * si indovina: le HR completano la scheda. I tirocini (che il campo non ce
 * l'hanno) sono sempre lavoratori. Al 7 ott 2026: 117 lavoratori, 6 soci
 * volontari, 9 incerti (vedi scripts/diagnosi-lavoratori.mjs).
 */
export function classeLavoro(rec: RURecord): ClasseLavoro {
  const tirocinio = 'StatoTirocinio' in rec && !('TipoRapporto' in rec)
  if (tirocinio) return 'lavoratore'
  const tipo = str(rec.TipoRapporto)
  if (TIPI_LAVORATORE.includes(tipo)) return 'lavoratore'
  if (TIPI_NON_LAVORATORE.includes(tipo)) return 'non-lavoratore'
  if (str(rec.TipoContratto) || str(rec.Matricola)) return 'lavoratore'
  return 'incerto'
}

export interface Abilitazione {
  /** Esito finale: la persona può compilare il foglio ore. */
  attivo: boolean
  /** La spunta in anagrafica. */
  spuntata: boolean
  /** True quando la spunta c'è ma il rapporto è chiuso: l'accesso decade. */
  decaduta: boolean
  /** True quando la spunta c'è ma la scheda non è di un lavoratore (o non si sa). */
  nonLavoratore: boolean
}

/**
 * Decide se la persona è abilitata alle timbrature.
 *
 * La spunta non basta: se il rapporto è chiuso l'accesso decade comunque, senza
 * che nessuno debba ricordarsi di togliere la spunta. Questo è anche il motivo
 * per cui la spunta viene lasciata come è: se la persona rientra (per esempio un
 * contratto rinnovato) basta rimettere lo stato in corso e l'accesso torna.
 *
 * Lo stesso vale per chi non è un lavoratore (o ha il tipo di rapporto vuoto):
 * la spunta da sola non lo abilita.
 */
export function abilitazione(rec: RURecord): Abilitazione {
  const spuntata = str(rec.TimbraturaAttiva) === ATTIVA
  const chiuso = rapportoChiuso(rec)
  const lavora = classeLavoro(rec) === 'lavoratore'
  return {
    attivo: spuntata && !chiuso && lavora,
    spuntata,
    decaduta: spuntata && chiuso,
    nonLavoratore: spuntata && !chiuso && !lavora,
  }
}

/**
 * Mail aziendale della scheda, in minuscolo. È la chiave del collegamento:
 * deve essere l'account Microsoft 365 con cui la persona accede all'app.
 */
export function mailChiave(rec: RURecord): string {
  return str(rec.MailAziendale).toLowerCase()
}

/**
 * Nominativo nella forma "Cognome Nome", come nei fogli ore e negli elenchi.
 * Ripiega su Title (che SharePoint valorizza già così) e infine sulla mail.
 */
export function nominativoRU(rec: RURecord): string {
  const cognome = str(rec.Cognome)
  const nome = str(rec.Nome)
  const composto = `${cognome} ${nome}`.trim()
  return composto || str(rec.Title) || mailChiave(rec)
}

/** Referente del foglio ore dichiarato in anagrafica, o null. */
export function referenteRU(rec: RURecord): string | null {
  return str(rec.ReferenteFoglioOre).toLowerCase() || null
}

/**
 * La persona non timbra: il suo foglio ore si genera dall'orario teorico.
 *
 * Non è il contrario di `TimbraturaAttiva`, e le due spunte vanno insieme: chi
 * non timbra deve comunque essere abilitato, perché un foglio ore ce l'ha e
 * qualcuno deve poterlo aprire, compilare e validare. "Non timbra" dice come le
 * righe entrano, non se esistono.
 */
export function nonTimbraRU(rec: RURecord): boolean {
  return str(rec.NonTimbra) === ATTIVA
}

export interface EsitoRecord {
  ok: boolean
  /** Cosa è stato fatto sul database timbrature. */
  azione?: AzioneSync
  /** Messaggio da mostrare alle HR quando c'è qualcosa da sapere. */
  avviso?: string
}

/**
 * Allinea UNA scheda RU. Non lancia: un problema di sincronizzazione non deve
 * far fallire il salvataggio dell'anagrafica, che è l'operazione principale.
 */
export async function sincronizzaRecordRU(rec: RURecord): Promise<EsitoRecord> {
  const ab = abilitazione(rec)
  const email = mailChiave(rec)

  if (!email) {
    // Senza mail aziendale non c'è account con cui accedere: se la spunta è
    // stata messa comunque, va detto, altrimenti non c'è niente da fare.
    return ab.spuntata
      ? { ok: false, avviso: 'Timbratura attivata ma manca la mail aziendale: la persona non potrà accedere al foglio ore finché non viene inserita.' }
      : { ok: true, azione: 'invariato' }
  }

  try {
    const nonTimbra = nonTimbraRU(rec)
    const azione = await upsertDipendenteDaRU(email, {
      cognomeNome: nominativoRU(rec),
      referenteEmail: referenteRU(rec),
      attivo: ab.attivo,
      nonTimbra,
    })

    if (ab.decaduta) {
      return { ok: true, azione, avviso: 'Timbrature non attive: il rapporto risulta chiuso. Rimetti lo stato in corso per riattivarle.' }
    }
    if (ab.nonLavoratore) {
      return {
        ok: true,
        azione,
        avviso: classeLavoro(rec) === 'incerto'
          ? 'Timbrature non attive: manca il "Tipo di rapporto". Sceglilo nella scheda (es. Socio lavoratore, Dipendente) e salva di nuovo.'
          : `Timbrature non attive: "${str(rec.TipoRapporto)}" non è un rapporto di lavoro, quindi non c'è un foglio ore.`,
      }
    }
    if (nonTimbra && !ab.spuntata) {
      return {
        ok: true,
        azione,
        avviso: '"Non timbra" da sola non basta: senza "Timbratura attiva" la persona non ha un foglio ore da compilare. Metti Si anche lì.',
      }
    }
    if (azione === 'creato' || azione === 'attivato') {
      return {
        ok: true,
        azione,
        avviso: nonTimbra
          ? 'Timbratura attivata senza timbratura giornaliera. Imposta l\'orario teorico dal Cruscotto Timbrature: senza, non c\'è niente da cui generare il mese.'
          : 'Timbratura attivata. Ricordati di impostare il monte ore settimanale dal Cruscotto Timbrature.',
      }
    }
    return { ok: true, azione }
  } catch (e) {
    return { ok: false, avviso: `Anagrafica salvata, ma la sincronizzazione delle timbrature non è riuscita: ${e instanceof Error ? e.message : 'errore'}` }
  }
}

export interface EsitoSync {
  esaminati: number
  creati: number
  attivati: number
  disattivati: number
  aggiornati: number
  invariati: number
  /** Nominativi con la spunta ma con il rapporto chiuso: accesso decaduto. */
  decaduti: string[]
  /** Nominativi con la spunta ma senza mail aziendale: non sincronizzabili. */
  senzaMail: string[]
  /** Errori per singolo record, già leggibili. */
  errori: string[]
}

/**
 * Allinea TUTTE le schede RU (dipendenti + tirocini) al database timbrature.
 * Idempotente: rieseguirla non cambia nulla se l'anagrafica non è cambiata.
 */
export async function sincronizzaTuttoRU(gc: GraphClient): Promise<EsitoSync> {
  const out: EsitoSync = {
    esaminati: 0, creati: 0, attivati: 0, disattivati: 0, aggiornati: 0, invariati: 0,
    decaduti: [], senzaMail: [], errori: [],
  }

  const entita = Object.keys(RU_CONFIG) as RUEntity[]
  for (const entity of entita) {
    const records = await getItems(gc, entity)
    for (const rec of records) {
      out.esaminati++
      const ab = abilitazione(rec)
      const email = mailChiave(rec)

      if (!email) {
        if (ab.spuntata) out.senzaMail.push(nominativoRU(rec))
        else out.invariati++
        continue
      }

      try {
        const azione = await upsertDipendenteDaRU(email, {
          cognomeNome: nominativoRU(rec),
          referenteEmail: referenteRU(rec),
          attivo: ab.attivo,
          nonTimbra: nonTimbraRU(rec),
        })
        if (azione === 'creato') out.creati++
        else if (azione === 'attivato') out.attivati++
        else if (azione === 'disattivato') out.disattivati++
        else if (azione === 'aggiornato') out.aggiornati++
        else out.invariati++

        if (ab.decaduta) out.decaduti.push(nominativoRU(rec))
      } catch (e) {
        out.errori.push(`${nominativoRU(rec)}: ${e instanceof Error ? e.message : 'errore'}`)
      }
    }
  }

  return out
}
