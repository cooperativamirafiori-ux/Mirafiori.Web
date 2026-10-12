/**
 * Client Supabase per accesso SOLO server-side (service role key).
 * Non importare mai in un componente client: la service role key bypassa la RLS.
 *
 * Env richieste (vedi .env.example):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase non configurato: impostare SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

/**
 * Tutte le righe di una lettura, pagina per pagina.
 *
 * PostgREST restituisce al massimo un tetto di righe per chiamata (1000 di
 * default) e lo fa in silenzio: una lettura "di tutti" che supera il tetto torna
 * troncata senza errore. Serve alle letture in blocco (il cruscotto legge le
 * righe di tutti i dipendenti insieme), che il tetto lo superano davvero.
 *
 * `pagina(da, a)` deve costruire la query con `.range(da, a)` e un ordinamento
 * stabile (che finisca su una chiave unica), altrimenti le pagine si sovrappongono.
 * Si va avanti finche' arriva una pagina vuota: cosi' funziona anche se il tetto
 * del progetto e' piu' basso di quello chiesto.
 */
export async function tutteLeRighe<T = any>(
  pagina: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGINA = 1000
  const out: T[] = []
  for (;;) {
    const { data, error } = await pagina(out.length, out.length + PAGINA - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) return out
    out.push(...data)
  }
}
