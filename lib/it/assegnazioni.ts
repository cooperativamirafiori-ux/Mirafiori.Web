/**
 * Assegnazioni: chi ha in carico un dispositivo o una SIM, e da quando.
 *
 * Una riga per ogni periodo di assegnazione — è così che si tiene uno storico.
 * Le due liste ("Assegnazioni Beni" e "Assegnazioni SIM") hanno la stessa forma,
 * quindi la lettura e la scrittura sono scritte una volta e parametrizzate sul
 * `genere`: cambia solo il nome della colonna di lookup.
 *
 * Qui c'è l'accesso ai dati e niente più. Le regole — una sola assegnazione
 * attiva per oggetto, lo stato del bene derivato, il centro di costo copiato
 * sull'anagrafica — stanno in `flusso.ts`, che è l'unica porta per assegnare e
 * restituire.
 *
 * Variabili d'ambiente:
 *   SP_LIST_ASSEGNAZIONI      "Assegnazioni Beni"
 *   SP_LIST_ASSEGNAZIONI_SIM  "Assegnazioni SIM"
 */

import { graphGet, graphGetAll, graphPatch, graphPost } from '@/lib/core/graph'
import { PREFER_NON_INDEXED, lookupValue } from '@/lib/core/sp'
import { dataSoloGiorno } from '@/lib/inventario/data'
import type {
  Assegnazione,
  GenereAssegnazione,
  ModificaAssegnazione,
  NuovaAssegnazione,
  StatoAssegnazione,
} from '@/types/it'

const SITE = () => process.env.SHAREPOINT_SITE_ID!

/** Le due liste differiscono solo per il nome della colonna di lookup. */
const CONF: Record<GenereAssegnazione, { lista: () => string | undefined; lookup: string; cosa: string }> = {
  bene: { lista: () => process.env.SP_LIST_ASSEGNAZIONI, lookup: 'Bene', cosa: 'dispositivo' },
  sim: { lista: () => process.env.SP_LIST_ASSEGNAZIONI_SIM, lookup: 'Sim', cosa: 'SIM' },
}

const base = (g: GenereAssegnazione) => `/sites/${SITE()}/lists/${CONF[g].lista()}/items`

export function assegnazioniConfigurate(g: GenereAssegnazione): boolean {
  return Boolean(process.env.SHAREPOINT_SITE_ID && CONF[g].lista())
}

const campi = (g: GenereAssegnazione) => {
  const l = CONF[g].lookup
  return (
    `id,fields&$expand=fields($select=Title,${l},${l}LookupId,AssegnatarioMail,AssegnatarioNome,` +
    'CentroDiCosto,CentroDiCostoLookupId,ServizioLegacy,NomeUtenza,DataAssegnazione,DataFine,' +
    'Stato,Note,VerbaleConsegnaUrl,VerbaleConsegnaNome,VerbaleRestituzioneUrl,' +
    'VerbaleRestituzioneNome,IdListaIT)'
  )
}

function num(v: any): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

function mapAssegnazione(g: GenereAssegnazione, item: any): Assegnazione {
  const f = item.fields ?? {}
  const l = CONF[g].lookup
  return {
    spItemId: String(item.id),
    titolo: f.Title ?? '',
    genere: g,
    oggettoId: num(f[`${l}LookupId`]) ?? 0,
    oggettoEtichetta: lookupValue(f[l]),

    assegnatarioMail: f.AssegnatarioMail || undefined,
    assegnatarioNome: f.AssegnatarioNome || undefined,

    centroDiCosto: f.CentroDiCostoLookupId
      ? { id: Number(f.CentroDiCostoLookupId), value: lookupValue(f.CentroDiCosto) }
      : undefined,
    servizioLegacy: f.ServizioLegacy || undefined,
    nomeUtenza: f.NomeUtenza || undefined,

    dataAssegnazione: f.DataAssegnazione ?? '',
    dataFine: f.DataFine || undefined,
    stato: (f.Stato ?? 'Attiva') as StatoAssegnazione,
    note: f.Note || undefined,

    verbaleConsegnaUrl: f.VerbaleConsegnaUrl || undefined,
    verbaleConsegnaNome: f.VerbaleConsegnaNome || undefined,
    verbaleRestituzioneUrl: f.VerbaleRestituzioneUrl || undefined,
    verbaleRestituzioneNome: f.VerbaleRestituzioneNome || undefined,

    idListaIT: f.IdListaIT || undefined,
  }
}

/** Dalla più recente alla più vecchia: in cima c'è chi ce l'ha adesso. */
function perDataDecrescente(a: Assegnazione, b: Assegnazione): number {
  if (a.stato !== b.stato) return a.stato === 'Attiva' ? -1 : 1
  return (b.dataAssegnazione ?? '').localeCompare(a.dataAssegnazione ?? '')
}

// ============================================================
// Letture
// ============================================================

/**
 * Tutte le assegnazioni di un genere.
 *
 * Si legge la lista intera e si filtra in memoria: sono qualche centinaio di
 * righe e le colonne non sono indicizzate, quindi un `$filter` su SharePoint
 * costerebbe più di quanto risparmia — e fallirebbe a caso (vedi
 * `PREFER_NON_INDEXED`).
 */
