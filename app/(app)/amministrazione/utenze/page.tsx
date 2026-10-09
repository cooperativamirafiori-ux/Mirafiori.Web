import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { caricaContesto, getConflittiCc, getDaCollegare, getUtenzeConUltima } from '@/lib/utenze/data'
import { AREA_AMMINISTRAZIONE, type DaCollegare, type StrutturaCc, type UtenzaConUltima } from '@/types/utenze'
import { GestioneUtenze } from './_componenti/GestioneUtenze'

export const dynamic = 'force-dynamic'

/**
 * Utenze: l'elenco di POD, PDR e contratti dell'acqua con la loro struttura
 * (lista SharePoint "Mappatura Utenze"), l'ultima bolletta arrivata e i codici
 * da collegare. Le bollette arrivano da sole dagli XML: docs/utenze.md
 */
export default async function UtenzePage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA_AMMINISTRAZIONE)) redirect('/home')

  const anno = new Date().getFullYear()
  let utenze: UtenzaConUltima[] = []
  let strutture: StrutturaCc[] = []
  let daCollegare: DaCollegare[] = []
  let conflitti: Awaited<ReturnType<typeof getConflittiCc>> = []
  let errore = ''
  try {
    const ctx = await caricaContesto()
    strutture = ctx.strutture
    ;[utenze, daCollegare, conflitti] = await Promise.all([getUtenzeConUltima(ctx.mappatura, anno), getDaCollegare(), getConflittiCc()])
  } catch (e) {
    console.error('[amministrazione/utenze]', e)
    errore = e instanceof Error ? e.message : 'Errore di lettura'
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Utenze" backHref="/amministrazione" backLabel="Torna all'Amministrazione" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Luce, gas e acqua</h2>
        <p className="text-gray-500 mb-6">
          Ogni contatore con la sua struttura. Le bollette arrivano da sole dalle fatture
          elettroniche: quando il codice è qui, la spesa va sulla struttura giusta senza
          che nessuno la tocchi.
        </p>
        <Banner tono="errore">{errore}</Banner>
        {!errore && <GestioneUtenze utenze={utenze} strutture={strutture} daCollegare={daCollegare} conflitti={conflitti} anno={anno} />}
      </main>
    </div>
  )
}
