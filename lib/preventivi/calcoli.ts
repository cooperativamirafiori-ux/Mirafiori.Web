/**
 * Preventivi — tutti i conti, come funzioni pure.
 *
 * Le usano sia il server (che fa fede) sia la schermata, che mostra i totali
 * mentre si scrive: un solo posto, così i due numeri non possono divergere.
 * Niente import da moduli con effetti (Graph, sessione): questo file finisce
 * anche nel bundle del browser.
 */

import {
  CHIAVI_ENTE,
  COPPIE_TORINO,
  ENTE_ALTRI,
  ENTE_TUTTI,
  GIORNI_RETTA,
  GRUPPI,
  MAGGIORAZIONE_PRIVATI,
  ORE_INDIRETTE_SETTIMANA,
  REGIMI_IVA,
  SETTIMANE_MESE,
  SUFFISSO_INDIRETTO,
  ePrivato,
  type Ente,
  type RigaPreventivo,
  type SceltaCoppia,
  type Tariffa,
  type TotaliPreventivo,
} from '@/types/preventivi'

export const arrotonda = (n: number) => Math.round((Number(n) || 0) * 100) / 100

// ============================================================
// Date
// ============================================================

const ISO = /^\d{4}-\d{2}-\d{2}$/

export const isoValida = (d: unknown): d is string => typeof d === 'string' && ISO.test(d)

/** Oggi in ora italiana, YYYY-MM-DD. */
export function oggiIso(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
}

function aData(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const daData = (d: Date) => d.toISOString().slice(0, 10)

export function aggiungiGiorni(iso: string, giorni: number): string {
  const d = aData(iso)
  d.setUTCDate(d.getUTCDate() + giorni)
  return daData(d)
}

/**
 * Fine di un periodo di `mesi` mesi che parte da `dal`: il giorno prima dello
 * stesso giorno N mesi dopo (1/11 + 6 mesi → 30/04). È così che il Comune
 * scrive i progetti a sei mesi.
 */
export function finePeriodo(dal: string, mesi: number): string {
  const d = aData(dal)
  const giorno = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + mesi)
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  // Dal 31/01 per un mese: il 31/02 non c'è, il periodo arriva a fine febbraio.
  if (giorno > ultimo) {
    d.setUTCDate(ultimo)
    return daData(d)
  }
  d.setUTCDate(giorno)
  return aggiungiGiorni(daData(d), -1)
}

/** Mesi del periodo, arrotondati al mezzo mese (dal 1/11 al 30/04 = 6). */
export function mesiPeriodo(dal: string, al: string): number {
  if (!isoValida(dal) || !isoValida(al) || al < dal) return 0
  const a = aData(dal)
  const b = aData(aggiungiGiorni(al, 1))
  const mesi = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  const resto = (b.getUTCDate() - a.getUTCDate()) / 30
  return Math.max(0, Math.round((mesi + resto) * 2) / 2)
}

