/**
 * Chi vede quali conti Qonto.
 *
 *   - permesso "Controllo di Gestione" → tutti i conti, principale compreso;
 *   - coordinatore di un centro di costo (lista SP Centri di Costo, colonna
 *     "Coordinatori") → solo i sottoconti dei suoi centri di costo.
 *
 * Il coordinatore non ha un permesso da assegnare: lo diventa quando viene
 * nominato sulla lista, e smette quando viene tolto. Un secondo elenco
 * ("chi vede la cassa") prima o poi divergerebbe dal primo.
 *
 * Il filtro si applica lato server, sulla pagina e su ogni lettura: nascondere
 * una riga nell'interfaccia non è un permesso.
 */

import { getCentriCoordinati } from '@/lib/centri-costo/data'
import { AREA_CONTROLLO_GESTIONE } from '@/types/pagamenti'
import type { ContoQonto } from '@/types/qonto'

export interface AccessoQonto {
  /** Vede tutti i conti. */
  tutti: boolean
  /** Centri di costo coordinati (vuoto se `tutti`: non serve saperlo). */
  codici: string[]
}

export async function accessoQonto(
  user: { email?: string | null; permessi?: string[] } | undefined | null,
): Promise<AccessoQonto> {
  if (!user?.email) return { tutti: false, codici: [] }
  if (user.permessi?.includes(AREA_CONTROLLO_GESTIONE)) return { tutti: true, codici: [] }
  return { tutti: false, codici: await getCentriCoordinati(user.email) }
}

export function puoVedereQonto(a: AccessoQonto): boolean {
  return a.tutti || a.codici.length > 0
}

export function contiVisibili(conti: ContoQonto[], a: AccessoQonto): ContoQonto[] {
  if (a.tutti) return conti
  return conti.filter((c) => c.ccCodice !== null && a.codici.includes(c.ccCodice))
}
