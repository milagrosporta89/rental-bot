import path from "path";
import {
  generarIdReserva,
  registrarReserva,
  registrarSaldoReserva,
  actualizarCampoReserva,
  listarReservasPendientes,
  buscarReservasPorNombre,
  buscarReservaPorId,
  verificarSolapamiento,
  anularReserva,
  ReservaEncontrada,
  ReservaPendiente,
} from "../services/reservas";
import { registrarIngreso, registrarAudit } from "../services/sheets";
import { procesarComprobante } from "../services/comprobantes";
import { onPhoto as onPhotoIngreso } from "./income";
import { onPhoto as onPhotoGasto } from "./gastos";
import { CASAS, titularDeCasa } from "../config";
import { nombreWa, ahora, generarId, intentarEscape, esEscapePalabra, pedirConfirmacionEscape, EstadosPersistentes } from "../utils";
import { obtenerCotizacion } from "../services/dolar";
import { Casa, Titular, WaCtx, MENU_BOTONES } from "../types";

const TITULARES: Titular[] = ["Paola", "Francisco", "Fernando", "Milagros", "Inés"];

function destinatarioConocido(nombre: string): boolean {
  if (!nombre) return false;
  const n = nombre.toLowerCase();
  return TITULARES.some(t => n.includes(t.toLowerCase()));
}

// ── Estado de conversación ─────────────────────────────────────────────────

interface DatosReserva {
  tipo?: "nueva" | "saldo" | "anular";
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
  // Rama saldo / corrección / anulación
  nroReserva?: string;
  reservaInfo?: ReservaEncontrada;
  montoSaldo?: number;
  monedaSaldo?: "ARS" | "USD";
  listaTemp?: ReservaPendiente[];
  // Cambio pendiente de confirmación (U5)
  pendingChanges?: Array<{ campo: string; valorAnterior: string; valorNuevo: string }>;
  pendingLabel?: string;
}

interface EstadoReserva {
  paso: string;
  datos: DatosReserva;
}

const ESTADOS_FILE = path.join(__dirname, "../../data/estados.json");
const estados = new EstadosPersistentes<EstadoReserva>(ESTADOS_FILE);

// ── Parsers ────────────────────────────────────────────────────────────────

