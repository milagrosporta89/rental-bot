// Setup julio 2026: crea ComisionesPaola, arma AnálisisPaola con fórmulas, protege pestañas de datos
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { google } = require('googleapis');

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/^["']|["'],?\s*$/g, '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// ── Helpers ────────────────────────────────────────────────────────────────

async function getMeta() {
  const res = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  return res.data.sheets.map(s => ({ title: s.properties.title, id: s.properties.sheetId }));
}

async function createSheet(title) {
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  return res.data.replies[0].addSheet.properties.sheetId;
}

async function write(range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

async function clear(tab) {
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: tab });
}

async function protect(sheetId, description) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        addProtectedRange: {
          protectedRange: {
            range: { sheetId },
            description,
            warningOnly: false,
            editors: {
              users: [process.env.GOOGLE_CLIENT_EMAIL],
              domainUsersCanEdit: false,
            },
          },
        },
      }],
    },
  });
}

// ── 1. ComisionesPaola ─────────────────────────────────────────────────────

async function setupComisionesPaola(existingSheets) {
  let sheetId = existingSheets.find(s => s.title === 'ComisionesPaola')?.id;
  if (sheetId == null) {
    sheetId = await createSheet('ComisionesPaola');
    console.log('  Pestaña ComisionesPaola creada.');
  } else {
    console.log('  Pestaña ComisionesPaola ya existe.');
  }
  // Headers: A=mes(MM/YYYY), B=tipo, C=monto, D=moneda, E=descripcion, F=timestamp, G=cotizacion, H=monto_ars
  await write('ComisionesPaola!A1:H1', [[
    'mes', 'tipo', 'monto', 'moneda', 'descripcion', 'timestamp', 'cotizacion', 'monto_ars'
  ]]);
  console.log('  Headers ComisionesPaola escritos.');
  return sheetId;
}

// ── 2. AnálisisPaola con fórmulas ──────────────────────────────────────────

function ingresoWaFormula(mesCell) {
  return `=ROUND(SUMPRODUCT((RIGHT(Ingresos!$B$2:$B$1000,7)=${mesCell})*(Ingresos!$R$2:$R$1000="WhatsApp")*IF(ISNUMBER(Ingresos!$P$2:$P$1000),Ingresos!$P$2:$P$1000,0)))`;
}
function ingresoAbFormula(mesCell) {
  return `=ROUND(SUMPRODUCT((RIGHT(Ingresos!$B$2:$B$1000,7)=${mesCell})*(Ingresos!$R$2:$R$1000="Airbnb")*IF(ISNUMBER(Ingresos!$P$2:$P$1000),Ingresos!$P$2:$P$1000,0)))`;
}
function transferenciasFormula(mesCell) {
  return `=ROUND(SUMPRODUCT((ComisionesPaola!$A$2:$A$1000=${mesCell})*(ComisionesPaola!$B$2:$B$1000="transferencia")*IF(ISNUMBER(ComisionesPaola!$H$2:$H$1000),ComisionesPaola!$H$2:$H$1000,0)))`;
}
function cobrosDirectosFormula(mesCell) {
  return `=ROUND(SUMPRODUCT((ComisionesPaola!$A$2:$A$1000=${mesCell})*(ComisionesPaola!$B$2:$B$1000="cobro_directo")*IF(ISNUMBER(ComisionesPaola!$H$2:$H$1000),ComisionesPaola!$H$2:$H$1000,0)))`;
}
function gastosPaolaFormula(mesCell) {
  return `=ROUND(SUMPRODUCT((RIGHT(Gastos!$B$2:$B$1000,7)=${mesCell})*(Gastos!$F$2:$F$1000="Paola")*IF(ISNUMBER(Gastos!$O$2:$O$1000),Gastos!$O$2:$O$1000,0)))`;
}

