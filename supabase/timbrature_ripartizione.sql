-- ============================================================================
-- Timbrature — ripartizione delle ore per servizio, per chi non timbra
-- (novembre 2026)
-- ----------------------------------------------------------------------------
-- Da eseguire UNA VOLTA nel SQL editor del progetto Supabase, PRIMA del deploy
-- del codice che la legge. Idempotente: si può rieseguire.
--
-- IL PROBLEMA
-- I responsabili d'area non timbrano: il loro mese si genera dall'orario
-- teorico (profilo_fascia). Ma il loro lavoro non sta su un servizio solo: lo
-- dividono su più centri di costo, in quote fisse ("20 ore su Ed. amb. Nord,
-- 18 su Progettazione"). Scriverlo come fasce orarie ("dalle 9 alle 13 qui")
-- vorrebbe dire inventare orari che nessuno fa.
--
-- LA FORMA
-- Figlia di profilo_orario, come le fasce: segue la stessa decorrenza. Se a
-- maggio cambia la divisione, HR registra una variazione "dal 1/5" che riparte
-- dalla precedente, e cambia solo la ripartizione. I mesi già passati restano
-- con quella vecchia.
--
-- Le ore sono SETTIMANALI e la loro somma deve fare il totale settimanale
-- dell'orario teorico (lo controlla l'app al salvataggio). "Compila il mese"
-- divide ogni giornata nelle stesse proporzioni: giorno per giorno, non sul
-- mese. Se la ripartizione è vuota vale il servizio scritto sulla fascia, come
-- prima.
-- ============================================================================

begin;

create table if not exists profilo_ripartizione (
  id               serial  primary key,
  profilo_id       int     not null references profilo_orario(id) on delete cascade,
  servizio_id      int     not null references servizio(id),
  ore_settimanali  numeric not null check (ore_settimanali > 0),
  ordine           int     not null default 0,
  unique (profilo_id, servizio_id)
);

-- Come profilo_fascia: RLS accesa e nessuna policy. L'app legge e scrive solo
-- lato server con la service role, che la scavalca; dal browser niente.
alter table profilo_ripartizione enable row level security;

create index if not exists idx_profilo_ripartizione_profilo on profilo_ripartizione (profilo_id);

comment on table profilo_ripartizione is
  'Per chi non timbra: come si dividono le ore settimanali fra i servizi (e '
  'quindi i centri di costo). Somma = totale settimanale dell''orario teorico. '
  '"Compila il mese" divide ogni giornata in queste proporzioni; vuota = vale '
  'il servizio della fascia.';

commit;

-- ------------------------------------------------------------------ verifica
-- Attesa: una riga con tabella = 1 e righe = 0.
select
  (select count(*) from information_schema.tables where table_name = 'profilo_ripartizione') as tabella,
  (select count(*) from profilo_ripartizione)                                                as righe;
