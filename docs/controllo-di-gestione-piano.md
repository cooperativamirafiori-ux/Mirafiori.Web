# Controllo di gestione — piano tecnico

> Stato al 27/08/2026: **proposta**, nessun codice scritto.
> Controparte tecnica dei documenti in radice progetto: `Controllo_di_Gestione_Piano_CDA.docx`,
> `Controllo_di_Gestione_Come_Funziona.docx` e `Pagamenti_e_Liquidita.docx`.
> Presuppone `docs/centri-di-costo-piano.md`.
>
> Copre sei moduli: registro analitico, cattura dei costi, ricavi, costo del lavoro,
> **tesoreria** e **budget**. Lo schema dati è unico e si scrive tutto in fase 1; la
> costruzione è a fasi (vedi *Ordine di esecuzione*).

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

Assetto deciso il 22/08/2026: **due conti in banca e un conto Revolut**. Ogni strumento di
pagamento sta in una tabella `conto` con — o senza — un centro di costo.

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

Il Generale ospita i pagamenti di tutti i CC tranne la Locanda, e la quasi totalità delle
entrate. `cc_codice` resta **null**: se ci mettessimo un valore di comodo, ventidue centri
di costo finirebbero in un contenitore sbagliato con l'aria di essere a posto.

**Giroconti.** Le ricariche del conto Revolut dal Generale sono movimenti interni: uscita su
un conto, entrata sull'altro, nessun fatto economico. Vanno riconosciuti (controparte in
`conto.iban`, o dalla causale se l'export non porta l'IBAN) e marcati `giroconto = true`,
esclusi dal registro. Senza questo filtro ogni ricarica settimanale diventa un costo finto
sul Generale e un ricavo finto su Revolut — e siccome le ricariche coprono *tutta* la spesa
con carta, l'errore raddoppierebbe esattamente la voce più frequente del registro.

**Confidenza dell'etichetta.** Una spesa con carta eredita il CC dall'etichetta con
confidenza `certa` se l'etichetta c'è, `alta` se si è applicato il `cc_default` della carta
— e in quel secondo caso la riga si segnala. Il default è un ripiego ragionevole, non una
risposta: se una persona che lavora abitualmente su Cosmica compra per Giulia e non etichetta,
l'attribuzione è muta e sbagliata.

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
  tipo       text not null,               -- 'corrente' | 'carta'
  cc_codice  text,                        -- null = non attribuisce (Generale, Revolut)
  fido       numeric(12,2) default 0,     -- la linea rossa della previsione è -fido
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

-- movimenti dei conti (Generale, Locanda, Revolut + carte)
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

## Il tracciato Webdesk — verificato

> Verificato il 27/08/2026 su `FattureAcquisto_Full.xlsx`: **438 fatture su 6.082 righe**,
> 2 luglio – 27 agosto 2026, 144.714 € totali. Sostituisce le ipotesi fatte finora.

L'export si chiama "Elenco documenti presenti in Fattura SMART", intestazioni a **riga 4**,
dati dalla 5. 51 colonne.

### È a livello di riga, non di fattura

Ogni fattura occupa una riga per voce di dettaglio — media 13,9 righe, massimo 209. La
descrizione della riga c'è, ed è un'informazione che non ci aspettavamo di avere.

**La trappola da evitare all'import**: `Totale (val)`, `Imponibile (val)` e `Imposta (val)`
sono **ripetuti identici su ogni riga** del documento. Sommarli riga per riga moltiplica il
costo per il numero di righe — 14 volte in media, 209 volte nel caso peggiore. Il totale
documento si prende **una volta sola per chiave documento**; gli importi di riga stanno in
`Prezzo Tot.`.

Chiave documento: **`Anno` + `Numero` + `Suffisso`** (numerazione interna del protocollo).
Il numero del fornitore è `Numero Rif. fornitore` e la sua data `Data Rif. fornitore`. Per
`fattura_passiva.unique(piva, numero, data)` vanno usati questi ultimi due, non il protocollo.

Volume: ~220 fatture e ~3.000 righe al mese. Su base annua ~2.600 fatture e ~36.000 righe:
la scelta di Supabase per il registro è confermata dai numeri.

### Il secondo export: lo scadenzario — ✅ risolve il blocco

> `ScadenzeFornitori.xlsx`, ottenuto il 27/08/2026. **2.053 scadenze**, gennaio–agosto 2026.
> È l'export *Elenco scadenze presenti in Fattura SMART*, distinto dall'*Elenco documenti*.
> **Basta da solo per tutto il modulo Pagamenti.**

Stessa forma dell'altro: intestazioni a riga 4, dati dalla 5, 17 colonne. Ma qui **una riga è
una scadenza**, non una riga di dettaglio — niente totali ripetuti, niente aggregazione da
fare. 2.006 documenti, 36 con più di una scadenza.

| Colonna | Serve a |
|---|---|
| ~~`Stato`~~ | Pagata (1.657) / Scaduta (287) / A scadere (109) — **da NON usare**, vedi sotto |
| **`Scadenza`** | **valorizzata su tutte le 2.053 righe** |
| `Tipologia` | modalità di pagamento → smistamento delle code |
| `Tipo Documento` | Fattura di Acquisto (2.018) / **Nota di Credito Fornitore (35)** |
| `Numero`/`Suffisso Documento`, `Data` | protocollo interno |
| `Numero`/`Data Riferimento`, `Partita IVA`, `Codice Fiscale` | identità della fattura del fornitore |
| `Totale` | importo netto da pagare (vedi sotto) |
| ~~`Pagato`, `Di cui Abbuono`, `Data Pagamento`~~ | **da NON usare** |
| `Note` | 13 righe su 2.053 |

**Verificato contro l'altro export**: sui 387 documenti presenti in entrambi, in **381 la somma
delle scadenze coincide al centesimo** con il totale della fattura. Le sei differenze sono
tutte spiegate, e una è importante.

#### Il totale della scadenza è il netto da pagare, non il totale della fattura

BAUSARDO ROBERTO: fattura 437,74 €, scadenza **368,74 €**. La differenza è la **ritenuta
d'acconto del 20%** (69,00 €), che non esce dal conto del fornitore ma va all'erario.

È il comportamento giusto, ed è la ragione per cui i due file non sono intercambiabili:

- per la **tesoreria** conta il netto — è quello che esce dal conto: `scadenza.importo`
- per il **registro costi** conta il documento — imponibile e IVA: `fattura_passiva.totale`

La ritenuta poi ricompare come F24, che è già fra le `uscita_fissa`. Le altre cinque
differenze sono arrotondamenti da uno o due centesimi (Amazon, Spesa Intelligente).

#### ⚠ Le note di credito hanno importo positivo

