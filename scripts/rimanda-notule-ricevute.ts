/**
 * Rimanda a Claudia la mail "Notula ricevuta" (con i dati per il bonifico:
 * IBAN, netto, centro di costo) delle prestazioni con notula arrivata di
 * recente, così le paga. Nato il 3/11/2026 quando la mail ha preso l'IBAN.
 *
 * Quali pratiche: stato "Notula ricevuta" o "Chiusa", modificate negli ultimi
 * N giorni (default 31). SharePoint non salva la data di arrivo della notula,
 * quindi si usa l'ultima modifica della pratica: la prova elenca, si guarda
 * l'elenco, poi si invia.
 *
 * Uso (dalla cartella web/):
 *   npx --yes tsx scripts/rimanda-notule-ricevute.ts                 # PROVA: elenca e basta
 *   npx --yes tsx scripts/rimanda-notule-ricevute.ts --invia         # manda le mail
 *   ... --giorni 45                                                  # finestra diversa
 *   ... --solo PREST-2026-010,PREST-2026-012                         # solo queste
 *   ... --a altra@cooperativamirafiori.com                           # destinatario diverso
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const arg = (nome: string) => {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const INVIA = process.argv.includes('--invia')
const GIORNI = Number(arg('--giorni') ?? 31)
const SOLO = (arg('--solo') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
const A = (arg('--a') ?? 'claudia.carena@cooperativamirafiori.com').split(',').map((s) => s.trim())
const euro = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function main() {
  const { graphGet } = await import('../lib/core/graph')
  const { getTuttePrestazioni } = await import('../lib/prestazioni/data')
  const { calcolaNotula } = await import('../lib/prestazioni/documenti')
  const { notificaNotulaCaricata } = await import('../lib/prestazioni/notifiche')

  // Ultima modifica di ogni pratica (non è fra i campi letti dall'app)
  const mod = await graphGet<{ value: { id: string; lastModifiedDateTime: string }[] }>(
    `/sites/${process.env.SHAREPOINT_SITE_ID}/lists/${process.env.SP_LIST_PRESTAZIONI}/items?$select=id,lastModifiedDateTime&$top=999`,
  )
  const ultimaModifica = new Map(mod.value.map((x) => [x.id, x.lastModifiedDateTime]))
  const da = Date.now() - GIORNI * 86_400_000

  const tutte = await getTuttePrestazioni()
  const scelte = tutte
    .filter((p) => p.stato === 'Notula ricevuta' || p.stato === 'Chiusa')
    .filter((p) =>
      SOLO.length
        ? SOLO.includes(p.idPrestazione.toUpperCase())
        : new Date(ultimaModifica.get(p.spItemId) ?? 0).getTime() >= da,
    )

  console.log(`\n${scelte.length} pratiche ${SOLO.length ? `(--solo)` : `con notula, modificate negli ultimi ${GIORNI} giorni`} → ${A.join(', ')}\n`)
  for (const p of scelte) {
    const c = p.importoLordo ? calcolaNotula(p.importoLordo) : null
    const quando = (ultimaModifica.get(p.spItemId) ?? '').slice(0, 10)
    const avvisi = [!p.iban && 'SENZA IBAN', !c && 'SENZA IMPORTO', !p.centroCosto && 'senza CC'].filter(Boolean).join(', ')
    console.log(
      `${p.idPrestazione.padEnd(15)} ${`${p.cognome} ${p.nome}`.slice(0, 28).padEnd(28)} ${p.stato.padEnd(16)} mod. ${quando}  netto ${c ? euro(c.netto).padStart(9) : '        —'} €  ${p.iban || '—'}${avvisi ? `  ⚠ ${avvisi}` : ''}`,
    )
    if (!INVIA) continue
    await notificaNotulaCaricata({
      idPrestazione: p.idPrestazione,
      prestatoreNome: `${p.cognome} ${p.nome}`.trim(),
      responsabileEmail: p.responsabileEmail,
      notulaUrl: p.notulaUrl,
      cartellaUrl: p.cartellaUrl,
      iban: p.iban,
      importoLordo: c?.lordo,
      ritenuta: c?.ritenuta,
      netto: c?.netto,
      bollo: c?.bollo,
      centroCosto: p.centroCosto,
      destinatari: A,
      reinvio: true,
    })
    console.log('   ✓ inviata')
  }
  console.log(INVIA ? '\n=== MAIL INVIATE ===' : '\n=== PROVA — nessuna mail inviata. Rilancia con --invia ===')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
