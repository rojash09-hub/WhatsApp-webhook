const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "mi_token_123";

// ADMINISTRADOR
const ADMIN_NUMBER = "51961507276";

// WHATSAPP
const PHONE_NUMBER_ID = "1178025232052723";
const FLOW_ID = "2036829347244331";

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

// NOTIFICAR OPERADORES
async function notificarOperadores(data) {

  const numeros = [
    "51961507276",
    "51986767350"
  ];

  const mensaje =
`🚕 NUEVA RESERVA

👤 ${data.nombre}
📍 Inicio: ${data.inicio}
🏁 Destino: ${data.destino}
📅 Fecha: ${data.fecha}
⏰ Hora: ${data.hora}
✅ Autoriza: ${data.autoriza}`;

  for (const numero of numeros) {

    await fetch(
      `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization":
            `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: numero,
          type: "text",
          text: {
            body: mensaje
          }
        })
      }
    );

  }

  console.log("Operadores notificados");
}

// ENVIAR FLOW
async function enviarFlow(numeroDestino) {

  await fetch(
    `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization":
          `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: numeroDestino,
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
              flow_id: FLOW_ID,
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

  console.log(
    "Flow enviado a: " + numeroDestino
  );
}

// VERIFICAR WEBHOOK
app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

// WEBHOOK PRINCIPAL
app.post("/webhook", async (req, res) => {

  try {

    console.log("Payload recibido:");
    console.log(JSON.stringify(req.body, null, 2));

    const message =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    // MENSAJES DE TEXTO
    if (message?.type === "text") {

      const texto =
        message?.text?.body?.trim().toLowerCase();

      const numeroCliente =
        message.from;

      if (texto.startsWith("ef")) {

        const partes =
          texto.split(" ");

        // ADMINISTRADOR
        if (
          numeroCliente === ADMIN_NUMBER &&
          partes.length === 2
        ) {

          const numeroDestino =
            partes[1];

          await enviarFlow(
            numeroDestino
          );

        } else {

          // CLIENTE NORMAL
          await enviarFlow(
            numeroCliente
          );
        }
      }
    }

    // FLOW COMPLETADO
    const rawData =
      message?.interactive?.nfm_reply
        ?.response_json;

    const flowData =
      rawData
        ? JSON.parse(rawData)
        : null;

    if (flowData) {

      console.log(
        "Datos Flow:"
      );

      console.log(
        flowData
      );

      await guardarReserva(
        flowData
      );

      await notificarOperadores(
        flowData
      );
    }

    res.sendStatus(200);

  } catch (error) {

    console.error(
      "ERROR:"
    );

    console.error(
      error
    );

    res.sendStatus(500);
  }

});

app.listen(PORT, () => {

  console.log(
    "Servidor corriendo en puerto " +
    PORT
  );

});
