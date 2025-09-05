import {query, exec} from '../db';

const TABLES = ['apartments','rooms','leases','charge_types','recurring_charges','meter_readings','invoices','invoice_items','payments'] as const;

export function exportAll() {
  const data: Record<string, any[]> = {};
  for (const t of TABLES) data[t] = query(`SELECT * FROM ${t}`);
  return data;
}
export function exportAllAsJson(pretty = true) {
  return JSON.stringify(exportAll(), null, pretty ? 2 : 0);
}
export function importFromJson(jsonStr: string) {
  const data = JSON.parse(jsonStr) as Record<string, any[]>;
  for (const t of TABLES) {
    const rows = (data[t] ?? []) as any[];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const cols = Object.keys(row);
      const placeholders = cols.map(()=>'?').join(',');
      const sql = `INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`;
      exec(sql, cols.map(c=> row[c]));
    }
  }
}
