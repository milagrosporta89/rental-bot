// Variables de entorno mínimas para que config.ts cargue sin errores en tests.
// Los servicios reales (Sheets, Claude, WhatsApp) se mockean en cada test.
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.GOOGLE_SHEET_ID = 'test-sheet-id';
process.env.GOOGLE_CLIENT_EMAIL = 'test@test.com';
process.env.GOOGLE_PRIVATE_KEY = 'test-private-key';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-verify';
process.env.WHATSAPP_TEAM_NUMBERS = '5491112345678';
process.env.PORT = '3000';
