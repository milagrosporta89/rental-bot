import { extraerDatosComprobante } from "../services/claude";
import { registrarIngreso, registrarGasto, buscarIngresoDuplicado, buscarGastoDuplicado } from "../services/sheets";
import { CASAS, NOMBRES_TITULARES, resolverNombre } from "../config";
import { nombreWa, ahora } from "../utils";
import { subirComprobante } from "../services/storage";
import { obtenerCotizacion } from "../services/dolar";
import { downloadMedia } from "../services/whatsapp";
import { Casa, CategoriaGasto, DatosComprobante, EstadoConversacion, TipoIngreso, Titular, WaCtx } from "../types";

const estados = new Map<string, EstadoConversacion>();

const CATEGORIAS_GASTO: CategoriaGasto[] = [
  "limpieza", "jardinero", "lavanderia", "expensas",
  "luz", "gas", "mantenimiento", "otro",
];

const TIPO_LABELS: Record<string, string> = {
  deposito_reserva: "Seña 30%",
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

function formatearResumen(d: Partial<DatosComprobante>): string {
  return (
    `*Datos del comprobante:*\n\n` +
    `Fecha: ${d.fecha ?? "-"}\n` +
    `Monto: $${(d.monto ?? 0).toLocaleString("es-AR")}\n` +
    `De: ${d.nombreOrdenante ?? "-"}\n` +
    `Para: ${d.nombreDestinatario ?? "-"}\n` +
    `Banco origen: ${d.bancoOrigen ?? "-"}\n` +
    `Nro. operación: ${d.nroOperacion ?? "-"}`
  );
}

export async function onPhoto(
  ctx: WaCtx,
  mediaId: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
): Promise<void> {
  await ctx.reply("Procesando el comprobante...");

  const { base64 } = await downloadMedia(mediaId);
  const datos = await extraerDatosComprobante(base64, mimeType);

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
        `Fecha: ${duplicado.fecha}\n` +
        `Casa: ${duplicado.casa}\n` +
        `Monto: $${duplicado.monto.toLocaleString("es-AR")}\n` +
        `Pagó: ${duplicado.quienPago}`
      );
      return;
    }
  }

  const fecha = datos.fecha?.replace(/\//g, "-") ?? new Date().toLocaleDateString("es-AR").replace(/\//g, "-");
  const nombreArchivo = `comprobante_${fecha}_${datos.nroOperacion || Date.now()}`;
  const comprobanteUrl = await subirComprobante(base64, mimeType, nombreArchivo).catch(() => "");

  const titularDest = detectarTitular(datos.nombreDestinatario ?? "");
  const titularOrd = detectarTitular(datos.nombreOrdenante ?? "");

  let etiqueta = "";
  if (titularDest) etiqueta = `\n\n🔍 Detecté: ingreso para ${titularDest}`;
  else if (titularOrd) etiqueta = `\n\n🔍 Detecté: gasto de ${titularOrd}`;

  estados.set(ctx.from.id, { paso: "confirmar_datos", datos: { ...datos, comprobanteUrl } as any });

  await ctx.replyButtons(formatearResumen(datos) + etiqueta, [
    { id: "income_confirmar", title: "✅ Confirmar" },
    { id: "income_corregir", title: "✏️ Corregir" },
  ]);
}

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  const estado = estados.get(ctx.from.id);

  // ── Confirmar ────────────────────────────────────────────────────────────
  if (buttonId === "income_confirmar") {
    if (!estado) return false;
    const d = estado.datos as DatosComprobante;
    const titularDest = detectarTitular(d.nombreDestinatario ?? "");
    const titularOrd = detectarTitular(d.nombreOrdenante ?? "");

    if (estado.corregido) {
      let sugerencia = "";
      if (titularDest) sugerencia = `\n\n🔍 Parece un ingreso para ${titularDest}`;
      else if (titularOrd) sugerencia = `\n\n🔍 Parece un gasto de ${titularOrd}`;
      await ctx.replyButtons("¿De qué se trata este comprobante?" + sugerencia, [
        { id: "income_es_ingreso", title: "💰 Ingreso" },
        { id: "income_es_gasto", title: "💸 Gasto" },
      ]);
      return true;
    }

    if (titularDest) {
      estado.paso = "seleccionar_casa";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿A qué casa corresponde?", CASAS.map((c) => ({ id: `income_casa_${c}`, title: c })));
    } else if (titularOrd) {
      estado.paso = "foto_gasto_categoria";
      estados.set(ctx.from.id, estado);
      await pedirCategoria(ctx);
    } else {
      await ctx.replyButtons("¿De qué se trata este comprobante?", [
        { id: "income_es_ingreso", title: "💰 Ingreso" },
        { id: "income_es_gasto", title: "💸 Gasto" },
      ]);
    }
    return true;
  }

  if (buttonId === "income_es_ingreso") {
    if (!estado) return false;
    estado.paso = "seleccionar_casa";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿A qué casa corresponde?", CASAS.map((c) => ({ id: `income_casa_${c}`, title: c })));
    return true;
  }

  if (buttonId === "income_es_gasto") {
    if (!estado) return false;
    estado.paso = "foto_gasto_categoria";
    estados.set(ctx.from.id, estado);
    await pedirCategoria(ctx);
    return true;
  }

  if (buttonId === "income_corregir") {
    if (!estado) return false;
    estado.paso = "corrigiendo";
    estados.set(ctx.from.id, estado);
    await ctx.reply(
      "Indicá qué campo corregir:\n\n" +
      "fecha DD/MM/YYYY\n" +
      "destinatario Nombre Apellido"
    );
    return true;
  }

  // ── Casa ─────────────────────────────────────────────────────────────────
  if (buttonId.startsWith("income_casa_")) {
    if (!estado) return false;
    estado.datos.casa = buttonId.replace("income_casa_", "") as Casa;
    estado.paso = "seleccionar_tipo_pago";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons(`Casa: *${estado.datos.casa}*\n¿Qué tipo de pago es?`, [
      { id: "income_tipo_deposito_reserva", title: "Seña 30%" },
      { id: "income_tipo_saldo_checkin", title: "Saldo check-in" },
      { id: "income_tipo_otro", title: "Otro" },
    ]);
    return true;
  }

  // ── Tipo de pago ──────────────────────────────────────────────────────────
  const tiposMap: Record<string, TipoIngreso> = {
    income_tipo_deposito_reserva: "deposito_reserva",
    income_tipo_saldo_checkin: "saldo_checkin",
    income_tipo_transferencia: "transferencia",
  };
  if (tiposMap[buttonId]) {
    if (!estado || !estado.datos.casa) return false;
    estado.datos.tipo = tiposMap[buttonId];
    estados.set(ctx.from.id, estado);
    const monedaDetectada = (estado.datos as DatosComprobante).moneda;
    if (monedaDetectada === "ARS" || monedaDetectada === "USD") {
      await confirmarIngreso(ctx, estado, monedaDetectada);
      estados.delete(ctx.from.id);
    } else {
      estado.paso = "seleccionar_moneda";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿En qué moneda fue el pago?", [
        { id: "income_moneda_ARS", title: "🇦🇷 Pesos (ARS)" },
        { id: "income_moneda_USD", title: "🇺🇸 Dólares (USD)" },
      ]);
    }
    return true;
  }

  if (buttonId === "income_tipo_otro") {
    if (!estado || !estado.datos.casa) return false;
    estado.datos.tipo = "transferencia";
    estado.paso = "ingreso_etiqueta";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cómo querés llamar a este tipo de pago? (ej: seña, alquiler mensual)");
    return true;
  }

  // ── Moneda ────────────────────────────────────────────────────────────────
  if (buttonId === "income_moneda_ARS" || buttonId === "income_moneda_USD") {
    if (!estado || !estado.datos.casa || !estado.datos.tipo) return false;
    const moneda = buttonId === "income_moneda_ARS" ? "ARS" : "USD";
    await confirmarIngreso(ctx, estado, moneda);
    estados.delete(ctx.from.id);
    return true;
  }

  // ── Categoría gasto (foto) ────────────────────────────────────────────────
  if (buttonId.startsWith("photo_gasto_cat_")) {
    if (!estado) return false;
    const cat = buttonId.replace("photo_gasto_cat_", "") as CategoriaGasto;
    estado.datos.categoria = cat;

    if (cat === "otro") {
      estado.paso = "foto_gasto_categoria_personalizada";
      estados.set(ctx.from.id, estado);
      await ctx.reply("¿Cómo querés llamar a esta categoría?");
      return true;
    }

    const titularOrd = detectarTitular((estado.datos as DatosComprobante).nombreOrdenante ?? "");
    if (titularOrd) {
      await registrarGastoFoto(ctx, estado, cat, titularOrd);
      estados.delete(ctx.from.id);
    } else {
      estado.paso = "foto_gasto_quien";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿Quién realizó el pago?",
        (["Francisco", "Fernando"] as Titular[]).map((t) => ({ id: `photo_gasto_quien_${t}`, title: t }))
      );
    }
    return true;
  }

  // ── Quién pagó gasto (foto) ───────────────────────────────────────────────
  if (buttonId.startsWith("photo_gasto_quien_")) {
    if (!estado || !estado.datos.categoria) return false;
    const titular = buttonId.replace("photo_gasto_quien_", "") as Titular;
    await registrarGastoFoto(ctx, estado, estado.datos.categoria as CategoriaGasto, titular);
    estados.delete(ctx.from.id);
    return true;
  }

  return false;
}

