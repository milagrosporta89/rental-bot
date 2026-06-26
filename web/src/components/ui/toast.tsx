'use client'

import { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'

interface ToastProps {
  message: string
  onClose: () => void
  duration?: number
}

export function Toast({ message, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration])

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-slate-800 text-white text-sm rounded-lg shadow-lg pl-4 pr-3 py-3 animate-toast-in"
    >
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      {message}
      <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-white cursor-pointer">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
