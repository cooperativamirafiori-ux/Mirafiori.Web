# Area IT e Dispositivi — piano

> Stato: **area scritta e compilante, da provisionare e migrare su SharePoint.**
> Ultimo aggiornamento: 25 agosto 2026.
>
> Cos'è già in codice, e dove:
>
> | Pezzo | File |
> |---|---|
> | Tipi dell'area | `types/it.ts`, `types/inventario.ts` (esteso) |
> | Dati e regole | `lib/it/`: `data.ts` (la porta) · `assegnazioni.ts` · `flusso.ts` (le invarianti) · `dispositivi.ts` · `sim.ts` · `verbali.ts` |
> | API | `app/api/it/`: `assegnazioni/**` · `dispositivi/**` · `sim/**` |
> | Schermate | `app/(app)/it/` (area) · `app/(app)/miei-strumenti/` (aperta a tutti) |
> | Permesso | `IT e Dispositivi` in `lib/core/permessi.ts` |
> | Provisioning | `scripts/provision-inventario.mjs` (esteso) · `scripts/provision-it.mjs` |
> | Migrazione | `scripts/migra-dispositivi-it.mjs` + `scripts/it-correzioni.json` |
> | Diagnosi dati | `scripts/it-anomalie.mjs` |

## Da dove si parte

Sul sito `https://coopmirafiorionlus.sharepoint.com/sites/gruppo_it` ("Area IT & Assistenza")
l'ufficio IT tiene quattro liste, fatte a mano e già in uso:

| Lista | GUID | Righe |
|---|---|---|
| Lista DISPOSITIVI | `0e15a625-5509-49dd-ba85-cee562481ac8` | 52 |
| Assegnazioni_DISPOSITIVI | `65e563e3-2cbd-437a-8487-21a6eb47d13f` | 53 |
| Lista SIM | `49499627-675c-46dd-8f2b-bd03e9298933` | 46 |
| Assegnazioni_SIM | `7e90d2d5-48d2-4a97-b68c-ce37ea5a4434` | 5 |

Più una quinta lista vuota, *Registro Assistenza IT* (`df7b1976-3f23-4cd3-a3f1-6d2a83a4a69d`),
il cui lookup punta a una colonna `IDDispositivo` che non esiste più: è rotto.

L'impianto è quello giusto — due anagrafiche e due liste di legame, con una riga per ogni
periodo di assegnazione (`Stato` Attiva/Chiusa più le due date). Quello che manca non è il
modello, è chi fa rispettare le regole.

### Trappole tecniche già verificate

1. Le "colonne di ricerca aggiuntive" (Marca, Modello, Sottotipo, Serial Number, Operatore,
   Piano) via Graph tornano **solo** come `...LookupId` uguale all'ID dell'elemento padre:
   non contengono il valore. Sono inutili via API e duplicano l'anagrafica: non si replicano.
