# Prestazioni Occasionali — setup SharePoint

Guida per provisionare la lista e la cartella documentale necessarie alla sezione
**Prestazioni Occasionali**. Da fare una sola volta, poi si copiano i valori nelle
variabili d'ambiente (locale `.env.local` e su Vercel).

---

## 1. Crea la lista "Prestazioni Occasionali"

Sito SharePoint della cooperativa → **Nuovo → Elenco → Elenco vuoto** → nome
`Prestazioni Occasionali`.

La colonna **Title** (già presente) verrà usata per l'ID pratica `PREST-2026-001`.

Aggiungi queste colonne. **Il nome interno deve coincidere con quello qui sotto**
(in SharePoint il nome interno è quello senza spazi che vedi nell'URL della colonna;
crea le colonne con esattamente questi nomi per evitare disallineamenti).

| Nome colonna | Tipo | Note |
|---|---|---|
| `Nome` | Testo singola riga | |
| `Cognome` | Testo singola riga | |
| `DataNascita` | Data e ora (solo data) | |
| `CodiceFiscale` | Testo singola riga | |
| `Residenza` | Testo più righe (o singola) | |
| `Email` | Testo singola riga | |
| `Telefono` | Testo singola riga | |
| `Giorni` | Numero (interi) | n. giorni di prestazione |
| `DataInizio` | Data e ora (solo data) | |
| `DataFine` | Data e ora (solo data) | |
| `Attivita` | Testo più righe | attività oggetto |
| `Stato` | Scelta | valori sotto |
| `ResponsabileEmail` | Testo singola riga | email di chi attiva (da login) |
| `ResponsabileNome` | Testo singola riga | |
| `CartellaUrl` | Testo singola riga (o Collegamento) | URL cartella SharePoint |
| `ImportoLordo` | Numero (valuta) | compilato a fine prestazione |
| `DataInserimento` | Data e ora | |

**Valori della colonna `Stato`** (scelta singola), nell'ordine del ciclo di vita:

```
Bozza
Contratto inviato
Contratto firmato
In corso
Importo inserito
Notula inviata
Notula ricevuta
Chiusa
```

> Nota: le colonne *Data* possono essere salvate come ISO datetime dall'app; va bene.
> `CodiceFiscale` viene salvato in maiuscolo.

---

## 2. Cartella documentale

I file (copia CF, carta d'identità, contratti firmati, notula) vengono salvati nella
**document library del sito**. La struttura creata in automatico è:

```
{ROOT}/{Cognome_Nome_CodiceFiscale}/Prestazione_{AAAA-MM-GG}/
```

dove `{ROOT}` è una cartella radice configurabile (default: `Prestazioni Occasionali`).

Per default l'app usa la **libreria documenti predefinita** del sito (quella di
`/sites/{site}/drive`). Non serve fare nulla: la cartella radice viene creata al primo
salvataggio. Se vuoi usare una libreria diversa, valorizza `SP_PRESTAZIONI_DRIVE_ID`
(vedi sotto come ricavarlo).

---

## 3. Recupera i GUID per le variabili d'ambiente

Servono l'ID della lista e (opzionale) l'ID del drive.

### ID lista (`SP_LIST_PRESTAZIONI`)

Con un token Graph valido (stessa app già usata da Manutenzioni):

```
GET https://graph.microsoft.com/v1.0/sites/{SHAREPOINT_SITE_ID}/lists?$select=id,name,displayName
```

Trova la riga con `displayName = "Prestazioni Occasionali"` e copia il campo `id`.

### ID drive (opzionale — `SP_PRESTAZIONI_DRIVE_ID`)

Solo se NON vuoi usare la libreria predefinita:

```
GET https://graph.microsoft.com/v1.0/sites/{SHAREPOINT_SITE_ID}/drives?$select=id,name
```

---

## 4. Variabili d'ambiente da aggiungere

Aggiungi a `.env.local` (sviluppo) e nelle **Environment Variables del progetto su Vercel**
(produzione):

```bash
# Lista Prestazioni Occasionali (GUID dal passo 3)
SP_LIST_PRESTAZIONI=00000000-0000-0000-0000-000000000000

# Cartella radice nella document library (opzionale, default: "Prestazioni Occasionali")
SP_PRESTAZIONI_FOLDER_PATH=Prestazioni Occasionali

# Drive/libreria documentale (opzionale: se assente usa il drive predefinito del sito)
# SP_PRESTAZIONI_DRIVE_ID=...

# Destinatari mail di riepilogo (opzionale: default info@ + Claudia)
# PRESTAZIONI_MAIL_TO=info@cooperativamirafiori.com,claudia.carena@cooperativamirafiori.com
```

> I permessi Graph dell'app esistente (`Sites.ReadWrite.All`, `Mail.Send`) sono già
> sufficienti: coprono sia la scrittura su lista/cartelle sia l'invio della mail di riepilogo.

---

## 5. Verifica

1. Apri l'app → **Prestazioni Occasionali → Inserisci nuova prestazione**.
2. Compila e allega CF + carta d'identità (ognuno < 4 MB), poi **Salva**.
3. Controlla che:
   - compaia l'ID `PREST-AAAA-XXX` nel messaggio di conferma;
   - in SharePoint esista `{ROOT}/{Cognome_Nome_CF}/Prestazione_{data}/` con i due allegati;
   - arrivi la mail di riepilogo a `info@` e `claudia.carena@`;
   - la prestazione compaia in **Vedi prestazioni attive** con stato *Bozza*.

---

## Ancora da implementare (fasi successive)

- **Anagrafica prestatori**: lista dedicata + selezione nel form per non reinserire i dati.
- **DocuSign**: generazione contratto + privacy + riservatezza + foglio ore e invio firma.
- **Fase chiusura**: importo lordo → notula PDF precompilata → upload firmato → distribuzione mail.
- **Promemoria automatico** foglio ore 3 giorni prima della data fine.
