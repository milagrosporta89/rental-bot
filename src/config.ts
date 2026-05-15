import "dotenv/config";
import { Casa, Titular } from "./types";

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  googleSheetId: process.env.GOOGLE_SHEET_ID!,
  googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL!,
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY!
    .replace(/^["']|["'],?\s*$/g, "")
    .replace(/\\n/g, "\n"),
  storageBaseUrl: process.env.STORAGE_BASE_URL ?? "",
  storageDir: process.env.STORAGE_DIR ?? "./comprobantes",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  whatsappVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!,
  whatsappTeamNumbers: new Set((process.env.WHATSAPP_TEAM_NUMBERS ?? "").split(",").map((n) => n.trim())),
  port: parseInt(process.env.PORT ?? "3000"),
};

export const CASAS: Casa[] = [
  "Casa 1",
  "Casa 2",
  "Casa 3",
  "Casa 4",
  "Casa 5",
];

export const TITULARES: Titular[] = [
  "Francisco",
  "Milagros",
  "Inés",
  "Fernando",
];

// Aliases y variantes por titular (minúsculas, sin tildes).
// Agregar acá cualquier apodo o forma abreviada que pueda aparecer en comprobantes.
export const NOMBRES_TITULARES: Record<Titular, string[]> = {
  Francisco: ["francisco", "fran", "pancho", "franci"],
  Milagros:  ["milagros", "mili", "mitu", "mila"],
  "Inés":    ["ines", "inés", "ine"],
  Fernando:  ["fernando", "fer", "fercho", "nando"],
};

// Resuelve cualquier nombre extraído de un comprobante al nombre canónico del titular.
// Si no matchea ningún alias, devuelve el nombre original con Title Case.
export function resolverNombre(nombre: string): string {
  const norm = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  for (const [titular, aliases] of Object.entries(NOMBRES_TITULARES) as [Titular, string[]][]) {
    if (aliases.some((a) => norm.includes(a))) return titular;
  }
  return nombre.trim().replace(/\s+/g, " ").replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

// Hojas del Google Spreadsheet
export const SHEETS = {
  ingresos: "Ingresos",
  gastos: "Gastos",
  saldosReales: "SaldosReales",
};
