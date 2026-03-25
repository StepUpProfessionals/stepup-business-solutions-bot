const express = require("express");
const nodemailer = require("nodemailer");

console.log("DEBUG ENV KEYS:", Object.keys(process.env).filter(k => k.includes("PHONE")));
const app = express();
app.use(express.json());

// ==========================================
// CONFIGURACIÓN BASE
// ==========================================
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v25.0";

console.log("BOOT cwd =", process.cwd());
console.log("BOOT VERIFY_TOKEN =", VERIFY_TOKEN);
console.log("BOOT PHONE_NUMBER_ID =", PHONE_NUMBER_ID);

// ==========================================
// CORREO / ALERTAS
// ==========================================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.ALERT_EMAIL_USER,
    pass: process.env.ALERT_EMAIL_PASS,
  },
});

async function sendLeadAlert(subject, body) {
  if (
    !process.env.ALERT_EMAIL_USER ||
    !process.env.ALERT_EMAIL_PASS ||
    !process.env.ALERT_EMAIL_TO
  ) {
    console.log("Correo no configurado: faltan variables ALERT_EMAIL_*");
    return;
  }

  await transporter.sendMail({
    from: process.env.ALERT_EMAIL_USER,
    to: process.env.ALERT_EMAIL_TO,
    subject,
    text: body,
  });
}

// ==========================================
// MENSAJES BASE
// ==========================================
const WELCOME_MESSAGE = `Hola, gracias por escribir a *Step Up Business Solutions*.

Actualmente estamos enfocados en el desarrollo de *landing pages profesionales* para negocios y profesionales que necesitan una presencia digital clara, funcional y enfocada en contacto.

También estamos abriendo nuevas líneas de servicio de forma progresiva.

Escriba el número de la opción que más le interesa:

*1.* Landing page profesional para captar clientes
*2.* Inglés profesional o empresarial (próximamente)
*3.* Soluciones digitales adicionales (próximamente)
*4.* Hablar directamente sobre mi caso`;

const OPTION_1_MESSAGE = `Perfecto.

Actualmente trabajamos con *landing pages profesionales para negocios y profesionales* que necesitan una presencia digital clara, funcional y enfocada en contacto por WhatsApp.

Este servicio está diseñado para *páginas tipo landing*: una estructura clara, directa y enfocada en resultados.

Para orientarle mejor, cuénteme por favor:

*1.* Qué tipo de negocio tiene
*2.* Si ya tiene página web o dominio
*3.* Qué quiere lograr con la página

Ejemplo:
"Tengo un spa, no tengo página y quiero que me escriban más por WhatsApp."`;

const OPTION_1_CONFIRMATION = `Gracias por la información.

Con base en lo que nos comenta, podemos ayudarle a estructurar una página clara y funcional enfocada en generar contacto directo con sus clientes.

En breve reviso su caso y le doy una recomendación concreta.`;

const OPTION_2_MESSAGE = `Gracias por su interés.

En este momento esta línea se encuentra en *apertura limitada* mientras consolidamos nuestra operación principal.

Si lo desea, puede contarnos brevemente qué necesita y le escribiremos cuando esta línea esté disponible.`;

const OPTION_3_MESSAGE = `Gracias por su interés.

En este momento esta línea se encuentra en *apertura limitada* mientras consolidamos nuestra operación principal.

Si desea, puede contarnos qué tipo de solución digital necesita y tomaremos nota para futuras aperturas.`;

const OPTION_4_MESSAGE = `Perfecto.

Cuéntenos brevemente su caso y qué necesita mejorar en este momento.
Le responderemos con la opción más adecuada.`;

const FALLBACK_MESSAGE = `Gracias por escribir a *Step Up Business Solutions*.

Por favor elija una opción escribiendo su número:

*1.* Landing page profesional para captar clientes
*2.* Inglés profesional o empresarial (próximamente)
*3.* Soluciones digitales adicionales (próximamente)
*4.* Hablar directamente sobre mi caso`;

// ==========================================
// ESTADO SIMPLE EN MEMORIA
// Nota: se pierde si reinicias el servidor.
// Si luego quieres persistencia real, lo migras a DB/Sheets/CRM.
// ==========================================
const userState = new Map();

// ==========================================
// AYUDAS
// ==========================================
function normalizeText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function detectMainOption(text) {
  const t = normalizeText(text);

  if (
    t === "1" ||
    t.includes("landing") ||
    t.includes("pagina") ||
    t.includes("pagina web") ||
    t.includes("web")
  ) {
    return "option_1";
  }

  if (
    t === "2" ||
    t.includes("ingles") ||
    t.includes("english") ||
    t.includes("pronunciacion")
  ) {
    return "option_2";
  }

  if (
    t === "3" ||
    t.includes("automatizacion") ||
    t.includes("digital") ||
    t.includes("bot") ||
    t.includes("soporte")
  ) {
    return "option_3";
  }

  if (
    t === "4" ||
    t.includes("mi caso") ||
    t.includes("hablar") ||
    t.includes("asesor") ||
    t.includes("directamente")
  ) {
    return "option_4";
  }

  return null;
}

function looksLikeOption1ProjectBrief(text) {
  const t = normalizeText(text);

  return (
    t.length > 35 ||
    t.includes("tengo un") ||
    t.includes("tengo una") ||
    t.includes("quiero") ||
    t.includes("no tengo pagina") ||
    t.includes("no tengo dominio") ||
    t.includes("whatsapp")
  );
}

// ==========================================
// ENVÍO DE MENSAJES A WHATSAPP
// ==========================================
async function sendWhatsAppMessage(to, body) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to,
    text: { body },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  console.log("SENT:", data);

  return data;
}

