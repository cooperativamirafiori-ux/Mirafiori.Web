-- ============================================================================
-- Timbrature — migrazione di agosto 2026
--
-- Da eseguire UNA VOLTA nel SQL editor di Supabase, in un colpo solo.
-- Copre due cambiamenti insieme:
--
--   A) ingresso/uscita obbligatori — le ore non si digitano più, si ricavano
--      dagli orari. Le righe di prova (inserite quando le ore erano un campo)
--      non hanno orari e sono incompatibili col nuovo vincolo.
--
--   B) anagrafica alimentata dalle Risorse Umane — non più auto-creazione al
--      primo accesso. Le righe `dipendente` esistenti sono state create
--      automaticamente, hanno il nome nel formato sbagliato ("Mario Rossi"
--      invece di "Rossi Mario"), nessun referente e nessun monte ore: vanno
--      rifatte dalla sincronizzazione con l'anagrafica RU.
--
-- COSA VIENE SVUOTATO: dipendente, profilo_orario, timbratura, chiusura_mese.
-- COSA NON VIENE TOCCATO: servizio (i ~34 servizi e giustificativi del seed).
--
-- ⚠️ Questo script CANCELLA dati. Va bene solo perché sono dati di prova.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- 1. pulizia
-- `cascade` porta via da sé profilo_orario, timbratura e chiusura_mese, che
-- hanno tutte una foreign key su dipendente con on delete cascade.
truncate table dipendente restart identity cascade;

-- -------------------------------------------- 2. vincolo di coerenza orari
-- Voce di lavoro: ingresso e uscita obbligatori (le ore sono derivate).
-- Giustificativo: nessun orario, occupa il monte ore atteso del giorno.
alter table timbratura drop constraint if exists timbratura_orari_coerenti;
alter table timbratura add  constraint timbratura_orari_coerenti check (
  (tipo_voce = 'lavoro'         and ora_inizio is not null and ora_fine is not null) or
  (tipo_voce = 'giustificativo' and ora_inizio is null     and ora_fine is null)
);

commit;

-- ------------------------------------------------------------- 3. verifica
-- Attese: le prime quattro a 0, servizi a 34, vincolo presente.
select
  (select count(*) from dipendente)      as dipendenti,
  (select count(*) from profilo_orario)  as profili_orari,
  (select count(*) from timbratura)      as righe_ore,
  (select count(*) from chiusura_mese)   as chiusure,
  (select count(*) from servizio)        as servizi_rimasti,
  (select count(*) from pg_constraint
    where conname = 'timbratura_orari_coerenti') as vincolo_orari;
