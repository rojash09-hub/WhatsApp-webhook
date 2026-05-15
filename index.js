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
const VERIFY_TOKEN =
  process.env.VERIFY_TOKEN;

const WHATSAPP_TOKEN =
  process.env.WHATSAPP_TOKEN;

const PHONE_NUMBER_ID =
  process.env.PHONE_NUMBER_ID;

const PRIVATE_KEY =
  process.env.PRIVATE_KEY_ACCOUNT
    ? process.env
        .PRIVATE_KEY_ACCOUNT
        .replace(/\\n/g, "\n")
        .replace(/\r/g, "")
    : null;

// 🇵🇪 FECHA PERÚ
function fechaPeru() {

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone:
          "America/Lima"
      }
    )
  );

}

// 🔠 MAYÚSCULAS
const upper = (text) =>
  text
    ? text.toString().toUpperCase()
    : "";

// 📊 CONFIG FLOWS
const CONFIG = {

  EXALMAR: {

    title:
      "EXALMAR FLOTA",

    sheetId:
      "1LM9JMK8yySI9CVCe785bDdsi-j1fFaJPpvIE19zDkiw"

  },

  CENTINELA: {

    title:
      "CENTINELA FLOTA",

    sheetId:
      "1z7C4HyHc3VIMxnGHWLbDTynXslutqP5gT-j_zMW1dIU"

  },

  PLANTA_CALLAO: {

    title:
      "PLANTA CALLAO",

    sheetId:
      "189ivlWlIESMcZ05_D12-5bpBIPPvLwStaRxSUfxZ2aI"

  },

  GLOBAL: {

    title:
      "GLOBAL",

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
function decryptFlowData(
  body
) {

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
    encryptedData.slice(
      -16
    );

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
        decrypted.toString(
          "utf8"
        )
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

  return Buffer
    .concat([
      encrypted,
      authTag
    ])
    .toString(
      "base64"
    );

}

// 📲 ENVIAR MENSAJE
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
      "❌ Error mensaje:",
      error.response?.data || error
    );

  }

}

// 🔢 CORRELATIVO
async function generarCorrelativo(
  sheets,
  sheetId
) {

  try {

    const response =
      await sheets
        .spreadsheets
        .values
        .get({

          spreadsheetId:
            sheetId,

          range:
            "Data!B:B"

        });

    const rows =
      response.data.values || [];

    return 100 + rows.length;

  } catch {

    return 101;

  }

}

