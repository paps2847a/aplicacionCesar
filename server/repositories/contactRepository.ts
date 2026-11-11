import { getDatabase } from '../db';
import type { RawContactRow } from '../../src/types';

interface ContactRowDb {
  id: string;
  nombre: string;
  barrio: string;
  tel_raw: string;
  tel_norm: string;
  email: string | null;
  rsp: string;
  adhirio: string;
  comentario: string | null;
  en_sheets: number;
  fecha_agregado: string | null;
  ultimo_contacto: string | null;
  intentos: number;
  primer_contacto_enviado: number;
  fecha_primer_contacto: string | null;
  estado_flujo: string | null;
  estado_flujo_etiqueta: string | null;
  actualizado_en_app_at: string | null;
  referidos_caba_ya_enviado: number;
  ultimo_mensaje_corte_enviado_at: string | null;
  alerta_vencido_oculta_fecha: string | null;
  dias_encuentro?: string | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  horario_encuentro?: string | null;
  calle_o_cruce: string | null;
  piso_depto?: string | null;
  fichas_extras_cantidad?: string | null;
  retiro_confirmado?: number | null;
  fecha_estado_punto_sede?: string | null;
  vocativo_override: string | null;
  fecha_adhesion: string | null;
  asignado_a?: string | null;
  asignado_fecha?: string | null;
  created_at: string;
  updated_at: string;
}

