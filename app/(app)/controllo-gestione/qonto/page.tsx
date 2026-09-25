/**
 * Qonto — elenco dei conti che l'utente può vedere.
 *
 * Chi ne vede uno solo (il coordinatore di un servizio) non passa di qui: va
 * dritto al suo conto. L'elenco serve a chi ha il Controllo di Gestione, che
 * vede tutto, principale compreso.
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { Kpi } from '@/components/ui/Kpi'
import { Vuoto } from '@/components/ui/Vuoto'
import { accessoQonto, contiVisibili, puoVedereQonto } from '@/lib/qonto/accesso'
import { qontoConfigurato } from '@/lib/qonto/client'
import { getContiQonto } from '@/lib/qonto/data'
import { euro, ibanLeggibile, ora } from '@/lib/qonto/formato'
import type { ContoQonto } from '@/types/qonto'

// Niente `dynamic = 'force-dynamic'`: la pagina è già dinamica perché legge la
// sessione, e quell'opzione spegnerebbe la cache di 60 secondi delle letture
// Qonto (lib/qonto/client.ts).

export default async function QontoPage() {
  const session = await auth()
  const accesso = await accessoQonto(session?.user)
  if (!puoVedereQonto(accesso)) redirect('/home')

  let conti: ContoQonto[] = []
  let errore = ''
  if (!qontoConfigurato()) {
    errore = 'Qonto non è ancora collegato all’app (mancano le credenziali sul server).'
  } else {
    try {
      conti = contiVisibili(await getContiQonto(), accesso)
    } catch (e) {
      console.error('[qonto] elenco conti:', e)
      errore = 'Qonto non risponde in questo momento. Riprova fra qualche minuto.'
    }
  }

  if (!errore && !accesso.tutti && conti.length === 1) redirect(`/controllo-gestione/qonto/${conti[0].id}`)

  const conSaldo = conti.filter((c) => c.saldo !== null)
  const totale = conSaldo.reduce((s, c) => s + (c.saldo ?? 0), 0)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Qonto" backHref="/controllo-gestione" backLabel="Torna al Controllo di Gestione" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full space-y-4">
        <Banner tono="errore">{errore}</Banner>

        {!errore && conti.length === 0 && (
          <Vuoto>Il tuo centro di costo non ha ancora un conto su Qonto.</Vuoto>
        )}

        {conti.length > 1 && (
          <div className="grid grid-cols-2 gap-3">
            <Kpi titolo={accesso.tutti ? 'Totale su tutti i conti' : 'Totale sui tuoi conti'} valore={euro(totale)} />
            <Kpi titolo="Conti" valore={conti.length} dimensione="lg" />
          </div>
        )}

        <ul className="space-y-2">
          {conti.map((c) => (
            <li key={c.id}>
              <Link
                href={`/controllo-gestione/qonto/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:shadow-md transition-shadow"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800">
                    {c.principale ? '★ ' : ''}
                    {c.nome}
                    {c.ccCodice && <span className="ml-2 text-xs font-normal text-gray-400">{c.ccCodice}</span>}
                  </p>
                  <p className="text-xs text-gray-500 font-mono break-all">{ibanLeggibile(c.iban)}</p>
                </div>
                <p className={`text-lg font-bold ${(c.saldo ?? 0) < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                  {euro(c.saldo, c.valuta)}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        {conti.length > 0 && (
          <p className="text-xs text-gray-400 text-center">
            Aggiornato alle {ora()} · i dati di Qonto si rinnovano ogni minuto
          </p>
        )}
      </main>
    </div>
  )
}
