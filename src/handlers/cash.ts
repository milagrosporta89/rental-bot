import { registrarIngreso, registrarGasto, registrarComision } from "../services/sheets";
import { CASAS } from "../config";
import { Casa, CategoriaGasto, EstadoConversacion, Titular, WaCtx, MENU_BOTONES } from "../types";
import { validarFecha, validarMonto, nombreWa, ahora, generarId } from "../utils";
import { obtenerCotizacion } from "../services/dolar";

const estados = new Map<string, EstadoConversacion>();

const TITULARES_INGRESO: Titular[] = ["Francisco", "Fernando"];
const TITULARES_GASTO: Titular[] = ["Francisco", "Fernando", "Paola", "Milagros", "Inés"];

const CATEGORIAS_GASTO: CategoriaGasto[] = [
  "limpieza", "jardinero", "lavanderia", "expensas",
  "luz", "gas", "mantenimiento", "internet",
  "marketing", "impuestos", "otro",
];

function hoyAR(): string {
  return new Date().toLocaleDateString("es-AR");
}

export async function onEfectivoIngreso(ctx: WaCtx): Promise<void> {
  const estado: EstadoConversacion = { paso: "ingreso_quien_manual", datos: {} };
  estados.set(ctx.from.id, estado);
  await ctx.reply("¿Cuál es el nombre de quien pagó?");
}

export async function onEfectivoGasto(ctx: WaCtx): Promise<void> {
  const estado: EstadoConversacion = { paso: "gasto_categoria", datos: {} };
  estados.set(ctx.from.id, estado);
  await ctx.replyButtons("¿A qué categoría corresponde?",
    CATEGORIAS_GASTO.map((c) => ({ id: `efectivo_cat_${c}`, title: c.charAt(0).toUpperCase() + c.slice(1) }))
  );
}

