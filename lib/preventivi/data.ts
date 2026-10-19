/**
 * Preventivi — letture e scritture sulle tre liste SharePoint.
 *
 *   SP_LIST_PREVENTIVI            → "Preventivi"
 *   SP_LIST_TARIFFARIO_PREVENTIVI → "Tariffario Preventivi"
 *   SP_LIST_CONTATTI_PREVENTIVI   → "Contatti Preventivi"
 *
 * Create da scripts/provision-preventivi.mjs. Le righe del preventivo stanno
 * in JSON in una colonna a più righe: sono la fotografia del documento com'era
 * quando è partito, prezzi compresi. Il tariffario può cambiare (ISTAT) senza
 * toccare il passato.
 *
 * Date "solo giorno" scritte a mezzogiorno UTC per non scavallare in nessun
 * fuso (stessa regola di lib/software/data.ts).
 */

import { graphDelete, graphGet, graphGetAll, graphPatch, graphPost } from '@/lib/core/graph'
import { PREFER_NON_INDEXED } from '@/lib/core/sp'
import {
  AMBITI,
  ELENCO_MODELLI,
  REGIMI_IVA,
  STATI_PREVENTIVO,
  UNITA,
  formattaNumero,
  type Ambito,
  type DatiPreventivo,
  type Modello,
  type Preventivo,
  type RegimeIva,
  type RigaPreventivo,
  type StatoPreventivo,
  type Tariffa,
  type Unita,
} from '@/types/preventivi'
import { totali } from './calcoli'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const L = {
  preventivi: () => process.env.SP_LIST_PREVENTIVI,
  tariffario: () => process.env.SP_LIST_TARIFFARIO_PREVENTIVI,
  contatti: () => process.env.SP_LIST_CONTATTI_PREVENTIVI,
}
type NomeLista = keyof typeof L

export function preventiviConfigurati(): boolean {
  return Boolean(process.env.SHAREPOINT_SITE_ID && L.preventivi() && L.tariffario())
}

function base(lista: NomeLista): string {
  const id = L[lista]()
  if (!id) throw new Error(`Lista SharePoint non configurata (${lista}): lancia scripts/provision-preventivi.mjs`)
  return `/sites/${SITE()}/lists/${id}/items`
}

