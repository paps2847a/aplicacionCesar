import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Play,
  Pause,
  Square,
  RefreshCw,
  LogOut,
  Coffee,
  Clock,
  ShieldCheck,
  Send,
  Zap,
  Terminal,
  Activity,
  Layers,
  RotateCcw,
} from 'lucide-react';
import type {
  AutoFirstMessageCampaign,
  AutoFirstMessageConfig,
  ResultadoEnvioAuto,
} from '../types';

interface WhatsAppLogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

interface WhatsAppClientInfo {
  pushname?: string;
  wid?: string;
  phone?: string;
  platform?: string;
}

interface WhatsAppQueueProgress {
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

interface WhatsAppWebAutomationPanelProps {
  campaign: AutoFirstMessageCampaign;
  config: AutoFirstMessageConfig;
  appsScriptUrl?: string;
  onApplyItemResult?: (
    contactId: string,
    telefonoNorm: string,
    resultado: ResultadoEnvioAuto,
    detalle: string,
    fechaHoraISO?: string
  ) => void;
  onRefreshCampaign?: () => void;
}

export const WhatsAppWebAutomationPanel: React.FC<WhatsAppWebAutomationPanelProps> = ({
  campaign,
  config,
  appsScriptUrl,
  onApplyItemResult,
  onRefreshCampaign,
}) => {
  const [status, setStatus] = useState<string>('DISCONNECTED');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [clientInfo, setClientInfo] = useState<WhatsAppClientInfo | null>(null);
  const [queue, setQueue] = useState<WhatsAppQueueProgress>({
    isRunning: false,
    isPaused: false,
    currentIndex: 0,
    totalItems: 0,
    sentCount: 0,
    failedCount: 0,
    invalidCount: 0,
  });
  const [rollingLastHour, setRollingLastHour] = useState<number>(0);
  const [logs, setLogs] = useState<WhatsAppLogEntry[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(true);
  const [autoLoop24h, setAutoLoop24h] = useState<boolean>(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Polling del estado del servidor
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok) {
        setStatus(data.status);
        setQrCodeDataUrl(data.qrCodeDataUrl);
        setClientInfo(data.clientInfo);
        if (data.queue) setQueue(data.queue);
        if (typeof data.rollingLastHourCount === 'number') {
          setRollingLastHour(data.rollingLastHourCount);
        }
        if (Array.isArray(data.recentLogs)) {
          setLogs(data.recentLogs);
        }
      }
    } catch {
      // Ignorar fallas momentáneas de red
    }
  };

  useEffect(() => {
    fetchStatus();
    // Polling más rápido si está escaneando QR o corriendo la cola
    const intervalTime = queue.isRunning || status === 'QR_READY' ? 1200 : 3500;
    const timer = setInterval(fetchStatus, intervalTime);
    return () => clearInterval(timer);
  }, [queue.isRunning, status]);

