/**
 * Accesso alla lista SharePoint "Richieste Acquisto" (SP_LIST_ACQUISTI).
 *
 * Convenzioni SP via Graph (le stesse del resto dell'app):
 *   - Choice  → stringa semplice
 *   - Lookup  → {Campo}LookupId: number
 *   - Person  → {Campo}LookupId: number  (id nella User Information List)
 *   - Date "solo giorno" → 'YYYY-MM-DDT12:00:00Z' per evitare slittamenti di fuso
 */

import { randomBytes } from 'node:crypto'
import { graphGet, graphPost, graphPatch } from '@/lib/core/graph'
import { creaCosto } from '@/lib/costi/data'
import { centroCostoDiStruttura } from '@/lib/strutture/data'
import { getSPUserLookupId } from '@/lib/core/sp'
import {
  aggiungiMesi,
  normalizzaFornitore,
  MESI_GARANZIA_DEFAULT,
  type RichiestaAcquisto,
  type StatoAcquisto,
} from '@/types/acquisti'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const LIST = () => process.env.SP_LIST_ACQUISTI!
const listBase = () => `/sites/${SITE()}/lists/${LIST()}/items`

const PREFER_NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

export const AREA_ACQUISTI = 'Acquisti'

/** true se la lista è configurata: permette alle pagine di mostrare un avviso invece di un 500. */
export function acquistiConfigurato(): boolean {
  return Boolean(process.env.SHAREPOINT_SITE_ID && process.env.SP_LIST_ACQUISTI)
}

const CAMPI =
  'id,fields&$expand=fields($select=Title,Richiedente,RichiedenteLookupId,DataRichiesta,' +
  'Struttura,StrutturaLookupId,CentroCosto,CentroCostoLookupId,' +
  'Descrizione,Quantita,LinkRiferimento,Urgenza,ServeEntro,Categoria,' +
  'Stato,Assegnato,AssegnatoLookupId,MotivoRifiuto,NoteInterne,' +
  'Fornitore,Imponibile,Totale,DataOrdine,Pagamento,DataPagamento,DataConsegnaPrevista,' +
  'LuogoConsegna,LuogoConsegnaLookupId,DataConsegnaEffettiva,EsitoConsegna,NoteEsito,' +
  'DaInventariare,MarcaModello,NumeroSerie,ExtraCee,MesiGaranzia,ScadenzaGaranzia,' +
  'NumeriInventario,InventarioGenerato,' +
  'ConfermaToken,NotificaConsegnaInviata,SollecitoInviato,CostoGenerato,DigestInviato)'

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

function mapAcquisto(item: any): RichiestaAcquisto {
  const f = item.fields ?? {}
  return {
    spItemId: String(item.id),
    codice: f.Title ?? '',

    richiedenteNome: testoLookup(f.Richiedente),
    richiedenteLookupId: Number(f.RichiedenteLookupId ?? 0),
    dataRichiesta: f.DataRichiesta ?? '',
    struttura: {
      id: Number(f.Struttura?.LookupId ?? f.StrutturaLookupId ?? 0),
      value: testoLookup(f.Struttura),
    },
    centroCosto: Number(f.CentroCosto?.LookupId ?? f.CentroCostoLookupId ?? 0)
      ? {
          id: Number(f.CentroCosto?.LookupId ?? f.CentroCostoLookupId),
          value: testoLookup(f.CentroCosto),
        }
      : undefined,
    descrizione: f.Descrizione ?? '',
    quantita: num(f.Quantita) ?? 1,
    link: f.LinkRiferimento || undefined,
    urgenza: f.Urgenza ?? 'Normale',
    serveEntro: f.ServeEntro || undefined,
    categoria: f.Categoria ?? '',

    stato: (f.Stato ?? 'Inviata') as StatoAcquisto,
    assegnatoNome: testoLookup(f.Assegnato) || undefined,
    assegnatoLookupId: num(f.AssegnatoLookupId),
    motivoRifiuto: f.MotivoRifiuto || undefined,
    noteInterne: f.NoteInterne || undefined,

    fornitore: f.Fornitore || undefined,
    imponibile: num(f.Imponibile),
    totale: num(f.Totale),
    dataOrdine: f.DataOrdine || undefined,
    pagamento: f.Pagamento || undefined,
    dataPagamento: f.DataPagamento || undefined,
    dataConsegnaPrevista: f.DataConsegnaPrevista || undefined,
    luogoConsegna: f.LuogoConsegnaLookupId
      ? {
          id: Number(f.LuogoConsegna?.LookupId ?? f.LuogoConsegnaLookupId),
          value: testoLookup(f.LuogoConsegna),
        }
      : undefined,

    dataConsegnaEffettiva: f.DataConsegnaEffettiva || undefined,
    esitoConsegna: f.EsitoConsegna || undefined,
    noteEsito: f.NoteEsito || undefined,

    daInventariare: Boolean(f.DaInventariare),
    marcaModello: f.MarcaModello || undefined,
    numeroSerie: f.NumeroSerie || undefined,
    extraCee: Boolean(f.ExtraCee),
    mesiGaranzia: num(f.MesiGaranzia),
    scadenzaGaranzia: f.ScadenzaGaranzia || undefined,
    numeriInventario: f.NumeriInventario || undefined,
    inventarioGenerato: Boolean(f.InventarioGenerato),

    confermaToken: f.ConfermaToken || undefined,
    notificaConsegnaInviata: Boolean(f.NotificaConsegnaInviata),
    sollecitoInviato: Boolean(f.SollecitoInviato),
    costoGenerato: Boolean(f.CostoGenerato),
    digestInviato: Boolean(f.DigestInviato),
  }
}

