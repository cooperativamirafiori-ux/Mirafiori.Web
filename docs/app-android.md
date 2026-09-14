# App Android — Mirafiori Web

Una app Android che apre il gestionale. Non è un secondo prodotto da mantenere: è un
**guscio** attorno a `https://mirafiori-web.vercel.app`. Chi la installa vede l'icona sul
telefono, la apre e si ritrova nell'app senza barra dell'indirizzo, senza schede, senza
sembrare "un sito". Il codice dell'app resta uno solo: quello di `web/`.

## Come è fatta — e perché così

È una **TWA** (Trusted Web Activity): l'app Android non contiene una copia del sito, chiede
a Chrome (già installato su ogni Android) di disegnare le pagine a schermo intero. Le tre
alternative scartate:

| Strada | Perché no |
|---|---|
| WebView dentro un'app scritta a mano | motore di rendering vecchio, i cookie sono suoi e il login Microsoft ci litiga; Google Play rifiuta i "siti impacchettati" |
| Capacitor / Cordova | stesso problema del WebView, più un intero progetto da manutenere |
| Solo "Aggiungi a schermata Home" | funziona, ma non è un'app: niente icona nello store del telefono, niente installazione via link, e su Android va spiegato passo passo a ogni dipendente |

Con la TWA invece: motore Chrome aggiornato dal telefono, **la sessione è la stessa di
Chrome** (quindi il login Entra ID funziona senza trucchi), e il giorno in cui serve
pubblicarla sul Play Store si carica lo stesso progetto senza riscrivere niente.

**Il login Microsoft esce dall'app per un istante.** `login.microsoftonline.com` non è un
nostro dominio, quindi durante l'autenticazione Chrome mostra la barra dell'indirizzo:
è voluto e va bene così — l'utente vede che sta scrivendo la password *a Microsoft*.
Tornato su `mirafiori-web.vercel.app` la barra sparisce.

## I due pezzi che devono combaciare

La barra dell'indirizzo sparisce solo se il telefono verifica che **quell'app** e **quel
dominio** sono la stessa organizzazione. Il controllo è incrociato:

1. l'APK è firmato con una chiave, che ha un'impronta SHA-256;
2. il sito pubblica quell'impronta su `/.well-known/assetlinks.json`.

Se i due non coincidono l'app funziona lo stesso, ma con la barra dell'indirizzo in cima —
il sintomo tipico di assetlinks sbagliato o non ancora in produzione.

File coinvolti:

| File | Cosa contiene |
|---|---|
| `app/manifest.ts` | nome, icone, colori, `start_url`. **È la fonte**: Bubblewrap legge questo |
| `public/icona-*.png` | icone 192/512 + maskable, generate dal logo (solo il lettering: a 48px il logo intero è illeggibile) |
| `public/.well-known/assetlinks.json` | l'impronta della chiave di firma |
| `android-twa/twa-manifest.json` | la configurazione dell'app Android. Il resto del progetto Android si rigenera, non si versiona |
| `.vercelignore` | tiene `android-twa/` fuori dal deploy |

Il middleware non va toccato: `/manifest.webmanifest` e `/.well-known/assetlinks.json`
hanno un punto nel nome e la regola `.*\..*` in `middleware.ts` li lascia già passare.

## Rifare l'APK (aggiornamento di versione)

Il contenuto dell'app si aggiorna **da solo** a ogni deploy su Vercel: è il sito.
Si ricostruisce l'APK solo se cambiano nome, icone, colori o dominio.

```bash
cd ~/'Documents/Claude Codice/App Mirafiori TOT/App_Mirafiori/web/android-twa'
```

Alzare `appVersionCode` (+1) e `appVersionName` in `twa-manifest.json`, poi:

```bash
export BUBBLEWRAP_KEYSTORE_PASSWORD='...' && export BUBBLEWRAP_KEY_PASSWORD='...' && bubblewrap update && bubblewrap build --skipPwaValidation
```

L'APK firmato esce in `android-twa/app-release-signed.apk`.

## Trappole già pagate

- **La chiave di firma non si perde e non si rigenera.** Un APK firmato con una chiave
  diversa Android lo considera un'altra app: non si aggiorna, va disinstallato e
  reinstallato (e il giorno del Play Store sarebbe un problema serio). Sta in
  `~/.android-keys/mirafiori-web.keystore`, fuori dal repo, e va nel backup.
- **`assetlinks.json` deve essere in produzione *prima* di installare l'APK**: Chrome se
  lo ricorda per un po', e chi installa prima del deploy continua a vedere la barra
  dell'indirizzo finché non svuota i dati di Chrome.
- **`start_url` è `/home`, non `/`.** `/` fa un redirect, e un redirect in apertura fa
  lampeggiare lo splash.
- **Niente notifiche push** (`enableNotifications: false`): le richiederebbe Chrome, non
  l'app, e servirebbe un service worker. Gli avvisi continuano ad arrivare per mail.
