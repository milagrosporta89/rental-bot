import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch('https://api.bluelytics.com.ar/v2/latest', {
      next: { revalidate: 3600 },
    })
    const data = await res.json() as { oficial: { value_sell: number } }
    return NextResponse.json({ cotizacion: data.oficial.value_sell })
  } catch {
    return NextResponse.json({ cotizacion: 0 })
  }
}
