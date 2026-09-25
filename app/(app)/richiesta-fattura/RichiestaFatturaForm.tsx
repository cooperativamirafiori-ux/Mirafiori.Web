'use client'

/**
 * Modulo di richiesta fattura, a passi.
 *
 * **Per chi è pensato.** Lo usano anche persone anziane o con qualche
 * difficoltà (decisione del 24 settembre 2026, «semplice per tutti»): una
 * domanda per schermata, bottoni grandi, parole di tutti i giorni, e il meno
 * possibile da scrivere — il servizio si ricorda, il giorno si tocca, CAP e
 * provincia arrivano dal comune, nome e sede di un'azienda dalla partita IVA.
 *
 * **Cosa NON è cambiato.** Quello che parte verso `/api/fatture` è la stessa
 * `NuovaRichiestaFatturaInput` di prima, pulita da `pulisciCampiNascosti` e
 * controllata da `validaRichiesta`, entrambe in types/fatture.ts e condivise
 * con l'API. Lista SharePoint, mail ad Andrea e anagrafica clienti non si sono
 * accorte di niente. I passi (`_componenti/passi.ts`) decidono solo *dove*
 * mostrare ogni errore.
 *
 * Questo file tiene lo stato e la navigazione; ogni passo sta in `_componenti/`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banner } from '@/components/ui/Banner'
import {
  pulisciCampiNascosti,
  richiestaVuota,
  validaRichiesta,
  type NuovaRichiestaFatturaInput,
  type TipoSoggetto,
} from '@/types/fatture'
import type { Cliente, ClienteIndice } from '@/types/clienti'
import {
  PASSI_CLIENTE,
  elencoPassi,
  erroriDelPasso,
  primoPassoConErrore,
  type Passo,
} from './_componenti/passi'
import { cancellaBozza, leggiBozza, salvaBozza, type Bozza } from './_componenti/bozza'
import { PassoServizio } from './_componenti/PassoServizio'
import { CosaFatturare } from './_componenti/CosaFatturare'
import { PassoQuando } from './_componenti/PassoQuando'
import { PassoCliente } from './_componenti/PassoCliente'
import { PassoDati } from './_componenti/PassoDati'
import { PassoIndirizzo } from './_componenti/PassoIndirizzo'
import { PassoRecapiti } from './_componenti/PassoRecapiti'
import { Riepilogo } from './_componenti/Riepilogo'

const NOMI: Record<Passo, string> = {
  servizio: 'Il servizio',
  cosa: 'Cosa',
  quando: 'Quando',
  cliente: 'Il cliente',
  dati: 'I dati del cliente',
  indirizzo: "L'indirizzo",
  recapiti: 'I contatti',
  riepilogo: 'Controlla e invia',
}

/** I campi del cliente: si svuotano quando si stacca un cliente preso dall'archivio. */
const CAMPI_CLIENTE = [
  'cognome', 'nome', 'ragioneSociale', 'partitaIva', 'codiceFiscale',
  'indirizzo', 'cap', 'citta', 'provincia', 'telefono', 'email', 'pec', 'codiceSdi',
] as const

/** Una bozza vale la pena di essere ripresa solo se c'è scritto qualcosa di vero. */
const haContenuto = (f: NuovaRichiestaFatturaInput) =>
  Boolean(f.importo || f.descrizione.trim() || f.tipoSoggetto || f.cognome || f.ragioneSociale)

/** Errori che non sono campi della richiesta ma risposte mancanti del modulo. */
function erroriDelModulo(pagatoRisposto: boolean): Record<string, string> {
  return pagatoRisposto ? {} : { incassato: 'Dicci se il cliente ha già pagato' }
}

