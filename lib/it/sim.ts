/**
 * Anagrafica delle SIM (lista SharePoint "SIM e Utenze", `SP_LIST_SIM`).
 *
 * Perché non stanno nell'Inventario: una SIM non è un bene, è un contratto
 * ricorrente con un costo mensile — più vicina a un abbonamento che a un
 * portatile. Metà delle colonne dei beni (valore, garanzia, fattura) non la
 * riguardano, e metà delle sue (ICCID, piano, operatore) non riguardano i beni.
 *
 * Il dispositivo e la SIM si incontrano nell'assegnazione, non nell'anagrafica:
 * `beneAssociato` dice solo in che smartphone sta infilata la scheda.
 *
 * Chi ce l'ha e su quale centro di costo pesa sono copie dell'assegnazione
 * attiva, riscritte dall'app: si leggono qui per non fare una seconda query per
 * ogni riga dell'elenco, ma la verità sta in "Assegnazioni SIM".
 */

import { graphGet, graphGetAll, graphPatch, graphPost } from '@/lib/core/graph'
import { PREFER_NON_INDEXED, lookupValue } from '@/lib/core/sp'
import { dataSoloGiorno } from '@/lib/inventario/data'
import type { ModificaSim, NuovaSim, Sim, StatoSim, TipoPiano } from '@/types/it'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const LIST = () => process.env.SP_LIST_SIM!
const base = () => `/sites/${SITE()}/lists/${LIST()}/items`

export function simConfigurate(): boolean {
  return Boolean(process.env.SHAREPOINT_SITE_ID && process.env.SP_LIST_SIM)
}

const CAMPI =
  'id,fields&$expand=fields($select=Title,Numero,Operatore,TipoPiano,NomePiano,' +
  'FornitoreIntermediario,DataAttivazione,DataCessazione,RiferimentoContratto,StatoSim,' +
  'CostoMensile,Note,CentroDiCosto,CentroDiCostoLookupId,AssegnatarioMail,AssegnatarioNome,' +
  'BeneAssociato,BeneAssociatoLookupId,IdListaIT)'

function num(v: any): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

function mapSim(item: any): Sim {
  const f = item.fields ?? {}
  return {
    spItemId: String(item.id),
    iccid: f.Title ?? '',
    numero: f.Numero ?? '',

    operatore: f.Operatore || undefined,
    tipoPiano: (f.TipoPiano || undefined) as TipoPiano | undefined,
    nomePiano: f.NomePiano || undefined,
    fornitore: f.FornitoreIntermediario || undefined,

    dataAttivazione: f.DataAttivazione || undefined,
    dataCessazione: f.DataCessazione || undefined,
    riferimentoContratto: f.RiferimentoContratto || undefined,
    stato: (f.StatoSim ?? 'Attiva') as StatoSim,
    costoMensile: num(f.CostoMensile),
    note: f.Note || undefined,

    centroDiCosto: f.CentroDiCostoLookupId
      ? { id: Number(f.CentroDiCostoLookupId), value: lookupValue(f.CentroDiCosto) }
      : undefined,
    assegnatarioMail: f.AssegnatarioMail || undefined,
    assegnatarioNome: f.AssegnatarioNome || undefined,
    beneAssociato: f.BeneAssociatoLookupId
      ? { id: Number(f.BeneAssociatoLookupId), value: lookupValue(f.BeneAssociato) }
      : undefined,

    idListaIT: f.IdListaIT || undefined,
  }
}

// ============================================================
// Letture
// ============================================================

export async function getSim(): Promise<Sim[]> {
  if (!simConfigurate()) return []
  // graphGetAll: Graph pagina a 200 anche con $top più alto.
  const righe = await graphGetAll<any>(`${base()}?$select=${CAMPI}&$top=200`, PREFER_NON_INDEXED)
  return righe.map(mapSim).sort((a, b) => a.numero.localeCompare(b.numero, 'it'))
}

