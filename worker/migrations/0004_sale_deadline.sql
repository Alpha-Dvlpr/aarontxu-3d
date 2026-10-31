-- Optional "for before" date of a sale (YYYY-MM-DD); NULL when the sale has none.
ALTER TABLE sales ADD COLUMN deadline TEXT;
