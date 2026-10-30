'use client'

import { useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Campo } from '@/components/ui/Campo'

/**
 * "Invia estratto settimanale": manda subito l'Excel della settimana
 * precedente agli indirizzi scritti qui. Lo stesso che il lunedì mattina
 * arriva da solo ad Alessandro (lib/qonto/estratto.ts).
 */
export function InviaEstratto({ emailIniziale }: { emailIniziale: string }) {
  const [email, setEmail] = useState(emailIniziale)
  const [occupato, setOccupato] = useState(false)
  const [esito, setEsito] = useState('')
  const [errore, setErrore] = useState('')

  async function invia() {
    setEsito('')
    setErrore('')
    setOccupato(true)
    try {
      const res = await fetch('/api/qonto/estratto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Invio non riuscito')
      const g = (s: string) => s.split('-').reverse().join('/')
      setEsito(
        `Inviato a ${j.destinatari.join(', ')}: settimana dal ${g(j.dal)} al ${g(j.al)}, ${j.conti} conti, ${j.movimenti} movimenti.`,
      )
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setOccupato(false)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div>
        <h2 className="font-bold text-gray-800">Estratto conti settimanale</h2>
        <p className="text-sm text-gray-500">
          Excel con i movimenti della settimana precedente (lunedì–domenica) di tutti i conti. Arriva da solo ad
          Alessandro ogni lunedì; da qui lo mandi quando vuoi a chi vuoi.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
        <div className="flex-1">
          <Campo
            etichetta="Mandalo a"
            tipo="email"
            inputMode="email"
            valore={email}
            onChange={setEmail}
            aiuto="Più indirizzi separati da virgola"
          />
        </div>
        <button
          type="button"
          onClick={invia}
          disabled={occupato || !email.trim()}
          className="rounded-xl bg-brand-cyan text-white font-bold px-5 py-2.5 disabled:opacity-50 sm:mt-5"
        >
          {occupato ? 'Preparo e invio…' : 'Invia estratto settimanale'}
        </button>
      </div>
      <Banner tono="ok">{esito}</Banner>
      <Banner tono="errore">{errore}</Banner>
    </section>
  )
}
