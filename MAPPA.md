# MAPPA — indice generato di Mirafiori Web

> Generato da `npm run mappa` il 2026-08-17. **Non modificare a mano**: le decisioni e le
> convenzioni stanno in `CLAUDE.md`, qui c'è solo la fotografia dei file.

**274 file · 48.080 righe totali.**

## ⚠️ File oltre 500 righe — da spezzare

| File | Area | Righe | KB |
|---|---|---:|---:|
| `app/(app)/risorse-umane/GestioneRU.tsx` | Risorse Umane | 971 | 34 |
| `app/(app)/acquisti/gestione/GestioneAcquisti.tsx` | Acquisti | 941 | 34 |
| `app/(app)/timbrature/TimbratureOperatore.tsx` | Timbrature · Foglio ore | 836 | 37 |
| `app/(app)/risorse-umane/timbrature/CruscottoTimbrature.tsx` | Timbrature · Foglio ore | 749 | 34 |
| `app/(app)/prestazioni/nuova/NuovaPrestazioneForm.tsx` | Prestazioni occasionali | 536 | 18 |
| `app/api/acquisti/[id]/route.ts` | Acquisti | 525 | 20 |
| `app/(app)/amministrazione/software/GestioneSoftware.tsx` | Amministrazione · Software | 524 | 20 |

## Aree funzionali

### Timbrature · Foglio ore

_48 file · 8403 righe_

- `app/(app)/risorse-umane/timbrature/_componenti/VariazioniOrario.tsx` (237 righe)
- `app/(app)/risorse-umane/timbrature/CruscottoTimbrature.tsx` (749 righe) ⚠️
- `app/(app)/risorse-umane/timbrature/page.tsx` (16 righe)
- `app/(app)/timbrature/_componenti/GiorniMese.tsx` (211 righe)
- `app/(app)/timbrature/_componenti/mese.ts` (273 righe)
- `app/(app)/timbrature/_componenti/RiepilogoMese.tsx` (279 righe)
- `app/(app)/timbrature/page.tsx` (77 righe)
- `app/(app)/timbrature/TimbratureOperatore.tsx` (836 righe) ⚠️
- `app/(app)/timbrature/validazione/page.tsx` (29 righe)
- `app/api/cron/promemoria-ore/route.ts` (90 righe)
- `app/api/cron/sollecito-timbrature/route.ts` (175 righe)
- `app/api/cron/timbrature-alert/route.ts` (89 righe)
- `app/api/foglio-ore/[token]/route.ts` (62 righe)
- `app/api/timbrature/[id]/route.ts` (44 righe)
- `app/api/timbrature/assenza/route.ts` (122 righe)
- `app/api/timbrature/hr/dipendente/[id]/route.ts` (54 righe)
- `app/api/timbrature/hr/forza/route.ts` (51 righe)
- `app/api/timbrature/hr/profilo/allegato/route.ts` (124 righe)
- `app/api/timbrature/hr/profilo/route.ts` (119 righe)
- `app/api/timbrature/hr/riapri/route.ts` (35 righe)
- `app/api/timbrature/hr/riga/[id]/route.ts` (75 righe)
- `app/api/timbrature/hr/riga/route.ts` (53 righe)
- `app/api/timbrature/hr/sincronizza/route.ts` (42 righe)
- `app/api/timbrature/hr/stato/route.ts` (29 righe)
- `app/api/timbrature/hr/valida/route.ts` (57 righe)
- `app/api/timbrature/riepilogo/route.ts` (43 righe)
- `app/api/timbrature/route.ts` (50 righe)
- `app/api/timbrature/servizi/route.ts` (21 righe)
- `app/foglio-ore/[token]/ConfermaFoglioOre.tsx` (234 righe)
- `app/foglio-ore/[token]/page.tsx` (117 righe)
- `docs/timbrature-revisione-agosto-2026.md` (287 righe)
- `docs/timbrature-setup.md` (117 righe)
- `docs/timbrature-validazione.md` (93 righe)
- `lib/timbrature/anagrafica.ts` (351 righe) — esporta: mapServizio, getServizi, servizioById, servizioPerNome, mapDip, getDipendenti, getDipendenteById, getDipendenteByEmail, dipendenteAbilitato, upsertDipendenteDaRU, getSubordinati, eResponsabile, profiloVigente, getProfili, getProfiloById, salvaProfilo, eliminaProfilo, monteToSettimana, oreAtteseDelGiorno, leggiVariazione
- `lib/timbrature/assenze.ts` (125 righe) — esporta: creaAssenzaPeriodo, eliminaAssenzaPeriodo
- `lib/timbrature/data.ts` (36 righe)
- `lib/timbrature/date.ts` (178 righe) — esporta: oggiRoma, GIORNI_INDIETRO, dataIt, addGiorni, primaDataUtile, primoUltimoGiorno, ultimoGiornoUtile, meseScaduto, weekdayIso, lunediIso, giorniDa, round4, orarioInMinuti, minutiInOrario, calcolaOre, normalizzaOrario, spezzaAMezzanotte
- `lib/timbrature/festivita.ts` (65 righe) — esporta: pasqua, festivitaAnno, isFestivo
- `lib/timbrature/flusso.ts` (306 righe) — esporta: MESI_IT, baseApp, linkTimbrature, linkValidazione, linkConferma, destinatariValidazione, destinatarioResponsabile, validaFoglio, inviaRichiestaConferma, confermaFoglio, contestaFoglio, nominativiDi
- `lib/timbrature/foglio-ore-xlsx.ts` (435 righe) — esporta: generaFoglioOreBuffer, DipendenteFuoriAnagrafica, pubblicaFoglioOre
- `lib/timbrature/guard.ts` (127 righe) — esporta: AREA_HR, MSG_NON_ABILITATO, guardOperatore, guardHr, guardValidatore, puoAgireSu
- `lib/timbrature/notifiche.ts` (287 righe) — esporta: notificaSollecitoTimbrature, notificaGiornateInScadenza, notificaFogliDaValidare, notificaFoglioDaConfermare, notificaDipendenteFuoriAnagrafica, notificaContestazioneFoglioOre
- `lib/timbrature/riepilogo.ts` (351 righe) — esporta: VOCE_FLESSIBILITA, riepilogoPeriodo, raggruppaSettimane, giorniIncompleti, meseCompleto, statoMeseTutti, apriValidazioni
- `lib/timbrature/righe.ts` (402 righe) — esporta: listTimbrature, assertScrivibile, leggiRiga, creaTimbratura, inserisci, aggiornaTimbratura, eliminaTimbratura
- `lib/timbrature/stati.ts` (261 righe) — esporta: MOTIVO_STATO, getChiusura, statoMese, finestraMese, marcaDaValidare, marcaValidato, marcaConfermato, marcaContestato, riapriMese, segnaSollecito, getChiusuraByToken, chiusureInStato
- `lib/timbrature/sync.ts` (197 righe) — esporta: rapportoChiuso, abilitazione, mailChiave, nominativoRU, referenteRU, sincronizzaRecordRU, sincronizzaTuttoRU
- `scripts/diagnosi-mail-timbrature.mjs` (147 righe)
- `scripts/sync-timbrature-anagrafica.mjs` (245 righe)

