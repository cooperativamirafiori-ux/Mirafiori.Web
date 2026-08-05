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
