/**
 * POST /api/timbrature/da-profilo — riempie un mese con l'orario teorico
 *   body: { anno, mese, dipendenteId?, rigenera? }
 *
 * È il bottone "Compila il mese" di chi non timbra. Una route sola per tre
 * mani, distinte da `dipendenteId` come per le assenze:
 *   - assente  → la persona lo fa su di sé. È il caso dei responsabili: non
 *     timbrano, ma il foglio ore per Pulse se lo compilano da soli;
 *   - presente → il responsabile (o le HR) lo fa PER CONTO di un collaboratore.
 *     È il caso di Locanda, dove il foglio lo fa per tutti la responsabile.
 *
 * Deliberatamente idempotente: si può premere il primo del mese e ripremere il
 * venti. Riempie solo le giornate ancora vuote, quindi ferie già inserite e
 * righe corrette a mano restano dove sono. `rigenera` è l'unica eccezione, e
 * cancella soltanto quello che aveva generato lui.
 */

import { NextRequest, NextResponse } from 'next/server'
import { logAzione } from '@/lib/core/audit'
import { compilaMeseDaProfilo, getDipendenteById } from '@/lib/timbrature/data'
import { guardOperatore, guardValidatore } from '@/lib/timbrature/guard'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const anno = Number(body?.anno)
  const mese = Number(body?.mese)
  if (!Number.isInteger(anno) || anno < 2000 || !Number.isInteger(mese) || mese < 1 || mese > 12) {
    return NextResponse.json({ error: 'anno e mese obbligatori' }, { status: 400 })
  }
  const rigenera = !!body?.rigenera
  const richiesto = body?.dipendenteId ? Number(body.dipendenteId) : null

  const a = await risolviAttore(richiesto)
  if ('error' in a) return a.error

  try {
    const esito = await compilaMeseDaProfilo(a.dipendenteId, anno, mese, a.chi, {
      rigenera,
      perConto: a.perConto,
    })
    if (esito.righe || esito.rimosse) {
      await logAzione({
        utente: a.chi,
        nome: a.nome,
        azione: rigenera ? 'timbrature.mese-rigenerato-da-profilo' : 'timbrature.mese-compilato-da-profilo',
        entita: 'Timbratura',
        entitaId: String(a.dipendenteId),
        dettagli: {
          anno,
          mese,
          giornate: esito.compilate.length,
          righe: esito.righe,
          rimosse: esito.rimosse,
          perConto: a.perConto,
        },
      })
    }
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 400 })
  }
}

/**
 * Chi preme il bottone, e su chi.
 *
 * La regola "nessuno valida se stesso" di `puoAgireSu` qui non c'entra —
 * compilare non è approvare — ma il caso "un id che è il mio" arriva comunque
 * dalla UI del cruscotto, e va trattato come l'auto-compilazione: si passa dal
 * guard dell'operatore e non da quello del validatore.
 */
async function risolviAttore(dipendenteId: number | null) {
  if (dipendenteId) {
    const proprio = await guardOperatore()
    if (!proprio.error && proprio.dipendente.id === dipendenteId) {
      return {
        dipendenteId,
        chi: proprio.session.user.email!,
        nome: proprio.session.user.name,
        perConto: false,
      }
    }
    const g = await guardValidatore()
    if (g.error) return { error: g.error }
    const dip = await getDipendenteById(dipendenteId)
    if (!dip) return { error: NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 }) }
    if (!g.v.hr && (dip.referenteEmail ?? '').toLowerCase() !== g.v.email.toLowerCase()) {
      return {
        error: NextResponse.json(
          { error: 'Questo dipendente non e\' fra i tuoi collaboratori.' },
          { status: 403 },
        ),
      }
    }
    return { dipendenteId, chi: g.v.email, nome: g.v.session.user.name, perConto: true }
  }

  const g = await guardOperatore()
  if (g.error) return { error: g.error }
  return {
    dipendenteId: g.dipendente.id,
    chi: g.session.user.email!,
    nome: g.session.user.name,
    perConto: false,
  }
}
