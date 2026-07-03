# Risorse Umane — setup e migrazione dati

Sezione dell'app per consultare e gestire **Dipendenti**, **Collaboratori** e **Tirocini**,
con dati su SharePoint Lists (una lista per entità) e, per ogni dipendente, una
**cartella personale** nella document library del sito per caricare documenti.

Accesso: chiunque abbia il permesso d'area **"Risorse Umane"** (lista Autorizzazioni)
può consultare, inserire e modificare.

## 1. Creare le liste SharePoint (una tantum)

Dalla cartella `web/`:

```bash
node scripts/provision-risorse-umane.mjs
```

Crea le liste **Dipendenti**, **Collaboratori**, **Tirocini** con tutte le colonne.
È idempotente: se le liste esistono aggiunge solo le colonne mancanti.
Al termine stampa 3 GUID da incollare in `.env.local` e nelle Environment Variables di Vercel:

```
SP_LIST_DIPENDENTI=...
SP_LIST_COLLABORATORI=...
SP_LIST_TIROCINI=...
```

## 2. Importare i dati dal database Access (una tantum)

I dati sono già stati estratti dal file Access in JSON, nella cartella
`web/scripts/ru-data/` (è in `.gitignore` perché contiene dati personali):

- `dipendenti.json` — 242 record
- `collaboratori.json` — 14 record
- `tirocini.json` — 19 record

Dopo aver impostato i 3 GUID in `.env.local`, importa:

```bash
node scripts/import-risorse-umane.mjs              # tutte e tre le liste
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
su SharePoint e caricare/eliminare documenti (max 4 MB per file dall'app).
Percorso e drive sono configurabili con `SP_RU_FOLDER` e `SP_RU_DRIVE_ID` (opzionali).

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
