require('dotenv').config();
const { google } = require('googleapis');
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function run() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Gastos!A2:P',
  });
  const filas = (res.data.values || []).filter(r => r[4] === 'comision');
  console.log('Filas de comision:');
  filas.forEach(r => console.log(`  ${r[1]} | ${r[2]} ${r[3]} | monto_ars=${r[14]} | monto_usd=${r[15]} | cotiz=${r[13]} | ${r[9]}`));
}
run().catch(e => console.error(e.message));
