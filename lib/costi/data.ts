/**
 * Costi delle strutture: quelli generati dalle manutenzioni e quelli inseriti
 * a mano (costo diretto).
 */

import { graphGet, graphPost } from '@/lib/core/graph'
import { listBase, lookupValue, PREFER_NON_INDEXED } from '@/lib/core/sp'
import { getCentriDiCosto } from '@/lib/centri-costo/data'
import { scriviDocumento } from '@/lib/gestione/registro'
import { voceDiCategoria } from '@/lib/gestione/voci'
import type { FonteMovimento } from '@/types/gestione'
import type { Struttura, CostoRecord } from '@/types/manutenzioni'

/**
 * Unico punto in cui nasce una riga di costo: ci passano il costo diretto, la
 * chiusura di una manutenzione e la consegna di un acquisto.
 *
 * `CentroCostoLookupId` è il campo che conta ed è **copiato qui**, non
 * ricavato risalendo alla struttura: se domani una struttura passa a un altro
 * centro di costo, i movimenti già registrati non si devono spostare da soli.
 * `StrutturaLookupId` è facoltativo — i servizi senza sede fisica registrano
 * costi che non stanno in nessun edificio.
 *
 * **Scrive in due posti**: la lista SharePoint (che resta la fonte per il
 * cruscotto costi, gli allegati e i permessi) e il registro analitico su
 * Supabase. Vedi `docs/registro-fondamenta.md`.
 */
export async function creaCosto(fields: {
  Title: string
  DataCosto: string
  Categoria: string             // Choice → stringa semplice
  Importo: number
  CentroCostoLookupId?: number  // Lookup → {Campo}LookupId
  StrutturaLookupId?: number    // Lookup → {Campo}LookupId
  Fornitore?: string
  Periodo?: string
  Fonte?: string                // Choice → stringa semplice
}): Promise<void> {
  // Graph rifiuta le proprietà undefined: vanno tolte prima di spedire.
  const puliti = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  )
  const creato = await graphPost<{ id: string }>(`${listBase('costi')}`, { fields: puliti })

  await riversaNelRegistro(creato?.id, fields)
}

/** Dalla colonna Choice `Fonte` di SharePoint alla `fonte` del registro. */
function fonteDi(fonte: string | undefined): FonteMovimento {
  if (fonte === 'Acquisto') return 'acquisto'
  // 'Manuale' lo scrivono sia la chiusura di una manutenzione sia i ripieghi
  // dei form: da qui non si distinguono, e inventare la differenza sarebbe
  // peggio che dire "costo inserito nell'app". Il travaso, che vede anche
  // l'elenco delle manutenzioni, riconosce quelle e scrive 'manutenzione'.
  return 'costo_diretto'
}

/**
 * Riversa nel registro il costo appena creato su SharePoint.
 *
 * **Non lancia mai.** Se la scrittura nel registro fallisce, il costo su
 * SharePoint c'è già ed è la cosa che conta: far fallire tutta l'operazione
 * lascerebbe l'utente davanti a un errore per un costo che invece è stato
 * registrato, e lo farebbe reinserire — creando il doppione vero.
 *
 * Il buco si richiude da sé: `origine_id` è l'id dell'item SharePoint, quindi
 * `scripts/travaso-costi-registro.mjs` è ripetibile e riallinea i due archivi
 * senza duplicare niente. Quello script non è solo un travaso una volta sola:
 * è lo strumento di quadratura fra la lista e il registro.
 */
async function riversaNelRegistro(
  spItemId: string | undefined,
  fields: { Title: string; DataCosto: string; Categoria: string; Importo: number; CentroCostoLookupId?: number; Fornitore?: string; Fonte?: string },
): Promise<void> {
  try {
    if (!spItemId) {
      console.warn('[costi] SharePoint non ha restituito l\'id: costo non riversato nel registro')
      return
    }
    if (!fields.CentroCostoLookupId) {
      // Senza centro di costo il registro non accetta la riga, e non deve:
      // resta su SharePoint, e il travaso la riprende quando qualcuno le avrà
      // assegnato un centro di costo.
      console.warn(`[costi] costo ${spItemId} senza centro di costo: non riversato`)
      return
    }
    if (!fields.Importo) return

    const centri = await getCentriDiCosto()
    const cc = centri.find((c) => c.id === fields.CentroCostoLookupId)
    if (!cc?.codice) {
      console.warn(`[costi] centro di costo ${fields.CentroCostoLookupId} non risolto: costo ${spItemId} non riversato`)
      return
    }

    const data = new Date(fields.DataCosto)
    if (isNaN(data.getTime())) {
      console.warn(`[costi] data "${fields.DataCosto}" non valida: costo ${spItemId} non riversato`)
      return
    }

    await scriviDocumento('costo_sp', spItemId, [
      {
        dataCompetenza: data.toISOString().slice(0, 10),
        ccCodice: cc.codice,
        tipo: 'costo',
        voce: await voceDiCategoria(fields.Categoria),
        // Il registro vuole i costi con il segno negativo, la lista li tiene
        // positivi: la conversione sta qui e in nessun altro posto.
        importo: -Math.abs(fields.Importo),
        controparte: fields.Fornitore,
        fonte: fonteDi(fields.Fonte),
        confidenza: 'certa',
        motivo: 'centro di costo scritto sul documento',
        // La categoria resta in chiaro: è ciò che permette di chiudere una
        // voce mancante aggiungendo una riga a mappa_categoria_voce.
        note: fields.Categoria,
      },
    ])
  } catch (err) {
    console.error('[costi] riversamento nel registro fallito (il costo su SharePoint c\'è):', err)
  }
}

