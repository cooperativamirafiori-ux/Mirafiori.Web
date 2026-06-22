'use client'

import { signOut, useSession } from 'next-auth/react'

interface HeaderProps {
  title?: string
}

export function Header({ title = 'COOPERATIVA MIRAFIORI' }: HeaderProps) {
  const { data: session } = useSession()

  return (
    <header className="bg-primary text-white px-6 py-4 flex items-center justify-between">
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
    </header>
  )
}
