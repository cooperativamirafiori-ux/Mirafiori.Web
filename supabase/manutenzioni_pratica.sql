-- ============================================================================
-- Manutenzioni — la richiesta diventa una pratica (fase 1)
--
-- Piano: docs/manutenzioni-piano.md. Idempotente.
--
-- La richiesta resta sulla lista SharePoint Richieste; qui stanno le cose che
-- hanno tante righe. Il collegamento è l'id dell'item SharePoint
-- (`richiesta_sp_id`, stringa come lo usa Graph); `id_richiesta` (MAN-…) è
-- copiato per leggibilità, non è la chiave.
-- ============================================================================

begin;

-- Conversazione fra gestione e richiedente.
create table if not exists manutenzione_messaggio (
  id               uuid        primary key default gen_random_uuid(),
  richiesta_sp_id  text        not null,
  id_richiesta     text        not null,
  lato             text        not null check (lato in ('gestione','richiedente')),
  tipo             text        not null default 'messaggio'
                    check (tipo in ('messaggio','presa_in_carico','tecnico_assegnato','chiusura')),
  testo            text        not null check (length(trim(testo)) > 0),
  autore_email     text        not null,
  autore_nome      text,
  creato_il        timestamptz not null default now(),
  -- Quando l'altra parte ha aperto la conversazione. Serve al pallino "nuovo".
  letto_il         timestamptz
);

create index if not exists manutenzione_messaggio_richiesta_idx
  on manutenzione_messaggio (richiesta_sp_id, creato_il);
create index if not exists manutenzione_messaggio_non_letti_idx
  on manutenzione_messaggio (lato) where letto_il is null;

-- Cose da fare dentro una richiesta (es. luce + doccini + asse del water).
create table if not exists manutenzione_voce (
  id               uuid        primary key default gen_random_uuid(),
  richiesta_sp_id  text        not null,
  id_richiesta     text        not null,
  testo            text        not null check (length(trim(testo)) > 0),
  fatta            boolean     not null default false,
  fatta_il         timestamptz,
  fatta_da         text,
  creata_da        text        not null,
  creata_da_lato   text        not null check (creata_da_lato in ('gestione','richiedente')),
  creata_il        timestamptz not null default now()
);

create index if not exists manutenzione_voce_richiesta_idx
  on manutenzione_voce (richiesta_sp_id, creata_il);

alter table manutenzione_messaggio enable row level security;
alter table manutenzione_voce enable row level security;

commit;
