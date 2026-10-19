'use client'

/**
 * Le voci del preventivo.
 *
 * Si sceglie la voce dal tariffario (mai scritta a mano) e si scrivono le
 * quantità. Il prezzo:
 *   - bloccato → si vede e basta;
 *   - libero   → si sceglie fra il minimo e il massimo del tariffario;
 *   - chi ha "Amministrazione" può uscire dai limiti (il server lo consente
 *     solo a lui).
 * Ore e giorni si possono scrivere a settimana: il mese è × 4,35.
 */

import { useEffect, useMemo, useState } from 'react'
import { Modale } from '@/components/ui/Modale'
import { inputCls, labelCls } from '@/components/ui/Campo'
import { Pill } from '@/components/ui/Pill'
import { REGIMI_IVA, SETTIMANE_MESE, UNITA, type RigaPreventivo, type Tariffa } from '@/types/preventivi'
import { euro, importoRiga, numero, problemaPrezzo, quantitaMensile, tariffaPerCodice } from '@/lib/preventivi/calcoli'

const n = (v: string): number | null => (v.trim() === '' ? null : Number(v.replace(',', '.')))
const s = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))

function CampoNumero({
  etichetta,
  valore,
  onChange,
  disabilitato,
  aiuto,
}: {
  etichetta: string
  valore: number | null | undefined
  onChange: (v: number | null) => void
  disabilitato?: boolean
  aiuto?: string
}) {
  const [testo, setTesto] = useState(s(valore))
  // Se il valore cambia da fuori (prezzi riallineati, cambio settimana/mese)
  // il campo si riallinea; mentre si scrive "1," invece resta com'è.
  useEffect(() => {
    if (n(testo) !== (valore ?? null)) setTesto(s(valore))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valore])
  return (
    <label className="block">
      <span className={labelCls}>{etichetta}</span>
      <input
        className={`${inputCls} ${disabilitato ? 'bg-gray-50 text-gray-500' : ''}`}
        inputMode="decimal"
        value={testo}
        disabled={disabilitato}
        onChange={(e) => {
          setTesto(e.target.value)
          const v = n(e.target.value)
          if (v === null || Number.isFinite(v)) onChange(v)
        }}
      />
      {aiuto && <span className="block text-xs text-gray-500 mt-1">{aiuto}</span>}
    </label>
  )
}

