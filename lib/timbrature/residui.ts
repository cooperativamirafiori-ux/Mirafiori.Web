/**
 * Residui di ferie, ex festivita' e flessibilita' come li da' lo Studio paghe.
 *
 * Arrivano una volta al mese dalle stampe GENIUS ("RESIDUO FERIE ROL FEST.SOPP"
 * e "RESIDUO FLESSIBILITA'"), caricate con `scripts/importa-residui.py` nella
 * tabella `residuo_mensile`. Ogni riga e' una fotografia a una data: "ferie
 * residue 25,35 h al 30/09/2026".
 *
 * Qui si mostra quel numero COSI' COM'E', con la sua data (scelta di Dennis,
 * 04/11/2026). Non si sottraggono le ferie timbrate dopo: il rateo che matura
 * nel frattempo lo calcolano le paghe e noi non lo conosciamo, quindi un conto
 * "a oggi" sarebbe sempre un po' sbagliato. Il numero con la data, invece,
 * coincide con la busta paga e si puo' verificare.
 *
 * Quale fotografia: l'ultima scattata entro la fine del mese che si sta
 * guardando. Guardando novembre si vede il residuo al 30/09 finche' non arriva
 * ottobre; guardando un mese per cui non c'e' ancora nessuna fotografia, non si
 * vede niente — meglio il trattino che un residuo di un mese successivo.
 */

import { supabase } from '@/lib/core/supabase'
import type { ResiduoCedolino } from '@/types/timbrature'

/** Dalla voce del file al nome del servizio nelle Timbrature. */
const VOCE_DA_TIPO: Record<string, string> = {
  ferie: 'Ferie',
  festivita_soppresse: 'Fest.Sopp.',
  flessibilita: 'Flessibilità',
}

/**
 * I residui piu' recenti di un dipendente, al massimo uno per voce, fra quelli
 * con data di riferimento entro `fineMese` (YYYY-MM-DD).
 *
 * Se la tabella non esiste ancora o la lettura fallisce torna un elenco vuoto:
 * il riepilogo del mese deve aprirsi comunque, i residui sono un di piu'.
 */
export async function residuiCedolino(dipendenteId: number, fineMese: string): Promise<ResiduoCedolino[]> {
  const { data, error } = await supabase()
    .from('residuo_mensile')
    .select('tipo, mese, al_giorno, residuo_ap, maturate, godute, residuo')
    .eq('dipendente_id', dipendenteId)
    .lte('mese', fineMese)
    .order('mese', { ascending: false })
    .limit(12)
  if (error) {
    console.error('residui cedolino:', error.message)
    return []
  }
  const visti = new Set<string>()
  const out: ResiduoCedolino[] = []
  for (const r of data ?? []) {
    const voce = VOCE_DA_TIPO[r.tipo]
    if (!voce || visti.has(voce)) continue
    visti.add(voce)
    out.push({
      voce,
      residuo: Number(r.residuo),
      residuoAp: r.residuo_ap == null ? null : Number(r.residuo_ap),
      maturate: r.maturate == null ? null : Number(r.maturate),
      godute: r.godute == null ? null : Number(r.godute),
      mese: String(r.mese).slice(0, 7),
      alGiorno: r.al_giorno ? String(r.al_giorno).slice(0, 10) : null,
    })
  }
  return out
}
