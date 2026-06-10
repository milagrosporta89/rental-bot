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

export async function extraerLiquidacionAirbnb(
  imageBase64: string
): Promise<Array<{
  casa: string;
  huesped: string;
  fechaEntrada: string;
  fechaSalida: string;
  montoBruto: number;
  comision: number;
  montoNeto: number;
}>> {
  const prompt = `Sos un asistente que extrae datos de liquidaciones de Airbnb.
Analizá el documento y extraé CADA reserva como un objeto en un array JSON:
[
  {
    "casa": "nombre del listing/propiedad",
    "huesped": "nombre del huésped",
    "fechaEntrada": "DD/MM/YYYY",
    "fechaSalida": "DD/MM/YYYY",
    "montoBruto": número,
    "comision": número (comisión de Airbnb),
    "montoNeto": número (lo que efectivamente se cobra)
  }
]
Respondé SOLO con el array JSON, sin markdown, sin explicaciones.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const texto = (response.content[0] as { type: string; text: string }).text.trim();
    return JSON.parse(texto);
  } catch (error) {
    console.error("Error extrayendo liquidación Airbnb:", error);
    return [];
  }
}
