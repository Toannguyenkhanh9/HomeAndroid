import {query, exec} from '../db';

const TABLES = [
  'apartments',
  'rooms',
  'tenants',
  'leases',
  'charge_types',
  'recurring_charges',
  'lease_cycles',
  'invoices',
  'invoice_items',
  'payments',
  'operating_expenses',
] as string[];

export function exportAll() {
  const d: Record<string, any[]> = {};
  for (const t of TABLES) {
    d[t] = query(`SELECT * FROM ${t}`);
  }
  return d;
}

export function exportAllAsJson(pretty = true) {
  return JSON.stringify(exportAll(), null, pretty ? 2 : 0);
}

export function importFromJson(s: string) {
  const d = JSON.parse(s) as Record<string, any[]>;
  for (const t of TABLES) {
    const rows = (d[t] ?? []) as any[];
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const cols = Object.keys(r);
      const ph = cols.map(() => '?').join(',');
      exec(
        `INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${ph})`,
        cols.map(c => r[c]),
      );
    }
  }
}
