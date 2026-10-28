import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { updateContactFields, getContactById } from '../repositories/contactRepository';
import { recordEnvio } from '../repositories/controlEnvioRepository';
import type {
  AutoFirstMessageQueueItem,
  AutoFirstMessageConfig,
  ResultadoEnvioAuto,
  ControlEnvioRegistro,
  EstadoFlujo,
} from '../../src/types';

const { Client, LocalAuth } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type WhatsAppConnectionStatus =
  | 'DISCONNECTED'
  | 'INITIALIZING'
  | 'QR_READY'
  | 'AUTHENTICATING'
  | 'READY'
  | 'AUTH_FAILURE'
  | 'ERROR';

export interface WhatsAppLogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export interface WhatsAppClientInfo {
  pushname?: string;
  wid?: string;
  phone?: string;
  platform?: string;
}

export interface WhatsAppQueueProgress {
  isRunning: boolean;
  isPaused: boolean;
  currentIndex: number;
  totalItems: number;
  currentContactName?: string;
  currentContactPhone?: string;
  currentAction?: string;
  countdownSeconds?: number;
  sentCount: number;
  failedCount: number;
  invalidCount: number;
  startedAt?: string;
}

class WhatsAppService {
  private client: any | null = null;
  private status: WhatsAppConnectionStatus = 'DISCONNECTED';
  private qrCodeRaw: string | null = null;
  private qrCodeDataUrl: string | null = null;
  private clientInfo: WhatsAppClientInfo | null = null;
  private logs: WhatsAppLogEntry[] = [];
  private maxLogs = 200;

  // Queue state
  private queueProgress: WhatsAppQueueProgress = {
    isRunning: false,
    isPaused: false,
    currentIndex: 0,
    totalItems: 0,
    sentCount: 0,
    failedCount: 0,
    invalidCount: 0,
  };
  private queueAbortController: AbortController | null = null;

  // Rate limiting tracker (rolling 60 min)
  private sentTimestamps: number[] = [];

  constructor() {
    this.addLog('info', 'Servicio WhatsApp Web.js inicializado en el servidor.');
  }

  public getStatus() {
    // Clean old timestamps older than 60 min
    const now = Date.now();
    this.sentTimestamps = this.sentTimestamps.filter((t) => now - t < 3600 * 1000);

    return {
      status: this.status,
      hasQr: Boolean(this.qrCodeDataUrl),
      qrCodeDataUrl: this.qrCodeDataUrl,
      clientInfo: this.clientInfo,
      queue: this.queueProgress,
      rollingLastHourCount: this.sentTimestamps.length,
      maxHourlyLimit: 40,
      recentLogs: this.logs.slice(-50),
    };
  }

  public addLog(type: 'info' | 'success' | 'warn' | 'error', message: string) {
    const entry: WhatsAppLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('es-AR', { hour12: false }),
      type,
      message,
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    console.log(`[WhatsAppService][${type.toUpperCase()}] ${message}`);
  }

