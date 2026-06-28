'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatUSD } from '@/lib/utils'

interface Props {
  open: boolean
  montoUsd: number
  onConfirm: () => void
  onDismiss: () => void
}

/** US-04: tras guardar un ingreso con destinatario Paola, preguntar si se quiere asentar
 * el mismo cobro como gasto de comisión — nunca se crea solo. */
export function GatilloComisionModal({ open, montoUsd, onConfirm, onDismiss }: Props) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onDismiss()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Asentar como gasto de comisión?</DialogTitle>
          <DialogDescription>
            Este cobro de {formatUSD(montoUsd)} fue a la cuenta de Paola. ¿Querés registrarlo también como un gasto de comisión?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onDismiss}>
            No, gracias
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Sí, asentar gasto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
