import axios from "axios";

let cache: { valor: number; fecha: string } | null = null;

export async function obtenerCotizacionOficial(): Promise<number> {
  const hoy = new Date().toISOString().slice(0, 10);

  if (cache && cache.fecha === hoy) return cache.valor;

  try {
    const res = await axios.get<{ venta: number }>(
      "https://api.dolarapi.com/v1/dolares/oficial",
      { timeout: 5000 }
    );
    const valor = res.data.venta;
    cache = { valor, fecha: hoy };
    return valor;
  } catch {
    // Si falla la API, devuelve el último valor cacheado o 0
    return cache?.valor ?? 0;
  }
}
