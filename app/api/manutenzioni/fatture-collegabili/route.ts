/**
 * GET /api/manutenzioni/fatture-collegabili?cerca=… — fatture SDI che si
 * possono collegare a una manutenzione: su cc24 o ancora libere, con
 * imponibile non ancora distribuito. Solo gestione (isAdmin).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { fattureCollegabili } from '@/lib/manutenzioni/costi'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  if (!session.user.isAdmin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  try {
    const fatture = await fattureCollegabili(req.nextUrl.searchParams.get('cerca') ?? '')
    return NextResponse.json({ fatture })
  } catch (e: any) {
    console.error('[GET /api/manutenzioni/fatture-collegabili]', e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