const soloData = (d: unknown) => (typeof d === 'string' ? d.slice(0, 10) : '')
const dataOrNull = (d: unknown) => soloData(d) || null
function scriviData(d: string | null | undefined): string | null {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00Z` : null
}
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

async function tutti(lista: NomeLista): Promise<any[]> {
  return graphGetAll<any>(`${base(lista)}?$expand=fields&$top=200`, PREFER_NON_INDEXED)
}

// ============================================================
// Tariffario
// ============================================================

function mapTariffa(item: any): Tariffa {
  const f = item.fields ?? {}
  const unita = (Object.keys(UNITA) as Unita[]).includes(f.Unita) ? f.Unita : 'ora'
  const iva = (Object.keys(REGIMI_IVA) as RegimeIva[]).includes(f.RegimeIva) ? f.RegimeIva : 'iva5'
  const ambito = (AMBITI as readonly string[]).includes(f.Ambito) ? (f.Ambito as Ambito) : 'Tutti'
  return {
    spItemId: String(item.id),
    codice: String(f.Codice ?? '').trim(),
    voce: String(f.Title ?? '').trim(),
    gruppo: String(f.Gruppo ?? 'Altre prestazioni').trim(),
    unita,
    prezzo: n(f.Prezzo) ?? 0,
    bloccato: f.Bloccato === true,
    min: n(f.PrezzoMin),
    max: n(f.PrezzoMax),
    iva,
    modelli: String(f.Modelli ?? '')
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter((s): s is Modello => (ELENCO_MODELLI as string[]).includes(s)),
    ambito,
    dal: soloData(f.ValidoDal) || '2000-01-01',
    al: dataOrNull(f.ValidoAl),
    ordine: n(f.Ordine) ?? 999,
    note: String(f.Note ?? ''),
  }
}

/** Tutto il tariffario, storico compreso. */
export async function getTariffe(): Promise<Tariffa[]> {
  return (await tutti('tariffario')).map(mapTariffa).filter((t) => t.codice && t.voce)
}

export interface DatiTariffa {
  codice: string
  voce: string
  gruppo: string
  unita: Unita
  prezzo: number
  bloccato: boolean
  min: number | null
  max: number | null
  iva: RegimeIva
  modelli: Modello[]
  ambito: Ambito
  dal: string
  al: string | null
  ordine: number
  note: string
}

function campiTariffa(d: Partial<DatiTariffa>): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  if (d.voce !== undefined) c.Title = d.voce
  if (d.codice !== undefined) c.Codice = d.codice
  if (d.gruppo !== undefined) c.Gruppo = d.gruppo
  if (d.unita !== undefined) c.Unita = d.unita
  if (d.prezzo !== undefined) c.Prezzo = d.prezzo
  if (d.bloccato !== undefined) c.Bloccato = d.bloccato
  if (d.min !== undefined) c.PrezzoMin = d.min
  if (d.max !== undefined) c.PrezzoMax = d.max
  if (d.iva !== undefined) c.RegimeIva = d.iva
  if (d.modelli !== undefined) c.Modelli = d.modelli.join(';')
  if (d.ambito !== undefined) c.Ambito = d.ambito
  if (d.dal !== undefined) c.ValidoDal = scriviData(d.dal)
  if (d.al !== undefined) c.ValidoAl = scriviData(d.al)
  if (d.ordine !== undefined) c.Ordine = d.ordine
  if (d.note !== undefined) c.Note = d.note || null
  return c
}

export async function creaTariffa(d: DatiTariffa): Promise<Tariffa> {
  const res = await graphPost<any>(base('tariffario'), { fields: campiTariffa(d) })
  return mapTariffa(await graphGet<any>(`${base('tariffario')}/${res.id}?$expand=fields`))
}

/** Modifica in place: solo per i campi descrittivi. I prezzi si cambiano con `nuovoPrezzo`. */
export async function aggiornaTariffa(spItemId: string, d: Partial<DatiTariffa>): Promise<void> {
  const c = campiTariffa(d)
  if (Object.keys(c).length) await graphPatch(`${base('tariffario')}/${spItemId}/fields`, c)
}

// ============================================================
// Preventivi
// ============================================================

function leggiRighe(raw: unknown): RigaPreventivo[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as RigaPreventivo[]) : []
  } catch {
    return []
  }
}

function mapPreventivo(item: any): Preventivo {
  const f = item.fields ?? {}
  const stato = (Object.keys(STATI_PREVENTIVO) as StatoPreventivo[]).includes(f.Stato) ? (f.Stato as StatoPreventivo) : 'bozza'
  const modello = (ELENCO_MODELLI as string[]).includes(f.Modello) ? (f.Modello as Modello) : 'libero'
  return {
    spItemId: String(item.id),
    numero: f.Title && f.Title !== '(bozza)' ? String(f.Title) : '',
    anno: n(f.Anno),
    progressivo: n(f.Progressivo),
    revisione: n(f.Revisione) ?? 0,
    modello,
    ccCodice: String(f.CentroCosto ?? '').toLowerCase(),
    ccNome: String(f.CentroCostoNome ?? ''),
    cartella: String(f.Cartella ?? 'Altro'),
    ambito: (AMBITI as readonly string[]).includes(f.Ambito) ? (f.Ambito as Ambito) : 'Tutti',
    destinatario: {
      ente: String(f.EnteDestinatario ?? ''),
      nome: String(f.DestinatarioNome ?? ''),
      ruolo: String(f.DestinatarioRuolo ?? ''),
      email: String(f.DestinatarioEmail ?? ''),
    },
    beneficiario: String(f.Beneficiario ?? ''),
    oggetto: String(f.Oggetto ?? ''),
    tipoProgetto: String(f.TipoProgetto ?? ''),
    ripartizione: String(f.Ripartizione ?? ''),
    dal: soloData(f.PeriodoDal),
    al: soloData(f.PeriodoAl),
    righe: leggiRighe(f.Righe),
    note: String(f.Note ?? ''),
    stato,
    totaleMensile: n(f.TotaleMensile) ?? 0,
    creatoDa: String(f.CreatoDa ?? ''),
    creatoDaNome: String(f.CreatoDaNome ?? ''),
    creatoIl: String(item.createdDateTime ?? ''),
    emessoIl: dataOrNull(f.EmessoIl),
    esitoIl: dataOrNull(f.EsitoIl),
    esitoDa: String(f.EsitoDa ?? ''),
    notaEsito: String(f.NotaEsito ?? ''),
    pdfUrl: String(f.PdfUrl ?? ''),
    precedenteId: String(f.PrecedenteId ?? ''),
    ultimoSollecito: typeof f.UltimoSollecito === 'string' ? f.UltimoSollecito : null,
  }
}

export async function getPreventivi(): Promise<Preventivo[]> {
  const righe = (await tutti('preventivi')).map(mapPreventivo)
  return righe.sort((a, b) => (b.creatoIl || '').localeCompare(a.creatoIl || ''))
}

export async function getPreventivo(spItemId: string): Promise<Preventivo | null> {
  if (!/^\d+$/.test(spItemId)) return null
  try {
    return mapPreventivo(await graphGet<any>(`${base('preventivi')}/${spItemId}?$expand=fields`))
  } catch (e) {
    if (String(e).includes('(404)')) return null
    throw e
  }
}

function campiDati(d: DatiPreventivo, ccNome: string): Record<string, unknown> {
  return {
    Modello: d.modello,
    CentroCosto: d.ccCodice,
    CentroCostoNome: ccNome || null,
    Cartella: d.cartella,
    Ambito: d.ambito,
    EnteDestinatario: d.destinatario.ente || null,
    DestinatarioNome: d.destinatario.nome || null,
    DestinatarioRuolo: d.destinatario.ruolo || null,
    DestinatarioEmail: d.destinatario.email || null,
    Beneficiario: d.beneficiario || null,
    Oggetto: d.oggetto || null,
    TipoProgetto: d.tipoProgetto || null,
    Ripartizione: d.ripartizione || null,
    PeriodoDal: scriviData(d.dal),
    PeriodoAl: scriviData(d.al),
    Righe: JSON.stringify(d.righe),
    TotaleMensile: totali(d.righe, d.dal, d.al).mensileIvato,
    Note: d.note || null,
  }
}

export async function creaPreventivo(
  d: DatiPreventivo,
  ccNome: string,
  autore: { email: string; nome: string },
  precedenteId?: string,
): Promise<Preventivo> {
  const res = await graphPost<any>(base('preventivi'), {
    fields: {
      Title: '(bozza)',
      ...campiDati(d, ccNome),
      Stato: 'bozza',
      Revisione: 0,
      CreatoDa: autore.email,
      CreatoDaNome: autore.nome || null,
      PrecedenteId: precedenteId || null,
    },
  })
  return (await getPreventivo(String(res.id)))!
}

export async function salvaDati(spItemId: string, d: DatiPreventivo, ccNome: string): Promise<Preventivo> {
  await graphPatch(`${base('preventivi')}/${spItemId}/fields`, campiDati(d, ccNome))
  return (await getPreventivo(spItemId))!
}

export async function aggiornaCampi(spItemId: string, campi: Record<string, unknown>): Promise<void> {
  await graphPatch(`${base('preventivi')}/${spItemId}/fields`, campi)
}

export async function eliminaPreventivo(spItemId: string): Promise<void> {
  await graphDelete(`${base('preventivi')}/${spItemId}`)
}

export const campiStato = {
  emesso: (numero: string, anno: number, progressivo: number, revisione: number) => ({
    Title: numero,
    Anno: anno,
    Progressivo: progressivo,
    Revisione: revisione,
    Stato: 'emesso',
    EmessoIl: new Date().toISOString(),
    UltimoSollecito: null,
  }),
  esito: (stato: 'accettato' | 'rifiutato', data: string, da: string, nota: string) => ({
    Stato: stato,
    EsitoIl: scriviData(data),
    EsitoDa: da,
    NotaEsito: nota || null,
  }),
}

// ============================================================
// Numerazione: PR-001/2026, riparte ogni anno
// ============================================================

/**
 * Coda delle assegnazioni di numero dentro la stessa istanza: SharePoint non
 * impone l'unicità del Title (stessa scelta e stesso limite di Inventario).
 */
let coda: Promise<unknown> = Promise.resolve()
export function inCoda<T>(fn: () => Promise<T>): Promise<T> {
  const next = coda.then(fn, fn)
  coda = next.catch(() => undefined)
  return next
}

export async function prossimoNumero(anno: number): Promise<{ numero: string; progressivo: number }> {
  const righe = await tutti('preventivi')
  let max = 0
  for (const it of righe) {
    const f = it.fields ?? {}
    if (Number(f.Anno) === anno && Number(f.Progressivo) > max) max = Number(f.Progressivo)
  }
  const progressivo = max + 1
  return { numero: formattaNumero(progressivo, anno), progressivo }
}

// ============================================================
// Contatti (assistenti sociali, NPI, referenti)
// ============================================================

export interface Contatto {
  spItemId: string
  nome: string
  ruolo: string
  ente: string
  email: string
}

export async function getContatti(): Promise<Contatto[]> {
  if (!L.contatti()) return []
  try {
    return (await tutti('contatti'))
      .map((it) => ({
        spItemId: String(it.id),
        nome: String(it.fields?.Title ?? '').trim(),
        ruolo: String(it.fields?.Ruolo ?? ''),
        ente: String(it.fields?.Ente ?? ''),
        email: String(it.fields?.Email ?? ''),
      }))
      .filter((c) => c.nome)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  } catch (e) {
    console.error('[preventivi] contatti non letti:', e)
    return []
  }
}

/**
 * La rubrica si riempie da sola: a ogni emissione il destinatario, se nuovo,
 * finisce fra i contatti; se c'era, se ne aggiornano ruolo ed email.
 * Non fa mai fallire l'emissione.
 */
export async function ricordaContatto(d: DatiPreventivo['destinatario']): Promise<void> {
  if (!L.contatti() || !d.nome) return
  try {
    const chiave = (s: string) => s.trim().toLowerCase()
    const esistente = (await getContatti()).find((c) => chiave(c.nome) === chiave(d.nome) && chiave(c.ente) === chiave(d.ente))
    const campi = { Title: d.nome, Ruolo: d.ruolo || null, Ente: d.ente || null, Email: d.email || null }
    if (!esistente) await graphPost(base('contatti'), { fields: campi })
    else if (esistente.ruolo !== d.ruolo || esistente.email !== d.email) {
      await graphPatch(`${base('contatti')}/${esistente.spItemId}/fields`, campi)
    }
  } catch (e) {
    console.error('[preventivi] contatto non salvato:', e)
  }
}
