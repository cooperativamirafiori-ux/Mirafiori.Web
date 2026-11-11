# Carburante — fatture IP divise fra i centri di costo

**11 novembre 2026**, richiesta di Dennis. In produzione dopo la migrazione
`supabase/carburante.sql`.

## Il problema

Le fatture delle carte carburante IP (IP PLUS S.R.L., P.IVA 17851171003) arrivano
due volte al mese, il 16 e a fine mese, e le paga l'**Amministrazione** (cc23). Ma il
carburante lo consumano i servizi: CRP Cosmica, CER Giulia, Pian della Mussa,
educativa ambientale… Finora le fatture finivano tutte su cc23 e da lì nella
ripartizione a percentuale dei costi generali, che per il carburante è sbagliata.

## Le decisioni di Dennis

1. **Il centro di costo lo dice il file mensile**, rifornimento per rifornimento, non
   una tabella carta → centro di costo. La stessa carta non va sempre allo stesso
   servizio (la carta di GC569GF di solito va su CC14, il 18/09 è andata su CC9).
2. **Il pagamento lo fa l'Amministrazione**: la fattura resta su cc23 come
   centro che paga (`fattura_passiva.cc_codice`, da cui dipende anche il sottoconto
   Qonto), ma il costo si attribuisce ai servizi **per quello che hanno consumato**,
   non a percentuale come gli altri costi generali.
3. **Solo IP** per ora, ma il codice non lo dà per scontato: i fornitori di
   carburante stanno nella tabella `carburante_fornitore`.
4. **Il fornitore si ricorda**: segnata a mano una sua fattura, le sue fatture nuove
   ancora libere diventano carburante da sole.

## Come funziona

**I file.** Claudia carica ogni mese l'export del portale IP nella cartella SharePoint
`General/schede carburante` del sito Controllo di Gestione (env facoltativa
`SP_CARTELLA_CARBURANTE`), con la colonna «CENTRO DI COSTO» aggiunta a mano. I file
**non si spostano** dopo la lettura: si rileggono quando cambia la data di modifica
(`carburante_file`).

- Formato **.xls** (Excel 97-2003). Il lettore è nostro (`lib/carburante/xls.ts`):
  contenitore OLE + BIFF8, solo i valori delle celle. Si accettano anche i .xlsx
  (lettore di `lib/pagamenti/xlsx.ts`).
- **Due tracciati** nel 2026: inglese (`Id`, `NrPan`, `ImportoFinaleFatturatoSIVA`…)
  e italiano (luglio: `Pan Carta`, `Importo fatturato IVA esclusa`…). Le colonne si
  cercano per nome; la chiave del rifornimento è il **numero di protocollo** della
  transazione, presente in tutti e due.
- La colonna del centro di costo si riconosce dall'inizio del nome («CENTRO DI C…»,
  quindi anche «CENTRO DI CSOTO»). Il valore può essere il codice («CC9») o un nome
  («GIULIA», «ED. NORD»): vale se le sue parole stanno nel nome di **un solo** centro.
  Un valore non riconosciuto finisce su DA_ATTRIBUIRE e compare negli avvisi.
- Il file `carte carburante.xlsx` (gennaio-marzo senza centro di costo) viene scartato
  con l'avviso «manca la colonna CENTRO DI COSTO»: è giusto così.

**L'abbinamento** (`lib/carburante/divisione.ts`, funzioni pure):

1. **per numero**: i rifornimenti che nel file portano il numero della fattura;
2. **per data**, se nessun rifornimento ha quel numero: il file di un mese scaricato
   prima della fattura di fine mese ha gli ultimi rifornimenti «NON FATTURATA», senza
   numero. Si prendono quelli senza numero, non presi da altre fatture, con data fino
   a quella della fattura e non più vecchi di 35 giorni — e solo se la somma sta fra
   il **70% e il 115%** dell'imponibile. Altrimenti la fattura resta **in attesa**.
   Verificato sulla fattura del 31/10/2026: i 15 rifornimenti senza numero del file di
   ottobre tornano col gasolio al litro (94,76 L);
3. le **SERVICE FEE** (fatture di pochi euro senza rifornimenti, riconosciute dalla
   descrizione) si dividono come i rifornimenti dello stesso mese.

**La divisione**: l'imponibile della fattura in proporzione a quanto ha speso ogni
centro nel file, al centesimo (resti più grandi). ⚠️ **I file non coprono mai tutta
la fattura**: da agosto a ottobre 2026 mancano dal 5 al 15% (il 16/10 mancano 25,17 L
di benzina self: un rifornimento che nel file non c'è). La differenza si spalma nella
stessa proporzione e la nota della fattura lo dice. Se un giorno si vuole fare
diversamente (differenza su DA_ATTRIBUIRE) si cambia solo `divisa()`.

**Dove si vede**:

- *Fatture del servizio*: pillola «carburante» (e «in attesa del file»), «Vedi la
  divisione fra i servizi» con quote e rifornimenti; riquadro «Leggi i file adesso».
- *Cruscotto*: `cdg_fatture_anno` restituisce una riga per quota al posto della
  fattura; le carburante non ancora divise escono senza centro di costo (da
  attribuire), non su cc23.

**Quando gira**: nel cron notturno `fatture-sdi`, subito dopo l'import delle fatture;
con «Leggi i file adesso»; dopo ogni «Carburante» / «Togli carburante». Il ricalcolo
rifà tutte le fatture carburante degli ultimi 14 mesi e scrive solo ciò che cambia.

## Chi può fare cosa

- **Segnare, togliere, leggere la cartella**: chi vede tutto in Fatture del servizio
  (permesso Controllo di Gestione o Pagamenti).
- **Vedere la divisione**: chiunque entri in Fatture del servizio.
- Liberare una fattura (o spostarla su nessun centro) toglie anche il carburante.

## Tabelle

`carburante_rifornimento`, `carburante_file`, `carburante_fornitore`,
`carburante_quota` + colonne `fattura_passiva.carburante`, `carburante_stato`,
`carburante_nota`, `carburante_diviso_il`. Le quote si scrivono solo con la funzione
`carburante_quote_riscrivi()` (cancella + inserisce in un colpo).

## Prova senza database

```
npx --yes tsx scripts/prova-carburante.ts ~/Downloads/2026_10.xls
```

## Da fare / aperto

- Le fatture IP di agosto-ottobre 2026 erano già su cc23 (e tre fee su cc10, cc11,
  cc23): vanno segnate «Carburante» a mano una volta, dalla linguetta «Segnate».
- Il registro analitico (`movimento`) non riceve ancora le fatture passive: quando
  succederà, le fatture carburante andranno scritte con le quote (`quota < 1`).
