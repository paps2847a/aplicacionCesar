import { getDatabase } from '../db';
import type { ControlEnvioRegistro } from '../../src/types';

interface ControlEnvioDb {
  id_registro: string;
  contact_id: string;
  nombre: string;
  barrio: string | null;
  telefono: string | null;
  fecha_hora_iso: string;
  fecha_hora_legible: string | null;
  tipo_accion: string;
  estado_anterior_label: string | null;
  estado_nuevo_label: string | null;
  extracto_mensaje: string | null;
  created_at: string;
}

function mapDbToControlEnvio(row: ControlEnvioDb): ControlEnvioRegistro {
  return {
    idRegistro: row.id_registro,
    contactId: row.contact_id,
    nombre: row.nombre || '',
    barrio: row.barrio || '',
    telRaw: row.telefono || '',
    tipoMensaje: row.tipo_accion || '',
    estadoAnterior: row.estado_anterior_label || '',
    estadoNuevo: (row.estado_nuevo_label as any) || '1ER_MSJ_ENVIADO_SIN_RSP',
    estadoNuevoEtiqueta: row.estado_nuevo_label || '',
    rspNuevo: 'No',
    adhirioNuevo: 'Pendiente',
    comentario: row.extracto_mensaje || '',
    fechaHora: row.fecha_hora_iso || row.fecha_hora_legible || '',
    sincronizadoSheets: true,
  };
}

export function recordEnvio(reg: ControlEnvioRegistro): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO control_envios (
      id_registro, contact_id, nombre, barrio, telefono,
      fecha_hora_iso, fecha_hora_legible, tipo_accion,
      estado_anterior_label, estado_nuevo_label, extracto_mensaje
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    reg.idRegistro,
    reg.contactId || '',
    reg.nombre || '',
    reg.barrio || '',
    reg.telRaw || (reg as any).telefono || '',
    reg.fechaHora || (reg as any).fechaHoraISO || new Date().toISOString(),
    (reg as any).fechaHoraLegible || reg.fechaHora || '',
    reg.tipoMensaje || (reg as any).tipoAccion || '',
    reg.estadoAnterior || (reg as any).estadoAnteriorLabel || '',
    reg.estadoNuevoEtiqueta || String(reg.estadoNuevo || '') || (reg as any).estadoNuevoLabel || '',
    reg.comentario || (reg as any).extractoMensaje || ''
  );
}

export function bulkRecordEnvios(registros: ControlEnvioRegistro[]): void {
  if (!registros || registros.length === 0) return;
  const db = getDatabase();
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const r of registros) {
      recordEnvio(r);
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function getRecentEnvios(limit: number = 100): ControlEnvioRegistro[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM control_envios
    ORDER BY datetime(fecha_hora_iso) DESC, created_at DESC
    LIMIT ?
  `).all(limit) as unknown as ControlEnvioDb[];

  return rows.map(mapDbToControlEnvio);
}

export function getAllSentContactKeys(): Set<string> {
  const db = getDatabase();
  const rows = db.prepare('SELECT contact_id, telefono FROM control_envios').all() as unknown as {
    contact_id: string;
    telefono: string | null;
  }[];

  const keys = new Set<string>();
  for (const r of rows) {
    if (r.contact_id) keys.add(`id:${String(r.contact_id).trim()}`);
    if (r.telefono) {
      const clean = String(r.telefono).replace(/\D+/g, '').slice(-8);
      if (clean) keys.add(`tel:${clean}`);
    }
  }
  return keys;
}
