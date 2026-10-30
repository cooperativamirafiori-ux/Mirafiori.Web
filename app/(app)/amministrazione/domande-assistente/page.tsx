/**
 * Amministrazione → Domande all'assistente: il registro ANONIMO di quello che
 * le persone chiedono al bottone "?". Serve a capire dove l'app (o la guida)
 * non è chiara: le risposte segnate "non utile" sono le prime da guardare.
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { Vuoto } from '@/components/ui/Vuoto'
import { Kpi } from '@/components/ui/Kpi'
import { elencoDomande, type DomandaRegistrata } from '@/lib/assistente/registro'

export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'

function quando(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function DomandeAssistentePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>
}) {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA)) redirect('/home')

  const { filtro } = await searchParams
  const soloNonUtili = filtro === 'non-utili'

  let domande: DomandaRegistrata[] = []
  let errore = ''
  try {
    domande = await elencoDomande({ soloNonUtili })
  } catch (e) {
    errore = e instanceof Error ? e.message : 'Errore di lettura'
  }

  const nonUtili = domande.filter((d) => d.utile === false).length
  const utili = domande.filter((d) => d.utile === true).length

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Domande all'assistente" backHref="/amministrazione" backLabel="Torna all'Amministrazione" />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full space-y-5">
        <p className="text-gray-600 text-sm">
          Le ultime domande fatte al bottone «?» in basso a destra. Sono salvate <strong>senza il nome</strong> di
          chi le ha fatte. Una risposta segnata «non utile» di solito vuol dire che manca qualcosa nella guida
          (cartella <code>guida/</code> del progetto) o che una schermata non è chiara.
        </p>

        <Banner tono="errore">{errore && `Impossibile leggere il registro: ${errore}`}</Banner>

        {!soloNonUtili && !errore && (
          <div className="grid grid-cols-3 gap-3">
            <Kpi titolo="Domande" valore={domande.length} dimensione="lg" />
            <Kpi titolo="Utili" valore={utili} dimensione="lg" accento="emerald" />
            <Kpi titolo="Non utili" valore={nonUtili} dimensione="lg" accento="red" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link
            href="/amministrazione/domande-assistente"
            className={`px-3 py-1.5 rounded-full text-sm border ${!soloNonUtili ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            Tutte
          </Link>
          <Link
            href="/amministrazione/domande-assistente?filtro=non-utili"
            className={`px-3 py-1.5 rounded-full text-sm border ${soloNonUtili ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            Solo «non utile»
          </Link>
        </div>

        {!errore && domande.length === 0 && <Vuoto>Nessuna domanda {soloNonUtili ? 'segnata come non utile' : 'ancora'}.</Vuoto>}

        <ul className="space-y-3">
          {domande.map((d) => (
            <li key={d.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>{quando(d.creataIl)}</span>
                {d.pagina && <span className="font-mono">{d.pagina}</span>}
                {d.utile === true && <span className="text-emerald-700 font-semibold">utile</span>}
                {d.utile === false && <span className="text-red-600 font-semibold">non utile</span>}
              </div>
              <p className="mt-2 font-semibold text-gray-800 whitespace-pre-wrap">{d.domanda}</p>
              <details className="mt-2">
                <summary className="text-sm text-brand-cyan-dark cursor-pointer">Risposta data</summary>
                <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{d.risposta}</p>
              </details>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
