'use client'

import { useState } from 'react'
import { Modale } from '@/components/ui/Modale'
import { Campo } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import { CATEGORIE_MODULO, FREQUENZE, fineMesePrecedente, inizioMese, type CostoFisso } from '@/types/costi-fissi'
import type { StrutturaCc } from '@/types/utenze'
import { data } from '../../costi-strutture/_componenti/formato'

/**
 * Tre modi di toccare una voce che esiste già, perché il passato non cambi:
 *   - "Cambia da un mese": chiude la voce e ne apre una nuova (aumento dell'affitto);
 *   - "Termina": il costo viene a mancare, i mesi in cui c'era restano;
 *   - "Correggi un errore": riscrive la voce, passato compreso (refuso, struttura sbagliata).
 */
type Modo = 'varia' | 'termina' | 'correggi'

export function ModaleCostoFisso({
  costo,
  strutture,
  onChiudi,
  onFatto,
}: {
  costo: CostoFisso | null
  strutture: StrutturaCc[]
  onChiudi: () => void
  onFatto: (t: string) => void
}) {
  const chiusa = !!costo?.dataFine
  const [modo, setModo] = useState<Modo>(chiusa ? 'correggi' : 'varia')
  const [descrizione, setDescrizione] = useState(costo?.descrizione ?? '')
  const [strutturaId, setStrutturaId] = useState(costo?.strutturaId ? String(costo.strutturaId) : '')
  const [categoria, setCategoria] = useState(costo?.categoria ?? '')
  const [importo, setImporto] = useState(costo ? String(costo.importo) : '')
  const [frequenza, setFrequenza] = useState<string>(costo?.frequenza ?? 'Annuale')
  const [dataInizio, setDataInizio] = useState(costo?.dataPrimaScadenza ?? '')
  const [dal, setDal] = useState(inizioMese(new Date().toISOString().slice(0, 10)))
  const [ultimoGiorno, setUltimoGiorno] = useState(new Date().toISOString().slice(0, 10))
  const [fornitore, setFornitore] = useState(costo?.fornitore ?? '')
  const [note, setNote] = useState(costo?.note ?? '')
  const [errore, setErrore] = useState('')
  const [salvo, setSalvo] = useState(false)

  // Una voce nata da SharePoint con luce/gas/acqua resta modificabile: la categoria si vede.
  const categorie = costo && !CATEGORIE_MODULO.includes(costo.categoria as never) ? [costo.categoria, ...CATEGORIE_MODULO] : [...CATEGORIE_MODULO]
  const dati = { descrizione, strutturaId: Number(strutturaId), categoria, importo, frequenza, dataPrimaScadenza: dataInizio, fornitore, note }

  async function salva() {
    setSalvo(true)
    setErrore('')
    try {
      const [url, metodo, corpo] = !costo
        ? ['/api/costi-fissi', 'POST', dati]
        : modo === 'varia'
          ? [`/api/costi-fissi/${costo.id}/varia`, 'POST', { ...dati, dal }]
          : modo === 'termina'
            ? [`/api/costi-fissi/${costo.id}/termina`, 'POST', { ultimoGiorno }]
            : [`/api/costi-fissi/${costo.id}`, 'PATCH', dati]
      const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Errore')
      onFatto(
        !costo
          ? `"${descrizione}" inserito.`
          : modo === 'varia'
            ? `"${descrizione}": dal ${data(dal)} vale il nuovo importo, i mesi prima restano come erano.`
            : modo === 'termina'
              ? `"${costo.descrizione}" chiuso al ${data(ultimoGiorno)}.`
              : `"${descrizione}" corretto.`,
      )
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
      setSalvo(false)
    }
  }

  const scheda = (m: Modo, testo: string) => (
    <button
      key={m}
      onClick={() => setModo(m)}
      className={`flex-1 min-w-[30%] px-3 py-2 rounded-xl border text-sm font-semibold ${modo === m ? 'border-brand-cyan bg-cyan-50 text-cyan-900' : 'border-gray-300 text-gray-600'}`}
    >
      {testo}
    </button>
  )

  const campiVoce = (
    <>
      <Campo etichetta="Descrizione" valore={descrizione} onChange={setDescrizione} obbligatorio segnaposto="Affitto via Gessi, TARI…" />
      <Campo
        etichetta="Struttura"
        tipo="choice"
        valore={strutturaId}
        onChange={setStrutturaId}
        scelte={strutture.map((s) => ({ valore: String(s.id), etichetta: `${s.codice} · ${s.nome}` }))}
        obbligatorio
      />
      <Campo etichetta="Categoria" tipo="choice" valore={categoria} onChange={setCategoria} scelte={categorie} obbligatorio />
      <div className="grid grid-cols-2 gap-3">
        <Campo etichetta="Importo per scadenza (€)" tipo="currency" valore={importo} onChange={setImporto} obbligatorio inputMode="decimal" />
        <Campo etichetta="Frequenza" tipo="choice" valore={frequenza} onChange={setFrequenza} scelte={FREQUENZE} senzaVuoto />
      </div>
      <Campo etichetta="Fornitore o controparte" valore={fornitore} onChange={setFornitore} />
      <Campo etichetta="Note" tipo="textarea" valore={note} onChange={setNote} righe={2} />
    </>
  )

  return (
    <Modale
      titolo={costo ? costo.descrizione : 'Nuovo costo fisso'}
      sottotitolo={costo ? `${costo.dataPrimaScadenza ? `dal ${data(costo.dataPrimaScadenza)}` : 'da sempre'}${costo.dataFine ? ` al ${data(costo.dataFine)}` : ''}` : undefined}
      onChiudi={onChiudi}
      azioni={
        <>
          <button onClick={onChiudi} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700">
            Annulla
          </button>
          <button onClick={salva} disabled={salvo} className="flex-1 px-4 py-2.5 rounded-xl bg-brand-cyan text-white text-sm font-semibold disabled:opacity-50">
            {salvo ? 'Salvo…' : modo === 'termina' && costo ? 'Chiudi la voce' : 'Salva'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {costo && (
          <div className="flex flex-wrap gap-2">
            {!chiusa && scheda('varia', 'Cambia da un mese')}
            {!chiusa && scheda('termina', 'Termina')}
            {scheda('correggi', 'Correggi un errore')}
          </div>
        )}

        {!costo && (
          <>
            {campiVoce}
            <Campo etichetta="Valido dal" tipo="date" valore={dataInizio} onChange={setDataInizio} aiuto="Il mese da cui il costo entra nel cruscotto. Vuoto = da sempre." />
          </>
        )}

        {costo && modo === 'varia' && (
          <>
            <Banner tono="info">
              Per un aumento o un cambio da un certo mese in poi. La voce di oggi si chiude alla fine del mese prima, ne nasce una
              nuova con i valori qui sotto: i mesi passati restano come erano.
            </Banner>
            <Campo
              etichetta="Il cambio vale dal mese di"
              tipo="date"
              valore={dal}
              onChange={setDal}
              obbligatorio
              aiuto={dal ? `La voce attuale vale fino al ${data(fineMesePrecedente(inizioMese(dal)))}, la nuova dal ${data(inizioMese(dal))}.` : undefined}
            />
            {campiVoce}
          </>
        )}

        {costo && modo === 'termina' && (
          <>
            <Banner tono="info">Il costo viene a mancare: conta fino a questa data, i mesi in cui c&apos;era restano nel cruscotto.</Banner>
            <Campo etichetta="Ultimo giorno in cui vale" tipo="date" valore={ultimoGiorno} onChange={setUltimoGiorno} obbligatorio />
          </>
        )}

        {costo && modo === 'correggi' && (
          <>
            <Banner tono="avviso">
              Solo per gli errori (un importo scritto male, la struttura sbagliata): la correzione vale anche per i mesi passati.
            </Banner>
            {campiVoce}
            <Campo etichetta="Valido dal" tipo="date" valore={dataInizio} onChange={setDataInizio} />
          </>
        )}

        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}
