import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { updateContactFields, getContactById, getAllContacts } from '../repositories/contactRepository';
import { recordEnvio } from '../repositories/controlEnvioRepository';
import { pushContactUpdatesToSheet } from './googleSheetsSyncService';
import { obtenerEtiquetaEstadoFlujo } from '../../src/domain/contacts/pipelineStages';
import { procesarContacto } from '../../src/domain/contacts/contactStatus';
import {
  generarColaEnvioAutomaticoPrimerContacto,
  obtenerRangoWarmup,
  sortearCupoSeguroAntiBloqueo,
  esContactoElegiblePrimerContactoAuto,
} from '../../src/domain/automation/antiBanLimits';
import { DEFAULT_VOICE_PROFILE } from '../../src/data/estatusPopurriData';
import { obtenerPartesFechaHoraBA } from '../../src/domain/calendar/availability';
import type {
  AutoFirstMessageQueueItem,
  AutoFirstMessageConfig,
  NivelWarmupWA,
  ResultadoEnvioAuto,
  ControlEnvioRegistro,
  EstadoFlujo,
  RawContactRow,
} from '../../src/types';

function resolveSystemBrowserExecutable(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    localAppData ? path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe') : '',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function resolverEstadoPorEnvioBackend(
  current: RawContactRow | null,
  tipoAccion?: string,
  mensajeTexto?: string
): {
  estadoFlujo: EstadoFlujo;
  rsp: 'Sí' | 'No' | 'Nuevo';
  adhirio: 'Sí' | 'Pendiente' | 'No';
} {
  const prevEstado: EstadoFlujo = current?.estadoFlujo || 'SIN_CONTACTAR_1ER_MSJ';
  const prevRsp = current?.rsp || 'Nuevo';
  const prevAdhirio = current?.adhirio || 'Pendiente';
  const accion = String(tipoAccion || '').toLowerCase();
  const msg = String(mensajeTexto || '').toLowerCase();

  if (accion.includes('agradecimiento_post_firma') || prevAdhirio === 'Sí') {
    const est = prevEstado === 'PENDIENTE_RETIRO_FICHAS' ? 'PENDIENTE_RETIRO_FICHAS' : 'YA_ADHIRIO_FIRMA_OK';
    return { estadoFlujo: est, rsp: 'Sí', adhirio: 'Sí' };
  }
  if (accion.includes('retiro_fichas') || prevEstado === 'PENDIENTE_RETIRO_FICHAS') {
    return { estadoFlujo: 'PENDIENTE_RETIRO_FICHAS', rsp: 'Sí', adhirio: prevAdhirio };
  }
  if (accion.includes('no_caba_referidos')) {
    return { estadoFlujo: 'SIN_DNI_CABA_PEDIR_REFERIDOS', rsp: 'Sí', adhirio: 'No' };
  }
  if (accion.includes('baja_amable') || accion.includes('baja_respetuosa')) {
    return { estadoFlujo: 'DESCARTADO_O_BAJA', rsp: prevRsp === 'Sí' ? 'Sí' : 'No', adhirio: 'No' };
  }
  if (
    accion.includes('recordatorio_maniana') ||
    accion.includes('en_camino') ||
    accion.includes('llegando') ||
    accion.includes('ya_en_cafe_hub') ||
    accion.includes('demorado')
  ) {
    return { estadoFlujo: 'RECORDATORIO_DIA_ENVIADO', rsp: 'Sí', adhirio: prevAdhirio };
  }
  if (
    accion.includes('confirmacion_visita') ||
    accion.includes('confirmacion_hoy') ||
    accion.includes('convocatoria_cafe_hub')
  ) {
    return { estadoFlujo: 'ENCUENTRO_CONFIRMADO', rsp: 'Sí', adhirio: prevAdhirio };
  }
  if (
    accion.includes('propuesta_bloque_agenda') ||
    accion.includes('disculpas') ||
    accion.includes('reprogramar') ||
    accion.includes('no_estaba')
  ) {
    return { estadoFlujo: 'PASO_DATOS_FALTA_CONFIRMAR', rsp: 'Sí', adhirio: prevAdhirio };
  }
  if (accion.includes('mas_info')) {
    return { estadoFlujo: 'PIDIO_MAS_INFO_ENVIADA', rsp: 'Sí', adhirio: prevAdhirio };
  }
  if (accion.includes('seguimiento_24h_falta_dato') || accion.includes('cambio_chip')) {
    return { estadoFlujo: 'RESPONDIO_FALTA_DNI_O_ZONA', rsp: 'Sí', adhirio: prevAdhirio };
  }
  if (accion.includes('seguimiento_24h_falta_confirmar')) {
    return { estadoFlujo: 'PASO_DATOS_FALTA_CONFIRMAR', rsp: 'Sí', adhirio: prevAdhirio };
  }

  // No degradar estados avanzados si se envía un mensaje libre o automático
  const estadosAvanzados: EstadoFlujo[] = [
    'ENCUENTRO_CONFIRMADO',
    'RECORDATORIO_DIA_ENVIADO',
    'PASO_DATOS_FALTA_CONFIRMAR',
    'PREFIERE_CAFE_HUB_O_SEDE',
    'RESPONDIO_FALTA_DNI_O_ZONA',
    'PIDIO_MAS_INFO_ENVIADA',
    'PENDIENTE_RETIRO_FICHAS',
    'YA_ADHIRIO_FIRMA_OK',
  ];
  if (estadosAvanzados.includes(prevEstado)) {
    if (/estoy en camino|saliendo para all|llego en 2|ya estoy en el caf|recordarte que hoy/i.test(msg)) {
      return { estadoFlujo: 'RECORDATORIO_DIA_ENVIADO', rsp: 'Sí', adhirio: prevAdhirio };
    }
    return { estadoFlujo: prevEstado, rsp: prevRsp === 'Nuevo' ? 'Sí' : prevRsp, adhirio: prevAdhirio };
  }

  return {
    estadoFlujo: '1ER_MSJ_ENVIADO_SIN_RSP',
    rsp: prevRsp === 'Sí' ? 'Sí' : 'No',
    adhirio: prevAdhirio,
  };
}

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
  targetSentCount?: number;
  compensatedCount?: number;
  currentContactName?: string;
  currentContactPhone?: string;
  currentAction?: string;
  countdownSeconds?: number;
  sentCount: number;
  failedCount: number;
  invalidCount: number;
  startedAt?: string;
  autoLoop24h?: boolean;
  dayCycleNumber?: number;
  remainingUncontactedInPadron?: number;
  nextBatchScheduledAtISO?: string;
}

export interface WhatsAppQueueItemResult {
  contactId: string;
  telefonoNorm: string;
  nombre: string;
  barrio: string;
  resultado: ResultadoEnvioAuto;
  detalleResultado: string;
  fechaHoraResultadoISO: string;
  sincronizadoSheets?: boolean;
}

class WhatsAppService {
  private client: any | null = null;
  private status: WhatsAppConnectionStatus = 'DISCONNECTED';
  private qrCodeRaw: string | null = null;
  private qrCodeDataUrl: string | null = null;
  private clientInfo: WhatsAppClientInfo | null = null;
  private logs: WhatsAppLogEntry[] = [];
  private maxLogs = 200;

