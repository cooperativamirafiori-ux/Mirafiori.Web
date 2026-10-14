-- ============================================================================
-- Cura Ambienti — ricorrenze e tariffe per struttura (13/10/2026)
--
-- Da eseguire nel SQL editor di Supabase. Idempotente.
--
-- 1. `ricorrenza_cura_ambienti`: la pulizia che si ripete (ogni mese oppure
--    ogni settimana in un giorno fisso). È lo stampo: i lavori del mese li
--    crea "Crea i lavori ricorrenti del mese", che salta le ricorrenze in
--    pausa o chiuse. Le ore sono PER VOLTA: nel mese diventano ore × volte
--    (i martedì di un mese sono 4 o 5). I materiali sono al mese.
--    `lavoro_cura_ambienti.ricorrenza_id` lega ogni lavoro alla sua ricorrenza;
--    il vincolo unico impedisce di crearne due nello stesso mese.
--
-- 2. `tariffa_struttura`: tariffe diverse per una struttura. Locanda (B01) fa
--    un ordine di detersivi suo, che finisce sul suo centro di costo: la sua
--    tariffa pulizie non comprende il consumo. Tabella a parte (e non una
--    colonna su `tariffa_interna`) perché chi legge le tariffe di base non
--    deve vedersela comparire per sbaglio.
-- ============================================================================

begin;

create table if not exists ricorrenza_cura_ambienti (
  id                 uuid        primary key default gen_random_uuid(),
  destinatario       text        not null check (destinatario in ('struttura','esterno')),
  struttura_codice   text,
  struttura_nome     text,
  cc_codice          text        references centro_di_costo(codice),
  cliente            text,
  titolo             text        not null check (length(trim(titolo)) > 0),
  descrizione        text,
  frequenza          text        not null check (frequenza in ('mensile','settimanale')),
  giorno_settimana   smallint    check (giorno_settimana between 1 and 7),  -- 1 = lunedì
  ore_pulizie        numeric(7,2)  not null default 0 check (ore_pulizie >= 0),
  ore_manutenzione   numeric(7,2)  not null default 0 check (ore_manutenzione >= 0),
  materiali          numeric(10,2) not null default 0 check (materiali >= 0),
  stato              text        not null default 'attiva' check (stato in ('attiva','pausa','chiusa')),
  dal_mese           date        not null check (extract(day from dal_mese) = 1),
  creato_da          text        not null,
  creato_il          timestamptz not null default now(),
  aggiornato_da      text,
  aggiornato_il      timestamptz not null default now(),
  constraint ricorrenza_giorno_chk check ((frequenza = 'settimanale') = (giorno_settimana is not null))
);

comment on table ricorrenza_cura_ambienti is
  'Pulizie ricorrenti di Cura Ambienti (mensili o settimanali). Ore per volta; i lavori del mese nascono da qui.';

alter table ricorrenza_cura_ambienti enable row level security;

alter table lavoro_cura_ambienti add column if not exists ricorrenza_id uuid references ricorrenza_cura_ambienti(id) on delete set null;
create unique index if not exists lavoro_ca_ricorrenza_mese_uq on lavoro_cura_ambienti (ricorrenza_id, mese) where ricorrenza_id is not null;

create table if not exists tariffa_struttura (
  struttura_codice  text         not null,
  figura            text         not null check (figura in ('pulizie','manutenzione')),
  dal               date         not null,
  al                date,
  euro_ora          numeric(8,2) not null check (euro_ora > 0),
  note              text,
  creato_il         timestamptz  not null default now(),
  primary key (struttura_codice, figura, dal),
  constraint tariffa_struttura_periodo_chk check (al is null or al >= dal)
);

comment on table tariffa_struttura is
  'Tariffe di Cura Ambienti diverse per una struttura (vincono su tariffa_interna per quella figura).';

alter table tariffa_struttura enable row level security;

insert into tariffa_struttura (struttura_codice, figura, dal, euro_ora, note)
values ('B01', 'pulizie', '2026-10-01', 24.00,
        'Locanda: detersivi ordinati a parte sul suo centro di costo (cc2), quindi 2 €/h di consumo in meno (stima 13/10/2026)')
on conflict do nothing;

commit;
