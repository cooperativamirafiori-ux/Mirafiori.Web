/**
 * Riepiloghi: dalle righe di ore ai numeri che si guardano.
 *
 * Un principio, che vale per tutto il file: **niente contatori memorizzati.**
 * Ogni totale si ricalcola dalle righe a ogni lettura. Un saldo salvato prima o
 * poi divergerebbe dai dati — basta una riga corretta dal responsabile, una
 * cancellata, una variazione di monte ore registrata in ritardo — e racconterebbe
 * una storia che le righe non confermano piu'. Ricalcolando, "in tempo reale"
 * non e' una funzione in piu': e' semplicemente come funziona.
 */

import { supabase } from '@/lib/core/supabase'
import {
  getDipendenti,
  mapDip,
  monteToSettimana,
  profiloVigente,
} from '@/lib/timbrature/anagrafica'
import {
  giorniDa,
  lunediIso,
  meseScaduto,
  oggiRoma,
  primoUltimoGiorno,
  round4,
  weekdayIso,
} from '@/lib/timbrature/date'
import { festivitaAnno } from '@/lib/timbrature/festivita'
import { listTimbrature } from '@/lib/timbrature/righe'
import { getChiusura, marcaDaValidare } from '@/lib/timbrature/stati'
import type {
  ChiusuraMese,
  Dipendente,
  OrePerVoce,
  RiepilogoGiorno,
  RiepilogoPeriodo,
  RiepilogoSettimana,
  StatoDipendenteMese,
} from '@/types/timbrature'

/**
 * Il nome della voce con cui il dipendente dichiara le ore che non ha lavorato
 * e attinge al monte di flessibilità. E' il legame fra l'anagrafica dei servizi e il
 * calcolo della flessibilita': se un domani la voce venisse rinominata,
 * `flessibilitaRecuperata` tornerebbe zero senza dire niente, quindi il nome sta
 * scritto qui una volta sola e non sparso nel codice.
 */
export const VOCE_FLESSIBILITA = 'Flessibilità'

