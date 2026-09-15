/**
 * IL REGISTRO — l'unica porta di scrittura dei costi e dei ricavi.
 *
 * Tutti i cruscotti, i report, il budget e gli alert leggono da `movimento` e
 * da nient'altro. Chi produce un costo — un acquisto consegnato, una
 * manutenzione chiusa, una fattura importata, il costo del lavoro — passa da
 * `scriviDocumento()`, esattamente come i tre flussi dei costi passano da
 * `creaCosto()` in lib/costi/data.ts.
 *
 * Perché una porta sola e non un insert dove serve. Il doppio conteggio è il
 * modo in cui un controllo di gestione muore: un numero sbagliato che sembra
 * giusto non lo cerca nessuno. Qui è impedito da tre cose insieme, e servono
 * tutte e tre:
 *
 *   1. il vincolo `unique (origine_tipo, origine_id, cc_codice)` sul database,
 *      che impedisce allo stesso documento di rientrare due volte sullo stesso
 *      centro di costo;
 *   2. la funzione SQL `registro_riscrivi()`, che cancella e riscrive le righe
 *      di un documento in un'unica transazione — senza, riattribuire un
 *      documento da DA_ATTRIBUIRE a un centro di costo vero lascerebbe le due
 *      righe entrambe valide, perché le chiavi sono diverse;
 *   3. i controlli qui sotto, che dicono *quale* riga è sbagliata e perché,
 *      invece di lasciare arrivare un errore di vincolo dal database con un
 *      messaggio che parla di indici.
 *
 * ⚠️ I movimenti bancari NON scrivono qui. Appaiano e valorizzano
 * `data_cassa`: il registro si alimenta dai documenti, mai dalla banca.
 * Vedi supabase/gestione_schema.sql, regola 2.
 */

import { supabase } from '@/lib/core/supabase'
import {
  CC_DA_ATTRIBUIRE,
  type CentroDiCostoRegistro,
  type MovimentoRegistro,
  type RigaRegistro,
  type TotaliCentroDiCosto,
  type TotaliVoce,
  type VoceAnalitica,
} from '@/types/gestione'

// ------------------------------------------------------------
// Anagrafiche
// ------------------------------------------------------------

/**
 * Centri di costo dello specchio Supabase, il segnaposto compreso.
 *
 * Non sostituisce `lib/centri-costo/data.ts`: la fonte di verità resta
 * SharePoint e le tendine leggono da lì. Questa lettura serve al registro, che
 * ha bisogno dei codici per validare e delle foreign key per non accettarne di
 * inventati. Li tiene allineati `scripts/sync-centri-costo-supabase.mjs`.
 */
export async function getCentriDiCostoRegistro(
  soloAttivi = false,
): Promise<CentroDiCostoRegistro[]> {
  let q = supabase()
    .from('centro_di_costo')
    .select('codice, nome, area, ordine, attivo')
    .order('ordine')
  if (soloAttivi) q = q.eq('attivo', true)

  const { data, error } = await q
  if (error) throw new Error(`registro: lettura centri di costo — ${error.message}`)

  return (data ?? []).map((r: any) => ({
    codice: r.codice,
    nome: r.nome,
    area: r.area ?? undefined,
    ordine: Number(r.ordine ?? 999),
    attivo: r.attivo !== false,
  }))
}

/** Piano dei conti analitico, in ordine di report. */
export async function getVociAnalitiche(): Promise<VoceAnalitica[]> {
  const { data, error } = await supabase()
    .from('voce_analitica')
    .select('codice, nome, tipo, voce_bilancio, ordine')
    .eq('attiva', true)
    .order('ordine')
  if (error) throw new Error(`registro: lettura piano dei conti — ${error.message}`)

  return (data ?? []).map((r: any) => ({
    codice: r.codice,
    nome: r.nome,
    tipo: r.tipo,
    voceBilancio: r.voce_bilancio ?? undefined,
    ordine: Number(r.ordine ?? 999),
  }))
}

