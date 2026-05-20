require('dotenv').config();
const { google } = require('googleapis');

const PAOLA_SHEET_ID = '1sPSZartllr-cVOgXcnE7_1xyRoxHd1ciImWCbuacWh8';

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

const MESES = { ENERO: '01', FEBRERO: '02', MARZO: '03', ABRIL: '04', MAYO: '05' };

async function run() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: PAOLA_SHEET_ID });
  const tabs = meta.data.sheets.map(s => s.properties.title);

  for (const tab of tabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: PAOLA_SHEET_ID,
      range: `'${tab}'!A1:K200`,
    });
    const rows = res.data.values ?? [];
    console.log(`\n====== ${tab} (${rows.length - 1} filas) ======`);
    console.log(rows[0]?.join(' | '));
    console.log('---');
    rows.slice(1).forEach((r, i) => {
      if (r.some(c => c)) console.log(`${i + 2}: ${r.join(' | ')}`);
    });
  }
}

run().catch(e => console.error(e.response?.data?.error ?? e.message));
