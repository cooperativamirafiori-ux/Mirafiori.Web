'use client'

/** I pannelli del Tariffario: nuovo prezzo, modifica, chiudi, nuova voce, ISTAT. */

import { useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Campo, inputCls, labelCls } from '@/components/ui/Campo'
import { Modale } from '@/components/ui/Modale'
import { Vuoto } from '@/components/ui/Vuoto'
import { ENTE_ALTRI, ENTE_TUTTI, GRUPPI, REGIMI_IVA, UNITA, type Ente, type Tariffa } from '@/types/preventivi'
import { aggiungiGiorni, dataIt, euro, oggiIso, type VoceIstat } from '@/lib/preventivi/calcoli'

export async function chiama<T = any>(url: string, metodo: string, corpo?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error ?? 'Operazione non riuscita')
  return j as T
}

export const prezzoTesto = (t: Tariffa) => (t.prezzo === null ? 'da definire' : euro(t.prezzo))

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

export function PannelloPrezzo({ t, onChiudi, onFatto }: { t: Tariffa; onChiudi: () => void; onFatto: (m: string) => Promise<void> }) {
  const [prezzo, setPrezzo] = useState(t.prezzo === null ? '' : String(t.prezzo))
  const [dal, setDal] = useState(primoProssimoMese())
  const { inCorso, errore, invia } = useInvio(onFatto)
  return (
    <Modale
      titolo="Nuovo prezzo"
      sottotitolo={`${t.voce} · ${t.ente} — oggi ${prezzoTesto(t)}`}
      onChiudi={onChiudi}
      azioni={
        <Conferma
          inCorso={inCorso}
          testo="Applica il nuovo prezzo"
          onClick={() =>
            invia(async () => {
              await chiama(`/api/preventivi/tariffario/${t.spItemId}`, 'PATCH', { tipo: 'prezzo', prezzo, dal })
              return `«${t.voce}»: dal ${dataIt(dal)} ${prezzo.trim() ? `vale ${euro(Number(prezzo.replace(',', '.')))}` : 'il prezzo è da definire'}. Il prezzo di prima resta sui preventivi già fatti.`
            })
          }
        />
      }
    >
      <div className="space-y-3">
        <Campo etichetta="Da quando vale" tipo="date" valore={dal} onChange={setDal} obbligatorio aiuto={`La riga di oggi si chiude il ${dataIt(dal ? aggiungiGiorni(dal, -1) : '')}.`} />
        <Campo
          etichetta="Prezzo"
          tipo="currency"
          inputMode="decimal"
          valore={prezzo}
          onChange={setPrezzo}
          aiuto="Vuoto = da definire: lo scrive chi fa il preventivo."
        />
        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}

/** Ente della voce: "Tutti", "Tutti gli altri enti" o un ente dell'elenco. */
function SceltaEnteTariffa({ valore, onChange, enti }: { valore: string; onChange: (v: string) => void; enti: Ente[] }) {
  const scelte = [ENTE_TUTTI, ENTE_ALTRI, ...enti.map((e) => e.nome)]
  if (valore && !scelte.includes(valore)) scelte.push(valore)
  return (
    <Campo
      etichetta="Ente pagante"
      tipo="choice"
      valore={valore}
      onChange={onChange}
      scelte={scelte}
      senzaVuoto
      aiuto="«Tutti gli altri enti» vale per ogni ente che non ha una riga sua per questa voce."
    />
  )
}

function ServizioESottotipo({
  servizio,
  sottotipo,
  onServizio,
  onSottotipo,
  servizi,
}: {
  servizio: string
  sottotipo: string
  onServizio: (v: string) => void
  onSottotipo: (v: string) => void
  servizi: string[]
}) {
  return (
    <>
      <label className="block">
        <span className={labelCls}>
          Servizio<span className="text-red-500 ml-0.5">*</span>
        </span>
        <input className={inputCls} list="tariffario-servizi" value={servizio} onChange={(e) => onServizio(e.target.value)} />
        <datalist id="tariffario-servizi">
          {servizi.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </label>
      <Campo etichetta="Sottotipo" valore={sottotipo} onChange={onSottotipo} aiuto="Vuoto = vale per tutti i sottotipi del servizio." />
    </>
  )
}

export function PannelloModifica({
  t,
  enti,
  servizi,
  onChiudi,
  onFatto,
}: {
  t: Tariffa
  enti: Ente[]
  servizi: string[]
  onChiudi: () => void
  onFatto: (m: string) => Promise<void>
}) {
  const [voce, setVoce] = useState(t.voce)
  const [servizio, setServizio] = useState(t.servizio)
  const [sottotipo, setSottotipo] = useState(t.sottotipo)
  const [ente, setEnte] = useState(t.ente)
  const [gruppo, setGruppo] = useState(t.gruppo)
  const [note, setNote] = useState(t.note)
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
              await chiama(`/api/preventivi/tariffario/${t.spItemId}`, 'PATCH', { tipo: 'modifica', voce, servizio, sottotipo, ente, gruppo, note, ordine })
              return `«${voce}» aggiornata.`
            })
          }
        />
      }
    >
      <div className="space-y-3">
        <ServizioESottotipo servizio={servizio} sottotipo={sottotipo} onServizio={setServizio} onSottotipo={setSottotipo} servizi={servizi} />
        <Campo etichetta="Nome della voce" valore={voce} onChange={setVoce} obbligatorio />
        <SceltaEnteTariffa valore={ente} onChange={setEnte} enti={enti} />
        <Campo etichetta="Sezione del documento" tipo="choice" valore={gruppo} onChange={setGruppo} scelte={GRUPPI} senzaVuoto />
        <Campo etichetta="Posizione nell’elenco" tipo="number" inputMode="numeric" valore={ordine} onChange={setOrdine} />
        <Campo etichetta="Note" tipo="textarea" righe={3} valore={note} onChange={setNote} />
        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}

