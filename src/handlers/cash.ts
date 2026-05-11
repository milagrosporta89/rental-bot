import { Bot, Context, InlineKeyboard } from "grammy";
import { registrarIngreso, registrarGasto } from "../services/sheets";
import { CASAS, TITULARES } from "../config";
import { Casa, CategoriaGasto, EstadoConversacion, Titular } from "../types";
import { validarFecha, validarMonto, nombreTelegram, ahora } from "../utils";
import { obtenerCotizacionOficial } from "../services/dolar";

const estados = new Map<number, EstadoConversacion>();

const CATEGORIAS_GASTO: CategoriaGasto[] = [
  "limpieza", "jardinero", "lavanderia", "expensas",
  "luz", "gas", "mantenimiento", "otro",
];

function hoyAR(): string {
  return new Date().toLocaleDateString("es-AR");
}


async function pedirMoneda(ctx: Context) {
  await ctx.reply(
    "¿En qué moneda fue el pago?",
    {
      reply_markup: new InlineKeyboard()
        .text("🇦🇷 Pesos (ARS)", "cash_ing_moneda_ARS")
        .text("🇺🇸 Dólares (USD)", "cash_ing_moneda_USD"),
    }
  );
}

async function pedirMonedaGasto(ctx: Context) {
  await ctx.reply(
    "¿En qué moneda fue el pago?",
    {
      reply_markup: new InlineKeyboard()
        .text("🇦🇷 Pesos (ARS)", "cash_gasto_moneda_ARS")
        .text("🇺🇸 Dólares (USD)", "cash_gasto_moneda_USD"),
    }
  );
}

async function pedirFecha(ctx: Context, callbackHoy: string) {
  await ctx.reply(
    "¿Cuál es la fecha del pago?\nEscribí en formato *DD/MM/YYYY* o usá el botón.",
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text(`📅 Hoy (${hoyAR()})`, callbackHoy),
    }
  );
}

