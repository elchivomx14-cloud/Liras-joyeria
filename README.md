# Lira’s Joyería (Cloudflare Worker + base de datos D1)

- `public/` → la página y las fotos iniciales
- `src/worker.js` → el Worker: API, acceso con usuario y clave, y subida de fotos
- `schema.sql` → las tablas de la base de datos D1
- `wrangler.toml` → configuración (hay que pegar el ID de tu base de datos)

Usuario, clave y llave de sesión NO van en el repositorio. Se guardan como secretos en Cloudflare
(`ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET`).
