# Controllo di gestione — piano tecnico

> Stato al 14/08/2026: **proposta**, nessun codice scritto.
> Controparte tecnica di `Controllo_di_Gestione_Piano_CDA.docx` (documento per il CDA,
> nella cartella radice del progetto). Presuppone `docs/centri-di-costo-piano.md`.

---

## Principio

Un **registro unico dei movimenti analitici** su Supabase. Costi e ricavi, di qualunque
provenienza, ci finiscono nella stessa forma. Cruscotti, report, budget e alert leggono
solo da lì.

Vale la regola già stabilita per i centri di costo: **il CC si scrive sul documento, non
si ricalcola**. Vale anche per la voce del piano dei conti e per la data di competenza.

---

## Divisione dei ruoli fra i due database

| | SharePoint | Supabase |
|---|---|---|
| Cosa | anagrafiche e moduli compilati da persone | registro analitico e dati ad alto volume |
| Esempi | Centri di Costo, Strutture, Clienti, Richieste Acquisto, Fatture inviate | `movimento`, `fattura_passiva`, `movimento_bancario`, `regola_fornitore`, `costo_lavoro`, `budget` |
| Perché | permessi, allegati, storico leggibile, poche centinaia di righe | >10.000 righe/anno, aggregazioni server-side, import idempotenti |

Il collegamento fra i due è sempre il **codice** del CC (`cc1`…`cc23`), mai l'id numerico
SharePoint — stessa scelta già fatta per `servizio.centro_costo_codice`.

Stima volumi primo anno: ~2.200 righe di costo del lavoro (122 persone × 12 mesi × ~1,5 CC),
più fatture passive, movimenti bancari e ricavi. SharePoint andrebbe oltre la soglia dei
5.000 elementi entro il primo esercizio e non aggrega lato server.

---

## Schema Supabase (bozza)

