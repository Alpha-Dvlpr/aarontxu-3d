# Worker de pedidos — configuración antes del despliegue

La web está en GitHub Pages. El código del Worker y del panel vive en este mismo repositorio, pero la ejecución y los pedidos se alojan en la cuenta Cloudflare. El repositorio público solo lleva código y configuración no secreta; nunca guardar pedidos, contraseñas, claves ni tokens en Git. No publicar el Worker hasta completar estos pasos. La URL del cliente contiene una clave de acceso: evita copiarla en canales públicos; la página y el Worker aplican `no-referrer` para reducir filtraciones accidentales.

1. Crear D1 `aarontxu-3d-orders`, copiar su UUID en `wrangler.toml` y aplicar `worker/migrations/0001_initial.sql`.
2. Instalar dependencias en `worker/` y desplegar con Wrangler.
3. Crear Turnstile para `3d.aarontxu.com`; poner su site key en `pages/cart.html` y configurar `TURNSTILE_SECRET` como secreto del Worker.
4. Crear Cloudflare Access para proteger `/admin*` y `/api/admin*` en el hostname del Worker, permitir solo la cuenta administrativa, y configurar `ADMIN_EMAILS`, `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` del Worker. Proteger ambas rutas es necesario: el navegador carga el panel y llama a la API desde el mismo origen. La página administrativa operativa se sirve solo desde el Worker (`/admin`); `pages/admin.html` en GitHub Pages es una página informativa y no consulta la API.
5. Configurar dominio API/panel y los valores `data-order-api` (`pages/cart.html`), `data-api` (`pages/order.html`), `CATALOG_URL` y `ALLOWED_ORIGIN`. Si el panel se abre en el hostname del Worker, incluir `ALLOWED_WORKER_ORIGIN` con ese mismo origen. CORS solo habilita llamadas desde la web pública o el mismo origen del Worker. DNS actual de `3d.aarontxu.com` ya apunta a GitHub Pages tras nameservers de Cloudflare; verificar todos los registros antes de cualquier cambio. No alterar DNS sin aprobación explícita.
6. Probar el API, el panel protegido, acceso a orden con clave, limpieza tras 15 días y uso de WhatsApp con órdenes de prueba antes de producción.

Los pedidos se eliminan a los 15 días en todos los estados. La numeración de pedido es independiente de cualquier factura. La cuenta debe revisar que este plazo es compatible con sus obligaciones comerciales y de facturación, y mover la información necesaria al registro/factura antes de expirar si procede.
