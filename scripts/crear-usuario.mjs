// Crea (o restablece) un usuario del panel directamente en la base de datos.
//
//   npm run crear-usuario -- --email tu@correo.com --nombre "Camila" --rol admin [--remote]
//
// Pide la contraseña en la terminal (no se escribe en el historial). Sin --remote usa la base local
// de `wrangler dev`; con --remote, la de Cloudflare.
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

const ITERATIONS = 100_000; // igual que src/auth.js

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function askHidden(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, answer => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

const email = (arg("email") || "").trim().toLowerCase();
const name = (arg("nombre") || "").trim();
const role = arg("rol") || "admin";
const remote = process.argv.includes("--remote");

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || !["admin", "staff"].includes(role)) {
  console.error('Uso: npm run crear-usuario -- --email tu@correo.com --nombre "Tu nombre" --rol admin|staff [--remote]');
  process.exit(1);
}

const password = process.env.PANENCIA_PASSWORD || (await askHidden("Contraseña (mínimo 10 caracteres): "));
if (password.length < 10) {
  console.error("La contraseña debe tener al menos 10 caracteres.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const stored = `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
const q = s => "'" + s.replace(/'/g, "''") + "'";
const sql =
  `INSERT INTO users (email, name, role, password_hash, created_at) VALUES (${q(email)}, ${q(name)}, ${q(role)}, ${q(stored)}, ${Date.now()}) ` +
  `ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, password_hash = excluded.password_hash, disabled = 0;`;

const r = spawnSync("npx", ["wrangler", "d1", "execute", "panencia", remote ? "--remote" : "--local", "--command", sql], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`Listo: ${email} (${role}) puede entrar al panel.`);
