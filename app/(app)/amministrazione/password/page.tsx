import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { getVociPassword } from '@/lib/password/data'
import type { VocePassword } from '@/types/password'
import { GestionePassword } from './GestionePassword'

export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'

export default async function GestionePasswordPage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA)) redirect('/home')

  let voci: VocePassword[] = []
  let erroreLista = false
  try {
    voci = await getVociPassword()
  } catch (err) {
    // Lista SharePoint non ancora configurata → schermata vuota senza crashare
    console.error('[amministrazione/password]', err)
    erroreLista = true
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        title="Gestione Password"
        backHref="/amministrazione"
        backLabel="Torna all&apos;Amministrazione"
      />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Credenziali della cooperativa</h2>
        <p className="text-gray-500 mb-6">
          Gli accessi ai portali che servono a più persone: banca, enti, fornitori, utenze.
          Un posto solo, invece del foglio Excel e dei post-it. Le vede chi ha il permesso
          Amministrazione.
        </p>

        {erroreLista && (
          <div className="mb-6">
            <Banner tono="avviso">
              La lista SharePoint non è ancora configurata. Esegui{' '}
              <code className="font-mono">node scripts/provision-password.mjs</code> e imposta{' '}
              <code className="font-mono">SP_LIST_PASSWORD</code>.
            </Banner>
          </div>
        )}

        <GestionePassword iniziali={voci} />
      </main>
    </div>
  )
}
