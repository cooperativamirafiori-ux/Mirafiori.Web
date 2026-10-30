# Guida d'uso di Mirafiori Web

Questa cartella contiene la **guida per chi usa l'app**: dipendenti, responsabili,
amministrazione. Non è documentazione tecnica, quella sta in `docs/`.

Ha due lettori:

1. **le persone**, che possono leggerla o stamparla;
2. **l'assistente dell'app** (il bottone "?"), che risponde alle domande usando solo
   quello che c'è scritto qui. Se una cosa non è nella guida, l'assistente non la sa.

> **Regola:** chi cambia una schermata aggiorna anche la sua guida, nello stesso commit.
> Una guida vecchia fa dare all'assistente risposte sbagliate con sicurezza.
> Controllo automatico: `node scripts/controlla-guida.mjs`.

---

## Un file per area

Un file `.md` per ogni area dell'app (`timbrature.md`, `manutenzioni.md`, …), più
`generale.md` per le cose comuni a tutta l'app (entrare, la Home, i permessi).

## La scheda in testa al file

Ogni guida comincia con una scheda fissa. Da qui l'assistente prende **i link** e capisce
**se la persona può entrare**: non li ricava dal testo e non li inventa.

```yaml
---
area: Manutenzioni
descrizione: Segnalare un guasto in una struttura e seguire l'intervento.
pagine:
  - percorso: /manutenzioni
    titolo: Manutenzioni
    accesso: [permesso:Manutenzioni, admin]
    cosa: Punto di partenza, con i tasti per nuova richiesta e le mie richieste.
  - percorso: /dashboard
    titolo: Pannello di controllo
    accesso: [admin]
    cosa: Tutte le richieste aperte, con assegnazione del tecnico e chiusura.
---
```

- **percorso**: l'indirizzo della pagina, esattamente come nell'app. Un percorso con
  `[…]` (es. `/preventivi/[id]`) è una scheda singola: l'assistente non lo dà come link,
  spiega da dove ci si arriva.
- **titolo**: il titolo che si legge nella barra blu della pagina.
- **accesso**: chi può aprire la pagina. Basta **una** delle voci. Vocabolario fisso:

| Voce | Significa |
|---|---|
| `tutti` | chiunque entri nell'app con l'account della cooperativa |
| `pubblico` | pagina aperta da un link ricevuto via mail o da un QR, senza login |
| `permesso:<Area>` | ha quel permesso nel pannello Permessi. Aree: `Amministrazione`, `Prestazioni Occasionali`, `Timbrature HR`, `Acquisti`, `Beni e IT`, `Manutenzioni`, `Controllo di Gestione`, `Pagamenti`, `Approvazione Pagamenti` |
| `admin` | uno dei tre amministratori delle manutenzioni |
| `gruppo-ru` | fa parte del gruppo Risorse Umane |
| `coordinatore-cc` | coordinatore o responsabile d'area di almeno un centro di costo |
| `coordinatore-cura-ambienti` | coordinatore del centro di costo Cura Ambienti (cc24) |
| `responsabile-timbrature` | valida i fogli ore di almeno una persona |

- **cosa**: una riga su a cosa serve la pagina.

## Il testo

Scrivere per chi usa poco il computer, anche persone anziane o con qualche difficoltà.

- **Titoli a domanda**, con le parole che userebbe la persona: «Come segno l'entrata?»,
  «Ho sbagliato un orario, come lo correggo?», «Dove vedo le mie ore del mese?».
  Una domanda = un titolo `##`. L'assistente cerca proprio qui.
- **Passi numerati**, uno per azione. Frasi brevi. Si dà del **tu**.
- **Nomi di bottoni e campi tra «»**, scritti esattamente come sullo schermo.
- **Link alle pagine** in Markdown con il percorso: `[Le mie richieste](/mie-richieste)`.
- **Niente parole tecniche**: niente SharePoint, Supabase, API, token, database, lista.
  Si dice «l'app salva», «arriva una mail», «compare nell'elenco».
- Dire **cosa succede dopo** (chi riceve la mail, che stato prende la richiesta) e
  **a chi rivolgersi** se qualcosa non va.
- Se una cosa **non si può fare** dall'app, scriverlo: anche questa è una risposta.
- In fondo, una sezione `## Problemi comuni` con i messaggi d'errore più probabili e
  cosa fare.
- Niente nomi propri di persone, salvo i ruoli fissi (es. «l'ufficio amministrazione»,
  «le Risorse Umane»).
