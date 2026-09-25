'use client'

/**
 * Il modulo che il cliente compila da solo dal QR della cassa.
 *
 * Una pagina sola, a sezioni, perché sta sul telefono del cliente e non deve
 * sembrare una pratica: chi sei, i tuoi dati, dove abiti, come ricevi la
 * fattura. Le regole su cosa è obbligatorio sono quelle della Richiesta Fattura
 * (types/nuovo-cliente.ts), i controlli e i bottoni sono gli stessi.
 *
 * Se partita IVA o codice fiscale sono già in elenco, il server risponde
 * `esiste` senza salvare: il modulo lo dice e chiede se aggiornare i dati.
 * Non mostra mai quelli vecchi — la pagina è pubblica.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Campo } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import { BottoniScelta, Domanda, Link, Spunta } from '@/components/ui/Bottoni'
import { NAZIONI } from '@/types/clienti'
import { cercaComuni, trovaComune, type Comune } from '@/types/comuni'
import { CAMPI_PER_TIPO, chiedeCanaleSdi, codiceFiscaleValido, type TipoSoggetto } from '@/types/fatture'
import {
  CAMPI_NUOVO_CLIENTE,
  nuovoClienteVuoto,
  pulisciNuovoCliente,
  validaNuovoCliente,
  type NuovoClienteInput,
} from '@/types/nuovo-cliente'

type Chi = '' | 'persona' | 'azienda'
type Stato = 'modulo' | 'esiste' | 'fatto'

let elencoComuni: Promise<Comune[]> | null = null
function caricaComuni(): Promise<Comune[]> {
  if (!elencoComuni) {
    elencoComuni = fetch('/comuni.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => {
        elencoComuni = null
        return []
      })
  }
  return elencoComuni
}

export function NuovoClienteForm({ apertaIl }: { apertaIl: number }) {
  const [dati, setDati] = useState<NuovoClienteInput>(nuovoClienteVuoto)
  const [chi, setChi] = useState<Chi>('')
  const [errori, setErrori] = useState<Record<string, string>>({})
  const [errore, setErrore] = useState('')
  const [stato, setStato] = useState<Stato>('modulo')
  const [esito, setEsito] = useState<'creato' | 'aggiornato' | 'invariato'>('creato')
  const [invio, setInvio] = useState(false)
  const [sito, setSito] = useState('')
  const [comuni, setComuni] = useState<Comune[]>([])
  const [cercando, setCercando] = useState(false)
  const cima = useRef<HTMLDivElement>(null)

  const italia = dati.nazione === 'IT'
  const tipo = dati.tipoSoggetto
  const campi = tipo ? CAMPI_PER_TIPO[tipo] : []

  useEffect(() => {
    if (italia) caricaComuni().then(setComuni)
  }, [italia])

  // «Manca qualcosa» sparisce da sé quando l'ultimo campo rosso è stato sistemato.
  const restanoErrori = Object.values(errori).some(Boolean)
  useEffect(() => {
    if (!restanoErrori) setErrore((m) => (m.startsWith('Manca qualcosa') ? '' : m))
  }, [restanoErrori])

  const comune = useMemo(() => trovaComune(comuni, dati.citta), [comuni, dati.citta])
  const proposte = useMemo(
    () => (cercando && !comune ? cercaComuni(comuni, dati.citta) : []),
    [comuni, dati.citta, cercando, comune],
  )

  function set<K extends keyof NuovoClienteInput>(k: K, v: NuovoClienteInput[K]) {
    setDati((d) => ({ ...d, [k]: v }))
    setErrori((e) => (e[k as string] ? { ...e, [k as string]: '' } : e))
  }

  function scegliComune(c: Comune) {
    setDati((d) => ({ ...d, citta: c[0], provincia: c[1], cap: c[2].length === 1 ? c[2][0] : d.cap }))
    setErrori((e) => ({ ...e, citta: '', provincia: '', cap: '' }))
    setCercando(false)
  }

  function suCima() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => cima.current?.focus({ preventScroll: true }), 50)
  }

  function mostraErrori(e: Record<string, string>) {
    setErrori(e)
    setErrore('Manca qualcosa: guarda le parti in rosso.')
    const primo = CAMPI_NUOVO_CLIENTE.find((k) => e[k])
    const el = primo ? document.querySelector(`[data-campo="${primo}"]`) : null
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function invia(conferma: boolean) {
    setErrore('')
    const pulito = pulisciNuovoCliente(dati)
    const e = validaNuovoCliente(pulito)
    if (Object.keys(e).length) return mostraErrori(e)

    setInvio(true)
    try {
      const res = await fetch('/api/nuovo-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dati: pulito, conferma, t: apertaIl, sito }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (r.errori) return mostraErrori(r.errori)
        throw new Error(r.error ?? 'Invio non riuscito')
      }
      if (r.esito === 'esiste') {
        setStato('esiste')
      } else {
        setEsito(r.esito)
        setStato('fatto')
      }
      suCima()
    } catch (err: any) {
      setErrore(`${err.message}. Riprova fra poco: i dati restano qui.`)
    } finally {
      setInvio(false)
    }
  }

  // ---------- schermate finali ----------
  if (stato === 'fatto') {
    return (
      <div ref={cima} tabIndex={-1} className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm outline-none">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Grazie!</h1>
        <p className="text-lg text-gray-700">
          {esito === 'creato'
            ? 'I tuoi dati sono salvati.'
            : esito === 'aggiornato'
              ? 'I tuoi dati sono aggiornati.'
              : 'I tuoi dati erano già tutti giusti.'}{' '}
          Dillo pure alla cassa: da adesso ti trovano in elenco per la fattura.
        </p>
      </div>
    )
  }

  if (stato === 'esiste') {
    return (
      <div ref={cima} tabIndex={-1} className="space-y-5 rounded-2xl border-2 border-amber-200 bg-amber-50 p-6 outline-none">
        <h1 className="text-xl font-bold text-amber-900">Sei già nel nostro elenco</h1>
        <p className="text-base text-amber-900">
          Abbiamo già un cliente con {dati.partitaIva ? 'questa partita IVA o ' : ''}questo codice fiscale.
          Vuoi aggiornare i dati con quelli che hai appena scritto? I campi che hai lasciato vuoti restano
          come sono.
        </p>
        {errore && <Banner tono="errore">{errore}</Banner>}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={invio}
            onClick={() => invia(true)}
            className="min-h-[56px] rounded-2xl bg-primary px-5 text-lg font-semibold text-white disabled:opacity-60"
          >
            {invio ? 'Salvo…' : 'Sì, aggiorna i miei dati'}
          </button>
          <button
            type="button"
            disabled={invio}
            onClick={() => {
              setEsito('invariato')
              setStato('fatto')
            }}
            className="min-h-[56px] rounded-2xl border-2 border-amber-300 px-5 text-lg font-semibold text-amber-900"
          >
            No, lascia tutto com’è
          </button>
          <button
            type="button"
            onClick={() => setStato('modulo')}
            className="min-h-[44px] text-base font-medium text-amber-900 underline underline-offset-2"
          >
            Torna al modulo e ricontrolla
          </button>
        </div>
      </div>
    )
  }

  // ---------- modulo ----------
  const avvisoCf =
    italia && dati.codiceFiscale.replace(/\s/g, '').length === 16 && !codiceFiscaleValido(dati.codiceFiscale) && !errori.codiceFiscale
      ? 'Ricontrolla il codice fiscale: sembra esserci un errore di battitura.'
      : undefined

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        invia(false)
      }}
      className="space-y-5"
    >
      <div ref={cima} tabIndex={-1} className="space-y-2 outline-none">
        <h1 className="text-2xl font-bold text-gray-900">I tuoi dati per la fattura</h1>
        <p className="text-base text-gray-600">
          Scrivili una volta sola: la prossima volta alla cassa ti trovano già in elenco.
        </p>
      </div>

      {errore && <Banner tono="errore">{errore}</Banner>}

      {/* Campo trappola per i programmi automatici: una persona non lo vede. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Sito web
          <input type="text" tabIndex={-1} autoComplete="off" value={sito} onChange={(e) => setSito(e.target.value)} />
        </label>
      </div>

      <Sezione>
        <div data-campo="tipoSoggetto" className="space-y-6">
          <Domanda titolo="Chi sei?">
            <BottoniScelta
              opzioni={[
                { valore: 'persona', etichetta: 'Una persona' },
                { valore: 'azienda', etichetta: "Un'azienda o un ente", sotto: 'anche associazioni, scuole, condomini' },
              ]}
              valore={chi}
              onScegli={(v) => {
                setChi(v as Chi)
                set('tipoSoggetto', v === 'azienda' ? 'Soggetto diverso da persona fisica' : '')
              }}
              errore={chi ? undefined : errori.tipoSoggetto}
            />
          </Domanda>
          {chi === 'persona' && (
            <Domanda titolo="Hai la partita IVA?" spiegazione="Ce l'ha chi lavora in proprio: artigiani, professionisti, negozianti.">
              <BottoniScelta
                colonne={2}
                opzioni={[
                  { valore: 'Privato', etichetta: 'No' },
                  { valore: 'Persona fisica titolare di Partita IVA', etichetta: 'Sì' },
                ]}
                valore={tipo}
                onScegli={(v) => set('tipoSoggetto', v as TipoSoggetto)}
                errore={errori.tipoSoggetto ? 'Dicci se hai la partita IVA' : undefined}
              />
            </Domanda>
          )}
        </div>
      </Sezione>

      {tipo && (
        <>
          <Sezione titolo={tipo === 'Soggetto diverso da persona fisica' ? "L'azienda o l'ente" : 'I tuoi dati'}>
            <div className="space-y-5">
              {campi.includes('cognome') && (
                <div data-campo="cognome">
                  <Campo grande etichetta="Cognome" valore={dati.cognome} onChange={(v) => set('cognome', v)} errore={errori.cognome} />
                </div>
              )}
              {campi.includes('nome') && (
                <div data-campo="nome">
                  <Campo grande etichetta="Nome" valore={dati.nome} onChange={(v) => set('nome', v)} errore={errori.nome} />
                </div>
              )}
              {campi.includes('ragioneSociale') && (
                <div data-campo="ragioneSociale">
                  <Campo
                    grande
                    etichetta={tipo === 'Soggetto diverso da persona fisica' ? 'Nome dell’azienda o dell’ente' : 'Nome della tua attività (se ne ha uno)'}
                    valore={dati.ragioneSociale}
                    onChange={(v) => set('ragioneSociale', v)}
                    errore={errori.ragioneSociale}
                  />
                </div>
              )}
              {campi.includes('partitaIva') && (
                <div data-campo="partitaIva" className="space-y-2">
                  {!dati.senzaPartitaIva && (
                    <Campo
                      grande
                      etichetta="Partita IVA"
                      valore={dati.partitaIva}
                      onChange={(v) => set('partitaIva', v.replace(/\s/g, ''))}
                      errore={errori.partitaIva}
                      inputMode={italia ? 'numeric' : undefined}
                      maxLength={italia ? 11 : 20}
                    />
                  )}
                  {tipo === 'Soggetto diverso da persona fisica' && (
                    <Spunta
                      etichetta="Non ho la partita IVA"
                      valore={dati.senzaPartitaIva}
                      onChange={(v) => {
                        set('senzaPartitaIva', v)
                        if (v) set('partitaIva', '')
                      }}
                    />
                  )}
                  {dati.senzaPartitaIva && errori.partitaIva && (
                    <p className="text-sm font-medium text-red-600">{errori.partitaIva}</p>
                  )}
                </div>
              )}
              {campi.includes('codiceFiscale') && (
                <div data-campo="codiceFiscale" className="space-y-2">
                  <Campo
                    grande
                    etichetta="Codice fiscale"
                    valore={dati.codiceFiscale}
                    onChange={(v) => set('codiceFiscale', v.replace(/\s/g, ''))}
                    errore={errori.codiceFiscale || avvisoCf}
                    maiuscolo
                    maxLength={16}
                    aiuto={tipo === 'Soggetto diverso da persona fisica' ? 'Per le aziende spesso è uguale alla partita IVA.' : undefined}
                  />
                  {tipo === 'Soggetto diverso da persona fisica' && dati.partitaIva && !dati.codiceFiscale && (
                    <Link onClick={() => set('codiceFiscale', dati.partitaIva)}>È uguale alla partita IVA</Link>
                  )}
                </div>
              )}
            </div>
          </Sezione>

          <Sezione titolo={tipo === 'Soggetto diverso da persona fisica' ? 'La sede' : 'Dove abiti'}>
            <div className="space-y-5">
              <div data-campo="nazione" className="space-y-3">
                <BottoniScelta
                  colonne={2}
                  opzioni={[
                    { valore: 'si', etichetta: 'In Italia' },
                    { valore: 'no', etichetta: "All'estero" },
                  ]}
                  valore={italia ? 'si' : 'no'}
                  onScegli={(v) => set('nazione', v === 'si' ? 'IT' : '')}
                  errore={italia ? errori.nazione : undefined}
                />
                {!italia && (
                  <Campo
                    grande
                    etichetta="In quale paese?"
                    tipo="choice"
                    scelte={NAZIONI.filter((n) => n.valore !== 'IT')}
                    valore={dati.nazione}
                    onChange={(v) => set('nazione', v)}
                    vuoto="— Tocca per scegliere —"
                    errore={errori.nazione}
                  />
                )}
              </div>
              <div data-campo="indirizzo">
                <Campo grande etichetta="Via e numero" valore={dati.indirizzo} onChange={(v) => set('indirizzo', v)} errore={errori.indirizzo} segnaposto="Es. Via Roma 12" />
              </div>
              <div data-campo="citta" className="space-y-2">
                <Campo
                  grande
                  etichetta={italia ? 'Comune' : 'Città'}
                  valore={dati.citta}
                  onChange={(v) => {
                    set('citta', v)
                    setCercando(true)
                  }}
                  errore={errori.citta}
                  aiuto={italia ? 'Scrivi le prime lettere e tocca il tuo comune.' : undefined}
                />
                {proposte.length > 0 && (
                  <ul className="space-y-2">
                    {proposte.map((c) => (
                      <li key={`${c[0]}-${c[1]}`}>
                        <button
                          type="button"
                          onClick={() => scegliComune(c)}
                          className="min-h-[52px] w-full rounded-2xl border-2 border-gray-200 bg-white px-4 py-2 text-left text-base hover:border-gray-300"
                        >
                          <strong>{c[0]}</strong> <span className="text-gray-500">({c[1]})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div data-campo="cap">
                  <Campo
                    grande
                    etichetta={italia ? 'CAP' : 'CAP (se c’è)'}
                    valore={dati.cap}
                    onChange={(v) => set('cap', italia ? v.replace(/\D/g, '') : v)}
                    errore={errori.cap}
                    maxLength={italia ? 5 : 10}
                    inputMode={italia ? 'numeric' : undefined}
                  />
                </div>
                {italia && (
                  <div data-campo="provincia">
                    <Campo grande etichetta="Provincia" valore={dati.provincia} onChange={(v) => set('provincia', v)} errore={errori.provincia} maiuscolo maxLength={2} />
                  </div>
                )}
              </div>
            </div>
          </Sezione>

          <Sezione titolo="Come ricevi la fattura">
            <div className="space-y-5">
              {chiedeCanaleSdi({ tipoSoggetto: tipo, nazionalita: italia ? 'Italiana' : 'Estera' }) ? (
                <>
                  <p className="text-base text-gray-600">Serve almeno uno dei due: il codice destinatario oppure la PEC.</p>
                  <div data-campo="codiceSdi">
                    <Campo
                      grande
                      etichetta="Codice destinatario (SDI)"
                      valore={dati.codiceSdi}
                      onChange={(v) => set('codiceSdi', v.replace(/\s/g, ''))}
                      errore={errori.codiceSdi}
                      maiuscolo
                      maxLength={7}
                      aiuto="7 caratteri, te lo dà il commercialista o il tuo programma di fatture."
                    />
                  </div>
                  <div data-campo="pec">
                    <Campo grande tipo="email" etichetta="PEC" valore={dati.pec} onChange={(v) => set('pec', v.trim())} errore={errori.pec} />
                  </div>
                </>
              ) : (
                italia && (
                  <p className="text-base text-gray-600">
                    La fattura elettronica la trovi nel tuo cassetto fiscale sul sito dell’Agenzia delle Entrate.
                    Se vuoi, lasciaci anche la mail.
                  </p>
                )
              )}
              <div data-campo="email">
                <Campo grande tipo="email" etichetta="Email (facoltativa)" valore={dati.email} onChange={(v) => set('email', v.trim())} errore={errori.email} />
              </div>
              <div data-campo="telefono">
                <Campo grande tipo="tel" etichetta="Telefono (facoltativo)" valore={dati.telefono} onChange={(v) => set('telefono', v)} errore={errori.telefono} inputMode="tel" />
              </div>
            </div>
          </Sezione>

          <p className="px-1 text-sm text-gray-600">
            Usiamo questi dati solo per emettere le tue fatture, come chiede la legge.{' '}
            <a href="/privacy/clienti" target="_blank" className="font-medium text-primary underline underline-offset-2">
              Leggi l’informativa privacy
            </a>
            .
          </p>

          <button
            type="submit"
            disabled={invio}
            className="min-h-[56px] w-full rounded-2xl bg-primary px-5 text-lg font-semibold text-white disabled:opacity-60"
          >
            {invio ? 'Salvo…' : 'Salva i miei dati'}
          </button>
        </>
      )}
    </form>
  )
}

function Sezione({ titolo, children }: { titolo?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      {titolo && <h2 className="text-lg font-bold text-gray-800">{titolo}</h2>}
      {children}
    </section>
  )
}
