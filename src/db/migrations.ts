// src/db/migrations.ts
type Exec = (sql: string, params?: any[]) => void;
type Query = <T = any>(sql: string, params?: any[]) => T[];

export function runMigrations(exec: Exec, query: Query) {
  const hasColumn = (table: string, col: string) => {
    try { return query<any>(`PRAGMA table_info(${table})`).some(r => String(r.name) === col); }
    catch { return false; }
  };
  const getVer = () => {
    try {
      const v = (query<any>('PRAGMA user_version')[0] || {}).user_version;
      return typeof v === 'number' ? v : Number(v || 0);
    } catch { return 0; }
  };
  const setVer = (v: number) => exec(`PRAGMA user_version = ${v}`);

  let v = getVer();

  // v1: KV store (global settings)
  if (v < 1) {
    exec(`CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value_json TEXT
    )`);
    setVer(1); v = 1;
  }

  // v2: late_fee_json cho leases
  if (v < 2) {
    if (!hasColumn('leases', 'late_fee_json')) {
      exec(`ALTER TABLE leases ADD COLUMN late_fee_json TEXT`);
    }
    setVer(2); v = 2;
  }

  // v3: QR path trên invoices (nếu bạn dùng)
  if (v < 3) {
    if (!hasColumn('invoices', 'qr_png_path')) {
      exec(`ALTER TABLE invoices ADD COLUMN qr_png_path TEXT`);
    }
    setVer(3); v = 3;
  }

  // v4: index due_date
  if (v < 4) {
    exec(`CREATE INDEX IF NOT EXISTS idx_cycles_due ON lease_cycles(due_date)`);
    setVer(4); v = 4;
  }

  // v5: Charge Catalog theo tòa + liên kết xuống recurring_charges
  if (v < 5) {
    exec(`
      CREATE TABLE IF NOT EXISTS catalog_charges (
        id TEXT PRIMARY KEY,
        apartment_id TEXT,
        charge_type_id TEXT,
        name TEXT NOT NULL,
        unit TEXT,
        is_variable INTEGER NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        config_json TEXT DEFAULT '{}'
      )
    `);
    exec(`CREATE INDEX IF NOT EXISTS idx_catalog_apartment ON catalog_charges(apartment_id)`);
    if (!hasColumn('recurring_charges', 'source_catalog_id')) {
      exec(`ALTER TABLE recurring_charges ADD COLUMN source_catalog_id TEXT`);
    }
    exec(`CREATE INDEX IF NOT EXISTS idx_recurring_source_catalog ON recurring_charges(source_catalog_id)`);
    setVer(5); v = 5;
  }
}
