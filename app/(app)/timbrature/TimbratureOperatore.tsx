'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/ui/Header'
import type { Servizio, Timbratura, RiepilogoPeriodo, FinestraMese } from '@/types/timbrature'
import { RiepilogoMese } from './_componenti/RiepilogoMese'
import { GiorniMese, RigaVoce } from './_componenti/GiorniMese'
import {
  MESI,
  dataEstesa,
  oggiYmd,
  oreLabel,
  pad,
  ultimoGiornoMese as ultimoGiorno,
  weekdayShort,
  ymd,
} from './_componenti/mese'

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
function oreTra(oraInizio: string, oraFine: string): { ore: number; oltreMezzanotte: boolean } | null {
  const a = hhmmToMin(oraInizio)
  const b = hhmmToMin(oraFine)
  if (a == null || b == null) return null
  let diff = b - a
  let oltreMezzanotte = false
  if (diff <= 0) { diff += 1440; oltreMezzanotte = true }
  return { ore: Math.round((diff / 60) * 10000) / 10000, oltreMezzanotte }
}
interface FormRiga {
  id?: string
  data: string
  servizioId: number | ''
  oraInizio: string
  oraFine: string
  /**
   * Turno notturno e turno in reperibilita': due dichiarazioni, non due calcoli.
   * Non vengono mai proposte accese — la maggiorazione notturna e' forfettaria a
   * notte e l'indennita' di reperibilita' si liquida a turno, quindi una spunta
   * messa dal sistema al posto della persona sarebbe una voce in busta paga che
   * nessuno ha dichiarato.
   */
  notte: boolean
  reperibilita: boolean
  mutua: boolean
  note: string
  /** Solo per giustificativi "ad ore": scelto "alcune ore" invece di giornata intera. */
  adOre: boolean
}

