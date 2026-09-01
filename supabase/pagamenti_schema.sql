-- ============================================================================
-- CONTROLLO DI GESTIONE · Flussi fatture — schema Supabase (PostgreSQL)
-- ----------------------------------------------------------------------------
-- Da eseguire nel SQL editor del progetto Supabase (una volta sola).
-- L'app accede a queste tabelle SOLO lato server con la service role key:
-- la RLS resta disattivata, l'autorizzazione è mediata da next-auth +
-- i guard in lib/pagamenti/guard.ts.
--
-- Fonte delle decisioni: docs/controllo-di-gestione-piano.md
--   § Il flusso operativo dei pagamenti · § Tesoreria
-- Riepilogo operativo: docs/flussi-fatture.md
--
-- Le tre regole che questo schema fa rispettare:
--   1. il pagato lo scrive l'app (clic di chi paga, domani l'estratto conto).
--      Lo stato dell'Excel può SOLO chiudere una scadenza, mai riaprirne una
--      chiusa qui — e solo quando chi carica lo chiede esplicitamente.
--      `origine_pagamento` tiene traccia di chi l'ha detto.
--   2. una fattura può avere più scadenze (rate): la scadenza è una tabella,
--      non una colonna.
--   3. l'import è idempotente sul protocollo del gestionale: ricaricare lo
--      stesso export cumulativo non duplica niente.
-- ============================================================================

-- --- Fatture ricevute, come arrivano da Fattura SMART ------------------------
-- Nasce anche dal solo scadenzario: imponibile e IVA restano vuoti finché non
-- arriva l'Elenco documenti (import mensile, fase successiva).
create table if not exists fattura_passiva (
  id             uuid primary key default gen_random_uuid(),

  -- Protocollo interno del gestionale: è la chiave stabile.
  -- NON si usa piva+numero fornitore: ATC e SOGEGROSS ripetono lo stesso
  -- numero su documenti diversi e le righe si fonderebbero fra loro.
  protocollo_numero   text not null,
  protocollo_suffisso text not null default '',
  protocollo_data     date not null,

  -- Identità della fattura dal lato del fornitore (serve a unire i due export
  -- e a costruire l'anagrafica, non a deduplicare).
  numero_fornitore text,
  data_fornitore   date,

  piva           text,
  codice_fiscale text,
  fornitore      text not null,

  tipo_documento text not null default 'fattura'
                 check (tipo_documento in ('fattura','nota_credito')),

  -- Valorizzati dall'Elenco documenti (mensile). Oggi restano null.
  imponibile     numeric(12,2),
  iva            numeric(12,2),
  totale         numeric(12,2),

  descrizione    text,
  cc_codice      text,                    -- attribuzione: fase successiva
  creata_il      timestamptz not null default now(),

  unique (protocollo_numero, protocollo_suffisso, protocollo_data)
);

create index if not exists fattura_passiva_piva_idx      on fattura_passiva (piva);
create index if not exists fattura_passiva_fornitore_idx on fattura_passiva (lower(fornitore));

-- --- Le scadenze: una riga = una rata ----------------------------------------
create table if not exists scadenza (
  id                 uuid primary key default gen_random_uuid(),
  fattura_passiva_id uuid not null references fattura_passiva(id) on delete cascade,

  -- Posizione della scadenza dentro il documento: con il protocollo forma la
  -- chiave di deduplica. 36 documenti su 2.006 hanno più di una scadenza.
  posizione          int  not null default 1,

  data_scadenza      date not null,
  -- Netto da pagare, NON il totale fattura: la ritenuta d'acconto non esce dal
  -- conto del fornitore. Negativo sulle note di credito (il file le manda
  -- positive: il segno si inverte all'import, o finiscono in coda da pagare).
  importo            numeric(12,2) not null,
  modalita           text,                     -- Tipologia dichiarata dal fornitore
  famiglia_modalita  text not null default 'bonifico'
                     check (famiglia_modalita in ('bonifico','negozio','automatica','altro')),
  stimata            boolean not null default false,

  stato              text not null default 'da_pagare'
                     check (stato in ('da_approvare','da_pagare','pagata','automatica','storica','stornata')),

  data_pagamento     date,
  pagata_da          text,
  pagata_il          timestamptz,

  -- Chi ha detto che è pagata. Serve a non confondere un fatto con una
  -- registrazione contabile: 'app' è il clic di chi paga, 'gestionale' è lo
  -- stato letto dall'export (solo in chiusura, mai in riapertura), 'banca'
  -- sarà l'estratto conto quando ci sarà. In elenco le righe chiuse dal
  -- gestionale si distinguono, perché nessuno di noi le ha guardate.
  origine_pagamento  text check (origine_pagamento in ('app','gestionale','banca')),
  approvata_da       text,
  approvata_il       timestamptz,

  alert              text check (alert in ('possibile_doppio_pagamento')),

  -- Diagnostica dell'import, per capire perché una riga è finita dov'è.
  soglia_applicata   numeric(12,2),
  import_id          uuid,
  vista_il           timestamptz not null default now(),  -- ultimo import che l'ha rivista
  scomparsa          boolean not null default false,      -- c'era e ora non c'è più
  segnalazione       text,                                -- importo/data cambiati fra due import
  creata_il          timestamptz not null default now(),

  unique (fattura_passiva_id, posizione)
);

create index if not exists scadenza_coda_idx    on scadenza (stato, data_scadenza);
create index if not exists scadenza_fattura_idx on scadenza (fattura_passiva_id);

-- --- Ricevuta di ogni caricamento --------------------------------------------
-- Senza, il primo import che va storto è invisibile e il buco si scopre un
-- mese dopo.
create table if not exists import_file (
  id                 uuid primary key default gen_random_uuid(),
  nome_file          text not null,
  hash_file          text,                  -- stesso file due volte: si avvisa
  tracciato          text not null default 'scadenze',
  caricato_da        text not null,
  caricato_il        timestamptz not null default now(),
  righe              int not null default 0,
  nuove              int not null default 0,
  aggiornate         int not null default 0,
  invariate          int not null default 0,
  scartate           int not null default 0,
  scomparse          int not null default 0,
  soglia             numeric(12,2),
  esito              text not null default 'ok' check (esito in ('ok','errore')),
  dettaglio          jsonb
);

create index if not exists import_file_data_idx on import_file (caricato_il desc);

-- --- Note ---------------------------------------------------------------------
-- Nessun trigger e nessuna vista: le code si leggono con una query filtrata
-- sullo stato, e una vista materializzata sarebbe un secondo posto in cui la
-- verità può divergere.
