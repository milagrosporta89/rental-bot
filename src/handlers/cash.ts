import { registrarIngreso, registrarGasto } from "../services/sheets";
import { CASAS } from "../config";
import { Casa, CategoriaGasto, EstadoConversacion, Titular, WaCtx } from "../types";
import { validarFecha, validarMonto, nombreWa, ahora } from "../utils";
import { obtenerCotizacion } from "../services/dolar";

const estados = new Map<string, EstadoConversacion>();

const CATEGORIAS_GASTO: CategoriaGasto[] = [
  "limpieza", "jardinero", "lavanderia", "expensas",
  "luz", "gas", "mantenimiento", "otro",
];

const TITULARES_EFECTIVO: Titular[] = ["Francisco", "Fernando"];

function hoyAR(): string {
  return new Date().toLocaleDateString("es-AR");
}

export async function onEfectivoCommand(ctx: WaCtx): Promise<void> {
  estados.set(ctx.from.id, { paso: "inicio", datos: {} });
  await ctx.replyButtons("¿Qué querés registrar?", [
    { id: "efectivo_tipo_ingreso", title: "💰 Ingreso" },
    { id: "efectivo_tipo_gasto", title: "💸 Gasto" },
  ]);
}

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  const estado = estados.get(ctx.from.id);

  // Tipo
  if (buttonId === "efectivo_tipo_ingreso") {
    if (!estado) return false;
    estado.paso = "ingreso_quien";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿Quién realizó el pago?",
      TITULARES_EFECTIVO.map((t) => ({ id: `efectivo_quien_${t}`, title: t }))
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
    estado.paso = "ingreso_fecha";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`Casa: *${estado.datos.casa}*\n\n¿Cuál es la fecha del ingreso? (DD/MM/YYYY o "hoy")`);
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
        TITULARES_EFECTIVO.map((t) => ({ id: `efectivo_pagadopor_${t}`, title: t }))
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

  // Moneda (ingreso / gasto)
  if (buttonId.startsWith("efectivo_moneda_")) {
    if (!estado) return false;
    estado.datos.moneda = buttonId.replace("efectivo_moneda_", "") as "ARS" | "USD";
    if (estado.paso === "ingreso_moneda") {
      await registrarIngresoEfectivo(ctx, estado);
    } else {
      await registrarGastoEfectivo(ctx, estado);
    }
    estados.delete(ctx.from.id);
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
    estado.datos.notas = texto;
    estado.paso = "gasto_pagado_por";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿Quién realizó el pago?",
      TITULARES_EFECTIVO.map((t) => ({ id: `efectivo_pagadopor_${t}`, title: t }))
    );
    return true;
  }

  // Fecha ingreso
  if (estado.paso === "ingreso_fecha") {
    const fechaStr = texto.toLowerCase() === "hoy" ? hoyAR() : texto;
    const v = validarFecha(fechaStr);
    if (!v.ok) { await ctx.reply(v.error!); return true; }
    estado.datos.fecha = fechaStr;
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
    estado.datos.fecha = fechaStr;
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

async function registrarIngresoEfectivo(ctx: WaCtx, estado: EstadoConversacion) {
  const moneda = estado.datos.moneda as "ARS" | "USD";
  const monto = estado.datos.monto ?? 0;
  const simbolo = moneda === "USD" ? "U$D" : "$";
  await registrarIngreso({
    fecha: estado.datos.fecha ?? hoyAR(),
    casa: estado.datos.casa as Casa,
    monto,
    moneda,
    tipo: "efectivo",
    quienPago: estado.datos.quienPago ?? "",
    nombreDestinatario: nombreWa(ctx.from.name, ctx.from.id),
    bancoOrigen: "Efectivo",
    nroOperacion: "",
    notas: "",
    registradoPor: nombreWa(ctx.from.name, ctx.from.id),
    comprobanteUrl: "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(estado.datos.fecha ?? hoyAR()),
  });
  await ctx.reply(`✅ Ingreso registrado\nEfectivo · ${estado.datos.casa} · ${simbolo}${monto.toLocaleString("es-AR")}\nFecha: ${estado.datos.fecha} · Pagó: ${estado.datos.quienPago}`);
}

async function registrarGastoEfectivo(ctx: WaCtx, estado: EstadoConversacion) {
  const moneda = estado.datos.moneda as "ARS" | "USD";
  const monto = estado.datos.monto ?? 0;
  const simbolo = moneda === "USD" ? "U$D" : "$";
  const categoriaFinal = (estado.datos.categoria === "otro" && estado.datos.notas) ? estado.datos.notas : estado.datos.categoria ?? "";
  await registrarGasto({
    fecha: estado.datos.fecha ?? hoyAR(),
    monto,
    moneda,
    categoria: categoriaFinal,
    pagadoPor: estado.datos.pagadoPor as Titular,
    nombreDestinatario: "",
    bancoOrigen: "Efectivo",
    nroOperacion: "",
    notas: "",
    registradoPor: nombreWa(ctx.from.name, ctx.from.id),
    comprobanteUrl: "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(estado.datos.fecha ?? hoyAR()),
  });
  await ctx.reply(`✅ Gasto registrado\n${categoriaFinal} · ${estado.datos.pagadoPor} · ${simbolo}${monto.toLocaleString("es-AR")}\nFecha: ${estado.datos.fecha}`);
}