/** Costruisce il riepilogo giorno per giorno tra from e to (inclusi). */
export async function riepilogoPeriodo(
  dipendenteId: number,
  from: string,
  to: string,
): Promise<RiepilogoPeriodo> {
  const timb = await listTimbrature(dipendenteId, from, to)
  const festivita = {
    ...festivitaAnno(Number(from.slice(0, 4))),
    ...festivitaAnno(Number(to.slice(0, 4))),
  }

  // profili: prendi il vigente all'inizio periodo (assunzione: cambio raro)
  const profStart = await profiloVigente(dipendenteId, from)
  const monte = monteToSettimana(profStart)

  const perGiorno = new Map<string, RiepilogoGiorno>()
  const d0 = new Date(from + 'T00:00:00Z')
  const d1 = new Date(to + 'T00:00:00Z')
  for (let d = new Date(d0); d <= d1; d.setUTCDate(d.getUTCDate() + 1)) {
    const ymd = d.toISOString().slice(0, 10)
    const nome = festivita[ymd]
    const festivo = !!nome
    const attese = festivo ? 0 : monte[weekdayIso(ymd)]
    perGiorno.set(ymd, {
      data: ymd,
      oreLavorate: 0,
      oreGiustificativo: 0,
      oreAttese: attese,
      festivo,
      festivitaNome: nome,
      completo: attese === 0,
      voci: [],
      notte: false,
      reperibilita: false,
    })
  }

  // Spaccato per voce di giustificativo (Ferie, Flessibilità, Permessi, …):
  // il totale aggregato non basta, chi compila vuole sapere quanto ha usato di
  // che cosa.
  const perGiust = new Map<number, OrePerVoce>()
  let notti = 0
  let turniReperibilita = 0

  for (const t of timb) {
    const g = perGiorno.get(t.data)
    if (!g) continue
    if (t.tipoVoce === 'giustificativo') {
      g.oreGiustificativo += t.ore
      if (t.servizioNome && !g.voci.includes(t.servizioNome)) g.voci.push(t.servizioNome)
      const v = perGiust.get(t.servizioId)
      if (v) v.ore += t.ore
      else perGiust.set(t.servizioId, { servizioId: t.servizioId, nome: t.servizioNome ?? '—', ore: t.ore })
    } else {
      g.oreLavorate += t.ore
      if (t.notte) {
        g.notte = true
        notti++
      }
      if (t.reperibilita) {
        g.reperibilita = true
        turniReperibilita++
      }
    }
  }

  let oreLavorate = 0
  let oreGiustificativo = 0
  let oreAttese = 0
  let flessibilitaLavorata = 0
  for (const g of perGiorno.values()) {
    g.completo = g.oreLavorate + g.oreGiustificativo >= g.oreAttese
    oreLavorate += g.oreLavorate
    oreGiustificativo += g.oreGiustificativo
    oreAttese += g.oreAttese
    // Flessibilita' LAVORATA: le ore di lavoro che stanno sopra il monte ore
    // del giorno, al netto di quanto quel giorno era gia' coperto da assenze
    // giustificate. E' la causale 907 del cedolino, e si calcola giorno per
    // giorno: e' questo che rende il contatore vivo mentre il mese scorre,
    // invece di aspettare la fine della settimana.
    const atteseResidue = Math.max(0, g.oreAttese - g.oreGiustificativo)
    flessibilitaLavorata += Math.max(0, g.oreLavorate - atteseResidue)
  }

  const giustificativi = [...perGiust.values()]
    .map((v) => ({ ...v, ore: round4(v.ore) }))
    .filter((v) => v.ore > 0.0001)
    .sort((a, b) => b.ore - a.ore || a.nome.localeCompare(b.nome, 'it'))

  // Flessibilita' RECUPERATA: le ore dichiarate sulla voce Flessibilita'.
  // E' la causale 908 del cedolino. Non e' "lo scostamento negativo": una
  // giornata scoperta muove il saldo solo se la persona dichiara di attingere
  // al monte di flessibilità, e non se la copre con le ferie.
  const flessibilitaRecuperata = giustificativi
    .filter((v) => v.nome === VOCE_FLESSIBILITA)
    .reduce((s, v) => s + v.ore, 0)

  const giorni = [...perGiorno.values()]
  return {
    oreLavorate: round4(oreLavorate),
    oreGiustificativo: round4(oreGiustificativo),
    oreAttese: round4(oreAttese),
    scostamento: round4(oreLavorate + oreGiustificativo - oreAttese),
    giorni,
    settimane: raggruppaSettimane(giorni),
    giustificativi,
    flessibilitaLavorata: round4(flessibilitaLavorata),
    flessibilitaRecuperata: round4(flessibilitaRecuperata),
    flessibilitaSaldo: round4(flessibilitaLavorata - flessibilitaRecuperata),
    notti,
    turniReperibilita,
  }
}

/**
 * Raggruppa i giorni del periodo in settimane ISO (lun→dom) e calcola lo
 * scostamento di ciascuna. `inizio`/`fine` sono i giorni effettivi coperti nel
 * periodo (le settimane a cavallo dei bordi mese risultano parziali).
 * `conclusa`=true quando la settimana è già terminata (fine < oggi): solo allora
 * lo scostamento è definitivo (le settimane in corso non vanno segnalate).
 */
