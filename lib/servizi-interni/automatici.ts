/**
 * Addebiti automatici: la porta con cui le altre aree ribaltano un costo su un
 * altro centro di costo usando lo STESSO strumento degli addebiti a mano.
 * Deciso con Dennis il 2/11/2026 (docs/servizi-interni-piano.md, § Ribaltamento).
 *
 * Oggi le sorgenti sono due, entrambe di Cura Ambienti (cc24):
 *   - `lavoro_cura_ambienti`: un Lavoro consuntivato per una struttura;
 *   - `manutenzione`: i costi di una richiesta di manutenzione, uno per mese.
 *
 * Chi chiama passa le righe già calcolate (descrizione + importo, al costo): qui
 * non si conoscono tariffe né regole delle aree. La scrittura passa da UNA
 * funzione SQL (`addebito_automatico_riscrivi`) che fa testata e righe in una
 * transazione e rifiuta se il mese è chiuso.
 */

import { supabase } from '@/lib/core/supabase'
import { bloccato, meseDiAddebito, primoMeseAperto } from './flusso'

export { meseDiAddebito, primoMeseAperto }

export type OrigineAutomatica = 'lavoro_cura_ambienti' | 'manutenzione'

export interface RigaAutomatica {
  descrizione: string
  importo: number
}

export function meseChiuso(mese: string): boolean {
  return bloccato(mese)
}

/**
 * Scrive (o toglie, con `righe` vuoto) l'addebito automatico di un'origine in un
 * mese. Righe a zero o senza importo si scartano: un addebito automatico porta
 * solo cifre vere.
 */
export async function riscriviAddebitoAutomatico(opts: {
  origine: OrigineAutomatica
  origineId: string
  mese: string
  ccDa: string
  ccA: string
  descrizione: string
  strutturaCodice?: string | null
  strutturaNome?: string | null
  righe: RigaAutomatica[]
  utente: string
}): Promise<string | null> {
  const righe = opts.righe
    .filter((r) => Number.isFinite(r.importo) && Math.round(r.importo * 100) > 0)
    .map((r) => ({ descrizione: r.descrizione.trim().slice(0, 300) || 'Costo', importo: Math.round(r.importo * 100) / 100 }))
  const { data, error } = await supabase().rpc('addebito_automatico_riscrivi', {
    p_origine_tipo: opts.origine,
    p_origine_id: opts.origineId,
    p_mese: opts.mese,
    p_cc_da: opts.ccDa.toLowerCase(),
    p_cc_a: opts.ccA.toLowerCase(),
    p_descrizione: opts.descrizione.trim().slice(0, 500) || 'Addebito',
    p_struttura_codice: opts.strutturaCodice ?? null,
    p_struttura_nome: opts.strutturaNome ?? null,
    p_righe: righe,
    p_utente: opts.utente,
  })
  if (error) throw new Error(error.message.includes('mese chiuso') ? error.message : `Addebito interno non aggiornato: ${error.message}`)
  return (data as string | null) ?? null
}

/** Toglie tutti gli addebiti di un'origine nei mesi ancora aperti (es. Lavoro annullato o spostato). */
export async function togliAddebitiAperti(origine: OrigineAutomatica, origineId: string, utente: string, tranneMese?: string) {
  const { data, error } = await supabase()
    .from('addebito_interno')
    .select('mese, cc_da, cc_a, descrizione')
    .eq('origine_tipo', origine)
    .eq('origine_id', origineId)
  if (error) throw new Error(`Addebiti interni: ${error.message}`)
  for (const r of data ?? []) {
    const mese = String(r.mese)
    if (mese === tranneMese || bloccato(mese)) continue
    await riscriviAddebitoAutomatico({
      origine, origineId, mese, ccDa: r.cc_da, ccA: r.cc_a, descrizione: r.descrizione, righe: [], utente,
    })
  }
}