/** Inserimento di un'assenza su piu' giorni consecutivi. */
interface FormPeriodo {
  servizioId: number | ''
  dal: string
  al: string
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
  /**
   * Messaggio non-di-errore da mostrare dopo un salvataggio: oggi serve a dire
   * che un turno oltre la mezzanotte e' stato diviso su due giorni. Ritrovarsi
   * righe su una data che non si e' digitata va spiegato, non subito.
   */
  const [avviso, setAvviso] = useState('')
  const [form, setForm] = useState<FormRiga | null>(null)
  const [formPeriodo, setFormPeriodo] = useState<FormPeriodo | null>(null)
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
      notte: false,
      reperibilita: false,
      mutua: false,
      note: '',
      adOre: false,
    })
  }
  function modificaRiga(t: Timbratura) {
    setForm({
      id: t.id, data: t.data, servizioId: t.servizioId,
      oraInizio: t.oraInizio ?? '', oraFine: t.oraFine ?? '',
      notte: t.notte, reperibilita: t.reperibilita,
      mutua: t.mutua, note: t.note ?? '',
      // Un giustificativo con orario salvato era stato preso "ad ore".
      adOre: t.tipoVoce === 'giustificativo' && !!t.oraInizio,
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
  // Alcuni giustificativi (Ferie, Flessibilità, Congedo parentale, Legge 104,
  // Permessi retribuiti) si possono prendere anche per una fascia oraria,
  // non solo a giornata intera.
  const puoAdOre = isGiust && !!servSelezionato?.adOre
  const adOreAttivo = puoAdOre && !!form?.adOre
  const contaOrario = !isGiust || adOreAttivo
  // Ore della riga in compilazione: sempre derivate dagli orari, mai digitate.
  const calcForm = form && contaOrario ? oreTra(form.oraInizio, form.oraFine) : null

  async function salva() {
    if (!form) return
    if (!form.servizioId) { setErrore('Seleziona un servizio'); return }
    if (contaOrario) {
      if (!form.oraInizio || !form.oraFine) { setErrore('Inserisci orario di inizio e di fine'); return }
      if (!calcForm) { setErrore('Orario non valido (formato atteso HH:mm)'); return }
      if (form.oraInizio === form.oraFine) { setErrore('Inizio e fine non possono coincidere'); return }
    }
    setSalvando(true); setErrore(''); setAvviso('')
    try {
      const payload = {
        data: form.data, servizioId: Number(form.servizioId),
        oraInizio: contaOrario ? form.oraInizio : null,
        oraFine: contaOrario ? form.oraFine : null,
        // Le spunte valgono solo sulle ore di lavoro: su un giustificativo il
        // server le rifiuterebbe comunque, tanto vale non mandarle.
        notte: isGiust ? false : form.notte,
        reperibilita: isGiust ? false : form.reperibilita,
        mutua: isGiust ? false : form.mutua, note: form.note || null,
      }
      const url = form.id ? `/api/timbrature/${form.id}` : '/api/timbrature'
      const method = form.id ? 'PATCH' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore salvataggio')
      setForm(null)
      if (d.avviso) setAvviso(d.avviso)
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

  // ---- assenze su un periodo -------------------------------------------------

  /** I giustificativi disponibili, con Ferie in testa: e' il caso piu' frequente. */
  const vociAssenza = useMemo(() => {
    const g = servizi.filter((s) => s.tipoVoce === 'giustificativo')
    return [...g].sort((a, b) => (a.nome === 'Ferie' ? -1 : b.nome === 'Ferie' ? 1 : a.ordine - b.ordine))
  }, [servizi])

  function apriPeriodo() {
    const primo = ymd(anno, mese, 1)
    setFormPeriodo({ servizioId: vociAssenza[0]?.id ?? '', dal: primo, al: primo })
  }

  /**
   * Racconta com'e' andato l'inserimento su un periodo, giorno per giorno.
   * Un "fatto" secco non basta: se di dieci giorni ne sono entrati otto, la
   * persona deve sapere quali due sono rimasti fuori e perche', altrimenti
   * scopre il buco a fine mese.
   */
  function riassumiPeriodo(d: any, azione: 'inserite' | 'rimosse'): string {
    const parti: string[] = []
    const n = azione === 'rimosse' ? (d.rimosse ?? []).length : (d.inserite ?? []).length
    parti.push(n === 1 ? `1 giornata ${azione === 'rimosse' ? 'rimossa' : 'inserita'}` : `${n} giornate ${azione === 'rimosse' ? 'rimosse' : 'inserite'}`)
    const gg = (v: string[]) => v.map((x) => Number(x.slice(8, 10))).join(', ')
    if (d.nonLavorativi?.length) parti.push(`saltati perché non lavorativi: ${gg(d.nonLavorativi)}`)
    if (d.giaCompilati?.length) parti.push(`saltati perché già compilati: ${gg(d.giaCompilati)}`)
    if (d.errori?.length) parti.push(`non inseriti: ${d.errori.map((e: any) => `${Number(e.data.slice(8, 10))} (${e.motivo})`).join('; ')}`)
    return parti.join(' · ')
  }

  async function salvaPeriodo(rimuovi = false) {
    if (!formPeriodo) return
    if (!formPeriodo.servizioId) { setErrore('Scegli la voce da inserire'); return }
    if (formPeriodo.al < formPeriodo.dal) { setErrore('L\'ultimo giorno è precedente al primo'); return }
    setSalvando(true); setErrore(''); setAvviso('')
    try {
      const r = await fetch('/api/timbrature/assenza', {
        method: rimuovi ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servizioId: Number(formPeriodo.servizioId),
          dal: formPeriodo.dal,
          al: formPeriodo.al,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      setFormPeriodo(null)
      setAvviso(riassumiPeriodo(d, rimuovi ? 'rimosse' : 'inserite'))
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSalvando(false)
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
      <Header title="Timbrature" backHref="/home" backLabel="Torna alla Home" />

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
        {avviso && (
          <div className="mb-4 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 flex items-start justify-between gap-3">
            <span>{avviso}</span>
            <button onClick={() => setAvviso('')} className="text-indigo-400 hover:text-indigo-700 shrink-0" aria-label="Chiudi">✕</button>
          </div>
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
                    <RigaVoce
                      key={t.id}
                      t={t}
                      modificabile={!bloccato}
                      onModifica={modificaRiga}
                      onElimina={elimina}
                    />
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

            {/*
              Qui stavano i tre KPI del mese e il riquadro dei giustificativi.
              Tolti di proposito: erano gli stessi numeri della vista Mese, dove
              hanno intorno il contesto che serve a leggerli (settimane,
              flessibilita', giorno per giorno). "Oggi" serve a timbrare, non a
              fare i conti del mese.
            */}
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
              <RiepilogoMese riepilogo={riepilogo} timbrature={timbrature} servizi={servizi} />
            )}

            {/* Ferie e permessi su piu' giorni: quattordici giornate non si aprono una per una. */}
            {!bloccato && (
              <button
                onClick={apriPeriodo}
                className="w-full py-3 rounded-xl border border-dashed border-accent-purple/50 text-sm font-semibold text-accent-purple hover:bg-purple-50"
              >
                + Aggiungi assenza su più giorni
              </button>
            )}

            {bloccato && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                🔒 {finestra?.motivo || 'Mese non modificabile'}. Le righe sono in sola lettura.
              </div>
            )}

            {riepilogo && (
              <GiorniMese
                riepilogo={riepilogo}
                timbrature={timbrature}
                oggi={OGGI}
                modificabile={!bloccato}
                fuoriFinestra={fuoriFinestra}
                onAggiungi={nuovaRiga}
                onModifica={modificaRiga}
                onElimina={elimina}
              />
            )}
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
              onChange={(e) => setForm({ ...form, servizioId: e.target.value ? Number(e.target.value) : '', adOre: false })}
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

            {/* Giornata intera / ad ore (solo per i giustificativi che lo ammettono) */}
            {puoAdOre && (
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, adOre: false })}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${!form.adOre ? 'bg-brand-cyan text-white border-brand-cyan' : 'bg-white text-gray-700 border-gray-300 hover:border-brand-cyan'}`}
                >
                  Giornata intera
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, adOre: true })}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${form.adOre ? 'bg-brand-cyan text-white border-brand-cyan' : 'bg-white text-gray-700 border-gray-300 hover:border-brand-cyan'}`}
                >
                  Alcune ore
                </button>
              </div>
            )}

            {/* Ingresso / uscita: lavoro, oppure giustificativo preso ad ore */}
            {contaOrario && (
              <>
                <div className="flex gap-3 mb-2">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-600 mb-1">{isGiust ? 'Dalle' : 'Ingresso'}</label>
                    <input
                      type="time"
                      value={form.oraInizio}
                      onChange={(e) => setForm({ ...form, oraInizio: e.target.value })}
                      className="w-full h-12 text-center text-xl font-bold border border-gray-300 rounded-xl"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-600 mb-1">{isGiust ? 'Alle' : 'Uscita'}</label>
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
                    {calcForm?.oltreMezzanotte && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                        su due giorni
                      </span>
                    )}
                    <span className="text-lg font-bold text-brand-cyan-dark">
                      {calcForm ? `${oreLabel(calcForm.ore)} h` : '—'}
                    </span>
                  </span>
                </div>

                {/* Il turno scavalca la mezzanotte: dirlo PRIMA di salvare, non dopo. */}
                {calcForm?.oltreMezzanotte && (
                  <div className="mb-3 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs text-indigo-800">
                    Il turno finisce il giorno dopo: al salvataggio lo divido in due righe, una per
                    giornata. Le ore che cadono dopo la mezzanotte valgono come ore lavorate del
                    giorno seguente.
                  </div>
                )}

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

                {!isGiust && (
                  <div className="mb-4 space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={form.notte} onChange={(e) => setForm({ ...form, notte: e.target.checked })} />
                      Turno di notte
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={form.reperibilita} onChange={(e) => setForm({ ...form, reperibilita: e.target.checked })} />
                      In reperibilità
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={form.mutua} onChange={(e) => setForm({ ...form, mutua: e.target.checked })} />
                      Malattia (Mutua)
                    </label>
                    <p className="text-xs text-gray-400">
                      Spunta la notte una sola volta per turno: se il turno è diviso su due giorni,
                      mettila sulla riga in cui hai iniziato.
                    </p>
                  </div>
                )}
                <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded-lg px-3 py-2">
                  {isGiust
                    ? 'Se ti serve solo una parte della giornata, indica la fascia oraria: il resto del monte ore atteso resta da coprire con lavoro o un\'altra voce.'
                    : 'Se la giornata è spezzata (es. mattina e pomeriggio) inserisci una riga per ogni fascia oraria.'}
                </p>
              </>
            )}
            {isGiust && !adOreAttivo && (
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

      {/* Assenza su piu' giorni: solo giornate intere, e lo dice */}
      {formPeriodo && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={() => setFormPeriodo(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-1">Assenza su più giorni</h3>
            <p className="text-sm text-gray-500 mb-4">
              Inserisce una giornata intera per ogni giorno del periodo.
            </p>

            <label className="block text-sm font-semibold text-gray-600 mb-1">Voce</label>
            <select
              value={formPeriodo.servizioId}
              onChange={(e) => setFormPeriodo({ ...formPeriodo, servizioId: e.target.value ? Number(e.target.value) : '' })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm"
            >
              {vociAssenza.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>

            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-600 mb-1">Dal</label>
                <input
                  type="date"
                  value={formPeriodo.dal}
                  onChange={(e) => setFormPeriodo({ ...formPeriodo, dal: e.target.value, al: e.target.value > formPeriodo.al ? e.target.value : formPeriodo.al })}
                  className="w-full h-11 px-2 border border-gray-300 rounded-xl text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-600 mb-1">Al</label>
                <input
                  type="date"
                  value={formPeriodo.al}
                  min={formPeriodo.dal}
                  onChange={(e) => setFormPeriodo({ ...formPeriodo, al: e.target.value })}
                  className="w-full h-11 px-2 border border-gray-300 rounded-xl text-sm"
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded-lg px-3 py-2">
              Salto le domeniche, i festivi e i giorni che hai già compilato, e a fine inserimento ti
              dico quali. Per prendere solo alcune ore di una giornata vai sul singolo giorno.
            </p>

            <div className="flex gap-3">
              <button onClick={() => setFormPeriodo(null)} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-semibold">Annulla</button>
              <button onClick={() => salvaPeriodo(false)} disabled={salvando} className="flex-1 py-3 rounded-xl bg-accent-purple text-white font-bold disabled:opacity-50">
                {salvando ? 'Salvo…' : 'Inserisci'}
              </button>
            </div>
            {/* Il piano cambia: togliere due settimane di ferie una per una e' la stessa noia rovesciata. */}
            <button
              onClick={() => salvaPeriodo(true)}
              disabled={salvando}
              className="w-full mt-3 py-2 text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              Togli questa voce dal periodo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
