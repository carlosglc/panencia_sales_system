// Conexión con la WhatsApp Business Platform (Cloud API) de Meta.
//
// Meta manda cada mensaje nuevo a POST /api/whatsapp/webhook. Aquí se verifica la firma, se guarda el mensaje
// y queda en la Bandeja del panel. Nada se convierte en pedido sin que una persona lo confirme.
//
// Secretos (wrangler secret put …): WA_VERIFY_TOKEN, WA_APP_SECRET, WA_TOKEN.
// Variables (wrangler.jsonc → vars): WA_PHONE_NUMBER_ID, WA_GRAPH_VERSION.
import { HttpError, json, str } from "./http.js";
import { sendingConfigured, sendText } from "./wa-api.js";
import { menuEnabled, handleMessage } from "./wa-menu.js";

const enc = new TextEncoder();
const MAX_BODY = 1_000_000;
const WINDOW_MS = 24 * 60 * 60 * 1000; // ventana de atención de WhatsApp: se puede responder libremente 24 h

const last10 = p => String(p || "").replace(/\D/g, "").slice(-10);

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function status(env) {
  return {
    receiving: !!(env.WA_VERIFY_TOKEN && env.WA_APP_SECRET),
    sending: sendingConfigured(env),
  };
}

// GET: Meta comprueba que la URL es nuestra antes de mandar mensajes.
export function verify(env, url) {
  const q = url.searchParams;
  if (env.WA_VERIFY_TOKEN && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === env.WA_VERIFY_TOKEN) {
    return new Response(q.get("hub.challenge") || "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Token de verificación incorrecto", { status: 403 });
}

// POST: mensajes entrantes.
export async function receive(env, req, ctx) {
  if (!env.WA_APP_SECRET) throw new HttpError(503, "WhatsApp no está configurado");
  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.length > MAX_BODY) throw new HttpError(413, "Demasiado grande");
  const given = (req.headers.get("x-hub-signature-256") || "").replace(/^sha256=/, "");
  const want = await hmacHex(env.WA_APP_SECRET, raw);
  if (given.length !== want.length || !crypto.subtle.timingSafeEqual(enc.encode(given), enc.encode(want))) {
    throw new HttpError(401, "Firma inválida");
  }
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new HttpError(400, "JSON inválido"); }

  const stmts = [], incoming = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;
      const value = change.value || {};
      const names = new Map((value.contacts || []).map(c => [c.wa_id, c.profile && c.profile.name]));
      for (const m of value.messages || []) {
        if (!m || !m.id || !m.from) continue;
        let type = "otro", body = null, items = null, replyId = null;
        if (m.type === "interactive" && m.interactive) {
          // El cliente tocó una opción del menú de WhatsApp.
          const r = m.interactive.list_reply || m.interactive.button_reply || {};
          type = "respuesta";
          body = String(r.title || "").slice(0, 200);
          replyId = String(r.id || "").slice(0, 100) || null;
        } else if (m.type === "text") {
          type = "text";
          body = String((m.text && m.text.body) || "").slice(0, 4000);
        } else if (m.type === "order" && m.order) {
          type = "order";
          body = m.order.text ? String(m.order.text).slice(0, 4000) : null;
          items = JSON.stringify((m.order.product_items || []).slice(0, 100).map(i => ({
            retailer_id: String(i.product_retailer_id || "").slice(0, 100),
            qty: Math.max(1, Math.min(500, parseInt(i.quantity, 10) || 1)),
            price_cents: Math.round((Number(i.item_price) || 0) * 100),
          })));
        } else {
          const KIND = { image: "imagen", audio: "audio", video: "video", document: "documento", sticker: "sticker", location: "ubicación", contacts: "contacto", reaction: "reacción" };
          body = `[${KIND[m.type] || "mensaje"}]`; // p. ej. la foto del comprobante de pago
        }
        const at = Number(m.timestamp) ? Number(m.timestamp) * 1000 : Date.now();
        incoming.push({ id: String(m.id).slice(0, 200), from: String(m.from).slice(0, 30), profile_name: names.get(m.from) || null, type: type === "respuesta" ? "interactive" : type, text: body, reply_id: replyId });
        stmts.push(env.DB.prepare(
          "INSERT OR IGNORE INTO wa_messages (id, from_phone, profile_name, type, body, items, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(String(m.id).slice(0, 200), String(m.from).slice(0, 30), (names.get(m.from) || "").slice(0, 100) || null, type, body, items, at));
      }
    }
  }
  if (!stmts.length) return json({ ok: true });
  const results = await env.DB.batch(stmts);
  // Solo los mensajes nuevos (Meta reintenta los que no confirmamos a tiempo).
  const fresh = incoming.filter((_, i) => results[i] && results[i].meta && results[i].meta.changes > 0);
  if (fresh.length && (await menuEnabled(env))) {
    const work = (async () => {
      for (const msg of fresh) {
        try {
          if (await handleMessage(env, msg)) await env.DB.prepare("UPDATE wa_messages SET status = 'menu' WHERE id = ? AND status = 'nuevo'").bind(msg.id).run();
        } catch (e) {
          console.error("Menú de WhatsApp", e && e.stack || e); // el mensaje se queda en la Bandeja para atenderlo a mano
        }
      }
    })();
    // Meta solo necesita un 200 rápido; el menú contesta después.
    if (ctx && ctx.waitUntil) ctx.waitUntil(work); else await work;
  }
  return json({ ok: true });
}

