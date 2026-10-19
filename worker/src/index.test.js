import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allocateOrderNumber, formatOrderNumber, orderPrefix, priceOrder } from './index.js';

const catalog = {
    PROD_01: { name: 'Funko', price: 20, priceLabel: '', extras: { vehiculo: { label: 'Vehículo grande', price: 5 } } },
    PROD_02: { name: 'Consulta', price: 0, priceLabel: 'Precio a consultar', extras: {} }
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
    it('accepts quote products with zero price', () => {
        assert.equal(priceOrder([{ id: 'PROD_02', quantity: 1 }], catalog).items[0].priceLabel, 'Precio a consultar');
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
