/**
 * Le uscite senza fattura: inserimento a mano, correzione, cancellazione.
 *
 * Sono costi con una scadenza che non passano dallo SDI — F24, tributi,
 * contributi, rate, ricariche delle carte — e **non sono un oggetto nuovo**:
 * finiscono in `scadenza` con `fattura_passiva_id` nullo, quindi nelle stesse
 * code, negli stessi totali a 7/30/60/90 giorni e sotto lo stesso tasto
 * PAGATA delle fatture. Il perché sta in supabase/uscite_manuali.sql.
 *
 * Le tre regole di questo file:
 *
 *  1. **Nascono `da_pagare`, mai `da_approvare`.** Chi inserisce a mano ha in
 *     mano il documento e la decisione: la soglia di approvazione resta sulle
 *     fatture. Far approvare l'F24 ogni mese abitua ad approvare senza
 *     guardare, e l'abitudine è il vero rischio (decisione di Dennis, 4 set 2026).
 *  2. **`famiglia_modalita` è 'bonifico'.** Non perché lo sia sempre, ma
 *     perché è la famiglia che passa dalle code: 'automatica' toglierebbe la
 *     riga dalla lista di chi paga, e una riga che nessuno vede è una riga che
 *     nessuno paga.
 *  3. **Si può correggere e cancellare solo quello che non è chiuso.** Una
 *     scadenza pagata è un fatto avvenuto: si annulla il pagamento dalla coda,
 *     e solo dopo si tocca la riga.
 */

import { supabase } from '@/lib/core/supabase'
import type { NaturaUscita, NuovaUscita } from '@/types/pagamenti'

/** Tetto di sicurezza sull'importo: 5 milioni non è una cifra che passa da qui. */
const IMPORTO_MASSIMO = 5_000_000

/** Quanto indietro e quanto avanti può stare una scadenza scritta a mano. */
const ANNI_INDIETRO = 2
const ANNI_AVANTI = 5

const NATURE_VALIDE: NaturaUscita[] = ['costo', 'flusso']

const isoValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

/**
 * Controlla e normalizza quello che arriva dalla mascherina.
 *
 * Torna i messaggi in italiano e al plurale di cortesia perché finiscono
 * diritti sotto il campo sbagliato: un errore che non dice quale campo
 * riguarda costringe a indovinare.
 */
export function validaUscita(input: Partial<NuovaUscita>): {
  ok: true
  valore: NuovaUscita
} | {
  ok: false
  errore: string
  campo: keyof NuovaUscita
} {
  const oggetto = (input.oggetto ?? '').trim()
  if (oggetto.length < 3) {
    return { ok: false, campo: 'oggetto', errore: 'Scrivi cosa si paga: almeno tre caratteri' }
  }
  if (oggetto.length > 200) {
    return { ok: false, campo: 'oggetto', errore: 'Descrizione troppo lunga (massimo 200 caratteri)' }
  }

  const data = (input.dataScadenza ?? '').trim()
  if (!isoValida(data)) {
    return { ok: false, campo: 'dataScadenza', errore: 'Indica la data di scadenza' }
  }
  const anno = Number(data.slice(0, 4))
  const ora = new Date().getFullYear()
  if (anno < ora - ANNI_INDIETRO || anno > ora + ANNI_AVANTI) {
    return {
      ok: false,
      campo: 'dataScadenza',
      errore: `La data sembra sbagliata: ci si aspetta un anno fra ${ora - ANNI_INDIETRO} e ${ora + ANNI_AVANTI}`,
    }
  }

  const importo = Number(input.importo)
  if (!Number.isFinite(importo) || importo === 0) {
    return { ok: false, campo: 'importo', errore: 'Indica l’importo' }
  }
  if (importo < 0) {
    return {
      ok: false,
      campo: 'importo',
      errore: 'L’importo va scritto positivo: qui si registrano uscite',
    }
  }
  if (importo > IMPORTO_MASSIMO) {
    return { ok: false, campo: 'importo', errore: 'Importo fuori scala: ricontrolla la cifra' }
  }

  const natura = input.natura as NaturaUscita
  if (!NATURE_VALIDE.includes(natura)) {
    return { ok: false, campo: 'natura', errore: 'Scegli se è un costo o solo un movimento di cassa' }
  }

  const note = (input.note ?? '').trim()

  return {
    ok: true,
    valore: {
      oggetto,
      dataScadenza: data,
      // Due decimali secchi: un centesimo di troppo nel totale di cassa non si
      // spiega a nessuno.
      importo: Math.round(importo * 100) / 100,
      natura,
      note: note.slice(0, 1000) || undefined,
    },
  }
}

