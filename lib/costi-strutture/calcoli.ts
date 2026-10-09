/**
 * Tutti i conti del cruscotto Costi per struttura. Funzione PURA: riceve le
 * fonti già lette, non tocca né SharePoint né Supabase — si prova da sola.
 *
 * Regole (docs/utenze.md):
 *   - bollette: importo × percentuale della quota, distribuito sui giorni del
 *     periodo di competenza (una bimestrale di gennaio-febbraio va metà e metà);
 *     senza periodo, nel mese della fattura. Conta solo la parte che cade
 *     nell'anno;
 *   - Costi Strutture: nel mese della DataCosto, nel parziale dato dalla
 *     categoria. Le categorie che sembrano bollette NON si contano (arrivano
 *     già dagli XML): avviso;
 *   - costi fissi: importo ÷ mesi della frequenza, ogni mese dal mese della
 *     prima scadenza (gennaio se è di un anno prima) fino al mese limite;
 *   - Cura Ambienti: consuntivo del lavoro nel suo mese di competenza;
 *   - anno in corso: si conta fino al mese di oggi, così i costi fissi non
 *     anticipano mesi che non ci sono ancora stati;
 *   - lavoro interno di Cura Ambienti (Dennis, 9/10/2026): VINCONO I LAVORI.
 *     Dal primo mese in cui una struttura ha lavori consuntivati, dei ticket
 *     in Costi Strutture si conta solo la parte del fornitore esterno, e i
 *     costi diretti "Cura Ambienti" non si contano: quel lavoro è già nei
 *     Lavori Cura Ambienti. Prima di quel mese si conta tutto come prima.
 */

import { MESI_FREQUENZA, type CostoFisso } from '@/types/costi-fissi'
import { UNITA_TIPO, type Bolletta, type StrutturaCc, type TipoUtenza } from '@/types/utenze'
import {
  PARZIALI,
  vuotoPerParziale,
  type CruscottoStrutture,
  type Parziale,
  type SchedaStruttura,
} from '@/types/costi-strutture'

export interface CostoSp {
  data: string
  categoria: string
  importo: number
  strutturaId: number | null
  descrizione: string
  fornitore: string | null
  /** Per i ticket di manutenzione: la parte pagata al fornitore esterno (il resto sono ore interne). null = non è un ticket. */
  esterno: number | null
}

export interface LavoroCa {
  strutturaCodice: string
  mese: string
  titolo: string
  importo: number | null
}

export interface Fonti {
  anno: number
  oggi: string                 // ISO
  strutture: StrutturaCc[]     // già filtrate per chi guarda
  bollette: Bolletta[]
  costi: CostoSp[]
  fissi: CostoFisso[]
  lavori: LavoroCa[]
  daCollegare: { codici: number; importo: number }
  /** Fonti che non hanno risposto: diventano avvisi, mai zeri silenziosi. */
  guasti: string[]
}

const tondo = (n: number) => Math.round(n * 100) / 100
const dodici = () => Array.from({ length: 12 }, () => 0)
const ETICHETTA_UTENZA: Record<TipoUtenza, string> = { luce: 'Luce', gas: 'Gas', acqua: 'Acqua', altro: 'Altra utenza' }

/** Dalla categoria libera di Costi Strutture al parziale; null = bolletta inserita a mano (non si conta). */
export function parzialeDiCategoria(categoria: string): Parziale | null {
  const c = categoria.toLowerCase()
  if (/energia|\bluce\b|\bgas\b|\bacqua|\butenz|bollett/.test(c)) return null // \b: "man-utenz-ione" non è un'utenza
  if (/manutenz|riparaz|guasto/.test(c)) return 'manutenzioni'
  if (/pulizi/.test(c)) return 'pulizie'
  if (/^acquist/.test(c)) return 'acquisti'
  if (/telefon|internet/.test(c)) return 'telefonia'
  return 'altro'
}

/** Dalla categoria dei costi fissi al parziale (luce/gas/acqua → utenze, con avviso a parte). */
export function parzialeDiFisso(categoria: string): Parziale {
  if (['Energia elettrica', 'Gas', 'Acqua'].includes(categoria)) return 'utenze'
  if (categoria === 'Telefonia/Internet') return 'telefonia'
  if (categoria === 'Pulizie') return 'pulizie'
  return 'costi_fissi'
}

