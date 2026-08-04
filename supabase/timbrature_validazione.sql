-- ============================================================================
-- TIMBRATURE — flusso di validazione mensile
-- ----------------------------------------------------------------------------
-- Da eseguire UNA VOLTA nel SQL editor di Supabase, dopo timbrature_schema.sql.
--
-- Cosa cambia rispetto al primo impianto:
--   * il mese non ha piu' due soli stati (aperto/chiuso) ma segue un percorso:
--       aperto -> da_validare -> validato -> confermato
--     con la deviazione "contestato" quando il dipendente segnala un errore.
--   * l'operatore puo' toccare solo gli ultimi 3 giorni (oggi + i due
--     precedenti): il "5 del mese successivo" non esiste piu'.
--   * si tiene traccia di chi modifica una riga dopo l'inserimento, perche' dal
--     nuovo flusso il responsabile puo' correggere le righe dei suoi.
-- ============================================================================

-- --- 1) stato del mese: nuovi stati e tracciamento del percorso -------------
alter table chiusura_mese drop constraint if exists chiusura_mese_stato_check;

alter table chiusura_mese
  add column if not exists validato_da        text,
  add column if not exists validato_il        timestamptz,
  add column if not exists confermato_da      text,
  add column if not exists confermato_il      timestamptz,
  add column if not exists confermato_forzato boolean not null default false,
  add column if not exists contestato_il      timestamptz,
  add column if not exists note_contestazione text,
  add column if not exists token              text,
  add column if not exists file_pdf_url       text,
  add column if not exists ultimo_sollecito   date;

-- I mesi chiusi con il vecchio flusso erano di fatto gia' definitivi.
update chiusura_mese set stato = 'confermato' where stato = 'chiuso';

alter table chiusura_mese
  add constraint chiusura_mese_stato_check
  check (stato in ('aperto','da_validare','validato','confermato','contestato'));

-- Il token del link nella mail: univoco, e presente solo quando serve.
create unique index if not exists idx_chiusura_token
  on chiusura_mese (token) where token is not null;

-- --- 2) chi ha toccato la riga dopo l'inserimento ---------------------------
alter table timbratura
  add column if not exists modificata_da   text,
  add column if not exists modificata_il   timestamptz,
  -- true quando a scrivere non e' stato il diretto interessato: nel foglio ore
  -- la differenza va vista, altrimenti "mi hanno cambiato le ore" resta una
  -- discussione senza prove.
  add column if not exists per_conto       boolean not null default false;

-- --- 3) il cruscotto del responsabile filtra per referente ------------------
create index if not exists idx_dipendente_referente on dipendente (referente_email);