export function registrarHandlersCash(bot: Bot<Context>) {

  // ── /ingreso ──

  bot.command("ingreso", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    estados.set(userId, { paso: "tipo", datos: {} });
    await ctx.reply(
      "¿Cómo fue el ingreso?",
      {
        reply_markup: new InlineKeyboard()
          .text("💵 Efectivo", "cash_ing_efectivo")
          .text("📷 Transferencia (foto)", "cash_ing_foto"),
      }
    );
  });

  bot.callbackQuery("cash_ing_foto", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Enviá la foto del comprobante y lo proceso automáticamente.");
    const userId = ctx.from.id;
    estados.delete(userId);
  });

  bot.callbackQuery("cash_ing_efectivo", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;
    estado.paso = "ingreso_casa";
    estado.datos = { tipo: "efectivo" as const };
    estados.set(userId, estado);
    const teclado = new InlineKeyboard();
    CASAS.forEach((casa) => teclado.text(casa, `cash_ing_casa_${casa}`).row());
    await ctx.reply("¿A qué casa corresponde el ingreso?", { reply_markup: teclado });
  });

  CASAS.forEach((casa) => {
    bot.callbackQuery(`cash_ing_casa_${casa}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;
      const estado = estados.get(userId);
      if (!estado) return;
      estado.datos.casa = casa as Casa;
      estado.paso = "ingreso_quien_pago";
      estados.set(userId, estado);
      await ctx.reply(`Casa: *${casa}*\n\n¿Quién realizó el pago? Escribí el nombre.`, {
        parse_mode: "Markdown",
      });
    });
  });

  bot.callbackQuery("cash_ing_fecha_hoy", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;
    estado.datos.fecha = hoyAR();
    estado.paso = "ingreso_moneda";
    estados.set(userId, estado);
    await pedirMoneda(ctx);
  });

  bot.callbackQuery("cash_ing_moneda_ARS", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;
    estado.datos.moneda = "ARS";
    estado.paso = "ingreso_monto";
    estados.set(userId, estado);
    await ctx.reply("¿Cuánto fue el monto en efectivo?");
  });

  bot.callbackQuery("cash_ing_moneda_USD", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;
    estado.datos.moneda = "USD";
    estado.paso = "ingreso_monto";
    estados.set(userId, estado);
    await ctx.reply("¿Cuánto fue el monto en dólares?");
  });

  // ── /gasto ──

  bot.command("gasto", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    estados.set(userId, { paso: "tipo", datos: {} });
    await ctx.reply(
      "¿Cómo fue el gasto?",
      {
        reply_markup: new InlineKeyboard()
          .text("💵 Efectivo", "cash_gasto_efectivo")
          .text("📷 Transferencia (foto)", "cash_gasto_foto"),
      }
    );
  });

  bot.callbackQuery("cash_gasto_foto", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Enviá la foto del comprobante y lo proceso automáticamente.");
    const userId = ctx.from.id;
    estados.delete(userId);
  });

  bot.callbackQuery("cash_gasto_efectivo", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;
    estado.paso = "gasto_categoria";
    estado.datos = {};
    estados.set(userId, estado);
    const teclado = new InlineKeyboard();
    CATEGORIAS_GASTO.forEach((cat) =>
      teclado.text(cat.charAt(0).toUpperCase() + cat.slice(1), `cash_gasto_cat_${cat}`).row()
    );
    await ctx.reply("¿Qué tipo de gasto es?", { reply_markup: teclado });
  });

  CATEGORIAS_GASTO.forEach((cat) => {
    bot.callbackQuery(`cash_gasto_cat_${cat}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;
      const estado = estados.get(userId);
      if (!estado) return;
      estado.datos.categoria = cat as CategoriaGasto;

      if (cat === "otro") {
        estado.paso = "gasto_categoria_personalizada";
        estados.set(userId, estado);
        await ctx.reply("¿Cómo querés llamar a esta categoría? (ej: seguro, honorarios, etc.)");
        return;
      }

      estado.paso = "gasto_quien";
      estados.set(userId, estado);
      const teclado = new InlineKeyboard();
      TITULARES.forEach((t) => teclado.text(t, `cash_gasto_quien_${t}`).row());
      await ctx.reply("¿Quién pagó?", { reply_markup: teclado });
    });
  });

  TITULARES.forEach((titular) => {
    bot.callbackQuery(`cash_gasto_quien_${titular}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;
      const estado = estados.get(userId);
      if (!estado) return;
      estado.datos.pagadoPor = titular as Titular;
      estado.paso = "gasto_fecha";
      estados.set(userId, estado);
      await pedirFecha(ctx, "cash_gasto_fecha_hoy");
    });
  });

  bot.callbackQuery("cash_gasto_fecha_hoy", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;
    estado.datos.fecha = hoyAR();
    estado.paso = "gasto_moneda";
    estados.set(userId, estado);
    await pedirMonedaGasto(ctx);
  });

  bot.callbackQuery("cash_gasto_moneda_ARS", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;
    estado.datos.moneda = "ARS";
    estado.paso = "gasto_monto";
    estados.set(userId, estado);
    await ctx.reply(
      `Categoría: *${estado.datos.categoria}* · Pagó: *${estado.datos.pagadoPor}*\n\n¿Cuánto fue el monto?`,
      { parse_mode: "Markdown" }
    );
  });

  bot.callbackQuery("cash_gasto_moneda_USD", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;
    estado.datos.moneda = "USD";
    estado.paso = "gasto_monto";
    estados.set(userId, estado);
    await ctx.reply(
      `Categoría: *${estado.datos.categoria}* · Pagó: *${estado.datos.pagadoPor}*\n\n¿Cuánto fue el monto en dólares?`,
      { parse_mode: "Markdown" }
    );
  });

  // ── CAPTURA DE TEXTO ──

  const PASOS_TEXTO = new Set([
    "ingreso_quien_pago", "ingreso_fecha", "ingreso_monto",
    "gasto_fecha", "gasto_monto", "gasto_categoria_personalizada",
  ]);

  bot.on("message:text", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) { await next(); return; }
    const estado = estados.get(userId);
    if (!estado || !PASOS_TEXTO.has(estado.paso)) { await next(); return; }

    const texto = ctx.message.text.trim();

    if (estado.paso === "ingreso_quien_pago") {
      estado.datos.quienPago = texto;
      estado.paso = "ingreso_fecha";
      estados.set(userId, estado);
      await pedirFecha(ctx, "cash_ing_fecha_hoy");
      return;
    }

    if (estado.paso === "ingreso_fecha") {
      const v = validarFecha(texto);
      if (!v.ok) {
        await ctx.reply(v.error!);
        return;
      }
      estado.datos.fecha = texto.trim();
      estado.paso = "ingreso_moneda";
      estados.set(userId, estado);
      await pedirMoneda(ctx);
      return;
    }

    if (estado.paso === "gasto_categoria_personalizada") {
      if (!texto) {
        await ctx.reply("Escribí una categoría para el gasto.");
        return;
      }
      estado.datos.notas = texto;
      estado.paso = "gasto_quien";
      estados.set(userId, estado);
      const teclado = new InlineKeyboard();
      TITULARES.forEach((t) => teclado.text(t, `cash_gasto_quien_${t}`).row());
      await ctx.reply("¿Quién pagó?", { reply_markup: teclado });
      return;
    }

    if (estado.paso === "gasto_fecha") {
      const v = validarFecha(texto);
      if (!v.ok) {
        await ctx.reply(v.error!);
        return;
      }
      estado.datos.fecha = texto.trim();
      estado.paso = "gasto_moneda";
      estados.set(userId, estado);
      await pedirMonedaGasto(ctx);
      return;
    }

    const vm = validarMonto(texto);
    if (!vm.ok) {
      await ctx.reply(vm.error!);
      return;
    }
    const monto = vm.monto!;

    if (estado.paso === "ingreso_monto" && estado.datos.casa && estado.datos.fecha && estado.datos.moneda) {
      const moneda = estado.datos.moneda as "ARS" | "USD";
      const simbolo = moneda === "USD" ? "U$D" : "$";
      await registrarIngreso({
        fecha: estado.datos.fecha,
        casa: estado.datos.casa as Casa,
        monto,
        moneda,
        tipo: "efectivo",
        quienPago: estado.datos.quienPago ?? "Desconocido",
        nombreDestinatario: nombreTelegram(ctx.from),
        bancoOrigen: "Efectivo",
        nroOperacion: "",
        notas: "",
        registradoPor: nombreTelegram(ctx.from),
        comprobanteUrl: "",
        timestamp: ahora(),
        cotizacion: await obtenerCotizacionOficial(),
      });
      estados.delete(userId);
      await ctx.reply(
        `✅ *Ingreso registrado*\nEfectivo · ${estado.datos.casa} · ${simbolo}${monto.toLocaleString("es-AR")}\nFecha: ${estado.datos.fecha} · Pagó: ${estado.datos.quienPago}`,
        { parse_mode: "Markdown" }
      );
    } else if (estado.paso === "gasto_monto" && estado.datos.categoria && estado.datos.pagadoPor && estado.datos.fecha && estado.datos.moneda) {
      const moneda = estado.datos.moneda as "ARS" | "USD";
      const simbolo = moneda === "USD" ? "U$D" : "$";
      const categoriaFinal = (estado.datos.categoria === "otro" && estado.datos.notas)
        ? estado.datos.notas
        : estado.datos.categoria;
      await registrarGasto({
        fecha: estado.datos.fecha,
        monto,
        moneda,
        categoria: categoriaFinal,
        pagadoPor: estado.datos.pagadoPor as Titular,
        nombreDestinatario: "",
        bancoOrigen: "Efectivo",
        nroOperacion: "",
        notas: "",
        registradoPor: nombreTelegram(ctx.from),
        comprobanteUrl: "",
        timestamp: ahora(),
        cotizacion: await obtenerCotizacionOficial(),
      });
      estados.delete(userId);
      await ctx.reply(
        `✅ *Gasto registrado*\n${categoriaFinal} · ${estado.datos.pagadoPor} · ${simbolo}${monto.toLocaleString("es-AR")}\nFecha: ${estado.datos.fecha}`,
        { parse_mode: "Markdown" }
      );
    }
  });
}
