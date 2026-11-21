// Lira’s Joyería · Cloudflare Worker (API + base de datos D1)
const enc = new TextEncoder();
const J = (d, c = 200, h = {}) => new Response(JSON.stringify(d), { status: c, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h } });
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function same(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function session(req, env) {
  const c = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)sid=([^;]+)/); if (!c) return null;
  const [exp, sig] = c[1].split('.'); if (!exp || !sig || +exp < Date.now()) return null;
  return same(sig, await hmac(env.SESSION_SECRET, 'sid.' + exp)) ? c[1] : null;
}
const csrfOf = (env, sid) => hmac(env.SESSION_SECRET, 'csrf.' + sid);
async function guard(req, env) { const sid = await session(req, env); if (!sid) return null; return same(req.headers.get('X-CSRF') || '', await csrfOf(env, sid)) ? sid : null; }
const plain = (s, n) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, n);
function limpiar(j) {
  const o = { cats: {}, t: {}, cfg: {} };
  for (const k of ['cadenas', 'zarcillos', 'anillos', 'pulseras', 'billeteras', 'relojes']) {
    o.cats[k] = [];
    for (const p of (Array.isArray(j?.cats?.[k]) ? j.cats[k] : [])) {
      if (!p || !/^(img\/[A-Za-z0-9_.-]+|uploads\/[a-f0-9]{16}\.jpg)$/.test(String(p.s || ''))) continue;
      o.cats[k].push({ s: p.s, n: plain(p.n, 120) || 'Pieza', p: plain(p.p, 40) });
    }
  }
  for (const [i, v] of Object.entries(j?.t && typeof j.t === 'object' ? j.t : {})) {
    if (!/^\d+$/.test(i)) continue;
    o.t[i] = String(v).replace(/<(?!\/?(em|br)\b)[^>]*>/gi, '').replace(/<em\b[^>]*>/gi, '<em class="gold">').replace(/<br\b[^>]*>/gi, '<br>').slice(0, 3000);
  }
  let wa = String(j?.cfg?.wa || '').replace(/\D/g, ''), ig = String(j?.cfg?.ig || '');
  if (wa.length < 8 || wa.length > 15) wa = '56933931621';
  if (!/^https:\/\/[^\s"<>]+$/.test(ig)) ig = 'https://www.instagram.com/liras_joyeria/';
  o.cfg = { wa, ig };
  return o;
}
export default {
  async fetch(req, env) {
    const p = new URL(req.url).pathname;
    try {
      if (p === '/api/data' && req.method === 'GET') {
        const r = await env.DB.prepare('SELECT json FROM state WHERE id=1').first();
        return new Response(r ? r.json : 'null', { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      const m = p.match(/^\/uploads\/([a-f0-9]{16})\.jpg$/);
      if (m && req.method === 'GET') {
        const r = await env.DB.prepare('SELECT data FROM fotos WHERE id=?').bind(m[1]).first();
        if (!r) return new Response('No encontrada', { status: 404 });
        const bin = atob(r.data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return new Response(u, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
      }
      if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
      if (!env.SESSION_SECRET) return J({ error: 'Falta configurar SESSION_SECRET en Cloudflare' }, 500);
      if (p === '/api/me') { const sid = await session(req, env); return J({ admin: !!sid, csrf: sid ? await csrfOf(env, sid) : null, ready: !!(env.ADMIN_USER && env.ADMIN_PASSWORD) }); }
      if (req.method !== 'POST') return J({ error: 'Método no permitido' }, 405);
      if (p === '/api/login') {
        if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return J({ error: 'Falta configurar ADMIN_USER y ADMIN_PASSWORD en Cloudflare' }, 400);
        const ip = req.headers.get('CF-Connecting-IP') || 'x', now = Date.now();
        const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM intentos WHERE ip=? AND ts>?').bind(ip, now - 900000).first();
        if (c && c.c >= 8) return J({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429);
        let b = {}; try { b = await req.json(); } catch { }
        const k = env.SESSION_SECRET;
        const okU = same(await hmac(k, String(b.u || '')), await hmac(k, env.ADMIN_USER));
        const okP = same(await hmac(k, String(b.p || '')), await hmac(k, env.ADMIN_PASSWORD));
        if (okU && okP) {
          const exp = now + 8 * 3600 * 1000, sid = exp + '.' + await hmac(k, 'sid.' + exp);
          return J({ ok: 1, csrf: await csrfOf(env, sid) }, 200, { 'Set-Cookie': `sid=${sid}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` });
        }
        await env.DB.prepare('INSERT INTO intentos(ip,ts) VALUES(?,?)').bind(ip, now).run();
        await env.DB.prepare('DELETE FROM intentos WHERE ts<?').bind(now - 86400000).run();
        return J({ error: 'Usuario o clave incorrectos' }, 401);
      }
      if (p === '/api/logout') return J({ ok: 1 }, 200, { 'Set-Cookie': 'sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
      if (p === '/api/save') {
        if (!await guard(req, env)) return J({ error: 'Sesión no válida. Entra de nuevo.' }, 403);
        const raw = await req.text(); if (raw.length > 2e6) return J({ error: 'Datos demasiado grandes' }, 413);
        let j; try { j = JSON.parse(raw); } catch { return J({ error: 'Datos no válidos' }, 400); }
        const o = limpiar(j);
        await env.DB.prepare('INSERT INTO state(id,json,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,updated_at=excluded.updated_at').bind(JSON.stringify(o), Date.now()).run();
        const used = new Set(Object.values(o.cats).flat().map(x => x.s));
        const old = await env.DB.prepare('SELECT id FROM fotos WHERE ts<?').bind(Date.now() - 3600000).all();
        const del = (old.results || []).filter(r => !used.has('uploads/' + r.id + '.jpg')).map(r => env.DB.prepare('DELETE FROM fotos WHERE id=?').bind(r.id));
        if (del.length) await env.DB.batch(del);
        return J({ ok: 1 });
      }
      if (p === '/api/upload') {
        if (!await guard(req, env)) return J({ error: 'Sesión no válida. Entra de nuevo.' }, 403);
        const f = (await req.formData()).get('f');
        if (!f || typeof f === 'string') return J({ error: 'Foto no válida' }, 400);
        if (f.size > 1.4e6) return J({ error: 'Foto muy pesada' }, 413);
        const u = new Uint8Array(await f.arrayBuffer());
        if (!(u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF)) return J({ error: 'Solo se aceptan fotos JPG' }, 400);
        let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
        const id = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
        await env.DB.prepare('INSERT INTO fotos(id,data,ts) VALUES(?,?,?)').bind(id, btoa(s), Date.now()).run();
        return J({ url: 'uploads/' + id + '.jpg' });
      }
      return J({ error: 'No encontrado' }, 404);
    } catch (e) { return J({ error: 'Error del servidor' }, 500); }
  }
};
