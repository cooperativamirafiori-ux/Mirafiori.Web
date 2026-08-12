#!/usr/bin/env node
/**
 * Confronta le matricole in anagrafica Dipendenti con quelle stampate sui
 * cedolini, per stabilire quale matricola a 10 cifre mettere nel file di
 * importazione presenze di PULSE.
 *
 * COM'E' FATTA LA MATRICOLA CHE PULSE VUOLE
 * Il tracciato record CL System, posizioni 10-19:
 *     0257  ·  Q  ·  00598
 *     ditta   qual.  codice personale
 * (4 cifre di ditta, 1 di qualifica INPS, 5 di codice personale)
 *
 * COSA C'E' GIA' IN ANAGRAFICA
 * Il campo `Matricola` e' arrivato dal vecchio Access ed e' anch'esso a 10
 * cifre, ma composto `257` + `Q` + `000598`: tre cifre di ditta e sei di codice
 * personale. Stessa lunghezza, spezzatura diversa — motivo per cui un confronto
 * fra le due stringhe intere non dice nulla di utile. Qui si confrontano i pezzi.
 *
 * PERCHE' NON CI SI FIDA DELLA MATRICOLA DI ANAGRAFICA
 * Sui dati di luglio 2026 il codice personale coincide col cedolino in 98 casi
 * su 110, ma:
 *   - in 4 casi la cifra di qualifica e' vecchia (apprendisti passati di ruolo);
 *   - in alcuni casi il codice personale e' sbagliato di poco (cifre invertite,
 *     numeri vicini) — errori di trascrizione dal vecchio archivio;
 *   - una manciata di schede usa la spezzatura a 4 cifre di ditta invece di 3.
 * Il cedolino invece e' quello che le paghe usano davvero, quindi vince lui.
 *
 * Da qui la scelta di un campo suo, `MatricolaPulse`, invece di sovrascrivere
 * `Matricola`: quest'ultima resta il riferimento storico che le RU riconoscono,
 * e non si perde la tracciabilita' col vecchio archivio.
 *
 * USO (dalla cartella web/):
 *   node scripts/diagnosi-matricole-pulse.mjs
 *   node scripts/diagnosi-matricole-pulse.mjs --csv > matricole-da-sistemare.csv
 *   node scripts/diagnosi-matricole-pulse.mjs --cedolini altro/percorso.csv
 *
 * Il CSV dei cedolini si genera con `estrai-matricole-cedolini.py` e per
 * default e' atteso in `scripts/ru-data/matricole-pulse.csv`.
 *
 * Sola lettura: non scrive niente su SharePoint, in nessun caso.
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SP_LIST_DIPENDENTI e il sito (SP_SITE_RU o SHAREPOINT_SITE_ID).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CSV = process.argv.includes('--csv')

const iCed = process.argv.indexOf('--cedolini')
const FILE_CEDOLINI = iCed > -1 && process.argv[iCed + 1]
  ? process.argv[iCed + 1]
  : join(__dirname, 'ru-data', 'matricole-pulse.csv')

const CAMPI = [
  'Cognome', 'Nome', 'CodiceFiscale', 'Matricola', 'MatricolaPulse',
  'StatoRapporto', 'TipoRapporto', 'MailAziendale', 'TimbraturaAttiva',
].join(',')

function caricaEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const riga of raw.split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* env gia' impostate */ }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(`Token non ottenuto: ${d.error_description || res.status}`)
  return d.access_token
}

