import "dotenv/config";
import axios from "axios";
import * as fs from "fs";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormData = require("form-data");

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!;
const BASE = "https://graph.facebook.com/v19.0";
const HEADERS = { Authorization: `Bearer ${ACCESS_TOKEN}` };

const flowIngreso = {
  version: "5.1",
  screens: [
    {
      id: "INGRESO",
      title: "Ingreso en efectivo",
      terminal: true,
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "Dropdown",
            name: "quien_pago",
            label: "¿Quién pagó?",
            required: true,
            "data-source": [
              { id: "Francisco", title: "Francisco" },
              { id: "Fernando", title: "Fernando" },
            ],
          },
          {
            type: "Dropdown",
            name: "casa",
            label: "¿A qué casa corresponde?",
            required: true,
            "data-source": [
              { id: "Casa 1", title: "Casa 1" },
              { id: "Casa 2", title: "Casa 2" },
              { id: "Casa 3", title: "Casa 3" },
              { id: "Casa 4", title: "Casa 4" },
              { id: "Casa 5", title: "Casa 5" },
            ],
          },
          {
            type: "TextInput",
            "input-type": "text",
            name: "fecha",
            label: "Fecha (DD/MM/AAAA)",
            required: true,
          },
          {
            type: "TextInput",
            "input-type": "number",
            name: "monto",
            label: "Monto",
            required: true,
          },
          {
            type: "RadioButtonsGroup",
            name: "moneda",
            label: "Moneda",
            required: true,
            "data-source": [
              { id: "ARS", title: "🇦🇷 Pesos (ARS)" },
              { id: "USD", title: "🇺🇸 Dólares (USD)" },
            ],
          },
          {
            type: "Dropdown",
            name: "tipo",
            label: "Tipo de pago",
            required: true,
            "data-source": [
              { id: "deposito_reserva", title: "Seña 30%" },
              { id: "saldo_checkin", title: "Saldo check-in" },
              { id: "transferencia", title: "Otro" },
            ],
          },
          {
            type: "Footer",
            label: "Registrar ingreso",
            "on-click-action": { name: "complete" },
          },
        ],
      },
    },
  ],
};

const flowGasto = {
  version: "5.1",
  screens: [
    {
      id: "GASTO",
      title: "Gasto en efectivo",
      terminal: true,
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "Dropdown",
            name: "categoria",
            label: "Categoría",
            required: true,
            "data-source": [
              { id: "limpieza", title: "Limpieza" },
              { id: "jardinero", title: "Jardinero" },
              { id: "lavanderia", title: "Lavandería" },
              { id: "expensas", title: "Expensas" },
              { id: "luz", title: "Luz" },
              { id: "gas", title: "Gas" },
              { id: "mantenimiento", title: "Mantenimiento" },
              { id: "otro", title: "Otro" },
            ],
          },
          {
            type: "TextInput",
            "input-type": "text",
            name: "categoria_custom",
            label: "Nombre de categoría (solo si elegiste Otro)",
            required: false,
          },
          {
            type: "Dropdown",
            name: "pagado_por",
            label: "¿Quién pagó?",
            required: true,
            "data-source": [
              { id: "Francisco", title: "Francisco" },
              { id: "Fernando", title: "Fernando" },
            ],
          },
          {
            type: "TextInput",
            "input-type": "text",
            name: "fecha",
            label: "Fecha (DD/MM/AAAA)",
            required: true,
          },
          {
            type: "TextInput",
            "input-type": "number",
            name: "monto",
            label: "Monto",
            required: true,
            "helper-text": "Sin puntos ni comas. Ej: 18000",
          },
          {
            type: "RadioButtonsGroup",
            name: "moneda",
            label: "Moneda",
            required: true,
            "data-source": [
              { id: "ARS", title: "🇦🇷 Pesos (ARS)" },
              { id: "USD", title: "🇺🇸 Dólares (USD)" },
            ],
          },
          {
            type: "Footer",
            label: "Registrar gasto",
            "on-click-action": { name: "complete" },
          },
        ],
      },
    },
  ],
};

async function obtenerFlowExistente(nombre: string): Promise<string | null> {
  const res = await axios.get<{ data: { id: string; name: string }[] }>(
    `${BASE}/${WABA_ID}/flows`, { headers: HEADERS }
  );
  return res.data.data.find((f) => f.name === nombre)?.id ?? null;
}

async function crearFlow(nombre: string, json: object): Promise<string> {
  // 1. Crear o reutilizar flow existente
  let flowId = await obtenerFlowExistente(nombre);
  if (flowId) {
    console.log(`Flow "${nombre}" ya existe: ${flowId} — actualizando JSON...`);
  } else {
    const createRes = await axios.post<{ id: string }>(
      `${BASE}/${WABA_ID}/flows`,
      { name: nombre, categories: ["OTHER"] },
      { headers: HEADERS }
    );
    flowId = createRes.data.id;
    console.log(`Flow "${nombre}" creado: ${flowId}`);
  }

  // 2. Subir el JSON
  const form = new FormData();
  form.append("asset_type", "FLOW_JSON");
  form.append("file", Buffer.from(JSON.stringify(json)), { filename: "flow.json", contentType: "application/json" });
  form.append("name", "flow.json");

  await axios.post(`${BASE}/${flowId}/assets`, form, {
    headers: { ...HEADERS, ...form.getHeaders() },
  });
  console.log(`JSON subido para "${nombre}"`);

  // 3. Publicar
  await axios.post(`${BASE}/${flowId}/publish`, {}, { headers: HEADERS });
  console.log(`Flow "${nombre}" publicado ✓`);

  return flowId;
}

async function main() {
  console.log("Creando flows de WhatsApp...\n");
  const ingresoId = await crearFlow("Efectivo Ingreso", flowIngreso);
  const gastoId = await crearFlow("Efectivo Gasto", flowGasto);

  console.log("\n✅ Agregá estas variables al .env:\n");
  console.log(`WHATSAPP_FLOW_INGRESO_ID=${ingresoId}`);
  console.log(`WHATSAPP_FLOW_GASTO_ID=${gastoId}`);
}

main().catch((err) => {
  console.error("Error:", err.response?.data ?? err.message);
  process.exit(1);
});
