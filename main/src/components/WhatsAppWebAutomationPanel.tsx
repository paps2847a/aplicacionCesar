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
  currentContactName?: string;
  currentContactPhone?: string;
  currentAction?: string;
  countdownSeconds?: number;
  sentCount: number;
  failedCount: number;
  invalidCount: number;
  startedAt?: string;
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

  const handleStartQueue = async () => {
    if (!campaign.items || campaign.items.length === 0) {
      alert('La cola está vacía. Generá o sorteá contactos en la pestaña 1 primero.');
      return;
    }

    if (status !== 'READY') {
      alert('Primero debes conectar tu WhatsApp Web escaneando el código QR.');
      return;
    }

    const confirmMsg = `¿Iniciar el envío automatizado de ${campaign.items.length} mensajes con intervalos humanos de seguridad (${config.minIntervaloSeg}-${config.maxIntervaloSeg}s) y pausas de café?`;
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

              {status === 'DISCONNECTED' && (
                <button
                  onClick={handleConnect}
                  disabled={loadingAction === 'connect'}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-500 transition shadow-md disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingAction === 'connect' ? 'animate-spin' : ''}`} />
                  {loadingAction === 'connect' ? 'Conectando...' : 'Iniciar y Mostrar Código QR'}
                </button>
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
            <button
              onClick={handleDisconnect}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
              title="Cerrar sesión de WhatsApp Web"
            >
              <LogOut className="h-3.5 w-3.5" />
              Desconectar
            </button>
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
            <p className="text-xs font-bold text-slate-500">Cola actual para enviar</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-black text-slate-900">
                {campaign.items.length} <span className="text-xs font-normal text-slate-500">contactos</span>
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
            </h4>
            <p className="text-xs text-slate-600">
              {queue.isRunning
                ? `Enviando tanda activa: contacto ${queue.currentIndex} de ${queue.totalItems}`
                : `Cola lista con ${campaign.items.length} mensajes preparados`}
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

        {/* Barra de Progreso si está en ejecución */}
        {queue.isRunning && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-800">
                Progreso: {queue.currentIndex} de {queue.totalItems} ({progressPercent}%)
              </span>
              <span className="font-mono text-emerald-800 font-bold">
                {queue.currentAction || 'Procesando...'}
              </span>
            </div>

            <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <div className="flex items-center gap-4">
                <span>✅ Enviados: <strong>{queue.sentCount}</strong></span>
                <span>⚠️ Sin WA: <strong>{queue.invalidCount}</strong></span>
                <span>❌ Fallos: <strong>{queue.failedCount}</strong></span>
              </div>
              {queue.countdownSeconds !== undefined && queue.countdownSeconds > 0 && (
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