export async function getAssegnazioni(g: GenereAssegnazione): Promise<Assegnazione[]> {
  if (!assegnazioniConfigurate(g)) return []
  // graphGetAll e non graphGet: queste liste crescono di una riga a ogni
  // movimento, e Graph pagina a 200 comunque. Senza paginazione, superate le 200
  // righe l'assegnazione attiva di un bene può restare fuori dall'elenco — e
  // allora il flusso ne aprirebbe una seconda credendo che non ce ne sia nessuna.
  const righe = await graphGetAll<any>(
    `${base(g)}?$select=${campi(g)}&$top=200`,
    PREFER_NON_INDEXED,
  )
  return righe.map((i) => mapAssegnazione(g, i)).sort(perDataDecrescente)
}

export async function getAssegnazioneById(
  g: GenereAssegnazione,
  spItemId: string,
): Promise<Assegnazione> {
  const item = await graphGet<any>(`${base(g)}/${spItemId}?$select=${campi(g)}`)
  return mapAssegnazione(g, item)
}

/** Storico di un singolo oggetto, dalla più recente. */
export async function getStorico(
  g: GenereAssegnazione,
  oggettoId: number,
): Promise<Assegnazione[]> {
  const tutte = await getAssegnazioni(g)
  return tutte.filter((a) => a.oggettoId === oggettoId)
}

/** Cosa ha in carico una persona, e cosa ha restituito. */
export async function getAssegnazioniPerPersona(mail: string): Promise<Assegnazione[]> {
  const e = mail.trim().toLowerCase()
  if (!e) return []
  const [beni, sim] = await Promise.all([getAssegnazioni('bene'), getAssegnazioni('sim')])
  return [...beni, ...sim]
    .filter((a) => (a.assegnatarioMail ?? '').toLowerCase() === e)
    .sort(perDataDecrescente)
}

// ============================================================
// Scritture — passare da flusso.ts, non da qui
// ============================================================

/**
 * Scrive una riga di assegnazione. `titolo` è solo per leggibilità dentro
 * SharePoint: l'app non ci fa affidamento.
 */
export async function creaAssegnazione(
  g: GenereAssegnazione,
  titolo: string,
  dati: NuovaAssegnazione & { servizioLegacy?: string; idListaIT?: string },
): Promise<Assegnazione> {
  const l = CONF[g].lookup
  const creato = await graphPost<any>(base(g), {
    fields: {
      Title: titolo,
      [`${l}LookupId`]: dati.oggettoId,
      AssegnatarioMail: dati.assegnatarioMail?.trim().toLowerCase() || '',
      AssegnatarioNome: dati.assegnatarioNome?.trim() || '',
      CentroDiCostoLookupId: dati.centroDiCostoId,
      ServizioLegacy: dati.servizioLegacy ?? '',
      NomeUtenza: dati.nomeUtenza?.trim() ?? '',
      DataAssegnazione: dataSoloGiorno(dati.dataAssegnazione),
      Stato: 'Attiva',
      Note: dati.note?.trim() ?? '',
      IdListaIT: dati.idListaIT ?? '',
    },
  })
  return getAssegnazioneById(g, String(creato.id))
}

/** Aggiorna i campi indicati. `undefined` = non toccare, `null` = svuotare. */
export async function aggiornaAssegnazione(
  g: GenereAssegnazione,
  spItemId: string,
  mod: ModificaAssegnazione,
): Promise<Assegnazione> {
  const fields: Record<string, unknown> = {}
  if (mod.assegnatarioMail !== undefined) {
    fields.AssegnatarioMail = mod.assegnatarioMail?.trim().toLowerCase() ?? ''
  }
  if (mod.assegnatarioNome !== undefined) fields.AssegnatarioNome = mod.assegnatarioNome?.trim() ?? ''
  if (mod.centroDiCostoId !== undefined) fields.CentroDiCostoLookupId = mod.centroDiCostoId
  if (mod.nomeUtenza !== undefined) fields.NomeUtenza = String(mod.nomeUtenza ?? '').trim()
  if (mod.note !== undefined) fields.Note = String(mod.note ?? '').trim()
  if (mod.stato !== undefined) fields.Stato = mod.stato
  if (mod.dataAssegnazione !== undefined) {
    fields.DataAssegnazione = dataSoloGiorno(mod.dataAssegnazione)
  }
  if (mod.dataFine !== undefined) {
    fields.DataFine = mod.dataFine ? dataSoloGiorno(mod.dataFine) ?? null : null
  }

  if (Object.keys(fields).length) {
    await graphPatch(`${base(g)}/${spItemId}/fields`, fields)
  }
  return getAssegnazioneById(g, spItemId)
}

/** Registra sulla riga il verbale firmato che il browser ha caricato. */
export async function registraVerbale(
  g: GenereAssegnazione,
  spItemId: string,
  tipo: 'consegna' | 'restituzione',
  file: { url: string; nome: string },
): Promise<Assegnazione> {
  await graphPatch(
    `${base(g)}/${spItemId}/fields`,
    tipo === 'consegna'
      ? { VerbaleConsegnaUrl: file.url, VerbaleConsegnaNome: file.nome }
      : { VerbaleRestituzioneUrl: file.url, VerbaleRestituzioneNome: file.nome },
  )
  return getAssegnazioneById(g, spItemId)
}

/** Come si chiama l'oggetto di questo genere, per i messaggi d'errore. */
export function cosaE(g: GenereAssegnazione): string {
  return CONF[g].cosa
}
