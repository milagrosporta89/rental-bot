import { Bot, Context, InlineKeyboard } from "grammy";
import axios from "axios";
import { extraerDatosComprobante } from "../services/claude";
import { registrarIngreso, registrarGasto, buscarIngresoDuplicado, buscarGastoDuplicado } from "../services/sheets";
import { CASAS, config, NOMBRES_TITULARES, resolverNombre } from "../config";
import { nombreTelegram, ahora } from "../utils";
import { subirComprobante } from "../services/storage";
import { obtenerCotizacion } from "../services/dolar";
import { Casa, CategoriaGasto, DatosComprobante, EstadoConversacion, TipoIngreso, Titular } from "../types";

const estados = new Map<number, EstadoConversacion>();

const CATEGORIAS_GASTO: CategoriaGasto[] = [
  "limpieza", "jardinero", "lavanderia", "expensas",
  "luz", "gas", "mantenimiento", "otro",
];

const TIPO_LABELS: Record<string, string> = {
  deposito_reserva: "50% reserva",
  saldo_checkin: "Saldo check-in",
  transferencia: "Transferencia",
};

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}


function detectarTitular(nombre: string): Titular | null {
  const norm = normalizar(nombre);
  for (const titular of Object.keys(NOMBRES_TITULARES) as Titular[]) {
    if (NOMBRES_TITULARES[titular].some((n) => norm.includes(n))) return titular;
  }
  return null;
}

function formatearResumenComprobante(d: Partial<DatosComprobante>): string {
  return (
    `*Datos del comprobante:*\n\n` +
    `📅 Fecha: ${d.fecha ?? "-"}\n` +
    `💰 Monto: $${(d.monto ?? 0).toLocaleString("es-AR")}\n` +
    `👤 De: ${d.nombreOrdenante ?? "-"}\n` +
    `🏦 Para: ${d.nombreDestinatario ?? "-"}\n` +
    `🏛 Banco origen: ${d.bancoOrigen ?? "-"}\n` +
    `🏛 Banco destino: ${d.bancoDestino ?? "-"}\n` +
    `🔢 Nro. operación: ${d.nroOperacion ?? "-"}`
  );
}

