/**
 * Dati di ESEMPIO per il cruscotto del controllo di gestione.
 *
 * Servono a vedere come funzionerà il cruscotto quando le fonti saranno piene
 * (tutte le fatture attribuite, i ricavi, il budget, le ore): oggi il registro è
 * vuoto e le fatture segnate su un servizio sono una su dieci, quindi la vista
 * vera è quasi tutta "da attribuire".
 *
 * Regole, perché un numero inventato in un cruscotto è pericoloso:
 *   - si accende solo con `?esempio=1` e la pagina lo dice in un banner fisso;
 *   - i centri di costo sono quelli veri, i numeri no — generati con un seme
 *     fisso, quindi uguali a ogni apertura (un esempio che cambia a ogni clic
 *     sembra un dato vivo);
 *   - i fornitori sono categorie generiche, mai ragioni sociali vere;
 *   - passano da `costruisciCruscotto`, gli stessi conti della vista vera.
 */

import type { InputCruscotto } from './cruscotto-calcoli'

function generatore(seme: number) {
  let a = seme >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FORNITORI = [
  'Ingrosso alimentari',
  'Utenze luce e gas',
  'Affitto sede',
  'Pulizie e igiene',
  'Materiale didattico',
  'Manutenzioni edili',
  'Cancelleria e ufficio',
  'Trasporti',
  'Consulenze',
  'Assicurazioni',
]

export function inputEsempio(
  base: Pick<InputCruscotto, 'anno' | 'anni' | 'meseUltimo' | 'centri' | 'completo'>,
): InputCruscotto {
  const r = generatore(2026 + base.anno)
  const fatture: InputCruscotto['fatture'] = []
  const ricavi: InputCruscotto['ricavi'] = []
  const ore: InputCruscotto['ore'] = []
  const qonto: InputCruscotto['qonto'] = []
  const budget: Record<string, number> = {}
  const mm = (m: number) => String(m).padStart(2, '0')
  // Niente date nel futuro: nel mese in corso i giorni si fermano a oggi.
  const oggi = new Date()
  const corrente = base.anno === oggi.getFullYear()
  const giorni = (m: number) => (corrente && m === base.meseUltimo ? Math.max(1, oggi.getDate()) : 27)
  const giorno = (m: number) => mm(1 + Math.floor(r() * giorni(m)))

  for (const c of base.centri) {
    if (c.codice === 'DA_ATTRIBUIRE') continue
    // Ordine di grandezza vero: ~85.000 € di fatture al mese su 24 servizi.
    const scala = 600 + r() * 6400 // costo medio mensile
    const margine = 0.82 + r() * 0.5 // ricavi / costi
    const fornitori = [...FORNITORI].sort(() => r() - 0.5).slice(0, 4 + Math.floor(r() * 3))
    let totale = 0
    for (let m = 1; m <= base.meseUltimo; m++) {
      const stagione = 1 + 0.25 * Math.sin((m / 12) * Math.PI * 2 + r())
      const quante = 2 + Math.floor(r() * 5)
      for (let k = 0; k < quante; k++) {
        const imp = Math.round(((scala * stagione) / quante) * (0.5 + r()) * 100) / 100
        totale += imp
        fatture.push({
          cc_codice: c.codice,
          data: `${base.anno}-${mm(m)}-${giorno(m)}`,
          mese: m,
          fornitore: fornitori[Math.floor(r() * fornitori.length)],
          numero: `ES-${m}${k}`,
          importo: imp,
        })
      }
      ricavi.push({
        centroNome: c.nome,
        data: `${base.anno}-${mm(m)}-${mm(giorni(m))}`,
        chi: 'Committente (esempio)',
        importo: Math.round(scala * stagione * margine * (0.9 + r() * 0.2)),
      })
      ore.push({
        cc_codice: c.codice,
        mese: m,
        ore: Math.round(150 + r() * 1300),
        persone: 2 + Math.floor(r() * 9),
      })
    }
    budget[c.codice] = Math.round(((totale / Math.max(1, base.meseUltimo)) * 12 * (0.85 + r() * 0.35)) / 100) * 100
    qonto.push({ codice: c.codice, saldo: Math.round(200 + r() * 6000) })
  }

  // Un po' di fatture ancora da attribuire anche nell'esempio: il residuo non
  // sparirà mai del tutto, e il cruscotto deve mostrarlo come lavoro da fare.
  for (let k = 0; k < 40; k++) {
    const m = 1 + Math.floor(r() * base.meseUltimo)
    fatture.push({
      cc_codice: null,
      data: `${base.anno}-${mm(m)}-${giorno(m)}`,
      mese: m,
      fornitore: FORNITORI[Math.floor(r() * FORNITORI.length)],
      numero: `ES-X${k}`,
      importo: Math.round(80 + r() * 2400),
    })
  }

  return { ...base, meseInizio: 1, esempio: true, fatture, ricavi, ore, diretti: [], qonto, budget, avvisi: [] }
}
