/**
 * Anagrafica Clienti — lista SharePoint "Clienti" sul sito Controllo Gestione.
 *
 * Variabile d'ambiente:
 *   SP_LIST_CLIENTI   id della lista — lo stampa `scripts/provision-clienti.mjs`
 *
 * **Perché tutta la lista in memoria.** Sono ~725 righe e la ricerca deve
 * rispondere mentre si scrive: interrogare Graph a ogni tasto premuto sarebbe
 * mezzo secondo per lettera. Quindi si legge tutta una volta e si tiene in una
 * cache di modulo per qualche minuto. La cache muore col processo serverless,
 * e ogni scrittura la invalida: non c'è modo di leggere un dato che l'app ha
 * appena cambiato.
 *
 * Se un giorno i clienti diventassero decine di migliaia, questa è la funzione
 * da sostituire con una ricerca lato server — non il resto dell'area.
 */

import { graphGet, graphPatch, graphPost } from '@/lib/core/graph'
import { chiaveCliente, indiceDa, type Cliente, type ClienteIndice } from '@/types/clienti'
import type { TipoSoggetto } from '@/types/fatture'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const LIST = () => process.env.SP_LIST_CLIENTI!
const listBase = () => `/sites/${SITE()}/lists/${LIST()}/items`

const PREFER_NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

/** true se la lista è configurata. Senza, la ricerca non c'è ma il modulo funziona. */
export function clientiConfigurato(): boolean {
  return Boolean(process.env.SHAREPOINT_SITE_ID && process.env.SP_LIST_CLIENTI)
}

const CAMPI =
  'Title,Cognome,Nome,TipoSoggetto,Indirizzo,Comune,Cap,Provincia,Nazione,PartitaIVA,' +
  'CodiceFiscale,CodiceEstero,Cellulare,Telefono,Email,Pec,CodiceSdi,CodiceIpa,' +
  'Scadenza,TipoPagamento,AddebitoBollo'

function mapCliente(item: any): Cliente {
  const f = item.fields ?? {}
  return {
    spItemId: String(item.id),
    denominazione: f.Title ?? '',
    cognome: f.Cognome ?? '',
    nome: f.Nome ?? '',
    tipoSoggetto: (f.TipoSoggetto ?? '') as TipoSoggetto | '',
    indirizzo: f.Indirizzo ?? '',
    comune: f.Comune ?? '',
    cap: f.Cap ?? '',
    provincia: f.Provincia ?? '',
    nazione: f.Nazione ?? '',
    partitaIva: f.PartitaIVA ?? '',
    codiceFiscale: f.CodiceFiscale ?? '',
    codiceEstero: f.CodiceEstero ?? '',
    cellulare: f.Cellulare ?? '',
    telefono: f.Telefono ?? '',
    email: f.Email ?? '',
    pec: f.Pec ?? '',
    codiceSdi: f.CodiceSdi ?? '',
    codiceIpa: f.CodiceIpa ?? '',
    scadenza: f.Scadenza ?? '',
    tipoPagamento: f.TipoPagamento ?? '',
    addebitoBollo: f.AddebitoBollo ?? '',
  }
}

// ============================================================
// Cache
// ============================================================

const DURATA_CACHE = 10 * 60 * 1000
let cache: { clienti: Cliente[]; scade: number } | null = null
/** Caricamento in corso: due richieste contemporanee non leggono due volte. */
let inCorso: Promise<Cliente[]> | null = null

export function svuotaCacheClienti(): void {
  cache = null
}

/**
 * Tutti i clienti. Graph pagina i risultati (200 per volta): senza seguire
 * `@odata.nextLink` si otterrebbero solo i primi 200 e la ricerca sembrerebbe
 * funzionare, mancando in silenzio due terzi dell'anagrafica.
 */
async function leggiTutti(): Promise<Cliente[]> {
  const clienti: Cliente[] = []
  let url: string | undefined =
    `${listBase()}?$select=id&$expand=fields($select=${CAMPI})&$top=500`

  while (url) {
    const res: any = await graphGet<any>(url, PREFER_NON_INDEXED)
    for (const item of res.value ?? []) clienti.push(mapCliente(item))
    const next: string | undefined = res['@odata.nextLink']
    // graphGet vuole un percorso relativo, Graph restituisce l'URL completo.
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : undefined
  }
  return clienti
}

