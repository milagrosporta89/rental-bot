import { registrarGasto, registrarComision } from "../services/sheets";
import { obtenerCotizacion } from "../services/dolar";
import { procesarComprobante } from "../services/comprobantes";
import { nombreWa, ahora, fechaHoy, validarFecha, validarMonto, generarId } from "../utils";
import { formatearResumenComprobante, detectarTitular, manejarCorreccion } from "./common";
import { CategoriaGasto, DatosComprobante, Titular, WaCtx, MENU_BOTONES } from "../types";
import { resolverNombre } from "../config";

// ── Estado ────────────────────────────────────────────────────────────────

type TipoGasto = "comprobante" | "manual";

interface EstadoGasto {
  paso: string;
  tipo: TipoGasto;
  datos: Partial<DatosComprobante> & {
    comprobanteUrl?: string;
    categoria?: string;
    pagadoPor?: string;
    detalle?: string;
  };
  corregido?: boolean;
}

const estados = new Map<string, EstadoGasto>();

// ── Constantes ────────────────────────────────────────────────────────────

const CATEGORIAS_GASTO: CategoriaGasto[] = [
  "limpieza", "lavanderia", "expensas",
  "luz", "gas", "mantenimiento", "internet",
  "marketing", "impuestos", "otro",
];

const TITULARES_PAGADOR: Titular[] = ["Francisco", "Fernando", "Paola", "Milagros", "Inés"];

// ── Helpers UI ────────────────────────────────────────────────────────────

async function pedirCategoria(ctx: WaCtx) {
  await ctx.replyButtons(
    "¿A qué categoría corresponde el gasto?",
    CATEGORIAS_GASTO.map((cat) => ({
      id: `gasto_cat_${cat}`,
      title: cat.charAt(0).toUpperCase() + cat.slice(1),
    }))
  );
}

async function pedirPagador(ctx: WaCtx) {
  await ctx.replyButtons(
    "¿Quién realizó el pago?",
    [...TITULARES_PAGADOR.map((t) => ({ id: `gasto_quien_${t}`, title: t })), { id: "gasto_quien_otro", title: "✏️ Otro" }]
  );
}

async function pedirDescripcion(ctx: WaCtx) {
  await ctx.replyButtons(
    "¿Querés agregar un comentario? (ej: cuota enero, factura #123)\nO presioná *Omitir* para continuar:",
    [{ id: "gasto_omitir_descripcion", title: "⏭ Omitir" }]
  );
}

// ── Entry points ──────────────────────────────────────────────────────────

export async function onManualGasto(ctx: WaCtx): Promise<void> {
  const estado: EstadoGasto = { paso: "seleccionar_categoria", tipo: "manual", datos: {} };
  estados.set(ctx.from.id, estado);
  await pedirCategoria(ctx);
}

export async function onPhoto(
  ctx: WaCtx,
  mediaId: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
): Promise<void> {
  await ctx.reply("Procesando el comprobante...");
  const resultado = await procesarComprobante(mediaId, mimeType, "gasto");

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
  estados.set(ctx.from.id, { paso: "confirmar_datos", tipo: "comprobante", datos: { ...datos, comprobanteUrl } });

  const titularOrd = detectarTitular(datos.nombreOrdenante ?? "");
  const sugerencia = titularOrd ? `\n\n🔍 Detecté: gasto de ${titularOrd}` : "";

  await ctx.replyButtons(formatearResumenComprobante(datos) + sugerencia, [
    { id: "gasto_confirmar", title: "✅ Confirmar" },
    { id: "gasto_corregir",  title: "✏️ Corregir" },
  ]);
}

