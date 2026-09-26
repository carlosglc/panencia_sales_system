-- Mensajes que llegan por la WhatsApp Business Platform (Cloud API) y esperan convertirse en pedido.
CREATE TABLE wa_messages (
  id           TEXT PRIMARY KEY,            -- wamid de Meta; evita duplicados cuando Meta reintenta
  from_phone   TEXT NOT NULL,               -- como lo manda Meta, p. ej. 5215512345678
  profile_name TEXT,                        -- nombre del perfil de WhatsApp del cliente
  type         TEXT NOT NULL,               -- text | order | otro
  body         TEXT,                        -- texto del mensaje o nota del carrito
  items        TEXT,                        -- JSON, solo carritos: [{retailer_id, qty, price_cents}]
  received_at  INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'pedido', 'descartado')),
  order_id     INTEGER REFERENCES orders(id) ON DELETE SET NULL
);
CREATE INDEX wa_messages_status ON wa_messages(status, received_at);
CREATE INDEX wa_messages_phone ON wa_messages(from_phone, received_at);

-- Id del producto en el catálogo de WhatsApp (Commerce Manager), para reconocer los carritos.
ALTER TABLE products ADD COLUMN wa_retailer_id TEXT;
