'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Servizio, Timbratura, RiepilogoPeriodo, OrePerVoce, FinestraMese } from '@/types/timbrature'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const GIORNI_LUNGHI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']

function pad(n: number) { return String(n).padStart(2, '0') }
function ymd(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}` }
function ultimoGiorno(y: number, m: number) { return new Date(y, m, 0).getDate() }
function weekdayIdx(dataYmd: string) {
  const [y, m, d] = dataYmd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
function weekdayShort(dataYmd: string) { return GIORNI[weekdayIdx(dataYmd)] }
function dataEstesa(dataYmd: string) {
  const [, m, d] = dataYmd.split('-').map(Number)
  return `${GIORNI_LUNGHI[weekdayIdx(dataYmd)]} ${d} ${MESI[m - 1].toLowerCase()}`
}

const oreFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))
const oreLabel = (n: number) => oreFmt(n).replace('.', ',')
const segno = (n: number) => (n >= 0 ? '+' : '') + oreLabel(n)

// ---- orari HH:mm ----
/** 'HH:mm' → minuti dalla mezzanotte, oppure null se non valido. */
function hhmmToMin(v: string): number | null {
  const m = (v || '').trim().match(/^(\d{1,2}):(\d{1,2})$/)
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}
/** Minuti dalla mezzanotte → 'HH:mm' (con rientro sulle 24h). */
function minToHhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}
/**
 * Ore tra due orari, con la stessa regola del server: se l'uscita non è
 * successiva all'ingresso si assume un turno oltre la mezzanotte.
 */
function oreTra(oraInizio: string, oraFine: string): { ore: number; notte: boolean } | null {
  const a = hhmmToMin(oraInizio)
  const b = hhmmToMin(oraFine)
  if (a == null || b == null) return null
  let diff = b - a
  let notte = false
  if (diff <= 0) { diff += 1440; notte = true }
  return { ore: Math.round((diff / 60) * 10000) / 10000, notte }
}
function fmtRange(from: string, to: string) {
  const f = `${from.slice(8, 10)}/${from.slice(5, 7)}`
  const t = `${to.slice(8, 10)}/${to.slice(5, 7)}`
  return f === t ? f : `${f}–${t}`
}
/** Classe colore per uno scostamento (verde/rosso/neutro). */
function scostClasse(n: number) {
  if (n < -0.001) return 'bg-red-100 text-red-700'
  if (n > 0.001) return 'bg-emerald-100 text-emerald-700'
  return 'bg-gray-100 text-gray-600'
}

/** Data odierna YYYY-MM-DD nel fuso locale del dispositivo. */
function oggiYmd(): string {
  const d = new Date()
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

interface FormRiga {
  id?: string
  data: string
  servizioId: number | ''
  oraInizio: string
  oraFine: string
  mutua: boolean
  note: string
}

export default function TimbratureOperatore({ nome }: { nome: string }) {
  const OGGI = oggiYmd()
  const now = new Date()
  const [vista, setVista] = useState<'oggi' | 'mese'>('oggi')
  const [anno, setAnno] = useState(now.getFullYear())
  const [mese, setMese] = useState(now.getMonth() + 1)
  const [servizi, setServizi] = useState<Servizio[]>([])
  const [timbrature, setTimbrature] = useState<Timbratura[]>([])
  const [riepilogo, setRiepilogo] = useState<RiepilogoPeriodo | null>(null)
  const [finestra, setFinestra] = useState<FinestraMese | null>(null)
  const [scadenza, setScadenza] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')
  const [form, setForm] = useState<FormRiga | null>(null)
  const [salvando, setSalvando] = useState(false)

  const from = ymd(anno, mese, 1)
  const to = ymd(anno, mese, ultimoGiorno(anno, mese))

  const carica = useCallback(async () => {
    setLoading(true)
    setErrore('')
    try {
      const [rT, rR] = await Promise.all([
        fetch(`/api/timbrature?from=${from}&to=${to}`),
        fetch(`/api/timbrature/riepilogo?anno=${anno}&mese=${mese}`),
      ])
      const dT = await rT.json()
      const dR = await rR.json()
      if (!rT.ok) throw new Error(dT.error || 'Errore')
      if (!rR.ok) throw new Error(dR.error || 'Errore')
      setTimbrature(dT.timbrature ?? [])
      setRiepilogo(dR.riepilogo ?? null)
      setFinestra(dR.finestra ?? null)
      setScadenza(dR.scadenza)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di caricamento')
    } finally {
      setLoading(false)
    }
  }, [from, to, anno, mese])

  useEffect(() => {
    fetch('/api/timbrature/servizi')
      .then((r) => r.json())
      .then((d) => setServizi(d.servizi ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => { carica() }, [carica])

  const bloccato = finestra ? !finestra.aperta : false
  /** Prima data per cui si possono ancora registrare ORE DI LAVORO. */
  const daGiorno = finestra?.daGiorno ?? OGGI

  /**
   * Fuori dalla finestra dei tre giorni si possono registrare solo ferie,
   * permessi e malattia: le ore di lavoro di quella data sono ormai chiuse.
   */
  const fuoriFinestra = useCallback(
    (data: string) => data < daGiorno || data > OGGI,
    [daGiorno, OGGI],
  )

  const timbPerGiorno = useMemo(() => {
    const m = new Map<string, Timbratura[]>()
    for (const t of timbrature) {
      const a = m.get(t.data) ?? []
      a.push(t)
      m.set(t.data, a)
    }
    return m
  }, [timbrature])

  const servizioById = useMemo(() => {
    const m = new Map<number, Servizio>()
    servizi.forEach((s) => m.set(s.id, s))
    return m
  }, [servizi])

  const giornoRiep = useMemo(() => {
    const m = new Map<string, RiepilogoPeriodo['giorni'][number]>()
    riepilogo?.giorni.forEach((g) => m.set(g.data, g))
    return m
  }, [riepilogo])

  // Servizi di lavoro più usati dall'operatore (dal mese caricato), poi per ordine.
  const serviziFrequenti = useMemo(() => {
    const conteggio = new Map<number, number>()
    for (const t of timbrature) {
      if (t.tipoVoce === 'lavoro') conteggio.set(t.servizioId, (conteggio.get(t.servizioId) ?? 0) + 1)
    }
    const lavoro = servizi.filter((s) => s.tipoVoce === 'lavoro')
    return [...lavoro]
      .sort((a, b) => (conteggio.get(b.id) ?? 0) - (conteggio.get(a.id) ?? 0) || a.ordine - b.ordine)
      .slice(0, 6)
  }, [timbrature, servizi])

  // Giorni lavorativi senza ore che si possono ANCORA sistemare da soli.
  // Oltre la finestra non ha senso mostrarli come "da completare": il pulsante
  // porterebbe a un vicolo cieco. Restano visibili nella vista Mese.
  const giorniMancanti = useMemo(() => {
    if (!riepilogo) return []
    return riepilogo.giorni
      .filter(
        (g) =>
          g.data <= OGGI &&
          g.data >= daGiorno &&
          !g.festivo &&
          g.oreAttese > 0 &&
          (timbPerGiorno.get(g.data)?.length ?? 0) === 0,
      )
      .sort((a, b) => (a.data < b.data ? 1 : -1))
  }, [riepilogo, timbPerGiorno, OGGI, daGiorno])

  // Streak: giorni lavorativi consecutivi coperti, terminando al giorno lavorativo
  // più recente <= oggi (i festivi/giorni a 0 ore non spezzano la serie).
  const streak = useMemo(() => {
    if (!riepilogo) return 0
    const giorni = riepilogo.giorni.filter((g) => g.data <= OGGI).sort((a, b) => (a.data < b.data ? 1 : -1))
    let count = 0
    for (const g of giorni) {
      if (g.festivo || g.oreAttese === 0) continue
      const ore = (timbPerGiorno.get(g.data) ?? []).reduce((s, t) => s + t.ore, 0)
      if (ore + 1e-9 >= g.oreAttese) count++
      else break
    }
    return count
  }, [riepilogo, timbPerGiorno, OGGI])

  function vaiAOggi() {
    setVista('oggi')
    setAnno(now.getFullYear())
    setMese(now.getMonth() + 1)
  }

  function cambiaMese(delta: number) {
    let m = mese + delta
    let y = anno
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMese(m); setAnno(y)
  }

  /**
   * Nuova riga. Gli orari vengono precompilati per ridurre la digitazione:
   * l'ingresso riprende l'ultima uscita già registrata nella giornata (così una
   * giornata spezzata si costruisce riga dopo riga), e l'uscita copre le ore che
   * restano da coprire rispetto al monte ore.
   */
  function nuovaRiga(data: string) {
    const righe = timbPerGiorno.get(data) ?? []
    const ultimaUscita = righe
      .map((t) => (t.oraFine ? hhmmToMin(t.oraFine) : null))
      .filter((m): m is number => m != null)
      .sort((a, b) => b - a)[0]
    const inizioMin = ultimaUscita ?? hhmmToMin('09:00')!

    const g = giornoRiep.get(data)
    const oreGia = righe.reduce((s, t) => s + t.ore, 0)
    const restanti = g ? Math.max(g.oreAttese - oreGia, 0) : 0
    const durata = restanti > 0.001 ? restanti : 4

    setForm({
      data,
      servizioId: '',
      oraInizio: minToHhmm(inizioMin),
      oraFine: minToHhmm(inizioMin + Math.round(durata * 60)),
      mutua: false,
      note: '',
    })
  }
  function modificaRiga(t: Timbratura) {
    setForm({
      id: t.id, data: t.data, servizioId: t.servizioId,
      oraInizio: t.oraInizio ?? '', oraFine: t.oraFine ?? '',
      mutua: t.mutua, note: t.note ?? '',
    })
  }

  // Fuori finestra restano solo i giustificativi: e' la regola, e il modo piu'
  // onesto di dirla e' non offrire scelte che verrebbero rifiutate dal server.
  const soloGiustificativi = !!form && fuoriFinestra(form.data)
  const serviziForm = useMemo(
    () => (soloGiustificativi ? servizi.filter((s) => s.tipoVoce === 'giustificativo') : servizi),
    [servizi, soloGiustificativi],
  )

  const servSelezionato = form && form.servizioId ? servizioById.get(Number(form.servizioId)) : undefined
  const isGiust = servSelezionato?.tipoVoce === 'giustificativo'
  // Ore della riga in compilazione: sempre derivate dagli orari, mai digitate.
  const calcForm = form && !isGiust ? oreTra(form.oraInizio, form.oraFine) : null

  async function salva() {
    if (!form) return
    if (!form.servizioId) { setErrore('Seleziona un servizio'); return }
    if (!isGiust) {
      if (!form.oraInizio || !form.oraFine) { setErrore('Inserisci orario di ingresso e di uscita'); return }
      if (!calcForm) { setErrore('Orario non valido (formato atteso HH:mm)'); return }
      if (form.oraInizio === form.oraFine) { setErrore('Ingresso e uscita non possono coincidere'); return }
    }
    setSalvando(true); setErrore('')
    try {
      const payload = {
        data: form.data, servizioId: Number(form.servizioId),
        oraInizio: isGiust ? null : form.oraInizio,
        oraFine: isGiust ? null : form.oraFine,
        mutua: isGiust ? false : form.mutua, note: form.note || null,
      }
      const url = form.id ? `/api/timbrature/${form.id}` : '/api/timbrature'
      const method = form.id ? 'PATCH' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore salvataggio')
      setForm(null)
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSalvando(false)
    }
  }

  async function elimina(id: string) {
    if (!confirm('Eliminare questa riga?')) return
    setErrore('')
    try {
      const r = await fetch(`/api/timbrature/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    }
  }

  // ---- dati derivati per la vista Oggi ----
  const righeOggi = timbPerGiorno.get(OGGI) ?? []
  const oreOggi = righeOggi.reduce((s, t) => s + t.ore, 0)
  const gOggi = giornoRiep.get(OGGI)
  const atteseOggi = gOggi?.oreAttese ?? 0
  const oreLavoroOggi = righeOggi.reduce((s, t) => s + (t.tipoVoce === 'lavoro' ? t.ore : 0), 0)
  const oggiCompleto = atteseOggi > 0 && oreOggi + 1e-9 >= atteseOggi
  const nomeCorto = (nome || '').split(' ')[0]

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Barra */}
      <div className="bg-primary text-white px-5 pt-4 pb-3">
        <Link href="/home" className="text-white/70 text-sm hover:text-white">← Home</Link>
        <h1 className="text-lg font-bold">Timbrature</h1>
      </div>

      {/* Tab */}
      <div className="bg-primary px-4 pb-3">
        <div className="flex gap-1 bg-white/15 rounded-xl p-1">
          <button
            onClick={vaiAOggi}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${vista === 'oggi' ? 'bg-white text-primary' : 'text-white/90'}`}
          >
            Oggi
          </button>
          <button
            onClick={() => setVista('mese')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${vista === 'mese' ? 'bg-white text-primary' : 'text-white/90'}`}
          >
            Mese
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5">
        {errore && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{errore}</div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-10">Caricamento…</div>
        ) : vista === 'oggi' ? (
          /* ============================ VISTA OGGI ============================ */
          <div className="space-y-4">
            {/* Card oggi */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="text-xs text-gray-400">{nomeCorto ? `Ciao ${nomeCorto},` : ''} oggi è</div>
              <div className="font-bold text-gray-800 text-lg capitalize">{dataEstesa(OGGI)}</div>

              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <div className="text-3xl font-bold text-brand-cyan-dark">{oreLabel(oreOggi)}<span className="text-base text-gray-400 font-semibold"> h</span></div>
                {gOggi?.festivo ? (
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-rose-500">{gOggi.festivitaNome}</span>
                    {oreLavoroOggi > 0.001 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        lavoro in festività · {oreLabel(oreLavoroOggi)} h
                      </span>
                    )}
                  </span>
                ) : oggiCompleto ? (
                  <span className="text-sm font-semibold text-emerald-600">✓ Giornata completa</span>
                ) : atteseOggi > 0 ? (
                  <span className="text-sm text-amber-600 font-semibold">mancano {oreLabel(Math.max(atteseOggi - oreOggi, 0))} h</span>
                ) : null}
              </div>

              {streak >= 2 && (
                <div className="mt-2 text-xs font-semibold text-orange-500">🔥 {streak} giorni di fila compilati</div>
              )}

              {/* Righe di oggi */}
              {righeOggi.length > 0 && (
                <div className="mt-4 divide-y divide-gray-50 border-t border-gray-100">
                  {righeOggi.map((t) => (
                    <RigaVoce key={t.id} t={t} bloccato={bloccato} onEdit={() => modificaRiga(t)} onDelete={() => elimina(t.id)} />
                  ))}
                </div>
              )}

              {!bloccato && (
                <button
                  onClick={() => nuovaRiga(OGGI)}
                  className="mt-4 w-full py-3 rounded-xl bg-brand-cyan text-white font-bold text-base hover:opacity-90 active:scale-[0.99] transition"
                >
                  + Aggiungi ore di oggi
                </button>
              )}
            </div>

            {bloccato && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                🔒 {finestra?.motivo || 'Mese non modificabile'}. Le righe sono in sola lettura: per una
                correzione rivolgiti al tuo responsabile.
              </div>
            )}

            {!bloccato && (
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
                ⏳ Le ore di lavoro si inseriscono entro <strong className="text-gray-700">3 giorni</strong>:
                oggi e i due precedenti (dal {daGiorno.split('-').reverse().join('/')}). Ferie, permessi e
                malattia si possono registrare anche prima o dopo.
              </div>
            )}

            {/* Giorni da completare */}
            {!bloccato && giorniMancanti.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="text-sm font-bold text-amber-800 mb-2">
                  Da completare — poi non ci torni piu&apos;
                </div>
                <div className="flex flex-wrap gap-2">
                  {giorniMancanti.map((g) => (
                    <button
                      key={g.data}
                      onClick={() => nuovaRiga(g.data)}
                      className="px-3 py-1.5 rounded-full bg-white border border-amber-300 text-amber-800 text-sm font-semibold hover:bg-amber-100"
                    >
                      {weekdayShort(g.data).toLowerCase()} {Number(g.data.slice(8, 10))}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-amber-700/80 mt-2">
                  Tocca un giorno per aggiungere le ore. Passata la finestra dei tre giorni queste ore
                  potra&apos; aggiungerle solo il tuo responsabile.
                </div>
              </div>
            )}

            {/* Riepilogo mese compatto */}
            {riepilogo && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Kpi label="Ore mese" value={oreLabel(riepilogo.oreLavorate)} tone="cyan" />
                  <Kpi label="Attese" value={oreLabel(riepilogo.oreAttese)} tone="slate" />
                  <Kpi label="Scost." value={segno(riepilogo.scostamento)} tone={riepilogo.scostamento < 0 ? 'red' : 'green'} />
                </div>
                <Giustificativi voci={riepilogo.giustificativi} totale={riepilogo.oreGiustificativo} />
              </>
            )}

            <button onClick={() => setVista('mese')} className="w-full text-center text-sm font-semibold text-brand-cyan-dark py-2">
              Vedi tutto il mese →
            </button>
          </div>
        ) : (
          /* ============================ VISTA MESE ============================ */
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
              <button onClick={() => cambiaMese(-1)} className="text-2xl text-gray-400 hover:text-gray-700 px-2">‹</button>
              <div className="text-center">
                <div className="font-bold text-gray-800">{MESI[mese - 1]} {anno}</div>
                {scadenza && (
                  <div className="text-xs text-gray-500">
                    Il mese si chiude il {scadenza.split('-').reverse().join('/')}
                  </div>
                )}
              </div>
              <button onClick={() => cambiaMese(1)} className="text-2xl text-gray-400 hover:text-gray-700 px-2">›</button>
            </div>

            {riepilogo && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Kpi label="Ore lavorate" value={oreLabel(riepilogo.oreLavorate)} tone="cyan" />
                  <Kpi label="Ore attese" value={oreLabel(riepilogo.oreAttese)} tone="slate" />
                  <Kpi label="Scostamento" value={segno(riepilogo.scostamento)} tone={riepilogo.scostamento < 0 ? 'red' : 'green'} />
                </div>
                <Giustificativi voci={riepilogo.giustificativi} totale={riepilogo.oreGiustificativo} />
              </>
            )}

            {/* Scostamento per settimana */}
            {riepilogo && riepilogo.settimane.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
                <div className="text-xs font-semibold text-gray-500 mb-2">Scostamento per settimana</div>
                <div className="space-y-1.5">
                  {riepilogo.settimane.map((s) => (
                    <div key={s.inizio} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Sett. {fmtRange(s.inizio, s.fine)}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-gray-400">{oreLabel(s.oreLavorate)}/{oreLabel(s.oreAttese)} h</span>
                        {s.conclusa ? (
                          <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${scostClasse(s.scostamento)}`}>
                            {segno(s.scostamento)} h
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">in corso</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bloccato && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                🔒 {finestra?.motivo || 'Mese non modificabile'}. Le righe sono in sola lettura.
              </div>
            )}

            <div className="space-y-2">
              {(riepilogo?.giorni ?? []).map((g) => {
                const righe = timbPerGiorno.get(g.data) ?? []
                const oreGiorno = righe.reduce((s, t) => s + t.ore, 0)
                const oreLavoroGiorno = righe.reduce((s, t) => s + (t.tipoVoce === 'lavoro' ? t.ore : 0), 0)
                const incompleto = !g.festivo && oreGiorno + 1e-9 < g.oreAttese
                return (
                  <div key={g.data} className={`bg-white rounded-xl border ${incompleto ? 'border-amber-200' : 'border-gray-100'} shadow-sm`}>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="text-center w-10">
                          <div className="text-xs text-gray-400">{weekdayShort(g.data)}</div>
                          <div className="font-bold text-gray-700">{Number(g.data.slice(8, 10))}</div>
                        </div>
                        {g.festivo ? (
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-rose-500">{g.festivitaNome}</span>
                            {oreLavoroGiorno > 0.001 && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                lavoro in festività · {oreLabel(oreLavoroGiorno)} h
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">
                            {oreLabel(oreGiorno)} / {oreLabel(g.oreAttese)} h
                            {incompleto && <span className="ml-1 text-amber-600 font-semibold">·  incompleto</span>}
                          </span>
                        )}
                      </div>
                      {!bloccato && (
                        <button
                          onClick={() => nuovaRiga(g.data)}
                          title={fuoriFinestra(g.data) ? 'Fuori finestra: solo ferie, permessi o malattia' : undefined}
                          className={`text-sm font-semibold hover:underline ${fuoriFinestra(g.data) ? 'text-gray-400' : 'text-brand-cyan-dark'}`}
                        >
                          + riga
                        </button>
                      )}
                    </div>
                    {righe.length > 0 && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {righe.map((t) => (
                          <RigaVoce
                            key={t.id}
                            t={t}
                            bloccato={bloccato || (t.tipoVoce === 'lavoro' && fuoriFinestra(t.data))}
                            onEdit={() => modificaRiga(t)}
                            onDelete={() => elimina(t.id)}
                            compact
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom sheet inserimento */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={() => setForm(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-1">{form.id ? 'Modifica' : 'Aggiungi ore'}</h3>
            <p className="text-sm text-gray-500 mb-4 capitalize">{dataEstesa(form.data)}</p>

            {/* Servizio */}
            <label className="block text-sm font-semibold text-gray-600 mb-2">Servizio</label>
            {soloGiustificativi && (
              <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Le ore di lavoro di questa giornata non sono piu&apos; modificabili (si possono inserire
                solo entro il giorno stesso e i due successivi). Qui puoi registrare ferie, permessi o
                malattia; per correggere le ore scrivi al tuo responsabile.
              </div>
            )}
            <div className="flex flex-wrap gap-2 mb-3">
              {!soloGiustificativi && serviziFrequenti.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setForm({ ...form, servizioId: s.id })}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border transition ${Number(form.servizioId) === s.id ? 'bg-brand-cyan text-white border-brand-cyan' : 'bg-white text-gray-700 border-gray-300 hover:border-brand-cyan'}`}
                >
                  {s.nome}
                </button>
              ))}
            </div>
            <select
              value={form.servizioId}
              onChange={(e) => setForm({ ...form, servizioId: e.target.value ? Number(e.target.value) : '' })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm"
            >
              <option value="">{soloGiustificativi ? '— scegli una voce —' : '— altri servizi / giustificativi —'}</option>
              {!soloGiustificativi && (
                <optgroup label="Servizi">
                  {serviziForm.filter((s) => s.tipoVoce === 'lavoro').map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Giustificativi">
                {serviziForm.filter((s) => s.tipoVoce === 'giustificativo').map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </optgroup>
            </select>

            {/* Ingresso / uscita (solo lavoro) */}
            {!isGiust && (
              <>
                <div className="flex gap-3 mb-2">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-600 mb-1">Ingresso</label>
                    <input
                      type="time"
                      value={form.oraInizio}
                      onChange={(e) => setForm({ ...form, oraInizio: e.target.value })}
                      className="w-full h-12 text-center text-xl font-bold border border-gray-300 rounded-xl"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-600 mb-1">Uscita</label>
                    <input
                      type="time"
                      value={form.oraFine}
                      onChange={(e) => setForm({ ...form, oraFine: e.target.value })}
                      className="w-full h-12 text-center text-xl font-bold border border-gray-300 rounded-xl"
                    />
                  </div>
                </div>

                {/* Ore: valore derivato, non modificabile */}
                <div className="mb-3 rounded-xl bg-gray-50 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Ore conteggiate</span>
                  <span className="flex items-center gap-2">
                    {calcForm?.notte && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                        oltre mezzanotte
                      </span>
                    )}
                    <span className="text-lg font-bold text-brand-cyan-dark">
                      {calcForm ? `${oreLabel(calcForm.ore)} h` : '—'}
                    </span>
                  </span>
                </div>

                {/* Durate rapide: spostano l'uscita, l'ingresso resta quello scelto */}
                <div className="flex gap-2 mb-4">
                  {[2, 4, 6, 8].map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        const a = hhmmToMin(form.oraInizio)
                        if (a == null) return
                        setForm({ ...form, oraFine: minToHhmm(a + p * 60) })
                      }}
                      className="flex-1 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-brand-cyan hover:text-brand-cyan-dark"
                    >
                      {p}h
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
                  <input type="checkbox" checked={form.mutua} onChange={(e) => setForm({ ...form, mutua: e.target.checked })} />
                  Malattia (Mutua)
                </label>
                <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded-lg px-3 py-2">
                  Se la giornata è spezzata (es. mattina e pomeriggio) inserisci una riga per ogni fascia oraria.
                </p>
              </>
            )}
            {isGiust && (
              <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded-lg px-3 py-2">Il giustificativo occupa automaticamente il monte ore atteso della giornata.</p>
            )}

            <label className="block text-sm font-semibold text-gray-600 mb-1">Note <span className="font-normal text-gray-400">(facoltative)</span></label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm" />

            <div className="flex gap-3">
              <button onClick={() => setForm(null)} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-semibold">Annulla</button>
              <button onClick={salva} disabled={salvando} className="flex-1 py-3 rounded-xl bg-brand-cyan text-white font-bold disabled:opacity-50">
                {salvando ? 'Salvo…' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RigaVoce({ t, bloccato, onEdit, onDelete, compact }: { t: Timbratura; bloccato: boolean; onEdit: () => void; onDelete: () => void; compact?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${compact ? 'px-4 py-2' : 'py-2.5'} text-sm`}>
      <div className="min-w-0">
        <span className={`font-medium ${t.tipoVoce === 'giustificativo' ? 'text-accent-purple' : 'text-gray-800'}`}>
          {t.servizioNome}{t.mutua ? ' (Mutua)' : ''}
        </span>
        {t.perConto && (
          <span
            title="Riga inserita dal tuo responsabile"
            className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
          >
            dal responsabile
          </span>
        )}
        <span className="text-gray-400 ml-2 font-semibold">{oreLabel(t.ore)} h</span>
        <div className="text-xs text-gray-400 truncate">
          {t.oraInizio && t.oraFine && (
            <span>
              {t.oraInizio}–{t.oraFine}
              {t.notte && <span className="text-indigo-500"> (oltre mezzanotte)</span>}
              {t.note ? ' · ' : ''}
            </span>
          )}
          {t.note}
        </div>
      </div>
      {!bloccato && (
        <div className="flex gap-3 text-xs shrink-0">
          <button onClick={onEdit} className="text-gray-500 hover:text-gray-800">Modifica</button>
          <button onClick={onDelete} className="text-red-500 hover:text-red-700">Elimina</button>
        </div>
      )}
    </div>
  )
}

/**
 * Ore usate per ogni giustificativo nel mese (Ferie, Flessibilità, Permessi…).
 * I tre KPI da soli non dicono *cosa* è stato usato: questo riquadro sì.
 */
function Giustificativi({ voci, totale }: { voci: OrePerVoce[]; totale: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500">Ferie, permessi e altre voci</span>
        <span className="text-xs font-semibold text-accent-purple">{oreLabel(totale)} h</span>
      </div>
      {voci.length === 0 ? (
        <div className="text-xs text-gray-400 italic">Nessuna voce usata in questo mese.</div>
      ) : (
        <div className="space-y-1.5">
          {voci.map((v) => (
            <div key={v.servizioId} className="flex items-center justify-between text-sm">
              <span className="text-accent-purple font-medium">{v.nome}</span>
              <span className="text-gray-500 font-semibold">{oreLabel(v.ore)} h</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'cyan' | 'slate' | 'red' | 'green' }) {
  const tones: Record<string, string> = {
    cyan: 'text-brand-cyan-dark',
    slate: 'text-slate-600',
    red: 'text-red-600',
    green: 'text-emerald-600',
  }
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-3 py-3 text-center">
      <div className={`text-xl font-bold ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
