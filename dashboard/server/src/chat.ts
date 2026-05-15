import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import { IngresoRow, GastoRow } from "./sheets";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function buildSystemPrompt(ingresos: IngresoRow[], gastos: GastoRow[]): string {
  const totalIngresos = ingresos.reduce((s, r) => s + r.montoARS, 0);
  const totalGastos = gastos.reduce((s, r) => s + r.montoARS, 0);

  const resumen = {
    totalIngresosARS: Math.round(totalIngresos),
    totalGastosARS: Math.round(totalGastos),
    balanceNeto: Math.round(totalIngresos - totalGastos),
    cantidadIngresos: ingresos.length,
    cantidadGastos: gastos.length,
  };

  return `Sos un asistente financiero para un negocio de alquileres temporarios en Argentina. \
Tenés acceso a todos los datos de ingresos y gastos del negocio. \
Respondé siempre en castellano rioplatense, de manera clara y concisa. \
Cuando menciones montos, usá formato argentino (ej: $1.234.567).

RESUMEN ACTUAL:
${JSON.stringify(resumen, null, 2)}

INGRESOS (${ingresos.length} registros):
${JSON.stringify(ingresos, null, 2)}

GASTOS (${gastos.length} registros):
${JSON.stringify(gastos, null, 2)}`;
}

export async function chat(
  messages: ChatMessage[],
  ingresos: IngresoRow[],
  gastos: GastoRow[]
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: buildSystemPrompt(ingresos, gastos),
    messages,
  });
  return (response.content[0] as { text: string }).text;
}
