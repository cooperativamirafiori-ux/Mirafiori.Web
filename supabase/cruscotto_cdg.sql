-- ============================================================================
-- Cruscotto del controllo di gestione — prima versione (05/10/2026)
-- ----------------------------------------------------------------------------
-- Due letture, nessuna tabella nuova. Il registro (`movimento`) è ancora vuoto:
-- finché il travaso non c'è, il cruscotto legge dalle fonti che hanno già il
-- centro di costo — le fatture elettroniche segnate su un servizio e le ore.
-- Quando il registro sarà pieno, il cruscotto passerà a `registro_per_cc` e
-- queste due funzioni potranno sparire.
--
-- Quali fatture: SOLO quelle importate dagli XML SDI (decisione di Dennis,
-- 05/10/2026: "inserisci solo le nuove importate in xml, d'ora in avanti
-- faremo così"). Le fatture entrate dall'Excel dello scadenzario restano fuori:
-- non hanno l'imponibile, e le rate sono IVA compresa e al netto della
-- ritenuta. Gli XML arrivano da luglio 2026: prima di allora il cruscotto è vuoto
-- di proposito, e lo dice.
--
-- Importo: l'IMPONIBILE, IVA esclusa ("non mi torna vedere IVA compresa").
-- Note di credito: sempre negative, qualunque segno abbia il documento.
-- ============================================================================

create or replace function cdg_fatture_anno(p_anno int)
returns table (
  id           uuid,
  cc_codice    text,
  data         date,
  mese         int,
  fornitore    text,
  numero       text,
  importo      numeric,   -- imponibile, IVA esclusa
  da_sdi       boolean,   -- sempre true: resta per non cambiare la firma
  nota_credito boolean
)
language sql
stable
as $$
  select f.id,
         nullif(f.cc_codice, 'DA_ATTRIBUIRE'),
         d.data,
         extract(month from d.data)::int,
         f.fornitore,
         f.numero_fornitore,
         case when f.tipo_documento = 'nota_credito' then -abs(f.imponibile) else f.imponibile end,
         true,
         f.tipo_documento = 'nota_credito'
    from fattura_passiva f
   cross join lateral (select coalesce(f.data_fornitore, f.protocollo_data) as data) d
   where f.file_sdi is not null
     and d.data >= make_date(p_anno, 1, 1)
     and d.data <  make_date(p_anno + 1, 1, 1)
   order by d.data desc, f.id;
$$;

-- Ore di LAVORO timbrate per centro di costo e mese (i giustificativi no:
-- ferie e permessi non sono ore spese su un servizio).
create or replace function cdg_ore_anno(p_anno int)
returns table (
  cc_codice text,
  mese      int,
  ore       numeric,
  persone   bigint
)
language sql
stable
as $$
  select s.centro_costo_codice,
         extract(month from t.data)::int,
         sum(t.ore),
         count(distinct t.dipendente_id)
    from timbratura t
    join servizio s on s.id = t.servizio_id
   where t.tipo_voce = 'lavoro'
     and s.centro_costo_codice is not null
     and t.data >= make_date(p_anno, 1, 1)
     and t.data <  make_date(p_anno + 1, 1, 1)
   group by 1, 2;
$$;

alter function cdg_fatture_anno(int) set search_path = public, pg_temp;
alter function cdg_ore_anno(int)     set search_path = public, pg_temp;

-- Solo il server (service role) le chiama: la chiave pubblica no.
revoke execute on function cdg_fatture_anno(int) from public, anon, authenticated;
revoke execute on function cdg_ore_anno(int)     from public, anon, authenticated;
