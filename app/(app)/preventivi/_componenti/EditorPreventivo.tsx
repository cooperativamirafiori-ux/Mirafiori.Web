'use client'

/**
 * Il modulo del preventivo: crea, modifica, emette, segna l'esito, rinnova.
 *
 * Una bozza si salva anche incompleta. "Emetti" la salva, assegna il
 * protocollo PR-NNN/AAAA e apre il PDF da mandare all'ente. Da lì si aspetta
 * l'esito: "È stato accettato" archivia il definitivo e lo manda ad Andrea.
 * Se l'ente chiede modifiche, "Riapri per correggere" rimette in bozza con lo
 * stesso numero e alla nuova emissione sale la revisione.
 *
 * I conti sono quelli di lib/preventivi/calcoli.ts, gli stessi del server:
 * il totale che si vede mentre si scrive è quello che esce sul documento.
 *
 * Dal 20/11/2026 (matrice di Andrea) si sceglie il SERVIZIO e l'ENTE: le voci
 * e i prezzi vengono da lì. Per Torino l'ente è una delle due coppie Comune +
 * ASL. L'inizio può restare "da definire": conta la durata in mesi.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banner } from '@/components/ui/Banner'
import { Campo, inputCls, labelCls } from '@/components/ui/Campo'
import { Pill } from '@/components/ui/Pill'
import {
  CARTELLE,
  DURATA_DEFAULT,
  RIPARTIZIONI,
  STATI_PREVENTIVO,
  TIPI_PROGETTO,
  cartellaPerServizio,
  ePrivato,
  type Ente,
  type Persona,
  type Preventivo,
  type RigaPreventivo,
  type Tariffa,
} from '@/types/preventivi'
import {
  aggiungiGiorni,
  allineaPrezzi,
  dataIt,
  eCoppia,
  entiDestinatari,
  euro,
  oggiIso,
  serviziDisponibili,
  sottotipiDisponibili,
  totali,
  vociPerPreventivo,
} from '@/lib/preventivi/calcoli'
import { ETICHETTE_AZIONI, azioniDa, mancantiPerEmettere, type Azione } from '@/lib/preventivi/flusso'
import { Voci } from './Voci'
import { Totali } from './Totali'
import { Persone, SceltaEnte } from './Destinatari'
import { allineaIndiretto, riadatta } from './riadatta'
import { ModaleEsito } from './ModaleEsito'
import { Periodo } from './Periodo'
import { SezionePrivati } from './SezionePrivati'

interface Centro {
  codice: string
  nome: string
  area: string
}
interface Opzioni {
  tariffe: Tariffa[]
  enti: Ente[]
  centri: Centro[]
  contatti: Persona[]
  accesso: { tutti: boolean; centri: string[] }
  io: { email: string; nome: string }
}

function primoDelProssimoMese(): string {
  const o = oggiIso()
  const [y, m] = o.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

async function chiama<T = any>(url: string, metodo: string, corpo?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error ?? 'Operazione non riuscita')
  return j as T
}

const numeroDa = (v: string) => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function EditorPreventivo({ id, prezziAggiornati }: { id: string | null; prezziAggiornati: number }) {
  const router = useRouter()
  const [opzioni, setOpzioni] = useState<Opzioni | null>(null)
  const [p, setP] = useState<Preventivo | null>(null)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState(
    prezziAggiornati ? `Copia creata: ${prezziAggiornati === 1 ? '1 prezzo è stato portato' : `${prezziAggiornati} prezzi sono stati portati`} al tariffario in vigore.` : '',
  )
  const [avviso, setAvviso] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState<'accetta' | 'rifiuta' | null>(null)
  const [sporco, setSporco] = useState(false)

  // campi del modulo
  const [ccCodice, setCcCodice] = useState('')
  const [cartella, setCartella] = useState<string>('Altro')
  const [servizio, setServizio] = useState('')
  const [sottotipo, setSottotipo] = useState('')
  const [ente, setEnte] = useState('')
  const [persone, setPersone] = useState<Persona[]>([])
  const [beneficiario, setBeneficiario] = useState('')
  const [oggetto, setOggetto] = useState('')
  const [tipoProgetto, setTipoProgetto] = useState('')
  const [ripartizione, setRipartizione] = useState('')
  const [dal, setDal] = useState(primoDelProssimoMese())
  const [durata, setDurata] = useState(String(DURATA_DEFAULT))
  const [righe, setRighe] = useState<RigaPreventivo[]>([])
  const [note, setNote] = useState('')
  const [maggiorazione, setMaggiorazione] = useState(false)
  const [referente2, setReferente2] = useState<Persona>({ nome: '', ruolo: '', ente: '', email: '' })

  const riempi = useCallback((x: Preventivo) => {
    setP(x)
    setCcCodice(x.ccCodice)
    setCartella(x.cartella)
    setServizio(x.servizio)
    setSottotipo(x.sottotipo)
    setEnte(x.ente)
    setPersone(x.persone)
    setBeneficiario(x.beneficiario)
    setOggetto(x.oggetto)
    setTipoProgetto(x.tipoProgetto)
    setRipartizione(x.ripartizione)
    setDal(x.dal)
    setDurata(String(x.durataMesi).replace('.', ','))
    setRighe(x.righe)
    setNote(x.note)
    setMaggiorazione(x.maggiorazione)
    setReferente2(x.referente2 ?? { nome: '', ruolo: '', ente: '', email: '' })
    setSporco(false)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const o = await chiama<Opzioni>('/api/preventivi/opzioni', 'GET')
        setOpzioni(o)
        if (id) riempi((await chiama<{ preventivo: Preventivo }>(`/api/preventivi/${id}`, 'GET')).preventivo)
        else if (o.centri.length === 1) setCcCodice(o.centri[0].codice)
      } catch (e) {
        setErrore(e instanceof Error ? e.message : 'Errore di lettura')
      }
    })()
  }, [id, riempi])

  // Ogni modifica segna il modulo come da salvare.
  const conSporco = <T,>(f: (v: T) => void) => (v: T) => {
    f(v)
    setSporco(true)
  }

  const stato = p?.stato ?? 'bozza'
  const aperto = stato === 'bozza'
  const libero = opzioni?.accesso.tutti ?? false
  const dataPrezzi = dal || oggiIso()
  const tariffe = opzioni?.tariffe ?? []
  const elencoEnti = opzioni?.enti ?? []
  const privato = ePrivato(servizio)
  const durataMesi = numeroDa(durata)
  const nomiEnti = useMemo(() => entiDestinatari(ente, servizio, elencoEnti), [ente, servizio, elencoEnti])
  const coppia = eCoppia(ente)
  const servizi = useMemo(() => serviziDisponibili(tariffe, dataPrezzi), [tariffe, dataPrezzi])
  const sottotipi = useMemo(
    () => (servizio ? sottotipiDisponibili(tariffe, dataPrezzi, servizio, nomiEnti, coppia) : []),
    [tariffe, dataPrezzi, servizio, nomiEnti, coppia],
  )
  const disponibili = useMemo(
    () => (servizio ? vociPerPreventivo(tariffe, dataPrezzi, servizio, sottotipo, nomiEnti, coppia) : []),
    [tariffe, dataPrezzi, servizio, sottotipo, nomiEnti, coppia],
  )
  const t = useMemo(() => totali(righe, durataMesi, privato && maggiorazione), [righe, durataMesi, privato, maggiorazione])
  const allineate = useMemo(() => allineaPrezzi(righe, tariffe, dataPrezzi), [righe, tariffe, dataPrezzi])

  /** Cambia servizio, ente o sottotipo e riporta le voci alle tariffe giuste. */
  function scegli(nuovo: { servizio?: string; ente?: string; sottotipo?: string }) {
    const s = nuovo.servizio ?? servizio
    const e = ePrivato(s) ? '' : (nuovo.ente ?? ente)
    const nomi = entiDestinatari(e, s, elencoEnti)
    const sottotipiOk = sottotipiDisponibili(tariffe, dataPrezzi, s, nomi, eCoppia(e))
    const st = sottotipiOk.includes(nuovo.sottotipo ?? sottotipo) ? (nuovo.sottotipo ?? sottotipo) : sottotipiOk.length === 1 ? sottotipiOk[0] : ''
    const voci = vociPerPreventivo(tariffe, dataPrezzi, s, st, nomi, eCoppia(e))
    const r = riadatta(nuovo.servizio !== undefined && nuovo.servizio !== servizio ? [] : righe, voci)
    if (nuovo.servizio !== undefined && nuovo.servizio !== servizio) setCartella(cartellaPerServizio(s, st))
    setServizio(s)
    setEnte(e)
    setSottotipo(st)
    setRighe(r.righe)
    setAvviso(r.tolte.length ? `Tolte perché non valgono per questa scelta: ${r.tolte.join(', ')}.` : '')
    setSporco(true)
  }

  const dati = () => ({
    ccCodice,
    cartella,
    servizio,
    sottotipo,
    ente,
    persone: persone.filter((x) => x.nome.trim() || x.email.trim()),
    beneficiario,
    oggetto,
    tipoProgetto,
    ripartizione: privato ? '' : ripartizione,
    dal,
    durataMesi,
    righe,
    note,
    maggiorazione: privato && maggiorazione,
    referente2: privato && (referente2.nome.trim() || referente2.email.trim()) ? referente2 : null,
  })

  /** Salva e ritorna l'id (nuovo o di sempre). */
  async function salva(): Promise<string> {
    if (!aperto) return p!.spItemId
    if (id && p && !sporco) return p.spItemId
    const j = id
      ? await chiama<{ preventivo: Preventivo }>(`/api/preventivi/${id}`, 'PATCH', dati())
      : await chiama<{ preventivo: Preventivo }>('/api/preventivi', 'POST', dati())
    riempi(j.preventivo)
    return j.preventivo.spItemId
  }

  async function esegui(fn: () => Promise<void>) {
    setInCorso(true)
    setErrore('')
    setMessaggio('')
    try {
      await fn()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
    } finally {
      setInCorso(false)
    }
  }

  const soloSalva = () =>
    esegui(async () => {
      const nuovoId = await salva()
      setMessaggio('Bozza salvata.')
      if (!id) router.replace(`/preventivi/${nuovoId}`)
    })

  /** PDF in una scheda nuova. La scheda si apre SUBITO, prima delle attese: altrimenti il telefono la blocca. */
  function apriPdf(prima?: () => Promise<string>) {
    const w = window.open('', '_blank')
    esegui(async () => {
      try {
        const pid = prima ? await prima() : p!.spItemId
        if (w) w.location.href = `/api/preventivi/${pid}/pdf`
        else window.location.href = `/api/preventivi/${pid}/pdf`
      } catch (e) {
        w?.close()
        throw e
      }
    })
  }

  async function azione(a: Azione, extra?: { data?: string; nota?: string }) {
    if (a === 'emetti') {
      const mancano = mancantiPerEmettere(dati())
      if (mancano.length) {
        setErrore(`Per emettere manca: ${mancano.join(', ')}`)
        return
      }
      apriPdf(async () => {
        const pid = await salva()
        const j = await chiama<{ preventivo: Preventivo }>(`/api/preventivi/${pid}/azione`, 'POST', { azione: 'emetti' })
        riempi(j.preventivo)
        setMessaggio(
          `Emesso con protocollo ${j.preventivo.numero}. Il PDF si apre in un'altra scheda: mandalo all'ente. Quando sai com'è andata, torna qui e segna l'esito.`,
        )
        if (!id) router.replace(`/preventivi/${pid}`)
        return pid
      })
      return
    }
    if (a === 'annulla' && !confirm('Annullare la bozza? Il preventivo resta nell’elenco degli annullati.')) return
    await esegui(async () => {
      const j = await chiama<{ preventivo: Preventivo; cambiate?: unknown[] }>(`/api/preventivi/${p!.spItemId}/azione`, 'POST', {
        azione: a,
        ...extra,
      })
      if (a === 'rinnova' || a === 'duplica') {
        router.push(`/preventivi/${j.preventivo.spItemId}?prezzi=${j.cambiate?.length ?? 0}`)
        return
      }
      riempi(j.preventivo)
      setEsito(null)
      setMessaggio(
        a === 'accetta'
          ? 'Segnato come accettato: Andrea ha ricevuto il PDF definitivo, archiviato in «Preventivi accettati».'
          : a === 'rifiuta'
            ? 'Segnato come rifiutato.'
            : a === 'riapri'
              ? 'Riaperto: correggi e riemetti. Il protocollo resta lo stesso, sale la revisione.'
              : 'Fatto.',
      )
    })
  }

  async function eliminaBozza() {
    if (!p || !confirm('Eliminare questa bozza? Non ha ancora un numero di protocollo.')) return
    await esegui(async () => {
      await chiama(`/api/preventivi/${p.spItemId}`, 'DELETE')
      router.push('/preventivi/servizi')
    })
  }

  if (!opzioni) return errore ? <Banner tono="errore">{errore}</Banner> : <p className="text-sm text-gray-500">Carico…</p>

  const sceltaCentri = opzioni.centri.map((c) => ({ valore: c.codice, etichetta: `${c.nome} · ${c.codice}` }))
  const azioni = id ? azioniDa(stato) : []
  const primoReferente = p ? p.creatoDaNome || p.creatoDa : opzioni.io.nome || opzioni.io.email

  return (
    <div className="space-y-5">
      {p && (
        <div className="flex flex-wrap items-center gap-2">
          <Pill text={STATI_PREVENTIVO[stato].etichetta} tono={STATI_PREVENTIVO[stato].tono} />
          <span className="font-mono font-semibold text-gray-800">{p.numero || 'senza protocollo'}</span>
          {p.revisione > 1 && <span className="text-sm text-gray-500">rev. {p.revisione}</span>}
          {p.emessoIl && <span className="text-sm text-gray-500">· inviato il {dataIt(p.emessoIl)}</span>}
          {p.esitoIl && (
            <span className="text-sm text-gray-500">
              · {STATI_PREVENTIVO[stato].etichetta.toLowerCase()} il {dataIt(p.esitoIl)}
              {p.esitoDa ? ` (${p.esitoDa})` : ''}
            </span>
          )}
        </div>
      )}
      {p?.notaEsito && <Banner tono="info">Nota sull’esito: {p.notaEsito}</Banner>}
      {p?.pdfUrl && (
        <a href={p.pdfUrl} target="_blank" rel="noreferrer" className="inline-block text-sm text-brand-cyan-dark underline">
          Apri il PDF archiviato in «Preventivi accettati»
        </a>
      )}

      <Banner tono="ok">{messaggio}</Banner>
      <Banner tono="errore">{errore}</Banner>
      <Banner tono="avviso">{avviso}</Banner>
      {aperto && allineate.cambiate.length > 0 && (
        <Banner tono="avviso">
          Il tariffario per questo periodo è cambiato per{' '}
          {allineate.cambiate.map((c) => `«${c.voce}» (${euro(c.prima)} → ${euro(c.dopo)})`).join(', ')}.{' '}
          <button
            className="underline font-semibold"
            onClick={() => {
              setRighe(allineate.righe)
              setSporco(true)
            }}
          >
            Aggiorna i prezzi
          </button>
        </Banner>
      )}
      {!aperto && stato === 'emesso' && (
        <Banner tono="info">Per cambiare qualcosa usa «Riapri per correggere»: il protocollo resta lo stesso.</Banner>
      )}

      {/* 1. Che preventivo è */}
      <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Che preventivo è</h3>
        <Campo
          etichetta="Centro di costo"
          tipo="choice"
          valore={ccCodice}
          onChange={conSporco(setCcCodice)}
          scelte={sceltaCentri}
          obbligatorio
          disabilitato={!aperto}
          aiuto={opzioni.accesso.tutti ? undefined : 'Vedi solo i centri di costo che coordini.'}
        />
        <Campo
          etichetta="Servizio"
          tipo="choice"
          valore={servizio}
          onChange={(v: string) => scegli({ servizio: v })}
          scelte={servizi}
          obbligatorio
          disabilitato={!aperto}
          aiuto="Decide quali voci e quali prezzi si usano (tariffario di Andrea)."
        />
        {servizio && !privato && (
          <SceltaEnte
            ente={ente}
            enti={elencoEnti}
            onChange={(v) => scegli({ ente: v })}
            onNuovoEnte={(e) => setOpzioni((o) => (o ? { ...o, enti: [...o.enti, e] } : o))}
            disabilitato={!aperto}
          />
        )}
        {sottotipi.length > 0 && (
          <Campo
            etichetta="Tipo (sottotipo)"
            tipo="choice"
            valore={sottotipo}
            onChange={(v: string) => scegli({ sottotipo: v })}
            scelte={sottotipi}
            obbligatorio
            disabilitato={!aperto}
          />
        )}
        <Campo
          etichetta="Cartella in cui archiviarlo"
          tipo="choice"
          valore={cartella}
          onChange={conSporco(setCartella)}
          scelte={CARTELLE}
          senzaVuoto
          disabilitato={!aperto}
        />
      </section>

      {/* 2. A chi va */}
      <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <h3 className="font-bold text-gray-800">A chi lo mandi</h3>
        {!privato && nomiEnti.length > 0 && (
          <div>
            <span className={labelCls}>{nomiEnti.length > 1 ? 'Va a entrambi' : 'Ente'}</span>
            <ul className="text-sm font-semibold text-gray-800 space-y-0.5">
              {nomiEnti.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <Persone
          persone={persone}
          onChange={conSporco(setPersone)}
          contatti={opzioni.contatti}
          disabilitato={!aperto}
          privato={privato}
          entePredefinito={nomiEnti.length === 1 ? nomiEnti[0] : ''}
        />
      </section>

      {/* 3. Per chi e per cosa */}
      <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Per chi e per cosa</h3>
        <Campo
          etichetta="Costo dell’intervento a favore di"
          valore={beneficiario}
          onChange={conSporco(setBeneficiario)}
          obbligatorio
          disabilitato={!aperto}
          aiuto="Compare nel documento. Nei nomi dei file vanno solo le iniziali."
        />
        <Campo
          etichetta="Oggetto"
          valore={oggetto}
          onChange={conSporco(setOggetto)}
          disabilitato={!aperto}
          segnaposto="Preventivo per inserimento in comunità, prestazioni aggiuntive, rinnovo…"
        />
        <label className="block">
          <span className={labelCls}>Tipo di progetto / intervento</span>
          <input
            className={`${inputCls} ${!aperto ? 'bg-gray-50 text-gray-500' : ''}`}
            list="preventivi-tipi"
            value={tipoProgetto}
            disabled={!aperto}
            onChange={(e) => conSporco(setTipoProgetto)(e.target.value)}
          />
          <datalist id="preventivi-tipi">
            {TIPI_PROGETTO.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
        {!privato && (
          <Campo
            etichetta="Ripartizione Comune / ASL"
            tipo="choice"
            valore={ripartizione}
            onChange={conSporco(setRipartizione)}
            scelte={RIPARTIZIONI}
            disabilitato={!aperto}
            aiuto="La dice l’ente: se non la conosci chiedila prima di emettere, è il motivo più frequente per cui un preventivo torna indietro."
          />
        )}
        <Periodo
          dal={dal}
          onDal={conSporco(setDal)}
          durata={durata}
          onDurata={conSporco(setDurata)}
          disabilitato={!aperto}
          inizioProposto={primoDelProssimoMese}
        />
      </section>

      {/* 4. Solo privati */}
      {privato && (
        <SezionePrivati
          righe={righe}
          onRighe={conSporco(setRighe)}
          maggiorazione={maggiorazione}
          onMaggiorazione={conSporco(setMaggiorazione)}
          referente2={referente2}
          onReferente2={conSporco(setReferente2)}
          primoReferente={primoReferente}
          disabilitato={!aperto}
        />
      )}

      {/* 5. Voci */}
      <Voci
        righe={righe}
        onChange={conSporco((r: RigaPreventivo[]) => setRighe(allineaIndiretto(r)))}
        disponibili={disponibili}
        tariffe={tariffe}
        dataPrezzi={dataPrezzi}
        libero={libero}
        disabilitato={!aperto}
        senzaServizio={!servizio}
        senzaEnte={!privato && !ente}
      />

      <Totali t={t} inizioDaDefinire={!dal} />

      <section className="bg-white rounded-2xl border border-gray-100 p-4">
        <Campo
          etichetta="Note in fondo al documento"
          tipo="textarea"
          valore={note}
          onChange={conSporco(setNote)}
          disabilitato={!aperto}
          righe={3}
        />
      </section>

      {/* Azioni: in fondo e sempre raggiungibili dal telefono */}
      <div className="flex flex-wrap gap-2 pb-8">
        {aperto && (
          <button onClick={soloSalva} disabled={inCorso} className="grow px-4 py-3 rounded-xl border border-gray-300 bg-white font-semibold text-gray-800 disabled:opacity-50">
            {inCorso ? 'Un momento…' : 'Salva la bozza'}
          </button>
        )}
        {(aperto ? ['emetti' as Azione] : azioni).map((a) =>
          a === 'emetti' || a === 'accetta' ? (
            <button
              key={a}
              onClick={() => (a === 'accetta' ? setEsito('accetta') : azione(a))}
              disabled={inCorso}
              className={`grow px-4 py-3 rounded-xl font-semibold text-white disabled:opacity-50 ${a === 'accetta' ? 'bg-emerald-600' : 'bg-primary'}`}
            >
              {ETICHETTE_AZIONI[a]}
            </button>
          ) : null,
        )}
        {id && (
          <button
            onClick={() => (aperto ? apriPdf(salva) : apriPdf())}
            disabled={inCorso}
            className="grow px-4 py-3 rounded-xl border border-brand-cyan-dark bg-white font-semibold text-brand-cyan-dark disabled:opacity-50"
          >
            {aperto ? 'Anteprima PDF' : 'Scarica il PDF'}
          </button>
        )}
        {azioni
          .filter((a) => a !== 'emetti' && a !== 'accetta')
          .map((a) => (
            <button
              key={a}
              onClick={() => (a === 'rifiuta' ? setEsito('rifiuta') : azione(a))}
              disabled={inCorso}
              className={`grow px-4 py-3 rounded-xl border font-semibold bg-white disabled:opacity-50 ${
                a === 'rifiuta' || a === 'annulla' ? 'border-red-200 text-red-700' : 'border-gray-300 text-gray-700'
              }`}
            >
              {ETICHETTE_AZIONI[a]}
            </button>
          ))}
        {p && aperto && !p.numero && (
          <button onClick={eliminaBozza} disabled={inCorso} className="grow px-4 py-3 rounded-xl border border-red-200 bg-white font-semibold text-red-700 disabled:opacity-50">
            Elimina la bozza
          </button>
        )}
      </div>

      {esito && p && (
        <ModaleEsito
          tipo={esito}
          onChiudi={() => setEsito(null)}
          inCorso={inCorso}
          onConferma={(data, nota) => azione(esito, { data, nota })}
          minimo={p.emessoIl ?? aggiungiGiorni(oggiIso(), -365)}
        />
      )}
    </div>
  )
}
