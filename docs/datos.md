# Datos de la página de pedidos

Base de datos del Artifact `https://claude.ai/artifact/2Zx15uqfU1pAgLk9eht1QX` (capabilities `db` y `sample`).
Claude la lee y escribe con la herramienta `ArtifactData` usando esa URL.

## `menu/<id>`

| Campo | Tipo | Nota |
|---|---|---|
| `name` | string | Nombre que ve el cliente |
| `category` | `pan` \| `postres` \| `laminados` \| `temporada` | Sección |
| `price` | number | Precio de venta en MXN |
| `cost` | number \| null | Costo total (insumos + empaque + mano de obra) de la hoja de costeo |
| `order` | number | Orden en la lista |
| `active` | bool | `false` lo oculta de pedidos nuevos |
| `aliases` | string[] | Otras formas de pedirlo; las usa el lector de mensajes |
| `unit` | string? | Presentación, p. ej. "caja de 4" |

## `orders/<id>`

El id es `AAAAMMDD-xxxxxx` (fecha de captura + aleatorio). Los pedidos guardan copia de nombre, precio y costo
de cada producto, así que cambiar el menú no altera pedidos viejos.

| Campo | Tipo | Nota |
|---|---|---|
| `code` | string | Folio corto que ve el cliente, p. ej. `PN-7K2Q` |
| `customer`, `phone` | string | Teléfono opcional; 10 dígitos se asume +52 |
| `items` | `{id, name, qty, price, cost}[]` | |
| `subtotal`, `shipping`, `discount`, `total` | number | `total = subtotal + shipping − discount` |
| `deliveryDate` | `YYYY-MM-DD` | Define la semana del pedido |
| `paid`, `paymentMethod`, `paidAt` | bool, `transferencia`\|`efectivo`\|null, ISO | |
| `delivered`, `deliveredAt` | bool, ISO | |
| `notes`, `rawMessage` | string | `rawMessage` es el mensaje original pegado |
| `createdAt`, `updatedAt` | ISO | |
| `source` | `pagina` \| `claude` | Quién lo capturó |

## `config/app`

- `paymentNote`: texto que va al final del mensaje de cada pedido por cobrar (CLABE, instrucciones).
