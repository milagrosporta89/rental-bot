require('dotenv').config();
const { google } = require('googleapis');
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });
const ID = process.env.GOOGLE_SHEET_ID;
const PAOLA_ID = '1sPSZartllr-cVOgXcnE7_1xyRoxHd1ciImWCbuacWh8';

const buscarId = process.argv[2];

async function run() {
  // Buscar en Gastos del bot
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'Gastos!A2:P' });
  const fila = (res.data.values || []).find(r => r[0] === buscarId);
  if (fila) {
    console.log('Fila en Gastos:');
    ['id','fecha','monto','moneda','categoria','pagadoPor','nombreDestinatario','bancoOrigen','nroOperacion','detalle','registradoPor','comprobanteUrl','timestamp','cotizacion','monto_ars','monto_usd']
      .forEach((col, i) => console.log(`  ${col}: ${fila[i] ?? ''}`));
  } else {
    console.log('No encontrada');
  }
}
run().catch(e => console.error(e.message));
