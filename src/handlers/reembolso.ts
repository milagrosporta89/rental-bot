import { registrarReembolso } from "../services/sheets";
import { EstadoConversacion, WaCtx, MENU_BOTONES } from "../types";
import { validarFecha, validarMonto, nombreWa, ahora } from "../utils";

const estados = new Map<string, EstadoConversacion>();

export async function onReembolsoCommand(ctx: WaCtx): Promise<void> {
  estados.set(ctx.from.id, { paso: "reembolso_fecha", datos: {} });
  await ctx.reply("¿Cuál es la fecha del reembolso? (DD/MM/AAAA o \"hoy\")");
}

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  if (buttonId === "reembolso_confirmar") {
    const estado = estados.get(ctx.from.id);
    if (!estado) return false;
    const { fecha, monto, detalle } = estado.datos;
    await registrarReembolso(fecha!, monto!, detalle!, ahora());
    estados.delete(ctx.from.id);
    await ctx.reply(`✅ Reembolso registrado\n$${(monto ?? 0).toLocaleString("es-AR")} · ${fecha}\n${detalle}`);
    await ctx.replyButtons("¿Querés hacer algo más?", MENU_BOTONES);
    return true;
  }

  if (buttonId === "reembolso_cancelar") {
    estados.delete(ctx.from.id);
    await ctx.replyButtons("Cancelado.", MENU_BOTONES);
    return true;
  }

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
    estado.datos.detalle = texto;
    estado.paso = "reembolso_confirmar";
    estados.set(ctx.from.id, estado);
    await ctx.replyButtons(
      `*Confirmar reembolso:*\n\n` +
      `Monto: $${(estado.datos.monto ?? 0).toLocaleString("es-AR")} ARS\n` +
      `Fecha: ${estado.datos.fecha}\n` +
      `Concepto: ${texto}`,
      [
        { id: "reembolso_confirmar", title: "✅ Confirmar" },
        { id: "reembolso_cancelar",  title: "❌ Cancelar" },
      ]
    );
    return true;
  }

  return false;
}
