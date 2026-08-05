import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import CruscottoTimbrature from './CruscottoTimbrature'

export const dynamic = 'force-dynamic'

// Il cruscotto legge da Supabase: qui il permesso applicativo è il vero
// controllo di accesso, non un filtro di visibilità (punto 14 del piano RU).
const AREA = 'Timbrature HR'

export default async function CruscottoTimbraturePage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA)) redirect('/home')
  return <CruscottoTimbrature />
}
