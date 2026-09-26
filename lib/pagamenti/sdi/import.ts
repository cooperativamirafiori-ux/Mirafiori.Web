/**
 * Import delle fatture dagli XML dello SDI (cartella SharePoint → Flussi fatture).
 *
 * Prende il posto dell'Excel di Fattura SMART come fonte della lista
 * (decisione di Dennis, 25/09/2026). Gira ogni notte (cron) e a richiesta.
 *
 * Idempotente per costruzione:
 *   - la chiave è l'identificativo SDI (dalla ricevuta `…_MT_001.xml`);
 *   - una fattura che c'è già dall'Excel si riconosce da P.IVA + numero +
 *     data del fornitore e si ARRICCHISCE, non si duplica; se ha già le sue
 *     scadenze, quelle restano come sono;
 *   - i file letti si spostano in "Importate": al giro dopo non ci sono più.
 *     Un file che dà errore resta dov'è, e si vede nella ricevuta.
 *
 * Le regole su cosa diventa ogni scadenza stanno in `regole.ts`.
 */

import { supabase } from '@/lib/core/supabase'
import { sogliaApprovazione } from '@/lib/pagamenti/import'
import { eRicevutaSdi, leggiFatturaSdi, leggiMetadatiSdi, type FatturaSdi } from './fattura'
import { scadenzeDa, type Contesto } from './regole'
import { cartellaImportate, cartellaSdi, elencaFileSdi, salvaPdf, scaricaFileSdi, spostaInImportate } from './cartella'

/** La nostra partita IVA: un documento emesso da noi non è una fattura passiva. */
export const PIVA_COOPERATIVA = '05569090011'

export interface RicevutaSdi {
  importId: string
  primoImport: boolean
  fileLetti: number
  fatture: number
  nuove: number
  raccordate: number       // c'erano già dall'Excel: arricchite
  giaImportate: number     // stesso identificativo SDI già in archivio
  perStato: Record<string, number>
  bloccate: number         // IBAN mancante o cambiato
  scartate: Array<{ file: string; motivo: string }>
  errori: Array<{ file: string; motivo: string }>
  rimasti: number          // non letti per limite di tempo: al prossimo giro
  /** Vero se è una prova: niente scritto, niente spostato. */
  prova: boolean
  /** Una riga per fattura: cosa è successo (o succederebbe) e perché. */
  righe: Array<{
    fornitore: string
    numero: string
    data: string
    importo: number
    esito: EsitoFattura['tipo']
    scadenze: Array<{ stato: string; data: string; importo: number; motivo: string | null; blocco: string | null }>
  }>
}

type Db = ReturnType<typeof supabase>

// Toglie solo il " (1)" delle copie scaricate due volte. Il nome SDI distingue
// maiuscole e minuscole (IT…_hSf0t e IT…_hSf0T sono due fatture diverse).
const normNome = (n: string) => n.replace(/\s*\(\d+\)/g, '')

interface EsitoFattura {
  tipo: 'nuova' | 'raccordata' | 'raccordata_con_scadenze' | 'gia'
  id: string
  scadenze: ReturnType<typeof scadenzeDa>
}

async function contestoFornitore(db: Db, f: FatturaSdi, scrivi: boolean): Promise<Contesto['fornitore']> {
  if (!f.piva) return null
  const ibanFattura = f.rate.find((r) => r.iban)?.iban ?? null
  const { data } = await db.from('fornitore').select('*').eq('piva', f.piva).maybeSingle()
  if (!data) {
    if (scrivi) await db.from('fornitore').insert({
      piva: f.piva,
      denominazione: f.fornitore,
      iban: ibanFattura,
      iban_fonte: ibanFattura ? 'fattura' : null,
    })
    // Il primo IBAN visto non si confronta con niente: diventa il riferimento.
    return { pagaAlMomento: false, iban: ibanFattura, ibanConfermato: false }
  }
  if (!data.iban && ibanFattura) {
    if (scrivi) await db.from('fornitore').update({ iban: ibanFattura, iban_fonte: 'fattura', aggiornato_il: new Date().toISOString() }).eq('piva', f.piva)
    return { pagaAlMomento: data.paga_al_momento, iban: ibanFattura, ibanConfermato: false }
  }
  // Un IBAN già noto (confermato o solo visto) è il riferimento: se la fattura
  // ne porta un altro, la scadenza si blocca. È il caso della truffa più comune.
  return { pagaAlMomento: data.paga_al_momento, iban: data.iban, ibanConfermato: Boolean(data.iban) }
}

