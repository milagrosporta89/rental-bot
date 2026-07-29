import { registrarIngreso } from "../services/sheets";
import { CASAS } from "../config";
import { Casa, EstadoConversacion, WaCtx, MENU_BOTONES } from "../types";
import { validarFecha, validarMonto, nombreWa, ahora, fechaHoy, generarId, esEscapePalabra, pedirConfirmacionEscape } from "../utils";
import { obtenerCotizacion } from "../services/dolar";

const estados = new Map<string, EstadoConversacion>();


export async function onEfectivoIngreso(ctx: WaCtx): Promise<void> {
  const estado: EstadoConversacion = { paso: "ingreso_quien_manual", datos: {} };
  estados.set(ctx.from.id, estado);
  await ctx.reply("¿Cuál es el nombre de quien pagó?");
}

export async function onFlowReply(ctx: WaCtx, data: Record<string, string>): Promise<void> {
  const hoy = new Date().toLocaleDateString("es-AR");
  const fecha = data.fecha || hoy;
  const monto = parseFloat(data.monto?.replace(/\./g, "").replace(",", ".") ?? "0");
  const moneda = (data.moneda ?? "ARS") as "ARS" | "USD";
  const simbolo = moneda === "USD" ? "U$D" : "$";

  await registrarIngreso({
    id: generarId("ING"),
    fecha,
    casa: data.casa as any,
    monto,
    moneda,
    tipo: (data.tipo ?? "transferencia") as any,
    quienPago: data.quien_pago ?? "",
    nombreDestinatario: nombreWa(ctx.from.name, ctx.from.id),
    bancoDestino: "",
    nroOperacion: "",
    detalle: "",
    registradoPor: nombreWa(ctx.from.name, ctx.from.id),
    comprobanteUrl: "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(fecha),
    idReserva: "",
    tipoMovimiento: "directo",
  });
  await ctx.reply(`✅ Ingreso registrado\n${data.tipo ?? "efectivo"} · ${data.casa} · ${simbolo}${monto.toLocaleString("es-AR")}\nFecha: ${fecha} · Pagó: ${data.quien_pago}`);
}

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  const estado = estados.get(ctx.from.id);

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

  // Casa
  if (buttonId.startsWith("efectivo_casa_")) {
    if (!estado) return false;
    estado.datos.casa = buttonId.replace("efectivo_casa_", "") as Casa;
    estado.paso = "ingreso_destinatario";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`Casa: *${estado.datos.casa}*\n\n¿A nombre de quién se deposita? (ej: Milagros, Paola)`);
    return true;
  }

  // Tipo de pago
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

  // Moneda
  if (buttonId.startsWith("efectivo_moneda_")) {
    if (!estado || estado.paso !== "ingreso_moneda") return false;
    estado.datos.moneda = buttonId.replace("efectivo_moneda_", "") as "ARS" | "USD";
    estado.paso = "ingreso_confirmar";
    estados.set(ctx.from.id, estado);
    await mostrarConfirmacion(ctx, estado);
    return true;
  }

  // Confirmar
  if (buttonId === "efectivo_confirmar") {
    if (!estado || estado.paso !== "ingreso_confirmar") return false;
    await registrarIngresoEfectivo(ctx, estado);
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

  // Escape con confirmación
  if (esEscapePalabra(texto)) {
    await pedirConfirmacionEscape(ctx, () => estados.delete(ctx.from.id));
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

  // Destinatario
  if (estado.paso === "ingreso_destinatario") {
    if (!texto) { await ctx.reply("Escribí el nombre del destinatario."); return true; }
    estado.datos.nombreDestinatario = texto;
    estado.paso = "ingreso_tipo";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿En concepto de qué es el pago?", [
      { id: "efectivo_tipo_deposito_reserva", title: "Seña 30%" },
      { id: "efectivo_tipo_saldo_checkin",    title: "Saldo check-in" },
      { id: "efectivo_tipo_otro",             title: "Otro" },
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

  // Fecha
  if (estado.paso === "ingreso_fecha") {
    let fecha: string;
    if (texto.toLowerCase() === "hoy") {
      fecha = fechaHoy();
    } else {
      const v = validarFecha(texto);
      if (!v.ok) { await ctx.reply(v.error!); return true; }
      fecha = v.fecha!;
    }
    estado.datos.fecha = fecha;
    estado.paso = "ingreso_monto";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuál es el monto?");
    return true;
  }

  // Monto
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

  return false;
}

// ── Helpers privados ──────────────────────────────────────────────────────

async function mostrarConfirmacion(ctx: WaCtx, estado: EstadoConversacion) {
  const moneda = estado.datos.moneda as "ARS" | "USD";
  const simbolo = moneda === "USD" ? "U$D" : "$";
  const monto = estado.datos.monto ?? 0;

  await ctx.replyButtons(
    `*Confirmar ingreso:*\n\n` +
    `Quién pagó: ${estado.datos.quienPago}\n` +
    `Casa: ${estado.datos.casa}\n` +
    `Concepto: ${estado.datos.detalle ?? estado.datos.tipo ?? "efectivo"}\n` +
    `Fecha: ${estado.datos.fecha}\n` +
    `Monto: ${simbolo}${monto.toLocaleString("es-AR")}\n` +
    `Moneda: ${moneda}`,
    [
      { id: "efectivo_confirmar", title: "✅ Confirmar" },
      { id: "efectivo_cancelar",  title: "❌ Cancelar" },
    ]
  );
}

async function registrarIngresoEfectivo(ctx: WaCtx, estado: EstadoConversacion) {
  const moneda = estado.datos.moneda as "ARS" | "USD";
  const monto = estado.datos.monto ?? 0;
  const simbolo = moneda === "USD" ? "U$D" : "$";
  await registrarIngreso({
    id: generarId("ING"),
    fecha: estado.datos.fecha ?? fechaHoy(),
    casa: estado.datos.casa as Casa,
    monto,
    moneda,
    tipo: (estado.datos.tipo ?? "efectivo") as any,
    quienPago: estado.datos.quienPago ?? "",
    nombreDestinatario: estado.datos.nombreDestinatario ?? nombreWa(ctx.from.name, ctx.from.id),
    bancoDestino: "",
    nroOperacion: "",
    detalle: estado.datos.detalle ?? "",
    registradoPor: nombreWa(ctx.from.name, ctx.from.id),
    comprobanteUrl: "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(estado.datos.fecha ?? fechaHoy()),
    idReserva: "",
    tipoMovimiento: "directo",
  });


  await ctx.reply(`✅ Ingreso registrado\nEfectivo · ${estado.datos.casa} · ${simbolo}${monto.toLocaleString("es-AR")}\nFecha: ${estado.datos.fecha} · Pagó: ${estado.datos.quienPago}`);
  await ctx.replyButtons("¿Querés registrar algo más?", MENU_BOTONES);
}