// 📊 GUARDAR SHEETS
async function guardarEnSheet(
  tipo,
  registroBase,
  extras
) {

  try {

    const auth =
      new google.auth.GoogleAuth({

        credentials:
          JSON.parse(
            process.env
              .GOOGLE_CREDENTIALS
          ),

        scopes: [
          "https://www.googleapis.com/auth/spreadsheets"
        ]

      });

    const sheets =
      google.sheets({
        version:
          "v4",
        auth
      });

    const cfg =
      CONFIG[tipo];

    const sheetId =
      cfg.sheetId;

    const correlativo =
      await generarCorrelativo(
        sheets,
        sheetId
      );

    const values = [
      [

        registroBase.titulo,

        correlativo,

        registroBase.fecha || "",

        registroBase.hora || "",

        registroBase.solicitante ||
        registroBase.autoriza ||
        registroBase.empresa ||
        "",

        registroBase.tipo_unidad || "",

        registroBase.usuario ||
        registroBase.nombre ||
        "",

        registroBase.inicio || "",

        registroBase.destino || "",

        "",

        "",

        registroBase.observaciones || "",

        JSON.stringify(
          extras
        ),

        registroBase.fecha_registro

      ]
    ];

    await sheets
      .spreadsheets
      .values
      .append({

        spreadsheetId:
          sheetId,

        range:
          "Data!A:N",

        valueInputOption:
          "USER_ENTERED",

        requestBody: {
          values
        }

      });

    return correlativo;

  } catch (error) {

    console.error(
      "❌ Error Sheets:",
      error
    );

    return null;

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

      // 🔐 FLOW ENCRIPTADO
      if (
        req.body
          .encrypted_aes_key
      ) {

        const {
          data,
          aesKey,
          iv
        } =
          decryptFlowData(
            req.body
          );

        if (
          data.action ===
          "ping"
        ) {

          const encryptedResponse =
            encryptResponse(
              {
                data: {
                  status:
                    "active"
                }
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

      // 📲 WHATSAPP
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

      // 🔥 FORM
      let form =
        entry
          ?.messages?.[0]
          ?.interactive
          ?.nfm_reply
          ?.response_json;

      if (!form) {

        return res.sendStatus(200);

      }

      // 🔥 STRING → OBJETO
      if (
        typeof form === "string"
      ) {

        form =
          JSON.parse(form);

      }

      console.log(
        "📥 FORM:",
        form
      );

      // ✅ DETECTAR FLOW
      let tipo = "EXALMAR";

      if (
        form.nombre !== undefined &&
        form.autoriza !== undefined
      ) {

        tipo = "EXALMAR";

      }

      else if (
        form.solicitante !== undefined &&
        form.tipo_unidad !== undefined
      ) {

        tipo = "CENTINELA";

      }

      else if (
        form.solicitante !== undefined &&
        form.tipo_unidad === undefined
      ) {

        tipo = "PLANTA_CALLAO";

      }

      else if (
        form.empresa !== undefined
      ) {

        tipo = "GLOBAL";

      }

      console.log(
        "✅ FLOW:",
        tipo
      );

      const cfg =
        CONFIG[tipo];

      if (!cfg) {

        return res.sendStatus(200);

      }

      // ✅ BASE
      const registroBase = {

        titulo:
          cfg.title,

        fecha_registro:
          fechaPeru()
            .toLocaleString(
              "es-PE"
            )

      };

      const extras = {};

      // 🔥 RECORRER
      for (const key in form) {

        if (
          key === "flow_token"
        ) {

          continue;

        }

        let value =
          form[key];

        // 🔥 OTROS
        if (
          value === "OTROS" &&
          form[
            `${key}_otro`
          ]
        ) {

          value =
            form[
              `${key}_otro`
            ];

        }

        value =
          upper(value);

        // 📅 HOY
        if (
          key === "fecha" &&
          value === "HOY"
        ) {

          value =
            fechaPeru()
              .toLocaleDateString(
                "es-PE"
              );

        }

        // ⏰ AHORA
        if (
          key === "hora" &&
          (
            value === "AHORA" ||
            value === "AHORA MISMO"
          )
        ) {

          value =
            fechaPeru()
              .toLocaleTimeString(
                "es-PE",
                {
                  hour:
                    "2-digit",

                  minute:
                    "2-digit",

                  hour12:
                    false
                }
              );

        }

        registroBase[
          key
        ] = value;

        extras[
          key
        ] = value;

      }

      delete extras.flow_token;

      // 📊 GUARDAR
      const correlativo =
        await guardarEnSheet(
          tipo,
          registroBase,
          extras
        );

      // 📩 MENSAJE
      let mensaje =
        `🚖 ${registroBase.titulo}\n\n`;

      mensaje +=
        `🆔 CODIGO: ${correlativo}\n\n`;

      for (
        const key in registroBase
      ) {

        if (
          [
            "titulo",
            "fecha_registro"
          ].includes(key)
        ) {

          continue;

        }

        if (
          !registroBase[key]
        ) {

          continue;

        }

        mensaje +=
          `🔹 ${key.toUpperCase()}: ${registroBase[key]}\n`;

      }

      mensaje +=
        `\n📌 REGISTRO: ${registroBase.fecha_registro}`;

      // 📲 ENVIOS
      await enviarMensaje(
        "51961507276",
        mensaje
      );

      await enviarMensaje(
        "51986767350",
        mensaje
      );

      if (
        numeroRemitente
      ) {

        await enviarMensaje(
          numeroRemitente,
          mensaje
        );

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
      "🚀 SERVER:",
      PORT
    );

  }
);
