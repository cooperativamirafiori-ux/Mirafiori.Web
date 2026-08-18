'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Kpi } from '@/components/ui/Kpi'
import { Voce } from '@/components/ui/Voce'
import {
  CATEGORIE_SPESA,
  GARANZIA_STILE,
  MESI_GARANZIA_DEFAULT,
  MODALITA_PAGAMENTO,
  SERVIZIO_DA_DEFINIRE,
  STATI_ACQUISTO,
  STATI_APERTI,
  STATO_STILE,
  URGENZA_STILE,
  aggiungiMesi,
  calcolaIva,
  dataBreve,
  etichettaGaranzia,
  euro,
  servizioDiConsegna,
  statoGaranzia,
  type RichiestaAcquisto,
} from '@/types/acquisti'
import { STATO_BENE_STILE, type BeneInventario, type TipoDocumento } from '@/types/inventario'
import { caricaDirettamente, maxUploadMb } from '@/lib/core/upload-diretto'

interface Props {
  iniziali: RichiestaAcquisto[]
  strutture: Array<{ id: number; label: string }>
  fornitori: string[]
  gestori: string[]
  /** Beni già inventariati, di tutte le richieste: la riga filtra i suoi. */
  beni: BeneInventario[]
  /** false se manca SP_LIST_INVENTARIO: il blocco inventario si spiega da sé. */
  inventarioAttivo: boolean
}

const campoCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const oggiYmd = () => new Date().toISOString().slice(0, 10)

