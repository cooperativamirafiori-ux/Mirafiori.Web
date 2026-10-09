# Utenze e Costi per struttura

Decisioni del 9 ottobre 2026 con Dennis. Le schermate stanno tutte in **Amministrazione**:

- **Costi per struttura** (`/amministrazione/costi-strutture`): un cruscotto unico che per ogni struttura mostra i parziali e il totale;
- **Utenze** (`/amministrazione/utenze`): POD, PDR e contratti dell'acqua con la loro struttura, i codici da collegare, l'ultima bolletta;
- **Costi fissi** (`/amministrazione/costi-fissi`): affitto, assicurazione, IMU, TARI, telefonia.

## Da dove arriva ogni parziale

| Parziale | Fonte | Come si conta |
|---|---|---|
| Utenze | bollette lette dagli **XML SDI** (`bolletta` + `bolletta_quota` su Supabase) | imponibile × percentuale della struttura, distribuito sui giorni del periodo di competenza |
| Manutenzioni, Pulizie, Acquisti, Altro | lista SP **Costi Strutture** (chiusura ticket, costi diretti, acquisti consegnati) | nel mese della DataCosto, parziale dalla categoria |
| Lavori Cura Ambienti | `lavoro_cura_ambienti` consuntivati/addebitati verso una struttura | ore × tariffa interna + materiali, nel mese del lavoro |
| Costi fissi, Telefonia | lista SP **Costi Ricorrenti Strutture** | importo ÷ mesi della frequenza, ogni mese dalla prima scadenza |

Per l'anno in corso si conta fino al mese di oggi: i costi fissi non anticipano i mesi futuri.

⚠️ **Niente doppioni con gli XML.** Le fatture dei fornitori di manutenzione arrivano anche come XML, ma qui si conta il costo della lista Costi Strutture: gli XML servono **solo** per le bollette. Al contrario, una riga di Costi Strutture con una categoria che sembra una bolletta (energia, luce, gas, acqua, utenze) **non** si conta e diventa un avviso. Attenzione alle regex: `\butenz` e non `utenz`, perché "man**utenz**ione" la contiene (bug trovato dalla prova).

## Le bollette

