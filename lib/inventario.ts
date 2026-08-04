/**
 * Accesso alla lista SharePoint "Inventario Beni" (SP_LIST_INVENTARIO) e alla
 * libreria documenti che ospita una cartella per ogni bene.
 *
 * Variabili d'ambiente:
 *   SP_LIST_INVENTARIO      id della lista
 *   SP_INVENTARIO_DRIVE_ID  drive della libreria che contiene le cartelle
 *   SP_INVENTARIO_FOLDER    cartella radice dentro quel drive (default "Inventario Beni")
 *
 * Le tre le scrive `scripts/provision-inventario.mjs`, che risolve da sé in quale
 * libreria del sito si trovi la cartella "Inventario Beni".
 *
 * Convenzioni Graph identiche al resto dell'app (vedi lib/acquisti.ts).
 */

import { graphGet, graphGetOrNull, graphPost, graphPatch } from '@/lib/graph'
import {
  formattaNumeroInventario,
  progressivoDaNumero,
  STATI_BENE_CHIUSI,
  type AggiornaBenePayload,
  type BeneInventario,
  type NuovoBeneInput,
  type StatoBene,
  type TipoDocumento,
} from '@/types/inventario'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const LIST = () => process.env.SP_LIST_INVENTARIO!
const listBase = () => `/sites/${SITE()}/lists/${LIST()}/items`

const PREFER_NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

/**
 * Cartella radice dentro il drive.
 *
 * Il valore "." significa "la radice della libreria": è il caso in cui i beni
 * hanno una libreria dedicata e una sottocartella "Inventario Beni/Inventario
 * Beni" sarebbe solo un livello inutile.
 */
const CARTELLA_RADICE = (): string => {
  const v = (process.env.SP_INVENTARIO_FOLDER ?? '').trim()
  if (!v) return 'Inventario Beni'
  if (v === '.' || v === '/') return ''
  return v.replace(/^\/+|\/+$/g, '')
}

/** true se lista e libreria sono configurate. */
export function inventarioConfigurato(): boolean {
  return Boolean(process.env.SHAREPOINT_SITE_ID && process.env.SP_LIST_INVENTARIO)
}

const CAMPI =
  'id,fields&$expand=fields($select=Title,Descrizione,Categoria,MarcaModello,NumeroSerie,' +
  'Struttura,StrutturaLookupId,Ubicazione,StatoBene,DataAcquisto,Fornitore,Valore,' +
  'MesiGaranzia,ScadenzaGaranzia,CodiceRichiesta,RichiestaItemId,CartellaUrl,' +
  'FatturaUrl,FatturaNome,GaranziaUrl,GaranziaNome,DataDismissione,Note)'

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

function mapBene(item: any): BeneInventario {
  const f = item.fields ?? {}
  return {
    spItemId: String(item.id),
    numero: f.Title ?? '',

    descrizione: f.Descrizione ?? '',
    categoria: f.Categoria || undefined,
    marcaModello: f.MarcaModello || undefined,
    numeroSerie: f.NumeroSerie || undefined,

    struttura: f.StrutturaLookupId
      ? {
          id: Number(f.Struttura?.LookupId ?? f.StrutturaLookupId),
          value: testoLookup(f.Struttura),
        }
      : undefined,
    ubicazione: f.Ubicazione || undefined,
    statoBene: (f.StatoBene ?? 'In uso') as StatoBene,

    dataAcquisto: f.DataAcquisto || undefined,
    fornitore: f.Fornitore || undefined,
    valore: num(f.Valore),
    mesiGaranzia: num(f.MesiGaranzia),
    scadenzaGaranzia: f.ScadenzaGaranzia || undefined,

    codiceRichiesta: f.CodiceRichiesta || undefined,
    richiestaItemId: f.RichiestaItemId || undefined,

    cartellaUrl: f.CartellaUrl || undefined,
    fatturaUrl: f.FatturaUrl || undefined,
    fatturaNome: f.FatturaNome || undefined,
    garanziaUrl: f.GaranziaUrl || undefined,
    garanziaNome: f.GaranziaNome || undefined,

    dataDismissione: f.DataDismissione || undefined,
    note: f.Note || undefined,
  }
}

/** Data "solo giorno" a mezzogiorno UTC: evita che diventi il giorno prima. */
function dataSoloGiorno(ymd?: string | null): string | undefined {
  if (!ymd) return undefined
  const solo = String(ymd).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(solo)) return undefined
  return `${solo}T12:00:00Z`
}

// ============================================================
// Letture
// ============================================================

