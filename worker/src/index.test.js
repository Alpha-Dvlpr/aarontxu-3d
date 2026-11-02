import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { allocateOrderNumber, buildSale, duplicateCustomer, formatOrderNumber, orderPrefix, parseCustomer, parseExpense, parseRecovery, priceOrder, purgeExpired } from './index.js';

// An in-memory SQLite with every migration, behind the few D1 methods the Worker uses.
function sqliteDb() {
    const raw = new DatabaseSync(':memory:'), folder = new URL('../migrations/', import.meta.url);
    raw.exec('PRAGMA foreign_keys = ON');
    for (const file of readdirSync(folder).sort()) raw.exec(readFileSync(new URL(file, folder), 'utf8'));
    const prepare = sql => {
        let args = [];
        const statement = { sql, bind: (...values) => { args = values; return statement; }, all: async () => ({ results: raw.prepare(sql).all(...args) }), first: async () => raw.prepare(sql).get(...args) ?? null, run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...args).changes) } }) };
        return statement;
    };
    const batch = async statements => {
        raw.exec('BEGIN');
        try { const results = []; for (const statement of statements) results.push(await (/^\s*SELECT|RETURNING/i.test(statement.sql) ? statement.all() : statement.run())); raw.exec('COMMIT'); return results; } catch (error) { raw.exec('ROLLBACK'); throw error; }
    };
    return { raw, prepare, batch };
}

const catalog = {
    PROD_01: { name: 'Funko', price: 20, priceLabel: '', extras: { vehiculo: { label: 'Vehículo grande', price: 5 } } },
    PROD_02: { name: 'Consulta', price: 0, priceLabel: 'Precio a consultar', extras: { nfc: { label: 'Chip NFC', price: 0 } } },
    'PROD_03/2-personas': { name: 'Figura – 2 personas', price: 35, priceLabel: '', extras: {} }
};

describe('orderPrefix', () => {
    it('derives the test or production prefix from the server environment', () => {
        assert.equal(orderPrefix('development'), 'T');
        assert.equal(orderPrefix('production'), 'P');
        assert.equal(orderPrefix(undefined), 'P');
    });
});

describe('formatOrderNumber', () => {
    it('formats independent test and production identifiers without leading zeroes', () => {
        assert.equal(formatOrderNumber('T', '20261019', 1), 'T-20261019/1');
        assert.equal(formatOrderNumber('P', '20261103', 4), 'P-20261103/4');
    });
    it('rejects invalid prefixes, dates and counters', () => {
        for (const args of [['X', '20261019', 1], ['P', '2026-10-19', 1], ['T', '20261019', 0]]) {
            assert.throws(() => formatOrderNumber(...args));
        }
    });
});

describe('allocateOrderNumber', () => {
    it('keeps independent counters for each prefix and date', async () => {
        const counters = new Map();
        const db = { prepare: () => ({ bind: (prefix, date) => ({ first: async () => {
            const key = `${prefix}:${date}`;
            const counter = (counters.get(key) || 0) + 1;
            counters.set(key, counter);
            return { counter };
        } }) }) };
        assert.equal(await allocateOrderNumber(db, 'T', '20261019'), 'T-20261019/1');
        assert.equal(await allocateOrderNumber(db, 'T', '20261019'), 'T-20261019/2');
        assert.equal(await allocateOrderNumber(db, 'P', '20261019'), 'P-20261019/1');
        assert.equal(await allocateOrderNumber(db, 'T', '20261020'), 'T-20261020/1');
    });
});