  // Auto-scroll en logs
  useEffect(() => {
    if (autoScrollLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScrollLogs]);

  // Acciones
  const handleConnect = async () => {
    setLoadingAction('connect');
    try {
      await fetch('/api/whatsapp/initialize', { method: 'POST' });
      await fetchStatus();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('¿Seguro que querés desconectar la sesión de WhatsApp Web?')) return;
    setLoadingAction('disconnect');
    try {
      await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      await fetchStatus();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleResetSession = async () => {
    setLoadingAction('reset');
    try {
      await fetch('/api/whatsapp/reset-session', { method: 'POST' });
      await fetchStatus();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStartQueue = async () => {
    if (!campaign.items || campaign.items.length === 0) {
      alert('La cola está vacía. Generá o sorteá contactos en la pestaña 1 primero.');
      return;
    }

    if (status !== 'READY') {
      alert('Primero debes conectar tu WhatsApp Web escaneando el código QR.');
      return;
    }

    const confirmMsg = autoLoop24h
      ? `¿Iniciar campaña multi-día para los ${campaign.totalElegiblesEnBase} pendientes sin contactar?\n\n• Hoy (Día #1) enviará la tanda segura de ${campaign.items.length} mensajes (${config.minIntervaloSeg}-${config.maxIntervaloSeg}s + pausas de café).\n• Cumplidas las 24 hs, iniciará automáticamente la siguiente tanda diaria hasta completar todos los primeros contactos.`
      : `¿Iniciar el envío automatizado de ${campaign.items.length} mensajes con intervalos humanos de seguridad (${config.minIntervaloSeg}-${config.maxIntervaloSeg}s) y pausas de café?`;
    if (!window.confirm(confirmMsg)) return;

    setLoadingAction('start');
    try {
      const res = await fetch('/api/whatsapp/queue/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: campaign.items,
          config,
          appsScriptUrl,
          autoLoop24h,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`Error al iniciar la cola: ${data.error || data.message}`);
      }
      await fetchStatus();
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePauseQueue = async () => {
    try {
      await fetch('/api/whatsapp/queue/pause', { method: 'POST' });
      await fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResumeQueue = async () => {
    try {
      await fetch('/api/whatsapp/queue/resume', { method: 'POST' });
      await fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStopQueue = async () => {
    if (!window.confirm('¿Detener el envío de la cola inmediatamente?')) return;
    try {
      await fetch('/api/whatsapp/queue/stop', { method: 'POST' });
      await fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const progressPercent = queue.totalItems > 0
    ? Math.min(100, Math.round((queue.currentIndex / queue.totalItems) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* 1. Header con Resumen de Seguridad y Estado */}
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
              <Smartphone className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">
                  WhatsApp Web Directo (whatsapp-web.js)
                </h3>
                <span className="rounded-full bg-emerald-200/80 px-2.5 py-0.5 text-[11px] font-black text-emerald-900 border border-emerald-300">
                  Sin terminal externa
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Envía mensajes 1-a-1 de manera nativa simulando tipeo humano real, pausas de café y respetando el límite seguro &lt; 40 msjs/hora.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {status === 'READY' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1 text-xs font-black text-emerald-900 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                Conectado: {clientInfo?.pushname || 'Sesión Activa'} ({clientInfo?.phone ? `+${clientInfo.phone}` : 'WA'})
              </span>
            )}
            {status === 'QR_READY' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-300 px-3 py-1 text-xs font-black text-amber-900 animate-pulse">
                <QrCode className="h-3.5 w-3.5" />
                Esperando escaneo de QR
              </span>
            )}
            {status === 'INITIALIZING' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 border border-blue-300 px-3 py-1 text-xs font-bold text-blue-900">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Iniciando Chromium...
              </span>
            )}
            {status === 'ERROR' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 border border-rose-300 px-3 py-1 text-xs font-bold text-rose-800">
                <AlertCircle className="h-3.5 w-3.5" />
                Error de Sesión
              </span>
            )}
            {status === 'AUTH_FAILURE' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 border border-rose-300 px-3 py-1 text-xs font-bold text-rose-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                Fallo de Autenticación
              </span>
            )}
            {status === 'DISCONNECTED' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 border border-slate-300 px-3 py-1 text-xs font-bold text-slate-700">
                ⚪ Desconectado
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Tarjeta de Vinculación / Conexión */}
      {status !== 'READY' ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Columna Izquierda: Instrucciones */}
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900">
                <QrCode className="h-4 w-4" />
                Paso Único: Vincular Dispositivo
              </div>
              <h3 className="text-lg font-black text-slate-900">
                Escaneá el código QR con tu WhatsApp
              </h3>
              <ol className="space-y-2.5 text-xs text-slate-700 leading-relaxed list-decimal list-inside">
                <li>Abrí <strong>WhatsApp</strong> en tu teléfono.</li>
                <li>Tocá <strong>Menú (tres puntos)</strong> en Android o <strong>Ajustes / Configuración</strong> en iPhone.</li>
                <li>Seleccioná <strong>Dispositivos vinculados</strong>.</li>
                <li>Tocá <strong>Vincular un dispositivo</strong> y apuntá la cámara a este recuadro.</li>
              </ol>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Tu sesión queda guardada:</strong> Gracias a <code>LocalAuth</code>, la próxima vez que abras la app ya estará conectada sin tener que volver a escanear el QR.
                </span>
              </div>

              {(status === 'DISCONNECTED' || status === 'ERROR' || status === 'AUTH_FAILURE') && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={handleConnect}
                    disabled={loadingAction === 'connect' || loadingAction === 'reset'}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-500 transition shadow-md disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingAction === 'connect' ? 'animate-spin' : ''}`} />
                    {loadingAction === 'connect'
                      ? 'Conectando...'
                      : status === 'ERROR' || status === 'AUTH_FAILURE'
                      ? 'Reintentar Conexión'
                      : 'Iniciar y Mostrar Código QR'}
                  </button>

                  {(status === 'ERROR' || status === 'AUTH_FAILURE') && (
                    <button
                      onClick={handleResetSession}
                      disabled={loadingAction === 'connect' || loadingAction === 'reset'}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 transition shadow-sm disabled:opacity-50"
                      title="Libera locks de procesos Chromium anteriores y restablece la sesión"
                    >
                      <RotateCcw className={`h-4 w-4 ${loadingAction === 'reset' ? 'animate-spin' : ''}`} />
                      {loadingAction === 'reset' ? 'Restableciendo...' : 'Restablecer Locks / Sesión'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Columna Derecha: Render del QR o Estado */}
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6 min-h-[300px]">
              {status === 'QR_READY' && qrCodeDataUrl ? (
                <div className="space-y-3 text-center">
                  <div className="rounded-2xl border-4 border-white bg-white p-3 shadow-xl inline-block">
                    <img
                      src={qrCodeDataUrl}
                      alt="Código QR WhatsApp Web"
                      className="h-56 w-56 rounded-lg object-contain"
                    />
                  </div>
                  <p className="text-xs font-bold text-slate-600">
                    Apunta con la cámara de tu teléfono. El código se actualiza automáticamente.
                  </p>
                </div>
              ) : status === 'INITIALIZING' ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin" />
                  <p className="text-sm font-black text-slate-800">
                    Iniciando navegador Chromium en segundo plano...
                  </p>
                  <p className="text-xs text-slate-500">
                    Esto suele demorar entre 3 y 8 segundos.
                  </p>
                </div>
              ) : status === 'AUTHENTICATING' ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600 animate-bounce" />
                  <p className="text-sm font-black text-slate-800">
                    ¡Código QR escaneado con éxito!
                  </p>
                  <p className="text-xs text-slate-500">
                    Sincronizando chats con WhatsApp Web...
                  </p>
                </div>
              ) : status === 'ERROR' || status === 'AUTH_FAILURE' ? (
                <div className="flex flex-col items-center gap-3 text-center p-4">
                  <AlertCircle className="h-12 w-12 text-rose-500 stroke-[1.5]" />
                  <p className="text-sm font-black text-slate-800">
                    No se pudo iniciar la sesión de Chromium
                  </p>
                  <p className="text-xs text-slate-500 max-w-xs">
                    Tocá &quot;Reintentar Conexión&quot; o &quot;Restablecer Locks / Sesión&quot; para limpiar procesos en segundo plano.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center text-slate-400">
                  <Smartphone className="h-12 w-12 text-slate-300 stroke-[1.5]" />
                  <p className="text-xs font-medium text-slate-500">
                    Hacé clic en &quot;Iniciar y Mostrar Código QR&quot; para conectar tu número.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Sesión Conectada */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Cuenta vinculada</p>
              <p className="text-sm font-black text-slate-900 mt-0.5">
                {clientInfo?.pushname || 'Usuario'}
              </p>
              <p className="text-xs font-mono text-emerald-700 font-bold">
                +{clientInfo?.phone || ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={async () => {
                  setLoadingAction('sync-chats');
                  try {
                    await fetch('/api/whatsapp/sync-chats', { method: 'POST' });
                    await fetchStatus();
                  } finally {
                    setLoadingAction(null);
                  }
                }}
                disabled={loadingAction === 'sync-chats'}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition disabled:opacity-50"
                title="Sincronizar respuestas y envíos recientes de WhatsApp Web con las fichas de candidatos"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingAction === 'sync-chats' ? 'animate-spin' : ''}`} />
                Sincronizar Chats
              </button>
              <button
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                title="Cerrar sesión de WhatsApp Web"
              >
                <LogOut className="h-3.5 w-3.5" />
                Desconectar
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500">Límite Móvil (Últimos 60 min)</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-black text-slate-900">
                {rollingLastHour} <span className="text-xs font-normal text-slate-500">/ 40 máx</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-black ${
                rollingLastHour < 30 ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
              }`}>
                {rollingLastHour < 30 ? '✅ Seguro' : '⚠️ Moderado'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Ventana móvil anti-bloqueo</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500">Tanda Diaria / Total Pendientes</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-black text-slate-900">
                {campaign.items.length} <span className="text-xs font-normal text-slate-500">hoy / {campaign.totalElegiblesEnBase} total</span>
              </span>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-black text-indigo-900">
                Cupo: {config.cupoSorteado}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Etapa: {config.nivelWarmup.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
      )}

      {/* 3. Panel de Control de la Cola de Envío */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Ejecución de la Cola de Envíos
              {queue.isRunning && queue.dayCycleNumber && (
                <span className="rounded-full bg-[#FFF06B] border border-[#323232] px-2 py-0.5 text-[10px] font-black text-[#323232]">
                  Tanda Día #{queue.dayCycleNumber} {queue.autoLoop24h ? '· Bucle 24h Activo' : ''}
                </span>
              )}
            </h4>
            <p className="text-xs text-slate-600">
              {queue.isRunning
                ? `Enviando tanda activa: contacto ${queue.currentIndex} de ${queue.totalItems}`
                : `Tanda de hoy lista con ${campaign.items.length} mensajes (de ${campaign.totalElegiblesEnBase} pendientes totales en la base)`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!queue.isRunning ? (
              <button
                onClick={handleStartQueue}
                disabled={status !== 'READY' || campaign.items.length === 0 || loadingAction === 'start'}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-500 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="h-4 w-4 fill-current" />
                Iniciar Envío Automático Directo ({campaign.items.length} msjs)
              </button>
            ) : (
              <>
                {!queue.isPaused ? (
                  <button
                    onClick={handlePauseQueue}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 hover:bg-amber-100 transition shadow-sm"
                  >
                    <Pause className="h-4 w-4 fill-current" />
                    Pausar
                  </button>
                ) : (
                  <button
                    onClick={handleResumeQueue}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500 transition shadow-sm"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Reanudar
                  </button>
                )}
                <button
                  onClick={handleStopQueue}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-black text-rose-800 hover:bg-rose-100 transition shadow-sm"
                >
                  <Square className="h-4 w-4 fill-current" />
                  Detener
                </button>
              </>
            )}
          </div>
        </div>

        {/* Resumen sincronizado con Pestaña 1 (Ajustes Anti-Bloqueo) y Pestaña 2 (Cola de Contactos) */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black text-emerald-950">
              🔗 Parámetros sincronizados desde Pestaña 1 &amp; 2:
            </span>
            <span className="rounded-lg bg-white border border-emerald-300 px-2 py-0.5 font-bold text-slate-800">
              📍 Barrio: {config.barrioFiltro && config.barrioFiltro !== 'Todos' ? config.barrioFiltro : 'Todos los barrios CABA'}
            </span>
            <span className="rounded-lg bg-white border border-emerald-300 px-2 py-0.5 font-bold text-slate-800">
              ⏰ Inicio programado: {config.horaInicio} hs (Ventana diurna {config.horaVentanaInicio || '09:00'} a {config.horaVentanaFin || '21:00'} hs)
            </span>
            <span className="rounded-lg bg-white border border-emerald-300 px-2 py-0.5 font-bold text-slate-800">
              ⏱️ Intervalo: {config.minIntervaloSeg}s–{config.maxIntervaloSeg}s
            </span>
          </div>
          {campaign.items.length > 0 && (
            <p className="text-[11px] text-emerald-900 font-medium">
              <strong>Primeros en cola a ejecutar ({campaign.items.length} total):</strong>{' '}
              {campaign.items
                .slice(0, 4)
                .map((it) => `#${it.orden} ${it.nombre || it.primerNombre} (${it.barrio})`)
                .join(' · ')}
              {campaign.items.length > 4 ? ` ... (+${campaign.items.length - 4} más)` : ''}
            </p>
          )}
        </div>

        {/* Opción de Bucle Automático Diario cada 24 horas */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoLoop24h}
              onChange={(e) => setAutoLoop24h(e.target.checked)}
              disabled={queue.isRunning}
              className="mt-0.5 h-4 w-4 rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
            />
            <div className="text-xs text-slate-800">
              <span className="font-black block">
                🔁 Bucle Automático Diario cada 24 hs (Programar la totalidad de los {campaign.totalElegiblesEnBase} primeros contactos)
              </span>
              <span className="text-[11px] text-slate-600">
                Envía hoy la tanda segura anti-baneo ({campaign.items.length} msjs, siempre &lt; 45/día) y, cumplidas las 24 horas, inicia automáticamente la siguiente tanda diaria hasta completar todos los pendientes (requiere mantener la PC encendida; podés monitorear o pausar desde tu celular).
              </span>
            </div>
          </label>
        </div>

        {/* Barra de Progreso / Resumen de la Tanda */}
        {(queue.isRunning || queue.totalItems > 0) && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-800">
                {queue.isRunning
                  ? `Progreso: ${queue.currentIndex} de ${queue.totalItems} (${progressPercent}%) · Meta efectiva: ${queue.sentCount}/${queue.targetSentCount || queue.totalItems}`
                  : `Última tanda finalizada: ${queue.sentCount} enviados con éxito`}
              </span>
              <span className="font-mono text-emerald-800 font-bold">
                {queue.currentAction || 'Completado'}
              </span>
            </div>

            <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              <div className="flex flex-wrap items-center gap-4">
                <span>✅ Enviados OK: <strong>{queue.sentCount}</strong></span>
                <span>🚫 Sin WA (Descartados): <strong>{queue.invalidCount}</strong></span>
                <span>⚠️ Fallos (Para reintento): <strong>{queue.failedCount}</strong></span>
                {typeof queue.compensatedCount === 'number' && queue.compensatedCount > 0 && (
                  <span className="text-indigo-700 font-bold">
                    🔄 Cupos compensados: +{queue.compensatedCount}
                  </span>
                )}
              </div>
              {queue.isRunning && queue.countdownSeconds !== undefined && queue.countdownSeconds > 0 && (
                <div className="flex items-center gap-1 font-bold text-slate-800">
                  <Clock className="h-3 w-3 text-slate-500" />
                  Próximo envío en: {queue.countdownSeconds}s
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. Terminal de Logs en Tiempo Real */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-1.5 font-bold">
              <Terminal className="h-3.5 w-3.5 text-slate-700" />
              <span>Consola de Auditoría en Vivo (whatsapp-web.js)</span>
            </div>
            <label className="flex items-center gap-1 cursor-pointer text-[11px]">
              <input
                type="checkbox"
                checked={autoScrollLogs}
                onChange={(e) => setAutoScrollLogs(e.target.checked)}
                className="rounded text-emerald-600"
              />
              Auto-scroll
            </label>
          </div>

          <div
            ref={logContainerRef}
            className="h-44 w-full overflow-y-auto rounded-xl bg-slate-950 p-3 font-mono text-xs text-slate-200 border border-slate-800 space-y-1"
          >
            {logs.length === 0 ? (
              <p className="text-slate-500 italic">No hay registros aún. Conectá el cliente para ver actividad.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                  <span
                    className={
                      log.type === 'success'
                        ? 'text-emerald-400 font-bold'
                        : log.type === 'error'
                        ? 'text-rose-400 font-bold'
                        : log.type === 'warn'
                        ? 'text-amber-400 font-bold'
                        : 'text-slate-300'
                    }
                  >
                    {log.type === 'success' && '✓ '}
                    {log.type === 'error' && '✕ '}
                    {log.type === 'warn' && '⚠ '}
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