### Manutenzioni

_14 file · 1727 righe_

- `app/(app)/dashboard/AssegnaTecnico.tsx` (102 righe)
- `app/(app)/dashboard/page.tsx` (74 righe)
- `app/(app)/dashboard/RichiestaCard.tsx` (265 righe)
- `app/(app)/gestione/[id]/GestioneForm.tsx` (201 righe)
- `app/(app)/gestione/[id]/page.tsx` (76 righe)
- `app/(app)/manutenzioni/page.tsx` (116 righe)
- `app/(app)/mie-richieste/page.tsx` (73 righe)
- `app/(app)/nuova-richiesta/NuovaRichiestaForm.tsx` (173 righe)
- `app/(app)/nuova-richiesta/page.tsx` (35 righe)
- `app/api/manutenzioni/[id]/route.ts` (206 righe)
- `app/api/manutenzioni/route.ts` (91 righe)
- `lib/manutenzioni/data.ts` (135 righe) — esporta: getRichiesteAperte, getRichiesteByEmail, getRichiestaById, creaRichiesta, aggiornaRichiesta
- `lib/manutenzioni/notifiche.ts` (106 righe) — esporta: notificaNuovaRichiesta, notificaTecnicoAssegnato, notificaChiusuraTicket
- `lib/strutture/data.ts` (74 righe) — esporta: getStrutture, centroCostoDiStruttura, getTecnici

### Costi strutture

_6 file · 880 righe_

- `app/(app)/cruscotto-costi/CruscottoCosti.tsx` (213 righe)
- `app/(app)/cruscotto-costi/page.tsx` (126 righe)
- `app/(app)/inserisci-costo/InserisciCostoForm.tsx` (264 righe)
- `app/(app)/inserisci-costo/page.tsx` (59 righe)
- `app/api/costi/route.ts` (81 righe)
- `lib/costi/data.ts` (137 righe) — esporta: creaCosto, getCosti, creaCostoDiretto

### Acquisti

_17 file · 4313 righe_

- `app/(app)/acquisti/gestione/GestioneAcquisti.tsx` (941 righe) ⚠️
- `app/(app)/acquisti/gestione/page.tsx` (59 righe)
- `app/(app)/acquisti/mie/MieRichiesteAcquisto.tsx` (225 righe)
- `app/(app)/acquisti/mie/page.tsx` (54 righe)
- `app/(app)/acquisti/nuova/NuovaRichiestaAcquistoForm.tsx` (277 righe)
- `app/(app)/acquisti/nuova/page.tsx` (45 righe)
- `app/(app)/acquisti/page.tsx` (149 righe)
- `app/api/acquisti/[id]/route.ts` (525 righe) ⚠️
- `app/api/acquisti/route.ts` (145 righe)
- `app/api/consegna/[token]/route.ts` (68 righe)
- `app/api/cron/acquisti/route.ts` (134 righe)
- `app/consegna/[token]/ConfermaConsegna.tsx` (147 righe)
- `app/consegna/[token]/page.tsx` (96 righe)
- `lib/acquisti/data.ts` (392 righe) — esporta: AREA_ACQUISTI, acquistiConfigurato, dataSoloGiorno, getAcquisti, getAcquistiByEmail, getAcquistoById, getAcquistoByToken, getFornitoriNoti, normalizzaNomeFornitore, aggiornaAcquisto, creaAcquisto, campiOrdine, campiPagamento, generaCostoDaAcquisto
- `lib/acquisti/flusso.ts` (231 righe) — esporta: baseApp, linkGestione, linkConsegna, strutturaPresidiata, referentiPresidio, luogoRitiro, consegnaPresidiata, emailRichiedente, emailGestori, registraEsitoConsegna, inviaRichiestaConferma, chiudiSenzaRiscontro
- `lib/acquisti/notifiche.ts` (394 righe) — esporta: destinatariAcquisti, notificaAcquistoUrgente, notificaAssegnazioneAcquisto, notificaDigestAcquisti, notificaEsitoValutazione, notificaOrdineEffettuato, notificaConfermaConsegna, notificaOrdineDaRitirare, notificaEsitoConsegna
- `scripts/provision-acquisti.mjs` (431 righe)