2. `Utente` è un campo persona SharePoint: via Graph app-only arriva solo `UtenteLookupId`.
3. `Title` è vuoto su **tutti** i 52 dispositivi (in Lista SIM invece è l'ICCID).
4. Nomi interni con escape: `Fatturarif_x002e_`, `Dispositivo_x003a__x0020_Marca`,
   `Fornitore_x002f_Intermediario`, `Modalit_x00e0_richiesta`, `Priorit_x00e0_`.
5. Le date sono salvate a 07:00/08:00Z: campi solo-data con scivolamento di fuso.

### Anomalie nei dati (fotografia del 20/08/2026)

- **Dispositivi**: 48 assegnazioni attive, 5 chiuse (tutte con data restituzione).
  Il dispositivo `43` ha due assegnazioni, di cui una chiusa — non due attive, come si era
  letto in un primo momento. Tre volte lo stato del bene contraddice
  quello dell'assegnazione. 4 assegnazioni senza utente.
- **Nome utenza**: 19 valori con spazio iniziale, 4 valgono `?`.
- **Sottotipo**: `" PC Desktop"` e `"PC Desktop"` convivono.
- **Servizio** (testo libero): `CER Giulia`/`Cer Giulia`, `CISA12`/`Cisa 12`, una riga vuota.
  Nessun legame con i Centri di Costo.
- **SIM**: 46 in anagrafica, **5 assegnate**. Operatore compilato su 9 righe, TipoPiano su 12,
  costo mensile su 5. Tutte in stato "Attiva". `Centrodicosto` mai valorizzato.

---

## Decisioni prese

1. **Registro unico dei beni, sul sito principale.** I dispositivi IT entrano in
   `Inventario Beni` (`SP_LIST_INVENTARIO`), dove Acquisti già crea i beni e dove sta la
   libreria con una cartella per bene. Niente aggregazione di due liste dall'app: sarebbe
   due record, due codici e due stati per lo stesso portatile, riconciliati a mano per sempre.
2. **Le liste su `gruppo_it` non si cancellano.** Restano come archivio; quando la migrazione
   è verificata si mettono in sola lettura. Momento da concordare con l'IT.
3. **Codici doppi durante la transizione.** Ogni dispositivo migrato prende il suo `INV-xxxx`
   e conserva il riferimento vecchio in `IdListaIT` (es. `DISP-43`), così la ricerca col
   numero di prima continua a funzionare e nessuno rietichetta 52 macchine in un pomeriggio.
4. **Le SIM stanno in una lista propria** ("SIM e Utenze"): non sono beni, sono contratti
   ricorrenti. Dispositivo e SIM si incontrano nell'assegnazione, non nell'anagrafica.
5. **L'assegnatario è la mail aziendale**, come in timbrature, RU e permessi — non il campo
   persona SharePoint. Così l'assegnazione si lega all'anagrafica RU e alla cessazione di un
   dipendente l'app sa dire cosa deve restituire.
6. **Il centro di costo appartiene all'assegnazione**, non al bene: lo stesso portatile passa
   da Ufficio a Cosmica 2 e il costo lo segue. Sul bene si tiene il valore corrente,
   riscritto dall'app quando cambia l'assegnazione attiva.
7. **I centri di costo si assegnano a mano**, dalla vista "senza centro di costo".
   Il vecchio `Servizio` testo libero **non si cancella**: si conserva in `ServizioLegacy`.
8. **Verbali di consegna e di restituzione: PDF da firmare a mano** (non DocuSign, per ora).
   L'app li genera e riceve il firmato. Non finiscono nella cartella del bene: stanno in due
   cartelle fisse, `Verbali Consegna` e `Verbali Restituzione`, e **il codice di inventario è
   nel nome del file** — così si trovano per numero anche cercando da SharePoint.
   Modello docx da adattare: **Dennis fornirà il verbale attuale in uso.**
9. **Bonifica prima della migrazione**, in xlsx: non si migra sporco.
10. **Assegna solo l'IT**, con l'area `it` concessa dal pannello Amministrazione › Permessi.
    A tutti resta "I miei strumenti", in sola lettura sul proprio.
11. **Il canone di noleggio resta un dato dell'anagrafica** finché non arriva il controllo di
    gestione: non genera righe di costo.
12. **L'assegnatario è facoltativo, il centro di costo obbligatorio**: i beni condivisi si
    assegnano a un centro di costo e non producono verbale.
13. **I dati mancanti si completano dall'app**, non con una bonifica preventiva. In migrazione
    si risolvono solo le incoerenze, che sono già decise in `scripts/it-correzioni.json`.
14. **Registro Assistenza IT: fase successiva.** Non si mescola ticketing e anagrafica.

---

## Modello dati

### `Inventario Beni` — colonne da aggiungere

| Colonna | Tipo | Perché |
|---|---|---|
| `TipoIT` | scelta: PC, Smartphone, Tablet, Stampante, Periferiche, Rete, Altro | **è il discriminante: se è valorizzato, il bene è IT** (vedi sotto). `Categoria` resta `Informatica` per Acquisti |
| `FirewallInstallato` | sì/no | spunta, ha senso solo sui PC: l'app la mostra quando `TipoIT` = PC |
| `SottoTipo` | testo | Notebook, PC Desktop, Android, Monitor, NAS, Stampante, Fax laser |
| `Marca`, `Modello` | testo | separati per poterci fare report; `MarcaModello` resta e lo scrive l'app come `Marca + Modello` |
| `Acquisizione` | scelta: Acquisto, Noleggio, Donazione | serve a tutti i beni, non solo ai dispositivi |
| `CanoneMensile` | valuta | 10 dispositivi su 52 sono a noleggio |
| `FineNoleggio` | data | per gli alert e per il costo ricorrente |
| `GaranzieAccessorie` | testo lungo | Premium Care, copie incluse, estensioni |
| `FatturaRif` | testo | il riferimento libero già usato dall'IT, dove non c'è una richiesta d'acquisto |
| `CentroDiCosto` | lookup → Centri di Costo | **valore corrente**, riscritto dall'app dall'assegnazione attiva |
| `AssegnatarioMail`, `AssegnatarioNome` | testo | denormalizzati dall'assegnazione attiva, per la lista senza N+1 letture |
| `IdListaIT` | testo | `DISP-43`: il ponte col registro vecchio |

### Come si distinguono i beni IT dagli altri

Il discriminante è **`TipoIT` valorizzato**: un solo campo, una sola verità. L'area IT mostra
i beni che ce l'hanno, l'inventario generale li mostra tutti.

Non si usa `Categoria = Informatica`: quella è la categoria contabile che il bene eredita
dalla richiesta d'acquisto, decisa da chi compra e non da chi gestisce i dispositivi — un
monitor può finire in "Attrezzatura" senza che nessuno abbia sbagliato. Tenere le due cose
separate significa che la classificazione contabile e quella tecnica non si rompono a vicenda.

Il buco prevedibile è il contrario: un bene informatico creato da Acquisti **senza** `TipoIT`,
che sparirebbe dall'area IT. Per questo l'area IT ha un secchio **"da classificare"** —
`Categoria = Informatica` e `TipoIT` vuoto — con lo stesso spirito della vista "senza centro
di costo": l'anomalia si vede invece di nascondersi. E quando Acquisti crea un bene di
categoria Informatica dovrà chiedere il tipo — **questo pezzo è dentro Acquisti e non è
ancora fatto**, per ora c'è solo il secchio.

`FirewallInstallato` è una proprietà **del PC**, non dell'assegnazione: oggi invece
l'informazione sta in tre note di assegnazione ("No Watchguard", "PC Medici - NO WATCHGUARD",
"NO WATCHGUARD - DA CONSEGNARE"). In migrazione si spunta il firewall su tutti i 41 PC
tranne quei tre — è un'assunzione, ed è una delle colonne che troverai nell'xlsx di bonifica
da confermare riga per riga. L'app tiene un contatore "PC senza firewall" bene in vista.