async function graph(token, url) {
  const res = await fetch(url.startsWith('http') ? url : `https://graph.microsoft.com/v1.0${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

const val = (v) => (v == null ? '' : String(v).trim())
const cifre = (v) => val(v).replace(/\D/g, '')
/** Il numero nudo, senza zeri davanti: 000463, 00463 e 463 sono lo stesso codice. */
const numero = (v) => cifre(v).replace(/^0+/, '') || '0'

/**
 * La matricola di anagrafica spezzata nei suoi tre pezzi.
 *
 * Il vecchio Access scriveva `257` + qualifica + codice personale, e il codice
 * personale a volte con cinque cifre e a volte con sei (zero in piu' davanti).
 * Quindi le lunghezze in giro sono 9 e 10, ma la regola e' una sola: le prime tre
 * cifre sono la ditta, la quarta e' la qualifica, il resto e' il codice personale.
 *
 * Non si normalizza con un padding a dieci cifre: `257200259` diventerebbe
 * `0257200259` e si leggerebbe come ditta `0257`, dando per caso il risultato
 * giusto su queste sei schede e uno sbagliato sulla prima matricola che arrivasse
 * davvero a quattro cifre di ditta.
 *
 * Tutto cio' che non ha 257 davanti, o non ha almeno 9 cifre, non viene
 * interpretato: torna `null` e finisce fra le schede da guardare a mano. Ce ne
 * sono (una matricola troncata a 7 cifre, una con `272` invece di `257`) e sono
 * proprio i casi in cui indovinare farebbe danno.
 */
const DITTA = '257'

function scomponi(matricola) {
  const c = cifre(matricola)
  if (c.length < 9 || c.length > 10 || !c.startsWith(DITTA)) return null
  return {
    ditta: DITTA,
    qualifica: c[3],
    personale: c.slice(4),
    forma: `3+1+${c.length - 4}`,
  }
}

function leggiCedolini() {
  let raw
  try {
    // Il CSV e' scritto con BOM e a capo CRLF per farlo aprire bene a Excel:
    // togliamo entrambi qui, cosi' l'ultima colonna di ogni riga non si porta
    // dietro un \r che poi salta fuori nei confronti.
    raw = readFileSync(FILE_CEDOLINI, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  } catch {
    console.error(`✗ CSV dei cedolini non trovato: ${FILE_CEDOLINI}`)
    console.error('  Generalo con: python3 scripts/estrai-matricole-cedolini.py "../cedolini luglio"')
    process.exit(1)
  }
  const righe = raw.split('\n').filter((r) => r.trim())
  const intest = righe.shift().split(';').map((c) => c.trim())
  const col = (n) => intest.indexOf(n)
  const iCf = col('cf'); const iMatr = col('matr_cedolino'); const iQual = col('qualifica')
  const iPulse = col('matricola_pulse'); const iDescr = col('descr'); const iNome = col('cognome_nome')
  if (iCf < 0 || iMatr < 0 || iQual < 0) {
    console.error('✗ Il CSV dei cedolini non ha le colonne attese (cf, matr_cedolino, qualifica)')
    process.exit(1)
  }
  const mappa = new Map()
  for (const r of righe) {
    const c = r.split(';')
    const cf = val(c[iCf]).toUpperCase()
    if (!cf) continue
    mappa.set(cf, {
      nome: val(c[iNome]), matricola: val(c[iMatr]), qualifica: val(c[iQual]),
      descr: val(c[iDescr]), pulse: val(c[iPulse]),
    })
  }
  return mappa
}

/** ALLINEATA · QUALIFICA · PERSONALE · ASSENTE · SENZA_CEDOLINO */
function classifica(anagrafica, ced) {
  if (!ced) return 'SENZA_CEDOLINO'
  const s = scomponi(anagrafica)
  if (!s) return 'ASSENTE'
  if (numero(s.personale) !== numero(ced.matricola)) return 'PERSONALE'
  if (s.qualifica !== ced.qualifica) return 'QUALIFICA'
  return 'ALLINEATA'
}

async function main() {
  caricaEnv()
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  const listId = process.env.SP_LIST_DIPENDENTI
  if (!site || !listId) {
    console.error('✗ Mancano SP_SITE_RU (o SHAREPOINT_SITE_ID) e SP_LIST_DIPENDENTI in .env.local')
    process.exit(1)
  }

  const cedolini = leggiCedolini()
  const token = await getToken()

  const items = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=${CAMPI})&$top=200`
  while (url) {
    const res = await graph(token, url)
    items.push(...(res.value || []))
    url = res['@odata.nextLink'] || null
  }

  const schede = items
    .map((it) => {
      const f = it.fields ?? {}
      const cf = val(f.CodiceFiscale).toUpperCase()
      const ced = cedolini.get(cf) || null
      return { id: it.id, f, cf, ced, s: scomponi(f.Matricola), esito: classifica(f.Matricola, ced) }
    })
    .sort((a, b) => `${val(a.f.Cognome)} ${val(a.f.Nome)}`
      .localeCompare(`${val(b.f.Cognome)} ${val(b.f.Nome)}`, 'it'))

  if (CSV) {
    console.log('Cognome;Nome;CodiceFiscale;MatricolaAnagrafica;FormaAnagrafica;PersonaleAnagrafica;PersonaleCedolino;QualificaAnagrafica;QualificaCedolino;DescrCedolino;MatricolaPulse10;StatoRapporto;TimbraturaAttiva;Esito')
    for (const x of schede) {
      console.log([
        val(x.f.Cognome), val(x.f.Nome), x.cf,
        val(x.f.Matricola), x.s?.forma ?? '', x.s?.personale ?? '',
        x.ced?.matricola ?? '', x.s?.qualifica ?? '', x.ced?.qualifica ?? '',
        x.ced?.descr ?? '', x.ced?.pulse ?? '',
        val(x.f.StatoRapporto), val(x.f.TimbraturaAttiva), x.esito,
      ].join(';'))
    }
    return
  }

  const per = (e) => schede.filter((x) => x.esito === e)
  const allineate = per('ALLINEATA')
  const qualifica = per('QUALIFICA')
  const personale = per('PERSONALE')
  const assenti = per('ASSENTE')
  const senzaCed = per('SENZA_CEDOLINO')

  console.log(`Schede Dipendenti: ${schede.length} · cedolini in tabella: ${cedolini.size}\n`)

  const stampa = (titolo, gruppo, dettaglio) => {
    if (!gruppo.length) return
    console.log(`${titolo} (${gruppo.length}):`)
    for (const x of gruppo) {
      const nome = `${val(x.f.Cognome)} ${val(x.f.Nome)}`.trim()
      console.log(`  · ${nome.padEnd(32)} ${dettaglio(x)}`)
    }
    console.log('')
  }

  stampa(
    'Codice personale diverso dal cedolino → uno dei due e\' sbagliato, guardare a mano',
    personale,
    (x) => `anagrafica ${x.s.personale} (${x.s.forma}) · cedolino ${x.ced.matricola} · PULSE ${x.ced.pulse}`,
  )

  stampa(
    'Cifra di qualifica vecchia → tipicamente apprendisti passati di ruolo',
    qualifica,
    (x) => `anagrafica q=${x.s.qualifica} · cedolino q=${x.ced.qualifica} (${x.ced.descr}) · PULSE ${x.ced.pulse}`,
  )

  stampa(
    'Matricola assente, troncata o con una ditta che non e\' 257 → non la interpreto',
    assenti,
    (x) => `in anagrafica "${val(x.f.Matricola) || '—'}" · dal cedolino: ${x.ced.pulse} (${x.ced.descr})`,
  )

  stampa(
    'Nessun cedolino in tabella → cessati, o assunti dopo il mese estratto',
    senzaCed,
    (x) => `matricola ${val(x.f.Matricola) || '—'} · stato ${val(x.f.StatoRapporto) || '—'}`,
  )

  console.log(`Codice personale e qualifica coincidenti col cedolino: ${allineate.length}`)
  const pronte = schede.filter((x) => x.ced).length
  const gia = schede.filter((x) => val(x.f.MatricolaPulse)).length
  console.log(`Schede per cui abbiamo la matricola PULSE dal cedolino: ${pronte}`)
  console.log(`Schede che hanno gia' MatricolaPulse compilata: ${gia}`)
  console.log('')
  console.log('La matricola PULSE giusta e\' sempre quella ricavata dal cedolino: e\' il documento')
  console.log('che le paghe emettono, quindi e\' la matricola che GENIUS conosce davvero.')
  console.log('')
  console.log('Tabella da rivedere: node scripts/diagnosi-matricole-pulse.mjs --csv > matricole-da-sistemare.csv')
  console.log('Per scrivere il campo:  node scripts/popola-matricola-pulse.mjs')
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
