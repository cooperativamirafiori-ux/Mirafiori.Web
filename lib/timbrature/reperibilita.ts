/**
 * Giornata di reperibilita': una spunta per GIORNATA, indipendente dalle ore.
 *
 * Si puo' essere reperibili senza lavorare nemmeno un'ora, quindi la spunta sta
 * su una tabella sua, una riga per persona e per giorno. Non tocca nessun
 * conteggio: le HR la vedono nel riepilogo e nel foglio ore e liquidano un
 * forfait per ogni giornata.
 *
 * DUE COSE DIVERSE, entrambe da tenere:
 *   - giornata di reperibilita' (qui): ero reperibile quel giorno → forfait;
 *   - `timbratura.reperibilita` sulla riga di lavoro: sono stato chiamato a fare
 *     un servizio mentre ero reperibile → pagamento maggiorato.
 *
 * Chi puo' spuntarla: le stesse regole delle ORE DI LAVORO, perche' e' lo stesso
 * tipo di dichiarazione ("cosa ho fatto quel giorno"):
 *   - il dipendente: oggi e i due giorni precedenti, mai in anticipo, mese aperto;
 *   - responsabile e HR, per conto: finche' il foglio non e' validato.
 */

import { supabase } from '@/lib/core/supabase'
import { assertScrivibile } from '@/lib/timbrature/righe'

const TABELLA = 'giornata_reperibilita'

/** Le date (YYYY-MM-DD) dichiarate di reperibilita' fra from e to, inclusi. */
export async function listGiornateReperibilita(
  dipendenteId: number,
  from: string,
  to: string,
): Promise<string[]> {
  const { data, error } = await supabase()
    .from(TABELLA)
    .select('data')
    .eq('dipendente_id', dipendenteId)
    .gte('data', from)
    .lte('data', to)
    .order('data', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => String(r.data).slice(0, 10))
}

/**
 * Accende o spegne la spunta di una giornata. Idempotente: rimettere la stessa
 * spunta non e' un errore, e' quello che succede con un doppio tocco.
 */
export async function impostaReperibilita(
  dipendenteId: number,
  data: string,
  attiva: boolean,
  autore: string,
  opts: { perConto?: boolean } = {},
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data non valida')
  const perConto = !!opts.perConto
  await assertScrivibile(dipendenteId, data, 'lavoro', perConto)

  if (attiva) {
    const { error } = await supabase()
      .from(TABELLA)
      .upsert(
        { dipendente_id: dipendenteId, data, per_conto: perConto, creata_da: autore },
        { onConflict: 'dipendente_id,data', ignoreDuplicates: true },
      )
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase()
      .from(TABELLA)
      .delete()
      .eq('dipendente_id', dipendenteId)
      .eq('data', data)
    if (error) throw new Error(error.message)
  }
}
