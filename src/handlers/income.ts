import { registrarIngreso } from "../services/sheets";
import { obtenerCotizacion } from "../services/dolar";
import { procesarComprobante } from "../services/comprobantes";
import { resolverNombre } from "../config";
import { CASAS } from "../config";
import { nombreWa, ahora, generarId, esEscapePalabra, pedirConfirmacionEscape } from "../utils";
import { formatearResumenComprobante, manejarCorreccion } from "./common";
import { Casa, DatosComprobante, WaCtx, MENU_BOTONES } from "../types";

// ── Estado ────────────────────────────────────────────────────────────────

interface EstadoIngreso {
  paso: string;
  datos: Partial<DatosComprobante> & {
    comprobanteUrl?: string;
    casa?: Casa;
    detalle?: string;
  };
  corregido?: boolean;
}

const estados = new Map<string, EstadoIngreso>();

// ── Handler público: foto ─────────────────────────────────────────────────

export async function onPhoto(
  ctx: WaCtx,
  mediaId: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
): Promise<void> {
  await ctx.reply("Procesando el comprobante...");

  const resultado = await procesarComprobante(mediaId, mimeType, "ingreso");

  if (!resultado.ok) {
    if (resultado.error.tipo === "descarga_fallida") {
      await ctx.reply("No pude descargar la imagen. ¿Podés reenviarla?");
    } else if (resultado.error.tipo === "ilegible") {
      await ctx.reply("No pude leer el comprobante. ¿Podés reenviar una versión más nítida?");
    } else {
      await ctx.reply(`⚠️ *Comprobante duplicado*\n\n${resultado.error.detalle}`);
    }
    return;
  }

  const { datos, comprobanteUrl } = resultado;
  estados.set(ctx.from.id, { paso: "confirmar_datos", datos: { ...datos, comprobanteUrl } });

  await ctx.replyButtons(formatearResumenComprobante(datos), [
    { id: "income_confirmar", title: "✅ Confirmar" },
    { id: "income_corregir", title: "✏️ Corregir" },
  ]);
}

// ── Callbacks ─────────────────────────────────────────────────────────────

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  if (!buttonId.startsWith("income_")) return false;

  const estado = estados.get(ctx.from.id);

  if (buttonId === "income_confirmar") {
    if (!estado) return false;
    estado.paso = "seleccionar_casa";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿A qué casa corresponde?", CASAS.map((c) => ({ id: `income_casa_${c}`, title: c })));
    return true;
  }

  if (buttonId === "income_corregir") {
    if (!estado) return false;
    estado.paso = "corrigiendo";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Qué dato está mal? Escribí el campo y el valor correcto:\n\n*fecha* 15/06/2026\n*destinatario* Juan García\n\nCuando termines escribí *confirmar*.");
    return true;
  }

  if (buttonId.startsWith("income_casa_")) {
    if (!estado) return false;
    estado.datos.casa = buttonId.replace("income_casa_", "") as Casa;
    estado.paso = "seleccionar_tipo";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons(`Casa: *${estado.datos.casa}* ✓\n¿Qué tipo de pago es?`, [
      { id: "income_tipo_adelanto",    title: "Adelanto reserva" },
      { id: "income_tipo_saldo",       title: "Saldo check-in" },
      { id: "income_tipo_otro",        title: "Otro" },
    ]);
    return true;
  }

  const tiposLabel: Record<string, string> = {
    income_tipo_adelanto: "Adelanto reserva",
    income_tipo_saldo:    "Saldo check-in",
  };

  if (tiposLabel[buttonId]) {
    if (!estado) return false;
    estado.datos.detalle = tiposLabel[buttonId];
    await pedirMonedaOGuardar(ctx, estado);
    return true;
  }

  if (buttonId === "income_tipo_otro") {
    if (!estado) return false;
    estado.paso = "ingreso_etiqueta";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cómo querés llamar a este tipo de pago? (ej: seña, alquiler mensual)");
    return true;
  }

  if (buttonId === "income_moneda_ARS" || buttonId === "income_moneda_USD") {
    if (!estado) return false;
    const moneda = buttonId === "income_moneda_ARS" ? "ARS" : "USD";
    await mostrarConfirmacionFinal(ctx, estado, moneda);
    return true;
  }

  if (buttonId === "income_guardar") {
    if (!estado) return false;
    const moneda = (estado.datos.moneda ?? "ARS") as "ARS" | "USD";
    await guardarIngreso(ctx, estado, moneda);
    estados.delete(ctx.from.id);
    return true;
  }

  if (buttonId === "income_cancelar") {
    estados.delete(ctx.from.id);
    await ctx.replyButtons("Registro cancelado.", MENU_BOTONES);
    return true;
  }

  return false;
}