async function procesarArchivo(
  ctx: Context,
  userId: number,
  fileId: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
) {
  await ctx.reply("Procesando el comprobante...");

  const fileInfo = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${config.telegramToken}/${fileInfo.file_path}`;
  const response = await axios.get<ArrayBuffer>(url, { responseType: "arraybuffer" });
  const base64 = Buffer.from(response.data as ArrayBuffer).toString("base64");

  const datos = await extraerDatosComprobante(base64, mediaType);

  if (!datos || datos.monto === 0) {
    await ctx.reply("No pude leer el comprobante. ¿Podés reenviar una versión más nítida?");
    return;
  }

  if (datos.nroOperacion) {
    const duplicado = await buscarIngresoDuplicado(datos.nroOperacion);
    if (duplicado) {
      await ctx.reply(
        `⚠️ *Comprobante duplicado*\n\n` +
        `El número de operación *${datos.nroOperacion}* ya fue registrado:\n\n` +
        `📅 Fecha: ${duplicado.fecha}\n` +
        `🏠 Casa: ${duplicado.casa}\n` +
        `💰 Monto: $${duplicado.monto.toLocaleString("es-AR")}\n` +
        `👤 Pagó: ${duplicado.quienPago}`,
        { parse_mode: "Markdown" }
      );
      return;
    }
  }

  // Subir comprobante a Drive en segundo plano
  const fecha = datos.fecha?.replace(/\//g, "-") ?? new Date().toLocaleDateString("es-AR").replace(/\//g, "-");
  const nombreArchivo = `comprobante_${fecha}_${datos.nroOperacion || Date.now()}`;
  const comprobanteUrl = await subirComprobante(base64, mediaType, nombreArchivo).catch((err) => {
    console.error("Error subiendo comprobante a Drive:", err?.message ?? err);
    return "";
  });

  const titularDest = detectarTitular(datos.nombreDestinatario ?? "");
  const titularOrd = detectarTitular(datos.nombreOrdenante ?? "");

  let etiqueta = "";
  if (titularDest) etiqueta = `\n\n🔍 Detecté: *ingreso* para ${titularDest}`;
  else if (titularOrd) etiqueta = `\n\n🔍 Detecté: *gasto* de ${titularOrd}`;

  estados.set(userId, { paso: "confirmar_datos", datos: { ...datos, comprobanteUrl } as any, fileId });

  await ctx.reply(
    formatearResumenComprobante(datos) + etiqueta,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("✅ Confirmar", "income_confirmar")
        .text("✏️ Corregir", "income_corregir"),
    }
  );
}

export function registrarHandlersIngreso(bot: Bot<Context>) {

  // ── FOTO ──

  bot.on("message:photo", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const foto = ctx.message.photo.at(-1)!;
    await procesarArchivo(ctx, userId, foto.file_id, "image/jpeg");
  });

  // ── PDF ──

  bot.on("message:document", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const doc = ctx.message.document;
    const mime = doc.mime_type ?? "";
    if (mime === "application/pdf") {
      await procesarArchivo(ctx, userId, doc.file_id, "application/pdf");
    } else if (["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      await procesarArchivo(ctx, userId, doc.file_id, "image/jpeg");
    }
  });

  // ── CONFIRMAR → detectar y rutear ──

  bot.callbackQuery("income_confirmar", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;

    const d = estado.datos as DatosComprobante;
    const titularDest = detectarTitular(d.nombreDestinatario ?? "");
    const titularOrd = detectarTitular(d.nombreOrdenante ?? "");

    // Si viene de una corrección, siempre preguntar explícitamente
    if (estado.corregido) {
      let sugerencia = "";
      if (titularDest) sugerencia = `\n\n🔍 Parece un *ingreso* para ${titularDest}`;
      else if (titularOrd) sugerencia = `\n\n🔍 Parece un *gasto* de ${titularOrd}`;
      await ctx.reply(
        "¿De qué se trata este comprobante?" + sugerencia,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("💰 Ingreso", "income_es_ingreso")
            .text("💸 Gasto", "income_es_gasto"),
        }
      );
      return;
    }

    if (titularDest) {
      estado.paso = "seleccionar_casa";
      estados.set(userId, estado);
      const teclado = new InlineKeyboard();
      CASAS.forEach((c) => teclado.text(c, `income_casa_${c}`).row());
      await ctx.reply("¿A qué casa corresponde?", { reply_markup: teclado });
    } else if (titularOrd) {
      estado.paso = "foto_gasto_categoria";
      estados.set(userId, estado);
      await pedirCategoria(ctx);
    } else {
      await ctx.reply(
        "No pude determinar si es un ingreso o un gasto. ¿De qué se trata?",
        {
          reply_markup: new InlineKeyboard()
            .text("💰 Ingreso", "income_es_ingreso")
            .text("💸 Gasto", "income_es_gasto"),
        }
      );
    }
  });

  bot.callbackQuery("income_es_ingreso", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;
    estado.paso = "seleccionar_casa";
    estados.set(userId, estado);
    const teclado = new InlineKeyboard();
    CASAS.forEach((c) => teclado.text(c, `income_casa_${c}`).row());
    await ctx.reply("¿A qué casa corresponde?", { reply_markup: teclado });
  });

  bot.callbackQuery("income_es_gasto", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;
    estado.paso = "foto_gasto_categoria";
    estados.set(userId, estado);
    await pedirCategoria(ctx);
  });

  // ── FLUJO GASTO VÍA FOTO ──

  CATEGORIAS_GASTO.forEach((cat) => {
    bot.callbackQuery(`photo_gasto_cat_${cat}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;
      const estado = estados.get(userId);
      if (!estado) return;

      estado.datos.categoria = cat as CategoriaGasto;

      if (cat === "otro") {
        estado.paso = "foto_gasto_categoria_personalizada";
        estados.set(userId, estado);
        await ctx.reply("¿Cómo querés llamar a esta categoría? (ej: seguro, honorarios, etc.)");
        return;
      }

      const titularOrd = detectarTitular((estado.datos as DatosComprobante).nombreOrdenante ?? "");

      if (titularOrd) {
        await registrarGastoFoto(ctx, estado, cat as CategoriaGasto, titularOrd);
        estados.delete(userId);
      } else {
        estado.paso = "foto_gasto_quien";
        estados.set(userId, estado);
        const teclado = new InlineKeyboard();
        (["Francisco", "Milagros", "Inés", "Fernando"] as Titular[]).forEach((t) =>
          teclado.text(t, `photo_gasto_quien_${t}`).row()
        );
        await ctx.reply("¿Quién realizó el pago?", { reply_markup: teclado });
      }
    });
  });

  (["Francisco", "Milagros", "Inés", "Fernando"] as Titular[]).forEach((titular) => {
    bot.callbackQuery(`photo_gasto_quien_${titular}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;
      const estado = estados.get(userId);
      if (!estado || !estado.datos.categoria) return;
      await registrarGastoFoto(ctx, estado, estado.datos.categoria as CategoriaGasto, titular);
      estados.delete(userId);
    });
  });

  // ── FLUJO INGRESO VÍA FOTO ──

  CASAS.forEach((casa) => {
    bot.callbackQuery(`income_casa_${casa}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;
      const estado = estados.get(userId);
      if (!estado) return;

      estado.datos.casa = casa as Casa;
      estado.paso = "seleccionar_tipo_pago";
      estados.set(userId, estado);

      await ctx.reply(
        `Casa: *${casa}*\n¿Qué tipo de pago es?`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("50% reserva", "income_tipo_deposito_reserva").row()
            .text("Saldo check-in", "income_tipo_saldo_checkin").row()
            .text("Otro", "income_tipo_otro"),
        }
      );
    });
  });

  // Tipo seleccionado → si la moneda ya viene del comprobante, registrar directo; si no, preguntar
  const tipos: Array<{ key: string; tipo: TipoIngreso }> = [
    { key: "deposito_reserva", tipo: "deposito_reserva" },
    { key: "saldo_checkin", tipo: "saldo_checkin" },
    { key: "transferencia", tipo: "transferencia" },
  ];

  tipos.forEach(({ key, tipo }) => {
    bot.callbackQuery(`income_tipo_${key}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;
      const estado = estados.get(userId);
      if (!estado || !estado.datos.casa) return;

      estado.datos.tipo = tipo;
      estados.set(userId, estado);

      const monedaDetectada = (estado.datos as DatosComprobante).moneda;
      if (monedaDetectada === "ARS" || monedaDetectada === "USD") {
        await confirmarIngreso(ctx, userId, estado, monedaDetectada);
        estados.delete(userId);
      } else {
        estado.paso = "seleccionar_moneda";
        estados.set(userId, estado);
        await ctx.reply(
          "¿En qué moneda fue el pago?",
          {
            reply_markup: new InlineKeyboard()
              .text("🇦🇷 Pesos (ARS)", "income_moneda_ARS")
              .text("🇺🇸 Dólares (USD)", "income_moneda_USD"),
          }
        );
      }
    });
  });

  // Moneda seleccionada manualmente → registrar ingreso
  (["ARS", "USD"] as const).forEach((moneda) => {
    bot.callbackQuery(`income_moneda_${moneda}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;
      const estado = estados.get(userId);
      if (!estado || !estado.datos.casa || !estado.datos.tipo) return;
      await confirmarIngreso(ctx, userId, estado, moneda);
      estados.delete(userId);
    });
  });

  // ── TIPO "OTRO" → pedir etiqueta personalizada ──

  bot.callbackQuery("income_tipo_otro", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado || !estado.datos.casa) return;
    estado.datos.tipo = "transferencia";
    estado.paso = "ingreso_etiqueta";
    estados.set(userId, estado);
    await ctx.reply("¿Cómo querés llamar a este tipo de pago? (ej: seña, alquiler mensual, etc.)");
  });

  // ── CAPTURA DE TEXTO PARA FLUJOS DE INCOME ──

  bot.on("message:text", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) { await next(); return; }
    const estado = estados.get(userId);
    if (!estado || (estado.paso !== "ingreso_etiqueta" && estado.paso !== "foto_gasto_categoria_personalizada")) {
      await next();
      return;
    }

    if (estado.paso === "foto_gasto_categoria_personalizada") {
      const etiqueta = ctx.message.text.trim();
      if (!etiqueta) {
        await ctx.reply("Escribí una categoría para el gasto.");
        return;
      }
      estado.datos.notas = etiqueta;
      const titularOrd = detectarTitular((estado.datos as DatosComprobante).nombreOrdenante ?? "");
      if (titularOrd) {
        await registrarGastoFoto(ctx, estado, "otro", titularOrd);
        estados.delete(userId);
      } else {
        estado.paso = "foto_gasto_quien";
        estados.set(userId, estado);
        const teclado = new InlineKeyboard();
        (["Francisco", "Milagros", "Inés", "Fernando"] as Titular[]).forEach((t) =>
          teclado.text(t, `photo_gasto_quien_${t}`).row()
        );
        await ctx.reply("¿Quién realizó el pago?", { reply_markup: teclado });
      }
      return;
    }

    const etiqueta = ctx.message.text.trim();
    if (!etiqueta) {
      await ctx.reply("Escribí una etiqueta para el tipo de pago.");
      return;
    }

    estado.datos.notas = etiqueta;
    const monedaDetectada = (estado.datos as DatosComprobante).moneda;
    if (monedaDetectada === "ARS" || monedaDetectada === "USD") {
      await confirmarIngreso(ctx, userId, estado, monedaDetectada);
      estados.delete(userId);
    } else {
      estado.paso = "seleccionar_moneda";
      estados.set(userId, estado);
      await ctx.reply(
        "¿En qué moneda fue el pago?",
        {
          reply_markup: new InlineKeyboard()
            .text("🇦🇷 Pesos (ARS)", "income_moneda_ARS")
            .text("🇺🇸 Dólares (USD)", "income_moneda_USD"),
        }
      );
    }
  });

  // ── CORRECCIÓN DE DATOS ──

  bot.callbackQuery("income_corregir", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const estado = estados.get(userId);
    if (!estado) return;
    estado.paso = "corrigiendo";
    estados.set(userId, estado);
    await ctx.reply(
      "Indicá qué campo corregir:\n\n" +
      "/fecha DD/MM/YYYY\n" +
      "/destinatario Nombre Apellido"
    );
  });

  bot.command("fecha", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const estado = estados.get(userId);
    if (!estado || estado.paso !== "corrigiendo") return;
    const texto = ctx.match.trim();
    const match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
      await ctx.reply("Formato inválido. Usá DD/MM/YYYY, por ejemplo: 15/04/2026");
      return;
    }
    const d = Number(match[1]), m = Number(match[2]), a = Number(match[3]);
    const fecha = new Date(a, m - 1, d);
    if (m < 1 || m > 12 || d < 1 || fecha.getDate() !== d) {
      await ctx.reply("Fecha inválida. Revisá el día y el mes.");
      return;
    }
    if (fecha > new Date()) {
      await ctx.reply("No podés ingresar una fecha futura.");
      return;
    }
    estado.datos.fecha = texto;
    estados.set(userId, estado);
    await ctx.reply(`Fecha: ${texto}. ¿Otro campo o /confirmar?`);
  });

  bot.command("destinatario", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const estado = estados.get(userId);
    if (!estado || estado.paso !== "corrigiendo") return;
    estado.datos.nombreDestinatario = ctx.match;
    estados.set(userId, estado);
    await ctx.reply(`Destinatario: ${ctx.match}. ¿Otro campo o /confirmar?`);
  });

  bot.command("confirmar", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const estado = estados.get(userId);
    if (!estado || estado.paso !== "corrigiendo") return;
    estado.paso = "confirmar_datos";
    estado.corregido = true;
    estados.set(userId, estado);
    await ctx.reply(
      formatearResumenComprobante(estado.datos as DatosComprobante),
      {
        reply_markup: new InlineKeyboard()
          .text("✅ Confirmar", "income_confirmar")
          .text("✏️ Seguir corrigiendo", "income_corregir"),
      }
    );
  });
}

