import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { NavTabs } from '@/components/layout/NavTabs'
import { createClient } from '@/lib/supabase/server'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Temporalias',
  description: 'Gestión de reservas',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <html lang="es" className="h-full">
      <body className={`${inter.className} h-full bg-white antialiased`}>
        <div className="flex flex-col h-full">
          {user && <NavTabs titular={user.user_metadata?.titular} />}
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </body>
    </html>
  )
}