async function salvaFattura(
  db: Db,
  f: FatturaSdi,
  chiaveSdi: string,
  ctxBase: Omit<Contesto, 'fornitore'>,
  importId: string,
  scrivi: boolean,
): Promise<EsitoFattura> {
  const gia = await db.from('fattura_passiva').select('id').eq('identificativo_sdi', chiaveSdi).maybeSingle()
  if (gia.data) return { tipo: 'gia', id: gia.data.id, scadenze: [] }

  const adesso = new Date().toISOString()
  const campi = {
    fornitore: f.fornitore,
    piva: f.piva,
    codice_fiscale: f.codiceFiscale,
    numero_fornitore: f.numero,
    data_fornitore: f.data || null,
    tipo_documento: f.natura === 'nota_credito' ? 'nota_credito' : 'fattura',
    tipo_documento_sdi: f.tipoDocumento,
    imponibile: f.imponibile,
    iva: f.iva,
    totale: f.totale,
    ritenuta: f.ritenuta || null,
    descrizione: f.descrizione,
    identificativo_sdi: chiaveSdi,
    file_sdi: f.nomeFile,
    importata_sdi_il: adesso,
  }

  // Raccordo con le righe nate dall'Excel.
  let id: string | null = null
  let tipo: EsitoFattura['tipo'] = 'nuova'
  if (f.piva && f.data) {
    const { data: rows, error } = await db
      .from('fattura_passiva')
      .select('id, totale, imponibile, iva, descrizione')
      .eq('piva', f.piva)
      .eq('numero_fornitore', f.numero)
      .eq('data_fornitore', f.data)
      .is('identificativo_sdi', null)
      .limit(2)
    if (error) throw new Error(`raccordo: ${error.message}`)
    if (rows && rows.length > 1) throw new Error(`più fatture in archivio con P.IVA ${f.piva}, n. ${f.numero} del ${f.data}: raccordo ambiguo`)
    if (rows && rows.length === 1) {
      const r = rows[0]
      id = r.id
      tipo = 'raccordata'
      const { error: e2 } = !scrivi ? { error: null } : await db.from('fattura_passiva').update({
        identificativo_sdi: chiaveSdi,
        tipo_documento_sdi: f.tipoDocumento,
        ritenuta: campi.ritenuta,
        file_sdi: f.nomeFile,
        importata_sdi_il: adesso,
        ...(r.totale == null ? { totale: f.totale } : {}),
        ...(r.imponibile == null ? { imponibile: f.imponibile } : {}),
        ...(r.iva == null ? { iva: f.iva } : {}),
        ...(r.descrizione == null ? { descrizione: f.descrizione } : {}),
      }).eq('id', r.id)
      if (e2) throw new Error(`aggiornamento fattura: ${e2.message}`)
    }
  }

  if (!id) {
    if (scrivi) {
      const { data, error } = await db.from('fattura_passiva').insert(campi).select('id').single()
      if (error) throw new Error(`inserimento fattura: ${error.message}`)
      id = data.id as string
    } else {
      id = `prova-${chiaveSdi}`
    }
  } else {
    // Arricchita: se ha già le sue scadenze (dall'Excel), restano quelle.
    const { count } = await db.from('scadenza').select('id', { count: 'exact', head: true }).eq('fattura_passiva_id', id)
    if ((count ?? 0) > 0) return { tipo: 'raccordata_con_scadenze', id, scadenze: [] }
  }

  const fornitore = await contestoFornitore(db, f, scrivi)
  const scadenze = scadenzeDa(f, { ...ctxBase, fornitore })
  if (scadenze.length && scrivi) {
    const righe = scadenze.map((s) => ({
      fattura_passiva_id: id,
      posizione: s.posizione,
      data_scadenza: s.data_scadenza,
      stimata: s.stimata,
      importo: s.importo,
      modalita: s.modalita,
      famiglia_modalita: s.famiglia_modalita,
      stato: s.stato,
      motivo_verifica: s.motivo_verifica,
      iban: s.iban,
      blocco: s.blocco,
      segnalazione: s.segnalazione,
      origine: 'sdi',
      soglia_applicata: ctxBase.soglia,
      import_id: importId,
      vista_il: adesso,
      ...(s.pagata
        ? { data_pagamento: s.data_scadenza, origine_pagamento: 'app', pagata_da: 'import fatture SDI', pagata_il: adesso }
        : {}),
    }))
    const { error } = await db.from('scadenza').insert(righe)
    if (error) throw new Error(`inserimento scadenze: ${error.message}`)
  }
  return { tipo, id, scadenze }
}

