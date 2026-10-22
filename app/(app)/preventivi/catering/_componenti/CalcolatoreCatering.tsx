'use client'

/**
 * Calcolatore dei preventivi catering. Si scrivono i sei dati dell'evento e il
 * conto si aggiorna mentre si scrive, come nel foglio Excel. Il tasto
 * "Parametri" apre €/km, €/ora, coperto e IVA: li vedono tutti, li salva chi ha
 * Amministrazione. Niente si salva del preventivo: è un calcolatore.
 */

import { useMemo, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Campo } from '@/components/ui/Campo'
import { Modale } from '@/components/ui/Modale'
import {
  ETICHETTE_PARAMETRI,
  calcolaCatering,
  numeroDa,
  type DatiCatering,
  type ParametriCatering,
} from '@/lib/preventivi/catering-calcoli'

const euro = (x: number) => x.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const num = (x: number) => x.toLocaleString('it-IT', { maximumFractionDigits: 2 })

type Chiave = keyof DatiCatering

const CAMPI: { k: Chiave; etichetta: string; aiuto?: string; decimali?: boolean }[] = [
  { k: 'ospiti', etichetta: 'Quanti ospiti?' },
  { k: 'ciboPersona', etichetta: 'Costo del SOLO CIBO a persona (€)', decimali: true },
  { k: 'berePersona', etichetta: 'Costo del BERE a persona (€)', aiuto: 'Lascia vuoto se il bere non è compreso.', decimali: true },
  { k: 'kmAndata', etichetta: 'Km dalla Locanda (SOLO ANDATA)', aiuto: 'Il ritorno lo conta l’app.', decimali: true },
  { k: 'personale', etichetta: 'Quante persone di servizio?' },
  {
    k: 'ore',
    etichetta: 'Per quante ore?',
    aiuto: 'Dalla partenza dalla Locanda al rientro.',
    decimali: true,
  },
]

const VUOTO: Record<Chiave, string> = { ospiti: '', ciboPersona: '', berePersona: '', kmAndata: '', personale: '', ore: '' }

