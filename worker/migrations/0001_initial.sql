CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    request_hash TEXT NOT NULL,
    access_key_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'paid', 'delivered', 'cancelled')),
    no_publish INTEGER NOT NULL DEFAULT 0 CHECK (no_publish IN (0, 1)),
    total_cents INTEGER NOT NULL,
    items_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    expires_at TEXT NOT NULL
);
CREATE INDEX orders_created_at ON orders(created_at DESC);
CREATE INDEX orders_status ON orders(status);
