-- ============================================================================
-- Manutenzioni — fase 2: i costi della pratica
--
-- Piano: docs/manutenzioni-piano.md. Idempotente.
--
-- Una manutenzione ha più costi, in tempi diversi, di tre tipi:
--   fattura — una fattura SDI di cc24, tutta o una parte (imponibile)
--   ore     — ore del personale di Cura Ambienti; l'importo NON si salva:
--             ore × tariffa interna valida nel mese, ricalcolata a ogni lettura
--             (stessa regola dei Lavori, docs/cura-ambienti-piano.md)
--   spesa   — scontrino, carta, qualunque cosa senza fattura SDI
--
-- Struttura e centro di costo si COPIANO alla creazione: se domani una
-- struttura passa a un altro centro, lo storico non si riscrive da solo.
--
-- Una fattura si può dividere fra più manutenzioni; il trigger impedisce di
-- distribuirne più del suo imponibile (il controllo vero sta qui, non solo
-- nell'app: due persone che collegano insieme non lo sforano).
-- ============================================================================

begin;

create table if not exists manutenzione_costo (
  id                  uuid        primary key default gen_random_uuid(),
  richiesta_sp_id     text        not null,
  id_richiesta        text        not null,
  struttura_id        int,
  struttura_codice    text,
  cc_codice           text,
  tipo                text        not null check (tipo in ('fattura','ore','spesa')),
  -- Competenza: data della fattura del fornitore, del lavoro, della spesa.
  data                date        not null,
  fattura_passiva_id  uuid        references fattura_passiva(id) on delete restrict,
  importo             numeric(10,2) check (importo is null or importo > 0),
  ore                 numeric(6,2)  check (ore is null or ore > 0),
  figura              text        check (figura in ('manutenzione','pulizie')),
  descrizione         text,
  fornitore           text,
  creato_da           text        not null,
  creato_il           timestamptz not null default now(),

  constraint manutenzione_costo_tipo_chk check (
    (tipo = 'fattura' and fattura_passiva_id is not null and importo is not null and ore is null) or
    (tipo = 'ore'     and fattura_passiva_id is null and ore is not null and figura is not null and importo is null) or
    (tipo = 'spesa'   and fattura_passiva_id is null and importo is not null and ore is null
                      and descrizione is not null and length(trim(descrizione)) > 0)
  )
);

create index if not exists manutenzione_costo_richiesta_idx on manutenzione_costo (richiesta_sp_id, data);
create index if not exists manutenzione_costo_fattura_idx   on manutenzione_costo (fattura_passiva_id) where fattura_passiva_id is not null;
create index if not exists manutenzione_costo_data_idx      on manutenzione_costo (data);

-- Non si distribuisce più dell'imponibile della fattura.
create or replace function manutenzione_costo_tetto_fattura() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_imponibile numeric;
  v_usato      numeric;
begin
  if new.tipo <> 'fattura' then return new; end if;
  -- Serializza i collegamenti sulla stessa fattura.
  select coalesce(imponibile, totale) into v_imponibile
    from fattura_passiva where id = new.fattura_passiva_id for update;
  if v_imponibile is null then
    raise exception 'fattura % senza imponibile', new.fattura_passiva_id;
  end if;
  select coalesce(sum(importo), 0) into v_usato
    from manutenzione_costo
   where fattura_passiva_id = new.fattura_passiva_id and id <> new.id;
  if v_usato + new.importo > v_imponibile + 0.005 then
    raise exception 'oltre l''imponibile della fattura: già distribuiti %, disponibili %',
      v_usato, greatest(v_imponibile - v_usato, 0);
  end if;
  return new;
end $$;

drop trigger if exists manutenzione_costo_tetto_fattura on manutenzione_costo;
create trigger manutenzione_costo_tetto_fattura
  before insert or update on manutenzione_costo
  for each row execute function manutenzione_costo_tetto_fattura();

alter table manutenzione_costo enable row level security;

comment on table manutenzione_costo is
  'Costi delle richieste di manutenzione (fatture cc24 anche divise, ore Cura Ambienti, spese). Importo delle ore calcolato da tariffa_interna.';

commit;
