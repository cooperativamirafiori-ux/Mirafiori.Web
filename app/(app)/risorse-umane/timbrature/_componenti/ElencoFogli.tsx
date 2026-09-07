'use client'

/**
 * L'elenco dei fogli ore del mese, una riga per persona.
 *
 * ⚠️ NIENTE <table> (7 set 2026). Prima era una tabella a quattro colonne con
 * l'ultima cella `whitespace-nowrap` piena di comandi, dentro un contenitore
 * `overflow-hidden`: su un telefono il tasto "Valida" finiva oltre il bordo
 * dello schermo, tagliato e non raggiungibile — un responsabile in giro fra le
 * strutture, che ha con se' solo il telefono, non poteva validare niente.
 *
 * Qui ogni riga e' un blocco che si impila sotto i 640px e si distende in
 * orizzontale da li' in su, e i comandi vanno a capo invece di uscire. Nessuna
 * scorciatoia con `overflow-x-auto`: l'azione principale di una schermata non
 * si raggiunge scorrendo di lato.
 */

import type { StatoDipendenteMese } from '@/types/timbrature'
import { oreLabel, scostClasse, segno } from '@/app/(app)/timbrature/_componenti/mese'
import { BadgeStato } from './BadgeStato'

interface Props {
  righe: StatoDipendenteMese[]
  isHr: boolean
  /** Un'azione e' in corso: si spengono i comandi per non doppiarla. */
  azione: boolean
  /** Chi e' stato aperto con "Controlla": prima di allora non si valida. */
  visionati: Set<number>
  onControlla: (dipendenteId: number) => void
  onValida: (dipendenteId: number, nominativo: string, anticipata: boolean) => void
  onForza: (dipendenteId: number, nominativo: string) => void
  onRiapri: (dipendenteId: number) => void
}

export function ElencoFogli({
  righe,
  isHr,
  azione,
  visionati,
  onControlla,
  onValida,
  onForza,
  onRiapri,
}: Props) {
  if (righe.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-8 text-center text-gray-400 text-sm">
        {isHr
          ? 'Nessun dipendente abilitato. Spunta "Timbratura attiva" sulle schede in Risorse Umane, poi premi "Sincronizza da anagrafica".'
          : 'Nessun collaboratore assegnato: in anagrafica nessuno ti indica come referente del foglio ore.'}
      </div>
    )
  }

  return (
    <ul className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
      {righe.map((s) => {
        const visto = visionati.has(s.dipendenteId)
        /*
         * Un mese ancora aperto si valida se non ha piu' giornate scoperte: e'
         * la chiusura anticipata, il caso "sono in ferie dal 20 al 31, il
         * foglio e' finito". Con dei buchi il tasto resta spento, e non c'e'
         * scappatoia nemmeno per le HR: un foglio ore incompleto non si chiude.
         */
        const anticipabile = s.stato === 'aperto' && s.completo
        const puoValidare = s.stato === 'da_validare' || s.stato === 'contestato' || anticipabile

        return (
          <li key={s.dipendenteId} className="px-4 py-3 sm:flex sm:items-center sm:gap-4 hover:bg-gray-50">
            {/* Chi, e come sta il suo mese */}
            <div className="min-w-0 sm:flex-1">
              <div className="font-medium text-gray-800 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="break-words">{s.cognomeNome}</span>
                {s.disattivato && (
                  <span
                    title="Non più abilitato alle timbrature: compare per permettere la chiusura dell'ultimo mese"
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600"
                  >
                    non più attivo
                  </span>
                )}
                <BadgeStato stato={s.stato} />
              </div>
              <div className="text-xs text-gray-400 break-all">{s.email}</div>
              <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  <span className="text-gray-800 font-medium">{oreLabel(s.oreLavorate)}</span>
                  <span className="text-gray-400"> / {oreLabel(s.oreAttese)} h</span>
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${scostClasse(s.scostamento)}`}
                  title="Scostamento fra ore coperte e ore attese dell'intero mese"
                >
                  {segno(s.scostamento)}
                </span>
                {s.stato === 'validato' && s.giorniInAttesa != null && (
                  <span className="text-gray-400">in attesa da {s.giorniInAttesa} gg</span>
                )}
                {s.confermatoForzato && <span className="text-gray-400">senza riscontro</span>}
              </div>
            </div>

            {/* I comandi: vanno a capo, non fuori schermo */}
            <div className="mt-3 sm:mt-0 flex flex-wrap items-center gap-2 sm:justify-end sm:shrink-0">
              <button
                onClick={() => onControlla(s.dipendenteId)}
                className="rounded-lg border border-brand-cyan/50 text-brand-cyan-dark font-semibold px-3 py-2 text-sm"
              >
                Controlla
              </button>
              {s.filePdfUrl && (
                <a
                  href={s.filePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-gray-300 text-gray-600 px-3 py-2 text-sm"
                >
                  PDF
                </a>
              )}
              {s.fileUrl && (
                <a
                  href={s.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-gray-300 text-gray-600 px-3 py-2 text-sm"
                >
                  Excel
                </a>
              )}
              {puoValidare && (
                <button
                  onClick={() => onValida(s.dipendenteId, s.cognomeNome, anticipabile)}
                  disabled={azione || !visto}
                  title={
                    !visto
                      ? 'Apri “Controlla” prima di validare'
                      : anticipabile
                        ? 'Il mese è completo: si può chiudere senza aspettare la scadenza'
                        : ''
                  }
                  className="grow sm:grow-0 text-white bg-primary disabled:bg-gray-300 rounded-lg px-3 py-2 text-sm font-semibold"
                >
                  {anticipabile ? 'Chiudi e valida' : 'Valida'}
                </button>
              )}
              {s.stato === 'validato' && (
                <button
                  onClick={() => onForza(s.dipendenteId, s.cognomeNome)}
                  disabled={azione}
                  className="grow sm:grow-0 rounded-lg border border-amber-400 text-amber-700 font-semibold px-3 py-2 text-sm"
                >
                  Chiudi senza risposta
                </button>
              )}
              {isHr && (s.stato === 'confermato' || s.stato === 'validato') && (
                <button
                  onClick={() => onRiapri(s.dipendenteId)}
                  disabled={azione}
                  className="rounded-lg border border-gray-300 text-gray-600 font-semibold px-3 py-2 text-sm"
                >
                  Riapri
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
