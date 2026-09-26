import { HttpError, json, readJson, str, cents, int, date, oneOf } from "./http.js";
import { currentUser, login, destroySession, checkOrigin, hashPassword, verifyPassword, validatePassword } from "./auth.js";
import * as wa from "./whatsapp.js";

const CATEGORIES = ["pan", "postres", "laminados", "temporada"];
const METHODS = ["transferencia", "efectivo"];
const ROLES = ["admin", "staff"];

// ---------- helpers ----------
const now = () => Date.now();
const isAdmin = u => u.role === "admin";
function requireAdmin(u) { if (!isAdmin(u)) throw new HttpError(403, "Solo un administrador puede hacer esto"); }

async function audit(env, user, action, entity, entityId, detail) {
  await env.DB.prepare("INSERT INTO audit_log (at, user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(now(), user ? user.id : null, action, entity || null, entityId == null ? null : String(entityId), detail ? JSON.stringify(detail).slice(0, 2000) : null)
    .run();
}

function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekStart(ymd) {
  const d = new Date(ymd + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  return addDays(ymd, -dow);
}
function todayMx() {
  // La panadería está en la Ciudad de México.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

function productOut(p, admin) {
  const out = {
    id: p.id, name: p.name, category: p.category, price_cents: p.price_cents, unit: p.unit,
    aliases: JSON.parse(p.aliases || "[]"), active: !!p.active, sort: p.sort, wa_retailer_id: p.wa_retailer_id || null,
  };
  if (admin) out.cost_cents = p.cost_cents;
  return out;
}

async function loadOrders(env, where, binds, admin) {
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

async function getOrder(env, id, admin) {
  const [o] = await loadOrders(env, "WHERE o.id = ?", [id], admin);
  if (!o) throw new HttpError(404, "Ese pedido no existe");
  return o;
}

async function upsertCustomer(env, name, phone) {
  const existing = await env.DB.prepare("SELECT id, phone FROM customers WHERE name = ?").bind(name).first();
  if (existing) {
    if (phone && phone !== existing.phone) await env.DB.prepare("UPDATE customers SET phone = ? WHERE id = ?").bind(phone, existing.id).run();
    return existing.id;
  }
  const r = await env.DB.prepare("INSERT INTO customers (name, phone, created_at) VALUES (?, ?, ?)").bind(name, phone || "", now()).run();
  return r.meta.last_row_id;
}

// Valida el cuerpo de un pedido y calcula precios y costos con el menú actual.
async function buildOrder(env, body, previous) {
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

async function newCode(env) {
  for (let i = 0; i < 5; i++) {
    const code = "PN-" + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(5, "0").slice(-5);
    const hit = await env.DB.prepare("SELECT 1 FROM orders WHERE code = ?").bind(code).first();
    if (!hit) return code;
  }
  throw new HttpError(500, "No se pudo generar el folio");
}

async function saveItems(env, orderId, items) {
  const stmts = [env.DB.prepare("DELETE FROM order_items WHERE order_id = ?").bind(orderId)];
  for (const i of items) {
    stmts.push(env.DB.prepare("INSERT INTO order_items (order_id, product_id, name, qty, price_cents, cost_cents) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(orderId, i.product_id, i.name, i.qty, i.price_cents, i.cost_cents));
  }
  await env.DB.batch(stmts);
}

function summarize(orders, admin) {
  const t = { orders: orders.length, sold_cents: 0, collected_cents: 0, owed_cents: 0, pieces: 0 };
  if (admin) Object.assign(t, { cost_cents: 0, profit_cents: 0, missing_cost: false });
  for (const o of orders) {
    t.sold_cents += o.total_cents;
    if (o.paid) t.collected_cents += o.total_cents; else t.owed_cents += o.total_cents;
    for (const i of o.items) {
      t.pieces += i.qty;
      if (admin) { if (i.cost_cents == null) t.missing_cost = true; else t.cost_cents += i.cost_cents * i.qty; }
    }
    if (admin) t.profit_cents += o.subtotal_cents - o.discount_cents;
  }
  if (admin) t.profit_cents -= t.cost_cents;
  return t;
}

// ---------- router ----------
const routes = [];
const route = (method, pattern, handler, { auth = true, origin = true } = {}) => {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ method, re, keys, handler, auth, origin });
};

// --- sesión ---
route("POST", "/api/login", async ({ env, req }) => {
  const body = await readJson(req);
  const email = str(body.email, { required: true, max: 200, field: "el correo" });
  const password = typeof body.password === "string" ? body.password : "";
  if (!password) throw new HttpError(400, "Falta la contraseña");
  const { user, cookie } = await login(env, req, email, password.slice(0, 200));
  await audit(env, user, "login");
  return json({ user }, 200, { "set-cookie": cookie });
}, { auth: false });

route("POST", "/api/logout", async ({ env, req }) => {
  const cookie = await destroySession(env, req);
  return json({ ok: true }, 200, { "set-cookie": cookie });
}, { auth: false });

route("GET", "/api/me", async ({ user }) => json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } }));

route("POST", "/api/me/password", async ({ env, req, user }) => {
  const body = await readJson(req);
  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first();
  if (!(await verifyPassword(String(body.current || "").slice(0, 200), row.password_hash))) throw new HttpError(400, "La contraseña actual no coincide");
  const hash = await hashPassword(validatePassword(body.next));
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hash, user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(user.id, user.sessionId),
  ]);
  await audit(env, user, "cambio de contraseña", "user", user.id);
  return json({ ok: true });
});

