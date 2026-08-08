'use client'

/**
 * Cruscotto di validazione dei fogli ore.
 *
 * Stessa pagina per due ruoli diversi, deciso dal server:
 *   - HR   → vede tutti, puo' riaprire un mese, gestisce il monte ore e la
 *            sincronizzazione con l'anagrafica;
 *   - responsabile → vede solo i propri collaboratori e puo' controllare,
 *            correggere e validare i loro fogli.
 *
 * Il gesto centrale e' "Valida": da li' parte la mail al dipendente con il PDF
 * e i pulsanti di conferma.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { VariazioniOrario } from './_componenti/VariazioniOrario'
import {
  ETICHETTA_STATO,
  type StatoDipendenteMese,
  type StatoMese,
  type Timbratura,
  type RiepilogoPeriodo,
  type ProfiloOrario,
  type ChiusuraMese,
  type Servizio,
} from '@/types/timbrature'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const oreFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))
const segno = (n: number) => (n >= 0 ? '+' : '') + oreFmt(n)
const gg = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`

function fmtRange(from: string, to: string) {
  const f = gg(from)
  const t = gg(to)
  return f === t ? f : `${f}–${t}`
}
function scostClasse(n: number) {
  if (n < -0.001) return 'bg-red-100 text-red-700'
  if (n > 0.001) return 'bg-emerald-100 text-emerald-700'
  return 'bg-gray-100 text-gray-600'
}

/** Colore del badge di stato: deve dire a colpo d'occhio dove si e' fermi. */
const STILE_STATO: Record<StatoMese, string> = {
  aperto: 'bg-gray-100 text-gray-500',
  da_validare: 'bg-amber-100 text-amber-800',
  validato: 'bg-sky-100 text-sky-800',
  confermato: 'bg-emerald-100 text-emerald-700',
  contestato: 'bg-orange-100 text-orange-800',
}

interface Dettaglio {
  dipendente: { id: number; cognomeNome: string; email: string; referenteEmail: string | null }
  timbrature: Timbratura[]
  riepilogo: RiepilogoPeriodo
  profili: ProfiloOrario[]
  chiusura: ChiusuraMese | null
  servizi: Servizio[]
}

interface FormRiga {
  id?: string
  data: string
  servizioId: number | ''
  oraInizio: string
  oraFine: string
  /** Dichiarazioni, non calcoli: vedi la nota in TimbratureOperatore. */
  notte: boolean
  reperibilita: boolean
  mutua: boolean
  note: string
  /** Solo per giustificativi "ad ore": scelto "alcune ore" invece di giornata intera. */
  adOre: boolean
}

