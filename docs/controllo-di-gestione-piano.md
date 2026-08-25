# Controllo di gestione — piano tecnico

> Stato al 22/08/2026: **proposta**, nessun codice scritto.
> Controparte tecnica di `Controllo_di_Gestione_Piano_CDA.docx` (radice progetto).
> Presuppone `docs/centri-di-costo-piano.md`.

---

## Principi

**1. Un registro solo.** Tutti i costi e i ricavi finiscono in `movimento`, nella stessa
forma. Cruscotti, report, budget e alert leggono solo da lì.

**2. Il CC si scrive sul documento, non si ricalcola.** Vale anche per la voce del piano
dei conti e per la data di competenza. Se un servizio cambia sede, lo storico resta com'era.

**3. Il registro si alimenta dai documenti, mai dalla banca.** Costi e ricavi nascono da
fatture, da dichiarazioni di spesa senza fattura, dal costo del lavoro e dalle richieste
d'acquisto. I movimenti bancari **non generano mai un movimento**: appaiano e valorizzano
`data_cassa`. È questa regola, più il vincolo di unicità su `(origine_tipo, origine_id,
cc_codice)`, che rende il doppio conteggio **impossibile per costruzione** invece di
qualcosa da riconoscere a posteriori.

**4. La linea fra IA, codice e persona.**

| | Cosa fa | Esempi |
|---|---|---|
| **IA** | legge e riconosce | ragioni sociali scritte a mano dall'operatore → P.IVA; scontrini fotografati; tracciati di import che cambiano colonne |
| **Codice** | conta e identifica | appaiamenti, subset-sum, tolleranze, unicità, ripartizioni |
| **Persona** | decide dove resta ambiguità | il residuo non attribuito, le combinazioni ambigue |

Ogni volta che si scavalca questa linea si guadagna una settimana di lavoro e si perde la
fiducia nei numeri: un importo sbagliato che sembra giusto è l'errore peggiore, perché
nessuno lo cerca.

---

## Divisione dei ruoli fra i due database

| | SharePoint | Supabase |
|---|---|---|
| Cosa | anagrafiche e moduli compilati da persone | registro analitico e dati ad alto volume |
| Esempi | Centri di Costo, Strutture, Clienti, Richieste Acquisto, Fatture inviate, Parametri | `movimento`, `fattura_passiva`, `movimento_bancario`, `spesa_dichiarata`, `regola_fornitore`, `costo_lavoro`, `budget` |
| Perché | permessi, allegati, storico leggibile, poche centinaia di righe | >10.000 righe/anno, aggregazioni server-side, import idempotenti |

Collegamento fra i due sempre per **codice CC** (`cc1`…`cc23`), mai per id SharePoint —
stessa scelta già fatta per `servizio.centro_costo_codice`.

---

## I conti e le carte

Cinque conti correnti più le prepagate. Ogni strumento di pagamento sta in una tabella
`conto` con — o senza — un centro di costo.

Assetto deciso il 22/08/2026: **due conti in banca e un conto Revolut**.

| Strumento | `cc_codice` | Attribuisce? |
|---|---|---|
| **Conto Generale** (banca) | **null** | **no** — è il canale dei bonifici, e dove stanno fido e castelletto |
| Conto La Locanda (banca) | `cc2` | sì |
| **Conto Revolut** | null | no — è il conto delle carte, ricaricato dal Generale |
| Carte Revolut, una **per persona** | null | no: il CC arriva dall'**etichetta** sulla singola spesa |

Cadono i conti dedicati di CO.S.MI.C.A., CER Giulia e Casa Artemisia: tutti i bonifici ai
fornitori escono dal Generale, dove c'è il credito. Il livello "conto → CC" resta quindi solo
per la Locanda.

**Le carte non sono per centro di costo, sono per persona.** Troppe persone lavorano su più
servizi (lo dicono le timbrature) perché una carta-per-CC funzioni. Il CC arriva invece
dall'**etichetta** che chi spende mette sulla transazione nell'app Revolut, insieme alla foto
dello scontrino; entrambe si possono rendere obbligatorie, con promemoria automatici.

- Revolut supporta fino a **5 gruppi di etichette**, etichette illimitate per gruppo,
  documentate proprio per il tracking per centro di costo. Un gruppo = i nostri 23 CC.