describe('priceOrder', () => {
    it('recalculates product and extra prices from the catalog', () => {
        assert.equal(priceOrder([{ id: 'PROD_01:vehiculo', quantity: 2 }], catalog).totalCents, 5000);
    });
    it('prices a product option by its own catalog entry', () => {
        assert.equal(priceOrder([{ id: 'PROD_03/2-personas', quantity: 1 }], catalog).totalCents, 3500);
        assert.throws(() => priceOrder([{ id: 'PROD_03', quantity: 1 }], catalog));
    });
    it('accepts quote products with zero price', () => {
        assert.equal(priceOrder([{ id: 'PROD_02', quantity: 1 }], catalog).items[0].priceLabel, 'Precio a consultar');
    });
    it('accepts zero-price extras and keeps acronyms in the line name', () => {
        const [item] = priceOrder([{ id: 'PROD_02:nfc', quantity: 1 }], catalog).items;
        assert.equal(item.unitCents, 0);
        assert.equal(item.name, 'Consulta (extra: chip NFC)');
    });
    it('rejects unknown products, extras and out-of-range quantities', () => {
        for (const line of [{ id: 'PROD_99', quantity: 1 }, { id: 'PROD_01:fake', quantity: 1 }, { id: 'PROD_01', quantity: 100 }, { id: 'PROD_01', quantity: 0 }]) {
            assert.throws(() => priceOrder([line], catalog));
        }
    });
    it('rejects repeated extras and invalid line counts', () => {
        assert.throws(() => priceOrder([{ id: 'PROD_01:vehiculo:vehiculo', quantity: 1 }], catalog));
        assert.throws(() => priceOrder([], catalog));
        assert.throws(() => priceOrder(Array.from({ length: 31 }, () => ({ id: 'PROD_01', quantity: 1 })), catalog));
    });
});

describe('parseCustomer', () => {
    it('trims the fields and defaults to allowing publication', () => {
        assert.deepEqual(parseCustomer({ name: ' Ana ', phone: ' 612 34 56 78 ' }), { name: 'Ana', phone: '612345678', instagram: '', publish: 1 });
        assert.equal(parseCustomer({ name: 'Ana', phone: '612345678', publish: false }).publish, 0);
    });
    it('keeps Spanish mobiles without +34, other countries with their prefix, and the bare Instagram user', () => {
        assert.equal(parseCustomer({ name: 'Ana', phone: '+34 712-345-678' }).phone, '712345678');
        assert.equal(parseCustomer({ name: 'Ana', phone: '+33 6 12 34 56 78' }).phone, '+33612345678');
        assert.deepEqual(parseCustomer({ name: 'Ana', instagram: ' @ana_3d.es ' }), { name: 'Ana', phone: '', instagram: 'ana_3d.es', publish: 1 });
    });
    it('rejects empty names, wrong types and customers without a valid phone or Instagram', () => {
        for (const body of [null, {}, { name: '  ', phone: '612345678' }, { name: 'Ana', phone: 612345678 }, { name: 'Ana', phone: '612345678', publish: 'no' }, { name: 'x'.repeat(101), phone: '612345678' }]) {
            assert.throws(() => parseCustomer(body), /invalid_customer/);
        }
        for (const contact of [{}, { phone: ' ', instagram: '@' }, { phone: 'Instagram' }, { phone: '600' }, { phone: '912345678' }, { phone: '+34 600' }, { instagram: 'instagram.com/ana' }, { instagram: 'ana 3d' }, { phone: '612345678', instagram: 'https://www.instagram.com/ana/' }]) {
            assert.throws(() => parseCustomer({ name: 'Ana', ...contact }), /invalid_contact/, JSON.stringify(contact));
        }
    });
});

describe('duplicateCustomer', () => {
    const rows = [{ name: 'Ángel', phone: '612345678', instagram: 'Ana.3D' }, { name: 'Luis', phone: '', instagram: '' }];
    const db = { prepare: sql => ({ bind: id => ({ all: async () => {
        assert.match(sql, /WHERE id != \?$/);
        return { results: id === 1 ? rows.slice(1) : rows };
    } }) }) };
    const check = (changes, id) => duplicateCustomer(db, { name: 'Nuevo', phone: '699999999', instagram: '', ...changes }, id);
    it('rejects a repeated name ignoring case and accents, a repeated phone or Instagram user', async () => {
        for (const name of ['ángel', 'ANGEL']) assert.match(await check({ name }), /Ya hay un cliente llamado/);
        assert.match(await check({ phone: '612345678' }), /teléfono/);
        assert.match(await check({ instagram: 'ana.3d' }), /Instagram/);
    });
    it('lets a customer keep their own data and ignores empty fields', async () => {
        assert.equal(await check({ name: 'Ángel', phone: '612345678', instagram: 'Ana.3D' }, 1), null);
        assert.equal(await check({ phone: '', instagram: 'otro' }), null);
    });
});

