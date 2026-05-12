const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "mi_token_123";

// GOOGLE SHEETS
const SHEET_ID = "16x5ZnL_siorYyMLTKPqOAUGaflUUuGp5wCMjVViTtMs";
const SHEET_NAME = "Data";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

// GUARDAR EN SHEETS
async function guardarReserva(data) {

  const client = await auth.getClient();

  const sheets = google.sheets({
    version: "v4",
    auth: client
  });

  const fechaRegistro = new Date().toLocaleString("es-PE");

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:G`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        fechaRegistro,
        data.nombre || "",
        data.inicio || "",
        data.destino || "",
        data.fecha || "",
        data.hora || "",
        data.autoriza || ""
      ]]
    }
  });

  console.log("Reserva guardada en Google Sheets");
}

// VERIFICACION META
app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

// RECIBIR FLOW
app.post("/webhook", async (req, res) => {

  try {

    console.log("Payload recibido:");
    console.log(JSON.stringify(req.body, null, 2));

    const rawData =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
        ?.interactive?.nfm_reply?.response_json;

    const flowData = rawData
      ? JSON.parse(rawData)
      : null;

    console.log("Datos Flow:");
    console.log(flowData);

    if (flowData) {
      await guardarReserva(flowData);
    } else {
      console.log("No se detectó data del Flow");
    }

    res.sendStatus(200);

  } catch (error) {

    console.error("ERROR:");
    console.error(error);

    res.sendStatus(500);
  }

});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});