// ── Callbacks ─────────────────────────────────────────────────────────────

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  if (!buttonId.startsWith("gasto_")) return false;

  const estado = estados.get(ctx.from.id);

  // Confirmar datos del comprobante → ir a categoría
  if (buttonId === "gasto_confirmar") {
    if (!estado || estado.tipo !== "comprobante") return false;
    estado.paso = "seleccionar_categoria";
    estados.set(ctx.from.id, estado);
    await pedirCategoria(ctx);
    return true;
  }

  // Corregir datos del comprobante
  if (buttonId === "gasto_corregir") {
    if (!estado) return false;
    estado.paso = "corrigiendo";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Qué dato está mal? Escribí el campo y el valor correcto:\n\n*fecha* 15/06/2026\n*destinatario* Nombre Apellido\n\nCuando termines escribí *confirmar*.");
    return true;
  }

  // Categoría
  if (buttonId.startsWith("gasto_cat_")) {
    if (!estado) return false;
    const cat = buttonId.replace("gasto_cat_", "") as CategoriaGasto;

    if (cat === "otro") {
      estado.datos.categoria = "otro";
      estado.paso = "categoria_personalizada";
      estados.set(ctx.from.id, estado);
      await ctx.reply("¿Cómo querés llamar a esta categoría? (ej: seguro, honorarios)");
      return true;
    }

    estado.datos.categoria = cat;

    // Comprobante con titular detectado → pedir descripción antes de guardar
    if (estado.tipo === "comprobante" && !estado.corregido) {
      const titularOrd = detectarTitular((estado.datos as DatosComprobante).nombreOrdenante ?? "");
      if (titularOrd) {
        estado.datos.pagadoPor = titularOrd;
        estado.paso = "pedir_descripcion";
        estados.set(ctx.from.id, estado);
        await pedirDescripcion(ctx);
        return true;
      }
    }

    // Manual, o comprobante sin titular → pedir pagador
    estado.paso = "seleccionar_quien";
    estados.set(ctx.from.id, estado);
    await pedirPagador(ctx);
    return true;
  }

  // Quién pagó
  if (buttonId.startsWith("gasto_quien_")) {
    if (!estado) return false;
    if (buttonId === "gasto_quien_otro") {
      estado.paso = "gasto_quien_manual";
      estados.set(ctx.from.id, estado);
      await ctx.reply("¿Quién realizó el pago? Escribí el nombre:");
      return true;
    }
    const pagadoPor = buttonId.replace("gasto_quien_", "");
    await avanzarDesdePagador(ctx, estado, pagadoPor);
    return true;
  }

  // Moneda (flujo manual)
  if (buttonId.startsWith("gasto_moneda_")) {
    if (!estado || estado.tipo !== "manual") return false;
    estado.datos.moneda = buttonId.replace("gasto_moneda_", "") as "ARS" | "USD";
    estado.paso = "pedir_descripcion";
    estados.set(ctx.from.id, estado);
    await pedirDescripcion(ctx);
    return true;
  }

  // Omitir descripción
  if (buttonId === "gasto_omitir_descripcion") {
    if (!estado) return false;
    estado.datos.detalle = "";
    if (estado.tipo === "manual") {
      estado.paso = "confirmar_manual";
      estados.set(ctx.from.id, estado);
      await mostrarConfirmacionManual(ctx, estado);
    } else {
      await guardarGasto(ctx, estado, estado.datos.pagadoPor ?? "");
      estados.delete(ctx.from.id);
    }
    return true;
  }

  // Guardar (flujo manual)
  if (buttonId === "gasto_guardar") {
    if (!estado || estado.tipo !== "manual") return false;
    await guardarGasto(ctx, estado, estado.datos.pagadoPor ?? "");
    estados.delete(ctx.from.id);
    return true;
  }

  // Cancelar
  if (buttonId === "gasto_cancelar") {
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

  // Corrección de comprobante
  if (await manejarCorreccion(ctx, texto, estado, async (e) => {
    estados.set(ctx.from.id, e);
    await ctx.replyButtons(formatearResumenComprobante(e.datos as DatosComprobante), [
      { id: "gasto_confirmar", title: "✅ Confirmar" },
      { id: "gasto_corregir",  title: "✏️ Seguir corrigiendo" },
    ]);
  })) return true;

  // Nombre libre del pagador
  if (estado.paso === "gasto_quien_manual") {
    if (!texto) { await ctx.reply("Escribí el nombre."); return true; }
    await avanzarDesdePagador(ctx, estado, texto);
    return true;
  }

  // Categoría personalizada
  if (estado.paso === "categoria_personalizada") {
    if (!texto) { await ctx.reply("Escribí una categoría."); return true; }
    estado.datos.categoria = texto;

    if (estado.tipo === "comprobante" && !estado.corregido) {
      const titularOrd = detectarTitular((estado.datos as DatosComprobante).nombreOrdenante ?? "");
      if (titularOrd) {
        estado.datos.pagadoPor = titularOrd;
        estado.paso = "pedir_descripcion";
        estados.set(ctx.from.id, estado);
        await pedirDescripcion(ctx);
        return true;
      }
    }

    estado.paso = "seleccionar_quien";
    estados.set(ctx.from.id, estado);
    await pedirPagador(ctx);
    return true;
  }

  // Descripción opcional
  if (estado.paso === "pedir_descripcion") {
    estado.datos.detalle = texto.toLowerCase() === "omitir" || texto === "-" ? "" : texto;
    if (estado.tipo === "manual") {
      estado.paso = "confirmar_manual";
      estados.set(ctx.from.id, estado);
      await mostrarConfirmacionManual(ctx, estado);
    } else {
      await guardarGasto(ctx, estado, estado.datos.pagadoPor ?? "");
      estados.delete(ctx.from.id);
    }
    return true;
  }

  // Fecha (flujo manual)
  if (estado.paso === "gasto_fecha") {
    let fecha: string;
    if (texto.toLowerCase() === "hoy") {
      fecha = fechaHoy();
    } else {
      const v = validarFecha(texto);
      if (!v.ok) { await ctx.reply(v.error!); return true; }
      fecha = v.fecha!;
    }
    estado.datos.fecha = fecha;
    estado.paso = "gasto_monto";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuál es el monto?");
    return true;
  }

  // Monto (flujo manual)
  if (estado.paso === "gasto_monto") {
    const v = validarMonto(texto);
    if (!v.ok) { await ctx.reply(v.error!); return true; }
    estado.datos.monto = v.monto;
    estado.paso = "gasto_moneda";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons("¿En qué moneda?", [
      { id: "gasto_moneda_ARS", title: "🇦🇷 Pesos (ARS)" },
      { id: "gasto_moneda_USD", title: "🇺🇸 Dólares (USD)" },
    ]);
    return true;
  }

  return false;
}

