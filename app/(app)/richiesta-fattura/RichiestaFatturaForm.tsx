'use client'

/**
 * Form di richiesta fattura.
 *
 * Due cose meritano una nota, perché non si capiscono leggendo il JSX:
 *
 * 1. **Quali campi compaiono non è deciso qui.** La tipologia di soggetto
 *    pilota l'elenco `CAMPI_PER_TIPO` in `types/fatture.ts`, che è lo stesso
 *    che usa l'API per validare. Aggiungere un campo a una tipologia si fa là,
 *    una volta sola, e le due parti non possono divergere.
 *
 * 2. **Il centro di costo cambia forma da sé.** Finché la lista SharePoint dei
 *    centri di costo non esiste, `centriDiCosto` arriva vuoto e il campo è di
 *    testo libero; il giorno in cui la lista c'è diventa un menu a tendina
 *    senza toccare questo file.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Campo, inputCls, labelCls } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import {
  CAMPI_PER_TIPO,
  ETICHETTE_SOGGETTO,
  NAZIONALITA,
  TIPI_SOGGETTO,
  chiedeCondominio,
  richiestaVuota,
  validaRichiesta,
  type CampoSoggetto,
  type NuovaRichiestaFatturaInput,
} from '@/types/fatture'

/** Campi che vanno scritti in maiuscolo: sono codici, non parole. */
const MAIUSCOLI: Partial<Record<CampoSoggetto, boolean>> = { codiceFiscale: true }

