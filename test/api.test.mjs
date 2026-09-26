// Pruebas de la API contra `wrangler dev` con una base local desechable.
//   npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pbkdf2Sync, randomBytes, createHmac } from "node:crypto";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const persist = mkdtempSync(join(tmpdir(), "panencia-test-"));
let server;

function wrangler(args) {
  const r = spawnSync("npx", ["wrangler", ...args, "--persist-to", persist], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}
function userSql(email, name, role, password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  return `INSERT INTO users (email, name, role, password_hash, created_at) VALUES ('${email}', '${name}', '${role}', 'pbkdf2$100000$${salt.toString("base64")}$${hash.toString("base64")}', ${Date.now()});`;
}

class Client {
  constructor() { this.cookie = ""; }
  async req(method, path, body, headers = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: { origin: BASE, ...(body ? { "content-type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data, headers: res.headers };
  }
}

before(async () => {
  wrangler(["d1", "migrations", "apply", "panencia", "--local"]);
  wrangler(["d1", "execute", "panencia", "--local", "--command",
    userSql("admin@panencia.test", "Admin", "admin", "contraseña-admin") + userSql("ayuda@panencia.test", "Ayudante", "staff", "contraseña-staff")]);
  server = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", persist,
    "--var", "WA_VERIFY_TOKEN:verif-123", "--var", "WA_APP_SECRET:secreto-app"], { stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + "/api/me"); return; } catch { await new Promise(r => setTimeout(r, 500)); }
  }
  throw new Error("wrangler dev no arrancó");
});

after(() => {
  try { process.kill(-server.pid); } catch {}
  rmSync(persist, { recursive: true, force: true });
});

const admin = new Client();
const staff = new Client();
let orderId;

test("sin sesión, la API pide iniciar sesión", async () => {
  const r = await new Client().req("GET", "/api/orders");
  assert.equal(r.status, 401);
});

test("contraseña incorrecta y correo inexistente dan el mismo error", async () => {
  const a = await new Client().req("POST", "/api/login", { email: "admin@panencia.test", password: "mala-mala-mala" });
  const b = await new Client().req("POST", "/api/login", { email: "nadie@panencia.test", password: "mala-mala-mala" });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.data.error, b.data.error);
});

test("login correcto pone una cookie HttpOnly, Secure y SameSite=Strict", async () => {
  const r = await admin.req("POST", "/api/login", { email: "ADMIN@panencia.test", password: "contraseña-admin" });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, "admin");
  const c = r.headers.get("set-cookie");
  assert.match(c, /HttpOnly/);
  assert.match(c, /Secure/);
  assert.match(c, /SameSite=Strict/);
  assert.equal((await staff.req("POST", "/api/login", { email: "ayuda@panencia.test", password: "contraseña-staff" })).status, 200);
});

test("escrituras desde otro sitio se rechazan", async () => {
  const r = await admin.req("POST", "/api/orders", { customer: { name: "X" } }, { origin: "https://malo.example" });
  assert.equal(r.status, 403);
});

test("el menú muestra costos solo al admin", async () => {
  await admin.req("PATCH", "/api/products/hogaza-natural", { cost_cents: 2136 });
  const a = await admin.req("GET", "/api/products");
  const s = await staff.req("GET", "/api/products");
  assert.equal(a.data.products.find(p => p.id === "hogaza-natural").cost_cents, 2136);
  assert.ok(!("cost_cents" in s.data.products[0]));
  assert.equal((await staff.req("PATCH", "/api/products/hogaza-natural", { price_cents: 1 })).status, 403);
});

test("crear pedido calcula el total con el menú y respeta precios especiales", async () => {
  const r = await staff.req("POST", "/api/orders", {
    customer: { name: "Suku", phone: "5512345678" },
    items: [{ product_id: "hogaza-natural", qty: 2 }, { product_id: "molde-honey", qty: 1, price_cents: 8000 }],
    delivery_date: "2026-09-26", shipping_cents: 3000, discount_cents: 500,
  });
  assert.equal(r.status, 201);
  orderId = r.data.order.id;
  assert.equal(r.data.order.total_cents, 2 * 8500 + 8000 + 3000 - 500);
  assert.match(r.data.order.code, /^PN-[0-9A-Z]{5}$/);
  assert.ok(!("cost_cents" in r.data.order.items[0]));
});

test("validación: producto inexistente y fecha inválida", async () => {
  const base = { customer: { name: "Ana" }, delivery_date: "2026-09-26", items: [{ product_id: "hogaza-natural", qty: 1 }] };
  assert.equal((await admin.req("POST", "/api/orders", { ...base, items: [{ product_id: "no-existe", qty: 1 }] })).status, 400);
  assert.equal((await admin.req("POST", "/api/orders", { ...base, delivery_date: "2026-02-31" })).status, 400);
  assert.equal((await admin.req("POST", "/api/orders", { ...base, items: [] })).status, 400);
});

test("marcar pagado y entregado; staff no puede borrar", async () => {
  const r = await staff.req("POST", `/api/orders/${orderId}/status`, { paid: true, payment_method: "efectivo", delivered: true });
  assert.equal(r.data.order.paid, true);
  assert.equal(r.data.order.payment_method, "efectivo");
  assert.equal(r.data.order.delivered, true);
  assert.equal((await staff.req("DELETE", `/api/orders/${orderId}`)).status, 403);
});

test("reporte semanal: totales, lista de horneado y ganancia solo para admin", async () => {
  const a = await admin.req("GET", "/api/reports/week?start=2026-09-24");
  assert.equal(a.data.start, "2026-09-21");
  assert.equal(a.data.totals.sold_cents, 27500);
  assert.equal(a.data.totals.collected_cents, 27500);
  assert.equal(a.data.bake.find(b => b.product_id === "hogaza-natural").total, 2);
  assert.equal(a.data.totals.cost_cents, 2 * 2136);
  assert.equal(a.data.totals.missing_cost, true);
  const s = await staff.req("GET", "/api/reports/week?start=2026-09-24");
  assert.ok(!("profit_cents" in s.data.totals));
});

