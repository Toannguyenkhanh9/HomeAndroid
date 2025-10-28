// src/db/index.ts
import { open, QuickSQLiteConnection } from 'react-native-quick-sqlite';
import { runMigrations } from './migrations';
let db: QuickSQLiteConnection | null = null;

export function getDb() {
  if (!db) db = open({ name: 'rent.db' });
  return db!;
}

export function exec(sql: string, params: any[] = []) {
  const _db = getDb();
  _db.execute(sql, params);
}

export function query<T = any>(sql: string, params: any[] = []) {
  const _db = getDb();
  const res = _db.execute(sql, params);
  const rows: T[] = [];
  for (let i = 0; i < res.rows.length; i++) rows.push(res.rows.item(i) as T);
  return rows;
}

/** Tiện ích kiểm tra cột tồn tại */
function hasColumn(table: string, column: string) {
  const info = query<{ name: string }>(`PRAGMA table_info(${table})`);
  return info.some((r) => String(r.name) === column);
}

/** Tạo bảng & migrate lặt vặt */
export function initDb() {
  // 1) Schema base
  for (const stmt of SCHEMA_SQL_STRING.split(';')) {
    const s = stmt.trim();
    if (s) exec(s + ';');
  }

  // 2) Migrate cột leases.base_rent_collect (thu tiền nhà: 'start'|'end')
  if (!hasColumn('leases', 'base_rent_collect')) {
    exec(`ALTER TABLE leases ADD COLUMN base_rent_collect TEXT NOT NULL DEFAULT 'start'`);
  }

  // 3) Migrate tên bảng recurring_charges (nếu trước đây dùng lease_recurring_charges)
  ensureRecurringChargesTable();
  runMigrations(exec, query);
}

/** Đảm bảo + migrate bảng recurring_charges (từ tên cũ nếu có) */
export function ensureRecurringChargesTable() {
  exec(`
    CREATE TABLE IF NOT EXISTS recurring_charges (
      id TEXT PRIMARY KEY,
      lease_id TEXT NOT NULL,
      charge_type_id TEXT NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0,
      is_variable INTEGER NOT NULL DEFAULT 0,  -- 0=fixed, 1=variable
      config_json TEXT,
      UNIQUE (lease_id, charge_type_id)
    )
  `);

  const row = query<{ c: number }>(`
    SELECT COUNT(*) AS c
    FROM sqlite_master
    WHERE type='table' AND name='lease_recurring_charges'
  `)[0];

  if ((row?.c ?? 0) > 0) {
    const copied =
      query<{ c: number }>(`SELECT COUNT(*) AS c FROM recurring_charges`)[0]?.c ?? 0;
    if (copied === 0) {
      exec(`
        INSERT INTO recurring_charges (id, lease_id, charge_type_id, unit_price, is_variable, config_json)
        SELECT id, lease_id, charge_type_id, unit_price, is_variable, config_json
        FROM lease_recurring_charges
      `);
    }
    exec(`DROP TABLE lease_recurring_charges`);
  }
}

/* =================================================================== */
/* ========================   BASE SCHEMA   =========================== */
/* =================================================================== */

const SCHEMA_SQL_STRING = `PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS apartments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL,
  code TEXT NOT NULL,
  floor INTEGER,
  area REAL,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (apartment_id, code)
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  id_number TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leases (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  lease_type TEXT NOT NULL,          -- 'short_term' | 'long_term'
  start_date TEXT NOT NULL,          -- YYYY-MM-DD
  billing_cycle TEXT NOT NULL,       -- 'daily' | 'monthly' | 'yearly'
  base_rent REAL NOT NULL DEFAULT 0, -- tiền nhà
  deposit_amount REAL DEFAULT 0,
  duration_days INTEGER,
  is_all_inclusive INTEGER DEFAULT 0,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  tenant_id TEXT
  -- base_rent_collect được thêm qua migration ở initDb()
);

CREATE TABLE IF NOT EXISTS charge_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT,
  pricing_model TEXT NOT NULL DEFAULT 'flat', -- 'flat' | 'per_unit'
  unit_price REAL NOT NULL DEFAULT 0,
  meta_json TEXT
);

CREATE TABLE IF NOT EXISTS recurring_charges (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  charge_type_id TEXT NOT NULL,
  unit_price REAL NOT NULL DEFAULT 0,
  is_variable INTEGER NOT NULL DEFAULT 0,
  config_json TEXT
);

CREATE TABLE IF NOT EXISTS lease_cycles (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  period_start TEXT NOT NULL,  -- YYYY-MM-DD
  period_end   TEXT NOT NULL,
  due_date     TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'settled'
  invoice_id TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  issue_date   TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  total    REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'     -- open | partial | paid
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  charge_type_id TEXT,
  meta_json TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT,
  reference_code TEXT
);`;
