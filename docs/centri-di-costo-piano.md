# Centri di Costo — piano di attuazione

> Stato al 14/08/2026: **punti 1 e 2 fatti**, punto 3 (timbrature) da fare.
> Base: `Aree_e_Centri_di_Costo_Mirafiori_v3.xlsx` (23 centri di costo, cc1…cc23,
> raggruppati in 10 aree). Vedi anche `docs/richiesta-fattura.md`.
>
> **Fatto**: lista SP creata e popolata (`provision-centri-costo.mjs`), colonna
> lookup `CentroCosto` su Strutture/Costi/Acquisti e `Struttura` resa facoltativa
> sui Costi (`provision-centri-costo-collegamenti.mjs`), 41 movimenti storici
> assegnati (`backfill-centro-costo-costi.mjs`), anagrafica condivisa in
> `lib/centri-costo/data.ts`, campo nei form di costo diretto e acquisti,
> cruscotto costi con le due viste.
>
> **Prima**: A02 è stata unificata in A01 e A06 in A05 (`unifica-strutture.mjs`);
> le righe `ZZ_` vanno eliminate dopo il collaudo.

---

## Principio guida

Il centro di costo è una **dimensione contabile autonoma**, non un attributo della struttura
fisica. La struttura lo *suggerisce*, non lo *definisce*. Conseguenza pratica in tutto il
piano: quando nasce un documento di spesa (costo, acquisto, fattura, riga di timbratura) il
centro di costo viene **copiato sul documento**, non ricalcolato ogni volta leggendo la
struttura. Se domani "Fleming" passa da Ed. amb. Sud a un altro centro di costo, lo storico
resta com'era. Ricalcolare a runtime riscriverebbe il passato ogni volta che si sistema
un'anagrafica.

---

## 1. Lista SharePoint `Centri di Costo`

Lista unica, l'Area è una colonna Choice (10 valori) e non una seconda lista: le aree non
hanno campi propri e una lista in più significa un lookup in più da mantenere.

| Colonna | Tipo | Note |
|---|---|---|
| `Title` | Testo | nome del centro di costo (es. "Ed. amb. Nord") |
| `Codice` | Testo | `cc1`…`cc23` — **chiave stabile**, è quella che useremo per il mirror su Supabase |
| `Area` | Choice | Lavoro, Ristorazione, Pari opportunità, Area Socio-Culturale, Area Socio Sanitaria, Area Educativa, Area Autonomie, Ricettività, Commercio, Servizi Generali |
| `SiglaArea` | Testo | opzionale, se serve nei report |
| `Responsabile` | Persona | **lasciata vuota** ora, si popola dopo |
| `Attivo` | Sì/No | default Sì — un CC non si cancella mai, si disattiva (lo storico lo referenzia) |
| `Ordine` | Numero | ordinamento nei menù |

Attuazione: `scripts/provision-centri-costo.mjs` (stessa forma di `provision-fatture.mjs`)
che crea lista + colonne e carica le 23 righe dall'Excel. Poi:

```
SP_LIST_CENTRI_COSTO=<guid>
```

Da quel momento la Richiesta Fattura passa **da sé** da campo libero a menù a tendina: il
codice è già scritto in `lib/fatture/centri-di-costo.ts`.

Un'unica rifinitura di architettura: quel file oggi sta dentro `lib/fatture/` ma il centro di
costo diventa un'anagrafica condivisa (come `clienti` e `strutture`). Va spostato in
`lib/centri-costo/data.ts` e fatto restituire oggetti `{codice, nome, area}` invece di sole
stringhe. `fatture` continua a salvare la stringa del nome, così le richieste già inviate
restano leggibili anche se un CC viene rinominato.

---

## 2. Costi delle strutture → centro di costo

Due colonne nuove, una per anagrafica e una per documento.

**a) Sulla lista `strutture`** — lookup `CentroCosto` → Centri di Costo.
La relazione è **N strutture : 1 centro di costo** (cc17 SCAT.TO abitare ne ha due: Via
Coggiola e Strada del Drosso), quindi il lookup sta sulla struttura. Lo schema resta
estendibile al caso "una struttura, due centri di costo" (la Cascina, in futuro) perché il
CC vero è comunque quello scritto sul documento.

**b) Sulla lista `costi`** — lookup `CentroCosto`, valorizzato alla creazione:

- costo inserito a mano → precompilato dalla struttura scelta, modificabile;
- costo da manutenzione → ereditato dalla struttura dell'intervento;
- costo da acquisto → ereditato dalla richiesta d'acquisto;
- struttura assente (servizio senza sede fisica) → campo **obbligatorio**, scelta a mano.

Stesso trattamento su `acquisti` (`CentroCostoLookupId` sulla richiesta, poi copiato sul
costo generato) e su `Fatture inviate` (già c'è il campo, oggi testo libero).

**Cruscotto costi**: si aggiunge la vista "per centro di costo" accanto a quella per
struttura — stessi dati, altro raggruppamento. `app/(app)/cruscotto-costi/`.

**Da verificare prima**: le strutture censite nell'Excel sono 15 (A01, A03, A04, A05, A07,
B01…B10 parziali). Le strutture in anagrafica che non compaiono nel foglio resterebbero senza
centro di costo — vanno elencate e assegnate, oppure marcate come "non allocabili".

---

## 3. Servizi delle Timbrature → centro di costo