export async function getInventario(): Promise<BeneInventario[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase()}?$select=${CAMPI}&$orderby=fields/Created desc&$top=2000`,
    PREFER_NON_INDEXED,
  )
  return res.value.map(mapBene)
}

export async function getBeneById(spItemId: string): Promise<BeneInventario> {
  const item = await graphGet<any>(
    `/sites/${SITE()}/lists/${LIST()}/items/${spItemId}?$select=${CAMPI}`,
  )
  return mapBene(item)
}

/** Beni generati da una richiesta di acquisto, nell'ordine di numerazione. */
export async function getBeniPerRichiesta(codice: string): Promise<BeneInventario[]> {
  if (!codice) return []
  const tutti = await getInventario()
  return tutti
    .filter((b) => b.codiceRichiesta === codice)
    .sort((a, b) => (progressivoDaNumero(a.numero) ?? 0) - (progressivoDaNumero(b.numero) ?? 0))
}

// ============================================================
// Numerazione
// ============================================================

/**
 * Ultimo progressivo usato. Si legge dai Title esistenti e non dall'ID
 * SharePoint: così i numeri restano contigui anche se una riga viene cancellata,
 * e non ripartono da capo se la lista viene ricreata.
 */
async function ultimoProgressivo(): Promise<number> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase()}?$select=id,fields&$expand=fields($select=Title)&$top=2000`,
    PREFER_NON_INDEXED,
  )
  let max = 0
  for (const item of res.value ?? []) {
    const n = progressivoDaNumero(item.fields?.Title)
    if (n != null && n > max) max = n
  }
  return max
}

/**
 * Coda di serializzazione delle assegnazioni di numero.
 *
 * SharePoint non sa imporre l'unicità del Title, quindi due creazioni davvero
 * contemporanee potrebbero leggere lo stesso massimo. Accodarle dentro la stessa
 * istanza copre il caso realistico (un gestore che registra un ordine di più
 * pezzi); resta una finestra teorica fra istanze serverless diverse, accettabile
 * per i volumi della cooperativa ma da ricordare prima di alzarli.
 */
let coda: Promise<unknown> = Promise.resolve()
function inCoda<T>(fn: () => Promise<T>): Promise<T> {
  const next = coda.then(fn, fn)
  coda = next.catch(() => undefined)
  return next
}

