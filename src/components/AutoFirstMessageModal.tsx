import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coffee,
  Copy,
  Download,
  FileSpreadsheet,
  Flame,
  HelpCircle,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Upload,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { WhatsAppWebAutomationPanel } from './WhatsAppWebAutomationPanel';
import { PopurriDropdown } from './common/PopurriDropdown';
import {
  AutoFirstMessageCampaign,
  AutoFirstMessageConfig,
  AutoFirstMessageQueueItem,
  Contact,
  EstadoFlujo,
  ModoColaAutomatizacionWA,
  NivelWarmupWA,
  ResultadoEnvioAuto,
  VoiceProfile,
} from '../types';
import {
  TOPE_MAXIMO_ANTI_BLOQUEO_WA,
  exportarReporteAuditoriaAutoWA,
  generarColaEnvioAutomaticoPrimerContacto,
  generarScriptPythonAutomatizador,
  obtenerRangoWarmup,
  sortearCupoSeguroAntiBloqueo,
} from '../utils/logic';

interface AutoFirstMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  voiceProfile: VoiceProfile;
  barriosDisponibles: string[];
  sheetUrlOrId: string;
  appsScriptUrl: string;
  onApplyItemResult: (
    contactId: string,
    telefonoNorm: string,
    resultado: ResultadoEnvioAuto,
    detalle: string,
    fechaHoraISO?: string
  ) => void;
  onApplyBatchResults: (
    items: {
      contactId: string;
      telefonoNorm: string;
      resultado: ResultadoEnvioAuto;
      detalleResultado: string;
      fechaHoraResultadoISO?: string;
    }[]
  ) => void;
  onCleanFalseErrors?: () => void;
  initialModoCola?: ModoColaAutomatizacionWA;
  inlineMode?: boolean;
}

