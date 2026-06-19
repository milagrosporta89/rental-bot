import "dotenv/config";
import express from "express";
import { config } from "./config";
import { parseWebhookBody, sendText, sendButtons, sendList, WaMessage } from "./services/whatsapp";
import { WaCtx } from "./types";
import { onPhoto, onCallback as onCallbackIngreso, onText as onTextIngreso } from "./handlers/income";
import { onEfectivoIngreso, onCallback as onCallbackCash, onText as onTextCash, onFlowReply } from "./handlers/cash";
import { onReportarSaldoCommand, onSaldoCommand, onCallback as onCallbackBalance, onText as onTextBalance } from "./handlers/balance";
import { onComisionCommand } from "./handlers/comision";
import { onReservaCommand, onCorregirCommand, onCallback as onCallbackReserva, onText as onTextReserva, onPhoto as onPhotoReserva, onPhotoSinContexto } from "./handlers/reservas";
import { onManualGasto, onCallback as onCallbackGasto, onText as onTextGasto } from "./handlers/gastos";
import { onCorregirGastoCommand, onCallbackCorreccion, onTextCorreccion } from "./handlers/correccion";
import { obtenerDatosReporte } from "./services/sheets";
import { REPORTE_HTML } from "./reporte-template";
import { onCallbackEscape } from "./utils";

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

  const msg = parseWebhookBody(req.body);
  if (!msg) return;

  try {
    await routeMessage(msg);
  } catch (err: any) {
    const detail = err?.response?.data ?? err?.message ?? err;
    console.error("Error procesando mensaje:", JSON.stringify(detail, null, 2));
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
  };
}

async function sendMenu(ctx: WaCtx) {
  await ctx.replyList(
    `Hola ${ctx.from.name.split(" ")[0]} 👋 ¿Qué querés hacer?`,
    [
      { id: "menu_gasto",    title: "💸 Nuevo gasto" },
      { id: "menu_reserva",  title: "📋 Gestionar reservas" },
      { id: "menu_saldos",   title: "📊 Saldos y reportes" },
      { id: "menu_otros",    title: "📎 Otros" },
    ]
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
    if (!await onPhotoReserva(ctx, msg.imageId, "image/jpeg")) {
      if (!await onPhotoSinContexto(ctx, msg.imageId, "image/jpeg")) {
        await onPhoto(ctx, msg.imageId, "image/jpeg");
      }
    }
    return;
  }
  if (msg.type === "document" && msg.documentId && msg.mimeType) {
    if (msg.mimeType === "application/pdf") {
      if (!await onPhotoReserva(ctx, msg.documentId, "application/pdf")) {
        if (!await onPhotoSinContexto(ctx, msg.documentId, "application/pdf")) {
          await onPhoto(ctx, msg.documentId, "application/pdf");
        }
      }
    } else if (msg.mimeType.startsWith("image/")) {
      const mime = msg.mimeType as "image/jpeg" | "image/png" | "image/webp";
      if (!await onPhotoReserva(ctx, msg.documentId, mime)) {
        if (!await onPhotoSinContexto(ctx, msg.documentId, mime)) {
          await onPhoto(ctx, msg.documentId, mime);
        }
      }
    }
    return;
  }

  // ── Flow reply ────────────────────────────────────────────────────────────
  if (msg.type === "flow_reply" && msg.flowData) {
    await onFlowReply(ctx, msg.flowData);
    return;
  }

  // ── Botones / listas ──────────────────────────────────────────────────────
  if (msg.type === "interactive" && msg.buttonReplyId) {
    const id = msg.buttonReplyId;

    // Menú principal
    if (id === "menu_gasto") { await onManualGasto(ctx); return; }
    if (id === "menu_otros") {
      await ctx.replyList("¿Qué querés hacer?", [
        { id: "menu_otros_ingreso",        title: "💰 Registrar ingreso" },
        { id: "menu_otros_corregir",       title: "✏️ Corregir reserva" },
        { id: "menu_otros_corregir_gasto", title: "✏️ Corregir gasto" },
      ]);
      return;
    }
    if (id === "menu_otros_ingreso")        { await onEfectivoIngreso(ctx); return; }
    if (id === "menu_otros_corregir")       { await onCorregirCommand(ctx); return; }
    if (id === "menu_otros_corregir_gasto") { await onCorregirGastoCommand(ctx); return; }
    if (id === "menu_saldos") {
      await ctx.replyList("¿Qué querés ver?", [
        { id: "menu_ver_saldos",     title: "📊 Ver saldos" },
        { id: "menu_reportar_saldo", title: "✏️ Actualizar saldo" },
        { id: "menu_comision",       title: "💼 Comisión Paola" },
      ]);
      return;
    }
    if (id === "menu_comision") { await onComisionCommand(ctx); return; }
    if (id === "menu_ver_saldos") { await onSaldoCommand(ctx); return; }
    if (id === "menu_reportar_saldo") { await onReportarSaldoCommand(ctx); return; }
    if (id === "menu_reserva") { await onReservaCommand(ctx); return; }

    if (await onCallbackEscape(ctx, id)) return;
    if (await onCallbackIngreso(ctx, id)) return;
    if (await onCallbackCash(ctx, id)) return;
    if (await onCallbackBalance(ctx, id)) return;
    if (await onCallbackGasto(ctx, id)) return;
    if (await onCallbackCorreccion(ctx, id)) return;
    if (await onCallbackReserva(ctx, id)) return;
    return;
  }

  // ── Texto ─────────────────────────────────────────────────────────────────
  if (msg.type === "text") {
    // Comando de texto /reserva
    if (ctx.text?.trim().toLowerCase() === "/reserva") {
      await onReservaCommand(ctx);
      return;
    }

    // Primero intentar flujos activos
    if (await onTextIngreso(ctx)) return;
    if (await onTextCash(ctx)) return;
    if (await onTextBalance(ctx)) return;
    if (await onTextGasto(ctx)) return;
    if (await onTextCorreccion(ctx)) return;
    if (await onTextReserva(ctx)) return;

    // Cualquier texto sin flujo activo → menú
    await sendMenu(ctx);
  }
}

// ── Reporte en vivo ──────────────────────────────────────────────────────────
app.get("/reporte", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(REPORTE_HTML);
});

app.get("/api/reporte", async (_req, res) => {
  try {
    const datos = await obtenerDatosReporte();
    res.json(datos);
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message ?? err?.message ?? "Error interno";
    res.status(500).json({ error: msg });
  }
});

app.listen(config.port ?? 3000, () => console.log("Bot WhatsApp iniciado ✓"));
