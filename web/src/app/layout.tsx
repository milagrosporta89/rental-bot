import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { NavTabs } from '@/components/layout/NavTabs'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Temporalias',
  description: 'Gestión de reservas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className={`${inter.className} h-full bg-white antialiased`}>
        <div className="flex flex-col h-full">
          <NavTabs />
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </body>
    </html>
  )
}
