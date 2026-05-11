const ExcelJS = require("exceljs");
const path = require("path");

const workbook = new ExcelJS.Workbook();
workbook.creator = "Rental Bot QA";

// ─── COLORES ───────────────────────────────────────────────────────────────
const COLOR = {
  headerBg:     "FF1E3A5F",
  headerFg:     "FFFFFFFF",
  sectionBg:    "FFD6E4F0",
  passBg:       "FFD9EAD3",
  failBg:       "FFFCE8E6",
  pendingBg:    "FFFFF3CD",
  bugAlta:      "FFEA4335",
  bugMedia:     "FFFBBC04",
  bugBaja:      "FF34A853",
  altRow:       "FFF8F9FA",
  border:       "FFB0C4D8",
};

// ─── HELPERS ───────────────────────────────────────────────────────────────
function styleHeader(row) {
  row.eachCell((cell) => {
    cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
    cell.font   = { bold: true, color: { argb: COLOR.headerFg }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = borderAll();
  });
  row.height = 30;
}

function borderAll() {
  const side = { style: "thin", color: { argb: COLOR.border } };
  return { top: side, left: side, bottom: side, right: side };
}

function addSectionTitle(sheet, text, cols) {
  const row = sheet.addRow([text]);
  sheet.mergeCells(row.number, 1, row.number, cols);
  row.getCell(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.sectionBg } };
  row.getCell(1).font  = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
  row.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  row.getCell(1).border = borderAll();
  row.height = 22;
}

function styleDataRow(row, index) {
  const bg = index % 2 === 0 ? "FFFFFFFF" : COLOR.altRow;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border    = borderAll();
    cell.font      = { size: 10 };
  });
  row.height = 36;
}