// ── Texto ─────────────────────────────────────────────────────────────────

export async function onText(ctx: WaCtx): Promise<boolean> {
  const estado = estados.get(ctx.from.id);
  if (!estado) return false;

  const texto = ctx.text?.trim() ?? "";

  if (esEscapePalabra(texto) && estado.paso !== "corrigiendo") {
    await pedirConfirmacionEscape(ctx, () => estados.delete(ctx.from.id));
    return true;
  }

  if (await manejarCorreccion(ctx, texto, estado, async (e) => {
    estados.set(ctx.from.id, e);
    await ctx.replyButtons(formatearResumenComprobante(e.datos as DatosComprobante), [
      { id: "income_confirmar", title: "✅ Confirmar" },
      { id: "income_corregir", title: "✏️ Seguir corrigiendo" },
    ]);
  })) return true;

  if (estado.paso === "ingreso_etiqueta") {
    if (!texto) { await ctx.reply("Escribí una etiqueta para el tipo de pago."); return true; }
    estado.datos.detalle = texto;
    await pedirMonedaOGuardar(ctx, estado);
    return true;
  }

  return false;
}

// ── Helpers privados ──────────────────────────────────────────────────────

async function pedirMonedaOGuardar(ctx: WaCtx, estado: EstadoIngreso) {
  const monedaDetectada = estado.datos.moneda;
  if (monedaDetectada === "ARS" || monedaDetectada === "USD") {
    await mostrarConfirmacionFinal(ctx, estado, monedaDetectada);
  } else {
    estado.paso = "seleccionar_moneda";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿En qué moneda fue el pago?", [
      { id: "income_moneda_ARS", title: "🇦🇷 Pesos (ARS)" },
      { id: "income_moneda_USD", title: "🇺🇸 Dólares (USD)" },
    ]);
  }
}

async function mostrarConfirmacionFinal(ctx: WaCtx, estado: EstadoIngreso, moneda: "ARS" | "USD") {
  const d = estado.datos as DatosComprobante & { casa: Casa; detalle?: string };
  const simbolo = moneda === "USD" ? "U$D" : "$";

  estado.datos.moneda = moneda;
  estado.paso = "confirmar_guardar";
  estados.set(ctx.from.id, estado);

  const lineas = [
    `*Confirmar ingreso:*\n`,
    `Monto: ${simbolo}${(d.monto ?? 0).toLocaleString("es-AR")} ${moneda}`,
    d.fecha              ? `Fecha: ${d.fecha}` : "",
    d.nombreOrdenante    ? `De: ${d.nombreOrdenante}` : "",
    d.nombreDestinatario ? `Para: ${d.nombreDestinatario}` : "",
    `Casa: ${d.casa ?? "-"}`,
    `Tipo: ${d.detalle ?? "Transferencia"}`,
    d.nroOperacion       ? `Op. ${d.nroOperacion}` : "",
  ].filter(Boolean).join("\n");

  await ctx.replyButtons(lineas, [
    { id: "income_guardar",  title: "✅ Guardar" },
    { id: "income_cancelar", title: "❌ Cancelar" },
  ]);
}

async function guardarIngreso(ctx: WaCtx, estado: EstadoIngreso, moneda: "ARS" | "USD") {
  const d = estado.datos as DatosComprobante & { casa: Casa; detalle?: string; comprobanteUrl?: string };
  const hoy = new Date().toLocaleDateString("es-AR");
  const label = d.detalle || "Transferencia";
  const simbolo = moneda === "USD" ? "U$D" : "$";

  await registrarIngreso({
    id: generarId("ING"),
    fecha: d.fecha || hoy,
    casa: d.casa,
    monto: d.monto ?? 0,
    moneda,
    tipo: "transferencia",
    quienPago: resolverNombre(d.nombreOrdenante ?? ""),
    nombreDestinatario: resolverNombre(d.nombreDestinatario ?? ""),
    bancoDestino: d.bancoDestino ?? "",
    nroOperacion: d.nroOperacion ?? "",
    detalle: label,
    registradoPor: nombreWa(ctx.from.name, ctx.from.id),
    comprobanteUrl: d.comprobanteUrl ?? "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(d.fecha || hoy),
    idReserva: "",
    tipoMovimiento: "directo",
  });

  await ctx.reply(
    `✅ Registrado\n${label} · ${d.casa} · ${simbolo}${(d.monto ?? 0).toLocaleString("es-AR")}`
  );


  await ctx.replyButtons("¿Querés registrar algo más?", MENU_BOTONES);
}
