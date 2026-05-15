const express = require("express");
const crypto = require("crypto");

const app = express();

app.use(
  express.json({
    limit: "10mb"
  })
);

app.disable("x-powered-by");

const VERIFY_TOKEN =
  process.env.VERIFY_TOKEN;

const PRIVATE_KEY =
  process.env.PRIVATE_KEY_ACCOUNT
    ? process.env
        .PRIVATE_KEY_ACCOUNT
        .replace(/\\n/g, "\n")
        .replace(/\r/g, "")
    : null;

console.log(
  "PRIVATE_KEY:",
  PRIVATE_KEY ? "OK" : "NULL"
);

// HEALTH
app.get("/", (req, res) => {

  return res
    .status(200)
    .json({
      status: "ok"
    });

});

// WEBHOOK VERIFY
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
function decryptFlowData(
  body
) {

  if (
    !body.encrypted_aes_key ||
    !body.initial_vector ||
    !body.encrypted_flow_data
  ) {

    throw new Error(
      "Invalid encrypted payload"
    );

  }

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

  // DESCIFRAR AES KEY
  const aesKey =
    crypto.privateDecrypt(
      {
        key:
          PRIVATE_KEY,

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

  // EXTRAER AUTHTAG
  const authTag =
    encryptedData.slice(
      -16
    );

  const cipherText =
    encryptedData.slice(
      0,
      -16
    );

  // DESCIFRAR DATA
  const decipher =
    crypto.createDecipheriv(
      "aes-128-gcm",
      aesKey,
      iv
    );

  decipher.setAuthTag(
    authTag
  );

  const decrypted =
    Buffer.concat([
      decipher.update(
        cipherText
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

// META REQUIERE IV INVERTIDO
function flipIv(iv) {

  const flipped =
    Buffer.alloc(iv.length);

  for (
    let i = 0;
    i < iv.length;
    i++
  ) {

    flipped[i] =
      ~iv[i];

  }

  return flipped;

}

// ENCRYPT RESPONSE
function encryptResponse(
  response,
  aesKey,
  iv
) {

  // IMPORTANTE:
  // Meta requiere IV invertido
  const flippedIv =
    flipIv(iv);

  const cipher =
    crypto.createCipheriv(
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

  const authTag =
    cipher.getAuthTag();

  // CONCATENAR:
  // encrypted + authTag
  const finalBuffer =
    Buffer.concat([
      encrypted,
      authTag
    ]);

  // DEVOLVER SOLO BASE64
  return finalBuffer.toString(
    "base64"
  );

}

// FLOW WEBHOOK
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
        JSON.stringify(
          data,
          null,
          2
        )
      );

      // PING META
      if (
        data.action ===
        "ping"
      ) {

        console.log(
          "🏓 PING RECIBIDO"
        );

        const pingResponse = {

          data: {

            status:
              "active"

          }

        };

        const encryptedResponse =
          encryptResponse(
            pingResponse,
            aesKey,
            iv
          );

        return res
          .status(200)
          .set(
            "Content-Type",
            "text/plain"
          )
          .send(
            encryptedResponse
          );

      }

      // RESPUESTA DEFAULT
      const response = {

        screen:
          "SUCCESS",

        data: {}

      };

      const encryptedResponse =
        encryptResponse(
          response,
          aesKey,
          iv
        );

      return res
        .status(200)
        .set(
          "Content-Type",
          "text/plain"
        )
        .send(
          encryptedResponse
        );

    } catch (
      error
    ) {

      console.error(
        "❌ ERROR:",
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
      "🚀 Servidor iniciado en puerto:",
      PORT
    );

  }
);
