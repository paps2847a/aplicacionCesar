import { Router, Request, Response } from 'express';
import { whatsappService } from '../services/whatsappService';

export const whatsappRouter = Router();

// 1. Estado actual de la conexión y de la cola
whatsappRouter.get('/status', (req: Request, res: Response) => {
  try {
    const status = whatsappService.getStatus();
    res.json({ ok: true, ...status });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 2. Inicializar o reconectar cliente WhatsApp Web
whatsappRouter.post('/initialize', async (req: Request, res: Response) => {
  try {
    const result = await whatsappService.initialize();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 3. Desconectar cliente / Cerrar sesión
whatsappRouter.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const result = await whatsappService.disconnect();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 4. Envío de mensaje individual
whatsappRouter.post('/send-one', async (req: Request, res: Response) => {
  try {
    const { phone, message, contactId, nombre, barrio, tipoAccion } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ ok: false, error: 'Se requiere "phone" y "message".' });
    }

    const result = await whatsappService.sendMessage(phone, message, {
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

// 5. Iniciar cola automatizada de envíos
whatsappRouter.post('/queue/start', async (req: Request, res: Response) => {
  try {
    const { items, config, appsScriptUrl } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Se requiere un array "items" no vacío.' });
    }

    const result = await whatsappService.startQueue(items, config, appsScriptUrl);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 6. Pausar cola
whatsappRouter.post('/queue/pause', (req: Request, res: Response) => {
  const result = whatsappService.pauseQueue();
  res.json(result);
});

// 7. Reanudar cola
whatsappRouter.post('/queue/resume', (req: Request, res: Response) => {
  const result = whatsappService.resumeQueue();
  res.json(result);
});

// 8. Detener cola
whatsappRouter.post('/queue/stop', (req: Request, res: Response) => {
  const result = whatsappService.stopQueue('Detenido manualmente vía API');
  res.json(result);
});

// 9. Detectar navegador en el sistema
whatsappRouter.get('/detect-chrome', async (_req: Request, res: Response) => {
  try {
    const { findBrowserExecutable } = await import('../services/whatsappService');
    const browser = await findBrowserExecutable();
    res.json({ ok: true, browser });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// 10. Guardar ruta personalizada de Chrome
whatsappRouter.post('/set-chrome-path', async (req: Request, res: Response) => {
  try {
    const { setSetting } = await import('../repositories/settingsRepository');
    const { path: chromePath } = req.body;
    setSetting('customChromePath', (chromePath || '').trim());
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});
