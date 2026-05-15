import { IngresoRow, GastoRow, SaldoRow } from "./sheets";

function mesKey(fecha: string): string {
  const [, mes, anio] = fecha.split("/");
  return `${anio}-${mes}`;
}

export function computeMetrics(
  ingresos: IngresoRow[],
  gastos: GastoRow[],
  saldos: SaldoRow[]
) {
  // ── Resumen global ────────────────────────────────────────────────────────
  const totalIngresosARS = ingresos.reduce((s, r) => s + r.montoARS, 0);
  const totalGastosARS = gastos.reduce((s, r) => s + r.montoARS, 0);

  // ── Por mes ───────────────────────────────────────────────────────────────
  const mesesMap = new Map<string, { ingresos: number; gastos: number }>();
  for (const r of ingresos) {
    const k = mesKey(r.fecha);
    const m = mesesMap.get(k) ?? { ingresos: 0, gastos: 0 };
    m.ingresos += r.montoARS;
    mesesMap.set(k, m);
  }
  for (const r of gastos) {
    const k = mesKey(r.fecha);
    const m = mesesMap.get(k) ?? { ingresos: 0, gastos: 0 };
    m.gastos += r.montoARS;
    mesesMap.set(k, m);
  }
  const porMes = Array.from(mesesMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, ...v, balance: v.ingresos - v.gastos }));

  // ── Por casa ──────────────────────────────────────────────────────────────
  const casasMap = new Map<string, { ingresos: number; gastos: number }>();
  for (const r of ingresos) {
    const m = casasMap.get(r.casa) ?? { ingresos: 0, gastos: 0 };
    m.ingresos += r.montoARS;
    casasMap.set(r.casa, m);
  }
  const porCasa = Array.from(casasMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([casa, v]) => ({ casa, ...v, balance: v.ingresos - v.gastos }));

  // ── Por categoría de gasto ────────────────────────────────────────────────
  const catMap = new Map<string, number>();
  for (const r of gastos) {
    catMap.set(r.categoria, (catMap.get(r.categoria) ?? 0) + r.montoARS);
  }
  const porCategoria = Array.from(catMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([categoria, total]) => ({ categoria, total }));

  // ── Por tipo de ingreso ───────────────────────────────────────────────────
  const tipoMap = new Map<string, number>();
  for (const r of ingresos) {
    tipoMap.set(r.tipo, (tipoMap.get(r.tipo) ?? 0) + r.montoARS);
  }
  const porTipo = Array.from(tipoMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([tipo, total]) => ({ tipo, total }));

  // ── Saldos reales (último por titular) ───────────────────────────────────
  const saldosMap = new Map<string, SaldoRow>();
  for (const s of saldos) {
    const prev = saldosMap.get(s.titular);
    if (!prev || s.fecha > prev.fecha) saldosMap.set(s.titular, s);
  }
  const saldosActuales = Array.from(saldosMap.values());

  return {
    resumen: {
      totalIngresosARS: Math.round(totalIngresosARS),
      totalGastosARS: Math.round(totalGastosARS),
      balanceNeto: Math.round(totalIngresosARS - totalGastosARS),
      totalOperaciones: ingresos.length + gastos.length,
    },
    porMes,
    porCasa,
    porCategoria,
    porTipo,
    saldosActuales,
  };
}