// ── Helpers privados ──────────────────────────────────────────────────────

async function avanzarDesdePagador(ctx: WaCtx, estado: EstadoGasto, pagadoPor: string) {
  estado.datos.pagadoPor = pagadoPor;
  if (estado.tipo === "manual") {
    estado.paso = "gasto_fecha";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuál es la fecha del gasto? (DD/MM/YYYY o \"hoy\")");
  } else {
    estado.paso = "pedir_descripcion";
    estados.set(ctx.from.id, estado);
    await pedirDescripcion(ctx);
  }
}

async function mostrarConfirmacionManual(ctx: WaCtx, estado: EstadoGasto) {
  const moneda = (estado.datos.moneda ?? "ARS") as "ARS" | "USD";
  const simbolo = moneda === "USD" ? "U$D" : "$";
  const monto = estado.datos.monto ?? 0;

  const descripcionLinea = estado.datos.detalle ? `Descripción: ${estado.datos.detalle}\n` : "";
  await ctx.replyButtons(
    `*Confirmar gasto:*\n\n` +
    `Categoría: ${estado.datos.categoria}\n` +
    `Pagó: ${estado.datos.pagadoPor}\n` +
    `Fecha: ${estado.datos.fecha}\n` +
    `Monto: ${simbolo}${monto.toLocaleString("es-AR")}\n` +
    `Moneda: ${moneda}\n` +
    descripcionLinea,
    [
      { id: "gasto_guardar",  title: "✅ Confirmar" },
      { id: "gasto_cancelar", title: "❌ Cancelar" },
    ]
  );
}

async function guardarGasto(ctx: WaCtx, estado: EstadoGasto, pagadoPor: string) {
  const d = estado.datos as DatosComprobante & { comprobanteUrl?: string; categoria?: string; detalle?: string };
  const hoy = fechaHoy();
  const categoriaFinal = d.categoria ?? "otro";
  const moneda = (d.moneda ?? "ARS") as "ARS" | "USD";
  const simbolo = moneda === "USD" ? "U$D" : "$";
  const pagadoPorFinal = resolverNombre(pagadoPor);

  await registrarGasto({
    id: generarId("GAS"),
    fecha: d.fecha || hoy,
    monto: d.monto ?? 0,
    moneda,
    categoria: categoriaFinal,
    pagadoPor: pagadoPorFinal as Titular,
    nombreDestinatario: resolverNombre(d.nombreDestinatario ?? ""),
    bancoOrigen: estado.tipo === "manual" ? "Efectivo" : (d.bancoOrigen ?? ""),
    nroOperacion: d.nroOperacion ?? "",
    detalle: d.detalle ?? "",
    registradoPor: nombreWa(ctx.from.name, ctx.from.id),
    comprobanteUrl: d.comprobanteUrl ?? "",
    timestamp: ahora(),
    cotizacion: await obtenerCotizacion(d.fecha || hoy),
  });

  await ctx.reply(
    `✅ Gasto registrado\n${categoriaFinal} · ${pagadoPorFinal} · ${simbolo}${(d.monto ?? 0).toLocaleString("es-AR")}`
  );

  if (pagadoPorFinal === "Paola") {
    await registrarComision(
      d.monto ?? 0,
      `Gasto: ${categoriaFinal}`,
      ahora(),
      await obtenerCotizacion(d.fecha || hoy),
      "gasto"
    ).catch(() => {});
  }

  await ctx.replyButtons("¿Querés registrar algo más?", MENU_BOTONES);
}