export async function caricaClienti(): Promise<Cliente[]> {
  if (!clientiConfigurato()) return []
  if (cache && cache.scade > Date.now()) return cache.clienti
  if (inCorso) return inCorso

  inCorso = leggiTutti()
    .then((clienti) => {
      cache = { clienti, scade: Date.now() + DURATA_CACHE }
      return clienti
    })
    .catch((err) => {
      console.error('[clienti] lettura fallita, si prosegue senza anagrafica:', err)
      return []
    })
    .finally(() => {
      inCorso = null
    })

  return inCorso
}

// ============================================================
// Letture
// ============================================================

/** Righe leggere per la ricerca nel modulo, in ordine alfabetico. */
export async function getIndiceClienti(): Promise<ClienteIndice[]> {
  const clienti = await caricaClienti()
  return clienti
    .map(indiceDa)
    .sort((a, b) => a.d.localeCompare(b.d, 'it'))
}

export async function getCliente(id: string): Promise<Cliente | null> {
  const clienti = await caricaClienti()
  return clienti.find((c) => c.spItemId === String(id)) ?? null
}

/**
 * Cliente con la stessa partita IVA o lo stesso codice fiscale.
 *
 * Serve quando chi compila scrive i dati a mano senza usare la ricerca: senza
 * questo controllo l'anagrafica si riempirebbe di doppioni dello stesso cliente.
 * Attenzione: nell'elenco importato esistono enti diversi che condividono la
 * partita IVA (uffici dello stesso comune, dipartimenti universitari), quindi
 * qui si ritorna il **primo** e la scelta consapevole resta quella fatta con la
 * ricerca.
 */
export async function trovaClientePerCodici(
  partitaIva: string,
  codiceFiscale: string,
): Promise<Cliente | null> {
  const chiave = chiaveCliente({ partitaIva, codiceFiscale })
  if (!chiave) return null
  const clienti = await caricaClienti()
  return clienti.find((c) => chiaveCliente(c) === chiave) ?? null
}

// ============================================================
// Scritture
// ============================================================

/** I campi che una richiesta di fattura sa dire di un cliente. */
export interface DatiCliente {
  denominazione: string
  cognome: string
  nome: string
  tipoSoggetto: string
  indirizzo: string
  comune: string
  cap: string
  provincia: string
  nazione: string
  partitaIva: string
  codiceFiscale: string
  telefono: string
  email: string
  pec: string
  codiceSdi: string
}

function fieldsDa(d: DatiCliente): Record<string, string> {
  return {
    Title: d.denominazione,
    Cognome: d.cognome,
    Nome: d.nome,
    TipoSoggetto: d.tipoSoggetto,
    Indirizzo: d.indirizzo,
    Comune: d.comune,
    Cap: d.cap,
    Provincia: d.provincia,
    Nazione: d.nazione,
    PartitaIVA: d.partitaIva,
    CodiceFiscale: d.codiceFiscale,
    Telefono: d.telefono,
    Email: d.email,
    Pec: d.pec,
    CodiceSdi: d.codiceSdi,
  }
}

