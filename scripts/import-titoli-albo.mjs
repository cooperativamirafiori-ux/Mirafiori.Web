#!/usr/bin/env node
/**
 * Integrazione "Info Titoli e Albo" nei Dipendenti — v3 (luglio 2026).
 *
 * Titolo di studio e Qualifica separati; la QUALIFICA ora è NORMALIZZATA sulle
 * voci del menu a tendina (es. "laurea Scienze dell'Educazione" -> "Educatore
 * Professionale", "qualifica OSS" -> "OSS").
 *
 *   - Albo (tendina): "si albo"->"Albo generico"; "albo assist"->"Albo Assistenti
 *     Sociali"; gli stati "no/attesa/dich" NON sono iscrizioni (vuoti + report).
 *   - TitoloStudio (tendina): livello di studio dedotto.
 *   - Qualifica (tendina normalizzata).
 *
 * Scrittura idempotente e autocorrettiva: se il campo è vuoto scrive; se contiene
 * un valore scritto da una versione PRECEDENTE di questo import (accorpato v1 o
 * grezzo v2) lo aggiorna al valore corretto; se è un dato pre-esistente diverso
 * lo segnala come CONFLITTO senza toccarlo. Se la qualifica normalizzata è vuota
 * ma il campo contiene un nostro valore precedente, lo svuota.
 *
 * Uso (da web/):
 *   node scripts/import-titoli-albo.mjs           # dry-run
 *   node scripts/import-titoli-albo.mjs --apply   # applica
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

const DATA = [
  {
    "nome": "GIADA",
    "cognome": "AGLIANO",
    "albo": "",
    "titoloStudio": "Diploma scuola superiore",
    "qualificaRaw": "",
    "qualificaNorm": "",
    "titoloOrig": "diploma",
    "titolo2": ""
  },
  {
    "nome": "ELDO",
    "cognome": "AGNESONE",
    "albo": "",
    "titoloStudio": "Diploma scuola superiore",
    "qualificaRaw": "tecnico in attività sociali",
    "qualificaNorm": "Altro",
    "titoloOrig": "diploma di maturità in tecnico in attività sociali",
    "titolo2": ""
  },
  {
    "nome": "ELENA",
    "cognome": "ALI'",
    "albo": "",
    "titoloStudio": "Laurea magistrale",
    "qualificaRaw": "Scienze dell'Educazione - Psi clinica",
    "qualificaNorm": "Psicologo",
    "titoloOrig": "Laurea Scienze dell'Educazione - magistrale Psi clinica",
    "titolo2": ""
  },
  {
    "nome": "CRISTINA",
    "cognome": "AMANTE",
    "albo": "",
    "titoloStudio": "Licenza media",
    "qualificaRaw": "",
    "qualificaNorm": "",
    "titoloOrig": "licenza media",
    "titolo2": ""
  },
  {
    "nome": "ALICE",
    "cognome": "AMEDEO",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "MARIKA",
    "cognome": "ARMANDI",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze dell'educazione",
    "titolo2": "maturità"
  },
  {
    "nome": "ELEONORA",
    "cognome": "BALLARIO",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore pofessionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Educatore pofessionale",
    "titolo2": ""
  },
  {
    "nome": "DARIA",
    "cognome": "BLUNDETTO",
    "albo": "si albo",
    "titoloStudio": "Diploma scuola superiore",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "diploma Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "IRENE",
    "cognome": "BONASSO",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "SIMONA",
    "cognome": "BORTOLAI",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Psicologia",
    "qualificaNorm": "Psicologo",
    "titoloOrig": "laurea in Psicologia",
    "titolo2": ""
  },
  {
    "nome": "MATTEO",
    "cognome": "BORTOLOMASI",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "NADIA",
    "cognome": "BURDESE",
    "albo": "",
    "titoloStudio": "Laurea magistrale",
    "qualificaRaw": "con abilitazione all insegnamento nelle scuole di grado preparatorio",
    "qualificaNorm": "Altro",
    "titoloOrig": "diploma magistrale con abilitazione all insegnamento nelle scuole di grado preparatorio",
    "titolo2": ""
  },
  {
    "nome": "GIORGIO",
    "cognome": "CADORE",
    "albo": "si albo",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "educatore professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica educatore professionale",
    "titolo2": ""
  },
  {
    "nome": "CHIARA",
    "cognome": "CALISTO",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "scienze dell'educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea in scienze dell'educazione",
    "titolo2": ""
  },
  {
    "nome": "CLAUDIA",
    "cognome": "CARENA",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "EVELINA",
    "cognome": "CARRETTO",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "OLGA",
    "cognome": "CASINI",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "ERICA",
    "cognome": "CERUTTI",
    "albo": "albo assist sociali",
    "titoloStudio": "Laurea",
    "qualificaRaw": "servizio sociale",
    "qualificaNorm": "Assistente Sociale",
    "titoloOrig": "laurea in servizio sociale",
    "titolo2": ""
  },
  {
    "nome": "CHIARA",
    "cognome": "CHIRONE",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "OSS",
    "qualificaNorm": "OSS",
    "titoloOrig": "OSS",
    "titolo2": "diploma magistrale"
  },
  {
    "nome": "VALENTINA",
    "cognome": "CICIRIELLO",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "ROBERTA",
    "cognome": "CICIRIELLO",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "lingue e letterature straniere",
    "qualificaNorm": "Altro",
    "titoloOrig": "laurea lingue e letterature straniere",
    "titolo2": ""
  },
  {
    "nome": "POLATO",
    "cognome": "CINZIA",
    "albo": "",
    "titoloStudio": "Licenza media",
    "qualificaRaw": "",
    "qualificaNorm": "",
    "titoloOrig": "terza media",
    "titolo2": ""
  },
  {
    "nome": "MILENA",
    "cognome": "CLARA",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "ELISA CRISTINA",
    "cognome": "COMINETTI",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Programmazione dei Servizi Educativi",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea in Programmazione dei Servizi Educativi",
    "titolo2": ""
  },
  {
    "nome": "GUIDO",
    "cognome": "CONFALONIERI",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "LUCA",
    "cognome": "CORDARO",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "FEDERICA",
    "cognome": "COTELLA",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "ALESSIA",
    "cognome": "CRAVERO",
    "albo": "attesa risposta",
    "titoloStudio": "Laurea",
    "qualificaRaw": "educatore professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea educatore professionale",
    "titolo2": ""
  },
  {
    "nome": "junior francesco",
    "cognome": "D'AGOSTINO",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore pofessionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Educatore pofessionale",
    "titolo2": ""
  },
  {
    "nome": "RACHELE",
    "cognome": "DALLA SAVINA",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "scienze dell'educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea in scienze dell'educazione",
    "titolo2": ""
  },
  {
    "nome": "FLORA MICHELINA",
    "cognome": "DE BENEDITTIS",
    "albo": "",
    "titoloStudio": "Diploma scuola superiore",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "diploma Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "MICHELA",
    "cognome": "DE BENEDITTIS",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "ELISABETTA",
    "cognome": "DEMO",
    "albo": "",
    "titoloStudio": "Laurea magistrale",
    "qualificaRaw": "psicologia dello sviluppo",
    "qualificaNorm": "Psicologo",
    "titoloOrig": "magistrale psicologia dello sviluppo",
    "titolo2": ""
  },
  {
    "nome": "ELEONORA MARIA",
    "cognome": "DESSI",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "operatore amministrativo",
    "qualificaNorm": "Operatore Amministrativo",
    "titoloOrig": "qualifica operatore amministrativo",
    "titolo2": ""
  },
  {
    "nome": "DAVIDE",
    "cognome": "DI GREGORIO",
    "albo": "",
    "titoloStudio": "",
    "qualificaRaw": "attesa invio",
    "qualificaNorm": "",
    "titoloOrig": "attesa invio",
    "titolo2": "maturità - scienze edu in corsoforse"
  },
  {
    "nome": "ROSALIA",
    "cognome": "DI NOTO",
    "albo": "",
    "titoloStudio": "Licenza media",
    "qualificaRaw": "",
    "qualificaNorm": "",
    "titoloOrig": "licenza media",
    "titolo2": ""
  },
  {
    "nome": "FRANCESCO",
    "cognome": "DIRENZO",
    "albo": "",
    "titoloStudio": "Laurea magistrale",
    "qualificaRaw": "Prorammazione servizi",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "magistrale Prorammazione servizi",
    "titolo2": ""
  },
  {
    "nome": "FABRIZIO LORENZO",
    "cognome": "FERRERO",
    "albo": "",
    "titoloStudio": "Licenza media",
    "qualificaRaw": "",
    "qualificaNorm": "",
    "titoloOrig": "licenza media",
    "titolo2": ""
  },
  {
    "nome": "SIMONA",
    "cognome": "FINETTI",
    "albo": "si albo",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "SARA",
    "cognome": "GARNERO",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "ELENA",
    "cognome": "GASCONE",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "OSS",
    "qualificaNorm": "OSS",
    "titoloOrig": "OSS",
    "titolo2": "diploma tecnico dei servizi sociali"
  },
  {
    "nome": "GIULIA",
    "cognome": "GAZZERA",
    "albo": "no domanda albo ancora",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'Educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze dell'Educazione",
    "titolo2": ""
  },
  {
    "nome": "MASSIMILIANO",
    "cognome": "GIANNELLI",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "scienze dell'educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea scienze dell'educazione",
    "titolo2": ""
  },
  {
    "nome": "MARTINA",
    "cognome": "GIARROCCO",
    "albo": "no albo - dich si",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Prima Infanzia",
    "qualificaNorm": "Educatore Prima Infanzia",
    "titoloOrig": "qualifica Educatore Prima Infanzia",
    "titolo2": ""
  },
  {
    "nome": "COSTANZA",
    "cognome": "GILARDINO",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "ALESSIO",
    "cognome": "GIORDANO",
    "albo": "no albo-dichiarazione",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'Educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Scienze dell'Educazione",
    "titolo2": ""
  },
  {
    "nome": "CHIARA",
    "cognome": "GIOVARA",
    "albo": "",
    "titoloStudio": "Diploma scuola superiore",
    "qualificaRaw": "operatrice turistica",
    "qualificaNorm": "Altro",
    "titoloOrig": "diploma operatrice turistica",
    "titolo2": ""
  },
  {
    "nome": "ANDREA",
    "cognome": "GRANATO",
    "albo": "",
    "titoloStudio": "Diploma scuola superiore",
    "qualificaRaw": "tecnica no titolo in archivio",
    "qualificaNorm": "",
    "titoloOrig": "maturità tecnica no titolo in archivio",
    "titolo2": ""
  },
  {
    "nome": "SIMONA",
    "cognome": "GREGORIO",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "OSS",
    "qualificaNorm": "OSS",
    "titoloOrig": "qualifica OSS",
    "titolo2": "diploma perito aziendale corrispondente in lingue estere"
  },
  {
    "nome": "GIORGIA",
    "cognome": "GULLI'",
    "albo": "no albo-dichiarazione",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'Educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze dell'Educazione",
    "titolo2": ""
  },
  {
    "nome": "KASEM MOHAMED",
    "cognome": "IBRAHIM",
    "albo": "no albo - richiedi dich",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze Edu",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze Edu",
    "titolo2": ""
  },
  {
    "nome": "CRISTINA",
    "cognome": "IVALDI",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "MARTINA",
    "cognome": "LAMMENDOLA",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "STEFANIA",
    "cognome": "LAPONE",
    "albo": "",
    "titoloStudio": "",
    "qualificaRaw": "attesa invio",
    "qualificaNorm": "",
    "titoloOrig": "attesa invio",
    "titolo2": "diploma grafico - master teatro sociale e comunità"
  },
  {
    "nome": "STEFANIA",
    "cognome": "LEO",
    "albo": "albo chiedi info o dichiarazione",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale - Psicologia",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale - Laurea in Psicologia",
    "titolo2": "P.IVA"
  },
  {
    "nome": "MARIA SILVIA",
    "cognome": "LO SARDO",
    "albo": "si albo",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "LUCA",
    "cognome": "LOREFICE",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Prima Infanzia",
    "qualificaNorm": "Educatore Prima Infanzia",
    "titoloOrig": "laurea Educatore Prima Infanzia",
    "titolo2": ""
  },
  {
    "nome": "ANGELITA",
    "cognome": "LOTTI",
    "albo": "",
    "titoloStudio": "",
    "qualificaRaw": "Psicologia criminolgica e forense",
    "qualificaNorm": "Psicologo",
    "titoloOrig": "Psicologia criminolgica e forense",
    "titolo2": ""
  },
  {
    "nome": "CLAUDIA",
    "cognome": "MANERO",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Prima Infanzia",
    "qualificaNorm": "Educatore Prima Infanzia",
    "titoloOrig": "qualifica Educatore Prima Infanzia",
    "titolo2": ""
  },
  {
    "nome": "SILVIA",
    "cognome": "MARELLO",
    "albo": "",
    "titoloStudio": "Licenza media",
    "qualificaRaw": "",
    "qualificaNorm": "",
    "titoloOrig": "licenza media",
    "titolo2": ""
  },
  {
    "nome": "STEFANO",
    "cognome": "MARTINO",
    "albo": "",
    "titoloStudio": "Diploma scuola superiore",
    "qualificaRaw": "scientifica",
    "qualificaNorm": "",
    "titoloOrig": "maturità scientifica",
    "titolo2": "in corso scienze edu"
  },
  {
    "nome": "MANUEL",
    "cognome": "MASIELLO",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "OSS",
    "qualificaNorm": "OSS",
    "titoloOrig": "qualifica OSS",
    "titolo2": ""
  },
  {
    "nome": "CHIARA",
    "cognome": "MAZZITELLI",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "corso - Scienze dell'educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "in corso - laurea Scienze dell'educazione",
    "titolo2": "diploma liceo artistico"
  },
  {
    "nome": "STEFANIA",
    "cognome": "MELISSARI",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "DENISE",
    "cognome": "MERLINO",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "ALESSANDRO",
    "cognome": "MILONE",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "CINZIA",
    "cognome": "MOSCA",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale Sociopedagogico",
    "qualificaNorm": "Educatore Professionale Sociopedagogico",
    "titoloOrig": "qualifica Educatore Professionale Sociopedagogico",
    "titolo2": ""
  },
  {
    "nome": "SARA",
    "cognome": "NICOLA",
    "albo": "no albo-attesa dichiarazione",
    "titoloStudio": "Laurea",
    "qualificaRaw": "servizio sociale",
    "qualificaNorm": "Assistente Sociale",
    "titoloOrig": "laurea servizio sociale",
    "titolo2": "attesa invio"
  },
  {
    "nome": "moyna",
    "cognome": "nodone",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "scienza educazione SNT",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "scienza educazione SNT",
    "titolo2": ""
  },
  {
    "nome": "MIHAELA PETRONELA",
    "cognome": "NOSEC",
    "albo": "si albo",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale Sociopedagogico",
    "qualificaNorm": "Educatore Professionale Sociopedagogico",
    "titoloOrig": "qualifica Educatore Professionale Sociopedagogico",
    "titolo2": ""
  },
  {
    "nome": "CATERINA",
    "cognome": "PALETTA",
    "albo": "",
    "titoloStudio": "Diploma scuola superiore",
    "qualificaRaw": "ADEST - dirigente comunità",
    "qualificaNorm": "ADEST",
    "titoloOrig": "ADEST - dirigente comunità diploma",
    "titolo2": ""
  },
  {
    "nome": "EMANUELA",
    "cognome": "PARISI",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "psicologia clinica",
    "qualificaNorm": "Psicologo",
    "titoloOrig": "laurea psicologia clinica",
    "titolo2": ""
  },
  {
    "nome": "NICOLO'",
    "cognome": "PECETTO",
    "albo": "attesa dichiarazione",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'Educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze dell'Educazione",
    "titolo2": ""
  },
  {
    "nome": "FABIO",
    "cognome": "PEISINO",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "GIORGIA",
    "cognome": "PICATTO",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Tenica della Riabilitazione Psichiatrica",
    "qualificaNorm": "Tecnico della Riabilitazione Psichiatrica",
    "titoloOrig": "laurea Tenica della Riabilitazione Psichiatrica",
    "titolo2": ""
  },
  {
    "nome": "CINZIA",
    "cognome": "POLATO",
    "albo": "",
    "titoloStudio": "Licenza media",
    "qualificaRaw": "",
    "qualificaNorm": "",
    "titoloOrig": "licenza media",
    "titolo2": ""
  },
  {
    "nome": "AGOSTINO",
    "cognome": "PRESTILEO",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "educatore professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica educatore professionale",
    "titolo2": ""
  },
  {
    "nome": "SARA",
    "cognome": "PROCACCINI",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "attesa invio cv",
    "qualificaNorm": "",
    "titoloOrig": "laurea attesa invio cv",
    "titolo2": ""
  },
  {
    "nome": "VALENTINA",
    "cognome": "PROFETA",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "FRANCESCA",
    "cognome": "RAGGIOTTO",
    "albo": "no albo-dichiarazione",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'Educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze dell'Educazione",
    "titolo2": ""
  },
  {
    "nome": "ANNA",
    "cognome": "RAIMONDO",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore pofessionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Educatore pofessionale",
    "titolo2": "attesa invio"
  },
  {
    "nome": "ALICE",
    "cognome": "RODIGHIERO",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "scienze dell'educazione socio culturale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea scienze dell'educazione socio culturale",
    "titolo2": ""
  },
  {
    "nome": "DARIO",
    "cognome": "RONCO",
    "albo": "no albo-dichiarazione",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'Educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze dell'Educazione",
    "titolo2": ""
  },
  {
    "nome": "MARIO",
    "cognome": "RUGGIERO",
    "albo": "no albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "corso - Scienze dell'educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "in corso - laurea Scienze dell'educazione",
    "titolo2": ""
  },
  {
    "nome": "ALESSANDRO",
    "cognome": "RUSSO",
    "albo": "albo chiedi info o dichiarazione",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "ANNA",
    "cognome": "RUSSO",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "OSS",
    "qualificaNorm": "OSS",
    "titoloOrig": "qualifica OSS",
    "titolo2": ""
  },
  {
    "nome": "DARIO",
    "cognome": "RUSSO",
    "albo": "",
    "titoloStudio": "",
    "qualificaRaw": "attesa invio",
    "qualificaNorm": "",
    "titoloOrig": "attesa invio",
    "titolo2": "laurea magistrale psic clinica e comunità"
  },
  {
    "nome": "MARIA CRISTINA",
    "cognome": "SALAMONE",
    "albo": "si albo",
    "titoloStudio": "",
    "qualificaRaw": "attesa invio",
    "qualificaNorm": "",
    "titoloOrig": "attesa invio",
    "titolo2": "laurea psic criminale e investigativa"
  },
  {
    "nome": "MADDALENA",
    "cognome": "SAPONARA",
    "albo": "domanda avviata",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Giurisprudenza",
    "qualificaNorm": "Altro",
    "titoloOrig": "laurea in Giurisprudenza",
    "titolo2": ""
  },
  {
    "nome": "CHIARA",
    "cognome": "SBARAINI",
    "albo": "no albo - dich si",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'Educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze dell'Educazione",
    "titolo2": ""
  },
  {
    "nome": "ANNA",
    "cognome": "SCARSO",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "FEDERICA",
    "cognome": "SCHINELLA",
    "albo": "no albo-dichiarazione",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'Educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze dell'Educazione",
    "titolo2": ""
  },
  {
    "nome": "MICHELE",
    "cognome": "SILBA",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "CARMEN",
    "cognome": "SIVIERO",
    "albo": "",
    "titoloStudio": "Licenza media",
    "qualificaRaw": "",
    "qualificaNorm": "",
    "titoloOrig": "licenza media",
    "titolo2": ""
  },
  {
    "nome": "MARTINA",
    "cognome": "SPATARO",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'Educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze dell'Educazione",
    "titolo2": ""
  },
  {
    "nome": "MARTA",
    "cognome": "STRUMIA",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "(Edu Prof corso)",
    "qualificaNorm": "",
    "titoloOrig": "diploma (Edu Prof laurea in corso)",
    "titolo2": ""
  },
  {
    "nome": "ADRIANA",
    "cognome": "SUMINI",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Pedagogia VO",
    "qualificaNorm": "Pedagogista",
    "titoloOrig": "laurea in Pedagogia VO",
    "titolo2": ""
  },
  {
    "nome": "GIORGIA",
    "cognome": "TASCA",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'Educazione indirizzo socio sanitario VO",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze dell'Educazione indirizzo socio sanitario VO",
    "titolo2": ""
  },
  {
    "nome": "NICOLE",
    "cognome": "TEMPO",
    "albo": "",
    "titoloStudio": "Laurea triennale",
    "qualificaRaw": "PSICOLOGIA TRIENNALE",
    "qualificaNorm": "Psicologo",
    "titoloOrig": "LAUREA PSICOLOGIA TRIENNALE",
    "titolo2": "attesa invio"
  },
  {
    "nome": "ANNA",
    "cognome": "TORLO",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Assistente Educativo",
    "qualificaNorm": "Assistente Educativo",
    "titoloOrig": "qualifica Assistente Educativo",
    "titolo2": ""
  },
  {
    "nome": "ELISABETTA",
    "cognome": "VAL",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "fermieristica Pediatrica",
    "qualificaNorm": "Infermiere",
    "titoloOrig": "Laurea Infermieristica Pediatrica",
    "titolo2": ""
  },
  {
    "nome": "MARIA CISTINA",
    "cognome": "VALENTINI",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Lettere Moderne",
    "qualificaNorm": "Altro",
    "titoloOrig": "Laurea Lettere Moderne",
    "titolo2": ""
  },
  {
    "nome": "IRENE",
    "cognome": "VERNA",
    "albo": "si albo",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "Laurea Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "PIERFRANCESCO",
    "cognome": "VERRA",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "MICHELA",
    "cognome": "VERSACE",
    "albo": "",
    "titoloStudio": "Licenza media",
    "qualificaRaw": "",
    "qualificaNorm": "",
    "titoloOrig": "licenza media",
    "titolo2": ""
  },
  {
    "nome": "LUISA",
    "cognome": "ZAMPINI",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "Educatore Professionale",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "qualifica Educatore Professionale",
    "titolo2": ""
  },
  {
    "nome": "DEVISA",
    "cognome": "ZOTAJ",
    "albo": "",
    "titoloStudio": "Laurea",
    "qualificaRaw": "Scienze dell'Educazione",
    "qualificaNorm": "Educatore Professionale",
    "titoloOrig": "laurea Scienze dell'Educazione",
    "titolo2": ""
  },
  {
    "nome": "ROSSANA",
    "cognome": "ZOTTOLI",
    "albo": "",
    "titoloStudio": "Qualifica Professionale",
    "qualificaRaw": "ADEST",
    "qualificaNorm": "ADEST",
    "titoloOrig": "qualifica ADEST",
    "titolo2": ""
  }
]

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[''`.]/g, '').replace(/\s+/g, ' ').trim()
}
const chiave = (cog, nome) => `${norm(cog)}|${norm(nome)}`

function mapAlbo(raw) {
  const s = norm(raw)
  if (!s) return null
  if (s.includes('assist')) return 'Albo Assistenti Sociali'
  if (s.startsWith('si albo')) return 'Albo generico'
  return null
}

/** Valore accorpato scritto dall'import v1 (per riconoscerlo). */
function v1Accorpato(r) {
  const t1 = (r.titoloOrig || '').trim(), t2 = (r.titolo2 || '').trim()
  if (!t1 && !t2) return ''
  if (t1 && t2) return `${t1} (${t2})`
  return t1 || t2
}
/** Insieme dei valori Qualifica che una nostra versione precedente può aver scritto. */
function valoriPrecedenti(r) {
  return [r.qualificaRaw, v1Accorpato(r)].filter(Boolean).map(norm)
}

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = val
    }
  } catch { /* env già impostate */ }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

