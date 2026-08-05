/**
 * POST /api/risorse-umane/dipendenti/[id]/documenti/conferma
 *   body: { nomeFile }
 *
 * Chiamata dal browser dopo che il caricamento diretto su SharePoint è andato a
 * buon fine. Fa due cose che il caricamento diretto lascia scoperte:
 *
 * 1. **Registra l'azione nel log applicativo.** Il server non vede passare il
 *    file, quindi senza questa chiamata il caricamento non risulterebbe da
 *    nessuna parte. Si registra qui e non all'apertura della sessione perché un
 *    caricamento interrotto a metà non deve comparire nel log come avvenuto: su
 *    un registro usato per l'accountability, un'azione riportata e mai accaduta
 *    è peggio di un'azione non riportata.
 * 2. **Valorizza `CartellaUrl`** se il dipendente non l'aveva ancora: la
 *    cartella può essere stata creata proprio adesso, all'apertura della sessione.
 *
 * Non è un passaggio di sicurezza: se qualcuno la chiamasse senza aver caricato
 * niente, otterrebbe una riga di log e nulla più. Il controllo di accesso resta
 * su SharePoint e sull'appartenenza al gruppo.
 *
 * Accesso: membri del gruppo Microsoft 365 "Risorse Umane" (vedi lib/gruppo-ru.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardMembroRU } from '@/lib/core/api-guard'
import { ensureCartellaDipendente, getDocumentiDipendente } from '@/lib/risorse-umane/data'
import { graphRU } from '@/lib/core/graph-delegato'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMembroRU()
  if (g.error) return g.error
  const { id } = await params

  let body: { nomeFile?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const nomeFile = typeof body.nomeFile === 'string' ? body.nomeFile : ''

  await logAzione({
    utente: g.session.user.email,
    nome: g.session.user.name,
    azione: 'ru.dipendente.documento-carica',
    entita: 'dipendente',
    entitaId: id,
    dettagli: { file: nomeFile },
  })

  try {
    const gc = await graphRU(g.session.user.email)
    // Best effort: allinea CartellaUrl e restituisce l'elenco aggiornato, così
    // il browser non deve fare una seconda richiesta per rinfrescare la lista.
    const cartella = await ensureCartellaDipendente(gc, id).catch(() => null)
    const documenti = await getDocumentiDipendente(gc, id)
    return NextResponse.json({ url: cartella?.url ?? null, documenti })
  } catch (e) {
    // Il file è già su SharePoint: un errore qui non deve far credere all'utente
    // che il caricamento sia fallito.
    console.error('[documenti/conferma] rinfresco elenco non riuscito', e)
    return NextResponse.json({ url: null, documenti: null })
  }
}
