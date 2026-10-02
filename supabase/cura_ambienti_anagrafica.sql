-- ============================================================================
-- Cura Ambienti — passo 1: anagrafica
--
-- Da eseguire nel SQL editor di Supabase. Idempotente: rieseguirlo non fa nulla.
-- Piano completo: docs/cura-ambienti-piano.md
--
-- 1. Il servizio di timbratura "Cura Ambienti" → cc24. Ci timbrano addetti
--    pulizie e manutentore, SENZA indicare la struttura: le ore per struttura
--    le fissa il coordinatore nei consuntivi dei lavori (scelta di Dennis).
--    `centro_costo = 1` è il vecchio macro-gruppo "Interni" del foglio Excel,
--    non il centro di costo: vedi timbrature_centri_di_costo.sql.
--
-- 2. La tabella delle tariffe interne, per figura e con data di validità.
--    Cambiare tariffa = chiudere la riga vecchia (`al`) e aprirne una nuova:
--    i lavori già addebitati restano col prezzo del loro periodo.
-- ============================================================================

begin;

insert into servizio (nome, centro_costo, centro_costo_codice, centro_costo_nome, categoria, tipo_voce, ordine, attivo)
values ('Cura Ambienti', 1, 'cc24', 'Cura Ambienti', 'Servizi Generali', 'lavoro', 240, true)
on conflict (nome) do update set
  centro_costo_codice = excluded.centro_costo_codice,
  centro_costo_nome   = excluded.centro_costo_nome,
  categoria           = excluded.categoria,
  tipo_voce           = excluded.tipo_voce,
  ordine              = excluded.ordine,
  attivo              = true;

create table if not exists tariffa_interna (
  figura     text          not null check (figura in ('pulizie','manutenzione')),
  dal        date          not null,
  al         date,
  euro_ora   numeric(8,2)  not null check (euro_ora > 0),
  note       text,
  creato_il  timestamptz   not null default now(),
  primary key (figura, dal),
  constraint tariffa_periodo_chk check (al is null or al >= dal)
);

comment on table tariffa_interna is
  'Tariffe orarie con cui Cura Ambienti (cc24) addebita il lavoro alle strutture. Il materiale di consumo è compreso nella tariffa.';

alter table tariffa_interna enable row level security;

commit;

-- Le tariffe si inseriscono quando sono decise, per esempio:
--   insert into tariffa_interna (figura, dal, euro_ora, note)
--   values ('pulizie', '2026-10-01', 22.00, 'prima tariffa');

select id, nome, centro_costo_codice, attivo from servizio where nome = 'Cura Ambienti';