// ------------------------------------------------------------
// Scrittura
// ------------------------------------------------------------

/**
 * Controlli fatti prima di chiamare il database.
 *
 * Non sono un doppione dei vincoli SQL: quelli sono la rete di sicurezza, e
 * scattano anche se un domani qualcuno scrive dritto in tabella da uno script.
 * Questi servono a dire *cosa* è sbagliato mentre c'è ancora il contesto per
 * capirlo. Un `violates check constraint "movimento_segno_chk"` è vero e
 * inutile.
 */
function controlla(righe: RigaRegistro[], codiciValidi: Set<string>): string[] {
  const problemi: string[] = []

  righe.forEach((r, i) => {
    const dove = `riga ${i + 1}`

    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.dataCompetenza)) {
      problemi.push(`${dove}: data di competenza "${r.dataCompetenza}" non è una data`)
    }
    if (!codiciValidi.has(r.ccCodice)) {
      problemi.push(`${dove}: il centro di costo "${r.ccCodice}" non esiste in anagrafica`)
    }
    if (!Number.isFinite(r.importo) || r.importo === 0) {
      problemi.push(`${dove}: importo mancante o a zero`)
    }
    if (r.tipo === 'costo' && r.importo > 0) {
      problemi.push(`${dove}: un costo va scritto con importo negativo (qui ${r.importo})`)
    }
    if (r.tipo === 'ricavo' && r.importo < 0) {
      problemi.push(`${dove}: un ricavo va scritto con importo positivo (qui ${r.importo})`)
    }

    // Il segnaposto e la confidenza dicono la stessa cosa: se si separano, un
    // costo non attribuito finisce nei totali di un servizio con l'aria di
    // essere a posto, oppure un costo attribuito resta nella lista del residuo
    // e qualcuno lo "sistema" una seconda volta.
    const segnaposto = r.ccCodice === CC_DA_ATTRIBUIRE
    if (segnaposto && r.confidenza !== 'da_attribuire') {
      problemi.push(`${dove}: sul segnaposto la confidenza deve essere "da_attribuire"`)
    }
    if (!segnaposto && r.confidenza === 'da_attribuire') {
      problemi.push(`${dove}: confidenza "da_attribuire" su un centro di costo vero (${r.ccCodice})`)
    }

    const quota = r.quota ?? 1
    if (!(quota > 0 && quota <= 1)) {
      problemi.push(`${dove}: quota ${quota} fuori dall'intervallo (0, 1]`)
    }
    if (quota < 1 && r.confidenza === 'certa') {
      // Una ripartizione è una convenzione per definizione: nessun documento
      // dice "il 40% di questa fattura è di Cosmica".
      problemi.push(`${dove}: una riga ripartita (quota ${quota}) non può essere "certa"`)
    }
  })

  // La somma delle quote la controlla anche `registro_riscrivi()`, che è
  // l'unico posto che la vede sempre. Qui si controlla per poter nominare il
  // documento e le righe nel messaggio.
  if (righe.length > 0) {
    const somma = righe.reduce((s, r) => s + (r.quota ?? 1), 0)
    if (Math.abs(somma - 1) > 0.0002) {
      problemi.push(
        `le quote delle ${righe.length} righe sommano a ${somma.toFixed(4)} invece di 1`,
      )
    }
  }

  // Due righe sullo stesso centro di costo dentro lo stesso documento: il
  // vincolo di unicità le rifiuterebbe, ma con un messaggio che non dice quali.
  const visti = new Set<string>()
  for (const r of righe) {
    if (visti.has(r.ccCodice)) {
      problemi.push(`il centro di costo ${r.ccCodice} compare due volte nello stesso documento`)
    }
    visti.add(r.ccCodice)
  }

  return problemi
}

