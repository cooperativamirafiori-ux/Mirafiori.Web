/**
 * Prestazioni occasionali → registro analitico (Supabase).
 *
 * Una pratica scrive UNA riga di costo quando l'importo è definitivo, cioè
 * quando il prestatore ha caricato la notula (stato "Notula ricevuta", poi
 * "Chiusa"):
 *   - centro di costo: quello della pratica;
 *   - voce: PROF "Consulenze e prestazioni professionali" (B7) — decisione di
 *     Dennis del 21 ott 2026;
 *   - importo: il LORDO della notula (la ritenuta è un debito verso l'erario,
 *     non un costo in meno), negativo come vuole il registro;
 *   - competenza: la data di fine della prestazione.
 *
 * Origine `prestazione_occasionale` / id item SharePoint: riscrivere è
 * idempotente, quindi la stessa funzione serve anche quando il centro di costo
 * viene assegnato o cambiato DOPO la notula.
 *
 * **Non lancia mai**, come `riversaNelRegistro` dei Costi: la pratica su
 * SharePoint è la cosa che conta, il registro si riallinea rilanciando.
 */

import { scriviDocumento } from '@/lib/gestione/registro'
import { getCentriDiCosto } from '@/lib/centri-costo/data'
import type { Prestazione } from '@/types/prestazioni'

export const ORIGINE_REGISTRO = 'prestazione_occasionale'
const VOCE = 'PROF'
const STATI_CON_COSTO = new Set(['Notula ricevuta', 'Chiusa'])

export async function riversaPrestazioneNelRegistro(p: Prestazione): Promise<boolean> {
  try {
    if (!STATI_CON_COSTO.has(p.stato)) return false
    if (!p.importoLordo || p.importoLordo <= 0) {
      console.warn(`[prestazioni] ${p.idPrestazione} senza importo lordo: non riversata`)
      return false
    }
    if (!p.centroCostoId) {
      console.warn(`[prestazioni] ${p.idPrestazione} senza centro di costo: non riversata`)
      return false
    }
    const cc = (await getCentriDiCosto()).find((c) => c.id === p.centroCostoId)
    if (!cc?.codice) {
      console.warn(`[prestazioni] centro di costo ${p.centroCostoId} non risolto: ${p.idPrestazione} non riversata`)
      return false
    }
    const competenza = (p.dataFine || p.dataInserimento || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(competenza)) return false

    await scriviDocumento(ORIGINE_REGISTRO, p.spItemId, [
      {
        dataCompetenza: competenza,
        ccCodice: cc.codice,
        tipo: 'costo',
        voce: VOCE,
        importo: -Math.abs(p.importoLordo),
        controparte: `${p.cognome} ${p.nome}`.trim(),
        fonte: 'prestazione_occasionale',
        confidenza: 'certa',
        motivo: 'centro di costo scritto sulla pratica',
        note: p.idPrestazione,
      },
    ])
    return true
  } catch (err) {
    console.error(`[prestazioni] riversamento nel registro fallito (${p.idPrestazione}):`, err)
    return false
  }
}
