/**
 * Richieste di manutenzione: letture e scritture sulla lista SP.
 */

import { graphGet, graphPost, graphPatch } from '@/lib/core/graph'
import { listBase, lookupValue, SITE, LIST, SP_USER_INFO_LIST, getSPUserLookupId } from '@/lib/core/sp'
import type { Struttura, Tecnico, RichiestaManutenzione } from '@/types/manutenzioni'

// Campi da espandere — basati sulla struttura reale della lista SP
// Choice columns (Stato, TipoIntervento, Priorita) ritornano come stringhe semplici via Graph
// Person columns (Richiedente) ritornano come oggetto { DisplayName, Email, LookupId }
// Lookup columns (Struttura, Tecnico) ritornano come oggetto { Value, LookupId }
const RICHIESTA_FIELDS =
  'id,fields&$expand=fields($select=Title,Richiedente,RichiedenteLookupId,DataRichiesta,TipoIntervento,Priorita,Stato,Struttura,StrutturaLookupId,Descrizione,NoteDennis,DataIntervento,ImportoFattura,DataPagamento,Pagato,OrePulizia,Tecnico,TecnicoLookupId,NumeroFattura)'

function mapRichiesta(item: any): RichiestaManutenzione {
  const f = item.fields
  return {
    id: f.id,
    spItemId: item.id,  // string ID per Graph
    idRichiesta: f.Title ?? '',
    richiedente: {
      // Via Graph $expand=fields, Person column ritorna come stringa semplice (display name)
      // L'email NON è disponibile — per filtri usiamo RichiedenteLookupId
      displayName: typeof f.Richiedente === 'string'
        ? f.Richiedente
        : (f.Richiedente?.DisplayName ?? f.Richiedente?.LookupValue ?? ''),
      email: '', // non esposta da Graph fields expansion; recuperabile via SP_USER_INFO_LIST se necessario
      lookupId: f.RichiedenteLookupId ?? 0,
    },
    dataRichiesta: f.DataRichiesta ?? '',
    // Choice columns: Graph ritorna stringhe semplici (non { Value: "..." })
    tipoIntervento: f.TipoIntervento ?? '',
    priorita: f.Priorita ?? '',
    stato: (f.Stato ?? 'Aperta') as RichiestaManutenzione['stato'],
    struttura: {
      // Lookup column: Graph fields-expansion ritorna il valore come stringa semplice
      id: f.Struttura?.LookupId ?? f.StrutturaLookupId ?? 0,
      value: lookupValue(f.Struttura),
    },
    descrizione: f.Descrizione ?? '',
    tecnico: f.TecnicoLookupId
      ? { id: f.TecnicoLookupId, value: lookupValue(f.Tecnico) }
      : undefined,
    tecnicoTelefono: undefined, // campo calcolato dalla lista Tecnici
    importoFattura: f.ImportoFattura ?? undefined,
    oreLavoro: f.OrePulizia ?? undefined,   // SP internal name = OrePulizia (display: "Ore Lavoro Interno")
    dataIntervento: f.DataIntervento ?? undefined,
    dataPagamento: f.DataPagamento ?? undefined,
    pagato: f.Pagato ?? false,
    noteResponsabile: f.NoteDennis ?? undefined,
  }
}

/** Tutte le richieste non completate (per dashboard admin) */

export async function getRichiesteAperte(): Promise<RichiestaManutenzione[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase('richieste')}?$select=${RICHIESTA_FIELDS}&$filter=fields/Stato ne 'Completata'&$orderby=fields/DataRichiesta desc`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }
  )
  return res.value.map(mapRichiesta)
}

/** Richieste del richiedente corrente — filtra per RichiedenteLookupId (Person column email non disponibile via Graph) */

export async function getRichiesteByEmail(email: string): Promise<RichiestaManutenzione[]> {
  // 1. Recupera il lookup ID SP dell'utente
  const lookupId = await getSPUserLookupId(email)

  // 2. Recupera tutte le richieste e filtra per LookupId
  const res = await graphGet<{ value: any[] }>(
    `${listBase('richieste')}?$select=${RICHIESTA_FIELDS}&$orderby=fields/DataRichiesta desc&$top=500`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }
  )
  return res.value
    .filter((item) => Number(item.fields?.RichiedenteLookupId) === lookupId)
    .map(mapRichiesta)
}

/** Singola richiesta per ID SharePoint item */

export async function getRichiestaById(spItemId: string): Promise<RichiestaManutenzione> {
  const item = await graphGet<any>(
    `/sites/${SITE()}/lists/${LIST('richieste')}/items/${spItemId}?$select=${RICHIESTA_FIELDS}`
  )
  return mapRichiesta(item)
}

/**
 * Restituisce il lookup ID (intero) dell'utente nella User Information List di SP.
 * Necessario per impostare campi Person via Graph API.
 */

export async function creaRichiesta(fields: {
  StrutturaId: number
  RichiedenteLookupId: number
  TipoIntervento: string
  Priorita: string
  Descrizione: string
  Stato: string
}): Promise<{ id: string; numericId: number }> {
  // Lookup columns si scrivono come {CampoName}LookupId: <number>
  // Choice columns si scrivono come stringhe semplici (Graph li accetta senza { Value: "..." })
  const spFields = {
    StrutturaLookupId: fields.StrutturaId,
    RichiedenteLookupId: fields.RichiedenteLookupId,
    TipoIntervento: fields.TipoIntervento,
    Priorita: fields.Priorita,
    Descrizione: fields.Descrizione,
    Stato: fields.Stato,
  }
  const res = await graphPost<any>(
    `${listBase('richieste')}`,
    { fields: spFields }
  )
  return { id: res.id, numericId: res.fields?.id ?? 0 }
}

/** Aggiorna campi arbitrari di una richiesta */

export async function aggiornaRichiesta(
  spItemId: string,
  fields: Record<string, unknown>
): Promise<void> {
  await graphPatch(
    `/sites/${SITE()}/lists/${LIST('richieste')}/items/${spItemId}/fields`,
    fields
  )
}

// ============================================================
// Parametri Configurazione
// ============================================================
