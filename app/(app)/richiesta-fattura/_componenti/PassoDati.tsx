'use client'

/**
 * Passo «I dati del cliente» — nome, codici.
 *
 * Quali campi compaiono lo decide sempre `CAMPI_PER_TIPO` (types/fatture.ts),
 * come prima: qui cambia solo l'ordine e il modo di chiederli.
 *
 * - Per le aziende la **partita IVA viene prima**: scritte le 11 cifre, il
 *   modulo cerca da solo in archivio e poi sul servizio europeo VIES, e propone
 *   nome e indirizzo. Chi compila tocca «Usa questi dati» — niente viene
 *   riempito senza che l'abbia visto.
 * - Il codice fiscale di un ente di solito è uguale alla partita IVA: un tocco
 *   lo copia.
 * - Il codice fiscale di una persona si controlla nel carattere finale, ma è
 *   solo un avviso (vedi `codiceFiscaleValido`).
 */

import { useEffect, useState } from 'react'
import { Campo } from '@/components/ui/Campo'
import {
  CAMPI_PER_TIPO,
  chiedeCondominio,
  codiceFiscaleValido,
  intestatario,
  partitaIvaValida,
  type CampoSoggetto,
  type NuovaRichiestaFatturaInput,
} from '@/types/fatture'
import type { Cliente, ClienteIndice } from '@/types/clienti'
import { Domanda, Link, Spunta } from '@/components/ui/Bottoni'
import { caricaScheda } from './RicercaCliente'

type Set = <K extends keyof NuovaRichiestaFatturaInput>(k: K, v: NuovaRichiestaFatturaInput[K]) => void

/** L'ordine in cui chiedere i campi, dal più facile da sapere. */
const ORDINE: readonly CampoSoggetto[] = ['partitaIva', 'cognome', 'nome', 'ragioneSociale', 'codiceFiscale']
const ORDINE_PERSONA: readonly CampoSoggetto[] = ['cognome', 'nome', 'codiceFiscale', 'partitaIva', 'ragioneSociale']

interface Trovato {
  fonte: 'archivio' | 'vies'
  nome: string
  dove: string
  applica: () => void | Promise<void>
}

export function PassoDati({
  valori,
  errori,
  set,
  clienti,
  onScegliCliente,
  onDatiVies,
}: {
  valori: NuovaRichiestaFatturaInput
  errori: Record<string, string>
  set: Set
  clienti: ClienteIndice[]
  onScegliCliente: (c: Cliente) => void
  onDatiVies: (d: { denominazione: string; indirizzo: string; cap: string; citta: string; provincia: string }) => void
}) {
  const tipo = valori.tipoSoggetto
  if (!tipo) return null
  const azienda = tipo === 'Soggetto diverso da persona fisica'
  const previsti = new Set(CAMPI_PER_TIPO[tipo])
  const campi = (azienda ? ORDINE : ORDINE_PERSONA).filter((c) => previsti.has(c))

  const etichette: Record<CampoSoggetto, string> = {
    cognome: 'Cognome',
    nome: 'Nome',
    ragioneSociale: azienda ? "Nome dell'azienda o dell'ente" : 'Nome della ditta',
    partitaIva: 'Partita IVA',
    codiceFiscale: 'Codice fiscale',
  }
  const aiuti: Partial<Record<CampoSoggetto, string>> = {
    codiceFiscale: azienda
      ? 'Per le aziende di solito è uguale alla partita IVA.'
      : 'Lo trovi sulla tessera sanitaria del cliente.',
    partitaIva: '11 cifre.',
    ragioneSociale: azienda ? undefined : 'Il nome con cui lavora. Spesso è nome e cognome.',
  }

  const cf = valori.codiceFiscale.replace(/\s/g, '')
  const avvisoCf =
    valori.nazionalita === 'Italiana' && cf.length === 16 && !errori.codiceFiscale && !codiceFiscaleValido(cf)
      ? 'Questo codice fiscale non torna: ricontrolla le lettere e i numeri.'
      : undefined

  return (
    <Domanda titolo="I dati del cliente">
      <div className="space-y-5">
        {campi.map((c) => (
          <div key={c} className="space-y-2">
            <Campo
              grande
              etichetta={etichette[c]}
              valore={valori[c]}
              onChange={(v) => set(c, v)}
              errore={errori[c] || (c === 'codiceFiscale' ? avvisoCf : undefined)}
              aiuto={aiuti[c]}
              maiuscolo={c === 'codiceFiscale'}
              maxLength={c === 'partitaIva' ? 11 : c === 'codiceFiscale' ? 16 : undefined}
              inputMode={c === 'partitaIva' ? 'numeric' : undefined}
              disabilitato={c === 'partitaIva' && valori.senzaPartitaIva}
            />

            {c === 'partitaIva' && (
              <>
                <Spunta
                  etichetta="Non ha la partita IVA"
                  valore={valori.senzaPartitaIva}
                  onChange={(v) => {
                    set('senzaPartitaIva', v)
                    if (v) set('partitaIva', '')
                  }}
                />
                <CercaPartitaIva
                  piva={valori.partitaIva}
                  clienti={clienti}
                  onScegliCliente={onScegliCliente}
                  onDatiVies={onDatiVies}
                />
              </>
            )}

            {c === 'ragioneSociale' && !azienda && valori.cognome && !valori.ragioneSociale && (
              <Link onClick={() => set('ragioneSociale', intestatario({ cognome: valori.cognome, nome: valori.nome }))}>
                È uguale a nome e cognome
              </Link>
            )}
            {c === 'codiceFiscale' && azienda && valori.partitaIva && valori.codiceFiscale !== valori.partitaIva && (
              <Link onClick={() => set('codiceFiscale', valori.partitaIva)}>È uguale alla partita IVA</Link>
            )}
          </div>
        ))}

        {chiedeCondominio(tipo) && (
          <Spunta
            etichetta="È un condominio"
            valore={valori.condominio}
            onChange={(v) => set('condominio', v)}
          />
        )}
      </div>
    </Domanda>
  )
}

