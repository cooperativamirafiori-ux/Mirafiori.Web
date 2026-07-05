import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AREA_OPERATORE, AREA_HR } from '@/lib/timbrature-guard'
import TimbratureOperatore from './TimbratureOperatore'

export const dynamic = 'force-dynamic'

export default async function TimbraturePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const permessi = session.user.permessi ?? []
  if (!permessi.includes(AREA_OPERATORE)) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="text-xl font-bold text-gray-800">Timbrature</h1>
        <p className="mt-3 text-gray-500">
          Non hai il permesso per accedere a questa sezione. Contatta le Risorse Umane.
        </p>
        <Link href="/home" className="mt-6 inline-block text-brand-cyan-dark font-semibold">← Torna alla home</Link>
      </div>
    )
  }
  const isHr = permessi.includes(AREA_HR)
  return <TimbratureOperatore nome={session.user.name ?? ''} isHr={isHr} />
}
