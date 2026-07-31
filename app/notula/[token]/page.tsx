import { getPrestazioneByToken } from '@/lib/prestazioni'
import { NotulaUploadForm } from './NotulaUploadForm'

export const dynamic = 'force-dynamic'

export default async function NotulaUploadPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const p = await getPrestazioneByToken(token).catch(() => null)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-cyan-light/30 via-white to-white px-5 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mirafiori.png" alt="Cooperativa Mirafiori" className="mx-auto w-40 h-auto mb-6" />

        {!p ? (
          <div className="text-center">
            <div className="text-4xl mb-3">🔒</div>
            <h1 className="text-lg font-bold text-gray-800">Link non valido</h1>
            <p className="text-sm text-gray-500 mt-2">
              Questo link per il caricamento della notula non è valido o è scaduto.
              Contatta il tuo referente in Cooperativa.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-bold text-primary-dark text-center">Carica la notula</h1>
            <p className="text-sm text-gray-500 text-center mt-1">
              Prestazione <strong>{p.idPrestazione}</strong> — {p.cognome} {p.nome}
            </p>
            <p className="text-sm text-gray-500 mt-4">
              Carica la notula precompilata firmata, oppure una notula che hai redatto tu.
            </p>
            <NotulaUploadForm token={token} giaCaricata={!!p.notulaUrl} />
          </>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-gray-400">
        Cooperativa Mirafiori · «Saper essere è saper amare»
      </p>
    </div>
  )
}
