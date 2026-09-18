# Gestione Password — setup e decisioni

Amministrazione → **Gestione Password**: la cassaforte delle credenziali della
cooperativa. Un posto solo per gli accessi ai portali che servono a più persone
(banca, INPS, fornitori, utenze), al posto del foglio Excel e dei post-it.

Aperta il 15 settembre 2026.

---

## Cosa c'è dentro una voce

| Campo | Colonna SP | Chi lo scrive |
|---|---|---|
| A cosa serve | `Title` | l'utente (obbligatorio) |
| Categoria | `Categoria` | l'utente |
| Nome utente | `NomeUtente` | l'utente |
| Password | `Password` | l'utente |
| PIN | `Pin` | l'utente (facoltativo) |
| Link al sito | `LinkSito` | l'utente |
| Telefono per il secondo fattore | `TelefonoVerifica` | l'utente |
| Note | `Note` | l'utente |
| Data inserimento | `DataInserimento` | **l'app**, alla creazione |
| Ultima modifica password | `UltimaModificaPassword` | **l'app**, solo se la password cambia |

---

## Setup

Dalla cartella `web/`:

```bash
node scripts/provision-password.mjs
```

Lo script crea la lista SharePoint "Gestione Password" con le sue colonne
(è idempotente: rilanciato, aggiunge solo quelle mancanti) e stampa la riga
`SP_LIST_PASSWORD=<guid>` da mettere in `.env.local` e su Vercel.

Poi, **una volta sola e a mano su SharePoint**: Impostazioni lista →
Autorizzazioni → Interrompi ereditarietà, e lasciare la lista ai soli account
dell'amministrazione. L'app protegge la schermata; la lista sotto, no.

---

## Decisioni prese, e il perché

**Le password sono in chiaro su SharePoint.** Scelta esplicita di Dennis il 15
settembre 2026, presa dopo aver visto l'alternativa. Conseguenza da tenere
presente: chiunque possa aprire quella lista su SharePoint — o esportarla in
Excel — legge tutte le credenziali della cooperativa, e nei log di Microsoft
non resta traccia di chi ha guardato cosa. È lo stesso regime dei campi
`Account`/`Password` già presenti in Gestione Software.

Se un domani si volesse cifrare l'archivio, il lavoro è piccolo ed è già
predisposto: `leggiSegreto` e `scriviSegreto` in `lib/password/data.ts` sono le
uniche due porte attraverso cui il valore passa. Diventerebbero una coppia
cifra/decifra AES-256-GCM con la chiave in una variabile d'ambiente su Vercel;
schermata, route e tipi non cambierebbero di una riga, e servirebbe solo uno
script che riscriva una volta le righe esistenti.

**Il cancello è il permesso "Amministrazione", non un permesso nuovo.** Chi
entra in area riservata vede l'archivio intero: è una cassaforte unica, non una
cassetta per ciascuno. Se un giorno servisse stringere, la strada è aggiungere
`Password` ad `AREE_PERMESSI` in `lib/core/permessi.ts` e cambiare la costante
`AREA` nelle tre route e nella pagina.

**`UltimaModificaPassword` si muove solo quando la password cambia davvero.**
Per saperlo, `aggiornaVocePassword` rilegge la riga prima di scriverla: è una
GET in più, ed è voluta. Aggiornandola a ogni salvataggio, correggere un numero
di telefono farebbe sembrare la password appena cambiata, e la segnalazione
"da cambiare" non direbbe più niente.

**Password e PIN non vengono mai `trim`ati.** Uno spazio in testa o in coda può
farne parte: toglierlo silenziosamente produrrebbe una credenziale che non
funziona e nessuno capisce perché.

**Nel Log Attività non finisce mai un valore riservato.** Si registra
`password.crea` / `password.aggiorna` / `password.elimina` col nome della voce e,
sulla modifica, il solo fatto che la password sia cambiata. Sulla cancellazione
il nome si legge *prima* della DELETE: dopo, non lo recupera più nessuno.

**Niente ricerca sulla password.** Il campo di ricerca guarda nome, utente,
sito, categoria e note. Cercare per password significherebbe scriverla a schermo
in un campo di testo in chiaro.

**I valori riservati si richiudono da soli dopo 30 secondi.** Un timer solo per
tutta la pagina, riarmato a ogni "mostra" (`RICHIUDI_DOPO` in
`GestionePassword.tsx`). Serve al caso più comune: il telefono lasciato sul
tavolo con la password a schermo.

**"Da cambiare" dopo un anno** (`GIORNI_PASSWORD_VECCHIA` in
`types/password.ts`). Non è una regola aziendale: è il promemoria che nessuno si
ricorda di darsi da solo. Si conta dall'ultima modifica, o dall'inserimento se
la password non è mai stata cambiata.

**Le categorie si filtrano con bottoni colorati, non con una tendina**
(18 set 2026). L'archivio si apre per guardare *un gruppo* — «le password del
WiFi», «quelle delle banche» — non per filtrare una tabella riga per riga: con
la tendina servivano tre gesti e non si vedeva quali categorie esistessero
davvero. I bottoni (`_componenti/FiltriCategoria.tsx`) mostrano **solo le
categorie che hanno voci**, col conteggio accanto, e si spengono ripremendoli.

Ogni categoria ha un colore fisso, lo stesso sul bottone e sulla pillola della
card. La tabella dei colori sta in `_componenti/colori.ts` e **non** in
`types/password.ts` per un motivo pratico: `tailwind.config.ts` scansiona solo
`app/`, `components/` e `pages/`, quindi le classi scritte sotto `types/`
verrebbero eliminate dalla build e i bottoni uscirebbero bianchi — con `tsc`
verde e nessun errore a runtime.

**Aggiungere una categoria richiede tre passaggi**, o qualcosa resta indietro
in silenzio:

1. `CATEGORIE_PASSWORD` in `types/password.ts` (l'ordine è quello dei bottoni);
2. la voce in `_componenti/colori.ts`, altrimenti esce grigia;
3. `node scripts/provision-password.mjs`, che allinea le scelte della colonna
   `Categoria` su SharePoint. Saltarlo fa comparire la categoria nella tendina
   del form e fa **rifiutare il salvataggio** dalla colonna choice.

Il passo 3 aggiunge solo le scelte mancanti, partendo da quelle già presenti:
una categoria creata a mano su SharePoint non viene cancellata. Le voci che su
SharePoint hanno una categoria fuori elenco restano raggiungibili — compaiono in
fondo ai bottoni, in grigio.

---

## Rimasto fuori, di proposito

- **Travaso delle credenziali già dentro Gestione Software.** Oggi le due
  sezioni convivono e la stessa password può stare in due posti. Il travaso
  (script che sposta qui le credenziali dei software e lascia là il solo
  collegamento) è stato rimandato al 15 settembre 2026: prima si guarda
  funzionare l'archivio.
- **Generatore di password** e **allegati** (file di recovery code): nessuno li
  ha chiesti.
- **Cartelle o voci riservate al singolo utente**: la cassaforte è condivisa.
