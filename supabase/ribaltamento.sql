-- ============================================================================
-- Ribaltamento: un solo strumento per tutti i costi che un servizio fa per un altro
--
-- Deciso con Dennis il 2/11/2026 (docs/servizi-interni-piano.md, § Ribaltamento).
-- Idempotente, solo aggiunte.
--
-- Lo strumento è l'ADDEBITO INTERNO (supabase/servizi_interni.sql). Oltre a quelli
-- scritti a mano, ora nascono da soli:
--   - dai Lavori di Cura Ambienti consuntivati per una struttura (cc24 → CC della struttura);
--   - dai costi delle richieste di manutenzione (cc24 → CC della struttura),
--     uno per richiesta e per mese.
-- Si aggiornano finché il mese non chiude (il 10 del mese dopo), poi restano fermi.
-- Si correggono solo dalla loro origine, mai dalla schermata degli addebiti.
--
-- In più: la figura «sostituzione» di Cura Ambienti (personale mandato in emergenza
-- a coprire un buco in un altro servizio), con la sua tariffa.
-- ============================================================================

begin;

-- --- 1. Addebiti automatici --------------------------------------------------
alter table addebito_interno add column if not exists origine_tipo text not null default 'manuale';
alter table addebito_interno add column if not exists origine_id text;
alter table addebito_interno add column if not exists struttura_codice text;
alter table addebito_interno add column if not exists struttura_nome text;

alter table addebito_interno drop constraint if exists addebito_interno_origine_chk;
alter table addebito_interno add constraint addebito_interno_origine_chk check (
  (origine_tipo = 'manuale' and origine_id is null) or
  (origine_tipo in ('lavoro_cura_ambienti','manutenzione') and origine_id is not null)
);

-- Uno per origine e per mese: è la chiave con cui il ribaltamento lo ritrova.
create unique index if not exists addebito_interno_origine_uk
  on addebito_interno (origine_tipo, origine_id, mese)
  where origine_tipo <> 'manuale';

-- Il mese di un addebito chiude il 10 del mese dopo (stessa regola di lib/servizi-interni/flusso.ts).
create or replace function addebito_mese_chiuso(p_mese date) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select now() > (((p_mese + interval '1 month' + interval '9 days')::timestamp + interval '23 hours') at time zone 'UTC')
$$;

-- L'unica porta degli addebiti automatici: scrive testata e righe in una transazione.
--   p_righe = [{ "descrizione": "...", "importo": 12.34 }, ...]
--   p_righe vuoto = l'origine non addebita più niente in quel mese → l'addebito sparisce.
-- Rifiuta se il mese è chiuso: lì l'addebito è fermo.
-- Se cambiano gli importi o il destinatario, il visto si toglie (chi riceve aveva visto altro).
create or replace function addebito_automatico_riscrivi(
  p_origine_tipo     text,
  p_origine_id       text,
  p_mese             date,
  p_cc_da            text,
  p_cc_a             text,
  p_descrizione      text,
  p_struttura_codice text,
  p_struttura_nome   text,
  p_righe            jsonb,
  p_utente           text
) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare
  v_id        uuid;
  v_vecchie   jsonb;
  v_nuove     jsonb;
  v_cc_a      text;
