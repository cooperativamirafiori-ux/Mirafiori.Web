/**
 * Le regole delle assegnazioni. **È l'unica porta per assegnare e restituire.**
 *
 * Sta qui e non nelle schermate perché i dati di partenza dimostrano cosa
 * succede quando nessuno le fa rispettare: nelle liste dell'IT tre dispositivi
 * su cinquantadue avevano lo stato in contraddizione con la loro assegnazione, e
 * uno risultava dismesso mentre era in mano a una persona.
 *
 * Le regole sono cinque:
 *
 *   1. **Una sola assegnazione attiva per oggetto.** Assegnare chiude quella di
 *      prima, le mette la data di fine e apre la nuova: una sola operazione, non
 *      tre da ricordarsi in fila.
 *   2. **Lo stato del bene è derivato.** Assegnazione attiva → "In uso"; nessuna
 *      → "In magazzino". Non lo si digita due volte. "In riparazione" resta dov'è:
 *      è un'informazione che l'assegnazione non conosce.
 *   3. **Uscire dal patrimonio chiude l'assegnazione.** Un bene dismesso, alienato
 *      o smarrito — e una SIM cessata — non possono restare in carico a nessuno.
 *   4. **Il centro di costo è obbligatorio, l'assegnatario no.** NAS, stampanti e
 *      fax non stanno in mano a nessuno, stanno in un servizio; ma
 *      un'assegnazione senza centro di costo non dice niente a nessuno.
 *   5. **Chi ce l'ha e su quale centro di costo pesa** vengono ricopiati
 *      sull'anagrafica dall'app, mai a mano.
 */

import { aggiornaBene, getBeneById } from '@/lib/inventario/data'
import { aggiornaSpecchioSim, getSimById, staccaSimDaBene } from '@/lib/it/sim'
import {
  aggiornaAssegnazione,
  creaAssegnazione,
  cosaE,
  getAssegnazioneById,
  getStorico,
} from '@/lib/it/assegnazioni'
import { STATI_BENE_CHIUSI } from '@/types/inventario'
import { STATI_SIM_CHIUSI } from '@/types/it'
import type {
  Assegnazione,
  GenereAssegnazione,
  ModificaAssegnazione,
  NuovaAssegnazione,
} from '@/types/it'

const oggi = () => new Date().toISOString().slice(0, 10)
const soloData = (v?: string | null) => String(v ?? '').slice(0, 10)
const dataBuona = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Errore che la route API può restituire all'utente così com'è. */
export class ErroreFlusso extends Error {}

// ------------------------------------------------------------
// L'oggetto assegnato, visto da qui
// ------------------------------------------------------------

interface Oggetto {
  id: number
  etichetta: string
  /** Perché non si può assegnare, se non si può. */
  bloccato?: string
}

async function leggiOggetto(g: GenereAssegnazione, oggettoId: number): Promise<Oggetto> {
  if (g === 'bene') {
    const b = await getBeneById(String(oggettoId))
    return {
      id: Number(b.spItemId),
      etichetta: b.numero || b.descrizione,
      bloccato: STATI_BENE_CHIUSI.includes(b.statoBene)
        ? `Il bene ${b.numero} è "${b.statoBene}": rimettilo in patrimonio prima di assegnarlo.`
        : undefined,
    }
  }
  const s = await getSimById(String(oggettoId))
  return {
    id: Number(s.spItemId),
    etichetta: s.numero || s.iccid,
    bloccato: STATI_SIM_CHIUSI.includes(s.stato)
      ? `La SIM ${s.numero} è ${s.stato.toLowerCase()}: non si può assegnare.`
      : undefined,
  }
}

/**
 * Riporta sull'anagrafica chi ha l'oggetto adesso e su quale centro di costo
 * pesa, e per i beni deriva lo stato.
 *
 * L'assegnazione attiva **si passa**, non si va a cercare: chi chiama l'ha appena
 * scritta e la ha in mano, mentre una query di lista subito dopo una POST può
 * ancora non vederla — e la conseguenza sarebbe l'anagrafica che dice "in
 * magazzino, di nessuno" mentre il bene è appena stato consegnato.
 *
 * Non lancia: lo specchio è una comodità di lettura, la verità sta nello storico.
 * Se SharePoint lo rifiuta, l'operazione dell'utente non deve fallire per questo.
 */