export async function importaFattureSdi(opz: { utente: string; budgetMs?: number; prova?: boolean }): Promise<RicevutaSdi> {
  const scrivi = !opz.prova
  const t0 = Date.now()
  const budget = opz.budgetMs ?? 240_000
  const db = supabase()
  const importId = crypto.randomUUID()
  const { valore: soglia } = await sogliaApprovazione()

  // Primo import = nessuna fattura in archivio porta ancora un identificativo SDI.
  const { count: giaSdi } = await db
    .from('fattura_passiva')
    .select('id', { count: 'exact', head: true })
    .not('identificativo_sdi', 'is', null)
  const primoImport = (giaSdi ?? 0) === 0
  const ctxBase = { soglia, oggi: new Date().toISOString().slice(0, 10), primoImport }

  const ric: RicevutaSdi = {
    importId, primoImport, fileLetti: 0, fatture: 0, nuove: 0, raccordate: 0, giaImportate: 0,
    perStato: {}, bloccate: 0, scartate: [], errori: [], rimasti: 0, prova: !scrivi, righe: [],
  }

  const tutti = await elencaFileSdi()
  const idImportate = scrivi ? await cartellaImportate() : ''

  // Ricevute SDI: nome del file di fattura → identificativo + id del file ricevuta.
  const ricevute = new Map<string, { idSdi: string; fileId: string }>()
  const tutteRicevute: { idSdi: string; fileId: string }[] = []
  const spostate = new Set<string>()
  for (const f of tutti.filter((f) => eRicevutaSdi(f.name))) {
    try {
      const md = leggiMetadatiSdi(await scaricaFileSdi(f.id))
      if (md) {
        ricevute.set(normNome(md.nomeFile), { idSdi: md.identificativoSdi, fileId: f.id })
        tutteRicevute.push({ idSdi: md.identificativoSdi, fileId: f.id })
      }
    } catch {
      // Una ricevuta illeggibile non ferma niente: la fattura userà il nome del file.
    }
  }

  for (const file of tutti.filter((f) => !eRicevutaSdi(f.name))) {
    if (Date.now() - t0 > budget) {
      ric.rimasti++
      continue
    }
    const nome = normNome(file.name)
    const mt = ricevute.get(nome) ?? ricevute.get(nome.replace(/\.p7m$/i, ''))
    try {
      const fatture = leggiFatturaSdi(file.name, await scaricaFileSdi(file.id))
      ric.fileLetti++
      const ids: string[] = []
      for (const [k, f] of fatture.entries()) {
        if (f.piva === PIVA_COOPERATIVA) {
          ric.scartate.push({ file: file.name, motivo: `emessa dalla cooperativa stessa (${f.tipoDocumento} n. ${f.numero}): non è una fattura passiva` })
          continue
        }
        const chiave = (mt?.idSdi ?? `FILE:${nome}`) + (fatture.length > 1 ? `#${k + 1}` : '')
        const e = await salvaFattura(db, f, chiave, ctxBase, importId, scrivi)
        ric.fatture++
        if (e.tipo === 'nuova') ric.nuove++
        else if (e.tipo === 'gia') ric.giaImportate++
        else ric.raccordate++
        for (const s of e.scadenze) ric.perStato[s.stato] = (ric.perStato[s.stato] ?? 0) + 1
        ric.bloccate += e.scadenze.filter((s) => s.blocco).length
        if (e.tipo !== 'gia') ids.push(e.id)
        ric.righe.push({
          fornitore: f.fornitore, numero: f.numero, data: f.data, importo: f.daPagare, esito: e.tipo,
          scadenze: e.scadenze.map((s) => ({ stato: s.stato, data: s.data_scadenza, importo: s.importo, motivo: s.motivo_verifica, blocco: s.blocco })),
        })
      }

      // PDF del fornitore, se era dentro l'XML.
      const pdf = fatture.flatMap((f) => f.allegati).find((a) => (a.formato ?? '').toUpperCase() === 'PDF' || /\.pdf$/i.test(a.nome))
      let pdfUrl: string | null = null
      if (!scrivi) continue
      if (pdf && ids.length) {
        try {
          pdfUrl = await salvaPdf(idImportate, nome.replace(/\.xml(\.p7m)?$/i, '') + '.pdf', pdf.base64)
        } catch {
          // Il PDF è una comodità: se non si salva, la fattura c'è lo stesso.
        }
      }

      const url = await spostaInImportate(file.id, idImportate)
      if (mt) await spostaInImportate(mt.fileId, idImportate).then(() => spostate.add(mt.fileId)).catch(() => undefined)
      if (ids.length) {
        await db.from('fattura_passiva').update({ file_sdi_url: url, ...(pdfUrl ? { pdf_url: pdfUrl } : {}) }).in('id', ids)
      }
    } catch (e: any) {
      ric.errori.push({ file: file.name, motivo: String(e?.message ?? e).slice(0, 300) })
    }
  }

  if (!scrivi) return ric

  // Ricevute rimaste senza fattura (doppioni scaricati due volte): se la
  // fattura a cui si riferiscono è già in archivio, vanno in "Importate".
  for (const r of tutteRicevute.filter((r) => !spostate.has(r.fileId))) {
    const { data } = await db.from('fattura_passiva').select('id')
      .or(`identificativo_sdi.eq.${r.idSdi},identificativo_sdi.like.${r.idSdi}#*`).limit(1)
    if (data?.length) await spostaInImportate(r.fileId, idImportate).catch(() => undefined)
  }

  await db.from('import_file').insert({
    id: importId,
    nome_file: `${ric.fileLetti} file da "${cartellaSdi()}"`,
    tracciato: 'sdi_xml',
    caricato_da: opz.utente,
    righe: ric.fatture,
    nuove: ric.nuove,
    aggiornate: ric.raccordate,
    invariate: ric.giaImportate,
    scartate: ric.scartate.length + ric.errori.length,
    soglia,
    esito: ric.errori.length ? 'errore' : 'ok',
    dettaglio: { ...ric, righe: undefined },
  })
  return ric
}
