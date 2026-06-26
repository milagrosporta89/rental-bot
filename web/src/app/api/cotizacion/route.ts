import { NextRequest, NextResponse } from 'next/server'
import { obtenerCotizacion } from '@/lib/cotizacion'

export async function GET(req: NextRequest) {
  const fecha = req.nextUrl.searchParams.get('fecha')
  return NextResponse.json({ cotizacion: await obtenerCotizacion(fecha ?? undefined) })
}
