import { obtenerResumenComision } from "../services/sheets";
import { WaCtx } from "../types";

const MESES: Record<string, string> = {
  "01": "enero", "02": "febrero", "03": "marzo", "04": "abril",
  "05": "mayo", "06": "junio", "07": "julio", "08": "agosto",
  "09": "septiembre", "10": "octubre", "11": "noviembre", "12": "diciembre",
};

function fmtMes(key: string): string {
  const [anio, mes] = key.split("-");
  return `${MESES[mes] ?? mes} ${anio}`;
}

export async function onComisionCommand(ctx: WaCtx): Promise<void> {
  await ctx.reply("Consultando...");
  try {
    const { mesBase, baseIngresos, comisionTotal, cobrado, pendiente } = await obtenerResumenComision();

    const estado = pendiente <= 0
      ? `✅ Al día${pendiente < 0 ? ` (crédito $${Math.abs(pendiente).toLocaleString("es-AR")})` : ""}`
      : `⏳ Pendiente: $${pendiente.toLocaleString("es-AR")}`;

    await ctx.reply(
      `*Comisión de Paola*\n\n` +
      `Base (${fmtMes(mesBase)}): $${baseIngresos.toLocaleString("es-AR")}\n` +
      `Comisión (20%): $${comisionTotal.toLocaleString("es-AR")}\n` +
      `Cobrado: $${cobrado.toLocaleString("es-AR")}\n\n` +
      estado
    );
  } catch {
    await ctx.reply("Error consultando. Intentá de nuevo.");
  }
}