// Campi da leggere dalla lista Costi Strutture.
// Struttura e CentroCosto sono lookup → { Value, LookupId } (oppure stringa
// semplice via fields-expansion)
const COSTO_FIELDS =
  'id,fields&$expand=fields($select=Title,DataCosto,Categoria,Importo,Struttura,StrutturaLookupId,CentroCosto,CentroCostoLookupId,Fornitore,Periodo,Fonte,Note)'

function mapCosto(item: any): CostoRecord {
  const f = item.fields
  return {
    id: Number(item.id),
    title: f.Title ?? '',
    dataCosto: f.DataCosto ?? '',
    categoria: lookupValue(f.Categoria) || 'Non categorizzato',
    importo: typeof f.Importo === 'number' ? f.Importo : Number(f.Importo ?? 0),
    struttura: {
      id: Number(f.Struttura?.LookupId ?? f.StrutturaLookupId ?? 0),
      value: lookupValue(f.Struttura),
    },
    centroCosto: Number(f.CentroCosto?.LookupId ?? f.CentroCostoLookupId ?? 0)
      ? {
          id: Number(f.CentroCosto?.LookupId ?? f.CentroCostoLookupId),
          value: lookupValue(f.CentroCosto),
        }
      : undefined,
    fornitore: f.Fornitore ?? undefined,
    periodo: f.Periodo ?? undefined,
    fonte: lookupValue(f.Fonte) || undefined,
    note: f.Note ?? undefined,
  }
}

/**
 * Legge i record della lista Costi Strutture.
 * Se `anno` è indicato, filtra client-side per anno di DataCosto.
 */
export async function getCosti(anno?: number): Promise<CostoRecord[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase('costi')}?$select=${COSTO_FIELDS}&$orderby=fields/DataCosto desc&$top=2000`,
    PREFER_NON_INDEXED
  )
  let costi = res.value.map(mapCosto)
  if (anno) {
    costi = costi.filter((c) => {
      const d = new Date(c.dataCosto)
      return !isNaN(d.getTime()) && d.getFullYear() === anno
    })
  }
  return costi
}

/**
 * Inserisce un costo senza passare da una richiesta di manutenzione.
 * Fonte = "Diretto".
 *
 * Il centro di costo è obbligatorio, la struttura no: un corso di formazione
 * dell'educativa nelle scuole è un costo vero che non sta in nessun edificio.
 */
export async function creaCostoDiretto(fields: {
  CentroCostoLookupId: number
  StrutturaLookupId?: number
  Categoria: string
  Importo: number
  DataCosto: string
  Fornitore?: string
  Causale?: string
}): Promise<void> {
  const dataObj = new Date(fields.DataCosto)
  const periodo = isNaN(dataObj.getTime())
    ? ''
    : dataObj.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  const title = fields.Causale?.trim() || `Costo diretto — ${fields.Categoria}`

  const base = {
    Title: title,
    DataCosto: dataObj.toISOString(),
    Categoria: fields.Categoria,
    Importo: fields.Importo,
    CentroCostoLookupId: fields.CentroCostoLookupId,
    StrutturaLookupId: fields.StrutturaLookupId || undefined,
    Fornitore: fields.Fornitore?.trim() || undefined,
    Periodo: periodo,
  }

  // Fonte è una colonna Choice: "Diretto" potrebbe non essere tra i valori
  // ammessi (fill-in disabilitato). Provo con "Diretto", altrimenti ripiego
  // su "Manuale" (valore già usato dai flussi, quindi sicuramente valido).
  try {
    await creaCosto({ ...base, Fonte: 'Diretto' })
  } catch (err) {
    console.warn('[SP] creaCostoDiretto: Fonte="Diretto" rifiutata, ripiego su "Manuale"', err)
    await creaCosto({ ...base, Fonte: 'Manuale' })
  }
}

// ============================================================
// Admin check (lista Admin Manutenzioni)
// Lista SP con colonna "Utente" (Person) — ogni riga è un admin
// ============================================================
