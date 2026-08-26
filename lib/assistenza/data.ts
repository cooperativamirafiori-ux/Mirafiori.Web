/**
 * Accesso alla lista SharePoint "Assistenza IT" (SP_LIST_ASSISTENZA).
 *
 * Convenzioni SP via Graph (le stesse del resto dell'app):
 *   - Choice  → stringa semplice
 *   - Lookup  → {Campo}LookupId: number
 *   - Person  → {Campo}LookupId: number  (id nella User Information List)
 *   - Date "solo giorno" → 'YYYY-MM-DDT12:00:00Z' per evitare slittamenti di fuso
 *
 * La lista la crea `scripts/provision-assistenza.mjs`.
 */

import { graphGet, graphPatch, graphPost } from '@/lib/core/graph'
import { getSPUserLookupId } from '@/lib/core/sp'
import { getStrumentiPersona } from '@/lib/it/data'
import {
  prioritaProposta,
  type Impatto,
  type Priorita,
  type RichiestaAssistenza,
  type StatoAssistenza,
} from '@/types/assistenza'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const LIST = () => process.env.SP_LIST_ASSISTENZA!
const listBase = () => `/sites/${SITE()}/lists/${LIST()}/items`

const PREFER_NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

/** true se la lista è configurata: le pagine mostrano un avviso invece di un 500. */
export function assistenzaConfigurata(): boolean {
  return Boolean(process.env.SHAREPOINT_SITE_ID && process.env.SP_LIST_ASSISTENZA)
}

const CAMPI =
  'id,fields&$expand=fields($select=Title,Richiedente,RichiedenteLookupId,DataApertura,' +
  'Tipologia,Categoria,Bene,BeneLookupId,DispositivoAltro,Problema,DaQuando,Bloccante,Impatto,' +
  'Struttura,StrutturaLookupId,Recapito,Disponibilita,AllegatoUrl,AllegatoNome,' +
  'Stato,Priorita,Assegnato,AssegnatoLookupId,Analisi,Interventi,' +
  'AssistenzaEsterna,FornitoreEsterno,OreLavoro,NoteInterne,MotivoAnnullamento,' +
  'DataChiusura,Riaperture,CentroCosto,CentroCostoLookupId,DigestInviato)'

/** Person/Lookup via fields-expansion: a volte stringa, a volte oggetto. */
function testoLookup(campo: any): string {
  if (campo == null) return ''
  if (typeof campo === 'string') return campo
  return campo.Value ?? campo.LookupValue ?? campo.DisplayName ?? ''
}

function num(v: any): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

/** Coppia lookup {id, value}, o undefined se non valorizzata. */
function coppia(campo: any, lookupId: any): { id: number; value: string } | undefined {
  const id = Number(campo?.LookupId ?? lookupId ?? 0)
  if (!id) return undefined
  return { id, value: testoLookup(campo) }
}

function mapTicket(item: any): RichiestaAssistenza {
  const f = item.fields ?? {}
  return {
    spItemId: String(item.id),
    codice: f.Title ?? '',

    richiedenteNome: testoLookup(f.Richiedente),
    richiedenteLookupId: Number(f.RichiedenteLookupId ?? 0),
    dataApertura: f.DataApertura ?? '',
    tipologia: f.Tipologia ?? '',
    categoria: f.Categoria ?? '',
    bene: coppia(f.Bene, f.BeneLookupId),
    dispositivoAltro: f.DispositivoAltro || undefined,
    problema: f.Problema ?? '',
    daQuando: f.DaQuando || undefined,
    bloccante: Boolean(f.Bloccante),
    impatto: f.Impatto ?? '',
    struttura: coppia(f.Struttura, f.StrutturaLookupId),
    recapito: f.Recapito || undefined,
    disponibilita: f.Disponibilita || undefined,
    allegatoUrl: f.AllegatoUrl || undefined,
    allegatoNome: f.AllegatoNome || undefined,

    stato: (f.Stato ?? 'Inviata') as StatoAssistenza,
    priorita: f.Priorita ?? 'Media',
    assegnatoNome: testoLookup(f.Assegnato) || undefined,
    assegnatoLookupId: num(f.AssegnatoLookupId),
    analisi: f.Analisi || undefined,
    interventi: f.Interventi || undefined,
    assistenzaEsterna: Boolean(f.AssistenzaEsterna),
    fornitoreEsterno: f.FornitoreEsterno || undefined,
    oreLavoro: num(f.OreLavoro),
    noteInterne: f.NoteInterne || undefined,
    motivoAnnullamento: f.MotivoAnnullamento || undefined,
    dataChiusura: f.DataChiusura || undefined,
    riaperture: num(f.Riaperture) ?? 0,

    centroCosto: coppia(f.CentroCosto, f.CentroCostoLookupId),
    digestInviato: Boolean(f.DigestInviato),
  }
}

