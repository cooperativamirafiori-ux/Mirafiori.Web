/**
 * Operazioni CRUD sulle SharePoint Lists via Microsoft Graph API.
 * Tutti i GUIDs delle liste vengono dalle variabili d'ambiente.
 *
 * Nota sui campi SP:
 *   - Il campo "Title" in SP è il display name "ID Richiesta" per Richieste Manutenzione
 *   - Le colonne choice si scrivono come { Value: "..." } nelle SP Lists via Graph
 *   - Le colonne lookup si scrivono come NomeCampoId: <number>
 */

import { graphGet, graphPost, graphPatch, graphDelete } from '@/lib/graph'
import type {
  Struttura,
  Tecnico,
  RichiestaManutenzione,
  CostoStruttura,
  CostoRecord,
  ParametroConfigurazione,
} from '@/types/manutenzioni'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const LIST = (key: string) => {
  const map: Record<string, string> = {
    strutture:  process.env.SP_LIST_STRUTTURE!,
    tecnici:    process.env.SP_LIST_TECNICI!,
    richieste:  process.env.SP_LIST_RICHIESTE!,
    costi:      process.env.SP_LIST_COSTI!,
    parametri:  process.env.SP_LIST_PARAMETRI!,
    admin:      process.env.SP_LIST_ADMIN!,
    autorizzazioni: process.env.SP_LIST_AUTORIZZAZIONI!,
  }
  return map[key]
}

const listBase = (list: string) =>
  `/sites/${SITE()}/lists/${LIST(list)}/items`

// Header richiesto da Graph per filtrare/ordinare su colonne non indicizzate.
// Le liste permessi sono piccole, quindi l'avviso "MayFailRandomly" non è un problema.
const PREFER_NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

// ============================================================
// Anagrafica Strutture
// ============================================================

export async function getStrutture(): Promise<Struttura[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase('strutture')}?$select=id,fields&$expand=fields($select=Title,Codice,StrutturaLabel,Responsabile,ResponsabilePulizie)&$orderby=fields/Codice asc`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }
  )
  return res.value.map((item) => ({
    id: Number(item.id),  // item.id = Graph item ID = SP internal ID
    title: item.fields.Title,
    codice: item.fields.Codice,
    strutturaLabel: item.fields.StrutturaLabel,
    responsabileEmail: item.fields.Responsabile?.Email ?? '',
    responsabilePulizieEmail: item.fields.ResponsabilePulizie?.Email ?? '',
  }))
}

// ============================================================
// Anagrafica Tecnici
// ============================================================

export async function getTecnici(): Promise<Tecnico[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase('tecnici')}?$select=id,fields&$expand=fields($select=Title,Telefono,Specializzazione,Ditta,Email)&$orderby=fields/Title asc`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }
  )
  return res.value.map((item) => ({
    id: Number(item.id),  // item.id = Graph item ID = SP internal ID
    title: item.fields.Title,
    telefono: item.fields.Telefono ?? '',
    specializzazione: item.fields.Specializzazione ?? '',
    ditta: item.fields.Ditta ?? '',
    email: item.fields.Email ?? '',
  }))
}

// ============================================================
// Richieste Manutenzione
// ============================================================

// Campi da espandere — basati sulla struttura reale della lista SP
// Choice columns (Stato, TipoIntervento, Priorita) ritornano come stringhe semplici via Graph
// Person columns (Richiedente) ritornano come oggetto { DisplayName, Email, LookupId }
// Lookup columns (Struttura, Tecnico) ritornano come oggetto { Value, LookupId }
const RICHIESTA_FIELDS =
  'id,fields&$expand=fields($select=Title,Richiedente,RichiedenteLookupId,DataRichiesta,TipoIntervento,Priorita,Stato,Struttura,StrutturaLookupId,Descrizione,NoteDennis,DataIntervento,ImportoFattura,DataPagamento,Pagato,OrePulizia,Tecnico,TecnicoLookupId,NumeroFattura)'

// Lookup/Person column: via Graph fields-expansion può tornare come stringa semplice
// (display value) oppure come oggetto { Value/LookupValue/DisplayName }. Gestiamo entrambi.
function lookupValue(field: any): string {
  if (field == null) return ''
  if (typeof field === 'string') return field
  return field.Value ?? field.LookupValue ?? field.DisplayName ?? ''
}

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
// "Elenco informazioni utente" (User Information List) — GUID fisso del sito
const SP_USER_INFO_LIST = '3f6b4698-931e-4540-a681-d6a436b26bdb'

/** Recupera l'email SP da un lookup ID (inverso di getSPUserLookupId) */
export async function getSPUserEmailByLookupId(lookupId: number | string): Promise<string> {
  const id = Number(lookupId)
  if (!id) return ''
  const res = await graphGet<any>(
    `/sites/${SITE()}/lists/${SP_USER_INFO_LIST}/items/${id}?$expand=fields`
  )
  const email = res?.fields?.EMail ?? res?.fields?.UserName ?? ''
  if (!email) console.warn('[SP] getSPUserEmailByLookupId: nessuna email per lookupId', id, JSON.stringify(res?.fields))
  return email
}