export async function onFlowReply(ctx: WaCtx, data: Record<string, string>): Promise<void> {
  const hoyAR = new Date().toLocaleDateString("es-AR");
  const fecha = data.fecha || hoyAR;
  const monto = parseFloat(data.monto?.replace(/\./g, "").replace(",", ".") ?? "0");
  const moneda = (data.moneda ?? "ARS") as "ARS" | "USD";
  const simbolo = moneda === "USD" ? "U$D" : "$";

  if (data.flow_type === "ingreso" || data.quien_pago) {
    await registrarIngreso({
      id: generarId("ING"),
      fecha,
      casa: data.casa as any,
      monto,
      moneda,
      tipo: (data.tipo ?? "transferencia") as any,
      quienPago: data.quien_pago ?? "",
      nombreDestinatario: nombreWa(ctx.from.name, ctx.from.id),
      bancoOrigen: "Efectivo",
      nroOperacion: "",
      detalle: "",
      registradoPor: nombreWa(ctx.from.name, ctx.from.id),
      comprobanteUrl: "",
      timestamp: ahora(),
      cotizacion: await obtenerCotizacion(fecha),
    });
    await ctx.reply(`✅ Ingreso registrado\n${data.tipo ?? "efectivo"} · ${data.casa} · ${simbolo}${monto.toLocaleString("es-AR")}\nFecha: ${fecha} · Pagó: ${data.quien_pago}`);
  } else {
    const categoriaFinal = data.categoria === "otro" && data.categoria_custom ? data.categoria_custom : data.categoria;
    await registrarGasto({
      id: generarId("GAS"),
      fecha,
      monto,
      moneda,
      categoria: categoriaFinal ?? "",
      pagadoPor: (data.pagado_por ?? "") as any,
      nombreDestinatario: "",
      bancoOrigen: "Efectivo",
      nroOperacion: "",
      detalle: "",
      registradoPor: nombreWa(ctx.from.name, ctx.from.id),
      comprobanteUrl: "",
      timestamp: ahora(),
      cotizacion: await obtenerCotizacion(fecha),
    });
    await ctx.reply(`✅ Gasto registrado\n${categoriaFinal} · ${data.pagado_por} · ${simbolo}${monto.toLocaleString("es-AR")}\nFecha: ${fecha}`);
  }
}

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  const estado = estados.get(ctx.from.id);

  // Tipo
  if (buttonId === "efectivo_tipo_ingreso") {
    if (!estado) return false;
    estado.paso = "ingreso_quien";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿Quién realizó el pago?",
      TITULARES_INGRESO.map((t) => ({ id: `efectivo_quien_${t}`, title: t }))
    );
    return true;
  }
  if (buttonId === "efectivo_tipo_gasto") {
    if (!estado) return false;
    estado.paso = "gasto_categoria";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿A qué categoría corresponde?",
      CATEGORIAS_GASTO.map((c) => ({ id: `efectivo_cat_${c}`, title: c.charAt(0).toUpperCase() + c.slice(1) }))
    );
    return true;
  }

  // Quien pagó (ingreso)
  if (buttonId.startsWith("efectivo_quien_")) {
    if (!estado) return false;
    estado.datos.quienPago = buttonId.replace("efectivo_quien_", "");
    estado.paso = "ingreso_casa";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿A qué casa corresponde?",
      CASAS.map((c) => ({ id: `efectivo_casa_${c}`, title: c }))
    );
    return true;
  }

  // Casa (ingreso)
  if (buttonId.startsWith("efectivo_casa_")) {
    if (!estado) return false;
    estado.datos.casa = buttonId.replace("efectivo_casa_", "") as Casa;
    estado.paso = "ingreso_destinatario";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`Casa: *${estado.datos.casa}*\n\n¿A nombre de quién se deposita? (ej: Milagros, Paola)`);
    return true;
  }

  // Tipo de pago (ingreso efectivo)
  if (buttonId.startsWith("efectivo_tipo_") && estado?.paso === "ingreso_tipo") {
    if (!estado) return false;
    const tipo = buttonId.replace("efectivo_tipo_", "");
    if (tipo === "otro") {
      estado.paso = "ingreso_tipo_etiqueta";
      estados.set(ctx.from.id, estado);
      await ctx.reply("¿Cómo querés llamar a este pago? (ej: alquiler mensual, señal)");
    } else {
      estado.datos.tipo = tipo as any;
      estado.paso = "ingreso_fecha";
      estados.set(ctx.from.id, estado);
      await ctx.reply(`¿Cuál es la fecha del ingreso? (DD/MM/YYYY o "hoy")`);
    }
    return true;
  }

  // Categoría (gasto)
  if (buttonId.startsWith("efectivo_cat_")) {
    if (!estado) return false;
    const cat = buttonId.replace("efectivo_cat_", "") as CategoriaGasto;
    estado.datos.categoria = cat;
    if (cat === "otro") {
      estado.paso = "gasto_categoria_personalizada";
      estados.set(ctx.from.id, estado);
      await ctx.reply("¿Cómo querés llamar a esta categoría? (ej: seguro, honorarios)");
    } else {
      estado.paso = "gasto_pagado_por";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿Quién realizó el pago?",
        TITULARES_GASTO.map((t) => ({ id: `efectivo_pagadopor_${t}`, title: t }))
      );
    }
    return true;
  }

  // Quien pagó (gasto)
  if (buttonId.startsWith("efectivo_pagadopor_")) {
    if (!estado) return false;
    estado.datos.pagadoPor = buttonId.replace("efectivo_pagadopor_", "") as Titular;
    estado.paso = "gasto_fecha";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuál es la fecha del gasto? (DD/MM/YYYY o \"hoy\")");
    return true;
  }

  // Moneda (ingreso / gasto) → mostrar confirmación
  if (buttonId.startsWith("efectivo_moneda_")) {
    if (!estado) return false;
    estado.datos.moneda = buttonId.replace("efectivo_moneda_", "") as "ARS" | "USD";
    const esIngreso = estado.paso === "ingreso_moneda";
    estado.paso = esIngreso ? "ingreso_confirmar" : "gasto_confirmar";
    estados.set(ctx.from.id, estado);
    await mostrarConfirmacion(ctx, estado, esIngreso);
    return true;
  }

  // Confirmación final
  if (buttonId === "efectivo_confirmar") {
    if (!estado) return false;
    if (estado.paso === "ingreso_confirmar") {
      await registrarIngresoEfectivo(ctx, estado);
    } else {
      await registrarGastoEfectivo(ctx, estado);
    }
    estados.delete(ctx.from.id);
    return true;
  }

  if (buttonId === "efectivo_cancelar") {
    estados.delete(ctx.from.id);
    await ctx.replyButtons("Registro cancelado.", MENU_BOTONES);
    return true;
  }

  return false;
}