// Mensajes pendientes, agrupados por cliente.
export async function inbox(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, from_phone, profile_name, type, body, items, received_at FROM wa_messages WHERE status = 'nuevo' ORDER BY received_at"
  ).all();
  const { results: customers } = await env.DB.prepare("SELECT id, name, phone FROM customers WHERE phone != ''").all();
  const byPhone = new Map(customers.map(c => [last10(c.phone), c]));
  const threads = new Map();
  for (const m of results) {
    if (!threads.has(m.from_phone)) {
      const c = byPhone.get(last10(m.from_phone));
      threads.set(m.from_phone, {
        phone: m.from_phone, profile_name: m.profile_name,
        customer: c ? { id: c.id, name: c.name } : null,
        messages: [], last_at: 0,
      });
    }
    const t = threads.get(m.from_phone);
    if (m.profile_name) t.profile_name = m.profile_name;
    t.messages.push({ id: m.id, type: m.type, body: m.body, items: m.items ? JSON.parse(m.items) : null, received_at: m.received_at });
    t.last_at = Math.max(t.last_at, m.received_at);
  }
  return json({ threads: [...threads.values()].sort((a, b) => b.last_at - a.last_at), status: status(env) });
}

export async function resolve(env, body) {
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 200).map(id => str(id, { required: true, max: 200, field: "el mensaje" })) : [];
  if (!ids.length) throw new HttpError(400, "Faltan los mensajes");
  const statusValue = body.status === "pedido" ? "pedido" : body.status === "descartado" ? "descartado" : null;
  if (!statusValue) throw new HttpError(400, "Estado inválido");
  const orderId = statusValue === "pedido" ? Number(body.order_id) : null;
  if (statusValue === "pedido") {
    if (!Number.isInteger(orderId) || !(await env.DB.prepare("SELECT 1 FROM orders WHERE id = ?").bind(orderId).first())) {
      throw new HttpError(400, "Ese pedido no existe");
    }
  }
  await env.DB.batch(ids.map(id => env.DB.prepare("UPDATE wa_messages SET status = ?, order_id = ? WHERE id = ? AND status = 'nuevo'").bind(statusValue, orderId, id)));
  return { count: ids.length, status: statusValue };
}

// Responder por la API. Solo a números que nos escribieron en las últimas 24 h: fuera de esa ventana WhatsApp
// exige plantillas aprobadas (y Meta las cobra).
export async function send(env, body) {
  if (!status(env).sending) throw new HttpError(503, "El envío por WhatsApp no está configurado");
  const phone = str(body.phone, { required: true, max: 30, field: "el número" }).replace(/\D/g, "");
  const text = str(body.text, { required: true, max: 4000, field: "el mensaje" });
  const last = await env.DB.prepare("SELECT from_phone, MAX(received_at) AS at FROM wa_messages WHERE from_phone = ? OR substr(from_phone, -10) = ?")
    .bind(phone, last10(phone)).first();
  if (!last || !last.at) throw new HttpError(409, "Ese número no te ha escrito por WhatsApp. Usa el botón de WhatsApp normal.");
  if (Date.now() - last.at > WINDOW_MS) throw new HttpError(409, "Pasaron más de 24 horas desde su último mensaje. Usa el botón de WhatsApp normal.");

  try { await sendText(env, last.from_phone, text); }
  catch { throw new HttpError(502, "WhatsApp no aceptó el mensaje. Usa el botón de WhatsApp normal."); }
  return { ok: true };
}
