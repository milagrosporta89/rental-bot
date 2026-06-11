import { registrarSaldoReal, obtenerSaldos } from "../services/sheets";
import { EstadoConversacion, Titular, WaCtx, MENU_BOTONES } from "../types";
import { ahora } from "../utils";

const estados = new Map<string, EstadoConversacion>();
const DIAS_ALERTA = 5;

export async function onReportarSaldoCommand(ctx: WaCtx): Promise<void> {
  estados.set(ctx.from.id, { paso: "reportar_quien", datos: {} });
  await ctx.replyButtons("¿Qué cuenta estás reportando?", [
    { id: "saldo_titular_Francisco", title: "Francisco" },
    { id: "saldo_titular_Milagros",  title: "Milagros" },
    { id: "saldo_titular_Inés",      title: "Inés" },
    { id: "saldo_titular_Fernando",  title: "Fernando (efectivo)" },
    { id: "saldo_cancelar",          title: "❌ Cancelar" },
  ]);
}

export async function onSaldoCommand(ctx: WaCtx): Promise<void> {
  await ctx.reply("Consultando saldos...");
  try {
    const { reales, calculados } = await obtenerSaldos();
    const titulares: Titular[] = ["Francisco", "Milagros", "Inés"];
    const hoy = new Date();
    let msg = "*SALDOS DE CUENTAS*\n\n";

    for (const titular of titulares) {
      const real = reales[titular];
      const calculado = calculados[titular] ?? 0;
      let lineaReal = "Sin reporte";
      let alerta = "";

      if (real) {
        const [d, m, a] = real.fecha.split("/").map(Number);
        const fechaReporte = new Date(a, m - 1, d);
        const diasDesde = Math.floor((hoy.getTime() - fechaReporte.getTime()) / (1000 * 60 * 60 * 24));
        lineaReal = `$${real.monto.toLocaleString("es-AR")}`;
        alerta = diasDesde >= DIAS_ALERTA ? ` ⚠️ (hace ${diasDesde}d)` : ` (hace ${diasDesde}d)`;
      }

      msg += `*${titular}*\n  Real: ${lineaReal}${alerta}\n  Calc: ~$${calculado.toLocaleString("es-AR")}\n\n`;
    }

    const realFernando = reales["Fernando"];
    const calcFernando = calculados["Fernando"] ?? 0;
    let lineaFernando = "Sin reporte";
    let alertaFernando = "";
    if (realFernando) {
      const [d, m, a] = realFernando.fecha.split("/").map(Number);
      const diasDesde = Math.floor((hoy.getTime() - new Date(a, m - 1, d).getTime()) / (1000 * 60 * 60 * 24));
      lineaFernando = `$${realFernando.monto.toLocaleString("es-AR")}`;
      alertaFernando = diasDesde >= DIAS_ALERTA ? ` ⚠️ (hace ${diasDesde}d)` : ` (hace ${diasDesde}d)`;
    }
    msg += `*Fernando (efectivo)*\n  Real: ${lineaFernando}${alertaFernando}\n  Calc: ~$${calcFernando.toLocaleString("es-AR")}`;

    await ctx.reply(msg);
    await ctx.replyButtons("¿Qué más querés hacer?", MENU_BOTONES);
  } catch {
    await ctx.reply("Error consultando los saldos. Intentá de nuevo.");
    await ctx.replyButtons("¿Qué más querés hacer?", MENU_BOTONES);
  }
}

export async function onCallback(ctx: WaCtx, buttonId: string): Promise<boolean> {
  if (buttonId === "saldo_cancelar") {
    estados.delete(ctx.from.id);
    await ctx.replyButtons("Cancelado.", MENU_BOTONES);
    return true;
  }

  if (!buttonId.startsWith("saldo_titular_")) return false;
  const estado = estados.get(ctx.from.id);
  if (!estado) return false;

  const titular = buttonId.replace("saldo_titular_", "") as Titular;
  estado.datos.titular = titular;
  estado.paso = "reportar_monto";
  estados.set(ctx.from.id, estado);
  await ctx.reply(`Cuenta: *${titular}*\n\n¿Cuál es el saldo actual? (solo el número, ej: 847000)`);
  return true;
}

export async function onText(ctx: WaCtx): Promise<boolean> {
  const estado = estados.get(ctx.from.id);
  if (!estado || estado.paso !== "reportar_monto") return false;

  const texto = ctx.text?.trim().replace(/\./g, "").replace(",", ".") ?? "";
  const monto = parseFloat(texto);

  if (isNaN(monto) || monto < 0) {
    await ctx.reply("Ingresá solo el número. Ejemplo: 847000");
    return true;
  }

  const hoy = new Date().toLocaleDateString("es-AR");
  await registrarSaldoReal({ fecha: hoy, titular: estado.datos.titular as Titular, monto, timestamp: ahora() });
  estados.delete(ctx.from.id);
  await ctx.reply(`✅ Saldo registrado\n${estado.datos.titular} · $${monto.toLocaleString("es-AR")} · ${hoy}`);
  await ctx.replyButtons("¿Qué más querés hacer?", MENU_BOTONES);
  return true;
}
