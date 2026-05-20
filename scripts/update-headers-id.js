require('dotenv').config();
const { google } = require('googleapis');
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const ID = process.env.GOOGLE_SHEET_ID;

async function run() {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        {
          range: 'Ingresos!A1:O1',
          values: [['id','fecha','casa','monto','moneda','tipo','quienPago','nombreDestinatario','bancoOrigen','nroOperacion','detalle','registradoPor','comprobanteUrl','timestamp','cotizacion']],
        },
        {
          range: 'Gastos!A1:N1',
          values: [['id','fecha','monto','moneda','categoria','pagadoPor','nombreDestinatario','bancoOrigen','nroOperacion','detalle','registradoPor','comprobanteUrl','timestamp','cotizacion']],
        },
      ],
    },
  });
  console.log('Headers actualizados ✓');
}
run().catch(e => console.error(e.message));
