# Operación

Tareas del día a día después de publicar. Los pasos para publicar por primera vez están en el [README](../README.md).

## Publicar cambios

```sh
npm test               # pruebas de la API
npm run deploy         # sube el Worker y public/
```

Si el cambio incluye una migración nueva, corre `npm run db:migrate:remote` **antes** de `npm run deploy`.
Si algo sale mal, Cloudflare guarda las versiones anteriores del Worker: Workers & Pages → panencia → Deployments →
elige una → Rollback. Revertir el Worker no revierte migraciones de la base.

## Personas

- **Agregar a alguien:** en el panel, Usuarios → Agregar persona, con una contraseña temporal. Pídele que la cambie en
  Mi cuenta.
- **Olvidó su contraseña:** Usuarios → Nueva contraseña. Se cierran sus sesiones abiertas.
- **Ya no trabaja contigo:** Usuarios → Desactivar. Sale de inmediato de todos sus dispositivos. Sus pedidos y su
  historial en la bitácora se conservan.
- **Te quedaste sin ningún admin**, o sin acceso: desde la terminal,
  `npm run crear-usuario -- --email tu@correo.com --nombre "Tú" --rol admin --remote`.
  Si el correo ya existe, restablece su contraseña, le da rol admin y lo reactiva.

## Respaldos

D1 guarda automáticamente el historial de la base (Time Travel): 7 días en el plan gratis y 30 en el de pago
(confirma los números actuales en la documentación de Cloudflare). Puedes regresarla a cualquier minuto de ese periodo:

```sh
npx wrangler d1 time-travel info panencia                              # marcador actual
npx wrangler d1 time-travel restore panencia --timestamp=2026-10-01T12:00:00Z
```

Restaurar reemplaza toda la base; lo que pasó después de esa hora se pierde.

Además, en el panel, **Mi cuenta → Descargar respaldo** baja un JSON con productos, clientes, pedidos y ajustes. Vale la
pena guardarlo una vez al mes fuera de Cloudflare. También puedes sacar un volcado SQL completo:

```sh
npx wrangler d1 export panencia --remote --output private/respaldo.sql
```

Guárdalo en `private/`, que no se sube a GitHub.

## Ver errores

Workers & Pages → panencia → Logs muestra cada petición y los errores del servidor (el proyecto tiene `observability`
activado en `wrangler.jsonc`). Desde la terminal: `npx wrangler tail`.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| "Demasiados intentos" al entrar | 5 contraseñas mal en 15 minutos. Espera 15 minutos o restablece la contraseña desde otra cuenta admin. |
| El panel dice "Tu sesión terminó" | La sesión venció (30 días sin entrar), cambiaron tu contraseña o te desactivaron. |
| "Origen no permitido" | Se intentó escribir desde otra página o dominio. Abre el panel desde su propia dirección. |
| No carga en `http://` | La cookie de sesión exige HTTPS. En producción Cloudflare lo pone solo; en local usa `npm run dev`. |
| La ganancia dice "hay productos sin costo" | Algún producto vendido esa semana no tiene costo en Menú y costos. Los pedidos ya guardados conservan el costo que había al venderse. |
