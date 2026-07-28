'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, Share2 } from 'lucide-react'
import { Ingreso, Reserva } from '@/lib/types'
import { generarReciboImagen, descargarRecibo, compartirRecibo, puedeCompartirArchivos, esDispositivoMobil } from '@/lib/recibo'

interface Props {
  pago: Ingreso
  reserva: Reserva
  onClose: () => void
}

export function ReciboModal({ pago, reserva, onClose }: Props) {
  const [data, setData] = useState<{ dataUrl: string; filename: string } | null>(null)
  const [error, setError] = useState('')
  const [compartiendo, setCompartiendo] = useState(false)

  useEffect(() => {
    generarReciboImagen(pago, reserva)
      .then(setData)
      .catch(() => setError('No se pudo generar el comprobante.'))
  }, [pago, reserva])

  async function handleCompartir() {
    if (!data) return
    setCompartiendo(true)
    setError('')
    try {
      const ok = await compartirRecibo(data.dataUrl, data.filename)
      if (!ok) setError('Tu navegador no permite compartir directamente — descargá el JPG y compartilo manualmente.')
    } finally {
      setCompartiendo(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xs">
        <DialogTitle className="sr-only">Recibo</DialogTitle>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        {!data && !error && <p className="text-xs text-slate-400 text-center py-10 mt-3">Generando…</p>}
        {data && (
          <>
            <img src={data.dataUrl} alt="Comprobante de pago" className="w-full rounded-md border border-slate-200 mt-3" />
            {esDispositivoMobil() && puedeCompartirArchivos() && reserva.telefono && (
              <Button
                variant="outline"
                size="sm"
                className="w-full cursor-pointer"
                disabled={compartiendo}
                onClick={handleCompartir}
              >
                <Share2 className="w-3.5 h-3.5 mr-1.5" />
                {compartiendo ? 'Compartiendo…' : 'Compartir por WhatsApp'}
              </Button>
            )}
            <Button
              size="sm"
              className="w-full cursor-pointer"
              onClick={() => descargarRecibo(data.dataUrl, data.filename)}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Descargar JPG
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
