import "dotenv/config";
import { google } from "googleapis";
import { config, SHEETS } from "../src/config";

const HEADERS: Record<string, string[]> = {
  [SHEETS.ingresos]: [
    "fecha", "casa", "monto", "moneda", "tipo",
    "quienPago", "nombreDestinatario", "bancoOrigen",
    "nroOperacion", "notas", "registradoPor",
  ],
  [SHEETS.gastos]: [
    "fecha", "monto", "moneda", "categoria", "pagadoPor",
    "nombreDestinatario", "bancoOrigen", "nroOperacion",
    "notas", "registradoPor",
  ],
  [SHEETS.saldosReales]: [
    "fecha", "titular", "monto",
  ],
};

async function setupHeaders() {
  const auth = new google.auth.JWT({
    email: config.googleClientEmail,
    key: config.googlePrivateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  for (const [hoja, headers] of Object.entries(HEADERS)) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheetId,
      range: `${hoja}!1:1`,
    });

    const filaActual = res.data.values?.[0] ?? [];

    if (filaActual.length > 0 && filaActual[0] !== "") {
      console.log(`✓ ${hoja}: ya tiene encabezados (${filaActual.join(", ")})`);
      continue;
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.googleSheetId,
      range: `${hoja}!1:1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });

    console.log(`✅ ${hoja}: encabezados escritos (${headers.join(", ")})`);
  }
}

setupHeaders().catch(console.error);