function statusCell(cell, status) {
  const map = {
    "⏳ Pendiente": COLOR.pendingBg,
    "✅ OK":        COLOR.passBg,
    "❌ Falla":     COLOR.failBg,
  };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: map[status] ?? "FFFFFFFF" } };
  cell.font = { bold: true, size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

// ─── HOJA PRINCIPAL: CASOS ─────────────────────────────────────────────────
function buildSheetCasos(wb) {
  const sheet = wb.addWorksheet("Casos de prueba", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 2 }],
  });

  sheet.columns = [
    { key: "id",        width: 8  },
    { key: "modulo",    width: 18 },
    { key: "escenario", width: 40 },
    { key: "pasos",     width: 48 },
    { key: "esperado",  width: 42 },
    { key: "prioridad", width: 12 },
    { key: "estado",    width: 14 },
    { key: "notas",     width: 32 },
  ];

  // Título principal
  sheet.mergeCells("A1:H1");
  const titulo = sheet.getCell("A1");
  titulo.value = "RENTAL BOT — Plan de Pruebas QA";
  titulo.font  = { bold: true, size: 14, color: { argb: COLOR.headerFg } };
  titulo.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
  titulo.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 36;

  // Encabezados
  const hdr = sheet.addRow(["ID", "Módulo", "Escenario", "Pasos", "Resultado esperado", "Prioridad", "Estado", "Notas"]);
  styleHeader(hdr);

  // ── Datos ────────────────────────────────────────────────────────────────

  const COLS = 8;
  let rowIdx = 0;

  function addSection(label) {
    sheet.addRow([]); rowIdx++;
    addSectionTitle(sheet, label, COLS);
    rowIdx++;
  }

  function addCase(id, modulo, escenario, pasos, esperado, prioridad) {
    const r = sheet.addRow([id, modulo, escenario, pasos, esperado, prioridad, "⏳ Pendiente", ""]);
    styleDataRow(r, rowIdx);
    statusCell(r.getCell(7), "⏳ Pendiente");
    r.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
    rowIdx++;
  }

  // 1. /start
  addSection("1. Comando /start");
  addCase("1.1", "/start", "Bienvenida al bot", "/start", "Muestra lista de todos los comandos disponibles", "🔵 Baja");

  // 2. Foto/PDF
  addSection("2. Foto / PDF — Extracción de comprobante");
  addCase("2.1", "income", "Foto legible de transferencia", "Enviar foto clara de comprobante bancario", "Bot extrae datos y muestra resumen con botones Confirmar / Corregir", "🔴 Alta");
  addCase("2.2", "income", "Foto ilegible o irrelevante", "Enviar foto borrosa o sin datos", "'No pude leer el comprobante. ¿Podés reenviar una versión más nítida?'", "🔴 Alta");
  addCase("2.3", "income", "PDF válido de comprobante", "Adjuntar archivo .pdf de transferencia", "Extracción correcta, mismo flujo que foto", "🔴 Alta");
  addCase("2.4", "income", "Documento no-PDF (ej. .xlsx)", "Adjuntar archivo de tipo no PDF", "Silenciosamente ignorado, sin respuesta", "🟡 Media");
  addCase("2.5", "income", "Comprobante con nroOperacion duplicado", "Foto cuyo nro de operación ya existe en Sheets", "⚠️ Mensaje de duplicado con fecha, casa, monto y quién pagó", "🔴 Alta");
  addCase("2.6", "income", "Comprobante sin nroOperacion", "Foto donde Claude no detecta número de operación", "No verifica duplicado; continúa flujo normalmente", "🟡 Media");

  addSection("2B. Detección automática ingreso vs gasto");
  addCase("2.7", "income", "Destinatario es titular conocido", "Comprobante donde destinatario = 'Francisco'", "Etiqueta '🔍 Detecté: ingreso para Francisco'", "🔴 Alta");
  addCase("2.8", "income", "Ordenante es titular conocido", "Comprobante donde ordenante = 'Milagros'", "Etiqueta '🔍 Detecté: gasto de Milagros'", "🔴 Alta");
  addCase("2.9", "income", "Ningún nombre matchea", "Comprobante con nombres desconocidos", "Sin etiqueta; al confirmar aparece '¿Ingreso o Gasto?'", "🔴 Alta");
  addCase("2.10", "income", "Nombre con tildes (Inés)", "Destinatario = 'Inés García'", "Normalización funciona, detecta correctamente", "🟡 Media");
  addCase("2.11", "income", "Nombre en mayúsculas", "Ordenante = 'FRANCISCO PEREZ'", "Normalización a minúsculas funciona", "🟡 Media");
  addCase("2.12", "income", "Nombre dentro de nombre largo", "Destinatario = 'Milagros Porta Srl'", "Detecta porque usa .includes()", "🟢 Baja");

  addSection("2C. Flujo ingreso vía foto");
  addCase("2.13", "income", "Happy path completo ARS", "Confirmar → Casa 1 → 50% reserva → ARS", "✅ 'Registrado 50% reserva · Casa 1 · $X'", "🔴 Alta");
  addCase("2.14", "income", "Tipo Saldo check-in en USD", "Confirmar → Casa 3 → Saldo check-in → USD", "Registrado con tipo saldo_checkin y U$D", "🔴 Alta");
  addCase("2.15", "income", "Tipo 'Otro'", "Confirmar → Casa 2 → Otro → ARS", "Registrado con tipo 'transferencia'", "🟡 Media");
  addCase("2.16", "income", "Todas las casas (1 a 5)", "Probar seleccionar cada una de las 5 casas", "Cada casa se registra correctamente", "🔴 Alta");
  addCase("2.17", "income", "El usuario indica manualmente 'es Ingreso'", "Confirmar → ambiguo → '💰 Ingreso'", "Continúa a selección de casa", "🟡 Media");

  addSection("2D. Flujo gasto vía foto");
  addCase("2.18", "income", "Gasto auto-detectado por ordenante", "Confirmar comprobante donde ordenante = titular", "Pide categoría directamente, sin preguntar quién pagó", "🔴 Alta");
  addCase("2.19", "income", "Gasto sin titular detectado", "Confirmar → '💸 Gasto' → Categoría → Quién pagó", "Registra con todos los datos correctos", "🔴 Alta");
  addCase("2.20", "income", "Todas las categorías de gasto", "Probar: limpieza, jardinero, lavanderia, expensas, luz, gas, mantenimiento, otro", "Cada una se registra con el valor correcto", "🔴 Alta");
  addCase("2.21", "income", "Todos los titulares como quién pagó", "Francisco, Milagros, Inés, Fernando", "Cada uno se asigna correctamente a pagadoPor", "🔴 Alta");

  addSection("2E. Corrección de datos del comprobante");
  addCase("2.22", "income", "Corregir fecha", "Corregir → /fecha 15/04/2026", "Dato actualizado en el resumen", "🟡 Media");
  addCase("2.23", "income", "Corregir monto", "Corregir → /monto 95000", "Monto actualizado y formateado", "🟡 Media");
  addCase("2.24", "income", "Corregir ordenante", "Corregir → /ordenante Juan Perez", "Campo actualizado", "🟡 Media");
  addCase("2.25", "income", "Corregir destinatario y re-detectar", "Corregir → /destinatario Milagros → /confirmar", "Al re-confirmar cambia la detección a ingreso", "🔴 Alta");
  addCase("2.26", "income", "Comando /banco (BUG conocido)", "Corregir → /banco Banco Galicia", "⚠️ BUG: comando no registrado, no tiene efecto", "🟡 Media");
  addCase("2.27", "income", "Múltiples correcciones → /confirmar", "Corregir varios campos → /confirmar", "Resumen actualizado con todos los cambios", "🟡 Media");
  addCase("2.28", "income", "/confirmar sin flujo activo", "/confirmar sin haber enviado foto antes", "Sin efecto (no responde)", "🟢 Baja");

  // 3. /ingreso efectivo
  addSection("3. /ingreso — Efectivo (cash.ts)");
  addCase("3.1", "cash", "Happy path ARS", "/ingreso → Efectivo → Casa 1 → 'Juan' → Hoy → ARS → 50000", "✅ 'Ingreso registrado · Efectivo · Casa 1 · $50.000'", "🔴 Alta");
  addCase("3.2", "cash", "Happy path USD", "/ingreso → Efectivo → Casa 3 → 'María' → Hoy → USD → 500", "✅ Registrado con U$D 500", "🔴 Alta");
  addCase("3.3", "cash", "Fecha manual válida", "Escribir '15/04/2026' en paso de fecha", "Aceptada, continúa a moneda", "🔴 Alta");
  addCase("3.4", "cash", "Fecha manual inválida", "Escribir 'hoy' o '15-04-2026'", "'Formato inválido. Usá DD/MM/YYYY, por ejemplo: 15/04/2026'", "🔴 Alta");
  addCase("3.5", "cash", "Fecha con un dígito (1/4/2026)", "Escribir '1/4/2026'", "Regex \\d{1,2} acepta, debe funcionar", "🟡 Media");
  addCase("3.6", "cash", "Monto con puntos de miles", "Escribir '50.000'", "Se parsea como 50000, registra correctamente", "🔴 Alta");
  addCase("3.7", "cash", "Monto con coma decimal", "Escribir '8.500,50'", "Se parsea como 8500.50", "🟡 Media");
  addCase("3.8", "cash", "Monto inválido (texto)", "Escribir 'cincuenta mil'", "'Por favor ingresá solo el monto numérico. Ejemplo: 8500'", "🔴 Alta");
  addCase("3.9", "cash", "Monto negativo", "Escribir '-5000'", "Rechazado (monto <= 0)", "🟡 Media");
  addCase("3.10", "cash", "Monto cero", "Escribir '0'", "Rechazado (monto <= 0)", "🟡 Media");
  addCase("3.11", "cash", "/ingreso → opción Foto", "/ingreso → '📷 Transferencia'", "Estado limpiado; pide enviar la foto", "🟡 Media");
  addCase("3.12", "cash", "Todas las casas", "Seleccionar cada una de Casa 1 a Casa 5", "Cada casa aparece y se registra", "🔴 Alta");

  // 4. /gasto efectivo
  addSection("4. /gasto — Efectivo (cash.ts)");
  addCase("4.1", "cash", "Happy path", "/gasto → Efectivo → Limpieza → Milagros → Hoy → 8500", "✅ 'Gasto registrado · limpieza · Milagros · $8.500'", "🔴 Alta");
  addCase("4.2", "cash", "Fecha manual válida", "Escribir '20/03/2026'", "Aceptada, continúa a monto", "🔴 Alta");
  addCase("4.3", "cash", "Fecha manual inválida", "Escribir 'ayer'", "'Formato inválido. Usá DD/MM/YYYY'", "🔴 Alta");
  addCase("4.4", "cash", "Todas las categorías de gasto", "Probar las 8 categorías", "Cada una se registra correctamente", "🔴 Alta");
  addCase("4.5", "cash", "Todos los titulares como quién pagó", "Francisco, Milagros, Inés, Fernando", "Cada uno aparece y se asigna", "🔴 Alta");
  addCase("4.6", "cash", "Monto inválido", "Escribir 'mucho'", "'Por favor ingresá solo el monto numérico.'", "🔴 Alta");
  addCase("4.7", "cash", "/gasto → opción Foto", "/gasto → '📷 Transferencia'", "Estado limpiado; pide enviar la foto", "🟡 Media");

  // 5. /reportarsaldo
  addSection("5. /reportarsaldo (balance.ts)");
  addCase("5.1", "balance", "Happy path Francisco", "/reportarsaldo → Francisco → 450000", "✅ 'Saldo registrado · Francisco · $450.000'", "🔴 Alta");
  addCase("5.2", "balance", "Todos los titulares con cuenta", "Probar Francisco, Milagros, Inés", "Cada uno aparece en teclado y se registra", "🔴 Alta");
  addCase("5.3", "balance", "Fernando NO aparece en el teclado", "/reportarsaldo → revisar opciones", "Fernando no está listado (no tiene cuenta bancaria)", "🔴 Alta");
  addCase("5.4", "balance", "Monto con separadores", "Escribir '1.200.000'", "Se parsea como 1200000", "🟡 Media");
  addCase("5.5", "balance", "Monto cero", "Escribir '0'", "Aceptado (condición es monto < 0, no <= 0)", "🟢 Baja");
  addCase("5.6", "balance", "Monto negativo", "Escribir '-1000'", "'Por favor ingresá solo el monto.'", "🟡 Media");
  addCase("5.7", "balance", "Texto en lugar de monto", "Escribir 'mucho saldo'", "'Por favor ingresá solo el monto.'", "🔴 Alta");

  // 6. /saldo
  addSection("6. /saldo (balance.ts)");
  addCase("6.1", "balance", "Con datos completos", "/saldo con titulares que tienen reportes", "Muestra Real + Calc para Francisco, Milagros, Inés y Efectivo Fernando", "🔴 Alta");
  addCase("6.2", "balance", "Titular sin reporte real", "/saldo cuando un titular nunca reportó", "Muestra 'Sin reporte' para ese titular", "🔴 Alta");
  addCase("6.3", "balance", "Reporte reciente (< 5 días)", "/saldo con reporte de ayer", "Muestra '(hace Nd)' sin ⚠️", "🟡 Media");
  addCase("6.4", "balance", "Reporte viejo (>= 5 días)", "/saldo con reporte de hace 6+ días", "Muestra '⚠️ (hace Nd)'", "🟡 Media");
  addCase("6.5", "balance", "Error en Google Sheets", "Sheets devuelve error (ej. credenciales caídas)", "'Error consultando los saldos. Intentá de nuevo.'", "🔴 Alta");
  addCase("6.6", "balance", "Ingresos de Casa 1 y 2 → Francisco", "/saldo con ingresos en Casa 1 y 2", "Saldo calculado de Francisco aumenta", "🔴 Alta");
  addCase("6.7", "balance", "Gasto de Milagros resta de su saldo", "/saldo con gastos donde pagadoPor=Milagros", "Saldo calculado de Milagros disminuye", "🔴 Alta");

  // 7. Colisiones de estado
  addSection("7. Colisiones de estado y concurrencia");
  addCase("7.1", "income/cash", "Foto enviada a mitad del flujo /ingreso", "Iniciar /ingreso → enviar foto antes de terminar", "Foto procesada por income.ts (estados independientes)", "🟡 Media");
  addCase("7.2", "income/cash", "Dos usuarios simultáneos", "Usuario A en /ingreso mientras B hace /gasto", "Sin interferencia (estados separados por userId)", "🔴 Alta");
  addCase("7.3", "cash", "Reiniciar flujo a mitad", "/ingreso → Casa 1 → escribir /ingreso de nuevo", "Nuevo estado sobreescribe el anterior", "🟡 Media");
  addCase("7.4", "cash/balance", "Texto libre sin flujo activo", "Escribir texto sin haber iniciado ningún comando", "Sin efecto (if !estado return)", "🟢 Baja");
  addCase("7.5", "all", "Click en botón viejo sin estado", "Hacer click en botón inline después de expirar el flujo", "Sin efecto (if !estado return)", "🟡 Media");
}

