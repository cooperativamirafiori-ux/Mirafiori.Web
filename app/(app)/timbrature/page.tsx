import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AREA_HR } from '@/lib/timbrature-guard'
import TimbratureOperatore from './TimbratureOperatore'

export const dynamic = 'force-dynamic'

export default async function TimbraturePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  // Timbrature: accessibile a tutti gli utenti autenticati (nessun permesso d'area).
  const isHr = (session.user.permessi ?? []).includes(AREA_HR)
  return <TimbratureOperatore nome={session.user.name ?? ''} isHr={isHr} />
}
