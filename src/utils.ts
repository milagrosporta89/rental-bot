import fs from "fs";
import path from "path";
import { WaCtx, MENU_BOTONES } from "./types";

// ── Estado persistente con TTL ────────────────────────────────────────────────

const TTL_MS = 4 * 60 * 60 * 1000; // 4 horas

export class EstadosPersistentes<T> {
  private readonly map = new Map<string, { ts: number; v: T }>();
  private readonly persist: boolean;

  constructor(private readonly file: string) {
    this.persist = process.env.NODE_ENV !== "test";
    if (this.persist) this.cargar();
  }

  private cargar(): void {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      const obj = JSON.parse(raw) as Record<string, { ts: number; v: T }>;
      const ahora = Date.now();
      for (const [k, entry] of Object.entries(obj)) {
        if (ahora - entry.ts <= TTL_MS) this.map.set(k, entry);
      }
    } catch { /* archivo inexistente o corrupto → empezar vacío */ }
  }

  private guardar(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.map), null, 2), "utf8");
    } catch (err) { console.error("[estados] Error guardando estado:", err); }
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > TTL_MS) { this.map.delete(key); if (this.persist) this.guardar(); return undefined; }
    return entry.v;
  }

  has(key: string): boolean { return this.get(key) !== undefined; }
  get size(): number { return this.map.size; }

  set(key: string, value: T): this {
    this.map.set(key, { ts: Date.now(), v: value });
    if (this.persist) this.guardar();
    return this;
  }

  delete(key: string): boolean {
    const result = this.map.delete(key);
    if (result && this.persist) this.guardar();
    return result;
  }
}

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

// ── Escape con confirmación ───────────────────────────────────────────────────

const _escapePendiente = new Map<string, () => void>();

export function esEscapePalabra(texto: string): boolean {
  return PALABRAS_ESCAPE.has(normalizar(texto));
}

export async function pedirConfirmacionEscape(ctx: WaCtx, onAbandonar: () => void): Promise<void> {
  _escapePendiente.set(ctx.from.id, onAbandonar);
  await ctx.replyButtons(
    "¿Querés abandonar la carga?",
    [
      { id: "escape_abandonar_si", title: "Sí, abandonar" },
      { id: "escape_abandonar_no", title: "No, continuar" },
    ]
  );
}

export async function onCallbackEscape(ctx: WaCtx, buttonId: string): Promise<boolean> {
  if (buttonId !== "escape_abandonar_si" && buttonId !== "escape_abandonar_no") return false;
  const cb = _escapePendiente.get(ctx.from.id);
  if (!cb) return false;
  _escapePendiente.delete(ctx.from.id);
  if (buttonId === "escape_abandonar_si") {
    cb();
    await ctx.replyButtons("Carga cancelada. ¿Qué querés hacer?", MENU_BOTONES);
  } else {
    await ctx.reply("Ok, seguimos. Continuá con lo que estabas cargando 👍");
  }
  return true;
}