test("clientes acumulan pedidos y saldo", async () => {
  const r = await admin.req("GET", "/api/customers");
  const suku = r.data.customers.find(c => c.name === "Suku");
  assert.equal(suku.orders, 1);
  assert.equal(suku.owed_cents, 0);
  assert.equal(suku.phone, "5512345678");
});

// ---------- WhatsApp ----------
function waPayload(messages, contacts) {
  return JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", contacts, messages } }] }] });
}
async function postWebhook(body, secret = "secreto-app") {
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return fetch(BASE + "/api/whatsapp/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body });
}
const ts = String(Math.floor(Date.now() / 1000));
const waMsgs = waPayload([
  { id: "wamid.A", from: "5215512345678", timestamp: ts, type: "text", text: { body: "hola! me apartas 2 hogazas de hierbas para el sábado?" } },
  { id: "wamid.B", from: "5215512345678", timestamp: ts, type: "order", order: { catalog_id: "c1", text: "gracias", product_items: [{ product_retailer_id: "apple-pie", quantity: "1", item_price: 300, currency: "MXN" }] } },
  { id: "wamid.C", from: "5215599990000", timestamp: ts, type: "image", image: { id: "img" } },
], [{ wa_id: "5215512345678", profile: { name: "Suku WA" } }, { wa_id: "5215599990000", profile: { name: "Desconocida" } }]);

test("webhook: Meta verifica la URL solo con el token correcto", async () => {
  const ok = await fetch(BASE + "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verif-123&hub.challenge=42");
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "42");
  const bad = await fetch(BASE + "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=42");
  assert.equal(bad.status, 403);
});

test("webhook: rechaza mensajes sin firma válida", async () => {
  assert.equal((await postWebhook(waMsgs, "secreto-falso")).status, 401);
  const noSig = await fetch(BASE + "/api/whatsapp/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: waMsgs });
  assert.equal(noSig.status, 401);
  assert.equal((await admin.req("GET", "/api/whatsapp/inbox")).data.threads.length, 0);
});

test("webhook: guarda texto y carrito, sin duplicar reintentos, y reconoce al cliente por teléfono", async () => {
  assert.equal((await postWebhook(waMsgs)).status, 200);
  assert.equal((await postWebhook(waMsgs)).status, 200); // Meta reintenta
  const r = await admin.req("GET", "/api/whatsapp/inbox");
  assert.equal(r.data.threads.length, 2);
  const suku = r.data.threads.find(t => t.phone === "5215512345678");
  assert.equal(suku.customer.name, "Suku");
  assert.equal(suku.messages.length, 2);
  const order = suku.messages.find(m => m.type === "order");
  assert.deepEqual(order.items, [{ retailer_id: "apple-pie", qty: 1, price_cents: 30000 }]);
  assert.equal(r.data.status.receiving, true);
  assert.equal(r.data.status.sending, false);
});

test("bandeja: el pedido creado desde WhatsApp saca los mensajes de la bandeja", async () => {
  const created = await admin.req("POST", "/api/orders", {
    customer: { name: "Suku", phone: "5512345678" }, source: "whatsapp", delivery_date: "2026-10-03",
    items: [{ product_id: "hogaza-hierbas", qty: 2 }, { product_id: "apple-pie", qty: 1 }],
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.order.source, "whatsapp");
  assert.equal((await admin.req("POST", "/api/whatsapp/resolve", { ids: ["wamid.A", "wamid.B"], status: "pedido", order_id: created.data.order.id })).status, 200);
  assert.equal((await admin.req("POST", "/api/whatsapp/resolve", { ids: ["wamid.C"], status: "descartado" })).status, 200);
  assert.equal((await admin.req("GET", "/api/whatsapp/inbox")).data.threads.length, 0);
});

test("enviar por la API sin configurar responde 503", async () => {
  const r = await admin.req("POST", "/api/whatsapp/send", { phone: "5215512345678", text: "hola" });
  assert.equal(r.status, 503);
});

test("la bandeja pide sesión", async () => {
  assert.equal((await new Client().req("GET", "/api/whatsapp/inbox")).status, 401);
});

test("usuarios: solo admin los gestiona; desactivar corta la sesión", async () => {
  assert.equal((await staff.req("GET", "/api/users")).status, 403);
  const list = await admin.req("GET", "/api/users");
  const helper = list.data.users.find(u => u.role === "staff");
  assert.equal((await admin.req("PATCH", `/api/users/${helper.id}`, { disabled: true })).status, 200);
  assert.equal((await staff.req("GET", "/api/me")).status, 401);
});

test("bloqueo tras 5 intentos fallidos", async () => {
  const c = new Client();
  for (let i = 0; i < 5; i++) await c.req("POST", "/api/login", { email: "admin@panencia.test", password: "equivocada-" + i });
  const r = await c.req("POST", "/api/login", { email: "admin@panencia.test", password: "contraseña-admin" });
  assert.equal(r.status, 429);
});

test("la bitácora registra lo que pasó", async () => {
  const r = await admin.req("GET", "/api/audit");
  const actions = r.data.entries.map(e => e.action);
  assert.ok(actions.includes("pedido creado"));
  assert.ok(actions.includes("usuario editado"));
});

test("logout invalida la sesión", async () => {
  await admin.req("POST", "/api/logout", {});
  assert.equal((await admin.req("GET", "/api/me")).status, 401);
});
