-- ============================================================================
-- Servizi interni — addebiti fra centri di costo e ripartizione costi generali
--
-- Piano: docs/servizi-interni-piano.md (decisioni di Dennis del 1/11/2026).
-- Idempotente.
--
-- Addebito interno = ore di lavoro × forfait orario + altri costi descritti.
-- Il forfait è UNO per tutti (18 €/h, deciso il 1/11/2026, valido da inizio 2026) e sta in una tabella con
-- data di validità: cambiarlo non riscrive gli addebiti dei mesi passati.
-- L'importo NON si salva: ore × forfait del mese + somma degli altri costi.
--
-- Ripartizione costi generali: percentuali fisse per centro di costo, a
-- versioni con data di validità. La somma di una versione deve fare 100.
-- ============================================================================

begin;

-- --- Forfait orario --------------------------------------------------------
create table if not exists forfait_orario (
  dal       date          primary key,
  euro_ora  numeric(8,2)  not null check (euro_ora > 0),
  note      text,
  creato_il timestamptz   not null default now()
);
insert into forfait_orario (dal, euro_ora, note)
values ('2026-01-01', 18, 'Deciso da Dennis il 1/11/2026, uguale per tutti i servizi; vale per tutto il 2026')
on conflict (dal) do nothing;

-- --- Addebito interno -------------------------------------------------------
create table if not exists addebito_interno (
  id            uuid        primary key default gen_random_uuid(),
  numero        int         generated always as identity,
  cc_da         text        not null references centro_di_costo(codice),
  cc_a          text        not null references centro_di_costo(codice),
  mese          date        not null check (extract(day from mese) = 1),
  descrizione   text        not null check (length(trim(descrizione)) > 0),
  ore           numeric(7,2) not null default 0 check (ore >= 0),
  -- Visto informativo di chi riceve: l'addebito vale comunque.
  visto         text        check (visto in ('visto','non_torna')),
  visto_nota    text,
  visto_da      text,
  visto_il      timestamptz,
  creato_da     text        not null,
  creato_il     timestamptz not null default now(),
  aggiornato_da text,
  aggiornato_il timestamptz not null default now(),
  constraint addebito_interno_diverso_chk check (cc_da <> cc_a)
);
create index if not exists addebito_interno_da_idx on addebito_interno (cc_da, mese);
create index if not exists addebito_interno_a_idx  on addebito_interno (cc_a, mese);

-- Gli altri costi dell'addebito: cosa + importo, al costo.
create table if not exists addebito_interno_costo (
  id           uuid          primary key default gen_random_uuid(),
  addebito_id  uuid          not null references addebito_interno(id) on delete cascade,
  descrizione  text          not null check (length(trim(descrizione)) > 0),
  importo      numeric(10,2) not null check (importo > 0),
  ordine       int           not null default 0
);
create index if not exists addebito_interno_costo_idx on addebito_interno_costo (addebito_id, ordine);

-- --- Ripartizione costi generali -------------------------------------------
create table if not exists ripartizione_generali (
  id         uuid        primary key default gen_random_uuid(),
  -- Il centro di costo i cui costi si dividono (oggi cc23).
  cc_origine text        not null references centro_di_costo(codice),
  dal        date        not null,
  note       text,
  creato_da  text        not null,
  creato_il  timestamptz not null default now(),
  unique (cc_origine, dal)
);
create table if not exists ripartizione_generali_quota (
  ripartizione_id uuid         not null references ripartizione_generali(id) on delete cascade,
  cc_codice       text         not null references centro_di_costo(codice),
  percentuale     numeric(6,3) not null check (percentuale > 0 and percentuale <= 100),
  primary key (ripartizione_id, cc_codice)
);

-- Salva una versione intera in una transazione: o tutte le quote, o niente.
-- Rifiuta se la somma non fa 100 o se il centro d'origine compare fra i destinatari.
create or replace function ripartizione_generali_salva(
  p_cc_origine text, p_dal date, p_note text, p_creato_da text, p_quote jsonb
) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_somma numeric;
begin
  select coalesce(sum((q->>'percentuale')::numeric), 0) into v_somma from jsonb_array_elements(p_quote) q;
  if abs(v_somma - 100) > 0.01 then
    raise exception 'le percentuali sommano a % invece di 100', v_somma;
  end if;
  if exists (select 1 from jsonb_array_elements(p_quote) q where q->>'cc_codice' = p_cc_origine) then
    raise exception 'il centro % non può ripartire su se stesso', p_cc_origine;
  end if;
  delete from ripartizione_generali where cc_origine = p_cc_origine and dal = p_dal;
  insert into ripartizione_generali (cc_origine, dal, note, creato_da)
    values (p_cc_origine, p_dal, p_note, p_creato_da) returning id into v_id;
  insert into ripartizione_generali_quota (ripartizione_id, cc_codice, percentuale)
    select v_id, q->>'cc_codice', (q->>'percentuale')::numeric
      from jsonb_array_elements(p_quote) q
     where (q->>'percentuale')::numeric > 0;
  return v_id;
end $$;

alter table forfait_orario enable row level security;
alter table addebito_interno enable row level security;
alter table addebito_interno_costo enable row level security;
alter table ripartizione_generali enable row level security;
alter table ripartizione_generali_quota enable row level security;

commit;
