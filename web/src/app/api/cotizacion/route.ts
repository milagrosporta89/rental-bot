import { NextRequest, NextResponse } from 'next/server'

// Mismo criterio que src/services/dolar.ts del bot: hoy -> /v2/latest, fecha pasada -> /v2/historical?day=ISO
function esHoy(fechaISO: string): boolean {
  return fechaISO === new Date().toISOString().slice(0, 10)
}

async function cotizacionActual(): Promise<number> {
  const res = await fetch('https://api.bluelytics.com.ar/v2/latest', {
    next: { revalidate: 3600 },
  })
  const data = await res.json() as { oficial: { value_sell: number } }
  return data.oficial.value_sell
}

async function cotizacionHistorica(fechaISO: string): Promise<number> {
  const res = await fetch(`https://api.bluelytics.com.ar/v2/historical?day=${fechaISO}`, {
    next: { revalidate: 3600 },
  })
  const data = await res.json() as { oficial: { value_sell: number } }
  return data.oficial.value_sell
}

export async function GET(req: NextRequest) {
  const fecha = req.nextUrl.searchParams.get('fecha')

  try {
    if (!fecha || esHoy(fecha)) {
      return NextResponse.json({ cotizacion: await cotizacionActual() })
    }
    return NextResponse.json({ cotizacion: await cotizacionHistorica(fecha) })
  } catch {
    // Fallback: si la histórica falla, intentamos la actual antes de devolver 0
    try {
      return NextResponse.json({ cotizacion: await cotizacionActual() })
    } catch {
      return NextResponse.json({ cotizacion: 0 })
    }
  }
}