export function PannelloChiudi({ t, onChiudi, onFatto }: { t: Tariffa; onChiudi: () => void; onFatto: (m: string) => Promise<void> }) {
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

export function PannelloNuova({
  enti,
  servizi,
  onChiudi,
  onFatto,
}: {
  enti: Ente[]
  servizi: string[]
  onChiudi: () => void
  onFatto: (m: string) => Promise<void>
}) {
  const [f, setF] = useState({
    servizio: '',
    sottotipo: '',
    voce: '',
    ente: ENTE_TUTTI as string,
    gruppo: 'Altre prestazioni',
    unita: 'ora',
    prezzo: '',
    iva: 'iva5',
    dal: oggiIso(),
    note: '',
  })
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
              await chiama('/api/preventivi/tariffario', 'POST', f)
              return `«${f.voce}» aggiunta al tariffario.`
            })
          }
        />
      }
    >
      <div className="space-y-3">
        <ServizioESottotipo servizio={f.servizio} sottotipo={f.sottotipo} onServizio={imposta('servizio')} onSottotipo={imposta('sottotipo')} servizi={servizi} />
        <Campo etichetta="Nome della voce" valore={f.voce} onChange={imposta('voce')} obbligatorio />
        <SceltaEnteTariffa valore={f.ente} onChange={imposta('ente')} enti={enti} />
        <Campo etichetta="Sezione del documento" tipo="choice" valore={f.gruppo} onChange={imposta('gruppo')} scelte={GRUPPI} senzaVuoto />
        <div className="grid grid-cols-2 gap-3">
          <Campo etichetta="Unità" tipo="choice" valore={f.unita} onChange={imposta('unita')} scelte={Object.keys(UNITA).map((u) => ({ valore: u, etichetta: UNITA[u as keyof typeof UNITA].etichetta }))} senzaVuoto />
          <Campo etichetta="IVA" tipo="choice" valore={f.iva} onChange={imposta('iva')} scelte={Object.entries(REGIMI_IVA).map(([valore, r]) => ({ valore, etichetta: r.etichetta }))} senzaVuoto />
        </div>
        <Campo etichetta="Prezzo" tipo="currency" inputMode="decimal" valore={f.prezzo} onChange={imposta('prezzo')} aiuto="Vuoto = da definire: lo scrive chi fa il preventivo." />
        <Campo etichetta="Valida dal" tipo="date" valore={f.dal} onChange={imposta('dal')} obbligatorio />
        <Campo etichetta="Note" tipo="textarea" righe={2} valore={f.note} onChange={imposta('note')} />
        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}

export function PannelloIstat({ onChiudi, onFatto }: { onChiudi: () => void; onFatto: (m: string) => Promise<void> }) {
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
          Per ogni voce scelta la riga di oggi si chiude il giorno prima e se ne apre una nuova col prezzo aumentato. Restano
          fuori rimborso km, spese escluse da IVA e voci senza prezzo. I preventivi già fatti non cambiano.
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
                onClick={() => setScelte(voci.filter((v) => /retta/i.test(v.voce)).map((v) => v.spItemId))}
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
                      <span className="block text-xs text-gray-500">
                        {v.servizio}
                        {v.ente !== ENTE_TUTTI ? ` · ${v.ente}` : ''}
                      </span>
                      <span className="block text-gray-600">
                        {euro(v.prima)} → <b>{euro(v.dopo)}</b>
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
