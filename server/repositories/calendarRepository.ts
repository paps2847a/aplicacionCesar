import { getDatabase } from '../db';
import type { CalendarEventItem } from '../../src/types';

interface CalendarEventDb {
  id: string;
  summary: string;
  location: string | null;
  fecha: string | null;
  fecha_iso: string | null;
  start_time: string;
  end_time: string;
  start_iso: string | null;
  end_iso: string | null;
  lat: number | null;
  lng: number | null;
  source: string | null;
  updated_at: string;
}

function mapDbToCalendarEvent(row: CalendarEventDb): CalendarEventItem {
  return {
    id: row.id,
    summary: row.summary,
    location: row.location || undefined,
    fecha: row.fecha || '',
    fechaISO: row.fecha_iso || undefined,
    startTime: row.start_time,
    endTime: row.end_time,
    startIso: row.start_iso || undefined,
    endIso: row.end_iso || undefined,
    lat: row.lat !== null ? row.lat : undefined,
    lng: row.lng !== null ? row.lng : undefined,
  };
}

export function getCalendarEvents(): CalendarEventItem[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM calendar_events
    ORDER BY fecha_iso ASC, start_time ASC
  `).all() as unknown as CalendarEventDb[];

  return rows.map(mapDbToCalendarEvent);
}

export function replaceCalendarEvents(events: CalendarEventItem[], source: string = 'sync'): void {
  const db = getDatabase();
  db.exec('BEGIN TRANSACTION;');
  try {
    if (source === 'ical_sync' || source === 'sync' || source === 'state_sync') {
      db.prepare("DELETE FROM calendar_events WHERE source IN ('ical_sync', 'sync', 'state_sync', 'migrado') OR source IS NULL").run();
    } else {
      db.prepare('DELETE FROM calendar_events WHERE source = ? OR source IS NULL').run(source);
    }
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO calendar_events (
        id, summary, location, fecha, fecha_iso, start_time, end_time,
        start_iso, end_iso, lat, lng, source, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    for (const ev of events) {
      if (!ev.id) continue;
      const sNorm = String(ev.summary || '').toLowerCase();
      const idNorm = String(ev.id || '').toLowerCase();
      if (
        sNorm.includes('dentista') ||
        sNorm.includes('reunión virtual') ||
        sNorm.includes('reunion virtual') ||
        sNorm.includes('almuerzo con frima') ||
        idNorm.includes('dentista') ||
        idNorm.includes('reunion-virtual') ||
        idNorm.includes('almuerzo-frima')
      ) {
        continue;
      }
      stmt.run(
        ev.id,
        ev.summary || 'Compromiso',
        ev.location || '',
        ev.fecha || '',
        ev.fechaISO || '',
        ev.startTime || '09:00',
        ev.endTime || '10:00',
        ev.startIso || '',
        ev.endIso || '',
        ev.lat || null,
        ev.lng || null,
        source
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function upsertCalendarEvent(ev: CalendarEventItem, source: string = 'manual'): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO calendar_events (
      id, summary, location, fecha, fecha_iso, start_time, end_time,
      start_iso, end_iso, lat, lng, source, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  stmt.run(
    ev.id,
    ev.summary || 'Compromiso',
    ev.location || '',
    ev.fecha || '',
    ev.fechaISO || '',
    ev.startTime || '09:00',
    ev.endTime || '10:00',
    ev.startIso || '',
    ev.endIso || '',
    ev.lat || null,
    ev.lng || null,
    source
  );
}

export function deleteCalendarEvent(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
}
