# Panencia Sales System

Panel de administración de Panencia: pedidos, cobros, clientes, lista de horneado, ventas por semana
y costos y márgenes por producto. Tiene usuarios con contraseña y dos roles.

Corre en **Cloudflare Workers** con base de datos **D1** (SQLite). Sin frameworks ni build: el
backend es `src/`, el panel es `public/`.

## Documentación

- [Stack y decisiones](docs/stack.md): qué tecnologías usa, por qué no hay framework y cuándo convendría uno.
- [API](docs/api.md): todas las rutas, permisos y formato de los datos.
- [Base de datos](docs/base-de-datos.md): tablas, convenciones y cómo cambiar el esquema.
- [Operación](docs/operacion.md): publicar cambios, personas, respaldos, errores y problemas comunes.

## Qué hace

| Sección | Para qué |
|---|---|
| **Resumen** | Vendido, cobrado, por cobrar y ganancia de la semana; gráfica de las últimas 12 semanas; lista de horneado por día de entrega; qué deja cada panencio. |
| **Pedidos** | Pedidos por semana de entrega. Cobrado (transferencia/efectivo), entregado, mensaje para WhatsApp, editar, borrar. Filtro "Todo lo que me deben". |
| **Nuevo pedido** | Pegas el mensaje del cliente y se convierte en pedido. Precio especial por pedido (toca el precio). Envío, descuento, pago, notas. Al guardar arma el mensaje para WhatsApp. |
| **Clientes** | Se crean solos con los pedidos. Cuánto ha gastado cada quien, cuánto debe, su historial. |
| **Menú y costos** | Precios, costos, margen, qué está en venta, cómo lo piden, y el mensaje de pago. |
| **Usuarios** | Agregar personas, cambiar rol, desactivar, restablecer contraseña. |
| **Actividad** | Bitácora: quién creó, cobró, editó o borró qué. |
| **Mi cuenta** | Cambiar contraseña, descargar respaldo (JSON), cerrar sesión. |

**Roles**
- **Administración:** ve todo, incluidos costos, márgenes, usuarios y actividad.
- **Pedidos:** crea, edita y cobra pedidos; no ve costos ni puede borrar pedidos.

## Seguridad

- **Contraseñas:** se guardan con PBKDF2-SHA256 (100 000 iteraciones) y sal por usuario; mínimo 10 caracteres.
- **Sesión:** cookie `HttpOnly; Secure; SameSite=Strict` de 30 días. En la base solo se guarda el hash del token.
  Cambiar la contraseña o desactivar a alguien cierra sus sesiones.
- **Intentos de login:** 5 fallidos por correo e IP bloquean 15 minutos. El mensaje de error es el mismo exista o no el correo.
- **Escrituras:** toda escritura exige `Origin` del mismo sitio y cuerpo JSON.
- **Encabezados:** CSP estricta, sin scripts en línea, `X-Frame-Options: DENY` y HSTS (`public/_headers`).
- **Costos:** el servidor nunca manda costos a un usuario con rol Pedidos.
- **Datos del negocio:** costos, clientes y ventas viven solo en D1. **No van al repo:** `private/` está en `.gitignore`.

## Publicarlo (una sola vez)

Necesitas una cuenta de Cloudflare (el plan gratis alcanza) y Node 20 o más nuevo.

```sh
npm install
npx wrangler login                      # abre el navegador para autorizar
npx wrangler d1 create panencia         # copia el database_id que imprime…
#   …y pégalo en wrangler.jsonc, en "database_id"
npm run db:migrate:remote               # crea las tablas y el menú con precios
npx wrangler d1 execute panencia --remote --file private/seed-datos.sql   # costos y ventas (archivo privado, ver abajo)
npm run crear-usuario -- --email tu@correo.com --nombre "Camila" --rol admin --remote
npm run deploy                          # imprime la URL: https://panencia.<tu-cuenta>.workers.dev
```

`crear-usuario` pide la contraseña en la terminal. Después, las demás personas se agregan desde **Usuarios** en el panel.

Para usar tu dominio (por ejemplo `panel.prohibidoenestazona.com`): en Cloudflare, abre Workers & Pages → panencia →
Settings → Domains & Routes → Add → Custom domain.

### Datos privados

`private/seed-datos.sql` trae los costos de producción y las 13 ventas del 22 ago al 23 sep 2026.
No está en el repo; se comparte aparte. Ponlo en `private/` antes de correr el comando de arriba.

## Desarrollo

```sh
npm run db:migrate:local
npm run crear-usuario -- --email tu@correo.com --nombre "Tú" --rol admin
npm run dev                             # http://localhost:8787
npm test                                # pruebas de la API contra una base desechable
```

## Estructura

```
src/index.js      entrada del Worker: /api/* a la API, lo demás al panel
src/api.js        rutas: sesión, menú, pedidos, clientes, reportes, ajustes, usuarios, bitácora, respaldo
src/auth.js       contraseñas, sesiones, bloqueo por intentos, verificación de origen
src/http.js       respuestas y validación
migrations/       esquema D1 y menú inicial (precios de venta, sin costos)
public/           panel (index.html, app.js, app.css, _headers)
scripts/          crear-usuario.mjs; standalone.py genera la versión de la página vieja para otro sitio
test/             pruebas de la API
app/pedidos.html  primera versión (Artifact de Claude); queda como referencia
docs/             documentación
```

El dinero se guarda en centavos. Cada pedido guarda copia del nombre, precio y costo de cada producto, así que
cambiar el menú no altera pedidos viejos. Las semanas van de lunes a domingo y se cuentan por día de entrega.
