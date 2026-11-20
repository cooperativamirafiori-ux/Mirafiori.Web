'use client'

/**
 * Le voci del preventivo.
 *
 * Si sceglie la voce dal tariffario (mai scritta a mano), fra quelle del
 * servizio e dell'ente scelti, e si scrivono le quantità. Il prezzo:
 *   - c'è nel tariffario → è fisso, si vede e basta;
 *   - "da definire" (vuoto nel tariffario) → lo scrive chi fa il preventivo;
 *   - chi ha il permesso Preventivi o "Amministrazione" può cambiarlo comunque
 *     (il server lo consente solo a lui).
 * Ore e giorni si possono scrivere a settimana: il mese è × 4,35.
 */

import { useEffect, useMemo, useState } from 'react'
import { Modale } from '@/components/ui/Modale'
import { inputCls, labelCls } from '@/components/ui/Campo'
import { Pill } from '@/components/ui/Pill'
import { REGIMI_IVA, SETTIMANE_MESE, SUFFISSO_INDIRETTO, UNITA, type RigaPreventivo, type Tariffa } from '@/types/preventivi'
import { euro, importoRiga, numero, problemaPrezzo, quantitaMensile, rigaDaTariffa, tariffaPerCodice } from '@/lib/preventivi/calcoli'

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
  libero,
  disabilitato,
  senzaServizio,
  senzaEnte,
}: {
  righe: RigaPreventivo[]
  onChange: (righe: RigaPreventivo[]) => void
  disponibili: Tariffa[]
  tariffe: Tariffa[]
  dataPrezzi: string
  libero: boolean
  disabilitato: boolean
  senzaServizio: boolean
  senzaEnte: boolean
}) {
  const [scegli, setScegli] = useState(false)
  const cambia = (i: number, patch: Partial<RigaPreventivo>) => onChange(righe.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const togli = (i: number) => onChange(righe.filter((_, j) => j !== i))
  const ammesse = useMemo(() => new Set(disponibili.map((t) => t.codice)), [disponibili])
  const perGruppo = useMemo(() => {
    const m = new Map<string, Tariffa[]>()
    for (const t of disponibili) m.set(t.gruppo, [...(m.get(t.gruppo) ?? []), t])
    return [...m.entries()]
  }, [disponibili])
  const prezzoDi = (t: Tariffa) => (t.prezzo === null ? 'prezzo da scrivere' : euro(t.prezzo))

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-gray-800">Voci</h3>
        {!disabilitato && !senzaServizio && !senzaEnte && (
          <button onClick={() => setScegli(true)} className="px-3 py-2 rounded-xl border border-brand-cyan-dark text-brand-cyan-dark font-semibold bg-white">
            + Aggiungi voce
          </button>
        )}
      </div>
      {senzaServizio ? (
        <p className="text-sm text-gray-500">Scegli prima il servizio: le voci e i prezzi vengono da lì.</p>
      ) : senzaEnte ? (
        <p className="text-sm text-gray-500">Scegli l’ente: i prezzi cambiano fra Torino e gli altri enti.</p>
      ) : (
        !righe.length && <p className="text-sm text-gray-500">Nessuna voce: aggiungine almeno una dal tariffario.</p>
      )}

      <ul className="space-y-3">
        {righe.map((r, i) => {
          const t = tariffaPerCodice(tariffe, r.codice, dataPrezzi)
          const indiretto = r.codice.endsWith(SUFFISSO_INDIRETTO)
          const problema = !t
            ? 'Voce non più nel tariffario per questo periodo'
            : !ammesse.has(t.codice)
              ? 'Non vale per questo servizio o ente: toglila'
              : indiretto
                ? null
                : t.prezzo === null && !(r.prezzo > 0) && r.iva !== 'fic'
                  ? 'Scrivi il prezzo'
                  : problemaPrezzo(t, r.prezzo, libero)
          const daScrivere = t?.prezzo === null
          const prezzoFisso = !t || indiretto || (!daScrivere && !libero)
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
                      {euro(r.prezzo)} <span className="text-xs font-normal text-gray-500">{indiretto ? 'come il costo orario' : 'fisso'}</span>
                    </p>
                  </div>
                ) : (
                  <CampoNumero
                    etichetta={`Prezzo per ${u.etichetta} (€)`}
                    valore={r.prezzo}
                    onChange={(v) => cambia(i, { prezzo: v ?? 0 })}
                    disabilitato={disabilitato}
                    aiuto={
                      daScrivere
                        ? 'Il tariffario non ha ancora un prezzo: scrivilo tu'
                        : t && t.prezzo !== null
                          ? `nel tariffario: ${euro(t.prezzo)}`
                          : undefined
                    }
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
        <Modale titolo="Aggiungi una voce" sottotitolo="Le voci di questo servizio, con i prezzi di questo ente" onChiudi={() => setScegli(false)}>
          {!perGruppo.length && (
            <p className="text-sm text-gray-500">Nessuna voce per questo servizio e questo ente: chiedi ad Andrea di aggiungerla al tariffario.</p>
          )}
          <div className="space-y-4">
            {perGruppo.map(([gruppo, voci]) => (
              <div key={gruppo}>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">{gruppo}</p>
                <ul className="space-y-1.5">
                  {voci.map((t) => (
                    <li key={t.spItemId}>
                      <button
                        onClick={() => {
                          onChange([...righe, rigaDaTariffa(t)])
                          setScegli(false)
                        }}
                        className="w-full text-left rounded-xl border border-gray-200 bg-white px-3 py-2 hover:border-brand-cyan"
                      >
                        <span className="block font-semibold text-gray-800">
                          {t.voce}
                          {t.sottotipo ? <span className="font-normal text-gray-500"> · {t.sottotipo}</span> : null}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {prezzoDi(t)} per {UNITA[t.unita].etichetta} · {REGIMI_IVA[t.iva].etichetta}
                          {righe.some((r) => r.codice === t.codice) ? ' · già inserita' : ''}
                        </span>
                        {t.note && <span className="block text-xs text-gray-500">{t.note}</span>}
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
