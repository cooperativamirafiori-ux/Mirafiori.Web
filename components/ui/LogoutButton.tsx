'use client'

import { signOut } from 'next-auth/react'

export function LogoutButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className={
        className ??
        'text-sm text-gray-500 hover:text-gray-700 transition-colors underline'
      }
    >
      Esci
    </button>
  )
}