/** Quali campi del cliente cambierebbero, e come. Vuoto = nulla da fare. */
export function differenze(
  vecchio: Cliente,
  nuovo: DatiCliente,
): Array<{ campo: string; da: string; a: string }> {
  const confronta: Array<[string, string, string]> = [
    ['Denominazione', vecchio.denominazione, nuovo.denominazione],
    ['Cognome', vecchio.cognome, nuovo.cognome],
    ['Nome', vecchio.nome, nuovo.nome],
    ['Tipologia', vecchio.tipoSoggetto, nuovo.tipoSoggetto],
    ['Indirizzo', vecchio.indirizzo, nuovo.indirizzo],
    ['Comune', vecchio.comune, nuovo.comune],
    ['CAP', vecchio.cap, nuovo.cap],
    ['Provincia', vecchio.provincia, nuovo.provincia],
    ['Nazione', vecchio.nazione, nuovo.nazione],
    ['Partita IVA', vecchio.partitaIva, nuovo.partitaIva],
    ['Codice fiscale', vecchio.codiceFiscale, nuovo.codiceFiscale],
    ['Telefono', vecchio.telefono, nuovo.telefono],
    ['Email', vecchio.email, nuovo.email],
    ['PEC', vecchio.pec, nuovo.pec],
    ['Codice SDI', vecchio.codiceSdi, nuovo.codiceSdi],
  ]
  return confronta
    .filter(([, da, a]) => {
      // Un campo lasciato vuoto nella richiesta non cancella quello in
      // anagrafica: chi compila una fattura non sta dichiarando che il vecchio
      // telefono non esiste più, semplicemente non l'ha scritto.
      if (!String(a ?? '').trim()) return false
      return String(da ?? '').trim() !== String(a).trim()
    })
    .map(([campo, da, a]) => ({ campo, da: da || '(vuoto)', a }))
}

/**
 * Crea il cliente se non c'è, aggiorna i campi cambiati se c'è già.
 *
 * Ritorna il cliente e cosa è successo, perché la richiesta di fattura lo
 * riporta nella mail: chi emette la fattura deve sapere se l'anagrafica è
 * cambiata sotto i suoi occhi.
 */
export async function salvaCliente(
  dati: DatiCliente,
  clienteIdScelto?: string,
): Promise<{
  cliente: Cliente
  esito: 'creato' | 'aggiornato' | 'invariato'
  cambiati: Array<{ campo: string; da: string; a: string }>
}> {
  const esistente = clienteIdScelto
    ? await getCliente(clienteIdScelto)
    : await trovaClientePerCodici(dati.partitaIva, dati.codiceFiscale)

  if (!esistente) {
    const creato = await graphPost<{ id: string }>(listBase(), { fields: fieldsDa(dati) })
    svuotaCacheClienti()
    return {
      cliente: mapCliente({ id: creato.id, fields: fieldsDa(dati) }),
      esito: 'creato',
      cambiati: [],
    }
  }

  const cambiati = differenze(esistente, dati)
  if (!cambiati.length) return { cliente: esistente, esito: 'invariato', cambiati: [] }

  // Si aggiornano solo i campi valorizzati nella richiesta: vedi § differenze.
  const patch: Record<string, string> = {}
  for (const [k, v] of Object.entries(fieldsDa(dati))) {
    if (String(v ?? '').trim()) patch[k] = v
  }
  await graphPatch(`${listBase()}/${esistente.spItemId}`, { fields: patch })
  svuotaCacheClienti()

  // Si riparte dalla riga esistente e si sovrascrivono solo i campi mandati:
  // ricostruirla da `patch` con mapCliente azzererebbe cellulare, codice IPA,
  // pagamento e tutto ciò che il modulo non conosce.
  const aggiornato: Cliente = {
    ...esistente,
    denominazione: patch.Title ?? esistente.denominazione,
    cognome: patch.Cognome ?? esistente.cognome,
    nome: patch.Nome ?? esistente.nome,
    tipoSoggetto: (patch.TipoSoggetto as TipoSoggetto) ?? esistente.tipoSoggetto,
    indirizzo: patch.Indirizzo ?? esistente.indirizzo,
    comune: patch.Comune ?? esistente.comune,
    cap: patch.Cap ?? esistente.cap,
    provincia: patch.Provincia ?? esistente.provincia,
    nazione: patch.Nazione ?? esistente.nazione,
    partitaIva: patch.PartitaIVA ?? esistente.partitaIva,
    codiceFiscale: patch.CodiceFiscale ?? esistente.codiceFiscale,
    telefono: patch.Telefono ?? esistente.telefono,
    email: patch.Email ?? esistente.email,
    pec: patch.Pec ?? esistente.pec,
    codiceSdi: patch.CodiceSdi ?? esistente.codiceSdi,
  }
  return { cliente: aggiornato, esito: 'aggiornato', cambiati }
}
