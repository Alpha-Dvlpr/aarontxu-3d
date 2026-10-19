const STATUSES = new Set(['pending', 'confirmed', 'paid', 'delivered', 'cancelled']);
const STATUS_LABELS = { pending: 'Pendiente', confirmed: 'Confirmado', paid: 'Pagado', delivered: 'Entregado', cancelled: 'Cancelado' };
const MAX_LINES = 30;
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
}

function cors(request, env) {
    const origin = request.headers.get('Origin');
    if (!origin) return request.method === 'GET' ? {} : null;
    const sameWorkerOrigin = origin === env.ALLOWED_WORKER_ORIGIN && origin === new URL(request.url).origin;
    if (origin !== env.ALLOWED_ORIGIN && !sameWorkerOrigin) return null;
    return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS', 'access-control-allow-headers': 'content-type, cf-access-jwt-assertion', 'access-control-max-age': '86400', vary: 'Origin' };
}

async function sha256(value) {
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value));
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function base64url(value) {
    return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function accessEmail(request, env) {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAILS) return null;
    try {
        const [head, body, signature] = token.split('.');
        const decode = value => JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')));
        const header = decode(head);
        const claims = decode(body);
        const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        const now = Date.now() / 1000;
        if (header.alg !== 'RS256' || !audiences.includes(env.ACCESS_AUD) || claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}` || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now)) || (claims.iat !== undefined && (!Number.isFinite(claims.iat) || claims.iat > now)) || typeof claims.email !== 'string' || !env.ADMIN_EMAILS.split(',').map(email => email.trim().toLowerCase()).includes(claims.email.toLowerCase())) return null;
        const keysResponse = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
        if (!keysResponse.ok) return null;
        const keys = await keysResponse.json();
        const jwk = keys.keys?.find(key => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig' && key.alg === 'RS256');
        if (!jwk) return null;
        const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        const signatureBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
        return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, encoder.encode(`${head}.${body}`)) ? claims.email : null;
    } catch {
        return null;
    }
}

async function loadCatalog(env) {
    const response = await fetch(env.CATALOG_URL, { cf: { cacheTtl: 300 } });
    if (!response.ok) throw new Error('catalog_unavailable');
    return response.json();
}

export function orderPrefix(environment) {
    return environment === 'development' ? 'T' : 'P';
}

export function formatOrderNumber(prefix, date, counter) {
    if (!['P', 'T'].includes(prefix) || !/^\d{8}$/.test(date) || !Number.isInteger(counter) || counter < 1) throw new Error('invalid_order_number');
    return `${prefix}-${date}/${counter}`;
}

export async function allocateOrderNumber(db, prefix, date) {
    const row = await db.prepare('INSERT INTO order_counters (prefix, order_date, counter) VALUES (?, ?, 1) ON CONFLICT(prefix, order_date) DO UPDATE SET counter = counter + 1 RETURNING counter').bind(prefix, date).first();
    if (!row) throw new Error('order_number_unavailable');
    return formatOrderNumber(prefix, date, row.counter);
}

export function priceOrder(lines, catalog) {
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES) throw new Error('invalid_lines');
    let totalCents = 0;
    const items = lines.map(line => {
        if (!line || typeof line.id !== 'string' || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw new Error('invalid_line');
        const [productId, ...extraIds] = line.id.split(':');
        const product = Object.hasOwn(catalog, productId) ? catalog[productId] : null;
        if (!product || new Set(extraIds).size !== extraIds.length || extraIds.some(id => !Object.hasOwn(product.extras, id))) throw new Error('invalid_product');
        const price = extraIds.reduce((sum, id) => sum + Number(product.extras[id].price), Number(product.price));
        if (!Number.isFinite(price) || price < 0) throw new Error('invalid_price');
        const unitCents = Math.round(price * 100);
        totalCents += unitCents * line.quantity;
        return { productId, extraIds: JSON.stringify(extraIds), name: extraIds.length ? `${product.name} (extra: ${extraIds.map(id => product.extras[id].label.toLowerCase()).join(', ')})` : product.name, quantity: line.quantity, unitCents, priceLabel: product.priceLabel || '' };
    });
    return { items, totalCents };
}

async function createOrder(request, env, headers) {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.lines) || typeof body.requestKey !== 'string' || !/^[0-9a-f-]{36}$/.test(body.requestKey)) return json({ error: 'Solicitud no válida.' }, 400, headers);
    if (typeof body.accessKey !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(body.accessKey)) return json({ error: 'Solicitud no válida.' }, 400, headers);
    if (typeof env.TURNSTILE_SECRET !== 'string' || !env.TURNSTILE_SECRET) return json({ error: 'El servicio de verificación no está configurado.' }, 503, headers);
    const now = Date.now();
    const requestHash = await sha256(JSON.stringify({ lines: body.lines, noPublish: body.noPublish === true }));
    const accessKeyHash = await sha256(body.accessKey);
    const existing = await env.DB.prepare('SELECT id, order_number, request_hash, access_key_hash FROM orders WHERE request_key = ?').bind(body.requestKey).first();
    if (existing) {
        if (existing.request_hash !== requestHash || existing.access_key_hash !== accessKeyHash) return json({ error: 'La referencia de envío ya se ha usado con otro contenido.' }, 409, headers);
        return json({ id: existing.id, orderNumber: existing.order_number, key: body.accessKey }, 200, headers);
    }
    const turnstile = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(body.turnstile || ''), remoteip: request.headers.get('CF-Connecting-IP') || '' }) }).then(response => response.json()).catch(() => null);
    const localTestTurnstile = env.ALLOW_TEST_TURNSTILE === 'true' && env.TURNSTILE_SECRET === '1x0000000000000000000000000000000AA' && env.TURNSTILE_HOSTNAME === 'localhost';
    const validTurnstile = turnstile?.success && (localTestTurnstile || (turnstile.hostname === env.TURNSTILE_HOSTNAME && turnstile.action === 'create_order'));
    if (!validTurnstile) return json({ error: 'No se pudo verificar la solicitud. Inténtalo de nuevo.' }, 403, headers);
    try {
        const catalog = await loadCatalog(env);
        const { items, totalCents } = priceOrder(body.lines, catalog);
        const expiresAt = new Date(now + 15 * 86400000).toISOString();
        const prefix = orderPrefix(env.ENVIRONMENT);
        const orderDate = new Date(now).toISOString().slice(0, 10).replaceAll('-', '');
        const itemsJson = JSON.stringify(items);
        // shortcut: a concurrent duplicate or failed insert leaves a gap in the day's counter, move both into one db.batch() if gaps ever matter.
        const orderNumber = await allocateOrderNumber(env.DB, prefix, orderDate);
        const created = await env.DB.prepare('INSERT INTO orders (order_number, request_key, request_hash, access_key_hash, no_publish, total_cents, items_json, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING RETURNING id, order_number')
            .bind(orderNumber, body.requestKey, requestHash, accessKeyHash, body.noPublish === true ? 1 : 0, totalCents, itemsJson, expiresAt).first();
        if (!created) {
            const duplicate = await env.DB.prepare('SELECT id, order_number, request_hash, access_key_hash FROM orders WHERE request_key = ?').bind(body.requestKey).first();
            if (!duplicate || duplicate.request_hash !== requestHash || duplicate.access_key_hash !== accessKeyHash) return json({ error: 'La referencia de envío ya se ha usado con otro contenido.' }, 409, headers);
            return json({ id: duplicate.id, orderNumber: duplicate.order_number, key: body.accessKey }, 200, headers);
        }
        return json({ id: created.id, orderNumber: created.order_number, key: body.accessKey }, 201, headers);
    } catch (error) {
        if (error.message.startsWith('invalid_')) return json({ error: 'La cesta contiene un producto o una cantidad no válida.' }, 400, headers);
        return json({ error: 'No se ha podido registrar el pedido. La cesta sigue guardada.' }, 503, headers);
    }
}

async function getOrder(id, key, env, headers) {
    if (!/^\d+$/.test(id) || typeof key !== 'string' || key.length < 32) return json({ error: 'No encontrado.' }, 404, headers);
    const order = await env.DB.prepare('SELECT id, order_number, status, no_publish, total_cents, items_json, created_at FROM orders WHERE id = ? AND access_key_hash = ? AND expires_at > ?').bind(id, await sha256(key), new Date().toISOString()).first();
    if (!order) return json({ error: 'No encontrado.' }, 404, headers);
    return json({ ...order, items: JSON.parse(order.items_json) }, 200, headers);
}

async function adminRequest(request, env, path, headers) {
    if (!await accessEmail(request, env)) return json({ error: 'No autorizado.' }, 401, headers);
    if (path === '/api/admin/orders' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT id, order_number, status, no_publish, total_cents, items_json, created_at FROM orders WHERE expires_at > ? ORDER BY id DESC LIMIT 200').bind(new Date().toISOString()).all();
        return json({ orders: results.map(order => ({ ...order, items: JSON.parse(order.items_json) })) }, 200, headers);
    }
    const match = path.match(/^\/api\/admin\/orders\/(\d+)$/);
    if (match && request.method === 'GET') {
        const order = await env.DB.prepare('SELECT id, order_number, status, no_publish, total_cents, items_json, created_at FROM orders WHERE id = ? AND expires_at > ?').bind(match[1], new Date().toISOString()).first();
        return order ? json({ ...order, items: JSON.parse(order.items_json) }, 200, headers) : json({ error: 'No encontrado.' }, 404, headers);
    }
    if (match && request.method === 'PATCH') {
        const body = await request.json().catch(() => null);
        if (!body || !STATUSES.has(body.status)) return json({ error: 'Estado no válido.' }, 400, headers);
        const result = await env.DB.prepare('UPDATE orders SET status = ? WHERE id = ? AND expires_at > ?').bind(body.status, match[1], new Date().toISOString()).run();
        return json({ updated: result.meta.changes === 1 }, 200, headers);
    }
    return json({ error: 'No encontrado.' }, 404, headers);
}

function adminPage() {
    return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Pedidos</title><style>body{font:16px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;color:#1d1d1f}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.7rem;border-bottom:1px solid #ddd}button,select{padding:.5rem}#error{color:#b91c1c}</style></head><body><main><h1>Pedidos web</h1><p id="error" role="status"></p><pre id="detail"></pre><table><thead><tr><th>Número</th><th>Fecha</th><th>Importe</th><th>Estado</th></tr></thead><tbody id="orders"></tbody></table></main><script>const api=async(path,options={})=>{const r=await fetch(path,{...options,headers:{'content-type':'application/json'}});if(!r.ok)throw Error('No se pudo completar la operación');return r.json()};const statuses=${JSON.stringify([...STATUSES])};const labels=${JSON.stringify(STATUS_LABELS)};api('/api/admin/orders').then(({orders})=>{document.querySelector('#orders').replaceChildren(...orders.map(o=>{const tr=document.createElement('tr');const id=document.createElement('td');id.textContent=o.order_number;id.tabIndex=0;id.className='order-id';id.style.cursor='pointer';id.setAttribute('role','button');id.setAttribute('aria-label','Ver pedido '+o.order_number);id.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showOrder(o.id)}};id.onclick=()=>showOrder(o.id);const date=document.createElement('td');date.textContent=new Date(o.created_at).toLocaleString('es-ES');const total=document.createElement('td');total.textContent=(o.total_cents/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});const state=document.createElement('td');const select=document.createElement('select');statuses.forEach(s=>{const opt=document.createElement('option');opt.value=s;opt.textContent=labels[s];opt.selected=s===o.status;select.append(opt)});select.addEventListener('change',()=>api('/api/admin/orders/'+o.id,{method:'PATCH',body:JSON.stringify({status:select.value})}).catch(e=>{document.querySelector('#error').textContent=e.message}));state.append(select);tr.append(id,date,total,state);return tr}))}).catch(e=>document.querySelector('#error').textContent=e.message);async function showOrder(id){try{const o=await api('/api/admin/orders/'+id);document.querySelector('#detail').textContent=JSON.stringify({number:o.order_number,noPublish:o.no_publish,items:o.items.map(i=>({product:i.name,quantity:i.quantity,subtotal:(i.unitCents*i.quantity/100).toFixed(2)}))},null,2)}catch(e){document.querySelector('#error').textContent=e.message}};</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const headers = cors(request, env);
        if (request.method === 'OPTIONS') return headers && headers['access-control-allow-origin'] ? new Response(null, { status: 204, headers }) : new Response(null, { status: 403 });
        if (url.pathname.startsWith('/api/') && !headers) return json({ error: 'Origen no permitido.' }, 403);
        try {
            if (url.pathname === '/api/orders' && request.method === 'POST') return await createOrder(request, env, headers);
            const orderMatch = url.pathname.match(/^\/api\/orders\/(\d+)$/);
            if (orderMatch && request.method === 'GET') return await getOrder(orderMatch[1], url.searchParams.get('key'), env, headers);
            if (url.pathname.startsWith('/api/admin/')) return await adminRequest(request, env, url.pathname, headers);
            if (url.pathname === '/admin' || url.pathname === '/admin/') {
                if (!await accessEmail(request, env)) return new Response('No autorizado', { status: 401, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
                return adminPage();
            }
            return json({ error: 'No encontrado.' }, 404);
        } catch {
            return json({ error: 'Error interno.' }, 500, headers || {});
        }
    },
    async scheduled(controller, env, ctx) {
        ctx.waitUntil(env.DB.prepare('DELETE FROM orders WHERE expires_at <= ?').bind(new Date().toISOString()).run());
    }
};
