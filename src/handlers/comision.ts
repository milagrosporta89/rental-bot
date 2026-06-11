import { obtenerResumenComision } from "../services/sheets";
import { WaCtx, MENU_BOTONES } from "../types";

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
    const {
      mesBase, baseIngresos, comisionMes,
      cobradosMes, gastosMes, netMes, pendienteMes,
      totalComisionFormal, totalCobrosDirectos, totalGastosHistorico, superavit,
    } = await obtenerResumenComision();

    const estadoMes = pendienteMes <= 0
      ? `✅ Al día${pendienteMes < 0 ? ` (crédito $${Math.abs(pendienteMes).toLocaleString("es-AR")})` : ""}`
      : `⏳ Pendiente: $${pendienteMes.toLocaleString("es-AR")}`;

    const estadoSuperavit = superavit >= 0
      ? `✅ A favor de Paola: $${superavit.toLocaleString("es-AR")}`
      : `⏳ Debe al negocio: $${Math.abs(superavit).toLocaleString("es-AR")}`;

    await ctx.reply(
      `*Comisión de Paola*\n\n` +
      `📅 *ESTE MES*\n` +
      `Base (${fmtMes(mesBase)}): $${baseIngresos.toLocaleString("es-AR")}\n` +
      `Comisión (15%): $${comisionMes.toLocaleString("es-AR")}\n` +
      `Cobros: +$${cobradosMes.toLocaleString("es-AR")}\n` +
      `Gastos: -$${gastosMes.toLocaleString("es-AR")}\n` +
      `Neto cobrado: $${netMes.toLocaleString("es-AR")}\n` +
      `${estadoMes}\n\n` +
      `📊 *HISTÓRICO*\n` +
      `Comisiones formales liquidadas: $${totalComisionFormal.toLocaleString("es-AR")}\n` +
      `Cobros directos de huéspedes: $${totalCobrosDirectos.toLocaleString("es-AR")}\n` +
      `Gastos pagados por Paola: -$${totalGastosHistorico.toLocaleString("es-AR")}\n` +
      `${estadoSuperavit}`
    );
    await ctx.replyButtons("¿Qué más querés hacer?", MENU_BOTONES);
  } catch {
    await ctx.reply("Error consultando. Intentá de nuevo.");
    await ctx.replyButtons("¿Qué más querés hacer?", MENU_BOTONES);
  }
}
