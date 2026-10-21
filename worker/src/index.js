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
    return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type, cf-access-jwt-assertion', 'access-control-max-age': '86400', vary: 'Origin' };
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
        return { productId, extraIds: JSON.stringify(extraIds), name: extraIds.length ? `${product.name} (extra: ${extraIds.map(id => product.extras[id].label.charAt(0).toLowerCase() + product.extras[id].label.slice(1)).join(', ')})` : product.name, quantity: line.quantity, unitCents, priceLabel: product.priceLabel || '' };
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
        // Spanish date, not UTC: orders placed between midnight and 01:00/02:00 would otherwise get the previous day's number.
        const orderDate = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).replaceAll('-', '');
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
    if (match && request.method === 'DELETE') {
        const result = await env.DB.prepare('DELETE FROM orders WHERE id = ? AND expires_at > ?').bind(match[1], new Date().toISOString()).run();
        return result.meta.changes === 1 ? json({ deleted: true }, 200, headers) : json({ error: 'No encontrado.' }, 404, headers);
    }
    return json({ error: 'No encontrado.' }, 404, headers);
}

const CMS_URL = 'https://app.pagescms.org/Alpha-Dvlpr/aarontxu-3d/main';

// Portada del panel; las futuras secciones de gestión se añaden como tarjetas en .tiles.
function adminHome() {
    return adminPage('Panel de administración', '', `<section class="card intro"><h2>Panel</h2><p>Pedidos de la web y productos del catálogo.</p></section><p id="error" class="notice" role="status" aria-live="polite"></p><div class="tiles"><section class="card tile"><h3>Pedidos</h3><p><strong id="new-orders" class="count">–</strong><br>nuevos por confirmar (sin contar los de prueba)</p><a class="button primary" href="/admin/orders">Ver pedidos</a></section><section class="card tile"><h3>Productos</h3><p>Altas, fotos, precios y textos del catálogo.</p><a class="button" href="${CMS_URL}" target="_blank" rel="noopener">Abrir Pages CMS ↗</a></section></div>`,
        `api('/api/admin/orders').then(({orders})=>{document.querySelector('#new-orders').textContent=orders.filter(order=>order.status==='pending'&&order.order_number.startsWith('P-')).length}).catch(error=>{document.querySelector('#error').textContent=error.message});`);
}