function parsearMontoMoneda(texto: string): { monto: number; moneda: "ARS" | "USD" | null } | null {
  // Solo quitar el $ de prefijo de precio (ej: "$50000"), no el de "u$s"
  const limpio = texto.replace(/^\$/, "").trim();
  const m = limpio.match(/^([\d.,]+)\s*(ARS|USD|u\$s|u\$d|pesos?|d[oó]lares?)?$/i);
  if (!m) return null;
  const monto = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  if (isNaN(monto) || monto <= 0) return null;
  let moneda: "ARS" | "USD" | null = null;
  if (m[2]) {
    const c = m[2].toLowerCase();
    if (c.startsWith("ars") || c.startsWith("peso")) moneda = "ARS";
    else if (c.startsWith("usd") || c.startsWith("u$") || c.startsWith("dol") || c.startsWith("dól")) moneda = "USD";
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
  if (!entrada || !salida) return null;
  if (salida <= entrada) return { entrada: "", salida: "", noches: -1 };

  const noches = Math.round((salida.getTime() - entrada.getTime()) / 86400000);
  const fmt = (date: Date) =>
    `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

  return { entrada: fmt(entrada), salida: fmt(salida), noches };
}

// ── Helpers de lista numerada ──────────────────────────────────────────────

const NUMEROS_EMOJI = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];

function formatearListaNumerada(reservas: ReservaPendiente[]): string {
  return reservas.map((r, i) =>
    `${NUMEROS_EMOJI[i] ?? `*${i + 1}.*`} *${r.casa} · ${r.nombrePax}*\n` +
    `   ${r.fechaEntrada} → ${r.fechaSalida} · saldo USD ${r.saldoUSD}`
  ).join("\n\n");
}

async function mostrarListaYEsperar(ctx: WaCtx, estado: EstadoReserva, reservas: ReservaPendiente[], paso: string, header?: string) {
  estado.datos.listaTemp = reservas;
  estado.paso = paso;
  estados.set(ctx.from.id, estado);
  const prefijo = header ? `${header}\n\n` : "";
  await ctx.reply(
    prefijo +
    formatearListaNumerada(reservas) +
    "\n\nRespondé con el número o escribí *0* para buscar por nombre."
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

  // Si ya tenemos monto del comprobante previo → pedir tipo de pago si falta, luego confirmación
  if (estado.datos.montoSaldo != null) {
    if (!estado.datos.tipoIngreso) {
      await pedirTipoPago(ctx, estado);
    } else {
      await pedirConfirmacionSaldo(ctx, estado);
    }
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

// Procesa una foto usando el pipeline compartido (descarga → Claude → duplicado → storage).
// En caso de duplicado alerta y NO avanza el flujo; para otros errores cae a ingreso manual.
async function procesarFotoEnContexto(
  ctx: WaCtx,
  estado: EstadoReserva,
  mediaId: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
  flujo: "nueva" | "saldo"
) {
  await ctx.reply("Procesando comprobante...");

  estado.datos.pendingMediaId = undefined;
  estado.datos.pendingMimeType = undefined;

  const resultado = await procesarComprobante(mediaId, mimeType, "ingreso");

  if (!resultado.ok) {
    const msgManual = flujo === "nueva"
      ? "Ingresá el monto manualmente (ej: 50000 ARS o 200 USD)."
      : "Ingresá el monto manualmente (ej: 60000 ARS o 300 USD).";

    if (resultado.error.tipo === "duplicado") {
      await ctx.reply(`⚠️ *Comprobante duplicado*\n\n${resultado.error.detalle}`);
      // No avanzamos — el estado queda en el paso actual para reintentar o ingresar manual
      if (flujo === "nueva") { estado.paso = "res_monto_adelanto"; } else { estado.paso = "res_monto_saldo"; }
      estados.set(ctx.from.id, estado);
      await ctx.reply(`Si el pago es correcto, ${msgManual}`);
      return;
    }

    const msgError = resultado.error.tipo === "descarga_fallida"
      ? "No pude descargar la imagen (puede haber expirado)."
      : "No pude leer el comprobante.";

    if (flujo === "nueva") { estado.paso = "res_monto_adelanto"; } else { estado.paso = "res_monto_saldo"; }
    estados.set(ctx.from.id, estado);
    await ctx.reply(`${msgError} ${msgManual}`);
    return;
  }

  const { datos, comprobanteUrl } = resultado;

  // Guardar datos del comprobante para completar columnas de Ingresos
  estado.datos.comprobanteUrl = comprobanteUrl;
  estado.datos.fechaComprobante = datos.fecha ?? "";
  estado.datos.bancoOrigen = datos.bancoOrigen ?? "";
  estado.datos.nroOperacion = datos.nroOperacion ?? "";
  estado.datos.quienPago = datos.nombreOrdenante ?? "";
  estado.datos.nombreDestinatario = datos.nombreDestinatario ?? "";

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
    datos.fecha              ? `Fecha: ${datos.fecha}` : "",
    datos.nombreOrdenante    ? `De: ${datos.nombreOrdenante}` : "",
    datos.nombreDestinatario ? `Para: ${datos.nombreDestinatario}` : "",
    datos.bancoOrigen        ? `Banco: ${datos.bancoOrigen}` : "",
    datos.nroOperacion       ? `Op. ${datos.nroOperacion}` : "",
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

async function pedirQuienRecibio(ctx: WaCtx, estado: EstadoReserva) {
  estado.paso = "res_quien_recibio";
  estados.set(ctx.from.id, estado);
  await ctx.replyButtons(
    "¿Quién recibió el pago?",
    TITULARES.map(t => ({ id: `res_quien_recibio_${t}`, title: t }))
  );
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
      { id: "res_confirmar",     title: "✅ Confirmar" },
      { id: "res_editar_nueva",  title: "✏️ Editar" },
      { id: "res_cancelar",      title: "❌ Cancelar" },
    ]
  );
}

async function pedirConfirmacionSaldo(ctx: WaCtx, estado: EstadoReserva) {
  estado.paso = "res_confirmacion_saldo";
  estados.set(ctx.from.id, estado);
  const info = estado.datos.reservaInfo!;
  const montoSaldo = estado.datos.montoSaldo ?? 0;
  const monedaStr = estado.datos.monedaSaldo === "USD" ? "USD " : "$";
  let montoStr = `${monedaStr}${montoSaldo.toLocaleString("es-AR")}`;

  // Calcular equivalente en USD para comparar con saldo pendiente
  let montoEnUSD = estado.datos.monedaSaldo === "USD" ? montoSaldo : 0;
  if (estado.datos.monedaSaldo !== "USD") {
    const cotiz = await obtenerCotizacion(new Date().toLocaleDateString("es-AR"));
    if (cotiz > 0) {
      estado.datos.cotizacion = cotiz;
      montoEnUSD = Math.round((montoSaldo / cotiz) * 100) / 100;
      montoStr += ` ≈ USD ${montoEnUSD} (cotiz. $${Math.round(cotiz).toLocaleString("es-AR")})`;
    }
  }

  const excedente = montoEnUSD > 0
    ? Math.round((montoEnUSD - info.saldoUSD) * 100) / 100
    : 0;
  const saldoResultante = Math.max(0, Math.round((info.saldoUSD - montoEnUSD) * 100) / 100);

  const avisoExcedente = excedente > 0
    ? `\n\n⚠️ *Este pago supera el saldo pendiente en USD ${excedente.toLocaleString("es-AR")}. Verificá que el monto sea correcto.*`
    : "";
  const avisoResultante = excedente <= 0 && saldoResultante > 0
    ? `\nSaldo restante tras este pago: USD ${saldoResultante.toLocaleString("es-AR")}`
    : "";

  await ctx.replyButtons(
    `💳 *Saldo de reserva*\n\n` +
      `Reserva: *${estado.datos.nroReserva}*\n` +
      `Casa: ${info.casa} · ${info.nombrePax}\n` +
      `Total reserva: USD ${info.montoTotalUSD}\n` +
      `Saldo pendiente: USD ${info.saldoUSD}\n` +
      `Monto recibido: ${montoStr}` +
      avisoResultante +
      avisoExcedente,
    [
      { id: "res_confirmar_saldo",    title: "✅ Confirmar" },
      { id: "res_editar_monto_saldo", title: "✏️ Editar monto" },
      { id: "res_cancelar_saldo",     title: "❌ Cancelar" },
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
      estadoPago: saldoUSD <= 0 ? "COMPLETO" : "ADELANTO_RECIBIDO",
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
      detalle: `#${String(id).padStart(3, "0")} Adelanto reserva · whatsapp_directo`,
      registradoPor: nombreWa(ctx.from.name, ctx.from.id),
      comprobanteUrl: d.comprobanteUrl ?? "",
      timestamp: ahora(),
      cotizacion,
      idReserva: id,
      tipoMovimiento: "adelanto",
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
    estados.delete(ctx.from.id);
    await ctx.reply("Hubo un error al guardar la reserva. Por favor intentá de nuevo.");
    await ctx.replyButtons("¿Qué querés hacer?", MENU_BOTONES);
  }
}