### Richiesta fattura

_14 file · 2943 righe_

- `app/(app)/richiesta-fattura/_componenti/CosaFatturare.tsx` (224 righe)
- `app/(app)/richiesta-fattura/_componenti/RicercaCliente.tsx` (167 righe)
- `app/(app)/richiesta-fattura/page.tsx` (47 righe)
- `app/(app)/richiesta-fattura/RichiestaFatturaForm.tsx` (473 righe)
- `app/api/clienti/[id]/route.ts` (32 righe)
- `app/api/fatture/route.ts` (142 righe)
- `docs/richiesta-fattura.md` (288 righe)
- `lib/clienti/data.ts` (296 righe) — esporta: clientiConfigurato, svuotaCacheClienti, caricaClienti, getIndiceClienti, getCliente, trovaClientePerCodici, differenze, salvaCliente
- `lib/fatture/centri-di-costo.ts` (21 righe) — esporta: getCentriDiCosto
- `lib/fatture/data.ts` (242 righe) — esporta: fattureConfigurato, creaRichiestaFattura, getRichiesteFattura, getRichiesteFatturaDi
- `lib/fatture/notifiche.ts` (201 righe) — esporta: destinatariFatture, notificaRichiestaFattura
- `scripts/import-clienti.mjs` (438 righe)
- `scripts/provision-clienti.mjs` (171 righe)
- `scripts/provision-fatture.mjs` (201 righe)

### Prestazioni occasionali

_33 file · 3922 righe_

- `app/(app)/prestazioni/attive/ChiudiPraticaButton.tsx` (49 righe)
- `app/(app)/prestazioni/attive/ChiusuraNotula.tsx` (94 righe)
- `app/(app)/prestazioni/attive/GeneraDocumentiButton.tsx` (70 righe)
- `app/(app)/prestazioni/attive/page.tsx` (125 righe)
- `app/(app)/prestazioni/attive/VerificaFirmaButton.tsx` (54 righe)
- `app/(app)/prestazioni/nuova/NuovaPrestazioneForm.tsx` (536 righe) ⚠️
- `app/(app)/prestazioni/nuova/page.tsx` (14 righe)
- `app/(app)/prestazioni/page.tsx` (71 righe)
- `app/api/docusign/callback/route.ts` (21 righe)
- `app/api/notula/[token]/conferma/route.ts` (96 righe)
- `app/api/notula/[token]/route.ts` (34 righe)
- `app/api/notula/[token]/sessione/route.ts` (88 righe)
- `app/api/prestatori/documenti/route.ts` (35 righe)
- `app/api/prestatori/route.ts` (26 righe)
- `app/api/prestazioni/[spItemId]/allegati-identita/route.ts` (95 righe)
- `app/api/prestazioni/[spItemId]/chiudi/route.ts` (56 righe)
- `app/api/prestazioni/[spItemId]/conferma/route.ts` (90 righe)
- `app/api/prestazioni/[spItemId]/documenti/route.ts` (156 righe)
- `app/api/prestazioni/[spItemId]/notula/route.ts` (127 righe)
- `app/api/prestazioni/[spItemId]/verifica-firma/route.ts` (32 righe)
- `app/api/prestazioni/route.ts` (180 righe)
- `app/notula/[token]/NotulaUploadForm.tsx` (92 righe)
- `app/notula/[token]/page.tsx` (48 righe)
- `docs/docusign-setup.md` (88 righe)
- `docs/prestazioni-fase2-setup.md` (94 righe)
- `docs/prestazioni-setup-sharepoint.md` (142 righe)
- `lib/prestazioni/casistiche-gdpr.ts` (51 righe) — esporta: CASISTICHE_GDPR, CASISTICHE_GDPR_KEYS, casisticaByKey, templateGdprPerCasistica
- `lib/prestazioni/data.ts` (383 righe) — esporta: sanitizeFolderName, nomeCartellaPrestatore, nomeSottocartella, ensureCartellaPrestazione, ensureCartellaDocumentiIdentita, haDocumentiIdentita, haDocumentiIdentitaPerCf, creaSessioneUpload, getWebUrlFile, uploadAllegato, getPrestazioniAttive, getPrestazioneById, creaPrestazione, aggiornaPrestazione, getTuttePrestazioni, getAnagraficaPrestatori, getPrestazioneByToken
- `lib/prestazioni/documenti.ts` (240 righe) — esporta: leggiAllegatiInformativi, sessoDaCF, dataEstesa, dataBreve, euro, segnapostoContratto, segnapostoGdpr, segnapostoImpegno, campiMancantiPerDocumenti, calcolaNotula, segnapostoNotula, generaNotula, generaDocumentiPrestazione
- `lib/prestazioni/docusign.ts` (234 righe) — esporta: isDocusignConfigured, getDocusignAccessToken, inviaBustaFirma, getEnvelopeStatus, downloadEnvelopeCombined
- `lib/prestazioni/firma.ts` (72 righe) — esporta: verificaEScaricaFirma, verificaFirmaById
- `lib/prestazioni/notifiche.ts` (236 righe) — esporta: notificaRiepilogoPrestazione, notificaModuliInformativi, notificaContrattoFirmato, notificaNotulaAlPrestatore, notificaNotulaCaricata, notificaPromemoriaFoglioOre
- `scripts/provision-prestazioni.mjs` (193 righe)

### Risorse Umane

_53 file · 12136 righe_