35 note di credito nel campione, tutte con `Totale` **positivo** — 3.750,80 €, 1.892,47 €,
1.600,50 €. **Non si riconoscono dal segno**: l'unico modo è `Tipo Documento`.

Chi sommasse le scadenze aperte senza guardare il tipo si troverebbe un debito gonfiato di
5.896 € su 174.113 — e le note di credito finirebbero in coda a Claudia come fatture da
pagare. All'import il segno va invertito: `if 'Nota di Credito' in tipo: importo = -importo`.

#### ⚠ `Stato` e `Data Pagamento` NON si usano

Le colonne ci sono e sono complete — `Data Pagamento` valorizzata su tutte le 1.657 pagate —
ma **il dato non è affidabile** (indicazione di Dennis, 27/08/2026): riflette la registrazione
contabile, che può essere in ritardo, incompleta o fatta con criteri diversi dal momento in
cui il denaro è uscito davvero.

**L'import legge solo**: scadenza, importo, fornitore, P.IVA, tipologia, tipo documento,
protocollo. `Stato`, `Pagato`, `Di cui Abbuono` e `Data Pagamento` si **ignorano**.

**La fonte di verità sul pagato è l'app**: il clic di Claudia oggi, l'estratto conto bancario
quando ci sarà. In nessun caso l'Excel. È una scelta che va scritta nel codice dell'import come
esclusione esplicita delle colonne, non come dimenticanza — altrimenti al primo refactoring
qualcuno le "recupera" pensando di migliorare le cose.

Conseguenza da presidiare: se Claudia non clicca, la fattura resta in coda per sempre. Il
rimedio non è tornare all'Excel, è la lista delle **scadenze pagate da oltre 30 giorni secondo
il gestionale e non secondo noi** — visibile ma non automatica, così l'incoerenza si vede senza
che nessuno se ne fidi.

#### `Tipologia` è la modalità che dichiara il fornitore

Non è come *noi* abbiamo pagato: è il campo `ModalitàPagamento` dell'XML, scritto da chi emette
la fattura. Il dato lo dimostra:

| Fornitore | Come è registrato |
|---|---|
| LIDL | Contanti 56, Carta 1 |
| Leroy Merlin | Carta 7 |
| Spesa Intelligente | Contanti 242, Carta 40 |
| Amazon | Bonifico 24, Carta 17 |
| SOGEGROSS | Bonifico 260 |

Per il nostro scopo funziona, e non per caso: nei negozi il fornitore **sa** come è stato pagato,
perché la fattura la emette dopo l'incasso alla cassa. Lidl scrive contanti perché alla cassa
sono stati dati contanti. Sogegross scrive bonifico perché è un cash & carry che fattura a fine
mese.

Ma è una dichiarazione altrui, non un fatto verificato da noi: **è la ragione per cui serve la
protezione contro il doppio pagamento** descritta nel flusso operativo. Un fornitore che scrive
"bonifico" su una fattura già saldata con carta manderebbe quella riga in coda a Claudia.

Altro effetto: scadenza e data fattura coincidono nel **71%** dei casi a carta e nel **67%** a
contanti — coerente con l'idea che il pagamento sia già avvenuto. Sui RID coincidono nello
**0%**: lì la scadenza è la data dell'addebito, ed è un dato vero.

#### 51 fatture esistono ma non hanno una scadenza

Confrontando i due export sullo stesso periodo: 51 fatture (8.622 €) compaiono nell'elenco
documenti e **non nello scadenzario**, tutte di luglio-agosto. Sono documenti arrivati e non
ancora contabilizzati.

Chi guardasse solo lo scadenzario non le vedrebbe. **L'incrocio fra i due file è di per sé un
controllo**, e va acceso subito: *fatture ricevute senza scadenza generata*, una lista corta
in carico all'amministrazione. È lo stesso principio delle dichiarazioni orfane, applicato a
monte.

#### Il quadro operativo, al 27/08/2026

Cosa produrrebbe il primo caricamento, oggi: **396 scadenze aperte, 174.113 €**.

| | Righe | Valore | Dove finisce |
|---|---:|---:|---|
| Note di credito | 12 | −5.896 € | si appaiano, non si pagano |
| RID / SDD / domiciliazioni / PagoPA | 71 | 20.486 € | lista "escono da sole" |
| Contanti e carta | 150 | 17.216 € | archivio: già uscite |
| **Coda DA PAGARE (≤ 1.000 €)** | **128** | **37.988 €** | Claudia |
| **Coda DA APPROVARE (> 1.000 €)** | **35** | **92.528 €** | Luca |

Le due code insieme fanno **163 righe su 396**: il filtro toglie il 59% del rumore, ed è la
differenza fra un cruscotto che si guarda e uno che si ignora.

**Attenzione al primo caricamento.** Quei numeri sono un arretrato di otto mesi, non un mese
di lavoro: Luca si troverebbe davanti 35 fatture in una volta invece delle ~16 al mese a
regime. Va previsto un modo di chiudere il pregresso in blocco — una data di decorrenza sotto
la quale le scadenze entrano già come "storiche" — altrimenti il primo giorno del sistema è
anche l'ultimo in cui qualcuno lo guarda.

**Lo scaduto da pagare è la voce che il cruscotto deve mostrare per prima**: 96 righe,
75.621 €, la più vecchia scaduta il 7 gennaio. Per anzianità: 13.911 € entro 30 giorni,
15.264 € a 31-60, 24.328 € a 61-90, **22.118 € oltre i 90**. È esattamente la misura che oggi
nessuno ha sotto gli occhi.

Nota minore: 150 scadenze in contanti o carta risultano ancora aperte. Il denaro è uscito da
un pezzo — è un residuo di registrazione contabile, non un debito. Ragione in più per tenerle
fuori dalle code.

#### Cosa manca nello scadenzario

Imponibile, IVA, ritenuta, righe di dettaglio, descrizioni. Per il **modulo Pagamenti basta
lui**; per il **controllo di gestione servono entrambi**, uniti sul protocollo
(`Numero Documento` + `Suffisso` + `Data`), che nel campione appaia 387 documenti su 438.

---

### ⚠ La data di scadenza non c'è (nell'elenco documenti)

**La colonna `Scadenza` esiste ed è vuota su tutte le 6.082 righe.** Ma la colonna `Stato`
vale `Pagata` (136), `A scadere` (100), `Scaduta` (202): Fattura SMART la scadenza ce l'ha e
la calcola, semplicemente non la esporta in *questo* tracciato.

**Risolto lo stesso giorno**: la scadenza sta nell'altro export, l'*Elenco scadenze*
(sopra). L'ipotesi di ripiego — scadenza stimata al 30 del mese successivo — **non serve
più**, e va tenuta solo come comportamento di riserva per le fatture che compaiono
nell'elenco documenti ma non ancora nello scadenzario.

