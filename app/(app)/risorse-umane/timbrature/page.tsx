import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CruscottoTimbrature from './CruscottoTimbrature'

export const dynamic = 'force-dynamic'

// Il cruscotto legge da Supabase: qui il permesso applicativo è il vero
// controllo di accesso, non un filtro di visibilità (punto 14 del piano RU).
// Il ripiego sul permesso storico va rimosso a migrazione completata.
const AREA = 'Timbrature HR'
const AREA_LEGACY = 'Risorse Umane'

export default async function CruscottoTimbraturePage() {
  const session = await auth()
  const permessi = session?.user?.permessi ?? []
  if (!permessi.includes(AREA) && !permessi.includes(AREA_LEGACY)) redirect('/home')
  return <CruscottoTimbrature />
}
