-- ============================================================================
-- Timbrature — chi NON timbra (settembre 2026)
-- ----------------------------------------------------------------------------
-- Da eseguire UNA VOLTA nel SQL editor del progetto Supabase, in un colpo solo.
-- Idempotente: si può rieseguire senza effetti collaterali.
--
-- IL PROBLEMA
-- Alcune persone non timbrano — i responsabili, e le squadre il cui foglio ore
-- lo compila la responsabile per tutti (Locanda). Il foglio ore però va fatto
-- lo stesso, perché è quello che finisce in Pulse. Per loro l'orario è quello
-- teorico, sempre uguale: l'unica cosa da inserire è quando NON hanno lavorato,
-- e perché.
--
-- LA FORMA
--   1) `dipendente.non_timbra`  — la spunta. Chi ce l'ha non compila giorno per
--      giorno: il mese si riempie da profilo con un bottone.
--   2) `profilo_fascia`         — l'orario teorico vero e proprio. Il profilo
--      diceva quante ore, non a che ora: una riga di lavoro vuole ingresso e
--      uscita, quindi senza queste fasce non c'è niente da generare.
--   3) `timbratura.origine`     — 'profilo' marca le righe nate dal bottone.
--      Serve a due cose che senza questa colonna non si possono fare: rigenerare
--      il mese senza toccare quello che ha scritto una persona, e lasciare che
--      un giustificativo scavalchi una giornata teorica (la mutua si sa il
--      giorno dopo, quando la riga generata c'è già).
-- ============================================================================

begin;

-- --- 1) la spunta -----------------------------------------------------------
-- Distinta da `attivo`: chi non timbra è comunque attivo, ha un foglio ore, un
-- monte ore, uno scostamento e un mese da validare come tutti. Cambia solo il
-- modo in cui le righe entrano nel database.
alter table dipendente
  add column if not exists non_timbra boolean not null default false;

comment on column dipendente.non_timbra is
  'La persona non compila il foglio ore giorno per giorno: il mese si genera '
  'dall''orario teorico (profilo_fascia) con il bottone "Compila il mese". '
  'Si governa dall''anagrafica Risorse Umane, campo NonTimbra.';

-- --- 2) l'orario teorico ----------------------------------------------------
-- Figlia di profilo_orario e non di dipendente: l'orario teorico cambia quando
-- cambia il contratto, e deve cambiare CON la stessa decorrenza. Appesa al
-- dipendente, un passaggio a part-time riscriverebbe in silenzio anche i mesi
-- già chiusi.
--
-- Più righe per giorno: è così che si esprime la pausa pranzo (9-13 e 14-18) e
-- il servizio diverso nella stessa giornata.
create table if not exists profilo_fascia (
  id           serial  primary key,
  profilo_id   int     not null references profilo_orario(id) on delete cascade,
  giorno       int     not null check (giorno between 1 and 7),   -- ISO: 1=lun, 7=dom
  ora_inizio   time    not null,
  ora_fine     time    not null,
  servizio_id  int     not null references servizio(id),
  constraint profilo_fascia_orari_coerenti check (ora_fine > ora_inizio)
);

create index if not exists idx_profilo_fascia_profilo on profilo_fascia (profilo_id, giorno);

comment on table profilo_fascia is
  'Orario teorico di una variazione di profilo: a che ora si entra e si esce, '
  'su quale servizio. Serve solo a chi non timbra, per generare le righe del '
  'mese. Le ore del giorno (profilo_orario.ore_lun...) sono la somma delle sue '
  'fasce quando ce ne sono.';
comment on column profilo_fascia.servizio_id is
  'Su quale servizio cadono queste ore, e quindi su quale centro di costo. '
  'Per giorno, perché un coordinatore può stare in due strutture diverse.';

-- --- 3) da dove viene la riga -----------------------------------------------
-- Default 'manuale': tutte le righe già in tabella sono state scritte da una
-- persona, ed è esattamente quello che la colonna deve dire di loro.
alter table timbratura
  add column if not exists origine text not null default 'manuale';

alter table timbratura drop constraint if exists timbratura_origine_valida;
alter table timbratura add  constraint timbratura_origine_valida
  check (origine in ('manuale', 'profilo'));

comment on column timbratura.origine is
  'manuale = scritta da una persona; profilo = generata dall''orario teorico '
  'con "Compila il mese". Solo le righe profilo vengono sostituite da una '
  'rigenerazione o scavalcate da un giustificativo: quelle manuali non si '
  'toccano mai da sole.';

create index if not exists idx_timbratura_origine on timbratura (dipendente_id, data, origine);

commit;

-- ------------------------------------------------------------------ verifica
-- Attese: non_timbra su dipendente, origine su timbratura, profilo_fascia a 0
-- righe, e tutte le righe esistenti marcate 'manuale'.
select
  (select count(*) from information_schema.columns
     where table_name = 'dipendente' and column_name = 'non_timbra')   as col_non_timbra,
  (select count(*) from information_schema.columns
     where table_name = 'timbratura' and column_name = 'origine')      as col_origine,
  (select count(*) from profilo_fascia)                                as fasce,
  (select count(*) from timbratura where origine = 'manuale')          as righe_manuali,
  (select count(*) from timbratura where origine = 'profilo')          as righe_da_profilo;
