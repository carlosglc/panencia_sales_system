-- Esquema de Panencia. Dinero en centavos (enteros). Fechas de entrega como 'YYYY-MM-DD',
-- marcas de tiempo como milisegundos desde 1970.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  password_hash TEXT NOT NULL,
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,          -- sha256 del token de la cookie; el token nunca se guarda
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  user_agent   TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  key      TEXT PRIMARY KEY,              -- correo|ip
  fails    INTEGER NOT NULL,
  first_at INTEGER NOT NULL
);

CREATE TABLE products (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('pan', 'postres', 'laminados', 'temporada')),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  cost_cents  INTEGER CHECK (cost_cents >= 0),
  unit       TEXT,
  aliases    TEXT NOT NULL DEFAULT '[]',  -- JSON: otras formas en que lo piden
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 99
);

CREATE TABLE customers (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone      TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE orders (
  id             INTEGER PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  delivery_date  TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents    INTEGER NOT NULL,
  notes          TEXT NOT NULL DEFAULT '',
  raw_message    TEXT,
  paid           INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('transferencia', 'efectivo')),
  paid_at        INTEGER,
  delivered      INTEGER NOT NULL DEFAULT 0,
  delivered_at   INTEGER,
  source         TEXT NOT NULL DEFAULT 'panel',
  created_by     INTEGER REFERENCES users(id),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX orders_delivery ON orders(delivery_date);
CREATE INDEX orders_customer ON orders(customer_id);

CREATE TABLE order_items (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL,
  name        TEXT NOT NULL,               -- copia: cambiar el menú no altera pedidos viejos
  qty         INTEGER NOT NULL CHECK (qty > 0),
  price_cents INTEGER NOT NULL,
  cost_cents  INTEGER
);
CREATE INDEX order_items_order ON order_items(order_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY,
  at        INTEGER NOT NULL,
  user_id   INTEGER,
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  detail    TEXT
);
CREATE INDEX audit_at ON audit_log(at);
