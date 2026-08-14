'use client'

/**
 * Cosa va fatturato: documento, importo, IVA, data, incasso.
 *
 * **Quello che compare qui dipende dal centro di costo.** Se il centro di costo
 * ha un regime configurato (`regimeDi` in types/fatture.ts) l'IVA non si chiede:
 * l'etichetta del campo importo dice già cosa scrivere («totale pagato dal
 * cliente, IVA 10% compresa») e sotto compare lo scorporo calcolato. Altrimenti
 * il modulo ripiega sulle domande esplicite, con «non lo so» fra le risposte
 * ammesse — meglio un caso segnalato che un'aliquota indovinata.
 *
 * Lo stesso vale per il tipo di documento: dove il regime è noto si fatturano
 * prestazioni, non si emettono note di credito, quindi il campo non c'è.
 */

import { Campo } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import {
  ALIQUOTE,
  FUORI_CAMPO,
  GIORNI_EMISSIONE,
  GIORNI_INVIO,
  MEZZI_PAGAMENTO,
  NATURE_IMPORTO,
  TIPI_DOCUMENTO,
  calcoloIva,
  etichettaImporto,
  puntualita,
  regimeDi,
  type NuovaRichiestaFatturaInput,
} from '@/types/fatture'

const euro = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)

export function CosaFatturare({
  valori,
  errori,
  set,
}: {
  valori: NuovaRichiestaFatturaInput
  errori: Record<string, string>
  set: <K extends keyof NuovaRichiestaFatturaInput>(
    k: K,
    v: NuovaRichiestaFatturaInput[K],
  ) => void
}) {
  const regime = regimeDi(valori.centroCosto)
  const iva = calcoloIva(valori)
  const tempi = puntualita(valori.dataPrestazione)
  const nota = valori.tipoDocumento !== 'Fattura'

  return (
    <>
      {regime.daChiedere && (
        <Campo
          etichetta="Documento da emettere"
          tipo="choice"
          scelte={TIPI_DOCUMENTO}
          valore={valori.tipoDocumento}
          onChange={(v) => set('tipoDocumento', v as NuovaRichiestaFatturaInput['tipoDocumento'])}
          vuoto="Fattura"
        />
      )}

      {nota && (
        <Campo
          etichetta="Fattura da rettificare"
          valore={valori.riferimentoDocumento}
          onChange={(v) => set('riferimentoDocumento', v)}
          obbligatorio
          errore={errori.riferimentoDocumento}
          segnaposto="Numero e data, es. 214 del 12/07/2026"
        />
      )}

      <Campo
        etichetta="Descrizione"
        tipo="textarea"
        righe={2}
        valore={valori.descrizione}
        onChange={(v) => set('descrizione', v)}
        obbligatorio
        errore={errori.descrizione}
        segnaposto="Es. Cena per 4 persone del 10/08"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Campo
          etichetta={etichettaImporto(regime)}
          tipo="currency"
          min={0}
          valore={valori.importo}
          onChange={(v) => set('importo', v)}
          obbligatorio
          errore={errori.importo}
          segnaposto="0,00"
          aiuto={
            iva.scorporo && !regime.daChiedere
              ? `Imponibile ${euro(iva.scorporo.imponibile)} + IVA ${euro(iva.scorporo.iva)}`
              : undefined
          }
        />
        <Campo
          etichetta="Data della prestazione"
          tipo="date"
          valore={valori.dataPrestazione}
          onChange={(v) => {
            set('dataPrestazione', v)
            // L'incasso di norma avviene il giorno della prestazione: si propone
            // quella data, e chi l'ha già cambiata a mano non se la vede toccare.
            if (!valori.dataIncasso || valori.dataIncasso === valori.dataPrestazione) {
              set('dataIncasso', v)
            }
          }}
          obbligatorio
          errore={errori.dataPrestazione}
          aiuto={`Mandaci la richiesta entro ${GIORNI_INVIO} giorni: la fattura va emessa entro ${GIORNI_EMISSIONE}.`}
        />
      </div>

      {tempi.stato === 'oltre il termine' && (
        <Banner tono="errore">
          La prestazione risale a {tempi.giorni} giorni: il termine di emissione è{' '}
          {GIORNI_EMISSIONE} giorni. Puoi inviare comunque — la richiesta arriverà segnalata come
          tardiva.
        </Banner>
      )}
      {tempi.stato === 'in ritardo' && (
        <Banner tono="avviso">
          La prestazione risale a {tempi.giorni} giorni: sei ancora nei {GIORNI_EMISSIONE}, ma
          mandale prima la prossima volta.
        </Banner>
      )}
      {tempi.stato === 'futura' && (
        <Banner tono="info">La data della prestazione è nel futuro: controlla che sia voluto.</Banner>
      )}

      {/* IVA: solo dove il centro di costo non la decide già */}
      {regime.daChiedere && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo
              etichetta="L'importo che hai scritto è"
              tipo="choice"
              scelte={NATURE_IMPORTO}
              valore={valori.naturaImporto}
              onChange={(v) => set('naturaImporto', v as NuovaRichiestaFatturaInput['naturaImporto'])}
              obbligatorio
              errore={errori.naturaImporto}
              vuoto="— Scegli —"
            />
            <Campo
              etichetta="IVA"
              tipo="choice"
              scelte={ALIQUOTE}
              valore={valori.aliquota}
              onChange={(v) => set('aliquota', v)}
              obbligatorio
              errore={errori.aliquota}
              vuoto="— Scegli —"
              aiuto="Se non sai quale si applica, dillo: la decide chi fa la fattura."
            />
          </div>
          {valori.aliquota === FUORI_CAMPO && (
            <Campo
              etichetta="Articolo che esclude l'operazione dall'IVA"
              valore={valori.articoloEsclusione}
              onChange={(v) => set('articoloEsclusione', v)}
              obbligatorio
              errore={errori.articoloEsclusione}
              segnaposto="Es. art. 10 DPR 633/72"
            />
          )}
          {iva.scorporo && (
            <p className="text-sm text-gray-500">
              Imponibile {euro(iva.scorporo.imponibile)} + IVA {euro(iva.scorporo.iva)} ={' '}
              <strong>{euro(iva.scorporo.totale)}</strong>
            </p>
          )}
        </>
      )}

      {/* Incasso */}
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={valori.incassato}
          onChange={(e) => {
            set('incassato', e.target.checked)
            if (e.target.checked && !valori.dataIncasso) set('dataIncasso', valori.dataPrestazione)
          }}
          className="w-4 h-4 rounded border-gray-300 text-brand-cyan focus:ring-brand-cyan"
        />
        La prestazione è già stata pagata
      </label>

      {valori.incassato && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo
            etichetta="Come è stato pagato"
            tipo="choice"
            scelte={MEZZI_PAGAMENTO}
            valore={valori.mezzoPagamento}
            onChange={(v) => set('mezzoPagamento', v)}
            obbligatorio
            errore={errori.mezzoPagamento}
            vuoto="— Scegli —"
          />
          <Campo
            etichetta="Data dell'incasso"
            tipo="date"
            valore={valori.dataIncasso}
            onChange={(v) => set('dataIncasso', v)}
            obbligatorio
            errore={errori.dataIncasso}
          />
        </div>
      )}
    </>
  )
}
