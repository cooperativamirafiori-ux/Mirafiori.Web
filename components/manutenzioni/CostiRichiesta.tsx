'use client'

/**
 * Sezione Costi della richiesta — solo gestione (fase 2, docs/manutenzioni-piano.md).
 *
 * Tre modi di aggiungere un costo, in momenti diversi:
 *   - Collega fattura: fatture SDI di cc24 o ancora libere (collegarla la
 *     prende su cc24), anche solo una parte;
 *   - Ore: ore del personale di Cura Ambienti, valgono la tariffa del mese;
 *   - Spesa senza fattura: scontrino, carta.
 */

import { useState } from 'react'
import type { CostoPratica, FatturaCollegabile, NuovoCostoPratica } from '@/types/manutenzioni'
import { Banner } from '@/components/ui/Banner'

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50'
const labelCls = 'text-xs text-gray-500 mb-1 block'
const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const giorno = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('it-IT') : '—')
const oggi = () => new Date().toISOString().slice(0, 10)
/** "1,5" e "1.5" valgono uguale: si scrive con la virgola. */
const numero = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'))

const ETICHETTA: Record<CostoPratica['tipo'], string> = { fattura: 'Fattura', ore: 'Ore', spesa: 'Spesa' }

type Modulo = null | 'fattura' | 'ore' | 'spesa'

