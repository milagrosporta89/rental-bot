// Genera la pestaña "Resumen" combinando Ingresos (+) y Gastos (-).
// Correr cada vez que se quiera reconstruir: node scripts/generar-resumen.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { google } = require('googleapis');

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function parseFecha(s) {
  if (!s) return new Date(0);
  const [d, m, y] = s.split('/');
  return new Date(+y, +m - 1, +d);
}

function mesAnio(s) {
  if (!s) return '';
  const [, m, y] = s.split('/');
  return `${y}-${m.padStart(2, '0')}`;
}

function num(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

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
  // 1. Leer datos fuente
  const [ingRes, gasRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Ingresos!A:S' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Gastos!A:P' }),
  ]);

  const ingresos = (ingRes.data.values ?? []).slice(1).filter(r => r[0]);
  const gastos   = (gasRes.data.values ?? []).slice(1).filter(r => r[0]);

  // 2. Combinar y ordenar por fecha DESC
  // Ingresos: fecha=B(1) detalle=K(10) monto_ars=P(15) monto_usd=Q(16) destinatario=H(7) pagadoPor=G(6)
  // Gastos:   fecha=B(1) categoria=E(4) detalle=J(9) monto_ars=-O(14) monto_usd=-P(15) pagadoPor=F(5)
  const filas = [
    ...ingresos.map(r => ({
      id:           r[0]  ?? '',
      fecha:        r[1]  ?? '',
      categoria:    'reserva',
      detalle:      r[10] ?? '',
      montoARS:     num(r[15]),
      montoUSD:     num(r[16]),
      destinatario: r[7]  ?? '',
      pagadoPor:    r[6]  ?? '',
    })),
    ...gastos.map(r => ({
      id:           r[0]  ?? '',
      fecha:        r[1]  ?? '',
      categoria:    r[4]  ?? '',
      detalle:      r[9]  ?? '',
      montoARS:     -num(r[14]),
      montoUSD:     -num(r[15]),
      destinatario: '',
      pagadoPor:    r[5]  ?? '',
    })),
  ].sort((a, b) => parseFecha(b.fecha) - parseFecha(a.fecha));

  // 3. Crear tab si no existe
  const sheetId = await crearObtenerTab('Resumen');

  // 4. Leer metadata para borrar tablas y reglas previas
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetMeta = meta.data.sheets.find(s => s.properties.sheetId === sheetId);
  const existingTables = sheetMeta?.tables ?? [];
  const existingRules  = sheetMeta?.conditionalFormats?.length ?? 0;

  const HEADERS = ['Fecha', 'Categoría', 'Detalle', 'Monto ARS', 'Monto USD', 'Destinatario', 'Pagado por', 'Mes', 'id'];
  const DATA = filas.map(f => [
    f.fecha, f.categoria, f.detalle,
    f.montoARS !== 0 ? f.montoARS : '',
    f.montoUSD !== 0 ? f.montoUSD : '',
    f.destinatario, f.pagadoPor, mesAnio(f.fecha), f.id,
  ]);
  const totalRows = 1 + DATA.length;

  // 5. Limpiar tablas + reglas + filtro previos
  const cleanupRequests = [];
  for (const table of existingTables) cleanupRequests.push({ deleteTable: { tableId: table.tableId } });
  for (let i = 0; i < existingRules; i++) cleanupRequests.push({ deleteConditionalFormatRule: { sheetId, index: 0 } });
  cleanupRequests.push({ clearBasicFilter: { sheetId } });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: cleanupRequests } });

  // 6. Limpiar celdas
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'Resumen!A1:G10000' });

  // 7. Crear tabla primero (addTable limpia las celdas del rango, por eso va antes de escribir datos)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        addTable: {
          table: {
            name: 'Resumen',
            range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endRowIndex: totalRows, endColumnIndex: 9 },
          },
        },
      }],
    },
  });

  // 8. Escribir headers + datos DESPUÉS de crear la tabla (sobreescribe los "Columna X" por defecto)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Resumen!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS, ...DATA] },
  });

  // 9. Formato condicional + freeze + auto-resize
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 5 }],
              booleanRule: {
                condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '0' }] },
                format: { textFormat: { foregroundColor: { red: 0.06, green: 0.44, blue: 0.06 } } },
              },
            },
            index: 0,
          },
        },
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 5 }],
              booleanRule: {
                condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '0' }] },
                format: { textFormat: { foregroundColor: { red: 0.80, green: 0.00, blue: 0.00 } } },
              },
            },
            index: 1,
          },
        },
        // Monto ARS: "$ 1.234,56"
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 4 },
            cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '"$ "#,##0.00' } } },
            fields: 'userEnteredFormat.numberFormat',
          },
        },
        // Monto USD: "USD 1.234,56"
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
            cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '"USD "#,##0.00' } } },
            fields: 'userEnteredFormat.numberFormat',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        // Ocultar columna I (id)
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 },
            properties: { hiddenByUser: true },
            fields: 'hiddenByUser',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 8 },
          },
        },
      ],
    },
  });

  console.log(`✅ Resumen generado: ${filas.length} filas (${ingresos.length} ingresos + ${gastos.length} gastos)`);
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