/**
 * Scritta una partita IVA valida, cerca chi è: prima in archivio (così non si
 * crea un doppione), poi su VIES. Mostra cosa ha trovato con un bottone per
 * usarlo. Se VIES non risponde non dice niente: si scrive a mano.
 */
function CercaPartitaIva({
  piva,
  clienti,
  onScegliCliente,
  onDatiVies,
}: {
  piva: string
  clienti: ClienteIndice[]
  onScegliCliente: (c: Cliente) => void
  onDatiVies: (d: { denominazione: string; indirizzo: string; cap: string; citta: string; provincia: string }) => void
}) {
  const [trovato, setTrovato] = useState<Trovato | null>(null)
  const [cerco, setCerco] = useState(false)
  const [usato, setUsato] = useState('')
  const numero = piva.replace(/\s/g, '')
  const valida = partitaIvaValida(numero)

  useEffect(() => {
    setTrovato(null)
    if (!valida || usato === numero) return
    const inArchivio = clienti.find((c) => c.pi === numero)
    if (inArchivio) {
      setTrovato({
        fonte: 'archivio',
        nome: inArchivio.d,
        dove: inArchivio.c,
        applica: async () => onScegliCliente(await caricaScheda(inArchivio.id)),
      })
      return
    }
    let annullato = false
    setCerco(true)
    fetch(`/api/clienti/partita-iva/${numero}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (annullato || !d?.trovato) return
        setTrovato({
          fonte: 'vies',
          nome: d.denominazione,
          dove: [d.indirizzo, [d.cap, d.citta, d.provincia && `(${d.provincia})`].filter(Boolean).join(' ')]
            .filter(Boolean)
            .join(', '),
          applica: () => onDatiVies(d),
        })
      })
      .catch(() => undefined)
      .finally(() => !annullato && setCerco(false))
    return () => {
      annullato = true
    }
  }, [numero, valida, usato])

  if (numero.length === 11 && !valida) {
    return <p className="text-sm font-medium text-red-600">Questo numero non torna: ricontrolla le cifre.</p>
  }
  if (cerco) return <p className="text-base text-gray-500">Cerco i dati dell&apos;azienda…</p>
  if (!trovato) return null

  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 space-y-3">
      <p className="text-base text-emerald-900">
        {trovato.fonte === 'archivio' ? 'È già fra i nostri clienti:' : 'Abbiamo trovato:'}{' '}
        <strong>{trovato.nome}</strong>
        {trovato.dove && <span className="block text-sm text-emerald-800">{trovato.dove}</span>}
      </p>
      <button
        type="button"
        onClick={async () => {
          await trovato.applica()
          setUsato(numero)
          setTrovato(null)
        }}
        className="min-h-[48px] rounded-xl bg-emerald-700 px-5 text-base font-semibold text-white"
      >
        Usa questi dati
      </button>
    </div>
  )
}