export function CostiRichiesta({
  spItemId,
  iniziali,
  totaleIniziale,
  incompletoIniziale,
}: {
  spItemId: string
  iniziali: CostoPratica[]
  totaleIniziale: number
  incompletoIniziale: boolean
}) {
  const [costi, setCosti] = useState(iniziali)
  const [totale, setTotale] = useState(totaleIniziale)
  const [incompleto, setIncompleto] = useState(incompletoIniziale)
  const [modulo, setModulo] = useState<Modulo>(null)
  const [errore, setErrore] = useState<string | null>(null)
  // Cosa dice il ribaltamento sulla struttura (es. struttura senza centro di costo).
  const [avviso, setAvviso] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)
  const [daTogliere, setDaTogliere] = useState<string | null>(null)

  // Ore e spesa
  const [data, setData] = useState(oggi())
  const [ore, setOre] = useState('')
  const [figura, setFigura] = useState<'manutenzione' | 'pulizie'>('manutenzione')
  const [importo, setImporto] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [fornitore, setFornitore] = useState('')

  // Fattura
  const [cerca, setCerca] = useState('')
  const [fatture, setFatture] = useState<FatturaCollegabile[] | null>(null)
  const [scelta, setScelta] = useState<FatturaCollegabile | null>(null)

  const base = `/api/manutenzioni/${encodeURIComponent(spItemId)}/costi`

  function apri(m: Modulo) {
    setModulo((x) => (x === m ? null : m))
    setErrore(null)
    setData(oggi()); setOre(''); setImporto(''); setDescrizione(''); setFornitore('')
    setScelta(null)
    if (m === 'fattura') cercaFatture('')
  }

  async function cercaFatture(t: string) {
    setFatture(null); setScelta(null)
    try {
      const res = await fetch(`/api/manutenzioni/fatture-collegabili?cerca=${encodeURIComponent(t)}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Errore')
      setFatture(j.fatture)
    } catch (e: any) {
      setErrore(`Non riesco a leggere le fatture: ${e.message}`)
      setFatture([])
    }
  }

  function aggiorna(j: any) {
    setCosti(j.costi)
    setTotale(j.totaleCosti)
    setIncompleto(j.totaleIncompleto)
    setAvviso(j.avviso ?? null)
  }

  async function salva(corpo: NuovoCostoPratica) {
    setInvio(true); setErrore(null)
    try {
      const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Errore')
      aggiorna(j)
      setModulo(null)
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setInvio(false)
    }
  }

  async function togli(id: string) {
    setInvio(true); setErrore(null)
    try {
      const res = await fetch(`${base}/${id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Errore')
      aggiorna(j)
      setDaTogliere(null)
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setInvio(false)
    }
  }

  function collega() {
    if (!scelta) return
    const v = importo.trim() ? numero(importo) : undefined
    if (v !== undefined && !(v > 0)) { setErrore('Scrivi un importo valido'); return }
    salva({ tipo: 'fattura', fatturaId: scelta.id, importo: v, descrizione: descrizione.trim() || undefined })
  }

  function aggiungiOre() {
    const v = numero(ore)
    if (!(v > 0)) { setErrore('Scrivi le ore, per esempio 1,5'); return }
    salva({ tipo: 'ore', ore: v, data, figura, descrizione: descrizione.trim() || undefined })
  }

  function aggiungiSpesa() {
    const v = numero(importo)
    if (!(v > 0)) { setErrore('Scrivi l\'importo della spesa'); return }
    if (!descrizione.trim()) { setErrore('Scrivi cosa è stato comprato'); return }
    salva({ tipo: 'spesa', importo: v, data, descrizione: descrizione.trim(), fornitore: fornitore.trim() || undefined })
  }

  const tasto = (m: Exclude<Modulo, null>, testo: string) => (
    <button
      onClick={() => apri(m)}
      disabled={invio}
      aria-expanded={modulo === m}
      className={`px-3 py-2 text-sm rounded-lg border w-full sm:w-auto ${modulo === m ? 'bg-primary text-white border-primary' : 'border-primary text-primary hover:bg-primary/5'}`}
    >
      {testo}
    </button>
  )

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-3 space-y-3" aria-label="Costi">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Costi</p>
        <p className="text-sm text-gray-700">
          Totale <strong>{euro(totale)}</strong>
        </p>
      </div>
      <p className="text-xs text-gray-500">
        Li vedi solo tu. Le fatture stanno su Cura Ambienti (cc24), che addebita ogni mese il totale al centro
        di costo della struttura (lo vedi negli Addebiti interni). Fino al 10 del mese dopo si correggono qui,
        poi il mese è chiuso. Il richiedente vede solo il totale, a richiesta chiusa.
      </p>
      {incompleto && (
        <Banner tono="avviso">Per alcune ore manca la tariffa interna del mese: il totale non le comprende.</Banner>
      )}
      <Banner tono="errore">{errore}</Banner>
      <Banner tono="avviso">{avviso}</Banner>

      {costi.length === 0 ? (
        <p className="text-sm text-gray-400">Nessun costo. Aggiungili quando arrivano: fatture, ore, spese.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {costi.map((c) => (
            <li key={c.id} className="py-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 break-words">
                  <span className="text-xs font-semibold text-gray-500 mr-1.5">{ETICHETTA[c.tipo]}</span>
                  {c.tipo === 'fattura' && (
                    <>
                      {c.fornitore}{c.fattura?.numero ? ` n. ${c.fattura.numero}` : ''}
                      {c.fattura && c.importo != null && c.importo < c.fattura.imponibile - 0.004 && (
                        <span className="text-gray-500"> · parte di {euro(c.fattura.imponibile)}</span>
                      )}
                    </>
                  )}
                  {c.tipo === 'ore' && <>{String(c.ore).replace('.', ',')} h {c.figura === 'pulizie' ? 'pulizie' : 'manutentore'}</>}
                  {c.tipo === 'spesa' && <>{c.descrizione}{c.fornitore ? ` · ${c.fornitore}` : ''}</>}
                </p>
                <p className="text-xs text-gray-500">
                  {giorno(c.data)}
                  {c.tipo !== 'spesa' && c.descrizione ? ` · ${c.descrizione}` : ''}
                  {c.fattura?.pdfUrl && (
                    <> · <a href={c.fattura.pdfUrl} target="_blank" rel="noreferrer" className="text-primary underline">PDF</a></>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                <span className="text-sm font-semibold text-gray-800">
                  {c.importo == null ? 'tariffa mancante' : euro(c.importo)}
                </span>
                {daTogliere === c.id ? (
                  <span className="flex gap-2 text-xs">
                    <button onClick={() => togli(c.id)} disabled={invio} className="text-red-600 font-semibold">Sì, togli</button>
                    <button onClick={() => setDaTogliere(null)} className="text-gray-500">Annulla</button>
                  </span>
                ) : (
                  <button onClick={() => setDaTogliere(c.id)} className="text-xs text-gray-400 hover:text-red-600">Togli</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {tasto('fattura', '+ Collega fattura')}
        {tasto('ore', '+ Ore')}
        {tasto('spesa', '+ Spesa senza fattura')}
      </div>

      {modulo === 'fattura' && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); cercaFatture(cerca) } }}
              className={`${inputCls} flex-1 min-w-0`}
              placeholder="Cerca per fornitore, numero, descrizione"
            />
            <button onClick={() => cercaFatture(cerca)} className="px-3 py-2 border border-gray-300 text-sm rounded-lg w-full sm:w-auto">Cerca</button>
          </div>
          <p className="text-xs text-gray-500">Fatture di Cura Ambienti o ancora libere, con una parte non ancora distribuita. Una fattura libera, collegandola, passa su cc24.</p>
          {fatture === null && <p className="text-sm text-gray-400">Caricamento…</p>}
          {fatture?.length === 0 && <p className="text-sm text-gray-400">Nessuna fattura da collegare.</p>}
          {fatture && fatture.length > 0 && !scelta && (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {fatture.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => { setScelta(f); setImporto(String(f.disponibile).replace('.', ',')) }}
                    className="w-full text-left bg-white rounded-lg border border-gray-200 px-3 py-2 hover:border-primary"
                  >
                    <p className="text-sm text-gray-800 break-words">
                      <strong>{f.fornitore}</strong>{f.numero ? ` n. ${f.numero}` : ''} · {giorno(f.data)}
                    </p>
                    <p className="text-xs text-gray-500 break-words">
                      Imponibile {euro(f.imponibile)}
                      {f.disponibile < f.imponibile - 0.004 && <> · da distribuire {euro(f.disponibile)}</>}
                      {f.libera ? ' · libera' : ' · su cc24'}
                      {f.descrizione ? ` · ${f.descrizione}` : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {scelta && (
            <div className="space-y-2">
              <p className="text-sm text-gray-800 break-words">
                <strong>{scelta.fornitore}</strong>{scelta.numero ? ` n. ${scelta.numero}` : ''} · da distribuire {euro(scelta.disponibile)}
                {scelta.libera && <span className="text-amber-700"> · verrà presa su cc24</span>}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className={labelCls} htmlFor="costo-importo-fattura">Quanto va su questa manutenzione (€)</label>
                  <input id="costo-importo-fattura" value={importo} onChange={(e) => setImporto(e.target.value)} inputMode="decimal" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="costo-nota-fattura">Nota (facoltativa)</label>
                  <input id="costo-nota-fattura" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} className={inputCls} placeholder="Es. tubi doccia" maxLength={300} />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={collega} disabled={invio} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 w-full sm:w-auto">
                  {invio ? 'Salvataggio…' : 'Collega alla richiesta'}
                </button>
                <button onClick={() => setScelta(null)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg w-full sm:w-auto">Scegli un'altra</button>
              </div>
            </div>
          )}
        </div>
      )}

      {modulo === 'ore' && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls} htmlFor="costo-ore">Ore</label>
              <input id="costo-ore" value={ore} onChange={(e) => setOre(e.target.value)} inputMode="decimal" className={inputCls} placeholder="1,5" />
            </div>
            <div>
              <label className={labelCls} htmlFor="costo-data-ore">Data</label>
              <input id="costo-data-ore" type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls} htmlFor="costo-figura">Chi</label>
              <select id="costo-figura" value={figura} onChange={(e) => setFigura(e.target.value as 'manutenzione' | 'pulizie')} className={inputCls}>
                <option value="manutenzione">Manutentore</option>
                <option value="pulizie">Addetto pulizie</option>
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls} htmlFor="costo-nota-ore">Nota (facoltativa)</label>
              <input id="costo-nota-ore" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} className={inputCls} maxLength={300} />
            </div>
          </div>
          <p className="text-xs text-gray-500">L'importo lo calcola l'app: ore × tariffa interna di Cura Ambienti in quel mese.</p>
          <button onClick={aggiungiOre} disabled={invio} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 w-full sm:w-auto">
            {invio ? 'Salvataggio…' : 'Aggiungi ore'}
          </button>
        </div>
      )}

      {modulo === 'spesa' && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className={labelCls} htmlFor="costo-descr-spesa">Cosa</label>
              <input id="costo-descr-spesa" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} className={inputCls} placeholder="Es. lampadina LED" maxLength={300} />
            </div>
            <div>
              <label className={labelCls} htmlFor="costo-importo-spesa">Importo (€)</label>
              <input id="costo-importo-spesa" value={importo} onChange={(e) => setImporto(e.target.value)} inputMode="decimal" className={inputCls} placeholder="4,90" />
            </div>
            <div>
              <label className={labelCls} htmlFor="costo-data-spesa">Data</label>
              <input id="costo-data-spesa" type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls} htmlFor="costo-fornitore-spesa">Dove (facoltativo)</label>
              <input id="costo-fornitore-spesa" value={fornitore} onChange={(e) => setFornitore(e.target.value)} className={inputCls} placeholder="Es. Brico" maxLength={200} />
            </div>
          </div>
          <button onClick={aggiungiSpesa} disabled={invio} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 w-full sm:w-auto">
            {invio ? 'Salvataggio…' : 'Aggiungi spesa'}
          </button>
        </div>
      )}
    </section>
  )
}
