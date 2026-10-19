/**
 * Chi entra nei Preventivi e cosa vede (scelta di Dennis, 19/10/2026).
 *
 *   - i coordinatori (e i responsabili d'area) di un centro di costo: nessun
 *     permesso da assegnare, come per Qonto e Cura Ambienti. Vedono e fanno i
 *     preventivi dei LORO centri di costo;
 *   - chi ha il permesso "Amministrazione" (Andrea) e gli admin: vedono tutto,
 *     gestiscono il tariffario e l'adeguamento ISTAT, possono uscire dai
 *     limiti di prezzo.
 *
 * Il controllo si fa sul server, nella pagina e in ogni route.
 */

import { getCentriCoordinati } from '@/lib/centri-costo/data'
import { AREA_AMMINISTRAZIONE } from '@/types/utenze'

export interface AccessoPreventivi {
  tutti: boolean
  centri: string[]
}

export async function accessoPreventivi(
  user: { email?: string | null; permessi?: string[]; isAdmin?: boolean } | undefined | null,
): Promise<AccessoPreventivi> {
  if (!user?.email) return { tutti: false, centri: [] }
  const tutti = Boolean(user.isAdmin) || (user.permessi?.includes(AREA_AMMINISTRAZIONE) ?? false)
  const centri = await getCentriCoordinati(user.email)
  return { tutti, centri }
}

export const puoEntrare = (a: AccessoPreventivi) => a.tutti || a.centri.length > 0

export const vedeCentro = (a: AccessoPreventivi, cc: string) => a.tutti || a.centri.includes(cc.toLowerCase())
