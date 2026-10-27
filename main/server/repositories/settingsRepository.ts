import { getDatabase } from '../db';

export function getSetting<T>(key: string, defaultValue?: T): T {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return defaultValue as T;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return (row.value as unknown) as T;
  }
}

export function setSetting<T>(key: string, value: T): void {
  const db = getDatabase();
  const serialized = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
  db.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
  `).run(key, serialized);
}

export function getAllSettings(): Record<string, any> {
  const db = getDatabase();
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as unknown as {
    key: string;
    value: string;
  }[];

  const result: Record<string, any> = {};
  for (const r of rows) {
    try {
      result[r.key] = JSON.parse(r.value);
    } catch {
      result[r.key] = r.value;
    }
  }
  return result;
}
