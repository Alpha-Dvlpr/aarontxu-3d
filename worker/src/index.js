const STATUSES = new Set(['pending', 'confirmed', 'paid', 'delivered', 'cancelled']);
const STATUS_LABELS = { pending: 'Pendiente', confirmed: 'Confirmado', paid: 'Pagado', delivered: 'Entregado', cancelled: 'Cancelado' };
const SALE_STATUSES = new Set(['in_progress', 'pending_shipping', 'delivered', 'cancelled']);
const SALE_STATUS_LABELS = { in_progress: 'En curso', pending_shipping: 'Pendiente de envío', delivered: 'Entregado', cancelled: 'Cancelado' };
// Solo existe en las ventas, nunca en la web. Los códigos del catálogo no cambian: las ventas los referencian.
const PROVISIONAL_PRODUCT = { PROD_99: { name: 'Personalizado (provisional)', price: 0, priceLabel: '', extras: {} } };
const MAX_LINES = 30;
const MAX_CENTS = 10000000;
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

// Web orders use CATALOG_URL (available products only); sales use SALES_CATALOG_URL, which also lists the unavailable ones.
async function loadCatalog(env, url = env.CATALOG_URL) {
    const response = await fetch(url, { cf: { cacheTtl: 300 } });
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

const validCents = value => Number.isInteger(value) && value >= 0 && value <= MAX_CENTS;
const validText = (value, max) => typeof value === 'string' && value.length <= max;

export function parseCustomer(body) {
    if (!body || !validText(body.name, 100) || !body.name.trim() || !validText(body.phone ?? '', 30) || (body.publish !== undefined && typeof body.publish !== 'boolean')) throw new Error('invalid_customer');
    return { name: body.name.trim(), phone: (body.phone ?? '').trim(), publish: body.publish === false ? 0 : 1 };
}

// Copies each line's name and price into the sale, so later catalog changes never alter past sales.
export function buildSale(body, catalog) {
    const validDate = date => {
        const parsed = new Date(`${date}T00:00:00Z`);
        return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
    };
    const date = body?.date;
    const deadline = body?.deadline ?? null;
    // A new sale always has a customer, existing or new; it only becomes customerless when that customer is deleted.
    const customerId = body?.customerId;
    const newCustomer = body?.newCustomer === undefined ? null : parseCustomer(body.newCustomer);
    if (!validDate(date) || (deadline !== null && !validDate(deadline)) || !SALE_STATUSES.has(body.status) || !validCents(body.shippingCents) || !validCents(body.paidCents) || !validText(body.notes ?? '', 1000) || (newCustomer ? customerId !== undefined || !newCustomer.phone : !Number.isInteger(customerId))) throw new Error('invalid_sale');
    if (!Array.isArray(body.items) || body.items.some(item => item?.unitCents !== undefined && !validCents(item.unitCents))) throw new Error('invalid_line');
    const { items } = priceOrder(body.items.map(item => ({ id: item.id, quantity: item.quantity })), { ...catalog, ...PROVISIONAL_PRODUCT });
    return {
        sale: { customerId: customerId ?? null, newCustomer, date, deadline, status: body.status, shippingCents: body.shippingCents, paidCents: body.paidCents, notes: (body.notes ?? '').trim() },
        items: items.map((item, index) => ({ productId: item.productId, name: item.name, quantity: item.quantity, unitCents: body.items[index].unitCents ?? item.unitCents }))
    };
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
    try {
        const response = await salesRequest(request, env, path, headers);
        if (response) return response;
    } catch (error) {
        if (error.message.startsWith('invalid_')) return json({ error: 'Revisa los datos: hay un campo vacío o no válido.' }, 400, headers);
        if (error.message === 'catalog_unavailable') return json({ error: 'No se ha podido cargar el catálogo.' }, 503, headers);
        throw error;
    }
    return json({ error: 'No encontrado.' }, 404, headers);
}

// Ventas reales y clientes: tablas sin caducidad, separadas de los pedidos web de 15 días.
async function salesRequest(request, env, path, headers) {
    const method = request.method;
    const body = ['POST', 'PATCH'].includes(method) ? await request.json().catch(() => null) : null;
    const notFound = () => json({ error: 'No encontrado.' }, 404, headers);
    if (path === '/api/admin/catalog' && method === 'GET') return json({ catalog: { ...await loadCatalog(env, env.SALES_CATALOG_URL), ...PROVISIONAL_PRODUCT } }, 200, headers);
    if (path === '/api/admin/customers' && method === 'GET') {
        const { results } = await env.DB.prepare(`SELECT c.id, c.name, c.phone, c.publish, COUNT(s.id) AS orders, COALESCE(SUM(s.total_cents), 0) AS total_cents, COALESCE(SUM(s.paid_cents), 0) AS paid_cents
            FROM customers c LEFT JOIN (SELECT id, customer_id, paid_cents, shipping_cents + COALESCE((SELECT SUM(quantity * unit_cents) FROM sale_items WHERE sale_id = sales.id), 0) AS total_cents FROM sales WHERE status != 'cancelled') s ON s.customer_id = c.id
            GROUP BY c.id ORDER BY c.name COLLATE NOCASE`).all();
        return json({ customers: results }, 200, headers);
    }
    if (path === '/api/admin/customers' && method === 'POST') {
        const customer = parseCustomer(body);
        const row = await env.DB.prepare('INSERT INTO customers (name, phone, publish) VALUES (?, ?, ?) RETURNING id').bind(customer.name, customer.phone, customer.publish).first();
        return json({ id: row.id }, 201, headers);
    }
    const customerMatch = path.match(/^\/api\/admin\/customers\/(\d+)$/);
    if (customerMatch && method === 'PATCH') {
        const customer = parseCustomer(body);
        const result = await env.DB.prepare('UPDATE customers SET name = ?, phone = ?, publish = ? WHERE id = ?').bind(customer.name, customer.phone, customer.publish, customerMatch[1]).run();
        return result.meta.changes === 1 ? json({ updated: true }, 200, headers) : notFound();
    }
    if (customerMatch && method === 'DELETE') {
        // Explicit SET NULL as well as the foreign key: the sales stay, anonymous.
        const [, deleted] = await env.DB.batch([env.DB.prepare('UPDATE sales SET customer_id = NULL WHERE customer_id = ?').bind(customerMatch[1]), env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(customerMatch[1])]);
        return deleted.meta.changes === 1 ? json({ deleted: true }, 200, headers) : notFound();
    }
    if (path === '/api/admin/sales' && method === 'GET') {
        const { results } = await env.DB.prepare(`SELECT s.id, s.customer_id, c.name AS customer_name, s.sale_date, s.deadline, s.status, s.shipping_cents, s.paid_cents, s.notes,
            (SELECT json_group_array(json_object('productId', product_id, 'name', name, 'quantity', quantity, 'unitCents', unit_cents)) FROM sale_items WHERE sale_id = s.id) AS items_json
            FROM sales s LEFT JOIN customers c ON c.id = s.customer_id ORDER BY s.sale_date DESC, s.id DESC LIMIT 500`).all();
        return json({ sales: results.map(({ items_json, ...sale }) => {
            const items = JSON.parse(items_json);
            return { ...sale, items, total_cents: sale.shipping_cents + items.reduce((sum, item) => sum + item.quantity * item.unitCents, 0) };
        }) }, 200, headers);
    }
    if (path === '/api/admin/sales' && method === 'POST') {
        const { sale, items } = buildSale(body, await loadCatalog(env, env.SALES_CATALOG_URL));
        const customer = sale.newCustomer;
        if (!customer && !await env.DB.prepare('SELECT 1 FROM customers WHERE id = ?').bind(sale.customerId).first()) return json({ error: 'El cliente ya no existe.' }, 400, headers);
        // A D1 batch is one transaction, so MAX(id) is the customer or sale inserted just before; if the sale fails, the new customer is not kept either.
        const createCustomer = customer ? [env.DB.prepare('INSERT INTO customers (name, phone, publish) VALUES (?, ?, ?)').bind(customer.name, customer.phone, customer.publish)] : [];
        const results = await env.DB.batch([
            ...createCustomer,
            env.DB.prepare('INSERT INTO sales (customer_id, sale_date, deadline, status, shipping_cents, paid_cents, notes) VALUES (COALESCE(?, (SELECT MAX(id) FROM customers)), ?, ?, ?, ?, ?, ?) RETURNING id').bind(sale.customerId, sale.date, sale.deadline, sale.status, sale.shippingCents, sale.paidCents, sale.notes),
            ...items.map(item => env.DB.prepare('INSERT INTO sale_items (sale_id, product_id, name, quantity, unit_cents) SELECT MAX(id), ?, ?, ?, ? FROM sales').bind(item.productId, item.name, item.quantity, item.unitCents))
        ]);
        return json({ id: results[createCustomer.length].results[0].id }, 201, headers);
    }
    if (path === '/api/admin/summary' && method === 'GET') {
        // Overpaid sales count as 0 pending so they do not hide other customers' debts; sales of deleted customers group under a null name.
        const { results } = await env.DB.prepare(`SELECT c.name, c.phone, SUM(s.paid_cents) AS paid_cents, SUM(MAX(s.total_cents - s.paid_cents, 0)) AS pending_cents
            FROM (SELECT customer_id, paid_cents, shipping_cents + COALESCE((SELECT SUM(quantity * unit_cents) FROM sale_items WHERE sale_id = sales.id), 0) AS total_cents FROM sales WHERE status != 'cancelled') s
            LEFT JOIN customers c ON c.id = s.customer_id GROUP BY s.customer_id ORDER BY pending_cents DESC`).all();
        const sum = key => results.reduce((total, row) => total + row[key], 0);
        return json({ paid_cents: sum('paid_cents'), pending_cents: sum('pending_cents'), debtors: results.filter(row => row.pending_cents > 0).map(({ name, phone, pending_cents }) => ({ name, phone, pending_cents })) }, 200, headers);
    }
    const saleMatch = path.match(/^\/api\/admin\/sales\/(\d+)$/);
    if (saleMatch && method === 'PATCH') {
        if (!body || (body.status === undefined && body.paidCents === undefined) || (body.status !== undefined && !SALE_STATUSES.has(body.status)) || (body.paidCents !== undefined && !validCents(body.paidCents))) throw new Error('invalid_sale');
        const result = await env.DB.prepare('UPDATE sales SET status = COALESCE(?, status), paid_cents = COALESCE(?, paid_cents) WHERE id = ?').bind(body.status ?? null, body.paidCents ?? null, saleMatch[1]).run();
        return result.meta.changes === 1 ? json({ updated: true }, 200, headers) : notFound();
    }
    if (saleMatch && method === 'DELETE') {
        const [, deleted] = await env.DB.batch([env.DB.prepare('DELETE FROM sale_items WHERE sale_id = ?').bind(saleMatch[1]), env.DB.prepare('DELETE FROM sales WHERE id = ?').bind(saleMatch[1])]);
        return deleted.meta.changes === 1 ? json({ deleted: true }, 200, headers) : notFound();
    }
    return null;
}

const CMS_URL = 'https://app.pagescms.org/Alpha-Dvlpr/aarontxu-3d/main';

// Portada del panel; las futuras secciones de gestión se añaden como tarjetas en .tiles.
function adminHome() {
    return adminPage('Panel de administración', '', `<section class="card intro"><h2>Panel</h2><p>Pedidos de la web y productos del catálogo.</p></section><p id="error" class="notice" role="status" aria-live="polite"></p><div class="tiles"><section class="card tile"><h3>Global</h3><p><strong id="paid-total" class="count">–</strong><br>cobrado de las ventas no canceladas</p></section><section class="card tile"><h3>Por pagar</h3><p><strong id="pending-total" class="count">–</strong><br>pendiente de cobro en las ventas no canceladas</p><button id="show-debtors" class="primary" type="button" hidden>Ver clientes con deudas</button></section><section class="card tile"><h3>Pedidos</h3><p><strong id="new-orders" class="count">–</strong><br>nuevos por confirmar (sin contar los de prueba)</p><a class="button primary" href="/admin/orders">Ver pedidos</a></section><section class="card tile"><h3>Ventas</h3><p>Pedidos reales y confirmados. No caducan.</p><a class="button primary" href="/admin/sales">Ver ventas</a></section><section class="card tile"><h3>Clientes</h3><p>Contacto, pedidos y deuda de cada cliente.</p><a class="button primary" href="/admin/customers">Ver clientes</a></section><section class="card tile"><h3>Productos</h3><p>Altas, fotos, precios y textos del catálogo.</p><a class="button" href="${CMS_URL}" target="_blank" rel="noopener">Abrir Pages CMS ↗</a></section></div><dialog id="debtors" aria-labelledby="debtors-title"><h3 id="debtors-title">Clientes con deudas</h3><ul id="debtors-list" class="items"></ul><div class="detail-total"><span>Total</span><span id="debtors-total"></span></div><form method="dialog" class="actions"><button class="primary">Cerrar</button></form></dialog>`,
        `const showError=error=>{document.querySelector('#error').textContent=error.message};api('/api/admin/orders').then(({orders})=>{document.querySelector('#new-orders').textContent=orders.filter(order=>order.status==='pending'&&order.order_number.startsWith('P-')).length}).catch(showError);const amount=(selector,cents,balance)=>{const node=document.querySelector(selector);node.textContent=money(cents/100);node.classList.add(balance>0?'positive':balance<0?'negative':'zero')};api('/api/admin/summary').then(summary=>{amount('#paid-total',summary.paid_cents,summary.paid_cents);/* What is owed counts against the balance, so any debt shows in red. */amount('#pending-total',summary.pending_cents,-summary.pending_cents);document.querySelector('#debtors-total').textContent=money(summary.pending_cents/100);const list=document.querySelector('#debtors-list'),button=document.querySelector('#show-debtors');for(const debtor of summary.debtors){const item=element('li'),who=element('div');who.append(element('div','item-name',debtor.name??'Sin cliente'));if(debtor.phone)who.append(element('div','item-meta',debtor.phone));item.append(who,element('span','subtotal',money(debtor.pending_cents/100)));list.append(item)}button.hidden=summary.pending_cents<=0;button.addEventListener('click',()=>document.querySelector('#debtors').showModal())}).catch(showError);`);
}

function adminOrders() {
    return adminPage('Gestión de pedidos', '<a class="back" href="/admin">‹ Panel</a>', `<section class="card intro"><h2>Pedidos web</h2><p>Consulta las solicitudes recibidas, cambia su estado o elimina pedidos de prueba y solicitudes canceladas.</p></section><p id="error" class="notice" role="status" aria-live="polite"></p><section id="orders" class="card orders" aria-label="Lista de pedidos"></section>`,
        `const statuses=${JSON.stringify([...STATUSES])},labels=${JSON.stringify(STATUS_LABELS)},ordersNode=document.querySelector('#orders'),errorNode=document.querySelector('#error');
function orderTotal(order){return order.items.every(item=>item.priceLabel)?'A consultar':money(order.total_cents/100)}
function detailFor(order){const panel=element('div','detail');const list=element('ul','items');for(const item of order.items){const row=element('li'),description=element('div'),name=element('div','item-name',item.name),meta=element('div','item-meta',item.priceLabel||money(item.unitCents/100)+' por unidad'),quantity=element('span','item-meta','Cantidad: '+item.quantity),subtotal=element('strong','subtotal',item.priceLabel?'A consultar':money(item.unitCents*item.quantity/100));description.append(name,meta);row.append(description,quantity,subtotal);list.append(row)}panel.append(list);const total=element('div','detail-total');total.append(element('span','',(order.items.some(item=>item.priceLabel)&&!order.items.every(item=>item.priceLabel)?'Subtotal estimado':'Total')+(order.no_publish?' · no publicar':'')),element('span','',orderTotal(order)));panel.append(total);return panel}
function render(orders){ordersNode.replaceChildren();if(!orders.length){ordersNode.append(element('p','empty','No hay pedidos activos.'));return}for(const order of orders){const article=element('article','order'),row=element('div','row'),toggle=element('button','toggle'),chevron=element('span','chevron','›');toggle.type='button';toggle.append(chevron,element('span','',order.order_number));toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Mostrar detalles de '+order.order_number);const date=element('span','date muted',new Date(order.created_at).toLocaleString('es-ES'));const total=element('strong','price',orderTotal(order));const actions=element('div','actions'),select=element('select');select.setAttribute('aria-label','Estado de '+order.order_number);for(const status of statuses){const option=element('option','',labels[status]);option.value=status;option.selected=status===order.status;select.append(option)}select.addEventListener('change',async()=>{select.disabled=true;try{await api('/api/admin/orders/'+order.id,{method:'PATCH',body:JSON.stringify({status:select.value})});errorNode.textContent=''}catch(error){errorNode.textContent=error.message;select.value=order.status}finally{select.disabled=false}});const remove=element('button','delete','Eliminar');remove.addEventListener('click',async()=>{if(!confirm('¿Eliminar definitivamente el pedido '+order.order_number+'? Esta acción no se puede deshacer.'))return;remove.disabled=true;try{await api('/api/admin/orders/'+order.id,{method:'DELETE'});errorNode.textContent='';loadOrders()}catch(error){errorNode.textContent=error.message;remove.disabled=false}});actions.append(select,remove);row.append(toggle,date,total,actions);article.append(row);toggle.addEventListener('click',async()=>{const expanded=toggle.getAttribute('aria-expanded')==='true';if(expanded){article.classList.remove('open');article.lastElementChild.remove();toggle.setAttribute('aria-expanded','false');return}toggle.setAttribute('aria-expanded','true');article.classList.add('open');toggle.disabled=true;try{article.append(detailFor(await api('/api/admin/orders/'+order.id)))}catch(error){article.append(element('p','notice',error.message))}finally{toggle.disabled=false}});ordersNode.append(article)}}
async function loadOrders(){ordersNode.setAttribute('aria-busy','true');try{const {orders}=await api('/api/admin/orders');render(orders);errorNode.textContent=''}catch(error){errorNode.textContent=error.message;ordersNode.replaceChildren(element('p','empty','No se pudieron cargar los pedidos.'))}finally{ordersNode.removeAttribute('aria-busy')}}loadOrders();`);
}

function adminCustomers() {
    return adminPage('Clientes', '<a class="back" href="/admin">‹ Panel</a>', `<section class="card intro"><h2>Clientes</h2><p>Los pedidos, el importe y la deuda salen de las ventas no canceladas. Al eliminar un cliente, sus ventas se conservan sin nombre.</p></section><p id="error" class="notice" role="status" aria-live="polite"></p><form id="form" class="card form"><h3 id="form-title">Nuevo cliente</h3><div class="grid"><label>Nombre<input id="name" required maxlength="100" autocomplete="off"></label><label>Teléfono<input id="phone" type="tel" maxlength="30" autocomplete="off"></label></div><label class="check"><input id="publish" type="checkbox" checked> Permite publicar las fotos de sus pedidos</label><div class="actions"><button class="primary" type="submit">Guardar</button><button id="cancel" type="button" hidden>Cancelar</button></div></form><section id="list" class="card list" aria-label="Lista de clientes"></section>`,
        `const form=document.querySelector('#form'),list=document.querySelector('#list'),errorNode=document.querySelector('#error'),cancel=document.querySelector('#cancel'),fields={name:document.querySelector('#name'),phone:document.querySelector('#phone'),publish:document.querySelector('#publish')};let editing=null;
function reset(){editing=null;form.reset();document.querySelector('#form-title').textContent='Nuevo cliente';cancel.hidden=true}
cancel.addEventListener('click',reset);
form.addEventListener('submit',async event=>{event.preventDefault();try{await api(editing?'/api/admin/customers/'+editing:'/api/admin/customers',{method:editing?'PATCH':'POST',body:JSON.stringify({name:fields.name.value,phone:fields.phone.value,publish:fields.publish.checked})});reset();errorNode.textContent='';load()}catch(error){errorNode.textContent=error.message}});
function render(customers){list.replaceChildren();if(!customers.length){list.append(element('p','empty','Todavía no hay clientes.'));return}const wrap=element('div','table-wrap'),table=element('table'),head=element('tr');for(const label of ['Nombre','Teléfono','Publicar','Pedidos','Importe','Pagado','Deuda',''])head.append(element('th','',label));table.append(head);for(const customer of customers){const row=element('tr'),debt=customer.total_cents-customer.paid_cents,actions=element('td'),buttons=element('div','actions'),edit=element('button','','Editar'),remove=element('button','delete','Eliminar');edit.type=remove.type='button';edit.addEventListener('click',()=>{editing=customer.id;fields.name.value=customer.name;fields.phone.value=customer.phone;fields.publish.checked=customer.publish===1;document.querySelector('#form-title').textContent='Editar cliente';cancel.hidden=false;fields.name.focus()});remove.addEventListener('click',async()=>{if(!confirm('¿Eliminar a '+customer.name+'? Sus ventas se conservan sin nombre.'))return;try{await api('/api/admin/customers/'+customer.id,{method:'DELETE'});if(editing===customer.id)reset();load()}catch(error){errorNode.textContent=error.message}});buttons.append(edit,remove);actions.append(buttons);row.append(element('td','',customer.name),element('td','',customer.phone),element('td','',customer.publish?'Sí':'No'),element('td','num',String(customer.orders)),element('td','num',money(customer.total_cents/100)),element('td','num',money(customer.paid_cents/100)),element('td','num'+(debt>0?' debt':''),money(debt/100)),actions);table.append(row)}wrap.append(table);list.append(wrap)}
async function load(){try{render((await api('/api/admin/customers')).customers)}catch(error){errorNode.textContent=error.message}}load();`);
}

function adminSales() {
    return adminPage('Ventas', '<a class="back" href="/admin">‹ Panel</a>', `<section class="card intro"><h2>Ventas</h2><p>Pedidos reales y confirmados. Cada línea guarda el nombre y el precio del día de la venta, así que cambiar el catálogo no altera las ventas pasadas. PROD_99 es el personalizado provisional.</p></section><p id="error" class="notice" role="status" aria-live="polite"></p><form id="form" class="card form"><h3>Nueva venta</h3><div class="grid"><label>Cliente<select id="customer" required><option value="" selected disabled>Elige un cliente</option><option value="new">Nuevo cliente</option></select></label><label>Fecha<input id="date" type="date" required></label><label>Estado<select id="status"></select></label></div><fieldset id="new-customer" hidden disabled><legend>Nuevo cliente</legend><div class="grid"><label>Nombre<input id="new-name" required maxlength="100" autocomplete="off"></label><label>Teléfono<input id="new-phone" type="tel" required maxlength="30" autocomplete="off"></label></div></fieldset><fieldset><legend>Productos</legend><div id="lines"></div><button id="add-line" type="button">Añadir producto</button></fieldset><div class="grid"><label>Envío (€)<input id="shipping" type="number" min="0" step="0.01" value="0"></label><label>Pagado (€)<input id="paid" type="number" min="0" step="0.01" value="0"></label></div><label>Notas<textarea id="notes" maxlength="1000" rows="2"></textarea></label><label class="check"><input id="has-deadline" type="checkbox"> Añadir fecha límite</label><label id="deadline-box" hidden>Fecha límite<input id="deadline" type="date" required disabled></label><div class="actions"><strong id="form-total">Total: 0,00 €</strong><button class="primary" type="submit">Guardar venta</button></div></form><section id="list" class="card list" aria-label="Lista de ventas"></section><dialog id="detail" aria-labelledby="detail-title"><h3 id="detail-title"></h3><ul id="detail-items" class="items"></ul><div id="detail-extra"></div><div class="detail-total"><span>Total</span><span id="detail-total"></span></div><form method="dialog" class="actions"><button class="primary">Cerrar</button></form></dialog>`,
        `const statuses=${JSON.stringify([...SALE_STATUSES])},labels=${JSON.stringify(SALE_STATUS_LABELS)},form=document.querySelector('#form'),lines=document.querySelector('#lines'),list=document.querySelector('#list'),errorNode=document.querySelector('#error'),field=id=>document.querySelector('#'+id),cents=input=>Math.round(Number(input.value||0)*100),today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Madrid'}),dateText=value=>new Date(value+'T12:00:00').toLocaleDateString('es-ES'),groups=new Map();
for(const status of statuses){const option=element('option','',labels[status]);option.value=status;field('status').append(option)}
function updateTotal(){let total=cents(field('shipping'));for(const line of lines.children)total+=cents(line.querySelector('.unit'))*Number(line.querySelector('.qty').value||0);field('form-total').textContent='Total: '+money(total/100)}
function placeholder(text){const node=element('option','',text);node.value='';node.disabled=node.selected=true;return node}
/* Like the web: product, then its option if it has any, then the extras as checkboxes. line.dataset.id is the id the Worker prices (PROD_XX[/opcion][:extra...]). */
function addLine(){const line=element('div','line'),product=element('select'),option=element('select'),extras=element('div','extras'),qty=element('input','qty'),unit=element('input','unit'),remove=element('button','delete','Quitar');let group=null,entry=null;product.setAttribute('aria-label','Producto');option.setAttribute('aria-label','Opción');product.required=option.required=true;option.hidden=option.disabled=extras.hidden=true;product.append(placeholder('Elige un producto'));for(const item of groups.values()){const node=element('option','',item.id+' · '+item.name+(item.unavailable?' (no disponible)':''));node.value=item.id;product.append(node)}
const price=()=>{const checked=[...extras.querySelectorAll(':checked')];unit.value=entry?(Math.round(entry.price*100)+checked.reduce((sum,box)=>sum+Math.round(entry.extras[box.value].price*100),0))/100:'';line.dataset.id=entry?entry.key+checked.map(box=>':'+box.value).join(''):'';updateTotal()};
const setEntry=next=>{entry=next;extras.replaceChildren();for(const [id,extra] of Object.entries(entry?.extras||{})){const label=element('label','check'),box=element('input');box.type='checkbox';box.value=id;box.addEventListener('change',price);label.append(box,' '+extra.label+(extra.price?' (+'+money(extra.price)+')':''));extras.append(label)}extras.hidden=!extras.children.length;price()};
product.addEventListener('change',()=>{group=groups.get(product.value);option.replaceChildren(placeholder('Elige una opción'));for(const item of group.options){const node=element('option','',item.label+' ('+money(item.price)+')');node.value=item.key;option.append(node)}option.hidden=option.disabled=!group.options.length;setEntry(group.options.length?null:group.entry);if(!option.hidden)option.focus()});
option.addEventListener('change',()=>setEntry(group.options.find(item=>item.key===option.value)));
qty.type=unit.type='number';qty.min='1';qty.max='99';qty.value='1';qty.required=unit.required=true;qty.setAttribute('aria-label','Cantidad');unit.min='0';unit.step='0.01';unit.setAttribute('aria-label','Precio por unidad (€)');remove.type='button';remove.addEventListener('click',()=>{line.remove();updateTotal()});line.append(product,option,extras,qty,unit,remove);lines.append(line);product.focus()}
field('add-line').addEventListener('click',addLine);form.addEventListener('input',updateTotal);
function toggleNewCustomer(){const box=field('new-customer');box.hidden=box.disabled=field('customer').value!=='new';return !box.hidden}
field('customer').addEventListener('change',()=>{if(toggleNewCustomer())field('new-name').focus()});
async function loadCustomers(){const select=field('customer'),{customers}=await api('/api/admin/customers');select.replaceChildren(select.options[0],select.options[1]);for(const customer of customers){const option=element('option','',customer.name);option.value=customer.id;select.append(option)}}
function toggleDeadline(){field('deadline-box').hidden=field('deadline').disabled=!field('has-deadline').checked}
field('has-deadline').addEventListener('change',()=>{toggleDeadline();if(field('has-deadline').checked){field('deadline').value||=today();field('deadline').focus()}});
function resetForm(){form.reset();field('date').value=today();lines.replaceChildren();toggleNewCustomer();toggleDeadline();updateTotal()}
form.addEventListener('submit',async event=>{event.preventDefault();if(!lines.children.length){errorNode.textContent='Añade al menos un producto.';return}const items=[...lines.children].map(line=>({id:line.dataset.id,quantity:Number(line.querySelector('.qty').value),unitCents:cents(line.querySelector('.unit'))}));const isNew=field('customer').value==='new',customer=isNew?{newCustomer:{name:field('new-name').value,phone:field('new-phone').value}}:{customerId:Number(field('customer').value)};try{await api('/api/admin/sales',{method:'POST',body:JSON.stringify({...customer,date:field('date').value,deadline:field('has-deadline').checked?field('deadline').value:null,status:field('status').value,shippingCents:cents(field('shipping')),paidCents:cents(field('paid')),notes:field('notes').value,items})});errorNode.textContent='';resetForm();loadSales();if(isNew)await loadCustomers()}catch(error){errorNode.textContent=error.message}});
function render(sales){list.replaceChildren();if(!sales.length){list.append(element('p','empty','Todavía no hay ventas.'));return}const wrap=element('div','table-wrap'),table=element('table'),head=element('tr');for(const label of ['Nº','Fecha','Cliente','Productos','Total','Pagado','Deuda','Estado',''])head.append(element('th','',label));table.append(head);for(const sale of sales){const row=element('tr'),itemsCell=element('td'),paidCell=element('td','num'),paid=element('input'),debtCell=element('td','num'),statusCell=element('td'),select=element('select'),removeCell=element('td'),remove=element('button','delete','Eliminar');const view=element('button','','Ver productos');view.type='button';view.setAttribute('aria-label','Ver productos de la venta '+sale.id);view.addEventListener('click',()=>showDetail(sale));itemsCell.append(view);const showDebt=paidCents=>{const debt=sale.total_cents-paidCents;debtCell.textContent=sale.status==='cancelled'?'—':money(debt/100);debtCell.classList.toggle('debt',sale.status!=='cancelled'&&debt>0)};paid.type='number';paid.min='0';paid.step='0.01';paid.value=sale.paid_cents/100;paid.setAttribute('aria-label','Pagado de la venta '+sale.id);paid.addEventListener('change',async()=>{paid.disabled=true;try{await api('/api/admin/sales/'+sale.id,{method:'PATCH',body:JSON.stringify({paidCents:cents(paid)})});sale.paid_cents=cents(paid);showDebt(sale.paid_cents);errorNode.textContent=''}catch(error){errorNode.textContent=error.message;paid.value=sale.paid_cents/100}finally{paid.disabled=false}});paidCell.append(paid);select.setAttribute('aria-label','Estado de la venta '+sale.id);for(const status of statuses){const option=element('option','',labels[status]);option.value=status;option.selected=status===sale.status;select.append(option)}select.addEventListener('change',async()=>{select.disabled=true;try{await api('/api/admin/sales/'+sale.id,{method:'PATCH',body:JSON.stringify({status:select.value})});sale.status=select.value;showDebt(sale.paid_cents);errorNode.textContent=''}catch(error){errorNode.textContent=error.message;select.value=sale.status}finally{select.disabled=false}});statusCell.append(select);remove.type='button';remove.addEventListener('click',async()=>{if(!confirm('¿Eliminar definitivamente la venta '+sale.id+'? Esta acción no se puede deshacer.'))return;try{await api('/api/admin/sales/'+sale.id,{method:'DELETE'});loadSales()}catch(error){errorNode.textContent=error.message}});removeCell.append(remove);showDebt(sale.paid_cents);row.append(element('td','',String(sale.id)),element('td','',dateText(sale.sale_date)),element('td','',sale.customer_name||'Sin cliente'),itemsCell,element('td','num',money(sale.total_cents/100)),paidCell,debtCell,statusCell,removeCell);table.append(row)}wrap.append(table);list.append(wrap)}
function showDetail(sale){field('detail-title').textContent='Venta '+sale.id+' · '+(sale.customer_name||'Sin cliente');const items=field('detail-items'),extra=field('detail-extra');items.replaceChildren();for(const item of sale.items){const row=element('li'),description=element('div'),[,name,extras]=item.name.match(/^(.*?)(?: \\(extra: (.*)\\))?$/);description.append(element('div','item-name',name));if(extras)description.append(element('div','item-meta',(extras.includes(', ')?'Extras: ':'Extra: ')+extras));row.append(description,element('span','item-meta','Cantidad: '+item.quantity),element('strong','subtotal',money(item.unitCents*item.quantity/100)));items.append(row)}extra.replaceChildren();if(sale.notes)extra.append(element('p','','Notas: '+sale.notes));if(sale.deadline)extra.append(element('p','','Fecha límite: '+dateText(sale.deadline)));if(sale.shipping_cents){const shipping=element('div','detail-total');shipping.append(element('span','','Envío'),element('span','',money(sale.shipping_cents/100)));extra.append(shipping)}field('detail-total').textContent=money(sale.total_cents/100);field('detail').showModal()}
async function loadSales(){try{render((await api('/api/admin/sales')).sales)}catch(error){errorNode.textContent=error.message}}
/* shortcut: the option label is split from the entry name («Producto – Opción») at its last « – »; add the label to catalog.json if an option label ever contains one. */
Promise.all([api('/api/admin/catalog'),loadCustomers()]).then(([{catalog}])=>{for(const [key,entry] of Object.entries(catalog)){const [id,optionId]=key.split('/'),cut=entry.name.lastIndexOf(' – '),item={...entry,key,label:entry.name.slice(cut+3)};if(!groups.has(id))groups.set(id,{id,name:optionId?entry.name.slice(0,cut):entry.name,unavailable:entry.unavailable===true,options:[]});if(optionId)groups.get(id).options.push(item);else groups.get(id).entry=item}resetForm()}).catch(error=>{errorNode.textContent=error.message});loadSales();`);
}

function adminPage(title, back, main, script) {
    return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#faf7f3"><title>${title} | Aarontxu 3D</title><script>let savedTheme;try{savedTheme=localStorage.getItem('theme')}catch{}document.documentElement.dataset.theme=savedTheme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script><style>
:root{color-scheme:light;--canvas:#faf7f3;--surface:#fff;--fill:#f2ede7;--ink:#1d1d1f;--muted:#636366;--line:#e2dcd4;--brand:#b8420a;--danger:#c81818;--ok:#1a7f37;--warn:#9a6700}
:root[data-theme=dark]{color-scheme:dark;--canvas:#110f0e;--surface:#1d1b1a;--fill:#2c2927;--ink:#f5f5f7;--muted:#aca8a3;--line:#3e3a37;--brand:#fb923c;--danger:#ff6961;--ok:#30d158;--warn:#ffd60a}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}main{width:min(100% - 2rem,64rem);margin:0 auto;padding:2rem 0 4rem}header{position:sticky;top:0;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--canvas) 86%,transparent);backdrop-filter:blur(18px);z-index:1}header>div{width:min(100% - 2rem,64rem);margin:auto;padding:.8rem 0;display:flex;align-items:center;gap:1rem}h1{font-size:1.1rem;margin:0 auto 0 0}h2{font-size:1.8rem;margin:0 0 .4rem}p{color:var(--muted)}.card{background:var(--surface);border:1px solid var(--line);border-radius:1.5rem;box-shadow:0 8px 24px #0000000a;overflow:hidden}.intro{padding:1.5rem 1.7rem}.orders{margin-top:1rem}.order{border-top:1px solid var(--line)}.order:first-child{border-top:0}.row{display:grid;grid-template-columns:minmax(9rem,1.1fr) minmax(9rem,1fr) minmax(7rem,.8fr) minmax(10rem,1fr) auto;align-items:center;gap:.8rem;padding:1rem 1.2rem}.order.open>.row{background:var(--fill)}.toggle{display:flex;align-items:center;gap:.6rem;border:0;background:transparent;color:var(--brand);font:inherit;font-weight:700;text-align:left;cursor:pointer}.chevron{display:inline-block;transition:transform .18s}.open .chevron{transform:rotate(90deg)}.muted{color:var(--muted);font-size:.9rem}.price{font-weight:700}.actions{display:flex;align-items:center;gap:.5rem}select,button{min-height:2.75rem;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--ink);padding:.55rem .85rem;font:inherit}button{cursor:pointer}button:hover,select:hover{border-color:var(--brand)}.delete{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 35%,var(--line))}.detail{padding:1rem 1.2rem 1.3rem 3rem;background:var(--surface);border-top:1px solid var(--line)}.items{list-style:none;margin:0;padding:0}.items li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:1rem;padding:.7rem 0;border-bottom:1px solid var(--line)}.item-name{font-weight:600}.item-meta{color:var(--muted);font-size:.9rem}.detail-total{display:flex;justify-content:space-between;padding-top:1rem;font-weight:700}.notice{margin:1rem 0;color:var(--danger)}.empty{text-align:center;padding:2rem;color:var(--muted)}:focus-visible{outline:3px solid var(--brand);outline-offset:2px}@media(max-width:760px){main{padding-top:1.2rem}.row{grid-template-columns:1fr auto;gap:.65rem}.row>.date,.row>.price{grid-column:1}.row>.actions{grid-column:1/-1;display:grid;grid-template-columns:1fr auto}.row select{min-width:0;max-width:100%}.detail{padding-left:1rem}.items li{grid-template-columns:minmax(0,1fr) auto}.items li .item-meta{grid-column:1}.items li .subtotal{grid-column:2;grid-row:1/3;align-self:center}.intro{padding:1.25rem}}
.back{color:var(--brand);font-weight:700;text-decoration:none;min-height:2.75rem;display:inline-flex;align-items:center}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem}.tile{padding:1.5rem 1.7rem;display:flex;flex-direction:column;gap:.5rem}h3{font-size:1.25rem;margin:0}.tile p{margin:0 0 .5rem;flex:1}.tile button{align-self:flex-start;padding:.55rem 1.1rem;font-weight:700}.count{font-size:2.5rem;line-height:1.1;color:var(--ink)}.count.positive{color:var(--ok)}.count.zero{color:var(--warn)}.count.negative{color:var(--danger)}a.button{display:inline-flex;align-items:center;justify-content:center;align-self:flex-start;min-height:2.75rem;border:1px solid var(--line);border-radius:999px;padding:.55rem 1.1rem;color:var(--ink);font-weight:700;text-decoration:none}a.button:hover{border-color:var(--brand)}a.button.primary{background:var(--brand);border-color:var(--brand);color:var(--canvas)}
.form,.list{margin-top:1rem}.form{padding:1.5rem 1.7rem;display:grid;gap:1rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:.8rem}[hidden]{display:none!important}label{display:grid;gap:.35rem;font-weight:600}label:not(.check){text-indent:1.25rem}label>*{text-indent:0}input,textarea{min-height:2.75rem;width:100%;border:0;border-radius:999px;background:var(--fill);color:var(--ink);padding:.55rem 1.25rem;font:inherit}textarea{border-radius:1.25rem}input[type=date]{-webkit-appearance:none;appearance:none;min-width:0}input::-webkit-date-and-time-value{text-align:left}label select{width:100%}select{-webkit-appearance:none;appearance:none;border:0;background:var(--fill) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238e8e93' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 1rem center/1.25rem;padding:.55rem 3rem .55rem 1.25rem;font-weight:500;cursor:pointer}select:hover{background-color:var(--line)}select:invalid{color:var(--muted)}td select{padding:.4rem 2.2rem .4rem .9rem;background-position:right .6rem center;background-size:1rem;font-size:.9rem}dialog{width:min(100% - 2rem,34rem);border:1px solid var(--line);border-radius:1.5rem;background:var(--surface);color:var(--ink);padding:1.5rem}dialog::backdrop{background:#0008}dialog .actions{justify-content:flex-end;margin-top:1rem}.check{display:flex;align-items:center;gap:.75rem;min-height:2.75rem;padding:0 1rem;border-radius:1rem;background:var(--fill);font-size:.875rem;font-weight:500;cursor:pointer}.check input{width:1.25rem;height:1.25rem;min-height:0;padding:0;flex-shrink:0;accent-color:var(--brand);cursor:pointer}fieldset{border:1px solid var(--line);border-radius:1rem;padding:1rem;display:grid;gap:.6rem;margin:0}legend{font-weight:600;padding:0 .4rem}#lines{display:grid;gap:1rem}.line{display:grid;grid-template-columns:1fr 1fr auto;gap:.5rem}.line select,.extras{grid-column:1/-1;min-width:0}.extras{display:grid;gap:.5rem}.line+.line{border-top:1px solid var(--line);padding-top:1rem}button.primary{background:var(--brand);border-color:var(--brand);color:var(--canvas);font-weight:700}.form .actions{justify-content:flex-end;gap:1rem;flex-wrap:wrap}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{padding:.7rem .5rem;border-bottom:1px solid var(--line);text-align:center;vertical-align:middle}th{font-size:.85rem;color:var(--muted);white-space:nowrap}.num{white-space:nowrap}td input{width:5.5rem;text-align:center}td .actions{justify-content:center}td button{white-space:nowrap}.debt{color:var(--danger);font-weight:700}@media(max-width:760px){.form{padding:1.25rem}.line{grid-template-columns:1fr 1fr}.line select{grid-column:1/-1}.line .delete{grid-column:1/-1}}
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
            const adminView = { '/admin': adminHome, '/admin/': adminHome, '/admin/orders': adminOrders, '/admin/customers': adminCustomers, '/admin/sales': adminSales }[url.pathname];
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
