ALTER TABLE orders ADD COLUMN order_number TEXT;

WITH numbered AS (
    SELECT id, 'P-' || strftime('%Y%m%d', created_at) || '/' || ROW_NUMBER() OVER (PARTITION BY strftime('%Y%m%d', created_at) ORDER BY id) AS number
    FROM orders
)
UPDATE orders SET order_number = (SELECT number FROM numbered WHERE numbered.id = orders.id);

CREATE UNIQUE INDEX orders_order_number ON orders(order_number);

CREATE TABLE order_counters (
    prefix TEXT NOT NULL CHECK (prefix IN ('P', 'T')),
    order_date TEXT NOT NULL,
    counter INTEGER NOT NULL CHECK (counter > 0),
    PRIMARY KEY (prefix, order_date)
);

INSERT INTO order_counters (prefix, order_date, counter)
SELECT 'P', strftime('%Y%m%d', created_at), MAX(CAST(substr(order_number, instr(order_number, '/') + 1) AS INTEGER))
FROM orders
GROUP BY strftime('%Y%m%d', created_at);
