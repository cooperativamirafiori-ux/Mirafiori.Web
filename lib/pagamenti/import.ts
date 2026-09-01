/**
 * Caricamento settimanale dello scadenzario.
 *
 * L'export di Fattura SMART è **cumulativo**: contiene sempre tutto, non solo
 * le novità. Distinguere è compito di questo file, e non è un «salta i
 * duplicati»: fra un caricamento e l'altro una scadenza può cambiare importo
 * o data, e va aggiornata.
 *
 * Le quattro regole, in ordine di importanza:
 *
 *  1. **Lo stato dell'app vince sempre.** Una scadenza che qualcuno ha chiuso
 *     non si riapre perché il gestionale non l'ha ancora registrata.
 *  2. **La deduplica è sul protocollo** (numero + suffisso + data del
 *     documento) più la posizione della rata. Non su P.IVA + numero del
 *     fornitore: ATC e SOGEGROSS ripetono lo stesso numero su documenti
 *     diversi, e fondersi è peggio che duplicarsi.
 *  3. **Niente si cancella.** Una scadenza che spariva dall'export è un
 *     documento annullato o un file incompleto: in entrambi i casi qualcuno
 *     deve saperlo, quindi si segnala e resta.
 *  4. **Ogni caricamento lascia una ricevuta.** Senza, il primo import che va
 *     storto è invisibile e il buco si scopre un mese dopo.
 */

import { createHash } from 'node:crypto'
import { supabase } from '@/lib/core/supabase'
import { getParametro } from '@/lib/core/sp'
import { leggiScadenzario, type RigaFile } from '@/lib/pagamenti/tracciato'
import {
  CHIAVE_PARAMETRO_SOGLIA,
  SOGLIA_APPROVAZIONE_DEFAULT,
  type RicevutaImport,
  type StatoScadenza,
} from '@/types/pagamenti'

/**
 * Soglia di approvazione, dalla lista SharePoint «Parametri».
 *
 * Se la riga non c'è si usa il valore di riserva invece di fermare tutto: un
 * import bloccato perché manca un parametro è un import che nessuno rifà.
 * L'avviso finisce nella ricevuta, così la mancanza si vede.
 */
export async function sogliaApprovazione(): Promise<{ valore: number; avviso: string | null }> {
  try {
    const v = await getParametro(CHIAVE_PARAMETRO_SOGLIA)
    if (!isFinite(v) || v <= 0) throw new Error('valore non valido')
    return { valore: v, avviso: null }
  } catch {
    return {
      valore: SOGLIA_APPROVAZIONE_DEFAULT,
      avviso:
        `Soglia di approvazione non trovata nella lista Parametri ` +
        `(riga «${CHIAVE_PARAMETRO_SOGLIA}»): uso ${SOGLIA_APPROVAZIONE_DEFAULT} €.`,
    }
  }
}

// ------------------------------------------------------------
// Dal file allo stato iniziale
// ------------------------------------------------------------

/**
 * Lo stato con cui nasce una scadenza. Lo decide la modalità di pagamento,
 * non l'importo: l'importo interviene solo su ciò che qualcuno deve pagare
 * davvero.
 */
export function statoIniziale(
  riga: RigaFile,
  soglia: number,
  decorrenza: string | null,
  chiusuraDaGestionale = false,
): StatoScadenza {
  // Una nota di credito non è una fattura da pagare: sta in archivio finché
  // non la si appaia alla fattura che riduce (fase successiva). Sta prima di
  // tutto, anche dello stato del gestionale: una nota di credito «pagata»
  // resta una nota di credito.
  if (riga.tipoDocumento === 'nota_credito') return 'stornata'

  // Lo stato del gestionale, quando chi carica lo chiede. Vale in una
  // direzione sola — qui può solo far nascere chiusa una riga nuova; sulle
  // righe esistenti la riapertura è impedita più sotto, nel confronto.
  if (chiusuraDaGestionale && riga.pagataSecondoGestionale) return 'pagata'

  // Contanti e carta: il denaro è uscito prima che la fattura arrivasse.
  if (riga.famiglia === 'negozio') return 'pagata'

  // RID, SDD, domiciliazioni: escono da sole alla scadenza. Nessuno le paga,
  // ma restano visibili perché la cassa deve saperlo.
  if (riga.famiglia === 'automatica') return 'automatica'

  // Sotto la data di decorrenza: presenti e dentro i totali dello scaduto,
  // fuori dalle code. Serve solo a non far trovare a nessuno otto mesi di
  // arretrato il primo giorno.
  if (decorrenza && riga.dataScadenza < decorrenza) return 'storica'

  return riga.importo > soglia ? 'da_approvare' : 'da_pagare'
}

