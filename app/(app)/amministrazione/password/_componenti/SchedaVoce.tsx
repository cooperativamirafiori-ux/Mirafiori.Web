'use client'

/**
 * La card di una voce dell'archivio, con le sue due righe riservate.
 *
 * Sta in un file suo perché `GestionePassword.tsx` aveva passato le 500 righe
 * (regola 5 di CLAUDE.md), e questo è il taglio naturale: qui dentro non c'è
 * stato, solo come si mostra una voce. Chi cerca "perché la password è coperta"
 * apre questo file; chi cerca "cosa manda il form" apre l'altro.
 *
 * Sotto i 640px va tutto in colonna: i comandi vanno a capo con `flex-wrap`,
 * i valori lunghi con `break-all`. Nessuna tabella, nessuno scorrimento
 * laterale — regola 5-bis.
 */

import { Pill } from '@/components/ui/Pill'
import { giorniDa, passwordVecchia, type VocePassword } from '@/types/password'
import { stileCategoria } from './colori'

const dataIt = (d?: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('it-IT') : '—'

/** Una voce dell'archivio. Sotto i 640px tutto va in colonna. */
export function SchedaVoce({
  voce,
  scoperti,
  copiato,
  onScopri,
  onCopia,
  onModifica,
  onElimina,
  disabilitato,
}: {
  voce: VocePassword
  scoperti: Record<string, boolean>
  copiato: string | null
  onScopri: (chiave: string) => void
  onCopia: (chiave: string, valore: string) => void
  onModifica: () => void
  onElimina: () => void
  disabilitato: boolean
}) {
  const vecchia = passwordVecchia(voce)
  const giorni = giorniDa(voce.ultimaModificaPassword ?? voce.dataInserimento)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-800 break-words">{voce.nome}</h3>
            {/* Stesso colore del bottone di filtro: il gruppo si riconosce a colpo d'occhio. */}
            {voce.categoria && (
              <Pill text={voce.categoria} cls={stileCategoria(voce.categoria).pill} />
            )}
            {vecchia && (
              <Pill
                text={giorni != null ? `Da cambiare · ${Math.floor(giorni / 30)} mesi` : 'Da cambiare'}
                tono="ambra"
              />
            )}
          </div>
          {voce.linkSito && (
            <a
              href={voce.linkSito}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-slate-600 underline hover:text-slate-800 break-all"
            >
              Apri il sito ↗
            </a>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onModifica}
            disabled={disabilitato}
            className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Modifica
          </button>
          <button
            onClick={onElimina}
            disabled={disabilitato}
            className="text-xs font-semibold text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50"
          >
            Elimina
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-sm">
        {voce.nomeUtente && (
          <RigaValore
            etichetta="Utente"
            valore={voce.nomeUtente}
            chiave={`${voce.spItemId}:utente`}
            sempreVisibile
            copiato={copiato}
            scoperti={scoperti}
            onScopri={onScopri}
            onCopia={onCopia}
          />
        )}
        {voce.password && (
          <RigaValore
            etichetta="Password"
            valore={voce.password}
            chiave={`${voce.spItemId}:pwd`}
            copiato={copiato}
            scoperti={scoperti}
            onScopri={onScopri}
            onCopia={onCopia}
          />
        )}
        {voce.pin && (
          <RigaValore
            etichetta="PIN"
            valore={voce.pin}
            chiave={`${voce.spItemId}:pin`}
            copiato={copiato}
            scoperti={scoperti}
            onScopri={onScopri}
            onCopia={onCopia}
          />
        )}
        {voce.telefonoVerifica && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-gray-400 w-28 shrink-0">Verifica 2 fattori</span>
            <a
              href={`tel:${voce.telefonoVerifica.replace(/\s/g, '')}`}
              className="text-gray-700 font-medium break-all underline decoration-gray-300"
            >
              {voce.telefonoVerifica}
            </a>
          </div>
        )}
      </div>

      {voce.note && <p className="mt-3 text-sm text-gray-500 whitespace-pre-wrap">{voce.note}</p>}

      <p className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        Inserita il {dataIt(voce.dataInserimento)} · password cambiata il{' '}
        {dataIt(voce.ultimaModificaPassword)}
      </p>
    </div>
  )
}

/** Riga etichetta/valore con "mostra" e "copia". I valori riservati partono coperti. */
function RigaValore({
  etichetta,
  valore,
  chiave,
  sempreVisibile,
  scoperti,
  copiato,
  onScopri,
  onCopia,
}: {
  etichetta: string
  valore: string
  chiave: string
  /** Per l'utente: non è un segreto, si legge senza premere niente. */
  sempreVisibile?: boolean
  scoperti: Record<string, boolean>
  copiato: string | null
  onScopri: (chiave: string) => void
  onCopia: (chiave: string, valore: string) => void
}) {
  const visibile = sempreVisibile || !!scoperti[chiave]

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-gray-400 w-28 shrink-0">{etichetta}</span>
      <span className={`text-gray-800 break-all ${sempreVisibile ? 'font-medium' : 'font-mono'}`}>
        {visibile ? valore : '••••••••'}
      </span>
      <span className="flex gap-3 text-xs">
        {!sempreVisibile && (
          <button
            onClick={() => onScopri(chiave)}
            className="text-slate-500 hover:text-slate-700 underline"
          >
            {visibile ? 'nascondi' : 'mostra'}
          </button>
        )}
        <button
          onClick={() => onCopia(chiave, valore)}
          className="text-slate-500 hover:text-slate-700 underline"
        >
          {copiato === chiave ? 'copiato ✓' : 'copia'}
        </button>
      </span>
    </div>
  )
}
