'use client'

import { useState } from 'react'
import { Modale } from '@/components/ui/Modale'
import { Campo } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import { Spunta } from '@/components/ui/Bottoni'
import type { StrutturaCc, UtenzaConUltima } from '@/types/utenze'

const TIPI = [
  { valore: 'luce', etichetta: 'Luce (POD)' },
  { valore: 'gas', etichetta: 'Gas (PDR)' },
  { valore: 'acqua', etichetta: 'Acqua (codice utenza SMAT)' },
]

export function ModaleUtenza({
  utenza,
  strutture,
  strutturaIniziale,
  onChiudi,
  onFatto,
}: {
  utenza: UtenzaConUltima | null
  strutture: StrutturaCc[]
  /** Per "Aggiungi un'utenza a …": la struttura parte già scelta. */
  strutturaIniziale?: number | null
  onChiudi: () => void
  onFatto: (messaggio: string) => void
}) {
  const [codice, setCodice] = useState(utenza?.codice ?? '')
  const [tipo, setTipo] = useState(utenza && utenza.tipo !== 'altro' ? utenza.tipo : '')
  const [strutturaId, setStrutturaId] = useState(utenza?.strutturaId ? String(utenza.strutturaId) : strutturaIniziale ? String(strutturaIniziale) : '')
  const [percentuale, setPercentuale] = useState(String(utenza?.percentuale ?? 100))
  const [fornitore, setFornitore] = useState(utenza?.fornitore ?? '')
  const [note, setNote] = useState(utenza?.note ?? '')
  const [riapplica, setRiapplica] = useState(false)
  const [errore, setErrore] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [conferma, setConferma] = useState(false)

  async function elimina() {
    if (!utenza) return
    setSalvo(true)
    setErrore('')
    try {
      const r = await fetch(`/api/utenze/${utenza.id}`, { method: 'DELETE' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Errore')
      onFatto(`Utenza ${utenza.codice} eliminata.`)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
      setSalvo(false)
    }
  }

  async function salva() {
    setSalvo(true)
    setErrore('')
    try {
      const r = await fetch(utenza ? `/api/utenze/${utenza.id}` : '/api/utenze', {
        method: utenza ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codice, tipo, strutturaId: Number(strutturaId), percentuale, fornitore, note, riapplica }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Errore')
      onFatto(`Utenza ${codice.toUpperCase()} salvata${j.collegate ? `: ${j.collegate} bollette sistemate` : ''}.`)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
      setSalvo(false)
    }
  }

  return (
    <Modale
      titolo={utenza ? 'Modifica utenza' : 'Nuova utenza'}
      sottotitolo="Riga della lista SharePoint Mappatura Utenze"
      onChiudi={onChiudi}
      azioni={
        <>
          <button onClick={onChiudi} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700">
            Annulla
          </button>
          <button onClick={salva} disabled={salvo} className="flex-1 px-4 py-2.5 rounded-xl bg-brand-cyan text-white text-sm font-semibold disabled:opacity-50">
            {salvo ? 'Salvo…' : 'Salva'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Campo etichetta="Codice" valore={codice} onChange={setCodice} maiuscolo obbligatorio aiuto="POD (IT…E…), PDR (14 cifre) o numero utenza dell'acqua, come sta in bolletta" />
        <Campo etichetta="Tipo" tipo="choice" valore={tipo} onChange={setTipo} scelte={TIPI} obbligatorio />
        <Campo
          etichetta="Struttura"
          tipo="choice"
          valore={strutturaId}
          onChange={setStrutturaId}
          scelte={strutture.map((s) => ({ valore: String(s.id), etichetta: `${s.codice} · ${s.nome}` }))}
          obbligatorio
        />
        <Campo
          etichetta="Percentuale sulla struttura"
          tipo="number"
          valore={percentuale}
          onChange={setPercentuale}
          min={1}
          max={100}
          aiuto="100 se il contatore serve solo questa struttura. Se è diviso, una riga per struttura con le loro percentuali."
        />
        <Campo etichetta="Fornitore" valore={fornitore} onChange={setFornitore} />
        <Campo etichetta="Note" tipo="textarea" valore={note} onChange={setNote} righe={2} />
        {utenza && (
          <div>
            <Spunta valore={riapplica} onChange={setRiapplica} etichetta="Applica anche alle bollette già registrate" />
            <p className="text-xs text-gray-500 -mt-1">
              Senza questa spunta la modifica vale dalle prossime bollette: quelle già divise restano dove sono.
            </p>
          </div>
        )}
        <Banner tono="errore">{errore}</Banner>

        {utenza && !conferma && (
          <button onClick={() => setConferma(true)} className="w-full mt-2 px-4 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-700">
            Elimina questa utenza
          </button>
        )}
        {utenza && conferma && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-sm text-red-800">
              Tolgo <span className="font-mono font-semibold">{utenza.codice}</span> dall&apos;elenco. Le bollette già arrivate
              restano sulla loro struttura; se ne arriveranno altre con questo codice, finiranno in &quot;Da collegare&quot;.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setConferma(false)} className="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700">
                No, tienila
              </button>
              <button onClick={elimina} disabled={salvo} className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50">
                {salvo ? 'Elimino…' : 'Sì, elimina'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modale>
  )
}
