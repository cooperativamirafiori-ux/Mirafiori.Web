'use client'

/**
 * La scheda di un dispositivo: chi ce l'ha, i dati tecnici, tutto lo storico.
 *
 * I campi che arrivano da una richiesta d'acquisto restano di sola lettura — per
 * correggerli si corregge l'ordine, che riallinea i beni. I 52 dispositivi
 * arrivati dalle liste dell'IT non hanno nessuna richiesta alle spalle, quindi
 * sono modificabili: è da qui che si completano i canoni e i seriali mancanti.
 */

import { useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Campo } from '@/components/ui/Campo'
import { Pill } from '@/components/ui/Pill'
import { Voce } from '@/components/ui/Voce'
import type { VoceRubrica } from '@/lib/core/rubrica'
import type { RigaDispositivo } from '@/lib/it/data'
import { STATO_BENE_STILE } from '@/types/inventario'
import { dataBreve, euro } from '@/types/acquisti'
import {
  MODI_ACQUISIZIONE,
  TIPI_CON_FIREWALL,
  TIPI_IT,
  chiLoHa,
  type Assegnazione,
  type CentroDiCostoVoce,
  type ModoAcquisizione,
  type TipoIT,
} from '@/types/it'
import type { BeneInventario } from '@/types/inventario'
import { ModaleAssegna } from './ModaleAssegna'
import { Storico } from './Storico'
import { salvaDispositivo } from './azioni'