export async function onText(ctx: WaCtx): Promise<boolean> {
  const estado = estados.get(ctx.from.id);
  if (!estado) return false;

  const texto = ctx.text?.trim() ?? "";

  // Corrección de campos
  if (estado.paso === "corrigiendo") {
    if (texto.toLowerCase().startsWith("fecha ")) {
      const fechaStr = texto.slice(6).trim();
      const match = fechaStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) { await ctx.reply("Formato inválido. Usá: fecha DD/MM/YYYY"); return true; }
      estado.datos.fecha = fechaStr;
      estados.set(ctx.from.id, estado);
      await ctx.reply(`Fecha actualizada: ${fechaStr}. Escribí otro campo o "confirmar".`);
      return true;
    }
    if (texto.toLowerCase().startsWith("destinatario ")) {
      estado.datos.nombreDestinatario = texto.slice(13).trim();
      estados.set(ctx.from.id, estado);
      await ctx.reply(`Destinatario actualizado. Escribí otro campo o "confirmar".`);
      return true;
    }
    if (texto.toLowerCase() === "confirmar") {
      estado.paso = "confirmar_datos";
      estado.corregido = true;
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons(formatearResumen(estado.datos as DatosComprobante), [
        { id: "income_confirmar", title: "✅ Confirmar" },
        { id: "income_corregir", title: "✏️ Seguir corrigiendo" },
      ]);
      return true;
    }
    return true;
  }

  // Etiqueta tipo de pago personalizado
  if (estado.paso === "ingreso_etiqueta") {
    if (!texto) { await ctx.reply("Escribí una etiqueta para el tipo de pago."); return true; }
    estado.datos.notas = texto;
    const monedaDetectada = (estado.datos as DatosComprobante).moneda;
    if (monedaDetectada === "ARS" || monedaDetectada === "USD") {
      await confirmarIngreso(ctx, estado, monedaDetectada);
      estados.delete(ctx.from.id);
    } else {
      estado.paso = "seleccionar_moneda";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿En qué moneda fue el pago?", [
        { id: "income_moneda_ARS", title: "🇦🇷 Pesos (ARS)" },
        { id: "income_moneda_USD", title: "🇺🇸 Dólares (USD)" },
      ]);
    }
    return true;
  }

  // Categoría personalizada (gasto foto)
  if (estado.paso === "foto_gasto_categoria_personalizada") {
    if (!texto) { await ctx.reply("Escribí una categoría."); return true; }
    estado.datos.notas = texto;
    const titularOrd = detectarTitular((estado.datos as DatosComprobante).nombreOrdenante ?? "");
    if (titularOrd) {
      await registrarGastoFoto(ctx, estado, "otro", titularOrd);
      estados.delete(ctx.from.id);
    } else {
      estado.paso = "foto_gasto_quien";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿Quién realizó el pago?",
        (["Francisco", "Fernando"] as Titular[]).map((t) => ({ id: `photo_gasto_quien_${t}`, title: t }))
      );
    }
    return true;
  }

  return false;
}