Verificato sui file veri (Chiurlo Srl, P.IVA 01274390309: arriva con il prefisso file dell'intermediario `IT02355260981_…`), con 67 fatture tra agosto e settembre 2026:

- il **POD/PDR** sta in `DettaglioLinee/RiferimentoAmministrazione`, su ogni riga;
- il **periodo** sta in `DataInizioPeriodo`/`DataFinePeriodo` delle righe;
- il **consumo** sta nelle righe con `UnitaMisura` KWH/SMC, ma **la stessa quantità si ripete su ogni componente**. Si prende, per ogni descrizione, la somma delle quantità (gli scaglioni "1 Sc.", "2 Sc." si uniscono), e poi il **massimo** fra le descrizioni. Sommare tutte le righe gonfierebbe il consumo di circa 15 volte.

Il codice sta in `lib/pagamenti/sdi/forniture.ts` (funzione pura). Per i fornitori che il codice non lo mettono in riga (SMAT: **ancora da verificare sul primo XML**), l'import cerca nel testo della fattura i codici veri già presenti in Mappatura.

**Percorso:** import notturno → `registraBollette` (in `lib/utenze/data.ts`) → per ogni codice si cerca la riga della **Mappatura Utenze** (lista SP).
- Se c'è: la bolletta nasce già divisa (quote), e la fattura prende **da sola il centro di costo** (`cc_rivendicata_da = 'utenze (automatico)'`), ma solo se è ancora libera e se tutte le quote finiscono su un unico centro di costo.
- Se non c'è: il codice va nella coda **Da collegare**. Dalla schermata Utenze lo si attacca a una riga segnaposto (`POD-B05` & co.) o a una riga nuova, e tutte le sue bollette in attesa si sistemano.

**Regola:** struttura e centro di costo si **copiano** sulla quota al collegamento. Cambiare la Mappatura vale per il futuro; per riscrivere le bollette passate c'è la spunta "Applica anche alle bollette già registrate".

**Recupero:** il bottone "Rileggi le fatture già importate" (`POST /api/utenze/rileggi`) rilegge gli XML in "Importate" delle fatture senza `utenze_lette_il`. È ripetibile e riparte da dove era rimasto.

## Doppioni: come si evitano (verifica del 9/10/2026)

| Rischio | Cosa lo impedisce |
|---|---|
| Stessa fattura importata due volte (copia "(1)", file rimesso in arrivo, cron e "Rileggi" insieme) | identificativo SDI unico su `fattura_passiva`; `bolletta` unica su (fattura, codice); le fatture già lette hanno `utenze_lette_il` |
| Fattura arrivata prima dall'Excel e poi in XML | raccordo su P.IVA + numero + data: resta una sola fattura, quindi una sola bolletta |
| Consumo gonfiato (quantità ripetuta su ogni componente) | per descrizione si fa la somma, poi si prende il massimo |
| Percentuali in Mappatura che superano il 100% (per esempio righe doppie) | `quoteDi` non divide la bolletta, che resta "da collegare", e la schermata mostra "il codice somma al 140%"; due righe sulla stessa struttura diventano una quota sola |
| False bollette (TIM, Fastweb, bombole di gas) | serve una prova: un POD, un consumo in kWh/Smc/m³, o "energia elettrica"/"gas naturale"/"servizio idrico" nel testo. Un numero lungo nel riferimento non basta (provato) |
| Manutenzione contata sia come costo dell'app sia come fattura XML del fornitore | Costi per struttura conta **solo** Costi Strutture; le fatture XML entrano solo come bollette. Il Cruscotto CdG fa il contrario (conta le fatture, non Costi Strutture). Ciascuno conta una volta sola, ma i due **totali non coincidono** |
| Bolletta inserita a mano in Costi Strutture | non si conta, e compare come avviso |
| Luce, gas o acqua inseriti anche fra i costi fissi | il modulo dell'app non li propone; se arrivano da SharePoint, compare un avviso |
| Centro di costo deciso due volte (coordinatore e automatico) | l'automatico scrive solo se la fattura è libera (`is null`); se le due scelte divergono, la schermata Utenze lo mostra |

**Lavoro interno di Cura Ambienti: vincono i Lavori** (decisione di Dennis del 9/10/2026). Lo stesso intervento può comparire due volte: come ticket chiuso in Costi Strutture (dove l'importo è fornitore + ore interne × "Costo orario pulizie") e come lavoro consuntivato in Cura Ambienti. Dal primo mese in cui una struttura ha lavori consuntivati, per quella struttura:
- dei ticket `MAN-…` si conta solo la parte del fornitore esterno (`ImportoFattura` della richiesta, `getImportiEsterniTicket`);
- i costi diretti con "Cura Ambienti" nella causale o nel fornitore non si contano.

Prima di quel mese si conta tutto come prima. Un ticket che non si trova fra i completati si conta intero.

**Centro di costo automatico e pagamenti.** Le bollette Chiurlo sono domiciliate (`automatica`): assegnare il centro di costo non muove nessun bonifico. Le bollette SMAT si pagano a bonifico, quindi il centro di costo decide da quale sottoconto Qonto parte il pagamento, esattamente come quando un coordinatore segna la fattura come sua. Dennis ha confermato che va bene così.

**Effetto sul Cruscotto CdG.** Dopo "Rileggi", le circa 68 bollette Chiurlo (≈ 10.700 € di imponibile, agosto-settembre) prendono il centro di costo e da quel momento entrano nel Cruscotto CdG: non è un doppione, è un costo che prima mancava.

## Chi vede cosa

- **Utenze** e **Costi fissi**: permesso `Amministrazione`.
- **Costi per struttura**: `Amministrazione` o admin delle manutenzioni (i tre in `ADMIN_HARDCODED`) vedono tutto; un **coordinatore** vede solo le strutture del suo centro di costo, ed entra dalla card in Controllo di Gestione.
- La card "Cruscotto costi" di Manutenzioni ora porta qui. La vecchia pagina `/cruscotto-costi` **resta** e non è stata toccata.

## SharePoint: preparazione del 9/10/2026

`scripts/utenze-prepara-sharepoint.mjs` (prima in prova, poi `--applica`):

- Cascina A01 al 100%: la divisione 70/30 con la vecchia A02 non vale più. Il POD ex A02 `IT001E10096962` passa su A01; le due righe doppie al 30% (gas `00881207624030`, acqua `0100117100003247`) si cancellano.
- Il POD `IT001E12954462`, che era su A06, va su A05 Pian della Mussa al 100%.
- Il gas AGN di Casa San Francesco va su A05 Pian della Mussa al **100%** (prima era al 50%).

Restano **da completare** in app i codici veri di: `PDR-A07`, `POD-B05`, `PDR-B05`, `POD-B06`, `PDR-B06` e `AGN GAS - Casa San Francesco`.

## Costi fissi: il passato non cambia

Decisione di Dennis del 9/10/2026: se un costo fisso viene a mancare o cambia (per esempio l'affitto aumenta), il passato resta com'era e il cambio vale da lì in poi. Per questo la lista ha la colonna **`DataFine`**, aggiunta da `scripts/utenze-prepara-sharepoint.mjs`, e la scheda di una voce offre tre azioni:

| Azione | Cosa fa | API |
|---|---|---|
| **Cambia da un mese** | la voce di oggi si chiude alla fine del mese prima (`DataFine`), ne nasce una nuova dal primo del mese | `POST /api/costi-fissi/[id]/varia` |
| **Termina** | `DataFine` = l'ultimo giorno in cui il costo vale; i mesi in cui c'era restano | `POST /api/costi-fissi/[id]/termina` |
| **Correggi un errore** | riscrive la voce, **passato compreso**: solo per i refusi | `PATCH /api/costi-fissi/[id]` |

Nel cruscotto ogni voce conta dal mese di inizio (colonna "Data prima scadenza", nell'app "Valido dal") al mese di fine compresi. Le voci chiuse si vedono con "Mostra lo storico".

La colonna `Attivo` resta: l'app la mette a `false` quando chiude una voce. Una voce spenta **senza** `DataFine` (cioè spenta a mano da SharePoint) non si sa da quando sia finita, quindi non si conta e compare come avviso.

Per ora le voci si inseriscono a mano; quali automatizzare si decide più avanti. Nel modulo dell'app luce, gas e acqua **non** si possono scegliere, perché arrivano dalle bollette.

## Setup

- Supabase: `supabase/utenze.sql`, applicato il 9/10/2026.
- Variabili: `SP_LIST_MAPPATURA_UTENZE=8fe22d3a-2051-4b53-a01d-4f3c868710ba` e `SP_LIST_COSTI_RICORRENTI=a5e90e19-b989-4534-94e5-5a4d5d3e7547`, in `.env.local` e su Vercel.
- Esplorazione (sola lettura): `scripts/esplora-utenze.ts`, da rilanciare quando arriva il primo XML SMAT; `scripts/esplora-costi-strutture.ts`.
