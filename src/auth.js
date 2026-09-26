import { HttpError } from "./http.js";

// PBKDF2-SHA256. 100 000 es el máximo de iteraciones que permite Workers.
export const PBKDF2_ITERATIONS = 100_000;
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const COOKIE = "pn_session";
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const enc = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = bytes => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

// Formato: pbkdf2$<iteraciones>$<sal base64>$<hash base64>
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored || "").split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const got = await pbkdf2(password, unb64(salt), Number(iter));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  return crypto.subtle.timingSafeEqual(got, want);
}

// Se usa cuando el correo no existe, para que la respuesta tarde lo mismo.
const DUMMY_HASH = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export function validatePassword(pw) {
  if (typeof pw !== "string" || pw.length < 10) throw new HttpError(400, "La contraseña debe tener al menos 10 caracteres");
  if (pw.length > 200) throw new HttpError(400, "La contraseña es demasiado larga");
  return pw;
}

async function sha256(text) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

function readCookie(req, name) {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function cookieHeader(value, maxAgeSec) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

export async function createSession(env, req, userId) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256(token), userId, now, now + SESSION_MS, (req.headers.get("user-agent") || "").slice(0, 200))
    .run();
  // Limpieza oportunista de sesiones vencidas.
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
  return cookieHeader(token, SESSION_MS / 1000);
}

export async function destroySession(env, req) {
  const token = readCookie(req, COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
  return cookieHeader("", 0);
}

export async function currentUser(env, req) {
  const token = readCookie(req, COOKIE);
  if (!token || token.length > 100) return null;
  const id = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT s.id AS sid, s.expires_at, u.id, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND u.disabled = 0`
  ).bind(id).first();
  if (!row || row.expires_at < Date.now()) return null;
  // Renovar si le quedan menos de la mitad de los días.
  if (row.expires_at - Date.now() < SESSION_MS / 2) {
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(Date.now() + SESSION_MS, id).run();
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role, sessionId: id };
}

export async function login(env, req, email, password) {
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const key = `${email.toLowerCase()}|${ip}`;
  const now = Date.now();
  const attempt = await env.DB.prepare("SELECT fails, first_at FROM login_attempts WHERE key = ?").bind(key).first();
  if (attempt && attempt.fails >= MAX_FAILS && now - attempt.first_at < LOCK_MS) {
    throw new HttpError(429, "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.");
  }
  const user = await env.DB.prepare("SELECT id, email, name, role, password_hash, disabled FROM users WHERE email = ?").bind(email).first();
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || user.disabled) {
    if (!attempt || now - attempt.first_at >= LOCK_MS) {
      await env.DB.prepare("INSERT OR REPLACE INTO login_attempts (key, fails, first_at) VALUES (?, 1, ?)").bind(key, now).run();
    } else {
      await env.DB.prepare("UPDATE login_attempts SET fails = fails + 1 WHERE key = ?").bind(key).run();
    }
    throw new HttpError(401, "Correo o contraseña incorrectos");
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
  const cookie = await createSession(env, req, user.id);
  return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, cookie };
}

// Las cookies son SameSite=Strict; además, toda escritura debe venir de esta misma página.
export function checkOrigin(req, url) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (origin !== url.origin) throw new HttpError(403, "Origen no permitido");
}