describe('purgeExpired', () => {
    it('deletes customers 3 years after their last sale and anonymises sales after 6 years, keeping their total', async () => {
        const db = sqliteDb(), sql = query => db.raw.exec(query), rows = query => db.raw.prepare(query).all();
        sql(`INSERT INTO customers (id, name, phone, created_at) VALUES (1, 'Caducado', '611111111', '2020-01-01'), (2, 'Repite', '622222222', '2020-01-01'), (3, 'Sin ventas viejo', '633333333', date('now', '-3 years', '-1 day')), (4, 'Sin ventas nuevo', '644444444', date('now'));
            INSERT INTO sales (id, customer_id, sale_date, shipping_cents, paid_cents, notes) VALUES (1, 1, date('now', '-3 years', '-1 day'), 0, 2000, 'Figura 12'), (2, 2, date('now', '-6 years', '-1 day'), 450, 4000, 'Figura 3'), (3, 2, date('now', '-1 year'), 0, 2000, '');
            INSERT INTO sale_items (sale_id, product_id, name, quantity, unit_cents) VALUES (1, 'PROD_01', 'Figura', 1, 2000), (2, 'PROD_01', 'Figura', 1, 2000), (2, 'PROD_03', 'Llavero', 3, 500), (3, 'PROD_01', 'Figura', 1, 2000);`);
        await purgeExpired(db);
        await purgeExpired(db);
        assert.deepEqual(rows('SELECT name FROM customers ORDER BY id').map(row => row.name), ['Repite', 'Sin ventas nuevo']);
        assert.deepEqual(rows('SELECT id, customer_id, notes, shipping_cents, paid_cents FROM sales ORDER BY id').map(row => ({ ...row })), [
            { id: 1, customer_id: null, notes: 'Figura 12', shipping_cents: 0, paid_cents: 2000 },
            { id: 2, customer_id: null, notes: '', shipping_cents: 450, paid_cents: 4000 },
            { id: 3, customer_id: 2, notes: '', shipping_cents: 0, paid_cents: 2000 }
        ]);
        assert.deepEqual(rows('SELECT sale_id, product_id, name, quantity, unit_cents FROM sale_items WHERE sale_id = 2').map(row => ({ ...row })), [{ sale_id: 2, product_id: '', name: 'Venta anonimizada', quantity: 1, unit_cents: 3500 }]);
    });
});

describe('parseExpense', () => {
    const expense = (changes = {}) => ({ name: ' Bambu P1S ', type: 'tool', quantity: 1, totalCents: 53789, advances: [{ month: '2026-08', amountCents: 17930 }, { month: '2026-06', amountCents: 17930 }, { month: '2026-07', amountCents: 17929 }], ...changes });
    it('takes the year from the earliest plazo and keeps every plazo', () => {
        const parsed = parseExpense(expense({ advances: [{ month: '2027-01', amountCents: 50000 }, { month: '2026-12', amountCents: 3789 }] }));
        assert.equal(parsed.year, 2026);
        assert.equal(parsed.name, 'Bambu P1S');
        assert.equal(parseExpense(expense()).advances.length, 3);
    });
    it('rejects plazos that do not add up to the total, bad months and bad fields', () => {
        for (const changes of [{ totalCents: 53790 }, { advances: [] }, { advances: [{ month: '2026-13', amountCents: 53789 }] }, { advances: [{ month: '2026-6', amountCents: 53789 }] }, { advances: [{ month: '2026-06', amountCents: 0 }, { month: '2026-07', amountCents: 53789 }] }, { type: 'food' }, { quantity: 0 }, { quantity: 1.5 }, { name: ' ' }]) {
            assert.throws(() => parseExpense(expense(changes)), JSON.stringify(changes));
        }
    });
});

