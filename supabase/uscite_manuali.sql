-- ============================================================================
-- CONTROLLO DI GESTIONE · Uscite senza fattura — migrazione
-- ----------------------------------------------------------------------------
-- Da eseguire nel SQL editor di Supabase, una volta sola, DOPO
-- pagamenti_schema.sql. È idempotente: rieseguirla non fa danno.
--
-- Fonte della decisione: docs/uscite-senza-fattura.md (4 set 2026)
--
-- Il punto della migrazione, in una frase: i costi con scadenza che non
-- passano dallo SDI — F24, tributi, contributi, rate, ricariche carte — NON
-- sono un oggetto nuovo. Sono scadenze senza fattura. Quindi non nasce una
-- tabella parallela: si allarga `scadenza`.
--
-- La ragione è che tutto quello che serve già esiste ed è scritto sullo stato
-- e sulla data, non sulla fattura: le due code, il tasto PAGATA, i totali a
-- 7/30/60/90 giorni, lo scaduto per anzianità. Una tabella parallela avrebbe
-- richiesto di riscrivere ognuna di quelle cose, e ogni vista futura si
-- sarebbe dovuta ricordare di sommare due sorgenti. Prima o poi una se lo
-- dimentica, e il numero che esce è sbagliato senza che nulla lo segnali.
--
-- Le tre regole che questo schema fa rispettare:
--   1. una scadenza senza fattura ha un `oggetto` e nessun fornitore;
--      una scadenza con fattura ha il fornitore e nessun `oggetto`.
--      Il vincolo `scadenza_identita_chk` non lascia scegliere.
--   2. `origine` dice chi ha creato la riga. Serve a due cose: distinguerla
--      in elenco, e tenere l'import lontano da quello che non ha caricato lui.
--   3. le righe a mano nascono `da_pagare`, mai `da_approvare`: chi le
--      inserisce ha già in mano il documento e la decisione. La soglia di
--      approvazione resta solo sulle fatture (decisione di Dennis, 4 set 2026:
--      far approvare l'F24 ogni mese abitua ad approvare senza guardare).
-- ============================================================================

-- --- 1. La fattura diventa facoltativa ---------------------------------------
alter table scadenza alter column fattura_passiva_id drop not null;

-- --- 2. Identità della riga quando la fattura non c'è ------------------------
alter table scadenza add column if not exists oggetto text;

-- Costo o flusso. È la distinzione che Dennis ha chiesto e vale solo qui:
-- una fattura è sempre un costo, mentre una riga a mano può essere un semplice
-- movimento di cassa (ricarica delle carte, rata di un debito il cui costo è
-- già stato registrato quando è nato, restituzione di una quota sociale).
--   'costo'  → prima o poi va attribuito a un centro di costo
--   'flusso' → serve solo a previsione e fabbisogno di cassa
-- Resta null sulle righe che vengono dallo SDI: lì la domanda non si pone.
alter table scadenza add column if not exists natura text
  check (natura in ('costo', 'flusso'));

-- Chi ha creato la riga. 'sdi' è il default perché tutte le righe che
-- esistevano prima di questa migrazione vengono dall'import.
alter table scadenza add column if not exists origine text not null default 'sdi'
  check (origine in ('sdi', 'manuale'));

alter table scadenza add column if not exists inserita_da text;
alter table scadenza add column if not exists note text;

-- --- 3. Il vincolo che tiene insieme le due forme ----------------------------
-- Senza questo si può inserire una riga senza fattura e senza oggetto, che in
-- elenco compare come una scadenza anonima da pagare: il modo peggiore di
-- sbagliare, perché il totale è giusto e nessuno sa a cosa si riferisce.
alter table scadenza drop constraint if exists scadenza_identita_chk;
alter table scadenza add constraint scadenza_identita_chk check (
  (fattura_passiva_id is not null and oggetto is null)
  or
  (fattura_passiva_id is null and oggetto is not null and natura is not null)
);

-- Coerenza fra origine e presenza della fattura: una riga 'manuale' non ha
-- fattura, una riga 'sdi' ce l'ha. Sono due modi di dire la stessa cosa, e
-- tenerli allineati per vincolo evita di doverci fidare del codice.
alter table scadenza drop constraint if exists scadenza_origine_chk;
alter table scadenza add constraint scadenza_origine_chk check (
  (origine = 'sdi' and fattura_passiva_id is not null)
  or
  (origine = 'manuale' and fattura_passiva_id is null)
);

-- --- 4. Indice per l'elenco delle righe a mano -------------------------------
-- Parziale: le righe manuali sono e resteranno poche decine al mese contro
-- migliaia di scadenze da fattura, e un indice pieno su `origine` non
-- servirebbe a niente.
create index if not exists scadenza_manuali_idx
  on scadenza (data_scadenza) where origine = 'manuale';

-- --- Note su ciò che NON serve toccare ---------------------------------------
-- • `unique (fattura_passiva_id, posizione)`: resta com'è. In PostgreSQL due
--   NULL non sono considerati uguali, quindi il vincolo non impedisce di
--   inserire più righe a mano — che è esattamente il comportamento voluto.
--
-- • L'import: `lib/pagamenti/import.ts` cerca le righe già esistenti
--   filtrando su `fattura_passiva_id in (…)` con gli id delle fatture presenti
--   nel file. Le righe a mano hanno `fattura_passiva_id` nullo, quindi non
--   entrano mai in quell'insieme e non possono essere marcate «scomparse».
--   Verificato prima di scrivere questa migrazione: era il rischio più grosso
--   di tutta la modifica — il primo caricamento dopo il rilascio che cancella
--   il lavoro di chi inserisce a mano.
--
-- • Le ricorrenze non esistono in questa fase. Una riga che si ripete ogni
--   mese va inserita ogni mese, ed è comunque il momento in cui se ne conosce
--   l'importo (decisione di Dennis, 4 set 2026). Quando serviranno, la regola
--   sarà una tabella a parte che genera righe qui: questo schema non cambia.
