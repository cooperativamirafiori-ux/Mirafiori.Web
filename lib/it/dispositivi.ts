/**
 * Scritture sui dispositivi IT dentro l'Inventario Beni.
 *
 * Stanno qui e non in `lib/inventario/data.ts` per due motivi: quel file è già
 * grosso, e queste regole sono dell'area IT — chi tiene l'inventario generale
 * non deve sapere cos'è un firewall.
 *
 * La regola che conta è una sola: **se il bene ha un `codiceRichiesta`, i campi
 * dell'acquisto restano della richiesta.** Fornitore, data, valore e garanzia
 * arrivano da lì, e correggerli qui farebbe divergere registro e ordine — per
 * cambiarli si corregge l'ordine, che riallinea i beni. I 52 dispositivi
 * arrivati dalle liste dell'IT non hanno nessuna richiesta alle spalle, e i loro
 * dati mancanti (il canone, i seriali) si completano da qui.
 */

import { aggiornaBene, creaBene, dataSoloGiorno, getBeneById } from '@/lib/inventario/data'
import { ErroreFlusso } from '@/lib/it/flusso'
import {
  CAMPI_DALL_ACQUISTO,
  type AggiornaBeneITPayload,
  type BeneInventario,
} from '@/types/inventario'
import { TIPI_CON_FIREWALL, TIPI_IT, type TipoIT } from '@/types/it'

/** Campi del dispositivo con cui nasce una registrazione fatta a mano. */
export interface NuovoDispositivo extends AggiornaBeneITPayload {
  tipoIT: TipoIT
  descrizione?: string
  marca?: string
  modello?: string
}

const testo = (v?: string | null) => (v ?? '').trim()

/** "Lenovo Legion 7", per il campo che Acquisti tiene unito. */
function marcaModello(marca?: string, modello?: string, esistente?: string): string | undefined {
  const unito = [testo(marca), testo(modello)].filter(Boolean).join(' ')
  if (unito) return unito
  return esistente ? undefined : ''
}

/**
 * Traduce il payload dell'area IT nei campi interni di SharePoint.
 * `undefined` = non toccare, `null` = svuotare.
 */
function campiSP(p: AggiornaBeneITPayload, bene?: BeneInventario): Record<string, unknown> {
  const f: Record<string, unknown> = {}

  if (p.tipoIT !== undefined) f.TipoIT = p.tipoIT ?? ''
  if (p.sottoTipo !== undefined) f.SottoTipo = testo(p.sottoTipo)
  if (p.marca !== undefined) f.Marca = testo(p.marca)
  if (p.modello !== undefined) f.Modello = testo(p.modello)
  if (p.descrizione !== undefined) f.Descrizione = testo(p.descrizione)
  if (p.numeroSerie !== undefined) f.NumeroSerie = testo(p.numeroSerie)
  if (p.acquisizione !== undefined) f.Acquisizione = p.acquisizione
  if (p.garanzieAccessorie !== undefined) f.GaranzieAccessorie = testo(p.garanzieAccessorie)
  if (p.fatturaRif !== undefined) f.FatturaRif = testo(p.fatturaRif)
  if (p.canoneMensile !== undefined) f.CanoneMensile = p.canoneMensile
  if (p.fineNoleggio !== undefined) {
    f.FineNoleggio = p.fineNoleggio ? dataSoloGiorno(p.fineNoleggio) ?? null : null
  }

  // Il firewall lo si spunta solo dove ha senso: su una stampante la domanda
  // non esiste, e una risposta a una domanda che non esiste è peggio del vuoto.
  if (p.firewallInstallato !== undefined) {
    const tipo = (p.tipoIT ?? bene?.tipoIT) as TipoIT | undefined
    f.FirewallInstallato = tipo && TIPI_CON_FIREWALL.includes(tipo) ? p.firewallInstallato : null
  }

  // Marca e modello separati per i report, uniti per compatibilità con Acquisti.
  if (p.marca !== undefined || p.modello !== undefined) {
    const mm = marcaModello(
      p.marca ?? bene?.marca,
      p.modello ?? bene?.modello,
      bene?.marcaModello,
    )
    if (mm !== undefined) f.MarcaModello = mm
  }

  if (p.dataAcquisto !== undefined) {
    f.DataAcquisto = p.dataAcquisto ? dataSoloGiorno(p.dataAcquisto) ?? null : null
  }
  if (p.fornitore !== undefined) f.Fornitore = testo(p.fornitore)
  if (p.valore !== undefined) f.Valore = p.valore
  if (p.mesiGaranzia !== undefined) f.MesiGaranzia = p.mesiGaranzia
  if (p.scadenzaGaranzia !== undefined) {
    f.ScadenzaGaranzia = p.scadenzaGaranzia ? dataSoloGiorno(p.scadenzaGaranzia) ?? null : null
  }

  return f
}

/** I campi dell'acquisto presenti nel payload, se il bene non li accetta. */
function campiVietati(p: AggiornaBeneITPayload, bene: BeneInventario): string[] {
  if (!bene.codiceRichiesta) return []
  return CAMPI_DALL_ACQUISTO.filter((k) => p[k] !== undefined)
}

export async function aggiornaBeneIT(
  spItemId: string,
  p: AggiornaBeneITPayload,
): Promise<BeneInventario> {
  const bene = await getBeneById(spItemId)

  if (p.tipoIT != null && !TIPI_IT.includes(p.tipoIT)) {
    throw new ErroreFlusso('Tipo di dispositivo non valido.')
  }
  const vietati = campiVietati(p, bene)
  if (vietati.length) {
    throw new ErroreFlusso(
      `Il bene ${bene.numero} nasce dalla richiesta ${bene.codiceRichiesta}: ` +
        `${vietati.join(', ')} si correggono sull'ordine, non qui.`,
    )
  }

  await aggiornaBene(spItemId, campiSP(p, bene))
  return getBeneById(spItemId)
}

/**
 * Registra un dispositivo che non nasce da una richiesta d'acquisto: quelli
 * arrivati prima dell'app, o entrati per altre vie.
 */
export async function creaDispositivo(d: NuovoDispositivo): Promise<BeneInventario> {
  if (!d.tipoIT || !TIPI_IT.includes(d.tipoIT)) {
    throw new ErroreFlusso('Indica che tipo di dispositivo è.')
  }
  const descrizione =
    testo(d.descrizione) || [testo(d.marca), testo(d.modello)].filter(Boolean).join(' ') || d.tipoIT

  return creaBene(descrizione, {
    // Categoria contabile: è quella che Acquisti userebbe per lo stesso oggetto.
    Categoria: 'Informatica',
    StatoBene: 'In magazzino',
    ...campiSP({ ...d, descrizione: undefined }),
  })
}