export async function getSPUserLookupId(email: string): Promise<number> {
  const filter = encodeURIComponent(`fields/EMail eq '${email}'`)
  const res = await graphGet<{ value: any[] }>(
    `/sites/${SITE()}/lists/${SP_USER_INFO_LIST}/items?$select=id,fields&$expand=fields($select=id,EMail)&$filter=${filter}&$top=1`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }
  )
  if (!res.value.length) throw new Error(`Utente SP non trovato: ${email}`)
  return Number(res.value[0].fields.id)
}

/** Crea nuova richiesta — ritorna l'item appena creato */
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

export async function getParametro(chiave: string): Promise<number> {
  // Recupera tutti i parametri e filtra client-side (lista piccola, case-insensitive)
  const res = await graphGet<{ value: any[] }>(
    `${listBase('parametri')}?$select=id,fields&$expand=fields&$top=100`
  )
  const chiaveLower = chiave.toLowerCase()
  const item = res.value.find(
    (i) => (i.fields?.Title ?? '').toLowerCase() === chiaveLower
  )
  if (!item) throw new Error(`Parametro '${chiave}' non trovato nella lista`)
  const valore = item.fields?.Valore
  if (valore == null) throw new Error(`Parametro '${chiave}' trovato ma campo Valore nullo`)
  return Number(valore)
}

// ============================================================
// Costi Strutture
// ============================================================

export async function creaCosto(fields: {
  Title: string
  DataCosto: string
  Categoria: string           // Choice → stringa semplice
  Importo: number
  StrutturaLookupId: number   // Lookup → {Campo}LookupId
  Fornitore?: string
  Periodo?: string
  Fonte?: string              // Choice → stringa semplice
}): Promise<void> {
  await graphPost(`${listBase('costi')}`, { fields })
}

// Campi da leggere dalla lista Costi Strutture.
// Struttura è un lookup → { Value, LookupId } (oppure stringa semplice via fields-expansion)
const COSTO_FIELDS =
  'id,fields&$expand=fields($select=Title,DataCosto,Categoria,Importo,Struttura,StrutturaLookupId,Fornitore,Periodo,Fonte,Note)'

function mapCosto(item: any): CostoRecord {
  const f = item.fields
  return {
    id: Number(item.id),
    title: f.Title ?? '',
    dataCosto: f.DataCosto ?? '',
    categoria: lookupValue(f.Categoria) || 'Non categorizzato',
    importo: typeof f.Importo === 'number' ? f.Importo : Number(f.Importo ?? 0),
    struttura: {
      id: f.Struttura?.LookupId ?? f.StrutturaLookupId ?? 0,
      value: lookupValue(f.Struttura),
    },
    fornitore: f.Fornitore ?? undefined,
    periodo: f.Periodo ?? undefined,
    fonte: lookupValue(f.Fonte) || undefined,
    note: f.Note ?? undefined,
  }
}

/**
 * Legge i record della lista Costi Strutture.
 * Se `anno` è indicato, filtra client-side per anno di DataCosto.
 */
