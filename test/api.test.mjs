// Pruebas de la API contra `wrangler dev` con una base local desechable.
//   npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pbkdf2Sync, randomBytes } from "node:crypto";

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
  server = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", persist], { stdio: "ignore", detached: true });
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
