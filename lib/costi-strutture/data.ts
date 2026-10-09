/**
 * Letture del cruscotto Costi per struttura e chi vede cosa.
 *
 * Accesso:
 *   - permesso "Amministrazione" o admin delle manutenzioni → tutte le strutture;
 *   - coordinatore di un centro di costo → solo le strutture del suo centro.
 * Il filtro si applica qui, lato server: nascondere una card non è un permesso.
 *
 * Ogni fonte che non risponde diventa un avviso, mai uno zero.
 */

import { getCentriCoordinati } from '@/lib/centri-costo/data'
import { getCosti } from '@/lib/costi/data'
import { getCostiFissi } from '@/lib/costi-fissi/data'
import { getConsuntiviAnno } from '@/lib/cura-ambienti/data'
import { getImportiEsterniTicket } from '@/lib/manutenzioni/data'
import { getBollette, getDaCollegare, getStruttureCc } from '@/lib/utenze/data'
import { AREA_AMMINISTRAZIONE } from '@/types/utenze'
import { calcolaCruscotto, type CostoSp, type Fonti, type LavoroCa } from './calcoli'
import type { CruscottoStrutture } from '@/types/costi-strutture'

export interface AccessoStrutture {
  tutte: boolean
  /** Centri di costo coordinati (minuscolo), se non `tutte`. */
  codici: string[]
}

export async function accessoStrutture(
  user: { email?: string | null; permessi?: string[]; isAdmin?: boolean } | undefined | null,
): Promise<AccessoStrutture> {
  if (!user?.email) return { tutte: false, codici: [] }
  if (user.isAdmin || user.permessi?.includes(AREA_AMMINISTRAZIONE)) return { tutte: true, codici: [] }
  const codici = (await getCentriCoordinati(user.email)).map((c) => c.toLowerCase())
  return { tutte: false, codici }
}

export const puoVedereCostiStrutture = (a: AccessoStrutture) => a.tutte || a.codici.length > 0

async function prova<T>(nome: string, guasti: string[], f: () => Promise<T>, vuoto: T): Promise<T> {
  try {
    return await f()
  } catch (e) {
    console.error(`[costi-strutture] ${nome}`, e)
    guasti.push(nome)
    return vuoto
  }
}

export async function getCruscottoStrutture(anno: number, accesso: AccessoStrutture): Promise<CruscottoStrutture> {
  const guasti: string[] = []
  const [strutture, bollette, costi, fissi, lavori, daCollegare, esterni] = await Promise.all([
    getStruttureCc(),
    prova('le bollette', guasti, () => getBollette(anno), []),
    prova('la lista Costi Strutture', guasti, () => getCosti(anno), []),
    prova('i Costi fissi', guasti, () => getCostiFissi(), []),
    prova('i lavori di Cura Ambienti', guasti, () => getConsuntiviAnno(anno), [] as LavoroCa[]),
    prova('le utenze da collegare', guasti, () => getDaCollegare(), []),
    prova('i ticket di manutenzione', guasti, () => getImportiEsterniTicket(), new Map<string, number>()),
  ])

  const visibili = accesso.tutte ? strutture : strutture.filter((s) => s.ccCodice && accesso.codici.includes(s.ccCodice))

  const fonti: Fonti = {
    anno,
    oggi: new Date().toISOString(),
    strutture: visibili,
    bollette,
    costi: costi.map<CostoSp>((c) => ({
      data: c.dataCosto,
      categoria: c.categoria,
      importo: c.importo,
      strutturaId: c.struttura?.id || null,
      descrizione: c.title,
      fornitore: c.fornitore ?? null,
      // Un ticket si riconosce dal titolo MAN-…: se non lo troviamo fra i
      // completati, null = si conta intero (meglio un conto pieno che uno sparito).
      esterno: /^MAN-\d{4}-\d+$/.test(c.title) && esterni.has(c.title) ? esterni.get(c.title)! : null,
    })),
    fissi,
    lavori,
    daCollegare: accesso.tutte
      ? { codici: daCollegare.length, importo: Math.round(daCollegare.reduce((s, d) => s + d.importo, 0) * 100) / 100 }
      : { codici: 0, importo: 0 },
    guasti,
  }
  const c = calcolaCruscotto(fonti)
  // I costi senza struttura riguardano i centri di costo: li vede solo chi vede tutto.
  if (!accesso.tutte) c.senzaStruttura = { righe: 0, importo: 0 }
  return c
}