async function graph(token, method, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${t}`)
  return t ? JSON.parse(t) : {}
}

async function getAll(token, site, listId) {
  const out = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=Cognome,Nome,Albo,TitoloStudio,Qualifica)&$top=200`
  while (url) {
    const res = await graph(token, 'GET', url)
    out.push(...(res.value || []))
    const next = res['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

async function main() {
  loadEnvLocal()
  const site = process.env.SHAREPOINT_SITE_ID
  const listId = process.env.SP_LIST_DIPENDENTI
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_DIPENDENTI'])
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  console.log(`-> Modalità: ${APPLY ? 'APPLICA' : 'DRY-RUN (nessuna modifica)'}`)
  const token = await getToken()
  const items = await getAll(token, site, listId)
  console.log(`-> ${items.length} dipendenti in SharePoint, ${DATA.length} righe nel file`)

  const idx = new Map()
  for (const it of items) {
    const f = it.fields || {}
    idx.set(chiave(f.Cognome, f.Nome), it)
    idx.set(chiave(f.Nome, f.Cognome), it)
  }

  let alboSet = 0, tsSet = 0, qSet = 0, qFix = 0, qClear = 0
  const conflitti = [], nonTrovati = [], alboPending = []

  for (const r of DATA) {
    const it = idx.get(chiave(r.cognome, r.nome)) || idx.get(chiave(r.nome, r.cognome))
    const alboVal = mapAlbo(r.albo)
    if (r.albo && !alboVal) alboPending.push(`${r.nome} ${r.cognome} — "${r.albo}"`)
    if (!it) { nonTrovati.push(`${r.nome} ${r.cognome}`); continue }
    const f = it.fields || {}
    const patch = {}

    if (alboVal) {
      const cur = (f.Albo || '').trim()
      if (!cur) { patch.Albo = alboVal; alboSet++ }
      else if (norm(cur) !== norm(alboVal)) conflitti.push(`${r.nome} ${r.cognome} · Albo: SP="${cur}" file="${alboVal}"`)
    }
    if (r.titoloStudio) {
      const cur = (f.TitoloStudio || '').trim()
      if (!cur) { patch.TitoloStudio = r.titoloStudio; tsSet++ }
      else if (norm(cur) !== norm(r.titoloStudio)) conflitti.push(`${r.nome} ${r.cognome} · Titolo studio: SP="${cur}" file="${r.titoloStudio}"`)
    }
    {
      const cur = (f.Qualifica || '').trim()
      const prev = valoriPrecedenti(r)
      const target = r.qualificaNorm
      if (target) {
        if (!cur) { patch.Qualifica = target; qSet++ }
        else if (norm(cur) === norm(target)) { /* già corretto */ }
        else if (prev.includes(norm(cur))) { patch.Qualifica = target; qFix++ }
        else conflitti.push(`${r.nome} ${r.cognome} · Qualifica: SP="${cur}" file="${target}"`)
      } else if (cur && prev.includes(norm(cur))) {
        patch.Qualifica = ''; qClear++
      }
    }

    if (Object.keys(patch).length === 0) continue
    if (APPLY) await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/items/${it.id}/fields`, patch)
    else console.log(`  ${r.nome} ${r.cognome}:`, patch)
  }

  console.log('\n============================================================')
  console.log(`Albo compilati (erano vuoti):         ${alboSet}`)
  console.log(`Titolo di studio compilati (vuoti):   ${tsSet}`)
  console.log(`Qualifica compilate (erano vuote):    ${qSet}`)
  console.log(`Qualifica CORRETTE/normalizzate:      ${qFix}`)
  console.log(`Qualifica svuotate (era solo titolo): ${qClear}`)
  console.log(`\nCONFLITTI (campo pieno e diverso, NON toccati): ${conflitti.length}`)
  conflitti.forEach((c) => console.log('  ! ' + c))
  console.log(`\nNOMI NON TROVATI in SharePoint: ${nonTrovati.length}`)
  nonTrovati.forEach((n) => console.log('  ? ' + n))
  console.log(`\nALBO da verificare a mano (lasciati vuoti): ${alboPending.length}`)
  alboPending.forEach((a) => console.log('  . ' + a))
  if (!APPLY) console.log('\nRilancia con --apply per applicare.')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
