-- ============================================================
-- Riconciliazione Qonto ↔ fatture (1/11/2026) — docs/riconciliazione-qonto.md
--
-- Il pagato si controlla da quello che è uscito su Qonto. Qui stanno:
--  1. la copia delle USCITE dei conti Qonto (dal 1/11/2026), con lo stato
--     dell'abbinamento;
--  2. il collegamento scadenza → movimento;
--  3. quello che l'app impara dagli abbinamenti a mano (nome/IBAN della
--     controparte → fornitore, oppure "non serve fattura");
--  4. il centro di costo scritto in fattura (Amazon: causale / n. ordine).
-- RLS attiva e nessuna policy: lo legge solo il server (service role).
-- ============================================================

-- --- 1. Le uscite di Qonto ------------------------------------------------------
create table if not exists qonto_movimento (
  id                text primary key,                 -- id della transazione Qonto
  conto_id          text not null,
  conto_nome        text,
  conto_iban        text,
  cc_codice         text,                             -- dal nome del sottoconto; null = conto principale
  data              date not null,                    -- contabilizzazione (o emissione se in attesa), giorno di Roma
  emesso_il         timestamptz,
  importo           numeric(12,2) not null check (importo > 0),   -- uscita, in positivo
  stato_qonto       text not null check (stato_qonto in ('pending', 'completed')),
  tipo              text,                             -- operation_type: card, transfer, direct_debit…
  controparte       text,
  controparte_iban  text,
  etichetta         text,
  riferimento       text,
  nota              text,
  carta             text,                             -- ultime cifre
  abbinamento       text not null default 'da_abbinare'
                    check (abbinamento in ('da_abbinare', 'abbinato', 'ignorato')),
  modo              text check (modo in ('auto', 'manuale')),
  abbinato_da       text,
  abbinato_il       timestamptz,
  nota_abbinamento  text,
  -- Un abbinamento annullato a mano non torna automatico al giro dopo.
  solo_a_mano       boolean not null default false,
  visto_il          timestamptz not null default now(),
  creato_il         timestamptz not null default now()
);
create index if not exists qonto_movimento_da_abbinare_idx on qonto_movimento (abbinamento, data);
alter table qonto_movimento enable row level security;

-- --- 2. Scadenza → movimento -------------------------------------------------------
-- Più scadenze possono puntare allo stesso movimento (bonifico cumulativo).
alter table scadenza add column if not exists qonto_movimento_id text references qonto_movimento(id) on delete set null;
-- Lo stato che aveva prima di essere chiusa dall'abbinamento: serve ad annullarlo.
-- Null = l'abbinamento l'ha solo collegata (era già pagata).
alter table scadenza add column if not exists stato_prima_abbinamento text;
create index if not exists scadenza_qonto_movimento_idx on scadenza (qonto_movimento_id) where qonto_movimento_id is not null;

-- Nuovo avviso: la fattura dice "già pagata" ma su Qonto il movimento non c'è.
alter table scadenza drop constraint if exists scadenza_alert_check;
alter table scadenza add constraint scadenza_alert_check
  check (alert in ('possibile_doppio_pagamento', 'pagata_senza_movimento'));

-- --- 3. Quello che l'app impara --------------------------------------------------
-- chiave: 'iban:IT60X…' oppure 'nome:amzn mktp it' (normalizzato).
-- azione 'fornitore' → quella controparte è il fornitore con questa P.IVA;
-- azione 'ignora'    → uscite che non avranno mai una fattura (stipendi, commissioni).
create table if not exists qonto_controparte (
  id          bigint generated always as identity primary key,
  chiave      text not null,
  piva        text not null default '',
  azione      text not null check (azione in ('fornitore', 'ignora')),
  creato_da   text,
  creato_il   timestamptz not null default now(),
  unique (chiave, piva)
);
alter table qonto_controparte enable row level security;

-- --- 4. Centro di costo scritto in fattura -----------------------------------------
alter table fattura_passiva add column if not exists cc_indicato text;