export async function onText(ctx: WaCtx): Promise<boolean> {
  const estado = estados.get(ctx.from.id);
  if (!estado) return false;

  const texto = ctx.text?.trim() ?? "";

  // Categoría personalizada (gasto)
  if (estado.paso === "gasto_categoria_personalizada") {
    if (!texto) { await ctx.reply("Escribí una categoría."); return true; }
    estado.datos.detalle = texto;
    estado.paso = "gasto_pagado_por";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿Quién realizó el pago?",
      TITULARES_GASTO.map((t) => ({ id: `efectivo_pagadopor_${t}`, title: t }))
    );
    return true;
  }

  // Destinatario del ingreso
  if (estado.paso === "ingreso_destinatario") {
    if (!texto) { await ctx.reply("Escribí el nombre del destinatario."); return true; }
    estado.datos.nombreDestinatario = texto;
    estado.paso = "ingreso_tipo";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons(`¿En concepto de qué es el pago?`, [
      { id: "efectivo_tipo_deposito_reserva", title: "Seña 30%" },
      { id: "efectivo_tipo_saldo_checkin", title: "Saldo check-in" },
      { id: "efectivo_tipo_otro", title: "Otro" },
    ]);
    return true;
  }

  // Etiqueta personalizada de tipo de pago
  if (estado.paso === "ingreso_tipo_etiqueta") {
    if (!texto) { await ctx.reply("Escribí la descripción del pago."); return true; }
    estado.datos.tipo = "transferencia" as any;
    estado.datos.detalle = texto;
    estado.paso = "ingreso_fecha";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`¿Cuál es la fecha del ingreso? (DD/MM/YYYY o "hoy")`);
    return true;
  }

  // Nombre manual de quien pagó
  if (estado.paso === "ingreso_quien_manual") {
    if (!texto) { await ctx.reply("Escribí el nombre."); return true; }
    estado.datos.quienPago = texto;
    estado.paso = "ingreso_casa";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿A qué casa corresponde?",
      CASAS.map((c) => ({ id: `efectivo_casa_${c}`, title: c }))
    );
    return true;
  }

  // Fecha ingreso
  if (estado.paso === "ingreso_fecha") {
    const fechaStr = texto.toLowerCase() === "hoy" ? hoyAR() : texto;
    const v = validarFecha(fechaStr);
    if (!v.ok) { await ctx.reply(v.error!); return true; }
    estado.datos.fecha = v.fecha;
    estado.paso = "ingreso_monto";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuál es el monto?");
    return true;
  }

  // Monto ingreso
  if (estado.paso === "ingreso_monto") {
    const v = validarMonto(texto);
    if (!v.ok) { await ctx.reply(v.error!); return true; }
    estado.datos.monto = v.monto;
    estado.paso = "ingreso_moneda";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿En qué moneda?", [
      { id: "efectivo_moneda_ARS", title: "🇦🇷 Pesos (ARS)" },
      { id: "efectivo_moneda_USD", title: "🇺🇸 Dólares (USD)" },
    ]);
    return true;
  }

  // Fecha gasto
  if (estado.paso === "gasto_fecha") {
    const fechaStr = texto.toLowerCase() === "hoy" ? hoyAR() : texto;
    const v = validarFecha(fechaStr);
    if (!v.ok) { await ctx.reply(v.error!); return true; }
    estado.datos.fecha = v.fecha;
    estado.paso = "gasto_monto";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuál es el monto?");
    return true;
  }

  // Monto gasto
  if (estado.paso === "gasto_monto") {
    const v = validarMonto(texto);
    if (!v.ok) { await ctx.reply(v.error!); return true; }
    estado.datos.monto = v.monto;
    estado.paso = "gasto_moneda";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿En qué moneda?", [
      { id: "efectivo_moneda_ARS", title: "🇦🇷 Pesos (ARS)" },
      { id: "efectivo_moneda_USD", title: "🇺🇸 Dólares (USD)" },
    ]);
    return true;
  }

  return false;
}

