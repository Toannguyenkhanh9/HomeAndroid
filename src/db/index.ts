import {open, QuickSQLiteConnection} from 'react-native-quick-sqlite';

let db: QuickSQLiteConnection | null = null;

export function getDb() {
  if (!db) db = open({name: 'rent.db'});
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

export function initDb() {
  const schema = SCHEMA_SQL_STRING;
  for (const stmt of schema.split(';')) {
    const s = stmt.trim();
    if (s) exec(s + ';');
  }
}

const SCHEMA_SQL_STRING = `PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS apartments (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, apartment_id TEXT NOT NULL, code TEXT NOT NULL, floor INTEGER, area REAL, status TEXT DEFAULT 'available', UNIQUE(apartment_id, code));
CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, lease_type TEXT NOT NULL, start_date TEXT NOT NULL, billing_cycle TEXT NOT NULL, base_rent INTEGER NOT NULL, deposit_amount INTEGER DEFAULT 0, status TEXT DEFAULT 'active');
CREATE TABLE IF NOT EXISTS charge_types (id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT, pricing_model TEXT DEFAULT 'flat', unit_price INTEGER, meta_json TEXT);
CREATE TABLE IF NOT EXISTS recurring_charges (id TEXT PRIMARY KEY, lease_id TEXT NOT NULL, charge_type_id TEXT NOT NULL, unit_price INTEGER, config_json TEXT);
CREATE TABLE IF NOT EXISTS meter_readings (id TEXT PRIMARY KEY, lease_id TEXT NOT NULL, charge_type_id TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, start_reading REAL NOT NULL, end_reading REAL NOT NULL);
CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, lease_id TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, issue_date TEXT NOT NULL, subtotal INTEGER NOT NULL, total INTEGER NOT NULL, status TEXT DEFAULT 'draft');
CREATE TABLE IF NOT EXISTS invoice_items (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, description TEXT NOT NULL, quantity REAL DEFAULT 1, unit TEXT, unit_price INTEGER NOT NULL, amount INTEGER NOT NULL, charge_type_id TEXT, meta_json TEXT);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, payment_date TEXT NOT NULL, amount INTEGER NOT NULL, method TEXT, reference_code TEXT);`;
