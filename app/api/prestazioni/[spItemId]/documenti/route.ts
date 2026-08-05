/**
 * POST /api/prestazioni/[spItemId]/documenti
 * Genera i 3 documenti precompilati (contratto, autorizzazione GDPR, impegno
 * riservatezza), li carica nella cartella SharePoint della prestazione e porta
 * lo stato a "Contratto inviato".
 *
 * I file sono .docx con segnaposto già risolti e anchor DocuSign invisibili
 * (\s1\ firma, \d1\ data): pronti per la firma manuale o, in futuro, per DocuSign.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import {
  getPrestazioneById,
  aggiornaPrestazione,
  ensureCartellaPrestazione,
  uploadAllegato,
} from '@/lib/prestazioni'
import {
  generaDocumentiPrestazione,
  campiMancantiPerDocumenti,
  leggiAllegatiInformativi,
} from '@/lib/documenti-prestazione'
import { isDocusignConfigured, inviaBustaFirma } from '@/lib/docusign'
import { notificaModuliInformativi } from '@/lib/notifications'
import { logAzione } from '@/lib/core/audit'

export const runtime = 'nodejs'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> },
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const { spItemId } = await params
  if (!spItemId) {
    return NextResponse.json({ error: 'ID prestazione mancante' }, { status: 400 })
  }

  try {
    const prestazione = await getPrestazioneById(spItemId)

    // 1. I dati bastano per i documenti?
    const mancanti = campiMancantiPerDocumenti(prestazione)
    if (mancanti.length) {
      return NextResponse.json(
        { error: `Dati mancanti per generare i documenti: ${mancanti.join(', ')}` },
        { status: 400 },
      )
    }

    // 2. Cartella della prestazione (creata se non esiste)
    const { prestazione: cartella } = await ensureCartellaPrestazione({
      nome: prestazione.nome,
      cognome: prestazione.cognome,
      codiceFiscale: prestazione.codiceFiscale,
      dataCartella: prestazione.dataInserimento,
    })

    // 3. Genera e carica i 3 documenti
    const documenti = generaDocumentiPrestazione(prestazione)
    const caricati: { tipo: string; filename: string; webUrl: string }[] = []
    for (const doc of documenti) {
      const { webUrl } = await uploadAllegato(
        cartella.path,
        doc.filename,
        new Uint8Array(doc.buffer),
        DOCX_MIME,
      )
      caricati.push({ tipo: doc.tipo, filename: doc.filename, webUrl })
    }

    // 4. Invio per firma via DocuSign (se configurato)
    let inviato = false
    let envelopeId: string | undefined
    if (isDocusignConfigured()) {
      if (!prestazione.email) {
        return NextResponse.json(
          { error: 'Email del prestatore mancante: impossibile inviare per la firma' },
          { status: 400 },
        )
      }
      const busta = await inviaBustaFirma({
        signerName: `${prestazione.cognome} ${prestazione.nome}`.trim(),
        signerEmail: prestazione.email,
        emailSubject: `Documenti da firmare — ${prestazione.idPrestazione} · Cooperativa Mirafiori`,
        emailBody:
          'In allegato i documenti della tua collaborazione occasionale da firmare elettronicamente.',
        documenti: documenti.map((d) => ({
          name: d.filename.replace(/\.docx$/i, ''),
          base64: d.buffer.toString('base64'),
          fileExtension: 'docx',
        })),
      })
      envelopeId = busta.envelopeId
      inviato = true
      await aggiornaPrestazione(spItemId, {
        Stato: 'Contratto inviato',
        DocusignEnvelopeId: envelopeId,
      })
    } else {
      // DocuSign non configurato: documenti solo generati e caricati, non inviati
      await aggiornaPrestazione(spItemId, { Stato: 'Contratto inviato' })
    }

    // Mail semplice al prestatore con foglio ore + informativa fornitore.
    // ATTESA (await) prima di rispondere: su serverless una promise non attesa
    // viene troncata quando la funzione si congela dopo la risposta → ECONNRESET
    // (soprattutto con allegati grandi). Un fallimento mail non blocca la route.
    if (prestazione.email) {
      const moduli = leggiAllegatiInformativi()
      await notificaModuliInformativi({
        to: prestazione.email,
        from: prestazione.responsabileEmail,
        prestatoreNome: prestazione.nome,
        idPrestazione: prestazione.idPrestazione,
        attachments: moduli.map((m) => ({
          filename: m.filename,
          contentBase64: m.buffer.toString('base64'),
          contentType: m.contentType,
        })),
      }).catch((e) => console.error('[documenti] invio moduli informativi fallito', e))
    }

    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'prestazione.genera-documenti',
      entita: 'PrestazioneOccasionale',
      entitaId: prestazione.idPrestazione,
      dettagli: { documenti: caricati.map((c) => c.tipo), docusign: inviato, envelopeId },
    })

    return NextResponse.json(
      {
        idPrestazione: prestazione.idPrestazione,
        documenti: caricati,
        cartellaUrl: cartella.webUrl,
        inviato,
        envelopeId,
      },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('[POST /api/prestazioni/[spItemId]/documenti]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