### La modalità di pagamento c'è già, ed è metà del lavoro di tesoreria

| Modalità | Fatture | Valore | In approvazione? |
|---|---:|---:|---|
| Bonifico | 154 | 85.662 € | **sì** |
| Contanti | 91 | 12.159 € | spariscono (→ carta) |
| RID | 68 | 11.385 € | no, addebito automatico |
| Carta di pagamento | 64 | 5.727 € | no, già pagata |
| SEPA Direct Debit (CORE/B2B) | 33 | 15.819 € | no, addebito automatico |
| RIBA | 4 | 10.573 € | no |
| PagoPA / bollettino / assegno / domiciliazione | 24 | 3.389 € | caso per caso |

**Un quarto delle fatture (106 su 438) è ad addebito automatico.** Il punto sugli SDD non era
teorico: sono 22.000 € in due mesi che escono dal conto senza che nessuno decida nulla, e che
devono comunque stare nella previsione di cassa. La colonna `Pagamento` li classifica da sola,
senza bisogno di censirli a mano sull'anagrafica fornitori.

### Il dimensionamento dell'approvazione

Mediana del documento: **63 €**. Distribuzione dei totali:

| Soglia | Fatture/mese sopra |
|---|---:|
| 100 € | ~90 |
| 500 € | ~40 |
| **1.000 €** | **~16** |
| 2.000 € | ~5 |

**A 1.000 € il processo regge senza problemi**: sedici decisioni al mese non sono un carico.
Anzi, il dato dice che si può **scendere a 500 €** (~40/mese, due al giorno) e coprire così
l'85% del valore invece del 70%. Da decidere con chi approverà.

### Metà delle fatture sono spesa alimentare minuta

I primi fornitori per numero: Spesa Intelligente (65), CHIURLO (59), SOGEGROSS (47), LIDL
(30), MARR, GS, IN'S. Sono **il 60% dei documenti e il 20% del valore**.

Su questi la `regola_fornitore` **non può funzionare**: Lidl compra per dieci servizi diversi,
e una regola fornitore→CC sarebbe un numero inventato. Sono esattamente le fatture che
devono risolversi dall'**etichetta Revolut**, e il dato conferma la scelta della carta per
persona meglio di qualunque ragionamento a priori.

Il resto invece si presta: **105 fornitori distinti, e il 78% delle fatture (341/438) viene da
fornitori già visti almeno tre volte.** La soglia di tre conferme prima dell'applicazione
automatica non rallenta quasi niente.

Nota: **91 fatture in contanti in due mesi, 12.159 €**, di cui 65 di Spesa Intelligente. È il
flusso che l'abolizione dei contanti sposta su carta — e che passando da lì si attribuisce da
solo. È il singolo cambiamento che porta più attribuzione automatica di tutti.

### Utenze: il POD non c'è, l'indirizzo quasi

Nessun POD, nessun PDR, nessuna matricola contatore nelle descrizioni: **zero occorrenze**.
L'ipotesi del livello 2 della cascata, così com'era scritta, non regge su questo tracciato.

Quello che c'è, in alcune righe di dettaglio, è l'**indirizzo della fornitura**: AGN ENERGIA
scrive `Indirizzo...: F.NE PIAN DELLA MUSSA 2 - 10070 BALME TO`, FASTWEB scrive
`VIA ROMOLO GESSI,4 TORINO`. Ma solo 3 fatture su 15 di utenze lo espongono in forma
riconoscibile.

Il volume però è piccolo — 15 fatture di utenze in due mesi, quattro fornitori (SMAT, AGN
ENERGIA, TIM, FASTWEB) — quindi il livello 2 si può degradare senza danno: `regola_fornitore`
per chi ha una sola sede, indirizzo in descrizione dove c'è, residuo manuale per il resto.
Il POD resta disponibile nell'**XML della fattura**, se un domani servirà precisione.

### Quello che non c'è

- **`Tipo Documento` non è il tipo SDI.** Vale `Fattura di Acquisto - SERVIZI VARI NON
  ALTROVE CLASSIFICABILI` su 6.081 righe su 6.082: è una classificazione merceologica
  generica, inutile per l'attribuzione, e **non distingue TD01 da TD17/TD18/TD19**.
- **Nessuna autofattura estera** e nessun fornitore con P.IVA non italiana nel campione.
  La spunta "fattura estera" in Inserisci Spesa **serve davvero**: quelle fatture da qui non
  passano.
- **Nessuna nota di credito** (zero totali negativi in due mesi). Il caso va gestito lo
  stesso, ma non è frequente.
- `Note piede` è sempre vuoto; `Codice articolo` valorizzato in 6 righe su 6.082.
- `Split` sempre `False`, `Fepa o B2b` sempre `True`.

---

## Attribuzione delle fatture passive — cascata

Ordine di applicazione su ogni `fattura_passiva` non attribuita. Si ferma al primo livello
che risponde e scrive `cc_codice`, `confidenza`, `motivo`.

| # | Regola | Confidenza |
|---|---|---|
| 1 | Match con richiesta d'acquisto o manutenzione: `piva` + `totale` ±0,01 + data ±30gg. Il CC è già sul documento | `certa` |
| 2 | **Utenza**: la fattura porta un POD / PDR / matricola contatore presente in `utenza`. ⚠ Nel tracciato Webdesk il codice **non c'è**: oggi il livello vale solo con l'XML della fattura, altrimenti degrada su indirizzo o `regola_fornitore` | `certa` |
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

**Verificato il 27/08/2026: nel file Webdesk il codice NON c'è.** Zero POD, zero PDR, zero
matricole nelle 6.082 righe del campione. L'indirizzo della fornitura compare in alcune righe
di descrizione (3 fatture di utenze su 15), non in un campo strutturato.

Conseguenza: `utenza` resta nello schema — è il modo giusto di attribuire una bolletta — ma
**non si alimenta da questo export**. Le strade, in ordine di costo:

1. `regola_fornitore` per i fornitori con una sola sede (copre SMAT e AGN ENERGIA oggi)
2. riconoscimento dell'indirizzo nelle righe di descrizione, dove c'è
3. **XML della fattura elettronica**, dove il POD c'è sempre: è la soluzione esatta, ma
   presuppone di scaricare gli XML e non solo il riepilogo

Il volume rende la scelta poco urgente: **15 fatture di utenze in due mesi, quattro
fornitori**. Il residuo manuale è di poche righe al mese.

Resta vero: le sedi che ospitano due servizi vanno completate con la `quota`.

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
fornitore serviranno `CentroCostoAbituale`, `IBAN`, `Priorita`
(`mai_rinviabile`|`critico`|`tollerante`, vuoto finché non deciso) e `ModalitaPagamento`
(per sapere in anticipo chi è domiciliato SDD e quindi non va in approvazione).

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

