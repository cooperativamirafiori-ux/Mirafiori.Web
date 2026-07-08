#!/usr/bin/env node
/**
 * Integrazione "ELENCO TEL E MAIL COOP MIRAFIORI" nei Dipendenti (luglio 2026) — v2.
 * Fogli usati: SOCI DIPENDENTI, DIPENDENTI no soci, COOP B SOCI E DIPENDENTI.
 *
 * MATCH per nome tollerante: prima esatto (token ordinati); se non trova, prova
 * per SOTTOINSIEME (basta cognome + almeno un nome: i token di uno contenuti
 * nell'altro), purché la corrispondenza sia UNICA. Righe non-persona
 * (legenda, cessati, un solo token) vengono ignorate.
 *
 * Politica di scrittura:
 *   - MailPersonale (da "email 1"):  scritta SOLO se vuota; se diversa -> CONFLITTO
 *   - CellAziendale / CellPrivato:   il FILE VINCE (sovrascrive) quando ha un valore
 *   - LivelloContrattuale:           scritto SOLO se vuoto
 *   - Mansione (da "denominazione"): il FILE VINCE
 *
 * Uso (da web/):  node scripts/import-tel-mail.mjs [--apply]
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const DATA = [
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "AGNESONE ELDO",
    "mailPersonale": "eldo.agnesone@libero.it",
    "cellAz": "",
    "cellPriv": "3474161569",
    "livello": "",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "ALI' ELENA",
    "mailPersonale": "elena.ali@libero.it",
    "cellAz": "3457075908",
    "cellPriv": "3461253168",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "AMEDEO ALICE",
    "mailPersonale": "alice491@libero.it",
    "cellAz": "3929933878",
    "cellPriv": "",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "ARMANDI MARIKA",
    "mailPersonale": "a.marika@hotmail.it",
    "cellAz": "",
    "cellPriv": "3383714609",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "BALLARIO ELEONORA",
    "mailPersonale": "eleonora.ballario@gmail.com",
    "cellAz": "3451529602",
    "cellPriv": "3456675966",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "BERT ELISA",
    "mailPersonale": "elisaa.bert@gmail.com",
    "cellAz": "",
    "cellPriv": "3480977182",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "BLUNDETTO DARIA",
    "mailPersonale": "dariablundetto@gmail.com",
    "cellAz": "",
    "cellPriv": "3203554087",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "BONASSO IRENE",
    "mailPersonale": "irene.bonasso@gmail.com",
    "cellAz": "3440779829",
    "cellPriv": "3395869917",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "BORTOLAI SIMONA",
    "mailPersonale": "simoemassi@gmail.com",
    "cellAz": "3465004532",
    "cellPriv": "3479313073",
    "livello": "E2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "BORTOLOMASI MATTEO",
    "mailPersonale": "bortolomasim@gmail.com",
    "cellAz": "3407440585",
    "cellPriv": "3456265483",
    "livello": "C3",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "CARENA CLAUDIA",
    "mailPersonale": "claudia.carena@cooperativamirafiori.com",
    "cellAz": "3357411624",
    "cellPriv": "",
    "livello": "F2",
    "mansione": "Impiegato"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "CASINI OLGA",
    "mailPersonale": "olga.casini89@gmail.com",
    "cellAz": "3401932119",
    "cellPriv": "3460815211",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "CAVALLO EMANUELE",
    "mailPersonale": "emanuele86cavallo@gmail.com",
    "cellAz": "",
    "cellPriv": "3467642188",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "CICIRIELLO VALENTINA",
    "mailPersonale": "valentinaciciriello5@gmail.com",
    "cellAz": "",
    "cellPriv": "3470570231",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "CLARA MILENA",
    "mailPersonale": "milena.clara1987@gmail.com",
    "cellAz": "",
    "cellPriv": "3488756315",
    "livello": "D1",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "COMINETTI ELISA",
    "mailPersonale": "elicomix@gmail.com",
    "cellAz": "3939608925",
    "cellPriv": "3483949980",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "CONFALONIERI GUIDO",
    "mailPersonale": "guidoconfalonieri@gmail.com",
    "cellAz": "3939609454",
    "cellPriv": "",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "CORDARO LUCA",
    "mailPersonale": "luca.cordaro@cooperativamirafiori.com",
    "cellAz": "3357411619",
    "cellPriv": "",
    "livello": "F2",
    "mansione": "Impiegato"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "DE BENEDITTIS FLORA MICHELINA",
    "mailPersonale": "flora.debenedittis@hotmail.it",
    "cellAz": "33574116223475654748",
    "cellPriv": "3425735574",
    "livello": "E2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "DE BENEDITTIS MICHELA",
    "mailPersonale": "michela.debenedittis@gmail.com",
    "cellAz": "3465004232",
    "cellPriv": "3484451093",
    "livello": "E2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "DESSI ELEONORA",
    "mailPersonale": "eleonoradessi7@gmail.com",
    "cellAz": "",
    "cellPriv": "3450707142",
    "livello": "B1",
    "mansione": "Impiegato"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "DESCLOS GRISELDA",
    "mailPersonale": "desclosgriselda@gmail.com",
    "cellAz": "3423858555",
    "cellPriv": "3926303600",
    "livello": "D1",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "DI RENZO FRANCESCO LUCA",
    "mailPersonale": "francescoluca.direnzo@gmail.com",
    "cellAz": "",
    "cellPriv": "3801057701",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "FERRARO ANNA",
    "mailPersonale": "anna.ferraro70@gmail.com",
    "cellAz": "",
    "cellPriv": "3395097483",
    "livello": "",
    "mansione": "Assistente Sociale"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "FERRERO FABRIZIO",
    "mailPersonale": "iziomalibu1970@hotmail.it",
    "cellAz": "",
    "cellPriv": "3394783729",
    "livello": "B1",
    "mansione": "Operatore dell'inserimento lavorativo"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "FINETTI SIMONA",
    "mailPersonale": "simonafinetti73@gmail.com",
    "cellAz": "",
    "cellPriv": "3939607972",
    "livello": "D3",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "GASCONE ELENA",
    "mailPersonale": "ele_g95@yahoo.it",
    "cellAz": "",
    "cellPriv": "3403532945",
    "livello": "C2",
    "mansione": "OSS"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "GAZZERA GIULIA",
    "mailPersonale": "giugazzera@gmail.com",
    "cellAz": "",
    "cellPriv": "3311659624",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "GIANNELLI MASSIMILIANO",
    "mailPersonale": "trimo69@yahoo.it",
    "cellAz": "3497837231",
    "cellPriv": "",
    "livello": "D3",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "GIARROCCO MARTINA",
    "mailPersonale": "martinagiarrocco@gmail.com",
    "cellAz": "",
    "cellPriv": "3450781554",
    "livello": "D1",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "GILARDINO COSTANZA",
    "mailPersonale": "costanza.gilardino@virgilio.it",
    "cellAz": "3491932706",
    "cellPriv": "3383004284",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "GIORDANO ALESSIO",
    "mailPersonale": "ale.giordano93@gmail.com",
    "cellAz": "",
    "cellPriv": "3458812789",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "GRANATO ANDREA",
    "mailPersonale": "andrea.granato@cooperativamirafiori.com",
    "cellAz": "",
    "cellPriv": "3387070935",
    "livello": "E2",
    "mansione": "Impiegato"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "GREGORIO SIMONA",
    "mailPersonale": "luckyesimona@libero.it",
    "cellAz": "",
    "cellPriv": "3496082110",
    "livello": "C2",
    "mansione": "OSS"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "GULLI GIORGIA",
    "mailPersonale": "giorgia.gulli@gmail.com",
    "cellAz": "3450980762",
    "cellPriv": "3474801822",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "LAPONE STEFANIA",
    "mailPersonale": "lapones@libero.it",
    "cellAz": "",
    "cellPriv": "3917982437",
    "livello": "D1",
    "mansione": "Grafico"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "LO SARDO SILVIA",
    "mailPersonale": "silvia.losardo@libero.it",
    "cellAz": "",
    "cellPriv": "3355738230",
    "livello": "F2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "LOREFICE LUCA",
    "mailPersonale": "luca.lorefice@stud.unifi.it",
    "cellAz": "",
    "cellPriv": "3314051621",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "MANERO CALUDIA",
    "mailPersonale": "claudiamanero10@gmail.com",
    "cellAz": "",
    "cellPriv": "3472923404",
    "livello": "D1",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "MARTINO STEFANO",
    "mailPersonale": "stefano.martino88@yahoo.it",
    "cellAz": "3465004206",
    "cellPriv": "3703282340",
    "livello": "E2",
    "mansione": "Impiegato"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "MELISSARI STEFANIA",
    "mailPersonale": "stefania.melissari@hotmail.it",
    "cellAz": "3476564748",
    "cellPriv": "",
    "livello": "E2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "MILONE ALESSANDRO",
    "mailPersonale": "alessandro.milone25@gmail.com",
    "cellAz": "",
    "cellPriv": "3482533408",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "MOSCA CINZIA",
    "mailPersonale": "cinx85@libero.it",
    "cellAz": "3497837199",
    "cellPriv": "",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "NARCISO MARCO",
    "mailPersonale": "marco.narciso@outlook.it",
    "cellAz": "3408414564",
    "cellPriv": "3394877653",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "NOSEC MIHAELA PETRONELA",
    "mailPersonale": "mihanosec@yahoo.com",
    "cellAz": "",
    "cellPriv": "3920309936",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "PALETTA CATERINA",
    "mailPersonale": "caterina.1968@libero.it",
    "cellAz": "",
    "cellPriv": "3396413369",
    "livello": "D1",
    "mansione": "OSS"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "PECETTO NICOLO'",
    "mailPersonale": "peks93@hotmail.it",
    "cellAz": "3426380735",
    "cellPriv": "3891162517",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "PEISINO FABIO",
    "mailPersonale": "fabio.peisino@libero.it",
    "cellAz": "",
    "cellPriv": "3384735706",
    "livello": "D3",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "PIACQUADDIO GIOVANNA",
    "mailPersonale": "piacq@libero.it",
    "cellAz": "",
    "cellPriv": "339734058",
    "livello": "",
    "mansione": "Assistente Sociale"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "PICATTO GIORGIA",
    "mailPersonale": "giorgiapicatto95@gmail.com",
    "cellAz": "",
    "cellPriv": "3464267642",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "POZELLA MANOLITA",
    "mailPersonale": "manolitapozella@gmail.com",
    "cellAz": "",
    "cellPriv": "3387598320",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "PROCACCINI SARA",
    "mailPersonale": "procaccini.sara@gmail.com",
    "cellAz": "",
    "cellPriv": "3467674048",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "PROFETA VALENTINA",
    "mailPersonale": "valeprofeta@gmail.com",
    "cellAz": "",
    "cellPriv": "3408672936",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "RAGGIOTTO Francesca",
    "mailPersonale": "francesca.raggiotto@hotmail.it",
    "cellAz": "",
    "cellPriv": "3345064223",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "RAIMONDO ANNA",
    "mailPersonale": "anna.raimondo.19@gmail.com",
    "cellAz": "",
    "cellPriv": "3347067027",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "RONCO DARIO",
    "mailPersonale": "dario.ronco@yahoo.it",
    "cellAz": "3407440585",
    "cellPriv": "3336906102",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "RUSSO ALESSANDRO",
    "mailPersonale": "russo.alessandro79@gmail.com",
    "cellAz": "3465004499",
    "cellPriv": "",
    "livello": "D3",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "RUSSO DARIO",
    "mailPersonale": "dariovich@gmail.com",
    "cellAz": "3357411621",
    "cellPriv": "3455876295",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "SAPONARA MADDALENA",
    "mailPersonale": "",
    "cellAz": "3939607931",
    "cellPriv": "3402371917",
    "livello": "D3",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "SCARSO ANNA",
    "mailPersonale": "anna.scarso@hotmail.com",
    "cellAz": "3939609459",
    "cellPriv": "3393794536",
    "livello": "D3",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "SCHINELLA FEDERICA",
    "mailPersonale": "s.federica90@hotmail.it",
    "cellAz": "3356066201",
    "cellPriv": "3203927190",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "SPATOLA ANGELO",
    "mailPersonale": "ange.spatola@gmail.com",
    "cellAz": "",
    "cellPriv": "3403765958",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "SUMINI ADRIANA",
    "mailPersonale": "adriana.sumini@cooperativamirafiori.com",
    "cellAz": "3939609224",
    "cellPriv": "3398219193",
    "livello": "F2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "TASCA GIORGIA",
    "mailPersonale": "giorgia.ts@gmail.com",
    "cellAz": "",
    "cellPriv": "3293420853",
    "livello": "D2",
    "mansione": "Impiegato"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "TEMPO NICOLE",
    "mailPersonale": "nicolee.tempo@gmail.com",
    "cellAz": "",
    "cellPriv": "3408277899",
    "livello": "D1",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "TORLO ANNA",
    "mailPersonale": "to.anna@alice.it",
    "cellAz": "",
    "cellPriv": "3497467277",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "USSCELLO GABRIELE",
    "mailPersonale": "gabriele.uscello@gmail.com",
    "cellAz": "",
    "cellPriv": "3469490048",
    "livello": "",
    "mansione": "Impiegato"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "TORTA MARIAELENA",
    "mailPersonale": "mariaelena.torta@edu.unito.it",
    "cellAz": "3478917408",
    "cellPriv": "3495720782",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "VERNA IRENE",
    "mailPersonale": "irene.verna.95@gmail.com",
    "cellAz": "3478917408",
    "cellPriv": "3452659978",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "VERRA PIERFRANCESCO",
    "mailPersonale": "pierfrancesco1968@libero.it",
    "cellAz": "3357411623",
    "cellPriv": "",
    "livello": "D3",
    "mansione": "Educatore"
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "legenda",
    "mailPersonale": "",
    "cellAz": "",
    "cellPriv": "",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "SOCI DIPENDENTI",
    "nomeFile": "CESSATI",
    "mailPersonale": "",
    "cellAz": "",
    "cellPriv": "",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "ALBERTO ANDREA",
    "mailPersonale": "andrea.alberto01@gmail.com",
    "cellAz": "",
    "cellPriv": "3336295091",
    "livello": "D1",
    "mansione": "Educatore"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "ALMIRON VALENTINA",
    "mailPersonale": "valentina1almiron@gmail.com",
    "cellAz": "",
    "cellPriv": "3476930465",
    "livello": "",
    "mansione": "Educatore"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "BALDASSARRE DANIELE",
    "mailPersonale": "dnlbaldassarre@gmail.com",
    "cellAz": "",
    "cellPriv": "3774832974",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "BOSCO DAVIDE",
    "mailPersonale": "davidebosco97@gmail.com",
    "cellAz": "",
    "cellPriv": "3491468199",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "CADORE GIORGIO",
    "mailPersonale": "samuraigiorgio@gmail.com",
    "cellAz": "3406896088",
    "cellPriv": "3471970047",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "CAMINITI AURORA",
    "mailPersonale": "aurora.caminiti@outlook.com",
    "cellAz": "",
    "cellPriv": "3314514777",
    "livello": "",
    "mansione": "Educatore"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "CORDERO CHIARA CAROLA",
    "mailPersonale": "cordero.chiara01@gmail.com",
    "cellAz": "",
    "cellPriv": "3274740188",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "CUSUMANO EMILY",
    "mailPersonale": "emily.cusumano@hotmail.com",
    "cellAz": "331587357",
    "cellPriv": "",
    "livello": "",
    "mansione": "Educatore"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "FATIGA FRANCESCO",
    "mailPersonale": "francescofatiga@tiscali.it",
    "cellAz": "",
    "cellPriv": "3398001559",
    "livello": "",
    "mansione": "Educatore"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "GRAZIANO NOEMI",
    "mailPersonale": "noe8912@icloud.com",
    "cellAz": "",
    "cellPriv": "3883294421",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "GUARNIERI GIULIA",
    "mailPersonale": "guarnierigiulia33@gmail.com",
    "cellAz": "",
    "cellPriv": "3921390095",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "LEONARDI MARTINA",
    "mailPersonale": "martinaleonardi08@gmail.com",
    "cellAz": "",
    "cellPriv": "3487582500",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "MAZZOLA GINEVRA",
    "mailPersonale": "ginevra.mazzola9@gmail.com",
    "cellAz": "",
    "cellPriv": "3714226997",
    "livello": "",
    "mansione": "Educatore"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "NODONE MOYNA",
    "mailPersonale": "m.nodone@hotmail.it",
    "cellAz": "3423604249",
    "cellPriv": "3334282742",
    "livello": "",
    "mansione": "Educatore"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "PERZIANO ANNALISA",
    "mailPersonale": "anna_perz_it@yahoo.it",
    "cellAz": "3407234393",
    "cellPriv": "3384247035",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "QUARANTA SARA",
    "mailPersonale": "saraquaranta96@gmail.com",
    "cellAz": "",
    "cellPriv": "3381706348",
    "livello": "",
    "mansione": "OSS"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "ROMEO MARIASERENA",
    "mailPersonale": "romeoserena700@gmail.com",
    "cellAz": "",
    "cellPriv": "3457670660",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "SUBRIZIO SARAH",
    "mailPersonale": "sarah.subrizio@gmail.com",
    "cellAz": "",
    "cellPriv": "3488784258",
    "livello": "D1",
    "mansione": "Educatore"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "TAURONE ANNA MARIA",
    "mailPersonale": "ataurone@gmail.com",
    "cellAz": "",
    "cellPriv": "3495720782",
    "livello": "C2",
    "mansione": "OSS"
  },
  {
    "foglio": "DIPENDENTI no soci",
    "nomeFile": "USAI SONIA",
    "mailPersonale": "lolalba1966@gmail.com",
    "cellAz": "",
    "cellPriv": "3289512375",
    "livello": "D2",
    "mansione": "Educatore"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "AHMED AFTAB",
    "mailPersonale": "aftabahmad3844@gmail.com",
    "cellAz": "",
    "cellPriv": "3479127375",
    "livello": "A2",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "ATTISANO TERESA",
    "mailPersonale": "teresa.attisano@gmail.com",
    "cellAz": "",
    "cellPriv": "3494562662",
    "livello": "",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "BENIGNO ALESSANDRA",
    "mailPersonale": "alessandra.benigno8@gmail.com",
    "cellAz": "",
    "cellPriv": "3201852681",
    "livello": "",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "BONATO NOEMI JOEL",
    "mailPersonale": "noemi.joele@gmail.com",
    "cellAz": "",
    "cellPriv": "3452193541",
    "livello": "B1",
    "mansione": ""
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "BURDESE NADIA",
    "mailPersonale": "burdesenadia@gmail.com",
    "cellAz": "",
    "cellPriv": "3890143270",
    "livello": "D1",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "BUZZI ALESSADNRO",
    "mailPersonale": "ale.bpb@gmail.com",
    "cellAz": "",
    "cellPriv": "3494529903",
    "livello": "D2",
    "mansione": "Impiegato"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "COTUNOAEI ANDREI ROBERTO",
    "mailPersonale": "rcotunoaei@gmail.com",
    "cellAz": "",
    "cellPriv": "3425079998",
    "livello": "B1",
    "mansione": ""
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "DI NARDO LUIGI",
    "mailPersonale": "luigidinardo2003@gmail.com",
    "cellAz": "",
    "cellPriv": "3389888326",
    "livello": "B1",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "DOGARU IONELA",
    "mailPersonale": "",
    "cellAz": "",
    "cellPriv": "",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "FERRERO MADIAP",
    "mailPersonale": "madiap.ferrero07@gmail.com",
    "cellAz": "",
    "cellPriv": "3892585596",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "FUCCI MARIA ANTONIETTA",
    "mailPersonale": "mariafucci621@gmail.com",
    "cellAz": "",
    "cellPriv": "3248431831",
    "livello": "B1",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "GENTILE NOEMI",
    "mailPersonale": "",
    "cellAz": "",
    "cellPriv": "",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "IMAN MAMUN",
    "mailPersonale": "dhushor.prohor@gmail.com",
    "cellAz": "",
    "cellPriv": "",
    "livello": "",
    "mansione": ""
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "JALLOW KARAMOKO",
    "mailPersonale": "jallow.karamoko1980@gmail.com",
    "cellAz": "",
    "cellPriv": "3802452746",
    "livello": "",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "LETTIERI JESSICA",
    "mailPersonale": "jessicalettieri6@gmail.com",
    "cellAz": "",
    "cellPriv": "3456121501",
    "livello": "",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "LUSCI ASIA",
    "mailPersonale": "",
    "cellAz": "",
    "cellPriv": "",
    "livello": "",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "MORELLO ELENA",
    "mailPersonale": "elenamorello84@gmail.com",
    "cellAz": "",
    "cellPriv": "3420603090",
    "livello": "",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "NIGRELLI GIUSEPPE",
    "mailPersonale": "schefbe@alice.it",
    "cellAz": "",
    "cellPriv": "",
    "livello": "",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "Palumbo Federico",
    "mailPersonale": "federico.palumbo@arteintorino.com",
    "cellAz": "",
    "cellPriv": "3463664419",
    "livello": "D1",
    "mansione": "Impiegato"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "YOUNES AMIRA",
    "mailPersonale": "amirayounes977@gmail.com",
    "cellAz": "",
    "cellPriv": "3515893897",
    "livello": "B1",
    "mansione": "Addetto alla sala"
  },
  {
    "foglio": "COOP B SOCI E DIPENDENTI",
    "nomeFile": "soci",
    "mailPersonale": "",
    "cellAz": "",
    "cellPriv": "",
    "livello": "",
    "mansione": ""
  }
]

/** Correzioni nomi con refusi nel file -> come sono in anagrafica SharePoint. */
const ALIAS = {
  'manero caludia': 'MANERO CLAUDIA',
  'buzzi alessadnro': 'BUZZI ALESSANDRO',
  'romeo mariaserena': 'ROMEO MARIA SERENA',
  'usscello gabriele': 'USCELLO GABRIELE',
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[''`.]/g, '').replace(/\s+/g, ' ').trim()
}
function tokSet(s) {
  return new Set(norm(s).split(' ').filter(Boolean))
}
const keyOf = (set) => [...set].sort().join(' ')
const subset = (a, b) => [...a].every((t) => b.has(t)) // a ⊆ b

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = val
    }
  } catch {}
}
async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
  })
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}
async function graph(token, method, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${t}`)
  return t ? JSON.parse(t) : {}
}
async function getAll(token, site, listId) {
  const out = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=Cognome,Nome,MailPersonale,CellAziendale,CellPrivato,LivelloContrattuale,Mansione)&$top=200`
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
  for (const k of ['GRAPH_TENANT_ID','GRAPH_CLIENT_ID','GRAPH_CLIENT_SECRET','SHAREPOINT_SITE_ID','SP_LIST_DIPENDENTI'])
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  console.log(`-> Modalità: ${APPLY ? 'APPLICA' : 'DRY-RUN (nessuna modifica)'}`)
  const token = await getToken()
  const items = await getAll(token, site, listId)
  console.log(`-> ${items.length} dipendenti in SharePoint, ${DATA.length} righe nel file`)

  const sp = items.map((it) => {
    const f = it.fields || {}
    return { it, toks: tokSet(`${f.Cognome || ''} ${f.Nome || ''}`) }
  })
  const exact = new Map()
  for (const s of sp) {
    const k = keyOf(s.toks)
    if (!exact.has(k)) exact.set(k, [])
    exact.get(k).push(s.it)
  }
  /** trova per sottoinsieme: token del file ⊆ SP oppure SP ⊆ file */
  function trovaSubset(ft) {
    const c = []
    for (const s of sp) {
      if (!s.toks.size) continue
      if (subset(ft, s.toks) || subset(s.toks, ft)) c.push(s.it)
    }
    return c
  }

  let mailSet = 0, cellAzSet = 0, cellAzOvr = 0, cellPrivSet = 0, cellPrivOvr = 0, livSet = 0, mansSet = 0, mansOvr = 0
  let viaSubset = 0
  const mailConflict = [], nonTrovati = [], ambigui = [], ignorati = []

  for (const r of DATA) {
    const nomeEff = ALIAS[norm(r.nomeFile)] || r.nomeFile
    const ft = tokSet(nomeEff)
    if (ft.size < 2 || ['legenda', 'cessati'].includes(norm(r.nomeFile))) { ignorati.push(r.nomeFile); continue }

    let hit = exact.get(keyOf(ft)) || []
    if (hit.length === 0) {
      const c = trovaSubset(ft)
      if (c.length === 1) { hit = c; viaSubset++ }
      else if (c.length > 1) { ambigui.push(`${r.nomeFile} [${r.foglio}] -> ${c.length} possibili`); continue }
    }
    if (hit.length === 0) { nonTrovati.push(`${r.nomeFile} [${r.foglio}]`); continue }
    if (hit.length > 1) { ambigui.push(`${r.nomeFile} [${r.foglio}] -> ${hit.length} omonimi`); continue }

    const it = hit[0]; const f = it.fields || {}; const patch = {}
    if (r.mailPersonale) {
      const cur = (f.MailPersonale || '').trim()
      if (!cur) { patch.MailPersonale = r.mailPersonale; mailSet++ }
      else if (norm(cur) !== norm(r.mailPersonale)) mailConflict.push(`${r.nomeFile} · MailPersonale: SP="${cur}" file="${r.mailPersonale}"`)
    }
    if (r.cellAz) {
      const cur = (f.CellAziendale || '').trim()
      if (cur !== r.cellAz) { patch.CellAziendale = r.cellAz; cur ? cellAzOvr++ : cellAzSet++ }
    }
    if (r.cellPriv) {
      const cur = (f.CellPrivato || '').trim()
      if (cur !== r.cellPriv) { patch.CellPrivato = r.cellPriv; cur ? cellPrivOvr++ : cellPrivSet++ }
    }
    if (r.livello) {
      const cur = (f.LivelloContrattuale || '').trim()
      if (!cur) { patch.LivelloContrattuale = r.livello; livSet++ }
    }
    if (r.mansione) {
      const cur = (f.Mansione || '').trim()
      if (norm(cur) !== norm(r.mansione)) { patch.Mansione = r.mansione; cur ? mansOvr++ : mansSet++ }
    }

    if (Object.keys(patch).length === 0) continue
    if (APPLY) await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/items/${it.id}/fields`, patch)
    else console.log(`  ${r.nomeFile}:`, patch)
  }

  console.log('\n============================================================')
  console.log(`Abbinati per sottoinsieme (2° nome/ordine): ${viaSubset}`)
  console.log(`MailPersonale compilate (erano vuote):   ${mailSet}`)
  console.log(`CellAziendale: nuove ${cellAzSet}, sovrascritte ${cellAzOvr}`)
  console.log(`CellPrivato:   nuove ${cellPrivSet}, sovrascritte ${cellPrivOvr}`)
  console.log(`LivelloContrattuale compilati (vuoti):   ${livSet}`)
  console.log(`Mansione: nuove ${mansSet}, sovrascritte ${mansOvr}`)
  console.log(`\nCONFLITTI MailPersonale (diversa, NON toccata): ${mailConflict.length}`)
  mailConflict.forEach((c) => console.log('  ! ' + c))
  console.log(`\nNOMI NON TROVATI in SharePoint: ${nonTrovati.length}`)
  nonTrovati.forEach((n) => console.log('  ? ' + n))
  if (ambigui.length) { console.log(`\nAMBIGUI/OMONIMI (saltati, da fare a mano): ${ambigui.length}`); ambigui.forEach((a) => console.log('  ~ ' + a)) }
  if (ignorati.length) console.log(`\nRighe ignorate (non-persona): ${ignorati.join(', ')}`)
  if (!APPLY) console.log('\nRilancia con --apply per applicare.')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
