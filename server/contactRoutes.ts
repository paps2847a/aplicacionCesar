import { Router, Request, Response } from 'express';
import {
  getAllContacts,
  getContactById,
  upsertContact,
  updateContactFields,
  deleteContact,
  getContactStats,
  bulkUpsertContacts,
} from './repositories/contactRepository';
import {
  recordEnvio,
  getRecentEnvios,
  getAllSentContactKeys,
} from './repositories/controlEnvioRepository';
import {
  getCalendarEvents,
  replaceCalendarEvents,
  upsertCalendarEvent,
} from './repositories/calendarRepository';
import {
  getSetting,
  setSetting,
  getAllSettings,
} from './repositories/settingsRepository';
import type { RawContactRow, ControlEnvioRegistro, CalendarEventItem } from '../src/types';

export const apiRouter = Router();

// ==========================================
// 1. CONTACTOS (CRUD & Filtros en SQLite)
// ==========================================

// Estadísticas rápidas del padrón
apiRouter.get('/contacts/stats', (_req: Request, res: Response) => {
  try {
    const stats = getContactStats();
    res.json({ ok: true, stats });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Listar contactos con búsqueda y filtros
apiRouter.get('/contacts', (req: Request, res: Response) => {
  try {
    const { barrio, adhirio, estadoFlujo, search, limit, offset } = req.query;
    const result = getAllContacts({
      barrio: barrio ? String(barrio) : undefined,
      adhirio: adhirio ? String(adhirio) : undefined,
      estadoFlujo: estadoFlujo ? String(estadoFlujo) : undefined,
      search: search ? String(search) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json({ ok: true, total: result.total, contacts: result.contacts });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Obtener un contacto por ID
apiRouter.get('/contacts/:id', (req: Request, res: Response) => {
  try {
    const contact = getContactById(req.params.id);
    if (!contact) {
      return res.status(404).json({ ok: false, error: 'Contacto no encontrado' });
    }
    res.json({ ok: true, contact });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Crear o actualizar completamente un contacto
apiRouter.post('/contacts', (req: Request, res: Response) => {
  try {
    const data = req.body as RawContactRow;
    if (!data || !data.id) {
      return res.status(400).json({ ok: false, error: 'El contacto requiere un ID' });
    }
    const saved = upsertContact(data);
    res.json({ ok: true, contact: saved });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Actualización atómica de campos de un contacto
apiRouter.patch('/contacts/:id', (req: Request, res: Response) => {
  try {
    const updates = req.body as Partial<RawContactRow>;
    const updated = updateContactFields(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Contacto no encontrado' });
    }
    res.json({ ok: true, contact: updated });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Eliminar un contacto
apiRouter.delete('/contacts/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteContact(req.params.id);
    res.json({ ok: true, deleted });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Carga masiva / sincronización de contactos
apiRouter.post('/contacts/bulk', (req: Request, res: Response) => {
  try {
    const { contacts } = req.body as { contacts: RawContactRow[] };
    if (!Array.isArray(contacts)) {
      return res.status(400).json({ ok: false, error: 'Se esperaba un array de contactos' });
    }
    const count = bulkUpsertContacts(contacts);
    res.json({ ok: true, count });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// 2. CONTROL DE ENVÍOS (Trazabilidad WA)
// ==========================================

apiRouter.get('/control-envios', (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const envios = getRecentEnvios(limit);
    res.json({ ok: true, envios });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

apiRouter.post('/control-envios', (req: Request, res: Response) => {
  try {
    const registro = req.body as ControlEnvioRegistro;
    if (!registro || !registro.idRegistro || !registro.contactId) {
      return res.status(400).json({ ok: false, error: 'Registro de envío incompleto' });
    }
    recordEnvio(registro);
    res.json({ ok: true, idRegistro: registro.idRegistro });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

apiRouter.get('/control-envios/keys', (_req: Request, res: Response) => {
  try {
    const keys = Array.from(getAllSentContactKeys());
    res.json({ ok: true, keys });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// 3. CALENDAR (Eventos en SQLite)
// ==========================================

apiRouter.get('/calendar-events', (_req: Request, res: Response) => {
  try {
    const events = getCalendarEvents();
    res.json({ ok: true, events });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

apiRouter.post('/calendar-events/replace', (req: Request, res: Response) => {
  try {
    const { events, source } = req.body as { events: CalendarEventItem[]; source?: string };
    if (!Array.isArray(events)) {
      return res.status(400).json({ ok: false, error: 'Se esperaba un array de eventos' });
    }
    replaceCalendarEvents(events, source || 'sync');
    res.json({ ok: true, count: events.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

apiRouter.post('/calendar-events', (req: Request, res: Response) => {
  try {
    const event = req.body as CalendarEventItem;
    if (!event || !event.id) {
      return res.status(400).json({ ok: false, error: 'Evento inválido' });
    }
    upsertCalendarEvent(event);
    res.json({ ok: true, id: event.id });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// 4. SETTINGS (Clave-Valor)
// ==========================================

apiRouter.get('/settings', (_req: Request, res: Response) => {
  try {
    const settings = getAllSettings();
    res.json({ ok: true, settings });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

apiRouter.post('/settings', (req: Request, res: Response) => {
  try {
    const { key, value } = req.body as { key: string; value: any };
    if (!key) {
      return res.status(400).json({ ok: false, error: 'Falta key' });
    }
    setSetting(key, value);
    res.json({ ok: true, key });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
