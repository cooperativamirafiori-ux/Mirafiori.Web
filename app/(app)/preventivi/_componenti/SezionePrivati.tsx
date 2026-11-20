'use client'

/**
 * Solo per i preventivi ai privati (Andrea e Dennis, 18–20/11/2026):
 *   - lavoro indiretto facoltativo, 0,5 h a settimana al costo orario;
 *   - maggiorazione facoltativa del 5% sul costo, prima dell'IVA;
 *   - referenti nella lettera: chi fa il preventivo + un secondo facoltativo.
 */

import { Campo, labelCls } from '@/components/ui/Campo'
import { MAGGIORAZIONE_PRIVATI, SUFFISSO_INDIRETTO, type Persona, type RigaPreventivo } from '@/types/preventivi'
import { rigaIndiretta } from '@/lib/preventivi/calcoli'

export function SezionePrivati({
  righe,
  onRighe,
  maggiorazione,
  onMaggiorazione,
  referente2,
  onReferente2,
  primoReferente,
  disabilitato,
}: {
  righe: RigaPreventivo[]
  onRighe: (r: RigaPreventivo[]) => void
  maggiorazione: boolean
  onMaggiorazione: (v: boolean) => void
  referente2: Persona
  onReferente2: (p: Persona) => void
  primoReferente: string
  disabilitato: boolean
}) {
  const orarioPrivato = righe.find((r) => r.unita === 'ora' && !r.codice.endsWith(SUFFISSO_INDIRETTO))
  const conIndiretto = righe.some((r) => r.codice.endsWith(SUFFISSO_INDIRETTO))
  const aperto = !disabilitato
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <h3 className="font-bold text-gray-800">Preventivo ai privati</h3>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={conIndiretto}
          disabled={!aperto || !orarioPrivato}
          onChange={(e) =>
            onRighe(
              e.target.checked && orarioPrivato
                ? [...righe, rigaIndiretta(orarioPrivato)]
                : righe.filter((r) => !r.codice.endsWith(SUFFISSO_INDIRETTO)),
            )
          }
        />
        <span>
          Aggiungi il lavoro indiretto: 0,5 h a settimana, se serve all’intervento
          {!orarioPrivato && <span className="block text-xs text-gray-500">Prima aggiungi il costo orario fra le voci.</span>}
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={maggiorazione}
          disabled={!aperto}
          onChange={(e) => onMaggiorazione(e.target.checked)}
        />
        <span>Maggiorazione del {MAGGIORAZIONE_PRIVATI}% sul costo (prima dell’IVA)</span>
      </label>
      <div>
        <span className={labelCls}>Referenti nella lettera</span>
        <p className="text-sm text-gray-800">1. {primoReferente || 'chi fa il preventivo'} (chi fa il preventivo)</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Campo
          etichetta="Secondo referente (facoltativo)"
          valore={referente2.nome}
          onChange={(v: string) => onReferente2({ ...referente2, nome: v })}
          disabilitato={!aperto}
        />
        <Campo
          etichetta="Ruolo"
          valore={referente2.ruolo}
          onChange={(v: string) => onReferente2({ ...referente2, ruolo: v })}
          disabilitato={!aperto}
          segnaposto="Educatrice referente…"
        />
        <Campo
          etichetta="Email"
          tipo="email"
          inputMode="email"
          valore={referente2.email}
          onChange={(v: string) => onReferente2({ ...referente2, email: v })}
          disabilitato={!aperto}
        />
      </div>
    </section>
  )
}