async function setupAnalisis(tab) {
  await clear(tab);
  console.log('  AnálisisPaola limpiado.');

  const MESES = [
    '07/2026','08/2026','09/2026','10/2026','11/2026','12/2026',
    '01/2027','02/2027','03/2027','04/2027','05/2027','06/2027',
  ];
  const DATA_START = 5; // fila donde empiezan los datos (1-indexed)

  // Fila 1: título
  await write(`${tab}!A1`, [['ANÁLISIS COMISIONES PAOLA — julio 2026 en adelante']]);

  // Fila 2: tasas
  await write(`${tab}!A2`, [['Tasa WhatsApp: 15%  |  Tasa Airbnb: 5%  |  Datos se actualizan solos cuando el bot registra ingresos/gastos']]);

  // Fila 4: headers
  await write(`${tab}!A4:J4`, [[
    'mes_cobro', 'mes_base_fact',
    'facturado_wa', 'facturado_ab', 'com_esperada',
    'transferencias', 'cobros_directos', 'gastos_paola',
    'neto_cobrado', 'diferencia',
  ]]);

  // Filas de datos
  const dataRows = MESES.map((mes, i) => {
    const row = DATA_START + i;
    const aCell = `A${row}`;
    const bCell = `B${row}`;
    const cCell = `C${row}`;
    const dCell = `D${row}`;
    const eCell = `E${row}`;
    const fCell = `F${row}`;
    const gCell = `G${row}`;
    const hCell = `H${row}`;

    const mesBase = `TEXT(EDATE(DATEVALUE("01/"&${aCell}),-1),"MM/YYYY")`;

    return [
      mes,                                                          // A: mes_cobro
      `=${mesBase}`,                                                // B: mes_base_fact
      ingresoWaFormula(bCell),                                      // C: facturado_wa
      ingresoAbFormula(bCell),                                      // D: facturado_ab
      `=ROUND(${cCell}*0.15+${dCell}*0.05)`,                       // E: com_esperada
      transferenciasFormula(aCell),                                 // F: transferencias
      cobrosDirectosFormula(aCell),                                 // G: cobros_directos
      gastosPaolaFormula(aCell),                                    // H: gastos_paola
      `=${fCell}+${gCell}-${hCell}`,                                // I: neto_cobrado
      `=IF(${eCell}>0,${fCell}+${gCell}-${hCell}-${eCell},"")`,    // J: diferencia
    ];
  });

  await write(`${tab}!A${DATA_START}:J${DATA_START + MESES.length - 1}`, dataRows);

  // Fila TOTAL
  const totalRow = DATA_START + MESES.length + 1;
  await write(`${tab}!A${totalRow}:J${totalRow}`, [[
    'TOTAL', '',
    `=SUM(C${DATA_START}:C${DATA_START + MESES.length - 1})`,
    `=SUM(D${DATA_START}:D${DATA_START + MESES.length - 1})`,
    `=SUM(E${DATA_START}:E${DATA_START + MESES.length - 1})`,
    `=SUM(F${DATA_START}:F${DATA_START + MESES.length - 1})`,
    `=SUM(G${DATA_START}:G${DATA_START + MESES.length - 1})`,
    `=SUM(H${DATA_START}:H${DATA_START + MESES.length - 1})`,
    `=SUM(I${DATA_START}:I${DATA_START + MESES.length - 1})`,
    `=IFERROR(SUM(I${DATA_START}:I${DATA_START + MESES.length - 1})-SUM(E${DATA_START}:E${DATA_START + MESES.length - 1}),"")`,
  ]]);

  console.log(`  AnálisisPaola armado con ${MESES.length} meses + fila TOTAL.`);
}

// ── 3. Proteger pestañas de datos ──────────────────────────────────────────

async function protectSheets(sheetsList, comisionesPaolaId) {
  const toProtect = [
    { title: 'Ingresos',       id: sheetsList.find(s => s.title === 'Ingresos')?.id },
    { title: 'Gastos',         id: sheetsList.find(s => s.title === 'Gastos')?.id },
    { title: 'ComisionesPaola',id: comisionesPaolaId },
  ];

  for (const s of toProtect) {
    if (s.id == null) { console.log(`  ⚠ No se encontró la pestaña "${s.title}"`); continue; }
    try {
      await protect(s.id, `Solo escritura del bot — no editar manualmente`);
      console.log(`  ✓ "${s.title}" protegida.`);
    } catch (e) {
      // Ya puede estar protegida
      console.log(`  "${s.title}" ya tenía protección (${e.message.slice(0, 60)})`);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n── 1. Leyendo estructura del spreadsheet...');
  const sheetsList = await getMeta();
  console.log('  Pestañas:', sheetsList.map(s => s.title).join(', '));

  console.log('\n── 2. Configurando ComisionesPaola...');
  const comisionesPaolaId = await setupComisionesPaola(sheetsList);

  console.log('\n── 3. Armando AnálisisPaola con fórmulas...');
  await setupAnalisis('AnálisisPaola');

  console.log('\n── 4. Protegiendo pestañas de datos...');
  await protectSheets(sheetsList, comisionesPaolaId);

  console.log('\n✓ Setup completo.');
  console.log('  • ComisionesPaola lista para registrar cobros de julio en adelante');
  console.log('  • AnálisisPaola se actualiza sola cada vez que el bot registra datos');
  console.log('  • Ingresos, Gastos y ComisionesPaola protegidas contra edición manual');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
