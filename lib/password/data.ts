/**
 * CRUD sulla SharePoint List "Gestione Password" via Microsoft Graph.
 *
 * Archivio condiviso delle credenziali della cooperativa. Chi ha il permesso
 * "Amministrazione" vede tutto: è una cassaforte unica, non una cassetta per
 * ciascuno (decisione del 15 set 2026).
 *
 * Convenzioni SP (vedi lib/core/sp.ts):
 *   - Title = nome della voce ("a cosa serve questa credenziale")
 *   - Choice (Categoria) si legge/scrive come stringa
 *   - Date "solo giorno" scritte a mezzogiorno UTC per non scavallare la
 *     mezzanotte in nessun fuso (stesso accorgimento di lib/software/data.ts)
 *
 * Le due date NON sono campi del form: le mette il server.
 *   - DataInserimento: oggi, alla creazione. Non si tocca più.
 *   - UltimaModificaPassword: oggi, ma **solo quando la password cambia davvero**.
 *     Per saperlo bisogna rileggere la riga prima di scriverla: se si aggiornasse
 *     a ogni salvataggio, correggere un numero di telefono farebbe sembrare la
 *     password appena cambiata, e la segnalazione "da cambiare" non direbbe più
 *     niente. È il motivo per cui `aggiornaVoce` fa una GET in più.
 *
 * GUID lista in env: SP_LIST_PASSWORD (creato da scripts/provision-password.mjs)
 */

import { graphGet, graphPost, graphPatch, graphDelete } from '@/lib/core/graph'
import type { VocePassword, VocePasswordInput } from '@/types/password'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const LIST = () => process.env.SP_LIST_PASSWORD!
const listBase = () => `/sites/${SITE()}/lists/${LIST()}/items`

const PREFER_NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

const CAMPI =
  'id,fields&$expand=fields($select=Title,Categoria,NomeUtente,Password,Pin,LinkSito,TelefonoVerifica,DataInserimento,UltimaModificaPassword,Note)'

/**
 * L'unico punto in cui il valore riservato entra in memoria dall'archivio.
 *
 * Oggi è l'identità: la password su SharePoint sta in chiaro. Esiste comunque,
 * insieme alla gemella `scriviSegreto`, perché il giorno in cui si decidesse di
 * cifrare l'archivio queste due funzioni sarebbero l'unica cosa da cambiare —
 * niente route, niente schermata, niente migrazione del resto del codice.
 */
function leggiSegreto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Gemella di `leggiSegreto`: l'unico punto in cui il valore riservato esce verso l'archivio. */
function scriviSegreto(v: string): string | null {
  return v || null
}

function soloData(d?: string): string {
  return (d ?? '').slice(0, 10)
}

/** Date "solo giorno": si scrivono a mezzogiorno UTC per non perdere un giorno tra i fusi */
function toGraphDateOnly(d?: string | null): string | null {
  if (!d) return null
  const giorno = d.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(giorno) ? `${giorno}T12:00:00Z` : null
}

/** Oggi in formato YYYY-MM-DD, ora italiana */
function oggi(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
}

function mapVoce(item: any): VocePassword {
  const f = item.fields ?? {}
  return {
    spItemId: item.id,
    nome: f.Title ?? '',
    categoria: f.Categoria ?? '',
    nomeUtente: f.NomeUtente ?? '',
    password: leggiSegreto(f.Password),
    pin: leggiSegreto(f.Pin),
    linkSito: f.LinkSito ?? '',
    telefonoVerifica: f.TelefonoVerifica ?? '',
    dataInserimento: soloData(f.DataInserimento) || undefined,
    ultimaModificaPassword: soloData(f.UltimaModificaPassword) || undefined,
    note: f.Note ?? '',
  }
}

// ============================================================
// Lettura
// ============================================================

/** Tutte le voci, in ordine alfabetico: l'archivio si consulta cercando un nome. */
export async function getVociPassword(): Promise<VocePassword[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase()}?$select=${CAMPI}&$orderby=fields/Title asc&$top=500`,
    PREFER_NON_INDEXED,
  )
  return res.value.map(mapVoce)
}

/** Singola voce per ID riga SP */
export async function getVocePassword(spItemId: string): Promise<VocePassword> {
  const item = await graphGet<any>(
    `/sites/${SITE()}/lists/${LIST()}/items/${spItemId}?$select=${CAMPI}`,
  )
  return mapVoce(item)
}

// ============================================================
// Scrittura
// ============================================================

/**
 * Normalizza il corpo JSON che arriva dal form.
 *
 * Sta qui e non nelle route perché le due route (POST e PATCH) devono leggere
 * l'input nello stesso identico modo: quando questa funzione stava nelle route
 * in Software è finita duplicata, ed è il genere di copia che diverge di un
 * `.trim()`. Da un file di route Next.js non si può nemmeno esportarla: accetta
 * solo gli handler HTTP.
 *
 * ⚠️ Password e PIN non si trimmano: uno spazio in testa o in coda può farne parte.
 */
export function parseInputPassword(body: Record<string, any>): VocePasswordInput {
  return {
    nome: (body.nome ?? '').trim(),
    categoria: (body.categoria ?? '').trim(),
    nomeUtente: (body.nomeUtente ?? '').trim(),
    password: typeof body.password === 'string' ? body.password : '',
    pin: typeof body.pin === 'string' ? body.pin : '',
    linkSito: (body.linkSito ?? '').trim(),
    telefonoVerifica: (body.telefonoVerifica ?? '').trim(),
    note: (body.note ?? '').trim(),
  }
}

/** Campi SP comuni a creazione e aggiornamento (le date restano fuori: le decide il chiamante) */
function buildFields(input: VocePasswordInput): Record<string, unknown> {
  return {
    Title: input.nome,
    Categoria: input.categoria || null,
    NomeUtente: input.nomeUtente || null,
    Password: scriviSegreto(input.password),
    Pin: scriviSegreto(input.pin),
    LinkSito: input.linkSito || null,
    TelefonoVerifica: input.telefonoVerifica || null,
    Note: input.note || null,
  }
}

export async function creaVocePassword(input: VocePasswordInput): Promise<VocePassword> {
  const giorno = oggi()
  const res = await graphPost<any>(listBase(), {
    fields: {
      ...buildFields(input),
      DataInserimento: toGraphDateOnly(giorno),
      // Se la voce nasce già con una password, il suo "ultimo cambio" è oggi.
      UltimaModificaPassword: input.password ? toGraphDateOnly(giorno) : null,
    },
  })
  return getVocePassword(res.id)
}

/**
 * Aggiorna una voce. Tocca `UltimaModificaPassword` **solo** se la password è
 * davvero cambiata (vedi nota in testa al file): per questo rilegge la riga prima.
 */
export async function aggiornaVocePassword(
  spItemId: string,
  input: VocePasswordInput,
): Promise<VocePassword> {
  const prima = await getVocePassword(spItemId)
  const cambiata = input.password !== prima.password

  await graphPatch(`/sites/${SITE()}/lists/${LIST()}/items/${spItemId}/fields`, {
    ...buildFields(input),
    // DataInserimento non compare: è la data di nascita della voce, non si riscrive.
    ...(cambiata
      ? { UltimaModificaPassword: input.password ? toGraphDateOnly(oggi()) : null }
      : {}),
  })
  return getVocePassword(spItemId)
}

export async function eliminaVocePassword(spItemId: string): Promise<void> {
  await graphDelete(`${listBase()}/${spItemId}`)
}
