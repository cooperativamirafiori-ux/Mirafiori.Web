'use client'

import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'

interface HeaderProps {
  title?: string
  /**
   * Navigazione verso la sezione superiore nella gerarchia (non "indietro nel
   * browser"). Convenzione unica per tutta l'app: sempre qui, riga sopra il
   * titolo, dentro la barra blu — mai sparso a metà pagina o in fondo.
   * Ometterlo solo per le pagine di primo livello (es. Home) che non hanno
   * un genitore. Vedi § Navigazione in CLAUDE.md.
   */
  backHref?: string
  /** Testo completo del link, es. "Torna alla Home", "Torna a Risorse Umane". */
  backLabel?: string
}

export function Header({ title = 'COOPERATIVA MIRAFIORI', backHref, backLabel }: HeaderProps) {
  const { data: session } = useSession()

  return (
    <header className="bg-primary text-white px-6 py-4">
      {backHref && (
        <Link
          href={backHref}
          className="mb-1 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white transition-colors"
        >
          ← {backLabel ?? 'Indietro'}
        </Link>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-wide">{title}</h1>
        {session?.user && (
          <div className="flex items-center gap-4 text-sm">
            <span className="opacity-80">{session.user.name ?? session.user.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="opacity-70 hover:opacity-100 transition-opacity underline"
            >
              Esci
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
