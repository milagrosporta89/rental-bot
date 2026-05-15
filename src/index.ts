import "dotenv/config";
import express from "express";
import { config } from "./config";
import { parseWebhookBody, sendText, sendButtons, sendList, WaMessage } from "./services/whatsapp";
import { WaCtx } from "./types";
import { onPhoto, onCallback as onCallbackIngreso, onText as onTextIngreso } from "./handlers/income";
import { onEfectivoCommand, onCallback as onCallbackCash, onText as onTextCash } from "./handlers/cash";
import { onReportarSaldoCommand, onSaldoCommand, onCallback as onCallbackBalance, onText as onTextBalance } from "./handlers/balance";

const app = express();
app.use(express.json());

// ── Webhook verification ──────────────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === config.whatsappVerifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ── Incoming messages ─────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Responder rápido a Meta
  console.log("POST /webhook:", JSON.stringify(req.body, null, 2));

  const msg = parseWebhookBody(req.body);
  if (!msg) { console.log("No se pudo parsear el mensaje"); return; }
  console.log("Mensaje de:", msg.from, "| tipo:", msg.type, "| texto:", msg.text ?? msg.buttonReplyId ?? "(media)");

  try {
    await routeMessage(msg);
  } catch (err) {
    console.error("Error procesando mensaje:", err);
  }
});

function buildCtx(msg: WaMessage): WaCtx {
  return {
    from: { id: msg.from, name: msg.fromName },
    text: msg.text,
    imageId: msg.imageId,
    documentId: msg.documentId,
    mimeType: msg.mimeType,
    buttonId: msg.buttonReplyId,
    async reply(text) { await sendText(msg.from, text); },
    async replyButtons(text, buttons) {
      if (buttons.length <= 3) {
        await sendButtons(msg.from, text, buttons);
      } else {
        await sendList(msg.from, text, "Ver opciones", buttons);
      }
    },
    async replyList(text, items) {
      await sendList(msg.from, text, "Ver opciones", items);
    },
    async answerCallbackQuery() { /* no-op */ },
  };
}

async function sendWelcome(ctx: WaCtx) {
  await ctx.reply(
    "Bienvenido al bot de alquileres 🏠\n\n" +
    "Comandos disponibles:\n\n" +
    "📸 Foto — Enviá un comprobante\n" +
    "/efectivo — Registrar efectivo\n" +
    "/reportarsaldo — Informar saldo real\n" +
    "/saldo — Ver saldos de todas las cuentas"
  );
}

async function routeMessage(msg: WaMessage) {
  const isTeam = config.whatsappTeamNumbers.has(msg.from);

  if (!isTeam) {
    await sendText(msg.from, "Hola, gracias por contactarnos. Te responderemos a la brevedad 👋");
    return;
  }

  const ctx = buildCtx(msg);

  // ── Imágenes y documentos ─────────────────────────────────────────────────
  if (msg.type === "image" && msg.imageId) {
    await onPhoto(ctx, msg.imageId, "image/jpeg");
    return;
  }
  if (msg.type === "document" && msg.documentId && msg.mimeType) {
    if (msg.mimeType === "application/pdf") {
      await onPhoto(ctx, msg.documentId, "application/pdf");
    } else if (msg.mimeType.startsWith("image/")) {
      await onPhoto(ctx, msg.documentId, msg.mimeType as "image/jpeg" | "image/png" | "image/webp");
    }
    return;
  }

  // ── Botones / listas ──────────────────────────────────────────────────────
  if (msg.type === "interactive" && msg.buttonReplyId) {
    const id = msg.buttonReplyId;
    if (await onCallbackIngreso(ctx, id)) return;
    if (await onCallbackCash(ctx, id)) return;
    if (await onCallbackBalance(ctx, id)) return;
    return;
  }

  // ── Texto ─────────────────────────────────────────────────────────────────
  if (msg.type === "text") {
    const text = (msg.text ?? "").trim();

    // Primero intentar flujos activos
    if (await onTextIngreso(ctx)) return;
    if (await onTextCash(ctx)) return;
    if (await onTextBalance(ctx)) return;

    // Comandos
    if (text === "/start" || text.toLowerCase() === "hola") { await sendWelcome(ctx); return; }
    if (text === "/efectivo") { await onEfectivoCommand(ctx); return; }
    if (text === "/reportarsaldo") { await onReportarSaldoCommand(ctx); return; }
    if (text === "/saldo") { await onSaldoCommand(ctx); return; }

    await ctx.reply("No entendí. Enviá una foto de un comprobante o usá /efectivo, /reportarsaldo, /saldo.");
  }
}

app.listen(config.port ?? 3000, () => console.log("Bot WhatsApp iniciado ✓"));