```sql
-- piano dei conti analitico (~20 voci, mappate al bilancio civilistico)
create table voce_analitica (
  codice        text primary key,          -- 'PERS', 'UTEN', 'MANU', ...
  nome          text not null,
  tipo          text not null,             -- 'costo' | 'ricavo'
  voce_bilancio text,                      -- corrispondenza civilistica
  ordine        int
);

-- IL REGISTRO. tutto converge qui
create table movimento (
  id             uuid primary key default gen_random_uuid(),
  data_competenza date not null,           -- guida i cruscotti
  data_cassa      date,                    -- guida i flussi finanziari
  cc_codice       text not null,           -- 'cc1'...'cc23' | 'DA_ATTRIBUIRE'
  voce            text references voce_analitica(codice),
  importo         numeric(12,2) not null,  -- positivo = ricavo, negativo = costo
  controparte     text,                    -- ragione sociale fornitore/cliente
  piva            text,
  fonte           text not null,           -- 'acquisto'|'manutenzione'|'lavoro'|'fattura_passiva'|'contante'|'fattura_attiva'|'convenzione'|'contributo'|'incasso'|'manuale'
  origine_tipo    text,                    -- tabella/lista di provenienza
  origine_id      text,                    -- id del documento di origine
  confidenza      text,                    -- 'certa'|'alta'|'convenzionale'|'manuale'|'da_attribuire'
  motivo          text,                    -- perché il motore ha deciso così
  quota           numeric(5,4) default 1,  -- <1 se il documento è ripartito su più CC
  note            text,
  creato_il       timestamptz default now(),
  creato_da       text,
  unique (origine_tipo, origine_id, cc_codice)   -- import idempotente
);
create index on movimento (data_competenza);
create index on movimento (cc_codice, data_competenza);

-- fatture ricevute da SDI, come arrivano da Webdesk
create table fattura_passiva (
  id            uuid primary key default gen_random_uuid(),
  piva          text not null,
  fornitore     text not null,
  numero        text not null,
  data          date not null,
  imponibile    numeric(12,2),
  iva           numeric(12,2),
  totale        numeric(12,2) not null,
  descrizione   text,
  stato         text not null default 'da_attribuire',  -- 'attribuita'|'da_attribuire'|'in_conferma'
  import_id     uuid,
  unique (piva, numero, data)              -- rilanciare l'import non duplica
);

-- movimenti dei conti correnti (i 6 dedicati + quello comune)
create table movimento_bancario (
  id           uuid primary key default gen_random_uuid(),
  conto        text not null,              -- iban o alias
  cc_codice    text,                       -- valorizzato per i 6 conti dedicati
  data_valuta  date,
  data_contabile date not null,
  importo      numeric(12,2) not null,
  causale      text,
  hash         text unique                 -- idempotenza dell'import
);

create table appaiamento (          -- n:m fra pagamenti e fatture
  movimento_bancario_id uuid references movimento_bancario(id),
  fattura_passiva_id    uuid references fattura_passiva(id),
  importo               numeric(12,2),
  confidenza            text,
  primary key (movimento_bancario_id, fattura_passiva_id)
);

-- regole apprese e regole di ripartizione
create table regola_fornitore (
  piva       text not null,
  cc_codice  text not null,
  quota      numeric(5,4) not null default 1,  -- somma = 1 per piva
  origine    text,                             -- 'appresa' | 'manuale'
  conferme   int default 0,
  primary key (piva, cc_codice)
);

-- costo del lavoro: una riga per dipendente/mese/CC
create table costo_lavoro (
  dipendente_id int references dipendente(id),
  anno int, mese int,
  cc_codice text,
  ore numeric(8,2),
  costo numeric(12,2),
  primary key (dipendente_id, anno, mese, cc_codice)
);

create table cedolino_mese (         -- l'estrazione dell'ufficio paghe, grezza
  matricola text, anno int, mese int,
  lordo numeric(12,2), contributi numeric(12,2),
  accantonamenti numeric(12,2), costo_totale numeric(12,2),
  primary key (matricola, anno, mese)
);

create table budget (
  cc_codice text, anno int, mese int, voce text,
  importo numeric(12,2),
  primary key (cc_codice, anno, mese, voce)
);
```

Contratti/convenzioni: anagrafica su SharePoint (è un modulo compilato a mano), da cui un
cron genera ogni mese i `movimento` di ricavo per competenza.

---

## Motore di attribuzione — cascata

Ordine di applicazione su ogni `fattura_passiva` non ancora attribuita. Si ferma al primo
livello che risponde e scrive `cc_codice`, `confidenza`, `motivo`.

| # | Regola | Confidenza | Come |
|---|---|---|---|
| 1 | Documento interno | `certa` | match con richiesta acquisto / manutenzione: `piva` fornitore + `totale` ±0,01 + data ±30gg. Il CC è già sul documento |
| 2 | Conto dedicato | `alta` | via `appaiamento` → `movimento_bancario.cc_codice` non nullo |
| 3 | `regola_fornitore` con quota unica = 1 | `alta` | lookup su `piva` |
| 4 | `regola_fornitore` con più righe | `convenzionale` | genera N `movimento` con `quota` |
| 5 | — | `da_attribuire` | entra in coda, `cc_codice = 'DA_ATTRIBUIRE'` |

Ogni conferma manuale in coda fa `upsert` su `regola_fornitore` (`origine='appresa'`,
`conferme+1`). Da lì in poi la fattura non torna più in coda.

**Appaiamento banca↔fatture**: importo esatto o subset-sum su una finestra di candidati
(bonifici cumulativi), finestra data −5/+90gg, boost se la causale contiene il numero
fattura o il nome del fornitore. Sotto soglia di confidenza non si indovina: si lascia
non appaiato.

**Competenza ≠ cassa**: il `movimento` nasce sempre con `data_competenza = fattura.data`.
`data_cassa` si valorizza a posteriori quando l'appaiamento riesce.

