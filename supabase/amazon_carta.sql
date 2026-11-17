-- Amazon pagato con carta Qonto (Dennis, 17/11/2026).
--
-- Amazon fa una fattura sola per tanti prodotti, e spesso più fatture per una
-- spesa: abbinarle ai movimenti non torna mai. Quindi, per le spese con CARTA
-- dal 1/11/2026 (PARTENZA_QONTO):
--   - il COSTO lo dà il movimento Qonto, sul centro di costo del sottoconto
--     della carta (stimato IVA esclusa al 22%, come le fatture all'imponibile);
--   - la fattura Amazon nasce pagata, NON conta come costo (sarebbe un doppione)
--     e va nella scheda «Amazon» di Flussi fatture, dove Claudia la abbina a
--     un movimento o la chiude a mano;
--   - l'abbinamento automatico non tocca i movimenti Amazon con carta.
-- Le fatture Amazon Business a BONIFICO (MP05, «Pagamento in fattura») restano
-- debiti normali in coda Da pagare, con il costo dalla fattura.
-- Riconoscimento: fornitore ~* 'amazon' (fattura), controparte o etichetta
-- ~* 'amzn|amazon' su un movimento di tipo card. Stesse regole in
-- lib/qonto/amazon.ts.

alter table scadenza add column if not exists amazon text;
alter table scadenza drop constraint if exists scadenza_amazon_check;
alter table scadenza add constraint scadenza_amazon_check check (amazon in ('aperta', 'chiusa'));
comment on column scadenza.amazon is
  'Fattura Amazon pagata con carta Qonto (dal 1/11/2026): aperta = nella scheda Amazon finché non è abbinata a un movimento o chiusa; chiusa = chiusa a mano. Null = non Amazon con carta.';

alter table qonto_movimento add column if not exists amazon boolean not null default false;
comment on column qonto_movimento.amazon is
  'Spesa Amazon con carta: fuori dall''abbinamento automatico, il costo nel cruscotto viene da qui (Dennis 17/11/2026)';

update qonto_movimento
   set amazon = true
 where tipo = 'card'
   and (coalesce(controparte, '') ~* 'amzn|amazon' or coalesce(etichetta, '') ~* 'amzn|amazon')
   and not amazon;

-- Le fatture Amazon con carta già importate dal 1/11: nella scheda Amazon.
-- Quelle ancora in coda con l'avviso diventano pagate (lo erano: carta).
update scadenza s
   set amazon = 'aperta',
       stato = case when s.stato in ('da_pagare', 'da_approvare', 'da_verificare') then 'pagata' else s.stato end,
       data_pagamento = case when s.stato in ('da_pagare', 'da_approvare', 'da_verificare') then f.data_fornitore else s.data_pagamento end,
       pagata_da = case when s.stato in ('da_pagare', 'da_approvare', 'da_verificare') then 'carta Amazon (scheda Amazon)' else s.pagata_da end,
       pagata_il = case when s.stato in ('da_pagare', 'da_approvare', 'da_verificare') then now() else s.pagata_il end,
       alert = null
  from fattura_passiva f
 where f.id = s.fattura_passiva_id
   and f.fornitore ~* 'amazon'
   and f.data_fornitore >= date '2026-11-01'
   and s.famiglia_modalita = 'negozio'
   and s.importo > 0
   and s.amazon is null;

-- Cruscotto: stessa funzione di supabase/carburante.sql, più le due regole Amazon.
create or replace function cdg_fatture_anno(p_anno int)
returns table (id uuid, cc_codice text, data date, mese int, fornitore text, numero text,
               importo numeric, da_sdi boolean, nota_credito boolean)
language sql stable
as $$
  with base as (
    select f.*, coalesce(f.data_fornitore, f.protocollo_data) as giorno
      from fattura_passiva f
     where f.file_sdi is not null
       and coalesce(f.data_fornitore, f.protocollo_data) >= make_date(p_anno, 1, 1)
       and coalesce(f.data_fornitore, f.protocollo_data) <  make_date(p_anno + 1, 1, 1)
       -- Amazon con carta: il costo lo dà il movimento Qonto (ultimo blocco).
       and not exists (select 1 from scadenza s where s.fattura_passiva_id = f.id and s.amazon is not null)
  )
  select b.id, nullif(b.cc_codice, 'DA_ATTRIBUIRE'), b.giorno, extract(month from b.giorno)::int,
         b.fornitore, b.numero_fornitore,
         case when b.tipo_documento = 'nota_credito' then -abs(b.imponibile) else b.imponibile end,
         true, b.tipo_documento = 'nota_credito'
    from base b
   where not b.carburante
  union all
  select b.id, nullif(q.cc_codice, 'DA_ATTRIBUIRE'), b.giorno, extract(month from b.giorno)::int,
         b.fornitore, b.numero_fornitore,
         case when b.tipo_documento = 'nota_credito' then -abs(q.importo) else q.importo end,
         true, b.tipo_documento = 'nota_credito'
    from base b
    join carburante_quota q on q.fattura_passiva_id = b.id
   where b.carburante
  union all
  select b.id, null, b.giorno, extract(month from b.giorno)::int,
         b.fornitore, b.numero_fornitore,
         case when b.tipo_documento = 'nota_credito' then -abs(b.imponibile) else b.imponibile end,
         true, b.tipo_documento = 'nota_credito'
    from base b
   where b.carburante
     and not exists (select 1 from carburante_quota q where q.fattura_passiva_id = b.id)
  union all
  -- Spese Amazon con carta Qonto dal 1/11/2026, sul CC del sottoconto.
  -- Il movimento è IVA compresa: si stima l'imponibile al 22%.
  select null::uuid, m.cc_codice, m.data, extract(month from m.data)::int,
         'Amazon · carta Qonto', case when m.carta is not null then 'carta ••' || m.carta end,
         round(m.importo / 1.22, 2), false, false
    from qonto_movimento m
   where m.amazon
     and m.stato_qonto = 'completed'
     and m.data >= greatest(make_date(p_anno, 1, 1), date '2026-11-01')
     and m.data <  make_date(p_anno + 1, 1, 1)
   order by 3 desc, 1;
$$;

alter function cdg_fatture_anno(int) set search_path = public, pg_temp;
revoke execute on function cdg_fatture_anno(int) from public, anon, authenticated;
