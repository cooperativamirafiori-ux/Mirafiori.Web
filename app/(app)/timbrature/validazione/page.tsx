/**
 * Cruscotto di validazione per i RESPONSABILI.
 *
 * Stessa pagina delle HR (/risorse-umane/timbrature), ma raggiungibile senza
 * far parte delle Risorse Umane: si entra perche' qualcuno ti indica come
 * Referente foglio ore in anagrafica, non perche' ti e' stato dato un permesso.
 * Il filtro sui dati lo applica il server, non questa pagina.
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { eResponsabile } from '@/lib/timbrature'
import CruscottoTimbrature from '@/app/(app)/risorse-umane/timbrature/CruscottoTimbrature'

export const dynamic = 'force-dynamic'

const AREA_HR = 'Timbrature HR'

export default async function ValidazionePage() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) redirect('/login')

  const hr = !!session?.user?.permessi?.includes(AREA_HR)
  if (!hr && !(await eResponsabile(email))) redirect('/timbrature')

  return <CruscottoTimbrature />
}