- Le etichette si leggono via **API** (`developer.revolut.com/docs/business/labels`), quindi
  arrivano fino al registro senza passaggi manuali.
- **Ogni carta ha un CC predefinito** = il servizio abituale della persona. Se l'etichetta
  manca all'import, si applica il predefinito e la riga si segnala. Da verificare se il
  default si imposta su Revolut o va tenuto da noi in una tabella `carta(id, persona, cc_default)`.

**Contanti aboliti.** Nessun anticipo di tasca propria: chi non ha carta passa dalla richiesta
d'acquisto per qualunque importo.

**Soglia di libera spesa: 100 €** sul singolo bene (era 150). Sulla carta si impostano un
tetto per operazione — **più alto** dei 100 €, altrimenti si blocca l'acquisto legittimo di
più articoli — e un tetto mensile. Il valore resta in lista SP Parametri.

Il Generale ospita i pagamenti dei 19 CC senza conto dedicato e la quasi totalità delle
entrate (tranne la Locanda). `cc_codice` resta **null**: se ci mettessimo un valore di
comodo, diciannove centri di costo finirebbero in un contenitore sbagliato con l'aria di
essere a posto.

**Giroconti.** I cinque IBAN e le ricariche delle prepagate sono movimenti interni: uscita
su un conto, entrata sull'altro, nessun fatto economico. Vanno riconosciuti (controparte in
`conto.iban`, o dalla causale se l'export non porta l'IBAN) e marcati `giroconto = true`,
esclusi dal registro. Senza questo filtro ogni smistamento di Claudia diventa un costo
finto sul Generale e un ricavo finto sul conto di destinazione.

**Confidenza delle carte.** Un movimento su carta di un conto dedicato eredita il CC del
conto con confidenza `alta`, non `certa`, e resta correggibile: basta che una volta la carta
di Cosmica paghi qualcosa di Giulia e l'attribuzione è muta e sbagliata. Presuppone
l'impegno organizzativo che dai conti dedicati escano solo spese di quel CC.

---

## Il modello di cattura

Chi attribuisce, per ciascun canale di pagamento:

| Canale | Chi attribuisce | Meccanismo |
|---|---|---|
| Spesa con carta Revolut | chi spende, sul momento | etichetta CC sulla transazione + scontrino, via API |
| Conto Locanda | nessuno | `conto.cc_codice = cc2` |
| Bonifico dal Generale | l'operatore, in anticipo | `spesa_dichiarata` appaiata alla fattura |
| Fattura estera | l'operatore | `spesa_dichiarata` con `estera = true` + allegato |
| Richiesta d'acquisto (chi non ha carta) | il richiedente | CC già sul documento, come oggi |
| Utenze | nessuno | POD / PDR / contatore → `utenza` |

---

## Schema Supabase (bozza)

