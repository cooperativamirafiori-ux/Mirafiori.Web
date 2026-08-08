-- ============================================================================
-- Timbrature — revisione di agosto 2026
-- ----------------------------------------------------------------------------
-- Da eseguire UNA VOLTA nel SQL editor di Supabase, in un colpo solo.
--
-- Raccoglie le modifiche di schema decise con Dennis l'8 agosto 2026. Le
-- decisioni e il perché stanno in `docs/timbrature-revisione-agosto-2026.md`:
-- qui c'è solo quello che serve al database.
--
--   1) `notte` cambia significato: non è più un calcolo, è una spunta manuale.
--   2) `reperibilita`: spunta nuova, serve alle HR per il costo orario.
--   3) `profilo_orario` diventa un registro di variazioni: motivo + documento.
--   4) `chiusura_mese` tiene traccia anche della copia nella cartella HR.
--
-- Idempotente: si può rieseguire senza effetti collaterali.
-- ============================================================================

begin;

-- --- 1) notte: da automatica a manuale --------------------------------------
-- Prima si accendeva da sé quando l'uscita era precedente all'ingresso, e
-- voleva dire "il turno ha scavallato la data". Da adesso i turni oltre la
-- mezzanotte vengono spezzati in due righe, quindi nessuna riga scavalla più e
-- quel significato non ha più niente da segnalare: la colonna diventa la
-- spunta con cui si dichiara il turno notturno, che è un'altra cosa (un
-- 20:00–24:00 è notturno e non scavalla).
--
-- La maggiorazione notturna è forfettaria a notte, non a ore: non si calcola
-- nulla, si contano le notti dichiarate.
update timbratura set notte = false where notte = true;

comment on column timbratura.notte is
  'Turno notturno, dichiarato a mano da chi inserisce la riga. Mai calcolato: '
  'la maggiorazione e'' forfettaria a notte, quindi conta la dichiarazione, non '
  'la fascia oraria. Solo su tipo_voce = lavoro.';

-- --- 2) reperibilità --------------------------------------------------------
-- Non incide su nessun conteggio: le ore della riga restano ore di lavoro a
-- tutti gli effetti. E' un'etichetta che arriva alle HR per il costo orario.
--
-- In Mirafiori la reperibilità si accompagna sempre a un turno di servizio,
-- quindi una riga di ore c'è sempre e la spunta basta: non serve una voce
-- propria per la disponibilità non chiamata.
alter table timbratura
  add column if not exists reperibilita boolean not null default false;

comment on column timbratura.reperibilita is
  'Il turno era in reperibilita''. Non incide su ore attese ne'' flessibilita'': '
  'serve alle HR per il costo. Solo su tipo_voce = lavoro.';

-- --- 3) le tre spunte valgono solo per le ore di lavoro ---------------------
-- Il codice le forza già a spento sui giustificativi. Il vincolo lo mette per
-- iscritto anche nel database: un permesso retribuito notturno non esiste.
alter table timbratura drop constraint if exists timbratura_flag_solo_lavoro;
alter table timbratura add constraint timbratura_flag_solo_lavoro check (
  tipo_voce = 'lavoro' or (notte = false and reperibilita = false)
);

-- --- 4) profilo_orario: da "ultimo valore" a registro di variazioni ---------
-- La tabella versionava già il monte ore per data di decorrenza, ma senza dire
-- perché fosse cambiato né con quale documento. E' il dato che determina le ore
-- attese di ogni giornata, quindi la completezza, i solleciti, lo scostamento e
-- la flessibilità: una variazione con la data sbagliata riscrive in silenzio le
-- ore attese dei mesi passati. Il motivo e la lettera allegata sono il modo di
-- sapere perché quel numero è quel numero.
alter table profilo_orario
  add column if not exists motivo    text,
  add column if not exists file_url  text,
  add column if not exists file_nome text;

comment on column profilo_orario.motivo is
  'Perche'' l''orario e'' cambiato, in chiaro. Es. "passaggio a part-time 20 ore '
  'su richiesta del dipendente".';
comment on column profilo_orario.file_url is
  'Lettera di variazione firmata, nella cartella personale del dipendente su '
  'SharePoint.';

-- --- 5) chiusura_mese: la copia nella cartella HR ---------------------------
-- Il foglio ore definitivo viene archiviato in due posti: la cartella personale
-- del dipendente (file_pdf_url) e una cartella unica delle HR per mese, che è
-- la forma comoda per il passaggio alle paghe. Solo il PDF, solo i definitivi.
alter table chiusura_mese
  add column if not exists file_hr_url text;

comment on column chiusura_mese.file_hr_url is
  'Copia PDF del foglio ore definitivo nella cartella HR del mese '
  '(Fogli Ore/<anno>/<mese>/). Solo per i fogli confermati.';

commit;

-- ------------------------------------------------------------------- verifica
-- Attese: reperibilita presente su timbratura, motivo/file_url/file_nome su
-- profilo_orario, file_hr_url su chiusura_mese, e nessuna riga con notte = true.
select table_name, column_name, data_type, column_default
  from information_schema.columns
 where (table_name = 'timbratura'    and column_name in ('notte', 'reperibilita'))
    or (table_name = 'profilo_orario' and column_name in ('motivo', 'file_url', 'file_nome'))
    or (table_name = 'chiusura_mese'  and column_name = 'file_hr_url')
 order by table_name, column_name;

select count(*) as righe_con_notte from timbratura where notte = true;
