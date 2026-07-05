import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CruscottoTimbrature from './CruscottoTimbrature'

export const dynamic = 'force-dynamic'

const AREA = 'Risorse Umane'

export default async function CruscottoTimbraturePage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA)) redirect('/home')
  return <CruscottoTimbrature />
}