  // Queue state & real-time reconciliation state
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
  private itemResults: Map<string, WhatsAppQueueItemResult> = new Map();
  private compensatedItems: AutoFirstMessageQueueItem[] = [];
  private updatedContacts: Map<string, RawContactRow> = new Map();
  private consecutiveNullLookups = 0;
  private lastAppsScriptUrl: string | undefined;

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
      itemResults: Array.from(this.itemResults.values()),
      compensatedItems: this.compensatedItems,
      updatedContacts: Array.from(this.updatedContacts.values()),
    };
  }

  /**
   * Busca un candidato en SQLite por su ID o por coincidencia de los últimos 8 dígitos de su teléfono.
   */
  public findContactByIdOrPhone(contactId?: string, rawPhone?: string): RawContactRow | null {
    if (contactId) {
      const byId = getContactById(String(contactId));
      if (byId) return byId;
    }
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (digits.length < 8) return null;
    const last8 = digits.slice(-8);
    const { contacts } = getAllContacts();
    return (
      contacts.find((c) => {
        const cDigits = String(c.telRaw || '').replace(/\D/g, '');
        return cDigits.length >= 8 && cDigits.slice(-8) === last8;
      }) || null
    );
  }

  /**
   * Sincroniza la fila de un contacto con Google Sheets (vía gsheets CLI + fallback Apps Script).
   */
  private syncContactToGoogleSheets(
    contact: RawContactRow,
    comentarioNota?: string,
    explicitAppsScriptUrl?: string
  ): void {
    const targetUrl = explicitAppsScriptUrl || this.lastAppsScriptUrl;
    const estadoEtiqueta =
      contact.estadoFlujoEtiqueta ||
      (contact.estadoFlujo ? obtenerEtiquetaEstadoFlujo(contact.estadoFlujo) : '');
    const telDigits = String(contact.telRaw || '').replace(/\D/g, '');

    void pushContactUpdatesToSheet({
      appsScriptUrl: targetUrl,
      action: 'updateRow',
      updates: [
        {
          id: String(contact.id || ''),
          telefonoNorm: telDigits,
          nombre: String(contact.nombre || ''),
          barrio: String(contact.barrio || ''),
          rsp: contact.rsp || 'No',
          adhirio: contact.adhirio || 'Pendiente',
          estado: estadoEtiqueta,
          comentario: contact.comentario || '',
          comentarioNota: comentarioNota || '',
          preserveIdentityColumns: true,
        },
      ],
    });
  }

  /**
   * Escanea los chats activos recientes en WhatsApp Web y reconcilia automáticamente con SQLite:
   * - Si un vecino respondió (mensaje entrante) y figuraba en etapa 1 o 2, pasa a "3. Respondió · Validar DNI CABA y Zona".
   * - Si se le envió el 1er mensaje desde WhatsApp y aún figuraba en "1. Nuevo · Sin 1er mensaje", pasa a "2. 1er Mensaje enviado · Sin respuesta".
   */
  public async syncRecentChatsWithDatabase(): Promise<{ syncedCount: number }> {
    if (!this.client || this.status !== 'READY' || !this.client.pupPage) {
      return { syncedCount: 0 };
    }
    try {
      const chatSummaries: {
        phoneDigits: string;
        last8: string;
        hasIncoming: boolean;
        hasOutgoing: boolean;
        lastBody: string;
        lastMsgTimestampMs: number;
      }[] = await this.client.pupPage.evaluate(() => {
        try {
          const collections = (window as any).require('WAWebCollections');
          let apiContact: any = null;
          try {
            apiContact = (window as any).require('WAWebApiContact');
          } catch {}
          const chats = collections?.Chat?.getModelsArray ? collections.Chat.getModelsArray() : [];
          const out: {
            phoneDigits: string;
            last8: string;
            hasIncoming: boolean;
            hasOutgoing: boolean;
            lastBody: string;
            lastMsgTimestampMs: number;
          }[] = [];

          for (const c of chats.slice(0, 120)) {
            try {
              if (!c || c.isGroup) continue;
              const rawId = String(c.id?._serialized || '');
              if (
                rawId.includes('@g.us') ||
                rawId.includes('broadcast') ||
                rawId.includes('newsletter')
              ) {
                continue;
              }
              let phoneDigits = '';
              if (c.id?.server !== 'lid') {
                phoneDigits = String(c.id?.user || '').replace(/\D/g, '');
              }
              if (phoneDigits.length < 8 && c.contact?.phoneNumber?.user) {
                phoneDigits = String(c.contact.phoneNumber.user).replace(/\D/g, '');
              }
              if (phoneDigits.length < 8 && apiContact?.getPhoneNumber) {
                try {
                  const pnWid = apiContact.getPhoneNumber(c.id);
                  if (pnWid?.user) {
                    phoneDigits = String(pnWid.user).replace(/\D/g, '');
                  }
                } catch {}
              }
              if (phoneDigits.length < 8 && c.formattedTitle) {
                const titleDigits = String(c.formattedTitle).replace(/\D/g, '');
                if (titleDigits.length >= 8) {
                  phoneDigits = titleDigits;
                }
              }
              if (phoneDigits.length < 8) continue;
              const msgs = c.msgs?.getModelsArray ? c.msgs.getModelsArray() : [];
              if (!msgs || msgs.length === 0) continue;
              const hasIncoming = msgs.some((m: any) => m && m.id && m.id.fromMe === false);
              const hasOutgoing = msgs.some((m: any) => m && m.id && m.id.fromMe === true);
              if (!hasIncoming && !hasOutgoing) continue;
              const lastMsg = msgs[msgs.length - 1];
              const lastMsgTimestampMs =
                typeof lastMsg?.t === 'number' && lastMsg.t > 0 ? lastMsg.t * 1000 : 0;
              out.push({
                phoneDigits,
                last8: phoneDigits.slice(-8),
                hasIncoming,
                hasOutgoing,
                lastBody: String(lastMsg?.body || '').slice(0, 100),
                lastMsgTimestampMs,
              });
            } catch {
              // ignore individual chat parse errors
            }
          }
          return out;
        } catch {
          return [];
        }
      });

      if (!Array.isArray(chatSummaries) || chatSummaries.length === 0) {
        return { syncedCount: 0 };
      }

      const { contacts } = getAllContacts();
      const nowIso = new Date().toISOString();
      const hoyIso = nowIso.slice(0, 10);
      let syncedCount = 0;

      for (const summary of chatSummaries) {
        const match = contacts.find((c) => {
          const d = String(c.telRaw || '').replace(/\D/g, '');
          return d.length >= 8 && d.slice(-8) === summary.last8;
        });
        if (!match) continue;

        const existingItemRes =
          this.itemResults.get(String(match.id)) ||
          Array.from(this.itemResults.values()).find(
            (r) =>
              String(r.contactId) === String(match.id) ||
              String(r.telefonoNorm || '').replace(/\D/g, '').slice(-8) === summary.last8
          );

        // Solo reconciliar actividad reciente del día (últimas 18 hs) o contactos con envío registrado en la sesión actual,
        // preservando 1:1 las curaciones históricas hechas manualmente en Google Sheets sobre chats antiguos.
        const isRecentActivity =
          (summary.lastMsgTimestampMs > 0 &&
            Date.now() - summary.lastMsgTimestampMs <= 18 * 3600 * 1000) ||
          Boolean(existingItemRes);
        if (!isRecentActivity) {
          continue;
        }

        const est = match.estadoFlujo || 'SIN_CONTACTAR_1ER_MSJ';
        const digitsNorm =
          this.buildPhoneCandidates(match.telRaw)[0] ||
          String(match.telRaw || '').replace(/\D/g, '');

        // Caso A: El candidato respondió en WhatsApp y su ficha aún estaba en etapa 1 o 2 (Sin respuesta)
        if (
          summary.hasIncoming &&
          (est === 'SIN_CONTACTAR_1ER_MSJ' ||
            est === 'FALTA_NOMBRE_Y_APELLIDO' ||
            est === '1ER_MSJ_ENVIADO_SIN_RSP' ||
            est === '2DO_SEG_ENVIADO_SIN_RSP' ||
            match.rsp !== 'Sí')
        ) {
          // No pisar estados ya más avanzados (Encuentro confirmado, Adhirió, Baja, etc.)
          const noPisar: EstadoFlujo[] = [
            'PIDIO_MAS_INFO_ENVIADA',
            'PASO_DATOS_FALTA_CONFIRMAR',
            'PREFIERE_CAFE_HUB_O_SEDE',
            'ENCUENTRO_CONFIRMADO',
            'RECORDATORIO_DIA_ENVIADO',
            'PENDIENTE_RETIRO_FICHAS',
            'YA_ADHIRIO_FIRMA_OK',
            'SIN_DNI_CABA_PEDIR_REFERIDOS',
            'DESCARTADO_O_BAJA',
          ];
          const estadoInferido = procesarContacto(
            {
              ...match,
              rsp: 'Sí',
              primerContactoEnviado: true,
              estadoFlujo: undefined,
            },
            DEFAULT_VOICE_PROFILE
          ).estadoFlujo;
          const nuevoEstado: EstadoFlujo = noPisar.includes(est)
            ? est
            : estadoInferido && estadoInferido !== '1ER_MSJ_ENVIADO_SIN_RSP'
            ? estadoInferido
            : 'RESPONDIO_FALTA_DNI_O_ZONA';
          const etiqueta = obtenerEtiquetaEstadoFlujo(nuevoEstado);

          if (match.estadoFlujo !== nuevoEstado || match.rsp !== 'Sí') {
            const updated = updateContactFields(String(match.id), {
              rsp: 'Sí',
              primerContactoEnviado: true,
              fechaPrimerContacto: match.fechaPrimerContacto || hoyIso,
              ultimoContacto: hoyIso,
              estadoFlujo: nuevoEstado,
              estadoFlujoEtiqueta: etiqueta,
              actualizadoEnAppAt: nowIso,
            });
            if (updated) {
              this.updatedContacts.set(String(updated.id), updated);
              this.syncContactToGoogleSheets(updated, 'Respondió por WhatsApp');
              syncedCount++;
            }
          }

          if (existingItemRes && existingItemRes.resultado !== 'ENVIADO_OK') {
            const key = String(match.id || digitsNorm);
            this.itemResults.set(key, {
              ...existingItemRes,
              contactId: String(match.id),
              telefonoNorm: digitsNorm,
              resultado: 'ENVIADO_OK',
              detalleResultado: 'Mensaje entregado y respondido por WhatsApp Web (ficha y Sheets actualizados).',
              fechaHoraResultadoISO: nowIso,
              sincronizadoSheets: true,
            });
          }
        } else if (
          // Caso B: Se le envió mensaje saliente en WhatsApp y su ficha seguía en "1. Nuevo · Sin 1er mensaje"
          !summary.hasIncoming &&
          summary.hasOutgoing &&
          (est === 'SIN_CONTACTAR_1ER_MSJ' || est === 'FALTA_NOMBRE_Y_APELLIDO')
        ) {
          const nuevoEstado: EstadoFlujo = '1ER_MSJ_ENVIADO_SIN_RSP';
          const etiqueta = obtenerEtiquetaEstadoFlujo(nuevoEstado);
          const updated = updateContactFields(String(match.id), {
            rsp: 'No',
            primerContactoEnviado: true,
            fechaPrimerContacto: match.fechaPrimerContacto || hoyIso,
            ultimoContacto: hoyIso,
            ultimoMensajeCorteEnviadoAt: nowIso,
            estadoFlujo: nuevoEstado,
            estadoFlujoEtiqueta: etiqueta,
            actualizadoEnAppAt: nowIso,
          });
          if (updated) {
            this.updatedContacts.set(String(updated.id), updated);
            this.syncContactToGoogleSheets(updated, '1er mensaje enviado por WhatsApp');
            syncedCount++;
          }

          if (existingItemRes && existingItemRes.resultado !== 'ENVIADO_OK') {
            const key = String(match.id || digitsNorm);
            this.itemResults.set(key, {
              ...existingItemRes,
              contactId: String(match.id),
              telefonoNorm: digitsNorm,
              resultado: 'ENVIADO_OK',
              detalleResultado: 'Mensaje enviado con éxito por WhatsApp Web (verificado en chat activo).',
              fechaHoraResultadoISO: nowIso,
              sincronizadoSheets: true,
            });
          }
        } else if (
          summary.hasOutgoing &&
          existingItemRes &&
          existingItemRes.resultado === 'ERROR_ENVIO'
        ) {
          const key = String(match.id || digitsNorm);
          this.itemResults.set(key, {
            ...existingItemRes,
            contactId: String(match.id),
            telefonoNorm: digitsNorm,
            resultado: 'ENVIADO_OK',
            detalleResultado: 'Mensaje enviado con éxito por WhatsApp Web (verificado en chat activo).',
            fechaHoraResultadoISO: nowIso,
            sincronizadoSheets: true,
          });
        }
      }

      if (syncedCount > 0) {
        this.addLog(
          'success',
          `🔄 Correspondencia automática WhatsApp ↔ Fichas: ${syncedCount} candidato(s) sincronizados según sus chats activos.`
        );
      }
      return { syncedCount };
    } catch {
      return { syncedCount: 0 };
    }
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

  private cleanStaleSessionLocks(sessionDir: string): void {
    try {
      const candidateDirs = [
        sessionDir,
        path.join(sessionDir, 'session'),
        path.join(sessionDir, 'session', 'Default'),
        path.join(sessionDir, 'session-popurri-crm-main'),
        path.join(sessionDir, 'session-popurri-crm-main', 'Default'),
      ];
      const lockFiles = [
        'SingletonLock',
        'SingletonCookie',
        'SingletonSocket',
        'DevToolsActivePort',
      ];
      for (const dir of candidateDirs) {
        if (!fs.existsSync(dir)) continue;
        for (const file of lockFiles) {
          const target = path.join(dir, file);
          try {
            if (fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink()) {
              fs.unlinkSync(target);
            }
          } catch {
            // Ignore individual unlink errors
          }
        }
      }
    } catch {
      // Ignore directory scan errors
    }
  }

  private terminateZombieBrowsers(sessionDir: string): void {
    try {
      if (process.platform === 'win32') {
        const escapedDir = sessionDir.replace(/\\/g, '\\\\');
        execSync(
          `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'chrome' -and $_.CommandLine -match '${escapedDir}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
          { stdio: 'ignore' }
        );
      } else {
        const cleanPath = sessionDir.replace(/"/g, '\\"');
        execSync(`pkill -9 -f "${cleanPath}" 2>/dev/null || true`, { stdio: 'ignore' });
      }
    } catch {
      // Ignore kill errors
    }
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

      // Limpieza preventiva de procesos huérfanos y locks stale de Chromium
      this.terminateZombieBrowsers(sessionDir);
      this.cleanStaleSessionLocks(sessionDir);

      if (this.client) {
        try {
          await this.client.destroy();
        } catch {}
        this.client = null;
      }

      const browserExecPath = resolveSystemBrowserExecutable();
      if (browserExecPath) {
        this.addLog('info', `Usando navegador detectado en el sistema: ${browserExecPath}`);
      }

      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: sessionDir,
        }),
        puppeteer: {
          headless: true,
          ...(browserExecPath ? { executablePath: browserExecPath } : {}),
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
        setTimeout(() => {
          if (this.status === 'AUTHENTICATING' && this.client?.pupPage) {
            void this.client.pupPage
              .evaluate(async () => {
                try {
                  const sock = (window as any).require?.('WAWebSocketModel')?.Socket;
                  if (
                    sock?.hasSynced &&
                    typeof (window as any).onAppStateHasSyncedEvent === 'function'
                  ) {
                    await (window as any).onAppStateHasSyncedEvent();
                  }
                } catch {}
              })
              .catch(() => {});
          }
        }, 4500);
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
        // Sincronizar chats recientes en segundo plano tras conectar
        setTimeout(() => {
          void this.syncRecentChatsWithDatabase();
        }, 2500);
      });

      // Escuchar en tiempo real mensajes entrantes y salientes para mantener correspondencia 100% con las fichas
      this.client.on('message_create', async (msg: any) => {
        try {
          if (!msg) return;
          const remoteId = String(msg.fromMe ? msg.to || '' : msg.from || '');
          if (
            !remoteId ||
            remoteId.includes('@g.us') ||
            remoteId.includes('broadcast') ||
            remoteId.includes('newsletter')
          ) {
            return;
          }
          let phoneDigits = remoteId.includes('@lid')
            ? ''
            : remoteId.split('@')[0].replace(/\D/g, '');
          if (phoneDigits.length < 8) {
            try {
              const contactObj = await msg.getContact();
              if (contactObj?.number) {
                phoneDigits = String(contactObj.number).replace(/\D/g, '');
              }
            } catch {
              // ignore
            }
          }
          if (phoneDigits.length < 8 && this.client?.pupPage) {
            try {
              const resolvedPn = await this.client.pupPage.evaluate((jid: string) => {
                try {
                  const collections = (window as any).require('WAWebCollections');
                  const ch = collections?.Chat?.get ? collections.Chat.get(jid) : null;
                  if (ch?.contact?.phoneNumber?.user) {
                    return String(ch.contact.phoneNumber.user).replace(/\D/g, '');
                  }
                  const apiContact = (window as any).require('WAWebApiContact');
                  const widFactory = (window as any).require('WAWebWidFactory');
                  const wid = widFactory?.createWid ? widFactory.createWid(jid) : ch?.id;
                  const pnWid = apiContact?.getPhoneNumber && wid ? apiContact.getPhoneNumber(wid) : null;
                  if (pnWid?.user) {
                    return String(pnWid.user).replace(/\D/g, '');
                  }
                  if (ch?.formattedTitle) {
                    const td = String(ch.formattedTitle).replace(/\D/g, '');
                    if (td.length >= 8) return td;
                  }
                } catch {}
                return '';
              }, remoteId);
              if (resolvedPn && resolvedPn.length >= 8) {
                phoneDigits = resolvedPn;
              }
            } catch {
              // ignore
            }
          }
          if (phoneDigits.length < 8) return;

          const matchedContact = this.findContactByIdOrPhone(undefined, phoneDigits);
          if (!matchedContact) return;

          const nowIso = new Date().toISOString();
          const hoyIso = nowIso.slice(0, 10);
          const est = matchedContact.estadoFlujo || 'SIN_CONTACTAR_1ER_MSJ';
          const digitsNorm =
            this.buildPhoneCandidates(matchedContact.telRaw)[0] ||
            String(matchedContact.telRaw || '').replace(/\D/g, '');

          if (!msg.fromMe) {
            // Mensaje entrante del candidato: si aún figuraba sin respuesta, pasar a "3. Respondió · Validar DNI CABA y Zona"
            const estadosAvanzados: EstadoFlujo[] = [
              'RESPONDIO_FALTA_DNI_O_ZONA',
              'PIDIO_MAS_INFO_ENVIADA',
              'PASO_DATOS_FALTA_CONFIRMAR',
              'PREFIERE_CAFE_HUB_O_SEDE',
              'ENCUENTRO_CONFIRMADO',
              'RECORDATORIO_DIA_ENVIADO',
              'PENDIENTE_RETIRO_FICHAS',
              'YA_ADHIRIO_FIRMA_OK',
              'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO',
              'SIN_DNI_CABA_PEDIR_REFERIDOS',
              'DESCARTADO_O_BAJA',
            ];
            const nuevoEstado: EstadoFlujo = estadosAvanzados.includes(est)
              ? est
              : 'RESPONDIO_FALTA_DNI_O_ZONA';
            const etiqueta = obtenerEtiquetaEstadoFlujo(nuevoEstado);

            if (matchedContact.estadoFlujo !== nuevoEstado || matchedContact.rsp !== 'Sí') {
              const updated = updateContactFields(String(matchedContact.id), {
                rsp: 'Sí',
                primerContactoEnviado: true,
                fechaPrimerContacto: matchedContact.fechaPrimerContacto || hoyIso,
                ultimoContacto: hoyIso,
                estadoFlujo: nuevoEstado,
                estadoFlujoEtiqueta: etiqueta,
                actualizadoEnAppAt: nowIso,
              });
              if (updated) {
                this.updatedContacts.set(String(updated.id), updated);
                this.syncContactToGoogleSheets(updated, 'Respondió por WhatsApp');
                this.addLog(
                  'success',
                  `💬 Respuesta detectada en WhatsApp de #${updated.id} ${updated.nombre}: ficha actualizada a "${etiqueta}"`
                );
              }
            }
            const existingItem = this.itemResults.get(String(matchedContact.id));
            if (existingItem && existingItem.resultado !== 'ENVIADO_OK') {
              this.itemResults.set(String(matchedContact.id), {
                ...existingItem,
                resultado: 'ENVIADO_OK',
                detalleResultado: 'Mensaje entregado y respondido por WhatsApp Web.',
                fechaHoraResultadoISO: nowIso,
                sincronizadoSheets: true,
              });
            }
          } else {
            // Mensaje saliente enviado por el promotor desde WhatsApp: si figuraba en "1. Nuevo · Sin 1er mensaje", pasar a etapa 2
            if (est === 'SIN_CONTACTAR_1ER_MSJ' || est === 'FALTA_NOMBRE_Y_APELLIDO') {
              const nuevoEstado: EstadoFlujo = '1ER_MSJ_ENVIADO_SIN_RSP';
              const etiqueta = obtenerEtiquetaEstadoFlujo(nuevoEstado);
              const updated = updateContactFields(String(matchedContact.id), {
                rsp: matchedContact.rsp === 'Sí' ? 'Sí' : 'No',
                primerContactoEnviado: true,
                fechaPrimerContacto: matchedContact.fechaPrimerContacto || hoyIso,
                ultimoContacto: hoyIso,
                ultimoMensajeCorteEnviadoAt: nowIso,
                estadoFlujo: nuevoEstado,
                estadoFlujoEtiqueta: etiqueta,
                actualizadoEnAppAt: nowIso,
              });
              if (updated) {
                this.updatedContacts.set(String(updated.id), updated);
                this.syncContactToGoogleSheets(updated, '1er mensaje enviado por WhatsApp');
              }
            }
            const existingItem =
              this.itemResults.get(String(matchedContact.id)) ||
              this.itemResults.get(digitsNorm);
            if (existingItem && existingItem.resultado === 'ERROR_ENVIO') {
              this.itemResults.set(String(matchedContact.id || digitsNorm), {
                ...existingItem,
                contactId: String(matchedContact.id),
                telefonoNorm: digitsNorm,
                resultado: 'ENVIADO_OK',
                detalleResultado: 'Mensaje enviado con éxito por WhatsApp Web (ficha y estado actualizados).',
                fechaHoraResultadoISO: nowIso,
                sincronizadoSheets: true,
              });
            }
          }
        } catch {
          // Silencioso ante eventos internos de WhatsApp
        }
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
      const errMsg = err?.message || String(err);
      const isLockError =
        errMsg.includes('already running') ||
        errMsg.includes('userDataDir') ||
        errMsg.includes('Singleton');

      if (isLockError) {
        this.addLog('warn', 'Detectado bloqueo de navegador previo. Liberando Chromium y limpiando locks de sesión...');
        const sessionDir = path.resolve(__dirname, '../../data/wa_session');
        this.terminateZombieBrowsers(sessionDir);
        this.cleanStaleSessionLocks(sessionDir);
      }

      this.status = 'ERROR';
      this.addLog('error', `Error al inicializar WhatsApp Web: ${errMsg}`);
      return { ok: false, status: 'ERROR', message: errMsg };
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

    const sessionDir = path.resolve(__dirname, '../../data/wa_session');
    this.terminateZombieBrowsers(sessionDir);
    this.cleanStaleSessionLocks(sessionDir);

    this.status = 'DISCONNECTED';
    this.qrCodeRaw = null;
    this.qrCodeDataUrl = null;
    this.clientInfo = null;
    this.addLog('info', 'Sesión desconectada.');
    return { ok: true };
  }

  public async resetSession(): Promise<{ ok: boolean; message: string }> {
    this.addLog('info', 'Reiniciando por completo la sesión y locks de WhatsApp Web...');
    await this.disconnect();
    const sessionDir = path.resolve(__dirname, '../../data/wa_session');
    this.terminateZombieBrowsers(sessionDir);
    this.cleanStaleSessionLocks(sessionDir);
    this.status = 'DISCONNECTED';
    this.qrCodeRaw = null;
    this.qrCodeDataUrl = null;
    this.clientInfo = null;
    this.addLog('info', 'Locks de Chromium liberados. Listo para conectar.');
    return { ok: true, message: 'Sesión y locks de WhatsApp Web restablecidos.' };
  }

  /**
   * Construye las variantes normalizadas de un teléfono argentino/internacional.
   */
  private buildPhoneCandidates(rawPhone: string): string[] {
    const digitsOnly = String(rawPhone || '').replace(/\D/g, '');
    if (!digitsOnly || digitsOnly.length < 8) return [];

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
    } else if (
      digitsOnly.length === 10 &&
      (digitsOnly.startsWith('11') || digitsOnly.startsWith('2') || digitsOnly.startsWith('3'))
    ) {
      candidates.push('549' + digitsOnly);
      candidates.push('54' + digitsOnly);
    } else if (digitsOnly.length === 8) {
      candidates.push('54911' + digitsOnly);
      candidates.push('5411' + digitsOnly);
    } else {
      candidates.push(digitsOnly);
    }
    return Array.from(new Set(candidates));
  }

  /**
   * Resuelve el JID registrado en WhatsApp distinguiendo entre:
   * - Número válido y verificado (`jid` presente, `verified: true`)
   * - Número confirmado como NO registrado en WhatsApp (`jid: null`, `verified: true`, sin error de plataforma)
   * - Error técnico de plataforma WhatsApp Web / Puppeteer (`platformError` presente)
   *
   * Nota crítica: En versiones recientes de WhatsApp Web, `Wid.prototype.toJSON()` serializa como string
   * o pierde el getter `_serialized` al cruzar `pupPage.evaluate()`. Por eso extraemos el string JID
   * directamente dentro del contexto del navegador antes de retornar a Node.
   */
  public async resolveWhatsAppJidDetailed(rawPhone: string): Promise<{
    jid: string | null;
    verified: boolean;
    platformError?: string;
    candidates: string[];
  }> {
    if (!this.client || this.status !== 'READY') {
      throw new Error('WhatsApp no está conectado.');
    }

    const candidates = this.buildPhoneCandidates(rawPhone);
    if (candidates.length === 0) {
      return { jid: null, verified: true, candidates: [] };
    }

    const last8 = candidates[0].slice(-8);

    try {
      if (this.client.pupPage) {
        const evalRes: {
          jid: string | null;
          verified: boolean;
          platformError?: string;
        } = await this.client.pupPage.evaluate(
          async (cands: string[], suffix8: string) => {
            const extractWidString = (w: any): string | null => {
              if (!w) return null;
              if (typeof w === 'string') return w.includes('@') ? w : `${w}@c.us`;
              if (typeof w._serialized === 'string' && w._serialized) return w._serialized;
              if (typeof w.user === 'string' && w.user) {
                return `${w.user}@${w.server || 'c.us'}`;
              }
              if (typeof w.toString === 'function') {
                const s = String(w.toString());
                if (s && s !== '[object Object]' && s.includes('@')) return s;
              }
              return null;
            };

            const errors: string[] = [];

            // 1. Buscar primero en chats o contactos ya cargados en memoria de WhatsApp Web
            try {
              const collections = (window as any).require('WAWebCollections');
              let apiContact: any = null;
              try {
                apiContact = (window as any).require('WAWebApiContact');
              } catch {}
              const chats = collections?.Chat?.getModelsArray ? collections.Chat.getModelsArray() : [];
              for (const ch of chats) {
                if (!ch || ch.isGroup) continue;
                const u = ch.id?.server !== 'lid' ? String(ch.id?.user || '').replace(/\D/g, '') : '';
                let pn = String(ch.contact?.phoneNumber?.user || '').replace(/\D/g, '');
                if (!pn && apiContact?.getPhoneNumber && ch.id) {
                  try {
                    const pnWid = apiContact.getPhoneNumber(ch.id);
                    if (pnWid?.user) pn = String(pnWid.user).replace(/\D/g, '');
                  } catch {}
                }
                if (!pn && ch.formattedTitle) {
                  const td = String(ch.formattedTitle).replace(/\D/g, '');
                  if (td.length >= 8) pn = td;
                }
                if (
                  (u && cands.includes(u)) ||
                  (pn && cands.includes(pn)) ||
                  (suffix8.length === 8 &&
                    ((u.length >= 8 && u.endsWith(suffix8)) ||
                      (pn.length >= 8 && pn.endsWith(suffix8))))
                ) {
                  const s = extractWidString(ch.id);
                  if (s) return { jid: s, verified: true };
                }
              }
            } catch {
              // continuar con QueryExists
            }

            // 2. Consultar existencia oficial en el servidor de WhatsApp para cada variante (con 9 y sin 9)
            for (const cand of cands) {
              try {
                const widFactory = (window as any).require('WAWebWidFactory');
                const queryJob = (window as any).require('WAWebQueryExistsJob');
                const wid = widFactory.createWid(`${cand}@c.us`);
                const result = await queryJob.queryWidExists(wid);
                if (result) {
                  const targetWid = result.wid || (result === true ? wid : null);
                  const serialized = extractWidString(targetWid);
                  if (serialized) {
                    return { jid: serialized, verified: true };
                  }
                }
              } catch (err: any) {
                errors.push(err?.message || String(err));
              }
            }

            // 3. Fallback adicional si queryWidExists lanzó excepción interna
            if (errors.length > 0) {
              for (const cand of cands) {
                try {
                  const widFactory = (window as any).require('WAWebWidFactory');
                  const findChatAction = (window as any).require('WAWebFindChatAction');
                  const wid = widFactory.createWid(`${cand}@c.us`);
                  const found = await findChatAction.findOrCreateLatestChat(wid);
                  if (found?.chat?.id) {
                    const serialized = extractWidString(found.chat.id);
                    if (serialized) {
                      return { jid: serialized, verified: true };
                    }
                  }
                } catch (err2: any) {
                  errors.push(err2?.message || String(err2));
                }
              }
              return {
                jid: `${cands[0]}@c.us`,
                verified: false,
                platformError: errors[0],
              };
            }

            return { jid: null, verified: true };
          },
          candidates,
          last8
        );

        return { ...evalRes, candidates };
      }
    } catch (outerErr: any) {
      return {
        jid: `${candidates[0]}@c.us`,
        verified: false,
        platformError: outerErr?.message || String(outerErr),
        candidates,
      };
    }

    // Fallback clásico manejando string u objeto
    for (const cand of candidates) {
      try {
        const idObj: any = await this.client.getNumberId(cand);
        if (typeof idObj === 'string' && idObj.length > 5) {
          return { jid: idObj.includes('@') ? idObj : `${idObj}@c.us`, verified: true, candidates };
        }
        if (idObj && (idObj._serialized || idObj.user)) {
          const s = idObj._serialized || `${idObj.user}@${idObj.server || 'c.us'}`;
          return { jid: s, verified: true, candidates };
        }
      } catch (err: any) {
        return {
          jid: `${candidates[0]}@c.us`,
          verified: false,
          platformError: err?.message || String(err),
          candidates,
        };
      }
    }

    return { jid: null, verified: true, candidates };
  }

  /**
   * Resuelve el JID registrado en WhatsApp para un teléfono argentino/internacional.
   */
  public async resolveWhatsAppJid(rawPhone: string): Promise<string | null> {
    const res = await this.resolveWhatsAppJidDetailed(rawPhone);
    return res.jid;
  }

  /**
   * Registra y persiste en SQLite, Memoria de Auditoría y Google Sheets el resultado de un envío,
   * garantizando correspondencia exacta con la ficha del candidato:
   * - ENVIADO_OK -> avanza estado en la ficha (ej. "2. 1er Mensaje enviado · Sin respuesta").
   * - NUMERO_INEXISTENTE -> cambia estado a "11. Baja / Número Inválido / Descartado" + comentario.
   * - ERROR_ENVIO -> NO cambia el estatus de la ficha del candidato y queda listo para reintento.
   */
  private applyAndPersistSendOutcome(params: {
    rawPhone: string;
    messageText: string;
    resultado: ResultadoEnvioAuto;
    detalle: string;
    contactId?: string;
    nombre?: string;
    barrio?: string;
    tipoAccion?: string;
    appsScriptUrl?: string;
  }): void {
    const nowIso = new Date().toISOString();
    const hoyIso = nowIso.slice(0, 10);
    const hoyBA = obtenerPartesFechaHoraBA();
    const selloFecha = `${hoyBA.ddmm} ${hoyBA.hhmm}`;

    const existingContact = this.findContactByIdOrPhone(params.contactId, params.rawPhone);
    const effectiveContactId = String(params.contactId || existingContact?.id || '');
    const effectiveNombre =
      params.nombre || existingContact?.nombre || `Sin nombre (${params.rawPhone})`;
    const effectiveBarrio = params.barrio || existingContact?.barrio || '';
    const digitsNorm =
      this.buildPhoneCandidates(params.rawPhone)[0] ||
      String(params.rawPhone || '').replace(/\D/g, '');

    if (params.resultado === 'ENVIADO_OK') {
      const resolvedState = resolverEstadoPorEnvioBackend(
        existingContact,
        params.tipoAccion,
        params.messageText
      );
      const etiquetaNueva = obtenerEtiquetaEstadoFlujo(resolvedState.estadoFlujo);

      const reg: ControlEnvioRegistro = {
        idRegistro: `wa-wweb-${Date.now()}-${effectiveContactId || 'direct'}`,
        contactId: effectiveContactId,
        nombre: effectiveNombre,
        barrio: effectiveBarrio,
        telRaw: params.rawPhone,
        tipoMensaje: params.tipoAccion || 'mensaje_wwebjs',
        estadoAnterior:
          existingContact?.estadoFlujoEtiqueta || existingContact?.estadoFlujo || '',
        estadoNuevo: resolvedState.estadoFlujo,
        estadoNuevoEtiqueta: etiquetaNueva,
        rspNuevo: resolvedState.rsp,
        adhirioNuevo: resolvedState.adhirio,
        comentario: params.messageText.slice(0, 150),
        fechaHora: nowIso,
        sincronizadoSheets: true,
      };
      recordEnvio(reg);

      if (effectiveContactId) {
        const updated = updateContactFields(effectiveContactId, {
          primerContactoEnviado: true,
          fechaPrimerContacto: existingContact?.fechaPrimerContacto || hoyIso,
          ultimoContacto: hoyIso,
          ultimoMensajeCorteEnviadoAt: nowIso,
          actualizadoEnAppAt: nowIso,
          rsp: resolvedState.rsp,
          adhirio: resolvedState.adhirio,
          estadoFlujo: resolvedState.estadoFlujo,
          estadoFlujoEtiqueta: etiquetaNueva,
        });
        if (updated) {
          this.updatedContacts.set(String(updated.id), updated);
          this.syncContactToGoogleSheets(
            updated,
            '1er mensaje enviado por WhatsApp',
            params.appsScriptUrl
          );
        }
      }
    } else if (params.resultado === 'NUMERO_INEXISTENTE') {
      const etiquetaInvalida = obtenerEtiquetaEstadoFlujo('DESCARTADO_O_BAJA');
      const notaInexistente = `El número no existe en WhatsApp (Detectado auto ${selloFecha})`;
      const prevCom = (existingContact?.comentario || '').trim();
      const nuevoComentario = prevCom.toLowerCase().includes('no existe en whatsapp')
        ? prevCom
        : prevCom
        ? `${prevCom} — ${notaInexistente}`
        : notaInexistente;

      const reg: ControlEnvioRegistro = {
        idRegistro: `wa-inval-${Date.now()}-${effectiveContactId || 'direct'}`,
        contactId: effectiveContactId,
        nombre: effectiveNombre,
        barrio: effectiveBarrio,
        telRaw: params.rawPhone,
        tipoMensaje: 'numero_inexistente_wa',
        estadoAnterior:
          existingContact?.estadoFlujoEtiqueta || existingContact?.estadoFlujo || '',
        estadoNuevo: 'DESCARTADO_O_BAJA',
        estadoNuevoEtiqueta: etiquetaInvalida,
        rspNuevo: 'No',
        adhirioNuevo: 'No',
        comentario: 'El número no existe en WhatsApp',
        fechaHora: nowIso,
        sincronizadoSheets: true,
      };
      recordEnvio(reg);

      if (effectiveContactId) {
        const updated = updateContactFields(effectiveContactId, {
          rsp: 'No',
          adhirio: 'No',
          primerContactoEnviado: true,
          fechaPrimerContacto: existingContact?.fechaPrimerContacto || hoyIso,
          ultimoContacto: hoyIso,
          actualizadoEnAppAt: nowIso,
          estadoFlujo: 'DESCARTADO_O_BAJA',
          estadoFlujoEtiqueta: etiquetaInvalida,
          comentario: nuevoComentario,
        });
        if (updated) {
          this.updatedContacts.set(String(updated.id), updated);
          this.syncContactToGoogleSheets(
            updated,
            'El número no existe en WhatsApp',
            params.appsScriptUrl
          );
        }
      }
    }
    // Nota: Si params.resultado === 'ERROR_ENVIO' o 'SESION_RESTRINGIDA_ABORTAR',
    // NO se modifica el estado de la ficha del candidato en SQLite ni en Google Sheets,
    // dejándolo intacto para su reintento posterior.

    const key = effectiveContactId || digitsNorm;
    if (key) {
      this.itemResults.set(key, {
        contactId: effectiveContactId,
        telefonoNorm: digitsNorm,
        nombre: effectiveNombre,
        barrio: effectiveBarrio,
        resultado: params.resultado,
        detalleResultado: params.detalle,
        fechaHoraResultadoISO: nowIso,
        sincronizadoSheets:
          params.resultado === 'ENVIADO_OK' || params.resultado === 'NUMERO_INEXISTENTE',
      });
    }
  }

  /**
   * Envía un mensaje individual con simulación humana de tipeo, reintento automático ante fallos técnicos
   * y correspondencia total con la ficha del candidato.
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
      appsScriptUrl?: string;
    }
  ): Promise<{
    ok: boolean;
    resultado: ResultadoEnvioAuto;
    detalle: string;
    messageId?: string;
  }> {
    if (options?.appsScriptUrl) {
      this.lastAppsScriptUrl = options.appsScriptUrl;
    }

    if (!this.client || this.status !== 'READY') {
      const detalleNoReady = 'WhatsApp Web no está conectado ni listo (estatus del candidato sin cambios).';
      this.applyAndPersistSendOutcome({
        rawPhone,
        messageText,
        resultado: 'ERROR_ENVIO',
        detalle: detalleNoReady,
        ...options,
      });
      return {
        ok: false,
        resultado: 'ERROR_ENVIO',
        detalle: detalleNoReady,
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

    const resolution = await this.resolveWhatsAppJidDetailed(rawPhone);
    let targetJid = resolution.jid;

    // Guardia sistémica: si queryWidExists devuelve null para múltiples números consecutivos sin ningún éxito previo,
    // verificar mediante intento de envío directo antes de clasificar como NUMERO_INEXISTENTE.
    if (!targetJid) {
      this.consecutiveNullLookups++;
      if (this.consecutiveNullLookups >= 2 && this.sentTimestamps.length === 0 && resolution.candidates.length > 0) {
        this.addLog(
          'warn',
          `🔍 Verificando plataforma para ${rawPhone}: múltiples consultas sin respuesta de directorio, intentando resolución directa de chat...`
        );
        targetJid = `${resolution.candidates[0]}@c.us`;
      } else {
        const detalleInex = `El número ${rawPhone} no está registrado en WhatsApp (ficha actualizada a Baja / Número Inválido).`;
        this.addLog('warn', `🚫 Número confirmado sin WhatsApp: ${options?.nombre || ''} (${rawPhone})`);
        this.applyAndPersistSendOutcome({
          rawPhone,
          messageText,
          resultado: 'NUMERO_INEXISTENTE',
          detalle: detalleInex,
          ...options,
        });
        return {
          ok: false,
          resultado: 'NUMERO_INEXISTENTE',
          detalle: detalleInex,
        };
      }
    } else {
      this.consecutiveNullLookups = 0;
    }

    const last8 = (resolution.candidates[0] || String(rawPhone || '').replace(/\D/g, '')).slice(-8);

    const verifyOutgoingMessageInChat = async (
      jidToCheck: string,
      suffix8: string
    ): Promise<{ sent: boolean; msgId?: string }> => {
      if (!this.client?.pupPage) return { sent: false };
      try {
        return await this.client.pupPage.evaluate(
          (jid: string, sfx8: string) => {
            try {
              const collections = (window as any).require('WAWebCollections');
              let apiContact: any = null;
              try {
                apiContact = (window as any).require('WAWebApiContact');
              } catch {}
              let chat = collections?.Chat?.get ? collections.Chat.get(jid) : null;
              if (!chat && sfx8 && sfx8.length === 8 && collections?.Chat?.getModelsArray) {
                const chats = collections.Chat.getModelsArray();
                chat = chats.find((ch: any) => {
                  if (!ch || ch.isGroup) return false;
                  const u = ch.id?.server !== 'lid' ? String(ch.id?.user || '').replace(/\D/g, '') : '';
                  let pn = String(ch.contact?.phoneNumber?.user || '').replace(/\D/g, '');
                  if (!pn && apiContact?.getPhoneNumber && ch.id) {
                    try {
                      const pnWid = apiContact.getPhoneNumber(ch.id);
                      if (pnWid?.user) pn = String(pnWid.user).replace(/\D/g, '');
                    } catch {}
                  }
                  if (!pn && ch.formattedTitle) {
                    const td = String(ch.formattedTitle).replace(/\D/g, '');
                    if (td.length >= 8) pn = td;
                  }
                  return (u.length >= 8 && u.endsWith(sfx8)) || (pn.length >= 8 && pn.endsWith(sfx8));
                });
              }
              if (!chat) return { sent: false };
              const msgs = chat.msgs?.getModelsArray ? chat.msgs.getModelsArray() : [];
              const nowSec = Math.floor(Date.now() / 1000);
              for (let idx = msgs.length - 1; idx >= 0; idx--) {
                const m = msgs[idx];
                if (!m || !m.id?.fromMe) continue;
                if (!m.t || Math.abs(nowSec - m.t) <= 180) {
                  return { sent: true, msgId: String(m.id?.id || m.id?._serialized || '') };
                }
              }
              return { sent: false };
            } catch {
              return { sent: false };
            }
          },
          jidToCheck,
          suffix8
        );
      } catch {
        return { sent: false };
      }
    };

    const tryDeliver = async (jidToTry: string, doTyping: boolean) => {
      if (doTyping && this.client?.pupPage) {
        try {
          await this.client.pupPage.evaluate(async (jid: string) => {
            try {
              if ((window as any).WWebJS?.sendChatstate) {
                await (window as any).WWebJS.sendChatstate('typing', jid);
              }
            } catch {}
          }, jidToTry);
          const typingMs = Math.min(5500, Math.max(2000, messageText.length * 28));
          await new Promise((r) => setTimeout(r, typingMs));
          await this.client.pupPage.evaluate(async (jid: string) => {
            try {
              if ((window as any).WWebJS?.sendChatstate) {
                await (window as any).WWebJS.sendChatstate('stop', jid);
              }
            } catch {}
          }, jidToTry);
        } catch {
          // Si falla la simulación de tipeo, continuar con el envío
        }
      }
      return await this.client.sendMessage(jidToTry, messageText, { sendSeen: false });
    };

    try {
      const sentMsg = await tryDeliver(targetJid, options?.simularTipeo !== false);
      const verified = sentMsg?.id?.id
        ? { sent: true, msgId: sentMsg.id.id }
        : await verifyOutgoingMessageInChat(targetJid, last8);
      const messageId = verified.msgId || `wweb-${Date.now()}`;

      this.sentTimestamps.push(Date.now());
      this.consecutiveNullLookups = 0;

      const detalleOk = 'Mensaje enviado con éxito por WhatsApp Web (ficha y estado actualizados).';
      this.applyAndPersistSendOutcome({
        rawPhone,
        messageText,
        resultado: 'ENVIADO_OK',
        detalle: detalleOk,
        ...options,
      });

      this.addLog(
        'success',
        `✅ Mensaje enviado con éxito a ${options?.nombre || rawPhone} (${targetJid.split('@')[0]})`
      );

      return {
        ok: true,
        resultado: 'ENVIADO_OK',
        detalle: detalleOk,
        messageId,
      };
    } catch (firstErr: any) {
      // Antes de reintentar, verificar si el mensaje ya quedó efectivamente enviado en el chat de WhatsApp Web
      const alreadySentFirst = await verifyOutgoingMessageInChat(targetJid, last8);
      if (alreadySentFirst.sent) {
        const messageId = alreadySentFirst.msgId || `wweb-verified-${Date.now()}`;
        this.sentTimestamps.push(Date.now());
        this.consecutiveNullLookups = 0;

        const detalleOk = 'Mensaje enviado con éxito por WhatsApp Web (verificado en chat activo).';
        this.applyAndPersistSendOutcome({
          rawPhone,
          messageText,
          resultado: 'ENVIADO_OK',
          detalle: detalleOk,
          ...options,
        });

        this.addLog(
          'success',
          `✅ Mensaje enviado con éxito a ${options?.nombre || rawPhone} (confirmado en chat)`
        );

        return {
          ok: true,
          resultado: 'ENVIADO_OK',
          detalle: detalleOk,
          messageId,
        };
      }

      // Reintento automático 1 vez tras breve pausa sobre el mismo JID verificado (sin degradar a variante sin 9 que carece de LID)
      this.addLog(
        'warn',
        `⏳ Fallo en 1er intento a ${options?.nombre || rawPhone}, reintentando automáticamente en 2.5s...`
      );
      await new Promise((r) => setTimeout(r, 2500));

      try {
        const retrySent = await tryDeliver(targetJid, false);
        const verifiedRetry = retrySent?.id?.id
          ? { sent: true, msgId: retrySent.id.id }
          : await verifyOutgoingMessageInChat(targetJid, last8);
        const messageId = verifiedRetry.msgId || `wweb-retry-${Date.now()}`;

        this.sentTimestamps.push(Date.now());
        this.consecutiveNullLookups = 0;

        const detalleOkRetry = 'Mensaje enviado con éxito en reintento automático (ficha actualizada).';
        this.applyAndPersistSendOutcome({
          rawPhone,
          messageText,
          resultado: 'ENVIADO_OK',
          detalle: detalleOkRetry,
          ...options,
        });

        this.addLog(
          'success',
          `✅ Mensaje enviado con éxito en reintento a ${options?.nombre || rawPhone}`
        );

        return {
          ok: true,
          resultado: 'ENVIADO_OK',
          detalle: detalleOkRetry,
          messageId,
        };
      } catch (retryErr: any) {
        const alreadySentRetry = await verifyOutgoingMessageInChat(targetJid, last8);
        if (alreadySentRetry.sent) {
          const messageId = alreadySentRetry.msgId || `wweb-verified-retry-${Date.now()}`;
          this.sentTimestamps.push(Date.now());
          this.consecutiveNullLookups = 0;

          const detalleOk = 'Mensaje enviado con éxito por WhatsApp Web (verificado en chat activo).';
          this.applyAndPersistSendOutcome({
            rawPhone,
            messageText,
            resultado: 'ENVIADO_OK',
            detalle: detalleOk,
            ...options,
          });

          this.addLog(
            'success',
            `✅ Mensaje enviado con éxito a ${options?.nombre || rawPhone} (confirmado en chat)`
          );

          return {
            ok: true,
            resultado: 'ENVIADO_OK',
            detalle: detalleOk,
            messageId,
          };
        }

        const errStr = String(retryErr?.message || firstErr?.message || retryErr);
        const detalleErr = `Fallo técnico de envío (Estatus del candidato sin cambios · Pendiente de reintento): ${errStr}`;
        this.addLog(
          'error',
          `❌ Error al enviar a ${options?.nombre || rawPhone} (se mantiene su estatus para reintento): ${errStr}`
        );

        this.applyAndPersistSendOutcome({
          rawPhone,
          messageText,
          resultado: 'ERROR_ENVIO',
          detalle: detalleErr,
          ...options,
        });

        return {
          ok: false,
          resultado: 'ERROR_ENVIO',
          detalle: detalleErr,
        };
      }
    }
  }

  /**
   * Avanza escalonadamente el nivel de calentamiento (Warm-up) entre días sucesivos del bucle de 24h,
   * garantizando siempre un tope estrictamente menor a 45 mensajes por jornada.
   */
  private getNextWarmupLevel(current?: NivelWarmupWA): NivelWarmupWA {
    switch (current) {
      case 'DIA_1_MAX_10':
        return 'DIA_2_MAX_15';
      case 'DIA_2_MAX_15':
        return 'DIA_3_MAX_25';
      case 'DIA_3_MAX_25':
        return 'DIA_4_MAX_35';
      case 'DIA_4_MAX_35':
      case 'DIA_5_MADURO_MENOS_45':
      default:
        return 'DIA_5_MADURO_MENOS_45';
    }
  }

  /**
   * Calcula si la hora actual en Buenos Aires está fuera de la ventana diurna permitida
   * o antes de la `horaInicio` configurada en la Pestaña 1 (Protección anti-madrugada y horario programado).
   */
  private calcularSegundosEsperaVentanaHoraria(
    config?: Partial<AutoFirstMessageConfig>,
    esPrimerMensajeDelDia: boolean = false
  ): { waitSec: number; horaObjetivo: string; motivo: string } {
    const hoyBA = obtenerPartesFechaHoraBA();
    const parseMin = (hhmm: string | undefined, fallbackMin: number): number => {
      if (!hhmm || !hhmm.includes(':')) return fallbackMin;
      const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return fallbackMin;
      return h * 60 + m;
    };

    const nowMin = parseMin(hoyBA.hhmm, 12 * 60);
    const nowSecOfMin = new Date().getSeconds();
    const ventanaInicioStr = config?.horaVentanaInicio || '09:00';
    const ventanaFinStr = config?.horaVentanaFin || '21:00';
    const horaInicioStr = config?.horaInicio || ventanaInicioStr;

    const ventanaInicioMin = parseMin(ventanaInicioStr, 9 * 60);
    const ventanaFinMin = parseMin(ventanaFinStr, 21 * 60);
    const horaInicioMin = parseMin(horaInicioStr, ventanaInicioMin);

    const targetStartMin = esPrimerMensajeDelDia
      ? Math.max(ventanaInicioMin, horaInicioMin)
      : ventanaInicioMin;
    const formatHHMM = (mins: number) =>
      `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

    if (nowMin < targetStartMin) {
      const waitSec = Math.max(1, (targetStartMin - nowMin) * 60 - nowSecOfMin);
      return {
        waitSec,
        horaObjetivo: formatHHMM(targetStartMin),
        motivo: 'espera_hora_inicio',
      };
    }

    if (nowMin >= ventanaFinMin) {
      const minsUntilMidnight = 24 * 60 - nowMin;
      const nextStartMin = Math.max(ventanaInicioMin, horaInicioMin);
      const waitSec = Math.max(1, (minsUntilMidnight + nextStartMin) * 60 - nowSecOfMin);
      return {
        waitSec,
        horaObjetivo: formatHHMM(nextStartMin),
        motivo: 'fuera_ventana_nocturna',
      };
    }

    return { waitSec: 0, horaObjetivo: '', motivo: '' };
  }

  /**
   * Busca el próximo candidato elegible sin contactar en SQLite para compensar automáticamente un cupo
   * cuando un número de la cola resulta inválido o falla el envío.
   */
  private findNextReplacementCandidateItem(
    triedIds: Set<string>,
    triedLast8: Set<string>,
    currentConfig: Partial<AutoFirstMessageConfig>,
    nextOrderNumber: number
  ): AutoFirstMessageQueueItem | null {
    const { contacts: rawInDb } = getAllContacts();
    const processedInDb = rawInDb.map((r) => procesarContacto(r, DEFAULT_VOICE_PROFILE));
    const barrioFiltro = currentConfig.barrioFiltro || 'Todos';

    const candidatoReemplazo = processedInDb.find((c) => {
      if (triedIds.has(String(c.id))) return false;
      const digits = String(c.telWA || c.telRaw || '').replace(/\D/g, '');
      if (digits.length < 8) return false;
      const last8 = digits.slice(-8);
      if (triedLast8.has(last8)) return false;
      if (barrioFiltro !== 'Todos' && c.barrio !== barrioFiltro) return false;
      return esContactoElegiblePrimerContactoAuto(c);
    });

    if (!candidatoReemplazo) return null;

    const miniCamp = generarColaEnvioAutomaticoPrimerContacto(
      [candidatoReemplazo],
      {
        ...currentConfig,
        cupoSorteado: 1,
        semillaSorteo: nextOrderNumber,
      },
      DEFAULT_VOICE_PROFILE
    );

    const generado = miniCamp.items[0];
    if (!generado) return null;

    return {
      ...generado,
      orden: nextOrderNumber,
      detalleResultado: 'Agregado automáticamente para compensar cupo de envío efectivo',
    };
  }

  /**
   * Ejecución de cola automatizada con pausas anti-bloqueo, compensación automática de cupo ante
   * números inválidos/fallidos, Circuit Breaker y Bucle Automático Diario cada 24 horas.
   */
  public async startQueue(
    items: AutoFirstMessageQueueItem[],
    config?: Partial<AutoFirstMessageConfig>,
    appsScriptUrl?: string,
    autoLoop24h: boolean = true
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

    if (appsScriptUrl) {
      this.lastAppsScriptUrl = appsScriptUrl;
    }

    this.queueAbortController = new AbortController();
    const signal = this.queueAbortController.signal;
    this.compensatedItems = [];

    const initialTargetSentCount = items.length;

    this.queueProgress = {
      isRunning: true,
      isPaused: false,
      currentIndex: 0,
      totalItems: items.length,
      targetSentCount: initialTargetSentCount,
      compensatedCount: 0,
      sentCount: 0,
      failedCount: 0,
      invalidCount: 0,
      startedAt: new Date().toISOString(),
      autoLoop24h,
      dayCycleNumber: 1,
    };

    const barrioEtiqueta =
      config?.barrioFiltro && config.barrioFiltro !== 'Todos'
        ? ` · Barrio filtrado: ${config.barrioFiltro}`
        : ' · Todos los barrios';
    const horarioEtiqueta = config?.horaInicio
      ? ` · Inicio programado: ${config.horaInicio} hs (ventana ${config.horaVentanaInicio || '09:00'} a ${config.horaVentanaFin || '21:00'} hs)`
      : '';

    this.addLog(
      'info',
      `🚀 Iniciando campaña automatizada (Meta: ${initialTargetSentCount} envíos efectivos en Tanda Día #1${barrioEtiqueta}${horarioEtiqueta})${
        autoLoop24h ? ' con Bucle Automático cada 24 hs y compensación automática de cupo.' : ' con compensación automática de cupo.'
      }`
    );

    // Run async in background
    (async () => {
      let currentBatchItems: AutoFirstMessageQueueItem[] = [...items];
      let currentConfig: Partial<AutoFirstMessageConfig> = { ...(config || {}) };
      let dayCycle = 1;

      try {
        while (!signal.aborted && this.queueProgress.isRunning && currentBatchItems.length > 0) {
          const batchStartedAtMs = Date.now();
          const targetForThisBatch = currentBatchItems.length;
          let batchSentOk = 0;

          const triedIds = new Set<string>(
            currentBatchItems.map((it) => String(it.contactId || '')).filter(Boolean)
          );
          const triedLast8 = new Set<string>(
            currentBatchItems
              .map((it) => String(it.telefonoNorm || it.telRaw || '').replace(/\D/g, '').slice(-8))
              .filter((s) => s.length === 8)
          );

          this.queueProgress.dayCycleNumber = dayCycle;
          this.queueProgress.targetSentCount = targetForThisBatch;
          this.queueProgress.totalItems = currentBatchItems.length;
          this.queueProgress.currentIndex = 0;
          this.queueProgress.nextBatchScheduledAtISO = undefined;

          for (let i = 0; i < currentBatchItems.length; i++) {
            if (signal.aborted || !this.queueProgress.isRunning) {
              this.addLog('warn', 'Cola de envíos detenida por el usuario.');
              break;
            }

            // Si ya alcanzamos la meta de mensajes enviados con éxito de esta tanda, cerramos la tanda
            if (batchSentOk >= targetForThisBatch) {
              break;
            }

            // Paused loop
            while (this.queueProgress.isPaused) {
              if (signal.aborted || !this.queueProgress.isRunning) break;
              await new Promise((r) => setTimeout(r, 1000));
            }

            if (signal.aborted || !this.queueProgress.isRunning) break;

            const item = currentBatchItems[i];
            this.queueProgress.currentIndex = i + 1;
            this.queueProgress.currentContactName = item.primerNombre || item.nombre;
            this.queueProgress.currentContactPhone = item.telefonoNorm;

            // 0. Verificar ventana horaria diurna y Hora de Inicio programada (Protección anti-madrugada)
            const waitHorario = this.calcularSegundosEsperaVentanaHoraria(currentConfig, i === 0);
            if (waitHorario.waitSec > 0) {
              const targetDate = new Date(Date.now() + waitHorario.waitSec * 1000);
              this.queueProgress.nextBatchScheduledAtISO = targetDate.toISOString();
              this.addLog(
                'info',
                `⏳ Protección anti-madrugada activa: Esperando hasta las ${waitHorario.horaObjetivo} hs (ventana diurna ${currentConfig.horaVentanaInicio || '09:00'} a ${currentConfig.horaVentanaFin || '21:00'} hs) antes de enviar a ${item.primerNombre || item.nombre}. Cero envíos fuera de hora.`
              );

              let waitSecRemaining = waitHorario.waitSec;
              while (waitSecRemaining > 0 && this.queueProgress.isRunning && !signal.aborted) {
                while (this.queueProgress.isPaused && this.queueProgress.isRunning && !signal.aborted) {
                  await new Promise((r) => setTimeout(r, 1000));
                }
                const hrs = Math.floor(waitSecRemaining / 3600);
                const mins = Math.floor((waitSecRemaining % 3600) / 60);
                const secs = waitSecRemaining % 60;
                this.queueProgress.currentAction = `⏳ Programado para las ${waitHorario.horaObjetivo} hs — En espera (${hrs}h ${mins}m ${secs}s)`;
                this.queueProgress.countdownSeconds = waitSecRemaining;
                await new Promise((r) => setTimeout(r, 1000));
                waitSecRemaining--;
              }
              this.queueProgress.nextBatchScheduledAtISO = undefined;
            }

            if (signal.aborted || !this.queueProgress.isRunning) break;

            // 1. Manejo de pausa de café o intervalo humano (sólo si el intento anterior fue un envío real o si i > 0)
            if (item.esPausaCafeAntes && batchSentOk > 0) {
              const pausaMin = Math.round((currentConfig?.pausaExtraCada10Seg || 300) / 60);
              this.queueProgress.currentAction = `☕ Pausa de café anti-bloqueo (${pausaMin} min)`;
              this.addLog('info', `☕ Tomando pausa de café de seguridad (~${pausaMin} min) antes del siguiente mensaje...`);

              let remainingSec = currentConfig?.pausaExtraCada10Seg || 300;
              while (remainingSec > 0 && this.queueProgress.isRunning && !signal.aborted) {
                this.queueProgress.countdownSeconds = remainingSec;
                await new Promise((r) => setTimeout(r, 1000));
                remainingSec--;
              }
            } else if (i > 0) {
              const minSec = currentConfig?.minIntervaloSeg ?? 25;
              const maxSec = currentConfig?.maxIntervaloSeg ?? 65;
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

            // 2. Enviar el mensaje (persiste automáticamente el resultado en SQLite, Auditoría y Sheets)
            this.queueProgress.currentAction = `Enviando mensaje a ${item.primerNombre || item.nombre} (${batchSentOk + 1}/${targetForThisBatch} efectivos)...`;
            this.queueProgress.countdownSeconds = 0;

            const msgText = item.mensajePrimerContacto || '';
            const sendRes = await this.sendMessage(item.telefonoNorm, msgText, {
              contactId: item.contactId,
              nombre: item.nombre || item.primerNombre,
              barrio: item.barrio,
              tipoAccion: 'primer_contacto_auto',
              simularTipeo: true,
              appsScriptUrl,
            });

            if (sendRes.resultado === 'ENVIADO_OK') {
              this.queueProgress.sentCount++;
              batchSentOk++;
            } else if (sendRes.resultado === 'SESION_RESTRINGIDA_ABORTAR') {
              this.queueProgress.failedCount++;
              this.stopQueue('Límite horario de seguridad alcanzado.');
              break;
            } else {
              if (sendRes.resultado === 'NUMERO_INEXISTENTE') {
                this.queueProgress.invalidCount++;
              } else {
                this.queueProgress.failedCount++;
              }

              // 3. COMPENSACIÓN AUTOMÁTICA DE CUPO:
              // Si un número fue inválido o falló el envío, agregamos automáticamente 1 contacto elegible más
              // para igualar el número de mensajes efectivos que el usuario tenía pensado enviar (ej. 9 enviados OK).
              const maxAttemptsCap = Math.min(44, targetForThisBatch * 3);
              if (
                batchSentOk < targetForThisBatch &&
                currentBatchItems.length < maxAttemptsCap
              ) {
                const reemplazo = this.findNextReplacementCandidateItem(
                  triedIds,
                  triedLast8,
                  currentConfig,
                  currentBatchItems.length + 1
                );
                if (reemplazo) {
                  triedIds.add(String(reemplazo.contactId));
                  const remDigits = String(reemplazo.telefonoNorm || reemplazo.telRaw || '').replace(/\D/g, '');
                  if (remDigits.length >= 8) triedLast8.add(remDigits.slice(-8));

                  currentBatchItems.push(reemplazo);
                  this.compensatedItems.push(reemplazo);
                  this.queueProgress.totalItems = currentBatchItems.length;
                  this.queueProgress.compensatedCount = (this.queueProgress.compensatedCount || 0) + 1;

                  this.addLog(
                    'info',
                    `🔄 Compensando cupo automáticamente: se sumó a #${reemplazo.contactId} ${reemplazo.nombre} (${reemplazo.barrio}) para alcanzar los ${targetForThisBatch} mensajes efectivos.`
                  );
                } else {
                  this.addLog(
                    'warn',
                    `ℹ️ No quedan más candidatos elegibles sin contactar en el filtro actual para compensar el cupo.`
                  );
                }
              }
            }
          }

          if (signal.aborted || !this.queueProgress.isRunning) break;

          // Verificar si está activo el Bucle Automático Diario cada 24 horas
          if (!this.queueProgress.autoLoop24h) {
            break;
          }

          // Consultar en SQLite cuántos contactos elegibles siguen pendientes sin contactar
          const { contacts: rawInDb } = getAllContacts();
          const processedInDb = rawInDb.map((r) => procesarContacto(r, DEFAULT_VOICE_PROFILE));
          const nextWarmup = this.getNextWarmupLevel(currentConfig.nivelWarmup);
          const rangoNext = obtenerRangoWarmup(nextWarmup);
          const nextCupo = sortearCupoSeguroAntiBloqueo(rangoNext.minCupo, rangoNext.maxCupo);

          const previewNextCampaign = generarColaEnvioAutomaticoPrimerContacto(
            processedInDb,
            {
              ...currentConfig,
              nivelWarmup: nextWarmup,
              minCupo: rangoNext.minCupo,
              maxCupo: rangoNext.maxCupo,
              cupoSorteado: nextCupo,
              semillaSorteo: dayCycle + 1,
            },
            DEFAULT_VOICE_PROFILE
          );

          this.queueProgress.remainingUncontactedInPadron = previewNextCampaign.totalElegiblesEnBase;

          if (previewNextCampaign.totalElegiblesEnBase === 0 || previewNextCampaign.items.length === 0) {
            this.addLog(
              'success',
              `🎉 ¡Todos los contactos pendientes de 1er mensaje en el padrón ya fueron contactados! Finalizando bucle de 24 hs.`
            );
            break;
          }

          // Calcular espera hasta cumplir 24 horas desde el inicio de la tanda de hoy
          const elapsedSinceBatchStartSec = Math.floor((Date.now() - batchStartedAtMs) / 1000);
          let waitSec24h = Math.max(3600, 24 * 3600 - elapsedSinceBatchStartSec);
          const nextRunDate = new Date(Date.now() + waitSec24h * 1000);
          this.queueProgress.nextBatchScheduledAtISO = nextRunDate.toISOString();

          this.addLog(
            'info',
            `🔁 Tanda Día #${dayCycle} completada. Quedan ${previewNextCampaign.totalElegiblesEnBase} contactos sin contactar. El bucle automático esperará 24 hs hasta mañana (${nextRunDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}) para enviar la Tanda Día #${dayCycle + 1} (${previewNextCampaign.items.length} msjs máx).`
          );

          while (waitSec24h > 0 && this.queueProgress.isRunning && !signal.aborted) {
            while (this.queueProgress.isPaused && this.queueProgress.isRunning && !signal.aborted) {
              await new Promise((r) => setTimeout(r, 1000));
            }
            const hrs = Math.floor(waitSec24h / 3600);
            const mins = Math.floor((waitSec24h % 3600) / 60);
            this.queueProgress.currentAction = `⏳ Bucle 24h: Próxima tanda (${previewNextCampaign.totalElegiblesEnBase} pendientes) en ${hrs}h ${mins}m`;
            this.queueProgress.countdownSeconds = waitSec24h;
            await new Promise((r) => setTimeout(r, 1000));
            waitSec24h--;
          }

          if (signal.aborted || !this.queueProgress.isRunning) break;

          // Al cumplirse las 24 horas, recargar el padrón fresco desde SQLite y generar la nueva tanda diaria
          dayCycle++;
          currentConfig = {
            ...currentConfig,
            nivelWarmup: nextWarmup,
            minCupo: rangoNext.minCupo,
            maxCupo: rangoNext.maxCupo,
            cupoSorteado: nextCupo,
          };
          const { contacts: freshRawInDb } = getAllContacts();
          const freshProcessed = freshRawInDb.map((r) => procesarContacto(r, DEFAULT_VOICE_PROFILE));
          const freshCampaign = generarColaEnvioAutomaticoPrimerContacto(
            freshProcessed,
            {
              ...currentConfig,
              semillaSorteo: dayCycle,
            },
            DEFAULT_VOICE_PROFILE
          );

          currentBatchItems = freshCampaign.items;
          this.queueProgress.remainingUncontactedInPadron = freshCampaign.totalElegiblesEnBase;

          if (currentBatchItems.length === 0) {
            this.addLog('success', '🎉 No quedan más contactos pendientes por enviar. Bucle 24h completado.');
            break;
          }

          this.addLog(
            'info',
            `🌅 Iniciando automáticamente Tanda Día #${dayCycle} con ${currentBatchItems.length} mensajes (Etapa: ${nextWarmup})...`
          );
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
      this.compensatedItems = this.compensatedItems.filter(
        (it) =>
          this.itemResults.has(String(it.contactId)) ||
          this.itemResults.has(String(it.telefonoNorm))
      );
      this.addLog('warn', `🛑 Cola detenida: ${reason}`);
    }
    return { ok: true };
  }
}

export const whatsappService = new WhatsAppService();
