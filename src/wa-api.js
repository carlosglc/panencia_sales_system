// Llamadas a la Graph API de Meta para mandar mensajes de WhatsApp.
import { HttpError } from "./http.js";

export const sendingConfigured = env => !!(env.WA_TOKEN && env.WA_PHONE_NUMBER_ID);

export async function graphSend(env, to, message) {
  const base = env.WA_GRAPH_BASE || "https://graph.facebook.com";
  const call = recipient => fetch(`${base}/${env.WA_GRAPH_VERSION || "v23.0"}/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.WA_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: recipient, ...message }),
  });
  let res = await call(to);
  // Los celulares de México llegan como 521XXXXXXXXXX; en algunas cuentas el envío solo acepta 52XXXXXXXXXX.
  if (!res.ok && /^521\d{10}$/.test(to)) res = await call("52" + to.slice(3));
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("WhatsApp send", res.status, detail.slice(0, 500));
    throw new HttpError(502, "WhatsApp no aceptó el mensaje");
  }
}

// Límites de WhatsApp: título de fila 24, descripción 72, botón 20, cuerpo 1024, 10 filas por lista, 3 botones.
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export const sendText = (env, to, text) => graphSend(env, to, { type: "text", text: { body: clip(text, 4096), preview_url: false } });

export const sendList = (env, to, body, button, rows) => graphSend(env, to, {
  type: "interactive",
  interactive: {
    type: "list",
    body: { text: clip(body, 1024) },
    action: {
      button: clip(button, 20),
      sections: [{ title: "Panencia", rows: rows.slice(0, 10).map(r => ({ id: r.id, title: clip(r.title, 24), ...(r.description ? { description: clip(r.description, 72) } : {}) })) }],
    },
  },
});

export const sendButtons = (env, to, body, buttons) => graphSend(env, to, {
  type: "interactive",
  interactive: {
    type: "button",
    body: { text: clip(body, 1024) },
    action: { buttons: buttons.slice(0, 3).map(b => ({ type: "reply", reply: { id: b.id, title: clip(b.title, 20) } })) },
  },
});
