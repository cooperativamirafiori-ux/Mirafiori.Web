# PULSE — file presenze dalle Timbrature

Stato al 20/11/2026. Il generatore dentro l'app **non esiste ancora**: i file in `pulse/`
(prova, marcatore, prova2 di ottobre) sono stati fatti con script usa-e-getta.
Quando si scrive il generatore, queste sono le regole.

## Tracciato
CL System 06/2026 (QR_IMPORTAZIONE_PRESENZE, da Luigi Pilone 30/10/2026).
Record di 184 caratteri + CRLF, una riga per lavoratore × voce:
`U` + ditta `0257` + `MMAA` + matricola 11 cifre (campo `matricola_pulse`) + voce 4 cifre
+ aliquota + 31 giorni (ore in centesimi, oppure giornate per le voci a giornata).
Le festività le imposta PULSE (spunta "Festività impostate da Pulse" all'import).

## Voci nel file (risposte di Sara Rossi, 17 e 20/11/2026)
| caso | voce | note |
|---|---|---|
| lavoro ordinario | 0300 | notti comprese (pagate come le diurne) |
| formazione | 0300 | PULSE non la distingue; scorporarla richiede che sia visibile sul foglio ore |
| ferie | 0302 | |
| permessi retribuiti | 0305 | |
| permessi non retribuiti | 0326 | codice ok, non lo usa nessuno |
| flessibilità negativa | 0308 | |
| flessibilità lavorata | **0907** | NON 0307: in PULSE si carica 907, in cedolino esce 307 |
| L.104 | 0692 lavoratore / 0736 familiare | per persona, vedi sotto |
| reperibilità | 0383 | in giornate, 1 per giorno |
| domenica | — | nessuna maggiorazione domenicale: niente 0347 |

### L.104 per persona
- Amedeo Alice → 0692
- Manero Claudia → 0736
- Gascone Elena → 0736

## Fuori dal file (li carica lo studio a mano)
**Eventi nella finestra malattia**, con questi codici evento:
| codice | evento |
|---|---|
| 001 | malattia |
| 002 | maternità obbligatoria |
| 003 | maternità facoltativa (congedo parentale) fino a 6 mesi |
| 009 | infortunio |
| 032 | congedo obbligatorio padre |
| 033 | maternità facoltativa 7-9 mesi fino a 12 anni |

Quindi nel file NON vanno: righe con `mutua`, giustificativi Malattia lunga,
Maternità, **Congedo parentale** (nella prova2 era 0366: va tolto).

**Notti**: indennità di 5,16 € per notte, caricata a mano in un riquadro a parte
(come i rimborsi). Notte = 6 ore consecutive nella fascia 24:00-06:00. Oggi
riguarda solo comunità e coperture in ospedale. Non va nel file; l'app può dare
allo studio un conteggio notti per persona.

## Aperti
1. Congedo parentale: l'app ha un solo giustificativo "Congedo parentale", ma per lo
   studio è 003 o 033 secondo l'età del figlio/mesi già usati. Basta comunicarlo
   come evento e scelgono loro il codice?
2. Notti: confermare che "notte" = turno che copre tutta la fascia 24-06 (6h
   consecutive), e in che forma vogliono il conteggio (riepilogo a parte?).
3. Formazione: decidere se scorporarla (oggi no).
4. Dove salvare in anagrafica il codice 104 (692/736) per persona.