export function raggruppaSettimane(giorni: RiepilogoGiorno[]): RiepilogoSettimana[] {
  const oggi = oggiRoma()
  const acc = new Map<string, {
    inizio: string; fine: string
    oreLavorate: number; oreGiustificativo: number; oreAttese: number
  }>()
  for (const g of giorni) {
    const chiave = lunediIso(g.data)
    const cur = acc.get(chiave)
    if (!cur) {
      acc.set(chiave, {
        inizio: g.data,
        fine: g.data,
        oreLavorate: g.oreLavorate,
        oreGiustificativo: g.oreGiustificativo,
        oreAttese: g.oreAttese,
      })
    } else {
      if (g.data < cur.inizio) cur.inizio = g.data
      if (g.data > cur.fine) cur.fine = g.data
      cur.oreLavorate += g.oreLavorate
      cur.oreGiustificativo += g.oreGiustificativo
      cur.oreAttese += g.oreAttese
    }
  }
  return [...acc.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, s]) => ({
      inizio: s.inizio,
      fine: s.fine,
      oreLavorate: round4(s.oreLavorate),
      oreGiustificativo: round4(s.oreGiustificativo),
      oreAttese: round4(s.oreAttese),
      scostamento: round4(s.oreLavorate + s.oreGiustificativo - s.oreAttese),
      conclusa: s.fine < oggi,
    }))
}

/** Le giornate del periodo che restano scoperte: sono quelle che bloccano la chiusura. */
export function giorniIncompleti(rp: RiepilogoPeriodo): RiepilogoGiorno[] {
  return rp.giorni.filter((g) => !g.completo && !g.festivo)
}

/**
 * Il mese e' completo: nessuna giornata scoperta dal primo all'ultimo giorno.
 *
 * E' la condizione che permette di chiudere e validare prima della scadenza di
 * calendario. Le ore di lavoro non si inseriscono in anticipo, quindi un mese
 * risulta completo prima della fine solo se i giorni che restano sono coperti da
 * assenze giustificate o non sono lavorativi: e' il caso "sono in ferie dal 20
 * al 31, il mio foglio e' finito".
 */
export async function meseCompleto(dipendenteId: number, anno: number, mese: number): Promise<boolean> {
  const { from, to } = primoUltimoGiorno(anno, mese)
  const rp = await riepilogoPeriodo(dipendenteId, from, to)
  return giorniIncompleti(rp).length === 0
}

/**
 * Dipendenti da mostrare nel cruscotto per un mese: gli abilitati, più i
 * disattivati che in quel mese hanno lasciato qualcosa (righe di ore o una
 * chiusura). Senza questi ultimi, chiudere l'ultimo mese di chi è appena
 * cessato — e quindi generare il suo foglio ore finale — sarebbe impossibile.
 */
async function dipendentiDelMese(
  anno: number,
  mese: number,
  from: string,
  to: string,
  referente?: string | null,
): Promise<{ dip: Dipendente; disattivato: boolean }[]> {
  const tuttiAttivi = await getDipendenti(true)
  // Il responsabile vede solo i suoi. Le HR (referente non passato) vedono tutti.
  const filtro = (d: Dipendente) =>
    !referente || (d.referenteEmail ?? '').toLowerCase() === referente.toLowerCase()
  const attivi = tuttiAttivi.filter(filtro)
  const noti = new Set(attivi.map((d) => d.id))

  const [righe, chiusure] = await Promise.all([
    supabase().from('timbratura').select('dipendente_id').gte('data', from).lte('data', to),
    supabase().from('chiusura_mese').select('dipendente_id').eq('anno', anno).eq('mese', mese),
  ])
  if (righe.error) throw new Error(righe.error.message)
  if (chiusure.error) throw new Error(chiusure.error.message)

  const conAttivita = new Set<number>(
    [...(righe.data ?? []), ...(chiusure.data ?? [])].map((r: any) => Number(r.dipendente_id)),
  )
  const daRecuperare = [...conAttivita].filter((id) => !noti.has(id))

  const out = attivi.map((dip) => ({ dip, disattivato: false }))
  if (daRecuperare.length) {
    const { data, error } = await supabase()
      .from('dipendente')
      .select('*')
      .in('id', daRecuperare)
      .order('cognome_nome', { ascending: true })
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const dip = mapDip(r)
      if (filtro(dip)) out.push({ dip, disattivato: true })
    }
  }
  return out
}