/**
 * Scrive nel registro TUTTE le righe di un documento, sostituendo quelle che
 * c'erano. È l'unico modo previsto per far entrare un costo o un ricavo.
 *
 * `origineTipo` + `origineId` sono l'identità del documento e non sono
 * facoltativi: sono loro a rendere l'operazione ripetibile senza duplicare —
 * rilanciare un import due volte lascia le stesse righe. Per una rettifica
 * inserita a mano si usa `origineTipo: 'manuale'` e un id generato da chi
 * scrive (`crypto.randomUUID()`).
 *
 * Un array vuoto cancella le righe del documento: serve a un documento
 * annullato o a una nota di credito che azzera una fattura.
 *
 * @returns quante righe sono state scritte
 */
export async function scriviDocumento(
  origineTipo: string,
  origineId: string,
  righe: RigaRegistro[],
): Promise<number> {
  if (!origineTipo?.trim() || !origineId?.trim()) {
    throw new Error('registro: origineTipo e origineId sono obbligatori')
  }

  const codici = new Set((await getCentriDiCostoRegistro()).map((c) => c.codice))
  const problemi = controlla(righe, codici)
  if (problemi.length > 0) {
    throw new Error(
      `registro: ${origineTipo}/${origineId} non scritto —\n  · ${problemi.join('\n  · ')}`,
    )
  }

  const payload = righe.map((r) => ({
    data_competenza: r.dataCompetenza,
    data_cassa: r.dataCassa ?? null,
    cc_codice: r.ccCodice,
    tipo: r.tipo,
    voce: r.voce ?? null,
    importo: r.importo,
    controparte: r.controparte ?? null,
    piva: r.piva ?? null,
    fonte: r.fonte,
    confidenza: r.confidenza,
    motivo: r.motivo ?? null,
    quota: r.quota ?? 1,
    note: r.note ?? null,
    creato_da: r.creatoDa ?? null,
  }))

  const { data, error } = await supabase().rpc('registro_riscrivi', {
    p_origine_tipo: origineTipo,
    p_origine_id: origineId,
    p_righe: payload,
  })
  if (error) {
    throw new Error(`registro: ${origineTipo}/${origineId} — ${error.message}`)
  }
  return Number(data ?? 0)
}

/**
 * Togliere un documento dal registro. Non è un annullamento contabile: è la
 * cancellazione di righe che non dovevano esserci — un documento annullato dal
 * fornitore, un import da rifare.
 */
export async function cancellaDocumento(
  origineTipo: string,
  origineId: string,
): Promise<void> {
  await scriviDocumento(origineTipo, origineId, [])
}

// ------------------------------------------------------------
// Letture
// ------------------------------------------------------------

/**
 * Costi e ricavi per centro di costo, per **competenza**: risponde a «come va
 * questo servizio», non a «quanto è uscito dal conto». Per quella domanda c'è
 * la tesoreria, che legge le stesse righe con `data_cassa`.
 *
 * Il segnaposto DA_ATTRIBUIRE compare in fondo con il suo totale, di
 * proposito: è la misura di quanto il sistema stia funzionando, e nasconderlo
 * farebbe sembrare tutto attribuito.
 */
export async function totaliPerCentroDiCosto(
  dal: string,
  al: string,
): Promise<TotaliCentroDiCosto[]> {
  const { data, error } = await supabase().rpc('registro_per_cc', { p_dal: dal, p_al: al })
  if (error) throw new Error(`registro: totali per centro di costo — ${error.message}`)

  return (data ?? []).map((r: any) => ({
    ccCodice: r.cc_codice,
    ccNome: r.cc_nome,
    area: r.area ?? undefined,
    costi: Number(r.costi ?? 0),
    ricavi: Number(r.ricavi ?? 0),
    righe: Number(r.righe ?? 0),
  }))
}

/**
 * Di cosa è fatta la spesa: per voce analitica, tutta o di un solo centro di
 * costo. Le righe non ancora classificate si raggruppano sotto «Da
 * classificare» invece di sparire.
 */
