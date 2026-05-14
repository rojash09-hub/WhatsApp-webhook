const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();
app.use(bodyParser.json());

// 🔐 VARIABLES
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// 🔑 PRIVATE KEY (IMPORTANTE)
const PRIVATE_KEY = process.env.PRIVATE_KEY_FLOW
  ? process.env.PRIVATE_KEY_FLOW.replace(/\\n/g, "\n").replace(/\r/g, "")
  : null;

// 🟢 HEALTH CHECK
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// 🟢 VERIFICACIÓN WEBHOOK
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
      oaepHash: "sha256",
      format: "pem",
      type: "pkcs1" // 🔥 CLAVE PARA TU FORMATO
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

// 🔐 CIFRAR RESPUESTA (FIX REAL)
function encryptResponse(data, aesKey, iv) {
  try {
    const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);

    const json = JSON.stringify(data);

    let encrypted = cipher.update(json, "utf8");
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return encrypted.toString("base64");

  } catch (err) {
    console.error("❌ ERROR CIFRANDO:", err);
    return null;
  }
}

// 🚀 WEBHOOK PRINCIPAL
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    // 🔐 FLOW CIFRADO
    if (body.encrypted_flow_data) {
      console.log("🔐 Flow cifrado recibido");

      try {
        const { data, aesKey, iv } = decryptFlowData(body);

        console.log("✅ DESCIFRADO:", data);

        const response = {
          version: "1.0",
          data: {}
        };

        const encryptedResponse = encryptResponse(response, aesKey, iv);

        if (!encryptedResponse) {
          console.error("❌ FALLÓ CIFRADO");

          return res.status(200).json({
            encrypted_response: "AA==" // fallback válido
          });
        }

        return res.status(200).json({
          encrypted_response: encryptedResponse
        });

      } catch (err) {
        console.error("❌ ERROR DESCIFRANDO:", err);

        return res.status(200).json({
          encrypted_response: "AA=="
        });
      }
    }

    return res.sendStatus(200);

  } catch (error) {
    console.error("❌ ERROR GENERAL:", error);
    res.sendStatus(500);
  }
});

// 🚀 SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Servidor corriendo en puerto", PORT);
});