// ─── HOJA BUGS ──────────────────────────────────────────────────────────────
function buildSheetBugs(wb) {
  const sheet = wb.addWorksheet("Bugs identificados", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 2 }],
  });

  sheet.columns = [
    { key: "id",         width: 8  },
    { key: "severidad",  width: 14 },
    { key: "archivo",    width: 22 },
    { key: "linea",      width: 10 },
    { key: "descripcion",width: 55 },
    { key: "impacto",    width: 35 },
    { key: "estado",     width: 14 },
    { key: "notas",      width: 30 },
  ];

  sheet.mergeCells("A1:H1");
  const titulo = sheet.getCell("A1");
  titulo.value = "RENTAL BOT — Bugs Identificados";
  titulo.font  = { bold: true, size: 14, color: { argb: COLOR.headerFg } };
  titulo.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
  titulo.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 36;

  const hdr = sheet.addRow(["ID", "Severidad", "Archivo", "Línea", "Descripción", "Impacto", "Estado", "Notas"]);
  styleHeader(hdr);

  const bugs = [
    ["B1", "🔴 Alta",   "sheets.ts",  "96",  "buscarIngresoDuplicado busca en fila[7] (bancoOrigen) en vez de fila[8] (nroOperacion)", "La detección de duplicados nunca funciona", "⏳ Pendiente", ""],
    ["B2", "🔴 Alta",   "sheets.ts",  "102", "Al mostrar el duplicado usa fila[4] para quienPago pero ese índice corresponde a 'tipo'", "El mensaje de duplicado muestra datos incorrectos", "⏳ Pendiente", ""],
    ["B3", "🟡 Media",  "income.ts",  "319", "El menú de corrección menciona /banco pero ese comando nunca se registra en el bot", "El usuario no puede corregir el banco de origen", "⏳ Pendiente", ""],
    ["B4", "🟢 Baja",   "claude.ts",  "51",  "JSON.parse sin validación de esquema: respuesta inesperada de Claude puede causar valores erróneos", "Datos corruptos podrían llegar a Sheets sin aviso", "⏳ Pendiente", ""],
  ];

  bugs.forEach(([id, sev, archivo, linea, desc, impacto, estado, notas], i) => {
    const r = sheet.addRow([id, sev, archivo, linea, desc, impacto, estado, notas]);
    const bg = i % 2 === 0 ? "FFFFFFFF" : COLOR.altRow;
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border    = borderAll();
      cell.font      = { size: 10 };
    });
    // Color severidad
    const sevCell = r.getCell(2);
    const sevColor = sev.includes("Alta") ? COLOR.bugAlta : sev.includes("Media") ? COLOR.bugMedia : COLOR.bugBaja;
    sevCell.font = { bold: true, color: { argb: sevColor }, size: 10 };
    // Estado
    statusCell(r.getCell(7), "⏳ Pendiente");
    r.height = 42;
  });
}

