#!/usr/bin/env node
/**
 * riordino.mjs — riordino architetturale di `lib/`, in due passi indipendenti.
 *
 *   node scripts/riordino.mjs 1     crea lib/core/ e ci sposta l'infrastruttura
 *   node scripts/riordino.mjs 2     smista sharepoint.ts e notifications.ts e
 *                                   raggruppa i file di ogni area in lib/<area>/
 *
 * Nessun corpo di funzione viene riscritto: si spostano file, si estraggono
 * blocchi di codice **verbatim** e si riscrivono gli import. Tutto ciò che rompe
 * lo fa a tempo di compilazione, quindi dopo ogni passo:
 *
 *   npx tsc --noEmit      (senza commenti sulla stessa riga: zsh non li ignora)
 *
 * Per annullare tutto:  git checkout . && git clean -fd lib
 */

import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PASSO = process.argv[2]
const IGNORA = ['node_modules', '.next', '.git', '.vercel', '_to_delete', '_rimossi']

const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' })
const abs = (p) => join(ROOT, p)

// ─── file su cui riscrivere gli import ────────────────────────────────────────

const IO = fileURLToPath(import.meta.url) // questo script contiene le tabelle dei
                                          // percorsi vecchi: va sempre escluso

function sorgenti(dir = ROOT, acc = []) {
  for (const v of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORA.includes(v.name)) continue
    const p = join(dir, v.name)
    if (p === IO) continue
    if (v.isDirectory()) sorgenti(p, acc)
    else if (/\.(ts|tsx|mjs)$/.test(v.name)) acc.push(p)
  }
  return acc
}

/**
 * Riscrive gli import/export che puntano a moduli spostati.
 *
 * @param mappaModulo  { 'vecchio/percorso': 'nuovo/percorso' } — rinomina in blocco
 * @param mappaSimbolo { 'vecchio/modulo': { Simbolo: 'nuovo/modulo' } } — smista
 *                     i simboli di un file esploso in più moduli diversi
 */
function riscrivi(testo, mappaModulo = {}, mappaSimbolo = {}) {
  // 1) smistamento per simbolo: `import { a, b } from 'X'` può diventare due import
  const RE = /(import|export)\s+(type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/g
  testo = testo.replace(RE, (intero, kind, tipo, dentro, modulo) => {
    const tabella = mappaSimbolo[modulo]
    if (!tabella) return intero
    const perDestinazione = new Map()
    for (const clausola of dentro.split(',').map((s) => s.trim()).filter(Boolean)) {
      const nome = clausola.split(/\s+as\s+/)[0].trim().replace(/^type\s+/, '')
      const dest = tabella[nome]
      if (!dest) throw new Error(`Simbolo non mappato: "${nome}" importato da '${modulo}'`)
      if (!perDestinazione.has(dest)) perDestinazione.set(dest, [])
      perDestinazione.get(dest).push(clausola)
    }
    return [...perDestinazione.entries()]
      .map(([dest, cs]) => `${kind} ${tipo ?? ''}{ ${cs.join(', ')} } from '${dest}'`)
      .join('\n')
  })
  // 2) rinomine in blocco (le virgolette nel confronto evitano i match parziali:
  //    '@/lib/graph' non combacia dentro '@/lib/graph-delegato')
  for (const [vecchio, nuovo] of Object.entries(mappaModulo)) {
    testo = testo.replaceAll(`'${vecchio}'`, `'${nuovo}'`)
  }
  return testo
}

function applicaRiscrittura(mappaModulo, mappaSimbolo) {
  let toccati = 0
  for (const file of sorgenti()) {
    const prima = readFileSync(file, 'utf8')
    let dopo
    try {
      dopo = riscrivi(prima, mappaModulo, mappaSimbolo)
    } catch (e) {
      throw new Error(`${relative(ROOT, file)}: ${e.message}`)
    }
    if (dopo !== prima) {
      writeFileSync(file, dopo, 'utf8')
      toccati++
    }
  }
  return toccati
}

function muovi(da, a) {
  if (!existsSync(abs(da))) {
    console.log(`   · ${da} non c'è (già spostato?), salto`)
    return
  }
  mkdirSync(dirname(abs(a)), { recursive: true })
  git(`mv "${da}" "${a}"`)
  console.log(`   · ${da} → ${a}`)
}

// ─── estrazione di blocchi verbatim da un file esistente ─────────────────────

const RE_DECL = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z0-9_]+)/

