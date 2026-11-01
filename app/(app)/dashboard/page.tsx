import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { getRichiesteAperte, getRichiestaById, getRichiesteCompletateRecenti } from '@/lib/manutenzioni/data'
import { nonLettiPerRichiesta } from '@/lib/manutenzioni/pratica'
import { getTecnici } from '@/lib/strutture/data'
import { Header } from '@/components/ui/Header'
import { RichiestaCard } from './RichiestaCard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>
}) {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/home')
  // ?r=<id> arriva dal link della mail "nuovo messaggio": apre quella richiesta.
  const { r: daAprire } = await searchParams

  const [richieste, tecnici, nonLetti, completateRecenti] = await Promise.all([
    getRichiesteAperte(),
    getTecnici(),
    // I messaggi sono un di più: se non si leggono, il Pannello funziona lo stesso.
    nonLettiPerRichiesta('richiedente').catch((e) => {
      console.error('[dashboard] messaggi non letti:', e)
      return {} as Record<string, number>
    }),
    // Per collegare le fatture che arrivano dopo la chiusura.
    getRichiesteCompletateRecenti().catch((e) => {
      console.error('[dashboard] completate recenti:', e)
      return null
    }),
  ])

  // Richieste già completate su cui il richiedente ha scritto (o aperte dal link
  // della mail): il Pannello mostra solo le non completate, e così il messaggio
  // si perderebbe. Sono poche: si leggono una per una.
  const idAttivi = new Set(richieste.map((r) => r.spItemId))
  const idChiuse = [...new Set([...Object.keys(nonLetti), ...(daAprire ? [daAprire] : [])])]
    .filter((id) => !idAttivi.has(id))
  const chiuseConMessaggi = (
    await Promise.all(idChiuse.map((id) => getRichiestaById(id).catch(() => null)))
  ).filter((r): r is NonNullable<typeof r> => r !== null)

  // Lungo corso è una spunta, non uno stato: la sezione la separa e basta.
  const attive = richieste.filter((r) => !r.lungoCorso)
  const lungoCorso = richieste.filter((r) => r.lungoCorso)

  const aperte = richieste.filter((r) => r.stato === 'Aperta').length
  const inLavorazione = richieste.filter((r) => r.stato === 'In lavorazione').length
  const urgenti = richieste.filter((r) => r.priorita.startsWith('Urgente')).length
  const daAssegnare = attive.filter((r) => (r.stato === 'Aperta' || r.stato === 'Presa in carico') && !r.tecnico).length

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Pannello di controllo" backHref="/manutenzioni" backLabel="Torna a Manutenzioni" />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full space-y-6">

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
            <p className="text-3xl font-bold text-red-600">{aperte}</p>
            <p className="text-xs text-gray-500 mt-1">Aperte</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
            <p className="text-3xl font-bold text-orange-500">{inLavorazione}</p>
            <p className="text-xs text-gray-500 mt-1">In lavorazione</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
            <p className="text-3xl font-bold text-red-700">{urgenti}</p>
            <p className="text-xs text-gray-500 mt-1">Urgenti</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
            <p className="text-3xl font-bold text-primary">{daAssegnare}</p>
            <p className="text-xs text-gray-500 mt-1">Da assegnare</p>
          </div>
        </div>

        {/* Lista */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">
              Richieste attive <span className="text-gray-400 font-normal">({attive.length})</span>
            </h2>
          </div>

          {attive.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-10 text-center text-gray-400">
              Nessuna richiesta attiva 🎉
            </div>
          ) : (
            <div className="space-y-3">
              {attive.map((r) => (
                <RichiestaCard key={r.spItemId} richiesta={r} tecnici={tecnici}
                  nonLetti={nonLetti[r.spItemId] ?? 0} apertaAllInizio={daAprire === r.spItemId} />
              ))}
            </div>
          )}
        </div>

        {chiuseConMessaggi.length > 0 && (
          <div>
            <h2 className="font-semibold text-gray-700 mb-3">
              Completate, con messaggi <span className="text-gray-400 font-normal">({chiuseConMessaggi.length})</span>
            </h2>
            <div className="space-y-3">
              {chiuseConMessaggi.map((r) => (
                <RichiestaCard key={r.spItemId} richiesta={r} tecnici={tecnici}
                  nonLetti={nonLetti[r.spItemId] ?? 0} apertaAllInizio={daAprire === r.spItemId} />
              ))}
            </div>
          </div>
        )}

        {/* Lungo corso */}
        <div>
          <div className="mb-3">
            <h2 className="font-semibold text-gray-700">
              ⏳ Lungo corso <span className="text-gray-400 font-normal">({lungoCorso.length})</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Lavori di mesi: restano qui finché non togli la spunta o chiudi la richiesta.</p>
          </div>

          {lungoCorso.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
              Nessun lavoro di lungo corso.
            </div>
          ) : (
            <div className="space-y-3">
              {lungoCorso.map((r) => (
                <RichiestaCard key={r.spItemId} richiesta={r} tecnici={tecnici}
                  nonLetti={nonLetti[r.spItemId] ?? 0} apertaAllInizio={daAprire === r.spItemId} />
              ))}
            </div>
          )}
        </div>
        {/* Completate di recente: le fatture arrivano spesso dopo la chiusura */}
        <details className="group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2 rounded-xl bg-white border border-gray-200 px-4 py-3">
            <span>
              <span className="font-semibold text-gray-700">Completate negli ultimi 4 mesi</span>{' '}
              <span className="text-gray-400">({completateRecenti?.length ?? '—'})</span>
              <span className="block text-xs text-gray-500">Per collegare fatture e costi arrivati dopo la chiusura.</span>
            </span>
            <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="space-y-3 mt-3">
            {completateRecenti === null ? (
              <p className="text-sm text-red-600">Non riesco a leggere le richieste completate. Ricarica la pagina.</p>
            ) : completateRecenti.filter((r) => !chiuseConMessaggi.some((c) => c.spItemId === r.spItemId)).length === 0 ? (
              <p className="text-sm text-gray-400">Nessuna richiesta completata di recente.</p>
            ) : (
              completateRecenti
                .filter((r) => !chiuseConMessaggi.some((c) => c.spItemId === r.spItemId))
                .map((r) => (
                  <RichiestaCard key={r.spItemId} richiesta={r} tecnici={tecnici} nonLetti={nonLetti[r.spItemId] ?? 0} />
                ))
            )}
          </div>
        </details>
      </main>
    </div>
  )
}