### `Assegnazioni Beni` — nuova lista (sito principale)

`Title` leggibile in SharePoint (`INV-0012 · 2026-08-20`), più:
`Bene` (lookup → Inventario Beni), `AssegnatarioMail`, `AssegnatarioNome`,
`CentroDiCosto` (lookup), `ServizioLegacy` (testo), `NomeUtenza` (testo),
`DataAssegnazione` (obbligatoria), `DataFine` (etichettata "Data restituzione" sui beni e
"Data cessazione" sulle SIM: stesso nome interno nelle due liste, così il codice che le legge
è uno solo), `Stato` (Attiva/Chiusa), `Note`,
`VerbaleConsegnaUrl`/`VerbaleConsegnaNome`,
`VerbaleRestituzioneUrl`/`VerbaleRestituzioneNome`, `IdListaIT`.

Il **nome utenza sta sull'assegnazione**, non sul bene: cambia quando la macchina passa di mano.

Niente `Struttura`: il centro di costo è la dimensione che serve, la sede fisica di un
portatile è quella di chi lo usa.

**L'assegnatario è facoltativo, il centro di costo no.** NAS, stampanti e fax non stanno in
mano a nessuno: stanno in un servizio. Un'assegnazione senza persona è legittima, quella senza
centro di costo no — è il centro di costo che rende l'assegnazione utile a qualcosa. Per le
righe senza persona non si genera nessun verbale: non c'è nessuno che firma.

### Verbali

Due cartelle fisse dentro la libreria dell'inventario (`SP_INVENTARIO_DRIVE_ID`), sorelle
della cartella `Inventario Beni`: **`Verbali Consegna`** e **`Verbali Restituzione`**.
Nessuna sottocartella per bene — il numero di inventario sta nel nome del file:

```
Verbali Consegna/INV-0012 - verbale consegna - 2026-08-20 - Rossi Mario.pdf
Verbali Restituzione/INV-0012 - verbale restituzione - 2027-01-15 - Rossi Mario.pdf
```

Il flusso è identico nei due sensi: **assegnare** genera il verbale di consegna, **chiudere
un'assegnazione** genera quello di restituzione; in entrambi i casi l'app produce il PDF da
stampare e poi accetta il caricamento del firmato, che scrive `Verbale*Url`/`Verbale*Nome`
sulla riga di assegnazione. La stessa cosa vale per le SIM.

### `SIM e Utenze` + `Assegnazioni SIM` — nuove liste

SIM: `Title` = ICCID, `Numero`, `Operatore`, `TipoPiano`, `NomePiano`,
`FornitoreIntermediario`, `DataAttivazione`, `DataCessazione`, `RiferimentoContratto`,
`Stato`, `CostoMensile`, `Note`, `CentroDiCosto` (corrente), `AssegnatarioMail`/`Nome`,
`BeneAssociato` (lookup → Inventario Beni: lo smartphone in cui sta), `IdListaIT`.

Assegnazioni SIM: stessa forma di `Assegnazioni Beni`, con `Sim` al posto di `Bene` — verbali
di consegna e restituzione compresi, nelle stesse due cartelle, col numero della SIM nel nome.

### Storico

Lo storico è la ragione per cui le assegnazioni sono righe. Si vede in tre punti:

- **Scheda del bene** (e scheda della SIM): l'elenco di tutte le assegnazioni dalla più
  recente — assegnatario, centro di costo, date, nome utenza, note e i link ai due verbali.
  Chi ce l'ha oggi è la riga in cima, evidenziata.
- **Scheda della persona**: cosa ha in carico adesso e cosa ha restituito. Serve all'IT quando
  un dipendente cessa, e si aggancia all'anagrafica RU tramite la mail aziendale.
- **"I miei strumenti"**, aperta a ogni dipendente in sola lettura sul proprio.

### Invarianti che l'app fa rispettare

- **Al massimo un'assegnazione Attiva per bene** (e per SIM). Assegnare chiude la precedente,
  ne compila la data di restituzione e aggiorna il bene: una sola operazione, non tre.
- **Lo stato del bene è derivato**: assegnazione attiva → `In uso`; nessuna → `In magazzino`.
  Gli stati chiusi (`Dismesso`, `Alienato`, `Smarrito`) impediscono nuove assegnazioni e
  **chiudono quella attiva** — anche quando la dismissione arriva dalla pagina Inventario,
  che è la via da cui la contraddizione si ricreerebbe in un clic. Stessa cosa per una SIM
  che passa a "Cessata".
- **Lo stato dell'assegnazione non si scrive a mano**: `correggi` lo rifiuta, e rifiuta anche
  una data di fine su una riga ancora attiva. Per chiudere c'è "Restituito", che sa anche
  cosa fare all'anagrafica.
- **Centro di costo e assegnatario sul bene li scrive solo l'app**, mai una persona a mano.
- Le date sono solo-giorno, normalizzate con gli helper già in uso (`lib/timbrature/date.ts`).

---

## Fasi

**0 — Incoerenze: fatto.** Le sei incoerenze sono state decise una per una e stanno in
`scripts/it-correzioni.json`, che la migrazione legge e applica. Le liste su `gruppo_it` non
si toccano: lì resta l'archivio, la verità sta nel file.

| Cosa | Decisione |
|---|---|
| DISP-11 HP 430 G3, "In uso" ma con l'unica assegnazione chiusa | → **In magazzino**; l'assegnazione ad Anna Russo resta nello storico |
| DISP-43 HP 250 G10, "Dismesso" ma assegnato a Finetti | → **In uso**; il passaggio Buzzi → Finetti è corretto, cade la nota "In ufficio da consegnare" |
| DISP-52 Samsung A56, "In magazzino" ma con assegnazione attiva | → **In uso**; persona e centro di costo si completano dall'app |
| NAS, stampante e fax: assegnazioni senza persona | → **l'assegnatario è facoltativo**: basta il centro di costo (vedi sotto) |
| ASG-6 Olivetti "PC-SimonaFinetti" senza utente | → **PC condiviso di Vallarsa**, il nome utenza resta come traccia |
| ASG-14 e ASG-49 senza data di inizio | → **01/11/2025**, la data di impianto delle altre righe storiche |