export function RichiestaFatturaForm({
  centriDiCosto,
  richiedente,
  richiedenteNome,
}: {
  centriDiCosto: string[]
  richiedente: string
  richiedenteNome: string
}) {
  const router = useRouter()
  const [form, setForm] = useState<NuovaRichiestaFatturaInput>(richiestaVuota())
  const [errori, setErrori] = useState<Record<string, string>>({})
  const [errore, setErrore] = useState('')
  const [fatto, setFatto] = useState('')
  const [invio, setInvio] = useState(false)

  const set = <K extends keyof NuovaRichiestaFatturaInput>(
    k: K,
    v: NuovaRichiestaFatturaInput[K],
  ) => {
    setForm((f) => ({ ...f, [k]: v }))
    // L'errore di un campo sparisce appena lo si corregge: lasciarlo acceso
    // mentre si scrive fa sembrare rotto un campo che ormai è a posto.
    setErrori((e) => (e[k as string] ? { ...e, [k as string]: '' } : e))
  }

  const tipo = form.tipoSoggetto
  const campiSoggetto = useMemo(() => (tipo ? CAMPI_PER_TIPO[tipo] : []), [tipo])
  const italiano = form.nazionalita === 'Italiana'

  async function invia(e: React.FormEvent) {
    e.preventDefault()
    setErrore('')
    setFatto('')

    const trovati = validaRichiesta(form)
    if (Object.keys(trovati).length) {
      setErrori(trovati)
      setErrore('Controlla i campi segnati in rosso.')
      return
    }

    setInvio(true)
    try {
      const res = await fetch('/api/fatture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.errori) setErrori(data.errori)
        throw new Error(data.error ?? 'Errore invio')
      }
      setErrori({})
      setForm(richiestaVuota())
      setFatto(
        `Richiesta ${data.numero} inviata. Il riepilogo è partito a chi emette la fattura, con te in copia.`,
      )
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      setErrore(err.message)
    } finally {
      setInvio(false)
    }
  }

  return (
    <form onSubmit={invia} className="space-y-5">
      <Banner tono="ok">{fatto}</Banner>
      <Banner tono="errore">{errore}</Banner>

      {/* ---------- Chi chiede e per cosa ---------- */}
      <Riquadro
        titolo="Richiesta"
        nota="Il centro di costo serve a sapere a quale attività imputare la fattura."
      >
        {centriDiCosto.length > 0 ? (
          <Campo
            etichetta="Centro di costo"
            tipo="choice"
            scelte={centriDiCosto}
            valore={form.centroCosto}
            onChange={(v) => set('centroCosto', v)}
            obbligatorio
            errore={errori.centroCosto}
            vuoto="— Scegli —"
          />
        ) : (
          <Campo
            etichetta="Centro di costo"
            valore={form.centroCosto}
            onChange={(v) => set('centroCosto', v)}
            obbligatorio
            errore={errori.centroCosto}
            segnaposto="Es. Locanda"
            aiuto="Per ora si scrive a mano: l'elenco ufficiale dei centri di costo è in preparazione."
          />
        )}

        <div>
          <span className={labelCls}>Richiesta fatta da</span>
          <div className={`${inputCls} bg-gray-50 text-gray-500`}>
            {richiedenteNome ? `${richiedenteNome} — ${richiedente}` : richiedente}
          </div>
          <span className="block text-xs text-gray-400 mt-1">
            Preso dal tuo accesso: riceverai una copia della richiesta.
          </span>
        </div>
      </Riquadro>

      {/* ---------- Cosa fatturare ---------- */}
      <Riquadro titolo="Cosa va fatturato">
        <Campo
          etichetta="Descrizione"
          tipo="textarea"
          righe={2}
          valore={form.descrizione}
          onChange={(v) => set('descrizione', v)}
          obbligatorio
          errore={errori.descrizione}
          segnaposto="Es. Cena per 4 persone del 10/08"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo
            etichetta="Importo (€)"
            tipo="currency"
            min={0}
            valore={form.importo}
            onChange={(v) => set('importo', v)}
            obbligatorio
            errore={errori.importo}
            segnaposto="0,00"
          />
          <Campo
            etichetta="Data della prestazione"
            tipo="date"
            valore={form.dataPrestazione}
            onChange={(v) => set('dataPrestazione', v)}
            obbligatorio
            errore={errori.dataPrestazione}
          />
        </div>
      </Riquadro>

      {/* ---------- Chi va intestata ---------- */}
      <Riquadro
        titolo="A chi va intestata"
        nota="Scegli la tipologia: i campi da compilare cambiano di conseguenza."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo
            etichetta="Tipologia di soggetto"
            tipo="choice"
            scelte={TIPI_SOGGETTO}
            valore={form.tipoSoggetto}
            onChange={(v) => set('tipoSoggetto', v as NuovaRichiestaFatturaInput['tipoSoggetto'])}
            obbligatorio
            errore={errori.tipoSoggetto}
            vuoto="— Scegli —"
          />
          <Campo
            etichetta="Nazionalità"
            tipo="choice"
            scelte={NAZIONALITA}
            valore={form.nazionalita}
            onChange={(v) => set('nazionalita', v as NuovaRichiestaFatturaInput['nazionalita'])}
            obbligatorio
            errore={errori.nazionalita}
            vuoto="— Scegli —"
          />
        </div>

        {!tipo ? (
          <p className="text-sm text-gray-400">
            Scegli la tipologia per vedere i dati da compilare.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {campiSoggetto.map((c) => (
                <Campo
                  key={c}
                  etichetta={ETICHETTE_SOGGETTO[c]}
                  valore={form[c]}
                  onChange={(v) => set(c, v)}
                  obbligatorio
                  errore={errori[c]}
                  maiuscolo={MAIUSCOLI[c]}
                />
              ))}
            </div>

            {chiedeCondominio(tipo) && (
              /* Il kit non ha un campo booleano: ce n'è uno solo in tutta
                 l'app, farne un componente adesso sarebbe indovinare. */
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.condominio}
                  onChange={(e) => set('condominio', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-cyan focus:ring-brand-cyan"
                />
                Si tratta di un condominio
              </label>
            )}
          </>
        )}
      </Riquadro>

      {/* ---------- Recapiti ---------- */}
      <Riquadro titolo="Indirizzo e recapiti">
        <Campo
          etichetta="Indirizzo di residenza"
          valore={form.indirizzo}
          onChange={(v) => set('indirizzo', v)}
          obbligatorio
          errore={errori.indirizzo}
          segnaposto="Via e numero civico"
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Campo
            etichetta="CAP"
            valore={form.cap}
            onChange={(v) => set('cap', v)}
            obbligatorio={italiano}
            errore={errori.cap}
            maxLength={10}
          />
          <Campo
            etichetta="Città"
            valore={form.citta}
            onChange={(v) => set('citta', v)}
            obbligatorio
            errore={errori.citta}
          />
          <Campo
            etichetta="Provincia"
            valore={form.provincia}
            onChange={(v) => set('provincia', v)}
            obbligatorio={italiano}
            errore={errori.provincia}
            maiuscolo
            maxLength={4}
            segnaposto="TO"
          />
          <Campo
            etichetta="Nazione"
            valore={form.nazione}
            onChange={(v) => set('nazione', v)}
            obbligatorio
            errore={errori.nazione}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Campo
            etichetta="Telefono"
            tipo="tel"
            valore={form.telefono}
            onChange={(v) => set('telefono', v)}
            errore={errori.telefono}
          />
          <Campo
            etichetta="Email"
            tipo="email"
            valore={form.email}
            onChange={(v) => set('email', v)}
            obbligatorio
            errore={errori.email}
          />
          <Campo
            etichetta="PEC"
            tipo="email"
            valore={form.pec}
            onChange={(v) => set('pec', v)}
            errore={errori.pec}
            aiuto="Se il cliente ce l'ha"
          />
        </div>
        <Campo
          etichetta="Note per chi emette la fattura"
          tipo="textarea"
          righe={2}
          valore={form.note}
          onChange={(v) => set('note', v)}
          segnaposto="Facoltativo"
        />
      </Riquadro>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push('/home')}
          className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={invio}
          className="flex-1 bg-brand-cyan-dark text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 hover:opacity-90"
        >
          {invio ? 'Invio…' : 'Invia richiesta'}
        </button>
      </div>
    </form>
  )
}

function Riquadro({
  titolo,
  nota,
  children,
}: {
  titolo: string
  nota?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
      <div>
        <h2 className="font-bold text-gray-800">{titolo}</h2>
        {nota && <p className="text-sm text-gray-500 mt-0.5">{nota}</p>}
      </div>
      {children}
    </section>
  )
}
