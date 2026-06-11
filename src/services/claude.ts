import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { DatosComprobante } from "../types";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

type MediaTypeArchivo = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export async function extraerDatosComprobante(
  fileBase64: string,
  mediaType: MediaTypeArchivo
): Promise<DatosComprobante | null> {
  const prompt = `Sos un asistente que extrae datos de comprobantes de transferencia bancaria argentinos.
Analizá el documento y extraé los siguientes datos en formato JSON exacto, sin texto adicional:
{
  "fecha": "DD/MM/YYYY",
  "monto": número sin puntos ni comas (ej: 85000),
  "moneda": "ARS" o "USD" según el símbolo o indicación en el comprobante. Si no hay indicación, usá "ARS",
  "nombreOrdenante": "nombre de quien hace la transferencia",
  "nombreDestinatario": "nombre de quien recibe la transferencia",
  "bancoOrigen": "banco desde donde se transfiere",
  "bancoDestino": "banco que recibe",
  "cbuDestino": "CBU o CVU destino, si aparece",
  "nroOperacion": "número de operación o transacción, si aparece"
}
Si algún dato no está visible, usá string vacío o 0 para monto.
Respondé SOLO con el JSON, sin markdown, sin explicaciones.`;

  const archivoBlock = mediaType === "application/pdf"
    ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: fileBase64 },
      }
    : {
        type: "image" as const,
        source: { type: "base64" as const, media_type: mediaType, data: fileBase64 },
      };

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [archivoBlock, { type: "text", text: prompt }],
        },
      ],
    });

    const raw = (response.content[0] as { type: string; text: string }).text.trim();
    // Quitar bloques markdown si el modelo los agrega (```json ... ```)
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    console.log("extraerDatosComprobante raw:", raw);
    return JSON.parse(jsonStr) as DatosComprobante;
  } catch (error) {
    console.error("Error extrayendo datos del comprobante:", error);
    return null;
  }
}
