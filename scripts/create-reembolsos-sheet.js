require('dotenv').config();
const { google } = require('googleapis');

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function run() {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: 'ReembolsosPaola' } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'ReembolsosPaola!A1:D1',
    valueInputOption: 'RAW',
    requestBody: { values: [['fecha', 'monto', 'descripcion', 'timestamp']] },
  });
  console.log('Hoja ReembolsosPaola creada ✓');
}

run().catch(e => console.error(e.response?.data ?? e.message));