// --- menú ---
route("GET", "/api/products", async ({ env, user }) => {
  const { results } = await env.DB.prepare("SELECT * FROM products ORDER BY sort, name").all();
  return json({ products: results.map(p => productOut(p, isAdmin(user))) });
});

function productFields(body, partial) {
  const f = {};
  if (!partial || "name" in body) f.name = str(body.name, { required: true, max: 80, field: "el nombre" });
  if (!partial || "category" in body) f.category = oneOf(body.category, CATEGORIES, { field: "la sección" });
  if (!partial || "price_cents" in body) f.price_cents = cents(body.price_cents, { field: "el precio" });
  if (!partial || "cost_cents" in body) f.cost_cents = cents(body.cost_cents, { field: "el costo", nullable: true });
  if (!partial || "unit" in body) f.unit = str(body.unit, { max: 40, field: "la presentación" }) || null;
  if (!partial || "aliases" in body) {
    const a = Array.isArray(body.aliases) ? body.aliases : [];
    f.aliases = JSON.stringify(a.slice(0, 20).map(x => str(x, { max: 60, field: "un alias" })).filter(Boolean));
  }
  if (!partial || "active" in body) f.active = body.active === false ? 0 : 1;
  if ("sort" in body) f.sort = int(body.sort, { min: 0, max: 9999, field: "el orden" });
  if ("wa_retailer_id" in body) f.wa_retailer_id = str(body.wa_retailer_id, { max: 100, field: "el id del catálogo" }) || null;
  return f;
}

