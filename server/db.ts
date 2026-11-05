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

import { getDataDirectory } from './platformPaths';

const DATA_DIR = getDataDirectory();

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
      dias_encuentro TEXT DEFAULT '',
      hora_inicio TEXT DEFAULT '',
      hora_fin TEXT DEFAULT '',
      horario_encuentro TEXT DEFAULT '',
      calle_o_cruce TEXT DEFAULT '',
      piso_depto TEXT DEFAULT '',
      fichas_extras_cantidad TEXT DEFAULT '',
      retiro_confirmado INTEGER DEFAULT 0,
      fecha_estado_punto_sede TEXT DEFAULT NULL,
      vocativo_override TEXT DEFAULT '',
      fecha_adhesion TEXT DEFAULT NULL,
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

    CREATE TABLE IF NOT EXISTS wa_campaigns (
      id TEXT PRIMARY KEY,
      day_date_ba TEXT NOT NULL,
      warmup_day_number INTEGER NOT NULL DEFAULT 1,
      warmup_level TEXT NOT NULL DEFAULT 'DIA_1_MAX_10',
      daily_quota_limit INTEGER NOT NULL DEFAULT 12,
      modo_cola TEXT NOT NULL DEFAULT 'PRIMER_CONTACTO',
      barrio_filtro TEXT NOT NULL DEFAULT 'Todos',
      started_at_iso TEXT NOT NULL,
      finished_at_iso TEXT,
      target_count INTEGER NOT NULL DEFAULT 0,
      sent_ok_count INTEGER NOT NULL DEFAULT 0,
      invalid_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      contact_ids_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_wa_campaigns_day ON wa_campaigns(day_date_ba);
  `);

  for (const colSql of [
    "ALTER TABLE contacts ADD COLUMN dias_encuentro TEXT DEFAULT ''",
    "ALTER TABLE contacts ADD COLUMN hora_inicio TEXT DEFAULT ''",
    "ALTER TABLE contacts ADD COLUMN hora_fin TEXT DEFAULT ''",
    "ALTER TABLE contacts ADD COLUMN horario_encuentro TEXT DEFAULT ''",
    "ALTER TABLE contacts ADD COLUMN calle_o_cruce TEXT DEFAULT ''",
    "ALTER TABLE contacts ADD COLUMN piso_depto TEXT DEFAULT ''",
    "ALTER TABLE contacts ADD COLUMN fichas_extras_cantidad TEXT DEFAULT ''",
    "ALTER TABLE contacts ADD COLUMN retiro_confirmado INTEGER DEFAULT 0",
    "ALTER TABLE contacts ADD COLUMN fecha_estado_punto_sede TEXT DEFAULT NULL",
    "ALTER TABLE contacts ADD COLUMN vocativo_override TEXT DEFAULT ''",
    "ALTER TABLE contacts ADD COLUMN fecha_adhesion TEXT DEFAULT NULL",
    "ALTER TABLE contacts ADD COLUMN asignado_a TEXT DEFAULT 'cesar'",
    "ALTER TABLE contacts ADD COLUMN asignado_fecha TEXT DEFAULT NULL",
  ]) {
    try {
      db.exec(colSql);
    } catch {
      // Columna ya existe
    }
  }

  normalizeAndBackfillWaCampaigns(db);
}

function normalizeAndBackfillWaCampaigns(db: DatabaseSync): void {
  try {
    // 1. Normalizar cualquier fecha_hora_iso en control_envios que no esté en formato ISO-8601 (ej. "01:08 p. m.")
    const enviosRows = db
      .prepare(
        'SELECT id_registro, contact_id, nombre, barrio, telefono, tipo_accion, fecha_hora_iso, created_at FROM control_envios'
      )
      .all() as Array<{
      id_registro: string;
      contact_id: string;
      nombre: string;
      barrio: string;
      telefono: string;
      tipo_accion: string;
      fecha_hora_iso: string;
      created_at: string;
    }>;

    const updateIsoStmt = db.prepare(
      'UPDATE control_envios SET fecha_hora_iso = ?, fecha_hora_legible = ? WHERE id_registro = ?'
    );

    for (const r of enviosRows) {
      const rawIso = String(r.fecha_hora_iso || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}T/.test(rawIso)) {
        let resolvedIso: string | null = null;
        const mMs = String(r.id_registro || '').match(/(\d{13})/);
        if (mMs) {
          resolvedIso = new Date(Number(mMs[1])).toISOString();
        } else if (r.created_at && /^\d{4}-\d{2}-\d{2}/.test(r.created_at)) {
          resolvedIso = r.created_at.includes('T')
            ? r.created_at
            : `${r.created_at.replace(' ', 'T')}Z`;
        }
        if (resolvedIso) {
          updateIsoStmt.run(resolvedIso, rawIso || resolvedIso, r.id_registro);
          r.fecha_hora_iso = resolvedIso;
        }
      }
    }

    // 2. Si wa_campaigns está vacía y existen envíos en control_envios, reconstruir las campañas históricas por día BA
    const countCamp = db.prepare('SELECT COUNT(*) as cnt FROM wa_campaigns').get() as
      | { cnt: number }
      | undefined;
    if (!countCamp || countCamp.cnt === 0) {
      const byDayMap = new Map<
        string,
        {
          startedAt: string;
          finishedAt: string;
          okContacts: Set<string>;
          invalidContacts: Set<string>;
          failedCount: number;
        }
      >();

      for (const r of enviosRows) {
        const iso = r.fecha_hora_iso;
        if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) continue;
        const accion = String(r.tipo_accion || '').toLowerCase();
        // Contabilizar envíos automatizados de primer contacto para reconstruir las campañas
        const esAuto =
          accion.includes('primer_contacto') ||
          accion.includes('1er_contacto') ||
          accion.includes('auto wa web') ||
          accion.includes('fallo wa web') ||
          accion.includes('inexistente');
        if (!esAuto) continue;

        const dayBA = new Date(iso).toLocaleDateString('en-CA', {
          timeZone: 'America/Argentina/Buenos_Aires',
        });
        if (!byDayMap.has(dayBA)) {
          byDayMap.set(dayBA, {
            startedAt: iso,
            finishedAt: iso,
            okContacts: new Set<string>(),
            invalidContacts: new Set<string>(),
            failedCount: 0,
          });
        }
        const entry = byDayMap.get(dayBA)!;
        if (iso < entry.startedAt) entry.startedAt = iso;
        if (iso > entry.finishedAt) entry.finishedAt = iso;
        const cid = String(r.contact_id || r.telefono || r.id_registro).trim();
        if (accion.includes('inexistente')) {
          entry.invalidContacts.add(cid);
        } else if (accion.includes('fallo')) {
          entry.failedCount++;
        } else {
          entry.okContacts.add(cid);
        }
      }

      // Filtrar días con campañas reales (>= 2 contactos procesados) y ordenarlos cronológicamente
      const sortedDays = Array.from(byDayMap.entries())
        .filter(([, v]) => v.okContacts.size + v.invalidContacts.size >= 2)
        .sort((a, b) => a[0].localeCompare(b[0]));

      const insertCampStmt = db.prepare(`
        INSERT OR REPLACE INTO wa_campaigns (
          id, day_date_ba, warmup_day_number, warmup_level, daily_quota_limit,
          modo_cola, barrio_filtro, started_at_iso, finished_at_iso,
          target_count, sent_ok_count, invalid_count, failed_count, status, contact_ids_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      sortedDays.forEach(([dayBA, stats], idx) => {
        const warmupDayNum = idx + 1;
        const warmupLevel =
          warmupDayNum === 1
            ? 'DIA_1_MAX_10'
            : warmupDayNum === 2
            ? 'DIA_2_MAX_15'
            : warmupDayNum === 3
            ? 'DIA_3_MAX_25'
            : warmupDayNum === 4
            ? 'DIA_4_MAX_35'
            : 'DIA_5_MADURO_MENOS_45';
        const quotaLimit =
          warmupDayNum === 1
            ? 12
            : warmupDayNum === 2
            ? 18
            : warmupDayNum === 3
            ? 24
            : warmupDayNum === 4
            ? 32
            : 40;
        const sentOk = stats.okContacts.size;
        const invalidCnt = stats.invalidContacts.size;
        const contactIdsArr = Array.from(stats.okContacts);

        insertCampStmt.run(
          `camp-hist-${dayBA}`,
          dayBA,
          warmupDayNum,
          warmupLevel,
          quotaLimit,
          'PRIMER_CONTACTO',
          'Todos',
          stats.startedAt,
          stats.finishedAt,
          Math.max(sentOk, quotaLimit),
          sentOk,
          invalidCnt,
          stats.failedCount,
          'COMPLETED',
          JSON.stringify(contactIdsArr)
        );
      });
    }
  } catch (err) {
    console.warn('[SQLite] Error en normalizeAndBackfillWaCampaigns:', err);
  }
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