export default function CruscottoTimbrature() {
  const now = new Date()
  const [anno, setAnno] = useState(now.getFullYear())
  const [mese, setMese] = useState(now.getMonth() + 1)
  const [ruolo, setRuolo] = useState<'hr' | 'responsabile'>('responsabile')
  const [righe, setRighe] = useState<StatoDipendenteMese[]>([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')
  const [avviso, setAvviso] = useState('')
  const [visionati, setVisionati] = useState<Set<number>>(new Set())
  const [dettaglio, setDettaglio] = useState<Dettaglio | null>(null)
  const [azione, setAzione] = useState(false)
  const [rigaForm, setRigaForm] = useState<FormRiga | null>(null)
  const [sincronizzando, setSincronizzando] = useState(false)
  const [esitoSync, setEsitoSync] = useState<string>('')
  const [ordine, setOrdine] = useState<'nome' | 'flessibilita'>('nome')

  const isHr = ruolo === 'hr'

  /**
   * L'elenco nell'ordine scelto. Per nome e' l'ordine naturale in cui si cerca
   * una persona; per flessibilita' e' il taglio con cui si controlla chi sta
   * accumulando un debito di ore, con i saldi piu' negativi in cima.
   */
  const righeOrdinate = useMemo(() => {
    if (ordine === 'nome') return righe
    return [...righe].sort(
      (a, b) => a.flessibilitaSaldo - b.flessibilitaSaldo || a.cognomeNome.localeCompare(b.cognomeNome, 'it'),
    )
  }, [righe, ordine])

  const festivoByData = useMemo(() => {
    const m = new Map<string, string>()
    dettaglio?.riepilogo.giorni.forEach((g) => {
      if (g.festivo) m.set(g.data, g.festivitaNome ?? 'Festività')
    })
    return m
  }, [dettaglio])

  const carica = useCallback(async () => {
    setLoading(true); setErrore('')
    try {
      const r = await fetch(`/api/timbrature/hr/stato?anno=${anno}&mese=${mese}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      setRighe(d.dipendenti ?? [])
      if (d.ruolo) setRuolo(d.ruolo)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }, [anno, mese])

  useEffect(() => { carica() }, [carica])

  function cambiaMese(delta: number) {
    let m = mese + delta, y = anno
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMese(m); setAnno(y); setVisionati(new Set())
  }

  async function apriDettaglio(dipendenteId: number) {
    setErrore('')
    try {
      const r = await fetch(`/api/timbrature/hr/dipendente/${dipendenteId}?anno=${anno}&mese=${mese}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      setDettaglio(d)
      setRigaForm(null)
      setVisionati((s) => new Set(s).add(dipendenteId))
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    }
  }

  async function chiama(url: string, body: unknown, conferma?: string) {
    if (conferma && !confirm(conferma)) return null
    setAzione(true); setErrore(''); setAvviso('')
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      return d
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
      return null
    } finally {
      setAzione(false)
    }
  }

  async function valida(dipendenteId: number, nominativo: string, anticipata = false) {
    const d = await chiama(
      '/api/timbrature/hr/valida',
      { dipendenteId, anno, mese },
      (anticipata
        ? `Il mese di ${nominativo} è già completo: chiuderlo adesso, senza aspettare la scadenza?\n\n`
        : `Validare il foglio ore di ${nominativo}?\n\n`) +
        `Il foglio viene archiviato nella cartella personale e ${nominativo} riceve subito il PDF via mail, con i pulsanti per confermarlo.`,
    )
    if (!d) return
    setAvviso(
      d.senzaPdf
        ? 'Foglio validato e mail inviata, ma la conversione in PDF non è riuscita: l’allegato manca.'
        : `Foglio validato. ${nominativo} ha ricevuto il PDF da confermare.`,
    )
    setDettaglio(null)
    await carica()
  }

  async function forza(dipendenteId: number, nominativo: string) {
    const d = await chiama(
      '/api/timbrature/hr/forza',
      { dipendenteId, anno, mese },
      `Chiudere d’ufficio il foglio ore di ${nominativo}, senza la sua conferma?\n\nResterà scritto sul documento che l’ok è presunto e non dato.`,
    )
    if (!d) return
    setAvviso('Foglio chiuso senza riscontro del dipendente.')
    setDettaglio(null)
    await carica()
  }

  async function riapri(dipendenteId: number) {
    const d = await chiama(
      '/api/timbrature/hr/riapri',
      { dipendenteId, anno, mese },
      'Riaprire il mese? Il dipendente potrà di nuovo inserire le ore e il percorso di validazione ricomincia da capo.',
    )
    if (!d) return
    setDettaglio(null)
    await carica()
  }

  async function sincronizza() {
    setSincronizzando(true); setErrore(''); setEsitoSync('')
    try {
      const r = await fetch('/api/timbrature/hr/sincronizza', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      const e = d.esito as {
        esaminati: number; creati: number; attivati: number; disattivati: number
        aggiornati: number; decaduti: string[]; senzaMail: string[]; errori: string[]
      }
      const parti: string[] = [`${e.esaminati} schede esaminate`]
      if (e.creati) parti.push(`${e.creati} aggiunte`)
      if (e.attivati) parti.push(`${e.attivati} riattivate`)
      if (e.disattivati) parti.push(`${e.disattivati} disattivate`)
      if (e.aggiornati) parti.push(`${e.aggiornati} anagrafiche aggiornate`)
      if (!e.creati && !e.attivati && !e.disattivati && !e.aggiornati) parti.push('nessuna modifica')
      if (e.decaduti.length) parti.push(`⚠ spunta attiva ma rapporto chiuso: ${e.decaduti.join(', ')}`)
      if (e.senzaMail.length) parti.push(`⚠ senza mail aziendale: ${e.senzaMail.join(', ')}`)
      if (e.errori.length) parti.push(`⚠ errori: ${e.errori.join(' · ')}`)
      setEsitoSync(parti.join(' · '))
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSincronizzando(false)
    }
  }

  /**
   * Registra una variazione di orario.
   *
   * La decorrenza e' scelta, non piu' forzata al primo del mese che si sta
   * guardando: un passaggio a part-time puo' partire il 16, e con la data
   * imposta sarebbe stato impossibile registrarlo per come e' andato davvero.
   */
  // ---------------------------------------------------------------- righe
  function nuovaRiga() {
    if (!dettaglio) return
    setRigaForm({
      data: `${anno}-${String(mese).padStart(2, '0')}-01`,
      servizioId: '', oraInizio: '09:00', oraFine: '13:00',
      notte: false, reperibilita: false, mutua: false, note: '',
      adOre: false,
    })
  }
  function modificaRiga(t: Timbratura) {
    setRigaForm({
      id: t.id, data: t.data, servizioId: t.servizioId,
      oraInizio: t.oraInizio ?? '', oraFine: t.oraFine ?? '',
      notte: t.notte, reperibilita: t.reperibilita,
      mutua: t.mutua, note: t.note ?? '',
      // Un giustificativo con orario salvato era stato preso "ad ore".
      adOre: t.tipoVoce === 'giustificativo' && !!t.oraInizio,
    })
  }

  const servizioSelezionato = useMemo(() => {
    if (!dettaglio || !rigaForm?.servizioId) return undefined
    return dettaglio.servizi.find((s) => s.id === Number(rigaForm.servizioId))
  }, [dettaglio, rigaForm])
  const rigaGiustificativo = servizioSelezionato?.tipoVoce === 'giustificativo'
  const rigaPuoAdOre = rigaGiustificativo && !!servizioSelezionato?.adOre
  const rigaAdOreAttivo = rigaPuoAdOre && !!rigaForm?.adOre
  const rigaContaOrario = !rigaGiustificativo || rigaAdOreAttivo

  async function salvaRiga() {
    if (!dettaglio || !rigaForm) return
    if (!rigaForm.servizioId) { setErrore('Seleziona un servizio'); return }
    setAzione(true); setErrore('')
    try {
      const payload = {
        dipendenteId: dettaglio.dipendente.id,
        data: rigaForm.data,
        servizioId: Number(rigaForm.servizioId),
        oraInizio: rigaContaOrario ? rigaForm.oraInizio : null,
        oraFine: rigaContaOrario ? rigaForm.oraFine : null,
        notte: rigaGiustificativo ? false : rigaForm.notte,
        reperibilita: rigaGiustificativo ? false : rigaForm.reperibilita,
        mutua: rigaGiustificativo ? false : rigaForm.mutua,
        note: rigaForm.note || null,
      }
      const url = rigaForm.id ? `/api/timbrature/hr/riga/${rigaForm.id}` : '/api/timbrature/hr/riga'
      const r = await fetch(url, {
        method: rigaForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      setRigaForm(null)
      // Un turno oltre la mezzanotte e' diventato due righe: dirlo, perche' la
      // seconda sta su un giorno che chi ha inserito non ha digitato.
      if (d.avviso) setAvviso(d.avviso)
      await apriDettaglio(dettaglio.dipendente.id)
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setAzione(false)
    }
  }

  async function eliminaRiga(id: string) {
    if (!dettaglio) return
    if (!confirm('Eliminare questa riga dal foglio ore del dipendente?')) return
    setAzione(true); setErrore('')
    try {
      const r = await fetch(`/api/timbrature/hr/riga/${id}?dipendenteId=${dettaglio.dipendente.id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      await apriDettaglio(dettaglio.dipendente.id)
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setAzione(false)
    }
  }

  const senzaReferente = useMemo(
    () => righe.filter((r) => !r.referenteEmail && !r.disattivato).map((r) => r.cognomeNome),
    [righe],
  )
  const daValidare = righe.filter((r) => r.stato === 'da_validare' || r.stato === 'contestato').length

  const statoDettaglio: StatoMese = dettaglio?.chiusura?.stato ?? 'aperto'
  const modificabile = statoDettaglio === 'aperto' || statoDettaglio === 'da_validare' || statoDettaglio === 'contestato'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary text-white px-5 py-4">
        <Link href={isHr ? '/risorse-umane' : '/home'} className="text-white/70 text-sm hover:text-white">
          ← {isHr ? 'Torna a Risorse Umane' : 'Torna alla Home'}
        </Link>
        <h1 className="text-lg font-bold">Fogli ore da validare</h1>
        <p className="text-white/70 text-xs mt-0.5">
          {isHr ? 'Vista Risorse Umane: tutti i dipendenti' : 'I tuoi collaboratori'}
        </p>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
          <button onClick={() => cambiaMese(-1)} className="text-2xl text-gray-400 hover:text-gray-700 px-2">‹</button>
          <div className="text-center">
            <div className="font-bold text-gray-800">{MESI[mese - 1]} {anno}</div>
            {daValidare > 0 && (
              <div className="text-xs font-semibold text-amber-700">{daValidare} da validare</div>
            )}
          </div>
          <button onClick={() => cambiaMese(1)} className="text-2xl text-gray-400 hover:text-gray-700 px-2">›</button>
        </div>

        {isHr && (
          <div className="flex items-center justify-between gap-3 bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
            <div className="text-xs text-gray-500">
              L&apos;elenco viene dall&apos;anagrafica Risorse Umane: compare chi ha{' '}
              <span className="font-semibold text-gray-700">Timbratura attiva</span> sulla propria scheda.
            </div>
            <button
              onClick={sincronizza}
              disabled={sincronizzando}
              className="shrink-0 bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-sm font-semibold hover:opacity-90 disabled:bg-gray-300"
            >
              {sincronizzando ? 'Sincronizzo…' : 'Sincronizza da anagrafica'}
            </button>
          </div>
        )}

        {isHr && senzaReferente.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ⚠ Senza referente foglio ore in anagrafica: <strong>{senzaReferente.join(', ')}</strong>. I loro
            fogli non finiscono nella coda di nessun responsabile e restano in carico alle Risorse Umane.
          </div>
        )}

        {esitoSync && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{esitoSync}</div>
        )}
        {avviso && (
          <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{avviso}</div>
        )}
        {errore && <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{errore}</div>}

        {loading ? (
          <div className="text-center text-gray-400 py-10">Caricamento…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Dipendente</th>
                  <th className="text-right px-3 py-2 font-semibold">Lavorate</th>
                  <th className="text-right px-3 py-2 font-semibold">Attese</th>
                  <th className="text-right px-3 py-2 font-semibold">Scost.</th>
                  <th className="text-left px-3 py-2 font-semibold">Settimane</th>
                  <th className="text-center px-3 py-2 font-semibold">Incompl.</th>
                  {/*
                    Ordinabile di proposito: il controllo periodico della
                    flessibilita' e' un gesto da fare a colpo d'occhio. Ordinando,
                    chi sta peggio finisce in cima; senza, si leggono cento righe
                    una per una e in pratica non si fa.
                  */}
                  <th className="text-right px-3 py-2 font-semibold">
                    <button
                      onClick={() => setOrdine(ordine === 'flessibilita' ? 'nome' : 'flessibilita')}
                      title="Ordina per saldo di flessibilità del mese"
                      className={`font-semibold hover:text-gray-800 ${ordine === 'flessibilita' ? 'text-gray-800 underline' : ''}`}
                    >
                      Flessib. {ordine === 'flessibilita' ? '↑' : ''}
                    </button>
                  </th>
                  <th className="text-center px-3 py-2 font-semibold">Stato</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {righeOrdinate.map((s) => {
                  const visto = visionati.has(s.dipendenteId)
                  /*
                   * Un mese ancora aperto si valida se non ha piu' giornate
                   * scoperte: e' la chiusura anticipata, il caso "sono in ferie
                   * dal 20 al 31, il foglio e' finito". Con dei buchi il tasto
                   * resta spento, e non c'e' scappatoia nemmeno per le HR: un
                   * foglio ore incompleto non si chiude.
                   */
                  const anticipabile = s.stato === 'aperto' && s.completo
                  const puoValidare = s.stato === 'da_validare' || s.stato === 'contestato' || anticipabile
                  return (
                    <tr key={s.dipendenteId} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-800">
                          {s.cognomeNome}
                          {s.disattivato && (
                            <span
                              title="Non più abilitato alle timbrature: compare per permettere la chiusura dell'ultimo mese"
                              className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 align-middle"
                            >
                              non più attivo
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">{s.email}</div>
                      </td>
                      <td className="text-right px-3">{oreFmt(s.oreLavorate)}</td>
                      <td className="text-right px-3 text-gray-500">{oreFmt(s.oreAttese)}</td>
                      <td className={`text-right px-3 font-semibold ${s.scostamento < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {segno(s.scostamento)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {s.settimane.map((w) => (
                            <span
                              key={w.inizio}
                              title={`Sett. ${fmtRange(w.inizio, w.fine)} · ${oreFmt(w.oreLavorate)}/${oreFmt(w.oreAttese)} h${w.conclusa ? '' : ' (in corso)'}`}
                              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${w.conclusa ? scostClasse(w.scostamento) : 'bg-gray-50 text-gray-400 italic'}`}
                            >
                              {w.conclusa ? segno(w.scostamento) : '·'}
                            </span>
                          ))}
                          {s.settimane.length === 0 && <span className="text-gray-300">—</span>}
                        </div>
                      </td>
                      <td className="text-center px-3">
                        {s.giorniIncompleti > 0 ? <span className="text-amber-600 font-semibold">{s.giorniIncompleti}</span> : '—'}
                      </td>
                      <td className="text-right px-3 whitespace-nowrap">
                        {s.flessibilitaLavorata || s.flessibilitaRecuperata ? (
                          <span
                            title={`Lavorata +${oreFmt(s.flessibilitaLavorata)} h · recuperata −${oreFmt(s.flessibilitaRecuperata)} h`}
                            className={`text-xs font-bold px-2 py-0.5 rounded-full ${scostClasse(s.flessibilitaSaldo)}`}
                          >
                            {segno(s.flessibilitaSaldo)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="text-center px-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STILE_STATO[s.stato]}`}>
                          {ETICHETTA_STATO[s.stato]}
                        </span>
                        {s.stato === 'validato' && s.giorniInAttesa != null && (
                          <div className="text-[10px] text-gray-400 mt-0.5">da {s.giorniInAttesa} gg</div>
                        )}
                        {s.confermatoForzato && (
                          <div className="text-[10px] text-gray-400 mt-0.5">senza riscontro</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => apriDettaglio(s.dipendenteId)} className="text-brand-cyan-dark font-semibold hover:underline mr-3">
                          Controlla
                        </button>
                        {s.filePdfUrl && (
                          <a href={s.filePdfUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:underline mr-3">PDF</a>
                        )}
                        {s.fileUrl && (
                          <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:underline mr-3">Excel</a>
                        )}
                        {puoValidare && (
                          <button
                            onClick={() => valida(s.dipendenteId, s.cognomeNome, anticipabile)}
                            disabled={azione || !visto}
                            title={
                              !visto
                                ? 'Apri “Controlla” prima di validare'
                                : anticipabile
                                  ? 'Il mese è completo: si può chiudere senza aspettare la scadenza'
                                  : ''
                            }
                            className="text-white bg-primary disabled:bg-gray-300 rounded-lg px-3 py-1.5 font-semibold"
                          >
                            {anticipabile ? 'Chiudi e valida' : 'Valida'}
                          </button>
                        )}
                        {s.stato === 'validato' && (
                          <button onClick={() => forza(s.dipendenteId, s.cognomeNome)} disabled={azione} className="text-amber-600 font-semibold hover:underline">
                            Chiudi senza risposta
                          </button>
                        )}
                        {isHr && (s.stato === 'confermato' || s.stato === 'validato') && (
                          <button onClick={() => riapri(s.dipendenteId)} disabled={azione} className="ml-3 text-gray-500 font-semibold hover:underline">
                            Riapri
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {righe.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400 py-8">
                      {isHr
                        ? 'Nessun dipendente abilitato. Spunta "Timbratura attiva" sulle schede in Risorse Umane, poi premi "Sincronizza da anagrafica".'
                        : 'Nessun collaboratore assegnato: in anagrafica nessuno ti indica come referente del foglio ore.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer dettaglio */}
      {dettaglio && (
        <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={() => setDettaglio(null)}>
          <div className="bg-white w-full sm:max-w-lg h-full overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-gray-800">{dettaglio.dipendente.cognomeNome}</h3>
              <button onClick={() => setDettaglio(null)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <p className="text-xs text-gray-400 mb-3">{MESI[mese - 1]} {anno} · {dettaglio.dipendente.email}</p>

            <div className="mb-4">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STILE_STATO[statoDettaglio]}`}>
                {ETICHETTA_STATO[statoDettaglio]}
              </span>
              {dettaglio.chiusura?.validatoDa && (
                <span className="text-xs text-gray-400 ml-2">validato da {dettaglio.chiusura.validatoDa}</span>
              )}
            </div>

            {dettaglio.chiusura?.stato === 'contestato' && (
              <div className="mb-4 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                <div className="font-semibold mb-1">Il dipendente ha segnalato un errore</div>
                <div className="whitespace-pre-wrap">{dettaglio.chiusura.noteContestazione}</div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mb-5">
              <Mini label="Lavorate" value={oreFmt(dettaglio.riepilogo.oreLavorate)} />
              <Mini label="Attese" value={oreFmt(dettaglio.riepilogo.oreAttese)} />
              <Mini label="Scost." value={segno(dettaglio.riepilogo.scostamento)} rosso={dettaglio.riepilogo.scostamento < 0} />
            </div>

            <div className="border border-gray-200 rounded-xl p-3 mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-gray-700 text-sm">Ferie, permessi e altre voci</span>
                <span className="text-sm font-semibold text-accent-purple">
                  {oreFmt(dettaglio.riepilogo.oreGiustificativo)} h
                </span>
              </div>
              {dettaglio.riepilogo.giustificativi.length === 0 ? (
                <div className="text-xs text-gray-400 italic">Nessuna voce usata in questo mese.</div>
              ) : (
                <div className="space-y-1">
                  {dettaglio.riepilogo.giustificativi.map((v) => (
                    <div key={v.servizioId} className="flex items-center justify-between text-sm">
                      <span className="text-accent-purple font-medium">{v.nome}</span>
                      <span className="text-gray-500 font-semibold">{oreFmt(v.ore)} h</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {dettaglio.riepilogo.settimane.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-3 mb-5">
                <div className="font-semibold text-gray-700 text-sm mb-2">Scostamento per settimana</div>
                <div className="space-y-1.5">
                  {dettaglio.riepilogo.settimane.map((w) => (
                    <div key={w.inizio} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Sett. {fmtRange(w.inizio, w.fine)}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-gray-400">{oreFmt(w.oreLavorate)}/{oreFmt(w.oreAttese)} h</span>
                        {w.conclusa ? (
                          <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${scostClasse(w.scostamento)}`}>
                            {segno(w.scostamento)} h
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

            {isHr && (
              <VariazioniOrario
                dipendenteId={dettaglio.dipendente.id}
                profili={dettaglio.profili}
                onAggiornato={async () => {
                  await apriDettaglio(dettaglio.dipendente.id)
                  await carica()
                }}
              />
            )}

            {/* Righe del mese */}
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-gray-700 text-sm">Righe del mese ({dettaglio.timbrature.length})</span>
              {modificabile && (
                <button onClick={nuovaRiga} className="text-sm font-semibold text-brand-cyan-dark hover:underline">
                  + aggiungi riga
                </button>
              )}
            </div>
            <div className="space-y-1 mb-5">
              {dettaglio.timbrature.map((t) => (
                <div key={t.id} className="flex justify-between items-start gap-2 text-sm border-b border-gray-50 py-1">
                  <span className="min-w-0">
                    {gg(t.data)} · {t.servizioNome}{t.mutua ? ' (Mutua)' : ''}
                    {t.tipoVoce === 'lavoro' && festivoByData.has(t.data) && (
                      <span
                        title={festivoByData.get(t.data)}
                        className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
                      >
                        lavoro in festività
                      </span>
                    )}
                    {t.perConto && (
                      <span
                        title={`Inserita da ${t.modificataDa ?? t.creataDa ?? 'un responsabile'}`}
                        className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700"
                      >
                        per conto
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-gray-400">
                      {t.oraInizio && t.oraFine ? `${t.oraInizio}–${t.oraFine} · ` : ''}{oreFmt(t.ore)} h
                    </span>
                    {modificabile && (
                      <>
                        <button onClick={() => modificaRiga(t)} className="text-xs text-gray-500 hover:text-gray-800">Modifica</button>
                        <button onClick={() => eliminaRiga(t.id)} className="text-xs text-red-500 hover:text-red-700">Elimina</button>
                      </>
                    )}
                  </span>
                </div>
              ))}
              {dettaglio.timbrature.length === 0 && <div className="text-sm text-gray-400">Nessuna riga inserita.</div>}
            </div>

            {/* Form riga */}
            {rigaForm && (
              <div className="border border-brand-cyan/40 bg-brand-cyan-light/20 rounded-xl p-3 mb-5 space-y-3">
                <div className="font-semibold text-gray-700 text-sm">
                  {rigaForm.id ? 'Modifica riga' : 'Nuova riga'} — per conto del dipendente
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 text-xs text-gray-600">
                    Data
                    <input
                      type="date"
                      value={rigaForm.data}
                      min={`${anno}-${String(mese).padStart(2, '0')}-01`}
                      onChange={(e) => setRigaForm({ ...rigaForm, data: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5"
                    />
                  </label>
                  <label className="flex-[2] text-xs text-gray-600">
                    Servizio
                    <select
                      value={rigaForm.servizioId}
                      onChange={(e) => setRigaForm({ ...rigaForm, servizioId: e.target.value ? Number(e.target.value) : '', adOre: false })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5"
                    >
                      <option value="">— scegli —</option>
                      <optgroup label="Servizi">
                        {dettaglio.servizi.filter((s) => s.tipoVoce === 'lavoro').map((s) => (
                          <option key={s.id} value={s.id}>{s.nome}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Giustificativi">
                        {dettaglio.servizi.filter((s) => s.tipoVoce === 'giustificativo').map((s) => (
                          <option key={s.id} value={s.id}>{s.nome}</option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                </div>
                {rigaPuoAdOre && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRigaForm({ ...rigaForm, adOre: false })}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold ${!rigaForm.adOre ? 'bg-brand-cyan text-white border-brand-cyan' : 'bg-white text-gray-600 border-gray-300'}`}
                    >
                      Giornata intera
                    </button>
                    <button
                      type="button"
                      onClick={() => setRigaForm({ ...rigaForm, adOre: true })}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold ${rigaForm.adOre ? 'bg-brand-cyan text-white border-brand-cyan' : 'bg-white text-gray-600 border-gray-300'}`}
                    >
                      Alcune ore
                    </button>
                  </div>
                )}
                {rigaContaOrario && (
                  <div className="flex gap-2">
                    <label className="flex-1 text-xs text-gray-600">
                      {rigaGiustificativo ? 'Dalle' : 'Ingresso'}
                      <input type="time" value={rigaForm.oraInizio} onChange={(e) => setRigaForm({ ...rigaForm, oraInizio: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5" />
                    </label>
                    <label className="flex-1 text-xs text-gray-600">
                      {rigaGiustificativo ? 'Alle' : 'Uscita'}
                      <input type="time" value={rigaForm.oraFine} onChange={(e) => setRigaForm({ ...rigaForm, oraFine: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5" />
                    </label>
                  </div>
                )}
                {rigaContaOrario && !rigaGiustificativo && (
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input type="checkbox" checked={rigaForm.notte} onChange={(e) => setRigaForm({ ...rigaForm, notte: e.target.checked })} />
                      Notte
                    </label>
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input type="checkbox" checked={rigaForm.reperibilita} onChange={(e) => setRigaForm({ ...rigaForm, reperibilita: e.target.checked })} />
                      Reperibilità
                    </label>
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input type="checkbox" checked={rigaForm.mutua} onChange={(e) => setRigaForm({ ...rigaForm, mutua: e.target.checked })} />
                      Mutua
                    </label>
                  </div>
                )}
                <label className="block text-xs text-gray-600">
                  Note
                  <input value={rigaForm.note} onChange={(e) => setRigaForm({ ...rigaForm, note: e.target.value })}
                    placeholder="es. comunicate a voce il 3/8"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5" />
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setRigaForm(null)} className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold">Annulla</button>
                  <button onClick={salvaRiga} disabled={azione} className="flex-1 py-2 rounded-lg bg-brand-cyan text-white text-sm font-bold disabled:opacity-50">Salva</button>
                </div>
                <p className="text-[11px] text-gray-500">
                  La riga resterà segnata come inserita da te: il dipendente la vede evidenziata nel PDF
                  che riceve.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {(statoDettaglio === 'da_validare' || statoDettaglio === 'contestato') && (
                <button
                  onClick={() => valida(dettaglio.dipendente.id, dettaglio.dipendente.cognomeNome)}
                  disabled={azione}
                  className="w-full py-3 rounded-lg bg-primary text-white font-bold disabled:opacity-50"
                >
                  ✓ Valida il foglio ore e invia al dipendente
                </button>
              )}
              {statoDettaglio === 'aperto' && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-500">
                  Il mese è ancora aperto alla compilazione: si valida quando la finestra dei tre giorni è
                  scaduta.
                </div>
              )}
              {statoDettaglio === 'validato' && (
                <button
                  onClick={() => forza(dettaglio.dipendente.id, dettaglio.dipendente.cognomeNome)}
                  disabled={azione}
                  className="w-full py-2.5 rounded-lg border border-amber-400 text-amber-700 font-semibold"
                >
                  Chiudi senza la risposta del dipendente
                </button>
              )}
              {isHr && statoDettaglio !== 'aperto' && (
                <button onClick={() => riapri(dettaglio.dipendente.id)} disabled={azione} className="w-full py-2.5 rounded-lg border border-gray-300 text-gray-600 font-semibold">
                  Riapri il mese al dipendente
                </button>
              )}
            </div>

            {dettaglio.chiusura?.filePdfUrl && (
              <a href={dettaglio.chiusura.filePdfUrl} target="_blank" rel="noopener noreferrer" className="block text-center mt-3 text-sm text-brand-cyan-dark font-semibold">
                📄 Apri il PDF del foglio ore
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Mini({ label, value, rosso }: { label: string; value: string; rosso?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg py-2 text-center">
      <div className={`font-bold ${rosso ? 'text-red-600' : 'text-gray-800'}`}>{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  )
}