route("POST", "/api/products", async ({ env, req, user }) => {
  requireAdmin(user);
  const f = productFields(await readJson(req), false);
  let id = f.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "producto";
  while (await env.DB.prepare("SELECT 1 FROM products WHERE id = ?").bind(id).first()) id += "-2";
  if (f.sort == null) f.sort = ((await env.DB.prepare("SELECT MAX(sort) AS m FROM products").first()).m || 0) + 1;
  await env.DB.prepare("INSERT INTO products (id, name, category, price_cents, cost_cents, unit, aliases, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, f.name, f.category, f.price_cents, f.cost_cents, f.unit, f.aliases, f.active, f.sort).run();
  await audit(env, user, "producto creado", "product", id, f);
  return json({ product: productOut(await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first(), true) }, 201);
});

route("PATCH", "/api/products/:id", async ({ env, req, user, params }) => {
  requireAdmin(user);
  const f = productFields(await readJson(req), true);
  const keys = Object.keys(f);
  if (!keys.length) throw new HttpError(400, "Nada que cambiar");
  const r = await env.DB.prepare(`UPDATE products SET ${keys.map(k => `${k} = ?`).join(", ")} WHERE id = ?`).bind(...keys.map(k => f[k]), params.id).run();
  if (!r.meta.changes) throw new HttpError(404, "Ese producto no existe");
  await audit(env, user, "producto editado", "product", params.id, f);
  return json({ product: productOut(await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(params.id).first(), true) });
});

// --- pedidos ---
route("GET", "/api/orders", async ({ env, user, url }) => {
  const q = url.searchParams;
  const where = [], binds = [];
  if (q.get("from")) { where.push("o.delivery_date >= ?"); binds.push(date(q.get("from"))); }
  if (q.get("to")) { where.push("o.delivery_date <= ?"); binds.push(date(q.get("to"))); }
  if (q.get("unpaid") === "1") where.push("o.paid = 0");
  if (q.get("undelivered") === "1") where.push("o.delivered = 0");
  if (q.get("customer")) { where.push("o.customer_id = ?"); binds.push(int(q.get("customer"), { min: 1, max: 1e12 })); }
  const orders = await loadOrders(env, where.length ? "WHERE " + where.join(" AND ") : "", binds, isAdmin(user));
  return json({ orders });
});

route("GET", "/api/orders/:id", async ({ env, user, params }) => json({ order: await getOrder(env, int(params.id, { min: 1, max: 1e12 }), isAdmin(user)) }));

route("POST", "/api/orders", async ({ env, req, user }) => {
  const o = await buildOrder(env, await readJson(req), null);
  const customerId = await upsertCustomer(env, o.customerName, o.phone);
  const t = now();
  const code = await newCode(env);
  const r = await env.DB.prepare(
    `INSERT INTO orders (code, customer_id, delivery_date, subtotal_cents, shipping_cents, discount_cents, total_cents, notes, raw_message,
                         paid, payment_method, paid_at, source, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(code, customerId, o.delivery_date, o.subtotal, o.shipping, o.discount, o.total, o.notes, o.raw_message,
    o.paid ? 1 : 0, o.payment_method, o.paid ? t : null, o.source, user.id, t, t).run();
  const id = r.meta.last_row_id;
  await saveItems(env, id, o.items);
  await audit(env, user, "pedido creado", "order", id, { code, cliente: o.customerName, total: o.total });
  return json({ order: await getOrder(env, id, isAdmin(user)) }, 201);
});

route("PUT", "/api/orders/:id", async ({ env, req, user, params }) => {
  const id = int(params.id, { min: 1, max: 1e12 });
  const prev = await getOrder(env, id, true);
  const o = await buildOrder(env, await readJson(req), prev);
  const customerId = await upsertCustomer(env, o.customerName, o.phone);
  const paidAt = o.paid ? (prev.paid ? prev.paid_at : now()) : null;
  await env.DB.prepare(
    `UPDATE orders SET customer_id = ?, delivery_date = ?, subtotal_cents = ?, shipping_cents = ?, discount_cents = ?, total_cents = ?,
            notes = ?, paid = ?, payment_method = ?, paid_at = ?, updated_at = ? WHERE id = ?`
  ).bind(customerId, o.delivery_date, o.subtotal, o.shipping, o.discount, o.total, o.notes, o.paid ? 1 : 0, o.payment_method, paidAt, now(), id).run();
  await saveItems(env, id, o.items);
  await audit(env, user, "pedido editado", "order", id, { code: prev.code, total: o.total });
  return json({ order: await getOrder(env, id, isAdmin(user)) });
});

route("POST", "/api/orders/:id/status", async ({ env, req, user, params }) => {
  const id = int(params.id, { min: 1, max: 1e12 });
  const prev = await getOrder(env, id, false);
  const body = await readJson(req);
  const sets = [], binds = [], detail = {};
  if ("paid" in body) {
    const paid = !!body.paid;
    const method = paid ? oneOf(body.payment_method, METHODS, { field: "la forma de pago" }) : null;
    sets.push("paid = ?", "payment_method = ?", "paid_at = ?");
    binds.push(paid ? 1 : 0, method, paid ? now() : null);
    detail.pagado = paid ? method : false;
  }
  if ("delivered" in body) {
    const d = !!body.delivered;
    sets.push("delivered = ?", "delivered_at = ?");
    binds.push(d ? 1 : 0, d ? now() : null);
    detail.entregado = d;
  }
  if (!sets.length) throw new HttpError(400, "Nada que cambiar");
  await env.DB.prepare(`UPDATE orders SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).bind(...binds, now(), id).run();
  await audit(env, user, "pedido actualizado", "order", id, { code: prev.code, ...detail });
  return json({ order: await getOrder(env, id, isAdmin(user)) });
});

route("DELETE", "/api/orders/:id", async ({ env, user, params }) => {
  requireAdmin(user);
  const id = int(params.id, { min: 1, max: 1e12 });
  const prev = await getOrder(env, id, true);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id),
    env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id),
  ]);
  await audit(env, user, "pedido borrado", "order", id, { code: prev.code, cliente: prev.customer.name, total: prev.total_cents });
  return json({ ok: true });
});