- `app/(app)/risorse-umane/CartellaDipendente.tsx` (269 righe)
- `app/(app)/risorse-umane/collaboratori/page.tsx` (13 righe)
- `app/(app)/risorse-umane/dipendenti/page.tsx` (8 righe)
- `app/(app)/risorse-umane/GestioneRU.tsx` (971 righe) ⚠️
- `app/(app)/risorse-umane/page.tsx` (92 righe)
- `app/(app)/risorse-umane/PaginaRU.tsx` (81 righe)
- `app/(app)/risorse-umane/tirocini/page.tsx` (8 righe)
- `app/api/risorse-umane/collaboratori/[id]/route.ts` (20 righe)
- `app/api/risorse-umane/collaboratori/export/route.ts` (16 righe)
- `app/api/risorse-umane/collaboratori/route.ts` (19 righe)
- `app/api/risorse-umane/dipendenti/[id]/cartella/route.ts` (59 righe)
- `app/api/risorse-umane/dipendenti/[id]/documenti/[docId]/route.ts` (40 righe)
- `app/api/risorse-umane/dipendenti/[id]/documenti/conferma/route.ts` (68 righe)
- `app/api/risorse-umane/dipendenti/[id]/documenti/route.ts` (80 righe)
- `app/api/risorse-umane/dipendenti/[id]/route.ts` (6 righe)
- `app/api/risorse-umane/dipendenti/[id]/scheda-socio/route.ts` (6 righe)
- `app/api/risorse-umane/dipendenti/export/route.ts` (6 righe)
- `app/api/risorse-umane/dipendenti/route.ts` (6 righe)
- `app/api/risorse-umane/tirocini/[id]/route.ts` (6 righe)
- `app/api/risorse-umane/tirocini/export/route.ts` (6 righe)
- `app/api/risorse-umane/tirocini/route.ts` (6 righe)
- `docs/piano-ru-sito-dedicato-accesso-delegato.md` (856 righe) ⚠️
- `docs/risorse-umane-setup.md` (95 righe)
- `docs/runbook-ru-passo2-3.md` (512 righe) ⚠️
- `lib/risorse-umane/api.ts` (320 righe) — esporta: AREA_RU, listHandlers, exportHandler, schedaSocioHandler, itemHandlers
- `lib/risorse-umane/data.ts` (452 righe) — esporta: getItems, getItem, creaItem, aggiornaItem, eliminaItem, validaInput, ensureCartellaDipendente, getDocumentiDipendente, creaSessioneUploadDocumento, caricaDocumentoDipendente, trovaSchedaPerEmail, caricaDocumentoInCartella, pdfDocumentoDipendente, eliminaDocumentoDipendente
- `lib/risorse-umane/export-scheda-socio.ts` (113 righe) — esporta: generaSchedaSocioBuffer, nomeFileSchedaSocio
- `lib/risorse-umane/export-xlsx.ts` (128 righe) — esporta: generaExportBuffer, nomeFileExport
- `lib/risorse-umane/fetch.ts` (40 righe) — esporta: messaggioErrore
- `lib/risorse-umane/gruppo.ts` (162 righe) — esporta: eMembroGruppoRU, invalidaCacheGruppoRU
- `scripts/aggiungi-colonna-ru.mjs` (117 righe)
- `scripts/completa-mail-aziendali.mjs` (300 righe)
- `scripts/crea-cartelle-dipendenti.mjs` (289 righe)
- `scripts/diagnosi-gruppo-ru.mjs` (171 righe)
- `scripts/diagnosi-stato-rapporto.mjs` (166 righe)
- `scripts/elimina-lista-collaboratori.mjs` (293 righe)
- `scripts/extract-da-accdb.py` (164 righe)
- `scripts/fix-cf-uscello-nicole.mjs` (110 righe)
- `scripts/import-cedolini-dipendenti.mjs` (477 righe)
- `scripts/import-quote-soci-2026.mjs` (584 righe) ⚠️
- `scripts/import-risorse-umane.mjs` (152 righe)
- `scripts/import-tel-mail.mjs` (1201 righe) ⚠️
- `scripts/import-titoli-albo.mjs` (1266 righe) ⚠️
- `scripts/migra-residenza-citta-indirizzo.mjs` (228 righe)
- `scripts/migra-ru-sito-dedicato.mjs` (671 righe) ⚠️
- `scripts/migrate-dipendenti-2026-07.mjs` (127 righe)
- `scripts/migrate-dipendenti-socio-2026-07.mjs` (126 righe)
- `scripts/migrate-ru-storico-2026-07.mjs` (221 righe)
- `scripts/migrate-unifica-collaboratori-2026-07.mjs` (233 righe)
- `scripts/provision-risorse-umane.mjs` (310 righe)
- `scripts/ru-assetto.mjs` (171 righe)
- `scripts/ru-chi-ha-scritto.mjs` (167 righe)
- `scripts/vercel-env-ru.sh` (128 righe)

### Inventario beni

_7 file · 1656 righe_

- `app/(app)/inventario/InventarioBeni.tsx` (457 righe)
- `app/(app)/inventario/page.tsx` (45 righe)
- `app/api/inventario/[id]/documento/conferma/route.ts` (68 righe)
- `app/api/inventario/[id]/documento/route.ts` (74 righe)
- `app/api/inventario/[id]/route.ts` (94 righe)
- `lib/inventario/data.ts` (476 righe) — esporta: inventarioConfigurato, getInventario, getBeneById, getBeniPerRichiesta, aggiornaBene, creaBeniDaRichiesta, aggiornaVitaBene, allineaBeniDaRichiesta, annullaBeniDaRichiesta, creaSessioneUploadDocumento, confermaDocumento
- `scripts/provision-inventario.mjs` (442 righe)

### Amministrazione · Permessi

_7 file · 762 righe_

