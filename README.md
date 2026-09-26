# Panencia Sales System

Registro de pedidos y ventas de Panencia. El pedido es la base de datos: cada orden se crea en la página
(o la crea Claude desde el chat), se manda al cliente por WhatsApp y después se marca como pagada y entregada.

**Página:** https://claude.ai/artifact/2Zx15uqfU1pAgLk9eht1QX (privada; compártela desde el menú Compartir de la página)

## Qué hace

| Pestaña | Para qué |
|---|---|
| **Nuevo** | Eliges cliente, tocas productos, día de entrega, envío/descuento y si ya pagó. También puedes pegar el mensaje del cliente y se convierte en pedido. Al guardar genera el mensaje para WhatsApp (copiar o abrir WhatsApp). |
| **Pedidos** | Pedidos de la semana por día de entrega. Botones: Cobrado (transferencia/efectivo), Entregado, Mensaje, WhatsApp, Editar, Borrar. Filtro "Todo lo que me deben". |
| **Semana** | Vendido, cobrado, por cobrar, ganancia estimada, lista de horneado (piezas por producto y día) y últimas 8 semanas. |
| **Menú** | Precios, costos, formas en que te piden cada producto, qué está en venta, y el mensaje de pago que va al final de cada pedido. |

Las semanas van de lunes a domingo y se cuentan por **día de entrega**.

## Archivos

- `app/pedidos.html` — código de la página (se publica como Artifact en la URL de arriba).
- `data/menu-seed.json` — menú inicial con precios de venta. Los costos no están en el repo porque es público; viven solo en la base de datos privada de la página.
- `docs/datos.md` — estructura de la base de datos, para leerla o escribirla desde Claude.
