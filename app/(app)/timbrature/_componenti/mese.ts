/**
 * Formattatori e ritaglio "fino a oggi" del riepilogo mensile.
 *
 * Due viste mostravano gli stessi numeri in modi diversi: il dipendente con la
 * virgola decimale e senza unita', il cruscotto RU col punto e con la "h". Qui
 * ci sono le funzioni che entrambe usano, cosi' la stessa ora si scrive in un
 * modo solo.
 *
 * Il pezzo importante e' `ritagliaAOggi`. Il server calcola il riepilogo su
 * TUTTO il mese, perche' quello stesso calcolo alimenta il foglio ore Excel e
 * il foglio ore deve restare mensile. Ma sullo schermo, a mese in corso, le ore
 * attese dell'intero mese producevano uno scostamento sempre enormemente
 * negativo — il 10 agosto un dipendente si vedeva "-56 h" e non era un debito,
 * erano solo le tre settimane che mancavano. Il numero piu' grande della pagina
 * era quello che diceva meno, e chi lo guarda impara a ignorarlo.
 *
 * Quindi il ritaglio si fa qui, lato client, partendo da `riepilogo.giorni` che
 * il server manda gia' spaccato giorno per giorno: nessuna modifica al calcolo
 * del foglio ore.
 */

import type {
  RiepilogoPeriodo,
  RiepilogoSettimana,
  Timbratura,
  OrePerVoce,
} from '@/types/timbrature'

export const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]
const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const GIORNI_LUNGHI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']

/** Nome della voce che consuma il monte di flessibilità (causale 908). */
export const VOCE_FLESSIBILITA = 'Flessibilità'
/** Voce non retribuita: copre il monte ore ma in busta e' una trattenuta. */
export const VOCE_NON_RETRIBUITA = 'Permessi NON retribuiti'
/** Voci per cui esiste un residuo maturato, che arrivera' dai cedolini. */
export const VOCI_CON_RESIDUO = ['Ferie', 'Fest.Sopp.', VOCE_FLESSIBILITA]

