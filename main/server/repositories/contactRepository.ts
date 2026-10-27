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
  created_at: string;
  updated_at: string;
}

function mapDbToContact(row: ContactRowDb): RawContactRow {
  return {
    id: row.id,
    nombre: row.nombre || '',
    barrio: row.barrio || '',
    telRaw: row.tel_raw || '',
    tel: row.tel_norm || (row.tel_raw ? String(row.tel_raw).replace(/\D+/g, '') : undefined),
    email: row.email || undefined,
    rsp: (row.rsp as any) || 'Nuevo',
    adhirio: (row.adhirio as any) || 'Pendiente',
    comentario: row.comentario || '',
    enSheets: Boolean(row.en_sheets),
    fechaAgregado: row.fecha_agregado || undefined,
    ultimoContacto: row.ultimo_contacto || undefined,
    intentos: row.intentos || 0,
    primerContactoEnviado: Boolean(row.primer_contacto_enviado),
    fechaPrimerContacto: row.fecha_primer_contacto || undefined,
    estadoFlujo: (row.estado_flujo as any) || undefined,
    estadoFlujoEtiqueta: row.estado_flujo_etiqueta || undefined,
    actualizadoEnAppAt: row.actualizado_en_app_at || undefined,
    referidosCabaYaEnviado: Boolean(row.referidos_caba_ya_enviado),
    ultimoMensajeCorteEnviadoAt: row.ultimo_mensaje_corte_enviado_at || undefined,
    alertaVencidoOcultaFecha: row.alerta_vencido_oculta_fecha || undefined,
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
    const q = `%${filters.search.trim().toLowerCase()}%`;
    whereClauses.push('(LOWER(nombre) LIKE ? OR LOWER(comentario) LIKE ? OR tel_raw LIKE ? OR LOWER(barrio) LIKE ?)');
    params.push(q, q, q, q);
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
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(String(id).trim()) as unknown as ContactRowDb | undefined;
  return row ? mapDbToContact(row) : null;
}

export function upsertContact(c: RawContactRow): RawContactRow {
  const db = getDatabase();
  const id = String(c.id).trim();
  const telNorm = (c as any).telefonoNorm || c.tel || (c.telRaw ? String(c.telRaw).replace(/\D+/g, '') : '');

  const stmt = db.prepare(`
    INSERT INTO contacts (
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
    c.actualizadoEnAppAt || new Date().toISOString(),
    c.referidosCabaYaEnviado ? 1 : 0,
    c.ultimoMensajeCorteEnviadoAt || null,
    c.alertaVencidoOcultaFecha || null
  );

  return getContactById(id)!;
}

export function bulkUpsertContacts(contacts: RawContactRow[]): number {
  if (!contacts || contacts.length === 0) return 0;
  const db = getDatabase();

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const c of contacts) {
      if (!c.id) continue;
      upsertContact(c);
    }
    db.exec('COMMIT;');
    return contacts.length;
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
  const res = db.prepare('DELETE FROM contacts WHERE id = ?').run(String(id).trim());
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
