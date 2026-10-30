/**
 * POST /api/soci/domanda — salva i dati del modulo.
 *
 * Crea la domanda al primo salvataggio, poi aggiorna la stessa finché non è
 * firmata: chi torna a correggere un dato non ne apre una seconda. Dopo il
 * caricamento del PDF firmato i dati non si cambiano più.
 */

import { NextRequest, NextResponse } from 'next/server'
import { logAzione } from '@/lib/core/audit'
import { aggiornaDomanda, creaDomanda, domandaDi, graphSoci, perIlBrowser } from '@/lib/soci/data'
import { eSocio, oggiIso, schedaDi } from '@/lib/soci/flusso'
import { errore, guardSessione } from '@/lib/soci/guard'
import { normalizzaDati, validaDati } from '@/types/soci'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const s = await guardSessione()
  if (s.risposta) return s.risposta
  const email = s.session.user.email!

  let body: { dati?: unknown }
  try {
    body = await req.json()
  } catch {
    return errore('Richiesta non valida')
  }
  const dati = normalizzaDati(body.dati)
  const errori = validaDati(dati)
  if (Object.keys(errori).length) return errore('Controlla i campi segnati in rosso.', 400, { errori })

  try {
    const g = graphSoci()
    const scheda = await schedaDi(g, email)
    if (!scheda) {
      return errore('Non troviamo la tua scheda nel personale: scrivi a risorseumane@cooperativamirafiori.com.', 409)
    }
    if (eSocio(scheda)) return errore('Risulti già socio/a della cooperativa.', 409)

    const esistente = await domandaDi(g, email)
    const oggi = oggiIso()
    let domanda
    if (esistente && esistente.stato === 'In attesa di firma') {
      domanda = await aggiornaDomanda(g, esistente.spItemId, { dati, dataDomanda: oggi })
    } else if (esistente && esistente.stato !== 'Registrata') {
      return errore('La domanda firmata è già stata caricata: i dati non si possono più cambiare.', 409)
    } else {
      domanda = await creaDomanda(g, { email, ruItemId: scheda.spItemId, dati, dataDomanda: oggi })
    }

    await logAzione({
      utente: email,
      nome: s.session.user.name,
      azione: esistente?.spItemId === domanda.spItemId ? 'soci.domanda.modifica' : 'soci.domanda.crea',
      entita: 'Domanda ammissione socio',
      entitaId: domanda.spItemId,
      dettagli: { tipo: dati.tipoSocio },
    })
    return NextResponse.json({ domanda: perIlBrowser(domanda) })
  } catch (e: any) {
    console.error('[POST /api/soci/domanda]', e)
    return errore(e?.message ?? 'Errore interno', 500)
  }
}
