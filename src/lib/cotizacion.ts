// Mismo criterio que src/services/dolar.ts del bot: hoy -> /v2/latest, fecha pasada -> /v2/historical?day=ISO

function esHoy(fechaISO: string): boolean {
  return fechaISO === new Date().toISOString().slice(0, 10)
}

export interface CotizacionCompraVenta {
  compra: number
  venta: number
}

async function cotizacionActual(): Promise<CotizacionCompraVenta> {
  const res = await fetch('https://api.bluelytics.com.ar/v2/latest', {
    next: { revalidate: 3600 },
  })
  const data = await res.json() as { oficial: { value_buy: number; value_sell: number } }
  return { compra: data.oficial.value_buy, venta: data.oficial.value_sell }
}

async function cotizacionHistorica(fechaISO: string): Promise<CotizacionCompraVenta> {
  const res = await fetch(`https://api.bluelytics.com.ar/v2/historical?day=${fechaISO}`, {
    next: { revalidate: 3600 },
  })
  const data = await res.json() as { oficial: { value_buy: number; value_sell: number } }
  return { compra: data.oficial.value_buy, venta: data.oficial.value_sell }
}

/** Puntas compradora y vendedora del dólar oficial para una fecha (YYYY-MM-DD). Sin fecha, o si es hoy, usa la cotización actual. */
export async function obtenerCotizacionCompraVenta(fechaISO?: string): Promise<CotizacionCompraVenta> {
  try {
    if (!fechaISO || esHoy(fechaISO)) return await cotizacionActual()
    return await cotizacionHistorica(fechaISO)
  } catch {
    try {
      return await cotizacionActual()
    } catch {
      return { compra: 0, venta: 0 }
    }
  }
}

/** Cotización oficial del dólar (punta vendedora) para una fecha (YYYY-MM-DD). Sin fecha, o si es hoy, usa la cotización actual. */
export async function obtenerCotizacion(fechaISO?: string): Promise<number> {
  return (await obtenerCotizacionCompraVenta(fechaISO)).venta
}