describe('parseRecovery', () => {
    it('accepts a month, an amount and an optional note', () => {
        assert.deepEqual(parseRecovery({ month: '2026-11', amountCents: 2500 }), { month: '2026-11', amountCents: 2500, notes: '' });
        assert.equal(parseRecovery({ month: '2026-11', amountCents: 2500, notes: ' Venta 3 ' }).notes, 'Venta 3');
    });
    it('rejects bad months and amounts', () => {
        for (const body of [null, { month: '2026-00', amountCents: 1 }, { month: '2026-11', amountCents: 0 }, { month: '2026-11', amountCents: 1.5 }, { month: '2026-11', amountCents: 1, notes: 'x'.repeat(201) }]) {
            assert.throws(() => parseRecovery(body), JSON.stringify(body));
        }
    });
});

describe('buildSale', () => {
    const sale = (changes = {}) => ({ customerId: 3, date: '2026-10-30', status: 'in_progress', shippingCents: 450, paidCents: 0, items: [{ id: 'PROD_01:vehiculo', quantity: 2 }], ...changes });
    it('copies the catalog name and price into each line', () => {
        const { items } = buildSale(sale(), catalog);
        assert.deepEqual(items, [{ productId: 'PROD_01', name: 'Funko (extra: vehículo grande)', quantity: 2, unitCents: 2500 }]);
    });
    it('keeps a manually agreed price instead of the catalog one', () => {
        assert.equal(buildSale(sale({ items: [{ id: 'PROD_01', quantity: 1, unitCents: 1800 }] }), catalog).items[0].unitCents, 1800);
    });
    it('accepts the provisional PROD_99 only for sales, never in web orders', () => {
        assert.equal(buildSale(sale({ items: [{ id: 'PROD_99', quantity: 1, unitCents: 3000 }] }), catalog).items[0].name, 'Personalizado (provisional)');
        assert.throws(() => priceOrder([{ id: 'PROD_99', quantity: 1 }], catalog));
    });
    it('accepts a new customer instead of an existing one, with a phone or an Instagram user', () => {
        const built = buildSale(sale({ customerId: undefined, newCustomer: { name: ' Ana ', phone: '612345678' } }), catalog).sale;
        assert.deepEqual([built.customerId, built.newCustomer], [null, { name: 'Ana', phone: '612345678', instagram: '', publish: 1 }]);
        assert.equal(buildSale(sale({ customerId: undefined, newCustomer: { name: 'Ana', instagram: 'ana.3d' } }), catalog).sale.newCustomer.instagram, 'ana.3d');
        for (const changes of [{ newCustomer: { name: 'Ana', phone: '612345678' } }, { customerId: undefined, newCustomer: { name: 'Ana', phone: ' ' } }, { customerId: undefined, newCustomer: { name: '', phone: '612345678' } }]) {
            assert.throws(() => buildSale(sale(changes), catalog), JSON.stringify(changes));
        }
    });
    it('keeps an optional deadline, null when there is none', () => {
        assert.equal(buildSale(sale(), catalog).sale.deadline, null);
        assert.equal(buildSale(sale({ deadline: '2026-12-20' }), catalog).sale.deadline, '2026-12-20');
    });
    it('rejects invalid dates, statuses, amounts, products and a missing customer', () => {
        for (const changes of [{ deadline: '2026-13-45' }, { deadline: '' }, { customerId: undefined }, { customerId: null }, { date: '2026-02-30' }, { date: '30/10/2026' }, { status: 'pending' }, { paidCents: -1 }, { shippingCents: 4.5 }, { customerId: '3' }, { items: [] }, { items: [{ id: 'PROD_42', quantity: 1 }] }, { items: [{ id: 'PROD_01', quantity: 1, unitCents: -5 }] }]) {
            assert.throws(() => buildSale(sale(changes), catalog), JSON.stringify(changes));
        }
    });
});

