export function validarFecha(texto: string): { ok: boolean; fecha?: string; error?: string } {
  const match = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return { ok: false, error: "Formato inválido. Ejemplo: 1/4/26 o 15/04/2026" };
  const d = Number(match[1]);
  const m = Number(match[2]);
  const anioRaw = Number(match[3]);
  const a = anioRaw < 100 ? 2000 + anioRaw : anioRaw;
  if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, error: "Fecha inválida. Revisá el día y el mes." };
  const fecha = new Date(a, m - 1, d);
  if (fecha.getFullYear() !== a || fecha.getMonth() !== m - 1 || fecha.getDate() !== d)
    return { ok: false, error: "Fecha inválida. Revisá el día y el mes." };
  if (fecha > new Date()) return { ok: false, error: "No podés ingresar una fecha futura." };
  const fechaStr = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
  return { ok: true, fecha: fechaStr };
}

export function validarMonto(texto: string): { ok: boolean; monto?: number; error?: string } {
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

export function nombreWa(name: string, phone: string): string {
  return name && name !== phone ? name : phone;
}

export function nombreTelegram(
  from: { first_name?: string; last_name?: string; username?: string } | undefined
): string {
  if (!from) return "desconocido";
  if (from.username) return `@${from.username}`;
  return [from.first_name, from.last_name].filter(Boolean).join(" ") || "desconocido";
}