/** Data "solo giorno" a mezzogiorno UTC: evita che il 3 diventi il 2. */
export function dataSoloGiorno(ymd?: string | null): string | undefined {
  const solo = String(ymd ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(solo)) return undefined
  return `${solo}T12:00:00Z`
}

// ============================================================
// Letture
// ============================================================

/** Tutti i ticket, dal più recente. */
export async function getTicket(): Promise<RichiestaAssistenza[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase()}?$select=${CAMPI}&$top=999&$orderby=fields/Created desc`,
    PREFER_NON_INDEXED,
  )
  return (res.value ?? []).map(mapTicket)
}

export async function getTicketById(spItemId: string): Promise<RichiestaAssistenza> {
  const item = await graphGet<any>(`${listBase()}/${spItemId}?$select=${CAMPI}`)
  return mapTicket(item)
}

/**
 * I ticket di una persona.
 *
 * Il filtro è in memoria e non in `$filter`: la colonna Person non è indicizzata
 * e SharePoint rifiuta il filtro appena la lista cresce. Sono poche centinaia
 * di righe l'anno, la lettura completa costa meno di una vista indicizzata da
 * mantenere a mano.
 */
export async function getTicketPerRichiedente(
  lookupId: number,
): Promise<RichiestaAssistenza[]> {
  if (!lookupId) return []
  const tutti = await getTicket()
  return tutti.filter((t) => t.richiedenteLookupId === lookupId)
}

/** I ticket di chi è loggato, dal più recente. */
export async function getTicketByEmail(email: string): Promise<RichiestaAssistenza[]> {
  if (!email) return []
  const lookupId = await getSPUserLookupId(email).catch(() => 0)
  return getTicketPerRichiedente(lookupId)
}

/**
 * I dispositivi che risultano in carico a una persona, per la tendina del form.
 *
 * Chi apre il ticket non deve ricordarsi il numero di inventario del proprio
 * portatile: sceglie da un elenco corto e giusto. Se l'area IT non è ancora
 * configurata l'elenco è vuoto e resta il campo a testo libero — la richiesta
 * di assistenza non può dipendere dallo stato di un'altra sezione.
 */
export async function mieiDispositivi(mail: string): Promise<
  { id: number; etichetta: string; centroCostoId?: number }[]
> {
  try {
    const { attivi } = await getStrumentiPersona(mail)
    return attivi
      .filter((a) => a.genere === 'bene' && a.oggettoId)
      .map((a) => ({
        id: a.oggettoId,
        etichetta: a.oggettoEtichetta || `Bene ${a.oggettoId}`,
        centroCostoId: a.centroDiCosto?.id,
      }))
  } catch (err) {
    console.warn('[assistenza] elenco dispositivi non disponibile', err)
    return []
  }
}

// ============================================================
// Scritture
// ============================================================

export async function aggiornaTicket(
  spItemId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  // Graph rifiuta le proprietà undefined: le rimuovo.
  const puliti = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  )
  if (!Object.keys(puliti).length) return
  await graphPatch(`${listBase()}/${spItemId}/fields`, puliti)
}

/**
 * Crea il ticket e gli assegna il codice progressivo ASS-{anno}-{nnn}.
 *
 * Come per acquisti e manutenzioni il codice si ricava dall'ID SP dell'item
 * appena creato, quindi serve una seconda PATCH.
 *
 * La priorità non arriva dal richiedente: la calcola `prioritaProposta` da
 * impatto e blocco, e chi prende in carico può cambiarla. Il centro di costo
 * è la fotografia di quello del bene al momento del guasto.
 */
export async function creaTicket(input: {
  richiedenteLookupId: number
  tipologia: string
  categoria: string
  beneId?: number
  dispositivoAltro?: string
  problema: string
  daQuando?: string
  bloccante: boolean
  impatto: Impatto
  strutturaId?: number
  recapito?: string
  disponibilita?: string
  allegatoUrl?: string
  allegatoNome?: string
  centroCostoId?: number
  /** Se indicato, il ticket nasce già preso in carico da questo utente. */
  assegnatoLookupId?: number
}): Promise<{ spItemId: string; codice: string; priorita: Priorita }> {
  const priorita = prioritaProposta(input.impatto, input.bloccante)

  const creato = await graphPost<any>(listBase(), {
    fields: {
      RichiedenteLookupId: input.richiedenteLookupId,
      Tipologia: input.tipologia,
      Categoria: input.categoria,
      ...(input.beneId ? { BeneLookupId: input.beneId } : {}),
      ...(input.strutturaId ? { StrutturaLookupId: input.strutturaId } : {}),
      ...(input.centroCostoId ? { CentroCostoLookupId: input.centroCostoId } : {}),
      DispositivoAltro: input.dispositivoAltro ?? '',
      Problema: input.problema,
      DaQuando: dataSoloGiorno(input.daQuando),
      Bloccante: input.bloccante,
      Impatto: input.impatto,
      Recapito: input.recapito ?? '',
      Disponibilita: input.disponibilita ?? '',
      AllegatoUrl: input.allegatoUrl ?? '',
      AllegatoNome: input.allegatoNome ?? '',
      Priorita: priorita,
      Stato: input.assegnatoLookupId ? 'Presa in carico' : 'Inviata',
    },
  })

  const spItemId = String(creato.id)
  const numericId = Number(creato.fields?.id ?? creato.id ?? 0)
  const anno = new Date().getFullYear()
  const codice = `ASS-${anno}-${String(numericId).padStart(3, '0')}`

  await aggiornaTicket(spItemId, {
    Title: codice,
    DataApertura: new Date().toISOString(),
    AssistenzaEsterna: false,
    Riaperture: 0,
    DigestInviato: false,
    ...(input.assegnatoLookupId ? { AssegnatoLookupId: input.assegnatoLookupId } : {}),
  })

  return { spItemId, codice, priorita }
}

/**
 * Chiusura del ticket.
 *
 * `Interventi` è l'unico campo che il richiedente legge (finisce nella mail):
 * si scrive in italiano, non in sigle. `Analisi` e `NoteInterne` restano
 * all'IT.
 */
export function campiRisoluzione(input: {
  interventi?: string
  analisi?: string
  oreLavoro?: number
  assistenzaEsterna?: boolean
}): Record<string, unknown> {
  const ore = Number(input.oreLavoro)
  return {
    Stato: 'Risolta',
    DataChiusura: dataSoloGiorno(new Date().toISOString().slice(0, 10)),
    Interventi: input.interventi?.trim() || undefined,
    Analisi: input.analisi?.trim() || undefined,
    OreLavoro: isFinite(ore) && ore > 0 ? Math.round(ore * 100) / 100 : undefined,
    AssistenzaEsterna:
      input.assistenzaEsterna === undefined ? undefined : Boolean(input.assistenzaEsterna),
  }
}