export function RichiestaFatturaForm({
  centriDiCosto,
  centriRecenti,
  clienti,
  richiedente,
  richiedenteNome,
}: {
  centriDiCosto: string[]
  /** I servizi delle ultime richieste di chi compila: il primo diventa quello di partenza. */
  centriRecenti: string[]
  clienti: ClienteIndice[]
  richiedente: string
  richiedenteNome: string
}) {
  const router = useRouter()
  const partenza = (): NuovaRichiestaFatturaInput => ({
    ...richiestaVuota(),
    centroCosto: centriRecenti[0] ?? '',
  })

  const [form, setForm] = useState<NuovaRichiestaFatturaInput>(partenza)
  const [chiediServizio, setChiediServizio] = useState(!centriRecenti.length)
  const [passo, setPasso] = useState<Passo>(centriRecenti.length ? 'cosa' : 'servizio')
  const [daRiepilogo, setDaRiepilogo] = useState(false)
  const [pagatoRisposto, setPagatoRisposto] = useState(false)
  const [scelto, setScelto] = useState<{ nome: string } | null>(null)
  const [errori, setErrori] = useState<Record<string, string>>({})
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const [fatto, setFatto] = useState<{ numero: string; cliente: string } | null>(null)
  const [bozza, setBozza] = useState<Bozza | null>(null)
  const titolo = useRef<HTMLDivElement>(null)

  const passi = useMemo(() => elencoPassi(chiediServizio), [chiediServizio])

  // «Manca qualcosa» sparisce da sé quando l'ultimo campo rosso è stato sistemato.
  const restanoErrori = Object.values(errori).some(Boolean)
  useEffect(() => {
    if (!restanoErrori) setErrore((m) => (m.startsWith('Manca qualcosa') ? '' : m))
  }, [restanoErrori])
  const indice = Math.max(0, passi.indexOf(passo))

  // ---------- bozza ----------
  useEffect(() => {
    const b = leggiBozza(richiedente)
    if (b && haContenuto(b.form)) setBozza(b)
  }, [richiedente])

  useEffect(() => {
    // Finché c'è una bozza vecchia in attesa di risposta non la si sovrascrive.
    if (fatto || bozza || !haContenuto(form)) return
    salvaBozza(richiedente, { form, passo, scelto, pagatoRisposto, chiediServizio })
  }, [form, passo, scelto, pagatoRisposto, chiediServizio, fatto, bozza, richiedente])

  function riprendi(b: Bozza) {
    setForm({ ...richiestaVuota(), ...b.form })
    setChiediServizio(b.chiediServizio)
    setPagatoRisposto(b.pagatoRisposto)
    setScelto(b.scelto)
    setBozza(null)
    vaiA(b.passo)
  }

  // ---------- modifiche ----------
  const set = <K extends keyof NuovaRichiestaFatturaInput>(k: K, v: NuovaRichiestaFatturaInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    // L'errore di un campo sparisce appena lo si tocca: lasciarlo acceso mentre
    // si scrive fa sembrare sbagliato un campo che ormai è a posto.
    setErrori((e) => (e[k as string] ? { ...e, [k as string]: '' } : e))
  }
  const aggiorna = (parte: Partial<NuovaRichiestaFatturaInput>) => {
    setForm((f) => ({ ...f, ...parte }))
    setErrori((e) => {
      const n = { ...e }
      for (const k of Object.keys(parte)) delete n[k]
      return n
    })
  }

  function vaiA(p: Passo) {
    setPasso(p)
    setErrore('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Il fuoco torna in cima: chi usa il lettore di schermo sente il passo nuovo.
    setTimeout(() => titolo.current?.focus({ preventScroll: true }), 50)
  }

  /** Il cliente scelto dall'archivio: si compila tutto e si salta dove manca qualcosa. */
  function scegliCliente(cl: Cliente) {
    const nazione = cl.nazione || 'IT'
    const nuovo: NuovaRichiestaFatturaInput = {
      ...form,
      clienteId: cl.spItemId,
      tipoSoggetto: cl.tipoSoggetto || form.tipoSoggetto,
      cognome: cl.cognome,
      nome: cl.nome,
      // Per un privato la denominazione in archivio è "COGNOME NOME": non è una
      // ragione sociale, e il modulo non la chiede.
      ragioneSociale: cl.tipoSoggetto === 'Privato' ? '' : cl.denominazione,
      partitaIva: cl.partitaIva,
      senzaPartitaIva: false,
      codiceFiscale: cl.codiceFiscale,
      indirizzo: cl.indirizzo,
      cap: cl.cap,
      citta: cl.comune,
      provincia: cl.provincia,
      nazione,
      nazionalita: nazione === 'IT' ? 'Italiana' : 'Estera',
      telefono: cl.telefono || cl.cellulare,
      email: cl.email,
      pec: cl.pec,
      codiceSdi: cl.codiceSdi,
    }
    setForm(nuovo)
    setScelto({ nome: cl.denominazione })
    setErrore('')
    const tutti = validaRichiesta(pulisciCampiNascosti(nuovo))
    const manca = primoPassoConErrore(tutti, PASSI_CLIENTE)
    setErrori(manca ? erroriDelPasso(tutti, manca) : {})
    vaiA(manca ?? 'riepilogo')
    if (manca) setErrore('Questo cliente è in archivio, ma manca qualche dato: completalo qui.')
  }

  function scollega() {
    setScelto(null)
    setForm((f) => {
      const n = { ...f, clienteId: '', tipoSoggetto: '' as const, senzaPartitaIva: false, condominio: false }
      for (const k of CAMPI_CLIENTE) n[k] = ''
      return n
    })
  }

  /** Nome e sede trovati dalla partita IVA, dopo che chi compila ha toccato «Usa questi dati». */
  function datiDaPartitaIva(d: { denominazione: string; indirizzo: string; cap: string; citta: string; provincia: string }) {
    aggiorna({
      ragioneSociale: d.denominazione,
      ...(d.indirizzo && { indirizzo: d.indirizzo }),
      ...(d.cap && { cap: d.cap }),
      ...(d.citta && { citta: d.citta }),
      ...(d.provincia && { provincia: d.provincia }),
      nazione: 'IT',
      nazionalita: 'Italiana',
      ...(form.tipoSoggetto === 'Soggetto diverso da persona fisica' &&
        !form.codiceFiscale && { codiceFiscale: form.partitaIva }),
    })
  }

  // ---------- navigazione ----------
  function avanti() {
    if (passo === 'riepilogo') return invia()
    const tutti = { ...validaRichiesta(pulisciCampiNascosti(form)), ...erroriDelModulo(pagatoRisposto) }
    const delPasso = erroriDelPasso(tutti, passo)
    if (Object.keys(delPasso).length) {
      setErrori(delPasso)
      setErrore('Manca qualcosa: guarda le parti in rosso.')
      return
    }
    setErrori({})
    if (passo === 'servizio') setChiediServizio(false)
    const prossimo = daRiepilogo ? 'riepilogo' : passi[indice + 1] ?? 'riepilogo'
    if (prossimo === 'riepilogo') setDaRiepilogo(false)
    vaiA(prossimo === 'cosa' && passo === 'servizio' ? 'cosa' : prossimo)
  }

  function indietro() {
    if (indice === 0) return router.push('/home')
    setErrori({})
    vaiA(passi[indice - 1])
  }

  async function invia() {
    setErrore('')
    // Prima si buttano i valori dei campi non più chiesti, poi si valida quello
    // che parte davvero. Vedi § pulisciCampiNascosti.
    const dati = pulisciCampiNascosti(form)
    const trovati = validaRichiesta(dati)
    const dove = primoPassoConErrore(trovati, passi)
    if (dove) {
      setErrori(erroriDelPasso(trovati, dove))
      vaiA(dove)
      setErrore('Manca qualcosa: guarda le parti in rosso.')
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
        const lato = primoPassoConErrore(data.errori ?? {}, passi)
        if (lato) {
          setErrori(erroriDelPasso(data.errori, lato))
          vaiA(lato)
          setErrore('Manca qualcosa: guarda le parti in rosso.')
          return
        }
        throw new Error(data.error ?? 'Invio non riuscito')
      }
      cancellaBozza(richiedente)
      setFatto({
        numero: data.numero,
        cliente:
          data.cliente?.esito === 'creato'
            ? 'Il cliente è stato aggiunto all’archivio.'
            : data.cliente?.cambiati
              ? 'La scheda del cliente è stata aggiornata.'
              : '',
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      setErrore(`${err.message}. Riprova tra poco: i dati restano qui.`)
    } finally {
      setInvio(false)
    }
  }

  function ricomincia() {
    cancellaBozza(richiedente)
    setForm(partenza())
    setChiediServizio(!centriRecenti.length)
    setPagatoRisposto(false)
    setScelto(null)
    setErrori({})
    setFatto(null)
    setBozza(null)
    vaiA(centriRecenti.length ? 'cosa' : 'servizio')
  }

  // ---------- schermate ----------
  if (fatto) {
    return (
      <div className="space-y-6 rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Fatto!</h2>
          <p className="mt-2 text-lg text-gray-700">
            La richiesta <strong>{fatto.numero}</strong> è partita. Ti arriva una copia per mail.
          </p>
          {fatto.cliente && <p className="mt-1 text-base text-gray-500">{fatto.cliente}</p>}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={ricomincia} className="min-h-[56px] flex-1 rounded-2xl bg-primary px-5 text-lg font-semibold text-white">
            Fai un&apos;altra richiesta
          </button>
          <button type="button" onClick={() => router.push('/home')} className="min-h-[56px] flex-1 rounded-2xl border-2 border-gray-300 px-5 text-lg font-semibold text-gray-700">
            Torna alla Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        avanti()
      }}
      className="space-y-5 pb-4"
    >
      {bozza && (
        <div className="space-y-3 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
          <p className="text-base text-amber-900">
            Hai una richiesta lasciata a metà. Vuoi continuare da dove eri rimasto?
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => riprendi(bozza)} className="min-h-[48px] rounded-xl bg-amber-600 px-5 text-base font-semibold text-white">
              Sì, continua
            </button>
            <button type="button" onClick={ricomincia} className="min-h-[48px] rounded-xl border-2 border-amber-300 px-5 text-base font-semibold text-amber-900">
              No, ricomincia
            </button>
          </div>
        </div>
      )}

      <div ref={titolo} tabIndex={-1} className="outline-none" aria-live="polite">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Passo {indice + 1} di {passi.length} · {NOMI[passo]}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((indice + 1) / passi.length) * 100}%` }} />
        </div>
      </div>

      <Banner tono="errore">{errore && <span className="text-base">{errore}</span>}</Banner>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        {passo === 'servizio' && (
          <PassoServizio
            valore={form.centroCosto}
            errore={errori.centroCosto}
            recenti={centriRecenti}
            centriDiCosto={centriDiCosto}
            onScegli={(v) => set('centroCosto', v)}
          />
        )}
        {passo === 'cosa' && (
          <CosaFatturare
            valori={form}
            errori={errori}
            set={set}
            preimpostato={!chiediServizio}
            onCambiaServizio={() => {
              setChiediServizio(true)
              vaiA('servizio')
            }}
          />
        )}
        {passo === 'quando' && (
          <PassoQuando
            valori={form}
            errori={errori}
            set={set}
            pagatoRisposto={pagatoRisposto}
            onRispostaPagato={(p) => {
              setPagatoRisposto(true)
              aggiorna({
                incassato: p,
                ...(p && !form.dataIncasso && { dataIncasso: form.dataPrestazione }),
              })
            }}
          />
        )}
        {passo === 'cliente' && (
          <PassoCliente
            valori={form}
            errori={errori}
            clienti={clienti}
            scelto={scelto?.nome ?? null}
            onTipo={(t: TipoSoggetto | '') => set('tipoSoggetto', t)}
            onScegliCliente={scegliCliente}
            onScollega={scollega}
            onErrore={setErrore}
          />
        )}
        {passo === 'dati' && (
          <PassoDati
            valori={form}
            errori={errori}
            set={set}
            clienti={clienti}
            onScegliCliente={scegliCliente}
            onDatiVies={datiDaPartitaIva}
          />
        )}
        {passo === 'indirizzo' && (
          <PassoIndirizzo
            valori={form}
            errori={errori}
            set={set}
            onNazione={(codice) =>
              aggiorna({ nazione: codice, nazionalita: codice === 'IT' ? 'Italiana' : 'Estera' })
            }
          />
        )}
        {passo === 'recapiti' && <PassoRecapiti valori={form} errori={errori} set={set} />}
        {passo === 'riepilogo' && (
          <Riepilogo
            valori={form}
            set={set}
            scelto={scelto?.nome ?? null}
            onCorreggi={(p) => {
              setDaRiepilogo(true)
              vaiA(p)
            }}
          />
        )}
      </section>

      <p className="text-sm text-gray-500">
        Richiesta fatta da {richiedenteNome || richiedente}. Riceverai una copia per mail.
      </p>

      {/* I due tasti restano in fondo allo schermo mentre si scorre: sul telefono
          non si deve cercarli sotto la tastiera. */}
      <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-gray-50/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={indietro}
            className="min-h-[56px] flex-1 rounded-2xl border-2 border-gray-300 bg-white px-4 text-lg font-semibold text-gray-700"
          >
            {indice === 0 ? 'Annulla' : 'Indietro'}
          </button>
          <button
            type="submit"
            disabled={invio}
            className="min-h-[56px] flex-[2] rounded-2xl bg-primary px-4 text-lg font-semibold text-white disabled:opacity-60"
          >
            {passo === 'riepilogo' ? (invio ? 'Invio…' : 'Invia la richiesta') : daRiepilogo ? 'Torna al riepilogo' : 'Avanti'}
          </button>
        </div>
      </div>
    </form>
  )
}