async function pedirCategoria(ctx: WaCtx) {
  await ctx.replyButtons(
    "¿A qué categoría corresponde el gasto?",
    CATEGORIAS_GASTO.map((cat) => ({ id: `photo_gasto_cat_${cat}`, title: cat.charAt(0).toUpperCase() + cat.slice(1) }))
  );
}

async function confirmarIngreso(ctx: WaCtx, estado: EstadoConversacion, moneda: "ARS" | "USD") {
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
    registradoPor: nombreWa(ctx.from.name, ctx.from.id),
    comprobanteUrl: d.comprobanteUrl ?? "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(d.fecha || hoy),
  });

  await ctx.reply(`✅ Registrado\n${label} · ${d.casa} · ${simbolo}${(d.monto ?? 0).toLocaleString("es-AR")}`);
}

async function registrarGastoFoto(ctx: WaCtx, estado: EstadoConversacion, categoria: CategoriaGasto, pagadoPor: Titular) {
  const d = estado.datos as DatosComprobante & { comprobanteUrl?: string };
  const hoy = new Date().toLocaleDateString("es-AR");
  const categoriaFinal = (categoria === "otro" && estado.datos.notas) ? estado.datos.notas : categoria;

  if (d.nroOperacion) {
    const duplicado = await buscarGastoDuplicado(d.nroOperacion);
    if (duplicado) {
      await ctx.reply(
        `⚠️ *Gasto duplicado*\n\nEl número ${d.nroOperacion} ya fue registrado:\n` +
        `Fecha: ${duplicado.fecha}\nCategoría: ${duplicado.categoria}\nMonto: $${duplicado.monto.toLocaleString("es-AR")}\nPagó: ${duplicado.pagadoPor}`
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
    registradoPor: nombreWa(ctx.from.name, ctx.from.id),
    comprobanteUrl: d.comprobanteUrl ?? "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(d.fecha || hoy),
  });

  await ctx.reply(`✅ Gasto registrado\n${categoriaFinal} · ${resolverNombre(pagadoPor)} · ${simbolo}${(d.monto ?? 0).toLocaleString("es-AR")}`);
}
