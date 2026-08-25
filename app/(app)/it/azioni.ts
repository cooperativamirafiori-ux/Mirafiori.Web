'use client'

/**
 * Le chiamate alle API dell'area IT, in un posto solo.
 *
 * Nelle schermate resta la domanda ("assegna questo a questa persona"), non il
 * modo: due componenti diversi che scrivono lo stesso `fetch` a mano prima o poi
 * gestiscono gli errori in due modi diversi.
 */

import { inviaFileABlocchi } from '@/lib/core/upload-diretto'
import type { Assegnazione, GenereAssegnazione, Sim, TipoVerbale } from '@/types/it'
import type { BeneInventario } from '@/types/inventario'

async function chiama<T>(url: string, metodo: 'POST' | 'PATCH', corpo: unknown): Promise<T> {
  const res = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  const dati = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(dati?.error ?? 'Operazione non riuscita')
  return dati as T
}

export interface DatiAssegnazione {
  oggettoId: number
  centroDiCostoId: number
  dataAssegnazione: string
  assegnatarioMail?: string
  assegnatarioNome?: string
  nomeUtenza?: string
  note?: string
}

export async function assegna(
  genere: GenereAssegnazione,
  dati: DatiAssegnazione,
): Promise<Assegnazione> {
  const r = await chiama<{ assegnazione: Assegnazione }>('/api/it/assegnazioni', 'POST', {
    genere,
    ...dati,
  })
  return r.assegnazione
}

export async function restituisci(
  genere: GenereAssegnazione,
  assegnazioneId: string,
  dataFine: string,
): Promise<Assegnazione> {
  const r = await chiama<{ assegnazione: Assegnazione }>(
    `/api/it/assegnazioni/${assegnazioneId}`,
    'PATCH',
    { genere, azione: 'restituisci', dataFine },
  )
  return r.assegnazione
}

export async function correggiAssegnazione(
  genere: GenereAssegnazione,
  assegnazioneId: string,
  campi: Record<string, unknown>,
): Promise<Assegnazione> {
  const r = await chiama<{ assegnazione: Assegnazione }>(
    `/api/it/assegnazioni/${assegnazioneId}`,
    'PATCH',
    { genere, azione: 'correggi', ...campi },
  )
  return r.assegnazione
}

export async function salvaDispositivo(
  spItemId: string,
  campi: Record<string, unknown>,
): Promise<BeneInventario> {
  const r = await chiama<{ bene: BeneInventario }>(`/api/it/dispositivi/${spItemId}`, 'PATCH', campi)
  return r.bene
}

export async function creaDispositivo(campi: Record<string, unknown>): Promise<BeneInventario> {
  const r = await chiama<{ bene: BeneInventario }>('/api/it/dispositivi', 'POST', campi)
  return r.bene
}

export async function salvaSim(spItemId: string, campi: Record<string, unknown>): Promise<Sim> {
  const r = await chiama<{ sim: Sim }>(`/api/it/sim/${spItemId}`, 'PATCH', campi)
  return r.sim
}

export async function creaSim(campi: Record<string, unknown>): Promise<Sim> {
  const r = await chiama<{ sim: Sim }>('/api/it/sim', 'POST', campi)
  return r.sim
}

/**
 * Carica il verbale firmato: apre la sessione, manda i byte direttamente a
 * SharePoint, poi registra il file sull'assegnazione. I byte non passano dal
 * nostro server, quindi non vale il limite dei 4 MB di Graph.
 */
export async function caricaVerbale(
  genere: GenereAssegnazione,
  assegnazioneId: string,
  tipo: TipoVerbale,
  file: File,
  onAvanzamento?: (percentuale: number) => void,
): Promise<Assegnazione> {
  const sessione = await chiama<{ uploadUrl: string; nomeFile: string }>(
    `/api/it/assegnazioni/${assegnazioneId}/verbale`,
    'POST',
    { genere, tipo, filename: file.name, dimensione: file.size },
  )
  await inviaFileABlocchi(sessione.uploadUrl, file, onAvanzamento)
  const r = await chiama<{ assegnazione: Assegnazione }>(
    `/api/it/assegnazioni/${assegnazioneId}/verbale/conferma`,
    'POST',
    { genere, tipo, nomeFile: sessione.nomeFile },
  )
  return r.assegnazione
}
