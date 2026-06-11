import axios from "axios";
import { config } from "../config";

const BASE_URL = `https://graph.facebook.com/v19.0/${config.whatsappPhoneNumberId}`;
const HEADERS = { Authorization: `Bearer ${config.whatsappAccessToken}`, "Content-Type": "application/json" };

export interface WaButton { id: string; title: string }

async function post(body: object) {
  await axios.post(`${BASE_URL}/messages`, body, { headers: HEADERS });
}

export async function sendText(to: string, text: string) {
  await post({ messaging_product: "whatsapp", to, type: "text", text: { body: text } });
}

export async function sendButtons(to: string, text: string, buttons: WaButton[]) {
  // WhatsApp soporta máximo 3 botones
  await post({
    messaging_product: "whatsapp", to, type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

export async function sendList(to: string, text: string, buttonLabel: string, items: WaButton[]) {
  const chunk = (arr: WaButton[], size: number) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };
  const sections = chunk(items.slice(0, 20), 10).map((group, i) => ({
    title: i === 0 ? "Opciones" : "Más opciones",
    rows: group.map((b) => ({ id: b.id, title: b.title.slice(0, 24) })),
  }));
  await post({
    messaging_product: "whatsapp", to, type: "interactive",
    interactive: {
      type: "list",
      body: { text },
      action: { button: buttonLabel, sections },
    },
  });
}

export async function downloadMedia(mediaId: string): Promise<{ base64: string; mimeType: string }> {
  const urlRes = await axios.get<{ url: string; mime_type: string }>(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: HEADERS });
  const mediaUrl: string = urlRes.data.url;
  const mimeType: string = urlRes.data.mime_type;
  const res = await axios.get<ArrayBuffer>(mediaUrl, { headers: HEADERS, responseType: "arraybuffer" });
  return { base64: Buffer.from(res.data).toString("base64"), mimeType };
}

export async function sendFlow(to: string, flowId: string, screenId: string, headerText: string, bodyText: string, ctaLabel: string) {
  await post({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      header: { type: "text", text: headerText },
      body: { text: bodyText },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: `${to}_${Date.now()}`,
          flow_id: flowId,
          flow_cta: ctaLabel,
          flow_action: "navigate",
          flow_action_payload: { screen: screenId },
          mode: "draft",
        },
      },
    },
  });
}

// Parsear mensaje entrante del webhook
export interface WaMessage {
  from: string;
  fromName: string;
  messageId: string;
  type: "text" | "image" | "document" | "interactive" | "flow_reply" | "unknown";
  text?: string;
  imageId?: string;
  documentId?: string;
  mimeType?: string;
  buttonReplyId?: string;
  buttonReplyTitle?: string;
  flowData?: Record<string, string>;
}

export function parseWebhookBody(body: any): WaMessage | null {
  try {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;

    const from: string = msg.from;
    const fromName: string = value?.contacts?.[0]?.profile?.name ?? from;
    const messageId: string = msg.id;
    const type: string = msg.type;

    if (type === "text") {
      return { from, fromName, messageId, type: "text", text: msg.text?.body };
    }
    if (type === "image") {
      return { from, fromName, messageId, type: "image", imageId: msg.image?.id, mimeType: msg.image?.mime_type };
    }
    if (type === "document") {
      return { from, fromName, messageId, type: "document", documentId: msg.document?.id, mimeType: msg.document?.mime_type };
    }
    if (type === "interactive") {
      const itype = msg.interactive?.type;
      if (itype === "nfm_reply") {
        const flowData = JSON.parse(msg.interactive.nfm_reply?.response_json ?? "{}") as Record<string, string>;
        return { from, fromName, messageId, type: "flow_reply", flowData };
      }
      const reply = itype === "button_reply" ? msg.interactive.button_reply : msg.interactive?.list_reply;
      return { from, fromName, messageId, type: "interactive", buttonReplyId: reply?.id, buttonReplyTitle: reply?.title };
    }
    return { from, fromName, messageId, type: "unknown" };
  } catch {
    return null;
  }
}
