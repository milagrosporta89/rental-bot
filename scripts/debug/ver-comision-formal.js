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

async function run() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Comisiones!A2:F',
  });

  const filas = (res.data.values || []).filter(r =>
    r[2] === 'cobro' && r[3] && r[3].toLowerCase().includes('comisi')
  );

  let total = 0;
  filas.forEach(r => {
    const m = parseNum(r[1]);
    total += m;
    console.log(`${r[0]} | ${r[3]} | ARS $${m.toLocaleString('es-AR')} | USD ${r[5]}`);
  });
  console.log(`\nTOTAL comisiones cobradas: $${total.toLocaleString('es-AR')} ARS`);
}

run().catch(e => console.error(e.message));
