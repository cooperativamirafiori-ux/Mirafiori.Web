'use client'

/** La conferma dell'esito: accettato (Andrea riceve il definitivo) o rifiutato. */

import { useState } from 'react'
import { Campo } from '@/components/ui/Campo'
import { Modale } from '@/components/ui/Modale'
import { oggiIso } from '@/lib/preventivi/calcoli'

export function ModaleEsito({
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
            Se l’ente ha cambiato qualcosa (ore, prestazioni) non confermare: chiudi, usa «Riapri per correggere», correggi e riemetti.
            Andrea deve ricevere quello che è stato davvero riconosciuto.
          </p>
        )}
      </div>
    </Modale>
  )
}
