'use client'

/**
 * "A chi lo mandi": l'ente (le due coppie di Torino oppure un ente
 * dell'elenco) e le persone (assistenti sociali, NPI, famiglia…).
 *
 * Per Torino si sceglie solo fra le due coppie (Dennis, 20/11/2026): il
 * preventivo va al Comune e all'ASL insieme. Gli altri enti hanno tutti le
 * stesse tariffe. Un ente che non c'è si aggiunge da qui e finisce
 * nell'elenco Enti per tutti.
 */

import { useState } from 'react'
import { Campo, inputCls, labelCls } from '@/components/ui/Campo'
import { Modale } from '@/components/ui/Modale'
import { CHIAVI_ENTE, COPPIE_TORINO, RUOLI_CONTATTO, type Ente, type Persona } from '@/types/preventivi'

const CHIAVI_COPPIE: string[] = [CHIAVI_ENTE.comuneTorino, CHIAVI_ENTE.aslTo1, CHIAVI_ENTE.aslTo2]

export function SceltaEnte({
  ente,
  enti,
  onChange,
  onNuovoEnte,
  disabilitato,
}: {
  ente: string
  enti: Ente[]
  onChange: (v: string) => void
  onNuovoEnte: (e: Ente) => void
  disabilitato: boolean
}) {
  const [nuovo, setNuovo] = useState(false)
  const altri = enti.filter((e) => e.attivo && !CHIAVI_COPPIE.includes(e.chiave))
  const fuoriElenco = ente && !(ente in COPPIE_TORINO) && !altri.some((e) => e.nome === ente)
  return (
    <div>
      <label className="block">
        <span className={labelCls}>
          Ente<span className="text-red-500 ml-0.5">*</span>
        </span>
        <select
          className={`${inputCls} ${disabilitato ? 'bg-gray-50 text-gray-500' : 'bg-white'}`}
          value={ente}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          <optgroup label="Torino: Comune e ASL insieme">
            {Object.entries(COPPIE_TORINO).map(([k, c]) => (
              <option key={k} value={k}>
                {c.etichetta}
              </option>
            ))}
          </optgroup>
          <optgroup label="Altri enti">
            {altri.map((e) => (
              <option key={e.spItemId} value={e.nome}>
                {e.nome}
              </option>
            ))}
            {fuoriElenco && <option value={ente}>{ente}</option>}
          </optgroup>
        </select>
      </label>
      {!disabilitato && (
        <button onClick={() => setNuovo(true)} className="mt-1.5 text-sm text-brand-cyan-dark underline">
          L’ente non c’è? Aggiungilo
        </button>
      )}
      {nuovo && (
        <ModaleNuovoEnte
          onChiudi={() => setNuovo(false)}
          onFatto={(e) => {
            setNuovo(false)
            onNuovoEnte(e)
            onChange(e.nome)
          }}
        />
      )}
    </div>
  )
}

export function ModaleNuovoEnte({ onChiudi, onFatto, ente }: { onChiudi: () => void; onFatto: (e: Ente) => void; ente?: Ente }) {
  const [nome, setNome] = useState(ente?.nome ?? '')
  const [servizi, setServizi] = useState(ente?.servizi ?? '')
  const [note, setNote] = useState(ente?.note ?? '')
  const [errore, setErrore] = useState('')
  const [inCorso, setInCorso] = useState(false)
  async function salva() {
    setInCorso(true)
    setErrore('')
    try {
      const res = await fetch(ente ? `/api/preventivi/enti/${ente.spItemId}` : '/api/preventivi/enti', {
        method: ente ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, servizi, note }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Non salvato')
      onFatto(j.ente ?? { ...ente!, nome: nome.trim(), servizi, note })
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Non salvato')
    } finally {
      setInCorso(false)
    }
  }
  return (
    <Modale
      titolo={ente ? 'Modifica ente' : 'Nuovo ente'}
      sottotitolo="Il nome come compare in fattura"
      onChiudi={onChiudi}
      azioni={
        <button
          onClick={salva}
          disabled={inCorso || !nome.trim()}
          className="w-full px-4 py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
        >
          {inCorso ? 'Un momento…' : 'Salva'}
        </button>
      }
    >
      <div className="space-y-3">
        {errore && <p className="text-sm text-red-700">{errore}</p>}
        <Campo etichetta="Nome (intestazione in fattura)" valore={nome} onChange={setNome} obbligatorio />
        <Campo etichetta="Per quali servizi" valore={servizi} onChange={setServizi} segnaposto="Ambientale · CRP · Giulia" />
        <Campo etichetta="Note" tipo="textarea" righe={2} valore={note} onChange={setNote} />
        {ente && nome.trim() !== ente.nome && (
          <p className="text-sm text-gray-600">Cambiando il nome si aggiornano anche le tariffe di questo ente nel tariffario.</p>
        )}
      </div>
    </Modale>
  )
}

const vuota = (ente = ''): Persona => ({ nome: '', ruolo: '', ente, email: '' })

export function Persone({
  persone,
  onChange,
  contatti,
  disabilitato,
  privato,
  entePredefinito,
}: {
  persone: Persona[]
  onChange: (p: Persona[]) => void
  contatti: Persona[]
  disabilitato: boolean
  privato: boolean
  entePredefinito: string
}) {
  const cambia = (i: number, patch: Partial<Persona>) => onChange(persone.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  return (
    <div className="space-y-3">
      <span className={labelCls}>
        {privato ? 'A chi va (la famiglia)' : 'Persone (assistente sociale, NPI, referente…)'}
        {privato && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {persone.map((p, i) => (
        <div key={i} className="rounded-xl border border-gray-200 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <label className="block grow">
              <span className={labelCls}>Nome</span>
              <input
                className={`${inputCls} ${disabilitato ? 'bg-gray-50 text-gray-500' : ''}`}
                list="preventivi-contatti"
                value={p.nome}
                disabled={disabilitato}
                placeholder="Scrivi il nome: se è in rubrica si compila il resto"
                onChange={(e) => {
                  const v = e.target.value
                  const c = contatti.find((x) => x.nome.toLowerCase() === v.trim().toLowerCase())
                  cambia(i, c ? { nome: v, ruolo: c.ruolo, email: c.email, ente: c.ente || p.ente } : { nome: v })
                }}
              />
            </label>
            {!disabilitato && (
              <button
                onClick={() => onChange(persone.filter((_, j) => j !== i))}
                className="mt-6 text-sm text-red-600 px-2 py-1"
                aria-label={`Togli ${p.nome || 'persona'}`}
              >
                Togli
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo
              etichetta="Ruolo"
              tipo="choice"
              valore={p.ruolo}
              onChange={(v) => cambia(i, { ruolo: v })}
              scelte={RUOLI_CONTATTO}
              disabilitato={disabilitato}
            />
            <Campo
              etichetta="Email"
              tipo="email"
              inputMode="email"
              valore={p.email}
              onChange={(v) => cambia(i, { email: v })}
              disabilitato={disabilitato}
            />
          </div>
        </div>
      ))}
      <datalist id="preventivi-contatti">
        {contatti.map((c) => (
          <option key={`${c.nome}-${c.ente}`} value={c.nome} label={[c.ruolo, c.ente].filter(Boolean).join(' · ')} />
        ))}
      </datalist>
      {!disabilitato && (
        <button
          onClick={() => onChange([...persone, vuota(entePredefinito)])}
          className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700"
        >
          + Aggiungi una persona
        </button>
      )}
      <span className="block text-xs text-gray-500">Chi riceve un preventivo finisce da solo in rubrica.</span>
    </div>
  )
}
