/**
 * Chi entra in Cura Ambienti.
 *
 *   - i coordinatori di cc24 (lista SP Centri di Costo, colonna "Coordinatori"):
 *     nessun permesso da assegnare, come per la scheda Qonto;
 *   - chi ha il permesso "Controllo di Gestione", che guarda tutti i servizi.
 *
 * Il controllo si fa lato server, sulla pagina e su ogni route.
 */

import { getCentriCoordinati } from '@/lib/centri-costo/data'
import { AREA_CONTROLLO_GESTIONE } from '@/types/pagamenti'
import { CC_CURA_AMBIENTI } from '@/types/cura-ambienti'

export async function puoUsareCuraAmbienti(
  user: { email?: string | null; permessi?: string[] } | undefined | null,
): Promise<boolean> {
  if (!user?.email) return false
  if (user.permessi?.includes(AREA_CONTROLLO_GESTIONE)) return true
  return (await getCentriCoordinati(user.email)).includes(CC_CURA_AMBIENTI)
}
