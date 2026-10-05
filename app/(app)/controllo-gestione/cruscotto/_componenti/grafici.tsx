'use client'

/**
 * I grafici del cruscotto, in SVG a mano: quattro forme, nessuna libreria.
 *
 *   AreaMesi   andamento mensile, una o due serie sovrapposte, con mirino
 *   Anello     una percentuale sola (quanta parte delle fatture ha un servizio)
 *   Linea      sparkline delle schede
 *   BarreMesi  barre mensili a coppie, nella scheda di un centro di costo
 *
 * Tutti disegnano alla larghezza vera del contenitore (useLarghezza) invece di
 * stirare un viewBox: con preserveAspectRatio="none" le linee da 2px
 * diventerebbero spesse in un verso e sottili nell'altro.
 */

import { useState } from 'react'
import { MESI, MESI_LUNGHI, euro, euroBreve, useLarghezza, useMontato } from './formato'

// ---------------------------------------------------------------- curve

type Punto = [number, number]

/** Curva monotona (Fritsch–Carlson): morbida, ma non scende mai sotto lo zero. */
function curva(p: Punto[]): string {
  if (p.length === 0) return ''
  if (p.length < 3) return p.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  const n = p.length
  const d: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]))
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  let out = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i + 1][0] - p[i][0]) / 3
    out += ` C${p[i][0] + h},${p[i][1] + h * m[i]} ${p[i + 1][0] - h},${p[i + 1][1] - h * m[i + 1]} ${p[i + 1][0]},${p[i + 1][1]}`
  }
  return out
}

// ------------------------------------------------------------- AreaMesi

export interface Serie {
  nome: string
  valori: number[]
  colore: string
  /** Opacità del riempimento sotto la linea. */
  riempi?: number
}

