-- Ventas reales: a diferencia de orders, no caducan a los 15 días.
CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    publish INTEGER NOT NULL DEFAULT 1 CHECK (publish IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- La venta solo guarda el id del cliente; al borrar el cliente queda anónima y se conserva.
CREATE TABLE sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    sale_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'pending_shipping', 'delivered', 'cancelled')),
    shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
    paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sales_customer ON sales(customer_id);
CREATE INDEX sales_date ON sales(sale_date DESC);

-- product_id es el código fijo del catálogo (PROD_XX o PROD_XX/opcion; PROD_99 = personalizado provisional).
-- name y unit_cents se copian al vender: cambiar el catálogo no altera las ventas pasadas.
CREATE TABLE sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_cents INTEGER NOT NULL CHECK (unit_cents >= 0)
);
CREATE INDEX sale_items_sale ON sale_items(sale_id);
CREATE INDEX sale_items_product ON sale_items(product_id);