async function rispecchia(
  g: GenereAssegnazione,
  oggettoId: number,
  attiva: Assegnazione | null,
): Promise<void> {
  try {
    if (g === 'sim') {
      await aggiornaSpecchioSim(String(oggettoId), {
        assegnatarioMail: attiva?.assegnatarioMail,
        assegnatarioNome: attiva?.assegnatarioNome,
        centroDiCostoId: attiva?.centroDiCosto?.id ?? null,
      })
      return
    }

    const bene = await getBeneById(String(oggettoId))
    const campi: Record<string, unknown> = {
      AssegnatarioMail: attiva?.assegnatarioMail ?? '',
      AssegnatarioNome: attiva?.assegnatarioNome ?? '',
      CentroDiCostoLookupId: attiva?.centroDiCosto?.id ?? null,
    }

    // Stato derivato, ma solo fra i due che l'assegnazione conosce: "In
    // riparazione", "Dismesso" e compagnia restano dove li ha messi una persona.
    if (attiva && bene.statoBene === 'In magazzino') campi.StatoBene = 'In uso'
    if (!attiva && bene.statoBene === 'In uso') campi.StatoBene = 'In magazzino'

    await aggiornaBene(bene.spItemId, campi)
  } catch (err) {
    console.error('[it/flusso] specchio non aggiornato per', g, oggettoId, err)
  }
}

/** Le attive di un oggetto, escludendone eventualmente una. */
async function attiveDi(
  g: GenereAssegnazione,
  oggettoId: number,
  esclusa?: string,
): Promise<Assegnazione[]> {
  const storico = await getStorico(g, oggettoId)
  return storico.filter((a) => a.stato === 'Attiva' && a.spItemId !== esclusa)
}

// ------------------------------------------------------------
// Assegnare
// ------------------------------------------------------------

/**
 * Assegna un dispositivo o una SIM. Chiude da sé l'assegnazione precedente.
 *
 * `dati.assegnatarioMail` può mancare (bene condiviso), `dati.centroDiCostoId`
 * no. La data di assegnazione è obbligatoria: nell'app è precompilata a oggi,
 * così l'obbligo non pesa su nessuno.
 */
export async function assegna(
  g: GenereAssegnazione,
  dati: NuovaAssegnazione & { servizioLegacy?: string; idListaIT?: string },
): Promise<Assegnazione> {
  if (!dati.oggettoId) throw new ErroreFlusso(`Nessun ${cosaE(g)} indicato.`)
  if (!dati.centroDiCostoId) {
    throw new ErroreFlusso(
      'Il centro di costo è obbligatorio: è quello che rende l’assegnazione utile a qualcosa.',
    )
  }
  const data = soloData(dati.dataAssegnazione) || oggi()
  if (!dataBuona(data)) throw new ErroreFlusso('Data di assegnazione non valida.')

  const oggetto = await leggiOggetto(g, dati.oggettoId)
  if (oggetto.bloccato) throw new ErroreFlusso(oggetto.bloccato)

  // 1. chiudi le attive: normalmente una, ma se lo storico è sporco si chiudono
  //    tutte — l'invariante vale da adesso in avanti, non solo per i dati nuovi.
  for (const a of await attiveDi(g, dati.oggettoId)) {
    await aggiornaAssegnazione(g, a.spItemId, { stato: 'Chiusa', dataFine: a.dataFine ?? data })
  }

  // 2. apri la nuova
  const nuova = await creaAssegnazione(g, `${oggetto.etichetta} · ${data}`, {
    ...dati,
    dataAssegnazione: data,
  })

  // 3. rispecchia sull'anagrafica, con la riga che abbiamo appena scritto
  await rispecchia(g, dati.oggettoId, nuova)
  return nuova
}

// ------------------------------------------------------------
// Restituire
// ------------------------------------------------------------

/**
 * Chiude un'assegnazione. Se l'oggetto resta senza nessuno, l'anagrafica lo
 * segue: il bene torna in magazzino e i campi di comodo si svuotano.
 *
 * È ripetibile: su una riga già chiusa non lancia, riallinea l'anagrafica e
 * basta. Se lanciasse, una chiusura andata a metà — riga chiusa, specchio no —
 * non si potrebbe più sistemare da nessuna schermata.
 */
export async function restituisci(
  g: GenereAssegnazione,
  assegnazioneId: string,
  dataFine?: string,
): Promise<Assegnazione> {
  const a = await getAssegnazioneById(g, assegnazioneId)

  if (a.stato === 'Chiusa') {
    const restano = await attiveDi(g, a.oggettoId)
    await rispecchia(g, a.oggettoId, restano[0] ?? null)
    return a
  }

  const data = soloData(dataFine) || oggi()
  if (!dataBuona(data)) throw new ErroreFlusso('Data di fine non valida.')
  if (soloData(a.dataAssegnazione) && data < soloData(a.dataAssegnazione)) {
    throw new ErroreFlusso(
      `La data di fine non può precedere quella di assegnazione (${soloData(a.dataAssegnazione)}).`,
    )
  }

  // Chi resta attivo dopo questa chiusura: si guarda prima di scrivere, così non
  // si dipende dal fatto che SharePoint rilegga subito quello che ha appena scritto.
  const restano = await attiveDi(g, a.oggettoId, assegnazioneId)
  const chiusa = await aggiornaAssegnazione(g, assegnazioneId, { stato: 'Chiusa', dataFine: data })
  await rispecchia(g, a.oggettoId, restano[0] ?? null)
  return chiusa
}