function adminOrders() {
    return adminPage('Gestión de pedidos', '<a class="back" href="/admin">‹ Panel</a>', `<section class="card intro"><h2>Pedidos web</h2><p>Consulta las solicitudes recibidas, cambia su estado o elimina pedidos de prueba y solicitudes canceladas.</p></section><p id="error" class="notice" role="status" aria-live="polite"></p><section id="orders" class="card orders" aria-label="Lista de pedidos"></section>`,
        `const statuses=${JSON.stringify([...STATUSES])},labels=${JSON.stringify(STATUS_LABELS)},ordersNode=document.querySelector('#orders'),errorNode=document.querySelector('#error');
function orderTotal(order){return order.items.every(item=>item.priceLabel)?'A consultar':money(order.total_cents/100)}
function detailFor(order){const panel=element('div','detail');const list=element('ul','items');for(const item of order.items){const row=element('li'),description=element('div'),name=element('div','item-name',item.name),meta=element('div','item-meta',item.priceLabel||money(item.unitCents/100)+' por unidad'),quantity=element('span','item-meta','Cantidad: '+item.quantity),subtotal=element('strong','subtotal',item.priceLabel?'A consultar':money(item.unitCents*item.quantity/100));description.append(name,meta);row.append(description,quantity,subtotal);list.append(row)}panel.append(list);const total=element('div','detail-total');total.append(element('span','',(order.items.some(item=>item.priceLabel)&&!order.items.every(item=>item.priceLabel)?'Subtotal estimado':'Total')+(order.no_publish?' · no publicar':'')),element('span','',orderTotal(order)));panel.append(total);return panel}
function render(orders){ordersNode.replaceChildren();if(!orders.length){ordersNode.append(element('p','empty','No hay pedidos activos.'));return}for(const order of orders){const article=element('article','order'),row=element('div','row'),toggle=element('button','toggle'),chevron=element('span','chevron','›');toggle.type='button';toggle.append(chevron,element('span','',order.order_number));toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Mostrar detalles de '+order.order_number);const date=element('span','date muted',new Date(order.created_at).toLocaleString('es-ES'));const total=element('strong','price',orderTotal(order));const actions=element('div','actions'),select=element('select');select.setAttribute('aria-label','Estado de '+order.order_number);for(const status of statuses){const option=element('option','',labels[status]);option.value=status;option.selected=status===order.status;select.append(option)}select.addEventListener('change',async()=>{select.disabled=true;try{await api('/api/admin/orders/'+order.id,{method:'PATCH',body:JSON.stringify({status:select.value})});errorNode.textContent=''}catch(error){errorNode.textContent=error.message;select.value=order.status}finally{select.disabled=false}});const remove=element('button','delete','Eliminar');remove.addEventListener('click',async()=>{if(!confirm('¿Eliminar definitivamente el pedido '+order.order_number+'? Esta acción no se puede deshacer.'))return;remove.disabled=true;try{await api('/api/admin/orders/'+order.id,{method:'DELETE'});errorNode.textContent='';loadOrders()}catch(error){errorNode.textContent=error.message;remove.disabled=false}});actions.append(select,remove);row.append(toggle,date,total,actions);article.append(row);toggle.addEventListener('click',async()=>{const expanded=toggle.getAttribute('aria-expanded')==='true';if(expanded){article.classList.remove('open');article.lastElementChild.remove();toggle.setAttribute('aria-expanded','false');return}toggle.setAttribute('aria-expanded','true');article.classList.add('open');toggle.disabled=true;try{article.append(detailFor(await api('/api/admin/orders/'+order.id)))}catch(error){article.append(element('p','notice',error.message))}finally{toggle.disabled=false}});ordersNode.append(article)}}
async function loadOrders(){ordersNode.setAttribute('aria-busy','true');try{const {orders}=await api('/api/admin/orders');render(orders);errorNode.textContent=''}catch(error){errorNode.textContent=error.message;ordersNode.replaceChildren(element('p','empty','No se pudieron cargar los pedidos.'))}finally{ordersNode.removeAttribute('aria-busy')}}loadOrders();`);
}

