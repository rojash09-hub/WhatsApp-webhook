const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();
app.use(bodyParser.json());

// 🔐 VARIABLES
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// 🔑 PRIVATE KEY (CORREGIDO)
const PRIVATE_KEY = process.env.PRIVATE_KEY_ACCOUNT
  ? process.env.PRIVATE_KEY_ACCOUNT.replace(/\\n/g, "\n").replace(/\r/g, "")
  : null;

// 🧪 DEBUG
console.log("PRIVATE_KEY:", PRIVATE_KEY ? "OK" : "NULL");

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
  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY es NULL");
  }

  const encryptedAesKey = Buffer.from(body.encrypted_aes_key, "base64");
  const iv = Buffer.from(body.initial_vector, "base64");
  const encryptedData = Buffer.from(body.encrypted_flow_data, "base64");

  const aesKey = crypto.privateDecrypt(
    {
      key: PRIVATE_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
      format: "pem",
      type: "pkcs1"
    },
    encryptedAesKey
  );

  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]);

  return {
    data: JSON.parse(decrypted.toString("utf8")),
    aesKey,
    iv
  };
}

// 🔐 CIFRAR RESPUESTA
function encryptResponse(data, aesKey, iv) {
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);

  const payload = Buffer.from(JSON.stringify(data), "utf8");

  const encrypted = Buffer.concat([
    cipher.update(payload),
    cipher.final()
  ]);

  return encrypted.toString("base64");
}

// 🚀 WEBHOOK PRINCIPAL
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

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

    return res.sendStatus(200);

  } catch (error) {
    console.error("❌ ERROR GENERAL:", error);
    return res.sendStatus(500);
  }
});

// 🚀 SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Servidor corriendo en puerto", PORT);
});