/** Spezza un file nei suoi blocchi top-level, commento di testa incluso. */
function blocchi(testo) {
  const righe = testo.split('\n')
  const decl = []
  righe.forEach((r, i) => {
    const m = RE_DECL.exec(r)
    if (m) decl.push({ nome: m[1], riga: i })
  })

  // risale sopra la dichiarazione per inglobare il suo commento
  const inizio = (i) => {
    let k = i - 1
    if (k >= 0 && /^\s*\*\//.test(righe[k])) {
      while (k >= 0 && !/^\s*\/\*/.test(righe[k])) k--
      return k
    }
    let j = i
    while (k >= 0 && /^\s*\/\//.test(righe[k])) {
      j = k
      k--
    }
    return j
  }

  const mappa = new Map()
  decl.forEach((d, n) => {
    const da = inizio(d.riga)
    const a = n + 1 < decl.length ? inizio(decl[n + 1].riga) : righe.length
    let corpo = righe.slice(da, a)
    while (corpo.length && corpo[corpo.length - 1].trim() === '') corpo.pop()
    mappa.set(d.nome, corpo.join('\n'))
  })
  return mappa
}

/** Catalogo dei simboli importabili: serve a calcolare gli import dei file nuovi. */
const CATALOGO = [
  { modulo: '@/lib/core/graph', simboli: ['graphGet', 'graphGetOrNull', 'graphGetBinary', 'graphPutBinary', 'graphPost', 'graphPatch', 'graphDelete'] },
  { modulo: '@/lib/core/sp', simboli: ['listBase', 'lookupValue', 'PREFER_NON_INDEXED', 'SITE', 'LIST', 'SP_USER_INFO_LIST', 'getSPUserEmailByLookupId', 'getSPUserLookupId', 'getParametro'] },
  { modulo: '@/lib/core/mailer', simboli: ['sendEmail', 'ADMIN_EMAIL', 'BOX', 'RIGA', 'TABELLA', 'BTN'] },
  { modulo: '@/lib/core/mailer', tipo: true, simboli: ['EmailAttachment'] },
  { modulo: '@/types/manutenzioni', tipo: true, simboli: ['Struttura', 'Tecnico', 'RichiestaManutenzione', 'CostoStruttura', 'CostoRecord', 'ParametroConfigurazione'] },
]

/**
 * Compone un file nuovo con i blocchi indicati, presi verbatim dall'originale.
 * Gli import vengono calcolati guardando quali simboli del catalogo compaiono
 * davvero nel corpo — così i file nuovi non si portano dietro import inutili.
 */
function componi({ intestazione, sorgente, simboli, esporta = [], destinazione }) {
  const disponibili = blocchi(sorgente)
  const corpi = simboli.map((s) => {
    if (!disponibili.has(s)) throw new Error(`Blocco "${s}" non trovato in ${destinazione}`)
    let corpo = disponibili.get(s)
    if (esporta.includes(s) && !new RegExp(`^export\\s`, 'm').test(corpo.split('\n').find((r) => RE_DECL.test(r)) ?? '')) {
      corpo = corpo.replace(
        new RegExp(`^((?:async\\s+)?(?:function|const|let|class|type|interface|enum)\\s+${s}\\b)`, 'm'),
        'export $1',
      )
    }
    return corpo
  })
  const testo = corpi.join('\n\n')

  const imports = []
  for (const { modulo, simboli: cat, tipo } of CATALOGO) {
    const usati = cat.filter((s) => !simboli.includes(s) && new RegExp(`\\b${s}\\b`).test(testo))
    if (usati.length) {
      imports.push(`import ${tipo ? 'type ' : ''}{ ${usati.join(', ')} } from '${modulo}'`)
    }
  }

  const contenuto = [intestazione.trim(), '', ...imports, imports.length ? '' : null, testo, '']
    .filter((r) => r !== null)
    .join('\n')

  mkdirSync(dirname(abs(destinazione)), { recursive: true })
  writeFileSync(abs(destinazione), contenuto, 'utf8')
  console.log(`   · ${destinazione} (${simboli.length} blocchi, ${contenuto.split('\n').length} righe)`)
}

// ─── verifica finale ──────────────────────────────────────────────────────────

function verifica(percorsiMorti) {
  console.log('\n🔍 Verifica: nessun riferimento ai percorsi vecchi…')
  let problemi = 0
  for (const file of sorgenti()) {
    const testo = readFileSync(file, 'utf8')
    for (const morto of percorsiMorti) {
      if (testo.includes(`'${morto}'`)) {
        console.log(`   ❌ ${relative(ROOT, file)} punta ancora a '${morto}'`)
        problemi++
      }
    }
  }
  if (problemi === 0) console.log('   ✅ nessun riferimento rimasto.')
  return problemi
}

// ═════════════════════════════════ PASSO 1 ═══════════════════════════════════