async function pedirCategoria(ctx: Context) {
  const teclado = new InlineKeyboard();
  const cats: CategoriaGasto[] = [
    "limpieza", "jardinero", "lavanderia", "expensas",
    "luz", "gas", "mantenimiento", "otro",
  ];
  cats.forEach((cat) =>
    teclado.text(cat.charAt(0).toUpperCase() + cat.slice(1), `photo_gasto_cat_${cat}`).row()
  );
  await ctx.reply("¿A qué categoría corresponde el gasto?", { reply_markup: teclado });
}

async function confirmarIngreso(
  ctx: Context,
  userId: number,
  estado: EstadoConversacion,
  moneda: "ARS" | "USD"
) {
  const d = estado.datos as DatosComprobante & { casa: Casa; tipo: TipoIngreso; notas?: string; comprobanteUrl?: string };
  const hoy = new Date().toLocaleDateString("es-AR");
  const label = d.notas || TIPO_LABELS[d.tipo] || d.tipo;
  const simbolo = moneda === "USD" ? "U$D" : "$";

  await registrarIngreso({
    fecha: d.fecha || hoy,
    casa: d.casa,
    monto: d.monto ?? 0,
    moneda,
    tipo: d.tipo,
    quienPago: resolverNombre(d.nombreOrdenante ?? ""),
    nombreDestinatario: resolverNombre(d.nombreDestinatario ?? ""),
    bancoOrigen: d.bancoOrigen ?? "",
    nroOperacion: d.nroOperacion ?? "",
    notas: label,
    registradoPor: nombreTelegram(ctx.from),
    comprobanteUrl: d.comprobanteUrl ?? "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(d.fecha || hoy),
  });

  await ctx.reply(
    `✅ *Registrado*\n${label} · ${d.casa} · ${simbolo}${(d.monto ?? 0).toLocaleString("es-AR")}`,
    { parse_mode: "Markdown" }
  );
}

