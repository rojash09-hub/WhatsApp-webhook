const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { google } = require("googleapis");

const app = express();
app.use(bodyParser.json());

// 🔐 VARIABLES
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// 📊 SHEETS
const SHEETS = {
  EXALMAR: "1LM9JMK8yySI9CVCe785bDdsi-j1fFaJPpvIE19zDkiw"
};

// 🔠 MAYÚSCULAS
const upper = (text) => (text ? text.toString().toUpperCase() : "");

// 🟢 HEALTH CHECK GLOBAL
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// 🟢 WEBHOOK GET (VERIFICACIÓN + HEALTH CHECK)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // 🔥 HEALTH CHECK (Flow necesita esto)
  if (!mode && !token && !challenge) {
    return res.status(200).json({ status: "ok" });
  }

  // 🔐 VERIFICACIÓN META
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    return res.status(200).send(challenge);
  }

  return res.status(403).send("Forbidden");
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
    console.error("❌ Error mensaje:", error.response?.data || error);
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

// 🚀 WEBHOOK PRINCIPAL
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (!entry) return res.sendStatus(200);

    const numero = entry?.messages?.[0]?.from;
    const mensajeTexto = entry?.messages?.[0]?.text?.body;

    // 🔥 COMANDOS
    if (mensajeTexto) {
      const texto = mensajeTexto.trim().toLowerCase();

      if (["xf", "taxi", "reserva"].includes(texto)) {
        await enviarFlow(numero);
        return res.sendStatus(200);
      }
    }

    // 📥 FORMULARIO
    const form = entry?.messages?.[0]?.interactive?.nfm_reply?.response_json;
    if (!form) return res.sendStatus(200);

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

    await guardarEnSheet("EXALMAR", registroBase, extras);

    let mensaje = `🚖 NUEVA RESERVA\n\n`;

    for (const key in registroBase) {
      if (registroBase[key]) {
        mensaje += `${key.toUpperCase()}: ${registroBase[key]}\n`;
      }
    }

    for (const key in extras) {
      mensaje += `${key.toUpperCase()}: ${extras[key]}\n`;
    }

    await enviarMensaje(numero, mensaje);

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ ERROR:", error);
    res.sendStatus(500);
  }
});

// 🚀 SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Servidor corriendo en puerto", PORT);
});