// ─── HOJA RESUMEN ────────────────────────────────────────────────────────────
function buildSheetResumen(wb) {
  const sheet = wb.addWorksheet("Resumen");

  sheet.columns = [
    { key: "modulo",    width: 28 },
    { key: "total",     width: 12 },
    { key: "ok",        width: 12 },
    { key: "falla",     width: 12 },
    { key: "pendiente", width: 12 },
    { key: "cobertura", width: 16 },
  ];

  sheet.mergeCells("A1:F1");
  const titulo = sheet.getCell("A1");
  titulo.value = "RENTAL BOT — Resumen de Cobertura QA";
  titulo.font  = { bold: true, size: 14, color: { argb: COLOR.headerFg } };
  titulo.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
  titulo.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 36;

  const hdr = sheet.addRow(["Módulo", "Total casos", "✅ OK", "❌ Falla", "⏳ Pendiente", "% Cobertura"]);
  styleHeader(hdr);

  const modulos = [
    ["/start",                    1],
    ["income — Foto/PDF",        17],
    ["cash — /ingreso efectivo", 12],
    ["cash — /gasto efectivo",    7],
    ["balance — /reportarsaldo",  7],
    ["balance — /saldo",          7],
    ["Colisiones de estado",      5],
  ];

  modulos.forEach(([modulo, total], i) => {
    const r = sheet.addRow([modulo, total, 0, 0, total, "=C"+(i+3)+"/B"+(i+3)]);
    const bg = i % 2 === 0 ? "FFFFFFFF" : COLOR.altRow;
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border    = borderAll();
      cell.font      = { size: 10 };
    });
    r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    r.getCell(6).numFmt = "0%";
    r.height = 24;
  });

  // Total
  const lastDataRow = 2 + modulos.length;
  const totalRow = sheet.addRow([
    "TOTAL",
    { formula: `SUM(B3:B${lastDataRow})` },
    { formula: `SUM(C3:C${lastDataRow})` },
    { formula: `SUM(D3:D${lastDataRow})` },
    { formula: `SUM(E3:E${lastDataRow})` },
    { formula: `C${lastDataRow+1}/B${lastDataRow+1}` },
  ]);
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.sectionBg } };
    cell.font   = { bold: true, size: 11 };
    cell.border = borderAll();
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  totalRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  totalRow.getCell(6).numFmt = "0%";
  totalRow.height = 28;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  buildSheetResumen(workbook);
  buildSheetCasos(workbook);
  buildSheetBugs(workbook);

  const outPath = path.join(__dirname, "..", "QA_rental_bot.xlsx");
  await workbook.xlsx.writeFile(outPath);
  console.log("✅ Archivo generado:", outPath);
}

main().catch(console.error);
