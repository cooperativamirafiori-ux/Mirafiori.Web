/**
 * Ribaltamento dei Lavori di Cura Ambienti sul centro di costo della struttura
 * (deciso con Dennis il 2/11/2026, docs/servizi-interni-piano.md § Ribaltamento).
 *
 * Un Lavoro consuntivato per una struttura diventa un addebito interno
 * cc24 → CC della struttura, con una riga per figura (ore × tariffa del mese)
 * più i materiali. Lo stesso strumento degli addebiti scritti a mano.
 *
 * Il mese dell'addebito è quello del Lavoro, se quando è stato consuntivato era
 * ancora aperto; altrimenti il primo mese aperto in quel momento (si rettifica
 * nel mese seguente). Si ricava da `consuntivatoIl`, quindi non cambia da solo.
 * Quando quel mese chiude il Lavoro diventa «addebitato» e non si modifica più.
 *
 * I lavori per un cliente esterno non si addebitano: si fatturano.
 */

import { supabase } from '@/lib/core/supabase'
import { riscriviAddebitoAutomatico, togliAddebitiAperti, meseChiuso } from '@/lib/servizi-interni/automatici'
import { getLavoro, getTariffe, getTariffeStrutture } from './data'
import { meseAddebitoLavoro, righeAddebito, tariffeDi } from './flusso'
import { CC_CURA_AMBIENTI } from '@/types/cura-ambienti'

const CHIUSI = ['consuntivato', 'addebitato']

/**
 * Riscrive l'addebito di un Lavoro dal suo stato attuale. Ritorna un avviso da
 * mostrare se il Lavoro avrebbe dovuto addebitare e non può (es. manca la tariffa).
 */
export async function ribaltaLavoro(id: string, utente: string): Promise<string | null> {
  const l = await getLavoro(id)
  if (!l) {
    await togliAddebitiAperti('lavoro_cura_ambienti', id, utente)
    return null
  }
  const addebita =
    CHIUSI.includes(l.stato) && l.destinatario === 'struttura' && !!l.ccCodice && l.ccCodice.toLowerCase() !== CC_CURA_AMBIENTI
  const mese = meseAddebitoLavoro(l)

  if (!addebita) {
    await togliAddebitiAperti('lavoro_cura_ambienti', id, utente)
    return null
  }
  if (meseChiuso(mese)) return null // già fermo: niente da riscrivere

  const [base, strutture] = await Promise.all([getTariffe(l.mese), getTariffeStrutture(l.mese)])
  const righe = righeAddebito(l, tariffeDi(base, strutture, l.strutturaCodice))
  // Se il mese dell'addebito è cambiato (lavoro spostato), il vecchio sparisce.
  await togliAddebitiAperti('lavoro_cura_ambienti', id, utente, mese)
  await riscriviAddebitoAutomatico({
    origine: 'lavoro_cura_ambienti',
    origineId: id,
    mese,
    ccDa: CC_CURA_AMBIENTI,
    ccA: l.ccCodice!,
    descrizione: `Cura Ambienti n. ${l.numero}: ${l.titolo}${mese !== l.mese ? ` (lavoro di ${l.mese.slice(5, 7)}/${l.mese.slice(0, 4)})` : ''}`,
    strutturaCodice: l.strutturaCodice,
    strutturaNome: l.strutturaNome,
    righe: righe ?? [],
    utente,
  })
  return righe === null ? 'Lavoro consuntivato, ma non addebitato alla struttura: manca la tariffa di una figura per quel mese.' : null
}

/**
 * Giro notturno: i Lavori consuntivati il cui mese di addebito è chiuso
 * diventano «addebitati». È l'unico posto che mette quello stato.
 */
export async function segnaLavoriAddebitati(): Promise<number> {
  const { data, error } = await supabase()
    .from('lavoro_cura_ambienti')
    .select('id, mese, consuntivato_il')
    .eq('stato', 'consuntivato')
    .eq('destinatario', 'struttura')
  if (error) throw new Error(`Lavori: ${error.message}`)
  const fermi = (data ?? [])
    .filter((r: any) => meseChiuso(meseAddebitoLavoro({ mese: String(r.mese).slice(0, 10), consuntivatoIl: r.consuntivato_il })))
    .map((r: any) => r.id as string)
  if (!fermi.length) return 0
  const { error: e2 } = await supabase()
    .from('lavoro_cura_ambienti')
    .update({ stato: 'addebitato', aggiornato_il: new Date().toISOString() })
    .in('id', fermi)
    .eq('stato', 'consuntivato')
  if (e2) throw new Error(`Lavori addebitati: ${e2.message}`)
  return fermi.length
}

/** Gli id dei Lavori che possono avere un addebito in un mese ancora aperto: per riallineare. */
export async function lavoriDaRiallineare(): Promise<string[]> {
  const db = supabase()
  const [{ data: lavori, error }, { data: addebiti }] = await Promise.all([
    db.from('lavoro_cura_ambienti').select('id').eq('stato', 'consuntivato'),
    db.from('addebito_interno').select('origine_id, mese').eq('origine_tipo', 'lavoro_cura_ambienti'),
  ])
  if (error) throw new Error(`Lavori: ${error.message}`)
  const ids = new Set<string>((lavori ?? []).map((l: any) => l.id))
  for (const a of addebiti ?? []) if (!meseChiuso(String(a.mese))) ids.add(a.origine_id)
  return [...ids]
}