// --- clientes ---
route("GET", "/api/customers", async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.phone, c.notes, c.created_at,
            COUNT(o.id) AS orders,
            COALESCE(SUM(o.total_cents), 0) AS spent_cents,
            COALESCE(SUM(CASE WHEN o.paid = 0 THEN o.total_cents ELSE 0 END), 0) AS owed_cents,
            MAX(o.delivery_date) AS last_order
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id ORDER BY last_order DESC, c.name`
  ).all();
  return json({ customers: results });
});

route("PATCH", "/api/customers/:id", async ({ env, req, user, params }) => {
  const id = int(params.id, { min: 1, max: 1e12 });
  const body = await readJson(req);
  const f = {};
  if ("name" in body) f.name = str(body.name, { required: true, max: 80, field: "el nombre" });
  if ("phone" in body) f.phone = str(body.phone, { max: 30, field: "el teléfono" });
  if ("notes" in body) f.notes = str(body.notes, { max: 1000, field: "las notas" });
  const keys = Object.keys(f);
  if (!keys.length) throw new HttpError(400, "Nada que cambiar");
  try {
    const r = await env.DB.prepare(`UPDATE customers SET ${keys.map(k => `${k} = ?`).join(", ")} WHERE id = ?`).bind(...keys.map(k => f[k]), id).run();
    if (!r.meta.changes) throw new HttpError(404, "Ese cliente no existe");
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) throw new HttpError(409, "Ya hay un cliente con ese nombre");
    throw e;
  }
  await audit(env, user, "cliente editado", "customer", id, f);
  return json({ ok: true });
});

// --- reportes ---
route("GET", "/api/reports/week", async ({ env, user, url }) => {
  const start = weekStart(url.searchParams.get("start") ? date(url.searchParams.get("start")) : todayMx());
  const end = addDays(start, 6);
  const admin = isAdmin(user);
  const orders = await loadOrders(env, "WHERE o.delivery_date BETWEEN ? AND ?", [start, end], admin);
  const days = [...new Set(orders.map(o => o.delivery_date))].sort();
  const bake = new Map();
  for (const o of orders) for (const i of o.items) {
    if (!bake.has(i.product_id)) bake.set(i.product_id, { product_id: i.product_id, name: i.name, total: 0, by_day: {} });
    const b = bake.get(i.product_id);
    b.total += i.qty;
    b.by_day[o.delivery_date] = (b.by_day[o.delivery_date] || 0) + i.qty;
  }
  return json({
    start, end, today: todayMx(), days,
    totals: summarize(orders, admin),
    bake: [...bake.values()].sort((a, b) => b.total - a.total),
    owed: orders.filter(o => !o.paid).map(o => ({ id: o.id, code: o.code, customer: o.customer.name, delivery_date: o.delivery_date, total_cents: o.total_cents })),
  });
});

route("GET", "/api/reports/weeks", async ({ env, user, url }) => {
  const n = url.searchParams.get("n") ? int(url.searchParams.get("n"), { min: 1, max: 104 }) : 12;
  const admin = isAdmin(user);
  const last = weekStart(todayMx());
  const first = addDays(last, -7 * (n - 1));
  const orders = await loadOrders(env, "WHERE o.delivery_date BETWEEN ? AND ?", [first, addDays(last, 6)], admin);
  const weeks = [];
  for (let i = 0; i < n; i++) {
    const s = addDays(first, 7 * i);
    const e = addDays(s, 6);
    weeks.push({ start: s, end: e, ...summarize(orders.filter(o => o.delivery_date >= s && o.delivery_date <= e), admin) });
  }
  return json({ weeks });
});

route("GET", "/api/reports/products", async ({ env, user, url }) => {
  requireAdmin(user);
  const from = url.searchParams.get("from") ? date(url.searchParams.get("from")) : "0000-01-01";
  const to = url.searchParams.get("to") ? date(url.searchParams.get("to")) : "9999-12-31";
  const { results } = await env.DB.prepare(
    `SELECT i.product_id, MAX(i.name) AS name, SUM(i.qty) AS qty,
            SUM(i.qty * i.price_cents) AS revenue_cents,
            SUM(CASE WHEN i.cost_cents IS NULL THEN 0 ELSE i.qty * i.cost_cents END) AS cost_cents,
            SUM(CASE WHEN i.cost_cents IS NULL THEN i.qty ELSE 0 END) AS qty_without_cost
       FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.delivery_date BETWEEN ? AND ?
      GROUP BY i.product_id ORDER BY revenue_cents DESC`
  ).bind(from, to).all();
  return json({ products: results.map(r => ({ ...r, profit_cents: r.revenue_cents - r.cost_cents })) });
});

// --- ajustes ---
route("GET", "/api/settings", async ({ env }) => {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  return json({ settings: Object.fromEntries(results.map(r => [r.key, r.value])) });
});

route("PUT", "/api/settings", async ({ env, req, user }) => {
  requireAdmin(user);
  const body = await readJson(req);
  const note = str(body.payment_note, { max: 1000, field: "el mensaje de pago" });
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('payment_note', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(note).run();
  await audit(env, user, "ajustes editados", "settings", "payment_note");
  return json({ ok: true });
});

// --- usuarios ---
route("GET", "/api/users", async ({ env, user }) => {
  requireAdmin(user);
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.disabled, u.created_at,
            (SELECT MAX(at) FROM audit_log a WHERE a.user_id = u.id AND a.action = 'login') AS last_login
       FROM users u ORDER BY u.created_at`
  ).all();
  return json({ users: results.map(u => ({ ...u, disabled: !!u.disabled })) });
});