## Tesoreria: scadenze, approvazioni, previsione di cassa

> Controparte tecnica di `Pagamenti_e_Liquidita.docx` (radice progetto).

**La tesoreria non è un secondo archivio: è la lettura per cassa degli stessi documenti.**
Il registro `movimento` ragiona per **competenza** e risponde a "come va il servizio"; la
tesoreria ragiona per **cassa** e risponde a "quanto avrò in banca il giorno in cui devo
pagare". Sono due domande diverse sugli stessi fatti, ed è la ragione per cui `movimento`
porta da sempre due date.

Vincolo di progetto, gemello di quello del registro: **la previsione di cassa non scrive mai
in `movimento`**. È una proiezione, non un fatto economico. Se una rata di finanziamento
prevista diventasse un `movimento`, il costo del lavoro e l'F24 verrebbero contati due volte
— una dal cedolino, una dalla previsione.

### Le scadenze

Una fattura può avere più rate: la scadenza è una tabella a parte, non una colonna.

```sql
create table scadenza (
  id                 uuid primary key default gen_random_uuid(),
  fattura_passiva_id uuid references fattura_passiva(id),
  data_scadenza      date not null,
  importo            numeric(12,2) not null,
  modalita           text,        -- 'bonifico' | 'sdd' | 'riba' | 'contanti_locanda'
  stimata            boolean default false,   -- scadenza calcolata, non letta dal gestionale
  stato              text not null default 'da_pagare',
      -- 'da_approvare' | 'da_pagare' | 'pagata' | 'automatica' | 'storica' | 'stornata'
  data_pagamento     date,        -- SOLO dal clic di Claudia o dall'estratto conto, mai dall'Excel
  alert              text,        -- 'possibile_doppio_pagamento' | null
  pagata_da          text,
  approvata_da       text,
  approvata_il       timestamptz,
  conto_id           int references conto(id),
  creata_il          timestamptz default now()
);
create index on scadenza (stato, data_scadenza);
```

**Gli addebiti automatici sono scadenze, ma non decisioni.** Le utenze domiciliate (SDD) non
vanno nella lista di chi paga — nessuno le paga, se ne vanno da sole — ma **devono stare
nella previsione di cassa**, perché il denaro esce comunque. Una previsione che ignorasse gli
SDD mostrerebbe spazio che non c'è, ed è l'errore che rende inutili metà dei cruscotti di
tesoreria. Modalità `sdd` = niente approvazione, sì previsione.

**Le note di credito.** Una nota di credito non è una fattura negativa da pagare: riduce una
scadenza esistente o ne crea una a saldo. Va appaiata alla fattura di riferimento
(`stato='stornata'` sulla scadenza annullata), altrimenti resta a scadere per sempre una
somma che nessuno pagherà mai.

### Le uscite fisse

Stipendi, F24, rate dei finanziamenti, canoni: date fisse, importi noti o stimabili, e
insieme sono la parte più grande delle uscite. Non arrivano da Webdesk e non hanno una
fattura, quindi vanno censite a mano una volta.

```sql
create table uscita_fissa (
  id           serial primary key,
  descrizione  text not null,          -- 'Stipendi', 'F24', 'Rata mutuo Artemisia'
  tipo         text not null,          -- 'personale'|'tributi'|'finanziamento'|'canone'
  periodicita  text not null,          -- 'mensile'|'trimestrale'|'annuale'
  giorno_mese  int,                    -- 27 per gli stipendi, 16 per l'F24
  importo_stima numeric(12,2),         -- ultimo effettivo, aggiornato dall'estratto conto
  conto_id     int references conto(id),
  attiva       boolean default true
);
```

L'importo si autocorregge: quando l'estratto conto mostra l'uscita reale, `importo_stima`
si aggiorna. Dopo tre mesi la previsione degli stipendi non è più una stima ma una media
recente, e nessuno deve mantenerla a mano.

### La priorità dei fornitori

Due colonne sull'anagrafica soggetti unica, non una tabella nuova:

| Valore | Significato |
|---|---|
| `mai_rinviabile` | si paga alla scadenza, nessuna eccezione — stipendi, F24, utenze |
| `critico` | rinviabile solo se non c'è alternativa: il rapporto o il servizio ne soffrono subito |
| `tollerante` | un rinvio non ha conseguenze pratiche |

Default `tollerante`? No: **default vuoto**, e la lista si ordina mettendo i non classificati
in cima finché qualcuno decide. Un default silenzioso a `tollerante` farebbe scivolare in
fondo un fornitore critico non ancora classificato — che è esattamente il caso in cui il
sistema deve chiamare l'attenzione, non nasconderlo.

### La decisione: due risposte, mai il silenzio

Soglia in lista SP Parametri, **1.000 €** (da verificare sul volume reale — vedi sotto).
Sotto soglia paga l'amministrazione senza chiedere; sopra, la scadenza va in approvazione.

**Una sola azione: APPROVA** (deciso con Dennis il 27/08/2026, semplificando la proposta
originale a due esiti). Chi approva non ha un tasto "rimanda": *non approvare è già la
decisione*, ed è quella che si prende quando non c'è liquidità.

Il prezzo di questa semplificazione è che la previsione di cassa non sa **quando** uscirà una
fattura non ancora approvata: entra come "impegnata, data ignota", non come uscita datata.
Il compenso è che il silenzio si vede lo stesso — ogni riga porta i **giorni di attesa** e le
più vecchie stanno in cima. Se col tempo si accumulassero fatture ferme da mesi, il secondo
esito (`rimanda al …`) si aggiunge senza toccare nient'altro: basta una colonna
`pagabile_dal` su `scadenza` e uno stato in più.

Chi approva ha davanti **due totali**: quanto c'è da approvare e quanto ha già approvato che
non è ancora stato pagato — l'impegnato. Guardare solo il primo significa impegnare due volte
lo stesso denaro. Più avanti, il saldo previsto alla data.

**Il sollecito è uno solo.** Un digest quotidiano — o ogni due giorni — con l'elenco di
quello che scade entro N giorni e non è deciso. Non una mail per fattura: dieci mail
separate si archiviano senza leggerle. Stesso schema già usato per i solleciti timbrature
(`0001-timbrature-sollecito-responsabili.patch`), quindi il codice esiste.

### Il pagato non lo digita nessuno

L'appaiamento con l'estratto conto esiste già per attribuire il CC: la stessa passata
valorizza `scadenza.data_pagamento` e `movimento.data_cassa`, e porta la scadenza a
`pagata`. Un dato che nessuno scrive a mano non può divergere da quello che c'è in banca.

Caso da gestire: **il bonifico cumulativo**. Un'unica uscita da 4.200 € che salda sette
fatture dello stesso fornitore. È lo stesso subset-sum già previsto per l'appaiamento
dichiarazioni ↔ fatture, applicato alle scadenze aperte di quella P.IVA.

