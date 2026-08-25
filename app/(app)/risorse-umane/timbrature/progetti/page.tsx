/**
 * Consuntivo ORE PER PROGETTO.
 *
 * Ci entra chi valida i fogli ore: le Risorse Umane (permesso "Timbrature HR")
 * e i responsabili, che vedono i propri collaboratori. Il filtro sui dati lo
 * applica il server (`/api/timbrature/hr/progetti`), non questa pagina.
 *
 * Se un domani a rendicontare i bandi sara' l'ufficio progettazione senza
 * passare dalle HR, la strada e' un permesso d'area suo in AREE_PERMESSI, non
 * un allargamento silenzioso di questo controllo.
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { eResponsabile } from '@/lib/timbrature/data'
import OreProgetti from './OreProgetti'

export const dynamic = 'force-dynamic'

const AREA_HR = 'Timbrature HR'

export default async function OreProgettiPage() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) redirect('/login')

  const hr = !!session?.user?.permessi?.includes(AREA_HR)
  if (!hr && !(await eResponsabile(email))) redirect('/timbrature')

  return <OreProgetti hr={hr} />
}
