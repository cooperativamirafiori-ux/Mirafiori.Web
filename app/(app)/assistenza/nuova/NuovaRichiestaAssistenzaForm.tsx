'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Allegato } from '@/components/ui/Allegato'
import { Banner } from '@/components/ui/Banner'
import { Campo } from '@/components/ui/Campo'
import { caricaDirettamente } from '@/lib/core/upload-diretto'
import { CATEGORIE, IMPATTI, TIPOLOGIE, prioritaProposta } from '@/types/assistenza'
import type { Impatto } from '@/types/assistenza'

interface Dispositivo {
  id: number
  etichetta: string
  centroCostoId?: number
}

/**
 * Il form della richiesta di assistenza.
 *
 * Chiede solo quello che il richiedente sa davvero: cosa non funziona, su cosa,
 * da quando, se è bloccato e quante persone tocca. **La priorità non gliela si
 * chiede** — la calcola l'app e la decide poi l'IT: se la sceglie chi apre il
 * ticket diventa "Critica" ogni volta, e una coda dove tutto è critico non ha
 * più priorità. Qui sotto la si mostra soltanto, così è chiaro cosa comporta
 * spuntare "non riesco a lavorare".
 */
export function NuovaRichiestaAssistenzaForm({
  dispositivi,
  strutture,
  allegatiAttivi,
}: {
  dispositivi: Dispositivo[]
  strutture: { id: number; label: string }[]
  allegatiAttivi: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [avanzamento, setAvanzamento] = useState<number | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviata, setInviata] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const [form, setForm] = useState({
    tipologia: '' as string,
    categoria: '' as string,
    beneId: '',
    dispositivoAltro: '',
    problema: '',
    daQuando: '',
    impatto: 'Un utente' as Impatto,
    strutturaId: '',
    recapito: '',
    disponibilita: '',
  })
  const [bloccante, setBloccante] = useState(false)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const priorita = prioritaProposta(form.impatto, bloccante)

  async function invia(e: React.FormEvent) {
    e.preventDefault()
    setErrore(null)

    if (!form.tipologia || !form.categoria || !form.problema.trim()) {
      setErrore('Compila tipologia, di cosa si tratta e la descrizione del problema.')
      return
    }
    if (form.problema.trim().length < 10) {
      setErrore('Descrivi il problema in una frase: due parole non bastano a chi deve risolverlo.')
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/assistenza', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipologia: form.tipologia,
          categoria: form.categoria,
          beneId: Number(form.beneId) || undefined,
          dispositivoAltro: form.dispositivoAltro.trim() || undefined,
          problema: form.problema.trim(),
          daQuando: form.daQuando || undefined,
          bloccante,
          impatto: form.impatto,
          strutturaId: Number(form.strutturaId) || undefined,
          recapito: form.recapito.trim() || undefined,
          disponibilita: form.disponibilita.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore durante l’invio')

      // L'allegato si carica dopo: il nome del file porta il codice del ticket,
      // che prima dell'invio non esiste ancora.
      if (file && allegatiAttivi) {
        try {
          setAvanzamento(0)
          await caricaDirettamente({
            file,
            urlSessione: `/api/assistenza/${data.spItemId}/allegato`,
            urlConferma: `/api/assistenza/${data.spItemId}/allegato`,
            metodoConferma: 'PUT',
            onAvanzamento: setAvanzamento,
          })
        } catch (e: any) {
          // La richiesta è partita: un allegato mancato non la annulla, si dice
          // e basta — l'IT può sempre chiedere la foto per mail.
          setErrore(`Richiesta inviata, ma l’allegato non è stato caricato: ${e.message}`)
        } finally {
          setAvanzamento(null)
        }
      }

      setInviata(data.codice)
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (inviata) {
    return (
      <div className="bg-white rounded-2xl shadow p-6 text-center space-y-4">
        <div className="text-4xl">✅</div>
        <div>
          <p className="font-semibold text-gray-800">Richiesta inviata</p>
          <p className="text-sm text-gray-500 mt-1">
            Il codice è <strong className="font-mono">{inviata}</strong>. Ti scriviamo appena
            qualcuno la prende in carico, e quando è risolta.
          </p>
        </div>
        {errore && <Banner tono="errore">{errore}</Banner>}
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => router.push('/assistenza/mie')}
            className="w-full bg-brand-cyan text-white py-2.5 rounded-lg text-sm font-semibold hover:opacity-90"
          >
            Vedi le mie richieste
          </button>
          <button
            onClick={() => router.push('/assistenza')}
            className="w-full border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50"
          >
            Torna ad Assistenza IT
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={invia} className="bg-white rounded-2xl shadow p-6 space-y-5">
      <Banner tono="errore">{errore}</Banner>

      <Campo
        etichetta="Che tipo di richiesta è"
        tipo="choice"
        scelte={TIPOLOGIE}
        valore={form.tipologia}
        onChange={(v) => set('tipologia', v)}
        obbligatorio
      />

      <Campo
        etichetta="Di cosa si tratta"
        tipo="choice"
        scelte={CATEGORIE}
        valore={form.categoria}
        onChange={(v) => set('categoria', v)}
        obbligatorio
      />

      {dispositivi.length > 0 && (
        <Campo
          etichetta="Quale dispositivo"
          tipo="choice"
          scelte={dispositivi.map((d) => ({ valore: String(d.id), etichetta: d.etichetta }))}
          valore={form.beneId}
          onChange={(v) => set('beneId', v)}
          vuoto="— non è uno di questi —"
          aiuto="Sono i dispositivi che risultano assegnati a te."
        />
      )}

      {!form.beneId && (
        <Campo
          etichetta="Dispositivo"
          valore={form.dispositivoAltro}
          onChange={(v) => set('dispositivoAltro', v)}
          segnaposto="Es. stampante della sala insegnanti"
          aiuto={
            dispositivi.length
              ? 'Compila solo se non è uno dei tuoi.'
              : 'Scrivi qual è, se il problema riguarda un apparecchio preciso.'
          }
        />
      )}

      <Campo
        etichetta="Cosa succede"
        tipo="textarea"
        righe={4}
        valore={form.problema}
        onChange={(v) => set('problema', v)}
        obbligatorio
        segnaposto="Es. all’accensione compare la scritta “disco non trovato” e si spegne dopo pochi secondi. Ho già provato a riavviare."
        aiuto="Il messaggio d’errore esatto e cosa hai già provato fanno risparmiare un giro di telefonate."
      />

      <Campo
        etichetta="Da quando"
        tipo="date"
        valore={form.daQuando}
        onChange={(v) => set('daQuando', v)}
        aiuto="Facoltativo, ma aiuta: spesso il guasto segue un aggiornamento o un temporale."
      />

      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={bloccante}
            onChange={(e) => setBloccante(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-brand-cyan"
          />
          <span className="text-sm text-gray-700">
            <strong>Non riesco a lavorare</strong> finché non è risolto
          </span>
        </label>

        <Campo
          etichetta="Chi tocca"
          tipo="choice"
          scelte={IMPATTI}
          valore={form.impatto}
          onChange={(v) => set('impatto', v as Impatto)}
          senzaVuoto
        />

        <p className="text-xs text-gray-500">
          Con queste risposte la richiesta parte con priorità{' '}
          <strong className="text-gray-700">{priorita.toLowerCase()}</strong>. La conferma — o la
          cambia — chi la prende in carico.
        </p>
      </div>

      {strutture.length > 0 && (
        <Campo
          etichetta="Dove ti trovi"
          tipo="choice"
          scelte={strutture.map((s) => ({ valore: String(s.id), etichetta: s.label }))}
          valore={form.strutturaId}
          onChange={(v) => set('strutturaId', v)}
          aiuto="Serve per gli interventi che vanno fatti di persona."
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo
          etichetta="Telefono"
          tipo="tel"
          valore={form.recapito}
          onChange={(v) => set('recapito', v)}
          segnaposto="Interno o cellulare"
        />
        <Campo
          etichetta="Quando ti trovo"
          valore={form.disponibilita}
          onChange={(v) => set('disponibilita', v)}
          segnaposto="Es. mattine, o dopo le 14"
        />
      </div>

      {allegatiAttivi && (
        <Allegato
          etichetta="Foto o schermata"
          file={file}
          onChange={setFile}
          aiuto="Facoltativo. Una schermata dell’errore vale tre mail di chiarimento."
        />
      )}

      {avanzamento !== null && (
        <p className="text-xs text-gray-500">Caricamento allegato… {avanzamento}%</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={() => router.push('/assistenza')}
          className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50"
        >
          ← Indietro
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex-1 bg-brand-cyan text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:opacity-90"
        >
          {busy ? 'Invio…' : 'Invia richiesta'}
        </button>
      </div>
    </form>
  )
}
