import { extraerDatosComprobante } from "../services/claude";
import {
  generarIdReserva,
  registrarReserva,
  registrarSaldoReserva,
  listarReservasSemana,
  buscarReservasPorNombre,
  ReservaEncontrada,
  ReservaPendiente,
} from "../services/reservas";
import { registrarIngreso } from "../services/sheets";
import { onPhoto as onPhotoIngreso } from "./income";
import { CASAS, titularDeCasa } from "../config";
import { nombreWa, ahora, generarId } from "../utils";
import { subirComprobante } from "../services/storage";
import { obtenerCotizacion } from "../services/dolar";
import { downloadMedia } from "../services/whatsapp";
import { Casa, WaCtx, MENU_BOTONES } from "../types";

// ── Estado de conversación ─────────────────────────────────────────────────

interface DatosReserva {
  tipo?: "nueva" | "saldo";
  casa?: Casa;
  nombrePax?: string;
  cantidadPax?: number;
  fechaEntrada?: string;
  fechaSalida?: string;
  cantidadNoches?: number;
  montoTotalUSD?: number;
  montoAdelantoARS?: number;
  montoAdelantoUSD?: number;
  cotizacion?: number;
  comprobanteUrl?: string;
  monedaAdelanto?: "ARS" | "USD";
  tipoIngreso?: "transferencia" | "efectivo";
  // Datos extraídos del comprobante para completar columnas de Ingresos
  fechaComprobante?: string;
  bancoOrigen?: string;
  nroOperacion?: string;
  quienPago?: string;
  nombreDestinatario?: string;
  // Foto enviada sin contexto, pendiente de procesar
  pendingMediaId?: string;
  pendingMimeType?: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  // Rama saldo
  nroReserva?: string;
  reservaInfo?: ReservaEncontrada;
  montoSaldo?: number;
  monedaSaldo?: "ARS" | "USD";
  listaTemp?: ReservaPendiente[];
}

interface EstadoReserva {
  paso: string;
  datos: DatosReserva;
}

const estados = new Map<string, EstadoReserva>();

// ── Parsers ────────────────────────────────────────────────────────────────

function parsearMontoMoneda(texto: string): { monto: number; moneda: "ARS" | "USD" | null } | null {
  const limpio = texto.replace(/\$/g, "").trim();
  const m = limpio.match(/^([\d.,]+)\s*(ARS|USD|pesos?|d[oó]lares?)?$/i);
  if (!m) return null;
  const monto = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  if (isNaN(monto) || monto <= 0) return null;
  let moneda: "ARS" | "USD" | null = null;
  if (m[2]) {
    const c = m[2].toLowerCase();
    if (c.startsWith("ars") || c.startsWith("peso")) moneda = "ARS";
    else if (c.startsWith("usd") || c.startsWith("dol") || c.startsWith("dól")) moneda = "USD";
  }
  return { monto, moneda };
}

function parsearFechas(texto: string): { entrada: string; salida: string; noches: number } | null {
  const partes = texto.split(/\s+[-–]\s+|\s*–\s*|\s+al\s+/i).map(s => s.trim()).filter(Boolean);
  if (partes.length !== 2) return null;

  const currentYear = new Date().getFullYear();

  function parseDate(s: string): Date | null {
    const mm = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
    if (!mm) return null;
    const d = parseInt(mm[1]), mo = parseInt(mm[2]);
    const rawYear = mm[3] ? parseInt(mm[3]) : currentYear;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const fecha = new Date(year, mo - 1, d);
    if (fecha.getFullYear() !== year || fecha.getMonth() !== mo - 1 || fecha.getDate() !== d) return null;
    return fecha;
  }

  const entrada = parseDate(partes[0]);
  const salida = parseDate(partes[1]);
  if (!entrada || !salida || salida <= entrada) return null;

  const noches = Math.round((salida.getTime() - entrada.getTime()) / 86400000);
  const fmt = (date: Date) =>
    `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

  return { entrada: fmt(entrada), salida: fmt(salida), noches };
}

// ── Helpers de lista numerada ──────────────────────────────────────────────

function formatearListaNumerada(reservas: ReservaPendiente[]): string {
  return reservas.map((r, i) =>
    `*${i + 1}.* ${r.casa} · ${r.nombrePax}\n` +
    `   ${r.fechaEntrada} → ${r.fechaSalida} · saldo USD ${r.saldoUSD}`
  ).join("\n\n");
}

async function mostrarListaYEsperar(ctx: WaCtx, estado: EstadoReserva, reservas: ReservaPendiente[], paso: string) {
  estado.datos.listaTemp = reservas;
  estado.paso = paso;
  estados.set(ctx.from.id, estado);
  await ctx.reply(
    formatearListaNumerada(reservas) +
    "\n\nRespondé con el número o escribí *0* para buscar por nombre de pasajero."
  );
}

async function seleccionarDeListaTemp(ctx: WaCtx, estado: EstadoReserva, texto: string): Promise<boolean> {
  const lista = estado.datos.listaTemp ?? [];
  const n = parseInt(texto);
  if (texto.trim() === "0") {
    estado.paso = "res_buscar_nombre";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Nombre del pasajero? (parcial está bien)");
    return true;
  }
  if (isNaN(n) || n < 1 || n > lista.length) {
    await ctx.reply(`Escribí un número del 1 al ${lista.length}, o *0* para buscar por nombre.`);
    return true;
  }
  const reserva = lista[n - 1];
  estado.datos.nroReserva = reserva.id;
  estado.datos.reservaInfo = reserva;
  estado.datos.listaTemp = undefined;

  // Si ya tenemos monto del comprobante previo → ir directo a confirmación
  if (estado.datos.montoSaldo != null) {
    await pedirConfirmacionSaldo(ctx, estado);
    return true;
  }

  estado.paso = "res_monto_saldo";
  estados.set(ctx.from.id, estado);
  await ctx.reply(
    `Reserva #${reserva.id} ✓\n` +
    `${reserva.casa} · ${reserva.nombrePax}\n` +
    `${reserva.fechaEntrada} → ${reserva.fechaSalida} · saldo pendiente: USD ${reserva.saldoUSD}\n\n` +
    `Adjuntá el comprobante de pago para registrar todos los datos, o ingresá el monto manualmente (ej: 60000 ARS o 300 USD).`
  );
  return true;
}

