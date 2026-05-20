import { registrarReembolso } from "../services/sheets";
import { EstadoConversacion, WaCtx, MENU_BOTONES } from "../types";
import { validarFecha, validarMonto, nombreWa, ahora } from "../utils";

const estados = new Map<string, EstadoConversacion>();

export async function onReembolsoCommand(ctx: WaCtx): Promise<void> {
  estados.set(ctx.from.id, { paso: "reembolso_fecha", datos: {} });
  await ctx.reply("¿Cuál es la fecha del reembolso? (DD/MM/AAAA o \"hoy\")");
}

export async function onCallback(_ctx: WaCtx, _buttonId: string): Promise<boolean> {
  return false;
}

export async function onText(ctx: WaCtx): Promise<boolean> {
  const estado = estados.get(ctx.from.id);
  if (!estado) return false;

  const texto = ctx.text?.trim() ?? "";

  if (estado.paso === "reembolso_fecha") {
    const fechaStr = texto.toLowerCase() === "hoy" ? new Date().toLocaleDateString("es-AR") : texto;
    const v = validarFecha(fechaStr);
    if (!v.ok) { await ctx.reply(v.error!); return true; }
    estado.datos.fecha = v.fecha;
    estado.paso = "reembolso_monto";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿Cuál es el monto del reembolso?");
    return true;
  }

  if (estado.paso === "reembolso_monto") {
    const v = validarMonto(texto);
    if (!v.ok) { await ctx.reply(v.error!); return true; }
    estado.datos.monto = v.monto;
    estado.paso = "reembolso_descripcion";
    estados.set(ctx.from.id, estado);
    await ctx.reply("¿En concepto de qué? (ej: gastos limpieza marzo)");
    return true;
  }

  if (estado.paso === "reembolso_descripcion") {
    if (!texto) { await ctx.reply("Escribí una descripción."); return true; }
    const monto = estado.datos.monto ?? 0;
    const fecha = estado.datos.fecha ?? new Date().toLocaleDateString("es-AR");

    await registrarReembolso(fecha, monto, texto, ahora());
    estados.delete(ctx.from.id);

    await ctx.reply(`✅ Reembolso registrado\n$${monto.toLocaleString("es-AR")} · ${fecha}\n${texto}`);
    await ctx.replyButtons("¿Querés hacer algo más?", MENU_BOTONES);
    return true;
  }

  return false;
}
