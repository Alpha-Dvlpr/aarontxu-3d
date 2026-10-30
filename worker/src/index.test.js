import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import worker, { allocateOrderNumber, buildSale, formatOrderNumber, orderPrefix, parseCustomer, priceOrder } from './index.js';

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
        assert.deepEqual(parseCustomer({ name: ' Ana ', phone: ' 600 ' }), { name: 'Ana', phone: '600', publish: 1 });
        assert.equal(parseCustomer({ name: 'Ana', publish: false }).publish, 0);
    });
    it('rejects empty names and wrong types', () => {
        for (const body of [null, {}, { name: '  ' }, { name: 'Ana', phone: 600 }, { name: 'Ana', publish: 'no' }, { name: 'x'.repeat(101) }]) {
            assert.throws(() => parseCustomer(body));
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
    it('accepts a new customer instead of an existing one, with a required phone', () => {
        const built = buildSale(sale({ customerId: undefined, newCustomer: { name: ' Ana ', phone: '600' } }), catalog).sale;
        assert.deepEqual([built.customerId, built.newCustomer], [null, { name: 'Ana', phone: '600', publish: 1 }]);
        for (const changes of [{ newCustomer: { name: 'Ana', phone: '600' } }, { customerId: undefined, newCustomer: { name: 'Ana', phone: ' ' } }, { customerId: undefined, newCustomer: { name: '', phone: '600' } }]) {
            assert.throws(() => buildSale(sale(changes), catalog), JSON.stringify(changes));
        }
    });
    it('rejects invalid dates, statuses, amounts, products and a missing customer', () => {
        for (const changes of [{ customerId: undefined }, { customerId: null }, { date: '2026-02-30' }, { date: '30/10/2026' }, { status: 'pending' }, { paidCents: -1 }, { shippingCents: 4.5 }, { customerId: '3' }, { items: [] }, { items: [{ id: 'PROD_42', quantity: 1 }] }, { items: [{ id: 'PROD_01', quantity: 1, unitCents: -5 }] }]) {
            assert.throws(() => buildSale(sale(changes), catalog), JSON.stringify(changes));
        }
    });
});

describe('admin order deletion', () => {
    const origin = 'https://orders.test';
    const env = { ALLOWED_WORKER_ORIGIN: origin, ACCESS_TEAM_DOMAIN: 'team.test', ACCESS_AUD: 'aud', ADMIN_EMAILS: 'admin@test.com' };
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
        globalThis.fetch = async () => Response.json({ keys: [jwk] });
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
        const rows = new Set(['7']);
        const send = () => worker.fetch(request(7, { 'cf-access-jwt-assertion': token }), { ...env, DB: db(rows) });
        assert.deepEqual(await (await send()).json(), { deleted: true });
        assert.equal((await send()).status, 404);
    });
    it('serves the admin home and orders pages only with a valid Access token', async () => {
        const page = (path, headers = {}) => worker.fetch(new Request(`${origin}${path}`, { headers }), env);
        for (const path of ['/admin', '/admin/orders', '/admin/sales', '/admin/customers']) assert.equal((await page(path)).status, 401);
        const home = await (await page('/admin', { 'cf-access-jwt-assertion': token })).text();
        assert.match(home, /href="\/admin\/orders"/);
        assert.match(home, /href="\/admin\/sales"/);
        assert.match(home, /href="\/admin\/customers"/);
        assert.match(home, /app\.pagescms\.org/);
        const orders = await (await page('/admin/orders', { 'cf-access-jwt-assertion': token })).text();
        assert.match(orders, /id="orders"/);
        assert.match(orders, /href="\/admin"/);
        const sales = await (await page('/admin/sales', { 'cf-access-jwt-assertion': token })).text();
        const customers = await (await page('/admin/customers', { 'cf-access-jwt-assertion': token })).text();
        // Each page's inline script must parse.
        for (const html of [home, orders, sales, customers]) new Function(html.split('<script>').pop().split('</script>')[0]);
    });
});
