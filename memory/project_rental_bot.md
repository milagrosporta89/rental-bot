---
name: Rental Bot Project
description: Bot Telegram para gestión de alquileres en Argentina - estado del proyecto y decisiones técnicas
type: project
---

Bot de Telegram para gestión de alquileres temporarios en Argentina.

**Stack:** grammY + Claude API (sonnet-4-6) + Google Sheets + Google Drive

**Repo:** https://github.com/milagrosporta89/rental-bot

**Deploy:** Google Cloud e2-micro (us-central1, Always Free) con PM2 + GitHub Actions CI/CD

**Titulares:** Francisco, Milagros, Inés, Fernando

**Casas:** Casa 1 (Francisco), Casa 2 (Francisco), Casa 3 (Milagros), Casa 4 (Milagros), Casa 5 (Inés)

**Google Sheets:** 3 hojas — Ingresos (11 cols), Gastos (10 cols), SaldosReales (3 cols)

**Roadmap pendiente:**
- Almacenamiento de comprobantes en Google Drive (en curso)
- Migrar a cuenta Google dedicada (no personal) para Drive/Sheets
- Migrar bot de Telegram a WhatsApp (segunda instancia)

**Why:** Para cuando se migre la cuenta Google, solo cambiar variables de entorno (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID). Para WhatsApp, la lógica de handlers se reutiliza, solo cambia la capa de mensajería.