// ── Helpers de comprobante ─────────────────────────────────────────────────

// Procesa una foto: descarga, extrae datos, sube a storage, guarda en estado.
// Muestra confirmación del monto extraído o pide ingreso manual si falla.
async function procesarFotoEnContexto(
  ctx: WaCtx,
  estado: EstadoReserva,
  mediaId: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
  flujo: "nueva" | "saldo"
) {
  await ctx.reply("Procesando comprobante...");

  const { base64 } = await downloadMedia(mediaId);
  const datos = await extraerDatosComprobante(base64, mimeType);

  const fechaStr = new Date().toLocaleDateString("es-AR").replace(/\//g, "-");
  const comprobanteUrl = await subirComprobante(
    base64, mimeType,
    `reserva_${fechaStr}_${datos?.nroOperacion || Date.now()}`
  ).catch(() => "");

  // Guardar datos del comprobante para completar columnas de Ingresos
  estado.datos.comprobanteUrl = comprobanteUrl;
  estado.datos.fechaComprobante = datos?.fecha ?? "";
  estado.datos.bancoOrigen = datos?.bancoOrigen ?? "";
  estado.datos.nroOperacion = datos?.nroOperacion ?? "";
  estado.datos.quienPago = datos?.nombreOrdenante ?? "";
  estado.datos.nombreDestinatario = datos?.nombreDestinatario ?? "";
  estado.datos.pendingMediaId = undefined;
  estado.datos.pendingMimeType = undefined;

  if (datos?.monto && datos.monto > 0) {
    const moneda = datos.moneda === "USD" ? "USD" : "ARS";
    if (flujo === "nueva") {
      estado.datos.monedaAdelanto = moneda;
      if (moneda === "ARS") { estado.datos.montoAdelantoARS = datos.monto; estado.datos.montoAdelantoUSD = undefined; }
      else { estado.datos.montoAdelantoUSD = datos.monto; estado.datos.montoAdelantoARS = undefined; }
    } else {
      estado.datos.montoSaldo = datos.monto;
      estado.datos.monedaSaldo = moneda;
    }
    const simbolo = moneda === "USD" ? "USD " : "$";
    const lineas = [
      `*${simbolo}${datos.monto.toLocaleString("es-AR")} ${moneda}*`,
      datos.fecha               ? `Fecha: ${datos.fecha}` : "",
      datos.nombreOrdenante     ? `De: ${datos.nombreOrdenante}` : "",
      datos.nombreDestinatario  ? `Para: ${datos.nombreDestinatario}` : "",
      datos.bancoOrigen         ? `Banco: ${datos.bancoOrigen}` : "",
      datos.nroOperacion        ? `Op. ${datos.nroOperacion}` : "",
    ].filter(Boolean).join("\n");
    estado.paso = "res_confirmar_monto_foto";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons(
      `Del comprobante extraje:\n\n${lineas}\n\n¿Es correcto?`,
      [
        { id: "res_foto_ok", title: "✅ Sí, es correcto" },
        { id: "res_foto_manual", title: "✏️ Ingresar manualmente" },
      ]
    );
  } else {
    // No se pudo extraer monto
    if (flujo === "nueva") {
      estado.paso = "res_monto_adelanto";
      estados.set(ctx.from.id, estado);
      await ctx.reply("Comprobante guardado, pero no pude extraer el monto. ¿Cuánto fue el adelanto? (ej: 50000 ARS o 200 USD)");
    } else {
      estado.paso = "res_monto_saldo";
      estados.set(ctx.from.id, estado);
      await ctx.reply("Comprobante guardado, pero no pude extraer el monto. ¿Cuánto pagó el huésped? (ej: 60000 ARS o 300 USD)");
    }
  }
}

// ── Formateo de resumen ────────────────────────────────────────────────────

function formatearResumenNueva(d: DatosReserva, id?: string): string {
  const titular = d.casa ? (titularDeCasa(d.casa) ?? "-") : "-";

  let adelantoLinea: string;
  if (d.montoAdelantoARS && d.montoAdelantoUSD) {
    const cotizStr = d.cotizacion ? ` · cotiz. $${Math.round(d.cotizacion).toLocaleString("es-AR")}` : "";
    adelantoLinea = `$${d.montoAdelantoARS.toLocaleString("es-AR")} ARS ≈ USD ${d.montoAdelantoUSD}${cotizStr}`;
  } else if (d.montoAdelantoUSD) {
    adelantoLinea = `USD ${d.montoAdelantoUSD}`;
  } else if (d.montoAdelantoARS) {
    adelantoLinea = `$${d.montoAdelantoARS.toLocaleString("es-AR")} ARS`;
  } else {
    adelantoLinea = "-";
  }

  const saldo =
    d.montoTotalUSD != null && d.montoAdelantoUSD != null
      ? `USD ${Math.max(0, d.montoTotalUSD - d.montoAdelantoUSD)}`
      : "-";

  return (
    `${id ? `ID: *${id}*\n` : ""}` +
    `Casa: ${d.casa ?? "-"} (${titular})\n` +
    `Huésped: ${d.nombrePax ?? "-"} · ${d.cantidadPax ?? "-"} personas\n` +
    `Fechas: ${d.fechaEntrada ?? "-"} → ${d.fechaSalida ?? "-"} (${d.cantidadNoches ?? "-"} noches)\n` +
    `Total: USD ${d.montoTotalUSD ?? "-"}\n` +
    `Adelanto: ${adelantoLinea}\n` +
    `Saldo pendiente: ${saldo}`
  );
}

// ── Helpers internos ───────────────────────────────────────────────────────

async function pedirTipo(ctx: WaCtx) {
  await ctx.replyButtons("¿Qué tipo de operación?", [
    { id: "res_tipo_nueva", title: "📋 Reserva nueva" },
    { id: "res_tipo_saldo", title: "💳 Saldo de reserva existente" },
  ]);
}

async function pedirTipoPago(ctx: WaCtx, estado: EstadoReserva) {
  estados.set(ctx.from.id, estado);
  await ctx.replyButtons("¿Cómo fue el pago?", [
    { id: "res_pago_transferencia", title: "🏦 Transferencia" },
    { id: "res_pago_efectivo", title: "💵 Efectivo" },
  ]);
}

async function pedirConfirmacionNueva(ctx: WaCtx, estado: EstadoReserva) {
  const d = estado.datos;
  if (!d.cotizacion) {
    d.cotizacion = await obtenerCotizacion(new Date().toLocaleDateString("es-AR"));
  }
  if (d.cotizacion > 0) {
    if (d.montoAdelantoARS && !d.montoAdelantoUSD) {
      d.montoAdelantoUSD = Math.round((d.montoAdelantoARS / d.cotizacion) * 100) / 100;
    } else if (d.montoAdelantoUSD && !d.montoAdelantoARS) {
      d.montoAdelantoARS = Math.round(d.montoAdelantoUSD * d.cotizacion);
    }
  }
  estado.paso = "res_confirmacion";
  estados.set(ctx.from.id, estado);
  await ctx.replyButtons(
    `📋 *Resumen de reserva*\n\n${formatearResumenNueva(estado.datos)}`,
    [
      { id: "res_confirmar", title: "✅ Confirmar" },
      { id: "res_cancelar", title: "❌ Cancelar" },
    ]
  );
}

async function pedirConfirmacionSaldo(ctx: WaCtx, estado: EstadoReserva) {
  estado.paso = "res_confirmacion_saldo";
  estados.set(ctx.from.id, estado);
  const info = estado.datos.reservaInfo!;
  const monedaStr = estado.datos.monedaSaldo === "USD" ? "USD " : "$";
  const montoStr = `${monedaStr}${(estado.datos.montoSaldo ?? 0).toLocaleString("es-AR")}`;
  await ctx.replyButtons(
    `💳 *Saldo de reserva*\n\n` +
      `Reserva: *${estado.datos.nroReserva}*\n` +
      `Casa: ${info.casa} · ${info.nombrePax}\n` +
      `Total reserva: USD ${info.montoTotalUSD}\n` +
      `Saldo USD registrado: ${info.saldoUSD}\n` +
      `Monto recibido: ${montoStr}`,
    [
      { id: "res_confirmar_saldo", title: "✅ Confirmar" },
      { id: "res_cancelar_saldo", title: "❌ Cancelar" },
    ]
  );
}

async function guardarNuevaReserva(ctx: WaCtx, estado: EstadoReserva) {
  try {
    const d = estado.datos;
    const hoy = new Date().toLocaleDateString("es-AR");
    const cotizacion = d.cotizacion ?? await obtenerCotizacion(hoy);
    const id = await generarIdReserva();

    const adelantoARS = d.montoAdelantoARS ?? 0;
    const adelantoUSD = d.montoAdelantoUSD ?? 0;
    const saldoUSD = Math.max(0, (d.montoTotalUSD ?? 0) - adelantoUSD);

    await registrarReserva({
      id,
      fechaRegistro: hoy,
      casa: d.casa!,
      titular: titularDeCasa(d.casa!)!,
      nombrePax: d.nombrePax!,
      cantidadPax: d.cantidadPax!,
      cantidadNoches: d.cantidadNoches!,
      fechaEntrada: d.fechaEntrada!,
      fechaSalida: d.fechaSalida!,
      montoTotalUSD: d.montoTotalUSD!,
      montoAdelantoARS: adelantoARS,
      montoAdelantoUSD: adelantoUSD,
      saldoUSD,
      estadoPago: "ADELANTO_RECIBIDO",
      comprobanteUrl: d.comprobanteUrl ?? "",
      registradoPor: nombreWa(ctx.from.name, ctx.from.id),
      timestamp: ahora(),
      cotizacion,
      plataforma: "whatsapp_directo",
    });

    const monedaAdelanto = d.monedaAdelanto ?? (adelantoARS > 0 ? "ARS" : "USD");
    const montoAdelanto = monedaAdelanto === "USD" ? adelantoUSD : adelantoARS;
    await registrarIngreso({
      id: generarId("ING"),
      fecha: d.fechaComprobante || hoy,
      casa: d.casa!,
      monto: montoAdelanto,
      moneda: monedaAdelanto,
      tipo: d.tipoIngreso ?? "transferencia",
      quienPago: d.quienPago || d.nombrePax!,
      nombreDestinatario: d.nombreDestinatario ?? "",
      bancoOrigen: d.bancoOrigen ?? "",
      nroOperacion: d.nroOperacion ?? "",
      detalle: `Adelanto reserva #${id} · whatsapp_directo`,
      registradoPor: nombreWa(ctx.from.name, ctx.from.id),
      comprobanteUrl: d.comprobanteUrl ?? "",
      timestamp: ahora(),
      cotizacion,
    });

    estados.delete(ctx.from.id);
    d.montoAdelantoARS = adelantoARS;
    d.montoAdelantoUSD = adelantoUSD;

    await ctx.reply(
      `✅ *Reserva registrada*\n\n${formatearResumenNueva(d, id)}\n\nCotización: $${cotizacion.toLocaleString("es-AR")}/USD`
    );
    await ctx.replyButtons("¿Querés registrar algo más?", MENU_BOTONES);
  } catch (e: any) {
    console.error("Error guardarNuevaReserva:", e?.response?.data ?? e?.message ?? e);
    await ctx.reply("Error guardando la reserva. Intentá de nuevo.");
  }
}

async function guardarSaldo(ctx: WaCtx, estado: EstadoReserva) {
  try {
    const d = estado.datos;
    const info = d.reservaInfo!;
    const cotizacion = await obtenerCotizacion(new Date().toLocaleDateString("es-AR"));

    const monto = d.montoSaldo ?? 0;
    const saldoUSD = d.monedaSaldo === "USD" ? monto : cotizacion > 0 ? Math.round((monto / cotizacion) * 100) / 100 : 0;
    const hoy = new Date().toLocaleDateString("es-AR");

    const saldoPrevioUSD = info.saldoUSD;
    const saldoRestanteUSD = Math.max(0, Math.round((saldoPrevioUSD - saldoUSD) * 100) / 100);
    const estadoPago = saldoRestanteUSD <= 0 ? "COMPLETO" : "SALDO_RECIBIDO";

    console.log("guardarSaldo →", {
      fila: info.fila,
      monedaSaldo: d.monedaSaldo,
      monto,
      cotizacion,
      saldoUSD,
      saldoPrevioUSD,
      saldoRestanteUSD,
      estadoPago,
    });

    await registrarSaldoReserva(info.fila, estadoPago, saldoRestanteUSD);

    await registrarIngreso({
      id: generarId("ING"),
      fecha: d.fechaComprobante || hoy,
      casa: info.casa,
      monto,
      moneda: d.monedaSaldo ?? "ARS",
      tipo: d.tipoIngreso ?? "transferencia",
      quienPago: d.quienPago || info.nombrePax,
      nombreDestinatario: d.nombreDestinatario ?? "",
      bancoOrigen: d.bancoOrigen ?? "",
      nroOperacion: d.nroOperacion ?? "",
      detalle: `Saldo reserva #${d.nroReserva} · whatsapp_directo`,
      registradoPor: nombreWa(ctx.from.name, ctx.from.id),
      comprobanteUrl: d.comprobanteUrl ?? "",
      timestamp: ahora(),
      cotizacion,
    });

    const monedaStr = d.monedaSaldo === "USD" ? "USD " : "$";
    const estadoLinea = estadoPago === "COMPLETO"
      ? "✅ Reserva COMPLETA"
      : `⚠️ Saldo restante: USD ${saldoRestanteUSD.toLocaleString("es-AR")}`;
    estados.delete(ctx.from.id);
    await ctx.reply(
      `✅ *Pago registrado*\n\n` +
        `Reserva: ${d.nroReserva}\n` +
        `Casa: ${info.casa} · ${info.nombrePax}\n` +
        `Monto recibido: ${monedaStr}${monto.toLocaleString("es-AR")}\n` +
        estadoLinea
    );
    await ctx.replyButtons("¿Querés registrar algo más?", MENU_BOTONES);
  } catch (e: any) {
    console.error("Error guardarSaldo:", e?.response?.data ?? e?.message ?? e);
    await ctx.reply("Error actualizando la reserva. Intentá de nuevo.");
  }
}

async function sesionExpirada(ctx: WaCtx) {
  await ctx.reply("La sesión expiró. Iniciá de nuevo desde el menú.");
  await ctx.replyButtons("¿Qué querés hacer?", MENU_BOTONES);
}

// ── Exports ────────────────────────────────────────────────────────────────

export async function onReservaCommand(ctx: WaCtx): Promise<void> {
  estados.set(ctx.from.id, { paso: "res_tipo", datos: {} });
  await pedirTipo(ctx);
}

// Foto enviada SIN estado activo: intercepción antes del handler de ingresos.
// Pregunta si es adelanto de reserva nueva, saldo de reserva, o ingreso directo.
export async function onPhotoSinContexto(
  ctx: WaCtx,
  mediaId: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
): Promise<boolean> {
  if (estados.has(ctx.from.id)) return false;

  estados.set(ctx.from.id, {
    paso: "res_foto_pendiente",
    datos: { pendingMediaId: mediaId, pendingMimeType: mimeType },
  });

  await ctx.replyButtons("¿Qué registrás con este comprobante?", [
    { id: "res_tipo_nueva", title: "📋 Reserva nueva" },
    { id: "res_tipo_saldo", title: "💳 Saldo de reserva" },
    { id: "res_foto_ingreso", title: "📎 Otros" },
  ]);
  return true;
}

// Foto enviada dentro de un flujo activo (paso res_monto_adelanto o res_monto_saldo).
export async function onPhoto(
  ctx: WaCtx,
  mediaId: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
): Promise<boolean> {
  const estado = estados.get(ctx.from.id);
  if (!estado) return false;

  if (estado.paso === "res_monto_adelanto") {
    await procesarFotoEnContexto(ctx, estado, mediaId, mimeType, "nueva");
    return true;
  }
  if (estado.paso === "res_monto_saldo") {
    await procesarFotoEnContexto(ctx, estado, mediaId, mimeType, "saldo");
    return true;
  }
  return false;
}

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  if (!buttonId.startsWith("res_")) return false;

  let estado = estados.get(ctx.from.id);

  // ── Tipo (entrada: no requieren estado previo) ─────────────────────────────
  if (buttonId === "res_tipo_nueva") {
    if (!estado) estado = { paso: "res_tipo", datos: {} };
    estado.datos.tipo = "nueva";

    if (estado.datos.pendingMediaId) {
      // Foto enviada antes de iniciar el flujo → procesarla como adelanto
      const { pendingMediaId, pendingMimeType } = estado.datos;
      await procesarFotoEnContexto(ctx, estado, pendingMediaId, pendingMimeType!, "nueva");
    } else {
      estado.paso = "res_casa";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿Qué casa?", CASAS.map(c => ({ id: `res_casa_${c}`, title: c })));
    }
    return true;
  }

  if (buttonId === "res_tipo_saldo") {
    if (!estado) estado = { paso: "res_tipo", datos: {} };
    estado.datos.tipo = "saldo";

    if (estado.datos.pendingMediaId) {
      // Foto enviada antes de iniciar el flujo → procesarla como saldo
      const { pendingMediaId, pendingMimeType } = estado.datos;
      await procesarFotoEnContexto(ctx, estado, pendingMediaId, pendingMimeType!, "saldo");
    } else {
      const semana = await listarReservasSemana();
      if (semana.length > 0) {
        await ctx.reply("Check-ins esta semana con saldo pendiente:\n\n");
        await mostrarListaYEsperar(ctx, estado, semana, "res_elegir_semana");
      } else {
        estado.paso = "res_buscar_nombre";
        estados.set(ctx.from.id, estado);
        await ctx.reply("No hay check-ins esta semana con saldo pendiente.\n\n¿Nombre del pasajero?");
      }
    }
    return true;
  }

  // ── Ingreso directo con foto pendiente ────────────────────────────────────
  if (buttonId === "res_foto_ingreso") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    const { pendingMediaId, pendingMimeType } = estado.datos;
    estados.delete(ctx.from.id);
    if (pendingMediaId) {
      await onPhotoIngreso(ctx, pendingMediaId, pendingMimeType ?? "image/jpeg");
    }
    return true;
  }

  // ── Foto confirmada / descartada ──────────────────────────────────────────
  if (buttonId === "res_foto_ok") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.datos.tipoIngreso = "transferencia";

    if (estado.datos.tipo === "saldo") {
      // Monto del comprobante confirmado → mostrar lista de reservas
      const semana = await listarReservasSemana();
      if (semana.length > 0) {
        await ctx.reply("Check-ins esta semana con saldo pendiente:\n\n");
        await mostrarListaYEsperar(ctx, estado, semana, "res_elegir_semana");
      } else {
        estado.paso = "res_buscar_nombre";
        estados.set(ctx.from.id, estado);
        await ctx.reply("No hay check-ins esta semana. ¿Nombre del pasajero?");
      }
    } else if (!estado.datos.casa) {
      // Foto enviada antes de iniciar el flujo de nueva → continuar desde casa
      estado.paso = "res_casa";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿Qué casa?", CASAS.map(c => ({ id: `res_casa_${c}`, title: c })));
    } else {
      // Foto enviada en el paso res_monto_adelanto → ir a confirmación
      await pedirConfirmacionNueva(ctx, estado);
    }
    return true;
  }

  if (buttonId === "res_foto_manual") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    // Limpiar datos del comprobante
    estado.datos.montoAdelantoARS = undefined;
    estado.datos.montoAdelantoUSD = undefined;
    estado.datos.montoSaldo = undefined;
    estado.datos.monedaSaldo = undefined;
    estado.datos.bancoOrigen = undefined;
    estado.datos.nroOperacion = undefined;
    estado.datos.quienPago = undefined;

    if (estado.datos.tipo === "saldo") {
      // Mostrar lista de reservas; monto se pide después
      const semana = await listarReservasSemana();
      if (semana.length > 0) {
        await ctx.reply("Check-ins esta semana con saldo pendiente:\n\n");
        await mostrarListaYEsperar(ctx, estado, semana, "res_elegir_semana");
      } else {
        estado.paso = "res_buscar_nombre";
        estados.set(ctx.from.id, estado);
        await ctx.reply("No hay check-ins esta semana. ¿Nombre del pasajero?");
      }
    } else if (!estado.datos.casa) {
      // Foto enviada antes de flujo → continuar desde casa
      estado.paso = "res_casa";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿Qué casa?", CASAS.map(c => ({ id: `res_casa_${c}`, title: c })));
    } else {
      estado.paso = "res_monto_adelanto";
      estados.set(ctx.from.id, estado);
      await ctx.reply("¿Cuánto fue el adelanto? (ej: 50000 ARS o 200 USD)");
    }
    return true;
  }

  // ── Casa ──────────────────────────────────────────────────────────────────
  if (buttonId.startsWith("res_casa_")) {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.datos.casa = buttonId.replace("res_casa_", "") as Casa;
    estado.paso = "res_nombre_pax";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`Casa: *${estado.datos.casa}* ✓\n\n¿Nombre del/la huésped principal?`);
    return true;
  }

  // ── Medio de pago ─────────────────────────────────────────────────────────
  if (buttonId === "res_pago_transferencia" || buttonId === "res_pago_efectivo") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.datos.tipoIngreso = buttonId === "res_pago_transferencia" ? "transferencia" : "efectivo";
    // Si eligió transferencia sin comprobante, pedir destinatario
    if (buttonId === "res_pago_transferencia" && !estado.datos.nombreDestinatario) {
      estado.paso = "res_datos_transferencia";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons(
        "¿A quién fue la transferencia? (nombre del titular o alias de la cuenta)",
        [{ id: "res_omitir_nro", title: "Omitir" }]
      );
      return true;
    }
    if (estado.datos.tipo === "saldo") {
      await pedirConfirmacionSaldo(ctx, estado);
    } else {
      await pedirConfirmacionNueva(ctx, estado);
    }
    return true;
  }

  // ── Omitir número de operación ────────────────────────────────────────────
  if (buttonId === "res_omitir_nro") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    if (estado.datos.tipo === "saldo") {
      await pedirConfirmacionSaldo(ctx, estado);
    } else {
      await pedirConfirmacionNueva(ctx, estado);
    }
    return true;
  }

  // ── Moneda adelanto (cuando no se detectó en el texto) ────────────────────
  if (buttonId === "res_moneda_ARS" || buttonId === "res_moneda_USD") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    const moneda = buttonId === "res_moneda_ARS" ? "ARS" : "USD";
    const monto = estado.datos.montoAdelantoARS ?? 0;
    estado.datos.monedaAdelanto = moneda;
    if (moneda === "ARS") {
      estado.datos.montoAdelantoARS = monto;
      estado.datos.montoAdelantoUSD = undefined;
    } else {
      estado.datos.montoAdelantoUSD = monto;
      estado.datos.montoAdelantoARS = undefined;
    }
    await pedirTipoPago(ctx, estado);
    return true;
  }

  // ── Moneda saldo (cuando no se detectó en el texto) ───────────────────────
  if (buttonId === "res_saldo_moneda_ARS" || buttonId === "res_saldo_moneda_USD") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.datos.monedaSaldo = buttonId === "res_saldo_moneda_ARS" ? "ARS" : "USD";
    await pedirTipoPago(ctx, estado);
    return true;
  }

  // ── Confirmar / cancelar nueva reserva ────────────────────────────────────
  if (buttonId === "res_confirmar") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    await guardarNuevaReserva(ctx, estado);
    return true;
  }

  if (buttonId === "res_cancelar") {
    estados.delete(ctx.from.id);
    await ctx.reply("Registro cancelado.");
    await ctx.replyButtons("¿Qué querés hacer?", MENU_BOTONES);
    return true;
  }

  // ── Confirmar / cancelar saldo ────────────────────────────────────────────
  if (buttonId === "res_confirmar_saldo") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    await guardarSaldo(ctx, estado);
    return true;
  }

  if (buttonId === "res_cancelar_saldo") {
    estados.delete(ctx.from.id);
    await ctx.reply("Registro cancelado.");
    await ctx.replyButtons("¿Qué querés hacer?", MENU_BOTONES);
    return true;
  }

  return false;
}

