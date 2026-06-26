import { Suspense } from 'react'
import { GastosTable } from '@/components/gastos/GastosTable'

export default function GastosPage() {
  return (
    <Suspense>
      <GastosTable />
    </Suspense>
  )
}
