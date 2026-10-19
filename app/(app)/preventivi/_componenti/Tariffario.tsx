'use client'

/**
 * Il tariffario: le voci in vigore oggi, per sezione, con lo storico a
 * richiesta.
 *
 * Chi ha "Amministrazione" può:
 *   - Nuovo prezzo: da una data in poi (la riga vecchia si chiude il giorno prima);
 *   - Modifica: nome, sezione, note, modelli, prezzo fisso o libero — senza toccare i prezzi;
 *   - Chiudi: la voce non vale più dopo una data;
 *   - Nuova voce;
 *   - Adeguamento ISTAT: percentuale + decorrenza, anteprima voce per voce, poi applica.
 * Il passato non cambia mai: i preventivi già fatti hanno i loro prezzi.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Campo, labelCls } from '@/components/ui/Campo'
import { Modale } from '@/components/ui/Modale'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import { AMBITI, ELENCO_MODELLI, GRUPPI, MODELLI, REGIMI_IVA, UNITA, type Modello, type Tariffa } from '@/types/preventivi'
import { aggiungiGiorni, dataIt, euro, oggiIso, tariffaValidaIl, type VoceIstat } from '@/lib/preventivi/calcoli'

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

const prezzoTesto = (t: Tariffa) =>
  t.bloccato
    ? `${euro(t.prezzo)} fisso`
    : t.min != null || t.max != null
      ? `${euro(t.prezzo)} (da ${euro(t.min ?? 0)} a ${euro(t.max ?? t.prezzo)})`
      : euro(t.prezzo)

type Pannello =
  | { tipo: 'prezzo'; t: Tariffa }
  | { tipo: 'modifica'; t: Tariffa }
  | { tipo: 'chiudi'; t: Tariffa }
  | { tipo: 'nuova' }
  | { tipo: 'istat' }

export function Tariffario({ modificabile }: { modificabile: boolean }) {
  const [tariffe, setTariffe] = useState<Tariffa[] | null>(null)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [storico, setStorico] = useState(false)
  const [pannello, setPannello] = useState<Pannello | null>(null)
  const oggi = oggiIso()

  const carica = useCallback(async () => {
    try {
      setTariffe((await chiama<{ tariffe: Tariffa[] }>('/api/preventivi/tariffario', 'GET')).tariffe)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di lettura')
    }
  }, [])
  useEffect(() => {
    void carica()
  }, [carica])

  const fatto = async (m: string) => {
    setPannello(null)
    setMessaggio(m)
    await carica()
  }

  const gruppi = useMemo(() => {
    const visibili = (tariffe ?? [])
      .filter((t) => storico || tariffaValidaIl(t, oggi) || t.dal > oggi)
      .sort((a, b) => a.ordine - b.ordine || a.codice.localeCompare(b.codice) || b.dal.localeCompare(a.dal))
    const m = new Map<string, Tariffa[]>()
    for (const t of visibili) m.set(t.gruppo, [...(m.get(t.gruppo) ?? []), t])
    const ordine = (g: string) => ((GRUPPI as readonly string[]).indexOf(g) + 1 || 999)
    return [...m.entries()].sort((a, b) => ordine(a[0]) - ordine(b[0]))
  }, [tariffe, storico, oggi])

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        I prezzi con cui si fanno i preventivi. Quelli <b>fissi</b> non si cambiano nel preventivo; gli altri si scelgono fra il
        minimo e il massimo, finché il CDA non fissa un prezzo unico.
      </p>
      {modificabile && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPannello({ tipo: 'istat' })} className="grow sm:grow-0 px-4 py-2.5 rounded-xl bg-primary text-white font-semibold">
            Adeguamento ISTAT
          </button>
          <button
            onClick={() => setPannello({ tipo: 'nuova' })}
            className="grow sm:grow-0 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold"
          >
            + Nuova voce
          </button>
        </div>
      )}
      <Banner tono="ok">{messaggio}</Banner>
      <Banner tono="errore">{errore}</Banner>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={storico} onChange={(e) => setStorico(e.target.checked)} />
        Mostra anche i prezzi non più in vigore
      </label>

      {tariffe && !gruppi.length && <Vuoto>Il tariffario è vuoto: lancia scripts/provision-preventivi.mjs.</Vuoto>}
      {!tariffe && !errore && <p className="text-sm text-gray-500">Carico…</p>}

      {gruppi.map(([gruppo, voci]) => (
        <section key={gruppo} className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">{gruppo}</h3>
          <ul className="space-y-2">
            {voci.map((t) => {
              const inVigore = tariffaValidaIl(t, oggi)
              const futura = t.dal > oggi
              return (
                <li key={t.spItemId} className={`bg-white rounded-xl border border-gray-100 p-3 ${!inVigore && !futura ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-800">{t.voce}</span>
                    {futura && <Pill text={`dal ${dataIt(t.dal)}`} tono="azzurro" />}
                    {!inVigore && !futura && <Pill text="non più in vigore" tono="neutro" />}
                    {t.ambito !== 'Tutti' && <Pill text={t.ambito} tono="viola" />}
                  </div>
                  <p className="text-sm text-gray-700 mt-1">
                    {prezzoTesto(t)} per {UNITA[t.unita].etichetta} · {REGIMI_IVA[t.iva].etichetta}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t.codice} · valido dal {dataIt(t.dal)}
                    {t.al ? ` al ${dataIt(t.al)}` : ''} · {t.modelli.length ? t.modelli.map((m) => MODELLI[m]).join(', ') : 'tutti i modelli'}
                  </p>
                  {t.note && <p className="text-xs text-gray-500 mt-1">{t.note}</p>}
                  {modificabile && (inVigore || futura) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {!t.al && (
                        <button onClick={() => setPannello({ tipo: 'prezzo', t })} className="px-3 py-1.5 rounded-lg border border-brand-cyan-dark text-brand-cyan-dark text-sm font-semibold">
                          Nuovo prezzo
                        </button>
                      )}
                      <button onClick={() => setPannello({ tipo: 'modifica', t })} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold">
                        Modifica
                      </button>
                      {!t.al && (
                        <button onClick={() => setPannello({ tipo: 'chiudi', t })} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-sm font-semibold">
                          Chiudi
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {pannello?.tipo === 'prezzo' && <PannelloPrezzo t={pannello.t} onChiudi={() => setPannello(null)} onFatto={fatto} />}
      {pannello?.tipo === 'modifica' && <PannelloModifica t={pannello.t} onChiudi={() => setPannello(null)} onFatto={fatto} />}
      {pannello?.tipo === 'chiudi' && <PannelloChiudi t={pannello.t} onChiudi={() => setPannello(null)} onFatto={fatto} />}
      {pannello?.tipo === 'nuova' && <PannelloNuova onChiudi={() => setPannello(null)} onFatto={fatto} />}
      {pannello?.tipo === 'istat' && <PannelloIstat onChiudi={() => setPannello(null)} onFatto={fatto} />}
    </div>
  )
}

// ------------------------------------------------------------

function useInvio(onFatto: (m: string) => Promise<void>) {
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')
  const invia = async (fn: () => Promise<string>) => {
    setInCorso(true)
    setErrore('')
    try {
      await onFatto(await fn())
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
    } finally {
      setInCorso(false)
    }
  }
  return { inCorso, errore, invia }
}

const Conferma = ({ onClick, inCorso, testo, disabilitato }: { onClick: () => void; inCorso: boolean; testo: string; disabilitato?: boolean }) => (
  <button onClick={onClick} disabled={inCorso || disabilitato} className="w-full px-4 py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50">
    {inCorso ? 'Un momento…' : testo}
  </button>
)

const primoProssimoMese = () => {
  const [y, m] = oggiIso().split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

function PannelloPrezzo({ t, onChiudi, onFatto }: { t: Tariffa; onChiudi: () => void; onFatto: (m: string) => Promise<void> }) {
  const [prezzo, setPrezzo] = useState(String(t.prezzo))
  const [min, setMin] = useState(t.min == null ? '' : String(t.min))
  const [max, setMax] = useState(t.max == null ? '' : String(t.max))
  const [dal, setDal] = useState(primoProssimoMese())
  const { inCorso, errore, invia } = useInvio(onFatto)
  return (
    <Modale
      titolo="Nuovo prezzo"
      sottotitolo={`${t.voce} — oggi ${prezzoTesto(t)}`}
      onChiudi={onChiudi}
      azioni={
        <Conferma
          inCorso={inCorso}
          testo="Applica il nuovo prezzo"
          onClick={() =>
            invia(async () => {
              await chiama(`/api/preventivi/tariffario/${t.spItemId}`, 'PATCH', { tipo: 'prezzo', prezzo, min, max, dal })
              return `«${t.voce}»: dal ${dataIt(dal)} vale ${euro(Number(prezzo.replace(',', '.')))}. Il prezzo di prima resta sui preventivi già fatti.`
            })
          }
        />
      }
    >
      <div className="space-y-3">
        <Campo etichetta="Da quando vale" tipo="date" valore={dal} onChange={setDal} obbligatorio aiuto={`La riga di oggi si chiude il ${dataIt(dal ? aggiungiGiorni(dal, -1) : '')}.`} />
        <Campo etichetta={t.bloccato ? 'Prezzo (fisso)' : 'Prezzo proposto'} tipo="currency" inputMode="decimal" valore={prezzo} onChange={setPrezzo} obbligatorio />
        {!t.bloccato && (
          <div className="grid grid-cols-2 gap-3">
            <Campo etichetta="Minimo" tipo="currency" inputMode="decimal" valore={min} onChange={setMin} />
            <Campo etichetta="Massimo" tipo="currency" inputMode="decimal" valore={max} onChange={setMax} />
          </div>
        )}
        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}

function SceltaModelli({ valore, onChange }: { valore: Modello[]; onChange: (m: Modello[]) => void }) {
  return (
    <div>
      <span className={labelCls}>Compare nei modelli (nessuno = tutti)</span>
      <div className="flex flex-wrap gap-3">
        {ELENCO_MODELLI.map((m) => (
          <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={valore.includes(m)}
              onChange={(e) => onChange(e.target.checked ? [...valore, m] : valore.filter((x) => x !== m))}
            />
            {MODELLI[m]}
          </label>
        ))}
      </div>
    </div>
  )
}

function PannelloModifica({ t, onChiudi, onFatto }: { t: Tariffa; onChiudi: () => void; onFatto: (m: string) => Promise<void> }) {
  const [voce, setVoce] = useState(t.voce)
  const [gruppo, setGruppo] = useState(t.gruppo)
  const [note, setNote] = useState(t.note)
  const [modelli, setModelli] = useState<Modello[]>(t.modelli)
  const [bloccato, setBloccato] = useState(t.bloccato)
  const [ordine, setOrdine] = useState(String(t.ordine))
  const { inCorso, errore, invia } = useInvio(onFatto)
  return (
    <Modale
      titolo="Modifica la voce"
      sottotitolo="Per il prezzo usa «Nuovo prezzo»: qui si correggono le descrizioni"
      onChiudi={onChiudi}
      azioni={
        <Conferma
          inCorso={inCorso}
          testo="Salva"
          onClick={() =>
            invia(async () => {
              await chiama(`/api/preventivi/tariffario/${t.spItemId}`, 'PATCH', { tipo: 'modifica', voce, gruppo, note, modelli, bloccato, ordine })
              return `«${voce}» aggiornata.`
            })
          }
        />
      }
    >
      <div className="space-y-3">
        <Campo etichetta="Nome della voce" valore={voce} onChange={setVoce} obbligatorio />
        <Campo etichetta="Sezione del documento" tipo="choice" valore={gruppo} onChange={setGruppo} scelte={GRUPPI} senzaVuoto />
        <SceltaModelli valore={modelli} onChange={setModelli} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={bloccato} onChange={(e) => setBloccato(e.target.checked)} />
          Prezzo fisso: nel preventivo non si cambia
        </label>
        <Campo etichetta="Posizione nell’elenco" tipo="number" inputMode="numeric" valore={ordine} onChange={setOrdine} />
        <Campo etichetta="Note" tipo="textarea" righe={3} valore={note} onChange={setNote} />
        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}

function PannelloChiudi({ t, onChiudi, onFatto }: { t: Tariffa; onChiudi: () => void; onFatto: (m: string) => Promise<void> }) {
  const [al, setAl] = useState(oggiIso())
  const { inCorso, errore, invia } = useInvio(onFatto)
  return (
    <Modale
      titolo="Chiudi la voce"
      sottotitolo={t.voce}
      onChiudi={onChiudi}
      azioni={
        <Conferma
          inCorso={inCorso}
          testo="Chiudi"
          onClick={() =>
            invia(async () => {
              await chiama(`/api/preventivi/tariffario/${t.spItemId}`, 'PATCH', { tipo: 'chiudi', al })
              return `«${t.voce}» non vale più dopo il ${dataIt(al)}.`
            })
          }
        />
      }
    >
      <div className="space-y-3">
        <Campo etichetta="Ultimo giorno di validità" tipo="date" valore={al} onChange={setAl} obbligatorio />
        <p className="text-sm text-gray-600">I preventivi già fatti la tengono; nei nuovi non si potrà più scegliere.</p>
        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}

function PannelloNuova({ onChiudi, onFatto }: { onChiudi: () => void; onFatto: (m: string) => Promise<void> }) {
  const [f, setF] = useState({
    voce: '',
    codice: '',
    gruppo: 'Altre prestazioni',
    unita: 'ora',
    prezzo: '',
    min: '',
    max: '',
    iva: 'iva5',
    ambito: 'Tutti',
    dal: oggiIso(),
    note: '',
    ordine: '500',
  })
  const [modelli, setModelli] = useState<Modello[]>([])
  const [bloccato, setBloccato] = useState(false)
  const imposta = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const { inCorso, errore, invia } = useInvio(onFatto)
  return (
    <Modale
      titolo="Nuova voce"
      onChiudi={onChiudi}
      azioni={
        <Conferma
          inCorso={inCorso}
          testo="Aggiungi al tariffario"
          onClick={() =>
            invia(async () => {
              await chiama('/api/preventivi/tariffario', 'POST', { ...f, modelli, bloccato })
              return `«${f.voce}» aggiunta al tariffario.`
            })
          }
        />
      }
    >
      <div className="space-y-3">
        <Campo etichetta="Nome della voce" valore={f.voce} onChange={imposta('voce')} obbligatorio />
        <Campo etichetta="Codice" valore={f.codice} onChange={imposta('codice')} maiuscolo obbligatorio aiuto="Breve e stabile, es. EDU_SCUOLA: lega i prezzi della stessa voce nel tempo." />
        <Campo etichetta="Sezione del documento" tipo="choice" valore={f.gruppo} onChange={imposta('gruppo')} scelte={GRUPPI} senzaVuoto />
        <div className="grid grid-cols-2 gap-3">
          <Campo etichetta="Unità" tipo="choice" valore={f.unita} onChange={imposta('unita')} scelte={Object.keys(UNITA).map((u) => ({ valore: u, etichetta: UNITA[u as keyof typeof UNITA].etichetta }))} senzaVuoto />
          <Campo etichetta="IVA" tipo="choice" valore={f.iva} onChange={imposta('iva')} scelte={Object.entries(REGIMI_IVA).map(([valore, r]) => ({ valore, etichetta: r.etichetta }))} senzaVuoto />
        </div>
        <Campo etichetta="Prezzo" tipo="currency" inputMode="decimal" valore={f.prezzo} onChange={imposta('prezzo')} obbligatorio />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={bloccato} onChange={(e) => setBloccato(e.target.checked)} />
          Prezzo fisso
        </label>
        {!bloccato && (
          <div className="grid grid-cols-2 gap-3">
            <Campo etichetta="Minimo" tipo="currency" inputMode="decimal" valore={f.min} onChange={imposta('min')} />
            <Campo etichetta="Massimo" tipo="currency" inputMode="decimal" valore={f.max} onChange={imposta('max')} />
          </div>
        )}
        <Campo etichetta="Vale per" tipo="choice" valore={f.ambito} onChange={imposta('ambito')} scelte={AMBITI} senzaVuoto />
        <SceltaModelli valore={modelli} onChange={setModelli} />
        <Campo etichetta="Valida dal" tipo="date" valore={f.dal} onChange={imposta('dal')} obbligatorio />
        <Campo etichetta="Note" tipo="textarea" righe={2} valore={f.note} onChange={imposta('note')} />
        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}

function PannelloIstat({ onChiudi, onFatto }: { onChiudi: () => void; onFatto: (m: string) => Promise<void> }) {
  const [percentuale, setPercentuale] = useState('')
  const [dal, setDal] = useState(`${Number(oggiIso().slice(0, 4)) + 1}-01-01`)
  const [voci, setVoci] = useState<VoceIstat[] | null>(null)
  const [scelte, setScelte] = useState<string[]>([])
  const { inCorso, errore, invia } = useInvio(async (m) => {
    if (m) await onFatto(m)
  })

  const anteprima = () =>
    invia(async () => {
      const j = await chiama<{ voci: VoceIstat[] }>('/api/preventivi/tariffario/istat', 'POST', { percentuale, dal, applica: false })
      setVoci(j.voci)
      setScelte(j.voci.map((v) => v.spItemId))
      return ''
    })

  const applica = () =>
    invia(async () => {
      const j = await chiama<{ aggiornate: number; saltate: { voce: string; motivo: string }[] }>('/api/preventivi/tariffario/istat', 'POST', {
        percentuale,
        dal,
        ids: scelte,
        applica: true,
      })
      const saltate = j.saltate.length
        ? ` Non aggiornate: ${j.saltate.map((s) => `«${s.voce}» (${s.motivo})`).join(', ')}.`
        : ''
      return `Adeguamento ISTAT applicato a ${j.aggiornate} voci, dal ${dataIt(dal)}. I rinnovi da quella data escono già coi prezzi nuovi.${saltate}`
    })

  return (
    <Modale
      titolo="Adeguamento ISTAT"
      sottotitolo="Una volta l’anno, quando gli enti comunicano l’adeguamento"
      onChiudi={onChiudi}
      azioni={
        voci ? (
          <Conferma inCorso={inCorso} testo={`Applica a ${scelte.length} ${scelte.length === 1 ? "voce" : "voci"}`} onClick={applica} disabilitato={!scelte.length} />
        ) : (
          <Conferma inCorso={inCorso} testo="Vedi l’anteprima" onClick={anteprima} disabilitato={!percentuale || !dal} />
        )
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo
            etichetta="Percentuale (%)"
            tipo="number"
            inputMode="decimal"
            valore={percentuale}
            onChange={(v) => {
              setPercentuale(v)
              setVoci(null)
            }}
            obbligatorio
          />
          <Campo
            etichetta="Da quando vale"
            tipo="date"
            valore={dal}
            onChange={(v) => {
              setDal(v)
              setVoci(null)
            }}
            obbligatorio
          />
        </div>
        <p className="text-sm text-gray-600">
          Per ogni voce scelta la riga di oggi si chiude il giorno prima e se ne apre una nuova col prezzo aumentato (limiti
          compresi). Il rimborso chilometrico resta fuori. I preventivi già fatti non cambiano.
        </p>
        {voci && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3 text-sm">
              <button className="underline text-brand-cyan-dark" onClick={() => setScelte(voci.map((v) => v.spItemId))}>
                Tutte
              </button>
              <button className="underline text-brand-cyan-dark" onClick={() => setScelte([])}>
                Nessuna
              </button>
              <button
                className="underline text-brand-cyan-dark"
                onClick={() => setScelte(voci.filter((v) => /^RETTA/.test(v.codice)).map((v) => v.spItemId))}
              >
                Solo le rette
              </button>
            </div>
            {!voci.length && <Vuoto>Nessuna voce da adeguare a quella data.</Vuoto>}
            <ul className="space-y-1.5">
              {voci.map((v) => (
                <li key={v.spItemId}>
                  <label className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={scelte.includes(v.spItemId)}
                      onChange={(e) => setScelte((s) => (e.target.checked ? [...s, v.spItemId] : s.filter((x) => x !== v.spItemId)))}
                    />
                    <span className="grow">
                      <span className="block font-semibold text-gray-800">{v.voce}</span>
                      <span className="block text-gray-600">
                        {euro(v.prima)} → <b>{euro(v.dopo)}</b>
                        {v.ambito !== 'Tutti' ? ` · ${v.ambito}` : ''}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}
