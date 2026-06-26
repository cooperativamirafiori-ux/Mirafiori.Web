/**
 * GET /api/docusign/callback
 * Endpoint di redirect per il consenso una tantum JWT.
 * Non fa nulla di funzionale: il consenso viene registrato lato DocuSign.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return new NextResponse(
    `<!doctype html><html lang="it"><meta charset="utf-8">
     <body style="font-family:sans-serif;padding:40px;text-align:center">
       <h2>✅ Consenso DocuSign registrato</h2>
       <p>Puoi chiudere questa pagina e tornare all'app.</p>
     </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
