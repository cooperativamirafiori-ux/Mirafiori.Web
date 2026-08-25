'use client'

/**
 * Il pannello con cui si assegna un dispositivo o una SIM, e con cui si corregge
 * un'assegnazione già scritta.
 *
 * Due cose che vengono dal modello e si vedono qui:
 *   · **la persona si scegli, non si scrive**: l'elenco è la rubrica degli
 *     account (`lib/core/rubrica.ts`), così non si battono email a mano;
 *   · **"in condivisione" è una scelta legittima**, non un campo lasciato vuoto
 *     per pigrizia: il NAS e le stampanti stanno in un servizio. Il centro di
 *     costo invece è obbligatorio, ed è il motivo per cui è il primo campo.
 */

import { useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Modale } from '@/components/ui/Modale'
import { Campo, inputCls, labelCls } from '@/components/ui/Campo'
import type { VoceRubrica } from '@/lib/core/rubrica'
import type { Assegnazione, CentroDiCostoVoce, GenereAssegnazione } from '@/types/it'
import { assegna, correggiAssegnazione, type DatiAssegnazione } from './azioni'

const CONDIVISO = '__condiviso__'
const oggi = () => new Date().toISOString().slice(0, 10)

export function ModaleAssegna({
  genere,
  oggettoId,
  etichetta,
  precedente,
  centriDiCosto,
  rubrica,
  onFatto,
  onChiudi,
}: {
  genere: GenereAssegnazione
  oggettoId: number
  /** Come si chiama la cosa che si sta assegnando, es. "INV-0012". */
  etichetta: string
  /** Se c'è, si sta correggendo questa; altrimenti si assegna da zero. */
  precedente?: Assegnazione
  centriDiCosto: CentroDiCostoVoce[]
  rubrica: VoceRubrica[]
  onFatto: (a: Assegnazione) => void
  onChiudi: () => void
}) {
  const correzione = Boolean(precedente)
  // Su una riga già scritta senza persona, "in condivisione" è una scelta fatta:
  // si mostra come tale, non come campo da riempire.
  const [mail, setMail] = useState(
    precedente ? precedente.assegnatarioMail ?? CONDIVISO : '',
  )
  const [centro, setCentro] = useState(String(precedente?.centroDiCosto?.id ?? ''))
  const [utenza, setUtenza] = useState(precedente?.nomeUtenza ?? '')
  const [data, setData] = useState(precedente?.dataAssegnazione?.slice(0, 10) ?? oggi())
  const [note, setNote] = useState(precedente?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const scelte = [
    { valore: CONDIVISO, etichetta: 'In condivisione — nessuna persona' },
    ...rubrica.map((v) => ({ valore: v.email, etichetta: `${v.nome} · ${v.email}` })),
  ]

  async function conferma() {
    if (!centro) {
      setErrore('Scegli il centro di costo: senza, l’assegnazione non dice a chi imputare il costo.')
      return
    }
    // "In condivisione" va scelto, non lasciato per distrazione: il campo vuoto e
    // il bene condiviso sono due cose diverse e vanno dette diversamente.
    if (!mail) {
      setErrore('Dimmi chi lo usa, oppure scegli “in condivisione” se non è di nessuno.')
      return
    }
    setBusy(true)
    setErrore(null)
    try {
      const persona = mail && mail !== CONDIVISO ? rubrica.find((v) => v.email === mail) : undefined
      const comuni = {
        assegnatarioMail: persona?.email,
        assegnatarioNome: persona?.nome,
        centroDiCostoId: Number(centro),
        nomeUtenza: utenza.trim(),
        note: note.trim(),
      }
      const a = correzione
        ? await correggiAssegnazione(genere, precedente!.spItemId, {
            ...comuni,
            assegnatarioMail: comuni.assegnatarioMail ?? '',
            assegnatarioNome: comuni.assegnatarioNome ?? '',
            dataAssegnazione: data,
          })
        : await assegna(genere, { ...comuni, oggettoId, dataAssegnazione: data } as DatiAssegnazione)
      onFatto(a)
      onChiudi()
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modale
      titolo={correzione ? 'Correggi l’assegnazione' : `Assegna ${etichetta}`}
      sottotitolo={
        correzione
          ? 'Per chiudere l’assegnazione usa "Restituito": è quello che aggiorna anche il bene.'
          : undefined
      }
      onChiudi={onChiudi}
      azioni={
        <>
          <button
            onClick={onChiudi}
            className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm font-semibold"
          >
            Annulla
          </button>
          <button
            onClick={conferma}
            disabled={busy}
            className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
          >
            {busy ? 'Salvo…' : correzione ? 'Salva' : 'Assegna'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Campo
          etichetta="Centro di costo"
          obbligatorio
          tipo="choice"
          valore={centro}
          onChange={setCentro}
          scelte={centriDiCosto.map((c) => ({ valore: String(c.id), etichetta: `${c.area} · ${c.nome}` }))}
          aiuto="È la dimensione con cui il costo viene imputato: senza questo l’assegnazione non serve a niente."
        />

        <div>
          <label className={labelCls}>Chi lo usa</label>
          <select value={mail} onChange={(e) => setMail(e.target.value)} className={inputCls}>
            <option value="">— scegli —</option>
            {scelte.map((s) => (
              <option key={s.valore} value={s.valore}>
                {s.etichetta}
              </option>
            ))}
          </select>
          <span className="block text-xs text-gray-400 mt-1">
            NAS, stampanti e fax non sono di nessuno: scegli “in condivisione”.
          </span>
        </div>

        <Campo
          etichetta="Nome utenza"
          valore={utenza}
          onChange={setUtenza}
          segnaposto="NB-Rossi, PC-Ufficio2…"
          aiuto="Come si chiama la macchina o l’utenza sopra. Cambia quando cambia il possessore."
        />

        <Campo
          etichetta="Dalla data"
          tipo="date"
          valore={data}
          onChange={setData}
          obbligatorio
          aiuto={
            correzione
              ? 'Correggibile: le righe arrivate dalle vecchie liste hanno la data di impianto, non quella vera.'
              : undefined
          }
        />

        <Campo etichetta="Note" tipo="textarea" righe={2} valore={note} onChange={setNote} />

        {!correzione && (
          <p className="text-xs text-gray-500">
            L’assegnazione precedente, se c’è, viene chiusa da sé con questa data.
          </p>
        )}

        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}