/** Data "solo giorno" a mezzogiorno UTC: evita che diventi il giorno prima. */
export function dataSoloGiorno(ymd?: string | null): string | undefined {
  if (!ymd) return undefined
  const solo = String(ymd).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(solo)) return undefined
  return `${solo}T12:00:00Z`
}

// ============================================================
// Letture
// ============================================================

export async function getAcquisti(): Promise<RichiestaAcquisto[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase()}?$select=${CAMPI}&$orderby=fields/Created desc&$top=1000`,
    PREFER_NON_INDEXED,
  )
  return res.value.map(mapAcquisto)
}

/** Richieste inviate dall'utente corrente. */
export async function getAcquistiByEmail(email: string): Promise<RichiestaAcquisto[]> {
  const lookupId = await getSPUserLookupId(email)
  const tutte = await getAcquisti()
  return tutte.filter((a) => a.richiedenteLookupId === lookupId)
}

export async function getAcquistoById(spItemId: string): Promise<RichiestaAcquisto> {
  const item = await graphGet<any>(
    `/sites/${SITE()}/lists/${LIST()}/items/${spItemId}?$select=${CAMPI}`,
  )
  return mapAcquisto(item)
}

export async function getAcquistoByToken(token: string): Promise<RichiestaAcquisto | null> {
  if (!token || token.length < 16) return null
  const tutte = await getAcquisti()
  return tutte.find((a) => a.confermaToken === token) ?? null
}

/**
 * Nomi fornitore già usati, deduplicati sulla forma normalizzata.
 * Alimenta i suggerimenti del campo fornitore: nessun elenco da manutenere.
 */
export async function getFornitoriNoti(): Promise<string[]> {
  const tutte = await getAcquisti()
  const visti = new Map<string, string>()
  for (const a of tutte) {
    const nome = a.fornitore?.trim()
    if (!nome) continue
    const chiave = normalizzaFornitore(nome)
    if (!chiave) continue
    // A parità di forma normalizzata tengo la prima grafia incontrata.
    if (!visti.has(chiave)) visti.set(chiave, nome)
  }
  return [...visti.values()].sort((a, b) => a.localeCompare(b, 'it'))
}

/**
 * Se un fornitore equivalente è già in uso, restituisce quella grafia:
 * evita "Amazon" / "amazon srl" / "AMAZON" come tre fornitori distinti.
 */
export async function normalizzaNomeFornitore(nome: string): Promise<string> {
  const pulito = nome.trim().replace(/\s+/g, ' ')
  if (!pulito) return ''
  const chiave = normalizzaFornitore(pulito)
  if (!chiave) return pulito
  const noti = await getFornitoriNoti()
  const gia = noti.find((n) => normalizzaFornitore(n) === chiave)
  return gia ?? pulito
}

// ============================================================
// Scritture
// ============================================================

export async function aggiornaAcquisto(
  spItemId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  // Graph rifiuta le proprietà undefined: le rimuovo.
  const puliti = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  )
  if (!Object.keys(puliti).length) return
  await graphPatch(`/sites/${SITE()}/lists/${LIST()}/items/${spItemId}/fields`, puliti)
}

/**
 * Crea la richiesta e le assegna il codice progressivo ACQ-{anno}-{id}.
 * Come per le manutenzioni, il codice si ricava dall'ID SP dell'item appena
 * creato: serve quindi una seconda PATCH.
 */
export async function creaAcquisto(input: {
  strutturaId: number
  /** Chi paga. Precompilato dalla struttura, ma l'utente può cambiarlo. */
  centroCostoId?: number
  richiedenteLookupId: number
  descrizione: string
  quantita: number
  link?: string
  urgenza: string
  serveEntro?: string
  categoria: string
  /** Se indicato, la richiesta nasce già presa in carico da questo utente. */
  assegnatoLookupId?: number
}): Promise<{ spItemId: string; codice: string; token: string }> {
  const creato = await graphPost<any>(listBase(), {
    fields: {
      StrutturaLookupId: input.strutturaId,
      ...(input.centroCostoId ? { CentroCostoLookupId: input.centroCostoId } : {}),
      RichiedenteLookupId: input.richiedenteLookupId,
      Descrizione: input.descrizione,
      Quantita: input.quantita,
      LinkRiferimento: input.link ?? '',
      Urgenza: input.urgenza,
      ServeEntro: dataSoloGiorno(input.serveEntro),
      Categoria: input.categoria,
      Stato: input.assegnatoLookupId ? 'Presa in carico' : 'Inviata',
    },
  })

  const spItemId = String(creato.id)
  const numericId = Number(creato.fields?.id ?? creato.id ?? 0)
  const anno = new Date().getFullYear()
  const codice = `ACQ-${anno}-${String(numericId).padStart(3, '0')}`
  const token = randomBytes(24).toString('base64url')

  await aggiornaAcquisto(spItemId, {
    Title: codice,
    DataRichiesta: new Date().toISOString(),
    ConfermaToken: token,
    DaInventariare: false,
    ExtraCee: false,
    InventarioGenerato: false,
    NotificaConsegnaInviata: false,
    SollecitoInviato: false,
    CostoGenerato: false,
    DigestInviato: false,
    ...(input.assegnatoLookupId ? { AssegnatoLookupId: input.assegnatoLookupId } : {}),
  })

  return { spItemId, codice, token }
}

/**
 * Campi dell'ordine.
 *
 * Imponibile e totale sono entrambi digitati da chi ha la fattura davanti:
 * l'aliquota IVA non viene più chiesta né salvata, perché in fattura può essere
 * mista (righe al 22% e righe al 4%) e un'unica percentuale falserebbe il conto.
 * L'IVA si ricava per differenza quando serve mostrarla.
 *
 * La scadenza della garanzia si calcola dalla **data dell'ordine** — scelta di
 * Dennis del 04/08/2026 — e viene salvata, non solo derivata, così è filtrabile
 * anche dalla vista SharePoint.
 */
export function campiOrdine(input: {
  fornitore: string
  imponibile: number
  totale: number
  dataOrdine?: string
  pagamento?: string
  dataConsegnaPrevista?: string
  luogoConsegnaId?: number
  daInventariare?: boolean
  marcaModello?: string
  numeroSerie?: string
  extraCee?: boolean
  mesiGaranzia?: number
}): Record<string, unknown> {
  const dataOrdineIso = dataSoloGiorno(input.dataOrdine) ?? new Date().toISOString()
  const mesi = Number(input.mesiGaranzia)
  const mesiGaranzia = isFinite(mesi) && mesi > 0 ? Math.round(mesi) : MESI_GARANZIA_DEFAULT
  const scadenza = input.daInventariare
    ? aggiungiMesi(dataOrdineIso, mesiGaranzia)
    : undefined

  return {
    Stato: 'Ordinata',
    Fornitore: input.fornitore,
    Imponibile: Number(input.imponibile) || 0,
    Totale: Number(input.totale) || 0,
    DataOrdine: dataOrdineIso,
    Pagamento: input.pagamento || undefined,
    DataConsegnaPrevista: dataSoloGiorno(input.dataConsegnaPrevista),
    LuogoConsegnaLookupId: input.luogoConsegnaId || undefined,
    DaInventariare: Boolean(input.daInventariare),
    MarcaModello: input.marcaModello?.trim() || '',
    NumeroSerie: input.numeroSerie?.trim() || '',
    ExtraCee: Boolean(input.extraCee),
    MesiGaranzia: input.daInventariare ? mesiGaranzia : undefined,
    ScadenzaGaranzia: scadenza ? dataSoloGiorno(scadenza) : undefined,
    // Un nuovo ordine riapre la finestra delle notifiche di consegna.
    NotificaConsegnaInviata: false,
    SollecitoInviato: false,
  }
}

/**
 * Registra la data in cui la fornitura è stata pagata.
 *
 * Sta fuori da `campiOrdine` perché il pagamento arriva quasi sempre dopo la
 * consegna, quando il blocco "registra ordine" è già chiuso: serve poterlo
 * scrivere da solo, su una richiesta in qualsiasi stato.
 */
export function campiPagamento(dataPagamento?: string): Record<string, unknown> {
  return { DataPagamento: dataPagamento ? dataSoloGiorno(dataPagamento) : null }
}

/**
 * Registra la spesa nella lista Costi Strutture, così l'acquisto compare nel
 * cruscotto costi YTD senza reinserimenti.
 *
 * Idempotente tramite il flag CostoGenerato. Non lancia: un errore qui non deve
 * impedire la chiusura della richiesta — la consegna è già confermata.
 */
export async function generaCostoDaAcquisto(
  a: RichiestaAcquisto,
): Promise<{ generato: boolean; motivo?: string }> {
  if (a.costoGenerato) return { generato: false, motivo: 'già generato' }
  if (!a.struttura.id) return { generato: false, motivo: 'struttura mancante' }
  const importo = a.totale ?? 0
  if (importo <= 0) return { generato: false, motivo: 'importo assente' }

  const data = a.dataConsegnaEffettiva || a.dataOrdine || new Date().toISOString()
  const dataObj = new Date(data)
  const periodo = isNaN(dataObj.getTime())
    ? ''
    : dataObj.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  // Il centro di costo lo porta la richiesta. Se è una richiesta vecchia,
  // nata prima che il campo esistesse, si ripiega su quello della struttura.
  const centroCostoId =
    a.centroCosto?.id || (await centroCostoDiStruttura(a.struttura.id))

  const base = {
    Title: `${a.codice} — ${a.descrizione}`.slice(0, 255),
    DataCosto: (isNaN(dataObj.getTime()) ? new Date() : dataObj).toISOString(),
    Importo: importo,
    CentroCostoLookupId: centroCostoId,
    StrutturaLookupId: a.struttura.id,
    Fornitore: a.fornitore || undefined,
    Periodo: periodo,
  }

  // Le colonne Categoria/Fonte di Costi Strutture sono Choice: i valori
  // "Acquisti"/"Acquisto" vengono aggiunti da scripts/provision-acquisti.mjs.
  // Se lo script non è stato eseguito, ripiego su valori già esistenti.
  try {
    await creaCosto({ ...base, Categoria: 'Acquisti', Fonte: 'Acquisto' })
  } catch (err) {
    console.warn('[acquisti] Categoria/Fonte acquisti rifiutate, ripiego', err)
    try {
      await creaCosto({ ...base, Categoria: 'Acquisti', Fonte: 'Manuale' })
    } catch (err2) {
      console.error('[acquisti] generazione costo fallita', err2)
      return { generato: false, motivo: 'SharePoint ha rifiutato la riga di costo' }
    }
  }

  await aggiornaAcquisto(a.spItemId, { CostoGenerato: true })
  return { generato: true }
}
