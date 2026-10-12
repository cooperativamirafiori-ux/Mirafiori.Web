/**
 * Anagrafica Centri di Costo: la dimensione contabile con cui la cooperativa
 * alloca costi, acquisti e fatture.
 *
 * È un'anagrafica condivisa come `clienti` e `strutture`: non ha schermate
 * proprie, la usa chi ne ha bisogno.
 *
 * Perché non basta la Struttura. Nove centri di costo su ventitré non hanno
 * nessuna sede fisica — l'educativa nelle scuole, Care Leavers, CISA 12, il
 * CAV. La struttura resta un'informazione logistica ("dove sta la caldaia") e,
 * quando c'è, precompila il centro di costo; ma la dimensione contabile
 * obbligatoria è questa.
 *
 * Configurazione: `SP_LIST_CENTRI_COSTO`. Se manca, `getCentriDiCosto()`
 * ritorna un elenco vuoto e chi la usa ripiega su un campo libero — mai
 * un'eccezione: meglio un form spartano che una pagina che non si apre.
 */

import { unstable_cache } from 'next/cache'
import { graphGet, graphPatch } from '@/lib/core/graph'
import { PREFER_NON_INDEXED, getSPUserEmailByLookupId } from '@/lib/core/sp'

export interface CentroDiCosto {
  id: number      // item ID SharePoint: è ciò che si scrive nei lookup
  codice: string  // cc1…cc23 — chiave stabile, sopravvive alle rinomine
  nome: string
  area: string
  ordine: number
}

const LISTA = () => process.env.SP_LIST_CENTRI_COSTO

/** true se la lista è configurata. */
export function centriDiCostoConfigurati(): boolean {
  return Boolean(process.env.SHAREPOINT_SITE_ID && LISTA())
}

/**
 * Centri di costo attivi, in ordine di `Ordine` (che li raggruppa per area).
 * Non lancia mai: in caso di guaio ritorna un elenco vuoto.
 */
export async function getCentriDiCosto(): Promise<CentroDiCosto[]> {
  const site = process.env.SHAREPOINT_SITE_ID
  const lista = LISTA()
  if (!site || !lista) return []

  try {
    const res = await graphGet<{ value: any[] }>(
      `/sites/${site}/lists/${lista}/items?$select=id&$expand=fields($select=Title,Codice,Area,Attivo,Ordine)&$top=500`,
      PREFER_NON_INDEXED,
    )
    return (res.value ?? [])
      .filter((i) => i.fields?.Attivo !== false)
      .map((i) => ({
        id: Number(i.id),
        codice: (i.fields?.Codice ?? '').trim(),
        nome: (i.fields?.Title ?? '').trim(),
        area: (i.fields?.Area ?? '').trim(),
        ordine: Number(i.fields?.Ordine ?? 999),
      }))
      .filter((c) => c.nome)
      .sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome, 'it'))
  } catch (err) {
    console.error('[centri-costo] lettura fallita, si ripiega su elenco vuoto:', err)
    return []
  }
}

// ============================================================
// Coordinatori e responsabili d'area
// ============================================================
//
// Due ruoli, entrambi per centro di costo:
//   - coordinatori: chi guida il servizio (uno o più, il vice compreso);
//   - responsabili d'area: ripetuti su ogni centro dell'area.
// Per l'accesso contano allo stesso modo: chi è coordinatore o responsabile
// d'area di un centro ne vede il conto Qonto, le fatture, i lavori di Cura
// Ambienti — senza un permesso da assegnare a parte. Cambiarli qui sposta
// l'accesso da solo.
//
// Dove stanno su SharePoint (12/10/2026). Si scrivono come EMAIL in due
// colonne di testo, `EmailCoordinatori` e `EmailResponsabileArea`, separate
// da ";". Prima i coordinatori stavano nella colonna persona `Responsabile`
// ("Coordinatori"), che però accetta solo chi ha già aperto il sito
// SharePoint almeno una volta: per un'educatrice che usa solo l'app non si
// poteva nominare. La colonna persona si legge ancora (unione con le email),
// così chi l'ha compilata a mano su SharePoint non perde niente; la schermata
// Amministrazione → Centri di costo, quando salva, sposta tutto nelle email e
// la svuota.

