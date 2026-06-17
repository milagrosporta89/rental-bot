import { obtenerBalancePaola } from "../services/sheets";
import { WaCtx, MENU_BOTONES } from "../types";

export async function onComisionCommand(ctx: WaCtx): Promise<void> {
  await ctx.reply("Consultando...");
  try {
    const { totalCobrado, totalGastado, balance, cobradoMes, gastadoMes } = await obtenerBalancePaola();

    const estadoBalance = balance >= 0
      ? `✅ A favor de Paola: $${balance.toLocaleString("es-AR")}`
      : `⚠️ El negocio le debe: $${Math.abs(balance).toLocaleString("es-AR")}`;

    await ctx.reply(
      `*Saldo de Paola*\n\n` +
      `📅 *ESTE MES*\n` +
      `Cobrado: $${cobradoMes.toLocaleString("es-AR")}\n` +
      `Gastado: $${gastadoMes.toLocaleString("es-AR")}\n` +
      `Neto: $${(cobradoMes - gastadoMes).toLocaleString("es-AR")}\n\n` +
      `📊 *HISTÓRICO*\n` +
      `Total cobrado: $${totalCobrado.toLocaleString("es-AR")}\n` +
      `Total gastado: $${totalGastado.toLocaleString("es-AR")}\n` +
      `${estadoBalance}`
    );
    await ctx.replyButtons("¿Qué más querés hacer?", MENU_BOTONES);
  } catch {
    await ctx.reply("Error consultando. Intentá de nuevo.");
    await ctx.replyButtons("¿Qué más querés hacer?", MENU_BOTONES);
  }
}
