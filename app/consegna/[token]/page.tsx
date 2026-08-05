/**
 * Pagina pubblica di conferma consegna (link tokenizzato nella mail).
 *
 * Sta fuori dal gruppo (app) perché non richiede login: il richiedente ci
 * arriva dal pulsante nella mail, spesso dal telefono.
 *
 * L'esito arrivato in query è solo una preselezione: la registrazione avviene
 * con la conferma esplicita dell'utente, mai al caricamento della pagina. I
 * sistemi di scansione dei link seguono le URL delle mail, e una conferma
 * partita da sola sarebbe peggio di una conferma mancante.
 */

import { getAcquistoByToken, acquistiConfigurato } from '@/lib/acquisti/data'
import { dataBreve, ESITI_CONSEGNA, type EsitoConsegna } from '@/types/acquisti'
import { ConfermaConsegna } from './ConfermaConsegna'

export const dynamic = 'force-dynamic'

export default async function ConsegnaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const sp = await searchParams
  const esitoRaw = Array.isArray(sp.esito) ? sp.esito[0] : sp.esito
  const esitoIniziale = ESITI_CONSEGNA.includes(esitoRaw as EsitoConsegna)
    ? (esitoRaw as EsitoConsegna)
    : 'Tutto ok'

  const acquisto = acquistiConfigurato() ? await getAcquistoByToken(token) : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-cyan-light/40 via-white to-white flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-mirafiori.png"
          alt="Cooperativa Mirafiori"
          className="mx-auto w-40 h-auto mb-8"
        />

        {!acquisto ? (
          <Scheda>
            <p className="text-3xl mb-3">🔒</p>
            <p className="font-semibold text-gray-800">Link non valido</p>
            <p className="text-sm text-gray-500 mt-1">
              Questo link non corrisponde a nessuna richiesta. Se ti serve aiuto, scrivi a chi
              gestisce gli acquisti.
            </p>
          </Scheda>
        ) : acquisto.stato !== 'Ordinata' ? (
          <Scheda>
            <p className="text-3xl mb-3">{acquisto.stato === 'Consegnata' ? '✅' : 'ℹ️'}</p>
            <p className="font-semibold text-gray-800">
              {acquisto.stato === 'Consegnata' || acquisto.stato === 'Problema'
                ? 'Hai già risposto'
                : 'Non c’è nulla da confermare'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              La richiesta <strong className="font-mono">{acquisto.codice}</strong> è in stato
              «{acquisto.stato}»
              {acquisto.esitoConsegna ? `, con esito «${acquisto.esitoConsegna}»` : ''}.
            </p>
          </Scheda>
        ) : (
          <ConfermaConsegna
            token={token}
            esitoIniziale={esitoIniziale}
            codice={acquisto.codice}
            descrizione={acquisto.descrizione}
            quantita={acquisto.quantita}
            fornitore={acquisto.fornitore ?? ''}
            luogo={acquisto.luogoConsegna?.value || acquisto.struttura.value}
            dataPrevista={dataBreve(acquisto.dataConsegnaPrevista)}
          />
        )}

        <p className="mt-8 text-center text-xs text-gray-400">
          Cooperativa Mirafiori · «Saper essere è saper amare»
        </p>
      </div>
    </div>
  )
}

function Scheda({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 text-center">
      {children}
    </div>
  )
}