export const COL_COORDINATORI = 'EmailCoordinatori'
export const COL_RESPONSABILI_AREA = 'EmailResponsabileArea'
const COL_PERSONA = 'Responsabile'

type MappaCoordinatori = Record<string, string[]>

/** "a@x.it; b@x.it" → ['a@x.it', 'b@x.it'], minuscole, senza doppioni. */
export function emailDaTesto(v: unknown): string[] {
  return [
    ...new Set(
      String(v ?? '')
        .split(/[;,\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@')),
    ),
  ]
}

export function testoDaEmail(email: string[]): string {
  return [...new Set(email.map((e) => e.trim().toLowerCase()).filter(Boolean))].join('; ')
}

/**
 * Le email di una colonna persona, singola o multipla.
 *
 * Graph non è coerente: per una persona singola dà solo `<Nome>LookupId`, per
 * una multipla un array di oggetti che *di solito* portano l'`Email`. Si prende
 * l'email quando c'è e si risolve il LookupId sull'elenco utenti quando manca.
 */
async function emailDaPersona(fields: any, nome: string): Promise<string[]> {
  const valore = fields?.[nome]
  const ids = fields?.[`${nome}LookupId`]
  const voci: Array<{ email?: string; id?: number }> = []
  if (Array.isArray(valore)) {
    for (const v of valore) voci.push({ email: v?.Email ?? v?.EMail, id: Number(v?.LookupId) || undefined })
  } else if (valore && typeof valore === 'object') {
    voci.push({ email: valore.Email ?? valore.EMail, id: Number(valore.LookupId) || undefined })
  }
  if (!voci.length && ids != null) {
    for (const id of Array.isArray(ids) ? ids : [ids]) voci.push({ id: Number(id) || undefined })
  }
  const email = await Promise.all(
    voci.map(async (v) => v.email || (v.id ? await getSPUserEmailByLookupId(v.id).catch(() => '') : '')),
  )
  return email.map((e) => e.trim().toLowerCase()).filter(Boolean)
}

/** Un centro di costo con i suoi ruoli: è ciò che mostra la schermata. */
export interface RuoliCentro {
  id: number
  codice: string
  nome: string
  area: string
  ordine: number
  attivo: boolean
  coordinatori: string[]
  responsabiliArea: string[]
  /** true se c'è ancora qualcuno nella vecchia colonna persona. */
  daMigrare: boolean
}

/**
 * Tutti i centri di costo, spenti compresi, con coordinatori e responsabili
 * d'area. Senza cache: la usa la schermata che li modifica, e deve vedere
 * subito quello che ha appena scritto. Lancia in caso di guaio (la schermata
 * lo dice, invece di mostrare un elenco vuoto che sembrerebbe vero).
 *
 * Si chiede `fields` intero, senza $select: le colonne nuove potrebbero non
 * esserci ancora su una lista non allineata, e un $select su un campo che non
 * esiste fa fallire la lettura.
 */
export async function getRuoliCentri(): Promise<RuoliCentro[]> {
  const site = process.env.SHAREPOINT_SITE_ID
  const lista = LISTA()
  if (!site || !lista) return []
  const res = await graphGet<{ value: any[] }>(
    `/sites/${site}/lists/${lista}/items?$select=id&$expand=fields&$top=500`,
    PREFER_NON_INDEXED,
  )
  const righe = await Promise.all(
    (res.value ?? []).map(async (i): Promise<RuoliCentro> => {
      const f = i.fields ?? {}
      const persona = await emailDaPersona(f, COL_PERSONA)
      return {
        id: Number(i.id),
        codice: String(f.Codice ?? '').trim().toLowerCase(),
        nome: String(f.Title ?? '').trim(),
        area: String(f.Area ?? '').trim(),
        ordine: Number(f.Ordine ?? 999),
        attivo: f.Attivo !== false,
        coordinatori: [...new Set([...emailDaTesto(f[COL_COORDINATORI]), ...persona])],
        responsabiliArea: emailDaTesto(f[COL_RESPONSABILI_AREA]),
        daMigrare: persona.length > 0,
      }
    }),
  )
  return righe
    .filter((r) => r.codice && r.nome)
    .sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome, 'it'))
}

async function leggiCoordinatori(): Promise<MappaCoordinatori> {
  const mappa: MappaCoordinatori = {}
  for (const r of await getRuoliCentri()) {
    if (!r.attivo) continue
    const email = [...new Set([...r.coordinatori, ...r.responsabiliArea])]
    if (email.length) mappa[r.codice] = email
  }
  return mappa
}

