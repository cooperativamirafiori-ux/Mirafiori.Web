# Cura Ambienti — centro di servizio interno

Deciso con Dennis il 2 ottobre 2026.

## Cos'è

Cura Ambienti è l'unità interna che fa **pulizie e piccole manutenzioni** in tutte le strutture
della cooperativa, più alcuni servizi verso l'esterno che si vogliono far crescere.

Diventa un **centro di costo a sé, `cc24 · Cura Ambienti`** (area Servizi Generali):

- **sostiene i costi**: acquisti di materiale per pulizie e manutenzioni (conto Qonto dedicato) e il
  personale, che **timbra su Cura Ambienti** (addetti pulizie e manutentore);
- **"vende" il servizio** alle strutture a una tariffa oraria interna, con un **addebito a
  consuntivo** sul centro di costo della struttura;
- **vende lo stesso servizio all'esterno**, con fattura vera.

## Perché così e non una ripartizione a percentuale

Si era partiti da una tabella fissa di percentuali per spalmare gli acquisti di pulizia sulle
strutture (`Ripartizione_Cura_Ambienti.xlsx`). Superata: una percentuale fissa non dice quanto
costa davvero pulire una struttura, e non regge i servizi esterni. Con il centro di servizio il
costo segue il lavoro fatto.

**Scelta esplicita di Dennis:** gli addetti timbrano **solo su Cura Ambienti**, senza indicare la
struttura. Le ore per struttura le stabilisce il **coordinatore di Cura Ambienti**, con
preventivi e consuntivi anche informali: l'obiettivo è abituarlo a ragionare per commessa.

## Il Lavoro

L'oggetto centrale. Una scheda leggera del coordinatore:

| Campo | Note |
|---|---|
| Per chi | struttura (→ il suo CC) **oppure** cliente esterno |
| Cosa | descrizione libera |
| Preventivo | ore stimate per figura + materiali stimati → importo calcolato dalla tariffa |
| Consuntivo | ore effettive per figura + materiali effettivi → importo e scostamento |
| Stato | bozza → preventivato → in corso → consuntivato → addebitato |

Due modi in cui nasce:

- **pulizie ordinarie**: un lavoro **ricorrente** per struttura; ogni mese l'app propone il lavoro
  del mese con il preventivo del mese prima, il coordinatore corregge solo il consuntivo;
- **interventi** (straordinari, manutenzioni): li crea il coordinatore, o nascono dalla richiesta
  di una struttura — il ticket di manutenzione diventa una porta per aprire un lavoro.

## Quanto costa un'ora

**Importo = ore per figura × tariffa interna + materiali dedicati.**

- **materiale di consumo** (detersivi, sacchi) **sta dentro la tariffa oraria**: non è tracciabile
  intervento per intervento;
- **materiali dedicati** (un rubinetto, una serratura) si attaccano al lavoro, a costo reale;
- la tariffa si fissa **una volta l'anno**: costo annuo previsto di Cura Ambienti (personale +
  consumo) diviso le ore che si prevede di addebitare. Tabella `tariffa_interna`, con data di
  validità: cambiarla non riscrive il passato.

## Nel registro: una coppia di righe, mai una sola

L'addebito interno scrive **due righe** con lo stesso `origine_id` (l'id del lavoro):

| CC | Voce | Importo |
|---|---|---|
| struttura (es. cc9) | `SINT` Servizi interni Cura Ambienti (costo) | −180 |
| cc24 | `RINT` Recupero servizi interni (ricavo) | +180 |

- sulla cooperativa la coppia **si annulla**: i report consolidati **escludono le voci interne**
  (colonna `interna` su `voce_analitica`), altrimenti costi e ricavi risulterebbero gonfiati;
- su **cc24** resta il **margine** = recuperi − costi reali. A zero: tariffa giusta. Negativo:
  tariffa bassa o ore pagate e non addebitate;
- `fonte = 'ribaltamento'`, `origine_tipo = 'lavoro_cura_ambienti'`: il vincolo
  `unique (origine_tipo, origine_id, cc_codice)` impedisce di addebitare due volte lo stesso lavoro,
  e riconsuntivare un lavoro riscrive la coppia invece di aggiungerne un'altra.

**Servizi esterni**: nessun ribaltamento. Il consuntivo genera una **richiesta fattura** (flusso
esistente) e la fattura emessa diventa **ricavo vero su cc24**.

## Il controllo che tiene onesti i consuntivi

**Ore timbrate su Cura Ambienti nel mese ↔ ore consuntivate nei lavori del mese.**

Le timbrature sono la verità. Se i consuntivi sommano meno ore delle timbrate, la differenza resta
su cc24 come ore non addebitate e si vede; se ne sommano di più, è un errore e va segnalato. È anche
il numero da guardare prima di prendere servizi esterni: ore che nessuno paga sono capacità libera.

## Comunicazione

- **preventivo** pronto → mail al coordinatore del CC della struttura, con un **visto facoltativo**
  (informale ma tracciato);
- **consuntivo** → mail con lavoro, ore, materiali, importo addebitato;
- **riepilogo mensile** per CC; il coordinatore lo vede anche in Controllo di Gestione.
- i coordinatori si leggono con `getCoordinatoriCentri()` (lista SP Centri di Costo).

## Ordine di lavoro

1. **Anagrafica** ✅ fatto il 2/10/2026
   - cc24 sulla lista SP Centri di Costo (`scripts/provision-centri-costo.mjs`) e nello specchio
     Supabase (`scripts/sync-centri-costo-supabase.mjs --apply`);
   - servizio di timbratura "Cura Ambienti" → cc24 (`supabase/cura_ambienti_anagrafica.sql`);
   - tabella `tariffa_interna` (stesso file);
   - conto Qonto rinominato **a mano** in `cc24 · Cura Ambienti` (la chiave API non rinomina i
     sottoconti: 401, vedi CLAUDE.md § Qonto);
   - coordinatore di cc24 con `scripts/coordinatori-centri-costo.mjs`.
2. **Lavori** ✅ scritto il 2/10/2026: tabella `lavoro_cura_ambienti`
   (`supabase/cura_ambienti_lavori.sql`), schermata in Controllo di Gestione → Cura Ambienti
   (elenco del mese, preventivo/consuntivo con importo live, "copia i ricorrenti del mese prima",
   confronto ore timbrate/consuntivate).
3. **Ribaltamento** al consuntivo: voci `SINT`/`RINT`, colonna `interna`, `fonte = 'ribaltamento'`.
4. **Cruscotto cc24**: margine, ore timbrate vs consuntivate, scostamenti preventivo/consuntivo.
5. **Mail** ai coordinatori delle strutture.
6. Poi: richieste di manutenzione → lavoro; canale esterno → richiesta fattura.

## Decisioni prese

- **Tariffa interna 26 €/h** per pulizie e manutenzione dal 1/10/2026. Costo del personale
  dichiarato: pulizie 18,40 €/h, manutentore 17,40 €/h; il resto copre tempi non addebitabili,
  coordinatore, mezzo e benzina, consumo, attrezzature e DPI (stima del 2/10/2026, da verificare
  col margine di cc24 a fine trimestre).
- **Coordinatori di cc24**: Marika Armandi e Dennis Maseri.
- Conto Qonto rinominato `cc24 · Cura Ambienti`.
- Il 2/10/2026 creato anche il sottoconto Qonto `cc2 · La Locanda nel Parco`: ora tutti i centri di costo attivi ne hanno uno.