  public async initialize(): Promise<{ ok: boolean; status: WhatsAppConnectionStatus; message?: string }> {
    if (this.client && (this.status === 'READY' || this.status === 'INITIALIZING' || this.status === 'AUTHENTICATING')) {
      return { ok: true, status: this.status, message: 'Cliente ya está en ejecución.' };
    }

    try {
      this.status = 'INITIALIZING';
      this.qrCodeRaw = null;
      this.qrCodeDataUrl = null;
      this.addLog('info', 'Iniciando navegador Chromium para WhatsApp Web...');

      const sessionDir = path.resolve(__dirname, '../../data/wa_session');
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: sessionDir,
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        },
      });

      this.client.on('qr', async (qr: string) => {
        this.status = 'QR_READY';
        this.qrCodeRaw = qr;
        try {
          this.qrCodeDataUrl = await qrcode.toDataURL(qr, {
            margin: 2,
            width: 320,
            color: { dark: '#111827', light: '#ffffff' },
          });
          this.addLog('info', 'Código QR generado. Listo para escanear desde WhatsApp en tu celular.');
        } catch (qrErr: any) {
          this.addLog('error', `Error generando imagen QR: ${qrErr?.message || qrErr}`);
        }
      });

      this.client.on('authenticated', () => {
        this.status = 'AUTHENTICATING';
        this.qrCodeRaw = null;
        this.qrCodeDataUrl = null;
        this.addLog('info', 'Sesión autenticada correctamente. Cargando chats y sincronizando...');
      });

      this.client.on('auth_failure', (msg: string) => {
        this.status = 'AUTH_FAILURE';
        this.qrCodeRaw = null;
        this.qrCodeDataUrl = null;
        this.addLog('error', `Fallo de autenticación en WhatsApp: ${msg}`);
      });

      this.client.on('ready', () => {
        this.status = 'READY';
        this.qrCodeRaw = null;
        this.qrCodeDataUrl = null;
        this.clientInfo = {
          pushname: this.client.info?.pushname,
          wid: this.client.info?.wid?._serialized,
          phone: this.client.info?.wid?.user,
          platform: this.client.info?.platform,
        };
        this.addLog(
          'success',
          `✅ WhatsApp Web Conectado y Listo! Usuario: ${this.clientInfo.pushname || 'Usuario'} (+${this.clientInfo.phone || ''})`
        );
      });

      this.client.on('disconnected', (reason: string) => {
        this.status = 'DISCONNECTED';
        this.qrCodeRaw = null;
        this.qrCodeDataUrl = null;
        this.clientInfo = null;
        this.addLog('warn', `WhatsApp Web desconectado. Motivo: ${reason}`);

        // Circuit breaker: if queue was running, stop it immediately
        if (this.queueProgress.isRunning) {
          this.stopQueue('Desconexión de WhatsApp detectada.');
        }

        try {
          this.client.destroy();
        } catch {
          // Ignore destroy errors
        }
        this.client = null;
      });

      await this.client.initialize();
      return { ok: true, status: this.status };
    } catch (err: any) {
      this.status = 'ERROR';
      this.addLog('error', `Error al inicializar WhatsApp Web: ${err?.message || err}`);
      return { ok: false, status: 'ERROR', message: err?.message || String(err) };
    }
  }

  public async disconnect(): Promise<{ ok: boolean }> {
    this.addLog('info', 'Cerrando sesión de WhatsApp Web y destruyendo navegador...');
    if (this.queueProgress.isRunning) {
      this.stopQueue('Desconexión manual solicitada.');
    }

    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // Ignore logout errors
      }
      try {
        await this.client.destroy();
      } catch {
        // Ignore destroy errors
      }
      this.client = null;
    }

    this.status = 'DISCONNECTED';
    this.qrCodeRaw = null;
    this.qrCodeDataUrl = null;
    this.clientInfo = null;
    this.addLog('info', 'Sesión desconectada.');
    return { ok: true };
  }

  /**
   * Resuelve el JID registrado en WhatsApp para un teléfono argentino/internacional.
   */
  public async resolveWhatsAppJid(rawPhone: string): Promise<string | null> {
    if (!this.client || this.status !== 'READY') {
      throw new Error('WhatsApp no está conectado.');
    }

    const digitsOnly = String(rawPhone || '').replace(/\D/g, '');
    if (!digitsOnly || digitsOnly.length < 8) return null;

    // Normalizaciones argentinas:
    const candidates: string[] = [];

    if (digitsOnly.startsWith('549')) {
      candidates.push(digitsOnly);
      candidates.push('54' + digitsOnly.slice(3)); // sin el 9
    } else if (digitsOnly.startsWith('54') && !digitsOnly.startsWith('549')) {
      candidates.push('549' + digitsOnly.slice(2)); // con el 9
      candidates.push(digitsOnly);
    } else if (digitsOnly.startsWith('15') && digitsOnly.length === 10) {
      candidates.push('54911' + digitsOnly.slice(2));
      candidates.push('5411' + digitsOnly.slice(2));
    } else if (digitsOnly.length === 10 && digitsOnly.startsWith('11')) {
      candidates.push('549' + digitsOnly);
      candidates.push('54' + digitsOnly);
    } else if (digitsOnly.length === 8) {
      candidates.push('54911' + digitsOnly);
      candidates.push('5411' + digitsOnly);
    } else {
      candidates.push(digitsOnly);
    }

    for (const cand of candidates) {
      try {
        const idObj = await this.client.getNumberId(cand);
        if (idObj && idObj._serialized) {
          return idObj._serialized;
        }
      } catch {
        // Continua al siguiente candidato
      }
    }

    return null;
  }

  /**
   * Envía un mensaje individual con simulación humana de tipeo y validaciones.
   */
  public async sendMessage(
    rawPhone: string,
    messageText: string,
    options?: {
      contactId?: string;
      nombre?: string;
      barrio?: string;
      tipoAccion?: string;
      simularTipeo?: boolean;
    }
  ): Promise<{
    ok: boolean;
    resultado: ResultadoEnvioAuto;
    detalle: string;
    messageId?: string;
  }> {
    if (!this.client || this.status !== 'READY') {
      return {
        ok: false,
        resultado: 'ERROR_ENVIO',
        detalle: 'WhatsApp Web no está conectado ni listo.',
      };
    }

    // Rate limiting check
    const now = Date.now();
    this.sentTimestamps = this.sentTimestamps.filter((t) => now - t < 3600 * 1000);
    if (this.sentTimestamps.length >= 40) {
      this.addLog('warn', '⚠️ Límite de seguridad alcanzado: más de 40 mensajes enviados en los últimos 60 minutos.');
      return {
        ok: false,
        resultado: 'SESION_RESTRINGIDA_ABORTAR',
        detalle: 'Límite anti-bloqueo superado: máximo 40 mensajes por hora alcanzado.',
      };
    }

    const jid = await this.resolveWhatsAppJid(rawPhone);
    if (!jid) {
      this.addLog('warn', `Número no registrado en WhatsApp: ${rawPhone}`);
      return {
        ok: false,
        resultado: 'NUMERO_INEXISTENTE',
        detalle: `El teléfono ${rawPhone} no tiene cuenta de WhatsApp activa.`,
      };
    }

    try {
      if (options?.simularTipeo !== false) {
        try {
          const chat = await this.client.getChatById(jid);
          await chat.sendStateTyping();
          // Simular tiempo de escritura humano: entre 2 y 5.5 seg según longitud
          const typingMs = Math.min(5500, Math.max(2000, messageText.length * 28));
          await new Promise((r) => setTimeout(r, typingMs));
          await chat.clearState();
        } catch {
          // Si falla sendStateTyping, continuar con el envío
        }
      }

      const sentMsg = await this.client.sendMessage(jid, messageText);
      const messageId = sentMsg?.id?.id || `wweb-${Date.now()}`;

      this.sentTimestamps.push(Date.now());

      // Registrar auditoría de control de envío
      const nowIso = new Date().toISOString();
      const reg: ControlEnvioRegistro = {
        idRegistro: `wa-wweb-${Date.now()}-${options?.contactId || 'direct'}`,
        contactId: options?.contactId || '',
        nombre: options?.nombre || 'Contacto',
        barrio: options?.barrio || '',
        telRaw: rawPhone,
        tipoMensaje: options?.tipoAccion || '1er_mensaje_wwebjs',
        estadoAnterior: '',
        estadoNuevo: '1ER_MSJ_ENVIADO_SIN_RSP',
        estadoNuevoEtiqueta: '3. 1er mensaje enviado (Sin respuesta aún)',
        rspNuevo: 'No',
        adhirioNuevo: 'Pendiente',
        comentario: messageText.slice(0, 150),
        fechaHora: nowIso,
        sincronizadoSheets: false,
      };
      recordEnvio(reg);

      // Si se proporcionó contactId, actualizar el contacto en SQLite
      if (options?.contactId) {
        updateContactFields(options.contactId, {
          primerContactoEnviado: true,
          fechaPrimerContacto: nowIso.slice(0, 10),
          ultimoContacto: nowIso.slice(0, 10),
          estadoFlujo: '1ER_MSJ_ENVIADO_SIN_RSP',
          estadoFlujoEtiqueta: '3. 1er mensaje enviado (Sin respuesta aún)',
        });
      }

      this.addLog(
        'success',
        `Mensaje enviado con éxito a ${options?.nombre || rawPhone} (${jid.split('@')[0]})`
      );

      return {
        ok: true,
        resultado: 'ENVIADO_OK',
        detalle: 'Mensaje entregado a WhatsApp Web exitosamente.',
        messageId,
      };
    } catch (sendErr: any) {
      const errStr = String(sendErr?.message || sendErr);
      this.addLog('error', `Error al enviar a ${rawPhone}: ${errStr}`);

      return {
        ok: false,
        resultado: 'ERROR_ENVIO',
        detalle: `Fallo de envío: ${errStr}`,
      };
    }
  }

  /**
   * Ejecución de cola automatizada con pausas anti-bloqueo y Circuit Breaker.
   */
  public async startQueue(
    items: AutoFirstMessageQueueItem[],
    config?: Partial<AutoFirstMessageConfig>,
    appsScriptUrl?: string
  ): Promise<{ ok: boolean; message: string }> {
    if (this.queueProgress.isRunning) {
      return { ok: false, message: 'Ya hay una cola en ejecución actualmente.' };
    }

    if (!this.client || this.status !== 'READY') {
      return { ok: false, message: 'WhatsApp Web no está listo. Conecta tu sesión primero.' };
    }

    if (!items || items.length === 0) {
      return { ok: false, message: 'La cola de envíos está vacía.' };
    }

    this.queueAbortController = new AbortController();
    const signal = this.queueAbortController.signal;

    this.queueProgress = {
      isRunning: true,
      isPaused: false,
      currentIndex: 0,
      totalItems: items.length,
      sentCount: 0,
      failedCount: 0,
      invalidCount: 0,
      startedAt: new Date().toISOString(),
    };

    this.addLog('info', `🚀 Iniciando cola automatizada de ${items.length} mensajes con WhatsApp Web...`);

    // Run async in background
    (async () => {
      try {
        for (let i = 0; i < items.length; i++) {
          if (signal.aborted || !this.queueProgress.isRunning) {
            this.addLog('warn', 'Cola de envíos detenida por el usuario.');
            break;
          }

          // Paused loop
          while (this.queueProgress.isPaused) {
            if (signal.aborted || !this.queueProgress.isRunning) break;
            await new Promise((r) => setTimeout(r, 1000));
          }

          if (signal.aborted || !this.queueProgress.isRunning) break;

          const item = items[i];
          this.queueProgress.currentIndex = i + 1;
          this.queueProgress.currentContactName = item.primerNombre;
          this.queueProgress.currentContactPhone = item.telefonoNorm;

          // 1. Manejo de pausa de café
          if (item.esPausaCafeAntes) {
            const pausaMin = Math.round((config?.pausaExtraCada10Seg || 300) / 60);
            this.queueProgress.currentAction = `☕ Pausa de café anti-bloqueo (${pausaMin} min)`;
            this.addLog('info', `☕ Tomando pausa de café de seguridad (~${pausaMin} min) antes del siguiente mensaje...`);

            let remainingSec = config?.pausaExtraCada10Seg || 300;
            while (remainingSec > 0 && this.queueProgress.isRunning && !signal.aborted) {
              this.queueProgress.countdownSeconds = remainingSec;
              await new Promise((r) => setTimeout(r, 1000));
              remainingSec--;
            }
          } else if (i > 0) {
            // Pausa normal entre mensajes
            const minSec = config?.minIntervaloSeg ?? 25;
            const maxSec = config?.maxIntervaloSeg ?? 65;
            const delaySec = item.intervaloSegundos || Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;

            this.queueProgress.currentAction = `Esperando intervalo humano (~${delaySec}s)`;
            let remainingSec = delaySec;
            while (remainingSec > 0 && this.queueProgress.isRunning && !signal.aborted) {
              this.queueProgress.countdownSeconds = remainingSec;
              await new Promise((r) => setTimeout(r, 1000));
              remainingSec--;
            }
          }

          if (signal.aborted || !this.queueProgress.isRunning) break;

          // 2. Enviar el mensaje
          this.queueProgress.currentAction = `Enviando mensaje a ${item.primerNombre}...`;
          this.queueProgress.countdownSeconds = 0;

          const msgText = item.mensajePrimerContacto || '';
          const sendRes = await this.sendMessage(item.telefonoNorm, msgText, {
            contactId: item.contactId,
            nombre: item.primerNombre,
            barrio: item.barrio,
            tipoAccion: 'primer_contacto_auto',
            simularTipeo: true,
          });

          if (sendRes.resultado === 'ENVIADO_OK') {
            this.queueProgress.sentCount++;
          } else if (sendRes.resultado === 'NUMERO_INEXISTENTE') {
            this.queueProgress.invalidCount++;
          } else {
            this.queueProgress.failedCount++;
          }

          // 3. Si hay puente Google Sheets (Apps Script), sincronizar en segundo plano
          if (appsScriptUrl && appsScriptUrl.startsWith('https://script.google.com/')) {
            const estadoSheet =
              sendRes.resultado === 'ENVIADO_OK'
                ? '2. 1er contacto enviado (Sin respuesta)'
                : sendRes.resultado === 'NUMERO_INEXISTENTE'
                ? '10. Descartado / Baja / N° inexistente'
                : '';

            if (estadoSheet) {
              fetch(appsScriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'updateRow',
                  payload: {
                    id: String(item.contactId || ''),
                    telefonoNorm: String(item.telefonoNorm || ''),
                    nombre: String(item.primerNombre || ''),
                    barrio: String(item.barrio || ''),
                    rsp: 'No',
                    adhirio: sendRes.resultado === 'NUMERO_INEXISTENTE' ? 'No' : 'Pendiente',
                    primerContactoEnviado: 'Sí',
                    estado: estadoSheet,
                  },
                }),
              }).catch(() => {
                // Silencioso si falla
              });
            }
          }
        }
      } catch (loopErr: any) {
        this.addLog('error', `Error inesperado en la cola: ${loopErr?.message || loopErr}`);
      } finally {
        this.queueProgress.isRunning = false;
        this.queueProgress.isPaused = false;
        this.queueProgress.currentAction = 'Completado';
        this.queueProgress.countdownSeconds = 0;
        this.addLog(
          'success',
          `🏁 Cola finalizada. Enviados con éxito: ${this.queueProgress.sentCount} | Inválidos: ${this.queueProgress.invalidCount} | Fallos: ${this.queueProgress.failedCount}`
        );
      }
    })();

    return { ok: true, message: 'Cola de envíos iniciada correctamente.' };
  }

  public pauseQueue(): { ok: boolean } {
    if (this.queueProgress.isRunning) {
      this.queueProgress.isPaused = true;
      this.queueProgress.currentAction = 'En pausa por el usuario';
      this.addLog('info', '⏸️ Cola pausada temporalmente.');
    }
    return { ok: true };
  }

  public resumeQueue(): { ok: boolean } {
    if (this.queueProgress.isRunning && this.queueProgress.isPaused) {
      this.queueProgress.isPaused = false;
      this.addLog('info', '▶️ Cola reanudada.');
    }
    return { ok: true };
  }

  public stopQueue(reason: string = 'Detenido por el usuario'): { ok: boolean } {
    if (this.queueProgress.isRunning) {
      this.queueProgress.isRunning = false;
      this.queueProgress.isPaused = false;
      this.queueProgress.currentAction = `Detenido (${reason})`;
      if (this.queueAbortController) {
        this.queueAbortController.abort();
      }
      this.addLog('warn', `🛑 Cola detenida: ${reason}`);
    }
    return { ok: true };
  }
}

export const whatsappService = new WhatsAppService();
