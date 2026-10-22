# Preventivi Catering

**22 ottobre 2026**, richiesta di Dennis: rifare nell'app il foglio `Budget Preventivo.xlsx`
con cui la Locanda nel Parco calcola i preventivi dei catering, ma più facile da usare.

## Dove sta

- `/preventivi` è diventato un **hub** con due tasti: *Preventivi Servizi* (l'elenco dei
  preventivi agli enti, spostato su `/preventivi/servizi`) e *Preventivi Catering*.
  I link `/preventivi/<id>` delle mail non cambiano; i vecchi `/preventivi?stato=…` vengono
  girati all'elenco dall'hub.
- Calcolatore: `app/(app)/preventivi/catering/`. Conti: `lib/preventivi/catering-calcoli.ts`
  (funzioni pure). Parametri: `lib/preventivi/catering.ts`, API `api/preventivi/catering/parametri`.

## I conti (identici al foglio)

| Voce | Formula |
|---|---|
| Cibo | costo cibo a persona × ospiti |
| Bere | costo bere a persona × ospiti |
| Trasporto | km solo andata × 2 × **€/km** |
| Personale | persone in servizio × ore × **€/ora** |
| Coperto | ospiti × **€/coperto** |
| Costi extra | righe scritte a mano (cosa + costo a corpo), aggiunte il 22/10/2026 |
| Costo totale | somma delle cinque voci + costi extra |
| Ricarico | costo totale × **ricarico %** |
| Prezzo IVA esclusa | costo totale + ricarico |
| Con IVA | prezzo IVA esclusa × (1 + **IVA**) |
| A persona | totale con IVA ÷ ospiti |

In grassetto i **parametri**. Valori del foglio: 1,10 €/km · 18,50 €/h · 1 € · 10%. Ricarico: 30% (aggiunto da Dennis il 22/10/2026,
il foglio non lo aveva). Sopra il calcolatore un riquadro ricorda di scrivere i **costi** di produzione,
non i prezzi di vendita: ricarico e IVA li aggiunge l'app.

## Decisioni

- **Solo calcolatore**: il preventivo catering non si archivia (scelta di Dennis). Il tasto
  "Copia riepilogo" mette il conto negli appunti per incollarlo in una mail.
- **Parametri sulla lista SP Parametri** (la stessa di `Costo orario pulizie`), quattro righe:
  `Catering - Costo km`, `Catering - Costo orario personale`, `Catering - Costo coperto`,
  `Catering - IVA %` (in percento: 10). Se mancano valgono i valori del foglio e le righe
  nascono al primo salvataggio: nessuno script da lanciare.
- **Chi**: entra chi entra nei Preventivi (coordinatori dei CC + Amministrazione). I parametri
  li vedono tutti, li salva solo chi ha `Amministrazione` (o admin). Ogni salvataggio va nel
  Log Attività (`preventivi.catering_parametri`, con prima/dopo).
- Il **ricarico** si applica al costo totale (tutte le voci, **costi extra compresi**: sono costi anche loro), prima dell'IVA.
  Riga SP: `Catering - Ricarico %`.
