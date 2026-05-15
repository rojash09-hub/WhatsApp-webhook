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

// ✅ TIPO FLUJO
const tipo =
  form.tipo_flujo ||
  "EXALMAR";

// ✅ CONFIG
const cfg =
  CONFIG[tipo];

if (!cfg) {

  console.log(
    "❌ TIPO NO CONFIGURADO:",
    tipo
  );

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

// 🔥 RECORRER CAMPOS
for (const key in form) {

  // ❌ IGNORAR FLOW TOKEN
  if (
    key === "flow_token"
  ) {

    continue;

  }

  // ❌ IGNORAR TIPO FLUJO
  if (
    key === "tipo_flujo"
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

  // 🔠 MAYÚSCULAS
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

  // ✅ GUARDAR
  registroBase[
    key
  ] = value;

  extras[
    key
  ] = value;

}

// 🔥 ELIMINAR CAMPOS BASURA
delete extras.flow_token;
delete extras.tipo_flujo;

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

// 🔥 CAMPOS
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

// 📌 REGISTRO
mensaje +=
  `\n📌 REGISTRO: ${registroBase.fecha_registro}`;

// 📲 ENVÍOS
await enviarMensaje(
  "51961507276",
  mensaje
);

await enviarMensaje(
  "51986767350",
  mensaje
);

if (numero) {

  await enviarMensaje(
    numero,
    mensaje
  );

}

return res.sendStatus(200);
