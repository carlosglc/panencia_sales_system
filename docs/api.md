# API

Todas las rutas viven bajo `/api/`, reciben y responden JSON, y están en `src/api.js`.

## Reglas generales

- **Sesión.** Todas piden una sesión válida (cookie `pn_session`), salvo `POST /api/login` y `POST /api/logout`.
  Sin sesión responden `401`.
- **Escrituras.** `POST`, `PUT`, `PATCH` y `DELETE` exigen el encabezado `Origin` igual al del sitio (si no, `403`) y
  `content-type: application/json` cuando llevan cuerpo (si no, `415`).
- **Dinero** siempre en **centavos** enteros (`price_cents: 8500` = $85). **Fechas de entrega** como `AAAA-MM-DD`.
  **Marcas de tiempo** en milisegundos.
- **Errores:** `{ "error": "mensaje en español" }` con el código HTTP que corresponde (`400` datos inválidos, `403`
  sin permiso, `404` no existe, `409` duplicado, `429` demasiados intentos).
- **Roles.** Las rutas marcadas **admin** responden `403` a un usuario con rol `staff`. Además, a `staff` nunca se le
  mandan `cost_cents`, `cost_cents` de los renglones ni `profit_cents`.

## Sesión y cuenta

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/login` | `{email, password}`. Pone la cookie y devuelve `{user}`. Tras 5 fallos en 15 min para ese correo e IP: `429`. |
| POST | `/api/logout` | Borra la sesión y la cookie. |
| GET | `/api/me` | `{user: {id, email, name, role}}`. |
| POST | `/api/me/password` | `{current, next}`. Cambia la contraseña (mínimo 10 caracteres) y cierra las demás sesiones. |

## Menú

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/products` | Lista del menú. `cost_cents` solo para admin. |
| POST | `/api/products` | **admin.** `{name, category, price_cents, cost_cents?, unit?, aliases?, active?}`. El id se genera del nombre. |
| PATCH | `/api/products/:id` | **admin.** Cualquiera de los campos anteriores, más `sort`. |

`category` es `pan`, `postres`, `laminados` o `temporada`. `aliases` es la lista de otras formas en que la gente
pide el producto; la usa el lector de mensajes del panel.

## Pedidos

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/orders` | Filtros opcionales: `from`, `to` (fecha de entrega), `unpaid=1`, `undelivered=1`, `customer=<id>`. |
| GET | `/api/orders/:id` | Un pedido. |
| POST | `/api/orders` | Crea un pedido (cuerpo abajo). Crea o actualiza al cliente por nombre. |
| PUT | `/api/orders/:id` | Reemplaza el pedido con el mismo cuerpo. Conserva folio, fecha de pago y costos originales. |
| POST | `/api/orders/:id/status` | `{paid?, payment_method?, delivered?}`. Marcar cobrado o entregado, o deshacerlo. |
| DELETE | `/api/orders/:id` | **admin.** Borra el pedido y sus renglones. |

Cuerpo de `POST` y `PUT`:

```json
{
  "customer": { "name": "Suku", "phone": "5512345678" },
  "items": [
    { "product_id": "hogaza-natural", "qty": 2 },
    { "product_id": "molde-honey", "qty": 1, "price_cents": 8000 }
  ],
  "delivery_date": "2026-09-26",
  "shipping_cents": 3000,
  "discount_cents": 0,
  "notes": "Rebanado",
  "raw_message": "texto original del cliente",
  "paid": false,
  "payment_method": null
}
```

- Si un renglón no trae `price_cents`, se usa el precio del menú; si lo trae, es un precio especial solo para ese pedido.
- El **costo** de cada renglón lo pone el servidor con el costo del menú en ese momento y ya no cambia.
- `total = subtotal + envío − descuento`, calculado en el servidor.
- `payment_method` es `transferencia` o `efectivo`, obligatorio si `paid` es `true`.

Un pedido se devuelve así:

```json
{
  "id": 14, "code": "PN-0K3ZQ",
  "customer": { "id": 3, "name": "Suku", "phone": "5512345678" },
  "delivery_date": "2026-09-26",
  "items": [{ "product_id": "hogaza-natural", "name": "Hogaza Natural", "qty": 2, "price_cents": 8500, "cost_cents": 2136 }],
  "subtotal_cents": 17000, "shipping_cents": 3000, "discount_cents": 0, "total_cents": 20000,
  "notes": "", "raw_message": null,
  "paid": false, "payment_method": null, "paid_at": null,
  "delivered": false, "delivered_at": null,
  "source": "panel", "created_at": 1790400000000, "updated_at": 1790400000000
}
```

## Clientes

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/customers` | Clientes con `orders`, `spent_cents`, `owed_cents` y `last_order`. |
| PATCH | `/api/customers/:id` | `{name?, phone?, notes?}`. `409` si el nombre ya existe. |

## Reportes

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/reports/week?start=AAAA-MM-DD` | La semana (lunes a domingo) que contiene `start`; sin `start`, la actual en hora de la Ciudad de México. Devuelve `totals`, `bake` (piezas por producto y día), `days` y `owed`. |
| GET | `/api/reports/weeks?n=12` | Totales de las últimas `n` semanas (máximo 104). |
| GET | `/api/reports/products?from&to` | **admin.** Por producto: piezas, venta, costo, ganancia y piezas sin costo. |

`totals` trae `orders`, `sold_cents`, `collected_cents`, `owed_cents` y `pieces`; para admin también `cost_cents`,
`profit_cents` y `missing_cost` (hay renglones sin costo capturado).

## Ajustes, usuarios, bitácora y respaldo

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/settings` | `{settings: {payment_note}}`. |
| PUT | `/api/settings` | **admin.** `{payment_note}`: el texto que va al final del mensaje de cada pedido por cobrar. |
| GET | `/api/users` | **admin.** Usuarios con su último acceso. |
| POST | `/api/users` | **admin.** `{email, name, role, password}`. |
| PATCH | `/api/users/:id` | **admin.** `{name?, role?, disabled?, password?}`. No puedes cambiar tu propio rol ni desactivarte. Desactivar o cambiar la contraseña cierra las sesiones de esa persona. |
| GET | `/api/audit?limit=100` | **admin.** Bitácora, lo más reciente primero (máximo 500). |
| GET | `/api/export` | **admin.** Respaldo JSON de productos, clientes, pedidos, renglones y ajustes. No incluye usuarios ni contraseñas. |
