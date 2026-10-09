/**
 * Costi fissi delle strutture sulla lista SharePoint "Costi Ricorrenti Strutture".
 * Configurazione: `SP_LIST_COSTI_RICORRENTI`.
 */

import { graphGetAll, graphPatch, graphPost } from '@/lib/core/graph'
import { PREFER_NON_INDEXED, SITE, lookupValue } from '@/lib/core/sp'
import { FREQUENZE, fineMesePrecedente, inizioMese, type CostoFisso, type DatiCostoFisso, type Frequenza } from '@/types/costi-fissi'

const LISTA = () => {
  const id = process.env.SP_LIST_COSTI_RICORRENTI
  if (!id) throw new Error('Variabile SP_LIST_COSTI_RICORRENTI mancante: vedi docs/utenze.md')
  return id
}
const base = () => `/sites/${SITE()}/lists/${LISTA()}/items`

export async function getCostiFissi(): Promise<CostoFisso[]> {
  const voci = await graphGetAll<any>(
    `${base()}?$select=id&$expand=fields($select=Title,Struttura,StrutturaLookupId,Categoria,Importo,FornitoreControparte,Frequenza,DataPrimaScadenza,DataFine,Attivo,Note)&$top=999`,
    PREFER_NON_INDEXED,
  )
  return voci.map((i) => {
    const f = i.fields ?? {}
    const freq = (FREQUENZE as readonly string[]).includes(f.Frequenza) ? (f.Frequenza as Frequenza) : 'Annuale'
    return {
      id: Number(i.id),
      descrizione: String(f.Title ?? '').trim(),
      strutturaId: Number(f.StrutturaLookupId ?? 0) || null,
      strutturaNome: lookupValue(f.Struttura),
      categoria: String(f.Categoria ?? 'Altro'),
      importo: Number(f.Importo ?? 0),
      frequenza: freq,
      dataPrimaScadenza: f.DataPrimaScadenza ? String(f.DataPrimaScadenza).slice(0, 10) : null,
      dataFine: f.DataFine ? String(f.DataFine).slice(0, 10) : null,
      attivo: f.Attivo !== false,
      fornitore: String(f.FornitoreControparte ?? '').trim(),
      note: String(f.Note ?? '').trim(),
    }
  })
}

const campi = (d: DatiCostoFisso) => ({
  Title: d.descrizione,
  StrutturaLookupId: d.strutturaId,
  Categoria: d.categoria,
  Importo: d.importo,
  FornitoreControparte: d.fornitore || null,
  Frequenza: d.frequenza,
  DataPrimaScadenza: d.dataPrimaScadenza ? giorno(d.dataPrimaScadenza) : null,
  Note: d.note || null,
})

// Mezzogiorno UTC: una data "solo giorno" non scivola al giorno prima col fuso.
const giorno = (iso: string) => `${iso}T12:00:00Z`

export async function getCostoFisso(id: number): Promise<CostoFisso | null> {
  return (await getCostiFissi()).find((c) => c.id === id) ?? null
}

export async function creaCostoFisso(d: DatiCostoFisso): Promise<number> {
  const r = await graphPost<{ id: string }>(base(), { fields: { ...campi(d), Attivo: true } })
  return Number(r.id)
}

/** Correzione di un errore: riscrive la voce, passato compreso. */
export async function correggiCostoFisso(id: number, d: DatiCostoFisso): Promise<void> {
  await graphPatch(`${base()}/${id}/fields`, campi(d))
}

/**
 * Variazione da un mese in poi (l'affitto aumenta): la voce vecchia si chiude
 * alla fine del mese precedente, ne nasce una nuova dal primo del mese.
 * Il passato resta com'era. Ritorna l'id della voce nuova.
 */
export async function variaCostoFisso(id: number, d: DatiCostoFisso, dal: string): Promise<number> {
  const vecchia = await getCostoFisso(id)
  if (!vecchia) throw new Error('Costo fisso non trovato')
  if (vecchia.dataFine) throw new Error('Questa voce è già chiusa: modifica quella che vale adesso')
  const inizio = inizioMese(dal)
  if (vecchia.dataPrimaScadenza && inizio <= inizioMese(vecchia.dataPrimaScadenza)) {
    throw new Error('Il mese della variazione deve venire dopo l\'inizio della voce: per cambiarla dall\'inizio usa "Correggi un errore"')
  }
  const nuova = await graphPost<{ id: string }>(base(), {
    fields: { ...campi({ ...d, dataPrimaScadenza: inizio }), Attivo: true, Note: [d.note, `sostituisce la voce ${id}`].filter(Boolean).join(' · ') },
  })
  await graphPatch(`${base()}/${id}/fields`, { DataFine: giorno(fineMesePrecedente(inizio)), Attivo: false })
  return Number(nuova.id)
}

/** Il costo viene a mancare: vale fino a `ultimoGiorno` compreso. */
export async function terminaCostoFisso(id: number, ultimoGiorno: string): Promise<void> {
  const vecchia = await getCostoFisso(id)
  if (!vecchia) throw new Error('Costo fisso non trovato')
  if (vecchia.dataPrimaScadenza && ultimoGiorno < vecchia.dataPrimaScadenza) {
    throw new Error('La data di fine viene prima dell\'inizio della voce')
  }
  await graphPatch(`${base()}/${id}/fields`, { DataFine: giorno(ultimoGiorno), Attivo: false })
}
