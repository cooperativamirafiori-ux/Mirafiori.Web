import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import { getStrumentiPersona } from '@/lib/it/data'
import { dataBreve } from '@/types/acquisti'
import type { Assegnazione } from '@/types/it'

export const dynamic = 'force-dynamic'

/**
 * "I miei strumenti": cosa ho in carico e cosa ho restituito.
 *
 * Aperta a **tutti**, senza permesso d'area, in sola lettura sul proprio — come
 * Richiesta fattura. Sapere quale portatile risulta tuo non è un'informazione
 * riservata: è la tua.
 */
export default async function MieiStrumentiPage() {
  const session = await auth()
  const mail = session?.user?.email
  if (!mail) redirect('/login')

  const { attivi, passati } = await getStrumentiPersona(mail)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="I miei strumenti" backHref="/home" backLabel="Torna alla Home" />
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">In carico a me</h2>
          {attivi.length === 0 ? (
            <Vuoto>
              Nessun dispositivo o SIM risulta assegnato a te. Se non torna, scrivi all’ufficio IT.
            </Vuoto>
          ) : (
            <div className="space-y-2">
              {attivi.map((a) => (
                <Riga key={`${a.genere}-${a.spItemId}`} a={a} />
              ))}
            </div>
          )}
        </section>

        {passati.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Restituiti</h2>
            <div className="space-y-2 opacity-75">
              {passati.map((a) => (
                <Riga key={`${a.genere}-${a.spItemId}`} a={a} />
              ))}
            </div>
          </section>
        )}

        <p className="text-xs text-gray-400">
          I dati li tiene l’ufficio IT. Per una consegna, una restituzione o una correzione
          bisogna passare da loro.
        </p>
      </main>
    </div>
  )
}

function Riga({ a }: { a: Assegnazione }) {
  const attiva = a.stato === 'Attiva'
  const verbali = [
    a.verbaleConsegnaUrl && { url: a.verbaleConsegnaUrl, testo: 'verbale di consegna' },
    a.verbaleRestituzioneUrl && { url: a.verbaleRestituzioneUrl, testo: 'verbale di restituzione' },
  ].filter(Boolean) as Array<{ url: string; testo: string }>

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Pill
              text={a.genere === 'bene' ? 'dispositivo' : 'SIM'}
              tono={a.genere === 'bene' ? 'azzurro' : 'viola'}
            />
            <span className="font-mono text-xs font-bold text-gray-700">{a.oggettoEtichetta}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            dal {dataBreve(a.dataAssegnazione)}
            {a.dataFine ? ` al ${dataBreve(a.dataFine)}` : attiva ? '' : ''}
            {a.nomeUtenza ? ` · ${a.nomeUtenza}` : ''}
          </p>
        </div>
        {attiva && <Pill text="in carico" tono="verde" />}
      </div>

      {verbali.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {verbali.map((v) => (
            <a
              key={v.url}
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              📄 {v.testo}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
