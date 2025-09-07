import {exec} from './index';

/** Tạo bảng chi phí hoạt động nếu chưa có */
export function ensureOperatingExpensesTable(){
  exec(`CREATE TABLE IF NOT EXISTS operating_expenses (
    id TEXT PRIMARY KEY,
    apartment_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
}
