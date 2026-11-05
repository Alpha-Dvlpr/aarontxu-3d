-- One row per figure box: its type (the Excel lists: one, two, car, pet) and its number. No customer data; a number can repeat when a customer asks for one already used.
CREATE TABLE figure_numbers (
    id INTEGER PRIMARY KEY,
    series TEXT NOT NULL,
    number INTEGER NOT NULL CHECK (number > 0),
    sale_id INTEGER REFERENCES sales(id)
);
CREATE INDEX figure_numbers_sale ON figure_numbers (sale_id);

-- Numbers already used in the Excel, without their sales.
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 31)
INSERT INTO figure_numbers (series, number)
SELECT 'one', x FROM n
UNION ALL SELECT 'two', x FROM n WHERE x <= 6
UNION ALL SELECT 'car', x FROM n WHERE x <= 2
UNION ALL SELECT 'pet', x FROM n WHERE x <= 5
UNION ALL VALUES ('one', 40), ('one', 318), ('two', 50);