async function guardarSaldo(ctx: WaCtx, estado: EstadoReserva) {
  try {
    const d = estado.datos;
    const info = d.reservaInfo!;
    // Reusar cotización mostrada en confirmación para que el ingreso coincida con lo que vio el usuario
    const cotizacion = d.cotizacion ?? await obtenerCotizacion(new Date().toLocaleDateString("es-AR"));

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
      detalle: [
        `#${String(d.nroReserva).padStart(3, "0")} Saldo reserva · whatsapp_directo`,
        saldoRestanteUSD < 0 ? `excedente USD ${Math.abs(saldoRestanteUSD)}` : "",
      ].filter(Boolean).join(" · "),
      registradoPor: nombreWa(ctx.from.name, ctx.from.id),
      comprobanteUrl: d.comprobanteUrl ?? "",
      timestamp: ahora(),
      cotizacion,
      idReserva: d.nroReserva!,
      tipoMovimiento: "saldo",
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
    estados.delete(ctx.from.id);
    await ctx.reply("Hubo un error al registrar el pago. Por favor intentá de nuevo.");
    await ctx.replyButtons("¿Qué querés hacer?", MENU_BOTONES);
  }
}

async function sesionExpirada(ctx: WaCtx) {
  await ctx.reply("La sesión expiró. Iniciá de nuevo desde el menú.");
  await ctx.replyButtons("¿Qué querés hacer?", MENU_BOTONES);
}

async function pedirConfirmacionCorreccion(ctx: WaCtx, estado: EstadoReserva) {
  estado.paso = "res_corregir_confirmar";
  estados.set(ctx.from.id, estado);
  const info = estado.datos.reservaInfo!;
  await ctx.replyButtons(
    `Reserva #${info.id} · ${info.nombrePax}\n\n${estado.datos.pendingLabel}\n\n¿Confirmás el cambio?`,
    [
      { id: "res_corregir_ok",             title: "✅ Confirmar" },
      { id: "res_corregir_cancelar_cambio", title: "❌ Cancelar" },
    ]
  );
}

async function aplicarCambiosReserva(ctx: WaCtx, estado: EstadoReserva) {
  const info = estado.datos.reservaInfo!;
  const cambios = estado.datos.pendingChanges ?? [];
  for (const c of cambios) {
    await actualizarCampoReserva(info.fila, c.campo as any, c.valorNuevo);
    await registrarAudit({
      idRegistro: info.id,
      tipoRegistro: "reserva",
      campo: c.campo,
      valorAnterior: c.valorAnterior,
      valorNuevo: c.valorNuevo,
      modificadoPor: nombreWa(ctx.from.name, ctx.from.id),
      aprobadoPor: nombreWa(ctx.from.name, ctx.from.id),
    });
  }
  estados.delete(ctx.from.id);
  await ctx.reply(`✅ Cambio aplicado\nReserva #${info.id} · ${info.nombrePax}\n${estado.datos.pendingLabel}`);
  await ctx.replyButtons("¿Querés hacer algo más?", MENU_BOTONES);
}

async function mostrarMenuCorreccion(ctx: WaCtx, info: Pick<ReservaEncontrada, "id" | "casa" | "nombrePax" | "cantidadPax" | "fechaEntrada" | "fechaSalida" | "montoTotalUSD" | "saldoUSD">) {
  const resumen =
    `Reserva #${info.id}\n` +
    `🏠 ${info.casa} · 👤 ${info.nombrePax} · 👥 ${info.cantidadPax} personas\n` +
    `📅 ${info.fechaEntrada} → ${info.fechaSalida} · 💰 USD ${info.montoTotalUSD} · Saldo: USD ${info.saldoUSD}\n\n` +
    `¿Qué campo querés corregir?`;
  await ctx.replyList(resumen, [
    { id: "res_corregir_nombre",   title: "👤 Nombre del huésped" },
    { id: "res_corregir_casa",     title: "🏠 Casa" },
    { id: "res_corregir_fechas",   title: "📅 Fechas entrada/salida" },
    { id: "res_corregir_monto",    title: "💰 Monto total" },
    { id: "res_corregir_personas", title: "👥 Cantidad de personas" },
    { id: "res_cancelar",          title: "❌ Cancelar" },
  ]);
}