function passo1() {
  const INFRA = [
    'graph.ts', 'graph-delegato.ts', 'ms-token.ts', 'auth.ts',
    'audit.ts', 'api-guard.ts', 'upload-diretto.ts', 'supabase.ts', 'calendar.ts',
  ]

  console.log('\n📦 Passo 1 — lib/core/: sposto l\'infrastruttura condivisa\n')
  for (const f of INFRA) muovi(`lib/${f}`, `lib/core/${f}`)

  const mappaModulo = {}
  for (const f of INFRA) {
    const nome = f.replace(/\.ts$/, '')
    mappaModulo[`@/lib/${nome}`] = `@/lib/core/${nome}`
  }

  console.log('\n✏️  Riscrivo gli import…')
  const toccati = applicaRiscrittura(mappaModulo, {})
  console.log(`   · ${toccati} file aggiornati`)

  const problemi = verifica(Object.keys(mappaModulo))
  esito(problemi, 1)
}

// ═════════════════════════════════ PASSO 2 ═══════════════════════════════════

function passo2() {
  console.log('\n📦 Passo 2 — smisto sharepoint.ts e notifications.ts\n')

  const sp = readFileSync(abs('lib/sharepoint.ts'), 'utf8')
  const nt = readFileSync(abs('lib/notifications.ts'), 'utf8')

  // ── da sharepoint.ts ───────────────────────────────────────────────────────

  componi({
    destinazione: 'lib/core/sp.ts',
    sorgente: sp,
    intestazione: `/**
 * Accesso alle SharePoint Lists via Graph: base comune a tutte le aree.
 *
 * Qui sta solo l'impianto — indirizzi delle liste, helper di lettura dei campi,
 * utenti SP, parametri di configurazione. La logica di dominio sta nei moduli
 * delle aree (lib/manutenzioni, lib/costi, …).
 *
 * Nota sui campi SP:
 *   - le colonne choice si scrivono come { Value: "..." }
 *   - le colonne lookup si scrivono come NomeCampoId: <number>
 *   - i campi lookup e persona in lettura arrivano come stringa → lookupValue()
 */`,
    simboli: ['SITE', 'LIST', 'listBase', 'PREFER_NON_INDEXED', 'lookupValue', 'SP_USER_INFO_LIST', 'getSPUserEmailByLookupId', 'getSPUserLookupId', 'getParametro'],
    esporta: ['SITE', 'LIST', 'listBase', 'PREFER_NON_INDEXED', 'lookupValue', 'SP_USER_INFO_LIST'],
  })

  componi({
    destinazione: 'lib/core/permessi.ts',
    sorgente: sp,
    intestazione: `/**
 * Autorizzazioni: chi è admin e chi può entrare in quale area.
 *
 * Sta in core perché la usano tutte le aree *e* l'autenticazione: se stesse in
 * un modulo d'area, core dipenderebbe da un'area. Si amministra dalla pagina
 * app/(app)/amministrazione/permessi.
 */`,
    simboli: ['isAdmin', 'AREE_PERMESSI', 'AreaPermesso', 'PERMESSI_FALLBACK', 'getPermessi', 'Autorizzazione', 'getTutteAutorizzazioni', 'aggiungiAutorizzazione', 'rimuoviAutorizzazione', 'getUtentiPerArea'],
  })

  componi({
    destinazione: 'lib/strutture/data.ts',
    sorgente: sp,
    intestazione: `/**
 * Anagrafica strutture e tecnici: dati di base condivisi fra manutenzioni,
 * costi, acquisti e timbrature.
 */`,
    simboli: ['getStrutture', 'getTecnici'],
  })

  componi({
    destinazione: 'lib/manutenzioni/data.ts',
    sorgente: sp,
    intestazione: `/**
 * Richieste di manutenzione: letture e scritture sulla lista SP.
 */`,
    simboli: ['RICHIESTA_FIELDS', 'mapRichiesta', 'getRichiesteAperte', 'getRichiesteByEmail', 'getRichiestaById', 'creaRichiesta', 'aggiornaRichiesta'],
  })

  componi({
    destinazione: 'lib/costi/data.ts',
    sorgente: sp,
    intestazione: `/**
 * Costi delle strutture: quelli generati dalle manutenzioni e quelli inseriti
 * a mano (costo diretto).
 */`,
    simboli: ['creaCosto', 'COSTO_FIELDS', 'mapCosto', 'getCosti', 'creaCostoDiretto'],
  })

  // ── da notifications.ts ────────────────────────────────────────────────────

  componi({
    destinazione: 'lib/core/mailer.ts',
    sorgente: nt,
    intestazione: `/**
 * Spedizione email via Microsoft Graph (Mail.Send, permesso applicativo) e
 * mattoncini HTML condivisi.
 *
 * Qui sta il **come** si spedisce. Il **cosa** — i testi delle notifiche — sta
 * in lib/<area>/notifiche.ts, così ogni area possiede le proprie mail.
 */`,
    simboli: ['ADMIN_EMAIL', 'EmailAttachment', 'sendEmail', 'BOX', 'RIGA', 'TABELLA', 'BTN'],
    esporta: ['ADMIN_EMAIL', 'BOX', 'RIGA', 'TABELLA', 'BTN'],
  })

  componi({
    destinazione: 'lib/prestazioni/notifiche.ts',
    sorgente: nt,
    intestazione: '/** Mail dell\'area Prestazioni Occasionali. */',
    simboli: ['PRESTAZIONI_MAIL_TO', 'notificaRiepilogoPrestazione', 'notificaModuliInformativi', 'notificaContrattoFirmato', 'notificaNotulaAlPrestatore', 'notificaNotulaCaricata', 'notificaPromemoriaFoglioOre'],
  })

  componi({
    destinazione: 'lib/timbrature/notifiche.ts',
    sorgente: nt,
    intestazione: `/**
 * Mail dell'area Timbrature · Foglio ore.
 *
 * Mittente dedicato: un sollecito sul foglio ore deve arrivare da Risorse Umane,
 * non dalla casella degli acquisti, perché la risposta del dipendente deve
 * finire nella casella giusta.
 */`,
    simboli: ['TIMBRATURE_MAIL_FROM', 'notificaSollecitoTimbrature', 'dataBreveIt', 'notificaGiornateInScadenza', 'notificaFogliDaValidare', 'notificaFoglioDaConfermare', 'notificaContestazioneFoglioOre'],
  })

  componi({
    destinazione: 'lib/acquisti/notifiche.ts',
    sorgente: nt,
    intestazione: `/**
 * Mail dell'area Acquisti.
 *
 * Le richieste non urgenti passano dal digest giornaliero: una mail per
 * richiesta renderebbe la casella inutilizzabile.
 */`,
    simboli: ['ACQUISTI_MAIL_TO', 'destinatariAcquisti', 'notificaAcquistoUrgente', 'notificaAssegnazioneAcquisto', 'notificaDigestAcquisti', 'notificaEsitoValutazione', 'notificaOrdineEffettuato', 'notificaConfermaConsegna', 'notificaOrdineDaRitirare', 'notificaEsitoConsegna'],
  })

  componi({
    destinazione: 'lib/manutenzioni/notifiche.ts',
    sorgente: nt,
    intestazione: '/** Mail dell\'area Manutenzioni. */',
    simboli: ['notificaNuovaRichiesta', 'notificaTecnicoAssegnato', 'notificaChiusuraTicket'],
  })

  console.log('\n🗑️  Rimuovo i due file esplosi…')
  git('rm -q lib/sharepoint.ts lib/notifications.ts')
  console.log('   · lib/sharepoint.ts, lib/notifications.ts')

  // ── raggruppo i file di ogni area in lib/<area>/ ───────────────────────────

  const SPOSTAMENTI = {
    'lib/timbrature.ts': 'lib/timbrature/data.ts',
    'lib/timbrature-flusso.ts': 'lib/timbrature/flusso.ts',
    'lib/timbrature-guard.ts': 'lib/timbrature/guard.ts',
    'lib/timbrature-sync.ts': 'lib/timbrature/sync.ts',
    'lib/foglio-ore-xlsx.ts': 'lib/timbrature/foglio-ore-xlsx.ts',
    'lib/festivita.ts': 'lib/timbrature/festivita.ts',
    'lib/acquisti.ts': 'lib/acquisti/data.ts',
    'lib/acquisti-flusso.ts': 'lib/acquisti/flusso.ts',
    'lib/prestazioni.ts': 'lib/prestazioni/data.ts',
    'lib/documenti-prestazione.ts': 'lib/prestazioni/documenti.ts',
    'lib/firma-prestazione.ts': 'lib/prestazioni/firma.ts',
    'lib/docusign.ts': 'lib/prestazioni/docusign.ts',
    'lib/casistiche-gdpr.ts': 'lib/prestazioni/casistiche-gdpr.ts',
    'lib/inventario.ts': 'lib/inventario/data.ts',
    'lib/software.ts': 'lib/software/data.ts',
    'lib/risorse-umane.ts': 'lib/risorse-umane/data.ts',
    'lib/ru-api.ts': 'lib/risorse-umane/api.ts',
    'lib/ru-fetch.ts': 'lib/risorse-umane/fetch.ts',
    'lib/ru-export-xlsx.ts': 'lib/risorse-umane/export-xlsx.ts',
    'lib/gruppo-ru.ts': 'lib/risorse-umane/gruppo.ts',
  }

  console.log('\n📁 Raggruppo i file per area…')
  for (const [da, a] of Object.entries(SPOSTAMENTI)) muovi(da, a)

  const mappaModulo = {}
  for (const [da, a] of Object.entries(SPOSTAMENTI)) {
    mappaModulo[`@/${da.replace(/\.ts$/, '')}`] = `@/${a.replace(/\.ts$/, '')}`
  }

  // smistamento per simbolo dei due file esplosi
  const M = (elenco, dest) => Object.fromEntries(elenco.map((s) => [s, dest]))
  const mappaSimbolo = {
    '@/lib/sharepoint': {
      ...M(['getStrutture', 'getTecnici'], '@/lib/strutture/data'),
      ...M(['getRichiesteAperte', 'getRichiesteByEmail', 'getRichiestaById', 'creaRichiesta', 'aggiornaRichiesta'], '@/lib/manutenzioni/data'),
      ...M(['creaCosto', 'getCosti', 'creaCostoDiretto'], '@/lib/costi/data'),
      ...M(['isAdmin', 'AREE_PERMESSI', 'AreaPermesso', 'getPermessi', 'Autorizzazione', 'getTutteAutorizzazioni', 'aggiungiAutorizzazione', 'rimuoviAutorizzazione', 'getUtentiPerArea'], '@/lib/core/permessi'),
      ...M(['getSPUserEmailByLookupId', 'getSPUserLookupId', 'getParametro', 'lookupValue', 'listBase'], '@/lib/core/sp'),
    },
    '@/lib/notifications': {
      ...M(['sendEmail', 'EmailAttachment'], '@/lib/core/mailer'),
      ...M(['notificaRiepilogoPrestazione', 'notificaModuliInformativi', 'notificaContrattoFirmato', 'notificaNotulaAlPrestatore', 'notificaNotulaCaricata', 'notificaPromemoriaFoglioOre'], '@/lib/prestazioni/notifiche'),
      ...M(['notificaSollecitoTimbrature', 'notificaGiornateInScadenza', 'notificaFogliDaValidare', 'notificaFoglioDaConfermare', 'notificaContestazioneFoglioOre'], '@/lib/timbrature/notifiche'),
      ...M(['destinatariAcquisti', 'notificaAcquistoUrgente', 'notificaAssegnazioneAcquisto', 'notificaDigestAcquisti', 'notificaEsitoValutazione', 'notificaOrdineEffettuato', 'notificaConfermaConsegna', 'notificaOrdineDaRitirare', 'notificaEsitoConsegna'], '@/lib/acquisti/notifiche'),
      ...M(['notificaNuovaRichiesta', 'notificaTecnicoAssegnato', 'notificaChiusuraTicket'], '@/lib/manutenzioni/notifiche'),
    },
  }

  console.log('\n✏️  Riscrivo gli import…')
  const toccati = applicaRiscrittura(mappaModulo, mappaSimbolo)
  console.log(`   · ${toccati} file aggiornati`)

  const problemi = verifica([...Object.keys(mappaModulo), '@/lib/sharepoint', '@/lib/notifications'])
  esito(problemi, 2)
}

// ─────────────────────────────────────────────────────────────────────────────

function esito(problemi, passo) {
  if (problemi) {
    console.log(`\n⚠️  ${problemi} riferimenti da sistemare a mano prima di compilare.`)
    process.exitCode = 1
    return
  }
  console.log(`\n✅ Passo ${passo} fatto. Adesso, in quest'ordine — un comando per riga,
   senza aggiungere commenti sulla stessa riga (zsh non li ignora):

   npx tsc --noEmit
   npm run mappa
   git add -A && git commit -m "Riordino passo ${passo}"

   Il primo è quello che conta: deve finire senza stampare niente.
   Se dà errori, incollali a Claude. Per annullare tutto:
   git checkout . && git clean -fd lib
`)
}

if (PASSO === '1') passo1()
else if (PASSO === '2') passo2()
else {
  console.log(`Uso: node scripts/riordino.mjs <1|2>

  1   crea lib/core/ e ci sposta graph, auth, audit, api-guard, upload, supabase, calendar
  2   smista sharepoint.ts e notifications.ts nei moduli d'area e raggruppa lib/<area>/

Fai un passo alla volta, con "npx tsc --noEmit" e un commit in mezzo.`)
  process.exitCode = 1
}
