/**
 * Cruscotto del controllo di gestione — le letture.
 *
 * Mette insieme le fonti che oggi hanno già un centro di costo e passa tutto a
 * `costruisciCruscotto`. Ogni fonte è letta per conto suo: se una non risponde
 * (SharePoint giù, Qonto senza chiave) il cruscotto si apre lo stesso e lo dice
 * in un avviso, invece di mostrare uno zero che sembra vero.
 *
 * Fatture: SOLO quelle arrivate come XML dallo SDI, all'imponibile (IVA
 * esclusa). Le vecchie entrate dall'Excel restano fuori per scelta (Dennis,
 * 05/10/2026): d'ora in avanti si lavora così.
 *
 * Quando il registro (`movimento`) sarà alimentato, la lettura delle fatture si
 * sostituisce con `totaliPerCentroDiCosto` e il resto del cruscotto non cambia.
 */

import { supabase } from '@/lib/core/supabase'
import { getCentriDiCostoRegistro } from '@/lib/gestione/registro'
import { fattureConfigurato, getRichiesteFattura } from '@/lib/fatture/data'
import { calcoloIva } from '@/types/fatture'
import { qontoConfigurato } from '@/lib/qonto/client'
import { getContiQonto } from '@/lib/qonto/data'
import { costruisciCruscotto, type InputCruscotto } from './cruscotto-calcoli'
import { inputEsempio } from './cruscotto-esempio'
import type { DatiCruscotto } from '@/types/cruscotto'

export interface AccessoCruscotto {
  tutti: boolean
  codici: string[]
}

const PAGINA = 1000

async function leggiFatture(anno: number): Promise<InputCruscotto['fatture']> {
  const out: InputCruscotto['fatture'] = []
  // PostgREST taglia a 1000 righe anche le funzioni: si legge a pagine.
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await supabase()
      .rpc('cdg_fatture_anno', { p_anno: anno })
      .range(da, da + PAGINA - 1)
    if (error) throw new Error(error.message)
    const righe = (data ?? []) as any[]
    for (const r of righe) {
      out.push({
        cc_codice: r.cc_codice ?? null,
        data: String(r.data ?? ''),
        mese: Number(r.mese ?? 0),
        fornitore: r.fornitore ?? null,
        numero: r.numero ?? null,
        importo: r.importo == null ? null : Number(r.importo),
      })
    }
    if (righe.length < PAGINA) break
  }
  return out
}

async function leggiOre(anno: number): Promise<InputCruscotto['ore']> {
  const { data, error } = await supabase().rpc('cdg_ore_anno', { p_anno: anno })
  if (error) throw new Error(error.message)
  return ((data ?? []) as any[]).map((r) => ({
    cc_codice: String(r.cc_codice),
    mese: Number(r.mese),
    ore: Number(r.ore ?? 0),
    persone: Number(r.persone ?? 0),
  }))
}

async function leggiRicavi(anno: number): Promise<InputCruscotto['ricavi']> {
  if (!fattureConfigurato()) return []
  const richieste = await getRichiesteFattura()
  const out: InputCruscotto['ricavi'] = []
  for (const r of richieste) {
    const data = (r.dataPrestazione || r.creato || '').slice(0, 10)
    if (!data.startsWith(String(anno))) continue
    // Stessa misura dei costi: l'imponibile, IVA esclusa. Senza scorporo
    // (fuori campo IVA) l'importo scritto è già senza IVA.
    const imponibile = calcoloIva(r).scorporo?.imponibile ?? r.importo
    if (!Number.isFinite(imponibile)) continue
    out.push({
      centroNome: r.centroCosto ?? '',
      data,
      chi: r.ragioneSociale || [r.cognome, r.nome].filter(Boolean).join(' ') || 'Cliente',
      numero: r.numero || undefined,
      importo: imponibile,
    })
  }
  return out
}

async function leggiQonto(): Promise<InputCruscotto['qonto']> {
  if (!qontoConfigurato()) return []
  const conti = await getContiQonto()
  return conti
    .filter((c) => c.ccCodice)
    .map((c) => ({ codice: c.ccCodice as string, saldo: c.saldo }))
}

/** Una fonte che fallisce diventa un avviso e un elenco vuoto, mai un'eccezione. */
async function prova<T>(nome: string, avvisi: string[], f: () => Promise<T>, vuoto: T): Promise<T> {
  try {
    return await f()
  } catch (e) {
    console.error(`[cruscotto] ${nome}:`, e)
    avvisi.push(nome)
    return vuoto
  }
}

export async function leggiCruscotto(
  anno: number,
  accesso: AccessoCruscotto,
  opzioni: { esempio?: boolean } = {},
): Promise<DatiCruscotto> {
  const oggi = new Date()
  const annoOggi = oggi.getFullYear()
  const anni = [annoOggi, annoOggi - 1, annoOggi - 2]
  const meseUltimo = anno < annoOggi ? 12 : oggi.getMonth() + 1

  const tuttiCentri = await getCentriDiCostoRegistro(true)
  const centri = accesso.tutti ? tuttiCentri : tuttiCentri.filter((c) => accesso.codici.includes(c.codice))
  const base = {
    anno,
    anni,
    meseUltimo,
    completo: accesso.tutti,
    centri: centri.map((c) => ({ codice: c.codice, nome: c.nome, area: c.area ?? null, ordine: c.ordine })),
  }

  if (opzioni.esempio) return costruisciCruscotto(inputEsempio(base))

  const avvisi: string[] = []
  const [fatture, ore, ricavi, qonto] = await Promise.all([
    prova('Fatture passive (Supabase)', avvisi, () => leggiFatture(anno), []),
    prova('Ore timbrate (Supabase)', avvisi, () => leggiOre(anno), []),
    prova('Ricavi da Richiesta fattura (SharePoint)', avvisi, () => leggiRicavi(anno), []),
    prova('Saldi Qonto', avvisi, () => leggiQonto(), []),
  ])

  // Il coordinatore vede i suoi centri e basta: le fatture degli altri non
  // arrivano nemmeno al calcolo, così non finiscono nella pagina.
  const visibili = accesso.tutti ? fatture : fatture.filter((f) => f.cc_codice && accesso.codici.includes(f.cc_codice))

  // I costi inseriti a mano (Costi Strutture) restano fuori: la fattura del
  // fornitore arriva comunque come XML, e contarli sarebbe un doppione.
  return costruisciCruscotto({ ...base, fatture: visibili, ore, diretti: [], ricavi, qonto, avvisi })
}
