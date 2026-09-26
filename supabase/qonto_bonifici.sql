-- ============================================================
-- Qonto · richieste di bonifico dall'app (26/09/2026)
--
-- La chiave API non può creare richieste di bonifico (401 "OAuth2
-- authentication is required here", provato il 26/09/2026): serve OAuth, con
-- il token dell'account di Dennis. Le richieste risultano a nome suo e le
-- approva Claudia nell'app Qonto, con la conferma di sicurezza (SCA).
-- ============================================================

-- --- 1. Il token OAuth, una riga sola -----------------------------------------
-- ⚠️ Il refresh token è MONOUSO: ogni rinnovo lo brucia e ne dà uno nuovo. Se
-- due richieste rinnovassero insieme, una delle due userebbe un token già
-- morto. Per questo chi rinnova prende prima il "turno" (`rinnovo_fino`) con
-- un update condizionato: vince uno solo, gli altri aspettano e rileggono.
-- RLS attiva e nessuna policy: lo legge solo il server (service role).
create table if not exists qonto_token (
  id                  int primary key default 1 check (id = 1),
  access_token        text,
  access_scade_il     timestamptz,
  refresh_token       text not null,
  refresh_rinnovato_il timestamptz not null default now(), -- vale ~90 giorni da qui
  scope               text,
  autorizzato_da      text,                                -- account Qonto che ha fatto il login
  rinnovo_fino        timestamptz,                         -- turno di chi sta rinnovando
  aggiornato_il       timestamptz not null default now()
);
alter table qonto_token enable row level security;

-- --- 2. Lo stato dell'invio sulla scadenza ------------------------------------
-- Una scadenza inviata resta "da pagare" finché Qonto non dice approvata (→
-- pagata, origine banca) o rifiutata (→ torna inviabile, con il motivo).
alter table scadenza add column if not exists qonto_richiesta_id text;
alter table scadenza add column if not exists qonto_stato text;
alter table scadenza drop constraint if exists scadenza_qonto_stato_check;
alter table scadenza add constraint scadenza_qonto_stato_check
  check (qonto_stato in ('invio', 'pending', 'approved', 'declined', 'canceled'));
alter table scadenza add column if not exists qonto_inviata_il timestamptz;
alter table scadenza add column if not exists qonto_inviata_da text;
alter table scadenza add column if not exists qonto_conto_iban text;  -- sottoconto di partenza
create index if not exists scadenza_qonto_richiesta_idx on scadenza (qonto_richiesta_id) where qonto_richiesta_id is not null;
