/**
 * Toglie la busta di firma a una fattura `.xml.p7m` e ne restituisce l'XML.
 *
 * Il `.p7m` è una busta CMS/PKCS#7 (CAdES) che contiene il file firmato così
 * com'è. Non verifichiamo la firma: la verifica l'ha già fatta lo SDI prima di
 * consegnarci la fattura, e qui serve solo il contenuto.
 *
 * Senza librerie: si legge la struttura ASN.1 (BER/DER) quanto basta per
 * arrivare al contenuto — ContentInfo → SignedData → encapContentInfo →
 * eContent. Il contenuto può essere spezzato in più pezzi (OCTET STRING
 * "costruito", lunghezze indefinite): i pezzi si ricuciono in ordine.
 *
 * Due varianti che arrivano davvero dallo SDI:
 *   - binario DER/BER (il caso normale);
 *   - lo stesso binario scritto in base64 dentro un file di testo.
 */

interface Nodo {
  tag: number        // primo byte: classe + costruito + numero
  inizio: number     // offset del contenuto
  fine: number       // offset di fine contenuto (esclusi gli EOC)
  prossimo: number   // offset del nodo successivo
  costruito: boolean
}

function leggiNodo(b: Uint8Array, pos: number): Nodo {
  const tag = b[pos]
  let p = pos + 1
  // Tag multi-byte (numero ≥ 31): non ne arrivano nei CMS, ma si saltano bene.
  if ((tag & 0x1f) === 0x1f) while (b[p++] & 0x80);
  let len = b[p++]
  const costruito = (tag & 0x20) !== 0
  if (len === 0x80) {
    // Lunghezza indefinita: i figli finiscono con 00 00.
    let q = p
    while (!(b[q] === 0 && b[q + 1] === 0)) q = leggiNodo(b, q).prossimo
    return { tag, inizio: p, fine: q, prossimo: q + 2, costruito }
  }
  if (len & 0x80) {
    const n = len & 0x7f
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + b[p++]
  }
  return { tag, inizio: p, fine: p + len, prossimo: p + len, costruito }
}

function figli(b: Uint8Array, n: Nodo): Nodo[] {
  const out: Nodo[] = []
  let p = n.inizio
  while (p < n.fine) {
    const f = leggiNodo(b, p)
    out.push(f)
    p = f.prossimo
  }
  return out
}

/** Contenuto di un OCTET STRING, primitivo o spezzato in pezzi. */
function ottetti(b: Uint8Array, n: Nodo): Uint8Array[] {
  if (!n.costruito) return [b.subarray(n.inizio, n.fine)]
  return figli(b, n).flatMap((f) => ottetti(b, f))
}

function unisci(pezzi: Uint8Array[]): Uint8Array {
  const tot = pezzi.reduce((s, x) => s + x.length, 0)
  const out = new Uint8Array(tot)
  let o = 0
  for (const x of pezzi) {
    out.set(x, o)
    o += x.length
  }
  return out
}

function daBusta(b: Uint8Array): Uint8Array {
  const contentInfo = leggiNodo(b, 0)                    // SEQUENCE
  const [, esplicito] = figli(b, contentInfo)            // OID, [0]
  const signedData = figli(b, esplicito)[0]              // SEQUENCE
  const encap = figli(b, signedData)[2]                  // version, digestAlgs, encapContentInfo
  const [, eContentTag] = figli(b, encap)                // OID, [0]
  const eContent = figli(b, eContentTag)[0]              // OCTET STRING
  return unisci(ottetti(b, eContent))
}

/** Sembra base64 (solo caratteri ammessi, niente byte binari)? */
function eBase64(b: Uint8Array): boolean {
  const n = Math.min(b.length, 200)
  for (let i = 0; i < n; i++) {
    const c = b[i]
    const ok =
      (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) ||
      c === 43 || c === 47 || c === 61 || c === 10 || c === 13
    if (!ok) return false
  }
  return true
}

/**
 * Byte dell'XML contenuto nella busta. Ultima risorsa, se la struttura non si
 * legge: si cerca il documento fra `<?xml` e la chiusura di FatturaElettronica.
 * Funziona sui contenuti non spezzati; se fallisce anche quella, si alza
 * l'errore e il file resta da guardare a mano.
 */
export function estraiDaP7m(dati: Uint8Array): Uint8Array {
  let b = dati
  if (eBase64(b)) b = Uint8Array.from(Buffer.from(Buffer.from(b).toString('latin1'), 'base64'))
  try {
    return daBusta(b)
  } catch {
    const testo = Buffer.from(b).toString('latin1')
    const i = testo.search(/<\?xml|<([A-Za-z0-9_]+:)?FatturaElettronica[\s>]/)
    const m = /<\/([A-Za-z0-9_]+:)?FatturaElettronica\s*>/.exec(testo)
    if (i >= 0 && m) return b.subarray(i, m.index + m[0].length)
    throw new Error('busta .p7m non leggibile')
  }
}