export function CalcolatoreCatering({
  parametriIniziali,
  avviso,
  modificabile,
}: {
  parametriIniziali: ParametriCatering
  avviso?: string
  modificabile: boolean
}) {
  const [valori, setValori] = useState<Record<Chiave, string>>(VUOTO)
  const [parametri, setParametri] = useState(parametriIniziali)
  const [apriParametri, setApriParametri] = useState(false)
  const [conferma, setConferma] = useState('')

  const dati: DatiCatering = useMemo(() => {
    const d = {} as DatiCatering
    for (const c of CAMPI) d[c.k] = numeroDa(valori[c.k]) ?? 0
    return d
  }, [valori])
  const r = useMemo(() => calcolaCatering(dati, parametri), [dati, parametri])

  const voci = [
    { t: 'Cibo', v: r.cibo, come: `${num(dati.ospiti)} ospiti × ${euro(dati.ciboPersona)}` },
    { t: 'Bere', v: r.bere, come: `${num(dati.ospiti)} ospiti × ${euro(dati.berePersona)}` },
    { t: 'Trasporto', v: r.trasporto, come: `${num(dati.kmAndata)} km × 2 (andata e ritorno) × ${euro(parametri.costoKm)}` },
    { t: 'Personale', v: r.personale, come: `${num(dati.personale)} persone × ${num(dati.ore)} h × ${euro(parametri.costoOraPersonale)}` },
    { t: 'Coperto', v: r.coperto, come: `${num(dati.ospiti)} ospiti × ${euro(parametri.costoCoperto)}` },
  ]

  const copia = async () => {
    const righe = [
      `Preventivo catering — ${num(dati.ospiti)} ospiti`,
      ...voci.map((x) => `${x.t}: ${euro(x.v)} (${x.come})`),
      `Costo totale: ${euro(r.totale)}`,
      `Ricarico ${num(parametri.ricaricoPercento)}%: ${euro(r.ricarico)}`,
      `Prezzo IVA esclusa: ${euro(r.imponibile)}`,
      `IVA ${num(parametri.ivaPercento)}%: ${euro(r.iva)}`,
      `Prezzo con IVA: ${euro(r.totaleConIva)}`,
      r.aPersona != null ? `Prezzo a persona: ${euro(r.aPersona)}` : '',
    ].filter(Boolean)
    try {
      await navigator.clipboard.writeText(righe.join('\n'))
      setConferma('Riepilogo copiato: puoi incollarlo in una mail o in un messaggio.')
    } catch {
      setConferma('Non riesco a copiare da questo browser.')
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="font-bold">Inserisci i COSTI, non i prezzi di vendita</p>
        <p className="text-sm mt-1">
          Scrivi quanto ci costa produrre il catering (cibo, bere, personale, trasporto). Il ricarico del{' '}
          {num(parametri.ricaricoPercento)}% e l’IVA vengono aggiunti in automatico: il totale in fondo è già il
          prezzo da proporre al cliente.
        </p>
      </section>

      <Banner tono="avviso">{avviso}</Banner>
      <Banner tono="ok">{conferma}</Banner>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setApriParametri(true)}
          className="grow sm:grow-0 min-h-[44px] px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold"
        >
          ⚙️ Parametri
        </button>
        <p className="w-full sm:w-auto text-xs text-gray-500">
          {euro(parametri.costoKm)}/km · {euro(parametri.costoOraPersonale)}/ora · coperto {euro(parametri.costoCoperto)} · ricarico {num(parametri.ricaricoPercento)}% · IVA{' '}
          {num(parametri.ivaPercento)}%
        </p>
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
        <h2 className="font-bold text-gray-800 mb-3">L’evento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CAMPI.map((c) => (
            <Campo
              key={c.k}
              etichetta={c.etichetta}
              aiuto={c.aiuto}
              tipo="number"
              min={0}
              inputMode={c.decimali ? 'decimal' : 'numeric'}
              grande
              valore={valori[c.k]}
              onChange={(v) => {
                setConferma('')
                setValori((prec) => ({ ...prec, [c.k]: v }))
              }}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-[#0b1f5c] text-white p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-white/70">Prezzo al cliente con IVA</p>
            <p className="text-2xl sm:text-3xl font-bold">{euro(r.totaleConIva)}</p>
          </div>
          <div>
            <p className="text-xs text-white/70">Prezzo a persona</p>
            <p className="text-2xl sm:text-3xl font-bold">{r.aPersona != null ? euro(r.aPersona) : '—'}</p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
        {voci.map((x) => (
          <Riga key={x.t} titolo={x.t} valore={x.v} come={x.come} />
        ))}
        <Riga titolo="Costo totale" valore={r.totale} forte />
        <Riga titolo={`Ricarico ${num(parametri.ricaricoPercento)}%`} valore={r.ricarico} />
        <Riga titolo="Prezzo IVA esclusa" valore={r.imponibile} forte />
        <Riga titolo={`IVA ${num(parametri.ivaPercento)}%`} valore={r.iva} />
        <Riga titolo="Prezzo con IVA" valore={r.totaleConIva} forte />
        <Riga titolo="Prezzo a persona" valore={r.aPersona} come={dati.ospiti ? `diviso ${num(dati.ospiti)} ospiti` : 'scrivi gli ospiti'} forte />
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copia}
          className="grow sm:grow-0 min-h-[44px] px-4 py-2.5 rounded-xl bg-primary text-white font-semibold"
        >
          Copia riepilogo
        </button>
        <button
          type="button"
          onClick={() => {
            setValori(VUOTO)
            setConferma('')
          }}
          className="grow sm:grow-0 min-h-[44px] px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold"
        >
          Svuota
        </button>
      </div>

      {apriParametri && (
        <ModaleParametri
          parametri={parametri}
          modificabile={modificabile}
          onChiudi={() => setApriParametri(false)}
          onSalvati={(p) => {
            setParametri(p)
            setApriParametri(false)
            setConferma('Parametri salvati: valgono da subito per tutti.')
          }}
        />
      )}
    </div>
  )
}

function Riga({ titolo, valore, come, forte }: { titolo: string; valore: number | null; come?: string; forte?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-3 px-4 py-3 ${forte ? 'bg-gray-50' : ''}`}>
      <div className="min-w-0">
        <p className={`text-sm ${forte ? 'font-bold text-gray-800' : 'text-gray-700'}`}>{titolo}</p>
        {come && <p className="text-xs text-gray-400 break-words">{come}</p>}
      </div>
      <p className={`shrink-0 text-sm tabular-nums ${forte ? 'font-bold text-gray-900' : 'text-gray-800'}`}>
        {valore != null ? euro(valore) : '—'}
      </p>
    </div>
  )
}

function ModaleParametri({
  parametri,
  modificabile,
  onChiudi,
  onSalvati,
}: {
  parametri: ParametriCatering
  modificabile: boolean
  onChiudi: () => void
  onSalvati: (p: ParametriCatering) => void
}) {
  const chiavi = Object.keys(ETICHETTE_PARAMETRI) as (keyof ParametriCatering)[]
  const [bozza, setBozza] = useState<Record<keyof ParametriCatering, string>>(
    () => Object.fromEntries(chiavi.map((k) => [k, String(parametri[k])])) as Record<keyof ParametriCatering, string>,
  )
  const [errore, setErrore] = useState('')
  const [salvo, setSalvo] = useState(false)

  const salva = async () => {
    setErrore('')
    setSalvo(true)
    try {
      const res = await fetch('/api/preventivi/catering/parametri', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bozza),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Salvataggio non riuscito')
      onSalvati(j.parametri)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Salvataggio non riuscito')
    } finally {
      setSalvo(false)
    }
  }

  return (
    <Modale
      titolo="Parametri del catering"
      sottotitolo={modificabile ? 'Valgono per tutti i preventivi catering, da subito.' : 'Li può cambiare solo l’Amministrazione.'}
      onChiudi={onChiudi}
      azioni={
        modificabile ? (
          <>
            <button type="button" onClick={onChiudi} className="flex-1 min-h-[44px] rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold">
              Annulla
            </button>
            <button
              type="button"
              onClick={salva}
              disabled={salvo}
              className="flex-1 min-h-[44px] rounded-xl bg-primary text-white font-semibold disabled:opacity-60"
            >
              {salvo ? 'Salvo…' : 'Salva'}
            </button>
          </>
        ) : (
          <button type="button" onClick={onChiudi} className="flex-1 min-h-[44px] rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold">
            Chiudi
          </button>
        )
      }
    >
      <div className="space-y-4">
        <Banner tono="errore">{errore}</Banner>
        {chiavi.map((k) => (
          <Campo
            key={k}
            etichetta={`${ETICHETTE_PARAMETRI[k].titolo} (${ETICHETTE_PARAMETRI[k].unita})`}
            aiuto={ETICHETTE_PARAMETRI[k].aiuto}
            tipo="number"
            min={0}
            inputMode="decimal"
            grande
            disabilitato={!modificabile}
            valore={bozza[k]}
            onChange={(v) => setBozza((b) => ({ ...b, [k]: v }))}
          />
        ))}
      </div>
    </Modale>
  )
}
