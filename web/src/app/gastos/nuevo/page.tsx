import { Suspense } from 'react'
import { GastoWizard } from '@/components/gastos/GastoWizard'

export default function GastoNuevoPage() {
  return (
    <div className="h-full overflow-auto">
      <Suspense>
        <GastoWizard />
      </Suspense>
    </div>
  )
}
