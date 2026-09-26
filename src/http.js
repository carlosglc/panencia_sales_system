export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const API_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...API_HEADERS, ...extra } });
}

export async function readJson(req) {
  const type = req.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new HttpError(415, "Envía JSON");
  const text = await req.text();
  if (text.length > 100_000) throw new HttpError(413, "Solicitud demasiado grande");
  try {
    const body = JSON.parse(text || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
}

// ---- validación ----
export function str(v, { max = 200, required = false, field = "campo" } = {}) {
  if (v == null || v === "") {
    if (required) throw new HttpError(400, `Falta ${field}`);
    return "";
  }
  if (typeof v !== "string") throw new HttpError(400, `${field} debe ser texto`);
  const s = v.trim();
  if (required && !s) throw new HttpError(400, `Falta ${field}`);
  if (s.length > max) throw new HttpError(400, `${field} es demasiado largo`);
  return s;
}

export function cents(v, { field = "monto", nullable = false } = {}) {
  if (v == null || v === "") {
    if (nullable) return null;
    return 0;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100_000_000) throw new HttpError(400, `${field} inválido`);
  return n;
}

export function int(v, { min = 0, max = 10_000, field = "número" } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${field} inválido`);
  return n;
}

export function date(v, { field = "fecha" } = {}) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `${field} inválida (usa AAAA-MM-DD)`);
  const d = new Date(v + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new HttpError(400, `${field} inválida`);
  return v;
}

export function oneOf(v, options, { field = "valor", nullable = false } = {}) {
  if ((v == null || v === "") && nullable) return null;
  if (!options.includes(v)) throw new HttpError(400, `${field} inválido`);
  return v;
}
