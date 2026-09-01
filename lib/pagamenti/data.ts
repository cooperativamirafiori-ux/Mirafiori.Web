/**
 * Letture dei Flussi fatture: le due code, i totali di testa, l'ultimo import.
 *
 * Nessun contatore memorizzato. I totali si ricalcolano a ogni lettura dalle
 * righe, come nelle timbrature e per la stessa ragione: un saldo salvato
 * diverge alla prima riga corretta a posteriori, e nessuno se ne accorge.
 */

import { supabase } from '@/lib/core/supabase'
import type {
  FamigliaModalita,
  RicevutaImport,
  RigaScadenza,
  StatoScadenza,
  TipoDocumento,
  TotaliCoda,
} from '@/types/pagamenti'

const CAMPI = `
  id, posizione, data_scadenza, importo, modalita, famiglia_modalita, stimata,
  stato, data_pagamento, pagata_da, pagata_il, origine_pagamento, approvata_da, approvata_il,
  alert, segnalazione, scomparsa, creata_il,
  fattura_passiva!inner (
    id, fornitore, piva, numero_fornitore, data_fornitore, tipo_documento,
    protocollo_numero, protocollo_suffisso, protocollo_data
  )
`

interface Row {
  id: string
  posizione: number
  data_scadenza: string
  importo: number | string
  modalita: string | null
  famiglia_modalita: string
  stimata: boolean
  stato: StatoScadenza
  data_pagamento: string | null
  pagata_da: string | null
  pagata_il: string | null
  origine_pagamento: string | null
  approvata_da: string | null
  approvata_il: string | null
  alert: string | null
  segnalazione: string | null
  scomparsa: boolean
  creata_il: string
  fattura_passiva: {
    id: string
    fornitore: string
    piva: string | null
    numero_fornitore: string | null
    data_fornitore: string | null
    tipo_documento: TipoDocumento
    protocollo_numero: string
    protocollo_suffisso: string | null
    protocollo_data: string
  }
}

const oggiISO = () => new Date().toISOString().slice(0, 10)

const giorniFra = (da: string, a: string): number =>
  Math.round((Date.parse(a) - Date.parse(da)) / 86_400_000)

function aRiga(r: Row, oggi: string): RigaScadenza {
  const f = r.fattura_passiva
  const suffisso = f.protocollo_suffisso ? `/${f.protocollo_suffisso}` : ''
  return {
    id: r.id,
    fatturaId: f.id,
    fornitore: f.fornitore,
    piva: f.piva,
    numeroFornitore: f.numero_fornitore,
    dataFornitore: f.data_fornitore,
    protocollo: `${f.protocollo_numero}${suffisso} del ${f.protocollo_data}`,
    dataScadenza: r.data_scadenza,
    importo: Number(r.importo),
    modalita: r.modalita,
    famiglia: r.famiglia_modalita as FamigliaModalita,
    tipoDocumento: f.tipo_documento,
    stato: r.stato,
    stimata: r.stimata,
    alert: (r.alert as RigaScadenza['alert']) ?? null,
    segnalazione: r.segnalazione,
    scomparsa: r.scomparsa,
    dataPagamento: r.data_pagamento,
    pagataDa: r.pagata_da,
    originePagamento: (r.origine_pagamento as RigaScadenza['originePagamento']) ?? null,
    approvataDa: r.approvata_da,
    approvataIl: r.approvata_il,
    // Da quando la riga aspetta una decisione: è il modo di far vedere il
    // silenzio di chi non decide, dato che non esiste un tasto «rimanda».
    giorniAttesa: Math.max(0, giorniFra(r.creata_il.slice(0, 10), oggi)),
    giorniRitardo: Math.max(0, giorniFra(r.data_scadenza, oggi)),
  }
}

/**
 * Le righe di una coda.
 *
 * Ordine: le scadute per prime, poi per data di scadenza. Chi guarda la lista
 * deve trovare in cima quello che è già in ritardo, non quello che è arrivato
 * per ultimo.
 */
export async function listaScadenze(stati: StatoScadenza[], limite = 1000): Promise<RigaScadenza[]> {
  const { data, error } = await supabase()
    .from('scadenza')
    .select(CAMPI)
    .in('stato', stati)
    .order('data_scadenza', { ascending: true })
    .limit(limite)
  if (error) throw new Error(`Lettura scadenze: ${error.message}`)
  const oggi = oggiISO()
  return ((data ?? []) as unknown as Row[]).map((r) => aRiga(r, oggi))
}

/** Le uscite che se ne vanno da sole: nessuno le paga, la cassa deve saperlo. */
export async function listaAutomatiche(giorni = 60): Promise<RigaScadenza[]> {
  const a = new Date()
  a.setDate(a.getDate() + giorni)
  const { data, error } = await supabase()
    .from('scadenza')
    .select(CAMPI)
    .eq('stato', 'automatica')
    .lte('data_scadenza', a.toISOString().slice(0, 10))
    .order('data_scadenza', { ascending: true })
    .limit(500)
  if (error) throw new Error(`Lettura addebiti automatici: ${error.message}`)
  const oggi = oggiISO()
  return ((data ?? []) as unknown as Row[]).map((r) => aRiga(r, oggi))
}

