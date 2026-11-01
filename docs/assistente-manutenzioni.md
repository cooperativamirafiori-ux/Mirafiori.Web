# Assistente manutenzioni — chat nel Pannello di controllo

Deciso con Dennis il 1 nov 2026. Nasce da una richiesta concreta: «leggi le manutenzioni
assegnate a Mirco Marrano e fammi un elenco con cosa fare, sede e indirizzo». Il connettore
Microsoft 365 di Claude non legge le righe delle liste SharePoint, e dal container di Claude
Graph non si raggiunge; l'app invece le legge già. Quindi la chat sta **dentro l'app**.

## Decisioni di Dennis

- Chat **aperta agli admin** delle manutenzioni (`isAdmin`, i tre in codice), nel Pannello.
- **Lettura e scrittura**.

## Scelte fatte nel costruirla

- **Ogni scrittura passa da «Conferma».** Il modello non ha una strada sua per scrivere: gli
  strumenti `proponi_*` controllano i dati e preparano una `AzioneProposta` = la chiamata a
  un'API **già esistente** del Pannello (`[id]` PATCH, `presa-in-carico`, `lungo-corso`,
  `pratica`, `voci`). Alla conferma la fa il browser con la sessione dell'admin: stessi
  controlli (`isAdmin`, `accessoPratica`), stesse mail, stesso Log Attività. Il server
  dell'assistente non scrive niente.
- **I dati veri li mette il server, non il modello**: il nome del tecnico arriva dalla lista
  Tecnici a partire dall'id, la richiesta si risolve fra quelle esistenti, una richiesta già
  completata non si chiude né si assegna, le date si validano.
- **Leggere non segna come letti** i messaggi dei richiedenti (`leggiPratica(…, { segnaLetti: false })`):
  il «✉ messaggio nuovo» del Pannello resta finché l'admin apre la richiesta.
- **Fuori di proposito** (per ora): costi, fornitori, eliminazione delle cose da fare. Si
  aggiungono come strumento solo se esiste già l'API del Pannello.
- **Modello: Sonnet** (`claude-sonnet-5-5`, variabile `MANUTENZIONI_ASSISTENTE_MODELLO` per
  cambiarlo). Qui si toccano dati veri e partono mail; gli utenti sono tre, il costo è basso.
  Stessa chiave delle altre funzioni: `ANTHROPIC_API_KEY`.
- **Nessun registro delle domande**: le operazioni confermate finiscono già nel Log Attività
  tramite le API; le domande restano nel browser.
- Gli esiti delle conferme tornano al modello nella domanda successiva come righe
  `[Eseguito]` / `[Non eseguito]` / `[Annullato dall'admin]`.

## File

| Pezzo | File |
|---|---|
| Chat e schede «Conferma» | `components/manutenzioni/AssistenteManutenzioni.tsx` (montata in `app/(app)/dashboard/page.tsx`) |
| Domanda → risposta | `app/api/manutenzioni/assistente/route.ts` → `lib/manutenzioni/assistente.ts` |
| Strumenti di lettura e proposte | `lib/manutenzioni/assistente-strumenti.ts` |
| Letture aggiunte | `getTutteRichieste()` in `lib/manutenzioni/data.ts`, `getStruttureConIndirizzo()` in `lib/strutture/data.ts` |

## Da sapere

- L'**indirizzo** viene dalle colonne `Indirizzo` e `Comune` della lista Strutture: dove non
  sono compilate l'assistente dice «indirizzo non registrato». `Comune` esiste solo dove
  l'ha creata `scripts/aggiungi-struttura.mjs`, per questo le strutture si leggono senza `$select`.
- I testi delle richieste e dei messaggi sono **dati**: le istruzioni dicono al modello di non
  eseguire richieste scritte lì dentro, e comunque nessuna scrittura parte senza conferma.
- Verifica fatta (1 nov 2026): ciclo completo con Graph e Claude simulati (ricerca per tecnico
  a nomi invertiti, indirizzo dalla struttura, chiusura di una completata rifiutata) e chat
  montata in Chromium a 375 px (conferma singola e «Conferma tutte», errore con «Riprova»,
  esiti nella storia, nessuno scorrimento orizzontale).
