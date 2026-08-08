/**
 * Porta d'ingresso della sezione Timbrature: chi sta fuori dal modulo importa
 * da qui e non dai singoli file.
 *
 * Dentro, il modulo e' diviso per mestiere — ed e' l'ordine in cui i file si
 * appoggiano l'uno sull'altro, senza anelli:
 *
 *   date.ts        date, orari, aritmetica delle ore. Funzioni pure.
 *   anagrafica.ts  servizi e centri di costo, dipendenti, monte ore settimanale
 *   stati.ts       stato del mese (aperto → validato → confermato)
 *   righe.ts       le righe di ore: chi puo' scrivere cosa, e la scrittura
 *   assenze.ts     ferie e permessi su un periodo di giorni consecutivi
 *   riepilogo.ts   dai dati ai numeri: giorni, settimane, flessibilita', cruscotti
 *
 * Regole chiave della sezione, per chi arriva adesso:
 *   - ore SENZA arrotondamento (valore esatto), mai digitate: sempre derivate
 *     dagli orari di ingresso e uscita;
 *   - il servizio determina il centro di costo;
 *   - finestra dell'operatore: oggi e i due giorni precedenti. Le ore piu'
 *     vecchie non si toccano piu': la correzione passa dal responsabile. I
 *     giustificativi fanno eccezione, perche' si programmano in anticipo e il
 *     certificato arriva quando arriva;
 *   - un turno che scavalca la mezzanotte diventa DUE righe indipendenti, una
 *     per giornata: le ore del secondo giorno sono ore di quel giorno;
 *   - niente contatori memorizzati: ogni totale si ricalcola dalle righe.
 *
 * Solo server-side: usa la service role key via lib/core/supabase.
 */

export * from '@/lib/timbrature/date'
export * from '@/lib/timbrature/anagrafica'
export * from '@/lib/timbrature/stati'
export * from '@/lib/timbrature/righe'
export * from '@/lib/timbrature/assenze'
export * from '@/lib/timbrature/riepilogo'
