# Timbrature — ore per progetto (agosto 2026)

## Il problema

Chi timbra su **Progettazione** finisce tutto su un unico centro di costo
(`cc23 Progettazione - Amministrazione`). Va bene che il centro di costo resti uno:
quello che manca è sapere **quante ore vanno su ogni progetto**, perché è il dato
con cui si rendicontano i bandi.

Progetti al momento attivi: Impatto, Organizziamo la speranza, Serigrafia,
Piazza Ragazzabile, Risalto Fermi, Risalto Mirafiori, Nuove Forme.

## Le decisioni

**Il progetto è una seconda dimensione della riga, non un servizio in più.**
L'alternativa era moltiplicare i servizi (`PROGETTAZIONE - Impatto`,
`PROGETTAZIONE - Serigrafia`, …): zero migrazione, ma la tendina dei servizi si
gonfia, e "tutta la progettazione" non è più una somma sola. Con una colonna
`progetto_id` sulla riga il servizio resta uno e le due domande — *che lavoro è*
e *per quale bando* — restano separate.

**Il campo è facoltativo.** Esiste progettazione non imputabile a un singolo
bando; obbligare a scegliere produrrebbe attribuzioni finte, che sono peggio di
un dato mancante. Le ore non imputate non vengono nascoste: nel consuntivo
compaiono come riga **"Senza progetto"**, sempre in fondo.

**Quali servizi lo chiedono lo dice una spunta sul servizio**
(`servizio.chiede_progetto`), non un elenco di nomi nel codice: oggi solo
Progettazione, domani un altro servizio con una `UPDATE` sola.

**L'elenco dei progetti si gestisce da terminale**, non da una schermata: cambia
due o tre volte l'anno e una pagina da mantenere costerebbe più di quanto renda.
Se un domani cominciasse a cambiare ogni mese, la strada è una pagina in
Amministrazione come Gestione Software.

**Un progetto non si cancella: si disattiva.** Sparisce dalla tendina, le ore già
registrate restano — un consuntivo che perde le ore di un bando chiuso è inutile.

## Cosa è stato toccato

| Dove | Cosa |
|---|---|
| `supabase/timbrature_progetti.sql` | tabella `progetto`, colonna `timbratura.progetto_id`, flag `servizio.chiede_progetto`, seed dei 7 progetti |
| `types/timbrature.ts` | `Progetto`, `OrePerProgetto`, `Servizio.chiedeProgetto`, `Timbratura.progettoId`/`progettoNome`, `TimbraturaInput.progettoId` |
| `lib/timbrature/anagrafica.ts` | `getProgetti()`, `chiedeProgetto` in `mapServizio` |
| `lib/timbrature/righe.ts` | join sul progetto, `leggiRiga` e `campiVoce` (il progetto si salva solo dove il servizio lo chiede) |
| `lib/timbrature/progetti.ts` | `orePerProgetto(dal, al, referente)` — il consuntivo |
| `app/api/timbrature/servizi` | restituisce anche i progetti attivi |
| `app/api/timbrature/hr/dipendente/[id]` | restituisce anche i progetti (serve al form "per conto") |
| `app/api/timbrature/hr/progetti` | GET del consuntivo su un periodo |
| `TimbratureOperatore.tsx`, `CruscottoTimbrature.tsx` | tendina progetto nei due form |
| `GiorniMese.tsx`, `foglio-ore-xlsx.ts`, `app/foglio-ore/[token]` | il progetto accanto al servizio, in schermata e sul documento |
| `app/(app)/risorse-umane/timbrature/progetti/` | pagina "Ore per progetto" |
| `scripts/progetti-timbrature.mjs` | gestione elenco + consuntivo da terminale |

## Setup

Una volta sola, nel SQL editor di Supabase: contenuto di
`supabase/timbrature_progetti.sql`.

Poi, da `web/`:

```bash
node scripts/progetti-timbrature.mjs elenco
```

## Gestione dell'elenco

```bash
node scripts/progetti-timbrature.mjs aggiungi "Nuovo Bando 2027"
node scripts/progetti-timbrature.mjs rinomina "Nuove Forme" "Nuove Forme 2"
node scripts/progetti-timbrature.mjs disattiva "Serigrafia"
node scripts/progetti-timbrature.mjs riattiva "Serigrafia"
node scripts/progetti-timbrature.mjs ore 2026-01-01 2026-12-31
```

## Chi vede il consuntivo

`/risorse-umane/timbrature/progetti`, raggiungibile dal cruscotto dei fogli ore.
Ci entra chi valida: le Risorse Umane (permesso *Timbrature HR*) vedono tutti, un
responsabile solo i propri collaboratori — è lo stesso criterio del cruscotto,
applicato dal server.

**Nodo aperto:** se a rendicontare i bandi sarà l'ufficio progettazione senza
passare dalle HR, serve un permesso d'area suo in `AREE_PERMESSI`, non un
allargamento silenzioso di questo controllo.

## Da fare, se servirà

- export Excel del consuntivo (oggi si legge a schermo o si stampa da terminale);
- ore per progetto **per mese**, se la rendicontazione lo chiede a periodi;
- collegamento al controllo di gestione: il progetto è la dimensione naturale su
  cui appoggiare anche i costi, non solo le ore (vedi `docs/controllo-di-gestione-piano.md`).
