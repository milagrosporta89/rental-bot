import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!;

// Verificación del webhook por Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado ✓");
    res.status(200).send(challenge);
  } else {
    console.error("Verificación fallida — token incorrecto");
    res.sendStatus(403);
  }
});

// Mensajes entrantes (por ahora solo loguea)
app.post("/webhook", (req, res) => {
  console.log("Mensaje entrante:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Webhook escuchando en puerto ${PORT}`));
