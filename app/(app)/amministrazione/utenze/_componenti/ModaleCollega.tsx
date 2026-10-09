'use client'

import { useState } from 'react'
import { Modale } from '@/components/ui/Modale'
import { Campo } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import { ETICHETTA_TIPO, type DaCollegare, type StrutturaCc, type UtenzaConUltima } from '@/types/utenze'
import { euro } from '../../costi-strutture/_componenti/formato'

/**
 * Un codice arrivato in fattura diventa un'utenza: o completa una riga
 * segnaposto dell'elenco (es. "POD-B05"), o ne apre una nuova.
 */
export function ModaleCollega({
  voce,
  strutture,
  segnaposti,
  nomeStruttura,
  onChiudi,
  onFatto,
}: {
  voce: DaCollegare
  strutture: StrutturaCc[]
  segnaposti: UtenzaConUltima[]
  nomeStruttura: Map<number, string>
  onChiudi: () => void
  onFatto: (messaggio: string) => void
}) {
  const [modo, setModo] = useState<'segnaposto' | 'nuova'>(segnaposti.length ? 'segnaposto' : 'nuova')
  const [segnapostoId, setSegnapostoId] = useState('')
  const [strutturaId, setStrutturaId] = useState('')
  const [percentuale, setPercentuale] = useState('100')
  const [errore, setErrore] = useState('')
  const [salvo, setSalvo] = useState(false)
  const tipo = voce.tipo === 'altro' ? 'luce' : voce.tipo

  async function salva() {
    setSalvo(true)
    setErrore('')
    try {
      const corpo =
        modo === 'segnaposto'
          ? { codice: voce.codice, segnapostoId: Number(segnapostoId) }
          : { codice: voce.codice, tipo, strutturaId: Number(strutturaId), percentuale, fornitore: voce.fornitore }
      const r = await fetch('/api/utenze/collega', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Errore')
      onFatto(`${voce.codice} collegato: ${j.collegate} bollette sistemate.`)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
      setSalvo(false)
    }
  }

  const scelta = (v: typeof modo, testo: string) => (
    <button
      onClick={() => setModo(v)}
      className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold ${modo === v ? 'border-brand-cyan bg-cyan-50 text-cyan-900' : 'border-gray-300 text-gray-600'}`}
    >
      {testo}
    </button>
  )

  return (
    <Modale
      titolo={`Collega ${voce.codice}`}
      sottotitolo={`${ETICHETTA_TIPO[voce.tipo]} · ${voce.fornitore} · ${voce.bollette} bollette · ${euro(voce.importo, 2)}`}
      onChiudi={onChiudi}
      azioni={
        <>
          <button onClick={onChiudi} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700">
            Annulla
          </button>
          <button onClick={salva} disabled={salvo} className="flex-1 px-4 py-2.5 rounded-xl bg-brand-cyan text-white text-sm font-semibold disabled:opacity-50">
            {salvo ? 'Collego…' : 'Collega'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {segnaposti.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {scelta('segnaposto', 'Completa una riga esistente')}
            {scelta('nuova', 'Nuova utenza')}
          </div>
        )}
        {modo === 'segnaposto' ? (
          <Campo
            etichetta="Riga da completare"
            tipo="choice"
            valore={segnapostoId}
            onChange={setSegnapostoId}
            scelte={segnaposti.map((s) => ({ valore: String(s.id), etichetta: `${s.codice} · ${nomeStruttura.get(s.strutturaId ?? 0) ?? ''}` }))}
            aiuto="La riga prende il codice vero e tiene struttura e percentuale."
          />
        ) : (
          <>
            <Campo
              etichetta="Struttura"
              tipo="choice"
              valore={strutturaId}
              onChange={setStrutturaId}
              scelte={strutture.map((s) => ({ valore: String(s.id), etichetta: `${s.codice} · ${s.nome}` }))}
            />
            <Campo etichetta="Percentuale" tipo="number" valore={percentuale} onChange={setPercentuale} min={1} max={100} aiuto="Se il contatore è diviso fra più strutture, aggiungi poi le altre righe dall'elenco." />
          </>
        )}
        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}
