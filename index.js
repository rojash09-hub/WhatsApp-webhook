const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { google } = require("googleapis");

const app = express();
app.use(bodyParser.json());

// 🔐 VARIABLES (RENDER)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// 📊 SHEETS POR CLIENTE
const SHEETS = {
  EXALMAR: "1LM9JMK8yySI9CVCe785bDdsi-j1fFaJPpvIE19zDkiw",
  CLIENTE_2: "SHEET_ID_2",
  CLIENTE_3: "SHEET_ID_3"
};

// 🔠 MAYÚSCULAS
const upper = (text) => (text ? text.toString().toUpperCase() : "");

// 🟢 HEALTH CHECK (OBLIGATORIO PARA FLOW)
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// 📲 ENVIAR MENSAJE
async function enviarMensaje(numero, mensaje) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "text",
        text: { body: mensaje }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error("Error enviando mensaje:", error.response?.data || error);
  }
}

// 📲 ENVIAR FLOW
async function enviarFlow(numero) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "interactive",
        interactive: {
          type: "flow",
          body: {
            text: "🚖 EXALMAR FLOTA\nSolicita tu taxi aquí:"
          },
          action: {
            name: "flow",
            parameters: {
              flow_id: "1487962506700406",
              flow_cta: "Reservar Taxi"
            }
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Flow enviado a", numero);
  } catch (error) {
    console.error("❌ Error Flow:", error.response?.data || error);
  }
}

// 📊 GUARDAR EN SHEETS
async function guardarEnSheet(cliente, registroBase, extras) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({ version: "v4", auth });

    const sheetId = SHEETS[cliente] || SHEETS["EXALMAR"];

    const values = [
      [
        registroBase.titulo,
        registroBase.fecha,
        registroBase.hora,
        registroBase.autoriza,
        registroBase.nombre,
        registroBase.inicio,
        registroBase.destino,
        JSON.stringify(extras),
        registroBase.fecha_registro
      ]
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Data!A:I",
      valueInputOption: "USER_ENTERED",
      requestBody: { values }
    });

    console.log(`✅ Guardado en ${cliente}`);
  } catch (error) {
    console.error("❌ Error Sheets:", error);
  }
}

// ✅ WEBHOOK VERIFICACIÓN + HEALTH CHECK
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // 🔥 HEALTH CHECK PARA FLOW
  if (!mode) {
    return res.status(200).json({ status: "ok" });
  }

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// 🚀 WEBHOOK PRINCIPAL
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (!entry) return res.sendStatus(200);

    const numeroRemitente = entry?.messages?.[0]?.from;

    // 🔥 TEXTO (COMANDOS)
    const mensajeTexto = entry?.messages?.[0]?.text?.body;

    if (mensajeTexto) {
      const texto = mensajeTexto.trim().toLowerCase();

      if (["xf", "taxi", "reserva"].includes(texto)) {
        await enviarFlow(numeroRemitente);
        return res.sendStatus(200);
      }

      if (numeroRemitente === "51961507276" && texto.startsWith("xf ")) {
        const partes = texto.split(" ");
        let numeroDestino = partes[1];

        if (!numeroDestino) return res.sendStatus(200);

        if (!numeroDestino.startsWith("51")) {
          numeroDestino = "51" + numeroDestino;
        }

        await enviarFlow(numeroDestino);
        await enviarMensaje(
          numeroRemitente,
          `✅ Formulario enviado a ${numeroDestino}`
        );

        return res.sendStatus(200);
      }
    }

    // 📥 FORMULARIO
    const form = entry?.messages?.[0]?.interactive?.nfm_reply?.response_json;
    if (!form) return res.sendStatus(200);

    const cliente = form.cliente || "EXALMAR";

    const registroBase = {
      titulo: "EXALMAR FLOTA",
      nombre: "",
      inicio: "",
      destino: "",
      fecha: "",
      hora: "",
      autoriza: "",
      fecha_registro: new Date().toLocaleString("es-PE")
    };

    const extras = {};

    for (const key in form) {
      let value = form[key];

      if (value === "OTROS" && form[`${key}_otro`]) {
        value = form[`${key}_otro`];
      }

      value = upper(value);

      if (key in registroBase) {
        registroBase[key] = value;
      } else {
        extras[key] = value;
      }
    }

    await guardarEnSheet(cliente, registroBase, extras);

    let mensaje = `🚖 EXALMAR FLOTA - NUEVA RESERVA\n\n`;

    if (registroBase.nombre)
      mensaje += `👤 Nombre: ${registroBase.nombre}\n`;
    if (registroBase.inicio)
      mensaje += `📍 Inicio: ${registroBase.inicio}\n`;
    if (registroBase.destino)
      mensaje += `🏁 Destino: ${registroBase.destino}\n`;
    if (registroBase.fecha)
      mensaje += `📅 Fecha: ${registroBase.fecha}\n`;
    if (registroBase.hora)
      mensaje += `⏰ Hora: ${registroBase.hora}\n`;
    if (registroBase.autoriza)
      mensaje += `✅ Autoriza: ${registroBase.autoriza}\n`;

    for (const key in extras) {
      mensaje += `🔹 ${key.toUpperCase()}: ${extras[key]}\n`;
    }

    mensaje += `\n📌 Registro: ${registroBase.fecha_registro}`;

    await enviarMensaje("51961507276", mensaje);
    await enviarMensaje("51986767350", mensaje);

    if (numeroRemitente) {
      await enviarMensaje(numeroRemitente, mensaje);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("ERROR:", error);
    res.sendStatus(500);
  }
});

// 🚀 SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
