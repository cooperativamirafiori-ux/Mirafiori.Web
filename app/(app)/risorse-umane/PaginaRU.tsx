import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { getItems } from '@/lib/risorse-umane/data'
import { graphRU, isRiautenticazione, isAccessoNegato } from '@/lib/core/graph-delegato'
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
  // Tre esiti diversi, non uno: prima di questa correzione qualunque errore
  // (token scaduto, utente non tra i membri del sito, lista davvero non
  // configurata) veniva mostrato come "lista non configurata", che è
  // fuorviante ed è l'unico caso raro. Stessa distinzione già fatta dal
  // client per le API (lib/risorse-umane/fetch.ts) e dalle route
  // (lib/risorse-umane/api.ts) — qui manca perché questa è la pagina che fa
  // la lettura iniziale lato server, non passa dalle API.
  let erroreLista: 'config' | 'permessi' | null = null
  let messaggioPermessi = ''
  try {
    // Identità dell'utente: la lettura dell'elenco viene tracciata da Purview
    // col suo nome, non con quello dell'applicazione.
    const gc = await graphRU(session.user.email)
    items = await getItems(gc, entity)
  } catch (err) {
    console.error(`[risorse-umane/${entity}]`, err)
    if (isRiautenticazione(err)) {
      // Nessun token Microsoft valido per questo utente: nessun ritentativo
      // aiuta, serve un nuovo accesso. Stesso trattamento del 401 lato client.
      redirect('/login?motivo=sessione-scaduta')
    } else if (isAccessoNegato(err)) {
      erroreLista = 'permessi'
      messaggioPermessi = err.message
    } else {
      erroreLista = 'config'
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title={config.label} backHref="/risorse-umane" backLabel="Torna a Risorse Umane" />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <p className="text-gray-500 mb-6">{DESCRIZIONE[entity]}</p>

        {erroreLista === 'config' && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-6">
            La lista SharePoint non è ancora configurata. Esegui{' '}
            <code className="font-mono">node scripts/provision-risorse-umane.mjs</code> e imposta{' '}
            <code className="font-mono">{ENV_HINT[entity]}</code>.
          </div>
        )}

        {erroreLista === 'permessi' && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3 mb-6">
            {messaggioPermessi}
          </div>
        )}

        <GestioneRU entity={entity} iniziali={items} />
      </main>
    </div>
  )
}
