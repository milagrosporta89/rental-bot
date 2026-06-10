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
    range: 'Gastos!A2:I',
  });
  const otros = (res.data.values || [])
    .filter(r => r[3] === 'otro')
    .map(r => `${r[0]} | ${r[8]} | $${r[1]}`);
  console.log(`${otros.length} gastos en "otro":\n`);
  otros.forEach(r => console.log(r));
}
run().catch(e => console.error(e.message));
