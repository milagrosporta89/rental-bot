import { WaCtx } from "../types";
import { config } from "../config";
import { actualizarCampoGasto, registrarAudit, obtenerUltimosGastos } from "../services/sheets";
import { sendText, sendButtons } from "../services/whatsapp";
import { intentarEscape, validarFecha, fechaHoy, validarMonto } from "../utils";

// ── Types ──────────────────────────────────────────────────────────────────

type CampoEditable = "categoria" | "detalle" | "fecha" | "monto";

interface GastoResumen {
  id: string; rowIndex: number; fecha: string;
  monto: number; moneda: string; categoria: string;
  pagadoPor: string; detalle: string;
}

interface CambioPendiente {
  campo: CampoEditable;
  valorAnterior: string;
  valorNuevo: string;
}

interface EstadoCorreccion {
  paso: "corr_lista" | "corr_campo" | "corr_valor" | "corr_confirmar";
  // gasto seleccionado
  idRegistro?: string;
  rowIndex?: number;
  moneda?: string;
  pagadoPor?: string;
  // valores actuales (se actualizan con cada cambio para reflejar el estado en curso)
  catActual?: string;
  detActual?: string;
  fechaActual?: string;
  montoActual?: number;
  // campo que se está editando en este momento
  campoActual?: CampoEditable;
  // acumulador de cambios pendientes
  cambios: CambioPendiente[];
  lista?: GastoResumen[];
}

interface PendingApproval {
  idRegistro: string;
  rowIndex: number;
  moneda: string;
  pagadoPor: string;
  cambios: CambioPendiente[];
  solicitadoPor: string;
  solicitadoPorNombre: string;
}

const estados = new Map<string, EstadoCorreccion>();
const pendientes = new Map<string, PendingApproval>();

const LABEL: Record<CampoEditable, string> = {
  categoria: "categoría", detalle: "detalle", fecha: "fecha", monto: "monto",
};
const NUMEROS = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];

function fmtMonto(monto: number, moneda: string): string {
  return moneda === "USD" ? `u$s ${monto}` : `$ ${monto.toLocaleString("es-AR")}`;
}

function textoLista(gastos: GastoResumen[]): string {
  return gastos.map((g, i) =>
    `${NUMEROS[i]} *${g.categoria}* · ${fmtMonto(g.monto, g.moneda)} · ${g.pagadoPor}\n` +
    `   ${g.fecha}${g.detalle ? " · " + g.detalle : ""}\n   _${g.id}_`
  ).join("\n\n");
}

function textoEdicion(est: EstadoCorreccion): string {
  const cambiosPor: Partial<Record<CampoEditable, string>> = {};
  for (const c of est.cambios) cambiosPor[c.campo] = c.valorNuevo;

  const fmt = (campo: CampoEditable, valActual: string) => {
    const nuevo = cambiosPor[campo];
    const label = LABEL[campo].charAt(0).toUpperCase() + LABEL[campo].slice(1);
    return nuevo !== undefined
      ? `${label}: _${valActual || "(vacío)"}_ → *${nuevo}*`
      : `${label}: ${valActual || "(vacío)"}`;
  };

  return (
    `📋 *${est.idRegistro}*\n` +
    fmt("categoria", est.catActual ?? "") + "\n" +
    fmt("detalle",   est.detActual ?? "") + "\n" +
    fmt("fecha",     est.fechaActual ?? "") + "\n" +
    fmt("monto",     fmtMonto(est.montoActual ?? 0, est.moneda ?? "ARS"))
  );
}

function itemsCampos(tienesCambios: boolean): Array<{ id: string; title: string }> {
  const items: Array<{ id: string; title: string }> = [
    { id: "corr_campo_categoria", title: "📂 Categoría" },
    { id: "corr_campo_detalle",   title: "📝 Detalle" },
    { id: "corr_campo_fecha",     title: "📅 Fecha" },
    { id: "corr_campo_monto",     title: "💰 Monto" },
  ];
  if (tienesCambios) {
    items.push({ id: "corr_guardar_cambios", title: "💾 Guardar cambios" });
  }
  return items;
}

async function mostrarSelectorCampo(ctx: WaCtx, est: EstadoCorreccion): Promise<void> {
  const n = est.cambios.length;
  const pie = n > 0
    ? `\n\n_${n} cambio${n > 1 ? "s" : ""} pendiente${n > 1 ? "s" : ""}. Editá otro campo o guardá:_`
    : `\n\n¿Qué campo querés corregir?`;

  await ctx.replyList(textoEdicion(est) + pie, itemsCampos(n > 0));
}

