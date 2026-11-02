-- Venta creada a partir del pedido web («Pasar a ventas»), para no pasarlo dos veces. Vuelve a NULL si se elimina la venta.
ALTER TABLE orders ADD COLUMN sale_id INTEGER;
