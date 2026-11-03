import { Router, Request, Response } from 'express';
import { getWhatsAppServiceForUser } from '../services/whatsappService';

export const whatsappRouter = Router();

function resolveService(req: Request) {
  const userId = String(
    req.query?.userId || req.body?.userId || req.headers['x-popurri-user'] || 'cesar'
  ).trim();
  return getWhatsAppServiceForUser(userId);
}

// 1. Estado actual de la conexión y de la cola
whatsappRouter.get('/status', (req: Request, res: Response) => {
  try {
    const service = resolveService(req);
    const status = service.getStatus();
    res.json({ ok: true, ...status });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 2. Inicializar o reconectar cliente WhatsApp Web
whatsappRouter.post('/initialize', async (req: Request, res: Response) => {
  try {
    const service = resolveService(req);
    const result = await service.initialize();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 3. Desconectar cliente / Cerrar sesión
whatsappRouter.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const service = resolveService(req);
    const result = await service.disconnect();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 4. Envío de mensaje individual
whatsappRouter.post('/send-one', async (req: Request, res: Response) => {
  try {
    const service = resolveService(req);
    const { phone, message, contactId, nombre, barrio, tipoAccion } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ ok: false, error: 'Se requiere "phone" y "message".' });
    }

    const result = await service.sendMessage(phone, message, {
      contactId,
      nombre,
      barrio,
      tipoAccion,
      simularTipeo: true,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 5. Iniciar cola automatizada de envíos (con soporte de bucle diario cada 24h)
whatsappRouter.post('/queue/start', async (req: Request, res: Response) => {
  try {
    const service = resolveService(req);
    const { items, config, appsScriptUrl, autoLoop24h = true } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Se requiere un array "items" no vacío.' });
    }

    const result = await service.startQueue(items, config, appsScriptUrl, Boolean(autoLoop24h));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 5b. Activar / Desactivar el Bucle Automático Diario cada 24h en caliente
whatsappRouter.post('/queue/autoloop', (req: Request, res: Response) => {
  try {
    const service = resolveService(req);
    const enabled = Boolean(req.body?.enabled);
    const result = service.setAutoLoop24h(enabled);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 6. Pausar cola
whatsappRouter.post('/queue/pause', (req: Request, res: Response) => {
  const service = resolveService(req);
  const result = service.pauseQueue();
  res.json(result);
});

// 7. Reanudar cola
whatsappRouter.post('/queue/resume', (req: Request, res: Response) => {
  const service = resolveService(req);
  const result = service.resumeQueue();
  res.json(result);
});

// 8. Detener cola
whatsappRouter.post('/queue/stop', (req: Request, res: Response) => {
  const service = resolveService(req);
  const result = service.stopQueue('Detenido manualmente vía API');
  res.json(result);
});

// 9. Forzar liberación de locks de Chromium / reinicio de sesión
whatsappRouter.post('/reset-session', async (req: Request, res: Response) => {
  try {
    const service = resolveService(req);
    const result = await service.resetSession();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 10. Sincronizar chats recientes de WhatsApp Web con las fichas de SQLite
whatsappRouter.post('/sync-chats', async (req: Request, res: Response) => {
  try {
    const service = resolveService(req);
    const result = await service.syncRecentChatsWithDatabase();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});
