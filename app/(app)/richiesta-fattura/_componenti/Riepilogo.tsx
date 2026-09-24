'use client'

/**
 * Ultimo passo: tutto quello che parte, detto in una frase e poi per esteso,
 * con «Correggi» accanto a ogni parte. Chi compila conferma quello che vede,
 * non quello che si ricorda di aver scritto tre schermate fa.
 */

import { Campo } from '@/components/ui/Campo'
import { nomeNazione } from '@/types/clienti'
import {
  calcoloIva,
  chiedeCanaleSdi,
  intestatario,
  type NuovaRichiestaFatturaInput,
} from '@/types/fatture'
import { Domanda, Link } from './Bottoni'
import { euro } from './CosaFatturare'
import type { Passo } from './passi'

function dataLunga(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`)
  return Number.isNaN(d.getTime())
    ? ymd
    : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function Riepilogo({
  valori,
  set,
  scelto,
  onCorreggi,
}: {
  valori: NuovaRichiestaFatturaInput
  set: <K extends keyof NuovaRichiestaFatturaInput>(k: K, v: NuovaRichiestaFatturaInput[K]) => void
  scelto: string | null
  onCorreggi: (p: Passo) => void
}) {
  const importo = Number(String(valori.importo).replace(',', '.'))
  const iva = calcoloIva(valori)
  const chi = intestatario(valori)

  const righeCliente = [
    valori.tipoSoggetto === 'Privato'
      ? 'Persona senza partita IVA'
      : valori.tipoSoggetto === 'Persona fisica titolare di Partita IVA'
        ? 'Persona con partita IVA'
        : valori.condominio
          ? 'Condominio'
          : 'Azienda o ente',
    valori.partitaIva && `Partita IVA ${valori.partitaIva}`,
    valori.senzaPartitaIva && 'Senza partita IVA',
    valori.codiceFiscale && `Codice fiscale ${valori.codiceFiscale}`,
  ]
  const righeIndirizzo = [
    valori.indirizzo,
    [valori.cap, valori.citta, valori.provincia && `(${valori.provincia})`].filter(Boolean).join(' '),
    valori.nazione !== 'IT' && nomeNazione(valori.nazione),
  ]
  const righeContatti = [
    valori.codiceSdi && `Codice destinatario ${valori.codiceSdi}`,
    valori.pec && `PEC ${valori.pec}`,
    valori.email && `Email ${valori.email}`,
    valori.telefono && `Telefono ${valori.telefono}`,
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-primary/30 bg-blue-50 px-5 py-4">
        <p className="text-lg leading-relaxed text-gray-900">
          Chiedi una fattura di{' '}
          <strong>{Number.isFinite(importo) ? euro(importo) : valori.importo}</strong> per{' '}
          <strong>{chi}</strong>: {valori.descrizione.trim().toLowerCase() || '—'} di{' '}
          {dataLunga(valori.dataPrestazione)}.{' '}
          {valori.incassato ? 'Ha già pagato.' : <strong>Deve ancora pagare.</strong>}
        </p>
      </div>

      <Sezione titolo="Cosa e quanto" onCorreggi={() => onCorreggi('cosa')}>
        {[
          `Servizio: ${valori.centroCosto}`,
          valori.tipoDocumento !== 'Fattura' && valori.tipoDocumento,
          valori.descrizione,
          iva.scorporo
            ? `${euro(iva.scorporo.totale)}, di cui IVA ${euro(iva.scorporo.iva)} (${iva.aliquota}%)`
            : `${Number.isFinite(importo) ? euro(importo) : valori.importo} — IVA ${iva.descrizione}`,
        ]}
      </Sezione>
      <Sezione titolo="Quando" onCorreggi={() => onCorreggi('quando')}>
        {[
          dataLunga(valori.dataPrestazione),
          valori.incassato
            ? `Pagato: ${valori.mezzoPagamento}${valori.dataIncasso !== valori.dataPrestazione ? `, ${dataLunga(valori.dataIncasso)}` : ''}`
            : 'Da pagare',
        ]}
      </Sezione>
      <Sezione titolo={chi} sottotitolo={scelto ? 'Cliente già in archivio' : 'Cliente nuovo: lo salviamo noi'} onCorreggi={() => onCorreggi('dati')}>
        {righeCliente}
      </Sezione>
      <Sezione titolo="Indirizzo" onCorreggi={() => onCorreggi('indirizzo')}>
        {righeIndirizzo}
      </Sezione>
      <Sezione
        titolo={chiedeCanaleSdi(valori) ? 'Come riceve la fattura' : 'Contatti'}
        onCorreggi={() => onCorreggi('recapiti')}
      >
        {righeContatti.some(Boolean) ? righeContatti : ['Nessun contatto']}
      </Sezione>

      <Domanda titolo="Vuoi aggiungere qualcosa per chi fa la fattura?">
        <Campo
          grande
          etichetta="Note (se servono)"
          tipo="textarea"
          righe={2}
          valore={valori.note}
          onChange={(v) => set('note', v)}
        />
      </Domanda>
    </div>
  )
}

function Sezione({
  titolo,
  sottotitolo,
  onCorreggi,
  children,
}: {
  titolo: string
  sottotitolo?: string
  onCorreggi: () => void
  children: (string | false | '' | undefined | null)[]
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4">
        <div>
          <h3 className="text-base font-bold text-gray-800">{titolo}</h3>
          {sottotitolo && <p className="text-sm text-gray-500">{sottotitolo}</p>}
        </div>
        <Link onClick={onCorreggi}>Correggi</Link>
      </div>
      <ul className="mt-1 space-y-0.5 text-base text-gray-700">
        {children.filter(Boolean).map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </section>
  )
}
