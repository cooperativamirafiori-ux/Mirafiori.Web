/**
 * Pagina pubblica di conferma del foglio ore mensile (link tokenizzato).
 *
 * Sta fuori dal gruppo (app) perche' non richiede login: il dipendente ci
 * arriva dal pulsante nella mail, quasi sempre dal telefono.
 *
 * Come per la conferma consegna, l'esito passato in query e' solo una
 * preselezione: si registra con un clic esplicito, mai al caricamento. Gli
 * antivirus che scansionano i link seguono le URL delle mail, e una conferma
 * partita da sola sarebbe peggio di una conferma mancante.
 */

import { getChiusuraByToken, primoUltimoGiorno, riepilogoPeriodo, listTimbrature } from '@/lib/timbrature'
import { MESI_IT } from '@/lib/timbrature-flusso'
import { ETICHETTA_STATO } from '@/types/timbrature'
import { ConfermaFoglioOre } from './ConfermaFoglioOre'

export const dynamic = 'force-dynamic'

export default async function FoglioOrePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const sp = await searchParams
  const esitoRaw = Array.isArray(sp.esito) ? sp.esito[0] : sp.esito
  const esitoIniziale = esitoRaw === 'errore' ? 'errore' : 'conferma'

  const trovato = await getChiusuraByToken(token)

  if (!trovato) {
    return (
      <Guscio>
        <Scheda>
          <p className="text-3xl mb-3">🔒</p>
          <p className="font-semibold text-gray-800">Link non valido</p>
          <p className="text-sm text-gray-500 mt-1">
            Questo link non corrisponde a nessun foglio ore, oppure hai gia&apos; risposto e non serve
            piu&apos;. Se hai dubbi scrivi alle Risorse Umane.
          </p>
        </Scheda>
      </Guscio>
    )
  }

  const { chiusura, dipendente } = trovato

  if (chiusura.stato !== 'validato' && chiusura.stato !== 'contestato') {
    return (
      <Guscio>
        <Scheda>
          <p className="text-3xl mb-3">ℹ️</p>
          <p className="font-semibold text-gray-800">Niente da confermare</p>
          <p className="text-sm text-gray-500 mt-1">
            Il foglio ore di {MESI_IT[chiusura.mese]} {chiusura.anno} risulta
            «{ETICHETTA_STATO[chiusura.stato]}».
          </p>
        </Scheda>
      </Guscio>
    )
  }

  const { from, to } = primoUltimoGiorno(chiusura.anno, chiusura.mese)
  const [riepilogo, timbrature] = await Promise.all([
    riepilogoPeriodo(dipendente.id, from, to),
    listTimbrature(dipendente.id, from, to),
  ])

  return (
    <Guscio>
      <ConfermaFoglioOre
        token={token}
        esitoIniziale={esitoIniziale}
        nominativo={dipendente.cognomeNome}
        periodo={`${MESI_IT[chiusura.mese]} ${chiusura.anno}`}
        validatoDa={chiusura.validatoDa ?? ''}
        giaContestato={chiusura.stato === 'contestato'}
        oreLavorate={riepilogo.oreLavorate}
        oreGiustificativo={riepilogo.oreGiustificativo}
        oreAttese={riepilogo.oreAttese}
        giustificativi={riepilogo.giustificativi}
        righe={timbrature.map((t) => ({
          data: t.data,
          servizio: t.servizioNome ?? '',
          orario: t.oraInizio && t.oraFine ? `${t.oraInizio}–${t.oraFine}` : '',
          ore: t.ore,
          perConto: t.perConto,
        }))}
      />
    </Guscio>
  )
}

function Guscio({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-cyan-light/40 via-white to-white flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mirafiori.png" alt="Cooperativa Mirafiori" className="mx-auto w-40 h-auto mb-8" />
        {children}
        <p className="mt-8 text-center text-xs text-gray-400">
          Cooperativa Mirafiori · «Saper essere è saper amare»
        </p>
      </div>
    </div>
  )
}

function Scheda({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 text-center">{children}</div>
  )
}
