import { DatosComprobante, Titular, WaCtx } from "../types";
import { NOMBRES_TITULARES } from "../config";

// ── Formateo ───────────────────────────────────────────────────────────────

export function formatearResumenComprobante(d: Partial<DatosComprobante>): string {
  return (
    `*Datos del comprobante:*\n\n` +
    `Fecha: ${d.fecha ?? "-"}\n` +
    `Monto: $${(d.monto ?? 0).toLocaleString("es-AR")}\n` +
    `De: ${d.nombreOrdenante ?? "-"}\n` +
    `Para: ${d.nombreDestinatario ?? "-"}\n` +
    `Banco origen: ${d.bancoOrigen ?? "-"}\n` +
    `Nro. operación: ${d.nroOperacion ?? "-"}`
  );
}

// ── Titular ────────────────────────────────────────────────────────────────

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export function detectarTitular(nombre: string): Titular | null {
  const norm = normalizar(nombre);
  for (const titular of Object.keys(NOMBRES_TITULARES) as Titular[]) {
    if (NOMBRES_TITULARES[titular].some((n) => norm.includes(n))) return titular;
  }
  return null;
}

// ── Flujo de corrección de comprobante ────────────────────────────────────
// Permite corregir fecha y destinatario antes de confirmar.
// Retorna true si el paso fue manejado (el handler debe retornar).

export interface EstadoConCorreccion {
  paso: string;
  datos: Record<string, unknown>;
  corregido?: boolean;
}

export async function manejarCorreccion<T extends EstadoConCorreccion>(
  ctx: WaCtx,
  texto: string,
  estado: T,
  onConfirmado: (estado: T) => Promise<void>
): Promise<boolean> {
  if (estado.paso !== "corrigiendo") return false;

  const lower = texto.toLowerCase();

  if (lower.startsWith("fecha ")) {
    const raw = texto.slice(6).trim();
    // Acepta DD/MM/YYYY o DD/MM/YY
    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
    if (!m) {
      await ctx.reply("Formato inválido. Ejemplo: fecha 15/06/2026");
      return true;
    }
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    const rawY = m[3] ? parseInt(m[3]) : new Date().getFullYear();
    const anio = rawY < 100 ? 2000 + rawY : rawY;
    estado.datos.fecha = `${d}/${mo}/${anio}`;
    await ctx.reply(`✓ Fecha actualizada: ${estado.datos.fecha}\n\nOtro campo o escribí *confirmar*`);
    return true;
  }

  if (lower.startsWith("destinatario ")) {
    estado.datos.nombreDestinatario = texto.slice(13).trim();
    await ctx.reply(`✓ Destinatario actualizado\n\nOtro campo o escribí *confirmar*`);
    return true;
  }

  if (lower === "confirmar") {
    estado.corregido = true;
    await onConfirmado(estado);
    return true;
  }

  await ctx.reply(
    "No reconocí ese campo. Podés escribir:\n\n" +
    "*fecha* 15/06/2026\n" +
    "*destinatario* Nombre Apellido\n\n" +
    "O escribí *confirmar* para terminar."
  );
  return true;
}