async function mostrarConfirmacion(ctx: WaCtx, est: EstadoCorreccion): Promise<void> {
  const resumen = est.cambios.map(c =>
    `• ${LABEL[c.campo]}: _${c.valorAnterior || "(vacío)"}_ → *${c.valorNuevo}*`
  ).join("\n");
  await ctx.replyButtons(
    `¿Confirmás estos cambios?\n\n*${est.idRegistro}*\n${resumen}`,
    [
      { id: "corr_confirmar_si", title: "✅ Confirmar" },
      { id: "corr_confirmar_no", title: "❌ Cancelar" },
    ]
  );
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function onCorregirGastoCommand(ctx: WaCtx): Promise<void> {
  const lista = await obtenerUltimosGastos(10);
  if (lista.length === 0) {
    await ctx.reply("No hay gastos registrados todavía.");
    return;
  }
  estados.set(ctx.from.id, { paso: "corr_lista", cambios: [], lista });
  await ctx.reply(
    `📋 *Últimos ${lista.length} gastos:*\n\n` +
    textoLista(lista) +
    `\n\nRespondé con el *número* del gasto a corregir, o escribí _cancelar_:`
  );
}

// ── Callbacks ──────────────────────────────────────────────────────────────

export async function onCallbackCorreccion(ctx: WaCtx, id: string): Promise<boolean> {
  // Selección de campo o guardar
  if (id.startsWith("corr_campo_") || id === "corr_guardar_cambios") {
    const est = estados.get(ctx.from.id);
    if (!est || est.paso !== "corr_campo") return false;

    if (id === "corr_guardar_cambios") {
      if (est.cambios.length === 0) {
        await ctx.reply("No hay cambios pendientes todavía.");
        return true;
      }
      est.paso = "corr_confirmar";
      estados.set(ctx.from.id, est);
      await mostrarConfirmacion(ctx, est);
      return true;
    }

    const campo = id.replace("corr_campo_", "") as CampoEditable;
    if (!LABEL[campo]) return false;

    est.campoActual = campo;
    est.paso = "corr_valor";
    estados.set(ctx.from.id, est);

    const valActual =
      campo === "categoria" ? (est.catActual ?? "") :
      campo === "detalle"   ? (est.detActual ?? "") :
      campo === "fecha"     ? (est.fechaActual ?? "") :
      String(est.montoActual ?? 0);

    const hint =
      campo === "fecha"  ? "\n_(DD/MM/YYYY o \"hoy\")_" :
      campo === "monto"  ? "\n_(ej: 5000 o 1500.50)_" : "";
    await ctx.reply(
      `Valor actual de *${LABEL[campo]}*: _${valActual || "(vacío)"}_\n\nIngresá el nuevo valor:${hint}`
    );
    return true;
  }

  // Confirmación
  if (id === "corr_confirmar_si") {
    const est = estados.get(ctx.from.id);
    if (!est || est.paso !== "corr_confirmar") return false;
    estados.delete(ctx.from.id);
    await aplicarCorrecciones(ctx, est);
    return true;
  }
  if (id === "corr_confirmar_no") {
    const est = estados.get(ctx.from.id);
    if (!est || est.paso !== "corr_confirmar") return false;
    estados.delete(ctx.from.id);
    await ctx.reply("Corrección cancelada.");
    return true;
  }

  // Aprobación / rechazo por el owner
  if (id.startsWith("corr_aprobar_") || id.startsWith("corr_rechazar_")) {
    const aprobando = id.startsWith("corr_aprobar_");
    const corrId = id.slice(aprobando ? "corr_aprobar_".length : "corr_rechazar_".length);
    const pend = pendientes.get(corrId);
    if (!pend) {
      await ctx.reply("Esta solicitud ya fue procesada o expiró.");
      return true;
    }
    pendientes.delete(corrId);

    if (!aprobando) {
      await ctx.reply("Corrección rechazada.");
      await sendText(pend.solicitadoPor, `❌ Tu solicitud de corrección para *${pend.idRegistro}* fue rechazada.`);
      return true;
    }

    for (const c of pend.cambios) {
      await actualizarCampoGasto(pend.rowIndex, c.campo, c.valorNuevo);
      await registrarAudit({
        idRegistro: pend.idRegistro,
        tipoRegistro: "gasto",
        campo: c.campo,
        valorAnterior: c.valorAnterior,
        valorNuevo: c.valorNuevo,
        modificadoPor: pend.solicitadoPorNombre,
        aprobadoPor: ctx.from.name,
      });
    }
    const resumen = pend.cambios.map(c =>
      `• ${LABEL[c.campo]}: _${c.valorAnterior || "(vacío)"}_ → *${c.valorNuevo}*`
    ).join("\n");
    await ctx.reply(`✅ Correcciones aplicadas:\n*${pend.idRegistro}*\n${resumen}`);
    await sendText(pend.solicitadoPor, `✅ Tus correcciones para *${pend.idRegistro}* fueron aprobadas.\n${resumen}`);
    return true;
  }

  return false;
}

// ── Texto ──────────────────────────────────────────────────────────────────

export async function onTextCorreccion(ctx: WaCtx): Promise<boolean> {
  const est = estados.get(ctx.from.id);
  if (!est) return false;

  if (await intentarEscape(ctx, true, () => estados.delete(ctx.from.id))) return true;

  // Paso 1: elegir gasto por número
  if (est.paso === "corr_lista") {
    const texto = (ctx.text ?? "").trim();
    const num = parseInt(texto);
    const lista = est.lista ?? [];

    if (isNaN(num) || num < 1 || num > lista.length) {
      await ctx.reply(`Respondé con un número del 1 al ${lista.length}, o escribí _cancelar_:`);
      return true;
    }

    const gasto = lista[num - 1];
    const nuevo: EstadoCorreccion = {
      paso: "corr_campo",
      idRegistro: gasto.id,
      rowIndex: gasto.rowIndex,
      moneda: gasto.moneda,
      pagadoPor: gasto.pagadoPor,
      catActual: gasto.categoria,
      detActual: gasto.detalle,
      fechaActual: gasto.fecha,
      montoActual: gasto.monto,
      cambios: [],
    };
    estados.set(ctx.from.id, nuevo);
    await mostrarSelectorCampo(ctx, nuevo);
    return true;
  }

  // Paso 2: recibir nuevo valor
  if (est.paso === "corr_valor") {
    let valorNuevo = (ctx.text ?? "").trim();
    if (!valorNuevo) {
      await ctx.reply("El valor no puede estar vacío. Ingresá el nuevo valor:");
      return true;
    }

    const campo = est.campoActual!;

    if (campo === "fecha") {
      if (valorNuevo.toLowerCase() === "hoy") {
        valorNuevo = fechaHoy();
      } else {
        const v = validarFecha(valorNuevo);
        if (!v.ok) { await ctx.reply(v.error + "\nUsá el formato DD/MM/YYYY o escribí \"hoy\":"); return true; }
        valorNuevo = v.fecha!;
      }
    } else if (campo === "monto") {
      const v = validarMonto(valorNuevo);
      if (!v.ok) { await ctx.reply(v.error!); return true; }
      valorNuevo = String(v.monto);
    }

    const valorAnterior =
      campo === "categoria" ? (est.catActual ?? "") :
      campo === "detalle"   ? (est.detActual ?? "") :
      campo === "fecha"     ? (est.fechaActual ?? "") :
      String(est.montoActual ?? 0);

    // Si ya había un cambio para este campo, lo reemplaza
    est.cambios = est.cambios.filter(c => c.campo !== campo);
    est.cambios.push({ campo, valorAnterior, valorNuevo });

    // Actualizar valor actual para la siguiente visualización
    if (campo === "categoria") est.catActual = valorNuevo;
    else if (campo === "detalle") est.detActual = valorNuevo;
    else if (campo === "fecha") est.fechaActual = valorNuevo;
    else if (campo === "monto") est.montoActual = Number(valorNuevo);

    est.paso = "corr_campo";
    est.campoActual = undefined;
    estados.set(ctx.from.id, est);

    await mostrarSelectorCampo(ctx, est);
    return true;
  }

  return false;
}

// ── Aplicar correcciones ────────────────────────────────────────────────────

async function aplicarCorrecciones(ctx: WaCtx, est: EstadoCorreccion): Promise<void> {
  const esOwner = !config.whatsappOwnerNumber || ctx.from.id === config.whatsappOwnerNumber;

  if (esOwner) {
    for (const c of est.cambios) {
      await actualizarCampoGasto(est.rowIndex!, c.campo, c.valorNuevo);
      await registrarAudit({
        idRegistro: est.idRegistro!,
        tipoRegistro: "gasto",
        campo: c.campo,
        valorAnterior: c.valorAnterior,
        valorNuevo: c.valorNuevo,
        modificadoPor: ctx.from.name,
        aprobadoPor: ctx.from.name,
      });
    }
    const resumen = est.cambios.map(c =>
      `• ${LABEL[c.campo]}: _${c.valorAnterior || "(vacío)"}_ → *${c.valorNuevo}*`
    ).join("\n");
    await ctx.reply(`✅ Correcciones aplicadas:\n*${est.idRegistro}*\n${resumen}`);
    return;
  }

  const corrId = Date.now().toString(36);
  pendientes.set(corrId, {
    idRegistro: est.idRegistro!,
    rowIndex: est.rowIndex!,
    moneda: est.moneda!,
    pagadoPor: est.pagadoPor!,
    cambios: est.cambios,
    solicitadoPor: ctx.from.id,
    solicitadoPorNombre: ctx.from.name,
  });

  const resumen = est.cambios.map(c =>
    `• ${LABEL[c.campo]}: _${c.valorAnterior || "(vacío)"}_ → *${c.valorNuevo}*`
  ).join("\n");
  await sendButtons(
    config.whatsappOwnerNumber,
    `⚠️ *Corrección solicitada por ${ctx.from.name}*\n*${est.idRegistro}*\n${resumen}`,
    [
      { id: `corr_aprobar_${corrId}`,  title: "✅ Aprobar" },
      { id: `corr_rechazar_${corrId}`, title: "❌ Rechazar" },
    ]
  );
  await ctx.reply("✉️ Solicitud enviada. Te aviso cuando Milagros la apruebe.");
}
