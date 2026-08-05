import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    </SessionProvider>
  )
}
