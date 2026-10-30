# Estratto conti Qonto settimanale

Deciso il 29/10/2026 (Dennis con Claudia Carena), formato approvato il 30/10.

**Cosa fa.** Ogni lunedì alle 6:00 UTC (7:00 d'inverno, 8:00 d'estate) il cron
`/api/cron/estratti-qonto` prende i movimenti della settimana prima — da lunedì
00:00 a domenica 23:59, ora italiana — di **tutti** i conti Qonto e manda un
Excel ad Alessandro Buzzi (`ESTRATTI_QONTO_MAIL_TO`, default
alessandro.buzzi@cooperativamirafiori.com). Claudia non riceve nulla.

**Perché così.** Alessandro tiene la contabilità con il suo programma e non deve
entrare in Qonto né nell'app: riceve solo il file. Prima lo scaricava Claudia a
mano ogni settimana.

## L'Excel

- **Riepilogo**: per conto saldo iniziale, entrate, uscite, saldo finale, numero
  di movimenti; riga dei totali con formule.
- **Movimenti**: data, conto, controparte, tipo (carta con ultime cifre,
  bonifico, entrata…), entrata, uscita, nota, riferimento, giroconto, scontrino.

## Decisioni

- **Solo movimenti contabilizzati** (`status=completed`, filtrati per data di
  contabilizzazione). Quelli in attesa possono cambiare o essere annullati, e la
  settimana dopo comparirebbero due volte.
- **I conti si leggono a ogni invio**: aggiunti, tolti o rinominati su Qonto
  entrano da soli, nessuna lista da tenere aggiornata. Anche i conti **chiusi**,
  che compaiono solo se hanno movimenti nella settimana.
- **Saldi all'indietro**: Qonto dà solo il saldo di adesso. Saldo finale = saldo
  attuale − movimenti contabilizzati dopo la domenica; saldo iniziale = saldo
  finale − movimenti della settimana.
- **Giroconti** fra conti nostri riconosciuti dall'IBAN della controparte (la
  stessa regola della scheda Qonto) e segnati, così non sembrano entrate e uscite
  vere. Nei totali restano: sono movimenti reali di ciascun conto.

## Invio a mano

**Dall'app** (30/10/2026): Controllo di Gestione → Qonto, riquadro "Estratto
conti settimanale" — mail già compilata con la propria (più indirizzi separati
da virgola), bottone "Invia estratto settimanale". Manda la settimana
precedente. Solo per chi vede tutti i conti (permesso Controllo di Gestione):
`app/api/qonto/estratto`. Finisce nel Log Attività.

**Da terminale**, anche per una settimana a scelta:

```bash
node scripts/estratto-qonto.mjs --a=dennis.maseri@cooperativamirafiori.com
node scripts/estratto-qonto.mjs --settimana=2026-10-19
```

Lo script non legge Qonto: chiama l'app in produzione con il `CRON_SECRET`, che
deve essere lo stesso in `.env.local` e su Vercel. Serve per la prova (solo a
chi si indica con `--a`) e per recuperare una settimana se un lunedì Qonto non
ha risposto.