export async function onText(ctx: WaCtx): Promise<boolean> {
  const estado = estados.get(ctx.from.id);
  if (!estado || !estado.paso.startsWith("res_")) return false;

  const texto = ctx.text?.trim() ?? "";

  // ── Rama nueva reserva ────────────────────────────────────────────────────

  if (estado.paso === "res_nombre_pax") {
    if (!texto) { await ctx.reply("Escribí el nombre del/la huésped."); return true; }
    estado.datos.nombrePax = texto;
    estado.paso = "res_cantidad_pax";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`Huésped: *${texto}* ✓\n\n¿Cuántas personas?`);
    return true;
  }

  if (estado.paso === "res_cantidad_pax") {
    const n = parseInt(texto);
    if (isNaN(n) || n < 1) { await ctx.reply("Ingresá un número válido (ej: 4)."); return true; }
    estado.datos.cantidadPax = n;
    estado.paso = "res_fechas";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`${n} personas ✓\n\n¿Fechas de entrada y salida? (ej: 10/07 - 15/07)`);
    return true;
  }

  if (estado.paso === "res_fechas") {
    const fechas = parsearFechas(texto);
    if (!fechas) {
      await ctx.reply("No pude leer las fechas. Usá el formato: 10/07 - 15/07 o 10/07/2026 - 15/07/2026");
      return true;
    }
    estado.datos.fechaEntrada = fechas.entrada;
    estado.datos.fechaSalida = fechas.salida;
    estado.datos.cantidadNoches = fechas.noches;
    estado.paso = "res_monto_total";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`${fechas.entrada} → ${fechas.salida} (${fechas.noches} noches) ✓\n\n¿Cuál es el monto total de la reserva en USD?`);
    return true;
  }

  if (estado.paso === "res_monto_total") {
    const parsed = parsearMontoMoneda(texto);
    if (!parsed || parsed.monto <= 0) {
      await ctx.reply("Ingresá el monto total en USD (ej: 800).");
      return true;
    }
    estado.datos.montoTotalUSD = parsed.monto;

    // Si el adelanto ya fue capturado desde un comprobante previo → ir a confirmación
    if (estado.datos.montoAdelantoARS != null || estado.datos.montoAdelantoUSD != null) {
      await pedirConfirmacionNueva(ctx, estado);
    } else {
      estado.paso = "res_monto_adelanto";
      estados.set(ctx.from.id, estado);
      await ctx.reply(
        `Total: *USD ${parsed.monto}* ✓\n\n` +
        `Adjuntá el comprobante del adelanto para completar todos los datos del ingreso, ` +
        `o ingresá el monto manualmente (ej: 50000 ARS o 200 USD).`
      );
    }
    return true;
  }

  if (estado.paso === "res_monto_adelanto") {
    const parsed = parsearMontoMoneda(texto);
    if (!parsed || parsed.monto <= 0) {
      await ctx.reply("Formato inválido. Ej: 50000 ARS o 200 USD");
      return true;
    }
    if (parsed.moneda === "ARS") {
      estado.datos.monedaAdelanto = "ARS";
      estado.datos.montoAdelantoARS = parsed.monto;
      estado.datos.montoAdelantoUSD = undefined;
      await pedirTipoPago(ctx, estado);
    } else if (parsed.moneda === "USD") {
      estado.datos.monedaAdelanto = "USD";
      estado.datos.montoAdelantoUSD = parsed.monto;
      estado.datos.montoAdelantoARS = undefined;
      await pedirTipoPago(ctx, estado);
    } else {
      estado.datos.montoAdelantoARS = parsed.monto;
      estado.paso = "res_moneda_adelanto";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿En qué moneda fue el adelanto?", [
        { id: "res_moneda_ARS", title: "🇦🇷 Pesos (ARS)" },
        { id: "res_moneda_USD", title: "🇺🇸 Dólares (USD)" },
      ]);
    }
    return true;
  }

  // ── Rama saldo: selección de reserva ─────────────────────────────────────

  if (estado.paso === "res_elegir_semana") {
    return seleccionarDeListaTemp(ctx, estado, texto);
  }

  if (estado.paso === "res_buscar_nombre") {
    if (!texto) { await ctx.reply("Escribí el nombre del pasajero."); return true; }
    const resultados = await buscarReservasPorNombre(texto);
    if (resultados.length === 0) {
      await ctx.reply(`No encontré reservas para "${texto}". Intentá con otro nombre.`);
      return true;
    }
    if (resultados.length === 1) {
      const r = resultados[0];
      estado.datos.nroReserva = r.id;
      estado.datos.reservaInfo = r;

      // Si hay monto del comprobante previo → ir a confirmación directamente
      if (estado.datos.montoSaldo != null) {
        await pedirConfirmacionSaldo(ctx, estado);
        return true;
      }

      estado.paso = "res_monto_saldo";
      estados.set(ctx.from.id, estado);
      await ctx.reply(
        `Reserva #${r.id} ✓\n${r.casa} · ${r.nombrePax}\n` +
        `${r.fechaEntrada} → ${r.fechaSalida} · saldo pendiente: USD ${r.saldoUSD}\n\n` +
        `Adjuntá el comprobante de pago o ingresá el monto manualmente (ej: 60000 ARS o 300 USD).`
      );
      return true;
    }
    await ctx.reply(`Encontré ${resultados.length} reservas:\n\n`);
    await mostrarListaYEsperar(ctx, estado, resultados, "res_elegir_busqueda");
    return true;
  }

  if (estado.paso === "res_elegir_busqueda") {
    return seleccionarDeListaTemp(ctx, estado, texto);
  }

  // ── Datos de transferencia manual ────────────────────────────────────────
  if (estado.paso === "res_datos_transferencia") {
    estado.datos.nombreDestinatario = texto.trim();
    if (estado.datos.tipo === "saldo") {
      await pedirConfirmacionSaldo(ctx, estado);
    } else {
      await pedirConfirmacionNueva(ctx, estado);
    }
    return true;
  }

  // ── Rama saldo: monto ─────────────────────────────────────────────────────

  if (estado.paso === "res_monto_saldo") {
    const parsed = parsearMontoMoneda(texto);
    if (!parsed || parsed.monto <= 0) {
      await ctx.reply("Formato inválido. Ej: 60000 ARS o 300 USD");
      return true;
    }
    estado.datos.montoSaldo = parsed.monto;
    if (parsed.moneda) {
      estado.datos.monedaSaldo = parsed.moneda;
      await pedirTipoPago(ctx, estado);
    } else {
      estado.paso = "res_moneda_saldo";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿En qué moneda fue el pago?", [
        { id: "res_saldo_moneda_ARS", title: "🇦🇷 Pesos (ARS)" },
        { id: "res_saldo_moneda_USD", title: "🇺🇸 Dólares (USD)" },
      ]);
    }
    return true;
  }

  return false;
}