/**
 * Assegna a ogni scadenza la sua posizione dentro il documento.
 *
 * 36 documenti su 2.006 hanno più di una rata. L'ordinamento è per data e poi
 * importo, così la stessa rata prende la stessa posizione a ogni caricamento
 * anche se il gestionale cambia l'ordine delle righe.
 */
function assegnaPosizioni(righe: RigaFile[]): Array<RigaFile & { posizione: number }> {
  const gruppi = new Map<string, RigaFile[]>()
  for (const r of righe) {
    const k = chiaveDocumento(r)
    const g = gruppi.get(k)
    if (g) g.push(r)
    else gruppi.set(k, [r])
  }
  const out: Array<RigaFile & { posizione: number }> = []
  for (const g of gruppi.values()) {
    g.sort((a, b) => a.dataScadenza.localeCompare(b.dataScadenza) || a.importo - b.importo)
    g.forEach((r, i) => out.push({ ...r, posizione: i + 1 }))
  }
  return out
}

const chiaveDocumento = (r: RigaFile) =>
  `${r.protocolloNumero}|${r.protocolloSuffisso}|${r.protocolloData}`

// ------------------------------------------------------------
// L'import
// ------------------------------------------------------------

export interface OpzioniImport {
  nomeFile: string
  utente: string
  /** Sotto questa data le scadenze entrano come «storiche», fuori dalle code. */
  decorrenza?: string | null
  /**
   * Chiude le scadenze che il gestionale dà per pagate, con la sua data.
   *
   * Serve al primo caricamento, dove l'archivio è vuoto e l'arretrato già
   * saldato sarebbe da spuntare a mano centinaia di volte. Resta una scelta
   * esplicita a ogni import, e **non riapre mai niente**: le righe chiuse in
   * app non si toccano, e quelle chiuse così portano
   * `origine_pagamento = 'gestionale'` per non confondere una registrazione
   * contabile con qualcuno che ha guardato la riga.
   */
  chiusuraDaGestionale?: boolean
}

