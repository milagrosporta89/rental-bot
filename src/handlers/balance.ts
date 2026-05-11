import { Bot, Context, InlineKeyboard } from "grammy";
import { registrarSaldoReal, obtenerSaldos } from "../services/sheets";
import { TITULARES } from "../config";
import { EstadoConversacion, Titular } from "../types";

const estados = new Map<number, EstadoConversacion>();

const DIAS_ALERTA = 5; // Alertar si el último reporte tiene más de N días

export function registrarHandlersBalance(bot: Bot<Context>) {

  // /reportarsaldo — titular informa saldo real de su cuenta
  bot.command("reportarsaldo", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    estados.set(userId, { paso: "reportar_quien", datos: {} });

    const teclado = new InlineKeyboard();
    // Solo titulares con cuenta bancaria (no Fernando)
    (["Francisco", "Milagros", "Inés"] as Titular[]).forEach((t) =>
      teclado.text(t, `saldo_titular_${t}`).row()
    );

    await ctx.reply("¿Qué cuenta estás reportando?", { reply_markup: teclado });
  });

  (["Francisco", "Milagros", "Inés"] as Titular[]).forEach((titular) => {
    bot.callbackQuery(`saldo_titular_${titular}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;
      const estado = estados.get(userId);
      if (!estado) return;

      estado.datos.titular = titular;
      estado.paso = "reportar_monto";
      estados.set(userId, estado);

      await ctx.reply(
        `Cuenta: *${titular}*\n\n¿Cuál es el saldo actual según tu app del banco?`,
        { parse_mode: "Markdown" }
      );
    });
  });

  // /saldo — Fernando consulta todos los saldos
  bot.command("saldo", async (ctx) => {
    await ctx.reply("Consultando saldos...");

    try {
      const { reales, calculados } = await obtenerSaldos();
      const titulares: Titular[] = ["Francisco", "Milagros", "Inés"];
      const hoy = new Date();

      let mensaje = "*SALDOS DE CUENTAS*\n\n";

      for (const titular of titulares) {
        const real = reales[titular];
        const calculado = calculados[titular] ?? 0;

        let lineaReal = "Sin reporte";
        let alerta = "";

        if (real) {
          const fechaReporte = parsearFecha(real.fecha);
          const diasDesde = Math.floor(
            (hoy.getTime() - fechaReporte.getTime()) / (1000 * 60 * 60 * 24)
          );
          lineaReal = `$${real.monto.toLocaleString("es-AR")}`;
          alerta = diasDesde >= DIAS_ALERTA ? ` ⚠️ (hace ${diasDesde}d)` : ` (hace ${diasDesde}d)`;
        }

        mensaje +=
          `*${titular}*\n` +
          `  Real: ${lineaReal}${alerta}\n` +
          `  Calc: ~$${calculado.toLocaleString("es-AR")}\n\n`;
      }

      // Efectivo Fernando
      const efectivoFernando = calculados["Fernando"] ?? 0;
      mensaje += `*Efectivo Fernando*\n  ~$${efectivoFernando.toLocaleString("es-AR")}`;

      await ctx.reply(mensaje, { parse_mode: "Markdown" });
    } catch (error) {
      await ctx.reply("Error consultando los saldos. Intentá de nuevo.");
    }
  });

  // Captura del monto de reporte (reutiliza flujo de texto)
  bot.on("message:text", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) { await next(); return; }
    const estado = estados.get(userId);
    if (!estado || estado.paso !== "reportar_monto") { await next(); return; }

    const texto = ctx.message.text.trim().replace(/\./g, "").replace(",", ".");
    const monto = parseFloat(texto);

    if (isNaN(monto) || monto < 0) {
      await ctx.reply("Por favor ingresá solo el monto. Ejemplo: 847000");
      return;
    }

    const hoy = new Date().toLocaleDateString("es-AR");

    await registrarSaldoReal({
      fecha: hoy,
      titular: estado.datos.titular as Titular,
      monto,
    });

    estados.delete(userId);

    await ctx.reply(
      `✅ *Saldo registrado*\n${estado.datos.titular} · $${monto.toLocaleString("es-AR")} · ${hoy}`,
      { parse_mode: "Markdown" }
    );
  });
}

function parsearFecha(fechaStr: string): Date {
  const [dia, mes, anio] = fechaStr.split("/").map(Number);
  return new Date(anio, mes - 1, dia);
}
