'use client'

/**
 * I due pannelli per registrare qualcosa che non c'era: un dispositivo o una SIM.
 *
 * Il dispositivo nasce "In magazzino" e prende il suo numero di inventario — non
 * finisce in un elenco a parte dei dispositivi, entra nel registro unico dei
 * beni. Assegnarlo è un passo dopo, con le sue regole.
 */

import { useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Campo } from '@/components/ui/Campo'
import { Modale } from '@/components/ui/Modale'
import type { BeneInventario } from '@/types/inventario'
import { MODI_ACQUISIZIONE, TIPI_IT, TIPI_PIANO, type Sim } from '@/types/it'
import { creaDispositivo, creaSim } from './azioni'

function Azioni({
  busy,
  onChiudi,
  onConferma,
  etichetta,
}: {
  busy: boolean
  onChiudi: () => void
  onConferma: () => void
  etichetta: string
}) {
  return (
    <>
      <button
        onClick={onChiudi}
        className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm font-semibold"
      >
        Annulla
      </button>
      <button
        onClick={onConferma}
        disabled={busy}
        className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
      >
        {busy ? 'Salvo…' : etichetta}
      </button>
    </>
  )
}

export function NuovoDispositivo({
  onFatto,
  onChiudi,
}: {
  onFatto: (b: BeneInventario) => void
  onChiudi: () => void
}) {
  const [f, setF] = useState({
    tipoIT: '',
    sottoTipo: '',
    marca: '',
    modello: '',
    numeroSerie: '',
    acquisizione: '',
    canoneMensile: '',
    fornitore: '',
    dataAcquisto: '',
    valore: '',
  })
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))

  async function conferma() {
    if (!f.tipoIT) return setErrore('Scegli il tipo di dispositivo.')
    if (!f.marca && !f.modello) return setErrore('Serve almeno la marca o il modello.')
    setBusy(true)
    setErrore(null)
    try {
      onFatto(
        await creaDispositivo({
          ...f,
          canoneMensile: f.canoneMensile === '' ? undefined : Number(f.canoneMensile),
          valore: f.valore === '' ? undefined : Number(f.valore),
          acquisizione: f.acquisizione || undefined,
        }),
      )
      onChiudi()
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modale
      titolo="Nuovo dispositivo"
      sottotitolo="Prende il prossimo numero di inventario e nasce in magazzino."
      onChiudi={onChiudi}
      azioni={<Azioni busy={busy} onChiudi={onChiudi} onConferma={conferma} etichetta="Registra" />}
    >
      <div className="space-y-3">
        <Campo etichetta="Tipo" obbligatorio tipo="choice" valore={f.tipoIT} onChange={(v) => set('tipoIT', v)} scelte={TIPI_IT} />
        <Campo etichetta="Sottotipo" valore={f.sottoTipo} onChange={(v) => set('sottoTipo', v)} segnaposto="Notebook, Monitor…" />
        <div className="grid grid-cols-2 gap-2.5">
          <Campo etichetta="Marca" valore={f.marca} onChange={(v) => set('marca', v)} />
          <Campo etichetta="Modello" valore={f.modello} onChange={(v) => set('modello', v)} />
        </div>
        <Campo etichetta="Numero di serie" valore={f.numeroSerie} onChange={(v) => set('numeroSerie', v)} maiuscolo />
        <Campo
          etichetta="Acquisizione"
          tipo="choice"
          valore={f.acquisizione}
          onChange={(v) => set('acquisizione', v)}
          scelte={MODI_ACQUISIZIONE}
        />
        {f.acquisizione === 'Noleggio' && (
          <Campo etichetta="Canone mensile" tipo="currency" valore={f.canoneMensile} onChange={(v) => set('canoneMensile', v)} />
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Campo etichetta="Fornitore" valore={f.fornitore} onChange={(v) => set('fornitore', v)} />
          <Campo etichetta="Data di acquisto" tipo="date" valore={f.dataAcquisto} onChange={(v) => set('dataAcquisto', v)} />
        </div>
        <Campo etichetta="Valore" tipo="currency" valore={f.valore} onChange={(v) => set('valore', v)} />
        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}

export function NuovaSim({ onFatto, onChiudi }: { onFatto: (s: Sim) => void; onChiudi: () => void }) {
  const [f, setF] = useState({
    iccid: '',
    numero: '',
    operatore: '',
    tipoPiano: '',
    nomePiano: '',
    fornitore: '',
    dataAttivazione: '',
    riferimentoContratto: '',
    costoMensile: '',
  })
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))

  async function conferma() {
    if (!f.iccid.trim()) return setErrore('Serve l’ICCID, il seriale stampato sulla scheda.')
    if (!f.numero.trim()) return setErrore('Serve il numero.')
    setBusy(true)
    setErrore(null)
    try {
      onFatto(
        await creaSim({
          ...f,
          tipoPiano: f.tipoPiano || undefined,
          costoMensile: f.costoMensile === '' ? undefined : Number(f.costoMensile),
        }),
      )
      onChiudi()
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modale
      titolo="Nuova SIM"
      sottotitolo="L’ICCID è la chiave: resta lo stesso anche se il numero viene portato altrove."
      onChiudi={onChiudi}
      azioni={<Azioni busy={busy} onChiudi={onChiudi} onConferma={conferma} etichetta="Registra" />}
    >
      <div className="space-y-3">
        <Campo etichetta="ICCID" obbligatorio valore={f.iccid} onChange={(v) => set('iccid', v)} segnaposto="8939010…" />
        <Campo etichetta="Numero" obbligatorio tipo="tel" valore={f.numero} onChange={(v) => set('numero', v)} segnaposto="+39…" />
        <div className="grid grid-cols-2 gap-2.5">
          <Campo etichetta="Operatore" valore={f.operatore} onChange={(v) => set('operatore', v)} />
          <Campo etichetta="Tipo piano" tipo="choice" valore={f.tipoPiano} onChange={(v) => set('tipoPiano', v)} scelte={TIPI_PIANO} />
        </div>
        <Campo etichetta="Nome piano" valore={f.nomePiano} onChange={(v) => set('nomePiano', v)} />
        <div className="grid grid-cols-2 gap-2.5">
          <Campo etichetta="Costo mensile" tipo="currency" valore={f.costoMensile} onChange={(v) => set('costoMensile', v)} />
          <Campo etichetta="Data attivazione" tipo="date" valore={f.dataAttivazione} onChange={(v) => set('dataAttivazione', v)} />
        </div>
        <Campo etichetta="Fornitore / intermediario" valore={f.fornitore} onChange={(v) => set('fornitore', v)} />
        <Campo
          etichetta="Riferimento contratto"
          valore={f.riferimentoContratto}
          onChange={(v) => set('riferimentoContratto', v)}
        />
        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}