### Dove sta l'elenco

**Non è una lista SharePoint.** È una tabella Postgres su Supabase: `servizio`, definita in
`supabase/timbrature_schema.sql` (righe 17-26 e seed alle righe 110-144), letta da
`lib/timbrature/data.ts`. Contiene 25 servizi di lavoro + 8 giustificativi.

Attenzione al tranello: la tabella ha **già** una colonna `centro_costo` (int), ma non è un
centro di costo — è il macro-raggruppamento del vecchio foglio ore Excel (1=Interni,
2=Sanitari/ASL, 3=Cultura, 4=Educativi/sociali, 5=Altri, 99=Giustificativi). Va **rinominata
`macro_gruppo`** per liberare il nome, non riusata.

### Come assegnarli

Migrazione SQL con una colonna nuova:

```sql
alter table servizio rename column centro_costo to macro_gruppo;
alter table servizio add column centro_costo_codice text;  -- 'cc1'...'cc23', null per i giustificativi
```

La chiave di collegamento è il **codice** (`cc7`), non l'id numerico SharePoint: SharePoint e
Supabase sono due database distinti e l'id di uno non ha senso nell'altro. Il codice è stabile
e leggibile a occhio quando si debugga.

I giustificativi (ferie, 104, permessi…) restano a `null`: sono ore che non si allocano a un
servizio. Se un giorno servisse imputarle, si allocano al CC del dipendente, non del servizio —
ma è una decisione da prendere con l'ufficio, non ora.

### Mappatura proposta

19 servizi su 25 sono automatici, 6 hanno bisogno di una decisione.

| Servizio (Supabase) | → Centro di Costo | |
|---|---|---|
| UFFICIO | cc23 Progettazione - Amministrazione | ok |
| PROGETTAZIONE | cc23 Progettazione - Amministrazione | ok |
| ASL TO5 | cc11 Educativa Sanitaria ASL TO5 | ok |
| CENTRO DIURNO CASA OZ | cc12 Interventi CDSR Fondazione OZ | ok |
| COSMICA2 | cc9 CRP CO.S.MI.C.A | ok |
| PROGETTO PONTE | cc13 Progetto Ponte | ok |
| PROGETTO TOC TOC | cc6 Toc Toc Roberto | ok |
| PSICHIATRIA ADULTI | cc10 Salute Mentale ASL TO | ok |
| CPG | cc7 CPG Torino | ok |
| CARELEAVERS | cc19 Care Leavers | ok |
| CASA ARTEMISIA | cc5 Casa Artemisia | ok |
| CENTRO ANTIVIOLENZA IN RETE | cc4 CAV In Rete | ok |
| CISA 12 | cc20 CISA 12 Nichelino | ok |
| CONDOMINIO SOLIDALE VIA GESSI | cc18 Condominio Solidale | ok |
| COMUNITÀ GIULIA | cc14 CER Giulia | ok |
| MIRAFLEMING | cc16 Ed. amb. Sud | ok |
| SCAT.TO VIA COGGIOLA/STR. DEL DROSSO | cc17 SCAT.TO abitare | ok |
| LOCANDA | cc2 La Locanda nel Parco | ok |
| PROGETTI TIROCINI | cc1 Scat.to Orientamento lavoro | ok |
| **SANITARIA TORINO** | cc10? cc9? | **da decidere** |
| **CUAV** | cc6 (ha la struttura Via Monte Cengio) o cc4 CAV In Rete? | **da decidere** |
| **BIBLIOTECHE** | cc8 MirArte? | **da decidere** |
| **MUSEI** | cc8 MirArte? | **da decidere** |
| **EDUCATIVA SPECIALISTICA SCUOLE** | va spaccato fra cc15 Nord e cc16 Sud | **da decidere** |
| **IET/IEPD** | va spaccato fra cc15 Nord e cc16 Sud | **da decidere** |

Sui due "da spaccare": se l'operatore che timbra su Educativa Specialistica lavora sempre in
una sola delle due zone, la strada pulita è sdoppiare il servizio in due voci di menù
("Ed. spec. scuole Nord" / "Sud") invece di aggiungere un secondo campo al form di timbratura.
Meno attrito per chi timbra ogni giorno.

**Tre centri di costo restano senza servizio**: cc3 Una Serra per Mirafiori, cc21 Pian della
Mussa, cc22 Amazing. Se lì ci timbra qualcuno servono tre voci nuove nel menù; se non ci
timbra nessuno (solo costi, nessuna ora), è corretto così e va solo confermato.

---

## Ordine di esecuzione

1. Approvare in ufficio la lista dei 23 CC e chiudere i 6 dubbi qui sopra.
2. `provision-centri-costo.mjs` → lista SP + env `SP_LIST_CENTRI_COSTO`.
   Effetto immediato e gratuito: Richiesta Fattura diventa un menù a tendina.
3. Lookup `CentroCosto` su `strutture` + assegnazione delle 15 strutture note.
4. Lookup `CentroCosto` su `costi` e `acquisti` + precompilazione dalla struttura.
5. Vista "per centro di costo" nel cruscotto costi.
6. Migrazione Supabase: `macro_gruppo` + `centro_costo_codice` + mappatura.
7. Rendicontazione ore per centro di costo nel cruscotto HR.

I passi 2-5 e il 6 sono indipendenti: si possono fare in parallelo o rimandare il 6.