export function AreaMesi({
  serie,
  meseDa = 1,
  meseUltimo,
  altezza = 170,
  scuro = false,
}: {
  serie: Serie[]
  /** Primo mese da disegnare (1-12). */
  meseDa?: number
  meseUltimo: number
  altezza?: number
  /** Su fondo scuro (l'intestazione): testi chiari. */
  scuro?: boolean
}) {
  const [ref, w] = useLarghezza<HTMLDivElement>()
  const montato = useMontato()
  const [sel, setSel] = useState<number | null>(null)

  const ultimo = Math.max(1, meseUltimo)
  const da = Math.min(Math.max(1, meseDa), ultimo)
  const n = ultimo - da + 1
  const vals = (v: number[]) => v.slice(da - 1, da - 1 + n)
  const max = Math.max(1, ...serie.flatMap((s) => vals(s.valori)))
  const sx = 4
  const dx = 44 // spazio per le etichette dell'asse a destra
  const top = 10
  const bottom = 22
  const pw = Math.max(10, w - sx - dx)
  const ph = altezza - top - bottom
  const x = (i: number) => sx + (n === 1 ? pw / 2 : (i / (n - 1)) * pw)
  const y = (v: number) => top + ph - (v / max) * ph
  const testo = scuro ? 'rgba(255,255,255,.65)' : '#6b6a66'
  const griglia = scuro ? 'rgba(255,255,255,.14)' : '#e7e6e2'

  const onMuovi = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const i = Math.round(((px - sx) / pw) * (n - 1))
    setSel(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: altezza }}>
      {w > 0 && (
        <svg
          width={w}
          height={altezza}
          onPointerMove={onMuovi}
          onPointerDown={onMuovi}
          onPointerLeave={() => setSel(null)}
          className="touch-pan-y"
          role="img"
          aria-label={`Andamento mensile: ${serie.map((s) => s.nome).join(', ')}`}
        >
          <defs>
            {serie.map((s, k) => (
              <linearGradient key={k} id={`grad-${k}-${s.colore.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.colore} stopOpacity={s.riempi ?? 0.35} />
                <stop offset="100%" stopColor={s.colore} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {[0.5, 1].map((f) => (
            <g key={f}>
              <line x1={sx} x2={sx + pw} y1={y(max * f)} y2={y(max * f)} stroke={griglia} strokeDasharray="3 4" />
              <text x={sx + pw + 6} y={y(max * f) + 4} fontSize={10} fill={testo}>
                {euroBreve(max * f)}
              </text>
            </g>
          ))}
          <line x1={sx} x2={sx + pw} y1={y(0)} y2={y(0)} stroke={griglia} />

          {serie.map((s, k) => {
            const pts: Punto[] = vals(s.valori).map((v, i) => [x(i), y(v)])
            const linea = curva(pts)
            const area = `${linea} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`
            return (
              <g key={k}>
                <path
                  d={area}
                  fill={`url(#grad-${k}-${s.colore.slice(1)})`}
                  style={{ opacity: montato ? 1 : 0, transition: 'opacity 900ms ease 300ms' }}
                />
                <path
                  d={linea}
                  fill="none"
                  stroke={s.colore}
                  strokeWidth={2}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={montato ? 0 : 1}
                  style={{ transition: 'stroke-dashoffset 1400ms cubic-bezier(.2,.7,.2,1)' }}
                />
                {n <= 2 &&
                  pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={4} fill={s.colore} />)}
              </g>
            )
          })}

          {MESI.slice(da - 1, da - 1 + n).map((m, i) => (
            <text
              key={i}
              x={x(i)}
              y={altezza - 6}
              fontSize={10}
              textAnchor="middle"
              fill={sel === i ? (scuro ? '#fff' : '#0b0b0b') : testo}
              fontWeight={sel === i ? 700 : 400}
            >
              {m}
            </text>
          ))}

          {sel !== null && (
            <g pointerEvents="none">
              <line x1={x(sel)} x2={x(sel)} y1={top} y2={y(0)} stroke={scuro ? 'rgba(255,255,255,.5)' : '#9a9994'} />
              {serie.map((s, k) => (
                <circle
                  key={k}
                  cx={x(sel)}
                  cy={y(s.valori[da - 1 + sel] ?? 0)}
                  r={4.5}
                  fill={s.colore}
                  stroke={scuro ? '#0d2a6b' : '#fff'}
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
        </svg>
      )}

      {sel !== null && w > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-xl bg-white/95 px-3 py-2 text-xs text-gray-800 shadow-lg ring-1 ring-black/5 backdrop-blur"
          style={{ left: Math.min(Math.max(0, x(sel) - 80), w - 170), width: 160 }}
        >
          <p className="font-semibold">{MESI_LUNGHI[da - 1 + sel]}</p>
          {serie.map((s, k) => (
            <p key={k} className="mt-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="h-2 w-2 rounded-full" style={{ background: s.colore }} />
                {s.nome}
              </span>
              <span className="font-semibold tabular-nums">{euroBreve(s.valori[da - 1 + sel] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------- Anello

export function Anello({
  quota,
  dimensione = 132,
  colore = '#4FB9D6',
  children,
}: {
  /** 0 → 1 */
  quota: number
  dimensione?: number
  colore?: string
  children?: React.ReactNode
}) {
  const montato = useMontato()
  const r = dimensione / 2 - 9
  const c = 2 * Math.PI * r
  const q = Math.max(0, Math.min(1, quota))
  return (
    <div className="relative shrink-0" style={{ width: dimensione, height: dimensione }}>
      <svg width={dimensione} height={dimensione} className="-rotate-90" aria-hidden>
        <circle cx={dimensione / 2} cy={dimensione / 2} r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={12} />
        <circle
          cx={dimensione / 2}
          cy={dimensione / 2}
          r={r}
          fill="none"
          stroke={colore}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={montato ? c * (1 - q) : c}
          style={{ transition: 'stroke-dashoffset 1600ms cubic-bezier(.2,.7,.2,1) 200ms', filter: `drop-shadow(0 0 6px ${colore}88)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------- Linea

export function Linea({
  valori,
  meseDa = 1,
  meseUltimo,
  colore,
  altezza = 40,
}: {
  valori: number[]
  meseDa?: number
  meseUltimo: number
  colore: string
  altezza?: number
}) {
  const [ref, w] = useLarghezza<HTMLDivElement>()
  const montato = useMontato()
  const ultimo = Math.max(1, meseUltimo)
  const da = Math.min(Math.max(1, meseDa), ultimo)
  const v = valori.slice(da - 1, ultimo)
  const n = v.length
  const max = Math.max(0, ...v)
  const vuota = max <= 0
  const x = (i: number) => (n === 1 ? w / 2 : 3 + (i / (n - 1)) * (w - 6))
  const y = (val: number) => altezza - 4 - (vuota ? 0 : (val / max) * (altezza - 10))
  const pts: Punto[] = v.map((val, i) => [x(i), y(val)])
  const linea = curva(pts)
  const id = `sp-${colore.slice(1)}`
  return (
    <div ref={ref} className="w-full" style={{ height: altezza }}>
      {w > 0 && (
        <svg width={w} height={altezza} aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={colore} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colore} stopOpacity={0} />
            </linearGradient>
          </defs>
          {vuota ? (
            <line x1={3} x2={w - 3} y1={altezza - 4} y2={altezza - 4} stroke="#d6d5d0" strokeDasharray="3 4" strokeWidth={2} />
          ) : (
            <>
              <path d={`${linea} L${x(n - 1)},${altezza} L${x(0)},${altezza} Z`} fill={`url(#${id})`} />
              <path
                d={linea}
                fill="none"
                stroke={colore}
                strokeWidth={2}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={montato ? 0 : 1}
                style={{ transition: 'stroke-dashoffset 1200ms ease' }}
              />
              <circle cx={x(n - 1)} cy={y(v[n - 1] ?? 0)} r={3.5} fill={colore} stroke="#fff" strokeWidth={2} />
            </>
          )}
        </svg>
      )}
    </div>
  )
}

// ------------------------------------------------------------ BarreMesi

export function BarreMesi({
  serie,
  meseDa = 1,
  meseUltimo,
  altezza = 150,
}: {
  serie: Serie[]
  meseDa?: number
  meseUltimo: number
  altezza?: number
}) {
  const [ref, w] = useLarghezza<HTMLDivElement>()
  const montato = useMontato()
  const [sel, setSel] = useState<number | null>(null)
  const ultimo = Math.max(1, meseUltimo)
  const da = Math.min(Math.max(1, meseDa), ultimo)
  const n = ultimo - da + 1
  const max = Math.max(1, ...serie.flatMap((s) => s.valori.slice(da - 1, da - 1 + n)))
  const bottom = 18
  const ph = altezza - bottom - 6
  const slot = w / n
  const gap = 2
  const bw = Math.max(3, Math.min(18, (slot - 8) / serie.length - gap))

  return (
    <div ref={ref} className="relative w-full" style={{ height: altezza }}>
      {w > 0 && (
        <svg width={w} height={altezza} onPointerLeave={() => setSel(null)} role="img" aria-label="Costi e ricavi per mese">
          <line x1={0} x2={w} y1={6 + ph} y2={6 + ph} stroke="#e7e6e2" />
          {Array.from({ length: n }, (_, i) => {
            const cx = slot * i + slot / 2
            const tot = serie.length * bw + (serie.length - 1) * gap
            return (
              <g key={i} onPointerEnter={() => setSel(i)} onPointerDown={() => setSel(i)}>
                <rect x={slot * i} y={0} width={slot} height={altezza} fill={sel === i ? '#f3f2ef' : 'transparent'} />
                {serie.map((s, k) => {
                  const v = s.valori[da - 1 + i] ?? 0
                  const h = montato ? (v / max) * ph : 0
                  const bx = cx - tot / 2 + k * (bw + gap)
                  const by = 6 + ph - h
                  const rr = Math.min(4, bw / 2, h)
                  return (
                    <path
                      key={k}
                      d={`M${bx},${6 + ph} V${by + rr} Q${bx},${by} ${bx + rr},${by} H${bx + bw - rr} Q${bx + bw},${by} ${bx + bw},${by + rr} V${6 + ph} Z`}
                      fill={s.colore}
                      style={{ transition: `d 700ms cubic-bezier(.2,.7,.2,1) ${i * 35}ms` }}
                    />
                  )
                })}
                <text x={cx} y={altezza - 4} fontSize={10} textAnchor="middle" fill={sel === i ? '#0b0b0b' : '#6b6a66'}>
                  {MESI[da - 1 + i]}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {sel !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-black/5"
          style={{ left: Math.min(Math.max(0, slot * sel + slot / 2 - 75), w - 150), width: 150 }}
        >
          <p className="font-semibold text-gray-800">{MESI_LUNGHI[da - 1 + sel]}</p>
          {serie.map((s, k) => (
            <p key={k} className="mt-1 flex justify-between gap-2">
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.colore }} />
                {s.nome}
              </span>
              <span className="font-semibold tabular-nums text-gray-800">{euro(s.valori[da - 1 + sel] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