route("POST", "/api/users", async ({ env, req, user }) => {
  requireAdmin(user);
  const body = await readJson(req);
  const email = str(body.email, { required: true, max: 200, field: "el correo" }).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Correo inválido");
  const name = str(body.name, { required: true, max: 80, field: "el nombre" });
  const role = oneOf(body.role, ROLES, { field: "el rol" });
  const hash = await hashPassword(validatePassword(body.password));
  try {
    const r = await env.DB.prepare("INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").bind(email, name, role, hash, now()).run();
    await audit(env, user, "usuario creado", "user", r.meta.last_row_id, { email, role });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) throw new HttpError(409, "Ya existe un usuario con ese correo");
    throw e;
  }
  return json({ ok: true }, 201);
});

route("PATCH", "/api/users/:id", async ({ env, req, user, params }) => {
  requireAdmin(user);
  const id = int(params.id, { min: 1, max: 1e12 });
  const body = await readJson(req);
  const stmts = [], detail = {};
  if ("name" in body) { stmts.push(env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(str(body.name, { required: true, max: 80, field: "el nombre" }), id)); detail.name = true; }
  if ("role" in body) {
    if (id === user.id) throw new HttpError(400, "No puedes cambiar tu propio rol");
    stmts.push(env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(oneOf(body.role, ROLES, { field: "el rol" }), id)); detail.role = body.role;
  }
  if ("disabled" in body) {
    if (id === user.id) throw new HttpError(400, "No puedes desactivarte a ti mismo");
    stmts.push(env.DB.prepare("UPDATE users SET disabled = ? WHERE id = ?").bind(body.disabled ? 1 : 0, id));
    if (body.disabled) stmts.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id));
    detail.disabled = !!body.disabled;
  }
  if ("password" in body) {
    const hash = await hashPassword(validatePassword(body.password));
    stmts.push(env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hash, id));
    stmts.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id));
    detail.password = "restablecida";
  }
  if (!stmts.length) throw new HttpError(400, "Nada que cambiar");
  if (!(await env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(id).first())) throw new HttpError(404, "Ese usuario no existe");
  await env.DB.batch(stmts);
  await audit(env, user, "usuario editado", "user", id, detail);
  return json({ ok: true });
});

