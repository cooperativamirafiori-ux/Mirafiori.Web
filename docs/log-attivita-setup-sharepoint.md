# Log Attività — setup lista SharePoint

Registro applicativo di *chi fa cosa* attraverso l'app. Serve perché tutte le
scritture verso SharePoint avvengono con il token app-only: nei log nativi di
SharePoint l'autore risulta sempre l'app, non il vero utente. Questa lista
salva invece l'identità reale presa dalla sessione di login (NextAuth).

Vengono registrate **solo le scritture e le cancellazioni** (non le letture).

## Modo rapido (script)

Dallo stesso ambiente in cui girano le env Graph (cartella `web/`):

```
node scripts/provision-log-attivita.mjs
```

Lo script crea la lista con tutte le colonne, stampa la riga `SP_LIST_LOG=…` per
`.env.local` e imposta la variabile su Vercel (production/preview/development).
Per creare solo la lista senza toccare Vercel: `--no-vercel`.

È idempotente: se la lista esiste già aggiunge solo le colonne mancanti.

I passaggi manuali qui sotto restano validi come alternativa/riferimento.

## 1. Creare la lista

Sul sito SharePoint `gruppo_ControlloGestione` → **Nuovo → Elenco** → lista vuota.

Nome: **Log Attività**

## 2. Colonne

La colonna **Title** esiste già di default: verrà usata per il codice azione.
Aggiungere le altre come **tipo testo** (nomi interni ESATTI, senza spazi né accenti):

| Colonna (nome interno) | Tipo                | Contenuto                                   |
|------------------------|---------------------|---------------------------------------------|
| Title                  | (default)           | codice azione, es. `software.elimina`       |
| Utente                 | Testo (singola riga)| email dell'utente                           |
| UtenteNome             | Testo (singola riga)| nome visualizzato                           |
| Entita                 | Testo (singola riga)| tipo entità, es. `Timbratura`               |
| EntitaId               | Testo (singola riga)| id del record interessato                   |
| Esito                  | Testo (singola riga)| `ok` oppure `errore`                        |
| Dettagli               | Testo (più righe)   | payload JSON (campi modificati, importi…)   |

La data/ora non serve come colonna: SharePoint la registra da sé nella colonna
automatica **Created** (Creato). Analogamente **Created By** conterrà l'app —
è normale, l'utente vero è nella colonna `Utente`.

> Importante: creare le colonne con questi nomi in ASCII. Se si usa un nome con
> accenti/spazi (es. "Entità") SharePoint genera un nome interno diverso
> (es. `Entit_x00e0_`) e il logging non scrive quel campo.

## 3. GUID della lista → variabile d'ambiente

Recuperare il GUID della lista (Impostazioni elenco → l'ID è nell'URL, parametro
`List=%7B...%7D`, oppure via Graph) e impostarlo come `SP_LIST_LOG`.

In locale, in `.env.local`:

```
SP_LIST_LOG=<guid-lista>
```

Su Vercel (produzione):

```
vercel env add SP_LIST_LOG production
# incollare il GUID quando richiesto
```

## 4. Comportamento

- Se `SP_LIST_LOG` non è impostata, il logging è un **no-op**: l'app funziona
  identica, semplicemente non scrive righe di log.
- Un errore di scrittura del log **non fa mai fallire** l'operazione dell'utente
  (viene solo loggato in console lato server).
- I permessi Graph già in uso (`Sites.ReadWrite.All`) bastano: non serve
  aggiungere nulla in Azure.

## 5. Azioni registrate

| Codice azione                     | Quando                                             |
|-----------------------------------|----------------------------------------------------|
| `manutenzione.crea`               | nuova richiesta di manutenzione                    |
| `manutenzione.assegna-tecnico`    | assegnazione tecnico                               |
| `manutenzione.chiudi`             | chiusura ticket (con creazione costo)              |
| `manutenzione.aggiorna`           | modifica note/data intervento                      |
| `costo.crea`                      | inserimento costo diretto su struttura             |
| `permesso.concedi`                | concessione di un'area a un utente                 |
| `permesso.revoca`                 | revoca di un'autorizzazione                        |
| `prestazione.crea`                | nuova prestazione occasionale                      |
| `prestazione.genera-documenti`    | generazione contratto/GDPR/riservatezza            |
| `prestazione.notula-inviata`      | invio notula al prestatore                         |
| `prestazione.notula-caricata`     | upload notula firmata (dal prestatore, via token)  |
| `prestazione.chiudi`              | chiusura pratica                                   |
| `software.crea` / `.aggiorna` / `.elimina` | archivio abbonamenti software             |
| `software.carica-fattura`         | upload fattura di un software                      |
| `ru.<entità>.crea` / `.aggiorna` / `.elimina` | dipendenti/collaboratori/tirocini      |
| `ru.dipendente.documento-carica` / `.documento-elimina` | documenti cartella personale |
| `ru.dipendente.cartella-crea`     | creazione cartella personale                       |

> Le **timbrature** sono volutamente escluse dal log (troppo frequenti:
> inserimenti giornalieri di molti operatori). Il log resta di taglio
> amministrativo.