export function GestioneAcquisti({
  iniziali,
  strutture,
  fornitori,
  gestori,
  beni,
  inventarioAttivo,
}: Props) {
  const router = useRouter()
  const [filtroStato, setFiltroStato] = useState<'aperte' | 'tutte' | string>('aperte')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [query, setQuery] = useState('')
  const [aperta, setAperta] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [avvisi, setAvvisi] = useState<string[]>([])

  const beniPerCodice = useMemo(() => {
    const m = new Map<string, BeneInventario[]>()
    for (const b of beni) {
      if (!b.codiceRichiesta) continue
      const lista = m.get(b.codiceRichiesta) ?? []
      lista.push(b)
      m.set(b.codiceRichiesta, lista)
    }
    return m
  }, [beni])

  const visibili = useMemo(() => {
    let l = iniziali
    if (filtroStato === 'aperte') l = l.filter((a) => STATI_APERTI.includes(a.stato))
    else if (filtroStato !== 'tutte') l = l.filter((a) => a.stato === filtroStato)
    if (filtroCategoria) l = l.filter((a) => a.categoria === filtroCategoria)
    const q = query.trim().toLowerCase()
    if (q) {
      l = l.filter((a) =>
        [a.codice, a.descrizione, servizioDiConsegna(a), a.richiedenteNome, a.fornitore ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    return l
  }, [iniziali, filtroStato, filtroCategoria, query])

  const conteggi = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of iniziali) c[a.stato] = (c[a.stato] ?? 0) + 1
    return c
  }, [iniziali])

  const speso = useMemo(
    () =>
      iniziali
        .filter((a) => ['Ordinata', 'Consegnata', 'Problema'].includes(a.stato))
        .reduce((s, a) => s + (a.totale ?? 0), 0),
    [iniziali],
  )

  async function azione(spItemId: string, body: Record<string, unknown>) {
    setBusy(true)
    setErrore(null)
    setAvvisi([])
    try {
      const res = await fetch(`/api/acquisti/${spItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Operazione non riuscita')
      // I numeri di inventario assegnati arrivano qui: senza mostrarli, chi
      // registra l'ordine non saprebbe che cosa è stato creato.
      if (Array.isArray(data.avvisi) && data.avvisi.length) setAvvisi(data.avvisi)
      else setAperta(null)
      router.refresh()
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Kpi dimensione="lg" titolo="Da valutare" valore={(conteggi['Inviata'] ?? 0) + (conteggi['Presa in carico'] ?? 0)} />
        <Kpi dimensione="lg" titolo="Approvate, da ordinare" valore={conteggi['Approvata'] ?? 0} accento="amber" />
        <Kpi dimensione="lg" titolo="In attesa di consegna" valore={conteggi['Ordinata'] ?? 0} accento="violet" />
        <Kpi dimensione="lg" titolo="Problemi aperti" valore={conteggi['Problema'] ?? 0} accento="red" />
      </div>
      <p className="text-xs text-gray-500 px-1">
        Ordinato nel periodo: <strong>{euro(speso)}</strong> · la spesa entra nel cruscotto costi
        alla conferma di consegna.
      </p>

      {/* Filtri */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-wrap gap-2">
        <select
          value={filtroStato}
          onChange={(e) => setFiltroStato(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="aperte">In corso</option>
          <option value="tutte">Tutti gli stati</option>
          {STATI_ACQUISTO.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="">Tutte le categorie</option>
          {CATEGORIE_SPESA.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca codice, articolo, fornitore…"
          className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
        />
      </div>

      {errore && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{errore}</div>}

      {avvisi.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-lg space-y-1">
          {avvisi.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
          <button onClick={() => setAvvisi([])} className="text-xs underline text-amber-700">
            ho capito
          </button>
        </div>
      )}

      {/* Elenco */}
      {visibili.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Nessuna richiesta con questi filtri.
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibili.map((a) => (
            <Riga
              // La chiave include stato, servizio e totale: dopo un
              // router.refresh() la riga viene rimontata e i moduli ripartono dai
              // dati freschi invece di mostrare quelli digitati prima del salvataggio.
              key={`${a.spItemId}-${a.stato}-${a.struttura.id}-${a.totale ?? ''}`}
              a={a}
              aperta={aperta === a.spItemId}
              onToggle={() => setAperta(aperta === a.spItemId ? null : a.spItemId)}
              strutture={strutture}
              fornitori={fornitori}
              gestori={gestori}
              beni={beniPerCodice.get(a.codice) ?? []}
              inventarioAttivo={inventarioAttivo}
              busy={busy}
              onAzione={azione}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Riga({
  a,
  aperta,
  onToggle,
  strutture,
  fornitori,
  gestori,
  beni,
  inventarioAttivo,
  busy,
  onAzione,
}: {
  a: RichiestaAcquisto
  aperta: boolean
  onToggle: () => void
  strutture: Array<{ id: number; label: string }>
  fornitori: string[]
  gestori: string[]
  beni: BeneInventario[]
  inventarioAttivo: boolean
  busy: boolean
  onAzione: (spItemId: string, body: Record<string, unknown>) => Promise<void>
}) {
  const stile = STATO_STILE[a.stato] ?? STATO_STILE['Inviata']

  const [motivo, setMotivo] = useState('')
  const [dataPagamento, setDataPagamento] = useState(a.dataPagamento?.slice(0, 10) ?? '')

  /**
   * Servizio di consegna: lo sceglie chi prende in carico, non il richiedente.
   * Parte da quello già salvato — vuoto sulle richieste appena arrivate.
   */
  const [servizioId, setServizioId] = useState(String(a.struttura.id || ''))
  const servizioSalvato = a.struttura.id || 0
  const servizioCambiato = (Number(servizioId) || 0) !== servizioSalvato

  const [ordine, setOrdine] = useState({
    fornitore: a.fornitore ?? '',
    imponibile: a.imponibile != null ? String(a.imponibile) : '',
    totale: a.totale != null ? String(a.totale) : '',
    dataOrdine: a.dataOrdine?.slice(0, 10) || oggiYmd(),
    pagamento: a.pagamento ?? 'Fattura posticipata',
    dataConsegnaPrevista: a.dataConsegnaPrevista?.slice(0, 10) ?? '',
    daInventariare: a.daInventariare,
    marcaModello: a.marcaModello ?? '',
    mesiGaranzia: String(a.mesiGaranzia ?? MESI_GARANZIA_DEFAULT),
    extraCee: a.extraCee,
  })
  const set = (k: keyof typeof ordine, v: string | boolean) =>
    setOrdine((o) => ({ ...o, [k]: v }))

  /**
   * Un numero di serie per pezzo: la quantità della richiesta decide quante
   * caselle mostrare, perché ogni pezzo diventa un bene con il suo numero.
   */
  const [seriali, setSeriali] = useState<string[]>(() => {
    const iniziali = (a.numeroSerie ?? '').split(/\s*[,;]\s*/).filter(Boolean)
    return Array.from({ length: Math.max(1, a.quantita) }, (_, i) => iniziali[i] ?? '')
  })
  const setSeriale = (i: number, v: string) =>
    setSeriali((s) => s.map((x, j) => (j === i ? v : x)))

  const imponibileNum = Number(ordine.imponibile) || 0
  const totaleNum = Number(ordine.totale) || 0
  const ivaNum = calcolaIva(imponibileNum, totaleNum)
  const totaleIncoerente = totaleNum > 0 && totaleNum < imponibileNum - 0.005
  const mesiNum = Number(ordine.mesiGaranzia) || 0
  const scadenzaPreview = ordine.daInventariare
    ? aggiungiMesi(ordine.dataOrdine, mesiNum)
    : undefined

  const puoValutare = ['Inviata', 'Presa in carico'].includes(a.stato)
  const puoOrdinare = ['Approvata', 'Presa in carico', 'Ordinata'].includes(a.stato)
  const ordineRegistrato = (a.totale ?? 0) > 0

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50"
      >
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${stile.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-gray-600">{a.codice}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${stile.badge}`}>
              {a.stato}
            </span>
            {a.urgenza !== 'Normale' && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${URGENZA_STILE[a.urgenza] ?? ''}`}>
                {a.urgenza}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-800 font-medium mt-1 truncate">
            {a.descrizione}
            {a.quantita > 1 && <span className="text-gray-400"> ×{a.quantita}</span>}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {a.richiedenteNome}
            {' · '}
            {servizioDiConsegna(a) || (
              <span className="text-amber-600 font-medium">{SERVIZIO_DA_DEFINIRE}</span>
            )}
            {' · '}
            {a.categoria}
            {a.totale ? ` · ${euro(a.totale)}` : ''}
          </p>
        </div>
        <span className="text-gray-300 text-sm shrink-0">{aperta ? '▲' : '▼'}</span>
      </button>

      {aperta && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50/50">
          {/* Dettagli della richiesta */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <Voce t="Richiesta il" v={dataBreve(a.dataRichiesta)} />
            <Voce t="Serve entro" v={a.serveEntro ? dataBreve(a.serveEntro) : '—'} />
            <Voce t="Assegnata a" v={a.assegnatoNome ?? 'nessuno'} />
            <Voce t="Quantità" v={String(a.quantita)} />
            <Voce t="Centro di costo" v={a.centroCosto?.value ?? '—'} />
            <Voce t="Servizio" v={servizioDiConsegna(a) || SERVIZIO_DA_DEFINIRE} />
            {a.link && (
              <div className="col-span-2">
                <dt className="text-gray-500">Link</dt>
                <dd>
                  <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-brand-orange underline break-all">
                    {a.link}
                  </a>
                </dd>
              </div>
            )}
            {ordineRegistrato && (
              <>
                <Voce t="Imponibile" v={euro(a.imponibile)} />
                <Voce t="IVA" v={euro(calcolaIva(a.imponibile, a.totale))} />
              </>
            )}
            {a.motivoRifiuto && <Voce t="Motivo" v={a.motivoRifiuto} span />}
            {a.esitoConsegna && <Voce t="Esito consegna" v={a.esitoConsegna} />}
            {a.noteEsito && <Voce t="Note esito" v={a.noteEsito} span />}
          </dl>

          {a.scadenzaGaranzia && (
            <span
              className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                GARANZIA_STILE[statoGaranzia(a.scadenzaGaranzia).stato]
              }`}
            >
              {etichettaGaranzia(a.scadenzaGaranzia)}
            </span>
          )}

          {/* Servizio di consegna + presa in carico.
              Chi chiede non indica dove va consegnata la merce: dipende da
              fornitore, presidio e tempi, cose che sa solo chi gestisce. Prendere
              in carico è quindi anche decidere la destinazione. */}
          {!['Consegnata', 'Annullata', 'Non approvata'].includes(a.stato) && (
            <div className="space-y-2 bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-700">Servizio di consegna</p>
              <select
                value={servizioId}
                disabled={busy}
                onChange={(e) => setServizioId(e.target.value)}
                className={campoCls}
              >
                <option value="">— dove va consegnata —</option>
                {strutture.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>

              {a.stato === 'Inviata' ? (
                <>
                  <button
                    disabled={busy || !servizioId}
                    onClick={() =>
                      onAzione(a.spItemId, {
                        azione: 'prendi-in-carico',
                        strutturaId: Number(servizioId),
                      })
                    }
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                    title={servizioId ? '' : 'Scegli prima il servizio di consegna'}
                  >
                    Prendi in carico
                  </button>
                </>
              ) : (
                servizioCambiato && (
                  <button
                    disabled={busy || !servizioId}
                    onClick={() =>
                      onAzione(a.spItemId, { azione: 'servizio', strutturaId: Number(servizioId) })
                    }
                    className="w-full bg-gray-800 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                  >
                    {servizioSalvato ? 'Sposta la consegna qui' : 'Salva il servizio'}
                  </button>
                )
              )}

              {/* Con un solo gestore la richiesta nasce già "Presa in carico":
                  il pulsante non c'è, ma la destinazione manca comunque. */}
              {!servizioSalvato && (
                <p className="text-[11px] text-amber-600">
                  Senza servizio non si approva né si ordina: la destinazione la decide chi prende
                  in carico.
                </p>
              )}
            </div>
          )}

          {/* Riassegnazione */}
          {STATI_APERTI.includes(a.stato) && gestori.length > 1 && (
            <div>
              <label className={labelCls}>Assegna a</label>
              <select
                defaultValue=""
                disabled={busy || !servizioId}
                onChange={(e) => {
                  if (e.target.value) {
                    onAzione(a.spItemId, {
                      azione: 'assegna',
                      assegnatoEmail: e.target.value,
                      // Assegnare porta la richiesta in "Presa in carico": vale
                      // la stessa regola, il servizio deve essere deciso.
                      strutturaId: Number(servizioId) || undefined,
                    })
                  }
                }}
                className={campoCls}
              >
                <option value="">— scegli un gestore —</option>
                {gestori.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              {!servizioId && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Scegli prima il servizio di consegna.
                </p>
              )}
            </div>
          )}

          {/* Valutazione */}
          {puoValutare && (
            <div className="space-y-2 bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-700">Valutazione</p>
              <div className="flex gap-2">
                <button
                  disabled={busy || !servizioSalvato}
                  onClick={() => onAzione(a.spItemId, { azione: 'approva' })}
                  className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                  title={servizioSalvato ? '' : 'Salva prima il servizio di consegna'}
                >
                  Approva
                </button>
                <button
                  disabled={busy || !motivo.trim()}
                  onClick={() => onAzione(a.spItemId, { azione: 'rifiuta', motivo })}
                  className="flex-1 border border-red-300 text-red-700 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                  title={motivo.trim() ? '' : 'Indica prima il motivo'}
                >
                  Non approvare
                </button>
              </div>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo del rifiuto (obbligatorio per non approvare)"
                className={campoCls}
              />
            </div>
          )}

          {/* Ordine */}
          {puoOrdinare && (
            <div className="space-y-3 bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-700">
                {a.stato === 'Ordinata' ? 'Correggi l’ordine' : 'Registra l’ordine'}
              </p>

              <div>
                <label className={labelCls}>Fornitore *</label>
                <input
                  list={`fornitori-${a.spItemId}`}
                  value={ordine.fornitore}
                  onChange={(e) => set('fornitore', e.target.value)}
                  className={campoCls}
                  placeholder="Inizia a scrivere: propone quelli già usati"
                />
                <datalist id={`fornitori-${a.spItemId}`}>
                  {fornitori.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>

              {/* Imponibile e totale si leggono in fattura: l'IVA è la differenza. */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>Imponibile € *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ordine.imponibile}
                    onChange={(e) => set('imponibile', e.target.value)}
                    className={campoCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Totale € *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ordine.totale}
                    onChange={(e) => set('totale', e.target.value)}
                    className={`${campoCls} ${totaleIncoerente ? 'border-red-400' : ''}`}
                  />
                </div>
                <div>
                  <label className={labelCls}>IVA</label>
                  <div className="px-3 py-2 text-sm font-semibold text-gray-800 bg-gray-100 rounded-lg">
                    {euro(ivaNum)}
                  </div>
                </div>
              </div>
              {totaleIncoerente && (
                <p className="text-xs text-red-600">
                  Il totale è inferiore all’imponibile: controlla i due importi.
                </p>
              )}
              {!totaleIncoerente && imponibileNum > 0 && ivaNum === 0 && !ordine.extraCee && (
                <p className="text-xs text-gray-500">
                  Totale uguale all’imponibile: fornitura senza IVA (o importo da correggere).
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Data ordine</label>
                  <input
                    type="date"
                    value={ordine.dataOrdine}
                    onChange={(e) => set('dataOrdine', e.target.value)}
                    className={campoCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Consegna prevista</label>
                  <input
                    type="date"
                    value={ordine.dataConsegnaPrevista}
                    onChange={(e) => set('dataConsegnaPrevista', e.target.value)}
                    className={campoCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Pagamento</label>
                <select
                  value={ordine.pagamento}
                  onChange={(e) => set('pagamento', e.target.value)}
                  className={campoCls}
                >
                  {MODALITA_PAGAMENTO.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Il luogo non si ridigita qui: è il servizio scelto sopra, e
                  averlo in due punti significava vederne due diversi. */}
              <p className="text-[11px] text-gray-500">
                Consegna presso <strong>{servizioDiConsegna(a) || SERVIZIO_DA_DEFINIRE}</strong>
                {servizioDiConsegna(a) ? ' — si cambia dal blocco "Servizio di consegna".' : '.'}
              </p>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={ordine.extraCee}
                    onChange={(e) => set('extraCee', e.target.checked)}
                  />
                  Acquisto extra CEE (IVA a 0)
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={ordine.daInventariare}
                    onChange={(e) => set('daInventariare', e.target.checked)}
                  />
                  Da inventariare
                </label>
              </div>

              {ordine.daInventariare && (
                <div className="space-y-2 border-t border-gray-100 pt-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className={labelCls}>Marca e modello *</label>
                      <input
                        value={ordine.marcaModello}
                        onChange={(e) => set('marcaModello', e.target.value)}
                        className={campoCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Garanzia (mesi)</label>
                      <input
                        type="number"
                        min="0"
                        max="240"
                        value={ordine.mesiGaranzia}
                        onChange={(e) => set('mesiGaranzia', e.target.value)}
                        className={campoCls}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    {scadenzaPreview ? (
                      <>
                        Garanzia calcolata dalla data dell’ordine: scade il{' '}
                        <strong>{dataBreve(scadenzaPreview)}</strong>.
                      </>
                    ) : (
                      'Indica la data dell’ordine per calcolare la scadenza della garanzia.'
                    )}
                  </p>

                  <div>
                    <label className={labelCls}>
                      {a.quantita > 1
                        ? `Numeri di serie (${a.quantita} pezzi, uno per riga)`
                        : 'Numero di serie'}
                    </label>
                    <div className="space-y-1.5">
                      {seriali.map((s, i) => (
                        <input
                          key={i}
                          value={s}
                          onChange={(e) => setSeriale(i, e.target.value)}
                          placeholder={
                            a.quantita > 1 ? `pezzo ${i + 1} — seriale (facoltativo)` : 'facoltativo'
                          }
                          className={campoCls}
                        />
                      ))}
                    </div>
                    {a.quantita > 1 && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        Ogni pezzo prende un numero di inventario e una cartella sua.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <button
                disabled={
                  busy ||
                  !servizioSalvato ||
                  !ordine.fornitore.trim() ||
                  imponibileNum <= 0 ||
                  totaleNum <= 0 ||
                  totaleIncoerente
                }
                onClick={() =>
                  onAzione(a.spItemId, {
                    azione: 'ordina',
                    fornitore: ordine.fornitore,
                    imponibile: imponibileNum,
                    totale: totaleNum,
                    dataOrdine: ordine.dataOrdine,
                    pagamento: ordine.pagamento,
                    dataConsegnaPrevista: ordine.dataConsegnaPrevista || undefined,
                    daInventariare: ordine.daInventariare,
                    marcaModello: ordine.marcaModello,
                    mesiGaranzia: mesiNum,
                    serialiInventario: ordine.daInventariare ? seriali : undefined,
                    // Sulla richiesta resta l'elenco dei seriali: il dettaglio
                    // pezzo per pezzo vive sulle righe dell'inventario.
                    numeroSerie: seriali.filter(Boolean).join(', '),
                    extraCee: ordine.extraCee,
                  })
                }
                className="w-full bg-violet-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              >
                {a.stato === 'Ordinata' ? 'Aggiorna l’ordine' : 'Registra ordine e avvisa il richiedente'}
              </button>
            </div>
          )}

          {/* Pagamento — sta fuori dal blocco ordine perché arriva dopo,
              quasi sempre a consegna già avvenuta. */}
          {ordineRegistrato && (
            <div className="space-y-2 bg-white rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-700">Pagamento</p>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    a.dataPagamento
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {a.dataPagamento ? `pagato il ${dataBreve(a.dataPagamento)}` : 'da pagare'}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  className={campoCls}
                />
                <button
                  disabled={busy || dataPagamento === (a.dataPagamento?.slice(0, 10) ?? '')}
                  onClick={() =>
                    onAzione(a.spItemId, {
                      azione: 'pagamento',
                      dataPagamento: dataPagamento || undefined,
                    })
                  }
                  className="shrink-0 bg-gray-800 text-white px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                >
                  Salva
                </button>
              </div>
              <p className="text-[11px] text-gray-400">
                {a.pagamento ? `Modalità: ${a.pagamento}. ` : ''}
                Svuota la data e salva per annullare la registrazione.
              </p>
            </div>
          )}

          {/* Inventario */}
          {a.daInventariare && (
            <BloccoInventario
              codice={a.codice}
              beni={beni}
              inventarioAttivo={inventarioAttivo}
              numeriAttesi={a.numeriInventario}
              scadenzaGaranzia={a.scadenzaGaranzia}
            />
          )}

          {/* Problema da risolvere */}
          {a.stato === 'Problema' && (
            <div className="space-y-2 bg-white rounded-lg border border-red-100 p-3">
              <p className="text-xs font-semibold text-red-700">
                Problema segnalato: {a.esitoConsegna}
              </p>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Come è stato risolto (facoltativo)"
                className={campoCls}
              />
              <button
                disabled={busy}
                onClick={() => onAzione(a.spItemId, { azione: 'risolvi', noteEsito: motivo })}
                className="w-full bg-emerald-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                Risolto — chiudi e registra il costo
              </button>
            </div>
          )}

          {/* Annullamento */}
          {!['Consegnata', 'Annullata', 'Non approvata'].includes(a.stato) && (
            <button
              disabled={busy}
              onClick={() => {
                if (confirm(`Annullare ${a.codice}?`)) {
                  onAzione(a.spItemId, { azione: 'annulla', motivo: motivo || undefined })
                }
              }}
              className="w-full text-xs text-gray-400 hover:text-red-600 py-1 disabled:opacity-50"
            >
              Annulla richiesta
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Beni generati dalla richiesta, con i due caricamenti per ciascuno.
 *
 * Lo stato dei beni è locale: dopo un caricamento aggiorna la riga senza
 * aspettare il refresh del server, che intanto arriva per conto suo.
 */
function BloccoInventario({
  codice,
  beni,
  inventarioAttivo,
  numeriAttesi,
  scadenzaGaranzia,
}: {
  codice: string
  beni: BeneInventario[]
  inventarioAttivo: boolean
  numeriAttesi?: string
  scadenzaGaranzia?: string
}) {
  const [lista, setLista] = useState(beni)

  const aggiorna = (b: BeneInventario) =>
    setLista((l) => l.map((x) => (x.spItemId === b.spItemId ? b : x)))

  if (!inventarioAttivo) {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3">
        Bene da inventariare, ma l’inventario non è configurato: esegui{' '}
        <code className="font-mono">node scripts/provision-inventario.mjs</code>.
      </div>
    )
  }

  if (!lista.length) {
    return (
      <div className="rounded-lg bg-gray-50 border border-gray-200 text-gray-500 text-xs p-3">
        {numeriAttesi
          ? `Beni ${numeriAttesi}: non li trovo in inventario, ricarica la pagina.`
          : 'Nessun bene ancora inventariato: verrà creato quando registri l’ordine.'}
      </div>
    )
  }

  return (
    <div className="space-y-2 bg-white rounded-lg border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700">
          Inventario — {lista.length === 1 ? '1 bene' : `${lista.length} beni`}
        </p>
        {scadenzaGaranzia && (
          <span className="text-[10px] text-gray-400">
            garanzia fino al {dataBreve(scadenzaGaranzia)}
          </span>
        )}
      </div>

      {lista.map((b) => (
        <div key={b.spItemId} className="rounded-lg border border-gray-100 p-2.5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-gray-700">{b.numero}</span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                STATO_BENE_STILE[b.statoBene] ?? ''
              }`}
            >
              {b.statoBene}
            </span>
            {b.numeroSerie && (
              <span className="text-[10px] text-gray-400 font-mono">SN {b.numeroSerie}</span>
            )}
            {b.cartellaUrl && (
              <a
                href={b.cartellaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-brand-orange underline ml-auto"
              >
                apri cartella
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <PulsanteDocumento
              bene={b}
              tipo="fattura"
              etichetta="Fattura"
              url={b.fatturaUrl}
              onAggiornato={aggiorna}
            />
            <PulsanteDocumento
              bene={b}
              tipo="garanzia"
              etichetta="Garanzia"
              url={b.garanziaUrl}
              onAggiornato={aggiorna}
            />
          </div>
        </div>
      ))}

      <p className="text-[11px] text-gray-400">
        I file finiscono nella cartella del bene su SharePoint (max {maxUploadMb()} MB), non passano
        dall’app. Richiesta di origine: {codice}.{' '}
        <a href="/inventario" className="text-brand-orange underline">
          apri l’inventario
        </a>
      </p>
    </div>
  )
}

/** Un caricamento per tipo di documento: sostituisce il file precedente. */
function PulsanteDocumento({
  bene,
  tipo,
  etichetta,
  url,
  onAggiornato,
}: {
  bene: BeneInventario
  tipo: TipoDocumento
  etichetta: string
  url?: string
  onAggiornato: (b: BeneInventario) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [avanzamento, setAvanzamento] = useState<number | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  async function carica(file: File) {
    setErrore(null)
    setAvanzamento(0)
    try {
      const { bene: aggiornato } = await caricaDirettamente<{ bene: BeneInventario }>({
        file,
        urlSessione: `/api/inventario/${bene.spItemId}/documento`,
        datiSessione: { tipo },
        urlConferma: `/api/inventario/${bene.spItemId}/documento/conferma`,
        datiConferma: { tipo },
        onAvanzamento: setAvanzamento,
      })
      onAggiornato(aggiornato)
    } catch (e: any) {
      setErrore(e?.message ?? 'Caricamento non riuscito')
    } finally {
      setAvanzamento(null)
      if (input.current) input.current.value = ''
    }
  }

  const inCorso = avanzamento !== null

  return (
    <div>
      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) carica(f)
        }}
      />
      <button
        disabled={inCorso}
        onClick={() => input.current?.click()}
        className={`w-full text-xs font-semibold py-2 rounded-lg border disabled:opacity-50 ${
          url
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
        }`}
      >
        {inCorso ? `${etichetta} ${avanzamento}%` : url ? `${etichetta} ✓ sostituisci` : `Carica ${etichetta.toLowerCase()}`}
      </button>
      {url && !inCorso && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-[11px] text-brand-orange underline mt-0.5"
        >
          apri {etichetta.toLowerCase()}
        </a>
      )}
      {errore && <p className="text-[11px] text-red-600 mt-0.5">{errore}</p>}
    </div>
  )
}