### Il saldo giorno per giorno

Una vista, non una tabella. Per ogni giorno dei prossimi 90:

```
saldo(g) = saldo_iniziale
         + entrate_attese(≤ g)
         − scadenze_aperte(≤ g)
         − uscite_fisse(≤ g)
         − sdd(≤ g)
```

Il `saldo_iniziale` viene dall'ultimo estratto conto importato, non da un totale calcolato:
se i due divergono, la divergenza è essa stessa l'informazione utile.

**Il vincolo non è lo zero.** Sul Generale ci sono fido e castelletto: la linea rossa sta a
`−fido`. Va in `conto.fido numeric(12,2) default 0`, e il cruscotto mostra entrambe le soglie
— sotto zero si sta usando il credito (costa), sotto il fido si è fermi.

**Tre linee, non una.** Le entrate si proiettano alla scadenza contrattuale, poi la stessa
curva si ridisegna con gli incassi spostati di **+30** e **+60** giorni. Serve a rispondere
alla domanda vera: questa decisione di pagamento regge anche se gli enti pagano tardi come
al solito? Quando ci sarà lo storico dei ritardi effettivi — che il sistema costruisce da sé
appaiando incassi e fatture attive — lo scostamento fisso viene sostituito dal ritardo
mediano **per ente**, senza cambiare nient'altro nella vista.

### La ricarica Revolut

```
ricarica = media_mobile(spesa_carta ultime 6 settimane) × 1,3 − saldo_revolut_attuale
```

Arrotondata per eccesso ai 100 €. Il fattore di sicurezza copre la settimana con la spesa
grossa; il saldo attuale evita di accumulare denaro fermo su un conto che non produce nulla
e sul quale non c'è il fido. Nei primi due mesi, senza storico, l'importo lo decide
l'amministrazione e il sistema si limita a registrarlo.

### Cruscotto della cassa — ordine della pagina

1. **Lo scaduto**, per primo: quanto, da quanto, a 30/60/90 giorni di ritardo
2. Le **uscite non rinviabili** dei prossimi 30 giorni
3. Le **scadenze da decidere**, ordinate per priorità e data, con il CC già scritto accanto
4. Le **entrate attese**: fatture emesse non incassate, convenzioni e rette maturate, contributi
5. Il **saldo giorno per giorno** a 90 giorni, con le tre linee e le due soglie
6. La **ricarica** suggerita della settimana

### Da misurare prima di costruire

**Quante fatture al mese superano i 1.000 €.** È il carico di lavoro di chi approva, e se il
numero è alto il processo non regge: si alza la soglia, o si esclude dall'approvazione tutto
ciò che è già passato da una richiesta d'acquisto approvata — che sarebbe la scelta giusta
comunque, perché quella spesa è già stata autorizzata una volta e chiederlo due volte
insegna alle persone ad approvare senza guardare.

Si misura con una query sul primo export Webdesk, prima di scrivere una riga di interfaccia.

---

## Il flusso operativo dei pagamenti

> Disegnato con Dennis il 27/08/2026, sui numeri reali dell'export.
> È la prima cosa costruibile del modulo: non dipende dall'estratto conto.

### Il caricamento settimanale

Claudia carica un file, una volta a settimana, in `/pagamenti/carica`. **L'export è
cumulativo**: contiene sempre tutto, non solo le fatture nuove. È l'app a distinguerle.

**Chiave di deduplica**: il **protocollo** `Numero Documento` + `Suffisso Documento` + `Data`,
più la posizione della scadenza dentro il documento. Verificato sul campione: 2.006 documenti
distinti su 2.053 scadenze, e i 36 documenti con più di una scadenza sono rate o partite
distinte dello stesso documento, non collisioni.

`Partita IVA` + `Numero Riferimento` + `Data Riferimento` identifica la fattura del fornitore
e serve a unire i due export e a costruire l'anagrafica, ma **non è unica**: nel campione
alcuni fornitori (ATC, SOGEGROSS) ripetono lo stesso numero su documenti diversi. Come chiave
primaria di deduplica darebbe fusioni sbagliate.

L'import **non è un "salta i duplicati"**: le righe già viste vanno *aggiornate*, perché fra
un caricamento e l'altro cambiano `Stato` e `Data Pagamento`.

| Caso | Cosa fa l'import |
|---|---|
| Scadenza nuova | inserita, smistata nella coda giusta |
| Già vista, invariata | nessuna scrittura |
| Già vista, importo o scadenza cambiati | aggiornata, e la riga si segnala |
| Già vista, **noi la diamo pagata** | **non si tocca**: lo stato dell'app vince sempre |
| Vista prima, **assente ora** | non si cancella: si segnala. Una scadenza che sparisce è un documento annullato o un export incompleto, e in entrambi i casi qualcuno deve saperlo |

**Il pagato lo dice Claudia, non il file.** L'import non porta mai una scadenza a `pagata`:
`Stato` e `Data Pagamento` dell'Excel sono esclusi in modo esplicito. Vale anche al contrario —
una scadenza che Claudia ha chiuso non si riapre perché il gestionale non l'ha ancora
registrata.

**Le note di credito vanno invertite all'ingresso.** `Tipo Documento = 'Nota di Credito
Fornitore'` porta un `Totale` **positivo**: se non si inverte il segno, 35 note di credito
(5.896 € nel campione) finiscono in coda a Claudia come fatture da pagare.

Ogni caricamento produce una **ricevuta di import**: quante righe lette, quante fatture nuove,
quante aggiornate, quante scartate e perché. Senza, il primo caricamento che va storto è
invisibile e ci si accorge del buco un mese dopo.

```sql
create table import_file (
  id            uuid primary key default gen_random_uuid(),
  nome_file     text, hash_file text unique,   -- lo stesso file due volte: si avvisa
  caricato_da   text, caricato_il timestamptz default now(),
  righe, fatture_nuove, fatture_aggiornate, scartate int,
  esito         text, dettaglio jsonb
);
```

### Due file, ma non due caricamenti a settimana

I due export servono a cose diverse e **non hanno la stessa frequenza**:

| File | Serve a | Ogni quanto |
|---|---|---|
| **Elenco scadenze** (`ScadenzeFornitori`) | scadenze, importi, fornitori, modalità | **settimanale** — è quello che alimenta le code |
| **Elenco documenti** (`FattureAcquisto_Full`) | imponibile, IVA, righe di dettaglio | **mensile** — serve solo ai costi per centro di costo |

Quindi il gesto settimanale di Claudia è **uno**: scaricare l'*Elenco scadenze* e trascinarlo
nell'app. L'*Elenco documenti* si aggiunge una volta al mese, insieme alla chiusura.

