// Pobla la hoja Reservas con datos de prueba para testeo manual
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { google } = require('googleapis');

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Hoy: 09/06/2026 (lunes). Semana actual: 09/06 – 15/06
const COTIZ = 1350;

// id | fechaRegistro | casa | titular | nombrePax | cantPax | noches |
// fechaEntrada | fechaSalida | totalUSD | adelantoARS | adelantoUSD | saldoUSD |
// estadoPago | comprobanteUrl | registradoPor | timestamp | cotizacion | plataforma (A–S)
const rows = [
  // 1 — Check-in ESTA semana · adelanto ARS · saldo pendiente
  [
    '1', '09/06/2026', 'Casa 3', 'Milagros', 'García María', 4, 5,
    '10/06/2026', '15/06/2026', 800,
    540000, 400, 400,
    'ADELANTO_RECIBIDO', '', 'seed', '09/06/2026 10:00', COTIZ, 'whatsapp_directo',
  ],
  // 2 — Check-in ESTA semana · adelanto USD · saldo pendiente
  [
    '2', '09/06/2026', 'Casa 1', 'Francisco', 'López Juan', 2, 3,
    '12/06/2026', '15/06/2026', 500,
    270000, 200, 300,
    'ADELANTO_RECIBIDO', '', 'seed', '09/06/2026 10:01', COTIZ, 'whatsapp_directo',
  ],
  // 3 — Check-in PRÓXIMA semana · debe aparecer solo en búsqueda por nombre
  [
    '3', '09/06/2026', 'Casa 2', 'Francisco', 'Rodríguez Ana', 3, 7,
    '16/06/2026', '23/06/2026', 1200,
    405000, 300, 900,
    'ADELANTO_RECIBIDO', '', 'seed', '09/06/2026 10:02', COTIZ, 'whatsapp_directo',
  ],
  // 4 — Check-in esta semana · YA COMPLETA · NO debe aparecer en pendientes
  [
    '4', '05/06/2026', 'Casa 4', 'Milagros', 'Fernández Carlos', 2, 4,
    '11/06/2026', '15/06/2026', 600,
    270000, 200, 0,
    'COMPLETO', '', 'seed', '05/06/2026 09:00', COTIZ, 'whatsapp_directo',
  ],
  // 5 — Check-in semana pasada · NO aparece en semana pero SÍ en búsqueda nombre
  [
    '5', '02/06/2026', 'Casa 5', 'Inés', 'García Roberto', 5, 6,
    '02/06/2026', '08/06/2026', 900,
    405000, 300, 600,
    'ADELANTO_RECIBIDO', '', 'seed', '02/06/2026 08:00', COTIZ, 'whatsapp_directo',
  ],
  // 6 — Check-in esta semana · nombre parecido a #1 para probar búsqueda múltiple
  [
    '6', '09/06/2026', 'Casa 5', 'Inés', 'García Sofía', 6, 5,
    '13/06/2026', '18/06/2026', 1000,
    337500, 250, 750,
    'ADELANTO_RECIBIDO', '', 'seed', '09/06/2026 10:05', COTIZ, 'whatsapp_directo',
  ],
];

async function run() {
  // Limpiar datos existentes (mantiene headers)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: 'Reservas!A2:S',
  });
  console.log('Datos anteriores borrados.');

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Reservas!A2',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  console.log(`\n✓ ${rows.length} reservas de prueba insertadas.\n`);
  console.log('Casos de prueba:');
  console.log('  #1 · Casa 3 · García María   — check-in 10/06 (ESTA semana) · saldo pendiente USD 400');
  console.log('  #2 · Casa 1 · López Juan      — check-in 12/06 (ESTA semana) · saldo pendiente USD 300');
  console.log('  #3 · Casa 2 · Rodríguez Ana   — check-in 16/06 (PRÓXIMA semana) · solo en búsqueda nombre');
  console.log('  #4 · Casa 4 · Fernández Carlos — check-in 11/06 · COMPLETA → no debe aparecer');
  console.log('  #5 · Casa 5 · García Roberto   — check-in 02/06 (semana pasada) · solo en búsqueda nombre');
  console.log('  #6 · Casa 5 · García Sofía     — check-in 13/06 (ESTA semana) · saldo pendiente USD 750');
  console.log('\nBúsqueda por nombre "garcía" → debe devolver #1, #5 y #6 (3 resultados)');
  console.log('Búsqueda por nombre "lópez"  → debe devolver #2 (1 resultado, va directo)');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
