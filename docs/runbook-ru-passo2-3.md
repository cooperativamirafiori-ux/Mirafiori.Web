# Runbook — Passo 2 (permessi Entra) e Passo 3 (sito RisorseUmane)

Riferimento: `piano-ru-sito-dedicato-accesso-delegato.md`, punti 4 e 3.
Tutto da terminale. Valori del tenant già compilati.

| Valore | |
|---|---|
| Tenant id | `9758581d-e1a8-4a08-90c9-d2f5e3b16ea5` |
| App registration | `8ee54c61-2475-4069-bd6e-a8fccfc7b292` ("App Mirafiori") |
| Host SharePoint | `coopmirafiorionlus.sharepoint.com` |
| Admin center | `https://coopmirafiorionlus-admin.sharepoint.com` |
| Sito RU | `https://coopmirafiorionlus.sharepoint.com/sites/RisorseUmane` ✅ **già creato** |
| Raccolta documenti | `Documenti condivisi` (la predefinita del sito) |
| Cartella radice RU | `Documenti condivisi/Risorse Umane App` ✅ **già creata** |
| `SP_RU_FOLDER` | `Risorse Umane App/Dipendenti` *(la sottocartella `Dipendenti` la crea l'app da sola al primo accesso)* |

Serve un account con ruolo **Application Administrator** (o Global Admin) per il passo 2 e
**SharePoint Administrator** per il passo 3.

---

## 0. Prerequisiti (una tantum)

```bash
# macOS — Azure CLI
brew install azure-cli
```

```bash
# PowerShell 7 + PnP.PowerShell
brew install --cask powershell
pwsh -Command 'Install-Module PnP.PowerShell -Scope CurrentUser -Force -AllowClobber'
```

PnP.PowerShell non ha più una app registration propria: ogni `Connect-PnPOnline` richiede un
`-ClientId`. **Già fatto il 30/07/2026** — app `PnP-Mirafiori-Admin`, client id
**`e44f7f37-6406-401a-b6da-ea604568d7f4`**, con consenso amministratore su
`Sites.FullControl.All` (Graph) e `AllSites.FullControl` (SharePoint).

```bash
export PNP_CLIENT_ID="e44f7f37-6406-401a-b6da-ea604568d7f4"
```

Se un giorno andasse rifatta (nel modulo PnP 3.x non esiste `-Interactive` su questo cmdlet,
e i parametri dei permessi sono array di stringhe, non enum):

```bash
pwsh -Command 'Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP-Mirafiori-Admin" -Tenant "coopmirafiorionlus.onmicrosoft.com" -SharePointDelegatePermissions "AllSites.FullControl" -GraphDelegatePermissions "Sites.FullControl.All"'
```

Il cmdlet crea l'app ma **non sempre** completa il consenso. Verificarlo e, se manca, darlo
con `az`:

```bash
PNP_APP=<client-id>
az ad sp show --id $PNP_APP --query id -o tsv || az ad sp create --id $PNP_APP
az ad app permission admin-consent --id $PNP_APP   # ritentare dopo 30s se dà Request_ResourceNotFound
```

**Perché un'app separata.** `AllSites.FullControl` e `Sites.FullControl.All` sono permessi
molto ampi, ma stanno su un'app che funziona **solo in modo interattivo**, con un
amministratore che si autentica di persona: nessun segreto o certificato sui server, nessun
codice di produzione la usa. App Mirafiori conserva i suoi tre soli delegati.

---

## 1. Passo 2 — Permessi delegati in Entra

```bash
az login --tenant 9758581d-e1a8-4a08-90c9-d2f5e3b16ea5 --allow-no-subscriptions
```

Gli id dei permessi non vanno indovinati: si leggono dal service principal di Graph.

```bash
APP_ID=8ee54c61-2475-4069-bd6e-a8fccfc7b292
GRAPH=00000003-0000-0000-c000-000000000000

SITES_SELECTED=$(az ad sp show --id $GRAPH \
  --query "oauth2PermissionScopes[?value=='Sites.Selected'].id | [0]" -o tsv)
OFFLINE=$(az ad sp show --id $GRAPH \
  --query "oauth2PermissionScopes[?value=='offline_access'].id | [0]" -o tsv)

echo "Sites.Selected (delegato) = $SITES_SELECTED"
echo "offline_access (delegato) = $OFFLINE"
```

Entrambe le variabili devono essere valorizzate. Poi:

```bash
az ad app permission add --id $APP_ID --api $GRAPH \
  --api-permissions "$SITES_SELECTED=Scope" "$OFFLINE=Scope"

# consenso amministratore (necessario: senza questo il login chiederebbe il consenso
# a ogni utente, e per Sites.Selected non è concedibile dall'utente)
az ad app permission admin-consent --id $APP_ID
```

`admin-consent` può rispondere con un errore di propagazione se lanciato subito dopo
`permission add`: attendere ~30 secondi e ripetere.

### Verifica

```bash
az ad app permission list --id $APP_ID -o json | \
  python3 -c 'import json,sys; [print(p["type"], p["id"]) for r in json.load(sys.stdin) for p in r["resourceAccess"]]'
```

Devono comparire due righe `Scope` con gli id di `Sites.Selected` e `offline_access`
(oltre a quelle di `openid/profile/email` e alla riga `Role` di `Sites.ReadWrite.All`,
che resta invariata).

Consenso effettivamente registrato:

```bash
SP_OBJ=$(az ad sp show --id $APP_ID --query id -o tsv)
az rest --method get \
  --url "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_OBJ/oauth2PermissionGrants" \
  --query "[].scope" -o tsv
```

Nella stringa restituita devono comparire `Sites.Selected` e `offline_access`.

> Lo scope lato applicazione è già aggiornato in `lib/auth.ts`. Dopo questo passo il
> **primo login va rifatto** (logout e login): il refresh token nasce solo da un consenso
> che include `offline_access`.

### 1.1 Igiene degli altri scope delegati

Controllare che `Sites.Selected` sia l'**unico** delegato SharePoint consentito: Entra può
mettere nel token tutti gli scope consentiti per la risorsa, non solo quelli richiesti, e un
delegato più ampio vanificherebbe la limitazione.

```bash
az rest --method get \
  --url "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_OBJ/oauth2PermissionGrants" \
  --query "value[].scope" -o tsv
```

Deve dare esattamente `User.Read Sites.Selected offline_access`.

Se comparisse un altro `Sites.*` delegato non usato, si rimuove così (esempio con
`Sites.Manage.All`; l'id del grant si legge dal comando sopra togliendo `--query`):

```bash
GRANT_ID="<id del grant>"
az rest --method patch \
  --url "https://graph.microsoft.com/v1.0/oauth2PermissionGrants/$GRANT_ID" \
  --headers "Content-Type=application/json" \
  --body '{"scope":"User.Read Sites.Selected offline_access"}'

DA_TOGLIERE=$(az ad sp show --id $GRAPH \
  --query "oauth2PermissionScopes[?value=='Sites.Manage.All'].id | [0]" -o tsv)
az ad app permission delete --id $APP_ID --api $GRAPH --api-permissions $DA_TOGLIERE
```

Prima si revoca il consenso (PATCH), poi si toglie il permesso: nell'ordine inverso, se il
PATCH fallisse, resterebbe un consenso attivo senza traccia nella registrazione.

**Fatto il 30/07/2026**: rimosso il delegato `Sites.Manage.All` che era presente e non usato.

---

## 2. Passo 3 — Sito, gruppo, permessi, versioning

### 2.1 Modello di accesso — gruppo Microsoft 365 (rivisto il 30/07/2026)

**Il sito non è un communication site.** È `GROUP#0`: un Team site con gruppo Microsoft 365
collegato (`82c6267d-1e45-4b57-b0dc-3772d1f32a4b`, posta
`gruppo_risorseumane@cooperativamirafiori.com`, **Teams attivo**, visibilità `Private`,
creato il 29/09/2025). Il canale General ha già contenuti: **il sito non si può ricreare**.

Il piano prevedeva un gruppo di sicurezza `RU-Gestione` da mettere nei Membri del sito. È
stato creato e poi **eliminato**: i suoi 13 membri coincidevano esattamente con quelli del
gruppo M365, quindi erano due liste con le stesse persone, di cui una modificabile da Teams e
l'altra solo da riga di comando. Decisione di Dennis: **un solo meccanismo**, il gruppo M365.

```
Chi accede ai dati RU  =  membri del gruppo M365 "Risorse Umane"
```

**Contropartita, da comunicare al proprietario del gruppo** (Stefano Martino, unico
proprietario, quindi l'unico che può aggiungere persone): aggiungere qualcuno al Teams
Risorse Umane significa dargli accesso alle anagrafiche complete di ~275 dipendenti — IBAN,
Legge 104, stato di famiglia, documenti personali. È un'autorizzazione al trattamento di dati
personali, non un gesto di collaborazione. Va riportato nell'informativa art. 4 co. 3
(passo 6 del piano).

**Alternativa scartata, da riprendere se la composizione del Teams si allarga**: interrompere
l'ereditarietà dei permessi sulle due liste e sulla cartella `Risorse Umane App`, concedendo
l'accesso a un gruppo più ristretto. Tecnicamente supportato e già in uso su questo sito
(`Limited Access System Group For List ...` indica liste con permessi propri). Da fare al
livello di lista/cartella, **non** per singolo record: su 275 righe diventa ingestibile e
complica la scrittura da parte dell'app.

**Stato accertato dei gruppi SharePoint del sito** (30/07/2026, tutto corretto):

| Gruppo | Contenuto |
|---|---|
| Proprietari di Risorse Umane | account di sistema + proprietari del gruppo M365 |
| Membri di Risorse Umane | **solo** il gruppo M365 — nessuna persona aggiunta a mano |
| Visitatori di Risorse Umane | vuoto — nessun "Tutti tranne gli utenti esterni" |

Chi è amministratore della raccolta siti o proprietario del gruppo vede tutto comunque, a
prescindere dai permessi: tenere corte entrambe le liste.

---

## 2.1-bis Gestire chi accede ai dati RU

Un solo posto: i **membri del gruppo M365 "Risorse Umane"**. Si può fare da Teams (Gestisci
team → Membri) oppure da terminale, che è più tracciabile.

```bash
az login --tenant 9758581d-e1a8-4a08-90c9-d2f5e3b16ea5 --allow-no-subscriptions
GRP=82c6267d-1e45-4b57-b0dc-3772d1f32a4b
```

### Elencare membri e proprietari

```bash
echo "=== PROPRIETARI (vedono tutto comunque) ==="
az rest --method get \
  --url "https://graph.microsoft.com/v1.0/groups/$GRP/owners?\$select=displayName,userPrincipalName" \
  --query "value[].{nome:displayName, email:userPrincipalName}" -o table

echo "=== MEMBRI ==="
az rest --method get \
  --url "https://graph.microsoft.com/v1.0/groups/$GRP/members?\$select=displayName,userPrincipalName" \
  --query "value[].{nome:displayName, email:userPrincipalName}" -o table
```

### Aggiungere una persona

⚠️ Aggiungerla al gruppo la fa entrare **anche** nel Teams e nella casella condivisa, e le dà
accesso alle anagrafiche. È l'accoppiamento accettato con la decisione del §2.1.

```bash
UID=$(az ad user show --id nome.cognome@cooperativamirafiori.com --query id -o tsv)
az rest --method post \
  --url "https://graph.microsoft.com/v1.0/groups/$GRP/members/\$ref" \
  --headers "Content-Type=application/json" \
  --body "{\"@odata.id\":\"https://graph.microsoft.com/v1.0/directoryObjects/$UID\"}"
```

### Rimuovere una persona

```bash
UID=$(az ad user show --id nome.cognome@cooperativamirafiori.com --query id -o tsv)
az rest --method delete \
  --url "https://graph.microsoft.com/v1.0/groups/$GRP/members/$UID/\$ref"
```

### Tempi di propagazione — il punto che genera confusione

La modifica su Entra è immediata, SharePoint no.

| Situazione | Cosa serve |
|---|---|
| Persona **aggiunta** che prova subito | logout + login nell'app; se non basta, fino a ~1 ora |
| Persona **rimossa** con sessione aperta | l'accesso può resistere fino alla scadenza del token |
| Rimozione da rendere **immediata** | revocare le sessioni (sotto) + cancellare la sua riga da `ms_token` |

```bash
az rest --method post \
  --url "https://graph.microsoft.com/v1.0/users/nome.cognome@cooperativamirafiori.com/revokeSignInSessions"
```

### Composizione al 30/07/2026 — 13 membri, 1 proprietario

Proprietario: Stefano Martino. Membri: Sara Rossi, Giorgia Tasca, Andrea Granato,
Cinzia Mosca, Claudia Carena, Stefania Melissari, Silvia Losardo, Dennis Maseri,
Stefano Martino, `info@cooperativamirafiori.com`, Giorgia Gulli, Eleonora Dessì,
Gabriele Uscello.

Due cose da tenere presenti:

- il piano ipotizzava **3-4 persone**, sono 13. Va riflesso nell'informativa e nella
  valutazione di minimizzazione;
- **`info@cooperativamirafiori.com` è una casella condivisa**: le azioni compiute con quel
  login risultano nel log nativo come "Info Coop Mirafiori", senza indicare la persona. Su
  quelle azioni l'obiettivo di questo lavoro — sapere *chi* ha fatto cosa — non è raggiunto.

### Impostazioni di condivisione applicate al sito (30/07/2026)

Erano `ExternalUserSharingOnly` e `NotDisabled`, cioè condivisione esterna attiva e
collegamenti "tutta l'organizzazione" permessi. Corrette così:

```powershell
Connect-PnPOnline -Url $AdminUrl -Interactive -ClientId $ClientId
Set-PnPTenantSite -Identity $RuUrl -SharingCapability Disabled
Set-PnPTenantSite -Identity $RuUrl -DisableCompanyWideSharingLinks Disabled
Set-PnPTenantSite -Identity $RuUrl -DefaultSharingLinkType Direct -DefaultLinkPermission View
```

Verificato: nessun utente esterno era presente nel sito, quindi la disattivazione non ha
tolto l'accesso a nessuno.

⚠️ **Resta aperto**: i collegamenti "tutta l'organizzazione" già creati sui 5 file in
`General` continuano a funzionare — le impostazioni valgono per i nuovi. Sono file di
collaborazione del Teams, non dati del personale, ma da ripulire se si vuole chiudere il
cerchio (`Get-PnPFileSharingLink` / `Remove-PnPFileSharingLink`).

---

### 2.2 Creazione del sito — ✅ già fatta

Il sito `https://coopmirafiorionlus.sharepoint.com/sites/RisorseUmane` esiste, con la
raccolta predefinita `Documenti condivisi` e la cartella `Risorse Umane App`.

Apri una sessione PowerShell e tieni queste variabili per tutto il resto del passo 3:

```bash
pwsh
```

```powershell
$ClientId = $env:PNP_CLIENT_ID
$Tenant   = "coopmirafiorionlus"
$AdminUrl = "https://$Tenant-admin.sharepoint.com"
$RuUrl    = "https://$Tenant.sharepoint.com/sites/RisorseUmane"
$TenantId = "9758581d-e1a8-4a08-90c9-d2f5e3b16ea5"
```

Un controllo che il sito risponda e che tipo sia:

```powershell
Connect-PnPOnline -Url $RuUrl -Interactive -ClientId $ClientId
Get-PnPWeb | Select-Object Title, Url, WebTemplate
Get-PnPList | Select-Object Title, BaseTemplate, ItemCount
```

`WebTemplate` dovrebbe essere `SITEPAGEPUBLISHING` (communication site). Se invece è
`GROUP`, il sito ha un gruppo Microsoft 365 associato: non è bloccante, ma significa che
esistono anche una casella di posta e un gruppo M365 i cui membri hanno accesso al sito —
in quel caso la blindatura del §2.3 va fatta **anche** sul gruppo M365, non solo sui gruppi
SharePoint. Dimmelo e adattiamo.

### 2.3 Blindatura dei permessi — ✅ fatta il 30/07/2026

Con la decisione del §2.1 (un solo gruppo) i comandi previsti qui non servono più: non c'è
un gruppo di sicurezza da inserire nei Membri, e i Visitatori erano già vuoti. Quello che è
stato effettivamente fatto è al §2.1-bis, sezione "Impostazioni di condivisione".

Riepilogo dello stato accertato e corretto:

| Controllo | Esito |
|---|---|
| "Tutti tranne gli utenti esterni" nei gruppi del sito | assente ✓ |
| Persone aggiunte a mano ai Membri, fuori dal gruppo M365 | nessuna ✓ |
| Utenti esterni nel sito | nessuno ✓ |
| Condivisione esterna | disattivata ✓ |
| Collegamenti "tutta l'organizzazione" | disattivati per i nuovi ✓ |
| Amministratore raccolta siti | aggiunto Dennis Maseri |

Il comando per diventare amministratore della raccolta siti, che serve per interrompere
ereditarietà, dare il grant e impostare il versioning (senza, `Get-PnPGroup` risponde
*Access is denied* anche a un Global Administrator, perché a livello di sito si è solo
membri):

```powershell
Connect-PnPOnline -Url $AdminUrl -Interactive -ClientId $ClientId
Set-PnPTenantSite -Identity $RuUrl -Owners "dennis.maseri@cooperativamirafiori.com"
```

Non rende proprietari del gruppo M365 né fa entrare nel Teams: è un ruolo SharePoint.
### 2.4 Grant `Sites.Selected` sul sito — ✅ fatto il 30/07/2026

È il passaggio senza il quale Graph risponde **403 su tutto**, anche con i permessi Entra
a posto.

Esito verificato:

```
Id    : aTowaS50fG1zLnNwLmV4dHw4ZWU1NGM2MS0yNDc1LTQwNjktYmQ2ZS1hOGZjY2ZjN2IyOTJAOTc1ODU4MWQtZTFhOC00YTA4LTkwYzktZDJmNWUzYjE2ZWE1
Roles : {write}
Apps  : {App Mirafiori, 8ee54c61-2475-4069-bd6e-a8fccfc7b292}
```

```powershell
Connect-PnPOnline -Url $RuUrl -Interactive -ClientId $ClientId
$RuUrl = "https://coopmirafiorionlus.sharepoint.com/sites/RisorseUmane"

Grant-PnPAzureADAppSitePermission `
  -AppId "8ee54c61-2475-4069-bd6e-a8fccfc7b292" `
  -DisplayName "App Mirafiori" `
  -Permissions Write `
  -Site $RuUrl

# verifica
Get-PnPAzureADAppSitePermission -Site $RuUrl | Format-List
```

Deve comparire una voce con l'app id sopra e `Write`.

**Scorciatoia tentata e scartata (30/07/2026).** Si è provato a dare il grant via Graph con
Azure CLI, per evitare la registrazione dell'app PnP:

```bash
az rest --method post \
  --url "https://graph.microsoft.com/v1.0/sites/$SITE_RU/permissions" \
  --headers "Content-Type=application/json" --body @/tmp/grant-ru.json
```

La lettura del sito (`GET /sites/...`) funziona — ed è così che si è ricavato
`SP_SITE_RU=coopmirafiorionlus.sharepoint.com,8d29206d-cb03-41ad-beb7-c7e497bc52d7,8989410b-1617-4ff0-8beb-1b162eddad41` —
ma la POST risponde `403 accessDenied`: l'app first-party di Azure CLI non ha il delegato
`Sites.FullControl.All`. PnP resta quindi necessario. Il permesso ampio va comunque
introdotto, ma su un'app **separata di sola amministrazione**, usata interattivamente da un
admin: non sulla app registration di produzione, che resta con i soli
`User.Read`, `Sites.Selected`, `offline_access` in delega.

### 2.5 Versioning

La cronologia versioni è ciò che conserva i **valori precedenti** dei campi: senza, il log
nativo dice chi ha modificato ma non cosa. Le liste non esistono ancora (le provisiono io
dopo), quindi qui si imposta solo la raccolta documenti — che sul tuo sito si chiama
**`Documenti condivisi`**:

```powershell
Connect-PnPOnline -Url $RuUrl -Interactive -ClientId $ClientId

Set-PnPList -Identity "Documenti condivisi" -EnableVersioning $true -MajorVersions 500
Get-PnPList -Identity "Documenti condivisi" |
  Select-Object Title, EnableVersioning, MajorVersionLimit
```

Se `-Identity "Documenti condivisi"` desse "List does not exist", usa l'url interna, che
resta in inglese anche sui siti italiani:

```powershell
Set-PnPList -Identity "Shared Documents" -EnableVersioning $true -MajorVersions 500
```

Il versioning sulle due liste (`Dipendenti`, `Tirocini`) lo imposto io subito dopo il
provisioning, con lo stesso comando cambiando `-Identity`.

### 2.6 Cestino e retention

```powershell
Connect-PnPOnline -Url $AdminUrl -Interactive -ClientId $ClientId
Get-PnPTenantRecycleBinItem -Url $RuUrl | Measure-Object   # deve essere vuoto: sito nuovo
Get-PnPTenant | Select-Object OrphanedPersonalSitesRetentionPeriod
```

Il Cestino di SharePoint è fisso a 93 giorni e non è configurabile: nessun comando, solo
da tenere presente.

---

## 3. Consegna a Claude

Appena il grant del §2.4 è dato:

```bash
cd "/Users/dennis/Documents/Claude Codice/App Mirafiori TOT/App_Mirafiori/web"
node scripts/get-site-id.mjs https://coopmirafiorionlus.sharepoint.com/sites/RisorseUmane
```

Stampa `SP_SITE_RU` e `SP_RU_DRIVE_ID` con i comandi `vercel env add` già pronti, e verifica
di riflesso che l'identità applicativa raggiunga il sito. Aggiungi a `.env.local`:

```bash
cat >> .env.local <<'EOF'

# --- Sito SharePoint dedicato Risorse Umane (accesso delegato) ---
SP_SITE_RU=<valore stampato da get-site-id.mjs>
SP_RU_DRIVE_ID=<valore stampato da get-site-id.mjs>
SP_RU_FOLDER=Risorse Umane App/Dipendenti
EOF
```

Poi il provisioning delle liste sul nuovo sito:

```bash
node scripts/provision-risorse-umane.mjs
```

Lo script legge `SP_SITE_RU`, è idempotente, crea `Dipendenti` e `Tirocini` **vuote** con
tutte le colonne e stampa i nuovi GUID (**non** sovrascriverli su `SP_LIST_DIPENDENTI` /
`SP_LIST_TIROCINI` finché non si fa il cutover del passo 5: quelle env puntano ancora alle
liste in produzione). Incollami l'output e proseguo col passo 4.

Infine il versioning sulle due liste appena create:

```powershell
Connect-PnPOnline -Url $RuUrl -Interactive -ClientId $ClientId
foreach ($l in @("Dipendenti","Tirocini")) {
  Set-PnPList -Identity $l -EnableVersioning $true -MajorVersions 500
}
Get-PnPList | Where-Object { $_.Title -in @("Dipendenti","Tirocini") } |
  Select-Object Title, EnableVersioning, MajorVersionLimit
```

---

## 4. Se qualcosa va storto

| Sintomo | Causa probabile |
|---|---|
| `az ad app permission admin-consent` → errore di autorizzazione | l'utente non è Application/Global Administrator |
| `New-PnPSite` → "The requested operation is part of an experimental feature" | manca il ruolo SharePoint Administrator |
| `Connect-PnPOnline` → "AADSTS700016 application not found" | `-ClientId` mancante o registrazione PnP non fatta (§0) |
| Graph → 403 su `GET /sites/{ru}` | grant di sito mancante (§2.4) |
| Graph → 403 solo sulla lista, non sul sito | l'utente non è in `RU-Gestione` |
| Graph → 403 in scrittura, ok in lettura | grant dato con `-Permissions Read` invece di `Write` |
| Nessun refresh token dopo il login | login fatto prima del consenso a `offline_access`: rifare logout+login |

La scaletta di diagnosi del punto 12 del piano — token → `GET /sites/{ru}` → `GET` lista →
`PATCH` item — distingue le tre cause di un 403: il primo passo che fallisce dice quale
livello non è a posto.