I **dati mancanti non si bonificano prima**: si completano dall'app, che li mostra nelle viste
"da completare". Sono il canone su 39 dispositivi a noleggio (o `Acquisizione` è a Noleggio per
difetto: da chiarire), i campi delle SIM, e i centri di costo di tutte le assegnazioni.

`scripts/it-anomalie.mjs` resta come **strumento di diagnosi**: rifotografa le quattro liste in
un xlsx quando serve rivedere lo stato di salute dei dati. Non è più un passaggio obbligato.

**1 — Provisioning.** `scripts/provision-inventario.mjs` esteso con le colonne nuove (è già
idempotente), più `scripts/provision-it.mjs` per le tre liste nuove.
Le due cartelle dei verbali le crea lo stesso script dell'inventario, come già fa per
`Inventario Beni`.

**2 — Migrazione.** `scripts/migra-dispositivi-it.mjs`, dry-run per default e `--applica`
per scrivere: assegna gli `INV-xxxx`, compila `IdListaIT`, crea la cartella di ogni bene e
riporta lo storico delle assegnazioni. Rieseguibile senza duplicare (chiave: `IdListaIT`).

**3 — App.** `lib/inventario/assegnazioni.ts` e `flusso.ts` (le invarianti stanno qui, non
nelle schermate); `lib/sim/`; `types/sim.ts`; log su `lib/core/audit.ts` per ogni assegnazione
e restituzione. UI: card "IT e Dispositivi" in home, scheda del bene e della SIM con lo
storico, scheda della persona, pagina SIM.

**Permessi:** assegnare e restituire lo fa **solo l'IT**. L'area `it` si aggiunge alla lista
Autorizzazioni e si concede dal pannello Amministrazione › Permessi, come le altre.
Unica eccezione, **"I miei strumenti"**: aperta a tutti in sola lettura sul proprio, senza
permesso d'area — come Richiesta fattura.

**4 — Centri di costo a mano**, dalla vista "senza centro di costo": 53 righe da smaltire.

**5 — Verbali** consegna e restituzione, docx → PDF, con caricamento del firmato nelle due
cartelle fisse. Serve il modello attuale in uso, che Dennis fornirà.

**Poi:** alert scadenze (garanzia, fine noleggio, contratto SIM) riusando il cron di Gestione
Software; Registro Assistenza IT con il lookup sistemato.

Il **canone di noleggio e il costo SIM restano informazioni dell'anagrafica**: non generano
righe di costo. Diventeranno costi ricorrenti per centro di costo quando arriverà il controllo
di gestione (vedi `docs/controllo-di-gestione-piano.md`), e il modello è già pronto per
reggerlo — periodo, centro di costo e importo mensile ci sono tutti.

## Come si mette in piedi

Un comando per volta, dalla cartella `web/`:

```
node scripts/provision-inventario.mjs        # colonne nuove sui beni + cartelle dei verbali
node scripts/provision-it.mjs                # le tre liste nuove
node scripts/migra-dispositivi-it.mjs        # prova a vuoto: non scrive niente
node scripts/migra-dispositivi-it.mjs --applica
```

Poi si concede l'area **IT e Dispositivi** da Amministrazione › Permessi, e si fa un deploy
perché Vercel legga le variabili nuove (`SP_LIST_ASSEGNAZIONI`, `SP_LIST_SIM`,
`SP_LIST_ASSEGNAZIONI_SIM`).

La migrazione è rieseguibile: la chiave è `IdListaIT`, quindi una riga già dentro viene
saltata. Provata in sandbox sui dati veri — 52 dispositivi, 53 assegnazioni, 46 SIM,
5 assegnazioni SIM; rilanciata a destinazione piena crea zero righe e ne salta 156.

## Da decidere

- Quando mettere in sola lettura le liste su `gruppo_it`.
- `lib/inventario/data.ts` ha superato le 500 righe con le colonne dei dispositivi:
  è nell'elenco di `npm run mappa`. Da spezzare (le cartelle e i documenti da una parte,
  le letture e le scritture della lista dall'altra), ma non insieme a questo lavoro.
