'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight, LogOut } from 'lucide-react'
import { logout } from '@/app/login/actions'

const tabs = [
  { label: 'Calendario', href: '/calendario' },
  { label: 'Reservas', href: '/reservas' },
  { label: 'Gastos', href: '/gastos' },
]

export function NavTabs({ nombreUsuario }: { nombreUsuario: string }) {
  const pathname = usePathname()

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex items-center gap-1 px-4 h-11">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors duration-150 ${
                active
                  ? 'bg-slate-100 text-slate-700 font-medium'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}

        <div className="ml-auto flex items-center gap-4">
          <a
            href="#"
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors duration-150"
          >
            Dashboard <ArrowUpRight className="w-3.5 h-3.5" />
          </a>

          <div className="flex items-center gap-1.5">
            <span className="text-sm text-slate-500">{nombreUsuario}</span>
            <form action={logout}>
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  )
}
