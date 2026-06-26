# Prestazioni Occasionali — Fase 2 (anagrafica, chiusura/notula, promemoria)

Cosa va fatto perché i tre nuovi flussi funzionino in locale e in produzione.

---

## 1. Nuove colonne SharePoint (ri-esegui lo script)

Sono state aggiunte 3 colonne alla lista "Prestazioni Occasionali":
`NotulaToken`, `NotulaUrl`, `PromemoriaOreInviato` (Sì/No).

Lo script di provisioning ora è **idempotente**: aggiunge solo le colonne mancanti.
Dalla cartella `web/`:

```
node scripts/provision-prestazioni.mjs
```

Deve stampare `+ colonna aggiunta: NotulaToken`, ecc.

---

## 2. Modello notula (`Notula_TEMPLATE.docx`) — GIÀ CREATO

Il template è stato generato dal tuo fac-simile e si trova in:

```
web/lib/templates/prestazione-occasionale/Notula_TEMPLATE.docx
```

Non devi fare nulla, è già pronto e testato. Per riferimento, i **segnaposto** usati sono:

| Segnaposto | Contenuto |
|---|---|
| `{id_prestazione}` | Es. PREST-2026-001 |
| `{cognome_nome}` | COGNOME NOME (maiuscolo) |
| `{codice_fiscale}` | Codice fiscale |
| `{residenza}` | Residenza |
| `{data_oggi}` | Data emissione (gg/mm/aaaa) |
| `{causale}` | Attività oggetto della prestazione |
| `{periodo}` | "gg/mm/aaaa – gg/mm/aaaa" |
| `{compenso_lordo}` | Es. 300,00 |
| `{ritenuta}` | Ritenuta d'acconto 20% (es. 60,00) |
| `{netto}` | Netto a pagare (es. 240,00) |
| `{marca_bollo}` | 2,00 se lordo > 77,47 €, altrimenti 0,00 (non usato nel fac-simile attuale) |
| `{luogo_data_nascita}` | "Torino (TO), gg/mm/aaaa" |
| `{giorni}` | Numero giorni della prestazione |

> Il calcolo (ritenuta 20%, netto, bollo) è fatto dall'app: nel template servono
> solo i segnaposto. Il fac-simile fornito non riporta la marca da bollo, quindi
> il template attuale non la include (il calcolo resta disponibile se servisse).

---

## 3. Variabili d'ambiente (in `.env.local` e su Vercel)

```bash
# URL pubblico dell'app — usato nel link "Carica notula" inviato al prestatore
APP_BASE_URL=https://mirafiori-web.vercel.app   # in locale: http://localhost:3000

# Segreto del cron promemoria foglio ore
CRON_SECRET=<stringa casuale>
```

In locale sono già impostate. **Su Vercel** vanno aggiunte a mano (Project → Settings → Environment Variables).

---

## 4. Cron promemoria foglio ore

`vercel.json` schedula `GET /api/cron/promemoria-ore` ogni giorno alle 07:00 UTC.
Vercel allega in automatico `Authorization: Bearer <CRON_SECRET>`; la route invia
la mail "invia il foglio ore" ai prestatori la cui `DataFine` cade entro 3 giorni,
una sola volta (flag `PromemoriaOreInviato`).

Per provarlo in locale:

```
curl -H "Authorization: Bearer dev-cron-secret-mirafiori" http://localhost:3000/api/cron/promemoria-ore
```

---

## Riepilogo flussi aggiunti

- **Anagrafica prestatori**: nel form "Nuova prestazione" c'è la ricerca per
  cognome/CF che auto-compila i dati di un prestatore già inserito. L'anagrafica
  è ricavata automaticamente dalle prestazioni esistenti (nessuna lista separata).
- **Chiusura / notula**: nella pagina "Prestazioni attive", per ogni pratica il
  pulsante "Importo lordo & notula" genera la notula precompilata, la salva in
  cartella e la invia al prestatore con il link pubblico per ricaricarla firmata.
  Al caricamento → mail a info@, Claudia e responsabile (stato "Notula ricevuta").
- **Promemoria foglio ore**: cron giornaliero, vedi sopra.