/**
 * Codice del centro di costo → email di coordinatori e responsabili d'area.
 * In cache 5 minuti: la leggono la home e la sezione Controllo di Gestione a
 * ogni apertura. La schermata che li modifica svuota la cache con il tag
 * `centri-costo`, quindi una nomina vale subito.
 * Non lancia mai: in caso di guaio nessuno risulta coordinatore (si chiude,
 * non si apre).
 */
export const getCoordinatoriCentri = unstable_cache(
  async (): Promise<MappaCoordinatori> => {
    try {
      return await leggiCoordinatori()
    } catch (err) {
      console.error('[centri-costo] lettura coordinatori fallita:', err)
      return {}
    }
  },
  ['centri-costo-coordinatori'],
  { revalidate: 300, tags: ['centri-costo'] },
)

/** Codici dei centri di costo di cui `email` è coordinatore o responsabile d'area. */
export async function getCentriCoordinati(email: string | null | undefined): Promise<string[]> {
  const e = (email ?? '').trim().toLowerCase()
  if (!e) return []
  const mappa = await getCoordinatoriCentri()
  return Object.entries(mappa)
    .filter(([, emails]) => emails.includes(e))
    .map(([codice]) => codice)
}

// ------------------------------------------------------------
// Scritture
// ------------------------------------------------------------

async function scriviRiga(id: number, campi: Record<string, unknown>): Promise<void> {
  const site = process.env.SHAREPOINT_SITE_ID
  const lista = LISTA()
  if (!site || !lista) throw new Error('Lista Centri di Costo non configurata')
  await graphPatch(`/sites/${site}/lists/${lista}/items/${id}/fields`, campi)
}

/** Svuota la vecchia colonna persona: il suo contenuto è già nelle email. */
const SVUOTA_PERSONA = {
  [`${COL_PERSONA}LookupId@odata.type`]: 'Collection(Edm.Int32)',
  [`${COL_PERSONA}LookupId`]: [] as number[],
}

/**
 * Coordinatori di un centro di costo: l'elenco COMPLETO, sostituisce quello
 * di prima. Chi chiama passa già l'unione (vecchia colonna compresa) meno chi
 * ha tolto, quindi svuotare la colonna persona non perde nessuno.
 */
export async function salvaCoordinatori(codice: string, email: string[]): Promise<RuoliCentro> {
  const riga = (await getRuoliCentri()).find((r) => r.codice === codice.toLowerCase())
  if (!riga) throw new Error(`Centro di costo ${codice} non trovato`)
  await scriviRiga(riga.id, {
    [COL_COORDINATORI]: testoDaEmail(email),
    ...(riga.daMigrare ? SVUOTA_PERSONA : {}),
  })
  return { ...riga, coordinatori: emailDaTesto(testoDaEmail(email)), daMigrare: false }
}

/**
 * Responsabili di un'area: si scrivono su OGNI centro di costo dell'area,
 * spenti compresi (se uno si riaccende, ha già il responsabile giusto).
 */
export async function salvaResponsabiliArea(area: string, email: string[]): Promise<number> {
  const righe = (await getRuoliCentri()).filter((r) => r.area === area)
  if (!righe.length) throw new Error(`Nessun centro di costo nell'area "${area}"`)
  const testo = testoDaEmail(email)
  for (const r of righe) await scriviRiga(r.id, { [COL_RESPONSABILI_AREA]: testo })
  return righe.length
}

/**
 * Colonne dei ruoli che mancano sulla lista: finché mancano la schermata non
 * può salvare, e lo dice con il comando che le crea.
 */
export async function colonneRuoliMancanti(): Promise<string[]> {
  const site = process.env.SHAREPOINT_SITE_ID
  const lista = LISTA()
  if (!site || !lista) return [COL_COORDINATORI, COL_RESPONSABILI_AREA]
  const res = await graphGet<{ value: Array<{ name: string }> }>(
    `/sites/${site}/lists/${lista}/columns?$select=name&$top=200`,
  )
  const ci = new Set((res.value ?? []).map((c) => c.name))
  return [COL_COORDINATORI, COL_RESPONSABILI_AREA].filter((c) => !ci.has(c))
}