// --- actividad y respaldo ---
route("GET", "/api/audit", async ({ env, user, url }) => {
  requireAdmin(user);
  const limit = url.searchParams.get("limit") ? int(url.searchParams.get("limit"), { min: 1, max: 500 }) : 100;
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.at, a.action, a.entity, a.entity_id, a.detail, u.name AS user_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.at DESC, a.id DESC LIMIT ?`
  ).bind(limit).all();
  return json({ entries: results.map(r => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })) });
});

route("GET", "/api/export", async ({ env, user }) => {
  requireAdmin(user);
  const tables = ["products", "customers", "orders", "order_items", "settings"];
  const out = { exported_at: new Date().toISOString() };
  for (const t of tables) out[t] = (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
  await audit(env, user, "respaldo descargado");
  return json(out, 200, { "content-disposition": `attachment; filename="panencia-respaldo-${todayMx()}.json"` });
});

// --- WhatsApp ---
// Meta llama al webhook sin sesión ni Origin; la firma HMAC (WA_APP_SECRET) es la autenticación.
route("GET", "/api/whatsapp/webhook", async ({ env, url }) => wa.verify(env, url), { auth: false, origin: false });
route("POST", "/api/whatsapp/webhook", async ({ env, req }) => wa.receive(env, req), { auth: false, origin: false });

route("GET", "/api/whatsapp/inbox", async ({ env }) => wa.inbox(env));

route("POST", "/api/whatsapp/resolve", async ({ env, req, user }) => {
  const r = await wa.resolve(env, await readJson(req));
  await audit(env, user, r.status === "pedido" ? "mensajes de WhatsApp a pedido" : "mensajes de WhatsApp descartados", "whatsapp", null, r);
  return json({ ok: true });
});

route("POST", "/api/whatsapp/send", async ({ env, req, user }) => {
  const body = await readJson(req);
  await wa.send(env, body);
  await audit(env, user, "mensaje de WhatsApp enviado", "whatsapp", null, { to: String(body.phone || "").slice(-4) });
  return json({ ok: true });
});

// ---------- entrada ----------
export async function handleApi(req, env, url) {
  const match = routes.find(r => r.method === req.method && r.re.test(url.pathname));
  if (!match) {
    const exists = routes.some(r => r.re.test(url.pathname));
    throw new HttpError(exists ? 405 : 404, exists ? "Método no permitido" : "No existe");
  }
  if (match.origin) checkOrigin(req, url);
  const m = url.pathname.match(match.re);
  const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
  let user = null;
  if (match.auth) {
    user = await currentUser(env, req);
    if (!user) throw new HttpError(401, "Inicia sesión");
  }
  return match.handler({ req, env, url, user, params });
}