/**
 * Cruscotto: stato del mese per i dipendenti visibili a chi guarda.
 * `referente` vuoto = vista HR (tutti); valorizzato = vista responsabile.
 */
export async function statoMeseTutti(
  anno: number,
  mese: number,
  referente?: string | null,
): Promise<StatoDipendenteMese[]> {
  const { from, to } = primoUltimoGiorno(anno, mese)
  const dips = await dipendentiDelMese(anno, mese, from, to, referente)
  const scaduto = meseScaduto(anno, mese)
  const out: StatoDipendenteMese[] = []
  for (const { dip: d, disattivato } of dips) {
    const [rp, ch, prof] = await Promise.all([
      riepilogoPeriodo(d.id, from, to),
      getChiusura(d.id, anno, mese),
      // Solo per chi non timbra: serve a dire se il bottone "Compila il mese"
      // ha da cosa generare. Per gli altri e' una domanda senza senso.
      d.nonTimbra ? profiloVigente(d.id, to) : Promise.resolve(null),
    ])
    const incompleti = giorniIncompleti(rp).length
    out.push({
      dipendenteId: d.id,
      cognomeNome: d.cognomeNome,
      email: d.email,
      oreLavorate: rp.oreLavorate,
      oreAttese: rp.oreAttese,
      scostamento: rp.scostamento,
      giorniIncompleti: incompleti,
      completo: incompleti === 0,
      flessibilitaLavorata: rp.flessibilitaLavorata,
      flessibilitaRecuperata: rp.flessibilitaRecuperata,
      flessibilitaSaldo: rp.flessibilitaSaldo,
      notti: rp.notti,
      turniReperibilita: rp.turniReperibilita,
      // Senza riga di chiusura lo stato viene dal calendario: un mese scaduto e'
      // gia' di fatto in attesa di validazione, anche prima che il cron passi.
      stato: ch?.stato ?? (scaduto ? 'da_validare' : 'aperto'),
      fileUrl: ch?.fileUrl ?? null,
      filePdfUrl: ch?.filePdfUrl ?? null,
      fileHrUrl: ch?.fileHrUrl ?? null,
      settimane: rp.settimane,
      referenteEmail: d.referenteEmail,
      nonTimbra: d.nonTimbra,
      haOrarioTeorico: (prof?.fasce.length ?? 0) > 0,
      validatoDa: ch?.validatoDa ?? null,
      validatoIl: ch?.validatoIl ?? null,
      confermatoIl: ch?.confermatoIl ?? null,
      confermatoForzato: ch?.confermatoForzato ?? false,
      noteContestazione: ch?.noteContestazione ?? null,
      giorniInAttesa: ch?.stato === 'validato' && ch.validatoIl ? giorniDa(ch.validatoIl) : null,
      disattivato,
    })
  }
  return out
}

/**
 * Porta in validazione tutti i mesi la cui finestra e' scaduta e che sono
 * ancora aperti. Girata dal cron ogni mattina: e' il momento in cui la palla
 * passa dai dipendenti ai responsabili.
 */
export async function apriValidazioni(
  anno: number,
  mese: number,
): Promise<{ dipendente: Dipendente; chiusura: ChiusuraMese }[]> {
  if (!meseScaduto(anno, mese)) return []
  const { from, to } = primoUltimoGiorno(anno, mese)
  const dips = await dipendentiDelMese(anno, mese, from, to)
  const out: { dipendente: Dipendente; chiusura: ChiusuraMese }[] = []
  for (const { dip } of dips) {
    const ch = await getChiusura(dip.id, anno, mese)
    if (ch && ch.stato !== 'aperto') continue
    out.push({ dipendente: dip, chiusura: await marcaDaValidare(dip.id, anno, mese) })
  }
  return out
}
