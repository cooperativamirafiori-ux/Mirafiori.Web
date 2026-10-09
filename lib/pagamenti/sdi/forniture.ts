/**
 * Le forniture (luce, gas, acqua) dentro una fattura XML: codice, importo,
 * consumo, periodo. Funzione pura sul corpo della fattura.
 *
 * Verificato sui file veri il 09/10/2026 (Chiurlo, 67 bollette):
 *   - il POD/PDR sta in `DettaglioLinee/RiferimentoAmministrazione`, su ogni riga;
 *   - le righe con UnitaMisura KWH/SMC portano il consumo, MA la stessa quantità
 *     si ripete su ogni componente (trasporto, oneri, dispacciamento…): sommare
 *     le righe gonfierebbe il consumo di ~15 volte. Si prende, per descrizione,
 *     la somma delle quantità e poi il MASSIMO fra le descrizioni: così una voce
 *     spezzata in scaglioni o fasce resta intera, e le "Perdite" (più piccole)
 *     non contano;
 *   - il periodo sta su DataInizioPeriodo/DataFinePeriodo delle righe.
 *
 * Per i fornitori che il codice non lo mettono in una riga (SMAT da verificare)
 * c'è `testoUtenze`: il testo in cui l'import cerca i codici già noti della
 * Mappatura.
 */

import { numero, testo, trova, tutti, type Elemento } from './xml'
import { normCodice, type FornituraSdi, type TipoUtenza } from '@/types/utenze'

const RE_POD = /IT\d{3}E\d{8}[A-Z0-9]?/g
const UNITA: Record<string, { u: string; tipo: TipoUtenza }> = {
  KWH: { u: 'kWh', tipo: 'luce' },
  SMC: { u: 'Smc', tipo: 'gas' },
  SM3: { u: 'Smc', tipo: 'gas' },
  MC: { u: 'm³', tipo: 'acqua' },
  M3: { u: 'm³', tipo: 'acqua' },
  'M³': { u: 'm³', tipo: 'acqua' },
}

const tondo = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

/** Codice di una riga: il riferimento amministrazione se ha la forma di un codice, altrimenti un POD nel testo. */
function codiceRiga(l: Elemento): string | null {
  const rif = normCodice(testo(l, 'RiferimentoAmministrazione'))
  if (/^IT\d{3}E\d{8}[A-Z0-9]?$/.test(rif) || /^\d{8,20}$/.test(rif)) return rif
  const pod = (testo(l, 'Descrizione') ?? '').toUpperCase().match(RE_POD)
  return pod ? pod[0] : null
}

function tipoDaTesto(t: string): TipoUtenza | null {
  if (/energia elettrica|\bPOD\b/i.test(t)) return 'luce'
  if (/gas naturale|\bPDR\b/i.test(t)) return 'gas'
  if (/servizio idrico|acquedott|fognatur|depurazion/i.test(t)) return 'acqua'
  return null
}

export function leggiForniture(body: Elemento, imponibile: number): { forniture: FornituraSdi[]; testoUtenze: string } {
  const doc = trova(body, 'DatiGenerali/DatiGeneraliDocumento')
  const causale = tutti(doc, 'Causale').map((c) => testo(c) ?? '').join(' ')
  const linee = tutti(trova(body, 'DatiBeniServizi'), 'DettaglioLinee')

  const testi: string[] = [causale]
  for (const l of linee) {
    testi.push(testo(l, 'Descrizione') ?? '', testo(l, 'RiferimentoAmministrazione') ?? '')
    for (const a of tutti(l, 'AltriDatiGestionali')) testi.push(testo(a, 'RiferimentoTesto') ?? '', testo(a, 'RiferimentoNumero') ?? '')
  }
  const testoUtenze = normCodice(testi.join(' ')).slice(0, 50_000)

  // Righe per codice. Le righe senza codice vanno al codice unico, se ce n'è uno.
  const perCodice = new Map<string, Elemento[]>()
  const senza: Elemento[] = []
  for (const l of linee) {
    const c = codiceRiga(l)
    if (c) perCodice.set(c, [...(perCodice.get(c) ?? []), l])
    else senza.push(l)
  }
  if (!perCodice.size) {
    // Nessuna riga col codice: un POD nella causale basta, se è uno solo.
    const pod = [...new Set(causale.toUpperCase().match(RE_POD) ?? [])]
    if (pod.length === 1) perCodice.set(pod[0], [])
  }
  if (!perCodice.size) return { forniture: [], testoUtenze }
  if (perCodice.size === 1) {
    const [c] = [...perCodice.keys()]
    perCodice.set(c, [...perCodice.get(c)!, ...senza])
  }

  const unCodice = perCodice.size === 1
  const forniture: FornituraSdi[] = []
  for (const [codice, righe] of perCodice) {
    // Consumo: per descrizione la somma, poi il massimo (vedi in testa).
    const perDescr = new Map<string, { q: number; u: string; tipo: TipoUtenza }>()
    for (const l of righe) {
      const um = (testo(l, 'UnitaMisura') ?? '').toUpperCase().replace(/\s/g, '')
      const info = UNITA[um]
      const q = numero(l, 'Quantita')
      if (!info || q == null) continue
      const k = (testo(l, 'Descrizione') ?? '').toLowerCase().replace(/\d+\s*sc\.?/g, '').trim()
      const p = perDescr.get(k) ?? { q: 0, u: info.u, tipo: info.tipo }
      p.q += q
      perDescr.set(k, p)
    }
    const migliore = [...perDescr.values()].sort((a, b) => b.q - a.q)[0]

    const dal = righe.map((l) => testo(l, 'DataInizioPeriodo')).filter((x): x is string => !!x).sort()[0] ?? null
    const al = righe.map((l) => testo(l, 'DataFinePeriodo')).filter((x): x is string => !!x).sort().pop() ?? null

    // Il tipo serve una PROVA che sia una bolletta: un POD, un consumo in
    // kWh/Smc/m³, o la causale/descrizione che lo dice. Un numero lungo nel
    // riferimento da solo non basta: TIM e Fastweb ci mettono il codice
    // cliente, e diventerebbero false bollette "da collegare".
    const tipo: TipoUtenza | null =
      migliore?.tipo ??
      (/^IT\d{3}E/.test(codice) ? 'luce' : null) ??
      tipoDaTesto(causale + ' ' + righe.map((l) => testo(l, 'Descrizione')).join(' '))
    if (!tipo) continue

    // Con un codice solo l'importo è l'imponibile della fattura, così torna al
    // centesimo con il Cruscotto CdG; con più codici, la somma delle sue righe.
    const importo = unCodice
      ? imponibile
      : tondo(righe.reduce((s, l) => s + (numero(l, 'PrezzoTotale') ?? 0), 0))

    forniture.push({
      codice,
      tipo,
      importo,
      consumo: migliore ? tondo(migliore.q, 3) : null,
      unita: migliore?.u ?? null,
      periodoDal: dal,
      periodoAl: al,
    })
  }
  return { forniture, testoUtenze }
}
