import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { assistenzaConfigurata, mieiDispositivi } from '@/lib/assistenza/data'
import { allegatiAttivi } from '@/lib/assistenza/allegati'
import { getStrutture } from '@/lib/strutture/data'
import { NuovaRichiestaAssistenzaForm } from './NuovaRichiestaAssistenzaForm'

export const dynamic = 'force-dynamic'

/**
 * Il form è aperto a tutti: nessun controllo di permesso, come Richiesta
 * fattura. Le due liste che gli servono — i suoi dispositivi e le sedi — si
 * leggono qui e si passano come dati: sono il motivo per cui non deve digitare
 * un numero di inventario a memoria.
 */
export default async function NuovaRichiestaAssistenzaPage() {
  const session = await auth()
  const email = session?.user?.email ?? ''

  if (!assistenzaConfigurata()) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header title="Chiedi assistenza" backHref="/assistenza" backLabel="Torna ad Assistenza IT" />
        <main className="flex-1 px-4 py-8 max-w-lg mx-auto w-full">
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4">
            La sezione non è ancora configurata: avvisa l’amministrazione.
          </div>
        </main>
      </div>
    )
  }

  const [dispositivi, strutture] = await Promise.all([
    mieiDispositivi(email),
    getStrutture().catch(() => []),
  ])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-cyan/10 via-white to-white">
      <Header title="Chiedi assistenza" backHref="/assistenza" backLabel="Torna ad Assistenza IT" />
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6">
        <NuovaRichiestaAssistenzaForm
          dispositivi={dispositivi}
          strutture={strutture.map((s) => ({ id: s.id, label: s.strutturaLabel }))}
          allegatiAttivi={allegatiAttivi()}
        />
      </main>
    </div>
  )
}
