import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import type {
  CalendarEventItem,
  ControlEnvioRegistro,
  RawContactRow,
  SharedAppStateSnapshot,
} from '../src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = fs.existsSync(path.resolve(__dirname, '../data'))
  ? path.resolve(__dirname, '../data')
  : path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'popurri.db');
const LEGACY_JSON_PATH = path.join(DATA_DIR, 'popurri_shared_state.json');
const TMP_LEGACY_JSON_PATH = path.join(os.tmpdir(), 'popurri_shared_state.json');

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let dbPath = DB_PATH;
  try {
    dbInstance = new DatabaseSync(dbPath);
  } catch (err) {
    console.warn(`[SQLite] No se pudo abrir DB en ${dbPath}, intentando en tmpdir:`, err);
    dbPath = path.join(os.tmpdir(), 'popurri.db');
    dbInstance = new DatabaseSync(dbPath);
  }

  // Configuración de alto rendimiento (WAL mode, foreign keys, synchronous normal)
  dbInstance.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);

  initSchema(dbInstance);
  migrateFromLegacyJsonIfEmpty(dbInstance);

  return dbInstance;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      barrio TEXT NOT NULL DEFAULT '',
      tel_raw TEXT NOT NULL DEFAULT '',
      tel_norm TEXT NOT NULL DEFAULT '',
      email TEXT DEFAULT '',
      rsp TEXT NOT NULL DEFAULT 'Nuevo',
      adhirio TEXT NOT NULL DEFAULT 'Pendiente',
      comentario TEXT DEFAULT '',
      en_sheets INTEGER NOT NULL DEFAULT 1,
      fecha_agregado TEXT,
      ultimo_contacto TEXT,
      intentos INTEGER DEFAULT 0,
      primer_contacto_enviado INTEGER DEFAULT 0,
      fecha_primer_contacto TEXT,
      estado_flujo TEXT,
      estado_flujo_etiqueta TEXT,
      actualizado_en_app_at TEXT,
      referidos_caba_ya_enviado INTEGER DEFAULT 0,
      ultimo_mensaje_corte_enviado_at TEXT,
      alerta_vencido_oculta_fecha TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_barrio ON contacts(barrio);
    CREATE INDEX IF NOT EXISTS idx_contacts_adhirio ON contacts(adhirio);
    CREATE INDEX IF NOT EXISTS idx_contacts_estado_flujo ON contacts(estado_flujo);
    CREATE INDEX IF NOT EXISTS idx_contacts_tel_norm ON contacts(tel_norm);

    CREATE TABLE IF NOT EXISTS control_envios (
      id_registro TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      nombre TEXT NOT NULL,
      barrio TEXT DEFAULT '',
      telefono TEXT DEFAULT '',
      fecha_hora_iso TEXT NOT NULL,
      fecha_hora_legible TEXT DEFAULT '',
      tipo_accion TEXT NOT NULL,
      estado_anterior_label TEXT DEFAULT '',
      estado_nuevo_label TEXT DEFAULT '',
      extracto_mensaje TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_control_contact_id ON control_envios(contact_id);
    CREATE INDEX IF NOT EXISTS idx_control_fecha_hora ON control_envios(fecha_hora_iso);

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      location TEXT DEFAULT '',
      fecha TEXT DEFAULT '',
      fecha_iso TEXT DEFAULT '',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      start_iso TEXT DEFAULT '',
      end_iso TEXT DEFAULT '',
      lat REAL,
      lng REAL,
      source TEXT DEFAULT 'manual',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    DELETE FROM calendar_events 
    WHERE lower(summary) LIKE '%dentista%' 
       OR lower(summary) LIKE '%reunión virtual%' 
       OR lower(summary) LIKE '%reunion virtual%' 
       OR lower(summary) LIKE '%almuerzo con frima%'
       OR id LIKE '%dentista%' 
       OR id LIKE '%reunion-virtual%'
       OR id LIKE '%almuerzo-frima%';
  `);
}

function migrateFromLegacyJsonIfEmpty(db: DatabaseSync): void {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM contacts').get() as { cnt: number } | undefined;
  if (countRow && countRow.cnt > 0) {
    return; // Ya contiene datos
  }

  // Buscar archivo JSON para migración
  let rawJson: string | null = null;
  for (const candidate of [LEGACY_JSON_PATH, TMP_LEGACY_JSON_PATH]) {
    try {
      if (fs.existsSync(candidate)) {
        rawJson = fs.readFileSync(candidate, 'utf-8');
        if (rawJson.trim()) break;
      }
    } catch {
      // Ignorar
    }
  }

  if (!rawJson) return;

  try {
    const data = JSON.parse(rawJson) as Partial<SharedAppStateSnapshot>;
    if (!data || typeof data !== 'object') return;

    console.log('[SQLite] Migrando datos desde popurri_shared_state.json a popurri.db...');

    // 1. Migrar contactos
    if (Array.isArray(data.rawContacts) && data.rawContacts.length > 0) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO contacts (
          id, nombre, barrio, tel_raw, tel_norm, email, rsp, adhirio, comentario,
          en_sheets, fecha_agregado, ultimo_contacto, intentos, primer_contacto_enviado,
          fecha_primer_contacto, estado_flujo, estado_flujo_etiqueta,
          actualizado_en_app_at, referidos_caba_ya_enviado,
          ultimo_mensaje_corte_enviado_at, alerta_vencido_oculta_fecha, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, datetime('now')
        )
      `);

      for (const c of data.rawContacts) {
        if (!c.id) continue;
        const cleanTel = (c as any).telefonoNorm || c.tel || (c.telRaw ? String(c.telRaw).replace(/\D+/g, '') : '');
        stmt.run(
          String(c.id).trim(),
          c.nombre || '',
          c.barrio || '',
          c.telRaw || '',
          cleanTel,
          c.email || '',
          c.rsp || 'Nuevo',
          c.adhirio || 'Pendiente',
          c.comentario || '',
          c.enSheets ? 1 : 0,
          c.fechaAgregado || null,
          c.ultimoContacto || null,
          c.intentos || 0,
          c.primerContactoEnviado ? 1 : 0,
          c.fechaPrimerContacto || null,
          c.estadoFlujo || null,
          c.estadoFlujoEtiqueta || null,
          c.actualizadoEnAppAt || null,
          c.referidosCabaYaEnviado ? 1 : 0,
          c.ultimoMensajeCorteEnviadoAt || null,
          c.alertaVencidoOcultaFecha || null
        );
      }
      console.log(`[SQLite] ${data.rawContacts.length} contactos migrados.`);
    }

    // 2. Migrar historial de envíos
    if (Array.isArray(data.controlEnvios) && data.controlEnvios.length > 0) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO control_envios (
          id_registro, contact_id, nombre, barrio, telefono,
          fecha_hora_iso, fecha_hora_legible, tipo_accion,
          estado_anterior_label, estado_nuevo_label, extracto_mensaje
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?
        )
      `);

      for (const e of data.controlEnvios) {
        if (!e.idRegistro) continue;
        stmt.run(
          e.idRegistro,
          e.contactId || '',
          e.nombre || '',
          e.barrio || '',
          (e as any).telefono || e.telRaw || '',
          (e as any).fechaHoraISO || e.fechaHora || new Date().toISOString(),
          (e as any).fechaHoraLegible || '',
          (e as any).tipoAccion || e.tipoMensaje || '',
          (e as any).estadoAnteriorLabel || e.estadoAnterior || '',
          (e as any).estadoNuevoLabel || e.estadoNuevoEtiqueta || String(e.estadoNuevo || ''),
          (e as any).extractoMensaje || e.comentario || ''
        );
      }
      console.log(`[SQLite] ${data.controlEnvios.length} registros de envíos migrados.`);
    }

    // 3. Migrar eventos de calendar
    if (Array.isArray(data.calendarEvents) && data.calendarEvents.length > 0) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO calendar_events (
          id, summary, location, fecha, fecha_iso, start_time, end_time,
          start_iso, end_iso, lat, lng, source
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `);

      for (const ev of data.calendarEvents) {
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
          (ev as any).source || 'migrado'
        );
      }
      console.log(`[SQLite] ${data.calendarEvents.length} eventos de calendar migrados.`);
    }

    // 4. Migrar configuraciones
    const settingsStmt = db.prepare(`
      INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    `);

    if (data.profile) {
      settingsStmt.run('profile', JSON.stringify(data.profile));
    }
    if (data.sheetUrlInput) {
      settingsStmt.run('sheetUrlInput', JSON.stringify(data.sheetUrlInput));
    }
    if (data.appsScriptUrlInput) {
      settingsStmt.run('appsScriptUrlInput', JSON.stringify(data.appsScriptUrlInput));
    }
    if (data.calendarIcalUrlInput) {
      settingsStmt.run('calendarIcalUrlInput', JSON.stringify(data.calendarIcalUrlInput));
    }
    if (data.modalidadOverrideByBloque) {
      settingsStmt.run('modalidadOverrideByBloque', JSON.stringify(data.modalidadOverrideByBloque));
    }
    if (data.cafeHubOverrideByBloque) {
      settingsStmt.run('cafeHubOverrideByBloque', JSON.stringify(data.cafeHubOverrideByBloque));
    }
    if (data.respuestasConsolidadasLog) {
      settingsStmt.run('respuestasConsolidadasLog', JSON.stringify(data.respuestasConsolidadasLog));
    }
    if (data.sentContactIds) {
      settingsStmt.run('sentContactIds', JSON.stringify(data.sentContactIds));
    }
    if (data.alertaOcultaIds) {
      settingsStmt.run('alertaOcultaIds', JSON.stringify(data.alertaOcultaIds));
    }
    settingsStmt.run('version', JSON.stringify(data.version || 1));

    console.log('[SQLite] Migración de datos completada exitosamente.');
  } catch (err) {
    console.error('[SQLite] Error durante la migración de datos legacy:', err);
  }
}