async function registrarGastoFoto(
  ctx: Context,
  estado: EstadoConversacion,
  categoria: CategoriaGasto,
  pagadoPor: Titular
) {
  const d = estado.datos as DatosComprobante & { comprobanteUrl?: string };
  const hoy = new Date().toLocaleDateString("es-AR");
  const categoriaFinal = (categoria === "otro" && estado.datos.notas) ? estado.datos.notas : categoria;

  if (d.nroOperacion) {
    const duplicado = await buscarGastoDuplicado(d.nroOperacion);
    if (duplicado) {
      await ctx.reply(
        `⚠️ *Gasto duplicado*\n\n` +
        `El número de operación *${d.nroOperacion}* ya fue registrado:\n\n` +
        `📅 Fecha: ${duplicado.fecha}\n` +
        `🏷 Categoría: ${duplicado.categoria}\n` +
        `💰 Monto: $${duplicado.monto.toLocaleString("es-AR")}\n` +
        `👤 Pagó: ${duplicado.pagadoPor}`,
        { parse_mode: "Markdown" }
      );
      return;
    }
  }

  const moneda = d.moneda ?? "ARS";
  const simbolo = moneda === "USD" ? "U$D" : "$";

  await registrarGasto({
    fecha: d.fecha || hoy,
    monto: d.monto ?? 0,
    moneda,
    categoria: categoriaFinal,
    pagadoPor: resolverNombre(pagadoPor) as Titular,
    nombreDestinatario: resolverNombre(d.nombreDestinatario ?? ""),
    bancoOrigen: d.bancoOrigen ?? "",
    nroOperacion: d.nroOperacion ?? "",
    notas: "",
    registradoPor: nombreTelegram(ctx.from),
    comprobanteUrl: d.comprobanteUrl ?? "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(d.fecha || hoy),
  });

  await ctx.reply(
    `✅ *Gasto registrado*\n${categoriaFinal} · ${resolverNombre(pagadoPor)} · ${simbolo}${(d.monto ?? 0).toLocaleString("es-AR")}`,
    { parse_mode: "Markdown" }
  );
}
