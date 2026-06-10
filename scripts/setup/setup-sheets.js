// Crea todas las pestañas del spreadsheet con sus headers.
// Seguro correrlo varias veces: no borra datos existentes, solo crea la pestaña si no existe
// y sobreescribe la fila 1 (headers).
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { google } = require('googleapis');

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const TABS = [
  {
    name: 'Ingresos',
    headers: [
      'id', 'fecha', 'casa', 'monto', 'moneda', 'tipo',
      'quienPago', 'nombreDestinatario', 'bancoOrigen', 'nroOperacion',
      'detalle', 'registradoPor', 'comprobanteUrl', 'timestamp',
      'cotizacion', 'monto_ars', 'monto_usd', 'plataforma',
    ],
  },
  {
    name: 'Gastos',
    headers: [
      'id', 'fecha', 'monto', 'moneda', 'categoria', 'pagadoPor',
      'nombreDestinatario', 'bancoOrigen', 'nroOperacion', 'detalle',
      'registradoPor', 'comprobanteUrl', 'timestamp', 'cotizacion',
      'monto_ars', 'monto_usd',
    ],
  },
  {
    name: 'Reservas',
    headers: [
      'id', 'fechaRegistro', 'casa', 'titular',
      'nombrePax', 'cantidadPax', 'cantidadNoches',
      'fechaEntrada', 'fechaSalida',
      'montoTotalUSD', 'montoAdelantoARS', 'montoAdelantoUSD', 'saldoUSD',
      'estadoPago', 'comprobanteUrl', 'registradoPor',
      'timestamp', 'cotizacion', 'plataforma',
    ],
  },
  {
    name: 'Comisiones',
    headers: ['mes', 'monto', 'tipo', 'descripcion', 'timestamp', 'cotizacion'],
  },
  {
    name: 'SaldosReales',
    headers: ['fecha', 'titular', 'monto'],
  },
  {
    name: 'ReembolsosPaola',
    headers: ['fecha', 'monto', 'descripcion', 'timestamp'],
  },
];

async function crearObtenerTab(nombre) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = meta.data.sheets.find(s => s.properties.title === nombre);
  if (existing) return existing.properties.sheetId;
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: nombre } } }] },
  });
  return res.data.replies[0].addSheet.properties.sheetId;
}

async function run() {
  for (const tab of TABS) {
    await crearObtenerTab(tab.name);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tab.name}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [tab.headers] },
    });
    console.log(`✓ ${tab.name.padEnd(16)} ${tab.headers.length} columnas`);
  }
  console.log('\nSetup completo.');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