export async function totaliPerVoce(
  dal: string,
  al: string,
  ccCodice?: string,
): Promise<TotaliVoce[]> {
  const { data, error } = await supabase().rpc('registro_per_voce', {
    p_dal: dal,
    p_al: al,
    p_cc: ccCodice ?? null,
  })
  if (error) throw new Error(`registro: totali per voce — ${error.message}`)

  return (data ?? []).map((r: any) => ({
    voce: r.voce ?? undefined,
    voceNome: r.voce_nome,
    tipo: r.tipo,
    totale: Number(r.totale ?? 0),
    righe: Number(r.righe ?? 0),
  }))
}

const CAMPI_MOVIMENTO = `
  id, data_competenza, data_cassa, cc_codice, tipo, voce, importo,
  controparte, piva, fonte, origine_tipo, origine_id,
  confidenza, motivo, quota, note, creato_il, creato_da
`

function mapMovimento(r: any): MovimentoRegistro {
  return {
    id: r.id,
    dataCompetenza: r.data_competenza,
    dataCassa: r.data_cassa ?? undefined,
    ccCodice: r.cc_codice,
    tipo: r.tipo,
    voce: r.voce ?? undefined,
    importo: Number(r.importo),
    controparte: r.controparte ?? undefined,
    piva: r.piva ?? undefined,
    fonte: r.fonte,
    origineTipo: r.origine_tipo,
    origineId: r.origine_id,
    confidenza: r.confidenza,
    motivo: r.motivo ?? undefined,
    quota: Number(r.quota ?? 1),
    note: r.note ?? undefined,
    creatoIl: r.creato_il,
    creatoDa: r.creato_da ?? undefined,
  }
}

/** Le righe di un centro di costo in un periodo, le più recenti in cima. */
export async function movimentiDiCentroDiCosto(
  ccCodice: string,
  dal: string,
  al: string,
): Promise<MovimentoRegistro[]> {
  const { data, error } = await supabase()
    .from('movimento')
    .select(CAMPI_MOVIMENTO)
    .eq('cc_codice', ccCodice)
    .gte('data_competenza', dal)
    .lte('data_competenza', al)
    .order('data_competenza', { ascending: false })
    .limit(2000)
  if (error) throw new Error(`registro: movimenti di ${ccCodice} — ${error.message}`)
  return (data ?? []).map(mapMovimento)
}

/**
 * Il residuo: i documenti che il sistema non ha saputo attribuire.
 *
 * È una lista corta e azionabile in carico all'amministrazione, non una coda
 * per i responsabili di servizio — l'attribuzione è in avanti, dalla
 * dichiarazione di spesa e dall'etichetta della carta. `motivo` dice perché il
 * sistema si è fermato: senza, chi chiude a mano non sa cosa correggere.
 */
export async function residuoDaAttribuire(limite = 200): Promise<MovimentoRegistro[]> {
  const { data, error } = await supabase()
    .from('movimento')
    .select(CAMPI_MOVIMENTO)
    .eq('cc_codice', CC_DA_ATTRIBUIRE)
    .order('data_competenza', { ascending: true })
    .limit(limite)
  if (error) throw new Error(`registro: residuo da attribuire — ${error.message}`)
  return (data ?? []).map(mapMovimento)
}

/** Le righe di un documento, per capire com'è stato attribuito. */
export async function movimentiDelDocumento(
  origineTipo: string,
  origineId: string,
): Promise<MovimentoRegistro[]> {
  const { data, error } = await supabase()
    .from('movimento')
    .select(CAMPI_MOVIMENTO)
    .eq('origine_tipo', origineTipo)
    .eq('origine_id', origineId)
  if (error) throw new Error(`registro: righe di ${origineTipo}/${origineId} — ${error.message}`)
  return (data ?? []).map(mapMovimento)
}
