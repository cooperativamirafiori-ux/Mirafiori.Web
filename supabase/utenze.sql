-- ============================================================================
-- AMMINISTRAZIONE · Utenze — bollette lette dagli XML SDI
-- ----------------------------------------------------------------------------
-- Da eseguire DOPO fatture_sdi.sql. Idempotente. Decisioni: docs/utenze.md
--
-- L'anagrafica delle utenze (codice → struttura, percentuale) resta sulla
-- lista SharePoint "Mappatura Utenze": si modifica dall'app o da SharePoint.
-- Qui stanno le BOLLETTE: una riga per fattura × codice di fornitura, con
-- importo, consumo e periodo letti dall'XML, e le QUOTE per struttura copiate
-- al momento del collegamento. Come per i costi: la struttura e il centro di
-- costo si scrivono sul documento, non si ricalcolano — se domani si cambia la
-- Mappatura, le bollette già registrate non si spostano da sole.
-- ============================================================================

create table if not exists bolletta (
  id                  uuid primary key default gen_random_uuid(),
  fattura_passiva_id  uuid not null references fattura_passiva(id) on delete cascade,
  codice              text not null,            -- POD / PDR / utenza, normalizzato (maiuscolo, senza spazi)
  tipo                text not null check (tipo in ('luce', 'gas', 'acqua', 'altro')),
  -- Imponibile della parte di fattura di questo codice. Negativo per le note di credito.
  importo             numeric(12,2) not null,
  -- Consumo del periodo: UNA riga di riferimento, mai la somma delle componenti.
  consumo             numeric(14,3),
  unita               text,
  periodo_dal         date,
  periodo_al          date,
  creata_il           timestamptz not null default now(),
  unique (fattura_passiva_id, codice)
);
create index if not exists bolletta_codice_idx on bolletta (codice);
alter table bolletta enable row level security;

create table if not exists bolletta_quota (
  id               uuid primary key default gen_random_uuid(),
  bolletta_id      uuid not null references bolletta(id) on delete cascade,
  struttura_sp_id  integer not null,           -- item id della lista Anagrafica Strutture
  struttura_codice text,
  struttura_nome   text,
  cc_codice        text,                       -- minuscolo: cc9
  percentuale      numeric(6,2) not null check (percentuale > 0 and percentuale <= 100),
  mappatura_sp_id  integer,                    -- riga della Mappatura da cui viene
  collegata_il     timestamptz not null default now(),
  collegata_da     text not null,
  unique (bolletta_id, struttura_sp_id)
);
create index if not exists bolletta_quota_struttura_idx on bolletta_quota (struttura_sp_id);
alter table bolletta_quota enable row level security;

-- Quando l'XML di una fattura è stato letto per le utenze (anche se non era
-- una bolletta): il recupero delle fatture già importate riparte da quelle
-- che non ce l'hanno.
alter table fattura_passiva add column if not exists utenze_lette_il timestamptz;

comment on table bolletta is 'Bollette di luce, gas, acqua lette dagli XML SDI: una riga per fattura × codice. docs/utenze.md';
comment on table bolletta_quota is 'Ripartizione di una bolletta sulle strutture, copiata dalla Mappatura Utenze al collegamento.';
