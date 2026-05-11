import axios from "axios";

const cache = new Map<string, number>();

function toIsoDate(fecha: string): string {
  const [dia, mes, anio] = fecha.split("/");
  return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

function esHoy(fecha: string): boolean {
  return toIsoDate(fecha) === new Date().toISOString().slice(0, 10);
}

async function cotizacionActual(): Promise<number> {
  const hoy = new Date().toISOString().slice(0, 10);
  if (cache.has(hoy)) return cache.get(hoy)!;

  const res = await axios.get<{ oficial: { value_sell: number } }>(
    "https://api.bluelytics.com.ar/v2/latest",
    { timeout: 5000 }
  );
  const valor = res.data.oficial.value_sell;
  cache.set(hoy, valor);
  return valor;
}

async function cotizacionHistorica(fecha: string): Promise<number> {
  const isoDate = toIsoDate(fecha);
  if (cache.has(isoDate)) return cache.get(isoDate)!;

  const res = await axios.get<{ oficial: { value_sell: number } }>(
    `https://api.bluelytics.com.ar/v2/historical?day=${isoDate}`,
    { timeout: 5000 }
  );
  const valor = res.data.oficial.value_sell;
  cache.set(isoDate, valor);
  return valor;
}

export async function obtenerCotizacion(fecha: string): Promise<number> {
  try {
    if (esHoy(fecha)) return await cotizacionActual();
    return await cotizacionHistorica(fecha);
  } catch {
    try {
      return await cotizacionActual();
    } catch {
      return cache.size > 0 ? [...cache.values()].at(-1)! : 0;
    }
  }
}
