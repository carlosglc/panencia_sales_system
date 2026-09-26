// Pedidos: lectura, validación y creación. Lo usan la API del panel y el menú de WhatsApp.
import { HttpError, str, cents, int, date, oneOf } from "./http.js";

const METHODS = ["transferencia", "efectivo"];

export const now = () => Date.now();

export async function audit(env, user, action, entity, entityId, detail) {
  await env.DB.prepare("INSERT INTO audit_log (at, user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(now(), user ? user.id : null, action, entity || null, entityId == null ? null : String(entityId), detail ? JSON.stringify(detail).slice(0, 2000) : null)
    .run();
}

export function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekStart(ymd) {
  const d = new Date(ymd + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  return addDays(ymd, -dow);
}
export function todayMx() {
  // La panadería está en la Ciudad de México.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}


export async function loadOrders(env, where, binds, admin) {
  const { results: orders } = await env.DB.prepare(
    `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
       FROM orders o JOIN customers c ON c.id = o.customer_id
      ${where}
      ORDER BY o.delivery_date, o.created_at`
  ).bind(...binds).all();
  if (!orders.length) return [];
  const ids = orders.map(o => o.id);
  const items = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const { results } = await env.DB.prepare(
      `SELECT * FROM order_items WHERE order_id IN (${chunk.map(() => "?").join(",")}) ORDER BY id`
    ).bind(...chunk).all();
    items.push(...results);
  }
  const byOrder = new Map();
  for (const it of items) {
    if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
    byOrder.get(it.order_id).push({
      product_id: it.product_id, name: it.name, qty: it.qty, price_cents: it.price_cents,
      ...(admin ? { cost_cents: it.cost_cents } : {}),
    });
  }
  return orders.map(o => ({
    id: o.id, code: o.code,
    customer: { id: o.customer_id, name: o.customer_name, phone: o.customer_phone },
    delivery_date: o.delivery_date,
    items: byOrder.get(o.id) || [],
    subtotal_cents: o.subtotal_cents, shipping_cents: o.shipping_cents, discount_cents: o.discount_cents, total_cents: o.total_cents,
    notes: o.notes, raw_message: o.raw_message,
    paid: !!o.paid, payment_method: o.payment_method, paid_at: o.paid_at,
    delivered: !!o.delivered, delivered_at: o.delivered_at,
    source: o.source, created_at: o.created_at, updated_at: o.updated_at,
  }));
}

export async function getOrder(env, id, admin) {
  const [o] = await loadOrders(env, "WHERE o.id = ?", [id], admin);
  if (!o) throw new HttpError(404, "Ese pedido no existe");
  return o;
}

export async function upsertCustomer(env, name, phone) {
  const existing = await env.DB.prepare("SELECT id, phone FROM customers WHERE name = ?").bind(name).first();
  if (existing) {
    if (phone && phone !== existing.phone) await env.DB.prepare("UPDATE customers SET phone = ? WHERE id = ?").bind(phone, existing.id).run();
    return existing.id;
  }
  const r = await env.DB.prepare("INSERT INTO customers (name, phone, created_at) VALUES (?, ?, ?)").bind(name, phone || "", now()).run();
  return r.meta.last_row_id;
}

// Valida el cuerpo de un pedido y calcula precios y costos con el menú actual.
export async function buildOrder(env, body, previous) {
  const customerName = str(body.customer && body.customer.name, { required: true, max: 80, field: "el nombre del cliente" });
  const phone = str(body.customer && body.customer.phone, { max: 30, field: "el teléfono" });
  if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, "Agrega al menos un producto");
  if (body.items.length > 50) throw new HttpError(400, "Demasiados productos en un pedido");
  const { results: products } = await env.DB.prepare("SELECT * FROM products").all();
  const byId = new Map(products.map(p => [p.id, p]));
  const prevItems = new Map((previous ? previous.items : []).map(i => [i.product_id, i]));
  const items = [];
  for (const raw of body.items) {
    const productId = str(raw.product_id, { required: true, max: 80, field: "el producto" });
    const qty = int(raw.qty, { min: 1, max: 500, field: "la cantidad" });
    const p = byId.get(productId);
    const prev = prevItems.get(productId);
    if (!p && !prev) throw new HttpError(400, `El producto ${productId} no está en el menú`);
    const base = p || prev;
    const price = raw.price_cents == null ? (prev ? prev.price_cents : base.price_cents) : cents(raw.price_cents, { field: "el precio" });
    const cost = prev && prev.cost_cents != null ? prev.cost_cents : (p ? p.cost_cents : null); // se conserva el costo con que se vendió
    items.push({ product_id: productId, name: base.name, qty, price_cents: price, cost_cents: cost });
  }
  const subtotal = items.reduce((a, i) => a + i.qty * i.price_cents, 0);
  const shipping = cents(body.shipping_cents, { field: "el envío" });
  const discount = cents(body.discount_cents, { field: "el descuento" });
  const paid = !!body.paid;
  return {
    customerName, phone, items, subtotal, shipping, discount,
    total: Math.max(0, subtotal + shipping - discount),
    delivery_date: date(body.delivery_date, { field: "la fecha de entrega" }),
    notes: str(body.notes, { max: 1000, field: "las notas" }),
    raw_message: str(body.raw_message, { max: 4000, field: "el mensaje" }) || null,
    paid,
    payment_method: paid ? oneOf(body.payment_method, METHODS, { field: "la forma de pago" }) : null,
    source: body.source === "whatsapp" ? "whatsapp" : "panel",
  };
}

export async function newCode(env) {
  for (let i = 0; i < 5; i++) {
    const code = "PN-" + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(5, "0").slice(-5);
    const hit = await env.DB.prepare("SELECT 1 FROM orders WHERE code = ?").bind(code).first();
    if (!hit) return code;
  }
  throw new HttpError(500, "No se pudo generar el folio");
}

export async function saveItems(env, orderId, items) {
  const stmts = [env.DB.prepare("DELETE FROM order_items WHERE order_id = ?").bind(orderId)];
  for (const i of items) {
    stmts.push(env.DB.prepare("INSERT INTO order_items (order_id, product_id, name, qty, price_cents, cost_cents) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(orderId, i.product_id, i.name, i.qty, i.price_cents, i.cost_cents));
  }
  await env.DB.batch(stmts);
}

// Crea un pedido completo (cliente, renglones, bitácora). userId es null cuando lo crea el menú de WhatsApp.
export async function createOrder(env, body, userId, auditUser) {
  const o = await buildOrder(env, body, null);
  const customerId = await upsertCustomer(env, o.customerName, o.phone);
  const t = now();
  const code = await newCode(env);
  const r = await env.DB.prepare(
    `INSERT INTO orders (code, customer_id, delivery_date, subtotal_cents, shipping_cents, discount_cents, total_cents, notes, raw_message,
                         paid, payment_method, paid_at, source, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(code, customerId, o.delivery_date, o.subtotal, o.shipping, o.discount, o.total, o.notes, o.raw_message,
    o.paid ? 1 : 0, o.payment_method, o.paid ? t : null, o.source, userId, t, t).run();
  const id = r.meta.last_row_id;
  await saveItems(env, id, o.items);
  await audit(env, auditUser, "pedido creado", "order", id, { code, cliente: o.customerName, total: o.total, origen: o.source });
  return id;
}
