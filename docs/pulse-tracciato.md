# PULSE — file presenze dalle Timbrature

Stato al 17/11/2026. Il generatore dentro l'app **non esiste ancora**: i file in `pulse/`
(prova, marcatore, prova2 di ottobre) sono stati fatti con script usa-e-getta.
Quando si scrive il generatore, queste sono le regole.

## Tracciato
CL System 06/2026 (QR_IMPORTAZIONE_PRESENZE, da Luigi Pilone 30/10/2026).
Record di 184 caratteri + CRLF, una riga per lavoratore × voce:
`U` + ditta `0257` + `MMAA` + matricola 11 cifre (campo `matricola_pulse`) + voce 4 cifre
+ aliquota + 31 giorni (ore in centesimi, oppure giornate per le voci a giornata).
Le festività le imposta PULSE (spunta "Festività impostate da Pulse" all'import).

## Voci (risposte di Sara Rossi, 17/11/2026)
| caso | voce | note |
|---|---|---|
| lavoro ordinario | 0300 | anche la formazione (tipo solo nelle note) |
| ferie | 0302 | |
| permessi retribuiti | 0305 | |
| permessi non retribuiti | 0326 | codice ok, non lo usa nessuno |
| congedo parentale | 0366 | dipende dal tipo di congedo — vedi aperti |
| flessibilità negativa | 0308 | |
| flessibilità lavorata | **0907** | NON 0307: in PULSE si carica 907, in cedolino esce 307 |
| L.104 lavoratore / familiare | 0692 / 0736 | dipende dalla documentazione — vedi aperti |
| reperibilità | 0383 | in giornate, 1 per giorno |
| notte | 0383 | importo 5,16 € per notte, nessuna voce "notte" separata — vedi aperti |
| malattia | — | fuori dal file, la caricano a mano in un'altra finestra |
| domenica | — | **nessuna maggiorazione domenicale**: niente 0347, le ore restano 0300 |

## Aperti (chiesti a Sara il 17/11/2026)
1. Notti e reperibilità sullo stesso 383: come le distingue PULSE; l'importo 5,16 va nel campo aliquota o lo caricano a mano?
2. Fascia oraria che fa contare un turno come notte.
3. Elenco tipo di congedo → codice; quali congedi vanno sulla finestra malattia (da escludere).
4. Elenco persone con 104 e codice (692/736) da segnare in anagrafica.
5. Formazione = 300 confermato? Come passare il tipo (riepilogo a parte?).
