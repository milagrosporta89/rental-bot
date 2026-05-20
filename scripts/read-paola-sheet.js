require('dotenv').config();
const { google } = require('googleapis');

const PAOLA_SHEET_ID = '1sPSZartllr-cVOgXcnE7_1xyRoxHd1ciImWCbuacWh8';

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function run() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: PAOLA_SHEET_ID });
  const tabs = meta.data.sheets.map(s => s.properties.title);
  console.log('Pestañas:', tabs.join(', '));

  // Leer primeras filas de cada pestaña
  for (const tab of tabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: PAOLA_SHEET_ID,
      range: `'${tab}'!A1:Z5`,
    });
    console.log(`\n--- ${tab} ---`);
    (res.data.values ?? []).forEach(r => console.log(r.join(' | ')));
  }
}

run().catch(e => console.error(e.response?.data?.error ?? e.message));
