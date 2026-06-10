require('dotenv').config();
const { google } = require('googleapis');
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

function parseNum(v) {
  if (!v) return 0;
  return parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0;
}

function mesKey(fecha) {
  const [, mes, anio] = fecha.split('/');
  return `${anio}-${mes.padStart(2, '0')}`;
}

async function run() {
  const [ingRes, comRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'Ingresos!A2:Q' }),
    sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'Comisiones!A2:F' }),
  ]);

  // Ingresos totales por mes en ARS (usando monto_ars col P = index 15)
  const ingPorMes = {};
  for (const r of (ingRes.data.values || [])) {
    if (!r[1]) continue;
    const mes = mesKey(r[1]);
    const monto = parseNum(r[15]) || parseNum(r[3]); // monto_ars o monto
    ingPorMes[mes] = (ingPorMes[mes] || 0) + monto;
  }

  // Comisiones formales por mes
  const comPorMes = {};
  for (const r of (comRes.data.values || [])) {
    if (r[2] === 'cobro' && r[3] && r[3].toLowerCase().includes('comisi')) {
      comPorMes[r[0]] = parseNum(r[1]);
    }
  }

  // Análisis
  const meses = Object.keys(ingPorMes).sort();
  console.log('MES FACTURADO | TOTAL ING ARS | COM COBRADA (mes sig) | % real');
  console.log('─'.repeat(80));

  for (let i = 0; i < meses.length; i++) {
    const mes = meses[i];
    const [anio, m] = mes.split('-').map(Number);
    const mesSig = `${m === 12 ? anio + 1 : anio}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;

    const ing = ingPorMes[mes] || 0;
    const com = comPorMes[mesSig] || 0;
    const pct = ing > 0 && com > 0 ? ((com / ing) * 100).toFixed(1) : '—';

    console.log(`${mes}        | $${ing.toLocaleString('es-AR').padStart(14)} | $${com.toLocaleString('es-AR').padStart(14)} (${mesSig}) | ${pct}%`);
  }

  // También mostrar diciembre estimado (comisión de enero viene de diciembre)
  const comEnero = comPorMes['2026-01'] || 0;
  if (comEnero > 0) {
    const ingDic = comEnero / 0.20;
    console.log(`\n2025-12 (estimado) | $${Math.round(ingDic).toLocaleString('es-AR')} facturado → comisión enero $${comEnero.toLocaleString('es-AR')} (20%)`);
  }
}

run().catch(e => console.error(e.message));