/**
 * Cerca righe che somigliano a quella che si sta inserendo.
 *
 * Non blocca niente: avvisa. Inserire due volte lo stesso F24 è l'errore più
 * probabile di questa mascherina — due persone, o la stessa a distanza di
 * giorni — e a differenza di una fattura non c'è un protocollo che lo impedisca.
 * Stesso importo e scadenza entro tre giorni bastano a far fermare a guardare.
 */
export async function uscitaSimile(v: NuovaUscita): Promise<{ id: string; oggetto: string; dataScadenza: string } | null> {
  const finestra = (giorni: number) => {
    const d = new Date(`${v.dataScadenza}T00:00:00`)
    d.setDate(d.getDate() + giorni)
    return d.toISOString().slice(0, 10)
  }

  const { data, error } = await supabase()
    .from('scadenza')
    .select('id, oggetto, data_scadenza')
    .eq('origine', 'manuale')
    .eq('importo', v.importo)
    .gte('data_scadenza', finestra(-3))
    .lte('data_scadenza', finestra(3))
    .neq('stato', 'stornata')
    .limit(1)

  // Un errore qui non deve impedire l'inserimento: è un aiuto, non un vincolo.
  if (error) return null
  const r = (data ?? [])[0]
  return r ? { id: r.id, oggetto: r.oggetto ?? '', dataScadenza: r.data_scadenza } : null
}

/** Scrive la riga. `da_pagare`, sempre: vedi la regola 1 in testa al file. */
export async function creaUscita(v: NuovaUscita, email: string): Promise<{ id: string }> {
  const { data, error } = await supabase()
    .from('scadenza')
    .insert({
      fattura_passiva_id: null,
      posizione: 1,
      oggetto: v.oggetto,
      natura: v.natura,
      origine: 'manuale',
      inserita_da: email,
      note: v.note ?? null,
      data_scadenza: v.dataScadenza,
      importo: v.importo,
      famiglia_modalita: 'bonifico',
      stato: 'da_pagare',
      stimata: false,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Inserimento dell’uscita: ${error.message}`)
  return { id: (data as { id: string }).id }
}

/**
 * Corregge una riga a mano.
 *
 * Solo le proprie colonne: data, importo, oggetto, natura, note. Lo stato non
 * si tocca da qui — si chiude dalla coda, col tasto PAGATA, come tutto il resto.
 */
export async function modificaUscita(id: string, v: NuovaUscita): Promise<void> {
  const attuale = await leggiManuale(id)
  if (attuale.stato === 'pagata') {
    throw new Error('La scadenza è già pagata: annulla prima il pagamento dalla coda')
  }

  const { error } = await supabase()
    .from('scadenza')
    .update({
      oggetto: v.oggetto,
      natura: v.natura,
      note: v.note ?? null,
      data_scadenza: v.dataScadenza,
      importo: v.importo,
    })
    .eq('id', id)
    .eq('origine', 'manuale')

  if (error) throw new Error(`Modifica dell’uscita: ${error.message}`)
}

/**
 * Cancella una riga a mano.
 *
 * Cancellazione vera, non uno stato: una riga inserita per sbaglio non è un
 * fatto storico da conservare, e lasciarla come 'stornata' sporcherebbe le
 * liste con roba che non è mai esistita. Il log attività tiene la traccia di
 * chi l'ha creata e di chi l'ha tolta, ed è lì che si guarda.
 */
export async function eliminaUscita(id: string): Promise<void> {
  const attuale = await leggiManuale(id)
  if (attuale.stato === 'pagata') {
    throw new Error('La scadenza è già pagata: annulla prima il pagamento dalla coda')
  }

  const { error } = await supabase()
    .from('scadenza')
    .delete()
    .eq('id', id)
    .eq('origine', 'manuale')

  if (error) throw new Error(`Cancellazione dell’uscita: ${error.message}`)
}

/**
 * Legge una riga assicurandosi che sia una riga a mano.
 *
 * È la guardia che impedisce di modificare o cancellare una scadenza da
 * fattura passando il suo id a questi endpoint: quelle le governa l'import, e
 * una modifica a mano verrebbe sovrascritta al caricamento successivo senza
 * che nessuno capisca perché.
 */
async function leggiManuale(id: string): Promise<{ stato: string }> {
  const { data, error } = await supabase()
    .from('scadenza')
    .select('id, stato, origine')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Lettura dell’uscita: ${error.message}`)
  if (!data) throw new Error('Scadenza inesistente')
  if ((data as { origine: string }).origine !== 'manuale') {
    throw new Error('Questa scadenza viene dallo scadenzario: si modifica solo dal gestionale')
  }
  return { stato: (data as { stato: string }).stato }
}