/**
 * Un oggetto che esce di scena non può restare in carico a nessuno: chiude tutte
 * le sue assegnazioni attive e svuota lo specchio.
 *
 * La chiamano la dismissione di un bene (dalla pagina Inventario) e la cessazione
 * di una SIM. Senza questo, in un clic si ricreerebbe la contraddizione che
 * l'area esiste per togliere: dismesso e contemporaneamente in mano a qualcuno.
 *
 * Per un bene stacca anche le SIM che risultavano dentro. Non le cessa e non le
 * toglie a nessuno: **la scheda sopravvive all'apparecchio** e passa nel telefono
 * nuovo, quindi l'unica cosa da azzerare è dove sta infilata.
 */
export async function chiudiPerUscita(
  g: GenereAssegnazione,
  oggettoId: number,
  data?: string,
): Promise<{ assegnazioniChiuse: number; simStaccate: number }> {
  const quando = soloData(data) || oggi()
  const attive = await attiveDi(g, oggettoId)
  for (const a of attive) {
    const fine = soloData(a.dataAssegnazione) && quando < soloData(a.dataAssegnazione)
      ? soloData(a.dataAssegnazione)
      : quando
    await aggiornaAssegnazione(g, a.spItemId, { stato: 'Chiusa', dataFine: fine })
  }
  if (attive.length) await rispecchia(g, oggettoId, null)

  let simStaccate = 0
  if (g === 'bene') {
    try {
      simStaccate = await staccaSimDaBene(oggettoId)
    } catch (err) {
      // Come lo specchio: è un dato di comodo, non deve far fallire la dismissione.
      console.error('[it/flusso] SIM non staccate dal bene', oggettoId, err)
    }
  }
  return { assegnazioniChiuse: attive.length, simStaccate }
}

// ------------------------------------------------------------
// Correggere
// ------------------------------------------------------------

/**
 * Corregge un'assegnazione esistente: chi ce l'ha, il centro di costo, il nome
 * utenza, le note, la data di inizio.
 *
 * Non è la strada per chiudere o riaprire: per quello ci sono `restituisci` e
 * `assegna`, che sanno anche cosa fare all'anagrafica. Qui lo stato si rifiuta, e
 * una data di fine su una riga ancora attiva pure — altrimenti resterebbe una
 * riga "attiva dal X al Y", che è una contraddizione scritta a mano.
 */
export async function correggi(
  g: GenereAssegnazione,
  assegnazioneId: string,
  mod: ModificaAssegnazione,
): Promise<Assegnazione> {
  if (mod.stato !== undefined) {
    throw new ErroreFlusso(
      'Lo stato non si cambia a mano: usa "restituisci" per chiudere o "assegna" per riaprire.',
    )
  }
  if (mod.centroDiCostoId !== undefined && !mod.centroDiCostoId) {
    throw new ErroreFlusso('Il centro di costo non si può togliere.')
  }

  const a = await getAssegnazioneById(g, assegnazioneId)

  const inizio = mod.dataAssegnazione !== undefined ? soloData(mod.dataAssegnazione) : soloData(a.dataAssegnazione)
  if (mod.dataAssegnazione !== undefined && !dataBuona(inizio)) {
    throw new ErroreFlusso('Data di assegnazione non valida.')
  }
  if (mod.dataFine !== undefined && mod.dataFine !== null) {
    if (a.stato === 'Attiva') {
      throw new ErroreFlusso(
        'Questa assegnazione è ancora attiva: per chiuderla usa "Restituito", che aggiorna anche il bene.',
      )
    }
    const fine = soloData(mod.dataFine)
    if (!dataBuona(fine)) throw new ErroreFlusso('Data di fine non valida.')
    if (inizio && fine < inizio) {
      throw new ErroreFlusso(`La data di fine non può precedere quella di assegnazione (${inizio}).`)
    }
  }

  const aggiornata = await aggiornaAssegnazione(g, assegnazioneId, mod)
  const attiva =
    aggiornata.stato === 'Attiva'
      ? aggiornata
      : (await attiveDi(g, a.oggettoId, assegnazioneId))[0] ?? null
  await rispecchia(g, a.oggettoId, attiva)
  return aggiornata
}
