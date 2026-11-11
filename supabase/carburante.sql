-- ============================================================================
-- Carburante — fatture IP divise fra i centri di costo (11/11/2026)
-- ----------------------------------------------------------------------------
-- Le fatture delle carte carburante IP le paga l'Amministrazione (cc23), ma il
-- costo va ai servizi che hanno fatto i rifornimenti: Claudia carica ogni mese
-- l'export del portale IP in General/schede carburante, con il centro di
-- costo scritto su ogni rifornimento. L'app legge i file, abbina i
-- rifornimenti alle fatture e divide l'imponibile (lib/carburante/).
--
-- Il costo NON passa dalla ripartizione a percentuale dei costi generali di
-- cc23: il cruscotto (cdg_fatture_anno, qui sotto) mostra al posto della
-- fattura le sue quote per centro di costo.
--
-- Docs: docs/carburante.md
-- ============================================================================

-- I rifornimenti letti dai file. La chiave è il numero di protocollo della
-- transazione IP, presente in tutti e due i tracciati del portale: un file
-- riletto o ricaricato aggiorna le righe, non le duplica.
create table if not exists carburante_rifornimento (
  protocollo      text primary key,
  data            date not null,
  ora             text,
  carta           text,
  targa           text,
  cc_file         text,              -- come scritto nel file ("CC9", "GIULIA")
  cc_codice       text references centro_di_costo(codice),  -- null = non riconosciuto
  prodotto        text,
  litri           numeric(10,3),
  importo         numeric(10,2),     -- alla pompa, IVA compresa
  imponibile      numeric(10,2) not null,  -- fatturato IVA esclusa
  numero_fattura  text,
  data_fattura    date,
  -- La fattura che se l'è preso (per numero o per data). Lo scrive solo il
  -- ricalcolo, mai una schermata.
  fattura_passiva_id uuid references fattura_passiva(id) on delete set null,
  file_nome       text not null,
  letto_il        timestamptz not null default now()
);
create index if not exists carburante_rifornimento_numero_idx on carburante_rifornimento (numero_fattura);
create index if not exists carburante_rifornimento_data_idx on carburante_rifornimento (data);
create index if not exists carburante_rifornimento_fattura_idx on carburante_rifornimento (fattura_passiva_id);

-- I file già letti: si rilegge un file solo se su SharePoint è cambiato.
create table if not exists carburante_file (
  item_id       text primary key,      -- id del file su SharePoint
  nome          text not null,
  modificato_il timestamptz,           -- lastModifiedDateTime di SharePoint
  letto_il      timestamptz not null default now(),
  righe         int not null default 0,
  esito         text not null check (esito in ('letto','scartato','errore')),
  avvisi        text
);

-- I fornitori di carburante: le loro fatture nuove, se libere, diventano
-- "Carburante" da sole. Si aggiungono segnando a mano una loro fattura.
create table if not exists carburante_fornitore (
  piva         text primary key,
  nome         text,
  aggiunto_da  text,
  aggiunto_il  timestamptz not null default now()
);

-- La fattura è carburante: si paga dal centro di costo in cc_codice (cc23) ma
-- il costo si divide. Stato e nota li scrive il ricalcolo.
alter table fattura_passiva
  add column if not exists carburante        boolean not null default false,
  add column if not exists carburante_stato  text check (carburante_stato in ('in_attesa','divisa')),
  add column if not exists carburante_nota   text,
  add column if not exists carburante_diviso_il timestamptz;

create index if not exists fattura_passiva_carburante_idx on fattura_passiva (carburante) where carburante;

-- Le quote: una riga per centro di costo. Somma = imponibile della fattura.
create table if not exists carburante_quota (
  fattura_passiva_id uuid not null references fattura_passiva(id) on delete cascade,
  cc_codice          text not null references centro_di_costo(codice),
  importo            numeric(12,2) not null,
  rifornimenti       int not null default 0,
  primary key (fattura_passiva_id, cc_codice)
);

-- Riscrive le quote di una fattura in un colpo solo (cancella + inserisce),
-- così non resta mai mezza divisione. p_quote = [{cc, importo, rifornimenti}].
create or replace function carburante_quote_riscrivi(
  p_fattura uuid,
  p_stato   text,
  p_nota    text,
  p_quote   jsonb
) returns void
language plpgsql
as $$
begin
  delete from carburante_quota where fattura_passiva_id = p_fattura;
  insert into carburante_quota (fattura_passiva_id, cc_codice, importo, rifornimenti)
  select p_fattura, q->>'cc', (q->>'importo')::numeric, coalesce((q->>'rifornimenti')::int, 0)
    from jsonb_array_elements(coalesce(p_quote, '[]'::jsonb)) q;
  update fattura_passiva
     set carburante_stato = p_stato,
         carburante_nota = p_nota,
         carburante_diviso_il = now()
   where id = p_fattura;
end;
$$;

alter function carburante_quote_riscrivi(uuid, text, text, jsonb) set search_path = public, pg_temp;
revoke execute on function carburante_quote_riscrivi(uuid, text, text, jsonb) from public, anon, authenticated;

alter table carburante_rifornimento enable row level security;
alter table carburante_file        enable row level security;
alter table carburante_fornitore   enable row level security;
alter table carburante_quota       enable row level security;

-- ----------------------------------------------------------------------------
-- Cruscotto: la fattura carburante esce divisa nelle sue quote. Finché non è
-- divisa esce senza centro di costo ("da attribuire"), non su cc23: sennò
-- finirebbe nella ripartizione a percentuale dei costi generali.
-- ----------------------------------------------------------------------------
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
  with base as (
    select f.*, coalesce(f.data_fornitore, f.protocollo_data) as giorno
      from fattura_passiva f
     where f.file_sdi is not null
       and coalesce(f.data_fornitore, f.protocollo_data) >= make_date(p_anno, 1, 1)
       and coalesce(f.data_fornitore, f.protocollo_data) <  make_date(p_anno + 1, 1, 1)
  )
  -- fatture normali
  select b.id, nullif(b.cc_codice, 'DA_ATTRIBUIRE'), b.giorno, extract(month from b.giorno)::int,
         b.fornitore, b.numero_fornitore,
         case when b.tipo_documento = 'nota_credito' then -abs(b.imponibile) else b.imponibile end,
         true, b.tipo_documento = 'nota_credito'
    from base b
   where not b.carburante
  union all
  -- carburante divise: una riga per quota
  select b.id, nullif(q.cc_codice, 'DA_ATTRIBUIRE'), b.giorno, extract(month from b.giorno)::int,
         b.fornitore, b.numero_fornitore,
         case when b.tipo_documento = 'nota_credito' then -abs(q.importo) else q.importo end,
         true, b.tipo_documento = 'nota_credito'
    from base b
    join carburante_quota q on q.fattura_passiva_id = b.id
   where b.carburante
  union all
  -- carburante non ancora divise: da attribuire
  select b.id, null, b.giorno, extract(month from b.giorno)::int,
         b.fornitore, b.numero_fornitore,
         case when b.tipo_documento = 'nota_credito' then -abs(b.imponibile) else b.imponibile end,
         true, b.tipo_documento = 'nota_credito'
    from base b
   where b.carburante
     and not exists (select 1 from carburante_quota q where q.fattura_passiva_id = b.id)
   order by 3 desc, 1;
$$;

alter function cdg_fatture_anno(int) set search_path = public, pg_temp;
revoke execute on function cdg_fatture_anno(int) from public, anon, authenticated;