export async function getCosti(anno?: number): Promise<CostoRecord[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase('costi')}?$select=${COSTO_FIELDS}&$orderby=fields/DataCosto desc&$top=2000`,
    PREFER_NON_INDEXED
  )
  let costi = res.value.map(mapCosto)
  if (anno) {
    costi = costi.filter((c) => {
      const d = new Date(c.dataCosto)
      return !isNaN(d.getTime()) && d.getFullYear() === anno
    })
  }
  return costi
}

/**
 * Inserisce un costo direttamente su una struttura, senza passare da una
 * richiesta di manutenzione. Fonte = "Diretto".
 */
export async function creaCostoDiretto(fields: {
  StrutturaLookupId: number
  Categoria: string
  Importo: number
  DataCosto: string
  Fornitore?: string
  Causale?: string
}): Promise<void> {
  const dataObj = new Date(fields.DataCosto)
  const periodo = isNaN(dataObj.getTime())
    ? ''
    : dataObj.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  const title = fields.Causale?.trim() || `Costo diretto — ${fields.Categoria}`

  const base = {
    Title: title,
    DataCosto: dataObj.toISOString(),
    Categoria: fields.Categoria,
    Importo: fields.Importo,
    StrutturaLookupId: fields.StrutturaLookupId,
    Fornitore: fields.Fornitore?.trim() || undefined,
    Periodo: periodo,
  }

  // Fonte è una colonna Choice: "Diretto" potrebbe non essere tra i valori
  // ammessi (fill-in disabilitato). Provo con "Diretto", altrimenti ripiego
  // su "Manuale" (valore già usato dai flussi, quindi sicuramente valido).
  try {
    await creaCosto({ ...base, Fonte: 'Diretto' })
  } catch (err) {
    console.warn('[SP] creaCostoDiretto: Fonte="Diretto" rifiutata, ripiego su "Manuale"', err)
    await creaCosto({ ...base, Fonte: 'Manuale' })
  }
}

// ============================================================
// Admin check (lista Admin Manutenzioni)
// Lista SP con colonna "Utente" (Person) — ogni riga è un admin
// ============================================================

export async function isAdmin(email: string): Promise<boolean> {
  try {
    const filter = encodeURIComponent(`fields/Utente eq '${email}'`)
    const res = await graphGet<{ value: any[] }>(
      `${listBase('admin')}?$filter=${filter}&$top=1&$select=id`
    )
    return res.value.length > 0
  } catch {
    // Se la lista non esiste ancora o c'è errore, fallback su lista hardcoded
    const fallback = [
      'dennis.maseri@cooperativamirafiori.com',
      'stefano.martino@cooperativamirafiori.com',
      'gabriele.uscello@cooperativamirafiori.com',
    ]
    return fallback.includes(email.toLowerCase())
  }
}

// ============================================================
// Permessi per area — lista SP "Autorizzazioni"
// Ogni riga = un permesso concesso a un utente.
// Colonne: Utente (Person, salva l'email) + Area (Choice/Testo, es. "Amministrazione")
// Per dare accesso a un'area: aggiungi una riga (Utente + Area) nella lista SP.
// ============================================================

// Aree note dell'app. Aggiungi qui le nuove aree man mano che le crei.
export const AREE_PERMESSI = ['Amministrazione', 'Prestazioni Occasionali', 'Risorse Umane'] as const
export type AreaPermesso = (typeof AREE_PERMESSI)[number]

// Fallback usato se la lista SP non esiste ancora o Graph fallisce.
// Mappa email -> aree concesse.
const PERMESSI_FALLBACK: Record<string, string[]> = {
  'dennis.maseri@cooperativamirafiori.com': ['Amministrazione'],
}

/**
 * Ritorna l'elenco delle aree a cui l'utente ha accesso.
 * Legge la lista SP "Autorizzazioni"; in caso di errore usa il fallback.
 */
export async function getPermessi(email: string): Promise<string[]> {
  const e = email.toLowerCase()
  try {
    const filter = encodeURIComponent(`fields/Utente eq '${email}'`)
    const res = await graphGet<{ value: Array<{ fields?: { Area?: string } }> }>(
      `${listBase('autorizzazioni')}?$filter=${filter}&$select=id&$expand=fields($select=Area)&$top=200`,
      PREFER_NON_INDEXED
    )
    const aree = res.value
      .map((r) => r.fields?.Area)
      .filter((a): a is string => typeof a === 'string' && a.length > 0)
    // De-duplica preservando l'ordine
    return Array.from(new Set(aree))
  } catch {
    return PERMESSI_FALLBACK[e] ?? []
  }
}

export interface Autorizzazione {
  id: string
  utente: string
  area: string
}

/** Legge tutte le righe della lista Autorizzazioni (per il pannello di gestione). */
export async function getTutteAutorizzazioni(): Promise<Autorizzazione[]> {
  const res = await graphGet<{
    value: Array<{ id: string; fields?: { Utente?: string; Area?: string } }>
  }>(
    `${listBase('autorizzazioni')}?$select=id&$expand=fields($select=Utente,Area)&$top=500`
  )
  return res.value
    .filter((r) => r.fields?.Utente && r.fields?.Area)
    .map((r) => ({
      id: r.id,
      utente: (r.fields!.Utente as string).toLowerCase(),
      area: r.fields!.Area as string,
    }))
}

/** Concede un'area a un utente. Idempotente: non duplica se già presente. */
export async function aggiungiAutorizzazione(
  email: string,
  area: string
): Promise<Autorizzazione> {
  const e = email.toLowerCase().trim()
  const filter = encodeURIComponent(`fields/Utente eq '${e}' and fields/Area eq '${area}'`)
  const esistente = await graphGet<{ value: Array<{ id: string }> }>(
    `${listBase('autorizzazioni')}?$filter=${filter}&$select=id&$top=1`,
    PREFER_NON_INDEXED
  )
  if (esistente.value.length > 0) {
    return { id: esistente.value[0].id, utente: e, area }
  }
  const creato = await graphPost<{ id: string }>(listBase('autorizzazioni'), {
    fields: { Title: e, Utente: e, Area: area },
  })
  return { id: creato.id, utente: e, area }
}

/** Revoca un'autorizzazione dato l'ID della riga SP. */
export async function rimuoviAutorizzazione(itemId: string): Promise<void> {
  await graphDelete(`${listBase('autorizzazioni')}/${itemId}`)
}