export async function importaScadenzario(
  buffer: ArrayBuffer,
  opz: OpzioniImport,
): Promise<RicevutaImport> {
  const db = supabase()
  const avvisi: string[] = []

  const { valore: soglia, avviso: avvisoSoglia } = await sogliaApprovazione()
  if (avvisoSoglia) avvisi.push(avvisoSoglia)

  const hash = createHash('sha256').update(Buffer.from(buffer)).digest('hex')
  const { data: giaVisto } = await db
    .from('import_file')
    .select('caricato_il, caricato_da')
    .eq('hash_file', hash)
    .order('caricato_il', { ascending: false })
    .limit(1)
  if (giaVisto && giaVisto.length > 0) {
    // Si avvisa e si procede: l'import è idempotente, quindi ricaricare lo
    // stesso file non fa danni — ma se qualcuno lo sta rifacendo credendo di
    // averne scaricato uno nuovo, deve accorgersene.
    avvisi.push(
      `Questo stesso file era già stato caricato il ` +
        `${new Date(giaVisto[0].caricato_il as string).toLocaleDateString('it-IT')}. ` +
        `Se ti aspettavi dati nuovi, riscaricalo da Fattura SMART.`,
    )
  }

  const lettura = await leggiScadenzario(buffer)
  const righe = assegnaPosizioni(lettura.righe)

  for (const motivo of riassumi(lettura.scarti.map((s) => s.motivo))) avvisi.push(motivo)

  // --- 1. Le fatture: si creano quelle che mancano.
  // Tutto a blocchi, mai una query per riga: il file ne porta duemila e una
  // funzione serverless non sta in piedi per duemila viaggi di andata e
  // ritorno. La regola vale anche per i passi 2 e 3.
  const fatturaId = await risolviFatture(db, righe)

  // --- 2. Le scadenze già in archivio per queste fatture
  const ids = Array.from(fatturaId.values())
  const esistenti = new Map<string, EsistenteRow>()
  for (const blocco of aBlocchi(ids, 200)) {
    const { data, error } = await db
      .from('scadenza')
      .select('id, fattura_passiva_id, posizione, data_scadenza, importo, stato, modalita, famiglia_modalita')
      .in('fattura_passiva_id', blocco)
    if (error) throw new Error(`Lettura scadenze esistenti: ${error.message}`)
    for (const s of (data ?? []) as EsistenteRow[]) {
      esistenti.set(`${s.fattura_passiva_id}|${s.posizione}`, s)
    }
  }

  // --- 3. Confronto riga per riga
  const importId = crypto.randomUUID()
  const adesso = new Date().toISOString()
  let nuove = 0
  let aggiornate = 0
  let invariate = 0
  const viste = new Set<string>()

  const daInserire: Record<string, unknown>[] = []
  const daToccare: string[] = []
  const daChiudere = new Map<string, string>() // id → data di pagamento
  const chiusura = opz.chiusuraDaGestionale === true
  let chiuseDaGestionale = 0

  for (const r of righe) {
    const fid = fatturaId.get(chiaveDocumento(r))!
    const chiave = `${fid}|${r.posizione}`
    viste.add(chiave)
    const vecchia = esistenti.get(chiave)
    const stato = statoIniziale(r, soglia, opz.decorrenza ?? null, chiusura)
    const chiusaDalFile = chiusura && r.pagataSecondoGestionale && stato === 'pagata'
    // Se il gestionale non porta la data, vale la scadenza: è la più vicina al
    // vero fra quelle che abbiamo, e resta riconoscibile dall'origine.
    const dataDalFile = r.dataPagamentoGestionale ?? r.dataScadenza

    if (!vecchia) {
      daInserire.push({
        fattura_passiva_id: fid,
        posizione: r.posizione,
        data_scadenza: r.dataScadenza,
        importo: r.importo,
        modalita: r.modalita,
        famiglia_modalita: r.famiglia,
        stato,
        soglia_applicata: soglia,
        import_id: importId,
        vista_il: adesso,
        ...(stato === 'pagata'
          ? {
              data_pagamento: chiusaDalFile ? dataDalFile : r.dataScadenza,
              origine_pagamento: chiusaDalFile ? 'gestionale' : 'app',
              pagata_da: chiusaDalFile ? null : opz.utente,
            }
          : {}),
      })
      if (chiusaDalFile) chiuseDaGestionale++
      nuove++
      continue
    }

    const cambiataData = vecchia.data_scadenza !== r.dataScadenza
    const cambiatoImporto = Math.abs(Number(vecchia.importo) - r.importo) > 0.004
    const giaChiusa = vecchia.stato === 'pagata' || vecchia.stato === 'stornata'

    // Il senso unico, sulle righe già in archivio: il gestionale può chiudere
    // ciò che è ancora aperto, e non tocca mai ciò che è già chiuso qui.
    if (chiusaDalFile && !giaChiusa) {
      daChiudere.set(vecchia.id, dataDalFile)
      chiuseDaGestionale++
    }

    if (!cambiataData && !cambiatoImporto) {
      daToccare.push(vecchia.id)
      invariate++
      continue
    }

    // Lo stato dell'app vince: su una scadenza già chiusa si aggiorna il dato
    // del gestionale e si segnala la differenza, ma non la si riapre.
    const chiusa = giaChiusa
    const segnalazione = [
      cambiatoImporto
        ? `importo ${Number(vecchia.importo).toFixed(2)} → ${r.importo.toFixed(2)}`
        : null,
      cambiataData ? `scadenza ${vecchia.data_scadenza} → ${r.dataScadenza}` : null,
      chiusa ? 'già chiusa in app: lo stato non è stato toccato' : null,
    ]
      .filter(Boolean)
      .join('; ')

    const { error } = await db
      .from('scadenza')
      .update({
        data_scadenza: r.dataScadenza,
        importo: r.importo,
        modalita: r.modalita,
        famiglia_modalita: r.famiglia,
        segnalazione,
        vista_il: adesso,
        scomparsa: false,
        import_id: importId,
        // Se cambia l'importo di una scadenza ancora aperta può cambiare la
        // coda: 1.400 € che diventano 1.600 € devono passare da chi approva.
        ...(chiusa ? {} : { stato, soglia_applicata: soglia }),
      })
      .eq('id', vecchia.id)
    if (error) throw new Error(`Aggiornamento scadenza: ${error.message}`)
    aggiornate++
  }

  for (const blocco of aBlocchi(daInserire, 500)) {
    const { error } = await db.from('scadenza').insert(blocco)
    if (error) throw new Error(`Inserimento scadenze: ${error.message}`)
  }
  for (const blocco of aBlocchi(daToccare, 500)) {
    const { error } = await db
      .from('scadenza')
      .update({ vista_il: adesso, scomparsa: false })
      .in('id', blocco)
    if (error) throw new Error(`Aggiornamento scadenze invariate: ${error.message}`)
  }

  // Le chiusure dal gestionale per ultime, così vincono su qualsiasi altra
  // scrittura fatta sopra sulla stessa riga. Raggruppate per data: le date
  // distinte sono poche, i gruppi anche.
  const perData = new Map<string, string[]>()
  for (const [id, data] of daChiudere) {
    const g = perData.get(data)
    if (g) g.push(id)
    else perData.set(data, [id])
  }
  for (const [data, gruppo] of perData) {
    for (const blocco of aBlocchi(gruppo, 500)) {
      const { error } = await db
        .from('scadenza')
        .update({
          stato: 'pagata',
          data_pagamento: data,
          origine_pagamento: 'gestionale',
          pagata_il: adesso,
        })
        .in('id', blocco)
      if (error) throw new Error(`Chiusura da gestionale: ${error.message}`)
    }
  }

  // --- 4. Le scomparse
  // Solo dentro la finestra temporale coperta dal file: un export parziale
  // non deve far sembrare sparito tutto quello che sta fuori.
  let scomparse = 0
  if (righe.length > 0) {
    const date = righe.map((r) => r.dataScadenza).sort()
    const da = date[0]
    const a = date[date.length - 1]
    const sparite: string[] = []
    for (const [chiave, s] of esistenti) {
      if (viste.has(chiave)) continue
      if (s.data_scadenza < da || s.data_scadenza > a) continue
      if (s.stato === 'pagata') continue // già chiusa: che sparisca è normale
      sparite.push(s.id)
    }
    for (const blocco of aBlocchi(sparite, 500)) {
      const { error } = await db
        .from('scadenza')
        .update({ scomparsa: true, segnalazione: 'non è più presente nell’export del gestionale' })
        .in('id', blocco)
      if (error) throw new Error(`Segnalazione scomparse: ${error.message}`)
    }
    scomparse = sparite.length
  }

  // --- 5. La ricevuta
  if (chiusura) {
    avvisi.push(
      chiuseDaGestionale > 0
        ? `${chiuseDaGestionale} scadenze chiuse perché il gestionale le dà per pagate. ` +
            `Nessuna scadenza chiusa in app è stata riaperta.`
        : 'Chiusura dal gestionale richiesta, ma nessuna scadenza risultava pagata nel file.',
    )
  }

  const ricevuta = {
    id: importId,
    nome_file: opz.nomeFile,
    hash_file: hash,
    tracciato: 'scadenze',
    caricato_da: opz.utente,
    caricato_il: adesso,
    righe: lettura.righe.length,
    nuove,
    aggiornate,
    invariate,
    scartate: lettura.scarti.length,
    scomparse,
    soglia,
    esito: 'ok' as const,
    dettaglio: {
      avvisi,
      scarti: lettura.scarti.slice(0, 200),
      decorrenza: opz.decorrenza ?? null,
      chiusuraDaGestionale: chiusura,
      chiuseDaGestionale,
      intestazioni: lettura.intestazioni,
    },
  }
  const { error: eRic } = await db.from('import_file').insert(ricevuta)
  if (eRic) throw new Error(`Salvataggio ricevuta: ${eRic.message}`)

  return {
    id: importId,
    nomeFile: opz.nomeFile,
    caricatoDa: opz.utente,
    caricatoIl: adesso,
    righe: lettura.righe.length,
    nuove,
    aggiornate,
    invariate,
    scartate: lettura.scarti.length,
    scomparse,
    soglia,
    esito: 'ok',
    avvisi,
  }
}

