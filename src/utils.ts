export function validarFecha(texto: string): { ok: boolean; error?: string } {
  const match = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return { ok: false, error: "Formato inválido. Usá DD/MM/YYYY, por ejemplo: 15/04/2026" };
  const d = Number(match[1]);
  const m = Number(match[2]);
  const a = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, error: "Fecha inválida. Revisá el día y el mes." };
  const fecha = new Date(a, m - 1, d);
  if (fecha.getFullYear() !== a || fecha.getMonth() !== m - 1 || fecha.getDate() !== d)
    return { ok: false, error: "Fecha inválida. Revisá el día y el mes." };
  if (fecha > new Date()) return { ok: false, error: "No podés ingresar una fecha futura." };
  return { ok: true };
}

export function validarMonto(texto: string): { ok: boolean; monto?: number; error?: string } {
  const monto = parseFloat(texto.replace(/\./g, "").replace(",", "."));
  if (isNaN(monto)) return { ok: false, error: "Formato inválido. Ingresá solo el monto numérico, por ejemplo: 8500" };
  if (monto < 0) return { ok: false, error: "El monto no puede ser negativo." };
  if (monto === 0) return { ok: false, error: "El monto debe ser mayor a 0." };
  return { ok: true, monto };
}

export function ahora(): string {
  return new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

export function nombreTelegram(
  from: { first_name?: string; last_name?: string; username?: string } | undefined
): string {
  if (!from) return "desconocido";
  if (from.username) return `@${from.username}`;
  return [from.first_name, from.last_name].filter(Boolean).join(" ") || "desconocido";
}