export function pad(n: number) { return String(n).padStart(2, '0') }
export function ymd(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}` }
export function ultimoGiornoMese(y: number, m: number) { return new Date(y, m, 0).getDate() }

/** Data odierna YYYY-MM-DD nel fuso locale del dispositivo. */
export function oggiYmd(): string {
  const d = new Date()
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function weekdayIdx(dataYmd: string) {
  const [y, m, d] = dataYmd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
export function weekdayShort(dataYmd: string) { return GIORNI[weekdayIdx(dataYmd)] }
export function dataEstesa(dataYmd: string) {
  const [, m, d] = dataYmd.split('-').map(Number)
  return `${GIORNI_LUNGHI[weekdayIdx(dataYmd)]} ${d} ${MESI[m - 1].toLowerCase()}`
}
/**
 * "Dal 1 al 10 agosto" — il periodo davvero conteggiato, scritto per esteso.
 *
 * Serve sopra le tre schede: senza, "24 h da fare" sembra il monte ore di tutto
 * il mese e il confronto con le ore gia' registrate non ha senso. E' il primo
 * appunto arrivato guardando l'anteprima.
 */
export function periodoEsteso(inizio: string, fine: string): string {
  const [, mi, di] = inizio.split('-').map(Number)
  const [, mf, df] = fine.split('-').map(Number)
  const nomeI = MESI[mi - 1].toLowerCase()
  const nomeF = MESI[mf - 1].toLowerCase()
  if (inizio === fine) return `${di} ${nomeI}`
  return mi === mf ? `dal ${di} al ${df} ${nomeF}` : `dal ${di} ${nomeI} al ${df} ${nomeF}`
}

/** 04/08 — la forma corta usata negli elenchi di date. */
export function gg(dataYmd: string) { return `${dataYmd.slice(8, 10)}/${dataYmd.slice(5, 7)}` }
export function fmtRange(from: string, to: string) {
  const f = gg(from)
  const t = gg(to)
  return f === t ? f : `${f}–${t}`
}

/**
 * Ore in forma leggibile: virgola decimale, niente zeri inutili in coda.
 * `8` resta `8`, `8.42` diventa `8,42`. La "h" la mette chi chiama.
 */
export function oreLabel(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
  return s.replace('.', ',')
}
export function segno(n: number): string {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + oreLabel(Math.abs(n))
}
export function scostClasse(n: number) {
  if (n < -0.001) return 'bg-red-100 text-red-700'
  if (n > 0.001) return 'bg-emerald-100 text-emerald-700'
  return 'bg-gray-100 text-gray-600'
}

/** Riepilogo ritagliato al giorno che si sta guardando (oggi incluso). */
export interface RiepilogoAOggi {
  /** Ultimo giorno conteggiato: l'ultimo del mese, o oggi se il mese e' in corso. */
  finoA: string
  /** True se il mese e' ancora in corso, cioe' il ritaglio ha tolto qualcosa. */
  inCorso: boolean
  oreLavorate: number
  oreGiustificativo: number
  oreAttese: number
  /** (lavorate + giustificativi) − attese, tutto fino a `finoA`. */
  scostamento: number
  /** Date gia' trascorse rimaste scoperte (giorni lavorativi non completi). */
  giorniScoperti: string[]
  notti: number
  turniReperibilita: number
  flessibilitaLavorata: number
  flessibilitaRecuperata: number
  flessibilitaSaldo: number
  settimane: RiepilogoSettimana[]
  giustificativi: OrePerVoce[]
}

const r4 = (n: number) => Math.round(n * 10000) / 10000

/**
 * Ritaglia il riepilogo mensile al giorno indicato.
 *
 * `oggi` e' compreso: e' la scelta di Dennis. Vuol dire che al mattino, prima di
 * timbrare, la giornata in corso risulta scoperta — ma e' anche l'unico modo di
 * rispondere alla domanda vera, "sono indietro adesso, devo recuperare nei
 * giorni che restano?".
 *
 * Le notti, la reperibilita' e lo spaccato dei giustificativi non stanno nei
 * totali per giorno, quindi si ricontano dalle righe.
 */
export function ritagliaAOggi(
  riepilogo: RiepilogoPeriodo,
  timbrature: Timbratura[],
  oggi: string = oggiYmd(),
): RiepilogoAOggi {
  const giorni = riepilogo.giorni.filter((g) => g.data <= oggi)
  const inCorso = giorni.length < riepilogo.giorni.length
  const finoA = giorni.length ? giorni[giorni.length - 1].data : oggi

  let oreLavorate = 0
  let oreGiustificativo = 0
  let oreAttese = 0
  let flessibilitaLavorata = 0
  const giorniScoperti: string[] = []

  for (const g of giorni) {
    oreLavorate += g.oreLavorate
    oreGiustificativo += g.oreGiustificativo
    oreAttese += g.oreAttese
    // Stessa formula del server: le ore di lavoro sopra il monte ore del
    // giorno, al netto di quanto quel giorno era gia' coperto da assenze.
    const atteseResidue = Math.max(0, g.oreAttese - g.oreGiustificativo)
    flessibilitaLavorata += Math.max(0, g.oreLavorate - atteseResidue)
    // "Da sistemare" solo le giornate gia' finite. Le ore attese di oggi
    // entrano nel conteggio (scelta di Dennis: si vuole sapere come si sta
    // messi adesso), ma dire "hai una giornata da sistemare" alle nove del
    // mattino, per un turno che deve ancora cominciare, sarebbe un falso
    // allarme quotidiano. E' anche la regola che il cruscotto RU usava gia'.
    if (!g.festivo && g.oreAttese > 0 && !g.completo && g.data < oggi) giorniScoperti.push(g.data)
  }

  // Spaccato per voce, notti e reperibilita': dalle righe, non dai giorni.
  const righe = timbrature.filter((t) => t.data <= oggi)
  const perVoce = new Map<number, OrePerVoce>()
  let notti = 0
  let turniReperibilita = 0
  for (const t of righe) {
    if (t.tipoVoce === 'giustificativo') {
      const v = perVoce.get(t.servizioId) ?? {
        servizioId: t.servizioId,
        nome: t.servizioNome ?? '',
        ore: 0,
      }
      v.ore += t.ore
      perVoce.set(t.servizioId, v)
    } else {
      if (t.notte) notti++
      if (t.reperibilita) turniReperibilita++
    }
  }
  const giustificativi = [...perVoce.values()]
    .map((v) => ({ ...v, ore: r4(v.ore) }))
    .filter((v) => v.ore > 0.0001)
    .sort((a, b) => b.ore - a.ore || a.nome.localeCompare(b.nome, 'it'))

  const flessibilitaRecuperata = giustificativi
    .filter((v) => v.nome === VOCE_FLESSIBILITA)
    .reduce((s, v) => s + v.ore, 0)

  // Le settimane gia' concluse restano quelle del server; quella in corso si
  // ricalcola fino a oggi, altrimenti diceva "in corso" senza numero e le righe
  // non sommavano piu' al totale del mese.
  const settimane = riepilogo.settimane
    .filter((w) => w.inizio <= oggi)
    .map((w) => {
      if (w.fine <= oggi) return w
      const dentro = giorni.filter((g) => g.data >= w.inizio && g.data <= w.fine)
      const lav = dentro.reduce((s, g) => s + g.oreLavorate, 0)
      const giu = dentro.reduce((s, g) => s + g.oreGiustificativo, 0)
      const att = dentro.reduce((s, g) => s + g.oreAttese, 0)
      return {
        ...w,
        fine: dentro.length ? dentro[dentro.length - 1].data : w.inizio,
        oreLavorate: r4(lav),
        oreGiustificativo: r4(giu),
        oreAttese: r4(att),
        scostamento: r4(lav + giu - att),
        conclusa: false,
      }
    })

  return {
    finoA,
    inCorso,
    oreLavorate: r4(oreLavorate),
    oreGiustificativo: r4(oreGiustificativo),
    oreAttese: r4(oreAttese),
    scostamento: r4(oreLavorate + oreGiustificativo - oreAttese),
    giorniScoperti,
    notti,
    turniReperibilita,
    flessibilitaLavorata: r4(flessibilitaLavorata),
    flessibilitaRecuperata: r4(flessibilitaRecuperata),
    flessibilitaSaldo: r4(flessibilitaLavorata - flessibilitaRecuperata),
    settimane,
    giustificativi,
  }
}

/**
 * La riga in italiano che apre il riepilogo.
 *
 * E' la parte piu' importante di tutto il cruscotto: un neo-assunto non sa cosa
 * sia uno "scostamento", ma sa leggere "sei indietro di 5 ore". I numeri sotto
 * servono a verificare la frase, non a essere interpretati.
 *
 * `nome` assente = sto guardando me stesso, quindi seconda persona.
 */
export function frasiSintesi(r: RiepilogoAOggi, nome?: string): { titolo: string; tono: 'ok' | 'avviso' | 'info' } {
  const chi = nome ? nome : null
  const sog = (v: string, t: string) => (chi ? `${chi} ${t}` : v)
  const scoperti = r.giorniScoperti.length

  if (scoperti > 0) {
    const quali = r.giorniScoperti.map(gg).join(', ')
    const g = scoperti === 1 ? 'una giornata da sistemare' : `${scoperti} giornate da sistemare`
    return { titolo: `${sog('Hai', 'ha')} ${g}: ${quali}.`, tono: 'avviso' }
  }
  if (r.scostamento < -0.001) {
    return {
      titolo: `${sog('Sei', 'è')} indietro di ${oreLabel(Math.abs(r.scostamento))} ore rispetto a oggi.`,
      tono: 'avviso',
    }
  }
  if (r.scostamento > 0.001) {
    return {
      titolo: `${sog('Hai', 'ha')} fatto ${oreLabel(r.scostamento)} ore in più di quelle previste finora.`,
      tono: 'ok',
    }
  }
  if (r.oreAttese < 0.001) {
    return { titolo: 'Non ci sono ancora ore da registrare in questo mese.', tono: 'info' }
  }
  return { titolo: `${sog('Sei', 'è')} in pari con le ore previste finora.`, tono: 'ok' }
}
