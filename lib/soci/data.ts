/**
 * Domande di ammissione socio — la lista SharePoint "Domande Ammissione Soci".
 *
 * Sta sul sito Risorse Umane (SP_SITE_RU), accanto alla lista Dipendenti, ed è
 * il posto dove "l'app tiene da parte" i dati del modulo fra la compilazione e
 * il caricamento del PDF firmato (Dennis, 29/10/2026).
 *
 * Colonne (create da scripts/provision-soci.mjs):
 *   Title                 "COGNOME NOME"
 *   EmailRichiedente      account con cui la persona è entrata nell'app
 *   RUItemId              spItemId della sua scheda nella lista Dipendenti
 *   Stato                 In attesa di firma | Firmata | Registrata
 *   Dati                  JSON del modulo (DatiDomanda)
 *   DataDomanda           la data stampata sul modulo
 *   NumeroElencoGenerale  assegnato alla registrazione, mai prima
 *   DomandaUrl/DomandaNome  il PDF firmato in AMMISSIONI SOCI
 *   SchedaUrl             la scheda progressiva per Claudia
 *   DataRegistrazione
 *   Esito                 note della registrazione (differenze, avvisi, errori)
 *
 * ⚠️ IDENTITÀ: si scrive con l'identità dell'APP (`graphApplicativo`), non con
 * quella dell'utente come nel resto dell'area RU. Chi compila la domanda non fa
 * parte del gruppo Risorse Umane e col suo token SharePoint gli negherebbe
 * tutto. Scelta di Dennis del 29/10/2026 ("A, automatico"): il nome reale resta
 * nel Log Attività dell'app e nella colonna EmailRichiedente.
 */

import { graphApplicativo, type GraphClient } from '@/lib/core/graph-delegato'
import { DATI_VUOTI, normalizzaDati, type DatiDomanda, type Domanda, type StatoDomanda } from '@/types/soci'

const SITE = () => process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID!

export function sociConfigurato(): boolean {
  return !!process.env.SP_LIST_DOMANDE_SOCI
}

function listBase(): string {
  const id = process.env.SP_LIST_DOMANDE_SOCI
  if (!id) throw new Error('Lista "Domande Ammissione Soci" non configurata (SP_LIST_DOMANDE_SOCI): lancia scripts/provision-soci.mjs')
  return `/sites/${SITE()}/lists/${id}/items`
}

/** Il client con cui lavora tutta la sezione: vedi la nota sull'identità in testa. */
export const graphSoci = (): GraphClient => graphApplicativo()

const CAMPI = [
  'Title', 'EmailRichiedente', 'RUItemId', 'Stato', 'Dati', 'DataDomanda', 'NumeroElencoGenerale',
  'DomandaUrl', 'DomandaNome', 'SchedaUrl', 'DataRegistrazione', 'Esito',
]
const SELECT = `id,fields&$expand=fields($select=${CAMPI.join(',')})`
const PREFER = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

export interface DomandaInterna extends Domanda {
  email: string
  ruItemId: string
  esito: string
}

function leggiDati(raw: unknown): DatiDomanda {
  if (typeof raw !== 'string' || !raw) return { ...DATI_VUOTI }
  try {
    return { ...DATI_VUOTI, ...normalizzaDati(JSON.parse(raw)) }
  } catch {
    return { ...DATI_VUOTI }
  }
}

function mappa(it: any): DomandaInterna {
  const f = it.fields ?? {}
  const n = Number(f.NumeroElencoGenerale)
  return {
    spItemId: String(it.id),
    stato: (f.Stato as StatoDomanda) || 'In attesa di firma',
    dati: leggiDati(f.Dati),
    numeroElencoGenerale: f.NumeroElencoGenerale != null && Number.isFinite(n) ? n : null,
    dataDomanda: f.DataDomanda ? String(f.DataDomanda).slice(0, 10) : null,
    domandaUrl: f.DomandaUrl ?? null,
    domandaNome: f.DomandaNome ?? null,
    schedaUrl: f.SchedaUrl ?? null,
    email: String(f.EmailRichiedente ?? '').toLowerCase(),
    ruItemId: String(f.RUItemId ?? ''),
    esito: f.Esito ?? '',
  }
}

/** Per il browser: niente email, niente id della scheda RU, niente note interne. */
export function perIlBrowser(d: DomandaInterna): Domanda {
  const { email: _e, ruItemId: _r, esito: _x, ...resto } = d
  return resto
}

export async function tutteLeDomande(g: GraphClient): Promise<DomandaInterna[]> {
  const out: DomandaInterna[] = []
  let url: string | null = `${listBase()}?$select=${SELECT}&$top=500`
  while (url) {
    const res: { value: any[]; '@odata.nextLink'?: string } = await g.get(url, PREFER)
    out.push(...res.value.map(mappa))
    const next = res['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

export async function getDomanda(g: GraphClient, id: string): Promise<DomandaInterna | null> {
  const it = await g.getOrNull<any>(`${listBase()}/${encodeURIComponent(id)}?$select=${SELECT}`)
  return it ? mappa(it) : null
}

/** L'ultima domanda di questa persona (la più recente), registrata o no. */
export async function domandaDi(g: GraphClient, email: string): Promise<DomandaInterna | null> {
  const em = email.trim().toLowerCase()
  const sue = (await tutteLeDomande(g)).filter((d) => d.email === em)
  sue.sort((a, b) => Number(b.spItemId) - Number(a.spItemId))
  return sue[0] ?? null
}

export async function creaDomanda(
  g: GraphClient,
  input: { email: string; ruItemId: string; dati: DatiDomanda; dataDomanda: string },
): Promise<DomandaInterna> {
  const res = await g.post<{ id: string }>(listBase(), {
    fields: {
      Title: `${input.dati.cognome} ${input.dati.nome}`.trim() || 'Senza nome',
      EmailRichiedente: input.email.toLowerCase(),
      RUItemId: input.ruItemId,
      Stato: 'In attesa di firma',
      Dati: JSON.stringify(input.dati),
      DataDomanda: `${input.dataDomanda}T12:00:00Z`,
    },
  })
  return (await getDomanda(g, res.id))!
}

export async function aggiornaDomanda(
  g: GraphClient,
  id: string,
  campi: Partial<{
    dati: DatiDomanda
    dataDomanda: string
    stato: StatoDomanda
    numero: number
    domandaUrl: string
    domandaNome: string
    schedaUrl: string
    registrata: boolean
    esito: string
  }>,
): Promise<DomandaInterna> {
  const f: Record<string, unknown> = {}
  if (campi.dati) {
    f.Dati = JSON.stringify(campi.dati)
    f.Title = `${campi.dati.cognome} ${campi.dati.nome}`.trim() || 'Senza nome'
  }
  if (campi.dataDomanda) f.DataDomanda = `${campi.dataDomanda}T12:00:00Z`
  if (campi.stato) f.Stato = campi.stato
  if (campi.numero != null) f.NumeroElencoGenerale = campi.numero
  if (campi.domandaUrl != null) f.DomandaUrl = campi.domandaUrl
  if (campi.domandaNome != null) f.DomandaNome = campi.domandaNome
  if (campi.schedaUrl != null) f.SchedaUrl = campi.schedaUrl
  if (campi.registrata) f.DataRegistrazione = new Date().toISOString()
  if (campi.esito != null) f.Esito = campi.esito.slice(0, 60_000)
  if (Object.keys(f).length) {
    await g.patch(`${listBase()}/${encodeURIComponent(id)}/fields`, f)
  }
  return (await getDomanda(g, id))!
}
