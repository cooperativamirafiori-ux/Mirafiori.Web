'use client'

/**
 * Form di richiesta fattura.
 *
 * Tre cose meritano una nota, perché non si capiscono leggendo il JSX:
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
 *
 * 3. **La ricerca cliente sta in `_componenti/RicercaCliente`**, che lavora in
 *    locale sull'indice arrivato col caricamento della pagina. Qui si vede solo
 *    cosa succede quando un cliente viene scelto: i campi si compilano e si
 *    tiene da parte com'erano in archivio, per poter dire cosa è stato corretto.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Campo, inputCls, labelCls } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import { RicercaCliente } from './_componenti/RicercaCliente'
import { CosaFatturare } from './_componenti/CosaFatturare'
import {
  CAMPI_PER_TIPO,
  ETICHETTE_SOGGETTO,
  NAZIONALITA,
  TIPI_SOGGETTO,
  chiedeCondominio,
  pulisciCampiNascosti,
  richiestaVuota,
  validaRichiesta,
  type CampoSoggetto,
  type NuovaRichiestaFatturaInput,
} from '@/types/fatture'
import { NAZIONI, type Cliente, type ClienteIndice } from '@/types/clienti'

/** Campi che vanno scritti in maiuscolo: sono codici, non parole. */
const MAIUSCOLI: Partial<Record<CampoSoggetto, boolean>> = { codiceFiscale: true }

/** I campi dell'anagrafica: se cambiano dopo aver scelto un cliente, la scheda si aggiorna. */
const CAMPI_ANAGRAFICI: ReadonlyArray<keyof NuovaRichiestaFatturaInput> = [
  'cognome', 'nome', 'ragioneSociale', 'partitaIva', 'codiceFiscale',
  'indirizzo', 'cap', 'citta', 'provincia', 'nazione',
  'telefono', 'email', 'pec', 'codiceSdi',
]

