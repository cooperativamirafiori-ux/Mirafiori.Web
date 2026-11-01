/**
 * Chi può cosa negli addebiti interni (decisione di Dennis, 1/11/2026):
 *
 *   - permesso "Controllo di Gestione" → vede tutto, scrive per qualunque
 *     servizio, salva le percentuali dei costi generali;
 *   - coordinatore di un centro di costo (lista Centri di Costo) → scrive gli
 *     addebiti del suo servizio verso gli altri, vede quelli che riceve e ci
 *     mette il visto. Nessun permesso da assegnare, come per Qonto.
 *
 * Il filtro si applica lato server su ogni lettura e scrittura.
 */

import { getCentriCoordinati } from '@/lib/centri-costo/data'
import { AREA_CONTROLLO_GESTIONE } from '@/types/pagamenti'

export interface AccessoServiziInterni {
  tutti: boolean
  /** Centri di costo coordinati, minuscolo (vuoto se `tutti`). */
  codici: string[]
}

export async function accessoServiziInterni(
  user: { email?: string | null; permessi?: string[] } | undefined | null,
): Promise<AccessoServiziInterni> {
  if (!user?.email) return { tutti: false, codici: [] }
  if (user.permessi?.includes(AREA_CONTROLLO_GESTIONE)) return { tutti: true, codici: [] }
  return { tutti: false, codici: (await getCentriCoordinati(user.email)).map((c) => c.toLowerCase()) }
}

export const puoUsareServiziInterni = (a: AccessoServiziInterni) => a.tutti || a.codici.length > 0
export const puoScrivereDa = (a: AccessoServiziInterni, cc: string) => a.tutti || a.codici.includes(cc.toLowerCase())
export const puoVistare = (a: AccessoServiziInterni, cc: string) => a.tutti || a.codici.includes(cc.toLowerCase())
/** Le percentuali dei costi generali le salva solo chi ha "Controllo di Gestione". */
export const puoRipartire = (a: AccessoServiziInterni) => a.tutti
