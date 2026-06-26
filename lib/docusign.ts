/**
 * Integrazione DocuSign — autenticazione JWT (Service Integration) e invio buste.
 * Nessuna libreria esterna: JWT firmato con node:crypto, chiamate via fetch.
 *
 * Env richieste (vedi docs/docusign-setup.md):
 *   DOCUSIGN_OAUTH_HOST          es. account-d.docusign.com (demo) / account.docusign.com (prod)
 *   DOCUSIGN_BASE_PATH           es. https://demo.docusign.net/restapi
 *   DOCUSIGN_INTEGRATION_KEY     client id (integration key)
 *   DOCUSIGN_USER_ID             GUID utente impersonato
 *   DOCUSIGN_ACCOUNT_ID          API account id
 *   DOCUSIGN_PRIVATE_KEY_BASE64  chiave privata RSA (PEM) in base64
 */

import { createSign } from 'node:crypto'

export function isDocusignConfigured(): boolean {
  return Boolean(
    process.env.DOCUSIGN_OAUTH_HOST &&
      process.env.DOCUSIGN_BASE_PATH &&
      process.env.DOCUSIGN_INTEGRATION_KEY &&
      process.env.DOCUSIGN_USER_ID &&
      process.env.DOCUSIGN_ACCOUNT_ID &&
      process.env.DOCUSIGN_PRIVATE_KEY_BASE64,
  )
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function privateKeyPem(): string {
  const b64 = process.env.DOCUSIGN_PRIVATE_KEY_BASE64!
  const decoded = Buffer.from(b64, 'base64').toString('utf8')
  // Se per qualche motivo l'env contiene già il PEM in chiaro, usalo così com'è.
  return decoded.includes('PRIVATE KEY') ? decoded : b64
}

let _tokenCache: { token: string; expiresAt: number } | null = null

/** Access token via JWT Grant (cache fino a scadenza) */
export async function getDocusignAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (_tokenCache && _tokenCache.expiresAt > now + 60) return _tokenCache.token

  const oauthHost = process.env.DOCUSIGN_OAUTH_HOST!
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: process.env.DOCUSIGN_INTEGRATION_KEY,
      sub: process.env.DOCUSIGN_USER_ID,
      aud: oauthHost,
      iat: now,
      exp: now + 3600,
      scope: 'signature impersonation',
    }),
  )
  const signingInput = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = base64url(signer.sign(privateKeyPem()))
  const assertion = `${signingInput}.${signature}`

  const res = await fetch(`https://${oauthHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    // consent_required → l'utente non ha ancora dato il consenso una tantum
    throw new Error(`DocuSign token error (${res.status}): ${err}`)
  }
  const data = await res.json()
  _tokenCache = { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) }
  return _tokenCache.token
}

export interface DocusignDocumento {
  name: string
  base64: string
  fileExtension: string // es. "docx"
}

/**
 * Crea e invia una busta a un unico firmatario.
 * Gli anchor `\s1\` (firma) e `\d1\` (data) devono essere presenti nei documenti.
 */
export async function inviaBustaFirma(opts: {
  signerName: string
  signerEmail: string
  emailSubject: string
  emailBody?: string
  documenti: DocusignDocumento[]
}): Promise<{ envelopeId: string; status: string }> {
  const token = await getDocusignAccessToken()
  const basePath = process.env.DOCUSIGN_BASE_PATH!.replace(/\/$/, '')
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!

  const envelope = {
    emailSubject: opts.emailSubject,
    emailBlurb: opts.emailBody ?? '',
    status: 'sent',
    documents: opts.documenti.map((d, i) => ({
      documentId: String(i + 1),
      name: d.name,
      fileExtension: d.fileExtension,
      documentBase64: d.base64,
    })),
    recipients: {
      signers: [
        {
          email: opts.signerEmail,
          name: opts.signerName,
          recipientId: '1',
          routingOrder: '1',
          tabs: {
            // UN SOLO tab per anchor (niente documentId): DocuSign lo posiziona
            // automaticamente su ogni occorrenza di \s1\ / \d1\, cioè una firma
            // per documento. Creare più tab sullo stesso anchor li impila sullo
            // stesso punto → il riquadro di firma "va e viene" e va cliccato più
            // volte. anchorIgnoreIfNotPresent: un documento può non avere \d1\.
            // Offset X negativo per tenere il timbro entro il margine destro.
            signHereTabs: [
              {
                anchorString: '\\s1\\',
                anchorUnits: 'pixels',
                anchorXOffset: '-170',
                anchorYOffset: '-6',
                anchorIgnoreIfNotPresent: 'true',
              },
            ],
            dateSignedTabs: [
              {
                anchorString: '\\d1\\',
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '0',
                anchorIgnoreIfNotPresent: 'true',
              },
            ],
          },
        },
      ],
    },
  }

  const res = await fetch(`${basePath}/v2.1/accounts/${accountId}/envelopes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(envelope),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DocuSign envelope error (${res.status}): ${err}`)
  }
  const data = await res.json()
  return { envelopeId: data.envelopeId, status: data.status }
}

/** Stato di una busta (created, sent, delivered, completed, declined, voided…) */
export async function getEnvelopeStatus(envelopeId: string): Promise<string> {
  const token = await getDocusignAccessToken()
  const basePath = process.env.DOCUSIGN_BASE_PATH!.replace(/\/$/, '')
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!
  const res = await fetch(
    `${basePath}/v2.1/accounts/${accountId}/envelopes/${envelopeId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DocuSign get envelope error (${res.status}): ${err}`)
  }
  const data = await res.json()
  return data.status
}

/** Scarica tutti i documenti firmati della busta come un unico PDF combinato */
export async function downloadEnvelopeCombined(envelopeId: string): Promise<Buffer> {
  const token = await getDocusignAccessToken()
  const basePath = process.env.DOCUSIGN_BASE_PATH!.replace(/\/$/, '')
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!
  const res = await fetch(
    `${basePath}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/combined`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' } },
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DocuSign download error (${res.status}): ${err}`)
  }
  return Buffer.from(await res.arrayBuffer())
}