---

## Costo del lavoro

Ogni mese, per dipendente:

```
costo_cc = cedolino_mese.costo_totale × (ore su quel CC / ore totali del mese)
```

Le ore vengono da `timbratura` join `servizio.centro_costo_codice` (già esistente).
Chiave di riconciliazione con l'estrazione paghe: **matricola** (vedi
`matricole_pulse_2026-07.csv` per la corrispondenza matr. cedolino ↔ matricola gestionale).

Giustificativi (ferie, 104, permessi) e costi non correlati alle ore: ripartiti sui CC del
dipendente in proporzione alle ore lavorate del mese. Decisione da confermare con l'ufficio.

**Riservatezza**: `cedolino_mese` e `costo_lavoro` per dipendente sono accessibili solo a
RU/Amministrazione (guard applicativo, come per il resto dell'area RU). Nei cruscotti
CC/CDA entra solo l'aggregato.

---

## Cosa cambia nel codice esistente

| Dove | Cosa |
|---|---|
| `lib/costi/data.ts` | `creaCosto()` scrive anche su `movimento` (o migra del tutto su Supabase, decidere in fase 0) |
| `lib/fatture/data.ts` | il menù a tendina c'è già; salvare il **nome** invece del lookup è una scelta deliberata (`lib/fatture/centri-di-costo.ts` righe 4-7: le richieste già inviate restano leggibili se un CC viene rinominato). Non passare al lookup: validare il nome contro l'anagrafica e riversare in `movimento` risolvendo su `codice` |
| `types/fatture.ts` | `REGIMI_NOTI` (const privata, usata solo da `regimeDi()`) → due colonne sulla lista SP Centri di Costo. Lavoro tutto interno al file. Il commento sopra la costante è stale: dice che la lista CC non esiste, ma esiste dal 14/08 |
| `lib/centri-costo/data.ts` | aggiungere `Responsabile` (oggi non letto, campo SP vuoto) |
| `supabase/` | nuove migrazioni, stesso stile idempotente delle timbrature |
| nuovo `lib/gestione/` | `registro.ts`, `import-webdesk.ts`, `import-banca.ts`, `import-paghe.ts`, `attribuzione.ts`, `coda.ts` |
| nuovo `app/(app)/gestione/` | cruscotto, coda di conferma, inserimento contanti |
| nuovo permesso | `'Controllo di Gestione'` in `AREE_PERMESSI` |

---

## Ordine di esecuzione

1. **Fondamenta** — piano dei conti; responsabili CC in anagrafica; verificare che nessun
   servizio attivo resti senza CC (query di controllo già in `supabase/timbrature_centri_di_costo.sql`);
   confermare che su cc3 Una Serra, cc21 Pian della Mussa e cc22 Amazing non timbri nessuno;
   schema Supabase; travaso dei costi esistenti.
2. **Costo del lavoro** — `import-paghe` + ripartizione + prova su un mese chiuso.
3. **Fatture passive** — `import-webdesk`, `import-banca`, `attribuzione`, coda, contanti.
4. **Ricavi** — fatture attive, contratti/convenzioni, contributi, incassi.
5. **Cruscotto e report**.
6. **Budget** (dall'esercizio 2027).

Le fasi 2, 3 e 4 sono indipendenti fra loro; tutte dipendono dalla 1.

---

## Materiale necessario prima di scrivere codice

- un'esportazione Webdesk di esempio (tracciato reale delle fatture passive)
- un estratto conto di esempio in xlsx/csv (formato causali e date)
- un'estrazione mensile dell'ufficio paghe (tracciato costante, con matricola)
- bilancio e piano dei conti in uso (per la mappatura delle voci analitiche)
- elenco convenzioni attive con importi e periodicità

Da verificare prima di costruire: se Webdesk può già esportare un campo commessa/CC, e se
l'export del gestionale dello studio commercialista contiene già una classificazione
riutilizzabile.
