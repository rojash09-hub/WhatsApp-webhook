const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { google } = require("googleapis");
const crypto = require("crypto");

const app = express();
app.use(bodyParser.json());

// 🔐 VARIABLES
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// 🔑 PRIVATE KEY (ARREGLADA)
const PRIVATE_KEY = process.env.PRIVATE_KEY
  ? process.env.PRIVATE_KEY.replace(/\\n/g, "\n").replace(/\r/g, "")
  : null;

// 📊 SHEETS
const SHEETS = {
  EXALMAR: "1LM9JMK8yySI9CVCe785bDdsi-j1fFaJPpvIE19zDkiw"
};

// 🔠 MAYÚSCULAS
const upper = (text) => (text ? text.toString().toUpperCase() : "");

// 🟢 HEALTH CHECK
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// 🟢 WEBHOOK GET
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!mode && !token && !challenge) {
    return res.status(200).json({ status: "ok" });
  }

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// 🔓 DESCIFRAR FLOW
function decryptFlowData(body) {
  const encryptedAesKey = Buffer.from(body.encrypted_aes_key, "base64");
  const iv = Buffer.from(body.initial_vector, "base64");
  const encryptedData = Buffer.from(body.encrypted_flow_data, "base64");

  const aesKey = crypto.privateDecrypt(
    {
      key: PRIVATE_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    encryptedAesKey
  );

  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);

  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return {
    data: JSON.parse(decrypted.toString()),
    aesKey,
    iv
  };
}

// 🔐 CIFRAR RESPUESTA
function encryptResponse(data, aesKey, iv) {
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);

  let encrypted = cipher.update(JSON.stringify(data));
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return encrypted.toString("base64");
}

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
  } catch (error) {
    console.error("❌ Error Flow:", error.response?.data || error);
  }
}

// 🚀 WEBHOOK PRINCIPAL
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    // 🔐 FLOW CIFRADO
    if (body.encrypted_flow_data) {
      console.log("🔐 Flow cifrado recibido");

      const { data, aesKey, iv } = decryptFlowData(body);

      console.log("✅ DESCIFRADO:", data);

      const response = {
        version: "1.0",
        data: {}
      };

      const encryptedResponse = encryptResponse(response, aesKey, iv);

      return res.status(200).json({
        encrypted_response: encryptedResponse
      });
    }

    const entry = body?.entry?.[0]?.changes?.[0]?.value;
    if (!entry) return res.sendStatus(200);

    const numero = entry?.messages?.[0]?.from;
    const mensajeTexto = entry?.messages?.[0]?.text?.body;

    if (mensajeTexto) {
      const texto = mensajeTexto.trim().toLowerCase();

      if (["xf", "taxi", "reserva"].includes(texto)) {
        await enviarFlow(numero);
        return res.sendStatus(200);
      }
    }

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
