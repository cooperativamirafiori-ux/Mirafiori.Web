# Fatture dallo SDI (XML)

Le fatture passive entrano nell'app dagli **XML dello SDI**, non più dallo
scadenzario Excel di Fattura SMART. Una lista sola.

## Da dove arrivano

- Una persona mette ogni settimana gli XML nella cartella SharePoint
  **General/fatture da SDI** (sito `gruppo_ControlloGestione`, lo stesso di
  `SHAREPOINT_SITE_ID`). Variabile: `SP_CARTELLA_FATTURE_SDI`.
- File accettati: `.xml`, `.xml.p7m` (firmati, CMS DER/BER/base64) e le
  ricevute SDI `_MT_001.xml`, da cui si prende l'`IdentificativoSdI`.
- Dopo l'import i file vanno in **Importate** (creata da sola), con accanto il
  PDF del fornitore se era allegato all'XML.
- ⚠️ **I nomi SDI distinguono maiuscole e minuscole**: `IT…_hSf0t` e
  `IT…_hSf0T` sono due fatture. Si toglie solo il ` (1)` delle copie scaricate
  due volte. (Bug del primo import, 25/09/2026: corretto.)

## Quando gira

- Ogni notte alle 03:15 UTC: `app/api/cron/fatture-sdi` (Vercel Hobby: un cron al giorno).
- **Importa adesso** in Flussi fatture (permesso `Pagamenti`): `POST /api/pagamenti/importa-sdi`.
- Dal Mac: `npx --yes tsx scripts/importa-fatture-sdi.ts` (prova) / `--apply`.
- Riportare in arrivo dei file già importati: `scripts/rimetti-in-arrivo-sdi.ts "nome esatto" …`.

Nessuna IA: script deterministico. Codice in `lib/pagamenti/sdi/`
(`p7m.ts` `xml.ts` `fattura.ts` `regole.ts` `cartella.ts` `import.ts`).

## Identità e raccordo

- Una fattura è identificata dal **protocollo** (righe venute dall'Excel)
  **oppure** dall'`identificativo_sdi`. Senza ricevuta MT, `FILE:<nome>`.
- Le righe già arrivate dall'Excel si agganciano per P.IVA + numero + data del
  fornitore (verificato 1:1): si arricchiscono, le loro scadenze non si toccano.
- Documenti con la **nostra** P.IVA come fornitore (05569090011) si scartano.

## Le regole (`regole.ts`, decise con Dennis il 25/09/2026)

⚠️ Sopra tutto: **una fattura già pagata non deve mai finire in una coda di
pagamento.** Nel dubbio si va in "da verificare", mai in "da pagare".

1. Integrazioni e autofatture (TD16–23, TD26–28) → nessuna scadenza.
2. Nota di credito (TD04/TD08) → `stornata`, importo negativo.
3. Contanti o carta (MP01, MP08) → nasce `pagata`.
4. RID, SDD, domiciliazioni → `automatica`.
5. Nessuna modalità nell'XML → `pagata` se il fornitore è noto per pagare al
   momento, altrimenti `da_verificare` (`senza_modalita`).
6. Primo import dagli XML: bonifici già scaduti → `da_verificare` (`primo_import`).
7. Il resto → `da_approvare` sopra soglia, `da_pagare` sotto.
8. Scadenza assente → 30 del mese successivo, `stimata`.

## Da verificare

Coda a parte in Flussi fatture, fuori dalle altre code e dai totali. Tre
risposte (`POST /api/pagamenti/scadenze/verifica`, annullabile con `DELETE`):

- **Pagata in negozio** → pagata il giorno della fattura; se la riga era
  `senza_modalita`, il fornitore diventa `paga_al_momento` e le sue prossime
  fatture senza modalità nascono pagate.
- **Già pagata il …** → pagata fuori dall'app, con la data indicata.
- **Da pagare** → in coda; la soglia di oggi decide se serve l'approvazione.

`motivo_verifica` resta scritto anche dopo: è la storia della riga.

## IBAN

- L'IBAN si prende dall'XML. Tabella `fornitore` (chiave P.IVA): IBAN,
  fonte, chi l'ha confermato; `paga_al_momento`.
- `blocco = iban_mancante`: bonifico senza IBAN né in fattura né sul fornitore.
- `blocco = iban_cambiato`: l'IBAN in fattura è diverso da quello **confermato**.
  È la truffa più comune: la conferma chiede di aver verificato al telefono
  con un numero che non viene dalla fattura.
- Conferma: `POST /api/pagamenti/fornitori/iban` → sblocca tutte le scadenze
  non pagate del fornitore. Controllo mod 97 prima di salvare. Va nel registro.
- Il blocco non è uno stato: la riga resta nella sua coda, con la pillola rossa.

## Schema

`supabase/fatture_sdi.sql` (migrazione `fatture_sdi`).

## Prossimi pezzi

- Il coordinatore segna "mia" una fattura (vince il primo: `update … where cc_codice is null`).
- Dalle fatture segnate, richieste di bonifico su Qonto dal sottoconto del centro
  di costo (approvazione con SCA; OAuth lato server con refresh token in Supabase).