async function mostrarConfirmacion(ctx: WaCtx, estado: EstadoConversacion, esIngreso: boolean) {
  const moneda = estado.datos.moneda as "ARS" | "USD";
  const simbolo = moneda === "USD" ? "U$D" : "$";
  const monto = estado.datos.monto ?? 0;

  let resumen: string;
  if (esIngreso) {
    resumen =
      `*Confirmar ingreso:*\n\n` +
      `Quién pagó: ${estado.datos.quienPago}\n` +
      `Casa: ${estado.datos.casa}\n` +
      `Concepto: ${estado.datos.detalle ?? estado.datos.tipo ?? "efectivo"}\n` +
      `Fecha: ${estado.datos.fecha}\n` +
      `Monto: ${simbolo}${monto.toLocaleString("es-AR")}\n` +
      `Moneda: ${moneda}`;
  } else {
    const cat = (estado.datos.categoria === "otro" && estado.datos.detalle) ? estado.datos.detalle : estado.datos.categoria;
    resumen =
      `*Confirmar gasto:*\n\n` +
      `Categoría: ${cat}\n` +
      `Pagó: ${estado.datos.pagadoPor}\n` +
      `Fecha: ${estado.datos.fecha}\n` +
      `Monto: ${simbolo}${monto.toLocaleString("es-AR")}\n` +
      `Moneda: ${moneda}`;
  }

  await ctx.replyButtons(resumen, [
    { id: "efectivo_confirmar", title: "✅ Confirmar" },
    { id: "efectivo_cancelar", title: "❌ Cancelar" },
  ]);
}

async function registrarIngresoEfectivo(ctx: WaCtx, estado: EstadoConversacion) {
  const moneda = estado.datos.moneda as "ARS" | "USD";
  const monto = estado.datos.monto ?? 0;
  const simbolo = moneda === "USD" ? "U$D" : "$";
  await registrarIngreso({
    id: generarId("ING"),
    fecha: estado.datos.fecha ?? hoyAR(),
    casa: estado.datos.casa as Casa,
    monto,
    moneda,
    tipo: (estado.datos.tipo ?? "efectivo") as any,
    quienPago: estado.datos.quienPago ?? "",
    nombreDestinatario: estado.datos.nombreDestinatario ?? nombreWa(ctx.from.name, ctx.from.id),
    bancoOrigen: "Efectivo",
    nroOperacion: "",
    detalle: estado.datos.detalle ?? "",
    registradoPor: nombreWa(ctx.from.name, ctx.from.id),
    comprobanteUrl: "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(estado.datos.fecha ?? hoyAR()),
  });

  if ((estado.datos.nombreDestinatario ?? "").toLowerCase().includes("paola")) {
    const cot = await obtenerCotizacion(estado.datos.fecha ?? hoyAR());
    await registrarComision(monto, `Efectivo · ${estado.datos.casa} · ${estado.datos.detalle ?? ""}`, ahora(), cot, "cobro").catch(() => {});
  }

  await ctx.reply(`✅ Ingreso registrado\nEfectivo · ${estado.datos.casa} · ${simbolo}${monto.toLocaleString("es-AR")}\nFecha: ${estado.datos.fecha} · Pagó: ${estado.datos.quienPago}`);
  await ctx.replyButtons("¿Querés registrar algo más?", MENU_BOTONES);
}

async function registrarGastoEfectivo(ctx: WaCtx, estado: EstadoConversacion) {
  const moneda = estado.datos.moneda as "ARS" | "USD";
  const monto = estado.datos.monto ?? 0;
  const simbolo = moneda === "USD" ? "U$D" : "$";
  const categoriaFinal = (estado.datos.categoria === "otro" && estado.datos.detalle) ? estado.datos.detalle : estado.datos.categoria ?? "";
  await registrarGasto({
    id: generarId("GAS"),
    fecha: estado.datos.fecha ?? hoyAR(),
    monto,
    moneda,
    categoria: categoriaFinal,
    pagadoPor: estado.datos.pagadoPor as Titular,
    nombreDestinatario: "",
    bancoOrigen: "Efectivo",
    nroOperacion: "",
    detalle: "",
    registradoPor: nombreWa(ctx.from.name, ctx.from.id),
    comprobanteUrl: "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(estado.datos.fecha ?? hoyAR()),
  });
  await ctx.reply(`✅ Gasto registrado\n${categoriaFinal} · ${estado.datos.pagadoPor} · ${simbolo}${monto.toLocaleString("es-AR")}\nFecha: ${estado.datos.fecha}`);

  if (estado.datos.pagadoPor === "Paola") {
    const cot = await obtenerCotizacion(estado.datos.fecha ?? hoyAR());
    await registrarComision(monto, `Gasto: ${categoriaFinal}`, ahora(), cot, "gasto").catch(() => {});
  }

  await ctx.replyButtons("¿Querés registrar algo más?", MENU_BOTONES);
}
