'use client'

import { useState } from 'react'
import { Modale } from '@/components/ui/Modale'
import { Campo, inputCls, labelCls } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import type { Fornitore } from '@/types/fornitori'

/** Mascherina di inserimento e modifica di un fornitore. */
export function ModaleFornitore({
  fornitore,
  specializzazioni,
  specializzazioneLibera,
  onChiudi,
  onFatto,
}: {
  fornitore: Fornitore | null
  specializzazioni: string[]
  /** true = colonna di testo libero su SP: si può scrivere un valore nuovo. */
  specializzazioneLibera: boolean
  onChiudi: () => void
  onFatto: (t: string) => void
}) {
  const [nome, setNome] = useState(fornitore?.nome ?? '')
  const [ditta, setDitta] = useState(fornitore?.ditta ?? '')
  const [specializzazione, setSpecializzazione] = useState(fornitore?.specializzazione ?? '')
  const [telefono, setTelefono] = useState(fornitore?.telefono ?? '')
  const [email, setEmail] = useState(fornitore?.email ?? '')
  const [partitaIva, setPartitaIva] = useState(fornitore?.partitaIva ?? '')
  const [pec, setPec] = useState(fornitore?.pec ?? '')
  const [indirizzo, setIndirizzo] = useState(fornitore?.indirizzo ?? '')
  const [note, setNote] = useState(fornitore?.note ?? '')
  const [errore, setErrore] = useState('')
  const [salvo, setSalvo] = useState(false)

  // Un valore vecchio che non è più fra le scelte resta visibile e selezionato.
  const scelte =
    specializzazione && !specializzazioni.includes(specializzazione)
      ? [specializzazione, ...specializzazioni]
      : specializzazioni

  async function salva() {
    if (!nome.trim()) {
      setErrore('Il nome è obbligatorio')
      return
    }
    setSalvo(true)
    setErrore('')
    try {
      const r = await fetch(fornitore ? `/api/fornitori/${fornitore.id}` : '/api/fornitori', {
        method: fornitore ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, ditta, specializzazione, telefono, email, partitaIva, pec, indirizzo, note }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'Errore')
      onFatto(fornitore ? `"${nome.trim()}" aggiornato.` : `"${nome.trim()}" aggiunto all'anagrafica.`)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
      setSalvo(false)
    }
  }

  return (
    <Modale
      titolo={fornitore ? fornitore.nome : 'Nuovo fornitore'}
      sottotitolo={fornitore?.ditta && fornitore.ditta !== fornitore.nome ? fornitore.ditta : undefined}
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
        <Campo
          etichetta="Nome"
          valore={nome}
          onChange={setNome}
          obbligatorio
          segnaposto="Mario Rossi, Idraulica Rossi…"
          aiuto="È il nome che compare quando si assegna una richiesta."
        />
        <Campo etichetta="Ditta / ragione sociale" valore={ditta} onChange={setDitta} />

        {specializzazioneLibera ? (
          <div>
            <label className={labelCls}>Specializzazione</label>
            <input
              list="specializzazioni-fornitori"
              value={specializzazione}
              onChange={(e) => setSpecializzazione(e.target.value)}
              placeholder="Idraulico, elettricista…"
              className={`${inputCls} text-base sm:text-sm`}
            />
            <datalist id="specializzazioni-fornitori">
              {specializzazioni.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        ) : (
          <Campo etichetta="Specializzazione" tipo="choice" valore={specializzazione} onChange={setSpecializzazione} scelte={scelte} />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo etichetta="Telefono" tipo="tel" valore={telefono} onChange={setTelefono} inputMode="tel" />
          <Campo etichetta="Email" tipo="email" valore={email} onChange={setEmail} inputMode="email" />
          <Campo etichetta="Partita IVA" valore={partitaIva} onChange={setPartitaIva} maiuscolo maxLength={16} />
          <Campo etichetta="PEC" tipo="email" valore={pec} onChange={setPec} inputMode="email" />
        </div>
        <Campo etichetta="Indirizzo" valore={indirizzo} onChange={setIndirizzo} />
        <Campo etichetta="Note" tipo="textarea" valore={note} onChange={setNote} righe={2} />

        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}