function canonicalContactId(rawId: unknown): string {
  const clean = String(rawId ?? '')
    .trim()
    .replace(/^#+/, '')
    .trim();
  if (/^\d+$/.test(clean)) {
    return String(Number(clean));
  }
  return clean;
}

function extractPhoneLast8(rawPhone: unknown): string {
  const digits = String(rawPhone ?? '').replace(/\D+/g, '');
  return digits.length >= 8 ? digits.slice(-8) : '';
}

function normalizeNameForDedupe(rawName: unknown): string {
  return String(rawName ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapDbToContact(row: ContactRowDb): RawContactRow {
  return {
    id: canonicalContactId(row.id) || row.id,
    nombre: row.nombre || '',
    vocativoOverride: row.vocativo_override || undefined,
    diasEncuentro: row.dias_encuentro || undefined,
    horaInicio: row.hora_inicio || undefined,
    horaFin: row.hora_fin || undefined,
    horarioEncuentro: row.horario_encuentro || undefined,
    calleOCruce: row.calle_o_cruce || undefined,
    pisoDepto: row.piso_depto || undefined,
    barrio: row.barrio || '',
    telRaw: row.tel_raw || '',
    tel: row.tel_norm || (row.tel_raw ? String(row.tel_raw).replace(/\D+/g, '') : undefined),
    email: row.email || undefined,
    rsp: (row.rsp as any) || 'Nuevo',
    adhirio: (row.adhirio as any) || 'Pendiente',
    comentario: row.comentario || '',
    fichasExtrasCantidad: row.fichas_extras_cantidad || undefined,
    retiroConfirmado: Boolean(row.retiro_confirmado),
    fechaEstadoPuntoSede: row.fecha_estado_punto_sede || undefined,
    enSheets: Boolean(row.en_sheets),
    fechaAgregado: row.fecha_agregado || undefined,
    ultimoContacto: row.ultimo_contacto || undefined,
    intentos: row.intentos || 0,
    primerContactoEnviado: Boolean(row.primer_contacto_enviado),
    fechaPrimerContacto: row.fecha_primer_contacto || undefined,
    fechaAdhesion: row.fecha_adhesion || undefined,
    estadoFlujo: (row.estado_flujo as any) || undefined,
    estadoFlujoEtiqueta: row.estado_flujo_etiqueta || undefined,
    actualizadoEnAppAt: row.actualizado_en_app_at || undefined,
    referidosCabaYaEnviado: Boolean(row.referidos_caba_ya_enviado),
    ultimoMensajeCorteEnviadoAt: row.ultimo_mensaje_corte_enviado_at || undefined,
    alertaVencidoOcultaFecha: row.alerta_vencido_oculta_fecha || undefined,
    asignadoA: row.asignado_a || 'cesar',
    asignadoFecha: row.asignado_fecha || undefined,
  };
}

export function getAllContacts(filters?: {
  barrio?: string;
  adhirio?: string;
  estadoFlujo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): { contacts: RawContactRow[]; total: number } {
  const db = getDatabase();
  const whereClauses: string[] = [];
  const params: any[] = [];

  if (filters?.barrio && filters.barrio !== 'TODOS') {
    whereClauses.push('LOWER(barrio) = LOWER(?)');
    params.push(filters.barrio);
  }

  if (filters?.adhirio && filters.adhirio !== 'TODOS') {
    whereClauses.push('adhirio = ?');
    params.push(filters.adhirio);
  }

  if (filters?.estadoFlujo && filters.estadoFlujo !== 'TODOS') {
    whereClauses.push('estado_flujo = ?');
    params.push(filters.estadoFlujo);
  }

  if (filters?.search && filters.search.trim()) {
    const rawSearch = filters.search.trim();
    if (rawSearch.startsWith('#') && !/\s/.test(rawSearch)) {
      const exactId = rawSearch.replace(/^#+/, '').trim();
      whereClauses.push('LOWER(id) = LOWER(?)');
      params.push(exactId);
    } else {
      const q = `%${rawSearch.toLowerCase()}%`;
      whereClauses.push('(LOWER(nombre) LIKE ? OR LOWER(comentario) LIKE ? OR tel_raw LIKE ? OR LOWER(barrio) LIKE ?)');
      params.push(q, q, q, q);
    }
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM contacts ${whereSql}`).get(...params) as { total: number };
  const total = countRow?.total || 0;

  let querySql = `SELECT * FROM contacts ${whereSql} ORDER BY CAST(id AS INTEGER) ASC, id ASC`;
  if (filters?.limit && filters.limit > 0) {
    querySql += ` LIMIT ${Number(filters.limit)}`;
    if (filters?.offset && filters.offset > 0) {
      querySql += ` OFFSET ${Number(filters.offset)}`;
    }
  }

  const rows = db.prepare(querySql).all(...params) as unknown as ContactRowDb[];
  return {
    contacts: rows.map(mapDbToContact),
    total,
  };
}

export function getContactById(id: string): RawContactRow | null {
  const db = getDatabase();
  const cleanId = canonicalContactId(id);
  const rawId = String(id).trim();
  const row = (db
    .prepare(
      `SELECT * FROM contacts
       WHERE id = ? OR id = ? OR LOWER(REPLACE(TRIM(id), '#', '')) = LOWER(?)
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(cleanId, rawId, cleanId) as unknown as ContactRowDb | undefined);
  return row ? mapDbToContact(row) : null;
}

function resolveExistingContactRowForUpsert(c: RawContactRow): ContactRowDb | undefined {
  const db = getDatabase();
  const cleanId = canonicalContactId(c.id);
  const rawId = String(c.id).trim();

  const byId = db
    .prepare(
      `SELECT * FROM contacts
       WHERE id = ? OR id = ? OR LOWER(REPLACE(TRIM(id), '#', '')) = LOWER(?)
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(cleanId, rawId, cleanId) as unknown as ContactRowDb | undefined;
  if (byId) return byId;

  const telLast8 = extractPhoneLast8((c as any).telefonoNorm || c.tel || c.telRaw);
  const normName = normalizeNameForDedupe(c.nombre);
  if (telLast8) {
    const candidates = db
      .prepare(`SELECT * FROM contacts WHERE tel_norm LIKE ? OR tel_raw LIKE ?`)
      .all(`%${telLast8}`, `%${telLast8}%`) as unknown as ContactRowDb[];
    for (const cand of candidates) {
      const candLast8 = extractPhoneLast8(cand.tel_norm || cand.tel_raw);
      if (candLast8 === telLast8) {
        const candName = normalizeNameForDedupe(cand.nombre);
        if (!normName || !candName || candName === normName) {
          return cand;
        }
      }
    }
  }
  return undefined;
}

export function upsertContact(c: RawContactRow): RawContactRow {
  const db = getDatabase();
  const existingRow = resolveExistingContactRowForUpsert(c);
  const id = canonicalContactId(c.id) || (existingRow ? canonicalContactId(existingRow.id) : String(c.id).trim());
  if (existingRow && existingRow.id !== id) {
    // Si existía con otro formato de ID (ej: "#284" vs "284") o fila desplazada del mismo vecino, migrar sin duplicar
    db.prepare('DELETE FROM contacts WHERE id = ?').run(existingRow.id);
  }
  const telNorm = (c as any).telefonoNorm || c.tel || (c.telRaw ? String(c.telRaw).replace(/\D+/g, '') : '');

  const stmt = db.prepare(`
    INSERT INTO contacts (
      id, nombre, barrio, tel_raw, tel_norm, email, rsp, adhirio, comentario,
      en_sheets, fecha_agregado, ultimo_contacto, intentos, primer_contacto_enviado,
      fecha_primer_contacto, estado_flujo, estado_flujo_etiqueta,
      actualizado_en_app_at, referidos_caba_ya_enviado,
      ultimo_mensaje_corte_enviado_at, alerta_vencido_oculta_fecha,
      dias_encuentro, hora_inicio, hora_fin, horario_encuentro,
      calle_o_cruce, piso_depto, fichas_extras_cantidad, retiro_confirmado, fecha_estado_punto_sede,
      vocativo_override, fecha_adhesion, asignado_a, asignado_fecha, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      nombre = excluded.nombre,
      barrio = excluded.barrio,
      tel_raw = excluded.tel_raw,
      tel_norm = excluded.tel_norm,
      email = excluded.email,
      rsp = excluded.rsp,
      adhirio = excluded.adhirio,
      comentario = excluded.comentario,
      en_sheets = excluded.en_sheets,
      fecha_agregado = COALESCE(excluded.fecha_agregado, contacts.fecha_agregado),
      ultimo_contacto = COALESCE(excluded.ultimo_contacto, contacts.ultimo_contacto),
      intentos = excluded.intentos,
      primer_contacto_enviado = excluded.primer_contacto_enviado,
      fecha_primer_contacto = COALESCE(excluded.fecha_primer_contacto, contacts.fecha_primer_contacto),
      estado_flujo = COALESCE(excluded.estado_flujo, contacts.estado_flujo),
      estado_flujo_etiqueta = COALESCE(excluded.estado_flujo_etiqueta, contacts.estado_flujo_etiqueta),
      actualizado_en_app_at = excluded.actualizado_en_app_at,
      referidos_caba_ya_enviado = excluded.referidos_caba_ya_enviado,
      ultimo_mensaje_corte_enviado_at = COALESCE(excluded.ultimo_mensaje_corte_enviado_at, contacts.ultimo_mensaje_corte_enviado_at),
      alerta_vencido_oculta_fecha = COALESCE(excluded.alerta_vencido_oculta_fecha, contacts.alerta_vencido_oculta_fecha),
      dias_encuentro = COALESCE(excluded.dias_encuentro, contacts.dias_encuentro),
      hora_inicio = COALESCE(excluded.hora_inicio, contacts.hora_inicio),
      hora_fin = COALESCE(excluded.hora_fin, contacts.hora_fin),
      horario_encuentro = COALESCE(excluded.horario_encuentro, contacts.horario_encuentro),
      calle_o_cruce = COALESCE(excluded.calle_o_cruce, contacts.calle_o_cruce),
      piso_depto = COALESCE(excluded.piso_depto, contacts.piso_depto),
      fichas_extras_cantidad = COALESCE(excluded.fichas_extras_cantidad, contacts.fichas_extras_cantidad),
      retiro_confirmado = excluded.retiro_confirmado,
      fecha_estado_punto_sede = COALESCE(excluded.fecha_estado_punto_sede, contacts.fecha_estado_punto_sede),
      vocativo_override = COALESCE(excluded.vocativo_override, contacts.vocativo_override),
      fecha_adhesion = COALESCE(excluded.fecha_adhesion, contacts.fecha_adhesion),
      asignado_a = COALESCE(excluded.asignado_a, contacts.asignado_a),
      asignado_fecha = COALESCE(excluded.asignado_fecha, contacts.asignado_fecha),
      updated_at = datetime('now')
  `);

  stmt.run(
    id,
    c.nombre || '',
    c.barrio || '',
    c.telRaw || '',
    telNorm,
    c.email || null,
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
    c.alertaVencidoOcultaFecha || null,
    c.diasEncuentro ?? '',
    c.horaInicio ?? '',
    c.horaFin ?? '',
    c.horarioEncuentro ?? '',
    c.calleOCruce ?? '',
    c.pisoDepto ?? '',
    c.fichasExtrasCantidad ?? '',
    c.retiroConfirmado ? 1 : 0,
    c.fechaEstadoPuntoSede || null,
    c.vocativoOverride ?? '',
    c.fechaAdhesion || null,
    c.asignadoA || 'cesar',
    c.asignadoFecha || null
  );

  return getContactById(id)!;
}

export function bulkUpsertContacts(contacts: RawContactRow[], replaceAll = false): number {
  if (!contacts || contacts.length === 0) return 0;
  const db = getDatabase();

  db.exec('BEGIN TRANSACTION;');
  try {
    const validIds: string[] = [];
    for (const c of contacts) {
      if (!c.id) continue;
      const upserted = upsertContact(c);
      validIds.push(canonicalContactId(upserted.id));
    }
    if (replaceAll && validIds.length > 0) {
      const placeholders = validIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM contacts WHERE id NOT IN (${placeholders})`).run(...validIds);
    }
    db.exec('COMMIT;');
    return validIds.length;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function updateContactFields(id: string, updates: Partial<RawContactRow>): RawContactRow | null {
  const current = getContactById(id);
  if (!current) return null;

  const merged: RawContactRow = {
    ...current,
    ...updates,
    actualizadoEnAppAt: new Date().toISOString(),
  };

  return upsertContact(merged);
}

export function deleteContact(id: string): boolean {
  const db = getDatabase();
  const cleanId = canonicalContactId(id);
  const rawId = String(id).trim();
  const res = db
    .prepare('DELETE FROM contacts WHERE id = ? OR id = ? OR LOWER(REPLACE(TRIM(id), \'#\', \'\')) = LOWER(?)')
    .run(cleanId, rawId, cleanId);
  return res.changes > 0;
}

export function getContactStats(): {
  total: number;
  adhirieron: number;
  pendientes: number;
  primerContactoEnviado: number;
  sinContactar: number;
} {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN adhirio = 'Sí' THEN 1 ELSE 0 END) as adhirieron,
      SUM(CASE WHEN adhirio = 'Pendiente' THEN 1 ELSE 0 END) as pendientes,
      SUM(CASE WHEN primer_contacto_enviado = 1 THEN 1 ELSE 0 END) as primerContactoEnviado,
      SUM(CASE WHEN primer_contacto_enviado = 0 THEN 1 ELSE 0 END) as sinContactar
    FROM contacts
  `).get() as any;

  return {
    total: row?.total || 0,
    adhirieron: row?.adhirieron || 0,
    pendientes: row?.pendientes || 0,
    primerContactoEnviado: row?.primerContactoEnviado || 0,
    sinContactar: row?.sinContactar || 0,
  };
}
