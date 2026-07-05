import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AREA_HR } from '@/lib/timbrature-guard'
import CruscottoHr from './CruscottoHr'

export const dynamic = 'force-dynamic'

export default async function TimbratureHrPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!(session.user.permessi ?? []).includes(AREA_HR)) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="text-xl font-bold text-gray-800">Cruscotto Timbrature — HR</h1>
        <p className="mt-3 text-gray-500">Accesso riservato alle Risorse Umane.</p>
        <Link href="/home" className="mt-6 inline-block text-brand-cyan-dark font-semibold">← Torna alla home</Link>
      </div>
    )
  }
  return <CruscottoHr />
}
