# Prestazioni · lettura automatica dei documenti d'identità (ott 2026)

Nel modulo **Nuova prestazione**, per un prestatore nuovo, i documenti d'identità si caricano
**in cima, sotto la ricerca**. Claude li legge e compila nome, cognome, data e luogo di nascita,
codice fiscale e residenza. Email, telefono, IBAN, ruolo e dati della prestazione restano a mano.

## Percorso dei file

1. Browser → SharePoint, caricamento diretto a blocchi (come gli altri upload, i byte non passano
   da Vercel) nella cartella d'appoggio `Prestazioni Occasionali/_In arrivo/{lotto}`.
   `POST /api/prestazioni/in-arrivo` apre la sessione; il lotto è un UUID generato dal server.
2. `POST /api/prestazioni/in-arrivo/leggi`: il server scarica i file da SharePoint e li manda a
   Claude (`lib/prestazioni/lettura-documenti.ts`). Foto troppo pesanti o HEIC/TIFF passano dalla
   miniatura JPEG di SharePoint. Non salva niente: i dati tornano solo al modulo.
3. Il modulo compila **solo i campi vuoti**, li segna "✨ Letto dai documenti" e mostra gli avvisi:
   dati incerti, codice fiscale che non torna con nome/cognome/data (`codice-fiscale.ts`),
   documento scaduto, valori diversi da quelli già scritti.
4. **Salva** (`POST /api/prestazioni` con `lottoDocumenti`): i file vengono **spostati** in
   `{Cognome_Nome_CF}/Documenti Identità` (come da giugno) **prima** di creare il record, e il lotto
   si cancella. Basta anche **un file solo** con carta d'identità e codice fiscale.
5. Lotti mai salvati: il cron giornaliero `promemoria-ore` li cancella dopo **7 giorni**.

Per il prestatore già in archivio non cambia niente: "documenti già in archivio" e aggiornamento
facoltativo restano come prima.

## Attivazione

```
bash scripts/anthropic-chiave.sh
node scripts/prova-anthropic.mjs
```

Env: `ANTHROPIC_API_KEY` (obbligatoria; senza, il riquadro carica comunque i file e la lettura
risponde "non attiva"), `ANTHROPIC_MODEL` (facoltativa, default in `lettura-documenti.ts`).
⚠️ La chiave va creata **dentro un workspace** (Console → Workspaces → il workspace → API keys):
una chiave d'organizzazione risponde 400 "not scoped to a workspace". In alternativa si imposta
`ANTHROPIC_WORKSPACE_ID` (`wrkspc_…`) e l'app manda l'header `anthropic-workspace-id`.

## Privacy

- Nel Log Attività (`prestazione.lettura-documenti`) finiscono solo numero di file, modello e token:
  mai i dati letti. Nei log del server mai il corpo della richiesta.
- Anthropic tratta i documenti come responsabile esterno: da riportare nel registro dei
  trattamenti e, se serve, nell'informativa al fornitore (INF05).
- Costo indicativo: 1–2 centesimi per lettura.
