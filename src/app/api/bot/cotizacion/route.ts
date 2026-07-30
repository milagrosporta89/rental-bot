import { NextRequest, NextResponse } from 'next/server'
import { validarAuthBot } from '@/lib/bot-auth'
import { obtenerCotizacionCompraVenta } from '@/lib/cotizacion'

export async function GET(req: NextRequest) {
  if (!validarAuthBot(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const fecha = req.nextUrl.searchParams.get('fecha')
  const { compra, venta } = await obtenerCotizacionCompraVenta(fecha ?? undefined)
  return NextResponse.json({ compra, venta })
}
