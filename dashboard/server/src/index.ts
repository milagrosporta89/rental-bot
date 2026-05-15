import express from "express";
import cors from "cors";
import path from "path";
import { config } from "./config";
import { getIngresos, getGastos, getSaldos } from "./sheets";
import { computeMetrics } from "./metrics";
import { chat, ChatMessage } from "./chat";

const app = express();
app.use(express.json());
app.use(cors());

app.get("/api/dashboard", async (_req, res) => {
  try {
    const [ingresos, gastos, saldos] = await Promise.all([
      getIngresos(), getGastos(), getSaldos(),
    ]);
    res.json({ metricas: computeMetrics(ingresos, gastos, saldos), ingresos, gastos, saldos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener datos" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body as { messages: ChatMessage[] };
    const [ingresos, gastos] = await Promise.all([getIngresos(), getGastos()]);
    const reply = await chat(messages, ingresos, gastos);
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en el chat" });
  }
});

// Servir el build de React en producción
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));

app.listen(config.port, () => {
  console.log(`Dashboard server corriendo en http://localhost:${config.port}`);
});