begin
  if p_origine_tipo not in ('lavoro_cura_ambienti','manutenzione') or p_origine_id is null then
    raise exception 'addebito automatico: origine non valida';
  end if;
  if jsonb_typeof(p_righe) <> 'array' then
    raise exception 'addebito automatico: p_righe deve essere un array';
  end if;

  select id, cc_a into v_id, v_cc_a
    from addebito_interno
   where origine_tipo = p_origine_tipo and origine_id = p_origine_id and mese = p_mese
   for update;

  v_nuove := (select jsonb_agg(jsonb_build_object('d', r->>'descrizione', 'i', round((r->>'importo')::numeric, 2)) order by o)
                from jsonb_array_elements(p_righe) with ordinality as x(r, o));
  if v_id is not null then
    v_vecchie := (select jsonb_agg(jsonb_build_object('d', descrizione, 'i', importo) order by ordine)
                    from addebito_interno_costo where addebito_id = v_id);
  end if;

  if addebito_mese_chiuso(p_mese) then
    -- Riscrivere le stesse cose è sempre permesso; cambiare un mese chiuso no.
    if v_id is null and v_nuove is null then return null; end if;
    if v_id is not null and v_vecchie is not distinct from v_nuove and v_cc_a = p_cc_a then return v_id; end if;
    raise exception 'mese chiuso: l''addebito di % è fermo dal 10 del mese dopo', to_char(p_mese, 'MM/YYYY');
  end if;

  if v_nuove is null then
    if v_id is not null then delete from addebito_interno where id = v_id; end if;
    return null;
  end if;

  if v_id is null then
    insert into addebito_interno (cc_da, cc_a, mese, descrizione, ore, creato_da,
                                  origine_tipo, origine_id, struttura_codice, struttura_nome)
    values (p_cc_da, p_cc_a, p_mese, p_descrizione, 0, p_utente,
            p_origine_tipo, p_origine_id, p_struttura_codice, p_struttura_nome)
    returning id into v_id;
  else
    update addebito_interno
       set cc_da = p_cc_da, cc_a = p_cc_a, descrizione = p_descrizione,
           struttura_codice = p_struttura_codice, struttura_nome = p_struttura_nome,
           aggiornato_da = p_utente, aggiornato_il = now()
     where id = v_id;
    if v_vecchie is not distinct from v_nuove and v_cc_a = p_cc_a then
      return v_id;  -- stessi importi: il visto resta
    end if;
    update addebito_interno
       set visto = null, visto_nota = null, visto_da = null, visto_il = null
     where id = v_id;
    delete from addebito_interno_costo where addebito_id = v_id;
  end if;

  insert into addebito_interno_costo (addebito_id, descrizione, importo, ordine)
  select v_id, r->>'descrizione', round((r->>'importo')::numeric, 2), (o - 1)::int
    from jsonb_array_elements(p_righe) with ordinality as x(r, o);

  return v_id;
end $$;

-- --- 2. Manutenzioni: il mese in cui il costo si addebita --------------------
-- Di solito il mese del costo; se quel mese era già chiuso quando il costo è
-- stato registrato, il mese in corso (si rettifica nel mese seguente). Si fissa
-- alla creazione, così non cambia da solo col passare dei giorni.
alter table manutenzione_costo add column if not exists mese_addebito date;
update manutenzione_costo set mese_addebito = date_trunc('month', data)::date where mese_addebito is null;
alter table manutenzione_costo drop constraint if exists manutenzione_costo_mese_addebito_chk;
alter table manutenzione_costo add constraint manutenzione_costo_mese_addebito_chk
  check (mese_addebito is null or extract(day from mese_addebito) = 1);

-- --- 3. Cura Ambienti: figura «sostituzione» ----------------------------------
alter table lavoro_cura_ambienti add column if not exists prev_ore_sostituzione numeric(7,2) not null default 0;
alter table lavoro_cura_ambienti add column if not exists cons_ore_sostituzione numeric(7,2);
alter table lavoro_cura_ambienti drop constraint if exists lavoro_ca_ore_sostituzione_chk;
alter table lavoro_cura_ambienti add constraint lavoro_ca_ore_sostituzione_chk
  check (prev_ore_sostituzione >= 0 and (cons_ore_sostituzione is null or cons_ore_sostituzione >= 0));

alter table ricorrenza_cura_ambienti add column if not exists ore_sostituzione numeric(7,2) not null default 0;
alter table ricorrenza_cura_ambienti drop constraint if exists ricorrenza_ore_sostituzione_chk;
alter table ricorrenza_cura_ambienti add constraint ricorrenza_ore_sostituzione_chk check (ore_sostituzione >= 0);

alter table tariffa_interna drop constraint if exists tariffa_interna_figura_check;
alter table tariffa_interna add constraint tariffa_interna_figura_check
  check (figura in ('pulizie','manutenzione','sostituzione'));
alter table tariffa_struttura drop constraint if exists tariffa_struttura_figura_check;
alter table tariffa_struttura add constraint tariffa_struttura_figura_check
  check (figura in ('pulizie','manutenzione','sostituzione'));

commit;