export async function getSimById(spItemId: string): Promise<Sim> {
  return mapSim(await graphGet<any>(`${base()}/${spItemId}?$select=${CAMPI}`))
}

// ============================================================
// Scritture
// ============================================================

export async function creaSim(dati: NuovaSim): Promise<Sim> {
  const creato = await graphPost<any>(base(), {
    fields: {
      Title: dati.iccid.trim(),
      Numero: dati.numero.trim(),
      Operatore: dati.operatore?.trim() ?? '',
      TipoPiano: dati.tipoPiano,
      NomePiano: dati.nomePiano?.trim() ?? '',
      FornitoreIntermediario: dati.fornitore?.trim() ?? '',
      DataAttivazione: dataSoloGiorno(dati.dataAttivazione),
      RiferimentoContratto: dati.riferimentoContratto?.trim() ?? '',
      StatoSim: 'Attiva',
      CostoMensile: dati.costoMensile ?? undefined,
      Note: dati.note?.trim() ?? '',
    },
  })
  return getSimById(String(creato.id))
}

/**
 * Aggiorna l'anagrafica. `undefined` = non toccare, `null` = svuotare.
 *
 * La data di cessazione si comporta come la dismissione di un bene: passando a
 * "Cessata" senza indicarla prende oggi, tornando attiva viene azzerata — chi
 * compila non deve ricordarsi due campi al posto di uno.
 */
export async function aggiornaSim(sim: Sim, mod: ModificaSim): Promise<Sim> {
  const fields: Record<string, unknown> = {}
  const testo = (k: string, v?: string) => { if (v !== undefined) fields[k] = v.trim() }

  testo('Numero', mod.numero)
  testo('Operatore', mod.operatore)
  testo('NomePiano', mod.nomePiano)
  testo('FornitoreIntermediario', mod.fornitore)
  testo('RiferimentoContratto', mod.riferimentoContratto)
  testo('Note', mod.note)
  if (mod.tipoPiano !== undefined) fields.TipoPiano = mod.tipoPiano
  if (mod.stato !== undefined) fields.StatoSim = mod.stato
  if (mod.costoMensile !== undefined) fields.CostoMensile = mod.costoMensile
  if (mod.dataAttivazione !== undefined) {
    fields.DataAttivazione = mod.dataAttivazione ? dataSoloGiorno(mod.dataAttivazione) ?? null : null
  }
  if (mod.beneAssociatoId !== undefined) {
    fields.BeneAssociatoLookupId = mod.beneAssociatoId ?? null
  }

  const nuovoStato = mod.stato ?? sim.stato
  if (mod.dataCessazione !== undefined) {
    fields.DataCessazione = mod.dataCessazione ? dataSoloGiorno(mod.dataCessazione) ?? null : null
  } else if (nuovoStato === 'Cessata' && !sim.dataCessazione) {
    fields.DataCessazione = dataSoloGiorno(new Date().toISOString().slice(0, 10))
  } else if (nuovoStato !== 'Cessata' && sim.dataCessazione) {
    fields.DataCessazione = null
  }

  if (Object.keys(fields).length) await graphPatch(`${base()}/${sim.spItemId}/fields`, fields)
  return getSimById(sim.spItemId)
}

/**
 * Riscrive sulla SIM chi ce l'ha e su quale centro di costo pesa.
 *
 * La chiama solo `flusso.ts` dopo aver toccato le assegnazioni: sono campi di
 * comodo, e se qualcuno li compilasse a mano divergerebbero dallo storico.
 */
export async function aggiornaSpecchioSim(
  spItemId: string,
  specchio: { assegnatarioMail?: string; assegnatarioNome?: string; centroDiCostoId?: number | null },
): Promise<void> {
  await graphPatch(`${base()}/${spItemId}/fields`, {
    AssegnatarioMail: specchio.assegnatarioMail ?? '',
    AssegnatarioNome: specchio.assegnatarioNome ?? '',
    CentroDiCostoLookupId: specchio.centroDiCostoId ?? null,
  })
}