- `app/(app)/amministrazione/permessi/GestionePermessi.tsx` (183 righe)
- `app/(app)/amministrazione/permessi/page.tsx` (45 righe)
- `app/api/permessi/[id]/route.ts` (41 righe)
- `app/api/permessi/route.ts` (67 righe)
- `lib/core/permessi.ts` (150 righe) — esporta: isAdmin, AREE_PERMESSI, getPermessi, getTutteAutorizzazioni, aggiungiAutorizzazione, rimuoviAutorizzazione, getUtentiPerArea
- `scripts/diagnosi-permessi.mjs` (99 righe)
- `scripts/provision-autorizzazioni.mjs` (177 righe)

### Amministrazione · Software

_8 file · 1434 righe_

- `app/(app)/amministrazione/software/GestioneSoftware.tsx` (524 righe) ⚠️
- `app/(app)/amministrazione/software/page.tsx` (51 righe)
- `app/api/software/[id]/fattura/conferma/route.ts` (62 righe)
- `app/api/software/[id]/fattura/route.ts` (63 righe)
- `app/api/software/[id]/route.ts` (106 righe)
- `app/api/software/route.ts` (88 righe)
- `lib/software/data.ts` (381 righe) — esporta: getSoftware, getSoftwareById, creaSoftware, aggiornaSoftware, sincronizzaCalendario, patchSoftwareFields, eliminaSoftware, creaSessioneUploadFattura, confermaFattura, caricaFattura
- `scripts/provision-software.mjs` (159 righe)

### Amministrazione (hub)

_1 file · 65 righe_

- `app/(app)/amministrazione/page.tsx` (65 righe)

### Log attività

_2 file · 313 righe_

- `docs/log-attivita-setup-sharepoint.md` (107 righe)
- `scripts/provision-log-attivita.mjs` (206 righe)

### Home / hub

_6 file · 322 righe_

- `app/(app)/amazing/page.tsx` (17 righe)
- `app/(app)/home/page.tsx` (253 righe)
- `app/(app)/layout.tsx` (17 righe)
- `app/globals.css` (10 righe)
- `app/layout.tsx` (16 righe)
- `app/page.tsx` (9 righe)

### Accesso / login

_3 file · 67 righe_

- `app/(auth)/login/page.tsx` (51 righe)
- `app/api/auth/[...nextauth]/route.ts` (4 righe)
- `middleware.ts` (12 righe)

### Infrastruttura condivisa (core)

_40 file · 5876 righe_

- `app/api/debug-fields/route.ts` (45 righe)
- `components/ui/Allegato.tsx` (83 righe)
- `components/ui/Banner.tsx` (34 righe)
- `components/ui/Campo.tsx` (200 righe)
- `components/ui/Header.tsx` (50 righe)
- `components/ui/Kpi.tsx` (50 righe)
- `components/ui/LogoutButton.tsx` (18 righe)
- `components/ui/Modale.tsx` (71 righe)
- `components/ui/Pill.tsx` (45 righe)
- `components/ui/StatoBadge.tsx` (16 righe)
- `components/ui/Voce.tsx` (17 righe)
- `components/ui/Vuoto.tsx` (15 righe)
- `lib/core/api-guard.ts` (61 righe) — esporta: guardArea, guardMembroRU
- `lib/core/audit.ts` (90 righe) — esporta: logAzione
- `lib/core/auth.ts` (116 righe) — esporta: hasPermesso
- `lib/core/calendar.ts` (102 righe) — esporta: parseEmails, buildEventoScadenza, creaEvento, aggiornaEvento, eliminaEvento
- `lib/core/graph-delegato.ts` (221 righe) — esporta: AccessoNegatoRU, graphPerUtente, graphApplicativo, graphRU, isRiautenticazione, isAccessoNegato
- `lib/core/graph.ts` (185 righe) — esporta: graphGet, graphGetOrNull, graphGetBinary, graphPutBinary, graphPost, graphPatch, graphDelete
- `lib/core/mailer.ts` (78 righe) — esporta: ADMIN_EMAIL, sendEmail, BOX, RIGA, TABELLA, BTN
- `lib/core/ms-token.ts` (308 righe) — esporta: SCOPE_DELEGATO, RiautenticazioneRichiesta, salvaTokenDelegato, eliminaTokenDelegato, getDelegatedToken
- `lib/core/sp.ts` (96 righe) — esporta: SITE, LIST, listBase, PREFER_NON_INDEXED, lookupValue, SP_USER_INFO_LIST, getSPUserEmailByLookupId, getSPUserLookupId, getParametro
- `lib/core/supabase.ts` (28 righe) — esporta: supabase
- `lib/core/upload-diretto.ts` (146 righe) — esporta: BLOCCO_UPLOAD, MAX_UPLOAD_BYTES, maxUploadMb, inviaFileABlocchi, erroreRisposta, caricaDirettamente
- `next.config.mjs` (21 righe)
- `scripts/get-site-id.mjs` (122 righe)
- `scripts/mappa.mjs` (309 righe)
- `scripts/pulisci-choice.mjs` (146 righe)
- `scripts/riordino.mjs` (457 righe)
- `scripts/setup-env-locale.mjs` (322 righe)
- `scripts/sp-liste.mjs` (113 righe)
- `tailwind.config.ts` (48 righe)
- `types/acquisti.ts` (367 righe)
- `types/clienti.ts` (181 righe)
- `types/fatture.ts` (644 righe) ⚠️
- `types/inventario.ts` (122 righe)
- `types/manutenzioni.ts` (159 righe)
- `types/prestazioni.ts` (68 righe)
- `types/risorse-umane.ts` (312 righe)
- `types/software.ts` (76 righe)
- `types/timbrature.ts` (334 righe)

## Dipendenze fra moduli `lib/`

