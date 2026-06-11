import { registrarGasto } from "../services/sheets";
import { obtenerCotizacion } from "../services/dolar";
import { procesarComprobante } from "../services/comprobantes";
import { registrarComision } from "../services/sheets";
import { nombreWa, ahora } from "../utils";
import { formatearResumenComprobante, detectarTitular, manejarCorreccion } from "./common";
import { CategoriaGasto, DatosComprobante, Titular, WaCtx, MENU_BOTONES } from "../types";
import { generarId } from "../utils";
import { resolverNombre } from "../config";

// ── Estado ────────────────────────────────────────────────────────────────

interface EstadoGasto {
  paso: string;
  datos: Partial<DatosComprobante> & {
    comprobanteUrl?: string;
    categoria?: string;
    pagadoPor?: Titular;
  };
  corregido?: boolean;
}

const estados = new Map<string, EstadoGasto>();

// ── Categorías ────────────────────────────────────────────────────────────

const CATEGORIAS_GASTO: CategoriaGasto[] = [
  "limpieza", "jardinero", "lavanderia", "expensas",
  "luz", "gas", "mantenimiento", "internet",
  "marketing", "impuestos", "otro",
];

async function pedirCategoria(ctx: WaCtx) {
  await ctx.replyButtons(
    "¿A qué categoría corresponde el gasto?",
    CATEGORIAS_GASTO.map((cat) => ({
      id: `gasto_cat_${cat}`,
      title: cat.charAt(0).toUpperCase() + cat.slice(1),
    }))
  );
}

// ── Handlers públicos ─────────────────────────────────────────────────────

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
  estados.set(ctx.from.id, { paso: "confirmar_datos", datos: { ...datos, comprobanteUrl } });

  const titularOrd = detectarTitular(datos.nombreOrdenante ?? "");
  const sugerencia = titularOrd ? `\n\n🔍 Detecté: gasto de ${titularOrd}` : "";

  await ctx.replyButtons(formatearResumenComprobante(datos) + sugerencia, [
    { id: "gasto_confirmar", title: "✅ Confirmar" },
    { id: "gasto_corregir", title: "✏️ Corregir" },
  ]);
}

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  if (!buttonId.startsWith("gasto_")) return false;

  const estado = estados.get(ctx.from.id);

  if (buttonId === "gasto_confirmar") {
    if (!estado) return false;
    const titularOrd = detectarTitular((estado.datos as DatosComprobante).nombreOrdenante ?? "");
    if (estado.corregido || !titularOrd) {
      estado.paso = "seleccionar_quien";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons(
        "¿Quién realizó el pago?",
        (["Francisco", "Fernando"] as Titular[]).map((t) => ({ id: `gasto_quien_${t}`, title: t }))
      );
    } else {
      estado.paso = "seleccionar_categoria";
      estados.set(ctx.from.id, estado);
      await pedirCategoria(ctx);
    }
    return true;
  }

  if (buttonId === "gasto_corregir") {
    if (!estado) return false;
    estado.paso = "corrigiendo";
    estados.set(ctx.from.id, estado);
    await ctx.reply("Indicá qué campo corregir:\n\nfecha 15/06/2026\ndestinatario Nombre Apellido");
    return true;
  }

  if (buttonId.startsWith("gasto_cat_")) {
    if (!estado) return false;
    const cat = buttonId.replace("gasto_cat_", "") as CategoriaGasto;
    estado.datos.categoria = cat;

    if (cat === "otro") {
      estado.paso = "categoria_personalizada";
      estados.set(ctx.from.id, estado);
      await ctx.reply("¿Cómo querés llamar a esta categoría?");
      return true;
    }

    const titularOrd = detectarTitular((estado.datos as DatosComprobante).nombreOrdenante ?? "");
    if (titularOrd) {
      await guardarGasto(ctx, estado, cat, titularOrd);
      estados.delete(ctx.from.id);
    } else {
      estado.paso = "seleccionar_quien";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons(
        "¿Quién realizó el pago?",
        (["Francisco", "Fernando"] as Titular[]).map((t) => ({ id: `gasto_quien_${t}`, title: t }))
      );
    }
    return true;
  }

  if (buttonId.startsWith("gasto_quien_")) {
    if (!estado || !estado.datos.categoria) return false;
    const titular = buttonId.replace("gasto_quien_", "") as Titular;
    await guardarGasto(ctx, estado, estado.datos.categoria as CategoriaGasto, titular);
    estados.delete(ctx.from.id);
    return true;
  }

  return false;
}

export async function onText(ctx: WaCtx): Promise<boolean> {
  const estado = estados.get(ctx.from.id);
  if (!estado) return false;

  const texto = ctx.text?.trim() ?? "";

  if (await manejarCorreccion(ctx, texto, estado, async (e) => {
    estados.set(ctx.from.id, e);
    await ctx.replyButtons(formatearResumenComprobante(e.datos as DatosComprobante), [
      { id: "gasto_confirmar", title: "✅ Confirmar" },
      { id: "gasto_corregir", title: "✏️ Seguir corrigiendo" },
    ]);
  })) return true;

  if (estado.paso === "categoria_personalizada") {
    if (!texto) { await ctx.reply("Escribí una categoría."); return true; }
    estado.datos.categoria = texto;
    const titularOrd = detectarTitular((estado.datos as DatosComprobante).nombreOrdenante ?? "");
    if (titularOrd) {
      await guardarGasto(ctx, estado, "otro", titularOrd);
      estados.delete(ctx.from.id);
    } else {
      estado.paso = "seleccionar_quien";
      estados.set(ctx.from.id, estado);
      await ctx.replyButtons(
        "¿Quién realizó el pago?",
        (["Francisco", "Fernando"] as Titular[]).map((t) => ({ id: `gasto_quien_${t}`, title: t }))
      );
    }
    return true;
  }

  return false;
}

// ── Guardar ───────────────────────────────────────────────────────────────

async function guardarGasto(ctx: WaCtx, estado: EstadoGasto, categoria: CategoriaGasto, pagadoPor: Titular) {
  const d = estado.datos as DatosComprobante & { comprobanteUrl?: string; categoria?: string };
  const hoy = new Date().toLocaleDateString("es-AR");
  const categoriaFinal = categoria === "otro" && d.categoria ? d.categoria : categoria;
  const moneda = d.moneda ?? "ARS";
  const simbolo = moneda === "USD" ? "U$D" : "$";
  const pagadoPorFinal = resolverNombre(pagadoPor) as Titular;

  await registrarGasto({
    id: generarId("GAS"),
    fecha: d.fecha || hoy,
    monto: d.monto ?? 0,
    moneda,
    categoria: categoriaFinal,
    pagadoPor: pagadoPorFinal,
    nombreDestinatario: resolverNombre(d.nombreDestinatario ?? ""),
    bancoOrigen: d.bancoOrigen ?? "",
    nroOperacion: d.nroOperacion ?? "",
    detalle: "",
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
