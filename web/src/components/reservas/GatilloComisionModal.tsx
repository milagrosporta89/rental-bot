'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatUSD } from '@/lib/utils'

interface Props {
  open: boolean
  montoCobrado: number
  montoComision: number
  onConfirm: () => void
  onDismiss: () => void
}

/** US-04: tras guardar un ingreso con destinatario Paola, preguntar si se quiere asentar como
 * gasto la comisión que le corresponde — nunca el cobro completo, porque si Paola cobró de más
 * (ej. para autosaldarse algo), ese excedente no es un gasto nuevo, queda como diferencia para
 * resolver en la próxima liquidación. El gasto nunca se crea solo. */
export function GatilloComisionModal({ open, montoCobrado, montoComision, onConfirm, onDismiss }: Props) {
  const sobrante = montoCobrado - montoComision
  return (
    <Dialog open={open} onOpenChange={o => !o && onDismiss()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Asentar como gasto de comisión?</DialogTitle>
          <DialogDescription>
            Este cobro de {formatUSD(montoCobrado)} fue a la cuenta de Paola. Le corresponden {formatUSD(montoComision)} de comisión — ¿querés registrar ese monto como gasto?
            {sobrante > 0.01 && (
              <> El resto ({formatUSD(sobrante)}) no se registra como gasto ni se suma todavía a caja chica — recién se va a contabilizar cuando uses &quot;Liquidar comisiones&quot;.</>
            )}
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
