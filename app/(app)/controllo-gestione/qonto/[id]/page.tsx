/**
 * Qonto · <conto> — saldo, IBAN e ultimi movimenti di un conto.
 *
 * L'accesso si ricontrolla qui, non solo nell'elenco: l'id del conto sta
 * nell'indirizzo, e chiunque potrebbe provare a cambiarlo. Un conto che non
 * si può vedere rimanda all'elenco, senza dire se esiste.
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { Kpi } from '@/components/ui/Kpi'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import { accessoQonto, contiVisibili, puoVedereQonto } from '@/lib/qonto/accesso'
import { qontoConfigurato } from '@/lib/qonto/client'
import { getContiQonto, getMovimentiQonto } from '@/lib/qonto/data'
import { dataBreve, euro, euroConSegno, ora, tipoMovimento } from '@/lib/qonto/formato'
import { CopiaIban } from '../_componenti/CopiaIban'
import type { ContoQonto, MovimentoQonto } from '@/types/qonto'

// Niente `dynamic = 'force-dynamic'`: la pagina è già dinamica perché legge la
// sessione, e quell'opzione spegnerebbe la cache di 60 secondi delle letture
// Qonto (lib/qonto/client.ts).

export default async function ContoQontoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const accesso = await accessoQonto(session?.user)
  if (!puoVedereQonto(accesso)) redirect('/home')
  if (!qontoConfigurato()) redirect('/controllo-gestione/qonto')

  const { id } = await params

  let visibili: ContoQonto[] = []
  let errore = ''
  try {
    visibili = contiVisibili(await getContiQonto(), accesso)
  } catch (e) {
    console.error('[qonto] conti:', e)
    errore = 'Qonto non risponde in questo momento. Riprova fra qualche minuto.'
  }

  const conto = visibili.find((c) => c.id === id)
  if (!errore && !conto) redirect('/controllo-gestione/qonto')

  let movimenti: MovimentoQonto[] = []
  if (conto) {
    try {
      movimenti = await getMovimentiQonto(conto.id)
    } catch (e) {
      console.error('[qonto] movimenti:', e)
      errore = 'Il saldo c’è, ma i movimenti non si sono potuti leggere. Riprova fra qualche minuto.'
    }
  }

  // Chi vede un solo conto è arrivato qui dritto dalla scheda: il genitore è
  // il Controllo di Gestione, non un elenco con una riga sola.
  const unoSolo = visibili.length <= 1 && !accesso.tutti
  const titolo = conto ? `Qonto · ${conto.nome}` : 'Qonto'
  const inAttesa = movimenti.filter((m) => m.stato === 'pending')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        title={titolo}
        backHref={unoSolo ? '/controllo-gestione' : '/controllo-gestione/qonto'}
        backLabel={unoSolo ? 'Torna al Controllo di Gestione' : 'Torna a Qonto'}
      />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full space-y-4">
        <Banner tono="errore">{errore}</Banner>

        {conto && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">
                {conto.principale ? 'Conto principale' : `Conto del servizio${conto.ccCodice ? ` · ${conto.ccCodice}` : ''}`}
              </p>
              <h2 className="text-lg font-bold text-gray-800">{conto.nome}</h2>
            </div>
            <CopiaIban iban={conto.iban} />

            {conto.saldo === null ? (
              <Banner tono="avviso">
                Qonto non mostra il saldo a queste credenziali: la chiave API va generata da un titolare
                o da un amministratore del conto.
              </Banner>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Kpi titolo="Disponibile adesso" valore={euro(conto.saldoDisponibile, conto.valuta)} accento="cyan" />
                <Kpi titolo="Saldo contabile" valore={euro(conto.saldo, conto.valuta)} />
              </div>
            )}
            {conto.saldo !== null && inAttesa.length > 0 && (
              <p className="text-xs text-gray-500">
                Il disponibile tiene già conto di {inAttesa.length === 1 ? '1 pagamento' : `${inAttesa.length} pagamenti`} in
                attesa di essere contabilizzati.
              </p>
            )}
          </section>
        )}

        {conto && (
          <section>
            <h3 className="font-semibold text-gray-700 mb-2">Ultimi movimenti</h3>
            {movimenti.length === 0 && !errore ? (
              <Vuoto>Nessun movimento su questo conto.</Vuoto>
            ) : (
              <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
                {movimenti.map((m) => (
                  <Riga key={m.id} m={m} />
                ))}
              </ul>
            )}
          </section>
        )}

        {conto && (
          <p className="text-xs text-gray-400 text-center">
            Aggiornato alle {ora()} · i dati di Qonto si rinnovano ogni minuto
          </p>
        )}
      </main>
    </div>
  )
}

function Riga({ m }: { m: MovimentoQonto }) {
  const entrata = m.importo > 0
  return (
    <li className="px-4 py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-800 break-words">{m.controparte}</p>
        <p className="text-xs text-gray-500">
          {dataBreve(m.data)} · {tipoMovimento(m.tipo)}
          {m.carta ? ` •••• ${m.carta}` : ''}
        </p>
        {(m.nota || m.riferimento) && (
          <p className="text-xs text-gray-500 mt-0.5 break-words">{m.nota || m.riferimento}</p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {m.stato === 'pending' && <Pill text="In attesa" tono="ambra" />}
          {m.conAllegato && <Pill text="Scontrino" tono="verde" />}
          {!m.conAllegato && m.allegatoObbligatorio && <Pill text="Manca lo scontrino" tono="rosso" />}
        </div>
      </div>
      <p className={`font-semibold whitespace-nowrap ${entrata ? 'text-emerald-700' : 'text-gray-800'}`}>
        {euroConSegno(m.importo)}
      </p>
    </li>
  )
}
