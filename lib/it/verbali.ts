/**
 * Verbali di consegna e di restituzione: caricamento del PDF firmato.
 *
 * Due cartelle fisse alla radice della libreria dell'inventario — "Verbali
 * Consegna" e "Verbali Restituzione" — e **nessuna sottocartella per bene**: il
 * codice di inventario sta nel nome del file, così i verbali si trovano per
 * numero anche cercando direttamente da SharePoint.
 *
 *   Verbali Consegna/INV-0012 - verbale consegna - 2026-08-20 - Rossi Mario.pdf
 *
 * Il caricamento è diretto browser → SharePoint (`lib/core/upload-diretto`): il
 * server apre solo la sessione, i byte non passano da Vercel.
 *
 * La generazione del documento da firmare arriverà quando avremo il modello in
 * uso in cooperativa; qui c'è la metà che non dipende dal modello.
 *
 * Nota: la risoluzione della cartella è scritta qui e non presa da
 * `lib/inventario/data.ts` perché è un'altra cosa — là le cartelle sono una per
 * bene e nascono col bene, qui sono due e stanno ferme.
 */

import { graphGetOrNull, graphPost } from '@/lib/core/graph'
import { CARTELLE_VERBALI, type Assegnazione, type TipoVerbale } from '@/types/it'

const SITE = () => process.env.SHAREPOINT_SITE_ID!

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

function sanitizeNome(s: string, fallback = 'verbale'): string {
  const pulito = (s || fallback)
    .replace(/[\\/:*?"<>|#%~&{}]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
  return (pulito || fallback).slice(0, 120)
}

let _driveId: string | null = null
async function getDriveId(): Promise<string> {
  if (process.env.SP_INVENTARIO_DRIVE_ID) return process.env.SP_INVENTARIO_DRIVE_ID
  if (_driveId) return _driveId
  // Ripiego sulla libreria predefinita del sito, come fa lib/inventario/data.ts.
  const d = await graphGetOrNull<{ id: string }>(`/sites/${SITE()}/drive?$select=id`)
  if (!d?.id) throw new Error('Libreria documenti dell’inventario non trovata.')
  return (_driveId = d.id)
}

/** Crea la cartella dei verbali se manca. Idempotente. */
async function assicuraCartella(driveId: string, nome: string): Promise<void> {
  const esiste = await graphGetOrNull<{ id: string }>(
    `/drives/${driveId}/root:/${encodePath(nome)}?$select=id`,
  )
  if (esiste) return
  await graphPost(`/drives/${driveId}/root/children`, {
    name: nome,
    folder: {},
    '@microsoft.graph.conflictBehavior': 'fail',
  }).catch(async (err) => {
    const ancora = await graphGetOrNull<{ id: string }>(
      `/drives/${driveId}/root:/${encodePath(nome)}?$select=id`,
    )
    if (!ancora) throw err
  })
}

/**
 * Nome del file: codice, tipo, data, persona. In quest'ordine perché l'elenco
 * della cartella, ordinato per nome, viene raggruppato per bene.
 */
export function nomeVerbale(
  a: Assegnazione,
  tipo: TipoVerbale,
  filenameOriginale: string,
): string {
  const est = (filenameOriginale.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '.pdf').toLowerCase()
  const data = String(tipo === 'consegna' ? a.dataAssegnazione : a.dataFine ?? '').slice(0, 10)
  const chi = a.assegnatarioNome || a.assegnatarioMail?.split('@')[0] || 'in condivisione'
  const parti = [a.oggettoEtichetta || 'senza codice', `verbale ${tipo}`, data, chi].filter(Boolean)
  return sanitizeNome(parti.join(' - ')) + est
}

/**
 * Il nome del file arriva da `nomeVerbale`, quindi è già ripulito e già
 * troncato. Risanificarlo qui lo accorcerebbe una seconda volta mangiandosi
 * l'estensione, e il file caricato non si troverebbe più: si controlla solo che
 * nessuno abbia infilato un percorso.
 */
function nomeSicuro(nomeFile: string): string {
  const solo = nomeFile.split(/[\\/]/).pop() ?? ''
  if (!solo || solo.startsWith('.')) throw new Error('Nome del verbale non valido.')
  return solo
}

/**
 * Apre la sessione di upload del verbale firmato e ritorna l'URL
 * pre-autorizzato per il PUT diretto dal browser.
 *
 * ⚠️ L'`uploadUrl` è una credenziale a tempo: non loggarlo.
 */
export async function creaSessioneVerbale(
  a: Assegnazione,
  tipo: TipoVerbale,
  filename: string,
): Promise<{ uploadUrl: string; scadeIl: string; nomeFile: string }> {
  const driveId = await getDriveId()
  const cartella = CARTELLE_VERBALI[tipo]
  await assicuraCartella(driveId, cartella)
  const nomeFile = nomeVerbale(a, tipo, filename)

  const res = await graphPost<{ uploadUrl: string; expirationDateTime: string }>(
    `/drives/${driveId}/root:/${encodePath(`${cartella}/${nomeFile}`)}:/createUploadSession`,
    { item: { '@microsoft.graph.conflictBehavior': 'replace', name: nomeFile } },
  )
  return { uploadUrl: res.uploadUrl, scadeIl: res.expirationDateTime, nomeFile }
}

/** Ritrova il file appena caricato, per registrarne l'indirizzo sull'assegnazione. */
export async function trovaVerbale(
  tipo: TipoVerbale,
  nomeFile: string,
): Promise<{ url: string; nome: string }> {
  const driveId = await getDriveId()
  const safe = nomeSicuro(nomeFile)
  const file = await graphGetOrNull<{ webUrl: string; name: string }>(
    `/drives/${driveId}/root:/${encodePath(`${CARTELLE_VERBALI[tipo]}/${safe}`)}?$select=webUrl,name`,
  )
  if (!file) throw new Error('Verbale non trovato su SharePoint: riprova il caricamento.')
  return { url: file.webUrl, nome: file.name ?? safe }
}