```sql
-- piano dei conti analitico (~20 voci, mappate al bilancio civilistico)
create table voce_analitica (
  codice        text primary key,          -- 'PERS', 'UTEN', 'MANU', ...
  nome          text not null,
  tipo          text not null,             -- 'costo' | 'ricavo'
  voce_bilancio text,
  ordine        int
);

-- strumenti di pagamento
create table conto (
  id         serial primary key,
  nome       text not null,
  iban       text unique,
  tipo       text not null,               -- 'corrente' | 'carta' | 'prepagata'
  cc_codice  text,                        -- null = non attribuisce (Generale)
  attivo     boolean default true
);

-- IL REGISTRO. tutto converge qui
create table movimento (
  id              uuid primary key default gen_random_uuid(),
  data_competenza date not null,           -- guida i cruscotti
  data_cassa      date,                    -- valorizzata dall'appaiamento bancario
  cc_codice       text not null,           -- 'cc1'...'cc23' | 'DA_ATTRIBUIRE'
  voce            text references voce_analitica(codice),
  importo         numeric(12,2) not null,  -- positivo = ricavo, negativo = costo
  controparte     text,
  piva            text,
  fonte           text not null,           -- 'acquisto'|'manutenzione'|'lavoro'|'fattura_passiva'|'spesa_dichiarata'|'fattura_attiva'|'convenzione'|'contributo'|'incasso'|'manuale'
  origine_tipo    text,
  origine_id      text,
  confidenza      text,                    -- 'certa'|'alta'|'convenzionale'|'manuale'|'da_attribuire'
  motivo          text,                    -- perché il sistema ha deciso così
  quota           numeric(5,4) default 1,  -- <1 se il documento è ripartito su più CC
  note            text,
  creato_il       timestamptz default now(),
  creato_da       text,
  unique (origine_tipo, origine_id, cc_codice)   -- import idempotente + anti-doppio-conteggio
);
create index on movimento (data_competenza);
create index on movimento (cc_codice, data_competenza);

-- fatture ricevute da SDI, come arrivano da Webdesk
create table fattura_passiva (
  id          uuid primary key default gen_random_uuid(),
  piva        text not null,
  fornitore   text not null,
  numero      text not null,
  data        date not null,
  imponibile  numeric(12,2),
  iva         numeric(12,2),
  totale      numeric(12,2) not null,
  descrizione text,
  stato       text not null default 'da_attribuire',
  import_id   uuid,
  unique (piva, numero, data)              -- rilanciare l'import non duplica
);

-- quello che l'operatore inserisce in "Inserisci Spesa"
create table spesa_dichiarata (
  id             uuid primary key default gen_random_uuid(),
  data           date not null,
  importo        numeric(12,2) not null,   -- totale pagato, IVA inclusa
  ditta          text not null,            -- testo libero, ma...
  piva           text,                     -- ...valorizzata se scelto dall'autocompletamento
  cc_codice      text not null,
  voce           text,
  estera         boolean default false,    -- spunta "fattura estera": la dichiarazione È il costo
  allegato_url   text,                     -- documento della fattura estera
  inserita_da    text not null,
  fattura_attesa boolean default true,     -- false solo per le estere
  stato          text default 'in_attesa', -- 'in_attesa'|'appaiata'|'diventata_costo'|'orfana'
  creata_il      timestamptz default now()
);

-- movimenti dei conti (5 correnti + carte + prepagate)
create table movimento_bancario (
  id             uuid primary key default gen_random_uuid(),
  conto_id       int references conto(id),
  data_valuta    date,
  data_contabile date not null,
  importo        numeric(12,2) not null,
  causale        text,
  controparte_iban text,
  giroconto      boolean default false,    -- controparte fra i conti nostri → escluso
  hash           text unique               -- idempotenza dell'import
);

create table appaiamento (          -- n:m, gestisce bonifici cumulativi
  movimento_bancario_id uuid references movimento_bancario(id),
  fattura_passiva_id    uuid references fattura_passiva(id),
  importo               numeric(12,2),
  confidenza            text,
  primary key (movimento_bancario_id, fattura_passiva_id)
);

-- regole fornitore→CC: si formano dalle dichiarazioni e dalle chiusure manuali
create table regola_fornitore (
  piva      text not null,
  cc_codice text not null,
  quota     numeric(5,4) not null default 1,  -- somma = 1 per piva
  origine   text,                             -- 'appresa' | 'manuale'
  conferme  int default 0,
  dal       date,
  al        date,
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

create table cedolino_mese (         -- estrazione dell'ufficio paghe, grezza
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

## Attribuzione delle fatture passive — cascata

Ordine di applicazione su ogni `fattura_passiva` non attribuita. Si ferma al primo livello
che risponde e scrive `cc_codice`, `confidenza`, `motivo`.

| # | Regola | Confidenza |
|---|---|---|
| 1 | Match con richiesta d'acquisto o manutenzione: `piva` + `totale` ±0,01 + data ±30gg. Il CC è già sul documento | `certa` |
| 2 | **Utenza**: la fattura porta un POD / PDR / matricola contatore presente in `utenza` | `certa` |
| 3 | Appaiata a una spesa con carta Revolut → CC dall'etichetta (o dal `cc_default` della carta) | `alta` |
| 3b | Appaiata a un `movimento_bancario` il cui `conto.cc_codice` non è null (oggi: solo la Locanda) | `alta` |
| 4 | Match con una o più `spesa_dichiarata` | `alta` |
| 5 | `regola_fornitore` con quota unica = 1 | `alta` |
| 6 | `regola_fornitore` con più righe → N `movimento` con `quota` | `convenzionale` |
| 7 | niente: `cc_codice = 'DA_ATTRIBUIRE'`, in lista per l'amministrazione | `da_attribuire` |

**Niente coda per i responsabili.** L'attribuzione è in avanti, dalla dichiarazione. Il
residuo del livello 6 è una lista nel cruscotto che chiude Claudia/amministrazione, e resta
visibile come "da attribuire" nel report al CDA: è la misura della salute del sistema.

**Le regole si imparano dalle dichiarazioni.** Ogni `spesa_dichiarata` con `piva`
valorizzata fa upsert su `regola_fornitore` (`origine='appresa'`, `conferme+1`); idem ogni
chiusura manuale del residuo. Applicazione automatica solo se la P.IVA è stata coerente su
un solo CC per almeno 3 conferme. Le ripartizioni multi-CC sono sempre `origine='manuale'`:
una ripartizione appresa sarebbe un numero inventato.

**Discordanze.** Se il livello 2 e il livello 3 dicono CC diversi (bonifico da conto
dedicato con dichiarazione su altro CC), non sovrascrivere in silenzio: segnalare. È la
spia di un errore di inserimento o di un conto usato per qualcosa che non gli compete.

**Fornitore che cambia destinazione.** Non riscrivere la regola: chiuderla con `al` e
aprirne una nuova, così lo storico resta leggibile.

---

## Utenze: attribuzione per codice di fornitura

**Le bollette non si ripartiscono per convenzione: si attribuiscono esattamente.** Ogni
fornitura ha un identificativo permanente stampato sulla fattura — POD (energia), PDR (gas),
matricola contatore (acqua) — che identifica il contatore fisico di una sede. Esiste già una
lista SharePoint nel sito Controllo Gestione che associa a ogni struttura il suo POD, PDR e
contatore: da mirrorare in `utenza`.

```sql
create table utenza (
  codice     text primary key,     -- POD / PDR / matricola contatore
  tipo       text not null,        -- 'energia' | 'gas' | 'acqua'
  struttura  text,
  cc_codice  text not null,
  quota      numeric(5,4) default 1,  -- <1 se la sede ospita due servizi
  attiva     boolean default true
);
```

Il meccanismo generalizza: **qualunque identificativo stampato sulla fattura che punti a un
CC** entra in questa tabella o in una gemella. Casi già noti: numero SIM (esiste la lista
`SIM e Utenze` prevista in `docs/it-dispositivi-piano.md`), targa del veicolo, codice cliente
del fornitore. È la sostituzione buona del livello "fornitore trasversale con chiave di
riparto", che resta solo per ciò che davvero non ha un identificativo (assicurazioni).

Attenzione: POD → struttura → CC è una catena a due passi, e reintroduce la struttura come
intermediario. Va risolta **al momento dell'import**, scrivendo il CC sul movimento; mai
ricalcolata a runtime. Meglio ancora: `utenza` punta diretta al CC, con la struttura solo
come informazione di comodo.

**Due verifiche prima di costruire:**

1. Il codice arriva nel file Webdesk? Sul PDF c'è sempre; nell'export riepilogativo
   probabilmente no (numero, data, importo). Se manca, serve l'XML della fattura o il
   dettaglio del fornitore. Dalle bollette in archivio (`sites/Rendicontazione`, cartelle
   UTENZE) sembra che **ogni fornitura sia fatturata separatamente** con importi piccoli
   (14-82 €): in quel caso basta anche l'indirizzo o il codice cliente. Da confermare.
2. Le sedi che ospitano due servizi vanno completate con la `quota`.

---

## Anagrafica unica dei soggetti (clienti + fornitori)

**Un elenco solo, non due.** Richiesta Fattura poggia già su ~725 clienti (`SP_LIST_CLIENTI`,
`lib/clienti/data.ts`). I fornitori hanno gli stessi campi identificativi, e lo stesso
soggetto può essere entrambe le cose. Due liste separate significherebbero la stessa P.IVA
scritta due volte e un indirizzo aggiornato in un posto e vecchio nell'altro.

Disegno: la lista Clienti diventa **Soggetti**, con due booleani `Cliente` e `Fornitore`.
Ogni tendina filtra sul proprio flag, così l'elenco clienti di Richiesta Fattura non si
riempie delle centinaia di fornitori importati da Webdesk. Un soggetto importato da Webdesk
nasce con `Fornitore = true`; se poi gli si fattura, si aggiunge `Cliente = true`.

I campi specifici del ruolo cliente già presenti (`Scadenza`, `TipoPagamento`,
`AddebitoBollo`) restano e semplicemente non si valorizzano per i fornitori; per il ruolo
fornitore serviranno `CentroCostoAbituale` e `IBAN`.

Merge per P.IVA / CF. Attenzione ai doppioni noti dell'anagrafica clienti che **non sono
doppioni** (vedi memoria di progetto): dove P.IVA e CF mancano — i privati — il merge per
nome va evitato.

---

## Appaiamento `spesa_dichiarata` ↔ `fattura_passiva`

Il punto più delicato del sistema, perché i due dati non coincidono mai esattamente.

- **Data**: finestra solo in avanti (la fattura è sempre dopo la spesa), ampia — indicativo
  −0/+45 gg.
- **Importo**: confronto sul **totale documento** (l'operatore dichiara quello che ha
  pagato, IVA inclusa), con tolleranza; la fattura può includere trasporto o bolli assenti
  dalla dichiarazione.
- **Una fattura, più dichiarazioni**: fornitore che fattura a fine mese più consegne.
  **Subset-sum** sulle dichiarazioni di quel fornitore nella finestra — esatto e in
  millisecondi, non un compito per un modello. Se due combinazioni diverse danno lo stesso
  totale, non indovinare: la fattura va nella lista dell'amministrazione.
- **Nome della ditta**: "il ferramenta di Vigliani" ≠ "ROSSI & C. SNC". Qui serve l'IA.

**La mitigazione che vale più di tutto il resto**: l'**autocompletamento dei fornitori**
nel form di Inserisci Spesa, alimentato dall'anagrafica fornitori costruita dallo storico
Webdesk. Se l'operatore sceglie dalla tendina, `spesa_dichiarata.piva` è valorizzata e
l'appaiamento è esatto. Il testo libero resta solo come ripiego, e in quel caso interviene
il riconoscimento fuzzy.

**Ciclo di vita della dichiarazione.** Nasce come *indizio di attribuzione*, non come
costo:

- `estera = true` (nessuna fattura arriverà mai dallo SDI) → diventa
  subito un `movimento`;
- appaiata a una fattura → la fattura genera il `movimento`, la dichiarazione le presta
  solo il CC (`stato='appaiata'`);
- nessuna fattura dopo 60 giorni → `stato='orfana'`, in una lista **dichiarazioni senza
  fattura** per l'amministrazione. O l'importo era sbagliato, o quel fornitore non ha mai
  fatturato: è un controllo che oggi non esiste.

Le due liste sono simmetriche: *fatture senza dichiarazione* (il residuo) e *dichiarazioni
senza fattura* (le orfane). Entrambe azionabili, entrambe in carico all'amministrazione.

---

## Ricavi

Nessun Webdesk: qui non c'è un elenco che arriva da fuori.

| Canale | Meccanismo |
|---|---|
| Fatture attive | dalla sezione Richiesta Fattura, che porta già il CC → riversamento in `movimento` |
| Convenzioni e rette | anagrafica contratti su SP (ente, CC, importo, periodicità, decorrenza/scadenza) → cron mensile che genera il ricavo di competenza. Il confronto maturato vs fatturato segnala le fatturazioni dimenticate |
| Contributi e bandi | quota di competenza dell'esercizio, non per cassa |
| Incassi diretti Locanda | dal **registratore di cassa** (corrispettivi telematici), non dal conto: sul conto il POS è al netto delle commissioni e il contante arriva a blocchi |
| Altro | inserimento manuale di ricavo diretto |

Gli incassi sul Generale servono ad appaiare le fatture attive e a valorizzare `data_cassa`,
non ad attribuire.

---

## Costo del lavoro

Ogni mese, per dipendente:

```
costo_cc = cedolino_mese.costo_totale × (ore su quel CC / ore totali del mese)
```

Ore da `timbratura` join `servizio.centro_costo_codice` (già esistente). Chiave di
riconciliazione con l'estrazione paghe: **matricola** (corrispondenza matr. cedolino ↔
matricola gestionale in `matricole_pulse_2026-07.csv`).

Giustificativi (ferie, 104, permessi) e costi non correlati alle ore: ripartiti sui CC del
dipendente in proporzione alle ore lavorate del mese. Da confermare con l'ufficio.

**Riservatezza**: `cedolino_mese` e `costo_lavoro` per dipendente accessibili solo a
RU/Amministrazione (guard applicativo). Nei cruscotti CC/CDA solo l'aggregato.

---

## Cosa cambia nel codice esistente

| Dove | Cosa |
|---|---|
| `lib/costi/data.ts` | `creaCosto()` scrive anche su `movimento` (o migra del tutto su Supabase, decidere in fase 0) |
| `lib/fatture/data.ts` | il menù a tendina c'è già; salvare il **nome** invece del lookup è scelta deliberata (`lib/fatture/centri-di-costo.ts` righe 4-7). Non passare al lookup: validare il nome e risolvere su `codice` nel riversamento |
| `types/fatture.ts` | `REGIMI_NOTI` (const privata, usata solo da `regimeDi()`) → due colonne sulla lista SP Centri di Costo. Il commento sopra la costante è stale: dice che la lista CC non esiste, ma esiste dal 14/08 |
| `lib/centri-costo/data.ts` | aggiungere `Responsabile` al select e all'interfaccia (campo SP presente ma non letto). Le nomine sono già state fatte fuori dall'app: resta da popolare la colonna |
| lista SP Parametri | nuova riga per la soglia di libera spesa (150 €) |
| `lib/acquisti/flusso.ts` | salto approvazione sotto soglia |
| `supabase/` | nuove migrazioni, stesso stile idempotente delle timbrature |
| nuovo `lib/gestione/` | `registro.ts`, `import-webdesk.ts`, `import-banca.ts`, `import-paghe.ts`, `attribuzione.ts`, `appaiamento.ts`, `fornitori.ts` |
| nuovo `app/(app)/gestione/` | cruscotto, lista residuo, lista dichiarazioni orfane |
| nuovo `app/(app)/inserisci-spesa/` | form mobile-first: data, importo, ditta (autocomplete), CC, spunta estera con allegato. **Niente contanti, niente scontrini**: quelli stanno su Revolut |
| nuovo `lib/gestione/import-revolut.ts` | transazioni carte + etichette CC + ricevute, via API |
| nuovo permesso | `'Controllo di Gestione'` in `AREE_PERMESSI` |

---

## Ordine di esecuzione

1. **Fondamenta** — piano dei conti; popolare i responsabili CC in anagrafica (nomine già
   fatte); verificare che nessun
   servizio attivo resti senza CC (query in `supabase/timbrature_centri_di_costo.sql`);
   confermare che su cc3 Una Serra, cc21 Pian della Mussa e cc22 Amazing non timbri
   nessuno; tabella `conto` con i 5 IBAN e le prepagate; schema Supabase; travaso dei
   costi esistenti.
2. **Costo del lavoro** — `import-paghe` + ripartizione + prova su un mese chiuso.
3. **Inserisci Spesa** — form + anagrafica fornitori con autocompletamento. Va **prima**
   dell'import fatture: le dichiarazioni devono esistere quando le fatture arrivano.
4. **Fatture passive** — `import-webdesk`, `import-banca`, cascata, appaiamento, liste
   residuo e orfane.
5. **Ricavi** — fatture attive, contratti/convenzioni, contributi, incassi Locanda.
6. **Cruscotto e report**.
7. **Budget** (dall'esercizio 2027).

Le fasi 2 e 5 sono indipendenti; 3 precede 4.

---

## Materiale necessario prima di scrivere codice

- un'esportazione Webdesk di esempio (tracciato reale; **verificare se contiene le
  autofatture esterometro TD17/TD18/TD19**: se sì, le fatture estere arrivano già e la
  spunta serve a non contarle due volte)
- un estratto conto di esempio in xlsx/csv per ciascun tipo (dedicato, Generale, prepagata):
  serve sapere se c'è l'**IBAN della controparte**, altrimenti i giroconti si riconoscono
  solo dalla causale
- un'estrazione mensile dell'ufficio paghe (tracciato costante, con matricola)
- bilancio e piano dei conti in uso
- elenco convenzioni attive con importi e periodicità
- elenco IBAN dei 5 conti e delle prepagate, con il CC di ciascuna

Da verificare prima di costruire: se Webdesk può già esportare un campo commessa/CC, e se
l'export del gestionale dello studio commercialista contiene già una classificazione
riutilizzabile.