export function SchedaDispositivo({
  riga,
  storico,
  centriDiCosto,
  rubrica,
  onBene,
  onAssegnazione,
}: {
  riga: RigaDispositivo
  storico: Assegnazione[]
  centriDiCosto: CentroDiCostoVoce[]
  rubrica: VoceRubrica[]
  onBene: (b: BeneInventario) => void
  onAssegnazione: (a: Assegnazione) => void
}) {
  const { bene, attiva } = riga
  const [aperta, setAperta] = useState(false)
  const [assegnando, setAssegnando] = useState(false)
  const [correggendo, setCorreggendo] = useState<Assegnazione | null>(null)

  const pc = bene.tipoIT && TIPI_CON_FIREWALL.includes(bene.tipoIT)
  const senzaFirewall = pc && bene.firewallInstallato === false
  const firewallDaVerificare = pc && bene.firewallInstallato === undefined

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setAperta(!aperta)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-gray-700">{bene.numero}</span>
            {bene.tipoIT && <Pill text={bene.tipoIT} tono="azzurro" />}
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                STATO_BENE_STILE[bene.statoBene] ?? ''
              }`}
            >
              {bene.statoBene}
            </span>
            {senzaFirewall && <Pill text="senza firewall" tono="rosso" />}
            {firewallDaVerificare && <Pill text="firewall da verificare" tono="ambra" />}
            {!attiva && <Pill text="non assegnato" tono="neutro" />}
          </div>
          <p className="text-sm text-gray-800 font-medium mt-1 truncate">
            {[bene.marca, bene.modello].filter(Boolean).join(' ') || bene.descrizione}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {chiLoHa(attiva)}
            {attiva?.centroDiCosto?.value ? ` · ${attiva.centroDiCosto.value}` : ''}
            {bene.numeroSerie ? ` · SN ${bene.numeroSerie}` : ''}
          </p>
        </div>
        <span className="text-gray-300 text-sm shrink-0">{aperta ? '▲' : '▼'}</span>
      </button>

      {aperta && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50/50">
          <DatiTecnici bene={bene} onBene={onBene} />

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700">Storico delle assegnazioni</p>
              <button
                onClick={() => setAssegnando(true)}
                className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-semibold"
              >
                {attiva ? 'Riassegna' : 'Assegna'}
              </button>
            </div>
            <Storico
              genere="bene"
              storico={storico}
              onAggiornata={onAssegnazione}
              onCorreggi={setCorreggendo}
            />
          </div>

          {bene.idListaIT && (
            <p className="text-[11px] text-gray-400">
              Veniva dalle liste dell’IT come <span className="font-mono">{bene.idListaIT}</span>.
            </p>
          )}
        </div>
      )}

      {assegnando && (
        <ModaleAssegna
          genere="bene"
          oggettoId={Number(bene.spItemId)}
          etichetta={bene.numero}
          centriDiCosto={centriDiCosto}
          rubrica={rubrica}
          onFatto={onAssegnazione}
          onChiudi={() => setAssegnando(false)}
        />
      )}
      {correggendo && (
        <ModaleAssegna
          genere="bene"
          oggettoId={Number(bene.spItemId)}
          etichetta={bene.numero}
          precedente={correggendo}
          centriDiCosto={centriDiCosto}
          rubrica={rubrica}
          onFatto={onAssegnazione}
          onChiudi={() => setCorreggendo(null)}
        />
      )}
    </div>
  )
}

/** I dati del dispositivo: quelli tecnici modificabili, quelli dell'ordine no. */
function DatiTecnici({
  bene,
  onBene,
}: {
  bene: BeneInventario
  onBene: (b: BeneInventario) => void
}) {
  const daOrdine = Boolean(bene.codiceRichiesta)
  const [f, setF] = useState({
    tipoIT: (bene.tipoIT ?? '') as string,
    sottoTipo: bene.sottoTipo ?? '',
    marca: bene.marca ?? '',
    modello: bene.modello ?? '',
    numeroSerie: bene.numeroSerie ?? '',
    acquisizione: (bene.acquisizione ?? '') as string,
    canoneMensile: bene.canoneMensile != null ? String(bene.canoneMensile) : '',
    fineNoleggio: bene.fineNoleggio?.slice(0, 10) ?? '',
    fatturaRif: bene.fatturaRif ?? '',
    garanzieAccessorie: bene.garanzieAccessorie ?? '',
    fornitore: bene.fornitore ?? '',
    dataAcquisto: bene.dataAcquisto?.slice(0, 10) ?? '',
    valore: bene.valore != null ? String(bene.valore) : '',
    mesiGaranzia: bene.mesiGaranzia != null ? String(bene.mesiGaranzia) : '',
    scadenzaGaranzia: bene.scadenzaGaranzia?.slice(0, 10) ?? '',
  })
  // Il firewall è a tre stati: sì, no, e "nessuno l'ha ancora guardato". Si manda
  // al server solo se qualcuno ha davvero toccato la casella, altrimenti salvare
  // la marca trasformerebbe tutti i "mai verificato" in "no".
  const [firewall, setFirewall] = useState<boolean | undefined>(bene.firewallInstallato)
  const [firewallToccato, setFirewallToccato] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [salvato, setSalvato] = useState(false)

  const set = (k: keyof typeof f, v: string) => {
    setF((s) => ({ ...s, [k]: v }))
    setSalvato(false)
  }
  const pc = TIPI_CON_FIREWALL.includes((f.tipoIT || bene.tipoIT) as TipoIT)
  const noleggio = f.acquisizione === 'Noleggio'

  async function salva() {
    setBusy(true)
    setErrore(null)
    try {
      const campi: Record<string, unknown> = {
        tipoIT: f.tipoIT || null,
        sottoTipo: f.sottoTipo,
        marca: f.marca,
        modello: f.modello,
        numeroSerie: f.numeroSerie,
        acquisizione: f.acquisizione || undefined,
        canoneMensile: f.canoneMensile === '' ? null : Number(f.canoneMensile),
        fineNoleggio: f.fineNoleggio || null,
        fatturaRif: f.fatturaRif,
        garanzieAccessorie: f.garanzieAccessorie,
      }
      if (pc && firewallToccato) campi.firewallInstallato = firewall === true
      if (!daOrdine) {
        campi.fornitore = f.fornitore
        campi.dataAcquisto = f.dataAcquisto || null
        campi.valore = f.valore === '' ? null : Number(f.valore)
        campi.mesiGaranzia = f.mesiGaranzia === '' ? null : Number(f.mesiGaranzia)
        campi.scadenzaGaranzia = f.scadenzaGaranzia || null
      }
      onBene(await salvaDispositivo(bene.spItemId, campi))
      setSalvato(true)
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 bg-white rounded-lg border border-gray-100 p-3">
      <p className="text-xs font-semibold text-gray-700">Dati del dispositivo</p>

      <div className="grid sm:grid-cols-2 gap-2.5">
        <Campo
          etichetta="Tipo"
          tipo="choice"
          valore={f.tipoIT}
          onChange={(v) => set('tipoIT', v)}
          scelte={TIPI_IT}
          aiuto="Se lo svuoti, il bene esce dall’area IT."
        />
        <Campo etichetta="Sottotipo" valore={f.sottoTipo} onChange={(v) => set('sottoTipo', v)} segnaposto="Notebook, Monitor…" />
        <Campo etichetta="Marca" valore={f.marca} onChange={(v) => set('marca', v)} />
        <Campo etichetta="Modello" valore={f.modello} onChange={(v) => set('modello', v)} />
        <Campo etichetta="Numero di serie" valore={f.numeroSerie} onChange={(v) => set('numeroSerie', v)} maiuscolo />
        <Campo
          etichetta="Acquisizione"
          tipo="choice"
          valore={f.acquisizione}
          onChange={(v) => set('acquisizione', v as ModoAcquisizione)}
          scelte={MODI_ACQUISIZIONE}
        />
        {noleggio && (
          <>
            <Campo etichetta="Canone mensile" tipo="currency" valore={f.canoneMensile} onChange={(v) => set('canoneMensile', v)} />
            <Campo etichetta="Fine noleggio" tipo="date" valore={f.fineNoleggio} onChange={(v) => set('fineNoleggio', v)} />
          </>
        )}
      </div>

      {pc && (
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={firewall === true}
            onChange={(e) => {
              setFirewall(e.target.checked)
              setFirewallToccato(true)
              setSalvato(false)
            }}
            className="mt-0.5"
          />
          <span>
            Firewall installato
            {firewall === undefined && !firewallToccato && (
              <span className="block text-xs text-amber-700">
                Mai verificato su questo PC. Se dopo il controllo il firewall non c’è, spunta
                e togli la spunta: serve a registrare che qualcuno ha guardato.
              </span>
            )}
          </span>
        </label>
      )}

      {daOrdine ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs border-t border-gray-100 pt-2.5">
          <Voce t="Richiesta di origine" v={bene.codiceRichiesta ?? '—'} />
          <Voce t="Fornitore" v={bene.fornitore ?? '—'} />
          <Voce t="Data di acquisto" v={dataBreve(bene.dataAcquisto)} />
          <Voce t="Valore" v={bene.valore != null ? euro(bene.valore) : '—'} />
          <Voce
            t="Dati dell’acquisto"
            v="Vengono dalla richiesta: per correggerli si corregge l’ordine."
            span
          />
        </dl>
      ) : (
        <div className="grid sm:grid-cols-3 gap-2.5 border-t border-gray-100 pt-2.5">
          <Campo etichetta="Fornitore" valore={f.fornitore} onChange={(v) => set('fornitore', v)} />
          <Campo etichetta="Data di acquisto" tipo="date" valore={f.dataAcquisto} onChange={(v) => set('dataAcquisto', v)} />
          <Campo etichetta="Valore" tipo="currency" valore={f.valore} onChange={(v) => set('valore', v)} />
          <Campo etichetta="Mesi di garanzia" tipo="number" min={0} valore={f.mesiGaranzia} onChange={(v) => set('mesiGaranzia', v)} />
          <Campo etichetta="Scadenza garanzia" tipo="date" valore={f.scadenzaGaranzia} onChange={(v) => set('scadenzaGaranzia', v)} />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-2.5">
        <Campo etichetta="Fattura rif." valore={f.fatturaRif} onChange={(v) => set('fatturaRif', v)} />
        <Campo
          etichetta="Garanzie accessorie"
          tipo="textarea"
          righe={2}
          valore={f.garanzieAccessorie}
          onChange={(v) => set('garanzieAccessorie', v)}
        />
      </div>

      <Banner tono="errore">{errore}</Banner>

      <button
        onClick={salva}
        disabled={busy}
        className="w-full bg-gray-800 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
      >
        {busy ? 'Salvo…' : salvato ? 'Salvato ✓' : 'Salva i dati del dispositivo'}
      </button>
    </div>
  )
}
