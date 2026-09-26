-- ============================================================================
-- CONTROLLO DI GESTIONE · Fatture dagli XML dello SDI — migrazione
-- ----------------------------------------------------------------------------
-- Da eseguire DOPO pagamenti_schema.sql e uscite_manuali.sql. Idempotente.
-- Decisioni: docs/fatture-sdi.md (25/09/2026)
--
-- Cosa cambia, in una frase: la lista dei Flussi fatture non nasce più
-- dall'Excel di Fattura SMART ma dagli XML delle fatture messi nella cartella
-- SharePoint "General/fatture da SDI". L'XML non conosce il protocollo
-- interno del gestionale, che finora era la chiave: la chiave diventa
-- l'identificativo SDI, e il protocollo resta dov'è sulle righe vecchie.
--
-- Le righe già in archivio NON si toccano: una fattura che arriva in XML ed
-- esiste già (stessa P.IVA + numero + data del fornitore — verificato il
-- 25/09 su 106 fatture: corrispondenza 1:1) viene arricchita, non duplicata.
-- ============================================================================

-- --- 1. Fattura: il protocollo diventa facoltativo, arriva l'identificativo SDI
alter table fattura_passiva alter column protocollo_numero drop not null;
alter table fattura_passiva alter column protocollo_data   drop not null;

alter table fattura_passiva add column if not exists identificativo_sdi text;
create unique index if not exists fattura_passiva_sdi_uk
  on fattura_passiva (identificativo_sdi) where identificativo_sdi is not null;

-- Una fattura deve avere almeno una delle due identità: senza nessuna delle
-- due non c'è modo di riconoscerla al caricamento successivo.
alter table fattura_passiva drop constraint if exists fattura_passiva_identita_chk;
alter table fattura_passiva add constraint fattura_passiva_identita_chk check (
  (protocollo_numero is not null and protocollo_data is not null) or identificativo_sdi is not null
);

-- Chiave del raccordo con le righe nate dall'Excel.
create index if not exists fattura_passiva_raccordo_idx
  on fattura_passiva (piva, numero_fornitore, data_fornitore);

alter table fattura_passiva add column if not exists tipo_documento_sdi text;   -- TD01, TD04, TD06…
alter table fattura_passiva add column if not exists ritenuta numeric(12,2);
alter table fattura_passiva add column if not exists file_sdi text;             -- nome del file XML
alter table fattura_passiva add column if not exists file_sdi_url text;         -- dove sta dopo lo spostamento in "Importate"
alter table fattura_passiva add column if not exists pdf_url text;              -- PDF del fornitore, se era allegato all'XML
alter table fattura_passiva add column if not exists importata_sdi_il timestamptz;

-- --- 2. Il coordinatore che la prende in carico ------------------------------
-- `cc_codice` c'era già (attribuzione). Si aggiunge chi l'ha fatta e quando:
-- vince il primo, e l'update che la scrive lo impone con `where cc_codice is null`.
alter table fattura_passiva add column if not exists cc_rivendicata_da text;
alter table fattura_passiva add column if not exists cc_rivendicata_il timestamptz;

-- --- 3. Scadenza: IBAN, e il nuovo stato "da verificare" ---------------------
alter table scadenza add column if not exists iban text;

-- "da_verificare": nessuno sa ancora se va pagata. Serve a due casi:
--   senza_modalita — l'XML non dice come si paga (scontrini fatti fattura,
--                    ma anche parcelle di professionisti: non si indovina)
--   primo_import   — al primo caricamento dagli XML, le scadenze a bonifico
--                    già maturate potrebbero essere state pagate fuori
--                    dall'app: le guarda una persona, una volta sola.
alter table scadenza drop constraint if exists scadenza_stato_check;
alter table scadenza add constraint scadenza_stato_check check (stato in (
  'da_verificare', 'da_approvare', 'da_pagare', 'pagata', 'automatica', 'storica', 'stornata'
));
alter table scadenza add column if not exists motivo_verifica text;
alter table scadenza drop constraint if exists scadenza_motivo_verifica_check;
alter table scadenza add constraint scadenza_motivo_verifica_check
  check (motivo_verifica in ('senza_modalita', 'primo_import'));

-- Blocco al pagamento: la riga è da pagare ma manca qualcosa per farlo.
-- Non è uno stato: resta nella sua coda, con il motivo in vista.
alter table scadenza add column if not exists blocco text;
alter table scadenza drop constraint if exists scadenza_blocco_check;
alter table scadenza add constraint scadenza_blocco_check
  check (blocco in ('iban_mancante', 'iban_cambiato'));

-- --- 4. Fornitori: IBAN confermato e "paga al momento" ----------------------
-- Non è ancora l'anagrafica unica dei soggetti (piano del CdG, fase 3): è il
-- minimo che serve ai pagamenti. Chiave = P.IVA, come regola_fornitore.
create table if not exists fornitore (
  piva                text primary key,
  denominazione       text not null,
  -- IBAN su cui si paga. Arriva dalla prima fattura che lo porta, ma finché
  -- nessuno lo conferma resta "da fattura": l'IBAN cambiato in una fattura è
  -- la truffa più comune, e si blocca invece di seguirlo.
  iban                text,
  iban_fonte          text check (iban_fonte in ('fattura', 'manuale')),
  iban_confermato_da  text,
  iban_confermato_il  timestamptz,
  -- Fornitore che si paga sempre al momento (supermercati, negozi): le sue
  -- fatture senza modalità nascono pagate. Lo impara l'app quando qualcuno
  -- risponde "pagata in negozio" su una sua fattura.
  paga_al_momento     boolean not null default false,
  paga_al_momento_da  text,
  paga_al_momento_il  timestamptz,
  creato_il           timestamptz not null default now(),
  aggiornato_il       timestamptz not null default now()
);
alter table fornitore enable row level security;