**Un solo punto di caricamento, nessuna scelta da fare.** La pagina accetta uno o più file
insieme e **riconosce il tracciato dalla prima riga** — `Elenco scadenze` contro
`Elenco documenti` — più la firma delle intestazioni di riga 4. Claudia trascina quello che ha
scaricato, senza dover indovinare in quale casella metterlo: una tendina "che tipo di file è
questo?" è un errore in attesa di succedere, e a sbagliarla si importano scadenze come
documenti.

**La scadenza crea il documento, l'elenco documenti lo arricchisce.** Una `fattura_passiva`
nasce anche dal solo scadenzario, con imponibile e IVA vuoti; l'import mensile li completa.
Così il modulo Pagamenti non aspetta niente, e i costi si consolidano quando il secondo file
arriva.

**Automazione**: Fattura SMART non pubblica API né esporta su pianificazione, quindi lo
scarico resta manuale. Quello che si può automatizzare è il **promemoria**: se lunedì a
mezzogiorno non è arrivato nessun file, l'app manda un avviso — e il cruscotto mostra in
testa da quanti giorni i dati non sono aggiornati. Un cruscotto vecchio di tre settimane che
non lo dice è peggio di un cruscotto vuoto.

### La data di scadenza

**Arriva dal file, su tutte le righe.** Non c'è niente da stimare.