// ==========================================
// LÓGICA PRINCIPAL DEL BOT
// ==========================================
async function handleIncomingMessage(from, messageText) {
  const text = messageText || "";
  const cleanText = normalizeText(text);
  const currentState = userState.get(from) || "new";

  // 1) Si es nuevo, mostrar menú principal o detectar una opción directa
  if (currentState === "new") {
    const detected = detectMainOption(cleanText);

    if (!detected) {
      await sendWhatsAppMessage(from, WELCOME_MESSAGE);
      userState.set(from, "awaiting_main_option");
      return;
    }

    if (detected === "option_1") {
      await sendWhatsAppMessage(from, OPTION_1_MESSAGE);
      userState.set(from, "awaiting_option_1_brief");
      return;
    }

    if (detected === "option_2") {
      await sendWhatsAppMessage(from, OPTION_2_MESSAGE);
      userState.set(from, "awaiting_option_2_interest");
      return;
    }

    if (detected === "option_3") {
      await sendWhatsAppMessage(from, OPTION_3_MESSAGE);
      userState.set(from, "awaiting_option_3_interest");
      return;
    }

    if (detected === "option_4") {
      await sendWhatsAppMessage(from, OPTION_4_MESSAGE);
      userState.set(from, "awaiting_case_description");
      return;
    }
  }

  // 2) Esperando opción principal
  if (currentState === "awaiting_main_option") {
    const detected = detectMainOption(cleanText);

    if (!detected) {
      await sendWhatsAppMessage(from, FALLBACK_MESSAGE);
      return;
    }

    if (detected === "option_1") {
      await sendWhatsAppMessage(from, OPTION_1_MESSAGE);
      userState.set(from, "awaiting_option_1_brief");
      return;
    }

    if (detected === "option_2") {
      await sendWhatsAppMessage(from, OPTION_2_MESSAGE);
      userState.set(from, "awaiting_option_2_interest");
      return;
    }

    if (detected === "option_3") {
      await sendWhatsAppMessage(from, OPTION_3_MESSAGE);
      userState.set(from, "awaiting_option_3_interest");
      return;
    }

    if (detected === "option_4") {
      await sendWhatsAppMessage(from, OPTION_4_MESSAGE);
      userState.set(from, "awaiting_case_description");
      return;
    }
  }

  // 3) Usuario eligió opción 1 y debe describir su negocio/caso
  if (currentState === "awaiting_option_1_brief") {
    if (looksLikeOption1ProjectBrief(cleanText)) {
      try {
        await sendLeadAlert(
          "Nuevo lead web - Step Up Business Solutions",
          `Nuevo lead web captado.\n\nNúmero: ${from}\nMensaje:\n${text}`
        );
        console.log("Correo de lead web enviado correctamente");
      } catch (error) {
        console.error("Error al enviar correo de lead web:", error);
      }

      await sendWhatsAppMessage(from, OPTION_1_CONFIRMATION);
      userState.set(from, "option_1_captured");
      return;
    }

    await sendWhatsAppMessage(
      from,
      `Para orientarle mejor, por favor cuénteme estas 3 cosas:

*1.* Qué tipo de negocio tiene
*2.* Si ya tiene página web o dominio
*3.* Qué quiere lograr con la página

Ejemplo:
"Tengo un consultorio, no tengo página y quiero que me contacten más por WhatsApp."`
    );
    return;
  }

  // 4) Opción 2 en pausa
  if (currentState === "awaiting_option_2_interest") {
    await sendWhatsAppMessage(
      from,
      `Gracias. Hemos tomado nota de su interés en esta línea.

En este momento nuestra operación principal está enfocada en *landing pages profesionales*.`
    );
    userState.set(from, "option_2_registered");
    return;
  }

  // 5) Opción 3 en pausa
  if (currentState === "awaiting_option_3_interest") {
    await sendWhatsAppMessage(
      from,
      `Gracias. Hemos tomado nota de su interés en esta línea.

En este momento nuestra operación principal está enfocada en *landing pages profesionales*.`
    );
    userState.set(from, "option_3_registered");
    return;
  }

  // 6) Opción 4: caso libre
  if (currentState === "awaiting_case_description") {
    try {
      await sendLeadAlert(
        "Nuevo caso directo - Step Up Business Solutions",
        `Nuevo caso directo recibido.\n\nNúmero: ${from}\nMensaje:\n${text}`
      );
      console.log("Correo de caso directo enviado correctamente");
    } catch (error) {
      console.error("Error al enviar correo de caso directo:", error);
    }

    await sendWhatsAppMessage(
      from,
      `Gracias por compartir su caso.

Lo revisaremos y le responderemos con la opción más adecuada según su necesidad.`
    );
    userState.set(from, "case_received");
    return;
  }

  // 7) Estado ya captado / neutro
  await sendWhatsAppMessage(
    from,
    `Gracias por escribir.

Si desea, puede volver a elegir una opción:

*1.* Landing page profesional para captar clientes
*2.* Inglés profesional o empresarial (próximamente)
*3.* Soluciones digitales adicionales (próximamente)
*4.* Hablar directamente sobre mi caso`
  );
}

// ==========================================
// WEBHOOK VERIFICATION
// ==========================================
app.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ==========================================
// RECEPCIÓN DE MENSAJES
// ==========================================
app.post("/whatsapp", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];

    // Ignorar eventos que no sean mensajes de texto entrantes
    if (!msg || msg.type !== "text") {
      return res.sendStatus(200);
    }

    const from = msg.from;
    const text = msg.text?.body || "";

    console.log("INCOMING MESSAGE:", { from, text });

    await handleIncomingMessage(from, text);

    return res.sendStatus(200);
  } catch (error) {
    console.error("ERROR in /whatsapp:", error);
    return res.sendStatus(200);
  }
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