// ── Exports ────────────────────────────────────────────────────────────────

export async function onReservaCommand(ctx: WaCtx): Promise<void> {
  estados.set(ctx.from.id, { paso: "res_tipo", datos: {} });
  await pedirTipo(ctx);
}

export async function onCorregirCommand(ctx: WaCtx): Promise<void> {
  estados.set(ctx.from.id, { paso: "res_corregir_buscar", datos: {} });
  await ctx.reply("Escribí el número o el nombre del huésped de la reserva que querés corregir:");
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

  await ctx.replyButtons("¿Para qué es este comprobante?", [
    { id: "res_tipo_nueva",   title: "📋 Reserva nueva" },
    { id: "res_tipo_saldo",   title: "💳 Saldo de reserva" },
    { id: "res_foto_gasto",   title: "💸 Gasto" },
    { id: "res_foto_ingreso", title: "💰 Otro ingreso" },
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
  await ctx.reply("No esperaba una imagen en este paso. Continuá con el texto o los botones del menú.");
  return true;
}

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  if (!buttonId.startsWith("res_")) return false;

  let estado = estados.get(ctx.from.id);

  // ── Tipo (entrada: resetean cualquier flujo previo, salvo foto pendiente) ────
  if (buttonId === "res_tipo_nueva") {
    // Si había un flujo activo (no foto pendiente), descartarlo limpiamente
    const pendingMedia = estado?.datos.pendingMediaId
      ? { pendingMediaId: estado.datos.pendingMediaId, pendingMimeType: estado.datos.pendingMimeType }
      : undefined;
    estado = { paso: "res_tipo", datos: { tipo: "nueva", ...pendingMedia } };

    if (pendingMedia?.pendingMediaId) {
      // Foto enviada antes de iniciar el flujo → procesarla como adelanto
      await procesarFotoEnContexto(ctx, estado, pendingMedia.pendingMediaId, pendingMedia.pendingMimeType!, "nueva");
    } else {
      estado.paso = "res_casa";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿Qué casa?", CASAS.map(c => ({ id: `res_casa_${c}`, title: c })));
    }
    return true;
  }

  if (buttonId === "res_tipo_saldo") {
    const pendingMedia = estado?.datos.pendingMediaId
      ? { pendingMediaId: estado.datos.pendingMediaId, pendingMimeType: estado.datos.pendingMimeType }
      : undefined;
    estado = { paso: "res_tipo", datos: { tipo: "saldo", ...pendingMedia } };

    if (pendingMedia?.pendingMediaId) {
      // Foto enviada antes de iniciar el flujo → procesarla como saldo
      await procesarFotoEnContexto(ctx, estado, pendingMedia.pendingMediaId, pendingMedia.pendingMimeType!, "saldo");
    } else {
      const pendientes = await listarReservasPendientes();
      if (pendientes.length > 0) {
        await mostrarListaYEsperar(ctx, estado, pendientes, "res_elegir_semana", "Reservas con saldo pendiente:");
      } else {
        estado.paso = "res_buscar_nombre";
        estados.set(ctx.from.id, estado);
        await ctx.reply("No hay reservas con saldo pendiente.\n\n¿Nombre del pasajero?");
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

  // ── Gasto directo con foto pendiente ─────────────────────────────────────
  if (buttonId === "res_foto_gasto") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    const { pendingMediaId, pendingMimeType } = estado.datos;
    estados.delete(ctx.from.id);
    if (pendingMediaId) {
      await onPhotoGasto(ctx, pendingMediaId, pendingMimeType ?? "image/jpeg");
    }
    return true;
  }

  // ── Foto confirmada / descartada ──────────────────────────────────────────
  if (buttonId === "res_foto_ok") {
    if (!estado) { await sesionExpirada(ctx); return true; }

    if (estado.datos.tipo === "saldo") {
      // Monto del comprobante confirmado → mostrar lista de reservas
      const pendientes = await listarReservasPendientes();
      if (pendientes.length > 0) {
        await mostrarListaYEsperar(ctx, estado, pendientes, "res_elegir_semana", "Reservas con saldo pendiente:");
      } else {
        estado.paso = "res_buscar_nombre";
        estados.set(ctx.from.id, estado);
        await ctx.reply("No hay reservas con saldo pendiente. ¿Nombre del pasajero?");
      }
    } else if (!estado.datos.casa) {
      // Foto enviada antes de iniciar el flujo de nueva → continuar desde casa
      estado.paso = "res_casa";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons("¿Qué casa?", CASAS.map(c => ({ id: `res_casa_${c}`, title: c })));
    } else {
      // Foto enviada en el paso res_monto_adelanto → pedir tipo de pago
      await pedirTipoPago(ctx, estado);
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
      const pendientes = await listarReservasPendientes();
      if (pendientes.length > 0) {
        await mostrarListaYEsperar(ctx, estado, pendientes, "res_elegir_semana", "Reservas con saldo pendiente:");
      } else {
        estado.paso = "res_buscar_nombre";
        estados.set(ctx.from.id, estado);
        await ctx.reply("No hay reservas con saldo pendiente. ¿Nombre del pasajero?");
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
    estados.set(ctx.from.id, estado);
    if (!destinatarioConocido(estado.datos.nombreDestinatario ?? "")) {
      await pedirQuienRecibio(ctx, estado);
    } else if (estado.datos.tipo === "saldo") {
      await pedirConfirmacionSaldo(ctx, estado);
    } else {
      await pedirConfirmacionNueva(ctx, estado);
    }
    return true;
  }

  // ── Quién recibió el pago ─────────────────────────────────────────────────
  if (buttonId.startsWith("res_quien_recibio_")) {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.datos.nombreDestinatario = buttonId.replace("res_quien_recibio_", "");
    estados.set(ctx.from.id, estado);
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
    const monto = estado.datos.montoAdelantoARS ?? estado.datos.montoAdelantoUSD ?? 0;
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

  // ── Editar campos antes de confirmar nueva reserva ───────────────────────
  if (buttonId === "res_editar_nueva") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    await ctx.replyList(
      "¿Qué campo querés corregir?",
      [
        { id: "res_editar_campo_nombre",   title: "👤 Nombre del huésped" },
        { id: "res_editar_campo_personas", title: "👥 Cantidad de personas" },
        { id: "res_editar_campo_fechas",   title: "📅 Fechas entrada/salida" },
        { id: "res_editar_campo_total",    title: "💰 Monto total USD" },
        { id: "res_editar_campo_adelanto", title: "💳 Monto adelanto" },
      ]
    );
    return true;
  }

  if (buttonId === "res_editar_campo_nombre") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.paso = "res_nombre_pax";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Nombre del/la huésped principal?");
    return true;
  }
  if (buttonId === "res_editar_campo_personas") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.paso = "res_cantidad_pax";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuántas personas?");
    return true;
  }
  if (buttonId === "res_editar_campo_fechas") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.paso = "res_fechas";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Fechas de entrada y salida? (ej: 10/07 - 15/07)");
    return true;
  }
  if (buttonId === "res_editar_campo_total") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.paso = "res_monto_total";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuál es el monto total de la reserva en USD?");
    return true;
  }
  if (buttonId === "res_editar_campo_adelanto") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.paso = "res_monto_adelanto";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuánto fue el adelanto? (ej: 50000 ARS o 200 USD)");
    return true;
  }

  // ── Editar monto antes de confirmar saldo ────────────────────────────────
  if (buttonId === "res_editar_monto_saldo") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.paso = "res_monto_saldo";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuál es el monto recibido? (ej: 50000 ARS o 200 USD)");
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

  // ── Sin resultado de búsqueda ─────────────────────────────────────────────
  if (buttonId === "res_crear_desde_busqueda") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    const nombreGuardado = estado.datos.nombrePax;
    const pendingMedia = estado.datos.pendingMediaId
      ? { pendingMediaId: estado.datos.pendingMediaId, pendingMimeType: estado.datos.pendingMimeType }
      : undefined;
    const nuevoEstado: EstadoReserva = {
      paso: "res_tipo",
      datos: { tipo: "nueva", nombrePax: nombreGuardado, ...pendingMedia },
    };
    estado = nuevoEstado;
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons(
      `Vamos a crear una nueva reserva${nombreGuardado ? ` para *${nombreGuardado}*` : ""}.\n\n¿Cuál es la casa?`,
      CASAS.map(c => ({ id: `res_casa_${c}`, title: c }))
    );
    return true;
  }

  if (buttonId === "res_buscar_otro_nombre") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.paso = "res_buscar_nombre";
    estados.set(ctx.from.id, estado);
    await ctx.reply("Escribí el nombre del pasajero:");
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

  // ── Corrección de reserva ─────────────────────────────────────────────────
  if (buttonId === "res_corregir_nombre") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.paso = "res_corregir_nuevo_nombre";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`Nombre actual: *${estado.datos.reservaInfo!.nombrePax}*\n\nEscribí el nombre correcto:`);
    return true;
  }

  if (buttonId === "res_corregir_casa") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.paso = "res_corregir_nueva_casa";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons(
      `Casa actual: *${estado.datos.reservaInfo!.casa}*\n\n¿Cuál es la casa correcta?`,
      CASAS.map(c => ({ id: `res_corregir_casa_${c}`, title: c }))
    );
    return true;
  }

  if (buttonId === "res_corregir_fechas") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    const info = estado.datos.reservaInfo!;
    estado.paso = "res_corregir_nuevas_fechas";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`Fechas actuales: *${info.fechaEntrada} → ${info.fechaSalida}*\n\nIngresá las nuevas fechas (ej: 10/07 - 15/07):`);
    return true;
  }

  if (buttonId === "res_corregir_monto") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    const info = estado.datos.reservaInfo!;
    estado.paso = "res_corregir_nuevo_monto";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`Monto total actual: *USD ${info.montoTotalUSD}*\n\nIngresá el nuevo monto total en USD (ej: 900):`);
    return true;
  }

  if (buttonId === "res_corregir_personas") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    const info = estado.datos.reservaInfo!;
    estado.paso = "res_corregir_nueva_cantidad_pax";
    estados.set(ctx.from.id, estado);
    await ctx.reply(`Cantidad actual: *${info.cantidadPax} personas*\n\nIngresá la cantidad correcta:`);
    return true;
  }

  if (buttonId.startsWith("res_corregir_casa_")) {
    if (!estado) { await sesionExpirada(ctx); return true; }
    const nuevaCasa = buttonId.replace("res_corregir_casa_", "") as Casa;
    const info = estado.datos.reservaInfo!;
    estado.datos.pendingChanges = [{ campo: "casa", valorAnterior: info.casa, valorNuevo: nuevaCasa }];
    estado.datos.pendingLabel = `Casa: _${info.casa}_ → *${nuevaCasa}*`;
    await pedirConfirmacionCorreccion(ctx, estado);
    return true;
  }

  // ── Confirmar / cancelar corrección (U5) ──────────────────────────────────
  if (buttonId === "res_corregir_ok") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    await aplicarCambiosReserva(ctx, estado);
    return true;
  }

  if (buttonId === "res_corregir_cancelar_cambio") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    estado.datos.pendingChanges = undefined;
    estado.datos.pendingLabel = undefined;
    estado.paso = "res_corregir_campo";
    estados.set(ctx.from.id, estado);
    await mostrarMenuCorreccion(ctx, estado.datos.reservaInfo!);
    return true;
  }

  // ── Anulación de reserva (F2) ─────────────────────────────────────────────
  if (buttonId === "res_anular_confirmar") {
    if (!estado) { await sesionExpirada(ctx); return true; }
    const info = estado.datos.reservaInfo!;
    await anularReserva(info.fila);
    await registrarAudit({
      idRegistro: info.id,
      tipoRegistro: "reserva",
      campo: "estadoPago",
      valorAnterior: info.estadoPago,
      valorNuevo: "ANULADO",
      modificadoPor: nombreWa(ctx.from.name, ctx.from.id),
      aprobadoPor: nombreWa(ctx.from.name, ctx.from.id),
    });
    estados.delete(ctx.from.id);
    await ctx.reply(
      `🚫 *Reserva anulada*\n\n` +
      `#${info.id} · ${info.casa} · ${info.nombrePax}\n` +
      `${info.fechaEntrada} → ${info.fechaSalida}\n\n` +
      `Los pagos ya registrados quedan en la hoja de Ingresos. Revisalos manualmente si hay que gestionar un reembolso.`
    );
    await ctx.replyButtons("¿Querés hacer algo más?", MENU_BOTONES);
    return true;
  }

  if (buttonId === "res_anular_cancelar") {
    estados.delete(ctx.from.id);
    await ctx.reply("Anulación cancelada.");
    await ctx.replyButtons("¿Querés hacer algo más?", MENU_BOTONES);
    return true;
  }

  return false;
}

