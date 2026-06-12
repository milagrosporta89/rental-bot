import "dotenv/config";
import { google } from "googleapis";
import { writeFileSync } from "fs";

// ── Auth ──────────────────────────────────────────────────────────────────────

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL!,
  key: process.env.GOOGLE_PRIVATE_KEY!
    .replace(/^["']|["'],?\s*$/g, "")
    .replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheetsClient = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMonto(v: string | undefined): number {
  if (!v) return 0;
  const s = String(v).replace(/\./g, "").replace(",", ".");
  return parseFloat(s) || 0;
}

function mesKey(fecha: string): string {
  const p = fecha.split("/");
  if (p.length < 3) return "";
  const anio = p[2].length === 2 ? "20" + p[2] : p[2];
  return `${anio}-${p[1].padStart(2, "0")}`;
}

function mesActualKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesPrevioKey(k: string): string {
  const [anio, mes] = k.split("-").map(Number);
  const d = new Date(anio, mes - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function titularDeCasa(casa: string): string {
  const m: Record<string, string> = {
    "Casa 1": "Francisco", "Casa 2": "Francisco",
    "Casa 3": "Milagros",  "Casa 4": "Milagros",
    "Casa 5": "Inés",
  };
  return m[casa] ?? "";
}

function toDate(fechaStr: string): Date {
  const [d, m, a] = fechaStr.split("/").map(Number);
  const anio = a < 100 ? 2000 + a : a;
  return new Date(anio, m - 1, d);
}

function formatFecha(fecha: string): string {
  if (!fecha) return "—";
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const p = fecha.split("/");
  const dia = parseInt(p[0]);
  const mes = meses[(parseInt(p[1]) - 1)] ?? p[1];
  const anio = p[2]?.length === 2 ? "20" + p[2] : p[2];
  return `${dia} ${mes} ${anio}`;
}

function formatARS(n: number): string {
  return `$ ${Math.round(n).toLocaleString("es-AR")}`;
}

function formatUSD(n: number): string {
  return `u$s ${parseFloat(n.toFixed(0)).toLocaleString("es-AR")}`;
}

function nomMes(k: string): string {
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const [, m] = k.split("-");
  return meses[parseInt(m) - 1] ?? k;
}

function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function diff(actual: number, anterior: number): string {
  if (anterior === 0 || actual === 0) return "";
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  const sign = pct >= 0 ? "+" : "";
  const cls = pct >= 0 ? "pos" : "neg";
  return `<span class="diff ${cls}">${sign}${pct}%</span>`;
}

async function getRange(range: string): Promise<string[][]> {
  const res = await sheetsClient.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return (res.data.values ?? []).slice(1).filter(r => r.some(c => c));
}

// Columnas Ingresos (A:Q, idx 0-16):
// 0 id | 1 fecha | 2 casa | 3 monto | 4 moneda | 5 tipo | 6 quienPago
// 7 nombreDestinatario | 8 bancoOrigen | 9 nroOperacion | 10 detalle
// 11 registradoPor | 12 comprobanteUrl | 13 timestamp | 14 cotizacion
// 15 montoARS | 16 montoUSD

// Columnas Gastos (A:P, idx 0-15):
// 0 id | 1 fecha | 2 monto | 3 moneda | 4 categoria | 5 pagadoPor
// 6 nombreDestinatario | 7 bancoOrigen | 8 nroOperacion | 9 detalle
// 10 registradoPor | 11 comprobanteUrl | 12 timestamp | 13 cotizacion
// 14 montoARS | 15 montoUSD

// Columnas Reservas (A:S, idx 0-18):
// 0 id | 1 fechaRegistro | 2 casa | 3 titular | 4 nombrePax | 5 cantidadPax
// 6 cantidadNoches | 7 fechaEntrada | 8 fechaSalida | 9 montoTotalUSD
// 10 montoAdelantoARS | 11 montoAdelantoUSD | 12 saldoUSD | 13 estadoPago
// 14 comprobanteUrl | 15 registradoPor | 16 timestamp | 17 cotizacion | 18 plataforma

// Columnas Comisiones (A:F, idx 0-5):
// 0 mes | 1 monto | 2 tipo | 3 descripcion | 4 timestamp | 5 cotizacion

async function main() {
  console.log("Leyendo datos del Google Sheet...");

  const [ingresosRaw, gastosRaw, reservasRaw, comisionesRaw] = await Promise.all([
    getRange("Ingresos!A:Q"),
    getRange("Gastos!A:P"),
    getRange("Reservas!A:S"),
    getRange("Comisiones!A:F"),
  ]);

  console.log(`  Ingresos: ${ingresosRaw.length} | Gastos: ${gastosRaw.length} | Reservas: ${reservasRaw.length} | Comisiones: ${comisionesRaw.length}`);

  const mesActual = mesActualKey();
  const mesPrevio = mesPrevioKey(mesActual);

  // ── Filtrar por mes ────────────────────────────────────────────────────────
  const ingresosMes = ingresosRaw.filter(r => r[1] && mesKey(r[1]) === mesActual);
  const ingresosAnt = ingresosRaw.filter(r => r[1] && mesKey(r[1]) === mesPrevio);
  const gastosMes   = gastosRaw.filter(r => r[1] && mesKey(r[1]) === mesActual);
  const gastosAnt   = gastosRaw.filter(r => r[1] && mesKey(r[1]) === mesPrevio);

  // ── Totales ingresos ───────────────────────────────────────────────────────
  function sumarIngresosARS(filas: string[][]): { ars: number; usd: number } {
    let ars = 0, usd = 0;
    for (const r of filas) {
      const monto = parseMonto(r[3]);
      const moneda = r[4];
      if (moneda === "USD") {
        usd += monto;
        ars += parseMonto(r[15]) || monto * parseMonto(r[14]);
      } else {
        ars += monto;
      }
    }
    return { ars, usd };
  }

  const totIng    = sumarIngresosARS(ingresosMes);
  const totIngAnt = sumarIngresosARS(ingresosAnt);

  // ── Totales gastos ─────────────────────────────────────────────────────────
  function sumarGastosARS(filas: string[][]): number {
    return filas.reduce((s, r) => {
      const m = parseMonto(r[2]);
      const moneda = r[3];
      return s + (moneda === "USD" ? (parseMonto(r[14]) || m * parseMonto(r[13])) : m);
    }, 0);
  }

  const totGas    = sumarGastosARS(gastosMes);
  const totGasAnt = sumarGastosARS(gastosAnt);

  // ── Ingresos por casa ──────────────────────────────────────────────────────
  const ingPorCasa: Record<string, { ars: number; usd: number }> = {};
  for (const r of ingresosMes) {
    const casa = r[2] ?? "";
    if (!ingPorCasa[casa]) ingPorCasa[casa] = { ars: 0, usd: 0 };
    const m = parseMonto(r[3]);
    if (r[4] === "USD") {
      ingPorCasa[casa].usd += m;
      ingPorCasa[casa].ars += parseMonto(r[15]) || m * parseMonto(r[14]);
    } else {
      ingPorCasa[casa].ars += m;
    }
  }

  // ── Gastos por categoría ───────────────────────────────────────────────────
  const gasPorCat: Record<string, number> = {};
  for (const r of gastosMes) {
    const cat = (r[4] ?? "otro").toLowerCase();
    const m = parseMonto(r[2]);
    const moneda = r[3];
    const montoARS = moneda === "USD" ? (parseMonto(r[14]) || m * parseMonto(r[13])) : m;
    gasPorCat[cat] = (gasPorCat[cat] ?? 0) + montoARS;
  }

  // ── Por titular ───────────────────────────────────────────────────────────
  const casosPorTit: Record<string, string[]> = {
    Francisco: ["Casa 1", "Casa 2"],
    Milagros:  ["Casa 3", "Casa 4"],
    "Inés":    ["Casa 5"],
  };

  const resumenTit: Record<string, { ingresos: number; gastos: number }> = {};
  for (const [tit, casas] of Object.entries(casosPorTit)) {
    const ingresos = sumarIngresosARS(ingresosMes.filter(r => casas.includes(r[2]))).ars;
    const gastos   = sumarGastosARS(gastosMes.filter(r => r[5] === tit));
    resumenTit[tit] = { ingresos, gastos };
  }

  // ── Reservas próximas 30 días ─────────────────────────────────────────────
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const en30 = new Date(hoy); en30.setDate(en30.getDate() + 30);

  const reservasProx = reservasRaw
    .filter(r => r[7] && (() => { try { const d = toDate(r[7]); return d >= hoy && d <= en30; } catch { return false; } })())
    .sort((a, b) => toDate(a[7]).getTime() - toDate(b[7]).getTime());

  // ── Comisión Paola ────────────────────────────────────────────────────────
  const baseIngresos = sumarIngresosARS(ingresosAnt).ars;
  const comisionEsperada = Math.round(baseIngresos * 0.15);

  const filasMes  = comisionesRaw.filter(r => r[0] === mesActual);
  const cobradosMes  = Math.round(filasMes.filter(r => parseMonto(r[1]) > 0).reduce((s, r) => s + parseMonto(r[1]), 0));
  const gastosPaola  = Math.round(filasMes.filter(r => parseMonto(r[1]) < 0).reduce((s, r) => s + Math.abs(parseMonto(r[1])), 0));
  const pendiente    = Math.max(0, comisionEsperada - cobradosMes + gastosPaola);

  // ── Balance neto ──────────────────────────────────────────────────────────
  const balNeto = totIng.ars - totGas;

  // ─────────────────────────────────────────────────────────────────────────
  //  GENERAR HTML
  // ─────────────────────────────────────────────────────────────────────────

  const tiposIngreso: Record<string, string> = {
    deposito_reserva: "Seña 30%",
    saldo_checkin:    "Saldo check-in",
    transferencia:    "Transferencia",
    efectivo:         "Efectivo",
    airbnb:           "Airbnb",
  };

  const estadoReserva: Record<string, string> = {
    ADELANTO_RECIBIDO: "Seña recibida",
    SALDO_RECIBIDO:    "Saldo recibido",
    COMPLETO:          "Completo",
  };

  const fechaGen = new Date().toLocaleString("es-AR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  // ── Filas de tablas ───────────────────────────────────────────────────────

  const filasIngresos = ingresosMes.map(r => {
    const m = parseMonto(r[3]);
    const moneda = r[4];
    const montoFmt = moneda === "USD"
      ? `${formatUSD(m)} <small>(${formatARS(parseMonto(r[15]) || 0)})</small>`
      : formatARS(m);
    return `<tr>
      <td>${formatFecha(r[1])}</td>
      <td>${r[2] ?? ""}</td>
      <td>${montoFmt}</td>
      <td>${r[6] ?? ""}</td>
      <td>${tiposIngreso[r[5]] ?? capFirst(r[5] ?? "")}</td>
      <td class="det">${r[10] ?? ""}</td>
    </tr>`;
  }).join("");

  const filasGastos = gastosMes.map(r => {
    const m = parseMonto(r[2]);
    const moneda = r[3];
    const montoFmt = moneda === "USD"
      ? `${formatUSD(m)} <small>(${formatARS(parseMonto(r[14]) || 0)})</small>`
      : formatARS(m);
    return `<tr>
      <td>${formatFecha(r[1])}</td>
      <td>${capFirst(r[4] ?? "")}</td>
      <td>${montoFmt}</td>
      <td>${r[5] ?? ""}</td>
      <td class="det">${r[9] ?? ""}</td>
    </tr>`;
  }).join("");

  const filasReservas = reservasProx.map(r => {
    const est = estadoReserva[r[13]] ?? r[13] ?? "";
    const cls = r[13] === "COMPLETO" ? "badge-ok" : "badge-warn";
    return `<tr>
      <td>${r[2] ?? ""}</td>
      <td>${r[4] ?? ""}</td>
      <td>${formatFecha(r[7])}</td>
      <td>${formatFecha(r[8])}</td>
      <td style="text-align:center">${r[6] ?? ""}</td>
      <td>${formatUSD(parseMonto(r[9]))}</td>
      <td><span class="badge ${cls}">${est}</span></td>
    </tr>`;
  }).join("");

  const filasCategoria = Object.entries(gasPorCat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, m]) => `<tr><td>${capFirst(cat)}</td><td>${formatARS(m)}</td></tr>`)
    .join("");

  const cardsT = Object.entries(casosPorTit).map(([tit, casas]) => {
    const { ingresos, gastos } = resumenTit[tit];
    const bal = ingresos - gastos;
    const cls = bal >= 0 ? "pos" : "neg";
    return `<div class="card">
      <div class="card-title">${tit}</div>
      <div class="card-sub">${casas.join(" · ")}</div>
      <div class="stat-row"><span>Ingresos</span><strong class="pos">${formatARS(ingresos)}</strong></div>
      <div class="stat-row"><span>Gastos</span><strong class="neg">${formatARS(gastos)}</strong></div>
      <div class="stat-row bt"><span>Balance</span><strong class="${cls}">${formatARS(bal)}</strong></div>
    </div>`;
  }).join("");

  // ── HTML ──────────────────────────────────────────────────────────────────

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte ${capFirst(nomMes(mesActual))} ${mesActual.split("-")[0]}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f6fa;color:#2d3748;font-size:14px}
nav{background:#1a202c;color:#fff;padding:14px 28px;display:flex;gap:24px;align-items:center;position:sticky;top:0;z-index:10}
nav .brand{font-weight:700;font-size:15px;color:#63b3ed;margin-right:8px}
nav a{color:#a0aec0;text-decoration:none;font-size:13px}
nav a:hover{color:#fff}
.header{background:#fff;border-bottom:1px solid #e2e8f0;padding:22px 32px}
.header h1{font-size:22px;font-weight:700;color:#1a202c}
.header p{color:#718096;font-size:12px;margin-top:4px}
.container{max-width:1080px;margin:0 auto;padding:28px 24px}
section{margin-bottom:40px}
h2{font-size:15px;font-weight:700;color:#1a202c;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #e2e8f0;display:flex;align-items:center;gap:10px}
h2 .sub{font-size:12px;font-weight:400;color:#718096}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-bottom:28px}
.kpi{background:#fff;border-radius:10px;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,.07);border-left:4px solid #63b3ed}
.kpi.g{border-color:#48bb78}.kpi.r{border-color:#fc8181}.kpi.m{border-color:#b794f4}
.kpi-label{font-size:10px;text-transform:uppercase;color:#718096;letter-spacing:.6px}
.kpi-value{font-size:21px;font-weight:700;margin:7px 0 3px}
.kpi-sub{font-size:11px;color:#a0aec0}
.diff{font-size:10px;font-weight:700;padding:2px 5px;border-radius:4px;display:inline-block}
.diff.pos{background:#c6f6d5;color:#22543d}.diff.neg{background:#fed7d7;color:#742a2a}
.pos{color:#22543d}.neg{color:#742a2a}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.card{background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.card-title{font-size:15px;font-weight:700;margin-bottom:2px}
.card-sub{font-size:11px;color:#718096;margin-bottom:14px}
.stat-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;border-bottom:1px solid #f7fafc}
.stat-row.bt{border-top:1px solid #e2e8f0;border-bottom:none;padding-top:10px;margin-top:4px;font-weight:700}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.07)}
th{background:#f7fafc;text-align:left;padding:10px 14px;font-size:10px;text-transform:uppercase;color:#718096;letter-spacing:.5px;border-bottom:1px solid #e2e8f0;white-space:nowrap}
td{padding:10px 14px;border-bottom:1px solid #f7fafc;font-size:13px;vertical-align:top}
td.det{color:#718096;font-size:12px}
tr:last-child td{border-bottom:none}
tr:nth-child(even){background:#fafafa}
small{font-size:11px;color:#718096}
.badge{font-size:11px;padding:3px 8px;border-radius:12px;font-weight:600;white-space:nowrap}
.badge-ok{background:#c6f6d5;color:#22543d}.badge-warn{background:#fef3c7;color:#744210}
.com-card{background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.07);max-width:460px}
.com-row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f7fafc;font-size:13px}
.com-row.total{font-weight:700;border-top:2px solid #e2e8f0;border-bottom:none;padding-top:12px;margin-top:4px}
.empty{color:#a0aec0;font-style:italic;text-align:center;padding:28px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
</style>
</head>
<body>

<nav>
  <span class="brand">🏠 Rental Bot</span>
  <a href="#resumen">Resumen</a>
  <a href="#titulares">Titulares</a>
  <a href="#reservas">Reservas</a>
  <a href="#comisiones">Comisiones</a>
  <a href="#ingresos">Ingresos</a>
  <a href="#gastos">Gastos</a>
</nav>

<div class="header">
  <h1>Reporte mensual — ${capFirst(nomMes(mesActual))} ${mesActual.split("-")[0]}</h1>
  <p>Generado el ${fechaGen}</p>
</div>

<div class="container">

<!-- ── RESUMEN ─────────────────────────────────────────────── -->
<section id="resumen">
  <h2>Resumen del mes <span class="sub">vs ${nomMes(mesPrevio)}</span></h2>
  <div class="kpi-grid">
    <div class="kpi g">
      <div class="kpi-label">Total ingresos</div>
      <div class="kpi-value">${formatARS(totIng.ars)}</div>
      <div class="kpi-sub">${totIng.usd > 0 ? formatUSD(totIng.usd) + " · " : ""}${diff(totIng.ars, totIngAnt.ars)} vs mes ant.</div>
    </div>
    <div class="kpi r">
      <div class="kpi-label">Total gastos</div>
      <div class="kpi-value">${formatARS(totGas)}</div>
      <div class="kpi-sub">${diff(totGas, totGasAnt)} vs mes ant.</div>
    </div>
    <div class="kpi ${balNeto >= 0 ? "g" : "r"}">
      <div class="kpi-label">Balance neto</div>
      <div class="kpi-value ${balNeto >= 0 ? "pos" : "neg"}">${formatARS(balNeto)}</div>
      <div class="kpi-sub">ingresos − gastos</div>
    </div>
    <div class="kpi m">
      <div class="kpi-label">Reservas próximas</div>
      <div class="kpi-value">${reservasProx.length}</div>
      <div class="kpi-sub">próximos 30 días</div>
    </div>
  </div>

  <h2>Ingresos por propiedad <span class="sub">${nomMes(mesActual)}</span></h2>
  <table>
    <thead><tr>
      <th>Propiedad</th><th>Titular</th><th>Total ARS</th><th>Total USD</th>
    </tr></thead>
    <tbody>
      ${Object.entries(ingPorCasa)
        .sort((a, b) => b[1].ars - a[1].ars)
        .map(([casa, v]) => `<tr>
          <td>${casa}</td>
          <td>${titularDeCasa(casa)}</td>
          <td>${v.ars > 0 ? formatARS(v.ars) : "—"}</td>
          <td>${v.usd > 0 ? formatUSD(v.usd) : "—"}</td>
        </tr>`).join("")}
      ${Object.keys(ingPorCasa).length === 0 ? `<tr><td colspan="4" class="empty">Sin ingresos este mes</td></tr>` : ""}
    </tbody>
  </table>
</section>

<!-- ── TITULARES ──────────────────────────────────────────── -->
<section id="titulares">
  <h2>Por titular <span class="sub">${nomMes(mesActual)}</span></h2>
  <div class="card-grid">${cardsT}</div>
</section>

<!-- ── RESERVAS ───────────────────────────────────────────── -->
<section id="reservas">
  <h2>Reservas próximas <span class="sub">próximos 30 días · ${reservasProx.length} entrada${reservasProx.length !== 1 ? "s" : ""}</span></h2>
  ${reservasProx.length === 0
    ? `<p class="empty">No hay reservas con entrada en los próximos 30 días.</p>`
    : `<table>
      <thead><tr>
        <th>Propiedad</th><th>Huésped</th><th>Entrada</th><th>Salida</th>
        <th>Noches</th><th>Monto total</th><th>Estado</th>
      </tr></thead>
      <tbody>${filasReservas}</tbody>
    </table>`}
</section>

<!-- ── COMISIONES ─────────────────────────────────────────── -->
<section id="comisiones">
  <h2>Comisión Paola <span class="sub">${nomMes(mesActual)}</span></h2>
  <div class="com-card">
    <div class="com-row">
      <span>Base: ingresos de ${nomMes(mesPrevio)}</span>
      <strong>${formatARS(baseIngresos)}</strong>
    </div>
    <div class="com-row">
      <span>Comisión esperada (15%)</span>
      <strong>${formatARS(comisionEsperada)}</strong>
    </div>
    <div class="com-row">
      <span>Cobrado este mes</span>
      <strong class="pos">${formatARS(cobradosMes)}</strong>
    </div>
    ${gastosPaola > 0 ? `<div class="com-row">
      <span>Gastos Paola</span>
      <strong class="neg">− ${formatARS(gastosPaola)}</strong>
    </div>` : ""}
    <div class="com-row total">
      <span>Pendiente de cobro</span>
      <strong class="${pendiente > 0 ? "neg" : "pos"}">${formatARS(pendiente)}</strong>
    </div>
  </div>
</section>

<!-- ── INGRESOS DEL MES ────────────────────────────────────── -->
<section id="ingresos">
  <h2>Ingresos del mes <span class="sub">${ingresosMes.length} registros</span></h2>
  ${ingresosMes.length === 0
    ? `<p class="empty">Sin ingresos registrados este mes.</p>`
    : `<table>
      <thead><tr>
        <th>Fecha</th><th>Propiedad</th><th>Monto</th>
        <th>Quién pagó</th><th>Forma de pago</th><th>Detalle</th>
      </tr></thead>
      <tbody>${filasIngresos}</tbody>
    </table>`}
</section>

<!-- ── GASTOS DEL MES ──────────────────────────────────────── -->
<section id="gastos">
  <h2>Gastos del mes <span class="sub">${gastosMes.length} registros</span></h2>
  ${gastosMes.length === 0
    ? `<p class="empty">Sin gastos registrados este mes.</p>`
    : `<table>
      <thead><tr>
        <th>Fecha</th><th>Categoría</th><th>Monto</th><th>Pagado por</th><th>Detalle</th>
      </tr></thead>
      <tbody>${filasGastos}</tbody>
    </table>

    <br>
    <h2>Por categoría</h2>
    <table style="max-width:380px">
      <thead><tr><th>Categoría</th><th>Total ARS</th></tr></thead>
      <tbody>${filasCategoria}</tbody>
    </table>`}
</section>

</div>
</body>
</html>`;

  writeFileSync("reporte.html", html, "utf-8");
  console.log("\n✅  Reporte generado: reporte.html");
  console.log(`    Período: ${capFirst(nomMes(mesActual))} ${mesActual.split("-")[0]}`);
  console.log(`    Ingresos: ${ingresosMes.length} · Gastos: ${gastosMes.length} · Reservas próximas: ${reservasProx.length}`);
}

main().catch(err => {
  if (err?.response?.data) {
    const e = err.response.data?.error;
    console.error("Error de Google Sheets API:", e?.message ?? JSON.stringify(e));
    if (e?.status === "PERMISSION_DENIED") {
      console.error("\n⚠️  Sin acceso al spreadsheet.");
      console.error("   Asegurate de que la cuenta de servicio tenga rol Viewer en el Google Sheet.");
      console.error(`   Cuenta: ${process.env.GOOGLE_CLIENT_EMAIL ?? "(no configurada)"}`);
    }
  } else {
    console.error("Error:", err?.message ?? err);
  }
  process.exit(1);
});
