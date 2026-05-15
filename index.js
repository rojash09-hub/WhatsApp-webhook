const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const axios = require("axios");

const app = express();

app.use(
  bodyParser.json({
    limit: "10mb"
  })
);

// 🔐 VARIABLES DE ENTORNO
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY_ACCOUNT
  ? process.env.PRIVATE_KEY_ACCOUNT.replace(/\\n/g, "\n").replace(/\r/g, "")
  : null;

// ✅ CONFIGURACIÓN DE COMANDOS Y PLANTILLAS
const CONFIG = {
  EXALMAR: { command: "xf", template: "exal_flota" },
  CENTINELA: { command: "cf", template: "centinela_flota" },
  PLANTA_CALLAO: { command: "pc", template: "planta_callao" },
  GLOBAL: { command: "global", template: "global" }
};

// 🔓 DESCIFRAR DATA DEL FLOW
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

  const authTag = encryptedData.slice(-16);
  const cipherText = encryptedData.slice(0, -16);
  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(cipherText),
    decipher.final()
  ]);

  return {
    data: JSON.parse(decrypted.toString("utf8")),
    aesKey,
    iv
  };
}

// 🔐 CIFRAR RESPUESTA PARA EL FLOW
function encryptResponse(response, aesKey, iv) {
  const flippedIv = Buffer.alloc(iv.length);
  for (let i = 0; i < iv.length; i++) {
    flippedIv[i] = iv[i] ^ 0xff;
  }

  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, flippedIv);
  const payload = Buffer.from(JSON.stringify(response), "utf8");
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([encrypted, authTag]).toString("base64");
}

// 📲 ENVIAR FLOW (CORREGIDO: Sin flow_id redundante)
async function enviarFlow(numero, tipo) {
  try {
    const cfg = CONFIG[tipo];
    if (!cfg) return;

    await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: cfg.template,
          language: { code: "es_PE" },
          components: [
            {
              type: "button",
              sub_type: "flow",
              index: "0",
              parameters: [
                {
                  type: "action",
                  action: {
                    flow_token: `token_${Date.now()}`
                    // Nota: flow_id NO se envía aquí si la plantilla ya está vinculada en Meta
                  }
                }
              ]
            }
          ]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ FLOW ENVIADO:", cfg.template);
  } catch (error) {
    console.error(
      "❌ ERROR AL ENVIAR FLOW:",
      JSON.stringify(error.response?.data, null, 2)
    );
  }
}

// 🚀 WEBHOOK PRINCIPAL
app.post("/webhook", async (req, res) => {
  try {
    // 1. Manejar interacción con el Flow (Cifrado)
    if (req.body.encrypted_aes_key) {
      const { data, aesKey, iv } = decryptFlowData(req.body);
      console.log("📝 DATOS DEL FLOW:", data);

      // Responder al PING (Requerido por Meta)
      if (data.action === "ping") {
        const resPing = encryptResponse({ version: "3.0", data: { status: "active" } }, aesKey, iv);
        return res.status(200).set("Content-Type", "text/plain").send(resPing);
      }

      // Respuesta final al completar el formulario
      const resFinal = encryptResponse(
        { screen: "SUCCESS", data: { extension_message_response: { body: "Recibido correctamente" } } },
        aesKey,
        iv
      );
      return res.status(200).set("Content-Type", "text/plain").send(resFinal);
    }

    // 2. Manejar Comandos de Texto (xf, cf, pc, global)
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];

    if (msg?.text?.body) {
      const texto = msg.text.body.trim().toLowerCase();

      for (const key in CONFIG) {
        if (texto === CONFIG[key].command) {
          await enviarFlow(msg.from, key);
          return res.sendStatus(200);
        }
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ ERROR GENERAL:", error);
    res.sendStatus(500);
  }
});

// VERIFICACIÓN DEL WEBHOOK (GET)
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// 🚀 INICIO
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 SERVIDOR CORRIENDO EN PUERTO:", PORT);
});
