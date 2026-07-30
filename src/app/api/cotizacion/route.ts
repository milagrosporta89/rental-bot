import { NextRequest, NextResponse } from 'next/server'
import { obtenerCotizacionCompraVenta } from '@/lib/cotizacion'

export async function GET(req: NextRequest) {
  const fecha = req.nextUrl.searchParams.get('fecha')
  const { compra, venta } = await obtenerCotizacionCompraVenta(fecha ?? undefined)
  return NextResponse.json({ cotizacion: venta, compra, venta })
}
