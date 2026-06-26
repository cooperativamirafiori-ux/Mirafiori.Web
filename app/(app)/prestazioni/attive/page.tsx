import Link from 'next/link'
import { Header } from '@/components/ui/Header'
import { getPrestazioniAttive } from '@/lib/prestazioni'
import type { Prestazione } from '@/types/prestazioni'
import { GeneraDocumentiButton } from './GeneraDocumentiButton'
import { ChiusuraNotula } from './ChiusuraNotula'
import { VerificaFirmaButton } from './VerificaFirmaButton'
import { ChiudiPraticaButton } from './ChiudiPraticaButton'

export const dynamic = 'force-dynamic'

// Stati in cui il contratto risulta già firmato
const STATI_FIRMATO = new Set<string>([
  'Contratto firmato',
  'In corso',
  'Importo inserito',
  'Notula inviata',
  'Notula ricevuta',
])

const STATO_COLORS: Record<string, string> = {
  Bozza: 'bg-gray-100 text-gray-600',
  'Contratto inviato': 'bg-amber-100 text-amber-700',
  'Contratto firmato': 'bg-blue-100 text-blue-700',
  'In corso': 'bg-blue-100 text-blue-700',
  'Importo inserito': 'bg-purple-100 text-purple-700',
  'Notula inviata': 'bg-amber-100 text-amber-700',
  'Notula ricevuta': 'bg-green-100 text-green-700',
}

export default async function PrestazioniAttivePage() {
  let prestazioni: Prestazione[] = []
  try {
    prestazioni = await getPrestazioniAttive()
  } catch (err) {
    // Lista SharePoint non ancora configurata → mostra empty state senza crashare
    console.error('[prestazioni/attive]', err)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Prestazioni Attive" />

      <main className="flex-1 px-4 py-7 w-full max-w-md mx-auto flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary-dark">Prestazioni in corso</h2>
          <Link href="/prestazioni" className="text-sm text-gray-400 hover:text-gray-600">
            ← Indietro
          </Link>
        </div>

        {prestazioni.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-600 font-medium">Nessuna prestazione attiva</p>
            <p className="text-sm text-gray-400 mt-1">
              Le prestazioni inserite compariranno qui con il loro stato.
            </p>
            <Link
              href="/prestazioni/nuova"
              className="mt-6 inline-block bg-accent-purple text-white font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              ➕ Inserisci nuova prestazione
            </Link>
          </div>
        ) : (
          <section className="flex flex-col gap-3">
            {prestazioni.map((p) => (
              <div
                key={p.spItemId}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Prestatore</p>
                    <span className="font-semibold text-gray-800">
                      {p.cognome} {p.nome}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      STATO_COLORS[p.stato] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {p.stato}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="text-[11px] uppercase tracking-wide text-gray-400">Responsabile</span>
                  <br />
                  {p.responsabileNome || '—'}
                </p>
                <p className="text-xs text-gray-400 mt-2">{p.idPrestazione}</p>
                <p className="text-sm text-gray-500 mt-1 truncate">{p.attivita}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {p.dataInizio?.slice(0, 10)} → {p.dataFine?.slice(0, 10)} · {p.giorni} gg
                </p>
                {STATI_FIRMATO.has(p.stato) && (
                  <p className="mt-2 text-xs font-semibold text-green-700">
                    ✔ Documenti firmati
                    {p.cartellaUrl && (
                      <a
                        href={p.cartellaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 font-normal text-gray-400 hover:text-gray-600"
                      >
                        📁 Cartella
                      </a>
                    )}
                  </p>
                )}

                <GeneraDocumentiButton spItemId={p.spItemId} cartellaUrl={p.cartellaUrl} />
                {p.stato === 'Contratto inviato' && (
                  <VerificaFirmaButton spItemId={p.spItemId} />
                )}
                <ChiusuraNotula spItemId={p.spItemId} importoLordo={p.importoLordo} />
                {p.stato === 'Notula ricevuta' && (
                  <ChiudiPraticaButton spItemId={p.spItemId} />
                )}
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