Un modulo usato da **3 o più aree** è trasversale (🔴): toccarlo per una sola area rischia di
rompere le altre, ed è il motivo per cui una modifica piccola diventa costosa. Sono questi i
candidati da spezzare per area o da spostare in `lib/core/` (vedi `CLAUDE.md` § Convenzioni).

| Modulo `lib/` | Aree che lo usano | N. file | Importato da |
|---|---|---:|---|
| `lib/core/auth` 🔴 | Accesso / login · Acquisti · Amministrazione (hub) · Amministrazione · Permessi · Amministrazione · Software · Costi strutture · Home / hub · Infrastruttura condivisa (core) · Inventario beni · Manutenzioni · Prestazioni occasionali · Richiesta fattura · Risorse Umane · Timbrature · Foglio ore | 44 | app/(app)/acquisti/gestione/page.tsx, app/(app)/acquisti/mie/page.tsx, app/(app)/acquisti/page.tsx, app/(app)/amministrazione/page.tsx, app/(app)/amministrazione/permessi/page.tsx, app/(app)/amministrazione/software/page.tsx, … |
| `lib/core/graph` 🔴 | (non mappato) · Acquisti · Amministrazione · Permessi · Amministrazione · Software · Costi strutture · Infrastruttura condivisa (core) · Inventario beni · Manutenzioni · Prestazioni occasionali · Richiesta fattura · Risorse Umane | 18 | app/api/debug-fields/route.ts, lib/acquisti/data.ts, lib/centri-costo/data.ts, lib/clienti/data.ts, lib/core/audit.ts, lib/core/calendar.ts, … |
| `lib/core/audit` 🔴 | Acquisti · Amministrazione · Permessi · Amministrazione · Software · Costi strutture · Inventario beni · Manutenzioni · Prestazioni occasionali · Richiesta fattura · Risorse Umane · Timbrature · Foglio ore | 30 | app/api/acquisti/[id]/route.ts, app/api/acquisti/route.ts, app/api/consegna/[token]/route.ts, app/api/costi/route.ts, app/api/fatture/route.ts, app/api/foglio-ore/[token]/route.ts, … |
| `lib/core/upload-diretto` 🔴 | Acquisti · Amministrazione · Software · Infrastruttura condivisa (core) · Inventario beni · Prestazioni occasionali · Risorse Umane · Timbrature · Foglio ore | 12 | app/(app)/acquisti/gestione/GestioneAcquisti.tsx, app/(app)/amministrazione/software/GestioneSoftware.tsx, app/(app)/prestazioni/nuova/NuovaPrestazioneForm.tsx, app/(app)/risorse-umane/CartellaDipendente.tsx, app/(app)/risorse-umane/timbrature/_componenti/VariazioniOrario.tsx, app/api/inventario/[id]/documento/route.ts, … |
| `lib/core/api-guard` 🔴 | Acquisti · Amministrazione · Permessi · Amministrazione · Software · Inventario beni · Risorse Umane | 15 | app/api/acquisti/route.ts, app/api/inventario/[id]/documento/conferma/route.ts, app/api/inventario/[id]/documento/route.ts, app/api/inventario/[id]/route.ts, app/api/permessi/[id]/route.ts, app/api/permessi/route.ts, … |
| `lib/core/sp` 🔴 | (non mappato) · Acquisti · Amministrazione · Permessi · Costi strutture · Manutenzioni | 11 | app/api/acquisti/[id]/route.ts, app/api/acquisti/route.ts, app/api/manutenzioni/[id]/route.ts, app/api/manutenzioni/route.ts, lib/acquisti/data.ts, lib/acquisti/flusso.ts, … |
| `lib/core/mailer` 🔴 | Acquisti · Manutenzioni · Prestazioni occasionali · Richiesta fattura · Timbrature · Foglio ore | 5 | lib/acquisti/notifiche.ts, lib/fatture/notifiche.ts, lib/manutenzioni/notifiche.ts, lib/prestazioni/notifiche.ts, lib/timbrature/notifiche.ts |
| `lib/strutture/data` 🔴 | Acquisti · Costi strutture · Inventario beni · Manutenzioni | 12 | app/(app)/acquisti/gestione/page.tsx, app/(app)/acquisti/nuova/page.tsx, app/(app)/cruscotto-costi/page.tsx, app/(app)/dashboard/page.tsx, app/(app)/gestione/[id]/page.tsx, app/(app)/inserisci-costo/page.tsx, … |
| `lib/core/permessi` 🔴 | Acquisti · Amministrazione · Permessi · Infrastruttura condivisa (core) · Timbrature · Foglio ore | 7 | app/(app)/acquisti/gestione/page.tsx, app/(app)/amministrazione/permessi/page.tsx, app/api/permessi/[id]/route.ts, app/api/permessi/route.ts, lib/acquisti/flusso.ts, lib/core/auth.ts, … |
| `lib/centri-costo/data` 🔴 | Acquisti · Costi strutture · Richiesta fattura | 6 | app/(app)/acquisti/nuova/NuovaRichiestaAcquistoForm.tsx, app/(app)/acquisti/nuova/page.tsx, app/(app)/cruscotto-costi/page.tsx, app/(app)/inserisci-costo/InserisciCostoForm.tsx, app/(app)/inserisci-costo/page.tsx, lib/fatture/centri-di-costo.ts |
| `lib/costi/data` 🔴 | Acquisti · Costi strutture · Manutenzioni | 5 | app/(app)/cruscotto-costi/page.tsx, app/(app)/inserisci-costo/page.tsx, app/api/costi/route.ts, app/api/manutenzioni/[id]/route.ts, lib/acquisti/data.ts |
| `lib/prestazioni/data` | Prestazioni occasionali · Timbrature · Foglio ore | 15 | app/(app)/prestazioni/attive/page.tsx, app/api/cron/promemoria-ore/route.ts, app/api/notula/[token]/conferma/route.ts, app/api/notula/[token]/route.ts, app/api/notula/[token]/sessione/route.ts, app/api/prestatori/documenti/route.ts, … |
| `lib/acquisti/data` | Acquisti · Inventario beni | 13 | app/(app)/acquisti/gestione/page.tsx, app/(app)/acquisti/mie/page.tsx, app/(app)/acquisti/page.tsx, app/(app)/inventario/page.tsx, app/api/acquisti/[id]/route.ts, app/api/acquisti/route.ts, … |
| `lib/core/graph-delegato` | Risorse Umane · Timbrature · Foglio ore | 12 | app/(app)/risorse-umane/PaginaRU.tsx, app/api/risorse-umane/dipendenti/[id]/cartella/route.ts, app/api/risorse-umane/dipendenti/[id]/documenti/[docId]/route.ts, app/api/risorse-umane/dipendenti/[id]/documenti/conferma/route.ts, app/api/risorse-umane/dipendenti/[id]/documenti/route.ts, app/api/timbrature/hr/profilo/allegato/route.ts, … |
| `lib/risorse-umane/data` | Risorse Umane · Timbrature · Foglio ore | 8 | app/(app)/risorse-umane/PaginaRU.tsx, app/api/risorse-umane/dipendenti/[id]/cartella/route.ts, app/api/risorse-umane/dipendenti/[id]/documenti/[docId]/route.ts, app/api/risorse-umane/dipendenti/[id]/documenti/conferma/route.ts, app/api/risorse-umane/dipendenti/[id]/documenti/route.ts, app/api/timbrature/hr/profilo/allegato/route.ts, … |
| `lib/inventario/data` | Acquisti · Inventario beni | 7 | app/(app)/acquisti/gestione/page.tsx, app/(app)/acquisti/page.tsx, app/(app)/inventario/page.tsx, app/api/acquisti/[id]/route.ts, app/api/inventario/[id]/documento/conferma/route.ts, app/api/inventario/[id]/documento/route.ts, … |
| `lib/prestazioni/notifiche` | Prestazioni occasionali · Timbrature · Foglio ore | 6 | app/api/cron/promemoria-ore/route.ts, app/api/notula/[token]/conferma/route.ts, app/api/prestazioni/[spItemId]/conferma/route.ts, app/api/prestazioni/[spItemId]/documenti/route.ts, app/api/prestazioni/[spItemId]/notula/route.ts, lib/prestazioni/firma.ts |
| `lib/prestazioni/documenti` | Prestazioni occasionali · Timbrature · Foglio ore | 3 | app/api/cron/promemoria-ore/route.ts, app/api/prestazioni/[spItemId]/documenti/route.ts, app/api/prestazioni/[spItemId]/notula/route.ts |
| `lib/prestazioni/firma` | Prestazioni occasionali · Timbrature · Foglio ore | 2 | app/api/cron/promemoria-ore/route.ts, app/api/prestazioni/[spItemId]/verifica-firma/route.ts |
| `lib/timbrature/sync` | Risorse Umane · Timbrature · Foglio ore | 2 | app/api/timbrature/hr/sincronizza/route.ts, lib/risorse-umane/api.ts |
| `lib/timbrature/data` | Timbrature · Foglio ore | 22 | app/(app)/timbrature/page.tsx, app/(app)/timbrature/validazione/page.tsx, app/api/cron/sollecito-timbrature/route.ts, app/api/cron/timbrature-alert/route.ts, app/api/foglio-ore/[token]/route.ts, app/api/timbrature/[id]/route.ts, … |
| `lib/timbrature/guard` | Timbrature · Foglio ore | 16 | app/api/timbrature/[id]/route.ts, app/api/timbrature/assenza/route.ts, app/api/timbrature/hr/dipendente/[id]/route.ts, app/api/timbrature/hr/forza/route.ts, app/api/timbrature/hr/profilo/allegato/route.ts, app/api/timbrature/hr/profilo/route.ts, … |
| `lib/risorse-umane/api` | Risorse Umane | 7 | app/api/risorse-umane/dipendenti/[id]/route.ts, app/api/risorse-umane/dipendenti/[id]/scheda-socio/route.ts, app/api/risorse-umane/dipendenti/export/route.ts, app/api/risorse-umane/dipendenti/route.ts, app/api/risorse-umane/tirocini/[id]/route.ts, app/api/risorse-umane/tirocini/export/route.ts, … |
| `lib/timbrature/flusso` | Timbrature · Foglio ore | 6 | app/api/cron/sollecito-timbrature/route.ts, app/api/cron/timbrature-alert/route.ts, app/api/foglio-ore/[token]/route.ts, app/api/timbrature/hr/forza/route.ts, app/api/timbrature/hr/valida/route.ts, app/foglio-ore/[token]/page.tsx |
| `lib/timbrature/date` | Timbrature · Foglio ore | 6 | lib/timbrature/anagrafica.ts, lib/timbrature/assenze.ts, lib/timbrature/data.ts, lib/timbrature/riepilogo.ts, lib/timbrature/righe.ts, lib/timbrature/stati.ts |
| `lib/acquisti/flusso` | Acquisti | 5 | app/(app)/acquisti/mie/page.tsx, app/api/acquisti/[id]/route.ts, app/api/acquisti/route.ts, app/api/consegna/[token]/route.ts, app/api/cron/acquisti/route.ts |
| `lib/software/data` | Amministrazione · Software | 5 | app/(app)/amministrazione/software/page.tsx, app/api/software/[id]/fattura/conferma/route.ts, app/api/software/[id]/fattura/route.ts, app/api/software/[id]/route.ts, app/api/software/route.ts |
| `lib/manutenzioni/data` | Manutenzioni | 5 | app/(app)/dashboard/page.tsx, app/(app)/gestione/[id]/page.tsx, app/(app)/mie-richieste/page.tsx, app/api/manutenzioni/[id]/route.ts, app/api/manutenzioni/route.ts |
| `lib/timbrature/anagrafica` | Timbrature · Foglio ore | 5 | lib/timbrature/assenze.ts, lib/timbrature/data.ts, lib/timbrature/riepilogo.ts, lib/timbrature/righe.ts, lib/timbrature/stati.ts |
| `lib/acquisti/notifiche` | Acquisti | 4 | app/api/acquisti/[id]/route.ts, app/api/acquisti/route.ts, app/api/cron/acquisti/route.ts, lib/acquisti/flusso.ts |
| `lib/core/supabase` | Timbrature · Foglio ore | 4 | lib/timbrature/anagrafica.ts, lib/timbrature/riepilogo.ts, lib/timbrature/righe.ts, lib/timbrature/stati.ts |
| `lib/prestazioni/casistiche-gdpr` | Prestazioni occasionali | 3 | app/(app)/prestazioni/nuova/NuovaPrestazioneForm.tsx, app/api/prestazioni/route.ts, lib/prestazioni/documenti.ts |
| `lib/clienti/data` | Richiesta fattura | 3 | app/(app)/richiesta-fattura/page.tsx, app/api/clienti/[id]/route.ts, app/api/fatture/route.ts |
| `lib/timbrature/notifiche` | Timbrature · Foglio ore | 3 | app/api/cron/sollecito-timbrature/route.ts, app/api/cron/timbrature-alert/route.ts, lib/timbrature/flusso.ts |
| `lib/timbrature/righe` | Timbrature · Foglio ore | 3 | lib/timbrature/assenze.ts, lib/timbrature/data.ts, lib/timbrature/riepilogo.ts |
| `lib/timbrature/stati` | Timbrature · Foglio ore | 3 | lib/timbrature/data.ts, lib/timbrature/riepilogo.ts, lib/timbrature/righe.ts |
| `lib/fatture/data` | Richiesta fattura | 2 | app/(app)/richiesta-fattura/page.tsx, app/api/fatture/route.ts |
| `lib/risorse-umane/fetch` | Risorse Umane | 2 | app/(app)/risorse-umane/CartellaDipendente.tsx, app/(app)/risorse-umane/GestioneRU.tsx |
| `lib/manutenzioni/notifiche` | Manutenzioni | 2 | app/api/manutenzioni/[id]/route.ts, app/api/manutenzioni/route.ts |
| `lib/prestazioni/docusign` | Prestazioni occasionali | 2 | app/api/prestazioni/[spItemId]/documenti/route.ts, lib/prestazioni/firma.ts |
| `lib/core/ms-token` | Infrastruttura condivisa (core) | 2 | lib/core/auth.ts, lib/core/graph-delegato.ts |
| `lib/timbrature/festivita` | Timbrature · Foglio ore | 2 | lib/timbrature/assenze.ts, lib/timbrature/riepilogo.ts |
| `lib/fatture/centri-di-costo` | Richiesta fattura | 1 | app/(app)/richiesta-fattura/page.tsx |
| `lib/fatture/notifiche` | Richiesta fattura | 1 | app/api/fatture/route.ts |
| `lib/risorse-umane/gruppo` | Infrastruttura condivisa (core) | 1 | lib/core/auth.ts |
| `lib/risorse-umane/export-scheda-socio` | Risorse Umane | 1 | lib/risorse-umane/api.ts |
| `lib/risorse-umane/export-xlsx` | Risorse Umane | 1 | lib/risorse-umane/api.ts |
| `lib/core/calendar` | Amministrazione · Software | 1 | lib/software/data.ts |
| `lib/timbrature/assenze` | Timbrature · Foglio ore | 1 | lib/timbrature/data.ts |
| `lib/timbrature/riepilogo` | Timbrature · Foglio ore | 1 | lib/timbrature/data.ts |
| `lib/timbrature/foglio-ore-xlsx` | Timbrature · Foglio ore | 1 | lib/timbrature/flusso.ts |
| `lib/auth` | Risorse Umane | 1 | docs/piano-ru-sito-dedicato-accesso-delegato.md |

## File non mappati ad alcuna area

Se qui compare qualcosa, è un'area nuova (o rinominata): aggiungila all'elenco `AREE`
in `scripts/mappa.mjs` e a `CLAUDE.md`.

- `docs/cda-planner.md` (150 righe)
- `docs/centri-di-costo-piano.md` (178 righe)
- `docs/controllo-di-gestione-piano.md` (237 righe)
- `lib/centri-costo/data.ts` (67 righe)
- `scripts/applica-indirizzi-split.mjs` (227 righe)
- `scripts/backfill-centro-costo-costi.mjs` (181 righe)
- `scripts/chi-manca-token-ru.mjs` (128 righe)
- `scripts/diagnosi-matricole-pulse.mjs` (286 righe)
- `scripts/estrai-matricole-cedolini.py` (129 righe)
- `scripts/popola-matricola-pulse.mjs` (217 righe)
- `scripts/provision-centri-costo-collegamenti.mjs` (249 righe)
- `scripts/provision-centri-costo.mjs` (245 righe)
- `scripts/strutture-senza-centro-costo.mjs` (152 righe)
- `scripts/unifica-strutture.mjs` (270 righe)
- `scripts/verbale-a-planner.mjs` (545 righe)
