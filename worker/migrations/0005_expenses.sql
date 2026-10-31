-- Gastos del negocio (el stock del Excel): compras, envíos que paga el negocio e intereses de préstamos. No caducan.
-- year es el del primer plazo (el de STOCK_AÑO en el Excel).
CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('tool', 'consumable', 'material', 'shipping', 'loan')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_cents INTEGER NOT NULL CHECK (total_cents > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX expenses_year ON expenses(year DESC);

-- Lo adelantado cada mes (YYYY-MM, de nómina a nómina). Un gasto puede pagarse en varios plazos de meses distintos.
-- expense_id NULL: importe de un mes del Excel sin gasto asociado (importación del histórico).
CREATE TABLE advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
    month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
);
CREATE INDEX advances_expense ON advances(expense_id);
CREATE INDEX advances_month ON advances(month);

-- Dinero cobrado que se destina a recuperar lo adelantado en un mes; el mes lo elige el usuario.
CREATE TABLE recoveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX recoveries_month ON recoveries(month);
