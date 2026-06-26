'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReservaModal } from '@/components/modals/ReservaModal'
import { Reserva } from '@/lib/types'

export function EditarReservaButton({ reserva }: { reserva: Reserva }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reservas, setReservas] = useState<Reserva[]>([reserva])

  useEffect(() => {
    if (!open) return
    fetch('/api/calendar-data')
      .then(r => r.json())
      .then(({ reservas }: { reservas: Reserva[] }) => setReservas(reservas))
  }, [open])

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="text-xs text-slate-500 border-slate-200 h-7 px-2.5"
        onClick={() => setOpen(true)}
      >
        <Pencil className="w-3 h-3 mr-1" />Editar reserva
      </Button>

      {open && (
        <ReservaModal
          mode="edit"
          reserva={reserva}
          reservas={reservas}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); router.refresh() }}
        />
      )}
    </>
  )
}
