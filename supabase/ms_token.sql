-- ============================================================================
-- Tabella dei token delegati Microsoft per l'area Risorse Umane.
--
-- Perché non nel cookie di sessione: un access token Graph pesa 2-3 KB e il
-- refresh token circa 1 KB. Si supera il limite di 4 KB del cookie e NextAuth
-- lo spezza in più parti, con comportamenti fragili.
--
-- I due token sono cifrati AES-256-GCM lato applicazione (lib/ms-token.ts) con
-- la chiave in env TOKEN_ENC_KEY: chi legge il database non ottiene token usabili.
--
-- Nessuna policy RLS: l'accesso avviene esclusivamente con la service role key
-- server-side. RLS attiva + zero policy = tabella inaccessibile a chiunque altro,
-- comprese le chiavi anon/authenticated.
--
-- Riferimento: docs/piano-ru-sito-dedicato-accesso-delegato.md §5
-- Esecuzione: Supabase → SQL Editor → incolla ed esegui. Idempotente.
-- ============================================================================

create table if not exists public.ms_token (
  email         text primary key,
  access_token  text        not null,   -- cifrato
  refresh_token text        not null,   -- cifrato
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);

comment on table  public.ms_token          is 'Token delegati Microsoft Graph per area RU. Contenuto cifrato AES-256-GCM.';
comment on column public.ms_token.email    is 'Email dell''utente, minuscola. Chiave primaria.';
comment on column public.ms_token.updated_at is 'Usata per la scrittura ottimistica durante il rinnovo concorrente.';

-- Serve al rinnovo: trova le righe in scadenza senza scansione completa.
create index if not exists ms_token_expires_at_idx on public.ms_token (expires_at);

alter table public.ms_token enable row level security;

-- Nessuna policy, di proposito: solo la service role key può accedere.
-- Se in futuro servisse una policy, va aggiunta qui con motivazione esplicita.

-- ---------------------------------------------------------------------------
-- Verifica
-- ---------------------------------------------------------------------------
-- select tablename, rowsecurity from pg_tables where tablename = 'ms_token';
--   -> rowsecurity deve essere true
-- select count(*) from pg_policies where tablename = 'ms_token';
--   -> deve essere 0
