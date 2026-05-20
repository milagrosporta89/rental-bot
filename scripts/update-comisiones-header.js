require('dotenv').config();
const { google } = require('googleapis');
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

sheets.spreadsheets.values.update({
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  range: 'Comisiones!A1:F1',
  valueInputOption: 'RAW',
  requestBody: { values: [['mes','monto','tipo','descripcion','timestamp','cotizacion']] },
}).then(() => console.log('Header actualizado ✓'))
  .catch(e => console.error(e.message));