export function dataIt(iso: string | null | undefined): string {
  if (!iso || !isoValida(iso.slice(0, 10))) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ============================================================
// Righe e totali
// ============================================================

/** Quantità mensile della riga, ricavata dai campi che la descrivono. */
export function quantitaMensile(r: Pick<RigaPreventivo, 'unita' | 'quantita' | 'perSettimana' | 'accompagnamenti' | 'kmAccompagnamento'>): number {
  if (r.unita === 'km') {
    return arrotonda((Number(r.accompagnamenti) || 0) * (Number(r.kmAccompagnamento) || 0))
  }
  if ((r.unita === 'ora' || r.unita === 'giorno') && r.perSettimana != null && r.perSettimana !== undefined) {
    return arrotonda((Number(r.perSettimana) || 0) * SETTIMANE_MESE)
  }
  return arrotonda(Number(r.quantita) || 0)
}

export const importoRiga = (r: RigaPreventivo) => arrotonda(r.prezzo * quantitaMensile(r))

/**
 * I totali del mese e del periodo. `mesi` è la durata del preventivo (anche
 * quando la data di inizio è da definire). La maggiorazione dei privati
 * (+5%) si applica alle voci con IVA, prima dell'IVA; le spese F.I.C. restano
 * fuori.
 */
export function totali(righe: RigaPreventivo[], mesi: number, maggiorazione = false): TotaliPreventivo {
  const perGruppo = new Map<string, number>()
  const imponibile = { iva5: 0, iva22: 0 }
  let esente = 0
  let fic = 0
  for (const r of righe) {
    const imp = importoRiga(r)
    perGruppo.set(r.gruppo, arrotonda((perGruppo.get(r.gruppo) ?? 0) + imp))
    if (r.iva === 'iva5') imponibile.iva5 = arrotonda(imponibile.iva5 + imp)
    else if (r.iva === 'iva22') imponibile.iva22 = arrotonda(imponibile.iva22 + imp)
    else if (r.iva === 'fic') fic = arrotonda(fic + imp)
    else esente = arrotonda(esente + imp)
  }
  let magg = 0
  if (maggiorazione) {
    const f = MAGGIORAZIONE_PRIVATI / 100
    const m5 = arrotonda(imponibile.iva5 * f)
    const m22 = arrotonda(imponibile.iva22 * f)
    const me = arrotonda(esente * f)
    imponibile.iva5 = arrotonda(imponibile.iva5 + m5)
    imponibile.iva22 = arrotonda(imponibile.iva22 + m22)
    esente = arrotonda(esente + me)
    magg = arrotonda(m5 + m22 + me)
  }
  const iva = arrotonda(
    (imponibile.iva5 * REGIMI_IVA.iva5.aliquota) / 100 + (imponibile.iva22 * REGIMI_IVA.iva22.aliquota) / 100,
  )
  const spese = arrotonda(imponibile.iva5 + imponibile.iva22 + esente)
  const mensileSenzaIva = arrotonda(spese + fic)
  const mensileIvato = arrotonda(spese + iva + fic)
  const m = Math.max(0, Number(mesi) || 0)
  const ordine = (g: string) => {
    const i = (GRUPPI as readonly string[]).indexOf(g)
    return i < 0 ? 999 : i
  }
  return {
    perGruppo: [...perGruppo.entries()]
      .map(([gruppo, importo]) => ({ gruppo, importo }))
      .sort((a, b) => ordine(a.gruppo) - ordine(b.gruppo)),
    maggiorazione: magg,
    imponibile,
    iva,
    esente,
    fic,
    spese,
    mensileIvato,
    mensileSenzaIva,
    mesi: m,
    periodo: arrotonda(mensileIvato * m),
  }
}

/** Fine del periodo da inizio e durata; vuota se l'inizio è da definire. */
export function fineDaDurata(dal: string, mesi: number): string {
  if (!isoValida(dal) || !(mesi > 0)) return ''
  const interi = Math.floor(mesi)
  let fine = interi > 0 ? finePeriodo(dal, interi) : aggiungiGiorni(dal, -1)
  if (mesi - interi >= 0.5) fine = aggiungiGiorni(fine, 15)
  return fine
}

/** Retta giornaliera complessiva quando la retta è divisa in quote (Comune + ASL). */
export function rettaComplessiva(righe: RigaPreventivo[]): number | null {
  const quote = righe.filter((r) => r.gruppo === 'Retta' && r.unita === 'giorno' && /quota/i.test(r.voce))
  return quote.length >= 2 ? arrotonda(quote.reduce((s, r) => s + r.prezzo, 0)) : null
}

// ============================================================
// Tariffario
// ============================================================

export const tariffaValidaIl = (t: Pick<Tariffa, 'dal' | 'al'>, data: string) =>
  t.dal <= data && (!t.al || t.al >= data)

// ------------------------------------------------------------
// Chi paga: la coppia di Torino, un ente, oppure il privato
// ------------------------------------------------------------

export const eCoppia = (ente: string): ente is SceltaCoppia => ente in COPPIE_TORINO

/**
 * I nomi degli enti a cui va il preventivo: due per la coppia di Torino, uno
 * per un ente qualunque, l'ente "privato" per i servizi ai privati.
 */
export function entiDestinatari(ente: string, servizio: string, enti: Pick<Ente, 'nome' | 'chiave'>[]): string[] {
  const perChiave = (k: string) => enti.find((e) => e.chiave === k)?.nome
  if (ePrivato(servizio)) return [perChiave(CHIAVI_ENTE.privato) ?? 'Privato']
  if (eCoppia(ente)) return COPPIE_TORINO[ente].chiavi.map((k) => perChiave(k) ?? k)
  return ente ? [ente] : []
}

/**
 * Le voci di un servizio che valgono per quegli enti, alla data. Per ogni voce
 * (sottotipo + nome) si prende, nell'ordine:
 *   1. la riga dell'ente (per la coppia di Torino: dell'uno o dell'altro);
 *   2. la riga "Tutti";
 *   3. la riga "Tutti gli altri enti" — ma non per la coppia di Torino, che
 *      ha sempre le sue.
 * Le righe con un sottotipo valgono solo per quel sottotipo; quelle senza,
 * per tutti.
 */
export function vociPerPreventivo(
  tariffe: Tariffa[],
  data: string,
  servizio: string,
  sottotipo: string,
  nomiEnti: string[],
  coppia: boolean,
): Tariffa[] {
  const valide = tariffe.filter(
    (t) => t.servizio === servizio && (!t.sottotipo || t.sottotipo === sottotipo) && tariffaValidaIl(t, data),
  )
  const perVoce = new Map<string, Tariffa[]>()
  for (const t of valide) {
    const k = `${t.sottotipo}|${t.voce}`.toLowerCase()
    perVoce.set(k, [...(perVoce.get(k) ?? []), t])
  }
  const nomi = new Set(nomiEnti.map((n) => n.toLowerCase()))
  const scelte: Tariffa[] = []
  for (const righe of perVoce.values()) {
    const t =
      righe.find((r) => nomi.has(r.ente.toLowerCase())) ??
      righe.find((r) => r.ente === ENTE_TUTTI) ??
      (coppia || !nomiEnti.length ? undefined : righe.find((r) => r.ente === ENTE_ALTRI))
    if (t) scelte.push(t)
  }
  return scelte.sort((a, b) => a.ordine - b.ordine || a.voce.localeCompare(b.voce, 'it'))
}

/** I servizi della matrice, nell'ordine del tariffario. */
export function serviziDisponibili(tariffe: Tariffa[], data: string): string[] {
  const visti = new Map<string, number>()
  for (const t of tariffe) if (tariffaValidaIl(t, data) && !visti.has(t.servizio)) visti.set(t.servizio, t.ordine)
  return [...visti.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s)
}

/**
 * I sottotipi del servizio che hanno almeno una voce propria per quegli enti
 * (es. la Giulia "Retta standard" esiste solo per la coppia di Torino: con un
 * altro ente resta la "Retta omnicomprensiva").
 */
export function sottotipiDisponibili(tariffe: Tariffa[], data: string, servizio: string, nomiEnti: string[], coppia: boolean): string[] {
  const tutti = [...new Set(tariffe.filter((t) => t.servizio === servizio && t.sottotipo && tariffaValidaIl(t, data)).map((t) => t.sottotipo))]
  return tutti.filter((st) =>
    vociPerPreventivo(tariffe, data, servizio, st, nomiEnti, coppia).some((t) => t.sottotipo === st),
  )
}

/**
 * Le rette da mettere da sole quando si sceglie servizio ed ente: le quote
 * (Comune + ASL) tutte insieme, oppure la retta se è una sola. Con più rette
 * alternative (Casa Artemisia: 1, 2 o 3 ospiti) si sceglie a mano.
 */
export function retteAutomatiche(voci: Tariffa[]): Tariffa[] {
  const rette = voci.filter((t) => t.gruppo === 'Retta')
  if (rette.length >= 2 && rette.every((t) => /quota/i.test(t.voce))) return rette
  return rette.length === 1 ? rette : []
}

/** La tariffa di un codice valida alla data. Le righe del lavoro indiretto rimandano al costo orario. */
export function tariffaPerCodice(tariffe: Tariffa[], codice: string, data: string): Tariffa | null {
  const base = codice.endsWith(SUFFISSO_INDIRETTO) ? codice.slice(0, -SUFFISSO_INDIRETTO.length) : codice
  return tariffe.find((t) => t.codice === base && tariffaValidaIl(t, data)) ?? null
}

/**
 * Il prezzo è ammesso per quella tariffa? Il prezzo del tariffario è fisso;
 * se manca ("da definire") lo scrive chi fa il preventivo. `libero` = chi ha
 * il permesso Preventivi o Amministrazione può cambiarlo comunque.
 */
export function problemaPrezzo(t: Tariffa, prezzo: number, libero: boolean): string | null {
  if (!(prezzo >= 0)) return `«${t.voce}»: prezzo non valido`
  if (libero || t.prezzo === null) return null
  return arrotonda(prezzo) === arrotonda(t.prezzo) ? null : `«${t.voce}»: il prezzo è fisso a ${euro(t.prezzo)}`
}

/**
 * Riporta le righe ai prezzi del tariffario valido alla data: serve al rinnovo
 * (dopo un adeguamento ISTAT il rinnovo deve uscire col prezzo nuovo) e alle
 * bozze rimaste aperte a cavallo di un cambio. Le voci "da definire" tengono
 * il prezzo scritto nel preventivo. Ritorna anche cosa è cambiato.
 */
export function allineaPrezzi(
  righe: RigaPreventivo[],
  tariffe: Tariffa[],
  data: string,
): { righe: RigaPreventivo[]; cambiate: { voce: string; prima: number; dopo: number }[]; senzaTariffa: string[] } {
  const cambiate: { voce: string; prima: number; dopo: number }[] = []
  const senzaTariffa: string[] = []
  const nuove = righe.map((r) => {
    const t = tariffaPerCodice(tariffe, r.codice, data)
    if (!t) {
      senzaTariffa.push(r.voce)
      return r
    }
    const prezzo = t.prezzo === null ? r.prezzo : t.prezzo
    if (arrotonda(prezzo) !== arrotonda(r.prezzo)) cambiate.push({ voce: r.voce, prima: r.prezzo, dopo: prezzo })
    const indiretto = r.codice.endsWith(SUFFISSO_INDIRETTO)
    return { ...r, prezzo, voce: indiretto ? r.voce : t.voce, gruppo: t.gruppo, unita: t.unita, iva: t.iva }
  })
  return { righe: nuove, cambiate, senzaTariffa }
}

/** Nuova riga a partire da una voce del tariffario. Le rette partono da 31 giorni. */
export function rigaDaTariffa(t: Tariffa): RigaPreventivo {
  return {
    codice: t.codice,
    voce: t.voce,
    gruppo: t.gruppo,
    unita: t.unita,
    prezzo: t.prezzo ?? 0,
    iva: t.iva,
    quantita: t.unita === 'giorno' && t.gruppo === 'Retta' ? GIORNI_RETTA : t.unita === 'mese' || t.unita === 'forfait' ? 1 : 0,
    perSettimana: null,
    ...(t.unita === 'km' ? { percorso: '', accompagnamenti: 0, kmAccompagnamento: 0 } : {}),
  }
}

/** La riga del lavoro indiretto dei privati: 0,5 h a settimana al costo orario della voce. */
export function rigaIndiretta(base: RigaPreventivo): RigaPreventivo {
  return {
    codice: `${base.codice}${SUFFISSO_INDIRETTO}`,
    voce: 'Lavoro indiretto',
    gruppo: base.gruppo,
    unita: 'ora',
    prezzo: base.prezzo,
    iva: base.iva,
    quantita: 0,
    perSettimana: ORE_INDIRETTE_SETTIMANA,
  }
}

// ============================================================
// Adeguamento ISTAT
// ============================================================

export interface VoceIstat {
  spItemId: string
  codice: string
  servizio: string
  voce: string
  ente: string
  prima: number
  dopo: number
}

/**
 * Anteprima dell'adeguamento: per ogni voce scelta, valida alla data di
 * decorrenza, il prezzo nuovo aumentato della percentuale. Le voci senza
 * prezzo e quelle F.I.C. (km, pedaggi, budget) restano fuori.
 * Si applica chiudendo la riga vecchia il giorno prima e aprendone una nuova:
 * i preventivi già fatti conservano il prezzo con cui sono nati.
 */
export function anteprimaIstat(tariffe: Tariffa[], percentuale: number, dal: string, ids?: string[]): VoceIstat[] {
  const f = 1 + percentuale / 100
  return tariffe
    .filter((t) => tariffaValidaIl(t, dal) && t.dal < dal)
    .filter((t) => !ids || ids.includes(t.spItemId))
    .filter((t): t is Tariffa & { prezzo: number } => t.prezzo !== null && t.prezzo > 0 && t.unita !== 'km' && t.iva !== 'fic')
    .map((t) => ({
      spItemId: t.spItemId,
      codice: t.codice,
      servizio: t.servizio,
      voce: t.voce,
      ente: t.ente,
      prima: t.prezzo,
      dopo: arrotonda(t.prezzo * f),
    }))
}

// ============================================================
// Formato
// ============================================================

export function euro(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

export function numero(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 })
}

/** Iniziali del beneficiario, per i nomi di file (mai il nome intero). */
export function iniziali(nome: string): string {
  return (nome || '')
    .split(/[\s']+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + '.')
    .join('')
}
