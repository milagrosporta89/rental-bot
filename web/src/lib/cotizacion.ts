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

/** Cotización oficial del dólar para una fecha (YYYY-MM-DD). Sin fecha, o si es hoy, usa la cotización actual. */
export async function obtenerCotizacion(fechaISO?: string): Promise<number> {
  try {
    if (!fechaISO || esHoy(fechaISO)) return await cotizacionActual()
    return await cotizacionHistorica(fechaISO)
  } catch {
    try {
      return await cotizacionActual()
    } catch {
      return 0
    }
  }
}