export async function onText(ctx: WaCtx): Promise<boolean> {
  const tieneEstado = estados.has(ctx.from.id);

  if (tieneEstado && esEscapePalabra(ctx.text ?? "")) {
    await pedirConfirmacionEscape(ctx, () => estados.delete(ctx.from.id));
    return true;
  }
  if (await intentarEscape(ctx, tieneEstado, () => estados.delete(ctx.from.id))) return true;

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
    if (fechas.noches === -1) {
      await ctx.reply("La fecha de salida debe ser posterior a la de entrada. Revisá el orden.");
      return true;
    }
    // F1: verificar solapamiento con otras reservas de la misma casa
    if (estado.datos.casa) {
      const solapadas = await verificarSolapamiento(estado.datos.casa, fechas.entrada, fechas.salida);
      if (solapadas.length > 0) {
        const lista = solapadas.map(r => `• #${r.id} ${r.nombrePax} · ${r.fechaEntrada} → ${r.fechaSalida}`).join("\n");
        await ctx.reply(
          `⚠️ *Posible solapamiento de fechas*\n\n` +
          `${estado.datos.casa} ya tiene ${solapadas.length === 1 ? "una reserva" : "reservas"} en ese período:\n${lista}\n\n` +
          `Si igual querés continuar, volvé a ingresar las mismas fechas para confirmar.`
        );
        // Guardamos las fechas para que si el usuario las reingresa igual, pase sin avisar
        estado.datos.fechaEntrada = fechas.entrada;
        estado.datos.fechaSalida = fechas.salida;
        estado.datos.cantidadNoches = fechas.noches;
        estados.set(ctx.from.id, estado);
        return true;
      }
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
    if (parsed.moneda === "ARS") {
      await ctx.reply("El total de la reserva va en USD. Ingresá el monto en dólares (ej: 800).");
      return true;
    }
    estado.datos.montoTotalUSD = parsed.monto;

    // Si el adelanto ya fue capturado desde un comprobante previo → pedir tipo de pago si falta
    if (estado.datos.montoAdelantoARS != null || estado.datos.montoAdelantoUSD != null) {
      if (!estado.datos.tipoIngreso) {
        await pedirTipoPago(ctx, estado);
      } else {
        await pedirConfirmacionNueva(ctx, estado);
      }
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
      estado.datos.nombrePax = texto;
      estado.paso = "res_sin_resultado";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons(
        `No encontré reservas para "${texto}".`,
        [
          { id: "res_crear_desde_busqueda", title: "➕ Crear reserva nueva" },
          { id: "res_buscar_otro_nombre",   title: "🔍 Buscar otro nombre" },
          { id: "res_cancelar",             title: "❌ Cancelar" },
        ]
      );
      return true;
    }
    if (resultados.length === 1) {
      const r = resultados[0];
      estado.datos.nroReserva = r.id;
      estado.datos.reservaInfo = r;

      // Si hay monto del comprobante previo → pedir tipo de pago si falta, luego confirmación
      if (estado.datos.montoSaldo != null) {
        if (!estado.datos.tipoIngreso) {
          await pedirTipoPago(ctx, estado);
        } else {
          await pedirConfirmacionSaldo(ctx, estado);
        }
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
    await mostrarListaYEsperar(ctx, estado, resultados, "res_elegir_busqueda", `Encontré ${resultados.length} reservas:`);
    return true;
  }

  if (estado.paso === "res_elegir_busqueda") {
    return seleccionarDeListaTemp(ctx, estado, texto);
  }

  // ── Datos de transferencia manual ────────────────────────────────────────
  if (estado.paso === "res_datos_transferencia") {
    if (!texto.trim()) {
      await ctx.reply("Ingresá el nombre del destinatario o presioná *Omitir*.");
      return true;
    }
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

  // ── Flujo de corrección ───────────────────────────────────────────────────

  if (estado.paso === "res_corregir_buscar") {
    if (!texto) { await ctx.reply("Escribí el número o nombre de la reserva."); return true; }
    let reserva: ReservaEncontrada | null = null;
    // Intento por ID numérico primero
    if (/^\d+$/.test(texto)) {
      reserva = await buscarReservaPorId(texto);
    }
    if (!reserva) {
      const resultados = await buscarReservasPorNombre(texto);
      if (resultados.length === 1) reserva = resultados[0];
      else if (resultados.length > 1) {
        estado.datos.listaTemp = resultados;
        estado.paso = "res_corregir_elegir";
        estados.set(ctx.from.id, estado);
        const lista = resultados.map((r, i) => `${i + 1}. #${r.id} · ${r.casa} · ${r.nombrePax}`).join("\n");
        await ctx.reply(`Encontré varias reservas. Escribí el número:\n\n${lista}`);
        return true;
      }
    }
    if (!reserva) {
      await ctx.reply(`No encontré ninguna reserva para "${texto}". Intentá con otro nombre o número.`);
      return true;
    }
    estado.datos.reservaInfo = reserva;
    estado.paso = "res_corregir_campo";
    estados.set(ctx.from.id, estado);
    await mostrarMenuCorreccion(ctx, reserva);
    return true;
  }

  if (estado.paso === "res_corregir_elegir") {
    const idx = parseInt(texto, 10) - 1;
    const lista = estado.datos.listaTemp ?? [];
    if (isNaN(idx) || idx < 0 || idx >= lista.length) {
      await ctx.reply(`Ingresá un número entre 1 y ${lista.length}.`);
      return true;
    }
    estado.datos.reservaInfo = lista[idx];
    estado.datos.listaTemp = undefined;
    estado.paso = "res_corregir_campo";
    estados.set(ctx.from.id, estado);
    await mostrarMenuCorreccion(ctx, lista[idx]);
    return true;
  }

  if (estado.paso === "res_corregir_nuevo_nombre") {
    if (!texto) { await ctx.reply("Escribí el nuevo nombre del huésped."); return true; }
    const info = estado.datos.reservaInfo!;
    estado.datos.pendingChanges = [{ campo: "nombrePax", valorAnterior: info.nombrePax, valorNuevo: texto }];
    estado.datos.pendingLabel = `Nombre: _${info.nombrePax}_ → *${texto}*`;
    await pedirConfirmacionCorreccion(ctx, estado);
    return true;
  }

  if (estado.paso === "res_corregir_nuevas_fechas") {
    const fechas = parsearFechas(texto);
    if (!fechas) {
      await ctx.reply("No pude leer las fechas. Usá el formato: 10/07 - 15/07 o 10/07/2026 - 15/07/2026");
      return true;
    }
    if (fechas.noches === -1) {
      await ctx.reply("La fecha de salida debe ser posterior a la de entrada. Revisá el orden.");
      return true;
    }
    const info = estado.datos.reservaInfo!;
    estado.datos.pendingChanges = [
      { campo: "fechaEntrada", valorAnterior: info.fechaEntrada, valorNuevo: fechas.entrada },
      { campo: "fechaSalida",  valorAnterior: info.fechaSalida,  valorNuevo: fechas.salida  },
    ];
    estado.datos.pendingLabel = `Fechas: _${info.fechaEntrada} → ${info.fechaSalida}_ → *${fechas.entrada} → ${fechas.salida}*`;
    await pedirConfirmacionCorreccion(ctx, estado);
    return true;
  }

  if (estado.paso === "res_corregir_nuevo_monto") {
    const n = parseFloat(texto.replace(/\./g, "").replace(",", "."));
    if (isNaN(n) || n <= 0) {
      await ctx.reply("Ingresá el monto en USD (ej: 900).");
      return true;
    }
    const info = estado.datos.reservaInfo!;
    // R1: recalcular saldoUSD como max(0, nuevoTotal - adelanto)
    const adelantoUSD = info.montoTotalUSD - info.saldoUSD;
    const nuevoSaldo = Math.max(0, Math.round((n - adelantoUSD) * 100) / 100);
    estado.datos.pendingChanges = [
      { campo: "montoTotalUSD", valorAnterior: String(info.montoTotalUSD), valorNuevo: String(n) },
      { campo: "saldoUSD",      valorAnterior: String(info.saldoUSD),      valorNuevo: String(nuevoSaldo) },
    ];
    estado.datos.pendingLabel = `Monto: _USD ${info.montoTotalUSD}_ → *USD ${n}* · Saldo recalculado: *USD ${nuevoSaldo}*`;
    await pedirConfirmacionCorreccion(ctx, estado);
    return true;
  }

  if (estado.paso === "res_corregir_nueva_cantidad_pax") {
    const n = parseInt(texto);
    if (isNaN(n) || n < 1) {
      await ctx.reply("Ingresá un número válido (ej: 4).");
      return true;
    }
    const info = estado.datos.reservaInfo!;
    estado.datos.pendingChanges = [{ campo: "cantidadPax", valorAnterior: String(info.cantidadPax), valorNuevo: String(n) }];
    estado.datos.pendingLabel = `Personas: _${info.cantidadPax}_ → *${n}*`;
    await pedirConfirmacionCorreccion(ctx, estado);
    return true;
  }

  // ── Flujo de anulación (F2) ───────────────────────────────────────────────
  if (estado.paso === "res_anular_buscar") {
    if (!texto) { await ctx.reply("Escribí el número o nombre de la reserva."); return true; }
    let reserva: ReservaEncontrada | null = null;
    if (/^\d+$/.test(texto)) reserva = await buscarReservaPorId(texto);
    if (!reserva) {
      const resultados = await buscarReservasPorNombre(texto);
      if (resultados.length === 1) reserva = resultados[0];
      else if (resultados.length > 1) {
        estado.datos.listaTemp = resultados;
        estado.paso = "res_anular_elegir";
        estados.set(ctx.from.id, estado);
        const lista = resultados.map((r, i) => `${i + 1}. #${r.id} · ${r.casa} · ${r.nombrePax}`).join("\n");
        await ctx.reply(`Encontré varias reservas:\n\n${lista}\n\nEscribí el número:`);
        return true;
      }
    }
    if (!reserva) {
      await ctx.reply(`No encontré ninguna reserva para "${texto}". Intentá con otro nombre o número.`);
      return true;
    }
    if (reserva.estadoPago === "ANULADO") {
      await ctx.reply(`La reserva #${reserva.id} ya está anulada.`);
      await ctx.replyButtons("¿Querés hacer algo más?", MENU_BOTONES);
      return true;
    }
    estado.datos.reservaInfo = reserva;
    estado.paso = "res_anular_confirmar_paso";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons(
      `¿Anular esta reserva?\n\n` +
      `#${reserva.id} · ${reserva.casa} · ${reserva.nombrePax}\n` +
      `${reserva.fechaEntrada} → ${reserva.fechaSalida}\n` +
      `Total: USD ${reserva.montoTotalUSD} · Saldo: USD ${reserva.saldoUSD}\n\n` +
      `⚠️ Los pagos ya registrados quedan en Ingresos. Si hay que gestionar un reembolso, se hace por separado.`,
      [
        { id: "res_anular_confirmar", title: "🚫 Sí, anular" },
        { id: "res_anular_cancelar",  title: "❌ No, cancelar" },
      ]
    );
    return true;
  }

  if (estado.paso === "res_anular_elegir") {
    const idx = parseInt(texto, 10) - 1;
    const lista = estado.datos.listaTemp ?? [];
    if (isNaN(idx) || idx < 0 || idx >= lista.length) {
      await ctx.reply(`Ingresá un número entre 1 y ${lista.length}.`);
      return true;
    }
    const reserva = lista[idx];
    estado.datos.reservaInfo = reserva;
    estado.datos.listaTemp = undefined;
    estado.paso = "res_anular_confirmar_paso";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons(
      `¿Anular esta reserva?\n\n` +
      `#${reserva.id} · ${reserva.casa} · ${reserva.nombrePax}\n` +
      `${reserva.fechaEntrada} → ${reserva.fechaSalida}\n` +
      `Total: USD ${reserva.montoTotalUSD} · Saldo: USD ${reserva.saldoUSD}`,
      [
        { id: "res_anular_confirmar", title: "🚫 Sí, anular" },
        { id: "res_anular_cancelar",  title: "❌ No, cancelar" },
      ]
    );
    return true;
  }

  // Pasos donde el usuario debe usar los botones, no texto libre
  const PASOS_SOLO_BOTONES = ["res_confirmacion", "res_confirmacion_saldo", "res_confirmar_monto_foto", "res_corregir_campo", "res_corregir_confirmar", "res_anular_confirmar_paso", "res_sin_resultado", "res_quien_recibio"];
  if (PASOS_SOLO_BOTONES.includes(estado.paso)) {
    await ctx.reply("Usá los botones de arriba para continuar.");
    return true;
  }

  return false;
}
