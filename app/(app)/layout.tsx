import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import { Assistente } from '@/components/assistente/Assistente'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-gray-50 pb-20">
        {children}
      </div>
      {/* Il "?" in basso a destra: aiuto all'uso dell'app, vedi lib/assistente/ */}
      <Assistente />
    </SessionProvider>
  )
}