/** Quota di [dal, al] che cade in ciascun mese dell'anno, in frazioni che sommano alla parte nell'anno. */
export function ripartoMesi(anno: number, dal: string, al: string): number[] {
  const out = dodici()
  const t0 = Date.parse(`${dal}T00:00:00Z`)
  const t1 = Date.parse(`${al}T00:00:00Z`)
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return out
  const giorni = Math.round((t1 - t0) / 86_400_000) + 1
  for (let t = t0; t <= t1; t += 86_400_000) {
    const d = new Date(t)
    if (d.getUTCFullYear() === anno) out[d.getUTCMonth()] += 1 / giorni
  }
  return out
}

function nuovaScheda(s: StrutturaCc): SchedaStruttura {
  const mesiPerParziale = Object.fromEntries(PARZIALI.map((p) => [p.chiave, dodici()])) as Record<Parziale, number[]>
  return {
    id: s.id, codice: s.codice, nome: s.nome, ccCodice: s.ccCodice, ccNome: s.ccNome,
    totale: 0, parziali: vuotoPerParziale(), mesi: dodici(), mesiPerParziale, utenze: [], movimenti: [], avvisi: [],
  }
}

export function calcolaCruscotto(f: Fonti): CruscottoStrutture {
  const { anno } = f
  const oggi = new Date(f.oggi)
  const meseLimite = oggi.getUTCFullYear() > anno ? 11 : oggi.getUTCFullYear() < anno ? -1 : oggi.getUTCMonth()

  const schede = new Map<number, SchedaStruttura>(f.strutture.map((s) => [s.id, nuovaScheda(s)]))
  const perCodice = new Map(f.strutture.map((s) => [s.codice, s.id]))
  const avvisi = f.guasti.map((g) => `Non è stato possibile leggere ${g}: i suoi importi mancano.`)

  const aggiungi = (sc: SchedaStruttura, p: Parziale, mese: number, importo: number) => {
    sc.mesiPerParziale[p][mese] += importo
  }

  // --- Bollette ---------------------------------------------------------
  const utenze = new Map<string, { importo: number; consumo: number; importoConConsumo: number; mesiImporto: number[]; mesiConsumo: number[]; tipo: TipoUtenza; unita: string }>()
  for (const b of f.bollette) {
    const dal = b.periodoDal ?? b.dataFattura
    const al = b.periodoAl ?? b.periodoDal ?? b.dataFattura
    const fraz = b.periodoDal || b.periodoAl ? ripartoMesi(anno, dal, al) : (() => {
      const m = dodici()
      if (b.dataFattura.startsWith(String(anno))) m[Number(b.dataFattura.slice(5, 7)) - 1] = 1
      return m
    })()
    const nellAnno = fraz.reduce((s, x) => s + x, 0)
    if (nellAnno <= 0) continue
    for (const q of b.quote) {
      const sc = schede.get(q.strutturaId)
      if (!sc) continue
      const k = q.percentuale / 100
      let tot = 0
      const chiave = `${sc.id}|${b.tipo}`
      const u = utenze.get(chiave) ?? { importo: 0, consumo: 0, importoConConsumo: 0, mesiImporto: dodici(), mesiConsumo: dodici(), tipo: b.tipo, unita: b.unita ?? UNITA_TIPO[b.tipo] }
      fraz.forEach((x, m) => {
        if (!x) return
        const imp = b.importo * k * x
        tot += imp
        aggiungi(sc, 'utenze', m, imp)
        u.mesiImporto[m] += imp
        if (b.consumo != null) u.mesiConsumo[m] += b.consumo * k * x
      })
      u.importo += tot
      if (b.consumo != null) {
        u.consumo += b.consumo * k * nellAnno
        u.importoConConsumo += tot
      }
      utenze.set(chiave, u)
      sc.movimenti.push({
        data: b.periodoDal ?? b.dataFattura,
        parziale: 'utenze',
        sotto: ETICHETTA_UTENZA[b.tipo],
        descrizione: `${b.fornitore} n. ${b.numero} · ${b.codice}${b.periodoDal ? ` · ${b.periodoDal} → ${b.periodoAl}` : ''}${b.consumo != null ? ` · ${Math.round(b.consumo * k)} ${b.unita ?? ''}` : ''}${q.percentuale < 100 ? ` · ${q.percentuale}%` : ''}`,
        importo: tondo(tot),
        link: b.pdfUrl,
      })
    }
  }
  for (const [chiave, u] of utenze) {
    const sc = schede.get(Number(chiave.split('|')[0]))!
    sc.utenze.push({
      tipo: u.tipo,
      unita: u.unita,
      importo: tondo(u.importo),
      consumo: Math.round(u.consumo),
      costoUnitario: u.consumo > 0 ? Math.round((u.importoConConsumo / u.consumo) * 1000) / 1000 : null,
      mesiImporto: u.mesiImporto.map(tondo),
      mesiConsumo: u.mesiConsumo.map((x) => Math.round(x)),
    })
  }

  // --- Costi Strutture ---------------------------------------------------
  // Primo mese con lavori di Cura Ambienti, per struttura.
  const inizioCa = new Map<number, number>()
  for (const l of f.lavori) {
    const id = perCodice.get(l.strutturaCodice)
    if (!id || !l.mese.startsWith(String(anno))) continue
    const m = Number(l.mese.slice(5, 7)) - 1
    inizioCa.set(id, Math.min(inizioCa.get(id) ?? 12, m))
  }
  const senzaStruttura = { righe: 0, importo: 0 }
  let bolletteAMano = 0
  for (const c0 of f.costi) {
    let c = c0
    const d = new Date(c.data)
    if (isNaN(d.getTime()) || d.getFullYear() !== anno) continue
    if (!c.strutturaId) {
      senzaStruttura.righe++
      senzaStruttura.importo += c.importo
      continue
    }
    const sc = schede.get(c.strutturaId)
    if (!sc) continue
    const ca = inizioCa.get(sc.id)
    if (ca !== undefined && d.getMonth() >= ca) {
      if (c.esterno !== null) {
        // Ticket: resta solo il fornitore esterno.
        if (c.esterno <= 0) continue
        if (c.esterno < c.importo) c = { ...c, importo: c.esterno, descrizione: `${c.descrizione} (solo fornitore: le ore interne sono nei Lavori Cura Ambienti)` }
      } else if (/cura ambienti/i.test(`${c.descrizione} ${c.fornitore ?? ''}`)) {
        continue
      }
    }
    const p = parzialeDiCategoria(c.categoria)
    if (!p) {
      bolletteAMano++
      sc.avvisi.push(`"${c.descrizione}" (${c.categoria}, ${c.importo.toFixed(2)} €) è in Costi Strutture ma sembra una bolletta: non è contato, le bollette arrivano dagli XML.`)
      continue
    }
    aggiungi(sc, p, d.getMonth(), c.importo)
    sc.movimenti.push({
      data: c.data.slice(0, 10),
      parziale: p,
      sotto: c.categoria,
      descrizione: [c.descrizione, c.fornitore].filter(Boolean).join(' · '),
      importo: tondo(c.importo),
      link: null,
    })
  }
  if (bolletteAMano) avvisi.push(`${bolletteAMano} costi inseriti a mano sembrano bollette e non sono contati: guarda gli avvisi delle strutture.`)

  // --- Costi fissi -------------------------------------------------------
  // Ogni voce vale dal mese di inizio al mese di fine compresi: una variazione
  // (affitto aumentato) è una voce chiusa più una nuova, quindi il passato
  // resta com'era. Spenta senza data di fine = non si sa da quando: non conta.
  const meseIdx = (iso: string | null, seManca: number) => {
    if (!iso) return seManca
    const a = Number(iso.slice(0, 4))
    return a < anno ? -1 : a > anno ? 12 : Number(iso.slice(5, 7)) - 1
  }
  for (const c of f.fissi) {
    if (!c.strutturaId) continue
    const sc = schede.get(c.strutturaId)
    if (!sc) continue
    if (!c.dataFine && !c.attivo) {
      sc.avvisi.push(`Il costo fisso "${c.descrizione}" è spento ma senza data di fine: non è contato. Chiudilo con "Termina" per tenere i mesi in cui c'era.`)
      continue
    }
    const passo = MESI_FREQUENZA[c.frequenza] ?? 12
    const quota = c.importo / passo
    const inizio = Math.max(0, meseIdx(c.dataPrimaScadenza, 0))
    const fine = Math.min(meseLimite, c.dataFine ? meseIdx(c.dataFine, 11) : 11)
    if (fine < inizio) continue
    const p = parzialeDiFisso(c.categoria)
    if (p === 'utenze') sc.avvisi.push(`Il costo fisso "${c.descrizione}" è di ${c.categoria}: si somma alle bollette XML, controlla che non sia un doppione.`)
    for (let m = inizio; m <= fine; m++) aggiungi(sc, p, m, quota)
    const mesi = fine - inizio + 1
    sc.movimenti.push({
      data: `${anno}-${String(inizio + 1).padStart(2, '0')}-01`,
      parziale: p,
      sotto: c.categoria,
      descrizione: `${c.descrizione} · ${c.importo.toFixed(2)} € ${c.frequenza.toLowerCase()} · ${mesi} ${mesi === 1 ? 'mese' : 'mesi'}${c.dataFine ? ` (fino al ${c.dataFine})` : ''}`,
      importo: tondo(quota * mesi),
      link: null,
    })
  }

  // --- Lavori Cura Ambienti ---------------------------------------------
  for (const l of f.lavori) {
    const id = perCodice.get(l.strutturaCodice)
    const sc = id ? schede.get(id) : undefined
    if (!sc || !l.mese.startsWith(String(anno))) continue
    if (l.importo == null) {
      sc.avvisi.push(`Lavoro Cura Ambienti "${l.titolo}" (${l.mese.slice(0, 7)}): manca la tariffa interna del mese, importo non calcolabile.`)
      continue
    }
    const m = Number(l.mese.slice(5, 7)) - 1
    aggiungi(sc, 'cura_ambienti', m, l.importo)
    sc.movimenti.push({ data: l.mese, parziale: 'cura_ambienti', sotto: null, descrizione: l.titolo, importo: tondo(l.importo), link: null })
  }

  // --- Totali -------------------------------------------------------------
  const tot = { parziali: vuotoPerParziale(), mesi: dodici() }
  const out = [...schede.values()].map((sc) => {
    for (const { chiave } of PARZIALI) {
      sc.mesiPerParziale[chiave] = sc.mesiPerParziale[chiave].map(tondo)
      sc.parziali[chiave] = tondo(sc.mesiPerParziale[chiave].reduce((s, x) => s + x, 0))
      tot.parziali[chiave] += sc.parziali[chiave]
      sc.mesiPerParziale[chiave].forEach((x, m) => {
        sc.mesi[m] += x
        tot.mesi[m] += x
      })
    }
    sc.mesi = sc.mesi.map(tondo)
    sc.totale = tondo(Object.values(sc.parziali).reduce((s, x) => s + x, 0))
    sc.movimenti.sort((a, b) => b.data.localeCompare(a.data))
    sc.utenze.sort((a, b) => ['luce', 'gas', 'acqua', 'altro'].indexOf(a.tipo) - ['luce', 'gas', 'acqua', 'altro'].indexOf(b.tipo))
    return sc
  })
  out.sort((a, b) => b.totale - a.totale || a.codice.localeCompare(b.codice))

  if (f.daCollegare.codici) {
    avvisi.push(`${f.daCollegare.codici} codici di fornitura arrivati in fattura non sono nella Mappatura Utenze (${f.daCollegare.importo.toFixed(2)} €): collegali dalla schermata Utenze.`)
  }

  for (const k of Object.keys(tot.parziali) as Parziale[]) tot.parziali[k] = tondo(tot.parziali[k])
  return {
    anno,
    meseLimite,
    totale: tondo(Object.values(tot.parziali).reduce((s, x) => s + x, 0)),
    parziali: tot.parziali,
    mesi: tot.mesi.map(tondo),
    strutture: out,
    senzaStruttura: { righe: senzaStruttura.righe, importo: tondo(senzaStruttura.importo) },
    daCollegare: f.daCollegare,
    avvisi,
  }
}
