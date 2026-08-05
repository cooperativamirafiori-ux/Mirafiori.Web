import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/ui/Header'
import { getItems } from '@/lib/risorse-umane/data'
import { graphRU } from '@/lib/core/graph-delegato'
import { RU_CONFIG, type RUEntity, type RURecord } from '@/types/risorse-umane'
import { GestioneRU } from './GestioneRU'

const ENV_HINT: Record<RUEntity, string> = {
  dipendenti: 'SP_LIST_DIPENDENTI',
  tirocini: 'SP_LIST_TIROCINI',
}

const DESCRIZIONE: Record<RUEntity, string> = {
  dipendenti: 'Anagrafica completa di dipendenti e collaboratori: dati anagrafici, contrattuali e cartella documenti personale.',
  tirocini: 'Tirocinanti e percorsi di inserimento lavorativo.',
}

export async function PaginaRU({ entity }: { entity: RUEntity }) {
  const session = await auth()
  // L'accesso alle anagrafiche segue l'appartenenza al gruppo M365, non un
  // permesso applicativo: punto 14 del piano RU.
  if (!session?.user?.membroRU) redirect('/home')

  const config = RU_CONFIG[entity]
  let items: RURecord[] = []
  let erroreLista = false
  try {
    // Identità dell'utente: la lettura dell'elenco viene tracciata da Purview
    // col suo nome, non con quello dell'applicazione.
    const gc = await graphRU(session.user.email)
    items = await getItems(gc, entity)
  } catch (err) {
    console.error(`[risorse-umane/${entity}]`, err)
    erroreLista = true
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title={`Risorse Umane · ${config.label}`} />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <Link
          href="/risorse-umane"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Torna a Risorse Umane
        </Link>

        <h2 className="text-xl font-bold text-gray-800 mb-1">{config.label}</h2>
        <p className="text-gray-500 mb-6">{DESCRIZIONE[entity]}</p>

        {erroreLista && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-6">
            La lista SharePoint non è ancora configurata. Esegui{' '}
            <code className="font-mono">node scripts/provision-risorse-umane.mjs</code> e imposta{' '}
            <code className="font-mono">{ENV_HINT[entity]}</code>.
          </div>
        )}

        <GestioneRU entity={entity} iniziali={items} />
      </main>
    </div>
  )
}
