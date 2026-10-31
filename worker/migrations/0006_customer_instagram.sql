-- Usuario de Instagram del cliente, sin @ ni URL. Cada cliente necesita teléfono o Instagram (lo comprueba el Worker).
ALTER TABLE customers ADD COLUMN instagram TEXT NOT NULL DEFAULT '';
-- Los clientes del Excel con «Instagram» en el teléfono quedan sin contacto hasta que se ponga su usuario.
UPDATE customers SET phone = '' WHERE phone = 'Instagram';