Resta un caso di riserva: le fatture che compaiono nell'elenco documenti e non ancora nello
scadenzario — 51 su 438 nel campione, tutte recenti. Per quelle, scadenza provvisoria al
**30 del mese successivo** alla data fattura (l'ultimo giorno se il mese non ha il 30), con
`scadenza.stimata = true` e la data mostrata in corsivo. Sull'anagrafica soggetti il campo
`TerminiPagamento` permette di scostarsene per i fornitori con condizioni proprie.

Una data inventata che ha l'aria di essere un dato è peggio di una data assente: si prendono
decisioni di cassa su un numero che nessuno ha verificato. Al caricamento successivo, quando
la scadenza vera compare, sovrascrive la stima e il flag sparisce.

### Lo smistamento

All'import ogni scadenza nasce con uno stato, deciso dalla sola `Tipologia`:

```
Tipo Documento = 'Nota di Credito Fornitore'  → si appaia e riduce, nessuna coda
Tipologia ∈ {Contanti, Carta di pagamento}    → PAGATA all'origine (data = scadenza)
Tipologia ∈ {RID, SEPA Direct Debit (CORE/B2B),
             Domiciliazione, MAV, PagoPA,
             Quietanza erario}                → PAGATA alla scadenza, senza intervento
Totale ≤ soglia (1.000 €)                     → coda DA PAGARE (Claudia)
Totale >  soglia                              → coda DA APPROVARE (Luca)
```

**Contanti e carta nascono pagati**: il denaro è uscito prima che la fattura arrivasse. Data
di pagamento = data scadenza, che per queste modalità coincide con la data fattura nel 67-71%
dei casi.

**RID e SDD nascono pagati alla scadenza**, non prima: fino a quel giorno sono un'uscita
*certa e datata* — il caso migliore per la previsione di cassa — e dopo sono un fatto. Nessuno
li tocca, ma restano visibili nella lista "escono da sole", perché il denaro esce comunque e
chi guarda la cassa deve saperlo.

Sui numeri reali il filtro toglie il 59% delle righe: delle 396 scadenze aperte al 27/08 ne
restano 163 nelle due code. È la differenza fra un cruscotto che si guarda e uno che si ignora.

### La protezione contro il doppio pagamento

È il rischio che Dennis ha visto, e vale la pena isolarlo: **una fattura già saldata con carta
che finisce in coda a Claudia, che la paga una seconda volta.**

Succede quando il fornitore dichiara `Bonifico` su una fattura pagata in negozio — la
`Tipologia` è una dichiarazione sua, non un fatto nostro. Nel campione Amazon compare 24 volte
a bonifico e 17 a carta, ed è lo stesso conto.

Due protezioni, in ordine di quando si possono accendere:

**Subito, con il solo scadenzario** — l'*avviso da storico*. Se un fornitore negli ultimi dodici
mesi è stato registrato a contanti o carta in almeno tre quarti dei casi, e ora arriva una sua
fattura a bonifico, la riga entra in coda **con un'allerta**: "questo fornitore si paga di
solito in negozio, verifica che non sia già saldata". Lidl, Spesa Intelligente, Leroy Merlin
cadono tutti in questa categoria.

**Dopo, con l'import Revolut** — la *riconciliazione vera*. Se esiste un movimento carta dello
stesso fornitore, importo entro l'1% e data entro i 30 giorni precedenti la fattura, l'allerta
diventa un appaiamento proposto.

**In nessuno dei due casi il sistema blocca il pagamento.** Avvisa. Un falso positivo che
impedisce un bonifico legittimo fa più danno di un avviso che qualcuno ignora, e chi paga
è nella posizione migliore per decidere: ha lo scontrino, o non l'ha.

La lista simmetrica — movimenti carta senza nessuna fattura arrivata dopo 60 giorni — è già
prevista fra le liste di controllo del registro.

### Il cruscotto di Claudia — DA PAGARE

Ordinato per data di scadenza, **le scadute in cima**. Ogni riga: fornitore, numero e data
fattura, importo, scadenza (in corsivo se stimata), centro di costo quando c'è, modalità di
pagamento, e il pulsante **PAGATA**.

In testa tre numeri soli: **scaduto**, **in scadenza entro 7 giorni**, **totale approvato da
pagare**.

Il pulsante scrive `data_pagamento` = oggi, **modificabile**: Claudia può cliccare il martedì
per un bonifico partito il venerdì, e se la data è finta la previsione di cassa lo è
altrettanto. Il clic è reversibile: chi sbaglia riga deve poter tornare indietro senza
chiedere aiuto.

**Questo clic è l'unica fonte di verità sul pagato**, finché non arriva l'estratto conto — e
anche allora l'estratto conto lo confermerà, mentre l'Excel del gestionale non entrerà mai
nel merito. Il campo si chiama `data_pagamento` fin dall'inizio, così quando l'import bancario
arriva non cambia niente nello schema.

Per pagare più fatture allo stesso fornitore con un bonifico unico serve la **selezione
multipla**: si spuntano le righe, un clic le chiude tutte con la stessa data. Senza, chi paga
cumulativo clicca sette volte e la settima volta sbaglia.

### Il cruscotto di Luca — DA APPROVARE

Sui numeri reali: **~16 fatture al mese**. Una sola azione, **APPROVA**, e la fattura passa
nella coda di Claudia.

Non c'è un tasto "rifiuta" né un "rimanda": *non approvare è già una decisione*, ed è quella
che Luca prende quando non c'è liquidità. Ma perché il silenzio non si confonda con una
dimenticanza, ogni riga porta **da quanti giorni è in attesa** e se è già scaduta, e l'elenco
ordina prima le più vecchie. Nessun campo in più da compilare, e chi guarda la lista vede
subito cosa sta invecchiando.

In testa a Luca servono due numeri, non uno: **quanto c'è da approvare** e **quanto ha già
approvato che Claudia non ha ancora pagato** — l'impegnato. Approvare guardando solo il primo
significa impegnare due volte lo stesso denaro. Sono entrambi calcolabili oggi, senza estratto
conto: è il primo pezzo di previsione di cassa che si può accendere.

Selezione multipla con un solo clic finale: sedici decisioni al mese non giustificano sedici
schermate, e chi deve cliccare sedici volte impara a cliccare senza leggere.

### Gli stati della scadenza

```
                    ┌── contanti / carta ──────────────────────────┐
                    │                                             ▼
import ──┬── > 1.000 € ──▶ da_approvare ──APPROVA──▶ da_pagare ──PAGATA──▶ pagata
         │                                              ▲          (Claudia)   ▲
         ├── ≤ 1.000 € ────────────────────────────────┘                       │
         │                                                                     │
         └── RID / SDD ──▶ automatica ──(arriva la scadenza)───────────────────┘
```

Solo due transizioni passano da una persona: **APPROVA** (Luca) e **PAGATA** (Claudia). Tutte
le altre le decide la `Tipologia` all'ingresso.

Ogni passaggio scrive chi e quando: è la tracciabilità che oggi manca, e la ragione per cui un
rinvio deciso e una dimenticanza sono indistinguibili. **Nessuna transizione arriva mai
dall'Excel.**

### Chi vede cosa

| | Coda DA PAGARE | Coda DA APPROVARE | Carica il file |
|---|---|---|---|
| Amministrazione (Claudia e altri) | sì, e paga | in sola lettura | sì |
| Chi approva (Luca) | in sola lettura | sì, e approva | no |
| Responsabili di servizio | solo le proprie, in lettura | no | no |

Permesso `'Pagamenti'`, separato da `'Controllo di Gestione'`: chi approva i pagamenti non è
necessariamente chi legge i costi per servizio.

### Il primo caricamento: l'arretrato

Al 27/08/2026 lo scadenzario contiene **otto mesi di storia**. Il primo import metterebbe
davanti a Luca **35 fatture in una volta** invece delle ~16 al mese a regime, e a Claudia 128.

Serve una **data di decorrenza**: sotto quella data le scadenze entrano già come `storica` —
presenti, consultabili, dentro i totali dello scaduto, ma **fuori dalle code**. Sopra, il
flusso normale. Senza, il primo giorno del sistema è anche l'ultimo in cui qualcuno lo guarda.

Il pregresso non sparisce: resta la voce **scaduto**, che è la prima cosa che il cruscotto
mostra, e che al 27/08 vale 96 righe e 75.621 € — di cui 22.118 € fermi da oltre novanta
giorni. Va guardato, ma come arretrato da rientrare, non come una coda da smaltire in un
pomeriggio.

### Cosa si può costruire subito

Tutto quanto sopra **non dipende dall'estratto conto né dai centri di costo**: serve solo
l'*Elenco scadenze*, che Claudia può già scaricare oggi. È un modulo che sta in piedi da solo
e che porta il beneficio principale — scaduto sotto gli occhi, decisioni tracciate — mesi
prima del resto del controllo di gestione. L'attribuzione del centro di costo si aggiunge
dopo, sulle stesse righe già in archivio.

**Il materiale necessario alla fase 2 è già tutto qui.** Non c'è nient'altro da chiedere a
nessuno prima di cominciare.

---

## Budget

La tabella `budget` è nello schema; qui il processo, che è la parte che di solito manca.

**Il primo anno il budget non si chiede a nessuno.** Chiedere a un responsabile di
preventivare le spese del suo servizio quando non ha mai visto un consuntivo mensile
produce numeri inventati, e numeri inventati screditano il confronto per sempre. Il budget
2027 è il **consuntivo 2026 riportato**, con le sole correzioni note (un servizio che chiude,
una convenzione nuova). Dal 2028, quando i responsabili avranno dodici cruscotti alle spalle,
il budget si compila davvero.

| | |
|---|---|
| **Granularità** | CC × voce analitica × mese. Chi non sa mensilizzare mette l'annuo e il sistema divide per dodici, segnalando che è una ripartizione piatta |
| **Quando** | ottobre-novembre per l'anno successivo, in tempo per il CDA che approva il preventivo |
| **Chi** | il responsabile del CC propone, l'amministrazione consolida, il CDA approva |
| **Revisione** | una sola, a giugno. Un budget che si riscrive in continuazione non è un impegno |
| **Confronto** | YTD consuntivo vs YTD budget, non il singolo mese: un mese storto per uno slittamento di fatturazione non è uno scostamento |
| **Soglia di allarme** | parametro per voce (le utenze oscillano, gli affitti no), con default in lista SP Parametri |

Il budget non blocca nulla: non impedisce una spesa, segnala uno scostamento. Un budget che
blocca produce solo aggiramenti, e l'aggiramento è invisibile per definizione.

---

## Cosa cambia nel codice esistente

| Dove | Cosa |
|---|---|
| `lib/costi/data.ts` | `creaCosto()` scrive anche su `movimento` (o migra del tutto su Supabase, decidere in fase 0) |
| `lib/fatture/data.ts` | il menù a tendina c'è già; salvare il **nome** invece del lookup è scelta deliberata (`lib/fatture/centri-di-costo.ts` righe 4-7). Non passare al lookup: validare il nome e risolvere su `codice` nel riversamento |
| `types/fatture.ts` | `REGIMI_NOTI` (const privata, usata solo da `regimeDi()`) → due colonne sulla lista SP Centri di Costo. Il commento sopra la costante è stale: dice che la lista CC non esiste, ma esiste dal 14/08 |
| `lib/centri-costo/data.ts` | aggiungere `Responsabile` al select e all'interfaccia (campo SP presente ma non letto). Le nomine sono già state fatte fuori dall'app: resta da popolare la colonna |
| lista SP Parametri | soglia di libera spesa (100 €), soglia di approvazione pagamenti (1.000 €), giorni di anticipo del sollecito scadenze, soglie di scostamento budget |
| `lib/acquisti/flusso.ts` | salto approvazione sotto soglia |
| `supabase/` | nuove migrazioni, stesso stile idempotente delle timbrature |
| nuovo `lib/gestione/` | `registro.ts`, `import-webdesk.ts`, `import-banca.ts`, `import-paghe.ts`, `attribuzione.ts`, `appaiamento.ts`, `fornitori.ts` |
| nuovo `lib/tesoreria/` | `scadenze.ts`, `previsione.ts` (saldo giorno per giorno, tre linee), `approvazioni.ts`, `ricarica.ts`, `uscite-fisse.ts` |
| nuovo `app/(app)/gestione/` | cruscotto, lista residuo, lista dichiarazioni orfane, budget vs consuntivo |
| nuovo `app/(app)/pagamenti/` | `carica` (upload settimanale + ricevuta di import), `da-pagare` (Claudia, tasto PAGATA), `da-approvare` (Luca, tasto APPROVA), `automatiche` ("escono da sole"), poi cruscotto cassa |
| nuovo `app/(app)/inserisci-spesa/` | form mobile-first: data, importo, ditta (autocomplete), CC, spunta estera con allegato. **Niente contanti, niente scontrini**: quelli stanno su Revolut |
| nuovo `lib/gestione/import-revolut.ts` | transazioni carte + etichette CC + ricevute, via API |
| sollecito scadenze | riusa lo schema del digest timbrature (`0001-timbrature-sollecito-responsabili.patch`): **una mail con N righe**, non N mail |
| nuovi permessi | `'Controllo di Gestione'` e `'Pagamenti'` in `AREE_PERMESSI` — separati: chi approva i pagamenti non è necessariamente chi legge i costi per servizio |

---

## Ordine di esecuzione

Lo **schema si scrive tutto in fase 1**, tesoreria e budget compresi: il modello dati va
deciso una volta sola, perché la stessa riga di fattura porta il centro di costo, la
scadenza e il confronto col budget. Quello che si costruisce a pezzi è il resto.

1. **Fondamenta** — piano dei conti analitico; popolare i responsabili CC in anagrafica
   (nomine già fatte); verificare che nessun servizio attivo resti senza CC (query in
   `supabase/timbrature_centri_di_costo.sql`); confermare che su cc3 Una Serra, cc21 Pian
   della Mussa e cc22 Amazing non timbri nessuno; tabella `conto` con i due IBAN bancari,
   il conto Revolut e il fido del Generale; **schema Supabase completo**; travaso dei costi
   esistenti.
2. **Pagamenti** — import settimanale idempotente dell'*Elenco scadenze*, inversione delle
   note di credito, smistamento sotto/sopra soglia, coda DA PAGARE, coda DA APPROVARE, lista
   "escono da sole", data di decorrenza per l'arretrato, ricevuta di import. **Nessuna
   dipendenza aperta**: né centri di costo, né estratto conto, né cambi di abitudine — il
   file esiste già. Include l'avviso da storico contro il doppio pagamento delle fatture
   saldate con carta.
3. **Anagrafica soggetti unica + Inserisci Spesa** — fusione clienti/fornitori con i due
   booleani, autocompletamento dai fornitori dell'import, form mobile. Va **prima**
   dell'attribuzione perché è l'unico pezzo che richiede un cambio di abitudini: più presto
   parte, più dichiarazioni esistono quando le fatture arrivano.
4. **Attribuzione e registro** — cascata di attribuzione sulle stesse fatture già importate,
   `import-banca`, appaiamento, liste residuo e orfane, riconoscimento giroconti.
5. **Tesoreria piena** — uscite fisse, priorità sui soggetti, previsione di cassa a tre linee,
   sollecito digest, ricarica Revolut.
6. **Costo del lavoro** — `import-paghe` + ripartizione + prova su un mese chiuso.
7. **Ricavi** — fatture attive, contratti/convenzioni, contributi, incassi Locanda.
8. **Cruscotto e report** per CC e per area.
9. **Budget** — dall'esercizio 2027, e il primo è il consuntivo 2026 riportato.

Due inversioni rispetto alla versione del 27/08 mattina. **I pagamenti salgono al secondo
posto**: si è visto analizzando l'export che il cruscotto DA PAGARE / DA APPROVARE sta in
piedi da solo, con il solo file settimanale, e porta il beneficio più visibile — decisioni
tracciate e scadenze davanti agli occhi — mesi prima del resto. Il centro di costo si aggiunge
dopo, sulle stesse righe già in archivio.

E il **costo del lavoro scende dopo le fatture**: è la voce più grande ma è anche l'unica che
funziona da sola, senza chiedere niente a nessuno — le timbrature ci sono già e le paghe
arrivano da fuori. Le fatture invece dipendono da un comportamento nuovo delle persone, e il
tempo che serve a consolidarlo è il vero percorso critico del progetto.

Le fasi 6 e 7 sono indipendenti da tutto; 3 precede 4, 4 precede 5.

**Quanto vale ciascuna fase da sola** — perché ogni fase deve poter essere l'ultima senza
lasciare un lavoro a metà:

| Dopo la fase | La cooperativa sa |
|---|---|
| 2 | cosa scade, chi ha approvato cosa, e cosa è stato pagato |
| 4 | quanto ha speso ogni servizio, mese per mese |
| 5 | quanto avrà in cassa fra due mesi |
| 6 | il costo pieno per servizio (con il lavoro è il 60-80% del totale) |
| 7-8 | quanto resta, per servizio e per area |

---

## Materiale necessario prima di scrivere codice

- ~~un'esportazione Webdesk di esempio~~ **ottenuta il 27/08/2026** (`FattureAcquisto_Full.xlsx`),
  analizzata nella sezione *Il tracciato Webdesk — verificato*
- ~~un export con la data di scadenza~~ **ottenuto il 27/08/2026** (`ScadenzeFornitori.xlsx`,
  export *Elenco scadenze*): la scadenza c'è su tutte le righe, e con essa la data di
  pagamento. **La fase 2 non ha più dipendenze aperte**
- un estratto conto di esempio per il Generale, per la Locanda e per Revolut: serve sapere se
  c'è l'**IBAN della controparte**, altrimenti i giroconti si riconoscono solo dalla causale
- un'estrazione mensile dell'ufficio paghe (tracciato costante, con matricola)
- bilancio e piano dei conti in uso
- elenco convenzioni attive con importi e periodicità
- i due IBAN bancari e quello Revolut, con l'importo di **fido e castelletto** sul Generale
- il **calendario delle uscite fisse**: date di stipendi, F24, rate dei finanziamenti, canoni
- l'**etichetta di priorità** per i primi fornitori — bastano quelli ricorrenti, gli altri si
  classificano quando si presentano
- gli **indirizzi** a cui mandare il digest delle scadenze non decise, e con quanti giorni di
  anticipo

~~quante fatture al mese superano la soglia di approvazione~~ **misurato: ~16/mese sopra i
1.000 €, ~40 sopra i 500 €.** Il processo regge; la soglia si può abbassare a 500.

Da verificare prima di costruire: se Webdesk può già esportare un campo commessa/CC, e se
l'export del gestionale dello studio commercialista contiene già una classificazione
riutilizzabile.
