'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight, LogOut, Menu, X } from 'lucide-react'
import { logout } from '@/app/login/actions'

const tabsBase = [
  { label: 'Calendario', href: '/calendario' },
  { label: 'Reservas', href: '/reservas' },
  { label: 'Ingresos', href: '/ingresos' },
  { label: 'Gastos', href: '/gastos' },
]

const tabsSoloMilagros = [
  { label: 'Comisiones', href: '/cuenta-paola' },
  { label: 'Liquidación (prov.)', href: '/liquidacion-paola' },
]

export function NavTabs({ titular }: { titular?: string }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const tabs = titular === 'Milagros' ? [...tabsBase, ...tabsSoloMilagros] : tabsBase

  return (
    <header className="border-b border-slate-200 bg-white relative">
      <div className="flex items-center gap-1 px-4 h-11">
        <span className="text-base font-semibold text-slate-800 mr-3 select-none">TempoBoard</span>

        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`hidden md:block px-3 py-1.5 text-sm rounded-md transition-colors duration-150 ${
                active
                  ? 'bg-slate-100 text-slate-700 font-medium'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}

        <a
          href="https://temporalias.lovable.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex items-center gap-1 px-3 py-1.5 text-sm rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors duration-150"
        >
          Dashboard <ArrowUpRight className="w-3.5 h-3.5" />
        </a>

        <form action={logout} className="hidden md:block ml-auto">
          <button
            type="submit"
            aria-label="Cerrar sesión"
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          className="md:hidden ml-auto p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors relative z-50"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-50 md:hidden">
            {tabs.map((tab) => {
              const active = pathname.startsWith(tab.href)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-3 py-2 text-sm rounded-md transition-colors duration-150 ${
                    active
                      ? 'bg-slate-100 text-slate-700 font-medium'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}

            <a
              href="https://temporalias.lovable.app/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-1 px-3 py-2 text-sm rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors duration-150"
            >
              Dashboard <ArrowUpRight className="w-3.5 h-3.5" />
            </a>

            <form action={logout}>
              <button
                type="submit"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <LogOut className="w-4 h-4" /> Cerrar sesión
              </button>
            </form>
          </div>
        </>
      )}
    </header>
  )
}
