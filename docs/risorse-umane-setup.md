# Risorse Umane — setup e migrazione dati

Sezione dell'app per consultare e gestire **Dipendenti** (che include anche i
**Collaboratori**, distinti dal campo `CategoriaRU`: "Dipendente" / "Collaboratore")
e **Tirocini**, con dati su SharePoint Lists e, per ogni dipendente, una
**cartella personale** nella document library del sito per caricare documenti.

> Storico: fino al 2026-07 i Collaboratori avevano una lista SharePoint
> separata (`SP_LIST_COLLABORATORI`). È stata unificata nella lista Dipendenti
> con `scripts/migrate-unifica-collaboratori-2026-07.mjs` e la vecchia lista è
> stata poi eliminata con `scripts/elimina-lista-collaboratori.mjs` (backup
> JSON in `scripts/ru-data/collaboratori-backup-*.json`).

Accesso: chiunque abbia il permesso d'area **"Risorse Umane"** (lista Autorizzazioni)
può consultare, inserire e modificare.

## 1. Creare le liste SharePoint (una tantum)

Dalla cartella `web/`:

```bash
node scripts/provision-risorse-umane.mjs
```

Crea le liste **Dipendenti** (include i Collaboratori) e **Tirocini** con tutte le colonne.
È idempotente: se le liste esistono aggiunge solo le colonne mancanti.
Al termine stampa 2 GUID da incollare in `.env.local` e nelle Environment Variables di Vercel:

```
SP_LIST_DIPENDENTI=...
SP_LIST_TIROCINI=...
```

## 2. Importare i dati dal database Access (una tantum)

I dati sono già stati estratti dal file Access in JSON, nella cartella
`web/scripts/ru-data/` (è in `.gitignore` perché contiene dati personali):

- `dipendenti.json` — 242 record
- `collaboratori.json` — 14 record (storico: importati poi nella lista Dipendenti,
  vedi nota in cima al file)
- `tirocini.json` — 19 record

Dopo aver impostato i GUID in `.env.local`, importa:

```bash
node scripts/import-risorse-umane.mjs              # tutte le liste configurate
node scripts/import-risorse-umane.mjs dipendenti   # solo una
```

È **idempotente**: salta i record il cui `IdAccess` è già presente, quindi puoi
rilanciarlo senza creare duplicati.

Per rigenerare i JSON dal `.accdb` (richiede Python + `pip install access-parser`):

```bash
python3 scripts/extract-da-accdb.py "PERCORSO/DEL/FILE.accdb" scripts/ru-data
```

## 3. Cartella personale del dipendente

Dalla scheda di un dipendente si può creare (al primo accesso) la sua cartella in
`Risorse Umane/Dipendenti/<Cognome Nome - Matricola>` della document library, aprirla
su SharePoint e caricare/eliminare documenti (max 50 MB per file dall'app).
Percorso e drive sono configurabili con `SP_RU_FOLDER` e `SP_RU_DRIVE_ID` (opzionali).

**I caricamenti vanno diretti dal browser a SharePoint** (dal 31/07/2026). La route
`POST .../documenti` non riceve il file: apre una sessione di upload e restituisce un URL
pre-autorizzato, il browser invia i byte a blocchi da 5 MiB, e a fine caricamento chiama
`.../documenti/conferma` che registra l'azione nel log e rinfresca l'elenco. Tre conseguenze:
il file non transita più dalla memoria di una funzione serverless, cade il vecchio limite di
4 MB (che era la somma dell'upload semplice di Graph e del corpo massimo accettato da Vercel),
e il caricamento non può più superare il tempo massimo di una funzione su connessioni lente.

`caricaDocumentoDipendente` resta per i caricamenti che partono dal **server** — oggi solo il
foglio ore alla chiusura mensile, che non ha un browser davanti.

## Note sui dati importati

- **Valuta** (quota sociale, capitale, indennità): nel file Access era in formato
  "money" (intero ×10000); è stata convertita in euro (es. `10332000` → `1.033,20 €`).
- **Campi liberi** come Qualifica e "Stato di servizio / note" sono testo (valori
  molto eterogenei nel file originale).
- ⚠ Nel database Access i campi **FONDO COOPERSALUTE** e **STATO DI SERVIZIO**
  risultavano invertiti/mal compilati (il fondo conteneva "In servizio"/"Dimesso").
  I dati sono stati migrati **così com'erano** per non perderli: sono da ripulire.

## Aggiungere un campo in futuro

1. Aggiungi il campo in `types/risorse-umane.ts` (allo schema dell'entità).
2. Aggiungi la colonna con lo **stesso `name`** in `scripts/provision-risorse-umane.mjs`.
3. Rilancia `node scripts/provision-risorse-umane.mjs`.

Nient'altro: lib, API e form si adattano automaticamente dallo schema.
