#!/usr/bin/env node
/**
 * Crea su Qonto un sottoconto per ogni centro di costo attivo.
 *
 * Il sottoconto è la "cassa" del servizio: il saldo è la liquidità che il
 * responsabile ha ancora da spendere, e le carte legate a quel sottoconto
 * vengono rifiutate dalla banca quando è vuoto. Il limite lo fa rispettare
 * Qonto, non un cruscotto.
 *
 * Nome del sottoconto = "<codice> · <nome CC>", per esempio "cc9 · CRP CO.S.MI.C.A".
 * Il codice all'inizio è la chiave che l'app usa per agganciare il sottoconto
 * al centro di costo: il nome dopo il " · " si può cambiare a mano su Qonto
 * senza rompere niente, il codice no.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-qonto-sottoconti.mjs                  # mostra cosa farebbe
 *   node scripts/provision-qonto-sottoconti.mjs --apply          # crea
 *   node scripts/provision-qonto-sottoconti.mjs --salta cc2,cc23 # esclude dei CC
 *
 * Idempotente: un sottoconto il cui nome inizia già con "<codice> ·" non si ricrea.
 * I sottoconti aperti prima dello script (nomi liberi: "CER Giulia", "Amb. Nord"…)
 * stanno in PREESISTENTI: vengono RINOMINATI nel formato "<codice> · <nome>",
 * non duplicati — conservano IBAN, carte e movimenti. NON chiude mai niente.
 *
 * Richiede in .env.local (o nell'ambiente):
 *   OAuth (web/.qonto-oauth.json, da scripts/qonto-oauth-login.mjs) oppure
 *   QONTO_LOGIN, QONTO_SECRET        (chiave API generata da un owner/admin)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (legge lo specchio centro_di_costo)
 */

import { loadEnvLocal, qonto, modoAccesso } from './_qonto.mjs'

const APPLY = process.argv.includes('--apply')
const iSalta = process.argv.indexOf('--salta')
const SALTA = new Set(
  iSalta > -1 ? (process.argv[iSalta + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : [],
)
const SEP = ' · '

/**
 * Sottoconti aperti a mano prima dello script → codice del centro di costo.
 * Il confronto è sul nome esatto che hanno su Qonto oggi.
 */
const PREESISTENTI = {
  'Amb. Nord': 'cc15',
  'Amb. Sud': 'cc16',
  'Casa Artemisia': 'cc5',
  'CER Giulia': 'cc14',
  'Condominio Solidale': 'cc18',
  'CRP Cosmica': 'cc9',
}

async function centriDiCosto() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/centro_di_costo?select=codice,nome,ordine,attivo&attivo=eq.true&order=ordine`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
  )
  if (!res.ok) throw new Error(`Supabase centro_di_costo → ${res.status}: ${await res.text()}`)
  return (await res.json()).filter((c) => /^cc\d+$/.test(c.codice))
}

async function main() {
  loadEnvLocal()
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[k]) throw new Error(`Manca ${k} in .env.local`)
  }

  console.log(`Accesso a Qonto via ${await modoAccesso()}\n`)
  const [cc, conti] = await Promise.all([centriDiCosto(), qonto('GET', '/bank_accounts?per_page=100')])
  const esistenti = conti.bank_accounts || []
  const perCodice = new Map()
  for (const a of esistenti) {
    const m = (a.name || '').match(/^(cc\d+)\s·/)
    if (m) perCodice.set(m[1], a)
  }
  const daRinominare = new Map()
  for (const a of esistenti) {
    const codice = PREESISTENTI[(a.name || '').trim()]
    if (codice && !perCodice.has(codice)) daRinominare.set(codice, a)
  }

  console.log(`Conti già su Qonto: ${esistenti.length}`)
  for (const a of esistenti) console.log(`  ${a.main ? '★' : ' '} ${a.name}  ${a.iban || ''}`)
  console.log(`\nCentri di costo attivi: ${cc.length}${SALTA.size ? ` (esclusi: ${[...SALTA].join(', ')})` : ''}\n`)

  const daCreare = []
  const rinomine = []
  for (const c of cc) {
    const nome = `${c.codice}${SEP}${c.nome}`
    if (SALTA.has(c.codice)) console.log(`  salto   ${nome}`)
    else if (perCodice.has(c.codice)) console.log(`  c'è già ${perCodice.get(c.codice).name}`)
    else if (daRinominare.has(c.codice)) {
      console.log(`  RINOMINO "${daRinominare.get(c.codice).name}" → ${nome}`)
      rinomine.push({ conto: daRinominare.get(c.codice), nome })
    } else {
      console.log(`  CREO    ${nome}`)
      daCreare.push(nome)
    }
  }

  const liberi = 30 - esistenti.length
  console.log(`\nDa rinominare: ${rinomine.length} · da creare: ${daCreare.length} · posti liberi sul piano Business: ${liberi}`)
  if (daCreare.length > liberi) throw new Error(`Servirebbero ${daCreare.length} sottoconti nuovi ma ne restano ${liberi}: niente è stato toccato.`)
  if (!daCreare.length && !rinomine.length) return console.log('Niente da fare.')
  if (!APPLY) return console.log('Rilancia con --apply per applicare.')

  // La rinomina via API key risponde 401 "OAuth2 authentication is required here"
  // (24/09/2026), nonostante la documentazione dica il contrario. Se succede non
  // ci si ferma: si stampa l'elenco da rinominare a mano e si passa alle creazioni.
  const aMano = []
  for (const { conto, nome } of rinomine) {
    try {
      await qonto('PATCH', `/bank_accounts/${conto.id}`, { bank_account: { name: nome } })
      console.log(`  ✓ rinominato ${nome}  ${conto.iban || ''}`)
    } catch (e) {
      if (!/→ 401/.test(e.message)) throw e
      aMano.push({ conto, nome })
    }
  }
  if (aMano.length) {
    console.log(`\n⚠️  Qonto non permette di rinominare con la chiave API. Rinominali a mano nella web app:`)
    for (const { conto, nome } of aMano) console.log(`     "${conto.name}"  →  ${nome}`)
    console.log('')
  }

  for (const nome of daCreare) {
    const r = await qonto('POST', '/bank_accounts', { bank_account: { name: nome } })
    const a = r.bank_account || r
    console.log(`  ✓ ${nome}  ${a.iban || ''}`)
  }
  console.log(`\nRinominati ${rinomine.length - aMano.length}, da rinominare a mano ${aMano.length}, creati ${daCreare.length}.`)
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