describe('admin order deletion', () => {
    const origin = 'https://orders.test';
    const env = { ALLOWED_WORKER_ORIGIN: origin, ACCESS_TEAM_DOMAIN: 'team.test', ACCESS_AUD: 'aud', ADMIN_EMAILS: 'admin@test.com', SALES_CATALOG_URL: 'https://shop.test/catalog-all.json' };
    const realFetch = globalThis.fetch;
    let token;
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const request = (id, headers = {}) => new Request(`${origin}/api/admin/orders/${id}`, { method: 'DELETE', headers: { origin, ...headers } });
    const db = rows => ({ prepare: sql => ({ bind: id => ({ run: async () => {
        assert.match(sql, /^DELETE FROM orders WHERE id = \? AND expires_at > \?$/);
        return { meta: { changes: rows.delete(id) ? 1 : 0 } };
    } }) }) });

    before(async () => {
        const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
        const jwk = { ...await crypto.subtle.exportKey('jwk', publicKey), kid: 'k1', use: 'sig', alg: 'RS256' };
        globalThis.fetch = async url => Response.json(String(url).includes('catalog') ? catalog : { keys: [jwk] });
        const unsigned = `${encode({ alg: 'RS256', kid: 'k1' })}.${encode({ aud: 'aud', iss: 'https://team.test', email: 'admin@test.com', exp: Date.now() / 1000 + 60 })}`;
        token = `${unsigned}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsigned))).toString('base64url')}`;
    });
    after(() => { globalThis.fetch = realFetch; });

    it('rejects requests without a valid Access token and keeps the order', async () => {
        const rows = new Set(['7']);
        for (const headers of [{}, { 'cf-access-jwt-assertion': `${token}x` }]) {
            assert.equal((await worker.fetch(request(7, headers), { ...env, DB: db(rows) })).status, 401);
        }
        assert.ok(rows.has('7'));
    });
    it('deletes an existing order once and returns 404 afterwards', async () => {
        const DB = sqliteDb(), send = () => worker.fetch(request(7, { 'cf-access-jwt-assertion': token }), { ...env, DB });
        DB.raw.exec("INSERT INTO orders (id, order_number, request_key, request_hash, access_key_hash, total_cents, items_json, expires_at) VALUES (7, 'P-20261102/1', 'k', 'h', 'a', 0, '[]', datetime('now', '+1 day'))");
        assert.deepEqual(await (await send()).json(), { deleted: true });
        assert.equal((await send()).status, 404);
    });
    it('keeps a delivered order or sale with nothing owed: no deleting, no deadline changes', async () => {
        const DB = sqliteDb(), send = (path, method, body) => worker.fetch(new Request(`${origin}${path}`, { method, body: body && JSON.stringify(body), headers: { origin, 'content-type': 'application/json', 'cf-access-jwt-assertion': token } }), { ...env, DB });
        DB.raw.exec(`INSERT INTO sales (id, sale_date, status, shipping_cents, paid_cents) VALUES (1, '2026-11-02', 'delivered', 500, 2000);
            INSERT INTO sale_items (sale_id, product_id, name, quantity, unit_cents) VALUES (1, 'PROD_01', 'Funko', 1, 2000);
            INSERT INTO orders (id, order_number, request_key, request_hash, access_key_hash, total_cents, items_json, expires_at, status, sale_id) VALUES (7, 'P-20261102/1', 'k', 'h', 'a', 2000, '[]', datetime('now', '+1 day'), 'delivered', 1), (8, 'P-20261102/2', 'k2', 'h2', 'a2', 0, '[]', datetime('now', '+1 day'), 'delivered', NULL);`);
        const pending = async () => (await (await send('/api/admin/orders', 'GET')).json()).orders.find(order => order.id === 7).sale_pending_cents;
        // 500 € still owed: everything stays editable.
        assert.equal(await pending(), 500);
        assert.equal((await send('/api/admin/sales/1', 'PATCH', { deadline: '2026-12-01' })).status, 200);
        assert.equal((await send('/api/admin/orders/8', 'DELETE')).status, 409);
        assert.equal((await send('/api/admin/sales/1', 'PATCH', { paidCents: 2500 })).status, 200);
        assert.equal(await pending(), 0);
        for (const [path, method, body] of [['/api/admin/sales/1', 'DELETE'], ['/api/admin/sales/1', 'PATCH', { deadline: null }], ['/api/admin/sales/1', 'PATCH', { paidCents: 2400 }], ['/api/admin/orders/7', 'DELETE']]) assert.equal((await send(path, method, body)).status, 409);
        // Only the notes and the status change; out of «Entregado», the paid amount can be lowered and the debt unlocks the order.
        for (const body of [{ notes: 'Figura 57' }, { status: 'in_progress' }, { paidCents: 2400 }]) assert.equal((await send('/api/admin/sales/1', 'PATCH', body)).status, 200);
        assert.equal((await send('/api/admin/orders/7', 'DELETE')).status, 200);
        assert.equal((await send('/api/admin/sales/1', 'DELETE')).status, 200);
    });
    it('lists in the summary the customers deleted within 30 days, with their deletion date', async () => {
        const DB = sqliteDb();
        DB.raw.exec(`INSERT INTO customers (id, name, instagram) VALUES (1, 'Pronto', 'pronto'), (2, 'Lejos', 'lejos'), (3, 'Sin ventas', 'nueva');
            INSERT INTO sales (customer_id, sale_date) VALUES (1, date('now', '-3 years', '+10 days')), (2, date('now', '-3 years', '+40 days')), (1, date('now', '-4 years'));`);
        const summary = await (await worker.fetch(new Request(`${origin}/api/admin/summary`, { headers: { origin, 'cf-access-jwt-assertion': token } }), { ...env, DB })).json();
        assert.deepEqual(summary.expiring.map(row => ({ ...row })), [{ name: 'Pronto', phone: '', instagram: 'pronto', delete_on: DB.raw.prepare("SELECT date('now', '+10 days') AS day").get().day }]);
    });
    it('refuses to change or delete an anonymised sale', async () => {
        const DB = sqliteDb();
        DB.raw.exec(`INSERT INTO sales (id, sale_date, paid_cents) VALUES (1, '2020-01-01', 2000); INSERT INTO sale_items (sale_id, product_id, name, quantity, unit_cents) VALUES (1, '', 'Venta anonimizada', 1, 2000);`);
        for (const [method, body] of [['PATCH', '{"paidCents":0}'], ['DELETE']]) {
            const response = await worker.fetch(new Request(`${origin}/api/admin/sales/1`, { method, body, headers: { origin, 'content-type': 'application/json', 'cf-access-jwt-assertion': token } }), { ...env, DB });
            assert.equal(response.status, 409);
        }
        assert.deepEqual({ ...DB.raw.prepare('SELECT paid_cents, (SELECT COUNT(*) FROM sale_items) AS lines FROM sales').get() }, { paid_cents: 2000, lines: 1 });
    });
    it('edits the notes and deadline of a sale, removes the deadline with null and rejects invalid dates', async () => {
        const DB = sqliteDb(), patch = body => worker.fetch(new Request(`${origin}/api/admin/sales/1`, { method: 'PATCH', body: JSON.stringify(body), headers: { origin, 'content-type': 'application/json', 'cf-access-jwt-assertion': token } }), { ...env, DB });
        DB.raw.exec(`INSERT INTO sales (id, sale_date, status, paid_cents, notes) VALUES (1, '2026-11-02', 'in_progress', 500, 'Pedido web'); INSERT INTO sale_items (sale_id, product_id, name, quantity, unit_cents) VALUES (1, 'PROD_01', 'Funko', 1, 2000);`);
        const row = () => ({ ...DB.raw.prepare('SELECT status, paid_cents, notes, deadline FROM sales').get() });
        assert.equal((await patch({ notes: ' Figura 57 ', deadline: '2026-12-01' })).status, 200);
        assert.deepEqual(row(), { status: 'in_progress', paid_cents: 500, notes: 'Figura 57', deadline: '2026-12-01' });
        for (const body of [{ deadline: '2026-02-30' }, { notes: 5 }, {}]) assert.equal((await patch(body)).status, 400);
        assert.equal((await patch({ deadline: null })).status, 200);
        assert.deepEqual(row(), { status: 'in_progress', paid_cents: 500, notes: 'Figura 57', deadline: null });
    });
    it('passes a web order to sales once, in progress, with the agreed prices and the same customer checks', async () => {
        const DB = sqliteDb(), send = (path, method, body) => worker.fetch(new Request(`${origin}${path}`, { method, body: body && JSON.stringify(body), headers: { origin, 'content-type': 'application/json', 'cf-access-jwt-assertion': token } }), { ...env, DB });
        const { items } = priceOrder([{ id: 'PROD_01:vehiculo', quantity: 2 }, { id: 'PROD_02', quantity: 1 }], catalog);
        DB.raw.prepare("INSERT INTO orders (id, order_number, request_key, request_hash, access_key_hash, total_cents, items_json, expires_at) VALUES (7, 'P-20261102/1', 'k', 'h', 'a', 5000, ?, datetime('now', '+1 day'))").run(JSON.stringify(items));
        DB.raw.exec("INSERT INTO customers (id, name, phone) VALUES (1, 'Ana', '612345678')");
        const body = { newCustomer: { name: 'ána', instagram: 'otra' }, shippingCents: 450, prices: [2500, 1200] };
        assert.equal((await send('/api/admin/orders/7/sale', 'POST', body)).status, 409);
        assert.equal((await send('/api/admin/orders/7/sale', 'POST', { ...body, prices: [2500] })).status, 400);
        assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM sales').get().n, 0);
        const created = await send('/api/admin/orders/7/sale', 'POST', { ...body, newCustomer: { name: 'Bea', instagram: 'bea' }, notes: ' Pedido web P-20261102/1 · figura 57 ', deadline: '2026-12-01' });
        assert.equal(created.status, 201);
        const { id } = await created.json();
        assert.deepEqual({ ...DB.raw.prepare('SELECT c.name, s.status, s.notes, s.deadline, s.shipping_cents, s.paid_cents FROM sales s JOIN customers c ON c.id = s.customer_id WHERE s.id = ?').get(id) }, { name: 'Bea', status: 'in_progress', notes: 'Pedido web P-20261102/1 · figura 57', deadline: '2026-12-01', shipping_cents: 450, paid_cents: 0 });
        assert.deepEqual(DB.raw.prepare('SELECT product_id, name, quantity, unit_cents FROM sale_items ORDER BY id').all().map(row => ({ ...row })), [{ product_id: 'PROD_01', name: 'Funko (extra: vehículo grande)', quantity: 2, unit_cents: 2500 }, { product_id: 'PROD_02', name: 'Consulta', quantity: 1, unit_cents: 1200 }]);
        assert.deepEqual({ ...DB.raw.prepare('SELECT sale_id, status FROM orders').get() }, { sale_id: id, status: 'confirmed' });
        assert.equal((await send('/api/admin/orders/7/sale', 'POST', { customerId: 1, shippingCents: 0, prices: [2500, 1200] })).status, 409);
        // Deleting the sale frees the order again.
        await send(`/api/admin/sales/${id}`, 'DELETE');
        assert.equal(DB.raw.prepare('SELECT sale_id FROM orders').get().sale_id, null);
        assert.equal((await send('/api/admin/orders/7/sale', 'POST', { customerId: 1, shippingCents: 0, prices: [2500, 1200] })).status, 201);
    });
    it('serves the admin home and orders pages only with a valid Access token', async () => {
        const page = (path, headers = {}) => worker.fetch(new Request(`${origin}${path}`, { headers }), env);
        const paths = ['/admin', '/admin/orders', '/admin/sales', '/admin/customers', '/admin/expenses', '/admin/amortization'];
        for (const path of paths) assert.equal((await page(path)).status, 401);
        const [home, orders, ...others] = await Promise.all(paths.map(async path => (await page(path, { 'cf-access-jwt-assertion': token })).text()));
        for (const path of paths.slice(2)) assert.match(home, new RegExp(`href="${path.replaceAll('/', '\\/')}"`));
        assert.match(home, /href="\/admin\/orders"/);
        assert.match(home, /app\.pagescms\.org/);
        assert.match(home, /id="global-total"[\s\S]*id="pending-total"[\s\S]*id="unassigned-total"[\s\S]*\/api\/admin\/summary/);
        assert.match(orders, /id="orders"/);
        assert.match(orders, /href="\/admin"/);
        // Each page's inline script must parse.
        for (const html of [home, orders, ...others]) new Function(html.split('<script>').pop().split('</script>')[0]);
    });
});