// ============================================================
// Cartelle e file
// ============================================================

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** Ripulisce un nome per SharePoint: via i caratteri vietati, lunghezza sotto controllo. */
function sanitizeNome(s: string, fallback = 'senza nome'): string {
  const pulito = (s || fallback)
    .replace(/[\\/:*?"<>|#%~&{}]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
  return (pulito || fallback).slice(0, 90)
}

let _driveIdCache: string | null = null
async function getDriveId(): Promise<string> {
  if (process.env.SP_INVENTARIO_DRIVE_ID) return process.env.SP_INVENTARIO_DRIVE_ID
  if (_driveIdCache) return _driveIdCache
  // Ripiego sulla libreria predefinita del sito: è dove sta "Inventario Beni"
  // se nessuno ha impostato SP_INVENTARIO_DRIVE_ID.
  const d = await graphGet<{ id: string }>(`/sites/${SITE()}/drive?$select=id`)
  _driveIdCache = d.id
  return d.id
}

/** Crea la catena di cartelle se manca e ritorna il webUrl dell'ultima. */
async function assicuraCartella(driveId: string, relPath: string): Promise<string> {
  const segmenti = relPath.split('/').filter(Boolean)
  let corrente = ''
  for (const seg of segmenti) {
    const genitore = corrente
    corrente = corrente ? `${corrente}/${seg}` : seg
    const esiste = await graphGetOrNull<{ id: string }>(
      `/drives/${driveId}/root:/${encodePath(corrente)}?$select=id`,
    )
    if (esiste) continue
    const endpoint = genitore
      ? `/drives/${driveId}/root:/${encodePath(genitore)}:/children`
      : `/drives/${driveId}/root/children`
    await graphPost(endpoint, {
      name: seg,
      folder: {},
      // "fail" e non "rename": se la cartella è comparsa nel frattempo la
      // riusiamo, invece di ritrovarci "INV-0007 1" accanto a "INV-0007".
      '@microsoft.graph.conflictBehavior': 'fail',
    }).catch(async (err) => {
      const ancora = await graphGetOrNull<{ id: string }>(
        `/drives/${driveId}/root:/${encodePath(corrente)}?$select=id`,
      )
      if (!ancora) throw err
    })
  }
  const info = await graphGetOrNull<{ webUrl: string }>(
    `/drives/${driveId}/root:/${encodePath(relPath)}?$select=webUrl`,
  )
  return info?.webUrl ?? ''
}

/** Percorso relativo della cartella di un bene: "Inventario Beni/INV-0007 - Trapano". */
function percorsoBene(numero: string, descrizione: string): string {
  const nome = sanitizeNome(`${numero} - ${descrizione}`, numero)
  const radice = CARTELLA_RADICE()
  return radice ? `${radice}/${nome}` : nome
}

/**
 * Nome file fisso per tipo, così un secondo caricamento sostituisce il primo
 * invece di accumulare "fattura (2)". L'estensione originale viene conservata.
 */
function nomeDocumento(numero: string, tipo: TipoDocumento, filenameOriginale: string): string {
  const est = (filenameOriginale.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '').toLowerCase()
  const etichetta = tipo === 'fattura' ? 'Fattura' : 'Garanzia'
  return sanitizeNome(`${etichetta} ${numero}`, etichetta) + est
}

// ============================================================
// Scritture
// ============================================================

export async function aggiornaBene(
  spItemId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const puliti = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
  if (!Object.keys(puliti).length) return
  await graphPatch(`/sites/${SITE()}/lists/${LIST()}/items/${spItemId}/fields`, puliti)
}

/**
 * Crea `quantita` beni a partire da una richiesta ordinata: un numero di
 * inventario e una cartella per ogni pezzo.
 *
 * Un pezzo = un bene anche quando la fornitura è omogenea (scelta di Dennis del
 * 04/08/2026): ciascuno ha il suo numero di serie e può essere dismesso da solo,
 * cosa che un record unico con quantità non saprebbe rappresentare.
 *
 * Il valore di ogni bene è la quota unitaria del totale della fornitura: è quello
 * che serve al registro dei beni, dove il cespite è il singolo pezzo.
 */
export async function creaBeniDaRichiesta(
  base: NuovoBeneInput,
  quantita: number,
  seriali: string[] = [],
): Promise<BeneInventario[]> {
  const pezzi = Math.max(1, Math.round(Number(quantita) || 1))
  const driveId = await getDriveId()

  return inCoda(async () => {
    let progressivo = await ultimoProgressivo()
    const creati: BeneInventario[] = []

    for (let i = 0; i < pezzi; i++) {
      progressivo += 1
      const numero = formattaNumeroInventario(progressivo)
      const seriale = (seriali[i] ?? '').trim()

      // La cartella prima della riga: se SharePoint la rifiuta è meglio non
      // avere un bene che punta a un posto che non esiste.
      let cartellaUrl = ''
      try {
        cartellaUrl = await assicuraCartella(driveId, percorsoBene(numero, base.descrizione))
      } catch (err) {
        console.error('[inventario] cartella non creata per', numero, err)
      }

      const creato = await graphPost<any>(listBase(), {
        fields: {
          Title: numero,
          Descrizione: base.descrizione,
          Categoria: base.categoria || undefined,
          MarcaModello: base.marcaModello?.trim() || '',
          NumeroSerie: seriale,
          StrutturaLookupId: base.strutturaId || undefined,
          StatoBene: 'In uso',
          DataAcquisto: dataSoloGiorno(base.dataAcquisto),
          Fornitore: base.fornitore || undefined,
          Valore: base.valore != null ? base.valore : undefined,
          MesiGaranzia: base.mesiGaranzia,
          ScadenzaGaranzia: dataSoloGiorno(base.scadenzaGaranzia),
          CodiceRichiesta: base.codiceRichiesta || undefined,
          RichiestaItemId: base.richiestaItemId || undefined,
          CartellaUrl: cartellaUrl,
        },
      })
      creati.push(await getBeneById(String(creato.id)))
    }

    return creati
  })
}

/**
 * Aggiorna i campi che riguardano la vita del bene dopo l'acquisto.
 *
 * La data di dismissione si comporta da sé: passando a uno stato di uscita
 * (dismesso, alienato, smarrito) se non è indicata prende oggi, e tornando in
 * uso viene azzerata. Chi compila non deve ricordarsi due campi al posto di uno.
 */
export async function aggiornaVitaBene(
  bene: BeneInventario,
  payload: AggiornaBenePayload,
): Promise<BeneInventario> {
  const nuovoStato = payload.statoBene ?? bene.statoBene
  const esce = STATI_BENE_CHIUSI.includes(nuovoStato)

  let dataDismissione: string | null | undefined
  if (payload.dataDismissione !== undefined) {
    dataDismissione = payload.dataDismissione ? dataSoloGiorno(payload.dataDismissione) ?? null : null
  } else if (esce && !bene.dataDismissione) {
    dataDismissione = new Date().toISOString()
  } else if (!esce && bene.dataDismissione) {
    dataDismissione = null
  }

  await aggiornaBene(bene.spItemId, {
    StatoBene: payload.statoBene,
    Ubicazione: payload.ubicazione !== undefined ? payload.ubicazione.trim() : undefined,
    StrutturaLookupId: payload.strutturaId || undefined,
    DataDismissione: dataDismissione,
    Note: payload.note !== undefined ? payload.note.trim() : undefined,
  })
  return getBeneById(bene.spItemId)
}

/**
 * Allinea i beni già generati quando l'ordine viene corretto.
 *
 * Non tocca il numero di inventario né la cartella: quelli sono nati e restano.
 * Aggiorna solo i dati che dipendono dall'ordine (fornitore, date, valore,
 * garanzia), così una correzione di importo non lascia il registro sfasato.
 */
export async function allineaBeniDaRichiesta(
  codiceRichiesta: string,
  campi: {
    marcaModello?: string
    fornitore?: string
    dataAcquisto?: string
    valore?: number
    mesiGaranzia?: number
    scadenzaGaranzia?: string
    strutturaId?: number
  },
): Promise<number> {
  const beni = await getBeniPerRichiesta(codiceRichiesta)
  for (const b of beni) {
    await aggiornaBene(b.spItemId, {
      MarcaModello: campi.marcaModello?.trim() || undefined,
      Fornitore: campi.fornitore || undefined,
      DataAcquisto: dataSoloGiorno(campi.dataAcquisto),
      Valore: campi.valore != null ? campi.valore : undefined,
      MesiGaranzia: campi.mesiGaranzia,
      ScadenzaGaranzia: dataSoloGiorno(campi.scadenzaGaranzia),
      StrutturaLookupId: campi.strutturaId || undefined,
    })
  }
  return beni.length
}

/** Segna come annullati i beni di una richiesta che non andrà a buon fine. */
export async function annullaBeniDaRichiesta(codiceRichiesta: string): Promise<number> {
  const beni = await getBeniPerRichiesta(codiceRichiesta)
  const daAnnullare = beni.filter((b) => b.statoBene !== 'Annullato')
  for (const b of daAnnullare) {
    await aggiornaBene(b.spItemId, {
      StatoBene: 'Annullato',
      Note: [b.note, 'Richiesta di acquisto annullata.'].filter(Boolean).join('\n'),
    })
  }
  return daAnnullare.length
}

// ============================================================
// Documenti (fattura e garanzia)
// ============================================================

/**
 * Apre la sessione di upload nella cartella del bene e ritorna l'URL
 * pre-autorizzato per il PUT diretto dal browser: i byte non passano dalla
 * funzione serverless, quindi non vale il limite dei 4 MB di Graph.
 *
 * ⚠️ L'`uploadUrl` è una credenziale a tempo: non loggarlo.
 */
export async function creaSessioneUploadDocumento(
  bene: BeneInventario,
  tipo: TipoDocumento,
  filename: string,
): Promise<{ uploadUrl: string; scadeIl: string; nomeFile: string }> {
  const driveId = await getDriveId()
  const cartella = percorsoBene(bene.numero, bene.descrizione)
  await assicuraCartella(driveId, cartella)
  const nomeFile = nomeDocumento(bene.numero, tipo, filename)

  const res = await graphPost<{ uploadUrl: string; expirationDateTime: string }>(
    `/drives/${driveId}/root:/${encodePath(`${cartella}/${nomeFile}`)}:/createUploadSession`,
    { item: { '@microsoft.graph.conflictBehavior': 'replace', name: nomeFile } },
  )
  return { uploadUrl: res.uploadUrl, scadeIl: res.expirationDateTime, nomeFile }
}

/** Registra sulla riga del bene il documento che il browser ha già caricato. */
export async function confermaDocumento(
  bene: BeneInventario,
  tipo: TipoDocumento,
  nomeFile: string,
): Promise<BeneInventario> {
  const driveId = await getDriveId()
  const cartella = percorsoBene(bene.numero, bene.descrizione)
  const safe = sanitizeNome(nomeFile, nomeFile)
  const file = await graphGetOrNull<{ webUrl: string; name: string }>(
    `/drives/${driveId}/root:/${encodePath(`${cartella}/${safe}`)}?$select=webUrl,name`,
  )
  if (!file) throw new Error('File non trovato su SharePoint: riprova il caricamento')

  const cartellaUrl =
    bene.cartellaUrl ||
    (await graphGetOrNull<{ webUrl: string }>(
      `/drives/${driveId}/root:/${encodePath(cartella)}?$select=webUrl`,
    ).then((c) => c?.webUrl ?? ''))

  await aggiornaBene(
    bene.spItemId,
    tipo === 'fattura'
      ? { FatturaUrl: file.webUrl, FatturaNome: file.name ?? safe, CartellaUrl: cartellaUrl }
      : { GaranziaUrl: file.webUrl, GaranziaNome: file.name ?? safe, CartellaUrl: cartellaUrl },
  )
  return getBeneById(bene.spItemId)
}
