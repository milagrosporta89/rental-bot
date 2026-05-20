require('dotenv').config();
const { google } = require('googleapis');

const PAOLA_ID = '1sPSZartllr-cVOgXcnE7_1xyRoxHd1ciImWCbuacWh8';
const BOT_ID   = process.env.GOOGLE_SHEET_ID;

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const MESES = { ENERO:'01', FEBRERO:'02', MARZO:'03', ABRIL:'04', MAYO:'05' };
const TS = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

function parseNum(v) {
  if (!v || v === '#DIV/0!') return 0;
  return parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0;
}

function fecha(dia, mesNum) {
  const d = String(dia).padStart(2, '0');
  return `${d}/${mesNum}/2026`;
}

function normalizarCuenta(cuenta) {
  if (!cuenta) return '';
  const u = cuenta.toUpperCase();
  if (u === 'PAO') return 'Paola';
  if (u.includes('FRAN') || u === 'FRANCISCO') return 'Francisco';
  if (u.includes('MILAG')) return 'Milagros';
  if (u.includes('INES')) return 'Inés';
  if (u.includes('FER')) return 'Fernando';
  return cuenta;
}

function tipo(cuenta) {
  const u = (cuenta || '').toUpperCase();
  return (u.includes('EFVTO') || u.includes('EFTVO') || u.includes('EFECTO') || u.includes('ETVO'))
    ? 'efectivo' : 'transferencia';
}

function mapCategoria(concepto) {
  const c = (concepto || '').toLowerCase();
  if (c.includes('limp')) return 'limpieza';
  if (c.includes('lavan')) return 'lavanderia';
  if (c.includes('jardin')) return 'jardinero';
  if (c.includes('expens')) return 'expensas';
  if (c.includes('electr') || c.includes('luz')) return 'luz';
  if (c.includes('gas')) return 'gas';
  if (c.includes('manten') || c.includes('ferret') || c.includes('plomer') || c.includes('aspir') || c.includes('vajill') || c.includes('reposic') || c.includes('leña')) return 'mantenimiento';
  if (c.includes('internet')) return 'internet';
  if (c.includes('manager') || c.includes('communit') || c.includes('comunit') || c.includes('marketing') || c.includes('publicid') || c.includes('fotograf') || c.includes('hosting') || c.includes('dominio') || c.includes('pag web')) return 'marketing';
  if (c.includes('impuesto') || c.includes('comuna') || c.includes('tasa')) return 'impuestos';
  if (c.includes('comi') && c.includes('pao')) return 'comision';
  return 'otro';
}

async function run() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: PAOLA_ID });
  const tabs = meta.data.sheets.map(s => s.properties.title).filter(t => MESES[t]);

  const ingresos = [];
  const gastos = [];
  const comisiones = [];

  for (const tab of tabs) {
    const mesNum = MESES[tab];
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: PAOLA_ID,
      range: `'${tab}'!A2:K200`,
    });

    for (const r of (res.data.values || [])) {
      const dia       = r[0];
      const concepto  = (r[1] || '').trim();
      const ingARS    = parseNum(r[2]);
      const gasARS    = parseNum(r[3]);
      const cotiz     = parseNum(r[4]);
      const cuenta    = (r[7] || '').trim();

      // Saltar filas sin día numérico o vacías
      if (!dia || isNaN(Number(dia)) || !concepto) continue;

      const f = fecha(dia, mesNum);
      const dest = normalizarCuenta(cuenta);

      // COMI PAO → Comisiones + Gastos
      if (concepto.toUpperCase().includes('COMI PAO')) {
        const usdGtos = parseNum(r[6]);
        const monto = cotiz > 0 ? Math.round(usdGtos * cotiz) : Math.round(usdGtos);
        if (monto > 0) {
          const mesKey = `2026-${mesNum}`;
          // Comisiones (cobro)
          comisiones.push([mesKey, monto, 'cobro', `Comisión ${tab.toLowerCase()} 2026`, TS, cotiz || '']);
          // Gastos
          gastos.push([
            `GAS-${Date.now() + gastos.length}`, f, monto, 'ARS', 'comision',
            '', '', '', '', `Comisión Paola ${tab.toLowerCase()} 2026`,
            'Paola', '', TS, cotiz || '',
          ]);
        }
        continue;
      }

      // Ingreso
      if (ingARS > 0) {
        // cols: id, fecha, casa, monto, moneda, tipo, quienPago, nombreDestinatario, bancoOrigen, nroOperacion, detalle, registradoPor, comprobanteUrl, timestamp, cotizacion
        ingresos.push([
          `ING-${Date.now() + ingresos.length}`, f, '', ingARS, 'ARS', tipo(cuenta),
          concepto, dest, '', '', '',
          'Paola', '', TS, cotiz || '',
        ]);

        // Si la cuenta es PAO → también a Comisiones como cobro
        if (dest === 'Paola') {
          const mesKey = `2026-${mesNum}`;
          comisiones.push([mesKey, ingARS, 'cobro', concepto, TS, cotiz || '']);
        }
        continue;
      }

      // Gasto
      if (gasARS > 0) {
        // cols: id, fecha, monto, moneda, categoria, pagadoPor, nombreDestinatario, bancoOrigen, nroOperacion, detalle, registradoPor, comprobanteUrl, timestamp, cotizacion
        gastos.push([
          `GAS-${Date.now() + gastos.length}`, f, gasARS, 'ARS', mapCategoria(concepto),
          dest, '', '', '', concepto,
          'Paola', '', TS, cotiz || '',
        ]);
        // Si lo pagó Paola → suma a Comisiones como gasto (negativo)
        if (dest === 'Paola') {
          const mesKey = `2026-${mesNum}`;
          comisiones.push([mesKey, -gasARS, 'gasto', `Gasto: ${concepto}`, TS, cotiz || '']);
        }
        continue;
      }
    }
  }

  console.log(`Procesado: ${ingresos.length} ingresos, ${gastos.length} gastos, ${comisiones.length} comisiones`);

  // Limpiar hojas bot
  console.log('Limpiando hojas...');
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId: BOT_ID,
    requestBody: { ranges: ['Ingresos!A2:O', 'Gastos!A2:N', 'Comisiones!A2:F'] },
  });

  // Escribir
  if (ingresos.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: BOT_ID, range: 'Ingresos!A:N',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: ingresos },
    });
    console.log(`✓ ${ingresos.length} ingresos migrados`);
  }

  if (gastos.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: BOT_ID, range: 'Gastos!A:M',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: gastos },
    });
    console.log(`✓ ${gastos.length} gastos migrados`);
  }

  if (comisiones.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: BOT_ID, range: 'Comisiones!A:D',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: comisiones },
    });
    console.log(`✓ ${comisiones.length} entradas en comisiones`);
  }

  console.log('\nMigración completa ✓');
}

run().catch(e => console.error(e.response?.data?.error ?? e.message));
