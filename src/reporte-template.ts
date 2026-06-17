export const REPORTE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte — Rental Bot</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f6fa;color:#2d3748;font-size:14px}
nav{background:#1a202c;color:#fff;padding:14px 28px;display:flex;gap:24px;align-items:center;position:sticky;top:0;z-index:10}
nav .brand{font-weight:700;font-size:15px;color:#63b3ed;margin-right:8px}
nav a{color:#a0aec0;text-decoration:none;font-size:13px}
nav a:hover{color:#fff}
.header{background:#fff;border-bottom:1px solid #e2e8f0;padding:22px 32px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.header h1{font-size:22px;font-weight:700;color:#1a202c}
.header-right{display:flex;align-items:center;gap:12px}
#status{font-size:12px;color:#718096}
button#btn-refresh{background:#63b3ed;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer;font-weight:600}
button#btn-refresh:hover{background:#4299e1}
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
#loading{text-align:center;padding:60px;color:#a0aec0;font-size:15px}
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
  <div>
    <h1 id="titulo">Reporte mensual</h1>
    <p id="subtitulo" style="color:#718096;font-size:12px;margin-top:4px">Cargando...</p>
  </div>
  <div class="header-right">
    <span id="status"></span>
    <button id="btn-refresh" onclick="cargar()">↻ Actualizar</button>
  </div>
</div>

<div id="loading">Cargando datos...</div>
<div id="contenido" class="container" style="display:none"></div>

<script>
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const TIPOS = {deposito_reserva:"Seña 30%",saldo_checkin:"Saldo check-in",transferencia:"Transferencia",efectivo:"Efectivo",airbnb:"Airbnb"};
const ESTADOS = {ADELANTO_RECIBIDO:"Seña recibida",SALDO_RECIBIDO:"Saldo recibido",COMPLETO:"Completo"};
const TITULAR_CASA = {"Casa 1":"Francisco","Casa 2":"Francisco","Casa 3":"Milagros","Casa 4":"Milagros","Casa 5":"Inés"};

function fmtARS(n){return "$ "+Math.round(n).toLocaleString("es-AR")}
function fmtUSD(n){return "u$s "+Math.round(n).toLocaleString("es-AR")}
function capFirst(s){return s?s.charAt(0).toUpperCase()+s.slice(1):""}
function nomMes(k){const[,m]=k.split("-");return MESES[parseInt(m)-1]??k}

function fmtFecha(f){
  if(!f)return "—";
  const p=f.split("/");
  const dia=parseInt(p[0]);
  const mes=MESES[(parseInt(p[1])-1)]??p[1];
  const anio=p[2]?.length===2?"20"+p[2]:p[2];
  return dia+" "+mes+" "+anio;
}

function diff(actual,anterior){
  if(!anterior||!actual)return "";
  const pct=Math.round(((actual-anterior)/anterior)*100);
  const sign=pct>=0?"+":"";
  const cls=pct>=0?"pos":"neg";
  return '<span class="diff '+cls+'">'+sign+pct+'%</span>';
}

function render(d){
  const mes=nomMes(d.mesActual);
  const anio=d.mesActual.split("-")[0];
  document.getElementById("titulo").textContent="Reporte mensual — "+capFirst(mes)+" "+anio;

  const genDate=new Date(d.generadoEn).toLocaleString("es-AR",{weekday:"long",year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"});
  document.getElementById("subtitulo").textContent="Datos al "+genDate;

  let html="";

  // ── RESUMEN ────────────────────────────────────────────────────────────────
  html+='<section id="resumen">';
  html+='<h2>Resumen del mes <span class="sub">vs '+nomMes(d.mesPrevio)+'</span></h2>';
  html+='<div class="kpi-grid">';
  html+='<div class="kpi g"><div class="kpi-label">Total ingresos</div><div class="kpi-value">'+fmtARS(d.totIng.ars)+'</div><div class="kpi-sub">'+(d.totIng.usd>0?fmtUSD(d.totIng.usd)+" · ":"")+diff(d.totIng.ars,d.totIngAnt.ars)+" vs mes ant.</div></div>";
  html+='<div class="kpi r"><div class="kpi-label">Total gastos</div><div class="kpi-value">'+fmtARS(d.totGas)+'</div><div class="kpi-sub">'+diff(d.totGas,d.totGasAnt)+" vs mes ant.</div></div>";
  const balCls=d.balNeto>=0?"g":"r";
  const balValCls=d.balNeto>=0?"pos":"neg";
  html+='<div class="kpi '+balCls+'"><div class="kpi-label">Balance neto</div><div class="kpi-value '+balValCls+'">'+fmtARS(d.balNeto)+'</div><div class="kpi-sub">ingresos − gastos</div></div>';
  html+='<div class="kpi m"><div class="kpi-label">Reservas próximas</div><div class="kpi-value">'+d.reservasProx.length+'</div><div class="kpi-sub">próximos 30 días</div></div>';
  html+='</div>';

  // Ingresos por propiedad
  html+='<h2>Ingresos por propiedad <span class="sub">'+nomMes(d.mesActual)+'</span></h2>';
  const casas=Object.entries(d.ingPorCasa).sort((a,b)=>b[1].ars-a[1].ars);
  if(casas.length===0){
    html+='<p class="empty">Sin ingresos este mes.</p>';
  }else{
    html+='<table><thead><tr><th>Propiedad</th><th>Titular</th><th>Total ARS</th><th>Total USD</th></tr></thead><tbody>';
    for(const[casa,v]of casas){
      html+="<tr><td>"+casa+"</td><td>"+(TITULAR_CASA[casa]??"")+"</td><td>"+(v.ars>0?fmtARS(v.ars):"—")+"</td><td>"+(v.usd>0?fmtUSD(v.usd):"—")+"</td></tr>";
    }
    html+='</tbody></table>';
  }
  html+='</section>';

  // ── TITULARES ──────────────────────────────────────────────────────────────
  html+='<section id="titulares"><h2>Por titular <span class="sub">'+nomMes(d.mesActual)+'</span></h2><div class="card-grid">';
  const titCasas={Francisco:["Casa 1","Casa 2"],Milagros:["Casa 3","Casa 4"],"Inés":["Casa 5"]};
  for(const[tit,casasTit]of Object.entries(titCasas)){
    const t=d.resumenTit[tit]??{ingresos:0,gastos:0};
    const bal=t.ingresos-t.gastos;
    const balC=bal>=0?"pos":"neg";
    html+='<div class="card"><div class="card-title">'+tit+'</div><div class="card-sub">'+casasTit.join(" · ")+'</div>';
    html+='<div class="stat-row"><span>Ingresos</span><strong class="pos">'+fmtARS(t.ingresos)+"</strong></div>";
    html+='<div class="stat-row"><span>Gastos</span><strong class="neg">'+fmtARS(t.gastos)+"</strong></div>";
    html+='<div class="stat-row bt"><span>Balance</span><strong class="'+balC+'">'+fmtARS(bal)+"</strong></div>";
    html+='</div>';
  }
  html+='</div></section>';

  // ── RESERVAS ───────────────────────────────────────────────────────────────
  html+='<section id="reservas"><h2>Reservas próximas <span class="sub">próximos 30 días · '+d.reservasProx.length+' entrada'+(d.reservasProx.length!==1?"s":"")+'</span></h2>';
  if(d.reservasProx.length===0){
    html+='<p class="empty">No hay reservas con entrada en los próximos 30 días.</p>';
  }else{
    html+='<table><thead><tr><th>Propiedad</th><th>Huésped</th><th>Entrada</th><th>Salida</th><th>Noches</th><th>Monto total</th><th>Estado</th></tr></thead><tbody>';
    for(const r of d.reservasProx){
      const est=ESTADOS[r.estadoPago]??r.estadoPago;
      const cls=r.estadoPago==="COMPLETO"?"badge-ok":"badge-warn";
      html+="<tr><td>"+r.casa+"</td><td>"+r.nombrePax+"</td><td>"+fmtFecha(r.fechaEntrada)+"</td><td>"+fmtFecha(r.fechaSalida)+"</td><td style='text-align:center'>"+r.cantidadNoches+"</td><td>"+fmtUSD(r.montoTotalUSD)+"</td><td><span class='badge "+cls+"'>"+est+"</span></td></tr>";
    }
    html+='</tbody></table>';
  }
  html+='</section>';

  // ── SALDO PAOLA ────────────────────────────────────────────────────────────
  const c=d.comision;
  html+='<section id="comisiones"><h2>Saldo Paola <span class="sub">'+nomMes(d.mesActual)+'</span></h2>';
  html+='<div class="com-card">';
  html+='<div class="com-row"><span>Cobrado este mes</span><strong class="pos">'+fmtARS(c.cobradoMes)+"</strong></div>";
  html+='<div class="com-row"><span>Gastado este mes</span><strong class="neg">− '+fmtARS(c.gastadoMes)+"</strong></div>";
  html+='<div class="com-row"><span>Neto del mes</span><strong>'+fmtARS(c.cobradoMes-c.gastadoMes)+"</strong></div>";
  html+='<div class="com-row"><span>Total cobrado histórico</span><strong>'+fmtARS(c.totalCobrado)+"</strong></div>";
  html+='<div class="com-row"><span>Total gastado histórico</span><strong>'+fmtARS(c.totalGastado)+"</strong></div>";
  const balCls=c.balance>=0?"pos":"neg";
  html+='<div class="com-row total"><span>Balance</span><strong class="'+balCls+'">'+fmtARS(c.balance)+"</strong></div>";
  html+='</div></section>';

  // ── INGRESOS ───────────────────────────────────────────────────────────────
  html+='<section id="ingresos"><h2>Ingresos del mes <span class="sub">'+d.ingresos.length+' registros</span></h2>';
  if(d.ingresos.length===0){
    html+='<p class="empty">Sin ingresos registrados este mes.</p>';
  }else{
    html+='<table><thead><tr><th>Fecha</th><th>Propiedad</th><th>Monto</th><th>Quién pagó</th><th>Forma de pago</th><th>Detalle</th></tr></thead><tbody>';
    for(const r of d.ingresos){
      const montoFmt=r.moneda==="USD"?fmtUSD(r.monto)+' <small>('+fmtARS(r.montoARS)+")</small>":fmtARS(r.monto);
      html+="<tr><td>"+fmtFecha(r.fecha)+"</td><td>"+r.casa+"</td><td>"+montoFmt+"</td><td>"+r.quienPago+"</td><td>"+(TIPOS[r.tipo]??capFirst(r.tipo))+"</td><td class='det'>"+r.detalle+"</td></tr>";
    }
    html+='</tbody></table>';
  }
  html+='</section>';

  // ── GASTOS ─────────────────────────────────────────────────────────────────
  html+='<section id="gastos"><h2>Gastos del mes <span class="sub">'+d.gastos.length+' registros</span></h2>';
  if(d.gastos.length===0){
    html+='<p class="empty">Sin gastos registrados este mes.</p>';
  }else{
    html+='<table><thead><tr><th>ID</th><th>Fecha</th><th>Categoría</th><th>Monto</th><th>Pagado por</th><th>Detalle</th></tr></thead><tbody>';
    for(const r of d.gastos){
      const montoFmt=r.moneda==="USD"?fmtUSD(r.monto)+' <small>('+fmtARS(r.montoARS)+")</small>":fmtARS(r.monto);
      html+="<tr><td class='det' style='white-space:nowrap'>"+r.id+"</td><td>"+fmtFecha(r.fecha)+"</td><td>"+capFirst(r.categoria)+"</td><td>"+montoFmt+"</td><td>"+r.pagadoPor+"</td><td class='det'>"+r.detalle+"</td></tr>";
    }
    html+='</tbody></table>';

    const cats=Object.entries(d.gasPorCat).sort((a,b)=>b[1]-a[1]);
    if(cats.length>0){
      html+='<br><h2>Por categoría</h2><table style="max-width:380px"><thead><tr><th>Categoría</th><th>Total ARS</th></tr></thead><tbody>';
      for(const[cat,m]of cats) html+="<tr><td>"+capFirst(cat)+"</td><td>"+fmtARS(m)+"</td></tr>";
      html+='</tbody></table>';
    }
  }
  html+='</section>';

  document.getElementById("contenido").innerHTML=html;
  document.getElementById("contenido").style.display="block";
  document.getElementById("loading").style.display="none";
}

async function cargar(){
  document.getElementById("status").textContent="Actualizando...";
  try{
    const res=await fetch("/api/reporte");
    if(!res.ok) throw new Error("HTTP "+res.status);
    const d=await res.json();
    render(d);
    const ahora=new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
    document.getElementById("status").textContent="Última actualización: "+ahora;
  }catch(e){
    document.getElementById("status").textContent="Error al cargar: "+e.message;
    document.getElementById("loading").style.display="none";
  }
}

cargar();
setInterval(cargar,60000);
</script>
</body>
</html>`;
