import "dotenv/config";
import { Bot } from "grammy";
import { config } from "./config";
import { registrarHandlersIngreso } from "./handlers/income";
import { registrarHandlersCash } from "./handlers/cash";
import { registrarHandlersBalance } from "./handlers/balance";

const bot = new Bot(config.telegramToken);

// Comando de bienvenida
bot.command("start", async (ctx) => {
  await ctx.reply(
    "*Bienvenido al bot de alquileres* 🏠\n\n" +
    "Comandos disponibles:\n\n" +
    "📸 *Foto* — Reenviá un comprobante (detecta ingreso o gasto solo)\n" +
    "/ingreso — Registrar un ingreso (efectivo o foto)\n" +
    "/gasto — Registrar un gasto (efectivo o foto)\n" +
    "/reportarsaldo — Informar saldo real de tu cuenta\n" +
    "/saldo — Ver saldos de todas las cuentas\n",
    { parse_mode: "Markdown" }
  );
});

// Registrar handlers por módulo
registrarHandlersIngreso(bot);
registrarHandlersCash(bot);
registrarHandlersBalance(bot);

// Manejo de errores global
bot.catch((err) => {
  console.error("Error en el bot:", err);
});

bot.start();
console.log("Bot iniciado ✓");