// ------------------------------------------------------------
// Aiutanti
// ------------------------------------------------------------

interface EsistenteRow {
  id: string
  fattura_passiva_id: string
  posizione: number
  data_scadenza: string
  importo: number | string
  stato: StatoScadenza
  modalita: string | null
  famiglia_modalita: string
}

/**
 * Chiave documento → id della fattura, creando quelle che mancano.
 *
 * Due passate a blocchi invece di una query per riga: si leggono le fatture
 * già in archivio filtrando sui numeri di protocollo presenti nel file, poi
 * si inseriscono in blocco quelle nuove e si rileggono gli id.
 */
async function risolviFatture(
  db: ReturnType<typeof supabase>,
  righe: Array<RigaFile & { posizione: number }>,
): Promise<Map<string, string>> {
  const perChiave = new Map<string, RigaFile>()
  for (const r of righe) if (!perChiave.has(chiaveDocumento(r))) perChiave.set(chiaveDocumento(r), r)

  const numeri = Array.from(new Set(Array.from(perChiave.values()).map((r) => r.protocolloNumero)))
  const idPerChiave = new Map<string, string>()

  const leggi = async () => {
    for (const blocco of aBlocchi(numeri, 200)) {
      const { data, error } = await db
        .from('fattura_passiva')
        .select('id, protocollo_numero, protocollo_suffisso, protocollo_data')
        .in('protocollo_numero', blocco)
      if (error) throw new Error(`Lettura fatture: ${error.message}`)
      for (const f of data ?? []) {
        const k = `${f.protocollo_numero}|${f.protocollo_suffisso ?? ''}|${f.protocollo_data}`
        idPerChiave.set(k, f.id as string)
      }
    }
  }

  await leggi()

  const mancanti = Array.from(perChiave.entries())
    .filter(([k]) => !idPerChiave.has(k))
    .map(([, r]) => ({
      protocollo_numero: r.protocolloNumero,
      protocollo_suffisso: r.protocolloSuffisso,
      protocollo_data: r.protocolloData,
      numero_fornitore: r.numeroFornitore,
      data_fornitore: r.dataFornitore,
      piva: r.piva,
      codice_fiscale: r.codiceFiscale,
      fornitore: r.fornitore,
      tipo_documento: r.tipoDocumento,
      descrizione: r.note,
    }))

  for (const blocco of aBlocchi(mancanti, 500)) {
    const { error } = await db.from('fattura_passiva').insert(blocco)
    if (error) throw new Error(`Creazione fatture: ${error.message}`)
  }
  if (mancanti.length > 0) await leggi()

  const senzaId = Array.from(perChiave.keys()).filter((k) => !idPerChiave.has(k))
  if (senzaId.length > 0) {
    throw new Error(
      `${senzaId.length} documenti non sono stati salvati e non so perché. ` +
        `Nessuna scadenza è stata importata: riprova, e se si ripete segnalalo.`,
    )
  }
  return idPerChiave
}

/** «12 righe senza data di scadenza» invece di dodici righe uguali. */
function riassumi(motivi: string[]): string[] {
  const conta = new Map<string, number>()
  for (const m of motivi) conta.set(m, (conta.get(m) ?? 0) + 1)
  return Array.from(conta.entries()).map(([m, n]) =>
    n === 1 ? `1 riga scartata: ${m}` : `${n} righe scartate: ${m}`,
  )
}

function aBlocchi<T>(v: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < v.length; i += n) out.push(v.slice(i, i + n))
  return out
}
