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
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banner } from '@/components/ui/Banner'
import { Campo, inputCls, labelCls } from '@/components/ui/Campo'
import { Modale } from '@/components/ui/Modale'
import { Pill } from '@/components/ui/Pill'
import {
  AMBITI,
  CARTELLA_DEFAULT,
  CARTELLE,
  ENTI_SUGGERITI,
  GIORNI_RETTA_DEFAULT,
  MODELLI,
  RIPARTIZIONI,
  RUOLI_CONTATTO,
  STATI_PREVENTIVO,
  TIPI_PROGETTO,
  type Ambito,
  type Modello,
  type Preventivo,
  type RigaPreventivo,
  type Tariffa,
} from '@/types/preventivi'
import {
  aggiungiGiorni,
  allineaPrezzi,
  dataIt,
  euro,
  finePeriodo,
  oggiIso,
  rigaDaTariffa,
  totali,
  vociDisponibili,
} from '@/lib/preventivi/calcoli'
import { ETICHETTE_AZIONI, azioniDa, mancantiPerEmettere, type Azione } from '@/lib/preventivi/flusso'
import { Voci } from './Voci'
import { Totali } from './Totali'

interface Centro {
  codice: string
  nome: string
  area: string
}
interface Contatto {
  nome: string
  ruolo: string
  ente: string
  email: string
}
interface Opzioni {
  tariffe: Tariffa[]
  centri: Centro[]
  contatti: Contatto[]
  accesso: { tutti: boolean; centri: string[] }
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

export function EditorPreventivo({ id, prezziAggiornati }: { id: string | null; prezziAggiornati: number }) {
  const router = useRouter()
  const [opzioni, setOpzioni] = useState<Opzioni | null>(null)
  const [p, setP] = useState<Preventivo | null>(null)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState(
    prezziAggiornati ? `Copia creata: ${prezziAggiornati === 1 ? '1 prezzo è stato portato' : `${prezziAggiornati} prezzi sono stati portati`} al tariffario in vigore.` : '',
  )
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState<'accetta' | 'rifiuta' | null>(null)
  const [sporco, setSporco] = useState(false)

  // campi del modulo
  const [modello, setModello] = useState<Modello>('individuale')
  const [ccCodice, setCcCodice] = useState('')
  const [cartella, setCartella] = useState<string>(CARTELLA_DEFAULT.individuale)
  const [ambito, setAmbito] = useState<Ambito>('Tutti')
  const [ente, setEnte] = useState('')
  const [nome, setNome] = useState('')
  const [ruolo, setRuolo] = useState('')
  const [email, setEmail] = useState('')
  const [beneficiario, setBeneficiario] = useState('')
  const [oggetto, setOggetto] = useState('')
  const [tipoProgetto, setTipoProgetto] = useState('')
  const [ripartizione, setRipartizione] = useState('')
  const [dal, setDal] = useState(primoDelProssimoMese())
  const [al, setAl] = useState(finePeriodo(primoDelProssimoMese(), 6))
  const [righe, setRighe] = useState<RigaPreventivo[]>([])
  const [note, setNote] = useState('')

  const riempi = useCallback((x: Preventivo) => {
    setP(x)
    setModello(x.modello)
    setCcCodice(x.ccCodice)
    setCartella(x.cartella)
    setAmbito(x.ambito)
    setEnte(x.destinatario.ente)
    setNome(x.destinatario.nome)
    setRuolo(x.destinatario.ruolo)
    setEmail(x.destinatario.email)
    setBeneficiario(x.beneficiario)
    setOggetto(x.oggetto)
    setTipoProgetto(x.tipoProgetto)
    setRipartizione(x.ripartizione)
    setDal(x.dal)
    setAl(x.al)
    setRighe(x.righe)
    setNote(x.note)
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
  const disponibili = useMemo(() => vociDisponibili(tariffe, dataPrezzi, modello, ambito), [tariffe, dataPrezzi, modello, ambito])
  const t = useMemo(() => totali(righe, dal, al), [righe, dal, al])
  const allineate = useMemo(() => allineaPrezzi(righe, tariffe, dataPrezzi, ambito), [righe, tariffe, dataPrezzi, ambito])

  const dati = () => ({
    modello,
    ccCodice,
    cartella,
    ambito,
    destinatario: { ente, nome, ruolo, email },
    beneficiario,
    oggetto,
    tipoProgetto,
    ripartizione,
    dal,
    al,
    righe,
    note,
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

  const enti = [...new Set([...ENTI_SUGGERITI, ...opzioni.contatti.map((c) => c.ente).filter(Boolean)])]
  const sceltaCentri = opzioni.centri.map((c) => ({ valore: c.codice, etichetta: `${c.nome} · ${c.codice}` }))
  const pa = ambito !== 'Privati' && modello !== 'libero'
  const azioni = id ? azioniDa(stato) : []

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
          etichetta="Servizio (centro di costo)"
          tipo="choice"
          valore={ccCodice}
          onChange={conSporco(setCcCodice)}
          scelte={sceltaCentri}
          obbligatorio
          disabilitato={!aperto}
          aiuto={opzioni.accesso.tutti ? undefined : 'Vedi solo i servizi che coordini.'}
        />
        <Campo
          etichetta="Modello"
          tipo="choice"
          valore={modello}
          onChange={conSporco((v: string) => {
            setModello(v as Modello)
            setCartella(CARTELLA_DEFAULT[v as Modello])
          })}
          scelte={Object.entries(MODELLI).map(([valore, etichetta]) => ({ valore, etichetta }))}
          senzaVuoto
          disabilitato={!aperto}
          aiuto="Decide quali voci del tariffario si possono usare."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo
            etichetta="Tariffe di"
            tipo="choice"
            valore={ambito}
            onChange={conSporco((v: string) => setAmbito(v as Ambito))}
            scelte={AMBITI}
            senzaVuoto
            disabilitato={!aperto}
          />
          <Campo
            etichetta="Cartella in cui archiviarlo"
            tipo="choice"
            valore={cartella}
            onChange={conSporco(setCartella)}
            scelte={CARTELLE}
            senzaVuoto
            disabilitato={!aperto}
          />
        </div>
      </section>

      {/* 2. A chi va */}
      <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <h3 className="font-bold text-gray-800">A chi lo mandi</h3>
        <label className="block">
          <span className={labelCls}>
            Ente<span className="text-red-500 ml-0.5">*</span>
          </span>
          <input
            className={`${inputCls} ${!aperto ? 'bg-gray-50 text-gray-500' : ''}`}
            list="preventivi-enti"
            value={ente}
            disabled={!aperto}
            placeholder="Comune di Torino, ASL TO3, famiglia…"
            onChange={(e) => conSporco(setEnte)(e.target.value)}
          />
          <datalist id="preventivi-enti">
            {enti.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className={labelCls}>Persona (assistente sociale, NPI, referente…)</span>
          <input
            className={`${inputCls} ${!aperto ? 'bg-gray-50 text-gray-500' : ''}`}
            list="preventivi-contatti"
            value={nome}
            disabled={!aperto}
            placeholder="Scrivi il nome: se è in rubrica si compila il resto"
            onChange={(e) => {
              const v = e.target.value
              conSporco(setNome)(v)
              const c = opzioni.contatti.find((x) => x.nome.toLowerCase() === v.trim().toLowerCase())
              if (c) {
                setRuolo(c.ruolo)
                setEmail(c.email)
                if (c.ente) setEnte(c.ente)
              }
            }}
          />
          <datalist id="preventivi-contatti">
            {opzioni.contatti.map((c) => (
              <option key={`${c.nome}-${c.ente}`} value={c.nome} label={[c.ruolo, c.ente].filter(Boolean).join(' · ')} />
            ))}
          </datalist>
          <span className="block text-xs text-gray-500 mt-1">Chi riceve un preventivo finisce da solo in rubrica.</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo etichetta="Ruolo" tipo="choice" valore={ruolo} onChange={conSporco(setRuolo)} scelte={RUOLI_CONTATTO} disabilitato={!aperto} />
          <Campo etichetta="Email" tipo="email" inputMode="email" valore={email} onChange={conSporco(setEmail)} disabilitato={!aperto} />
        </div>
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
        {pa && (
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
        <div className="grid grid-cols-2 gap-3">
          <Campo etichetta="Dal" tipo="date" valore={dal} onChange={conSporco(setDal)} obbligatorio disabilitato={!aperto} />
          <Campo etichetta="Al" tipo="date" valore={al} onChange={conSporco(setAl)} obbligatorio disabilitato={!aperto} />
        </div>
        {aperto && dal && (
          <div className="flex flex-wrap gap-2">
            {[1, 3, 6, 12].map((m) => (
              <button
                key={m}
                onClick={() => conSporco(setAl)(finePeriodo(dal, m))}
                className="px-3 py-1.5 rounded-full border border-gray-300 bg-white text-sm text-gray-700"
              >
                {m === 1 ? '1 mese' : `${m} mesi`}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 4. Voci */}
      <Voci
        righe={righe}
        onChange={conSporco(setRighe)}
        disponibili={disponibili}
        tariffe={tariffe}
        dataPrezzi={dataPrezzi}
        ambito={ambito}
        libero={libero}
        giorniRetta={GIORNI_RETTA_DEFAULT[modello]}
        disabilitato={!aperto}
        nuovaRiga={rigaDaTariffa}
      />

      <Totali t={t} />

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

function ModaleEsito({
  tipo,
  onChiudi,
  onConferma,
  inCorso,
  minimo,
}: {
  tipo: 'accetta' | 'rifiuta'
  onChiudi: () => void
  onConferma: (data: string, nota: string) => void
  inCorso: boolean
  minimo: string
}) {
  const [data, setData] = useState(oggiIso())
  const [nota, setNota] = useState('')
  const accetta = tipo === 'accetta'
  return (
    <Modale
      titolo={accetta ? 'Preventivo accettato' : 'Preventivo rifiutato'}
      sottotitolo={accetta ? 'Andrea riceve il PDF definitivo e sa cosa fatturare.' : 'Resta nell’elenco dei rifiutati.'}
      onChiudi={onChiudi}
      azioni={
        <button
          onClick={() => onConferma(data, nota)}
          disabled={inCorso || !data || data < minimo || data > oggiIso()}
          className={`w-full px-4 py-3 rounded-xl font-semibold text-white disabled:opacity-50 ${accetta ? 'bg-emerald-600' : 'bg-red-600'}`}
        >
          {inCorso ? 'Un momento…' : 'Conferma'}
        </button>
      }
    >
      <div className="space-y-3">
        <Campo etichetta={accetta ? 'Accettato il' : 'Rifiutato il'} tipo="date" valore={data} onChange={setData} obbligatorio />
        <Campo
          etichetta="Nota"
          tipo="textarea"
          righe={3}
          valore={nota}
          onChange={setNota}
          aiuto={accetta ? 'Es. «conferma via mail dell’assistente sociale», numero di autorizzazione…' : 'Perché, se lo sai.'}
        />
        {accetta && (
          <p className="text-sm text-gray-600">
            Se l’ente ha cambiato qualcosa (ore, prestazioni) non confermare: chiudi, usa «Riapri per correggere», correggi e
            riemetti. Andrea deve ricevere quello che è stato davvero riconosciuto.
          </p>
        )}
      </div>
    </Modale>
  )
}