export const AutoFirstMessageModal: React.FC<AutoFirstMessageModalProps> = ({
  isOpen,
  onClose,
  contacts,
  voiceProfile,
  barriosDisponibles,
  sheetUrlOrId,
  appsScriptUrl,
  onApplyItemResult,
  onApplyBatchResults,
  onCleanFalseErrors,
  initialModoCola = 'PRIMER_CONTACTO',
  inlineMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<
    'config_cola' | 'vista_cola' | 'whatsapp_web_directo' | 'monitor_resultados'
  >('config_cola');

  // Calcular nivel de calentamiento sugerido según días previos con envíos automáticos
  const warmupSugeridoAutomatico = useMemo((): {
    nivel: NivelWarmupWA;
    diasPreviosActivos: number;
    reiniciadoPorInactividad: boolean;
  } => {
    const hoyBA = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    const diasConEnvio = new Set<string>();
    let ultimoTimestampMs = 0;

    for (const c of contacts) {
      const mAuto = (c.comentario || '').match(/\[1er msj auto enviado el (\d{2}\/\d{2})/i);
      if (mAuto && mAuto[1]) {
        if (mAuto[1] !== hoyBA) {
          diasConEnvio.add(mAuto[1]);
        }
      }
      if (c.ultimoMensajeCorteEnviadoAt) {
        const ms = Date.parse(c.ultimoMensajeCorteEnviadoAt);
        if (!isNaN(ms)) {
          if (ms > ultimoTimestampMs) ultimoTimestampMs = ms;
          const ddmm = new Date(ms).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            timeZone: 'America/Argentina/Buenos_Aires',
          });
          if (ddmm !== hoyBA) diasConEnvio.add(ddmm);
        }
      }
    }

    const inactivoMasDe72h =
      ultimoTimestampMs > 0 && Date.now() - ultimoTimestampMs > 72 * 3600 * 1000;
    if (inactivoMasDe72h) {
      return { nivel: 'DIA_1_MAX_10', diasPreviosActivos: 0, reiniciadoPorInactividad: true };
    }

    const n = diasConEnvio.size;
    if (n >= 4) return { nivel: 'DIA_5_MADURO_MENOS_45', diasPreviosActivos: n, reiniciadoPorInactividad: false };
    if (n === 3) return { nivel: 'DIA_4_MAX_35', diasPreviosActivos: n, reiniciadoPorInactividad: false };
    if (n === 2) return { nivel: 'DIA_3_MAX_25', diasPreviosActivos: n, reiniciadoPorInactividad: false };
    if (n === 1) return { nivel: 'DIA_2_MAX_15', diasPreviosActivos: n, reiniciadoPorInactividad: false };
    return { nivel: 'DIA_1_MAX_10', diasPreviosActivos: 0, reiniciadoPorInactividad: false };
  }, [contacts]);

  const [config, setConfig] = useState<AutoFirstMessageConfig>(() => {
    const rangoAuto = obtenerRangoWarmup(warmupSugeridoAutomatico.nivel);
    const cupoInicial = sortearCupoSeguroAntiBloqueo(rangoAuto.minCupo, rangoAuto.maxCupo);
    const baseCfg: AutoFirstMessageConfig = {
      horaInicio: '07:00',
      horaVentanaInicio: '07:00',
      horaVentanaFin: '19:00',
      nivelWarmup: warmupSugeridoAutomatico.nivel,
      minCupo: rangoAuto.minCupo,
      maxCupo: rangoAuto.maxCupo,
      cupoSorteado: cupoInicial,
      minIntervaloSeg: 65,
      maxIntervaloSeg: 145,
      lotePausaCafeCada: 8,
      minPausaCafeMinutos: 12,
      maxPausaCafeMinutos: 22,
      pausaExtraCada10Seg: 900,
      incluirOptOutBaja: false,
      modoRompehieloCorto: true,
      soloNumerosArgentina: true,
      usarVariabilidadIAGemini: true,
      barrioFiltro: 'Todos',
      modoCola: initialModoCola,
      estadoFiltro: 'TODOS',
      plantillaPersonalizada:
        '¡Hola {nombre}! Soy {promotor} de *Hacemos Popurrí* en {barrio}. Te escribo cortito para coordinar la firma de la ficha de adhesión en estos días. ¿Por qué calle o esquina de {barrio} te queda cómodo y en qué horario solés estar?',
    };
    try {
      const savedRaw = localStorage.getItem('popurri_auto_wa_config_v2');
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        return {
          ...baseCfg,
          ...parsed,
          horaInicio: parsed.horaInicio || '07:00',
          horaVentanaInicio: parsed.horaVentanaInicio || '07:00',
          horaVentanaFin: parsed.horaVentanaFin || '19:00',
        };
      }
    } catch {
      // ignore
    }
    return baseCfg;
  });

  useEffect(() => {
    try {
      localStorage.setItem('popurri_auto_wa_config_v2', JSON.stringify(config));
    } catch {
      // ignore
    }
  }, [config]);

  const [waServerLock, setWaServerLock] = useState<{
    running: boolean;
    waitingNextDay: boolean;
    autoLoop24h: boolean;
    nextDayRunAt: string | null;
    sentCount: number;
    targetEffectiveCount: number;
  }>({
    running: false,
    waitingNextDay: false,
    autoLoop24h: false,
    nextDayRunAt: null,
    sentCount: 0,
    targetEffectiveCount: 0,
  });

  const [dailyQuotaAudit, setDailyQuotaAudit] = useState<{
    todayDateBA: string;
    sentTodayAutoCount: number;
    sentTodayTotalCount: number;
    sentLastHourCount: number;
    hourlyLimit: number;
    currentWarmupDayNumber: number;
    currentWarmupLevel: NivelWarmupWA;
    dailyQuotaLimit: number;
    remainingDailyQuota: number;
    isDailyQuotaLocked: boolean;
    quotaLockReason: string | null;
    totalCampaignsCount: number;
    campaignsHistory: {
      id: string;
      dayDateBA: string;
      warmupDayNumber: number;
      warmupLevel: string;
      dailyQuotaLimit: number;
      modoCola: string;
      barrioFiltro: string;
      startedAtISO: string;
      finishedAtISO: string | null;
      targetCount: number;
      sentOkCount: number;
      invalidCount: number;
      failedCount: number;
      status: string;
    }[];
    firstContactedTotalCount: number;
    firstContactedRecipients: {
      contactId: string;
      nombre: string;
      barrio: string;
      tel: string;
      fechaHoraISO: string;
      dayDateBA: string;
      estadoActual: string;
      comentario: string;
    }[];
  } | null>(null);
  const [showPersistentCampaignsDetail, setShowPersistentCampaignsDetail] = useState(false);
  const [showPersistentRecipientsDetail, setShowPersistentRecipientsDetail] = useState(false);
  const [recipientFilterQuery, setRecipientFilterQuery] = useState('');
  const syncedWarmupFromServerRef = useRef(false);

  useEffect(() => {
    if (isOpen && initialModoCola && config.modoCola !== initialModoCola) {
      handleRegenerarCola({ modoCola: initialModoCola });
    }
  }, [initialModoCola, isOpen]);

  const [semillaSorteo, setSemillaSorteo] = useState<number>(0);

  const [campaign, setCampaign] = useState<AutoFirstMessageCampaign>(() =>
    generarColaEnvioAutomaticoPrimerContacto(contacts, config, voiceProfile)
  );

  const [filtroResultado, setFiltroResultado] = useState<'TODOS' | ResultadoEnvioAuto>('TODOS');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [rewritingOrder, setRewritingOrder] = useState<number | null>(null);
  const [rewritingAllIA, setRewritingAllIA] = useState(false);
  const [pollingActive, setPollingActive] = useState(true);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [expandedItemOrder, setExpandedItemOrder] = useState<number | null>(1);
  const appliedReportSignaturesRef = useRef<Set<string>>(new Set());

  // Mantener la cola sincronizada cuando se actualiza la lista de contactos o se abre el modal,
  // preservando siempre los ítems ya procesados o compensados para evitar saltos en el contador de tanda.
  useEffect(() => {
    setCampaign((prev) => {
      const recienCalculada = generarColaEnvioAutomaticoPrimerContacto(
        contacts,
        { ...config, semillaSorteo },
        voiceProfile
      );
      if (prev.items.length === 0) return recienCalculada;
      const tieneProgresoOCompensados =
        prev.items.length > recienCalculada.items.length ||
        prev.items.some((it) => it.resultado && it.resultado !== 'PENDIENTE');
      if (tieneProgresoOCompensados) {
        if (prev.totalElegiblesEnBase === recienCalculada.totalElegiblesEnBase) {
          return prev;
        }
        return {
          ...prev,
          totalElegiblesEnBase: recienCalculada.totalElegiblesEnBase,
        };
      }
      return recienCalculada;
    });
  }, [contacts, isOpen]);

  // Recalcular campaña cuando el usuario cambia parámetros clave
  const handleRegenerarCola = (
    overrideConfig?: Partial<AutoFirstMessageConfig>,
    overrideSemilla?: number
  ) => {
    const nextSemilla = overrideSemilla ?? semillaSorteo;
    const nextCfg: AutoFirstMessageConfig = {
      ...config,
      ...overrideConfig,
      maxCupo: Math.min(TOPE_MAXIMO_ANTI_BLOQUEO_WA, overrideConfig?.maxCupo ?? config.maxCupo),
      cupoSorteado: Math.min(
        TOPE_MAXIMO_ANTI_BLOQUEO_WA,
        overrideConfig?.cupoSorteado ?? config.cupoSorteado
      ),
    };
    setConfig(nextCfg);
    const nueva = generarColaEnvioAutomaticoPrimerContacto(
      contacts,
      { ...nextCfg, semillaSorteo: nextSemilla },
      voiceProfile
    );
    setCampaign(nueva);

    // Sincronizar cola con el servidor local para que Python pueda reportar sobre ella
    fetch('/api/auto-wa/campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign: nueva }),
    }).catch(() => {});

    return nueva;
  };

  // Cambiar nivel de calentamiento (Warm-up Día 1 a Día 5+)
  const handleSelectWarmup = (nivel: NivelWarmupWA) => {
    const rango = obtenerRangoWarmup(nivel);
    const nuevoSorteo = sortearCupoSeguroAntiBloqueo(
      rango.minCupo,
      rango.maxCupo,
      Math.random,
      config.cupoSorteado
    );
    const nextSemilla = semillaSorteo + 1;
    setSemillaSorteo(nextSemilla);
    handleRegenerarCola(
      {
        nivelWarmup: nivel,
        minCupo: rango.minCupo,
        maxCupo: rango.maxCupo,
        cupoSorteado: nuevoSorteo,
      },
      nextSemilla
    );
    setStatusNotice(
      `Nivel Warm-up actualizado: ${rango.etiqueta}. Cupo aleatorio sorteado: ${nuevoSorteo} mensajes (< 45).`
    );
  };

  const handleSortearNuevoCupo = () => {
    const nuevoCupo = sortearCupoSeguroAntiBloqueo(
      config.minCupo,
      config.maxCupo,
      Math.random,
      config.cupoSorteado
    );
    const nextSemilla = semillaSorteo + 1;
    setSemillaSorteo(nextSemilla);
    const nuevaCamp = handleRegenerarCola({ cupoSorteado: nuevoCupo }, nextSemilla);
    const primeroTxt = nuevaCamp.items[0]
      ? ` · Inicia con #${nuevaCamp.items[0].contactId} ${nuevaCamp.items[0].nombre}`
      : '';
    setStatusNotice(
      `🎲 Nuevo cupo anti-bloqueo sorteado: ${nuevoCupo} mensajes (de ${nuevaCamp.totalElegiblesEnBase} elegibles en la etapa actual)${primeroTxt}.`
    );
  };

  // Polling unificado contra /api/whatsapp/status (whatsapp-web.js nativo) y /api/auto-wa/status (script Python)
  useEffect(() => {
    if (!isOpen || !pollingActive) return;
    const pollBothStatuses = async () => {
      try {
        const [waRes, pyRes] = await Promise.allSettled([
          fetch('/api/whatsapp/status'),
          fetch('/api/auto-wa/status'),
        ]);

        const combinedReports: {
          contactId?: string;
          telefonoNorm?: string;
          resultado: ResultadoEnvioAuto;
          detalleResultado?: string;
          fechaHoraResultadoISO?: string;
          sincronizadoSheets?: boolean;
        }[] = [];
        let compensatedFromWa: AutoFirstMessageQueueItem[] = [];

        if (waRes.status === 'fulfilled' && waRes.value.ok) {
          const waData = await waRes.value.json();
          if (waData?.dailyQuotaAudit) {
            setDailyQuotaAudit(waData.dailyQuotaAudit);
            if (
              !syncedWarmupFromServerRef.current &&
              waData.dailyQuotaAudit.currentWarmupLevel
            ) {
              syncedWarmupFromServerRef.current = true;
              const srvLevel = waData.dailyQuotaAudit.currentWarmupLevel as NivelWarmupWA;
              const srvLimit = Number(waData.dailyQuotaAudit.dailyQuotaLimit || 24);
              const rangoSrv = obtenerRangoWarmup(srvLevel);
              setConfig((prevCfg) => ({
                ...prevCfg,
                nivelWarmup: srvLevel,
                minCupo: rangoSrv.minCupo,
                maxCupo: rangoSrv.maxCupo,
                cupoSorteado: Math.min(prevCfg.cupoSorteado || srvLimit, srvLimit),
              }));
            }
          }
          if (waData?.queue) {
            setWaServerLock({
              running: Boolean(waData.queue.running),
              waitingNextDay: Boolean(waData.queue.waitingNextDay),
              autoLoop24h: Boolean(waData.queue.autoLoop24h),
              nextDayRunAt: waData.queue.nextDayRunAt || null,
              sentCount: Number(waData.queue.sentCount || 0),
              targetEffectiveCount: Number(waData.queue.targetEffectiveCount || 0),
            });
          }
          if (Array.isArray(waData?.itemResults)) {
            combinedReports.push(...waData.itemResults);
          }
          if (Array.isArray(waData?.compensatedItems)) {
            compensatedFromWa = waData.compensatedItems;
          }
        }

        if (pyRes.status === 'fulfilled' && pyRes.value.ok) {
          const pyData = await pyRes.value.json();
          if (Array.isArray(pyData?.reports)) {
            combinedReports.push(...pyData.reports);
          }
        }

        if (combinedReports.length === 0 && compensatedFromWa.length === 0) return;

        const nuevosImpactos: {
          contactId: string;
          telefonoNorm: string;
          resultado: ResultadoEnvioAuto;
          detalleResultado: string;
          fechaHoraResultadoISO?: string;
        }[] = [];

        setCampaign((prev) => {
          let huboCambio = false;
          const existingIds = new Set(prev.items.map((it) => String(it.contactId)));
          let mergedItems = [...prev.items];

          // Incorporar automáticamente los contactos de compensación de cupo agregados por la cola
          for (const comp of compensatedFromWa) {
            if (comp && comp.contactId && !existingIds.has(String(comp.contactId))) {
              existingIds.add(String(comp.contactId));
              mergedItems.push({
                ...comp,
                orden: mergedItems.length + 1,
              });
              huboCambio = true;
            }
          }

          const nextItems = mergedItems.map((item) => {
            const itemLast8 = String(item.telefonoNorm || item.telRaw || '')
              .replace(/\D/g, '')
              .slice(-8);
            const rep = combinedReports.find((r) => {
              if (r.contactId && String(r.contactId) === String(item.contactId)) return true;
              const repLast8 = String(r.telefonoNorm || '').replace(/\D/g, '').slice(-8);
              return itemLast8.length === 8 && repLast8 === itemLast8;
            });
            if (rep && rep.resultado && rep.resultado !== item.resultado) {
              huboCambio = true;
              const sig = `${item.contactId}:${rep.resultado}:${rep.fechaHoraResultadoISO || ''}`;
              if (!appliedReportSignaturesRef.current.has(sig)) {
                appliedReportSignaturesRef.current.add(sig);
                nuevosImpactos.push({
                  contactId: item.contactId,
                  telefonoNorm: item.telefonoNorm,
                  resultado: rep.resultado,
                  detalleResultado: rep.detalleResultado || '',
                  fechaHoraResultadoISO: rep.fechaHoraResultadoISO,
                });
              }
              return {
                ...item,
                resultado: rep.resultado,
                detalleResultado: rep.detalleResultado || item.detalleResultado,
                fechaHoraResultadoISO: rep.fechaHoraResultadoISO,
                sincronizadoSheets: Boolean(rep.sincronizadoSheets),
              };
            }
            return item;
          });

          return huboCambio ? { ...prev, items: nextItems } : prev;
        });

        if (nuevosImpactos.length > 0) {
          onApplyBatchResults(nuevosImpactos);
        }
      } catch {
        // Silencioso en polling
      }
    };

    void pollBothStatuses();
    const timer = setInterval(pollBothStatuses, 2500);
    return () => clearInterval(timer);
  }, [isOpen, pollingActive, onApplyBatchResults]);

  // Reescribir una fila con Gemini AI (/api/gemini/variante-primer-contacto)
  const handleReescribirConGemini = async (item: AutoFirstMessageQueueItem) => {
    setRewritingOrder(item.orden);
    try {
      const res = await fetch('/api/gemini/variante-primer-contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: item.primerNombre || item.nombre,
          sinNombre: item.sinNombre,
          barrio: item.barrio,
          mensajeBase: item.mensajePrimerContacto,
          iteracion: item.orden + Math.floor(Math.random() * 100),
          incluirOptOutBaja: config.incluirOptOutBaja,
        }),
      });
      const data = await res.json();
      if (data.ok && data.mensaje) {
        setCampaign((prev) => ({
          ...prev,
          items: prev.items.map((it) =>
            it.orden === item.orden
              ? {
                  ...it,
                  mensajePrimerContacto: data.mensaje,
                  segundosEscrituraSimulada: Math.max(5, Math.round(data.mensaje.length / 17)),
                }
              : it
          ),
        }));
        setStatusNotice(`Variante única generada con IA Gemini para #${item.contactId} (${item.nombre}).`);
      }
    } catch {
      setStatusNotice('Se mantuvo la variante polimórfica Spintax local.');
    } finally {
      setRewritingOrder(null);
    }
  };

  // Reescribir las primeras N variantes con IA Gemini
  const handleReescribirLoteIA = async () => {
    setRewritingAllIA(true);
    try {
      const updatedItems = [...campaign.items];
      const toProcess = Math.min(updatedItems.length, 8);
      for (let i = 0; i < toProcess; i++) {
        const it = updatedItems[i];
        try {
          const res = await fetch('/api/gemini/variante-primer-contacto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: it.primerNombre || it.nombre,
              sinNombre: it.sinNombre,
              barrio: it.barrio,
              mensajeBase: it.mensajePrimerContacto,
              iteracion: i + 1 + Math.floor(Math.random() * 50),
              incluirOptOutBaja: config.incluirOptOutBaja,
            }),
          });
          const data = await res.json();
          if (data.ok && data.mensaje) {
            updatedItems[i] = {
              ...it,
              mensajePrimerContacto: data.mensaje,
              segundosEscrituraSimulada: Math.max(5, Math.round(data.mensaje.length / 17)),
            };
          }
        } catch {
          // Seguir con el siguiente
        }
      }
      setCampaign((prev) => ({ ...prev, items: updatedItems }));
      setStatusNotice(
        'Variantes polimórficas enriquecidas con IA Gemini (saludos variados, cero enlaces y cláusula Baja).'
      );
    } finally {
      setRewritingAllIA(false);
    }
  };

  // Marcar resultado manual o desde prueba rápida y actualizar App + Google Sheets
  const handleMarcarResultadoItem = (
    item: AutoFirstMessageQueueItem,
    resultado: ResultadoEnvioAuto,
    detalleCustom?: string
  ) => {
    const ahoraISO = new Date().toISOString();
    const detalle =
      detalleCustom ||
      (resultado === 'ENVIADO_OK'
        ? 'Primer mensaje enviado con éxito (Estado actualizado en App y Sheets)'
        : resultado === 'NUMERO_INEXISTENTE'
        ? 'El número no existe en WhatsApp (Marcado como Descartado / N° inexistente)'
        : resultado === 'ERROR_ENVIO'
        ? 'No se pudo enviar (Queda pendiente para próximo intento)'
        : 'En cola');

    setCampaign((prev) => ({
      ...prev,
      items: prev.items.map((it) =>
        it.orden === item.orden
          ? {
              ...it,
              resultado,
              detalleResultado: detalle,
              fechaHoraResultadoISO: ahoraISO,
              sincronizadoSheets: true,
            }
          : it
      ),
    }));

    onApplyItemResult(item.contactId, item.telefonoNorm, resultado, detalle, ahoraISO);

    // También registrar en el servidor local
    fetch('/api/auto-wa/report-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: campaign.campaignId,
        contactId: item.contactId,
        telefonoNorm: item.telefonoNorm,
        nombre: item.nombre,
        barrio: item.barrio,
        resultado,
        detalleResultado: detalle,
        fechaHoraResultadoISO: ahoraISO,
        appsScriptUrl,
      }),
    }).catch(() => {});

    setStatusNotice(
      `Contacto #${item.contactId} (${item.nombre}) actualizado a ${resultado} en la App y Google Sheets.`
    );
  };

  // Descargar script Python preconfigurado
  const handleDescargarScriptPython = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const codigoPy = generarScriptPythonAutomatizador(
      campaign,
      origin,
      sheetUrlOrId,
      appsScriptUrl
    );
    const blob = new Blob([codigoPy], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'automatizador_wa_popurri.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusNotice(
      'Script "automatizador_wa_popurri.py" descargado con las 7 capas anti-bloqueo y tu cola (< 45 msjs) preconfigurada.'
    );
  };

  // Descargar cola JSON
  const handleDescargarColaJSON = () => {
    const jsonStr = JSON.stringify(campaign, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cola_primer_contacto_popurri.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Descargar auditoría CSV para Excel
  const handleDescargarAuditoriaCSV = () => {
    const csv = exportarReporteAuditoriaAutoWA(campaign);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_auditoria_1er_contacto_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Importar reporte_envios_popurri.json generado por el script de Python
  const handleImportarReportePythonJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const lista = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];
      if (lista.length === 0) {
        setStatusNotice('El archivo JSON no contiene ítems de reporte válidos.');
        return;
      }

      const impactos: {
        contactId: string;
        telefonoNorm: string;
        resultado: ResultadoEnvioAuto;
        detalleResultado: string;
        fechaHoraResultadoISO?: string;
      }[] = [];

      setCampaign((prev) => {
        const nextItems = prev.items.map((it) => {
          const found = lista.find(
            (r: { contactId?: string; telefonoNorm?: string }) =>
              (r.contactId && String(r.contactId) === String(it.contactId)) ||
              (r.telefonoNorm && String(r.telefonoNorm) === String(it.telefonoNorm))
          );
          if (found && found.resultado) {
            impactos.push({
              contactId: it.contactId,
              telefonoNorm: it.telefonoNorm,
              resultado: found.resultado as ResultadoEnvioAuto,
              detalleResultado: found.detalleResultado || '',
              fechaHoraResultadoISO: found.fechaHoraResultadoISO,
            });
            return {
              ...it,
              resultado: found.resultado as ResultadoEnvioAuto,
              detalleResultado: found.detalleResultado || it.detalleResultado,
              fechaHoraResultadoISO: found.fechaHoraResultadoISO,
              sincronizadoSheets: true,
            };
          }
          return it;
        });
        return { ...prev, items: nextItems };
      });

      if (impactos.length > 0) {
        onApplyBatchResults(impactos);
        setStatusNotice(
          `¡Reporte Python importado con éxito! Se actualizaron ${impactos.length} contactos en la App y Google Sheets.`
        );
        setActiveTab('monitor_resultados');
      }
    } catch {
      setStatusNotice('No se pudo leer el archivo JSON de reporte. Verificá que sea reporte_envios_popurri.json.');
    } finally {
      e.target.value = '';
    }
  };

  const copyCommand = (cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const stats = useMemo(() => {
    const total = campaign.items.length;
    const enviadosOk = campaign.items.filter((i) => i.resultado === 'ENVIADO_OK').length;
    const inexistentes = campaign.items.filter((i) => i.resultado === 'NUMERO_INEXISTENTE').length;
    const errores = campaign.items.filter((i) => i.resultado === 'ERROR_ENVIO').length;
    const pendientes = campaign.items.filter((i) => i.resultado === 'PENDIENTE').length;
    const pausasCafe = campaign.items.filter((i) => i.esPausaCafeAntes).length;
    const ultimaHora = campaign.items[campaign.items.length - 1]?.horaProgramada || config.horaInicio;
    return { total, enviadosOk, inexistentes, errores, pendientes, pausasCafe, ultimaHora };
  }, [campaign.items, config.horaInicio]);

  const enviadosHoyCount = useMemo(() => {
    const hoyDDMM = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    const hoyISO = new Date().toLocaleDateString('sv-SE', {
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    const idsHoy = new Set<string>();
    for (const c of contacts) {
      const com = c.comentario || '';
      if (com.includes(`[1er msj auto enviado el ${hoyDDMM}`)) {
        idsHoy.add(String(c.id));
      } else if (c.fechaPrimerContacto === hoyISO) {
        idsHoy.add(String(c.id));
      }
    }
    if (
      (!config.modoCola || config.modoCola === 'PRIMER_CONTACTO') &&
      (!config.estadoFiltro || config.estadoFiltro === 'TODOS' || config.estadoFiltro === 'SIN_CONTACTAR_1ER_MSJ')
    ) {
      for (const it of campaign.items) {
        if (it.resultado === 'ENVIADO_OK') {
          idsHoy.add(String(it.contactId));
        }
      }
    }
    return Math.max(
      idsHoy.size,
      (!config.modoCola || config.modoCola === 'PRIMER_CONTACTO') ? stats.enviadosOk : 0,
      (!config.modoCola || config.modoCola === 'PRIMER_CONTACTO') ? waServerLock.sentCount : 0,
      dailyQuotaAudit?.sentTodayAutoCount || 0
    );
  }, [contacts, campaign.items, config.modoCola, config.estadoFiltro, stats.enviadosOk, waServerLock.sentCount, dailyQuotaAudit]);

  const esColaNuevosContactos =
    (!config.modoCola || config.modoCola === 'PRIMER_CONTACTO') &&
    (!config.estadoFiltro || config.estadoFiltro === 'TODOS' || config.estadoFiltro === 'SIN_CONTACTAR_1ER_MSJ');

  const cupoDiarioEfectivo = dailyQuotaAudit?.dailyQuotaLimit || config.cupoSorteado;
  const cupoNuevosAlcanzadoHoy =
    Boolean(dailyQuotaAudit?.isDailyQuotaLocked) || enviadosHoyCount >= cupoDiarioEfectivo;
  const cupoDiarioAlcanzadoHoy = esColaNuevosContactos && cupoNuevosAlcanzadoHoy;
  const isLoopLocked = Boolean(
    waServerLock.autoLoop24h && (waServerLock.running || waServerLock.waitingNextDay)
  );

  const itemsFiltrados = useMemo(() => {
    if (filtroResultado === 'TODOS') return campaign.items;
    return campaign.items.filter((i) => i.resultado === filtroResultado);
  }, [campaign.items, filtroResultado]);

  if (!isOpen) return null;

  return (
    <div
      className={
        inlineMode
          ? 'mx-auto w-full max-w-6xl min-w-0 overflow-x-clip px-3 sm:px-6 py-4 sm:py-6'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 sm:p-4 backdrop-blur-sm overflow-y-auto'
      }
    >
      <div
        className={
          inlineMode
            ? 'relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-[#323232] bg-white shadow-[4px_4px_0px_#323232]'
            : 'relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl'
        }
      >
        {/* Header Unificado WhatsApp Web & Campañas Anti-Bloqueo */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#323232] bg-white px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#323232] bg-[#FFF06B] text-[#323232] shadow-[2px_2px_0px_#323232] shrink-0">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-[#323232] font-display">
                  WhatsApp Web &amp; Campañas Anti-Bloqueo
                </h2>
                <span className="rounded-lg bg-emerald-100 border border-[#323232] px-2 py-0.5 text-[11px] font-bold text-emerald-950">
                  &lt; 45 msjs/día
                </span>
              </div>
            </div>
          </div>

          {!inlineMode && (
            <button
              onClick={onClose}
              className="rounded-xl border-2 border-[#323232] bg-white p-2 text-[#323232] hover:bg-[#FF2C00] hover:text-white transition"
              title="Cerrar modal"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sub-navegación de Pestañas Compacta (Sin duplicación de botones) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white px-3 sm:px-6 py-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveTab('config_cola')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'config_cola'
                  ? 'bg-[#FFF06B] text-[#323232] border border-[#323232] font-black shadow-[2px_2px_0px_#323232]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>1. Ajustes</span>
            </button>

            <button
              onClick={() => setActiveTab('vista_cola')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'vista_cola'
                  ? 'bg-[#FFF06B] text-[#323232] border border-[#323232] font-black shadow-[2px_2px_0px_#323232]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>2. Cola ({campaign.items.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('monitor_resultados')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'monitor_resultados'
                  ? 'bg-[#FFF06B] text-[#323232] border border-[#323232] font-black shadow-[2px_2px_0px_#323232]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>3. Auditoría ({stats.enviadosOk} OK)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('whatsapp_web_directo')}
              className={`inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                activeTab === 'whatsapp_web_directo'
                  ? 'bg-[#323232] text-[#FFF06B] shadow-[2px_2px_0px_#29B8FF]'
                  : 'bg-emerald-500 text-white shadow-[2px_2px_0px_#323232] hover:bg-emerald-600'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>⚡ Consola QR / Enviar</span>
            </button>
          </div>
        </div>

        {/* Banner de Aviso Dinámico */}
        {statusNotice && (
          <div className="flex items-center justify-between bg-emerald-50 border-b border-emerald-200/80 px-4 sm:px-6 py-2 text-xs font-medium text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 ml-4 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Contenido Principal Desplazable */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-6 bg-[#F5F4F0]/60">
          {/* PANEL PERSISTENTE DE MEMORIA ANTI-BAN (SQLITE): CUOTA HOY, DÍA WARM-UP, CAMPAÑAS Y 1ER CONTACTO */}
          <div className="rounded-2xl border-2 border-[#323232] bg-white p-4 shadow-[3px_3px_0px_#323232] space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                <h3 className="text-xs sm:text-sm font-black text-[#323232] font-display">
                  Memoria Persistente Anti-Bloqueo (SQLite — Se conserva al apagar servidor o reiniciar app)
                </h3>
              </div>
              {cupoDiarioAlcanzadoHoy ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#323232] bg-[#FF2C00] px-2.5 py-1 text-[11px] font-black text-white shadow-[1px_1px_0px_#323232]">
                  🛑 BLOQUEO ANTI-BAN NUEVOS HOY ({enviadosHoyCount}/{cupoDiarioEfectivo} nuevos enviados)
                </span>
              ) : !esColaNuevosContactos && cupoNuevosAlcanzadoHoy ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-700 bg-sky-100 px-2.5 py-1 text-[11px] font-black text-sky-950">
                  ✅ Cola 2 (Seguimientos) Habilitada · Cupo Nuevos ({enviadosHoyCount}/{cupoDiarioEfectivo}) completo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-950">
                  ✅ Cuota Nuevos Disponible Hoy: quedan {Math.max(0, cupoDiarioEfectivo - enviadosHoyCount)} msjs
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Mensajes enviados hoy */}
              <div className="rounded-xl border border-slate-200 bg-[#F5F4F0] p-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  1. Nuevos Contactados Hoy ({dailyQuotaAudit?.todayDateBA?.split('-').reverse().slice(0, 2).join('/') || 'Hoy'})
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-xl font-black text-[#323232]">
                    {enviadosHoyCount} <span className="text-xs font-bold text-slate-500">/ {cupoDiarioEfectivo} máx</span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-600">
                    Últ. hora: {dailyQuotaAudit?.sentLastHourCount ?? 0}/{dailyQuotaAudit?.hourlyLimit ?? 38}
                  </span>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-600">
                  {cupoNuevosAlcanzadoHoy
                    ? 'Cupo diario de nuevos contactos alcanzado (los seguimientos y chats activos siguen libres).'
                    : `Solo aplica a 1er contacto de nuevos · Total hoy (incl. directos): ${dailyQuotaAudit?.sentTodayTotalCount ?? enviadosHoyCount} msjs`}
                </p>
              </div>

              {/* 2. Día de Warm-up y Cuota Vinculada */}
              <div className="rounded-xl border border-slate-200 bg-[#F5F4F0] p-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  2. Día de Warm-up Actual
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-xl font-black text-[#323232]">
                    Día #{dailyQuotaAudit?.currentWarmupDayNumber ?? 1}
                  </span>
                  <span className="rounded-md bg-[#FFF06B] border border-[#323232] px-1.5 py-0.5 text-[10px] font-black text-[#323232]">
                    Cuota: {cupoDiarioEfectivo}/día
                  </span>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-600">
                  Etapa: {obtenerRangoWarmup(dailyQuotaAudit?.currentWarmupLevel || config.nivelWarmup).etiqueta}
                </p>
              </div>

              {/* 3. Campañas emprendidas (inicio y fin) */}
              <div className="rounded-xl border border-slate-200 bg-[#F5F4F0] p-3 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    3. Campañas Emprendidas
                  </span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-xl font-black text-[#323232]">
                      {dailyQuotaAudit?.totalCampaignsCount ?? 0} campañas
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPersistentCampaignsDetail((v) => !v)}
                      className="rounded-lg border border-[#323232] bg-white px-2 py-0.5 text-[10px] font-black text-[#323232] hover:bg-[#FFF06B] transition cursor-pointer"
                    >
                      {showPersistentCampaignsDetail ? 'Ocultar detalle ▲' : 'Ver fechas/horas ▼'}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-600">
                  Registro de inicio, fin, día de warm-up y enviados por tanda.
                </p>
              </div>

              {/* 4. Contactos con 1er mensaje automatizado */}
              <div className="rounded-xl border border-slate-200 bg-[#F5F4F0] p-3 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    4. 1er Mensaje Automatizado
                  </span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-xl font-black text-[#323232]">
                      {dailyQuotaAudit?.firstContactedTotalCount ?? 0} vecinos
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPersistentRecipientsDetail((v) => !v)}
                      className="rounded-lg border border-[#323232] bg-white px-2 py-0.5 text-[10px] font-black text-[#323232] hover:bg-[#FFF06B] transition cursor-pointer"
                    >
                      {showPersistentRecipientsDetail ? 'Ocultar lista ▲' : 'Ver a quiénes ▼'}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-600">
                  Nunca se les vuelve a enviar el 1er mensaje automatizado.
                </p>
              </div>
            </div>

            {/* Desplegable A: Historial de Campañas Emprendidas */}
            {showPersistentCampaignsDetail && dailyQuotaAudit?.campaignsHistory && (
              <div className="rounded-xl border-2 border-[#323232] bg-[#F5F4F0] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-[#323232]">
                    📅 Historial Persistente de Campañas ({dailyQuotaAudit.campaignsHistory.length})
                  </h4>
                  <span className="text-[10px] font-bold text-slate-600">
                    Ordenado de la más reciente a la primera
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-300 text-slate-600 font-black">
                        <th className="py-1.5 px-2">Fecha</th>
                        <th className="py-1.5 px-2">Día Warm-up</th>
                        <th className="py-1.5 px-2">Comenzó</th>
                        <th className="py-1.5 px-2">Terminó</th>
                        <th className="py-1.5 px-2">Enviados OK</th>
                        <th className="py-1.5 px-2">Cuota del Día</th>
                        <th className="py-1.5 px-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {dailyQuotaAudit.campaignsHistory.map((camp) => {
                        const fmtTime = (iso: string | null) => {
                          if (!iso) return 'En curso...';
                          const d = new Date(iso);
                          if (isNaN(d.getTime())) return iso;
                          return d.toLocaleTimeString('es-AR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'America/Argentina/Buenos_Aires',
                          }) + ' hs';
                        };
                        const [yyyy, mm, dd] = (camp.dayDateBA || '').split('-');
                        const fechaFmt = dd && mm ? `${dd}/${mm}/${yyyy}` : camp.dayDateBA;
                        return (
                          <tr key={camp.id} className="hover:bg-slate-50">
                            <td className="py-1.5 px-2 font-black text-[#323232]">{fechaFmt}</td>
                            <td className="py-1.5 px-2 font-bold text-amber-900">
                              Día #{camp.warmupDayNumber} ({camp.warmupLevel})
                            </td>
                            <td className="py-1.5 px-2 font-mono font-bold text-slate-700">
                              {fmtTime(camp.startedAtISO)}
                            </td>
                            <td className="py-1.5 px-2 font-mono font-bold text-slate-700">
                              {fmtTime(camp.finishedAtISO)}
                            </td>
                            <td className="py-1.5 px-2 font-black text-emerald-800">
                              ✅ {camp.sentOkCount} enviados
                            </td>
                            <td className="py-1.5 px-2 font-bold text-slate-600">
                              Máx {camp.dailyQuotaLimit}/día
                            </td>
                            <td className="py-1.5 px-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                                  camp.status === 'RUNNING'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-emerald-100 text-emerald-900'
                                }`}
                              >
                                {camp.status === 'RUNNING' ? 'EN CURSO' : 'FINALIZADA'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Desplegable B: Registro de Contactos que ya recibieron el 1er Mensaje Automatizado */}
            {showPersistentRecipientsDetail && dailyQuotaAudit?.firstContactedRecipients && (
              <div className="rounded-xl border-2 border-[#323232] bg-[#F5F4F0] p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-black text-[#323232]">
                    👥 Contactos con 1er Mensaje Automatizado Enviado ({dailyQuotaAudit.firstContactedRecipients.length} total)
                  </h4>
                  <input
                    type="text"
                    value={recipientFilterQuery}
                    onChange={(e) => setRecipientFilterQuery(e.target.value)}
                    placeholder="Buscar por #ID, nombre, barrio o fecha..."
                    className="rounded-lg border border-[#323232] bg-white px-2.5 py-1 text-xs font-bold text-[#323232] w-64"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                  {dailyQuotaAudit.firstContactedRecipients
                    .filter((r) => {
                      const q = recipientFilterQuery.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        r.contactId.toLowerCase().includes(q) ||
                        r.nombre.toLowerCase().includes(q) ||
                        r.barrio.toLowerCase().includes(q) ||
                        r.tel.toLowerCase().includes(q) ||
                        r.dayDateBA.toLowerCase().includes(q)
                      );
                    })
                    .map((r) => {
                      const d = new Date(r.fechaHoraISO);
                      const fhFmt = !isNaN(d.getTime())
                        ? d.toLocaleString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'America/Argentina/Buenos_Aires',
                          })
                        : r.dayDateBA;
                      return (
                        <div
                          key={`first-rec-${r.contactId}`}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-[11px] hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-[#323232] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#FFF06B]">
                              #{r.contactId}
                            </span>
                            <span className="font-black text-[#323232]">{r.nombre}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                              {r.barrio}
                            </span>
                            <span className="font-mono text-slate-500">{r.tel}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                              1er msj: {fhFmt} hs
                            </span>
                            <span className="text-[10px] font-bold text-slate-600">
                              {r.estadoActual}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* TAB 1: AJUSTES DE CAMPAÑA Y ANTI-BLOQUEO */}
          {activeTab === 'config_cola' && (
            <div className="space-y-5">
              {/* Banner de Bloqueo por Bucle Automático 24h */}
              {isLoopLocked && (
                <div className="rounded-2xl border-2 border-[#323232] bg-[#FFF06B] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[3px_3px_0px_#323232]">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-[#323232]">
                      <span>🔒</span>
                      <span>Bucle Automático 24h Activo — Parámetros Protegidos</span>
                    </div>
                    <p className="text-[11px] font-bold text-[#323232]/85">
                      Para modificar los ajustes, desactivá temporalmente el Bucle 24h.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch('/api/whatsapp/queue/autoloop', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ autoLoop24h: false }),
                      }).catch(() => {});
                      setWaServerLock((prev) => ({ ...prev, autoLoop24h: false, waitingNextDay: false }));
                      setStatusNotice('🔓 Bucle Automático 24h desactivado. Ya podés editar los parámetros.');
                    }}
                    className="rounded-xl border-2 border-[#323232] bg-white px-3 py-1.5 text-xs font-black text-[#323232] hover:bg-[#ECEAE2] shrink-0 shadow-[2px_2px_0px_#323232] cursor-pointer"
                  >
                    🔓 Desactivar Bucle 24h
                  </button>
                </div>
              )}

              <fieldset disabled={isLoopLocked} className={`space-y-5 ${isLoopLocked ? 'opacity-70 pointer-events-none' : ''}`}>
              {/* Resumen de Capas Stealth Anti-Restricción */}
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-2xs shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-slate-900">
                      8 Capas Stealth Anti-Restricción Activas
                    </h3>
                    <p className="text-[11px] text-slate-600 font-medium">
                      Navegación SPA sin recarga · Simulación de tipeo humano · Pausas de café automáticas · Ventana diurna
                    </p>
                  </div>
                </div>
                <div className="text-[11px] font-bold text-emerald-800 shrink-0">
                  Elegibles en base: {campaign.totalElegiblesEnBase} · En tanda hoy: {campaign.items.length} (&lt; 45)
                </div>
              </div>

              {/* Selector Destacado de 2 Colas (Cola 1: Primer Contacto vs Cola 2: Seguimientos) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    handleRegenerarCola({
                      modoCola: 'PRIMER_CONTACTO',
                      estadoFiltro: 'TODOS',
                    })
                  }
                  className={`text-left rounded-2xl border-2 p-4 transition-all ${
                    (config.modoCola || 'PRIMER_CONTACTO') === 'PRIMER_CONTACTO' &&
                    (!config.estadoFiltro || config.estadoFiltro === 'TODOS' || config.estadoFiltro === 'SIN_CONTACTAR_1ER_MSJ')
                      ? 'border-[#323232] bg-[#FFF06B] shadow-[3px_3px_0px_#323232]'
                      : 'border-slate-200 bg-white hover:border-[#323232]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-black text-[#323232]">
                      🌱 Cola 1: Primer Contacto (Nuevos)
                    </span>
                    <span className="rounded-lg border border-[#323232] bg-white px-2 py-0.5 text-[10px] font-black text-[#323232]">
                      Etapa 1 · Nuevos
                    </span>
                  </div>
                  <p className="text-[11px] font-semibold text-[#323232]/80 mt-1">
                    Envía el 1er mensaje rompehielo únicamente a vecinos en &ldquo;1. Nuevo · Sin 1er mensaje&rdquo; (con compensación automática si un número no tiene WhatsApp).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleRegenerarCola({
                      modoCola:
                        config.modoCola && config.modoCola !== 'PRIMER_CONTACTO'
                          ? config.modoCola
                          : 'SEGUIMIENTO_24H_48H_BAJA',
                      estadoFiltro: 'TODOS',
                    })
                  }
                  className={`text-left rounded-2xl border-2 p-4 transition-all ${
                    (config.modoCola && config.modoCola !== 'PRIMER_CONTACTO') ||
                    (config.estadoFiltro &&
                      config.estadoFiltro !== 'TODOS' &&
                      config.estadoFiltro !== 'SIN_CONTACTAR_1ER_MSJ')
                      ? 'border-[#323232] bg-[#DFF4FF] shadow-[3px_3px_0px_#323232]'
                      : 'border-slate-200 bg-white hover:border-[#323232]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-black text-[#323232]">
                      🔄 Cola 2: Seguimientos (Sin respuesta / Citas / Retiros)
                    </span>
                    <span className="rounded-lg border border-[#323232] bg-white px-2 py-0.5 text-[10px] font-black text-[#323232]">
                      Etapas 2 a 5
                    </span>
                  </div>
                  <p className="text-[11px] font-semibold text-[#323232]/80 mt-1">
                    Seguimientos 24h/48h a quienes no respondieron el 1er mensaje, recordatorios de encuentro o campañas filtradas por estado.
                  </p>
                </button>
              </div>

              {/* Diseñador de Campaña Libre & Filtro por Estado */}
              <div className="rounded-2xl border-2 border-[#323232] bg-[#FFF06B]/25 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-[#323232]">
                      🎯 Filtro por Estado Específico &amp; Diseñador de Campaña
                    </h4>
                    <p className="text-[11px] text-[#323232]/75">
                      Podés filtrar la cola automática para un estado puntual o redactar tu propia plantilla con variables dinámicas.
                    </p>
                  </div>
                  <div className="min-w-[250px]">
                    <PopurriDropdown
                      value={config.estadoFiltro || 'TODOS'}
                      onChange={(val) =>
                        handleRegenerarCola({
                          estadoFiltro: val as EstadoFlujo | 'TODOS',
                        })
                      }
                      headerLabel="Filtrar cola por estado operativo:"
                      align="right"
                      menuWidth={320}
                      options={[
                        { value: 'TODOS', label: 'Según Etapa seleccionada arriba (Automático)' },
                        { value: 'SIN_CONTACTAR_1ER_MSJ', label: '1. Nuevo · Sin contactar' },
                        { value: 'FALTA_NOMBRE_Y_APELLIDO', label: '1b. Nuevo · Falta nombre' },
                        {
                          value: '1ER_MSJ_ENVIADO_SIN_RSP',
                          label: '2. Contactado · Sin respuesta',
                        },
                        {
                          value: 'RESPONDIO_FALTA_DNI_O_ZONA',
                          label: '3. Respondió · Faltan datos',
                        },
                        {
                          value: 'PIDIO_MAS_INFO_ENVIADA',
                          label: '3b. Pidió más info',
                        },
                        {
                          value: 'PREFIERE_CAFE_HUB_O_SEDE',
                          label: '3c. Prefiere Punto / Sede',
                        },
                        {
                          value: 'PASO_DATOS_FALTA_CONFIRMAR',
                          label: '4. Pasó datos · Por confirmar',
                        },
                        {
                          value: 'ENCUENTRO_CONFIRMADO',
                          label: '5. Confirmado · En ruta',
                        },
                        {
                          value: 'RECORDATORIO_DIA_ENVIADO',
                          label: '6. En camino / Recordatorio',
                        },
                        {
                          value: 'PENDIENTE_RETIRO_FICHAS',
                          label: '7. Fichas extra · Por retirar',
                        },
                        {
                          value: 'POSTERGO_SALUD_O_VIAJE',
                          label: '8. En pausa · Viaje o salud',
                        },
                        {
                          value: 'YA_ADHIRIO_FIRMA_OK',
                          label: '9. ✅ Ya firmó',
                        },
                        {
                          value: 'SIN_DNI_CABA_PEDIR_REFERIDOS',
                          label: '10. Sin DNI CABA · Referidos',
                        },
                        {
                          value: 'DESCARTADO_O_BAJA',
                          label: '11. Baja / Descartado',
                        },
                        {
                          value: 'CITA_VENCIDA_REPROGRAMAR',
                          label: '⚠️ Cita vencida · Reprogramar',
                        },
                      ]}
                      triggerClassName="w-full flex items-center justify-between gap-2 rounded-xl border-2 border-[#323232] bg-white px-3 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]/40 transition cursor-pointer"
                    />
                  </div>
                </div>

                {(config.modoCola === 'DISENADOR_PERSONALIZADO' ||
                  (config.estadoFiltro && config.estadoFiltro !== 'TODOS')) && (
                  <div className="space-y-2 pt-2 border-t border-[#323232]/15">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-[11px] font-black text-[#323232]">
                        Plantilla personalizada de campaña (usá variables para personalizar 1 a 1):
                      </label>
                      <div className="flex flex-wrap items-center gap-1">
                        {['{nombre}', '{barrio}', '{direccion}', '{promotor}'].map((token) => (
                          <button
                            key={token}
                            type="button"
                            onClick={() =>
                              handleRegenerarCola({
                                modoCola: 'DISENADOR_PERSONALIZADO',
                                plantillaPersonalizada: `${config.plantillaPersonalizada || ''} ${token}`.trim(),
                              })
                            }
                            className="px-2 py-0.5 rounded bg-white border border-[#323232] text-[10px] font-mono font-bold text-[#323232] hover:bg-[#FFF06B]"
                          >
                            + {token}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={config.plantillaPersonalizada || ''}
                      onChange={(e) =>
                        handleRegenerarCola({
                          modoCola: 'DISENADOR_PERSONALIZADO',
                          plantillaPersonalizada: e.target.value,
                        })
                      }
                      placeholder="Escribí tu plantilla usando {nombre}, {barrio}, {direccion}, {promotor}..."
                      className="w-full rounded-xl border-2 border-[#323232] bg-white p-2.5 text-xs text-[#323232] font-medium"
                    />
                  </div>
                )}
              </div>

              {/* Controles de Configuración en 3 Tarjetas Blancas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Bloque A: Horario & Ventana Diurna */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-3.5 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-700" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      A. Horario & Ventana Diurna
                    </h4>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Hora de inicio del primer envío:
                    </label>
                    <input
                      type="time"
                      value={config.horaInicio}
                      onChange={(e) => handleRegenerarCola({ horaInicio: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Apertura diurna:
                      </label>
                      <input
                        type="time"
                        value={config.horaVentanaInicio}
                        onChange={(e) => handleRegenerarCola({ horaVentanaInicio: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Corte nocturno:
                      </label>
                      <input
                        type="time"
                        value={config.horaVentanaFin}
                        onChange={(e) => handleRegenerarCola({ horaVentanaFin: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    🛡️ <strong>Protección anti-madrugada:</strong> Cero envíos fuera de hora. Fin estimado: <strong className="text-slate-800">{stats.ultimaHora} hs</strong>.
                  </p>
                </div>

                {/* Bloque B: Calentamiento & Cupo */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-3.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4 text-amber-600" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        B. Calentamiento & Cupo
                      </h4>
                    </div>
                    <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-900">
                      Cupo: {config.cupoSorteado} msjs
                    </span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Nivel de calentamiento (Warm-up):
                    </label>
                    <PopurriDropdown
                      value={config.nivelWarmup}
                      onChange={(val) => handleSelectWarmup(val as NivelWarmupWA)}
                      headerLabel="Nivel de calentamiento (Warm-up):"
                      menuWidth={300}
                      options={[
                        { value: 'DIA_1_MAX_10', label: 'Día 1 (Inicial) — 7 a 10 msjs' },
                        { value: 'DIA_2_MAX_15', label: 'Día 2 — Máx 15 msjs (11 a 15)' },
                        { value: 'DIA_3_MAX_25', label: 'Día 3 — Máx 25 msjs (18 a 25)' },
                        { value: 'DIA_4_MAX_35', label: 'Día 4 — Máx 35 msjs (26 a 35)' },
                        {
                          value: 'DIA_5_MADURO_MENOS_45',
                          label: 'Día 5+ (Maduro) — Aleatorio < 45 (28 a 44)',
                        },
                      ]}
                      triggerClassName="w-full flex items-center justify-between gap-2 rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]/40 transition cursor-pointer"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={handleSortearNuevoCupo}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                      Sortear Nuevo Cupo (&lt; 45)
                    </button>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Filtrar tanda por barrio:
                    </label>
                    <PopurriDropdown
                      value={config.barrioFiltro}
                      onChange={(val) => handleRegenerarCola({ barrioFiltro: val })}
                      headerLabel="Filtrar tanda por barrio:"
                      searchable={true}
                      searchPlaceholder="Buscar barrio..."
                      menuWidth={260}
                      options={[
                        { value: 'Todos', label: 'Todos los barrios CABA' },
                        ...barriosDisponibles.map((b) => ({ value: b, label: b })),
                      ]}
                      triggerClassName="w-full flex items-center justify-between gap-2 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]/40 transition cursor-pointer"
                    />
                  </div>
                </div>

                {/* Bloque C: Pausas & Variabilidad */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-3.5 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-amber-700" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      C. Pausas & Variabilidad
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Pausa mín (seg):
                      </label>
                      <input
                        type="number"
                        min={45}
                        max={180}
                        value={config.minIntervaloSeg}
                        onChange={(e) => handleRegenerarCola({ minIntervaloSeg: Number(e.target.value) || 65 })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Pausa máx (seg):
                      </label>
                      <input
                        type="number"
                        min={60}
                        max={300}
                        value={config.maxIntervaloSeg}
                        onChange={(e) => handleRegenerarCola({ maxIntervaloSeg: Number(e.target.value) || 145 })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.modoRompehieloCorto !== false}
                        onChange={(e) => handleRegenerarCola({ modoRompehieloCorto: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>🛡️ Modo Rompehielo Corto (&lt; 210 car.)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.soloNumerosArgentina !== false}
                        onChange={(e) => handleRegenerarCola({ soloNumerosArgentina: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>🇦🇷 Priorizar números locales (+54)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.usarVariabilidadIAGemini}
                        onChange={(e) => handleRegenerarCola({ usarVariabilidadIAGemini: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Variabilidad con IA Gemini</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Botón para pasar a revisar la cola */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-800">
                    Cola calculada: {campaign.items.length} contactos
                  </span>
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                    ☕ {stats.pausasCafe} Pausas de café
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('vista_cola')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 transition pointer-events-auto"
                >
                  <span>Revisar Cola ({campaign.items.length})</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              </fieldset>
            </div>
          )}

          {/* TAB 2: PREVISUALIZACIÓN DE COLA DE CONTACTOS */}
          {activeTab === 'vista_cola' && (
            <div className="space-y-4">
              {/* Barra de Acciones de la Cola */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-slate-900">
                    Cola programada: {campaign.items.length} contactos
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                    🕒 {config.horaInicio} hs → {stats.ultimaHora} hs
                  </span>
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                    ☕ {stats.pausasCafe} Pausas de café
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReescribirLoteIA}
                    disabled={rewritingAllIA}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50 transition"
                  >
                    {rewritingAllIA ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                    )}
                    <span>Variantes IA</span>
                  </button>

                  <button
                    onClick={handleDescargarColaJSON}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>

              {/* Lista de Tarjetas de Candidatos en Cola */}
              <div className="space-y-3">
                {campaign.items.map((item) => {
                  const isExpanded = expandedItemOrder === item.orden;
                  return (
                    <React.Fragment key={`${item.contactId}-${item.orden}`}>
                      {item.esPausaCafeAntes && (
                        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-xs font-bold text-amber-900">
                          <Coffee className="h-4 w-4 text-amber-700 shrink-0" />
                          <span>
                            ☕ Pausa de café humana antes de #{item.orden}: descanso orgánico de {Math.round(item.intervaloSegundos / 60)} min.
                          </span>
                        </div>
                      )}

                      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3 transition hover:shadow-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-700">
                              #{item.orden}
                            </span>
                            <span className="text-xs font-mono font-bold text-slate-500">
                              🕒 {item.horaProgramada}
                            </span>
                            <span className="text-xs font-black text-slate-900">
                              #{item.contactId} · {item.nombre}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              {item.barrio}
                            </span>
                            <span className="text-[11px] font-mono text-slate-600">
                              {item.telRaw}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                            <span>⌨️ {item.segundosEscrituraSimulada}s tipeo</span>
                            <span>·</span>
                            <span>⏱️ +{item.intervaloSegundos}s espera</span>
                          </div>
                        </div>

                        {/* Previsualización del Mensaje */}
                        <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 p-3 text-xs text-slate-800 leading-relaxed font-normal">
                          {isExpanded ? (
                            <textarea
                              rows={4}
                              value={item.mensajePrimerContacto}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCampaign((prev) => ({
                                  ...prev,
                                  items: prev.items.map((it) =>
                                    it.orden === item.orden
                                      ? { ...it, mensajePrimerContacto: val }
                                      : it
                                  ),
                                }));
                              }}
                              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:outline-hidden"
                            />
                          ) : (
                            <p className="line-clamp-2">{item.mensajePrimerContacto}</p>
                          )}
                        </div>

                        {/* Botones de Acción */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedItemOrder(isExpanded ? null : item.orden)}
                              className="text-[11px] font-bold text-slate-600 hover:text-slate-900"
                            >
                              {isExpanded ? 'Ocultar edición' : 'Editar texto'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(item.mensajePrimerContacto);
                                setStatusNotice(`Texto copiado al portapapeles.`);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900"
                            >
                              <Copy className="h-3 w-3" />
                              Copiar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReescribirConGemini(item)}
                              disabled={rewritingOrder === item.orden}
                              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                            >
                              {rewritingOrder === item.orden ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="h-3 w-3 text-indigo-600" />
                              )}
                              Variante IA
                            </button>
                          </div>

                          {/* Marcado de Resultado */}
                          <div className="flex items-center gap-1.5">
                            {item.resultado === 'ENVIADO_OK' ? (
                              <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                                ✅ Enviado OK
                              </span>
                            ) : item.resultado === 'NUMERO_INEXISTENTE' ? (
                              <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-black text-rose-800">
                                🚫 Inexistente
                              </span>
                            ) : item.resultado === 'ERROR_ENVIO' ? (
                              <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-800">
                                ⚠️ Falló
                              </span>
                            ) : (
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                ⏳ En cola
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleMarcarResultadoItem(item, 'ENVIADO_OK')}
                              className="rounded-lg border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 px-2 py-1 text-[10px] font-bold text-slate-700 hover:text-emerald-800 transition"
                            >
                              ✅ OK
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarcarResultadoItem(item, 'NUMERO_INEXISTENTE')}
                              className="rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 px-2 py-1 text-[10px] font-bold text-slate-700 hover:text-rose-800 transition"
                            >
                              🚫 No existe
                            </button>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: WHATSAPP WEB DIRECTO */}
          {activeTab === 'whatsapp_web_directo' && (
            <div className="space-y-4">
              <WhatsAppWebAutomationPanel
                campaign={campaign}
                config={config}
                appsScriptUrl={appsScriptUrl}
                onApplyItemResult={onApplyItemResult}
                enviadosHoyCount={enviadosHoyCount}
                cupoDiarioAlcanzadoHoy={cupoDiarioAlcanzadoHoy}
              />
            </div>
          )}

          {/* TAB 4: AUDITORÍA Y RESULTADOS */}
          {activeTab === 'monitor_resultados' && (
            <div className="space-y-5">
              {/* Tarjetas de Métricas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                  <span className="text-[10px] font-black uppercase text-slate-400">En Cola</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">{stats.pendientes}</div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Tope seguro &lt; 45</p>
                </div>
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-2xs">
                  <span className="text-[10px] font-black uppercase text-emerald-700">Enviados OK</span>
                  <div className="text-2xl font-black text-emerald-900 mt-1">{stats.enviadosOk}</div>
                  <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">Sheets: 1er contacto enviado</p>
                </div>
                <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-4 shadow-2xs">
                  <span className="text-[10px] font-black uppercase text-rose-700">N° Inexistente</span>
                  <div className="text-2xl font-black text-rose-900 mt-1">{stats.inexistentes}</div>
                  <p className="text-[11px] text-rose-700 mt-0.5 font-medium">Sheets: Descartado / N° inex.</p>
                </div>
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-2xs">
                  <span className="text-[10px] font-black uppercase text-amber-700">Fallos / Error</span>
                  <div className="text-2xl font-black text-amber-900 mt-1">{stats.errores}</div>
                  <p className="text-[11px] text-amber-700 mt-0.5 font-medium">Pendientes de reintento</p>
                </div>
              </div>

              {/* Barra de Filtros y CSV */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['TODOS', 'ENVIADO_OK', 'NUMERO_INEXISTENTE', 'ERROR_ENVIO', 'PENDIENTE'] as const).map(
                    (f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFiltroResultado(f)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                          filtroResultado === f
                            ? 'bg-slate-900 text-white font-black'
                            : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f === 'TODOS'
                          ? `Todos (${campaign.items.length})`
                          : f === 'ENVIADO_OK'
                          ? `OK (${stats.enviadosOk})`
                          : f === 'NUMERO_INEXISTENTE'
                          ? `Inexistentes (${stats.inexistentes})`
                          : f === 'ERROR_ENVIO'
                          ? `Errores (${stats.errores})`
                          : `Pendientes (${stats.pendientes})`}
                      </button>
                    )
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {stats.errores > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        const fallidos = campaign.items.filter((it) => it.resultado === 'ERROR_ENVIO');
                        if (fallidos.length === 0) return;
                        setCampaign((prev) => ({
                          ...prev,
                          items: prev.items.map((it) =>
                            it.resultado === 'ERROR_ENVIO'
                              ? { ...it, resultado: 'PENDIENTE', detalleResultado: 'Reintentando envío...' }
                              : it
                          ),
                        }));
                        try {
                          await fetch('/api/whatsapp/queue/start', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              items: fallidos,
                              config,
                              appsScriptUrl,
                              autoLoop24h: false,
                            }),
                          });
                          setStatusNotice(
                            `🔄 Reintentando envío de ${fallidos.length} mensaje(s) fallido(s) en WhatsApp Web Directo...`
                          );
                          setActiveTab('whatsapp_web_directo');
                        } catch {
                          setStatusNotice('⚠️ No se pudo iniciar el reintento. Verificá que WhatsApp Web esté conectado.');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-black text-white hover:bg-amber-500 transition shadow-2xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reintentar Fallidos ({stats.errores})
                    </button>
                  )}

                  {(stats.inexistentes > 0 || stats.errores > 0) && onCleanFalseErrors && (
                    <button
                      type="button"
                      onClick={() => {
                        onCleanFalseErrors();
                        setCampaign((prev) => ({
                          ...prev,
                          items: prev.items.map((it) =>
                            it.resultado === 'NUMERO_INEXISTENTE' || it.resultado === 'ERROR_ENVIO'
                              ? {
                                  ...it,
                                  resultado: 'PENDIENTE',
                                  detalleResultado: 'Restaurado a Pendiente para nueva verificación',
                                }
                              : it
                          ),
                        }));
                        setStatusNotice(
                          '🧹 Contactos restaurados a "1. Nuevo · Sin 1er mensaje" y listos en cola para verificar.'
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-slate-600" />
                      Revertir Inexistentes / Fallos a Pendiente
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleDescargarAuditoriaCSV}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-black text-white hover:bg-emerald-500 transition shadow-2xs"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Descargar CSV Auditoría
                  </button>
                </div>
              </div>

              {/* Lista de Registros Auditados */}
              <div className="space-y-2">
                {itemsFiltrados.map((item) => (
                  <div
                    key={`audit-${item.contactId}-${item.orden}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-xs shadow-2xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono font-bold text-slate-400">#{item.orden}</span>
                        <span className="font-black text-slate-900">#{item.contactId} · {item.nombre}</span>
                        <span className="text-slate-400">({item.barrio})</span>
                        <span className="font-mono text-slate-600">{item.telRaw}</span>
                      </div>
                      {item.detalleResultado && (
                        <p className="text-[11px] text-slate-500 pl-6">
                          {item.detalleResultado}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {item.resultado === 'ENVIADO_OK' ? (
                        <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                          ✅ ENVIADO OK
                        </span>
                      ) : item.resultado === 'NUMERO_INEXISTENTE' ? (
                        <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-black text-rose-800">
                          🚫 NO EXISTE
                        </span>
                      ) : item.resultado === 'ERROR_ENVIO' ? (
                        <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-800">
                          ⚠️ FALLÓ
                        </span>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          ⏳ En cola
                        </span>
                      )}

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMarcarResultadoItem(item, 'ENVIADO_OK')}
                          className="rounded-lg border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMarcarResultadoItem(item, 'NUMERO_INEXISTENTE')}
                          className="rounded-lg border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-800"
                        >
                          No existe
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[#323232] bg-white px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Protección anti-bloqueo activa (&lt; 45 msjs/día) · {stats.enviadosOk} enviados con éxito
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {!inlineMode && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Cerrar
              </button>
            )}
            {activeTab !== 'whatsapp_web_directo' && (
              <button
                type="button"
                onClick={() => setActiveTab('whatsapp_web_directo')}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-[#323232] bg-emerald-500 px-4 py-2 text-xs font-black text-white hover:bg-emerald-600 transition shadow-[2px_2px_0px_#323232]"
              >
                <Smartphone className="h-4 w-4" />
                <span>Ejecutar en WhatsApp Web Directo</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
