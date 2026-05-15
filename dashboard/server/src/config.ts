import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

export const config = {
  googleSheetId: process.env.GOOGLE_SHEET_ID!,
  googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL!,
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY!
    .replace(/^["']|["'],?\s*$/g, "")
    .replace(/\\n/g, "\n"),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  port: parseInt(process.env.DASHBOARD_PORT ?? "3001"),
};