function adminPage(title, back, main, script) {
    return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#faf7f3"><title>${title} | Aarontxu 3D</title><script>let savedTheme;try{savedTheme=localStorage.getItem('theme')}catch{}document.documentElement.dataset.theme=savedTheme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script><style>
:root{color-scheme:light;--canvas:#faf7f3;--surface:#fff;--fill:#f2ede7;--ink:#1d1d1f;--muted:#636366;--line:#e2dcd4;--brand:#b8420a;--danger:#c81818}
:root[data-theme=dark]{color-scheme:dark;--canvas:#110f0e;--surface:#1d1b1a;--fill:#2c2927;--ink:#f5f5f7;--muted:#aca8a3;--line:#3e3a37;--brand:#fb923c;--danger:#ff6961}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}main{width:min(100% - 2rem,64rem);margin:0 auto;padding:2rem 0 4rem}header{position:sticky;top:0;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--canvas) 86%,transparent);backdrop-filter:blur(18px);z-index:1}header>div{width:min(100% - 2rem,64rem);margin:auto;padding:.8rem 0;display:flex;align-items:center;gap:1rem}h1{font-size:1.1rem;margin:0 auto 0 0}h2{font-size:1.8rem;margin:0 0 .4rem}p{color:var(--muted)}.card{background:var(--surface);border:1px solid var(--line);border-radius:1.5rem;box-shadow:0 8px 24px #0000000a;overflow:hidden}.intro{padding:1.5rem 1.7rem}.orders{margin-top:1rem}.order{border-top:1px solid var(--line)}.order:first-child{border-top:0}.row{display:grid;grid-template-columns:minmax(9rem,1.1fr) minmax(9rem,1fr) minmax(7rem,.8fr) minmax(10rem,1fr) auto;align-items:center;gap:.8rem;padding:1rem 1.2rem}.order.open>.row{background:var(--fill)}.toggle{display:flex;align-items:center;gap:.6rem;border:0;background:transparent;color:var(--brand);font:inherit;font-weight:700;text-align:left;cursor:pointer}.chevron{display:inline-block;transition:transform .18s}.open .chevron{transform:rotate(90deg)}.muted{color:var(--muted);font-size:.9rem}.price{font-weight:700}.actions{display:flex;align-items:center;gap:.5rem}select,button{min-height:2.75rem;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--ink);padding:.55rem .85rem;font:inherit}button{cursor:pointer}button:hover,select:hover{border-color:var(--brand)}.delete{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 35%,var(--line))}.detail{padding:1rem 1.2rem 1.3rem 3rem;background:var(--surface);border-top:1px solid var(--line)}.items{list-style:none;margin:0;padding:0}.items li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:1rem;padding:.7rem 0;border-bottom:1px solid var(--line)}.item-name{font-weight:600}.item-meta{color:var(--muted);font-size:.9rem}.detail-total{display:flex;justify-content:space-between;padding-top:1rem;font-weight:700}.notice{margin:1rem 0;color:var(--danger)}.empty{text-align:center;padding:2rem;color:var(--muted)}:focus-visible{outline:3px solid var(--brand);outline-offset:2px}@media(max-width:760px){main{padding-top:1.2rem}.row{grid-template-columns:1fr auto;gap:.65rem}.row>.date,.row>.price{grid-column:1}.row>.actions{grid-column:1/-1;display:grid;grid-template-columns:1fr auto}.row select{min-width:0;max-width:100%}.detail{padding-left:1rem}.items li{grid-template-columns:minmax(0,1fr) auto}.items li .item-meta{grid-column:1}.items li .subtotal{grid-column:2;grid-row:1/3;align-self:center}.intro{padding:1.25rem}}
.back{color:var(--brand);font-weight:700;text-decoration:none;min-height:2.75rem;display:inline-flex;align-items:center}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem}.tile{padding:1.5rem 1.7rem;display:flex;flex-direction:column;gap:.5rem}h3{font-size:1.25rem;margin:0}.tile p{margin:0 0 .5rem;flex:1}.count{font-size:2.5rem;line-height:1.1;color:var(--ink)}a.button{display:inline-flex;align-items:center;justify-content:center;align-self:flex-start;min-height:2.75rem;border:1px solid var(--line);border-radius:999px;padding:.55rem 1.1rem;color:var(--ink);font-weight:700;text-decoration:none}a.button:hover{border-color:var(--brand)}a.button.primary{background:var(--brand);border-color:var(--brand);color:var(--canvas)}
</style></head><body><header><div>${back}<h1>Aarontxu 3D <span class="muted">/ ${title}</span></h1><button id="theme" type="button" aria-label="Cambiar tema">◐</button></div></header><main>${main}</main><script>
const money=value=>Number(value||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'}),element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
document.querySelector('#theme').addEventListener('click',()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';try{localStorage.setItem('theme',dark?'dark':'light')}catch{}});
async function api(path,options={}){const response=await fetch(path,{...options,headers:{'content-type':'application/json'}});const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||'No se pudo completar la operación.');return body}
${script}
</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
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
            const adminView = { '/admin': adminHome, '/admin/': adminHome, '/admin/orders': adminOrders }[url.pathname];
            if (adminView) {
                if (!await accessEmail(request, env)) return new Response('No autorizado', { status: 401, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
                return adminView();
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
