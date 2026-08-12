/**
 * Lettura e scrittura della lista SharePoint "Fatture inviate"
 * (sito Controllo Gestione, la stessa dove stanno costi, acquisti e inventario).
 *
 * Variabile d'ambiente:
 *   SP_LIST_FATTURE   id della lista — lo stampa `scripts/provision-fatture.mjs`
 *
 * Convenzioni Graph identiche al resto dell'app (vedi lib/core/sp.ts).
 */

import { graphGet, graphPost } from '@/lib/core/graph'
import {
  formattaNumeroFattura,
  progressivoDaNumeroFattura,
  type NuovaRichiestaFatturaInput,
  type Nazionalita,
  type RichiestaFattura,
  type TipoSoggetto,
} from '@/types/fatture'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const LIST = () => process.env.SP_LIST_FATTURE!
const listBase = () => `/sites/${SITE()}/lists/${LIST()}/items`

const PREFER_NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

/** true se la lista è configurata. La pagina lo controlla prima di mostrare il form. */
export function fattureConfigurato(): boolean {
  return Boolean(process.env.SHAREPOINT_SITE_ID && process.env.SP_LIST_FATTURE)
}

const CAMPI =
  'id,fields&$expand=fields($select=Title,CentroCosto,Richiedente,RichiedenteNome,TipoSoggetto,' +
  'Nazionalita,Condominio,Cognome,Nome,RagioneSociale,PartitaIVA,CodiceFiscale,Indirizzo,Cap,' +
  'Citta,Provincia,Nazione,Telefono,Email,Pec,Descrizione,Importo,DataPrestazione,Note,Created)'

function mapRichiesta(item: any): RichiestaFattura {
  const f = item.fields ?? {}
  return {
    spItemId: String(item.id),
    numero: f.Title ?? '',
    centroCosto: f.CentroCosto ?? '',
    richiedente: f.Richiedente ?? '',
    richiedenteNome: f.RichiedenteNome ?? '',
    tipoSoggetto: (f.TipoSoggetto ?? 'Privato') as TipoSoggetto,
    nazionalita: (f.Nazionalita ?? 'Italiana') as Nazionalita,
    condominio: Boolean(f.Condominio),
    cognome: f.Cognome ?? '',
    nome: f.Nome ?? '',
    ragioneSociale: f.RagioneSociale ?? '',
    partitaIva: f.PartitaIVA ?? '',
    codiceFiscale: f.CodiceFiscale ?? '',
    indirizzo: f.Indirizzo ?? '',
    cap: f.Cap ?? '',
    citta: f.Citta ?? '',
    provincia: f.Provincia ?? '',
    nazione: f.Nazione ?? '',
    telefono: f.Telefono ?? '',
    email: f.Email ?? '',
    pec: f.Pec ?? '',
    descrizione: f.Descrizione ?? '',
    importo: Number(f.Importo ?? 0),
    dataPrestazione: String(f.DataPrestazione ?? '').slice(0, 10),
    note: f.Note ?? '',
    creato: f.Created ?? undefined,
  }
}

/** Data "solo giorno" a mezzogiorno UTC: evita che diventi il giorno prima. */
function dataSoloGiorno(ymd?: string | null): string | undefined {
  const solo = String(ymd ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(solo)) return undefined
  return `${solo}T12:00:00Z`
}

// ============================================================
// Numerazione — stesso schema dell'inventario
// ============================================================

/**
 * Ultimo progressivo usato, letto dai Title esistenti e non dall'ID SharePoint:
 * così i numeri restano contigui anche se una riga viene cancellata.
 */
async function ultimoProgressivo(): Promise<number> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase()}?$select=id,fields&$expand=fields($select=Title)&$top=5000`,
    PREFER_NON_INDEXED,
  )
  let max = 0
  for (const item of res.value ?? []) {
    const n = progressivoDaNumeroFattura(item.fields?.Title)
    if (n != null && n > max) max = n
  }
  return max
}

/**
 * Coda di serializzazione: SharePoint non sa imporre l'unicità del Title, quindi
 * due creazioni davvero contemporanee leggerebbero lo stesso massimo. Accodarle
 * dentro la stessa istanza copre il caso realistico; resta una finestra teorica
 * fra istanze serverless diverse, accettabile per questi volumi.
 */
let coda: Promise<unknown> = Promise.resolve()
function inCoda<T>(fn: () => Promise<T>): Promise<T> {
  const next = coda.then(fn, fn)
  coda = next.catch(() => undefined)
  return next
}

// ============================================================
// Scritture
// ============================================================

/**
 * Salva una nuova richiesta e ritorna la riga creata.
 *
 * L'input arriva già validato dall'API (`validaRichiesta` in types/fatture.ts):
 * qui si normalizza soltanto — spazi via, codici in maiuscolo, importo a numero.
 */
export async function creaRichiestaFattura(
  input: NuovaRichiestaFatturaInput,
  richiedente: { email: string; nome?: string | null },
): Promise<RichiestaFattura> {
  const t = (v: string) => String(v ?? '').trim()
  const importo = Number(String(input.importo).replace(',', '.'))

  return inCoda(async () => {
    const numero = formattaNumeroFattura((await ultimoProgressivo()) + 1)

    const fields: Record<string, unknown> = {
      Title: numero,
      CentroCosto: t(input.centroCosto),
      Richiedente: richiedente.email.toLowerCase(),
      RichiedenteNome: richiedente.nome ?? '',
      TipoSoggetto: t(input.tipoSoggetto),
      Nazionalita: t(input.nazionalita),
      Condominio: Boolean(input.condominio),

      Cognome: t(input.cognome),
      Nome: t(input.nome),
      RagioneSociale: t(input.ragioneSociale),
      PartitaIVA: t(input.partitaIva).replace(/\s/g, ''),
      CodiceFiscale: t(input.codiceFiscale).replace(/\s/g, '').toUpperCase(),

      Indirizzo: t(input.indirizzo),
      Cap: t(input.cap),
      Citta: t(input.citta),
      Provincia: t(input.provincia).toUpperCase(),
      Nazione: t(input.nazione),

      Telefono: t(input.telefono),
      Email: t(input.email).toLowerCase(),
      Pec: t(input.pec).toLowerCase(),

      Descrizione: t(input.descrizione),
      Importo: importo,
      Note: t(input.note),
    }
    const data = dataSoloGiorno(input.dataPrestazione)
    if (data) fields.DataPrestazione = data

    const creato = await graphPost<{ id: string }>(listBase(), { fields })
    return { ...mapRichiesta({ id: creato.id, fields }), numero }
  })
}

// ============================================================
// Letture
// ============================================================

/**
 * Tutte le richieste, dalla più recente. Non serve a nessuna schermata oggi
 * (la sezione è solo il form), ma è la lettura che servirà al primo cruscotto:
 * tenerla qui evita che chi lo scriverà rifaccia il mapping da capo.
 */
export async function getRichiesteFattura(): Promise<RichiestaFattura[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase()}?$select=${CAMPI}&$top=2000`,
    PREFER_NON_INDEXED,
  )
  return (res.value ?? [])
    .map(mapRichiesta)
    .sort((a, b) => (progressivoDaNumeroFattura(b.numero) ?? 0) - (progressivoDaNumeroFattura(a.numero) ?? 0))
}

/** Le richieste inviate da una persona, dalla più recente. */
export async function getRichiesteFatturaDi(email: string): Promise<RichiestaFattura[]> {
  const tutte = await getRichiesteFattura()
  const e = email.toLowerCase()
  return tutte.filter((r) => r.richiedente.toLowerCase() === e)
}
