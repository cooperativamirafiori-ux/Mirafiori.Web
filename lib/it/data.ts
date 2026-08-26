/**
 * La porta dell'area IT: le letture che servono alle schermate, già composte.
 *
 * Le anagrafiche stanno altrove — i dispositivi nell'Inventario Beni, le SIM in
 * `sim.ts`, gli storici in `assegnazioni.ts`. Qui si mettono insieme, una volta,
 * invece di far fare a ogni pagina la stessa cucitura con una query per riga.
 *
 * Il discriminante dei dispositivi è `tipoIT` valorizzato. Quello che ha
 * `Categoria = Informatica` ma non `tipoIT` non è perduto: finisce nel secchio
 * "da classificare", perché un'anomalia che si vede si sistema, una nascosta no.
 */

import { getInventario, inventarioConfigurato } from '@/lib/inventario/data'
import { getCentriDiCosto } from '@/lib/centri-costo/data'
import {
  assegnazioniConfigurate,
  getAssegnazioni,
  getAssegnazioniPerPersona,
} from '@/lib/it/assegnazioni'
import { getSim, simConfigurate } from '@/lib/it/sim'
import { STATI_BENE_CHIUSI, eBeneIT, type BeneInventario } from '@/types/inventario'
import type { Assegnazione, CentroDiCostoVoce, Sim } from '@/types/it'

/** Un dispositivo con chi ce l'ha adesso. */
export interface RigaDispositivo {
  bene: BeneInventario
  attiva: Assegnazione | null
}

/** Una SIM con chi ce l'ha adesso. */
export interface RigaSim {
  sim: Sim
  attiva: Assegnazione | null
}

export interface AreaIT {
  /** Solo i dispositivi in patrimonio: i dismessi restano in Inventario. */
  dispositivi: RigaDispositivo[]
  /** Quanti dispositivi sono usciti dal patrimonio, per dire dove sono finiti. */
  dismessi: number
  sim: RigaSim[]
  /**
   * Tutte le assegnazioni, non solo le attive: gli storici si leggono in due
   * query e si raggruppano nella pagina, invece di farne una per riga aperta.
   */
  storici: { bene: Assegnazione[]; sim: Assegnazione[] }
  /** Beni di categoria Informatica a cui manca il tipo: da classificare. */
  daClassificare: BeneInventario[]
  centriDiCosto: CentroDiCostoVoce[]
  /** Cosa non è configurato, per dirlo invece di mostrare una pagina vuota. */
  mancanti: string[]
}

/** Categoria contabile dei beni informatici, come la scrive Acquisti. */
const CATEGORIA_INFORMATICA = 'Informatica'

function indicizzaAttive(assegnazioni: Assegnazione[]): Map<number, Assegnazione> {
  const m = new Map<number, Assegnazione>()
  for (const a of assegnazioni) {
    if (a.stato !== 'Attiva') continue
    // getAssegnazioni ordina le attive per data decrescente: la prima vince.
    if (!m.has(a.oggettoId)) m.set(a.oggettoId, a)
  }
  return m
}

/**
 * Tutto quello che serve alla pagina dell'area, in cinque letture invece di una
 * per riga.
 */
export async function getAreaIT(): Promise<AreaIT> {
  const mancanti: string[] = []
  if (!inventarioConfigurato()) mancanti.push('SP_LIST_INVENTARIO')
  if (!assegnazioniConfigurate('bene')) mancanti.push('SP_LIST_ASSEGNAZIONI')
  if (!simConfigurate()) mancanti.push('SP_LIST_SIM')
  if (!assegnazioniConfigurate('sim')) mancanti.push('SP_LIST_ASSEGNAZIONI_SIM')

  const [beni, asgBeni, sim, asgSim, centri] = await Promise.all([
    inventarioConfigurato() ? getInventario() : Promise.resolve<BeneInventario[]>([]),
    getAssegnazioni('bene'),
    getSim(),
    getAssegnazioni('sim'),
    getCentriDiCosto(),
  ])

  const attiveBeni = indicizzaAttive(asgBeni)
  const attiveSim = indicizzaAttive(asgSim)

  return {
    // Fuori i beni usciti dal patrimonio: l'area IT è l'elenco di quello che c'è,
    // e un dismesso in mezzo agli altri è rumore per sempre. La sua storia non si
    // perde — resta nella scheda del bene in Inventario, che è il registro.
    dispositivi: beni
      .filter((b) => eBeneIT(b) && !STATI_BENE_CHIUSI.includes(b.statoBene))
      .map((bene) => ({ bene, attiva: attiveBeni.get(Number(bene.spItemId)) ?? null }))
      .sort((a, b) => a.bene.numero.localeCompare(b.bene.numero, 'it')),
    dismessi: beni.filter((b) => eBeneIT(b) && STATI_BENE_CHIUSI.includes(b.statoBene)).length,
    sim: sim.map((s) => ({ sim: s, attiva: attiveSim.get(Number(s.spItemId)) ?? null })),
    storici: { bene: asgBeni, sim: asgSim },
    daClassificare: beni.filter((b) => !eBeneIT(b) && b.categoria === CATEGORIA_INFORMATICA),
    centriDiCosto: centri.map((c) => ({ id: c.id, nome: c.nome, area: c.area })),
    mancanti,
  }
}

/**
 * Cosa ha in carico una persona e cosa ha restituito.
 *
 * Alimenta due schermate diverse: "I miei strumenti", aperta a tutti sul
 * proprio, e la scheda della persona nell'area IT — che serve soprattutto
 * quando un dipendente cessa e bisogna sapere cosa deve riconsegnare.
 */
export async function getStrumentiPersona(
  mail: string,
): Promise<{ attivi: Assegnazione[]; passati: Assegnazione[] }> {
  const tutte = await getAssegnazioniPerPersona(mail)
  return {
    attivi: tutte.filter((a) => a.stato === 'Attiva'),
    passati: tutte.filter((a) => a.stato === 'Chiusa'),
  }
}