/**
 * I numeri di testa.
 *
 * Le finestre 7/30/60/90 sono **cumulative** — «entro 60» comprende «entro 30»,
 * come si legge la frase — e **non comprendono lo scaduto**, che ha una
 * piastrella sua: sommare il ritardo al futuro nasconderebbe proprio la cosa
 * che il cruscotto deve mostrare per prima.
 *
 * Le piastrelle contano le due code; gli addebiti automatici in arrivo si
 * calcolano a parte e li somma l'interfaccia, quando si chiede la previsione
 * completa. Sono tenuti separati perché rispondono a due domande diverse:
 * «quanto devo pagare» e «quanto esce dal conto».
 */
export async function totali(): Promise<TotaliCoda> {
  const { data, error } = await supabase()
    .from('scadenza')
    .select('stato, importo, data_scadenza')
    .in('stato', ['da_pagare', 'da_approvare', 'automatica'])
    .limit(8000)
  if (error) throw new Error(`Lettura totali: ${error.message}`)

  const oggi = oggiISO()
  const fra = (giorni: number) => {
    const d = new Date()
    d.setDate(d.getDate() + giorni)
    return d.toISOString().slice(0, 10)
  }
  const limiti = { 7: fra(7), 30: fra(30), 60: fra(60), 90: fra(90) }

  const vuoto = () => ({ righe: 0, importo: 0 })
  const t: TotaliCoda = {
    scaduto: vuoto(),
    entro7: vuoto(),
    entro30: vuoto(),
    entro60: vuoto(),
    entro90: vuoto(),
    daApprovare: vuoto(),
    daPagare: vuoto(),
    automatiche: { entro7: vuoto(), entro30: vuoto(), entro60: vuoto(), entro90: vuoto() },
  }

  for (const r of (data ?? []) as Array<{
    stato: StatoScadenza
    importo: number | string
    data_scadenza: string
  }>) {
    const imp = Number(r.importo)
    const somma = (v: { righe: number; importo: number }) => {
      v.righe++
      v.importo += imp
    }

    if (r.stato === 'automatica') {
      // Nel passato è già uscito: non è scaduto, non è previsione, non conta.
      if (r.data_scadenza < oggi) continue
      if (r.data_scadenza <= limiti[7]) somma(t.automatiche.entro7)
      if (r.data_scadenza <= limiti[30]) somma(t.automatiche.entro30)
      if (r.data_scadenza <= limiti[60]) somma(t.automatiche.entro60)
      if (r.data_scadenza <= limiti[90]) somma(t.automatiche.entro90)
      continue
    }

    if (r.stato === 'da_approvare') somma(t.daApprovare)
    if (r.stato === 'da_pagare') somma(t.daPagare)

    if (r.data_scadenza < oggi) {
      somma(t.scaduto)
      continue
    }
    if (r.data_scadenza <= limiti[7]) somma(t.entro7)
    if (r.data_scadenza <= limiti[30]) somma(t.entro30)
    if (r.data_scadenza <= limiti[60]) somma(t.entro60)
    if (r.data_scadenza <= limiti[90]) somma(t.entro90)
  }
  return t
}

/**
 * Lo scaduto per anzianità. È la misura che oggi nessuno ha sotto gli occhi:
 * 75.000 € di cui 22.000 fermi da oltre novanta giorni, ad agosto 2026.
 */
export async function scadutoPerAnzianita(): Promise<Array<{ fascia: string; righe: number; importo: number }>> {
  const { data, error } = await supabase()
    .from('scadenza')
    .select('importo, data_scadenza')
    .in('stato', ['da_pagare', 'da_approvare', 'storica'])
    .lt('data_scadenza', oggiISO())
    .limit(5000)
  if (error) throw new Error(`Lettura scaduto: ${error.message}`)

  const oggi = oggiISO()
  const fasce = [
    { fascia: 'entro 30 giorni', max: 30, righe: 0, importo: 0 },
    { fascia: '31–60 giorni', max: 60, righe: 0, importo: 0 },
    { fascia: '61–90 giorni', max: 90, righe: 0, importo: 0 },
    { fascia: 'oltre 90 giorni', max: Infinity, righe: 0, importo: 0 },
  ]
  for (const r of (data ?? []) as Array<{ importo: number | string; data_scadenza: string }>) {
    const g = giorniFra(r.data_scadenza, oggi)
    const f = fasce.find((x) => g <= x.max)!
    f.righe++
    f.importo += Number(r.importo)
  }
  return fasce.map(({ fascia, righe, importo }) => ({ fascia, righe, importo }))
}

/**
 * L'ultimo caricamento. Il cruscotto lo mostra in testa: un cruscotto vecchio
 * di tre settimane che non lo dice è peggio di un cruscotto vuoto.
 */
export async function ultimoImport(): Promise<RicevutaImport | null> {
  const { data, error } = await supabase()
    .from('import_file')
    .select('*')
    .order('caricato_il', { ascending: false })
    .limit(1)
  if (error) throw new Error(`Lettura ultimo import: ${error.message}`)
  const r = (data ?? [])[0]
  if (!r) return null
  return {
    id: r.id,
    nomeFile: r.nome_file,
    caricatoDa: r.caricato_da,
    caricatoIl: r.caricato_il,
    righe: r.righe,
    nuove: r.nuove,
    aggiornate: r.aggiornate,
    invariate: r.invariate,
    scartate: r.scartate,
    scomparse: r.scomparse,
    soglia: Number(r.soglia ?? 0),
    esito: r.esito,
    avvisi: Array.isArray(r.dettaglio?.avvisi) ? r.dettaglio.avvisi : [],
  }
}
