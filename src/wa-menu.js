// Menú de WhatsApp: el cliente escribe MENÚ y pide eligiendo opciones fijas (listas y botones de WhatsApp).
// No interpreta texto libre: cada respuesta trae el id exacto de la opción elegida, así que el pedido que se
// registra es exactamente lo que el cliente tocó.
//
// Pasos: seccion → producto → cantidad → mas (agregar otro / terminar) → dia → confirmar.
import { createOrder, getOrder, todayMx, addDays } from "./orders.js";
import { sendText, sendList, sendButtons, sendingConfigured } from "./wa-api.js";

const SESSION_MS = 2 * 60 * 60 * 1000;
const START = new Set(["menu", "pedido", "pedir", "ordenar", "hacer pedido", "hacer un pedido", "quiero pedir", "quiero hacer un pedido", "quiero ordenar"]);
const CANCEL = new Set(["cancelar", "cancela", "salir"]);
const CATS = { pan: "Pan", postres: "Postres y galletas", laminados: "Laminados", temporada: "Temporada" };
const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const money = c => "$" + (c / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 });
const last10 = p => String(p || "").replace(/\D/g, "").slice(-10);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const dayName = ymd => { const d = new Date(ymd + "T12:00:00Z"); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`; };

async function settings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(results.map(r => [r.key, r.value]));
}

export async function menuEnabled(env) {
  if (!sendingConfigured(env)) return false;
  return (await settings(env)).wa_menu === "1";
}

async function activeProducts(env) {
  return (await env.DB.prepare("SELECT id, name, category, price_cents, unit FROM products WHERE active = 1 ORDER BY sort, name").all()).results;
}

// Días en que se puede entregar: a partir de mañana, en los días de la semana configurados, máximo 7 opciones.
function deliveryDates(s) {
  const allowed = new Set(String(s.delivery_days ?? "0,1,2,3,4,5,6").split(",").filter(Boolean).map(Number));
  const out = [];
  for (let i = 1; i <= 21 && out.length < 7; i++) {
    const d = addDays(todayMx(), i);
    if (allowed.has(new Date(d + "T12:00:00Z").getUTCDay())) out.push(d);
  }
  return out;
}

function cartLines(cart, products) {
  const byId = new Map(products.map(p => [p.id, p]));
  let total = 0;
  const lines = cart.map(i => {
    const p = byId.get(i.product_id);
    const sub = p ? p.price_cents * i.qty : 0;
    total += sub;
    return `• ${i.qty} × ${p ? p.name : i.product_id} — ${money(sub)}`;
  });
  return { text: lines.join("\n"), total };
}

// ---------- mensajes de cada paso ----------
async function prompt(env, to, session, note) {
  const products = await activeProducts(env);
  const d = session.data;
  const pre = note ? note + "\n\n" : "";

  if (session.step === "seccion") {
    const cats = Object.keys(CATS).filter(c => products.some(p => p.category === c));
    const intro = d.cart.length ? `Tu pedido va así:\n${cartLines(d.cart, products).text}\n\n` : "¡Hola! Este es el menú de Panencia, pan de masa madre.\n\n";
    return sendList(env, to, pre + intro + "Elige una sección:", "Ver secciones", cats.map(c => ({
      id: "c:" + c, title: CATS[c], description: products.filter(p => p.category === c).map(p => p.name).join(", "),
    })));
  }
  if (session.step === "producto") {
    const ps = products.filter(p => p.category === d.category);
    const page = d.page || 0;
    const slice = ps.slice(page * 8, page * 8 + 8);
    const rows = slice.map(p => ({
      id: "p:" + p.id, title: p.name,
      description: [money(p.price_cents), p.unit, p.name.length > 24 ? p.name : null].filter(Boolean).join(" · "),
    }));
    if (ps.length > (page + 1) * 8) rows.push({ id: "pg:" + (page + 1), title: "Ver más", description: "Más productos de esta sección" });
    rows.push({ id: "back", title: "Otra sección" });
    return sendList(env, to, pre + `${CATS[d.category]}: elige un producto.`, "Ver productos", rows);
  }
  if (session.step === "cantidad") {
    const p = products.find(x => x.id === d.product);
    return sendList(env, to, pre + `${p.name} (${money(p.price_cents)}${p.unit ? " · " + p.unit : ""}). ¿Cuántos quieres?`, "Elegir cantidad",
      Array.from({ length: 10 }, (_, i) => ({ id: "q:" + (i + 1), title: String(i + 1), description: money(p.price_cents * (i + 1)) })));
  }
  if (session.step === "mas") {
    const c = cartLines(d.cart, products);
    return sendButtons(env, to, pre + `Tu pedido:\n${c.text}\n\nSubtotal: ${money(c.total)}`, [
      { id: "m:otro", title: "Agregar otro" }, { id: "m:listo", title: "Terminar pedido" }, { id: "m:cancelar", title: "Cancelar" },
    ]);
  }
  if (session.step === "dia") {
    const dates = deliveryDates(await settings(env));
    return sendList(env, to, pre + "¿Qué día lo quieres?", "Elegir día", dates.map(x => ({ id: "d:" + x, title: cap(dayName(x)) })));
  }
  if (session.step === "confirmar") {
    const c = cartLines(d.cart, products);
    return sendButtons(env, to, pre + `Revisa tu pedido:\n${c.text}\n\nTotal: ${money(c.total)}\nEntrega: ${dayName(d.day)}\n\n¿Lo confirmamos?`, [
      { id: "k:si", title: "Confirmar pedido" }, { id: "k:no", title: "Cancelar" },
    ]);
  }
}

// ---------- sesión ----------
async function loadSession(env, phone) {
  const row = await env.DB.prepare("SELECT * FROM wa_sessions WHERE phone = ?").bind(phone).first();
  if (!row) return null;
  if (Date.now() - row.updated_at > SESSION_MS) { await env.DB.prepare("DELETE FROM wa_sessions WHERE phone = ?").bind(phone).run(); return null; }
  return { phone, step: row.step, data: JSON.parse(row.data), msgIds: JSON.parse(row.msg_ids) };
}
const saveSession = (env, s) => env.DB.prepare(
  "INSERT INTO wa_sessions (phone, step, data, msg_ids, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET step = excluded.step, data = excluded.data, msg_ids = excluded.msg_ids, updated_at = excluded.updated_at"
).bind(s.phone, s.step, JSON.stringify(s.data), JSON.stringify(s.msgIds.slice(-200)), Date.now()).run();
const endSession = (env, phone) => env.DB.prepare("DELETE FROM wa_sessions WHERE phone = ?").bind(phone).run();

// Nombre del cliente: el que ya está registrado con ese teléfono; si no, el de su perfil de WhatsApp.
async function customerName(env, phone, profile) {
  const l10 = last10(phone);
  const { results } = await env.DB.prepare("SELECT name, phone FROM customers WHERE phone != ''").all();
  const known = results.find(c => last10(c.phone) === l10);
  if (known) return known.name;
  let name = String(profile || "").trim().slice(0, 60) || `WhatsApp ${l10.slice(-4)}`;
  const clash = await env.DB.prepare("SELECT phone FROM customers WHERE name = ?").bind(name).first();
  if (clash && last10(clash.phone) !== l10) name = `${name} (${l10.slice(-4)})`;
  return name;
}

function orderMessage(o, paymentNote) {
  const L = [`¡Listo, ${o.customer.name}! Tu pedido quedó registrado:`, ""];
  for (const i of o.items) L.push(`• ${i.qty} × ${i.name} — ${money(i.qty * i.price_cents)}`);
  L.push("", `Total: ${money(o.total_cents)}`, `Entrega: ${dayName(o.delivery_date)}`, `Pedido ${o.code}`, "");
  L.push((paymentNote || "").trim() || "Te confirmamos en cuanto recibamos tu pago. ¡Gracias!");
  return L.join("\n");
}

// ---------- entrada ----------
// msg: { id, from, profile_name, type, text, reply_id }. Devuelve true si el menú atendió el mensaje
// (entonces no aparece en la Bandeja).
export async function handleMessage(env, msg) {
  const to = msg.from;
  const t = norm(msg.text);
  let s = await loadSession(env, to);

  if (!s) {
    if (msg.type === "text" && START.has(t)) {
      s = { phone: to, step: "seccion", data: { cart: [] }, msgIds: [msg.id] };
      await saveSession(env, s);
      await prompt(env, to, s);
      return true;
    }
    if (msg.reply_id) { // tocó una opción de un menú que ya venció
      await sendText(env, to, "Ese menú ya venció. Escribe MENÚ para empezar de nuevo.");
      return true;
    }
    return false; // plática normal: va a la Bandeja
  }

  s.msgIds.push(msg.id);
  if (msg.type === "text" && CANCEL.has(t)) return cancel(env, s);
  if (msg.type === "text" && START.has(t)) { s.step = "seccion"; s.data = { cart: [] }; await saveSession(env, s); await prompt(env, to, s); return true; }
  if (!msg.reply_id) { await saveSession(env, s); await prompt(env, to, s, "Elige una opción de la lista, o escribe CANCELAR."); return true; }

  const [kind, value] = msg.reply_id.split(":");
  const products = await activeProducts(env);
  const d = s.data;
  const again = async note => { await saveSession(env, s); await prompt(env, to, s, note); return true; };

  if (s.step === "seccion" && kind === "c" && CATS[value] && products.some(p => p.category === value)) {
    s.step = "producto"; d.category = value; d.page = 0; return again();
  }
  if (s.step === "producto") {
    if (kind === "back") { s.step = "seccion"; return again(); }
    if (kind === "pg") { d.page = Math.max(0, parseInt(value, 10) || 0); return again(); }
    if (kind === "p" && products.some(p => p.id === value)) { s.step = "cantidad"; d.product = value; return again(); }
  }
  if (s.step === "cantidad" && kind === "q") {
    const qty = parseInt(value, 10);
    if (qty >= 1 && qty <= 10 && products.some(p => p.id === d.product)) {
      const line = d.cart.find(i => i.product_id === d.product);
      if (line) line.qty += qty; else d.cart.push({ product_id: d.product, qty });
      delete d.product; s.step = "mas"; return again();
    }
  }
  if (s.step === "mas" && kind === "m") {
    if (value === "otro") { s.step = "seccion"; return again(); }
    if (value === "listo") {
      if (!deliveryDates(await settings(env)).length) {
        await endSession(env, to);
        await sendText(env, to, "Por ahora no tenemos días de entrega abiertos. Te escribimos pronto.");
        return true;
      }
      s.step = "dia"; return again();
    }
    if (value === "cancelar") return cancel(env, s);
  }
  if (s.step === "dia" && kind === "d" && deliveryDates(await settings(env)).includes(msg.reply_id.slice(2))) {
    d.day = msg.reply_id.slice(2); s.step = "confirmar"; return again();
  }
  if (s.step === "confirmar" && kind === "k") {
    if (value === "no") return cancel(env, s);
    if (value === "si") return confirm(env, s, msg.profile_name, products);
  }
  // Tocó una opción de un paso anterior: se repite el paso actual.
  return again("Esa opción ya no aplica. Elige de esta lista:");
}

async function cancel(env, s) {
  await endSession(env, s.phone);
  await sendText(env, s.phone, "Pedido cancelado. Escribe MENÚ cuando quieras empezar de nuevo.");
  return true;
}

async function confirm(env, s, profileName, products) {
  const cart = s.data.cart.filter(i => products.some(p => p.id === i.product_id));
  if (!cart.length) { s.step = "seccion"; s.data.cart = []; await saveSession(env, s); await prompt(env, s.phone, s, "Esos productos ya no están disponibles."); return true; }
  const name = await customerName(env, s.phone, profileName);
  const id = await createOrder(env, {
    customer: { name, phone: last10(s.phone) },
    items: cart.map(i => ({ product_id: i.product_id, qty: i.qty })),
    delivery_date: s.data.day,
    source: "whatsapp",
    raw_message: "Pedido hecho con el menú de WhatsApp",
  }, null, null);
  await endSession(env, s.phone);
  await env.DB.batch(s.msgIds.map(mid => env.DB.prepare("UPDATE wa_messages SET status = 'menu', order_id = ? WHERE id = ?").bind(id, mid)));
  const order = await getOrder(env, id, false);
  await sendText(env, s.phone, orderMessage(order, (await settings(env)).payment_note));
  return true;
}
