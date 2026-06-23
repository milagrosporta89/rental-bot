// Diagnóstico: lee headers + primeras 3 filas de cada hoja para comparar con el formato esperado.
// Correr: node scripts/diagnostico-sheets.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { google } = require('googleapis');

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SHEET_ID = '1sPSZartllr-cVOgXcnE7_1xyRoxHd1ciImWCbuacWh8';

const HOJAS = ['Ingresos', 'Gastos', 'Reservas', 'SaldosReales', 'Resumen'];

// Formato esperado por el código actual
const FORMATO_ESPERADO = {
  Ingresos: ['id','fecha','casa','monto','moneda','tipo','quienPago','nombreDestinatario','bancoDestino','nroOperacion','detalle','registradoPor','comprobanteUrl','timestamp','cotizacion','montoARS','montoUSD','idReserva','tipoMovimiento'],
  Gastos:   ['id','fecha','monto','moneda','categoria','pagadoPor','nombreDestinatario','bancoOrigen','nroOperacion','detalle','registradoPor','comprobanteUrl','timestamp','cotizacion','montoARS','montoUSD'],
  Reservas: ['id','fechaRegistro','casa','titular','nombrePax','cantidadPax','cantidadNoches','fechaEntrada','fechaSalida','montoTotalUSD','montoAdelantoARS','montoAdelantoUSD','saldoUSD','estadoPago','comprobanteUrl','registradoPor','timestamp','cotizacion','plataforma'],
  SaldosReales: ['fecha','titular','monto','timestamp'],
  Resumen: ['fecha','tipo','detalle','montoARS','montoUSD','destinatario','pagadoPor','mesAnio','id'],
};

async function diagnosticar() {
  // Listar todas las hojas del spreadsheet
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const nombresHojas = (meta.data.sheets ?? []).map(s => s.properties?.title);
  console.log('Hojas encontradas:', nombresHojas);

  // Leer estructura de cada hoja mensual
  for (const hoja of nombresHojas) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`HOJA: ${hoja}`);
    console.log('='.repeat(60));

    let res;
    try {
      res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${hoja}!A1:Z5`,
      });
    } catch (e) {
      console.log(`  ❌ No se pudo leer: ${e.message}`);
      continue;
    }

    const filas = res.data.values ?? [];
    if (filas.length === 0) {
      console.log('  (vacía)');
      continue;
    }

    const headers = filas[0];
    const esperado = [];

    console.log(`\n  Columnas actuales (${headers.length}):`);
    headers.forEach((h, i) => {
      const letra = String.fromCharCode(65 + i);
      const esperadaEn = esperado[i] ?? '—';
      const ok = h === '' ? '⬜ vacío' : h === esperadaEn ? '✅' : `⚠️  (esperado: "${esperadaEn}")`;
      console.log(`    ${letra}: "${h}"  ${ok}`);
    });

    if (esperado.length > headers.length) {
      console.log(`\n  Columnas FALTANTES en el sheet (esperadas por el código):`);
      for (let i = headers.length; i < esperado.length; i++) {
        const letra = String.fromCharCode(65 + i);
        console.log(`    ${letra}: "${esperado[i]}"  ❌ no existe`);
      }
    }

    if (filas.length > 1) {
      console.log(`\n  Primeras filas de datos:`);
      for (let r = 1; r < Math.min(filas.length, 4); r++) {
        const fila = filas[r];
        const preview = headers.map((h, i) => `${h}=${JSON.stringify(fila[i] ?? '')}`).join(', ');
        console.log(`    Fila ${r + 1}: ${preview}`);
      }
    }

    console.log(`\n  Total filas con datos: ${filas.length - 1}`);
  }
}

diagnosticar().catch(console.error);
