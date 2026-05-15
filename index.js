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

// 🇵🇪 FECHA Y HORA PERÚ
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

// 📅 FECHA ACTUAL PERÚ
function obtenerFechaPeru() {

  return fechaPeru()
    .toLocaleDateString(
      "es-PE"
    );

}

// ⏰ HORA ACTUAL PERÚ
function obtenerHoraPeru() {

  return fechaPeru()
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

// 🔠 MAYÚSCULAS
const upper = (text) =>
  text
    ? text.toString().toUpperCase()
    : "";

// ✅ CONFIGURACIÓN FLOWS
const CONFIG = {

  EXALMAR: {

    title:
      "EXALMAR FLOTA",

    flowId:
      "1487962506700406",

    command:
      "xf",

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
      "❌ ERROR MENSAJE:",
      error.response?.data || error
    );

  }

}

// 📲 ENVIAR FLOW
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

    // ✅ TEMPLATE SEGÚN EMPRESA
    let templateName = "";

    if (tipo === "EXALMAR") {

      templateName =
        "exal_flota";

    }

    else if (tipo === "CENTINELA") {

      templateName =
        "centinela_flota";

    }

    else if (tipo === "PLANTA_CALLAO") {

      templateName =
        "planta_callao";

    }

    else if (tipo === "GLOBAL") {

      templateName =
        "global";

    }

    // ✅ ENVIAR TEMPLATE
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
            templateName,

          language: {

            code:
              "es_PE"

          },

          components: [
            {

              type:
                "button",

              sub_type:
                "flow",

              index:
                "0",

              parameters: [
                {

                  type:
                    "action",

                  action: {

                    flow_token:
                      "FLOW_TOKEN"

                  }

                }
              ]

            }
          ]

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
      "❌ ERROR FLOW:",
      error.response?.data || error
    );

  }

}
    // ✅ TEMPLATE
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
            templateName,

          language: {

            code:
              "es"

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

  } catch (error) {

    console.error(
      "❌ ERROR FLOW:",
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

    const sheetId =
      CONFIG[tipo].sheetId;

    const correlativo =
      await generarCorrelativo(
        sheets,
        sheetId
      );

    let values = [];
    let range = "";

    // ✅ EXALMAR
    if (tipo === "EXALMAR") {

      values = [
        [
          registroBase.titulo || "",
          correlativo || "",
          registroBase.fecha || "",
          registroBase.hora || "",
          registroBase.autoriza || "",
          registroBase.nombre || "",
          registroBase.inicio || "",
          registroBase.destino || "",
          "",
          "",
          registroBase.observaciones || "",
          JSON.stringify(extras),
          registroBase.fecha_registro || ""
        ]
      ];

      range = "Data!A:M";

    }

    // ✅ CENTINELA
    else if (tipo === "CENTINELA") {

      values = [
        [
          registroBase.titulo || "",
          correlativo || "",
          registroBase.fecha || "",
          registroBase.hora || "",
          registroBase.solicitante || "",
          registroBase.tipo_unidad || "",
          registroBase.usuario || "",
          registroBase.inicio || "",
          registroBase.destino || "",
          "",
          "",
          registroBase.observaciones || "",
          JSON.stringify(extras),
          registroBase.fecha_registro || ""
        ]
      ];

      range = "Data!A:N";

    }

    // ✅ GLOBAL
    else if (tipo === "GLOBAL") {

      values = [
        [
          registroBase.titulo || "",
          correlativo || "",
          registroBase.empresa || "",
          registroBase.fecha || "",
          registroBase.hora || "",
          registroBase.usuario || "",
          registroBase.inicio || "",
          registroBase.destino || "",
          "",
          "",
          registroBase.observaciones || "",
          JSON.stringify(extras),
          registroBase.fecha_registro || ""
        ]
      ];

      range = "Data!A:M";

    }

    // ✅ PLANTA CALLAO
    else if (tipo === "PLANTA_CALLAO") {

      values = [
        [
          registroBase.titulo || "",
          correlativo || "",
          registroBase.fecha || "",
          registroBase.hora || "",
          registroBase.solicitante || "",
          registroBase.usuario || "",
          registroBase.inicio || "",
          registroBase.destino || "",
          "",
          "",
          registroBase.observaciones || "",
          JSON.stringify(extras),
          registroBase.fecha_registro || ""
        ]
      ];

      range = "Data!A:M";

    }

    await sheets
      .spreadsheets
      .values
      .append({

        spreadsheetId:
          sheetId,

        range:
          range,

        valueInputOption:
          "USER_ENTERED",

        requestBody: {
          values
        }

      });

    return correlativo;

  } catch (error) {

    console.error(
      "❌ ERROR SHEETS:",
      error.response?.data || error
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

      // 🔐 FLOW ENCRYPTED
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

          if (
            numeroRemitente ===
            "51961507276" &&
            texto.startsWith(
              cfg.command + " "
            )
          ) {

            const partes =
              texto.split(" ");

            let numeroDestino =
              partes[1];

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
              numeroDestino,
              key
            );

            await enviarMensaje(
              numeroRemitente,
              `✅ FORMULARIO ENVIADO A ${numeroDestino}`
            );

            return res.sendStatus(200);

          }

        }

      }

      // 🔥 FORMULARIO
      let form =
        entry
          ?.messages?.[0]
          ?.interactive
          ?.nfm_reply
          ?.response_json;

      if (!form) {

        return res.sendStatus(200);

      }

      if (
        typeof form === "string"
      ) {

        form =
          JSON.parse(form);

      }

      const tipo =
        form.tipo_flujo ||
        "EXALMAR";

      const cfg =
        CONFIG[tipo];

      if (!cfg) {

        return res.sendStatus(200);

      }

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

      for (const key in form) {

        if (
          key === "flow_token" ||
          key === "tipo_flujo"
        ) {

          continue;

        }

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

        // ✅ FECHA AUTOMÁTICA
        if (
          key === "fecha" &&
          (
            value === "HOY" ||
            value === "AHORA"
          )
        ) {

          value =
            obtenerFechaPeru();

        }

        // ✅ HORA AUTOMÁTICA
        if (
          key === "hora" &&
          (
            value === "AHORA" ||
            value === "AHORA MISMO"
          )
        ) {

          value =
            obtenerHoraPeru();

        }

        registroBase[key] =
          value;

        extras[key] =
          value;

      }

      delete extras.flow_token;
      delete extras.tipo_flujo;

      const correlativo =
        await guardarEnSheet(
          tipo,
          registroBase,
          extras
        );

      let mensaje =
        `🚖 ${registroBase.titulo}\n\n`;

      mensaje +=
        `🆔 CODIGO: ${correlativo}\n\n`;

      if (registroBase.empresa) {
        mensaje += `🏢 EMPRESA: ${registroBase.empresa}\n`;
      }

      if (registroBase.solicitante) {
        mensaje += `👤 SOLICITANTE: ${registroBase.solicitante}\n`;
      }

      if (registroBase.autoriza) {
        mensaje += `👤 AUTORIZA: ${registroBase.autoriza}\n`;
      }

      if (registroBase.tipo_unidad) {
        mensaje += `🚘 TIPO UNIDAD: ${registroBase.tipo_unidad}\n`;
      }

      if (registroBase.usuario) {
        mensaje += `🙍 USUARIO: ${registroBase.usuario}\n`;
      }

      if (registroBase.nombre) {
        mensaje += `🙍 NOMBRE: ${registroBase.nombre}\n`;
      }

      if (registroBase.inicio) {
        mensaje += `📍 INICIO: ${registroBase.inicio}\n`;
      }

      if (registroBase.destino) {
        mensaje += `🏁 DESTINO: ${registroBase.destino}\n`;
      }

      if (registroBase.fecha) {
        mensaje += `📅 FECHA: ${registroBase.fecha}\n`;
      }

      if (registroBase.hora) {
        mensaje += `⏰ HORA: ${registroBase.hora}\n`;
      }

      if (registroBase.observaciones) {
        mensaje += `📝 OBSERVACIONES: ${registroBase.observaciones}\n`;
      }

      mensaje +=
        `\n📌 REGISTRO: ${registroBase.fecha_registro}`;

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
      "🚀 SERVIDOR CORRIENDO:",
      PORT
    );

  }
);