export function RichiestaFatturaForm({
  centriDiCosto,
  clienti,
  richiedente,
  richiedenteNome,
}: {
  centriDiCosto: string[]
  clienti: ClienteIndice[]
  richiedente: string
  richiedenteNome: string
}) {
  const router = useRouter()
  const [form, setForm] = useState<NuovaRichiestaFatturaInput>(richiestaVuota())
  const [errori, setErrori] = useState<Record<string, string>>({})
  const [errore, setErrore] = useState('')
  const [fatto, setFatto] = useState('')
  const [invio, setInvio] = useState(false)

  /** Il cliente scelto e i suoi dati come stavano in archivio, per dire cosa è cambiato. */
  const [scelto, setScelto] = useState<{ nome: string; base: Record<string, string> } | null>(null)
  /** Cambiando questo numero la casella di ricerca si rimonta, e quindi si svuota. */
  const [generazione, setGenerazione] = useState(0)

  const set = <K extends keyof NuovaRichiestaFatturaInput>(
    k: K,
    v: NuovaRichiestaFatturaInput[K],
  ) => {
    setForm((f) => ({ ...f, [k]: v }))
    // L'errore di un campo sparisce appena lo si corregge: lasciarlo acceso
    // mentre si scrive fa sembrare rotto un campo che ormai è a posto.
    setErrori((e) => (e[k as string] ? { ...e, [k as string]: '' } : e))
  }

  /** La nazionalità segue la nazione: sono due campi, ma non possono contraddirsi. */
  const cambiaNazione = (codice: string) =>
    setForm((f) => ({
      ...f,
      nazione: codice,
      nazionalita: codice === 'IT' ? 'Italiana' : 'Estera',
    }))

  const tipo = form.tipoSoggetto
  const campiSoggetto = useMemo(() => (tipo ? CAMPI_PER_TIPO[tipo] : []), [tipo])
  const italiano = form.nazionalita === 'Italiana'

  /** Campi dell'anagrafica toccati a mano dopo aver scelto un cliente. */
  const modificati = useMemo(() => {
    if (!scelto) return []
    return CAMPI_ANAGRAFICI.filter((k) => String(form[k] ?? '') !== String(scelto.base[k] ?? ''))
  }, [form, scelto])

  /** Cliente scelto in archivio: si compilano i campi e si ricorda com'erano. */
  function compilaDa(cl: Cliente) {
    setErrore('')
    // Solo i campi dell'anagrafica: centro di costo, importo, descrizione e
    // data restano quelli che l'utente ha già scritto.
    const dati: Record<string, string> = {
      cognome: cl.cognome,
      nome: cl.nome,
      // Per un privato la denominazione in archivio è "COGNOME NOME": non è
      // una ragione sociale, e il modulo non la chiede.
      ragioneSociale: cl.tipoSoggetto === 'Privato' ? '' : cl.denominazione,
      partitaIva: cl.partitaIva,
      codiceFiscale: cl.codiceFiscale,
      indirizzo: cl.indirizzo,
      cap: cl.cap,
      citta: cl.comune,
      provincia: cl.provincia,
      nazione: cl.nazione || 'IT',
      telefono: cl.telefono || cl.cellulare,
      email: cl.email,
      pec: cl.pec,
      codiceSdi: cl.codiceSdi,
    }

    setForm((f) => ({
      ...f,
      ...dati,
      clienteId: cl.spItemId,
      tipoSoggetto: cl.tipoSoggetto || f.tipoSoggetto,
      nazionalita: (cl.nazione || 'IT') === 'IT' ? 'Italiana' : 'Estera',
    }))
    setScelto({ nome: cl.denominazione, base: dati })
    setErrori({})
  }

  /** Stacca il cliente scelto lasciando i dati: serve per "come lui, ma è un altro". */
  function scollega() {
    setScelto(null)
    set('clienteId', '')
  }

  function azzera() {
    setForm(richiestaVuota())
    setScelto(null)
    setErrori({})
    setGenerazione((n) => n + 1)
  }

  async function invia(e: React.FormEvent) {
    e.preventDefault()
    setErrore('')
    setFatto('')

    // Prima si buttano i valori dei campi che non sono più chiesti (un campo che
    // scompare dallo schermo non si svuota da sé), poi si valida quello che
    // parte davvero. Vedi § pulisciCampiNascosti.
    const dati = pulisciCampiNascosti(form)
    const trovati = validaRichiesta(dati)
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
        body: JSON.stringify(dati),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.errori) setErrori(data.errori)
        throw new Error(data.error ?? 'Errore invio')
      }
      const anagrafica =
        data.cliente?.esito === 'creato'
          ? ' Il cliente è stato aggiunto all’anagrafica.'
          : data.cliente?.cambiati
            ? ' La scheda del cliente è stata aggiornata.'
            : ''
      azzera()
      setFatto(
        `Richiesta ${data.numero} inviata. Il riepilogo è partito a chi emette la fattura, con te in copia.${anagrafica}`,
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
        <CosaFatturare valori={form} errori={errori} set={set} />
      </Riquadro>

      {/* ---------- Chi va intestata ---------- */}
      <Riquadro
        titolo="A chi va intestata"
        nota="Cerca il cliente in archivio: se c'è, i dati si compilano da soli. Se è nuovo, verrà salvato."
      >
        <RicercaCliente
          key={generazione}
          clienti={clienti}
          scelto={scelto?.nome ?? null}
          modificati={modificati.length}
          mostraStato={Boolean(form.tipoSoggetto)}
          onScegli={compilaDa}
          onScollega={scollega}
          onErrore={setErrore}
        />

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
            aiuto="Si imposta da sé in base alla nazione"
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
            tipo="choice"
            scelte={NAZIONI}
            valore={form.nazione}
            onChange={cambiaNazione}
            obbligatorio
            errore={errori.nazione}
            vuoto="— Scegli —"
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
          etichetta="Codice destinatario (SDI)"
          valore={form.codiceSdi}
          onChange={(v) => set('codiceSdi', v)}
          errore={errori.codiceSdi}
          maiuscolo
          maxLength={7}
          aiuto="Facoltativo — 7 caratteri, 6 per la pubblica amministrazione"
        />
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
