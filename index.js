const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const axios = require("axios");
const { google } = require("googleapis");

const app = express();

app.use(
  bodyParser.json({
    limit: "10mb"
  })
);

// 🔐 VARIABLES
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const PRIVATE_KEY = process.env.PRIVATE_KEY_ACCOUNT
  ? process.env.PRIVATE_KEY_ACCOUNT
      .replace(/\\n/g, "\n")
      .replace(/\r/g, "")
  : null;

// 🇵🇪 FECHA Y HORA PERÚ
function fechaPeru() {

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone: "America/Lima"
      }
    )
  );

}

function obtenerFechaPeru() {

  return fechaPeru()
    .toLocaleDateString("es-PE");

}

function obtenerHoraPeru() {

  return fechaPeru()
    .toLocaleTimeString(
      "es-PE",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    );

}

// 🔠 MAYÚSCULAS
const upper = (text) =>
  text
    ? text.toString().toUpperCase()
    : "";

// ✅ CONFIG FLOWS
const CONFIG = {

  EXALMAR: {

    title:
      "EXALMAR FLOTA",

    flowId:
      "1487962506700406",

    command:
      "xf",

    template:
      "exal_flota",

    sheetId:
      "1LM9JMK8yySI9CVCe785bDdsi-j1fFaJPpvIE19zDkiw"

  },

  CENTINELA: {

    title:
      "CENTINELA FLOTA",

    flowId:
      "1562186275266854",

    command:
      "cf",

    template:
      "centinela_flota",

    sheetId:
      "1z7C4HyHc3VIMxnGHWLbDTynXslutqP5gT-j_zMW1dIU"

  },

  PLANTA_CALLAO: {

    title:
      "PLANTA CALLAO",

    flowId:
      "3257150361132563",

    command:
      "pc",

    template:
      "planta_callao",

    sheetId:
      "189ivlWlIESMcZ05_D12-5bpBIPPvLwStaRxSUfxZ2aI"

  },

  GLOBAL: {

    title:
      "GLOBAL",

    flowId:
      "2051713752436319",

    command:
      "global",

    template:
      "global",

    sheetId:
      "1reGQpDdBpgtE0Wd4s2xM17x2dzzEIpV-DL2qEsvJgVc"

  }

};

// ❤️ HEALTH
app.get("/", (req, res) => {

  return res
    .status(200)
    .json({
      status: "ok"
    });

});

// ✅ VERIFY WEBHOOK
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

// 🔓 DESCIFRAR FLOW
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

  const authTag =
    encryptedData.slice(-16);

  const cipherText =
    encryptedData.slice(
      0,
      -16
    );

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
        decrypted.toString("utf8")
      ),

    aesKey,
    iv

  };

}

// 🔁 INVERTIR IV
function flipIv(iv) {

  const flipped =
    Buffer.alloc(iv.length);

  for (
    let i = 0;
    i < iv.length;
    i++
  ) {

    flipped[i] =
      iv[i] ^ 0xff;

  }

  return flipped;

}

// 🔐 CIFRAR RESPUESTA
function encryptResponse(
  response,
  aesKey,
  iv
) {

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
      JSON.stringify(response),
      "utf8"
    );

  const encrypted =
    Buffer.concat([
      cipher.update(payload),
      cipher.final()
    ]);

  const authTag =
    cipher.getAuthTag();

  return Buffer
    .concat([
      encrypted,
      authTag
    ])
    .toString("base64");

}

// 📲 MENSAJE TEXTO
async function enviarMensaje(
  numero,
  mensaje
) {

  try {

    await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {

        messaging_product:
          "whatsapp",

        to:
          numero,

        type:
          "text",

        text: {
          body:
            mensaje
        }

      },
      {
        headers: {

          Authorization:
            `Bearer ${WHATSAPP_TOKEN}`,

          "Content-Type":
            "application/json"

        }
      }
    );

  } catch (error) {

    console.error(
      "❌ ERROR MENSAJE:",
      error.response?.data || error
    );

  }

}

// 📲 FLOW
async function enviarFlow(
  numero,
  tipo
) {

  try {

    const cfg =
      CONFIG[tipo];

    if (!cfg) {

      return;

    }

    await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {

        messaging_product:
          "whatsapp",

        to:
          numero,

        type:
          "template",

        template: {

          name:
            cfg.template,

          language: {

            code:
              "es_PE"

          }

        }

      },
      {
        headers: {

          Authorization:
            `Bearer ${WHATSAPP_TOKEN}`,

          "Content-Type":
            "application/json"

        }
      }
    );

    console.log(
      "✅ FLOW ENVIADO:",
      cfg.template
    );

  } catch (error) {

    console.error(
      "❌ ERROR FLOW:",
      error.response?.data || error
    );

  }

}

// 🚀 WEBHOOK
app.post(
  "/webhook",
  async (
    req,
    res
  ) => {

    try {

      // 🔐 FLOW ENCRYPTED
      if (
        req.body.encrypted_aes_key
      ) {

        const {
          data,
          aesKey,
          iv
        } =
          decryptFlowData(
            req.body
          );

        const encryptedResponse =
          encryptResponse(
            {
              screen:
                "SUCCESS",

              data: {}
            },
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

      const entry =
        req.body
          ?.entry?.[0]
          ?.changes?.[0]
          ?.value;

      if (!entry) {

        return res.sendStatus(200);

      }

      const numeroRemitente =
        entry
          ?.messages?.[0]
          ?.from;

      const mensajeTexto =
        entry
          ?.messages?.[0]
          ?.text?.body;

      // 📩 COMANDOS
      if (mensajeTexto) {

        const texto =
          mensajeTexto
            .trim()
            .toLowerCase();

        for (const key in CONFIG) {

          const cfg =
            CONFIG[key];

          if (
            texto ===
            cfg.command
          ) {

            await enviarFlow(
              numeroRemitente,
              key
            );

            return res.sendStatus(200);

          }

        }

      }

      return res.sendStatus(200);

    } catch (error) {

      console.error(
        "❌ ERROR GENERAL:",
        error
      );

      return res.sendStatus(500);

    }

  }
);

// 🚀 SERVER
const PORT =
  process.env.PORT ||
  3000;

app.listen(
  PORT,
  () => {

    console.log(
      "🚀 SERVIDOR CORRIENDO:",
      PORT
    );

  }
);