export function Voci({
  righe,
  onChange,
  disponibili,
  tariffe,
  dataPrezzi,
  ambito,
  libero,
  giorniRetta,
  disabilitato,
  nuovaRiga,
}: {
  righe: RigaPreventivo[]
  onChange: (righe: RigaPreventivo[]) => void
  disponibili: Tariffa[]
  tariffe: Tariffa[]
  dataPrezzi: string
  ambito: string
  libero: boolean
  giorniRetta: number
  disabilitato: boolean
  nuovaRiga: (t: Tariffa, giorni: number) => RigaPreventivo
}) {
  const [scegli, setScegli] = useState(false)
  const cambia = (i: number, patch: Partial<RigaPreventivo>) => onChange(righe.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const togli = (i: number) => onChange(righe.filter((_, j) => j !== i))
  const perGruppo = useMemo(() => {
    const m = new Map<string, Tariffa[]>()
    for (const t of disponibili) m.set(t.gruppo, [...(m.get(t.gruppo) ?? []), t])
    return [...m.entries()]
  }, [disponibili])

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-gray-800">Voci</h3>
        {!disabilitato && (
          <button onClick={() => setScegli(true)} className="px-3 py-2 rounded-xl border border-brand-cyan-dark text-brand-cyan-dark font-semibold bg-white">
            + Aggiungi voce
          </button>
        )}
      </div>
      {!righe.length && <p className="text-sm text-gray-500">Nessuna voce: aggiungine almeno una dal tariffario.</p>}

      <ul className="space-y-3">
        {righe.map((r, i) => {
          const t = tariffaPerCodice(tariffe, r.codice, dataPrezzi, ambito)
          const problema = t ? problemaPrezzo(t, r.prezzo, libero) : 'Voce non più nel tariffario per questo periodo'
          const prezzoFisso = !t || (t.bloccato && !libero)
          const aSettimana = r.perSettimana !== null && r.perSettimana !== undefined
          const u = UNITA[r.unita]
          return (
            <li key={`${r.codice}-${i}`} className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 grow">
                  <p className="font-semibold text-gray-800">{r.voce}</p>
                  <p className="text-xs text-gray-500">
                    {r.gruppo} · {REGIMI_IVA[r.iva].etichetta}
                  </p>
                </div>
                {!disabilitato && (
                  <button onClick={() => togli(i)} className="text-sm text-red-600 px-2 py-1" aria-label={`Togli ${r.voce}`}>
                    Togli
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {prezzoFisso ? (
                  <div>
                    <span className={labelCls}>Prezzo per {u.etichetta}</span>
                    <p className="py-2 font-semibold text-gray-800">
                      {euro(r.prezzo)} <span className="text-xs font-normal text-gray-500">fisso</span>
                    </p>
                  </div>
                ) : (
                  <CampoNumero
                    etichetta={`Prezzo per ${u.etichetta} (€)`}
                    valore={r.prezzo}
                    onChange={(v) => cambia(i, { prezzo: v ?? 0 })}
                    disabilitato={disabilitato}
                    aiuto={t && (t.min != null || t.max != null) ? `fra ${euro(t.min ?? 0)} e ${euro(t.max ?? t.prezzo)}` : undefined}
                  />
                )}

                {r.unita === 'km' ? (
                  <CampoNumero
                    etichetta="Accompagnamenti al mese"
                    valore={r.accompagnamenti}
                    onChange={(v) => cambia(i, { accompagnamenti: v ?? 0 })}
                    disabilitato={disabilitato}
                  />
                ) : aSettimana ? (
                  <CampoNumero
                    etichetta={`${u.plurale[0].toUpperCase()}${u.plurale.slice(1)} a settimana`}
                    valore={r.perSettimana}
                    onChange={(v) => cambia(i, { perSettimana: v ?? 0 })}
                    disabilitato={disabilitato}
                    aiuto={`nel mese: ${numero(quantitaMensile(r))} (× ${String(SETTIMANE_MESE).replace('.', ',')})`}
                  />
                ) : (
                  <CampoNumero
                    etichetta={`${u.plurale[0].toUpperCase()}${u.plurale.slice(1)} al mese`}
                    valore={r.quantita}
                    onChange={(v) => cambia(i, { quantita: v ?? 0 })}
                    disabilitato={disabilitato}
                  />
                )}
              </div>

              {r.unita === 'km' && (
                <div className="grid grid-cols-2 gap-3">
                  <CampoNumero
                    etichetta="Km per accompagnamento"
                    valore={r.kmAccompagnamento}
                    onChange={(v) => cambia(i, { kmAccompagnamento: v ?? 0 })}
                    disabilitato={disabilitato}
                  />
                  <label className="block">
                    <span className={labelCls}>Percorso da/a</span>
                    <input
                      className={`${inputCls} ${disabilitato ? 'bg-gray-50 text-gray-500' : ''}`}
                      value={r.percorso ?? ''}
                      disabled={disabilitato}
                      onChange={(e) => cambia(i, { percorso: e.target.value })}
                    />
                  </label>
                </div>
              )}

              {(r.unita === 'ora' || r.unita === 'giorno') && !disabilitato && (
                <button
                  onClick={() =>
                    cambia(
                      i,
                      aSettimana
                        ? { perSettimana: null, quantita: quantitaMensile(r) }
                        : { perSettimana: r.quantita ? Math.round((r.quantita / SETTIMANE_MESE) * 100) / 100 : 0 },
                    )
                  }
                  className="text-sm text-brand-cyan-dark underline"
                >
                  {aSettimana ? 'Scrivo il totale del mese' : 'Scrivo quante a settimana'}
                </button>
              )}

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-600">
                  {numero(quantitaMensile(r))} {u.plurale} × {euro(r.prezzo)} =
                </span>
                <span className="font-bold text-gray-900">{euro(importoRiga(r))}</span>
                {problema && <Pill text={problema} tono="rosso" />}
              </div>
            </li>
          )
        })}
      </ul>

      {scegli && (
        <Modale titolo="Aggiungi una voce" sottotitolo="Dal tariffario in vigore per questo periodo" onChiudi={() => setScegli(false)}>
          {!perGruppo.length && <p className="text-sm text-gray-500">Nessuna voce disponibile per questo modello.</p>}
          <div className="space-y-4">
            {perGruppo.map(([gruppo, voci]) => (
              <div key={gruppo}>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">{gruppo}</p>
                <ul className="space-y-1.5">
                  {voci.map((t) => (
                    <li key={t.spItemId}>
                      <button
                        onClick={() => {
                          onChange([...righe, nuovaRiga(t, giorniRetta)])
                          setScegli(false)
                        }}
                        className="w-full text-left rounded-xl border border-gray-200 bg-white px-3 py-2 hover:border-brand-cyan"
                      >
                        <span className="block font-semibold text-gray-800">{t.voce}</span>
                        <span className="block text-xs text-gray-500">
                          {t.bloccato ? `${euro(t.prezzo)} fisso` : t.min != null || t.max != null ? `${euro(t.min ?? 0)} – ${euro(t.max ?? t.prezzo)}` : euro(t.prezzo)}{' '}
                          per {UNITA[t.unita].etichetta}
                          {t.ambito !== 'Tutti' ? ` · ${t.ambito}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Modale>
      )}
    </section>
  )
}
