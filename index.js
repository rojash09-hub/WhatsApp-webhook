const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();

app.use(bodyParser.json({
  limit: "10mb"
}));

const VERIFY_TOKEN =
  process.env.VERIFY_TOKEN;

const PRIVATE_KEY =
  process.env
    .PRIVATE_KEY_ACCOUNT
    ? process.env
        .PRIVATE_KEY_ACCOUNT
        .replace(/\\n/g, "\n")
        .replace(/\r/g, "")
    : null;

console.log(
  "PRIVATE_KEY:",
  PRIVATE_KEY
    ? "OK"
    : "NULL"
);

// HEALTH
app.get("/", (req, res) => {
  return res
    .status(200)
    .json({
      status: "ok"
    });
});

// VERIFY
app.get("/webhook", (req, res) => {

  const mode =
    req.query["hub.mode"];

  const token =
    req.query["hub.verify_token"];

  const challenge =
    req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {

    return res
      .status(200)
      .send(challenge);

  }

  return res.sendStatus(403);

});

// DECRYPT
function decryptFlowData(body) {

  const encryptedAesKey =
    Buffer.from(
      body.encrypted_aes_key,
      "base64"
    );

  const iv =
    Buffer.from(
      body.initial_vector,
      "base64"
    );

  const encryptedData =
    Buffer.from(
      body.encrypted_flow_data,
      "base64"
    );

  const aesKey =
    crypto.privateDecrypt(
      {
        key: PRIVATE_KEY,
        padding:
          crypto.constants
            .RSA_PKCS1_OAEP_PADDING,
        oaepHash:
          "sha256"
      },
      encryptedAesKey
    );

  console.log(
    "AES KEY LENGTH:",
    aesKey.length
  );

  // GCM = últimos 16 bytes = auth tag
  const tag =
    encryptedData.slice(-16);

  const ciphertext =
    encryptedData.slice(
      0,
      -16
    );

  const decipher =
    crypto
      .createDecipheriv(
        "aes-128-gcm",
        aesKey,
        iv
      );

  decipher.setAuthTag(
    tag
  );

  const decrypted =
    Buffer.concat([
      decipher.update(
        ciphertext
      ),
      decipher.final()
    ]);

  return {
    data:
      JSON.parse(
        decrypted.toString(
          "utf8"
        )
      ),
    aesKey,
    iv
  };

}

// ENCRYPT
function encryptResponse(
  response,
  aesKey,
  iv
) {

  const flippedIv =
    Buffer
      .from(iv)
      .reverse();

  const cipher =
    crypto
      .createCipheriv(
        "aes-128-gcm",
        aesKey,
        flippedIv
      );

  const payload =
    Buffer.from(
      JSON.stringify(
        response
      ),
      "utf8"
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        payload
      ),
      cipher.final()
    ]);

  const tag =
    cipher.getAuthTag();

  return Buffer
    .concat([
      encrypted,
      tag
    ])
    .toString(
      "base64"
    );

}

// WEBHOOK
app.post(
  "/webhook",
  async (
    req,
    res
  ) => {

    try {

      console.log(
        "🔐 Flow cifrado recibido"
      );

      const {
        data,
        aesKey,
        iv
      } =
        decryptFlowData(
          req.body
        );

      console.log(
        "✅ DESCIFRADO:",
        data
      );

      const response = {
        version:
          "1.0",
        data: {}
      };

      const encrypted =
        encryptResponse(
          response,
          aesKey,
          iv
        );

      return res
        .status(200)
        .json({
          encrypted_response:
            encrypted
        });

    } catch (
      error
    ) {

      console.error(
        "❌ ERROR GENERAL:",
        error
      );

      return res
        .status(500)
        .send(
          "Internal Server Error"
        );

    }

  }
);

const PORT =
  process.env.PORT ||
  3000;

app.listen(
  PORT,
  () => {

    console.log(
      "🚀 Servidor:",
      PORT
    );

  }
);
