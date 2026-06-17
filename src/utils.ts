import { WaCtx, MENU_BOTONES } from "./types";

// Palabras que siempre sacan del flujo activo (con o sin estado previo)
const PALABRAS_ESCAPE = new Set(["cancelar", "salir", "menu", "menú", "volver", "inicio", "start"]);
// Palabras que inician un flujo distinto: solo interrumpen si hay estado activo
const PALABRAS_COMANDO = new Set(["saldo", "reserva", "gasto", "ingreso"]);

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Detecta si el usuario quiere escapar del flujo actual (palabras clave o comando nuevo).
 * Si aplica: llama `onEscape()`, avisa y muestra el menú. Devuelve true → el handler debe retornar.
 * Seguro de llamar aunque no haya estado activo (simplemente muestra el menú).
 */
export async function intentarEscape(
  ctx: WaCtx,
  tieneEstadoActivo: boolean,
  onEscape: () => void
): Promise<boolean> {
  const n = normalizar(ctx.text ?? "");
  const esEscape = PALABRAS_ESCAPE.has(n);
  const esComando = tieneEstadoActivo && PALABRAS_COMANDO.has(n);

  if (!esEscape && !esComando) return false;

  if (tieneEstadoActivo) {
    onEscape();
    await ctx.reply("Operación cancelada. ¿En qué te ayudo?");
  } else {
    await ctx.reply("¿En qué te ayudo?");
  }
  await ctx.replyButtons("Menú principal", MENU_BOTONES);
  return true;
}

export function validarFecha(
  texto: string,
  { autoYear = true, permitirFutura = false } = {}
): { ok: boolean; fecha?: string; error?: string } {
  const normalizado = texto.trim().replace(/-/g, "/");
  const sinAnio = autoYear ? normalizado.match(/^(\d{1,2})\/(\d{1,2})$/) : null;
  const entrada = sinAnio
    ? `${sinAnio[1]}/${sinAnio[2]}/${new Date().getFullYear()}`
    : normalizado;
  const match = entrada.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return { ok: false, error: "Formato inválido. Ejemplo: 15/06 o 15/06/2026" };
  const d = Number(match[1]);
  const m = Number(match[2]);
  const anioRaw = Number(match[3]);
  const a = anioRaw < 100 ? 2000 + anioRaw : anioRaw;
  if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, error: "Fecha inválida. Revisá el día y el mes." };
  let anio = a;
  let fecha = new Date(anio, m - 1, d);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== m - 1 || fecha.getDate() !== d)
    return { ok: false, error: "Fecha inválida. Revisá el día y el mes." };
  // Si el año fue auto-asignado y la fecha queda en el futuro, retrocedemos un año (ej: 15/12 en enero)
  if (sinAnio && fecha > new Date()) {
    anio -= 1;
    fecha = new Date(anio, m - 1, d);
  }
  if (!permitirFutura && fecha > new Date()) return { ok: false, error: "No podés ingresar una fecha futura." };
  const fechaStr = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${anio}`;
  return { ok: true, fecha: fechaStr };
}

export function validarMonto(texto: string): { ok: boolean; monto?: number; error?: string } {
  if (!/^[\d.,]+$/.test(texto.trim())) return { ok: false, error: "Formato inválido. Ingresá solo el monto numérico, por ejemplo: 8500" };
  const monto = parseFloat(texto.replace(/\./g, "").replace(",", "."));
  if (isNaN(monto)) return { ok: false, error: "Formato inválido. Ingresá solo el monto numérico, por ejemplo: 8500" };
  if (monto < 0) return { ok: false, error: "El monto no puede ser negativo." };
  if (monto === 0) return { ok: false, error: "El monto debe ser mayor a 0." };
  return { ok: true, monto };
}

export function generarId(prefix: "ING" | "GAS"): string {
  return `${prefix}-${Date.now()}`;
}

export function ahora(): string {
  return new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

export function fechaHoy(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function nombreWa(name: string, phone: string): string {
  return name && name !== phone ? name : phone;
}
