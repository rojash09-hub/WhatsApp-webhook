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

console.log(
  "PRIVATE_KEY:",
  PRIVATE_KEY ? "OK" : "NULL"
);

console.log(
  "PHONE_NUMBER_ID:",
  PHONE_NUMBER_ID
);

// 📊 SHEETS
const SHEETS = {
  EXALMAR:
    "1LM9JMK8yySI9CVCe785bDdsi-j1fFaJPpvIE19zDkiw",

  CLIENTE_2:
    "SHEET_ID_2",

  CLIENTE_3:
    "SHEET_ID_3"
};

// 🔠 MAYÚSCULAS
const upper = (text) =>
  text
    ? text.toString().toUpperCase()
    : "";

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

    console.log(
      "✅ Webhook verificado"
    );

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
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
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

    console.log(
      "✅ Mensaje enviado a",
      numero
    );

  } catch (error) {

    console.error(
      "❌ Error enviando mensaje:",
      error.response?.data || error
    );

  }

}

// 📲 ENVIAR FLOW
async function enviarFlow(
  numero
) {

  try {

    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product:
          "whatsapp",

        to:
          numero,

        type:
          "interactive",

        interactive: {

          type:
            "flow",

          body: {

            text:
              "🚖 EXALMAR FLOTA\nSolicita tu taxi aquí:"

          },

          action: {

            name:
              "flow",

            parameters: {

              flow_id:
                "1487962506700406",

              flow_cta:
                "Reservar Taxi"

            }

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
      "✅ Flow enviado a",
      numero
    );

  } catch (error) {

    console.error(
      "❌ Error Flow:",
      error.response?.data || error
    );

  }

}

// 📊 GUARDAR SHEETS
async function guardarEnSheet(
  cliente,
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

    const sheetId =
      SHEETS[cliente] ||
      SHEETS["EXALMAR"];

    const values = [
      [
        registroBase.titulo,
        registroBase.fecha,
        registroBase.hora,
        registroBase.autoriza,
        registroBase.nombre,
        registroBase.inicio,
        registroBase.destino,
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
          "Data!A:I",

        valueInputOption:
          "USER_ENTERED",

        requestBody: {
          values
        }

      });

    console.log(
      `✅ Guardado en ${cliente}`
    );

  } catch (error) {

    console.error(
      "❌ Error Sheets:",
      error
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

      // =====================================
      // 🔐 FLOW ENCRYPTED
      // =====================================

      if (
        req.body
          .encrypted_aes_key
      ) {

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

        // 🏓 PING META
        if (
          data.action ===
          "ping"
        ) {

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

        // ✅ RESPUESTA FLOW
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

      }

      // =====================================
      // 📲 WHATSAPP NORMAL
      // =====================================

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

      // 📩 MENSAJES TEXTO
      const mensajeTexto =
        entry
          ?.messages?.[0]
          ?.text?.body;

      if (mensajeTexto) {

        const texto =
          mensajeTexto
            .trim()
            .toLowerCase();

        // XF SIMPLE
        if (
          [
            "xf",
            "taxi",
            "reserva"
          ].includes(texto)
        ) {

          await enviarFlow(
            numeroRemitente
          );

          return res.sendStatus(200);

        }

        // XF + NÚMERO
        if (
          numeroRemitente ===
          "51961507276" &&
          texto.startsWith(
            "xf "
          )
        ) {

          const partes =
            texto.split(" ");

          let numeroDestino =
            partes[1];

          if (!numeroDestino) {

            return res.sendStatus(200);

          }

          if (
            !numeroDestino.startsWith(
              "51"
            )
          ) {

            numeroDestino =
              "51" +
              numeroDestino;

          }

          await enviarFlow(
            numeroDestino
          );

          await enviarMensaje(
            numeroRemitente,
            `✅ Formulario enviado a ${numeroDestino}`
          );

          return res.sendStatus(200);

        }

      }

      // 📥 FORMULARIO NORMAL
      const form =
        entry
          ?.messages?.[0]
          ?.interactive
          ?.nfm_reply
          ?.response_json;

      if (!form) {

        return res.sendStatus(200);

      }

      const cliente =
        form.cliente ||
        "EXALMAR";

      const registroBase = {

        titulo:
          "EXALMAR FLOTA",

        nombre:
          "",

        inicio:
          "",

        destino:
          "",

        fecha:
          "",

        hora:
          "",

        autoriza:
          "",

        fecha_registro:
          new Date()
            .toLocaleString(
              "es-PE"
            )

      };

      const extras = {};

      for (const key in form) {

        let value =
          form[key];

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

        if (
          key in
          registroBase
        ) {

          registroBase[
            key
          ] = value;

        } else {

          extras[key] =
            value;

        }

      }

      // 📊 GUARDAR
      await guardarEnSheet(
        cliente,
        registroBase,
        extras
      );

      // 📩 ARMAR MENSAJE
      let mensaje =
        `🚖 EXALMAR FLOTA - NUEVA RESERVA\n\n`;

      if (
        registroBase.nombre
      ) {

        mensaje +=
          `👤 Nombre: ${registroBase.nombre}\n`;

      }

      if (
        registroBase.inicio
      ) {

        mensaje +=
          `📍 Inicio: ${registroBase.inicio}\n`;

      }

      if (
        registroBase.destino
      ) {

        mensaje +=
          `🏁 Destino: ${registroBase.destino}\n`;

      }

      if (
        registroBase.fecha
      ) {

        mensaje +=
          `📅 Fecha: ${registroBase.fecha}\n`;

      }

      if (
        registroBase.hora
      ) {

        mensaje +=
          `⏰ Hora: ${registroBase.hora}\n`;

      }

      if (
        registroBase.autoriza
      ) {

        mensaje +=
          `✅ Autoriza: ${registroBase.autoriza}\n`;

      }

      for (
        const key in extras
      ) {

        mensaje +=
          `🔹 ${key.toUpperCase()}: ${extras[key]}\n`;

      }

      mensaje +=
        `\n📌 Registro: ${registroBase.fecha_registro}`;

      // 📲 NOTIFICACIONES
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
      "🚀 Servidor corriendo en puerto",
      PORT
    );

  }
);
