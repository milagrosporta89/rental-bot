// Crea todas las pestañas del spreadsheet con sus headers y formato visual.
// Seguro correrlo varias veces: no borra datos existentes.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { google } = require('googleapis');

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const ARS = '"$ "#,##0.00';
const USD = '"USD "#,##0.00';
const NUM = '#,##0.00';  // monto genérico (puede ser ARS o USD según columna moneda)

// color: [r, g, b] en escala 0-1
// moneyColumns: [{ col (0-based), pattern }]
const TABS = [
  {
    name: 'Ingresos',
    color: [0.07, 0.33, 0.80],
    headers: [
      'id', 'fecha', 'casa', 'monto', 'moneda', 'tipo',
      'quienPago', 'nombreDestinatario', 'bancoOrigen', 'nroOperacion',
      'detalle', 'registradoPor', 'comprobanteUrl', 'timestamp',
      'cotizacion', 'monto_ars', 'monto_usd', 'idReserva', 'tipoMovimiento',
    ],
    moneyColumns: [
      { col: 3,  pattern: ARS },  // monto
      { col: 15, pattern: ARS },  // monto_ars
      { col: 16, pattern: USD },  // monto_usd
    ],
  },
  {
    name: 'Gastos',
    color: [0.80, 0.00, 0.00],
    headers: [
      'id', 'fecha', 'monto', 'moneda', 'categoria', 'pagadoPor',
      'nombreDestinatario', 'bancoOrigen', 'nroOperacion', 'detalle',
      'registradoPor', 'comprobanteUrl', 'timestamp', 'cotizacion',
      'monto_ars', 'monto_usd',
    ],
    moneyColumns: [
      { col: 2,  pattern: NUM },  // monto
      { col: 14, pattern: ARS },  // monto_ars
      { col: 15, pattern: USD },  // monto_usd
    ],
  },
  {
    name: 'Reservas',
    color: [0.22, 0.47, 0.11],
    headers: [
      'id', 'fechaRegistro', 'casa', 'titular',
      'nombrePax', 'cantidadPax', 'cantidadNoches',
      'fechaEntrada', 'fechaSalida',
      'montoTotalUSD', 'montoAdelantoARS', 'montoAdelantoUSD', 'saldoUSD',
      'estadoPago', 'comprobanteUrl', 'registradoPor',
      'timestamp', 'cotizacion', 'plataforma',
    ],
    moneyColumns: [
      { col: 9,  pattern: USD },  // montoTotalUSD
      { col: 10, pattern: ARS },  // montoAdelantoARS
      { col: 11, pattern: USD },  // montoAdelantoUSD
      { col: 12, pattern: USD },  // saldoUSD
    ],
  },
  {
    name: 'SaldosReales',
    color: [0.48, 0.06, 0.54],
    headers: ['fecha', 'titular', 'monto'],
    moneyColumns: [
      { col: 2, pattern: ARS },  // monto
    ],
  },
  {
    name: 'Historial',
    color: [0.49, 0.38, 0.00],
    headers: [
      'idRegistro', 'tipoRegistro', 'campo',
      'valorAnterior', 'valorNuevo',
      'modificadoPor', 'aprobadoPor', 'timestamp',
    ],
    moneyColumns: [],
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

function buildRequests(sheetId, numCols, [r, g, b], moneyColumns) {
  const requests = [
    // Fila 1: fondo de color + texto blanco + negrita + centrado
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: r, green: g, blue: b },
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },
    // Congelar fila 1
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    // Altura de la fila de headers: 28px
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 28 },
        fields: 'pixelSize',
      },
    },
    // Columnas: ancho automático
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: numCols },
      },
    },
  ];

  // Limpiar formato numérico en columnas de monto (fila 2 en adelante)
  for (const { col } of moneyColumns) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 10000, startColumnIndex: col, endColumnIndex: col + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: 'General' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    });
  }

  return requests;
}

async function run() {
  const allRequests = [];

  for (const tab of TABS) {
    const sheetId = await crearObtenerTab(tab.name);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tab.name}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [tab.headers] },
    });

    allRequests.push(...buildRequests(sheetId, tab.headers.length, tab.color, tab.moneyColumns));
    console.log(`✓ ${tab.name.padEnd(16)} ${tab.headers.length} cols, ${tab.moneyColumns.length} cols de moneda`);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: allRequests },
  });

  console.log('\n✅ Setup y formateo completos.');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
