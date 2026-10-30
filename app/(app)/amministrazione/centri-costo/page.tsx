/**
 * Amministrazione → Centri di costo: chi è responsabile di ogni area e chi
 * coordina ogni centro di costo, con la possibilità di cambiarli.
 *
 * È la stessa anagrafica che decide l'accesso ai conti Qonto, alle fatture del
 * servizio, ai lavori di Cura Ambienti e ai costi delle strutture: chi viene
 * nominato qui li vede da subito, chi viene tolto smette di vederli.
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { getRubrica } from '@/lib/core/rubrica'
import { colonneRuoliMancanti, getRuoliCentri, type RuoliCentro } from '@/lib/centri-costo/data'
import { ResponsabiliCentri } from './_componenti/ResponsabiliCentri'

export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'

export default async function CentriCostoPage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA)) redirect('/home')

  let centri: RuoliCentro[] = []
  let mancanti: string[] = []
  let errore = ''
  try {
    ;[centri, mancanti] = await Promise.all([getRuoliCentri(), colonneRuoliMancanti()])
  } catch (err) {
    console.error('[amministrazione/centri-costo]', err)
    errore = 'Non riesco a leggere la lista Centri di Costo su SharePoint. Riprova fra un momento.'
  }
  // Se Graph è muto la rubrica torna vuota e si scrive l'email a mano.
  const rubrica = await getRubrica()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Coordinatori e Responsabili Centri di Costo" backHref="/amministrazione" backLabel="Torna all&apos;Amministrazione" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Responsabili e coordinatori</h2>
        <p className="text-gray-500 mb-6">
          Chi risponde di ogni area e chi coordina ogni servizio. Chi è nominato qui vede il conto
          Qonto, le fatture e i costi del suo servizio; il responsabile d&apos;area li vede per
          tutta l&apos;area.
        </p>
        <ResponsabiliCentri
          iniziali={centri}
          mancantiIniziali={mancanti}
          erroreIniziale={errore}
          rubrica={rubrica}
        />
      </main>
    </div>
  )
}
