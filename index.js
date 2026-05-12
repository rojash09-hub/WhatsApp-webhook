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

// GUARDAR EN GOOGLE SHEETS
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

// VERIFICAR WEBHOOK META
app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

// RECIBIR MENSAJES
app.post("/webhook", async (req, res) => {

  try {

    console.log("Payload recibido:");
    console.log(JSON.stringify(req.body, null, 2));

    const message =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    // SI ES TEXTO, EVALUAR COMANDO
    if (message?.type === "text") {

      const texto =
        message?.text?.body?.trim().toLowerCase();

      const numeroCliente = message.from;

      // COMANDO EF
      if (texto === "ef") {

        await fetch(
          "https://graph.facebook.com/v23.0/1178025232052723/messages",
          {
            method: "POST",
            headers: {
              "Authorization":
                `Bearer ${process.env.WHATSAPP_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: numeroCliente,
              type: "interactive",
              interactive: {
                type: "flow",
                header: {
                  type: "text",
                  text: "Reserva Taxi"
                },
                body: {
                  text: "Complete su reserva"
                },
                action: {
                  name: "flow",
                  parameters: {
                    flow_message_version: "3",
                    flow_token: Date.now().toString(),
                    flow_id: "2036829347244331",
                    flow_cta: "Reservar",
                    flow_action: "navigate",
                    flow_action_payload: {
                      screen: "RESERVA_TAXI"
                    }
                  }
                }
              }
            })
          }
        );

        console.log("Flow EF enviado");
      }
    }

    // SI EL FLOW FUE COMPLETADO
    const rawData =
      message?.interactive?.nfm_reply?.response_json;

    const flowData =
      rawData ? JSON.parse(rawData) : null;

    if (flowData) {

      console.log("Datos Flow:");
      console.log(flowData);

      await guardarReserva(flowData);
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
