# DocuSign — setup integrazione (JWT / Service Integration)

L'app invia le buste senza un utente che fa login: serve l'autenticazione
**JWT Grant**. Questa guida elenca cosa fare nella console DocuSign e quali
valori raccogliere per le variabili d'ambiente.

> Demo vs Produzione: per i **test** usa l'account sviluppatore (demo).
> Per le firme **reali** servirà l'account di produzione. Il codice supporta
> entrambi tramite le env `DOCUSIGN_OAUTH_HOST` e `DOCUSIGN_BASE_PATH`.

---

## 1. Crea l'app (Integration Key)

1. Vai su **Settings → Integrations → Apps and Keys**
   (demo: https://admindemo.docusign.com → Apps and Keys).
2. **Add App / Integration Key** → dai un nome (es. "App Mirafiori").
3. Copia l'**Integration Key** (è il *client id*). → `DOCUSIGN_INTEGRATION_KEY`

## 2. Genera la chiave RSA

1. Nella stessa pagina dell'app, sezione **Service Integration → + Generate RSA**.
2. DocuSign mostra **chiave pubblica e privata**: copia subito la **chiave privata**
   (la mostra una sola volta). È un blocco `-----BEGIN RSA PRIVATE KEY----- … -----END…`.
   → diventerà `DOCUSIGN_PRIVATE_KEY_BASE64` (vedi punto 5).

## 3. Redirect URI (serve solo per il consenso)

1. Sempre nell'app, sezione **Additional settings → Redirect URIs → Add URI**.
2. Inserisci: `https://mirafiori-web.vercel.app/api/docusign/callback`
   (in locale puoi aggiungere anche `http://localhost:3000/api/docusign/callback`).

## 4. Recupera User ID e Account ID

1. **User ID (API Username)**: Settings → **Apps and Keys**, in alto sotto il tuo
   profilo c'è **User ID** (un GUID). → `DOCUSIGN_USER_ID`
2. **API Account ID**: stessa pagina, sezione **Account** → **API Account ID** (GUID).
   → `DOCUSIGN_ACCOUNT_ID`

## 5. Consenso una tantum (admin consent)

JWT richiede che l'utente impersonato abbia dato consenso una volta. Apri nel browser
(loggato con l'utente DocuSign), sostituendo INTEGRATION_KEY e il redirect:

**Demo:**
```
https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=INTEGRATION_KEY&redirect_uri=https://mirafiori-web.vercel.app/api/docusign/callback
```
**Produzione:** stessa URL ma host `https://account.docusign.com`.

Accetta. (Verrai rimandato al redirect con un `?code=...`: è normale, il consenso è
registrato. Non serve altro.)

---

## 6. Variabili d'ambiente

```bash
# Demo: account-d.docusign.com | Produzione: account.docusign.com
DOCUSIGN_OAUTH_HOST=account-d.docusign.com
# Demo: https://demo.docusign.net/restapi | Prod: https://<regione>.docusign.net/restapi
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi

DOCUSIGN_INTEGRATION_KEY=<Integration Key (client id)>
DOCUSIGN_USER_ID=<User ID GUID dell'utente impersonato>
DOCUSIGN_ACCOUNT_ID=<API Account ID GUID>

# Chiave privata RSA codificata in base64 (per evitare problemi con gli a-capo):
#   macOS:  base64 -i private.key | pbcopy
DOCUSIGN_PRIVATE_KEY_BASE64=<chiave privata RSA in base64>

# Email mittente/firmatario di default già presenti; il prestatore firma via email.
```

> La chiave privata si mette **in base64** per evitare problemi con gli a-capo nelle
> Environment Variables di Vercel. Salva il `.key` originale in un posto sicuro e NON
> committarlo nel repo.

---

## 7. Dopo

Quando hai questi valori impostati (in `.env.local` per i test, su Vercel per la prod),
dimmelo: collego il codice che, al clic su "Genera e invia documenti", crea la busta
DocuSign con i 3 documenti e gli anchor `\s1\` (firma) e `\d1\` (data), e la invia al
prestatore. In un secondo momento aggiungiamo il webhook (DocuSign Connect) per
riportare i documenti firmati in SharePoint e segnare lo stato "Contratto firmato".
