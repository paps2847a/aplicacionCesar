import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Send,
  MapPin,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  UserPlus,
  RefreshCw,
  FileSpreadsheet,
  Calendar,
  CheckSquare,
  Sliders,
  ShieldAlert,
  Copy,
  Check,
  Search,
  MessageSquare,
  Navigation,
  ExternalLink,
  Download,
  Upload,
  Zap,
  Smartphone,
  Monitor,
  Coffee,
  Footprints,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  X,
  Bot,
} from 'lucide-react';
import {
  AutoFirstMessageConfig,
  BloqueAgendaRecomendado,
  CalendarEventItem,
  Contact,
  ControlEnvioRegistro,
  EstadoFlujo,
  FranjaHoraria,
  ModalidadEncuentroAgenda,
  ModoColaAutomatizacionWA,
  RawContactRow,
  ResultadoEnvioAuto,
  SharedAppStateSnapshot,
  TipoPlantillaWA,
  TipoRespuestaPropuestaAgenda,
  VoiceProfile,
} from './types';
import {
  COORDENADAS_BARRIOS_CABA,
  DEFAULT_VOICE_PROFILE,
  INITIAL_CALENDAR_EVENTS,
  INITIAL_RAW_CONTACTS,
} from './data/estatusPopurriData';
import {
  CATALOGO_CAFES_ESPECIALIDAD_HUB,
  CATALOGO_CAFES_HUB_CABA,
  CafeHubCurado,
} from './data/cafesHubCatalog';
import {
  procesarContacto,
  calcularResumenKPIsPadron,
  analizarYCorregirNombreCompleto,
  esCeldaSinNombre,
  ESTADOS_FLUJO_CATALOGO,
  obtenerEtiquetaEstadoFlujo,
  construirMicroClusters,
  generarCorteEstrategicoLocal,
  generarMensajeContextual,
  generarMensajePropuestaBloqueAgenda,
  aplicarRespuestaPropuestaAgenda,
  obtenerPartesFechaHoraBA,
  parsearICalEventosCalendar,
  parsearTextoAgendaCalendar,
  crearEnlaceWhatsApp,
  parsearTSVoCSVContactos,
  exportarContactosACSV,
  exportarContactosATSVParaExcel,
  migrarContactosDesde167SinPrimerContacto,
  fusionarContactosDesdeSheetsConControl,
  fusionarContactosMultiDispositivo,
  registrarEnvioMensajeContacto,
  actualizarDatosContactoEnApp,
  normalizarTelefonoWA,
  UMBRAL_ID_SIN_PRIMER_CONTACTO,
  aplicarResultadoEnvioAutoAContacto,
  deduplicarEventosCalendar,
  filtrarEventosCalendarVigentes,
  limpiarErroresFalsosRestriccionWA,
  asegurarIdsUnicosContactos,
  adaptarMensajeConRespuestaVecinoLocal,
  obtenerFechaSugeridaReprogramacionContacto,
  sumarDiasAFechaBA,
  resolverCoordenadasPartidaPerfil,
} from './utils/logic';
import { CODIGO_APPS_SCRIPT_PUENTE } from './data/appsScriptBridge';
import { ModernNavbar } from './components/layout/ModernNavbar';
import { CandidatePipelineView } from './components/pipeline/CandidatePipelineView';
import { PlanHoyModernView } from './components/corte/PlanHoyModernView';
import { WhatsAppWebAutomationPanel } from './components/WhatsAppWebAutomationPanel';
import { ModernSettingsView } from './components/config/ModernSettingsView';
import { generarColaEnvioAutomaticoPrimerContacto } from './utils/logic';
import { InteractiveMapPanel } from './components/InteractiveMapPanel';
import { AutoFirstMessageModal } from './components/AutoFirstMessageModal';
import { DailyTasksAndFormsPanel } from './components/DailyTasksAndFormsPanel';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  buscarPlanillasEnDrive,
  leerContactosDesdeGoogleSheet,
  agregarFilaEnGoogleSheet,
  sincronizarPadronEnGoogleSheet,
  listarEventosGoogleCalendar,
  crearEventoGoogleCalendar,
  crearTareaSeguimientoGoogleTasks,
  DriveSpreadsheetFile,
} from './services/workspace';

type ActiveTab = 'bandeja' | 'corte' | 'mapa' | 'acceso_y_config' | 'pipeline' | 'plan_hoy' | 'whatsapp' | 'configuracion';

type FiltroSituacion =
  | 'TODOS'
  | 'PENDIENTES_ADHESION'
  | 'CON_PUNTO_O_DIRECCION'
  | 'ALERTAS_VENCIDOS'
  | 'SIN_NOMBRE_SHEETS'
  | 'NUEVOS_1ER_MENSAJE'
  | 'CAMBIO_CHIP'
  | 'SIN_RESPUESTA_48H'
  | 'VISITAS_Y_RETIROS'
  | 'YA_ADHIRIERON'
  | 'ARCHIVADOS_SIN_DNI_CABA';

const PLANTILLAS_OPCIONES: { value: TipoPlantillaWA; label: string }[] = [
  { value: 'auto', label: 'Automático según situación del contacto' },
  {
    value: 'disculpas_y_reprogramacion',
    label: '⚠️ Disculpas / Seguimiento de Pendiente + Propuesta para Reprogramar',
  },
  {
    value: 'propuesta_bloque_agenda',
    label: '📅 Propuesta de Encuentro de Agenda + Pedido de Confirmación 1-a-1',
  },
  { value: 'primer_contacto', label: '1er Mensaje (Presentación cálida — Nuevo)' },
  { value: 'seguimiento_cambio_chip', label: 'Seguimiento: Cambió el chip (Respondió Sí, falta concretar)' },
  { value: 'seguimiento_24h_falta_dato', label: '⏱️ Seguimiento 24h: Falta compartir esquina/dirección o franja' },
  { value: 'seguimiento_24h_falta_confirmar', label: '⏱️ Seguimiento 24h: Falta confirmar propuesta de encuentro' },
  { value: 'seguimiento_sin_respuesta', label: 'Seguimiento: Sin respuesta (+48h -> Reactivar / Café Hub)' },
  { value: 'baja_amable_sin_respuesta', label: '🕊️ Último mensaje: Baja amable para no molestar' },
  { value: 'confirmacion_visita', label: 'Confirmar Visita Puerta a Puerta / Café agendado' },
  { value: 'recordatorio_maniana_encuentro', label: '🌅 Recordatorio de la mañana antes de salir al encuentro' },
  { value: 'convocatoria_cafe_hub', label: 'Convocar a Café Hub Barrial (Punto de encuentro)' },
  { value: 'mas_info', label: 'Pidió más info (Resumen 5 ejes + proponer firma 2 min)' },
  { value: 'retiro_fichas', label: 'Retiro de Fichas Extra (X1 / X2 / X3 firmadas)' },
  { value: 'en_camino', label: 'Aviso: Estoy en camino (con hora calculada)' },
  { value: 'llegando', label: 'Aviso: Estoy abajo / en la puerta (2 min)' },
  { value: 'demorado', label: 'Aviso: Demorado (+15/20 min)' },
  { value: 'esperado_no_estaba_reprogramar', label: '🚪 Esperé un rato y no estaba (Reprogramar)' },
  { value: 'agradecimiento_post_firma', label: 'Agradecimiento Post-Firma + Referidos CABA' },
  { value: 'no_caba_referidos', label: 'Sin DNI en CABA (Pedir referidos en CABA)' },
  { value: 'baja_respetuosa', label: 'Baja respetuosa inmediata' },
];

function obtenerKeysControlEnviados(registros: ControlEnvioRegistro[]): Set<string> {
  const keys = new Set<string>();
  for (const r of registros) {
    if (r.contactId) keys.add(`id:${String(r.contactId).trim()}`);
    const t = normalizarTelefonoWA(r.telRaw);
    if (t) keys.add(`tel:${t}`);
  }
  return keys;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('bandeja');
  const [controlEnvios, setControlEnvios] = useState<ControlEnvioRegistro[]>(() => {
    try {
      const saved = localStorage.getItem('popurri_control_envios_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  const [rawContacts, setRawContacts] = useState<RawContactRow[]>(() => {
    const keys = obtenerKeysControlEnviados(
      (() => {
        try {
          const s = localStorage.getItem('popurri_control_envios_v1');
          return s ? JSON.parse(s) : [];
        } catch {
          return [];
        }
      })()
    );
    try {
      let acumulado: RawContactRow[] = migrarContactosDesde167SinPrimerContacto(
        INITIAL_RAW_CONTACTS,
        keys
      );
      const legacyKeys = [
        'popurri_raw_contacts_v1',
        'popurri_raw_contacts_v2',
        'popurri_raw_contacts_v3',
        'popurri_raw_contacts_v4',
      ];
      for (const storageKey of legacyKeys) {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            acumulado = fusionarContactosMultiDispositivo(acumulado, parsed, keys);
          }
        }
      }
      return acumulado;
    } catch {
      // ignore storage errors
    }
    return migrarContactosDesde167SinPrimerContacto(INITIAL_RAW_CONTACTS, keys);
  });
  const [profile, setProfile] = useState<VoiceProfile>(() => {
    try {
      const saved = localStorage.getItem('popurri_voice_profile_v4');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const merged = { ...DEFAULT_VOICE_PROFILE, ...parsed };
          const coords = resolverCoordenadasPartidaPerfil(merged);
          return { ...merged, latPartida: coords.lat, lngPartida: coords.lng };
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_VOICE_PROFILE;
  });
  const [autoSyncSheetsOnAction, setAutoSyncSheetsOnAction] = useState<boolean>(true);
  const [showControlPanel, setShowControlPanel] = useState<boolean>(false);
  const [copiedExcelTable, setCopiedExcelTable] = useState<boolean>(false);

  // Sincronización automática con Google Sheets (URL/ID directo o Apps Script o OAuth)
  const [sheetUrlInput, setSheetUrlInput] = useState<string>(() => {
    try {
      return localStorage.getItem('popurri_sheet_url') || '';
    } catch {
      return '';
    }
  });
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState<string>(() => {
    try {
      return localStorage.getItem('popurri_apps_script_url') || '';
    } catch {
      return '';
    }
  });
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<string>(
    'Estatus_POPURRÍ cargado (con Columna Estado y detección de teléfonos sin nombre)'
  );
  const [showSheetsConfigBar, setShowSheetsConfigBar] = useState<boolean>(false);

  // Eventos de Google Calendar (con dirección para contemplar traslados, desduplicados y sin eventos ficticios legacy)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>(() => {
    try {
      const saved = localStorage.getItem('popurri_calendar_events_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const limpios = deduplicarEventosCalendar(parsed);
          if (limpios.length > 0) {
            return deduplicarEventosCalendar([...INITIAL_CALENDAR_EVENTS, ...limpios]);
          }
        }
      }
    } catch {
      // ignore storage errors
    }
    return deduplicarEventosCalendar(INITIAL_CALENDAR_EVENTS);
  });
  const [calendarIcalUrlInput, setCalendarIcalUrlInput] = useState<string>(() => {
    try {
      return localStorage.getItem('popurri_calendar_ical_url') || '';
    } catch {
      return '';
    }
  });
  const [calendarQuickText, setCalendarQuickText] = useState<string>('');
  const [isSyncingCalendar, setIsSyncingCalendar] = useState<boolean>(false);
  const [calendarSyncStatus, setCalendarSyncStatus] = useState<string>('');
  const [showCalendarPrecisionModal, setShowCalendarPrecisionModal] = useState<boolean>(false);
  const [newCalSummary, setNewCalSummary] = useState<string>('');
  const [newCalLocation, setNewCalLocation] = useState<string>('');
  const [newCalFecha, setNewCalFecha] = useState<string>(() => obtenerPartesFechaHoraBA().ddmm);
  const [newCalStart, setNewCalStart] = useState<string>('11:00');
  const [newCalEnd, setNewCalEnd] = useState<string>('12:00');

  // Reloj dinámico de la Agenda Recomendada Día por Día (se actualiza automáticamente cada 30s y al hacer clic en Actualizar)
  const [ahoraCorteMs, setAhoraCorteMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAhoraCorteMs(Date.now());
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Filtros de bandeja
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [barrioFiltro, setBarrioFiltro] = useState<string>('Todos');
  const [situacionFiltro, setSituacionFiltro] = useState<FiltroSituacion>('TODOS');
  const [estadoFlujoFiltro, setEstadoFlujoFiltro] = useState<'TODOS' | EstadoFlujo>('TODOS');
  const [bandejaGrupoIdsFiltro, setBandejaGrupoIdsFiltro] = useState<string[] | null>(null);
  const [bandejaGrupoTitulo, setBandejaGrupoTitulo] = useState<string>('');

  // Contacto activo en el redactor lateral y vista móvil (Lista vs Ficha)
  const [selectedContactId, setSelectedContactId] = useState<string>('1');
  const [mobileBandejaView, setMobileBandejaView] = useState<'list' | 'detail'>('list');
  const [showMobileRulesInfo, setShowMobileRulesInfo] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TipoPlantillaWA>('auto');
  const [customMessageText, setCustomMessageText] = useState<string>('');
  const [ultimoMensajeVecino, setUltimoMensajeVecino] = useState<string>('');
  const [nombreCompletarInput, setNombreCompletarInput] = useState<string>('');
  const [isRefiningAI, setIsRefiningAI] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sentIdsInSession, setSentIdsInSession] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('popurri_sent_ids_v4');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set(parsed.map(String));
      }
    } catch {
      // ignore storage errors
    }
    return new Set();
  });
  const [alertaOcultaIds, setAlertaOcultaIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('popurri_alerta_oculta_ids_v4');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set(parsed.map(String));
      }
    } catch {
      // ignore storage errors
    }
    return new Set();
  });
  const [ocultarEnviadosEnAlertas, setOcultarEnviadosEnAlertas] = useState<boolean>(false);
  const [expandirMensajeEnviadoIds, setExpandirMensajeEnviadoIds] = useState<Set<string>>(
    new Set()
  );

  // Modal de "Enviar 1er Mensaje / Nuevo Contacto" y Panel de Enfoque Diario POPURRÍ
  const [showPrimerMensajeModal, setShowPrimerMensajeModal] = useState<boolean>(false);
  const [showAutoFirstMessageModal, setShowAutoFirstMessageModal] = useState<boolean>(false);
  const [modoColaBotActivo, setModoColaBotActivo] =
    useState<ModoColaAutomatizacionWA>('PRIMER_CONTACTO');
  const [showDailyTasksPanel, setShowDailyTasksPanel] = useState<boolean>(true);
  const [nuevoNombre, setNuevoNombre] = useState<string>('');
  const [nuevoTel, setNuevoTel] = useState<string>('');
  const [nuevoBarrio, setNuevoBarrio] = useState<string>('Palermo');
  const [nuevoComentario, setNuevoComentario] = useState<string>('');

  // Estado de Corte Estratégico, Agenda Hoy/Próximos Días y Consola 1-a-1 de Confirmación y Respuestas
  const [corteBarrioFiltro, setCorteBarrioFiltro] = useState<string>('Todos');
  const [corteCategoriaFiltro, setCorteCategoriaFiltro] = useState<string>('Todas');
  const [bloqueAgendaActivoId, setBloqueAgendaActivoId] = useState<string | null>('agenda-hoy-tarde');
  const [bloquesConfirmadosIds, setBloquesConfirmadosIds] = useState<Set<string>>(
    new Set(['agenda-hoy-tarde'])
  );
  const [aiCorteLoading, setAiCorteLoading] = useState<boolean>(false);
  const [aiCorteText, setAiCorteText] = useState<string>('');
  const [corteEditedMessages, setCorteEditedMessages] = useState<Record<string, string>>({});
  const [propuestaEditedMessages, setPropuestaEditedMessages] = useState<Record<string, string>>({});
  const [reprogramarFechaInputs, setReprogramarFechaInputs] = useState<Record<string, string>>({});
  const [reprogramarFranjaInputs, setReprogramarFranjaInputs] = useState<Record<string, FranjaHoraria>>({});
  const [reprogramarHoraInputs, setReprogramarHoraInputs] = useState<Record<string, string>>({});
  const [reprogramarDirInputs, setReprogramarDirInputs] = useState<Record<string, string>>({});
  const [planSeleccionadoInputs, setPlanSeleccionadoInputs] = useState<
    Record<string, TipoRespuestaPropuestaAgenda>
  >({});
  const [aiRefineNotice, setAiRefineNotice] = useState<string>('');
  const [respuestasConsolidadasLog, setRespuestasConsolidadasLog] = useState<
    Record<string, { etiqueta: string; hora: string }>
  >(() => {
    try {
      const saved = localStorage.getItem('popurri_respuestas_log_v4');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return {};
  });

  // Nuevo barrio para Cafés Hub en Configuración y buscador del Catálogo Google Maps
  const [nuevoBarrioHubNombre, setNuevoBarrioHubNombre] = useState<string>('');
  const [nuevoBarrioHubCafe, setNuevoBarrioHubCafe] = useState<string>('');
  const [nuevoBarrioHubEsquina, setNuevoBarrioHubEsquina] = useState<string>('');
  const [nuevoBarrioHubHorarios, setNuevoBarrioHubHorarios] = useState<string>('');
  const [filtroCatalogoCafeBarrio, setFiltroCatalogoCafeBarrio] = useState<string>('Todos');
  const [busquedaCatalogoCafe, setBusquedaCatalogoCafe] = useState<string>('');

  // Estado Google Workspace OAuth opcional
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [workspaceStatusMsg, setWorkspaceStatusMsg] = useState<string>('');
  const [driveFiles, setDriveFiles] = useState<DriveSpreadsheetFile[]>([]);
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string>('');
  const [activeSheetTitle, setActiveSheetTitle] = useState<string>('Control');
  const [csvImportText, setCsvImportText] = useState<string>('');

  const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Elección de modalidad (Café HUB, Puerta a Puerta, Punto de Adhesión, Encuentro Sede) y Café HUB por bloque de la Agenda Día por Día
  const [modalidadOverrideByBloque, setModalidadOverrideByBloque] = useState<
    Record<string, ModalidadEncuentroAgenda>
  >(() => {
    try {
      const saved = localStorage.getItem('popurri_modalidad_override_v4');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return {};
  });
  const [cafeHubOverrideByBloque, setCafeHubOverrideByBloque] = useState<
    Record<string, { nombre: string; direccion: string }>
  >(() => {
    try {
      const saved = localStorage.getItem('popurri_cafehub_override_v4');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return {};
  });

  const serverHydratedRef = useRef<boolean>(false);
  const lastServerVersionRef = useRef<number>(0);
  const applyingRemoteStateRef = useRef<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('popurri_raw_contacts_v4', JSON.stringify(rawContacts));
    } catch {
      // ignore storage errors
    }
  }, [rawContacts]);

  useEffect(() => {
    try {
      localStorage.setItem('popurri_control_envios_v1', JSON.stringify(controlEnvios));
    } catch {
      // ignore storage errors
    }
  }, [controlEnvios]);

  useEffect(() => {
    try {
      localStorage.setItem('popurri_calendar_events_v2', JSON.stringify(calendarEvents));
    } catch {
      // ignore storage errors
    }
  }, [calendarEvents]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'popurri_sent_ids_v4',
        JSON.stringify(Array.from(sentIdsInSession))
      );
    } catch {
      // ignore storage errors
    }
  }, [sentIdsInSession]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'popurri_alerta_oculta_ids_v4',
        JSON.stringify(Array.from(alertaOcultaIds))
      );
    } catch {
      // ignore storage errors
    }
  }, [alertaOcultaIds]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'popurri_respuestas_log_v4',
        JSON.stringify(respuestasConsolidadasLog)
      );
    } catch {
      // ignore storage errors
    }
  }, [respuestasConsolidadasLog]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'popurri_modalidad_override_v4',
        JSON.stringify(modalidadOverrideByBloque)
      );
    } catch {
      // ignore storage errors
    }
  }, [modalidadOverrideByBloque]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'popurri_cafehub_override_v4',
        JSON.stringify(cafeHubOverrideByBloque)
      );
    } catch {
      // ignore storage errors
    }
  }, [cafeHubOverrideByBloque]);

  useEffect(() => {
    try {
      localStorage.setItem('popurri_voice_profile_v4', JSON.stringify(profile));
    } catch {
      // ignore storage errors
    }
  }, [profile]);

  // Sincronización bidireccional multi-dispositivo (PC, notebook/compu, celular) y anti-pérdida al recargar o actualizar
  const applyRemoteSnapshot = (rem: SharedAppStateSnapshot) => {
    applyingRemoteStateRef.current = true;
    lastServerVersionRef.current = Math.max(lastServerVersionRef.current, rem.version || 0);

    let mergedControl = controlEnvios;
    if (Array.isArray(rem.controlEnvios) && rem.controlEnvios.length > 0) {
      setControlEnvios((prev) => {
        const map = new Map<string, ControlEnvioRegistro>();
        for (const item of [...rem.controlEnvios!, ...prev]) {
          if (item?.idRegistro && !map.has(item.idRegistro)) {
            map.set(item.idRegistro, item);
          }
        }
        mergedControl = Array.from(map.values()).slice(0, 150);
        return mergedControl;
      });
    }

    if (Array.isArray(rem.rawContacts) && rem.rawContacts.length > 0) {
      const keys = obtenerKeysControlEnviados(mergedControl);
      setRawContacts((prev) => fusionarContactosMultiDispositivo(prev, rem.rawContacts!, keys));
    }

    if (Array.isArray(rem.sentContactIds) && rem.sentContactIds.length > 0) {
      setSentIdsInSession((prev) => {
        const next = new Set(prev);
        rem.sentContactIds!.forEach((id) => next.add(String(id)));
        return next;
      });
    }

    if (Array.isArray(rem.alertaOcultaIds) && rem.alertaOcultaIds.length > 0) {
      setAlertaOcultaIds((prev) => {
        const next = new Set(prev);
        rem.alertaOcultaIds!.forEach((id) => next.add(String(id)));
        return next;
      });
    }

    if (rem.respuestasConsolidadasLog && Object.keys(rem.respuestasConsolidadasLog).length > 0) {
      setRespuestasConsolidadasLog((prev) => ({
        ...prev,
        ...rem.respuestasConsolidadasLog,
      }));
    }

    if (rem.modalidadOverrideByBloque && Object.keys(rem.modalidadOverrideByBloque).length > 0) {
      setModalidadOverrideByBloque((prev) => ({
        ...prev,
        ...rem.modalidadOverrideByBloque,
      }));
    }

    if (rem.cafeHubOverrideByBloque && Object.keys(rem.cafeHubOverrideByBloque).length > 0) {
      setCafeHubOverrideByBloque((prev) => ({
        ...prev,
        ...rem.cafeHubOverrideByBloque,
      }));
    }

    if (Array.isArray(rem.calendarEvents) && rem.calendarEvents.length > 0) {
      setCalendarEvents((prev) => deduplicarEventosCalendar([...prev, ...rem.calendarEvents!]));
    }

    if (rem.sheetUrlInput && !sheetUrlInput) setSheetUrlInput(rem.sheetUrlInput);
    if (rem.appsScriptUrlInput && !appsScriptUrlInput) setAppsScriptUrlInput(rem.appsScriptUrlInput);
    if (rem.calendarIcalUrlInput && !calendarIcalUrlInput)
      setCalendarIcalUrlInput(rem.calendarIcalUrlInput);

    window.setTimeout(() => {
      applyingRemoteStateRef.current = false;
    }, 60);
  };

  useEffect(() => {
    let cancelled = false;
    const pullFromServer = async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) {
          serverHydratedRef.current = true;
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && data?.hasState && data?.state) {
          if (
            !serverHydratedRef.current ||
            (data.state.version && data.state.version > lastServerVersionRef.current)
          ) {
            applyRemoteSnapshot(data.state as SharedAppStateSnapshot);
          }
        }
        serverHydratedRef.current = true;
      } catch {
        serverHydratedRef.current = true;
      }
    };

    void pullFromServer();

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void pullFromServer();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    const pollTimer = window.setInterval(() => {
      void pullFromServer();
    }, 8000);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.clearInterval(pollTimer);
    };
  }, []);

  useEffect(() => {
    if (!serverHydratedRef.current || applyingRemoteStateRef.current) return;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawContacts,
            controlEnvios,
            sentContactIds: Array.from(sentIdsInSession),
            alertaOcultaIds: Array.from(alertaOcultaIds),
            respuestasConsolidadasLog,
            modalidadOverrideByBloque,
            cafeHubOverrideByBloque,
            calendarEvents,
            sheetUrlInput,
            appsScriptUrlInput,
            calendarIcalUrlInput,
            profile,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.version) {
            lastServerVersionRef.current = Math.max(
              lastServerVersionRef.current,
              Number(data.version)
            );
          }
        }
      } catch {
        // ignore network errors
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [
    rawContacts,
    controlEnvios,
    sentIdsInSession,
    alertaOcultaIds,
    respuestasConsolidadasLog,
    modalidadOverrideByBloque,
    cafeHubOverrideByBloque,
    calendarEvents,
    sheetUrlInput,
    appsScriptUrlInput,
    calendarIcalUrlInput,
    profile,
  ]);

  useEffect(() => {
    const unsub = initAuth(
      (user) => {
        setGoogleUserEmail(user.email || 'Usuario conectado');
      },
      () => {
        setGoogleUserEmail(null);
      }
    );
    return () => unsub();
  }, []);

  // Procesar todos los contactos con desambiguación de nombres, ortografía, fecha/hora actual, IDs únicos y detección de alertas vencidas
  const contacts: Contact[] = useMemo(() => {
    return asegurarIdsUnicosContactos(rawContacts).map((raw) => {
      const proc = procesarContacto(raw, profile, ahoraCorteMs);
      return {
        ...proc,
        enviadoEnSesion:
          sentIdsInSession.has(raw.id) || Boolean(raw.ultimoMensajeCorteEnviadoAt),
      };
    });
  }, [rawContacts, profile, sentIdsInSession, ahoraCorteMs]);

  // Lista dinámica de todos los barrios existentes en el padrón + barrios configurados
  const todosLosBarrios = useMemo(() => {
    const setB = new Set<string>();
    for (const c of contacts) {
      if (c.barrio && c.barrio.trim()) setB.add(c.barrio.trim());
    }
    for (const b of Object.keys(profile.cafesPorBarrio)) {
      setB.add(b);
    }
    return Array.from(setB);
  }, [contacts, profile.cafesPorBarrio]);

  const selectedContact: Contact = useMemo(() => {
    return contacts.find((c) => c.id === selectedContactId) || contacts[0];
  }, [contacts, selectedContactId]);

  useEffect(() => {
    if (!selectedContact) return;
    if (selectedTemplate === 'auto' && selectedContact.alertaVencido?.activa) {
      setCustomMessageText(selectedContact.alertaVencido.mensajeDisculpasReprogramacion);
      return;
    }
    const gen = generarMensajeContextual(selectedContact, profile, selectedTemplate);
    setCustomMessageText(gen.texto);
  }, [selectedContact, profile, selectedTemplate, ahoraCorteMs]);

  // Micro-clusters (estrictamente para NO adheridos, agrupando por fechas de Columna G y alineados con Agenda)
  const microClusters = useMemo(() => {
    return construirMicroClusters(contacts, 15, 'Todos', profile, ahoraCorteMs);
  }, [contacts, profile, ahoraCorteMs]);

  // Resultado del Corte + Agenda Clara para HOY y los Próximos Días (sincronizada en vivo con fecha/hora actual, Google Sheets, Sección 1 y Google Calendar)
  const corteResultado = useMemo(() => {
    const base = generarCorteEstrategicoLocal(
      contacts,
      profile,
      corteBarrioFiltro,
      calendarEvents,
      ahoraCorteMs
    );
    return {
      ...base,
      agendaSugeridaDias: base.agendaSugeridaDias.map((b) => {
        const modOver = modalidadOverrideByBloque[b.id];
        const cafeOver = cafeHubOverrideByBloque[b.id];
        const cafeOverStr = cafeOver
          ? `${cafeOver.nombre} (${cafeOver.direccion.split(',')[0]})`
          : undefined;
        return {
          ...b,
          modalidadElegidaUsuario: modOver || b.modalidadElegidaUsuario,
          cafeElegidoUsuario: cafeOverStr || b.cafeElegidoUsuario,
          paradasRutaSugerida: b.paradasRutaSugerida?.map((p) => ({
            ...p,
            cafeHubAsignado: cafeOver || p.cafeHubAsignado,
          })),
        };
      }),
    };
  }, [
    contacts,
    profile,
    corteBarrioFiltro,
    calendarEvents,
    ahoraCorteMs,
    modalidadOverrideByBloque,
    cafeHubOverrideByBloque,
  ]);

  // Métricas globales sincronizadas automáticamente con Google Sheets (Columnas E, F, G y marcas temporales)
  const kpis = useMemo(() => {
    return calcularResumenKPIsPadron(contacts);
  }, [contacts]);

  // Filtrado de la Bandeja
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (bandejaGrupoIdsFiltro && !bandejaGrupoIdsFiltro.includes(c.id)) return false;
      if (barrioFiltro !== 'Todos' && c.barrio !== barrioFiltro) return false;
      if (estadoFlujoFiltro !== 'TODOS' && c.estadoFlujo !== estadoFlujoFiltro) return false;

      if (situacionFiltro === 'ARCHIVADOS_SIN_DNI_CABA') {
        return c.esCerradoOArchivadoSinDniCaba;
      }

      // Sacar de la lista de pendientes y dejar de mostrar en vistas activas a quienes ya recibieron el mensaje
      // de "6. Sin DNI en CABA (Consultar referidos CABA)" (< #167 con Adhirió=No o marcados como enviados de aquí en adelante),
      // salvo que el usuario filtre explícitamente por el estado 12 o busque por texto.
      if (
        c.esCerradoOArchivadoSinDniCaba &&
        estadoFlujoFiltro !== 'DESCARTADO_O_BAJA' &&
        !bandejaGrupoIdsFiltro &&
        !searchQuery.trim()
      ) {
        return false;
      }

      if (
        situacionFiltro === 'PENDIENTES_ADHESION' &&
        (c.adhirio === 'Sí' ||
          c.procesoCompletadoSinMensajes ||
          c.esCerradoOArchivadoSinDniCaba)
      )
        return false;
      if (
        situacionFiltro === 'CON_PUNTO_O_DIRECCION' &&
        (c.adhirio === 'Sí' ||
          c.procesoCompletadoSinMensajes ||
          c.esCerradoOArchivadoSinDniCaba ||
          c.situacion === 'DESCARTADO_NO_CABA' ||
          !c.tienePuntoEncuentroDeterminado)
      )
        return false;
      if (situacionFiltro === 'ALERTAS_VENCIDOS' && !c.alertaVencido?.activa) return false;
      if (situacionFiltro === 'SIN_NOMBRE_SHEETS' && !c.sinNombre) return false;
      if (
        situacionFiltro === 'NUEVOS_1ER_MENSAJE' &&
        (c.situacion !== 'NUEVO_SIN_PRIMER_MENSAJE' ||
          c.procesoCompletadoSinMensajes ||
          c.esCerradoOArchivadoSinDniCaba)
      )
        return false;
      if (situacionFiltro === 'CAMBIO_CHIP' && !c.esRspSiSinInfoColG) {
        return false;
      }
      if (situacionFiltro === 'SIN_RESPUESTA_48H' && !c.esSinRsp48h) {
        return false;
      }
      if (situacionFiltro === 'VISITAS_Y_RETIROS' && !c.esVisitaConcretadaORetiro) {
        return false;
      }
      if (
        situacionFiltro === 'YA_ADHIRIERON' &&
        c.adhirio !== 'Sí' &&
        !c.procesoCompletadoSinMensajes
      )
        return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNombre = c.nombre.toLowerCase().includes(q);
        const matchCorregido = c.nombreCompletoCorregido.toLowerCase().includes(q);
        const matchVocativo = c.primerNombre.toLowerCase().includes(q);
        const matchBarrio = c.barrio.toLowerCase().includes(q);
        const matchCom = c.comentario.toLowerCase().includes(q);
        const matchTel = c.telRaw.toLowerCase().includes(q);
        const matchEstado = c.estadoFlujoEtiqueta.toLowerCase().includes(q);
        if (
          !matchNombre &&
          !matchCorregido &&
          !matchVocativo &&
          !matchBarrio &&
          !matchCom &&
          !matchTel &&
          !matchEstado
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    contacts,
    bandejaGrupoIdsFiltro,
    barrioFiltro,
    situacionFiltro,
    estadoFlujoFiltro,
    searchQuery,
  ]);

  // Lectura segura de respuestas JSON para evitar errores 'Unexpected token <, "<!doctype"...'
  const leerJsonSeguro = async (res: Response): Promise<{ isHtml: boolean; data: any }> => {
    const rawText = await res.text();
    const trimmed = rawText.trim();
    if (/^<!doctype/i.test(trimmed) || /^<html/i.test(trimmed)) {
      return { isHtml: true, data: null };
    }
    try {
      return { isHtml: false, data: JSON.parse(trimmed) };
    } catch {
      return { isHtml: false, data: null };
    }
  };

  // Fallback directo desde el navegador vía Google Visualization JSONP (sin CORS ni bloqueo de backend)
  const cargarHojaViaGvizJsonp = (spreadsheetId: string, gid: string): Promise<string | null> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        resolve(null);
        return;
      }
      const cbName = `__popurriGvizCb_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const script = document.createElement('script');
      let finished = false;

      const cleanup = () => {
        try {
          delete (window as any)[cbName];
        } catch {
          (window as any)[cbName] = undefined;
        }
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };

      const timer = window.setTimeout(() => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(null);
      }, 6500);

      (window as any)[cbName] = (resp: any) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        cleanup();
        try {
          if (!resp || resp.status === 'error' || !resp.table || !Array.isArray(resp.table.rows)) {
            resolve(null);
            return;
          }
          const cols: Array<{ label?: string }> = Array.isArray(resp.table.cols)
            ? resp.table.cols
            : [];
          const lines: string[] = [];

          // Si gviz colocó los encabezados en cols[].label, reconstruir la fila de encabezados respetando cada columna (A, B, C...)
          const hasColLabels = cols.some((c) => c && typeof c.label === 'string' && c.label.trim().length > 0);
          if (hasColLabels) {
            lines.push(
              cols
                .map((c) => String(c?.label ?? '').replace(/\t|\r|\n/g, ' ').trim())
                .join('\t')
            );
          }

          for (const row of resp.table.rows) {
            const cells: Array<{ v?: any; f?: string } | null> = Array.isArray(row?.c)
              ? row.c
              : [];
            const line = cells
              .map((cell) => {
                if (!cell) return '';
                const val = cell.f !== undefined && cell.f !== null ? cell.f : cell.v;
                return String(val ?? '')
                  .replace(/\t|\r|\n/g, ' ')
                  .trim();
              })
              .join('\t');
            if (line.trim().length > 0) {
              lines.push(line);
            }
          }

          resolve(lines.length > 0 ? lines.join('\n') : null);
        } catch {
          resolve(null);
        }
      };

      script.onerror = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        cleanup();
        resolve(null);
      };

      script.src = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
        spreadsheetId
      )}/gviz/tq?gid=${encodeURIComponent(gid)}&headers=0&tqx=responseHandler:${cbName}`;
      document.body.appendChild(script);
    });
  };

  // Fallback cliente para leer Google Sheets o Apps Script directo desde el navegador
  const intentarLecturaDirectaNavegador = async (
    rawSheetUrl: string,
    rawScriptUrl: string
  ): Promise<{ contacts: RawContactRow[]; calendarEvents?: CalendarEventItem[]; sourceLabel: string } | null> => {
    let sheetCandidate = rawSheetUrl.trim();
    let scriptCandidate = rawScriptUrl.trim();

    if (sheetCandidate.startsWith('https://script.google.com/') && !scriptCandidate) {
      scriptCandidate = sheetCandidate;
      sheetCandidate = '';
    }
    if (
      scriptCandidate.includes('docs.google.com/spreadsheets') &&
      !scriptCandidate.startsWith('https://script.google.com/')
    ) {
      if (!sheetCandidate) sheetCandidate = scriptCandidate;
      scriptCandidate = '';
    }

    // 1. Intentar Apps Script directo desde el navegador si termina en /exec
    if (scriptCandidate.startsWith('https://script.google.com/') && scriptCandidate.includes('/exec')) {
      try {
        const res = await fetch(scriptCandidate, { method: 'GET' });
        const { isHtml, data } = await leerJsonSeguro(res);
        if (!isHtml && data && Array.isArray(data.rows)) {
          const textTsv = data.rows
            .map((r: unknown[]) => r.map((cell) => String(cell ?? '')).join('\t'))
            .join('\n');
          const parsed = parsearTSVoCSVContactos(textTsv, true);
          if (parsed.length > 0) {
            return {
              contacts: parsed,
              calendarEvents: Array.isArray(data.calendarEvents) ? data.calendarEvents : undefined,
              sourceLabel: 'Puente Nativo Apps Script',
            };
          }
        }
      } catch {
        // continuar con lectura de Google Sheets
      }
    }

    if (!sheetCandidate) return null;

    const idMatch = sheetCandidate.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = idMatch && idMatch[1] !== 'e' ? idMatch[1] : sheetCandidate;
    const gidMatch = sheetCandidate.match(/[#&?]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    // 2. Intentar lectura en el navegador vía gviz CSV (soporta CORS si la hoja es pública)
    try {
      const gvizCsvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
      const res = await fetch(gvizCsvUrl);
      if (res.ok) {
        const txt = await res.text();
        if (!/^<!doctype/i.test(txt.trim()) && !/^<html/i.test(txt.trim())) {
          const parsed = parsearTSVoCSVContactos(txt, true);
          if (parsed.length > 0) {
            return { contacts: parsed, sourceLabel: 'Google Sheets en vivo' };
          }
        }
      }
    } catch {
      // continuar con JSONP
    }

    // 3. Intentar vía Google Visualization JSONP (funciona sin CORS y aprovecha la sesión activa del navegador)
    const jsonpTsv = await cargarHojaViaGvizJsonp(spreadsheetId, gid);
    if (jsonpTsv) {
      const parsed = parsearTSVoCSVContactos(jsonpTsv, true);
      if (parsed.length > 0) {
        return { contacts: parsed, sourceLabel: 'Google Sheets (Conexión Directa)' };
      }
    }

    return null;
  };

  // Sincronización de máxima precisión con Google Calendar (OAuth todos los calendarios + Enlace iCal .ics + Puente Apps Script + Archivo .ics)
  const handleSincronizarCalendarPrecision = async (opciones?: {
    icalUrlOverride?: string;
    silencioso?: boolean;
  }): Promise<CalendarEventItem[] | null> => {
    const icalUrl = (opciones?.icalUrlOverride ?? calendarIcalUrlInput).trim();
    if (!opciones?.silencioso) {
      setIsSyncingCalendar(true);
      setCalendarSyncStatus('');
    }
    try {
      if (icalUrl) {
        localStorage.setItem('popurri_calendar_ical_url', icalUrl);
      }

      // 1. Si configuró URL iCal (.ics) secreta/pública de Google Calendar
      if (icalUrl) {
        const res = await fetch('/api/calendar/fetch-ical', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ icalUrl }),
        });
        const { isHtml, data } = await leerJsonSeguro(res);
        if (!isHtml && data?.ok) {
          if (data.format === 'ical' && typeof data.icsText === 'string') {
            const parsedEvents = deduplicarEventosCalendar([
              ...calendarEvents,
              ...parsearICalEventosCalendar(data.icsText, Date.now()),
            ]);
            if (parsedEvents.length > 0) {
              setCalendarEvents(parsedEvents);
              setAhoraCorteMs(Date.now());
              const msg = `✓ Google Calendar sincronizado vía enlace iCal (.ics): ${parsedEvents.length} evento(s) activos cargados con hora de Buenos Aires y reflejados en la Agenda.`;
              setCalendarSyncStatus(msg);
              if (!opciones?.silencioso) setWorkspaceStatusMsg(msg);
              return parsedEvents;
            }
          } else if (data.format === 'json' && Array.isArray(data.events)) {
            const deduped = deduplicarEventosCalendar([...calendarEvents, ...data.events]);
            setCalendarEvents(deduped);
            setAhoraCorteMs(Date.now());
            const msg = `✓ Google Calendar sincronizado (${deduped.length} eventos cargados y reflejados en la Agenda).`;
            setCalendarSyncStatus(msg);
            if (!opciones?.silencioso) setWorkspaceStatusMsg(msg);
            return deduped;
          }
        } else if (data?.error && !opciones?.silencioso) {
          setCalendarSyncStatus(data.error);
        }
      }

      // 2. Si tiene sesión Google OAuth activa, leer todos los calendarios visibles de la cuenta (14 días)
      if (googleUserEmail) {
        const hoyISO = obtenerPartesFechaHoraBA().isoDate;
        const oauthEvents = deduplicarEventosCalendar([
          ...calendarEvents,
          ...(await listarEventosGoogleCalendar(hoyISO, 14)),
        ]);
        if (oauthEvents.length > 0) {
          setCalendarEvents(oauthEvents);
          setAhoraCorteMs(Date.now());
          const msg = `✓ Sincronizados ${oauthEvents.length} evento(s) de todos tus calendarios de Google (ventana de 14 días).`;
          setCalendarSyncStatus(msg);
          if (!opciones?.silencioso) setWorkspaceStatusMsg(msg);
          return oauthEvents;
        }
      }

      // 3. Si tiene Puente Apps Script configurado, traer calendarEvents desde el puente
      if (appsScriptUrlInput.trim().startsWith('https://script.google.com/')) {
        const res = await fetch('/api/sheets/fetch-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheetUrlOrId: '',
            appsScriptUrl: appsScriptUrlInput.trim(),
          }),
        });
        const { isHtml, data } = await leerJsonSeguro(res);
        if (!isHtml && data?.ok && Array.isArray(data.calendarEvents) && data.calendarEvents.length > 0) {
          const deduped = deduplicarEventosCalendar([...calendarEvents, ...data.calendarEvents]);
          setCalendarEvents(deduped);
          setAhoraCorteMs(Date.now());
          const msg = `✓ Sincronizados ${deduped.length} evento(s) desde el Puente Apps Script de tu Google Calendar.`;
          setCalendarSyncStatus(msg);
          if (!opciones?.silencioso) setWorkspaceStatusMsg(msg);
          return deduped;
        }
      }

      if (!opciones?.silencioso) {
        setShowCalendarPrecisionModal(true);
        setCalendarSyncStatus(
          'Para traer el 100% de tus eventos reales sin omisiones, pegá tu "Dirección secreta en formato iCal (.ics)" de Google Calendar, subí tu archivo .ics o conectá Google.'
        );
      }
      return null;
    } catch (e) {
      if (!opciones?.silencioso) {
        setCalendarSyncStatus(
          e instanceof Error ? e.message : 'Error al sincronizar Google Calendar.'
        );
      }
      return null;
    } finally {
      if (!opciones?.silencioso) {
        setIsSyncingCalendar(false);
      }
    }
  };

  const handleImportarArchivoIcsCalendar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parsearICalEventosCalendar(text, Date.now(), file.name.replace(/\.ics$/i, ''));
      if (parsed.length > 0) {
        setCalendarEvents((prev) => deduplicarEventosCalendar([...prev, ...parsed]));
        setAhoraCorteMs(Date.now());
        const msg = `✓ Archivo "${file.name}" importado con éxito: ${parsed.length} evento(s) de tu Calendar reflejados en la Agenda Recomendada.`;
        setCalendarSyncStatus(msg);
        setWorkspaceStatusMsg(msg);
      } else {
        setCalendarSyncStatus(
          'El archivo .ics no tenía eventos dentro de la ventana actual (ayer a +14 días).'
        );
      }
    };
    reader.readAsText(file);
  };

  const handleImportarTextoAgendaCalendar = () => {
    const parsed = parsearTextoAgendaCalendar(calendarQuickText, Date.now());
    if (parsed.length === 0) {
      setCalendarSyncStatus(
        'No se detectaron horarios en el texto. Escribí por ejemplo: "21/10 11:00 - 12:30 Reunión equipo | Av. Cabildo 2040, Belgrano"'
      );
      return;
    }
    setCalendarEvents((prev) => deduplicarEventosCalendar([...prev, ...parsed]));
    setCalendarQuickText('');
    setAhoraCorteMs(Date.now());
    const msg = `✓ Se sumaron ${parsed.length} evento(s) a tu Calendar y se recalculó la Agenda Día por Día.`;
    setCalendarSyncStatus(msg);
    setWorkspaceStatusMsg(msg);
  };

  // Acciones de sincronización con Google Sheets (1 Clic) + Recálculo de Agenda Recomendada Día por Día con fecha y hora actual
  const handleActualizarDesdeSheets = async () => {
    setIsSyncingSheets(true);
    setWorkspaceStatusMsg('');
    const nuevoAhoraMs = Date.now();
    setAhoraCorteMs(nuevoAhoraMs);
    const ahoraBA = obtenerPartesFechaHoraBA(nuevoAhoraMs);
    try {
      localStorage.setItem('popurri_sheet_url', sheetUrlInput);
      localStorage.setItem('popurri_apps_script_url', appsScriptUrlInput);

      // Si tiene enlace iCal o Google OAuth, refrescar y ESPERAR también los eventos de Calendar para recalcular la Agenda con ellos
      let activeCalendarEvents = calendarEvents;
      if (calendarIcalUrlInput.trim() || googleUserEmail) {
        const syncedCal = await handleSincronizarCalendarPrecision({ silencioso: true });
        if (syncedCal && syncedCal.length > 0) {
          activeCalendarEvents = syncedCal;
        }
      }

      const keysControl = obtenerKeysControlEnviados(controlEnvios);

      // 1. Si tiene sesión OAuth activa y seleccionó planilla, usa la API directa
      if (googleUserEmail && selectedSpreadsheetId) {
        const { sheetTitle, contacts: loaded } = await leerContactosDesdeGoogleSheet(
          selectedSpreadsheetId
        );
        if (loaded.length > 0) {
          const { contactosFusionados, nuevosParaPrimerContactoCount } =
            fusionarContactosDesdeSheetsConControl(loaded, rawContacts, keysControl);
          setRawContacts(contactosFusionados);
          setActiveSheetTitle(sheetTitle);
          const corteVivo = generarCorteEstrategicoLocal(
            contactosFusionados.map((r) => procesarContacto(r, profile, nuevoAhoraMs)),
            profile,
            corteBarrioFiltro,
            activeCalendarEvents,
            nuevoAhoraMs
          );
          setLastSyncInfo(
            `Actualizado desde Sheets OAuth (${contactosFusionados.length} filas · Agenda ${ahoraBA.etiquetaCompleta})`
          );
          setWorkspaceStatusMsg(
            `¡Datos y Agenda Día por Día actualizados (${ahoraBA.etiquetaCompleta})! ${contactosFusionados.length} contactos cargados (${corteVivo.metricas.conPuntoEncuentroDeterminado} con punto/dirección en agenda, ${corteVivo.metricas.alertasVencidasReprogramar} alerta(s) de visitas/encuentros pendientes para reprogramar y ${nuevosParaPrimerContactoCount} para 1er Contacto).`
          );
          return;
        }
      }

      // 2. Si configuró URL de Google Sheets o URL de Google Apps Script (Cero bloqueo OAuth Error 400)
      if (sheetUrlInput.trim() || appsScriptUrlInput.trim()) {
        let serverErrorMsg = '';
        try {
          const res = await fetch('/api/sheets/fetch-live', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sheetUrlOrId: sheetUrlInput.trim(),
              appsScriptUrl: appsScriptUrlInput.trim(),
            }),
          });
          const { isHtml, data } = await leerJsonSeguro(res);

          if (!isHtml && data) {
            if (data.ok && data.source === 'apps_script' && Array.isArray(data.rows)) {
              const textTsv = data.rows
                .map((r: unknown[]) => r.map((cell) => String(cell ?? '')).join('\t'))
                .join('\n');
              const parsed = parsearTSVoCSVContactos(textTsv, true);
              if (parsed.length > 0) {
                const { contactosFusionados } =
                  fusionarContactosDesdeSheetsConControl(parsed, rawContacts, keysControl);
                setRawContacts(contactosFusionados);
                const nextCal =
                  Array.isArray(data.calendarEvents) && data.calendarEvents.length > 0
                    ? deduplicarEventosCalendar([...activeCalendarEvents, ...data.calendarEvents])
                    : activeCalendarEvents;
                if (Array.isArray(data.calendarEvents) && data.calendarEvents.length > 0) {
                  setCalendarEvents(nextCal);
                }
                const corteVivo = generarCorteEstrategicoLocal(
                  contactosFusionados.map((r) => procesarContacto(r, profile, nuevoAhoraMs)),
                  profile,
                  corteBarrioFiltro,
                  nextCal,
                  nuevoAhoraMs
                );
                setLastSyncInfo(
                  `Sincronizado vía Puente Nativo (${contactosFusionados.length} contactos · Agenda ${ahoraBA.etiquetaCompleta})`
                );
                setWorkspaceStatusMsg(
                  `¡Sincronización y Agenda Día por Día actualizadas (${ahoraBA.etiquetaCompleta})! ${corteVivo.metricas.conPuntoEncuentroDeterminado} vecinos con dirección/punto en agenda y ${corteVivo.metricas.alertasVencidasReprogramar} alerta(s) de visitas/encuentros pendientes para reprogramar.`
                );
                return;
              }
            }

            if (data.ok && data.csvText) {
              const parsed = parsearTSVoCSVContactos(data.csvText, true);
              if (parsed.length > 0) {
                const { contactosFusionados } =
                  fusionarContactosDesdeSheetsConControl(parsed, rawContacts, keysControl);
                setRawContacts(contactosFusionados);
                const corteVivo = generarCorteEstrategicoLocal(
                  contactosFusionados.map((r) => procesarContacto(r, profile, nuevoAhoraMs)),
                  profile,
                  corteBarrioFiltro,
                  activeCalendarEvents,
                  nuevoAhoraMs
                );
                setLastSyncInfo(
                  `Sincronizado desde Google Sheets (${contactosFusionados.length} contactos · Agenda ${ahoraBA.etiquetaCompleta})`
                );
                setWorkspaceStatusMsg(
                  `¡Agenda Día por Día recalculada (${ahoraBA.etiquetaCompleta})! ${corteVivo.metricas.conPuntoEncuentroDeterminado} vecinos NO adheridos con punto/dirección en agenda y ${corteVivo.metricas.alertasVencidasReprogramar} alerta(s) de visitas/encuentros pendientes para reprogramar.`
                );
                return;
              }
            }

            if (!data.ok && data.error) {
              serverErrorMsg = data.error;
            }
          }
        } catch {
          // Si el servidor no respondió JSON, intentar lectura directa desde el navegador
        }

        // 2B. Fallback automático directo desde el navegador (soporta gviz JSONP con la sesión de Google del navegador)
        const directResult = await intentarLecturaDirectaNavegador(
          sheetUrlInput,
          appsScriptUrlInput
        );
        if (directResult && directResult.contacts.length > 0) {
          const { contactosFusionados } =
            fusionarContactosDesdeSheetsConControl(
              directResult.contacts,
              rawContacts,
              keysControl
            );
          setRawContacts(contactosFusionados);
          const nextCal =
            directResult.calendarEvents && directResult.calendarEvents.length > 0
              ? deduplicarEventosCalendar([
                  ...activeCalendarEvents,
                  ...directResult.calendarEvents,
                ])
              : activeCalendarEvents;
          if (directResult.calendarEvents && directResult.calendarEvents.length > 0) {
            setCalendarEvents(nextCal);
          }
          const corteVivo = generarCorteEstrategicoLocal(
            contactosFusionados.map((r) => procesarContacto(r, profile, nuevoAhoraMs)),
            profile,
            corteBarrioFiltro,
            nextCal,
            nuevoAhoraMs
          );
          setLastSyncInfo(
            `Sincronizado desde ${directResult.sourceLabel} (${contactosFusionados.length} contactos · Agenda ${ahoraBA.etiquetaCompleta})`
          );
          setWorkspaceStatusMsg(
            `¡Actualizado (${ahoraBA.etiquetaCompleta})! Agenda Día por Día recalculada con ${corteVivo.metricas.conPuntoEncuentroDeterminado} vecinos con dirección/punto y ${corteVivo.metricas.alertasVencidasReprogramar} alerta(s) de visitas/encuentros pendientes para reprogramar.`
          );
          return;
        }

        setShowSheetsConfigBar(true);
        setWorkspaceStatusMsg(
          serverErrorMsg ||
            `Agenda Día por Día recalculada a la fecha y hora actual (${ahoraBA.etiquetaCompleta}) con los datos en memoria. Para conectar un documento externo restringido, en tu Google Sheets tocá "Compartir" -> "Cualquier persona con el enlace (Lector)".`
        );
        return;
      }

      // 3. Si aún no pegó el link de su Google Sheet, igual recalcula en vivo la Agenda Recomendada Día por Día con la fecha y hora actual
      const corteActual = generarCorteEstrategicoLocal(
        rawContacts.map((r) => procesarContacto(r, profile, nuevoAhoraMs)),
        profile,
        corteBarrioFiltro,
        activeCalendarEvents,
        nuevoAhoraMs
      );
      setLastSyncInfo(
        `Agenda Día por Día actualizada (${ahoraBA.etiquetaCompleta} · ${corteActual.metricas.conPuntoEncuentroDeterminado} con punto/dirección · ${corteActual.metricas.alertasVencidasReprogramar} alertas)`
      );
      setShowSheetsConfigBar(true);
      setWorkspaceStatusMsg(
        `✓ Agenda Recomendada Día por Día actualizada a ${ahoraBA.etiquetaCompleta}: se descartaron los ${corteActual.metricas.adheridosTotales} adheridos, se filtraron las ${corteActual.metricas.conPuntoEncuentroDeterminado} personas con dirección/punto determinado y se destacaron ${corteActual.metricas.alertasVencidasReprogramar} alerta(s) de visitas/encuentros pendientes para reprogramar. (Si querés vincular otro Google Sheet en vivo, pegá su URL acá abajo).`
      );
    } catch (err) {
      const rawErr = err instanceof Error ? err.message : 'Error al actualizar desde Google Sheets.';
      const msgClaro =
        rawErr.includes('Unexpected token') || rawErr.includes('<!doctype')
          ? 'El documento devolvió una página de inicio de sesión en lugar de datos. En tu Google Sheets tocá "Compartir" -> "Cualquier persona con el enlace (Lector)" (o en tu Apps Script elegí acceso "Cualquier persona") y volvé a tocar "Actualizar desde Sheets".'
          : rawErr;
      setShowSheetsConfigBar(true);
      setWorkspaceStatusMsg(msgClaro);
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleGuardarCambiosEnSheets = async () => {
    setIsSyncingSheets(true);
    try {
      const incluyeEmail = contacts.some((c) => Boolean(c.email));
      // Si tiene Puente de Apps Script configurado, guarda directo sin bloqueo OAuth
      if (appsScriptUrlInput.trim().startsWith('https://script.google.com/')) {
        const matrix = incluyeEmail
          ? [
              ['#', 'Nombre', 'Barrio', 'Mail', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado'],
              ...contacts.map((c) => [
                c.id,
                c.nombre,
                c.barrio,
                c.email || '',
                c.telRaw,
                c.rsp === 'Sí' ? 'Sí' : 'No',
                c.adhirio,
                c.comentario,
                c.estadoFlujoEtiqueta,
              ]),
            ]
          : [
              ['#', 'Nombre', 'Barrio', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado'],
              ...contacts.map((c) => [
                c.id,
                c.nombre,
                c.barrio,
                c.telRaw,
                c.rsp === 'Sí' ? 'Sí' : 'No',
                c.adhirio,
                c.comentario,
                c.estadoFlujoEtiqueta,
              ]),
            ];
        const res = await fetch('/api/sheets/push-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appsScriptUrl: appsScriptUrlInput.trim(),
            action: 'replaceAll',
            payload: matrix,
          }),
        });
        const { isHtml, data } = await leerJsonSeguro(res);
        if (!isHtml && data?.ok) {
          setWorkspaceStatusMsg(
            `¡Guardado exitoso! Las ${contacts.length} filas (con Nombre en Columna B y Estado actualizado) se guardaron en tu Google Sheets.`
          );
          return;
        }
        if (data?.error) {
          setWorkspaceStatusMsg(data.error);
          return;
        }
      }

      // Si tiene OAuth conectado y planilla elegida, pedir confirmación y guardar
      if (googleUserEmail && selectedSpreadsheetId) {
        setPendingWorkspaceAction({
          title: 'Actualizar Documento en Google Sheets',
          description: `Se sobrescribirán las ${contacts.length} filas actualizadas (Nombre en Columna B, Barrio, RSP, Adhirió, Comentario y Estado) en la pestaña "${activeSheetTitle}" de tu Google Sheets.`,
          onConfirm: async () => {
            await sincronizarPadronEnGoogleSheet(
              selectedSpreadsheetId,
              activeSheetTitle,
              contacts.map((c) => ({
                id: c.id,
                nombre: c.nombre,
                barrio: c.barrio,
                email: c.email,
                telRaw: c.telRaw,
                rsp: c.rsp,
                adhirio: c.adhirio,
                comentario: c.comentario,
                estadoFlujo: c.estadoFlujo,
                estadoFlujoEtiqueta: c.estadoFlujoEtiqueta,
              }))
            );
            setWorkspaceStatusMsg(
              `¡Planilla "${activeSheetTitle}" actualizada en Google Sheets (con columna Estado)!`
            );
          },
        });
        return;
      }

      // Fallback instantáneo: descargar CSV listo para Google Sheets
      handleExportarCSV();
      setWorkspaceStatusMsg(
        'Se descargó el archivo CSV actualizado (con la columna Estado incluida) listo para abrir en Google Sheets.'
      );
    } catch (e) {
      setWorkspaceStatusMsg(
        e instanceof Error ? e.message : 'Error guardando en Google Sheets'
      );
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Empuja automáticamente la tabla actualizada al Google Sheets en segundo plano (si hay Apps Script u OAuth activo)
  const sincronizarEnSegundoPlanoConSheets = async (
    nextRawList: RawContactRow[],
    idRegistroControl?: string
  ): Promise<boolean> => {
    if (!autoSyncSheetsOnAction) return false;
    try {
      const processedList = nextRawList.map((r) => procesarContacto(r, profile));
      const incluyeEmail = processedList.some((c) => Boolean(c.email));

      if (appsScriptUrlInput.trim().startsWith('https://script.google.com/')) {
        const matrix = incluyeEmail
          ? [
              ['#', 'Nombre', 'Barrio', 'Mail', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado'],
              ...processedList.map((c) => [
                c.id,
                c.nombre,
                c.barrio,
                c.email || '',
                c.telRaw,
                c.rsp === 'Sí' ? 'Sí' : 'No',
                c.adhirio,
                c.comentario,
                c.estadoFlujoEtiqueta,
              ]),
            ]
          : [
              ['#', 'Nombre', 'Barrio', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado'],
              ...processedList.map((c) => [
                c.id,
                c.nombre,
                c.barrio,
                c.telRaw,
                c.rsp === 'Sí' ? 'Sí' : 'No',
                c.adhirio,
                c.comentario,
                c.estadoFlujoEtiqueta,
              ]),
            ];
        const res = await fetch('/api/sheets/push-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appsScriptUrl: appsScriptUrlInput.trim(),
            action: 'replaceAll',
            payload: matrix,
          }),
        });
        const { isHtml, data } = await leerJsonSeguro(res);
        if (!isHtml && data?.ok) {
          if (idRegistroControl) {
            setControlEnvios((prev) =>
              prev.map((reg) =>
                reg.idRegistro === idRegistroControl
                  ? { ...reg, sincronizadoSheets: true }
                  : reg
              )
            );
          }
          return true;
        }
      } else if (googleUserEmail && selectedSpreadsheetId) {
        await sincronizarPadronEnGoogleSheet(
          selectedSpreadsheetId,
          activeSheetTitle,
          processedList.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            barrio: c.barrio,
            email: c.email,
            telRaw: c.telRaw,
            rsp: c.rsp,
            adhirio: c.adhirio,
            comentario: c.comentario,
            estadoFlujo: c.estadoFlujo,
            estadoFlujoEtiqueta: c.estadoFlujoEtiqueta,
          }))
        );
        if (idRegistroControl) {
          setControlEnvios((prev) =>
            prev.map((reg) =>
              reg.idRegistro === idRegistroControl
                ? { ...reg, sincronizadoSheets: true }
                : reg
            )
          );
        }
        return true;
      }
    } catch {
      // Fallo silencioso en background: queda guardado en localStorage y en la tabla de control
    }
    return false;
  };

  // Actualizar cualquier campo o información de un contacto seleccionado en "1. Contacto y Respuestas"
  // Corrige automáticamente el Barrio si la dirección en Columna G ("Comentario") corresponde a otro barrio,
  // registra el cambio en el Control y sincroniza automáticamente con Google Sheets.
  const updateContactField = (
    id: string,
    patch: Partial<
      Pick<
        RawContactRow,
        | 'nombre'
        | 'email'
        | 'rsp'
        | 'adhirio'
        | 'comentario'
        | 'telRaw'
        | 'barrio'
        | 'enSheets'
        | 'primerContactoEnviado'
        | 'vocativoOverride'
        | 'estadoFlujo'
        | 'estadoFlujoEtiqueta'
      >
    >,
    registrarEnControl: boolean = false
  ) => {
    let mensajeAutocorreccion = '';
    let idRegCreado: string | undefined;

    setRawContacts((prev) => {
      const nextList = prev.map((row) => {
        if (row.id !== id) return row;
        const {
          actualizado,
          barrioAutocorregido,
          barrioAnterior,
          barrioFinal,
        } = actualizarDatosContactoEnApp(row, patch);

        if (barrioAutocorregido && barrioAnterior) {
          mensajeAutocorreccion = `Barrio auto-corregido de "${barrioAnterior}" a "${barrioFinal}" según la dirección cargada en la Columna G ("Comentario").`;
        }

        if (registrarEnControl) {
          idRegCreado = `edit-${Date.now()}-${id}`;
          const procAntes = procesarContacto(row, profile);
          const procDespues = procesarContacto(actualizado, profile);
          const nuevoReg: ControlEnvioRegistro = {
            idRegistro: idRegCreado,
            contactId: actualizado.id,
            nombre: procDespues.nombreCompletoCorregido,
            barrio: actualizado.barrio,
            telRaw: actualizado.telRaw,
            tipoMensaje: 'Edición de Datos en App',
            estadoAnterior: procAntes.estadoFlujoEtiqueta,
            estadoNuevo: procDespues.estadoFlujo,
            estadoNuevoEtiqueta: procDespues.estadoFlujoEtiqueta,
            rspNuevo: actualizado.rsp,
            adhirioNuevo: actualizado.adhirio,
            comentario: actualizado.comentario,
            fechaHora: new Date().toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            sincronizadoSheets: false,
          };
          setControlEnvios((prevLogs) => [nuevoReg, ...prevLogs.slice(0, 99)]);
        }

        return actualizado;
      });

      void sincronizarEnSegundoPlanoConSheets(nextList, idRegCreado);
      return nextList;
    });

    if (mensajeAutocorreccion) {
      setWorkspaceStatusMsg(mensajeAutocorreccion);
    }
  };

  // Aplicar el resultado de un envío automático de 1er contacto (Enviado con éxito, Número inexistente o Error)
  const handleApplyAutoItemResult = (
    contactId: string,
    telefonoNorm: string,
    resultado: ResultadoEnvioAuto,
    detalle: string,
    fechaHoraISO?: string
  ) => {
    const idReg = `auto-wa-${Date.now()}-${contactId}`;
    setRawContacts((prev) => {
      const nextList = prev.map((row) => {
        const rowTel = normalizarTelefonoWA(row.telRaw);
        if (row.id !== contactId && (!telefonoNorm || rowTel !== telefonoNorm)) {
          return row;
        }
        const procAntes = procesarContacto(row, profile);
        const actualizado = aplicarResultadoEnvioAutoAContacto(
          row,
          resultado,
          detalle,
          fechaHoraISO
        );
        const procDespues = procesarContacto(actualizado, profile);

        const registro: ControlEnvioRegistro = {
          idRegistro: idReg,
          contactId: actualizado.id,
          nombre: procDespues.nombreCompletoCorregido,
          barrio: actualizado.barrio,
          telRaw: actualizado.telRaw,
          tipoMensaje:
            resultado === 'ENVIADO_OK'
              ? 'Auto Python: 1er Msj Enviado OK'
              : resultado === 'NUMERO_INEXISTENTE'
              ? 'Auto Python: N° WA Inexistente'
              : 'Auto Python: Error de Envío',
          estadoAnterior: procAntes.estadoFlujoEtiqueta,
          estadoNuevo: procDespues.estadoFlujo,
          estadoNuevoEtiqueta: procDespues.estadoFlujoEtiqueta,
          rspNuevo: actualizado.rsp,
          adhirioNuevo: actualizado.adhirio,
          comentario: actualizado.comentario,
          fechaHora: new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          sincronizadoSheets: false,
        };
        setControlEnvios((prevLogs) => [registro, ...prevLogs.slice(0, 99)]);
        return actualizado;
      });
      void sincronizarEnSegundoPlanoConSheets(nextList, idReg);
      return nextList;
    });
  };

  const handleApplyAutoBatchResults = (
    items: {
      contactId: string;
      telefonoNorm: string;
      resultado: ResultadoEnvioAuto;
      detalleResultado: string;
      fechaHoraResultadoISO?: string;
    }[]
  ) => {
    if (!items.length) return;
    setRawContacts((prev) => {
      const nuevosLogs: ControlEnvioRegistro[] = [];
      const nextList = prev.map((row) => {
        const rowTel = normalizarTelefonoWA(row.telRaw);
        const match = items.find(
          (it) =>
            (it.contactId && String(it.contactId) === String(row.id)) ||
            (it.telefonoNorm && rowTel && it.telefonoNorm === rowTel)
        );
        if (!match) return row;
        const procAntes = procesarContacto(row, profile);
        const actualizado = aplicarResultadoEnvioAutoAContacto(
          row,
          match.resultado,
          match.detalleResultado,
          match.fechaHoraResultadoISO
        );
        const procDespues = procesarContacto(actualizado, profile);

        nuevosLogs.push({
          idRegistro: `auto-batch-${Date.now()}-${actualizado.id}`,
          contactId: actualizado.id,
          nombre: procDespues.nombreCompletoCorregido,
          barrio: actualizado.barrio,
          telRaw: actualizado.telRaw,
          tipoMensaje:
            match.resultado === 'ENVIADO_OK'
              ? 'Auto Python: 1er Msj Enviado OK'
              : match.resultado === 'NUMERO_INEXISTENTE'
              ? 'Auto Python: N° WA Inexistente'
              : 'Auto Python: Error de Envío',
          estadoAnterior: procAntes.estadoFlujoEtiqueta,
          estadoNuevo: procDespues.estadoFlujo,
          estadoNuevoEtiqueta: procDespues.estadoFlujoEtiqueta,
          rspNuevo: actualizado.rsp,
          adhirioNuevo: actualizado.adhirio,
          comentario: actualizado.comentario,
          fechaHora: new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          sincronizadoSheets: true,
        });

        return actualizado;
      });

      if (nuevosLogs.length > 0) {
        setControlEnvios((prevLogs) => [...nuevosLogs, ...prevLogs].slice(0, 100));
      }
      void sincronizarEnSegundoPlanoConSheets(nextList);
      return nextList;
    });
  };

  // Limpiar en 1 clic los falsos ERROR_ENVIO provocados por cierre o restricción de sesión de WhatsApp Web (#168, #169, #170...)
  const handleCleanFalseAutoErrors = () => {
    setRawContacts((prev) => {
      const { actualizados, limpiadosCount } =
        limpiarErroresFalsosRestriccionWA(prev);
      if (limpiadosCount > 0) {
        void sincronizarEnSegundoPlanoConSheets(actualizados);
        setWorkspaceStatusMsg(
          `✓ Se restauraron ${limpiadosCount} contacto(s) con falso error de sesión (ej. #168, #169, #170) al estado limpio "1. Sin contactar (Enviar 1er Msj)".`
        );
      } else {
        setWorkspaceStatusMsg(
          'No había contactos con errores falsos de sesión pendientes de limpiar.'
        );
      }
      return actualizados;
    });
  };

  // Marcar en 1 clic a una persona en "6. Sin DNI en CABA (Consultar referidos CABA)" como ya respondida/archivada
  // para sacarla de la lista de pendientes y de las colas de envío de aquí en adelante.
  const handleArchivarSinDniCabaYaRespondido = (contact: Contact) => {
    const idReg = `archivar-nocaba-${Date.now()}-${contact.id}`;
    setRawContacts((prev) => {
      const nextList = prev.map((row) => {
        if (row.id !== contact.id) return row;
        const actualizado: RawContactRow = {
          ...row,
          enSheets: true,
          primerContactoEnviado: true,
          referidosCabaYaEnviado: true,
          adhirio: 'No',
          estadoFlujo: 'DESCARTADO_O_BAJA',
          estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('DESCARTADO_O_BAJA'),
        };
        const registro: ControlEnvioRegistro = {
          idRegistro: idReg,
          contactId: actualizado.id,
          nombre: contact.nombreCompletoCorregido,
          barrio: actualizado.barrio,
          telRaw: actualizado.telRaw,
          tipoMensaje: 'Archivado Sin DNI CABA (Ya respondido)',
          estadoAnterior: contact.estadoFlujoEtiqueta,
          estadoNuevo: 'DESCARTADO_O_BAJA',
          estadoNuevoEtiqueta: obtenerEtiquetaEstadoFlujo('DESCARTADO_O_BAJA'),
          rspNuevo: actualizado.rsp,
          adhirioNuevo: 'No',
          comentario: actualizado.comentario,
          fechaHora: new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          sincronizadoSheets: false,
        };
        setControlEnvios((prevLogs) => [registro, ...prevLogs.slice(0, 99)]);
        setWorkspaceStatusMsg(
          `#${actualizado.id} (${contact.nombreCompletoCorregido}) marcado como "Ya respondido / Archivado (Sin DNI CABA)" y retirado de la lista de pendientes.`
        );
        return actualizado;
      });
      void sincronizarEnSegundoPlanoConSheets(nextList, idReg);
      return nextList;
    });
  };

  // Abrir WhatsApp en 1 clic (o marcar como enviado), registrar automáticamente el envío en el Control y avanzar el Estado del contacto
  const handleOpenWhatsApp = (
    contact: Contact,
    textoOverride?: string,
    plantillaExplicita?: TipoPlantillaWA,
    omitirAbrirEnlace: boolean = false
  ) => {
    if (contact.procesoCompletadoSinMensajes) {
      setWorkspaceStatusMsg(
        `🔒 #${contact.id} (${contact.nombreCompletoCorregido}) ya adhirió (Proceso terminado). Los botones de envío están deshabilitados; si necesitás escribirle, primero cambiá su estatus en el selector.`
      );
      return;
    }

    const msg = textoOverride || customMessageText || contact.mensajeSugerido;
    const url = crearEnlaceWhatsApp(contact.telRaw, msg);
    setSentIdsInSession((prev) => {
      const next = new Set(prev);
      next.add(contact.id);
      return next;
    });

    const tplActiva: TipoPlantillaWA =
      plantillaExplicita ||
      (selectedContact?.id === contact.id && selectedTemplate !== 'auto'
        ? selectedTemplate
        : contact.tipoPlantillaSugerida);

    const fechaHoyISO = new Date().toISOString().slice(0, 10);
    const idReg = `wa-${Date.now()}-${contact.id}`;

    setRawContacts((prev) => {
      const nextList = prev.map((row) => {
        if (row.id !== contact.id) return row;
        const {
          actualizado,
          estadoAnteriorEtiqueta,
          estadoNuevo,
          estadoNuevoEtiqueta,
          eraPrimerContacto,
        } = registrarEnvioMensajeContacto(row, tplActiva, fechaHoyISO);

        const procActualizado = procesarContacto(actualizado, profile);
        const registro: ControlEnvioRegistro = {
          idRegistro: idReg,
          contactId: actualizado.id,
          nombre: procActualizado.nombreCompletoCorregido,
          barrio: actualizado.barrio,
          telRaw: actualizado.telRaw,
          tipoMensaje: eraPrimerContacto ? '1er Contacto Enviado' : `WA (${tplActiva})`,
          estadoAnterior: estadoAnteriorEtiqueta,
          estadoNuevo,
          estadoNuevoEtiqueta,
          rspNuevo: actualizado.rsp,
          adhirioNuevo: actualizado.adhirio,
          comentario: actualizado.comentario,
          fechaHora: new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          sincronizadoSheets: false,
        };

        setControlEnvios((prevLogs) => [registro, ...prevLogs.slice(0, 99)]);
        setWorkspaceStatusMsg(
          estadoNuevo === 'DESCARTADO_O_BAJA'
            ? `Mensaje de referidos CABA enviado a #${actualizado.id} (${procActualizado.nombreCompletoCorregido}). Su estatus cambió automáticamente a "${estadoNuevoEtiqueta}" y salió de la lista de pendientes.`
            : `✓ Mensaje enviado a #${actualizado.id} (${procActualizado.nombreCompletoCorregido}). Estado actualizado a "${estadoNuevoEtiqueta}" y habilitada la carga de su respuesta.`
        );
        return actualizado;
      });

      void sincronizarEnSegundoPlanoConSheets(nextList, idReg);
      return nextList;
    });

    if (url && !omitirAbrirEnlace) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopiarTablaParaExcel = async () => {
    try {
      const tsv = exportarContactosATSVParaExcel(contacts);
      await navigator.clipboard.writeText(tsv);
      setCopiedExcelTable(true);
      setWorkspaceStatusMsg(
        `¡Tabla completa (${contacts.length} filas con Estado, Barrio auto-corregido y Control de 1er Contacto) copiada al portapapeles! Pegala directo con Ctrl+V en tu Excel o Google Sheets.`
      );
      setTimeout(() => setCopiedExcelTable(false), 3000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleRefineMessageWithAI = async (hacerMasBreve: boolean) => {
    if (!selectedContact) return;
    setIsRefiningAI(true);
    setAiRefineNotice('');
    const mensajeBaseActual = customMessageText || selectedContact.mensajeSugerido;
    const instruccionTexto = hacerMasBreve
      ? 'Acortar este mensaje a 2-3 líneas directas'
      : ultimoMensajeVecino.trim() || 'Adaptar mensaje manteniendo calidez y brevedad';

    try {
      const res = await fetch('/api/gemini/redactar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacto: selectedContact,
          ultimoMensajeRecibido: ultimoMensajeVecino,
          mensajeActual: mensajeBaseActual,
          perfilVoz: profile,
          hacerMasBreve,
        }),
      });
      const { isHtml, data } = await leerJsonSeguro(res);
      if (!isHtml && data?.ok && data?.mensaje) {
        setCustomMessageText(data.mensaje);
        setAiRefineNotice(
          hacerMasBreve
            ? '✓ Mensaje acortado en 2-3 líneas directas.'
            : ultimoMensajeVecino.trim()
            ? `✓ Mensaje adaptado con la respuesta: "${ultimoMensajeVecino.trim()}".`
            : '✓ Mensaje adaptado y pulido con el tono de César.'
        );
      } else {
        const adaptadoLocal = adaptarMensajeConRespuestaVecinoLocal(
          selectedContact,
          instruccionTexto,
          mensajeBaseActual,
          profile
        );
        setCustomMessageText(adaptadoLocal);
        setAiRefineNotice(
          hacerMasBreve
            ? '✓ Mensaje acortado en 2-3 líneas directas.'
            : '✓ Mensaje adaptado incorporando la indicación.'
        );
      }
    } catch {
      const adaptadoLocal = adaptarMensajeConRespuestaVecinoLocal(
        selectedContact,
        instruccionTexto,
        mensajeBaseActual,
        profile
      );
      setCustomMessageText(adaptadoLocal);
      setAiRefineNotice(
        hacerMasBreve
          ? '✓ Mensaje acortado en 2-3 líneas directas.'
          : '✓ Mensaje adaptado incorporando la indicación.'
      );
    } finally {
      setIsRefiningAI(false);
    }
  };

  const handleEjecutarCorteIA = async () => {
    setAiCorteLoading(true);
    const nuevoAhoraMs = Date.now();
    setAhoraCorteMs(nuevoAhoraMs);
    const ahoraBA = obtenerPartesFechaHoraBA(nuevoAhoraMs);
    try {
      const corteActualizado = generarCorteEstrategicoLocal(
        rawContacts.map((r) => procesarContacto(r, profile, nuevoAhoraMs)),
        profile,
        corteBarrioFiltro,
        calendarEvents,
        nuevoAhoraMs
      );
      setLastSyncInfo(
        `Agenda Día por Día y Estrategia IA actualizadas (${ahoraBA.etiquetaCompleta})`
      );
      const muestra = corteActualizado.colaMensajes
        .filter((item) => item.contact.tienePuntoEncuentroDeterminado)
        .slice(0, 18)
        .map((item) => ({
          id: item.contact.id,
          nombre: item.contact.nombreCompletoCorregido,
          vocativo: item.contact.primerNombre,
          barrio: item.contact.barrio,
          situacion: item.contact.situacion,
          comentario: item.contact.comentario,
          franja: item.contact.franjaHoraria,
          alertaVencido: item.contact.alertaVencido?.titulo || null,
        }));
      const res = await fetch('/api/gemini/corte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumenMetricas: corteActualizado.metricas,
          contactosMuestra: muestra,
          barrioFiltro: corteBarrioFiltro,
          perfilVoz: profile,
          fechaHoraActual: corteActualizado.fechaHoraActualEtiqueta,
          alertasVencidas: corteActualizado.alertasPendientesVencidos.map((a) => ({
            id: a.id,
            nombre: a.nombreCompletoCorregido,
            barrio: a.barrio,
            alerta: a.alertaVencido?.titulo,
            motivo: a.alertaVencido?.motivo,
            propuesta: a.alertaVencido?.propuestaReprogramacion,
          })),
          eventosCalendarActivos: calendarEvents,
        }),
      });
      const { isHtml, data } = await leerJsonSeguro(res);
      if (!isHtml && data?.ok && data?.analisis) {
        setAiCorteText(data.analisis);
      } else {
        setAiCorteText(
          `1. RESOLUCIÓN DE PENDIENTES VENCIDOS (${ahoraBA.etiquetaCompleta}):\nTenés ${corteActualizado.alertasPendientesVencidos.length} persona(s) con visita o punto de encuentro de fecha/hora anterior que aún no cambiaron a "Ya adhirió". Usá los botones de disculpas y reprogramación 1-a-1 arriba para destrabarlos hoy.\n\n2. AGENDA RECOMENDADA DÍA POR DÍA + CALCE CON GOOGLE CALENDAR:\nSe filtraron estrictamente las ${corteActualizado.metricas.conPuntoEncuentroDeterminado} personas NO adheridas con dirección o punto determinado (descartando a los ${corteActualizado.metricas.adheridosTotales} ya adheridos) y se calcularon los bloques respetando tus ${calendarEvents.length} eventos de Calendar.\n\n3. CONSOLIDACIÓN 1-A-1:\nHacé clic en "Confirmar y Filtrar Mensajes" en cualquier bloque de la agenda para enviar la propuesta 1-a-1 y registrar su respuesta (si declina Café HUB, pasa automáticamente al recorrido Puerta a Puerta).`
        );
      }
    } catch {
      const corteActualizado = generarCorteEstrategicoLocal(
        rawContacts.map((r) => procesarContacto(r, profile, nuevoAhoraMs)),
        profile,
        corteBarrioFiltro,
        calendarEvents,
        nuevoAhoraMs
      );
      setAiCorteText(
        `Diagnóstico actualizado a ${ahoraBA.etiquetaCompleta}: ${corteActualizado.resumenEjecutivo}`
      );
    } finally {
      setAiCorteLoading(false);
    }
  };

  // Consolidar la respuesta de una persona a la propuesta de la Agenda Recomendada Día por Día
  // permitiendo siempre fijar y guardar el Plan, el Día, el Turno/Franja, la Hora puntual opcional y la Dirección/Café.
  const handleAplicarRespuestaAgenda1a1 = (
    contact: Contact,
    bloque: BloqueAgendaRecomendado,
    respuesta: TipoRespuestaPropuestaAgenda,
    opcionesExtra?: {
      confirmarEncuentro?: boolean;
      fechaExplicit?: string;
      franjaExplicit?: FranjaHoraria;
      horaExplicit?: string;
      dirExplicit?: string;
    }
  ) => {
    const ahoraMs = Date.now();
    const idReg = `agenda-rsp-${ahoraMs}-${contact.id}`;
    const fechaSugeridaVigente = obtenerFechaSugeridaReprogramacionContacto(
      contact,
      bloque.fechaClave,
      ahoraMs
    );
    const nuevaFecha =
      (opcionesExtra?.fechaExplicit ?? reprogramarFechaInputs[contact.id] ?? '').trim() ||
      fechaSugeridaVigente;
    const nuevaFranja: FranjaHoraria =
      opcionesExtra?.franjaExplicit ??
      reprogramarFranjaInputs[contact.id] ??
      (contact.franjaHoraria !== 'Sin definir' ? contact.franjaHoraria : 'Tarde');
    const nuevoHorarioPuntual = (
      opcionesExtra?.horaExplicit ??
      reprogramarHoraInputs[contact.id] ??
      ''
    ).trim();
    const nuevaDireccion =
      (opcionesExtra?.dirExplicit ?? reprogramarDirInputs[contact.id] ?? '').trim() ||
      contact.calleOCruce;

    const detalleDiaTurno = `Día ${nuevaFecha} · Turno ${nuevaFranja}${
      nuevoHorarioPuntual ? ` (${nuevoHorarioPuntual} hs)` : ''
    }${nuevaDireccion ? ` · ${nuevaDireccion}` : ''}`;

    let etiquetaAccion = `Confirmó Propuesta (${detalleDiaTurno})`;
    if (respuesta === 'DECLINO_CAFE_PASA_PUERTA_A_PUERTA') {
      etiquetaAccion = `Pasar Puerta a Puerta (${detalleDiaTurno})`;
    } else if (respuesta === 'PASA_A_CAFE_HUB') {
      etiquetaAccion = `Encuentro en Café (${detalleDiaTurno})`;
    } else if (respuesta === 'REPROGRAMAR_DIA_HORA') {
      etiquetaAccion = `Reprogramado y agendado (${detalleDiaTurno})`;
    } else if (respuesta === 'YA_ADHIRIO') {
      etiquetaAccion = '¡Marcado como Ya Adhirió (Descartado de pendientes)!';
    } else if (respuesta === 'POSTERGO_O_BAJA') {
      etiquetaAccion = 'Postergado para más adelante';
    }

    setAhoraCorteMs(ahoraMs);
    const horaStr = obtenerPartesFechaHoraBA(ahoraMs).hhmm;

    setRawContacts((prev) => {
      const nextList = prev.map((row) => {
        if (row.id !== contact.id) return row;
        const procAntes = procesarContacto(row, profile, ahoraMs);
        const actualizado = aplicarRespuestaPropuestaAgenda(
          row,
          bloque,
          respuesta,
          {
            nuevaDireccion,
            nuevaFecha,
            nuevaFranja,
            nuevoHorarioPuntual,
            confirmarEncuentro: opcionesExtra?.confirmarEncuentro ?? true,
          },
          profile
        );
        const procDespues = procesarContacto(actualizado, profile, ahoraMs);

        const registro: ControlEnvioRegistro = {
          idRegistro: idReg,
          contactId: actualizado.id,
          nombre: procDespues.nombreCompletoCorregido,
          barrio: actualizado.barrio,
          telRaw: actualizado.telRaw,
          tipoMensaje: `Agenda 1-a-1: ${etiquetaAccion}`,
          estadoAnterior: procAntes.estadoFlujoEtiqueta,
          estadoNuevo: procDespues.estadoFlujo,
          estadoNuevoEtiqueta: procDespues.estadoFlujoEtiqueta,
          rspNuevo: actualizado.rsp,
          adhirioNuevo: actualizado.adhirio,
          comentario: actualizado.comentario,
          fechaHora: horaStr,
          sincronizadoSheets: false,
        };
        setControlEnvios((prevLogs) => [registro, ...prevLogs.slice(0, 99)]);
        return actualizado;
      });
      void sincronizarEnSegundoPlanoConSheets(nextList, idReg);
      return nextList;
    });

    setRespuestasConsolidadasLog((prev) => ({
      ...prev,
      [contact.id]: { etiqueta: etiquetaAccion, hora: horaStr },
    }));

    setWorkspaceStatusMsg(
      `✓ Plan confirmado para ${contact.nombreCompletoCorregido}: "${etiquetaAccion}". La Agenda Recomendada Día por Día y Google Sheets se actualizaron automáticamente.`
    );
  };

  // Seleccionar una opción de plan (Confirmó Propuesta, Puerta a Puerta, Café o Reprogramar)
  // habilitando y pre-cargando el Día y el Turno para que el usuario pueda fijarlos y guardarlos.
  const handleSeleccionarPlanContacto = (
    contact: Contact,
    bloque: BloqueAgendaRecomendado,
    plan: TipoRespuestaPropuestaAgenda
  ) => {
    setPlanSeleccionadoInputs((prev) => ({
      ...prev,
      [contact.id]: plan,
    }));
    setReprogramarFechaInputs((prev) => {
      if (prev[contact.id]?.trim()) return prev;
      return {
        ...prev,
        [contact.id]: obtenerFechaSugeridaReprogramacionContacto(
          contact,
          bloque.fechaClave,
          ahoraCorteMs
        ),
      };
    });
    setReprogramarFranjaInputs((prev) => {
      if (prev[contact.id]) return prev;
      return {
        ...prev,
        [contact.id]:
          contact.franjaHoraria !== 'Sin definir' ? contact.franjaHoraria : 'Tarde',
      };
    });
    setReprogramarDirInputs((prev) => {
      if (prev[contact.id] !== undefined) return prev;
      return {
        ...prev,
        [contact.id]: contact.calleOCruce || '',
      };
    });
  };

  // Renderizador unificado del panel para seleccionar un Plan + fijar Día, Turno, Hora puntual y Dirección
  const renderSelectorPlanDiaTurno = (
    c: Contact,
    bloqueTarget: BloqueAgendaRecomendado,
    contextKey: 'alerta' | 'lista'
  ) => {
    const planElegido: TipoRespuestaPropuestaAgenda =
      planSeleccionadoInputs[c.id] || 'CONFIRMO_PROPUESTA';
    const fechaSugerida = obtenerFechaSugeridaReprogramacionContacto(
      c,
      bloqueTarget.fechaClave,
      ahoraCorteMs
    );
    const fechaValor = reprogramarFechaInputs[c.id] ?? fechaSugerida;
    const franjaValor: FranjaHoraria =
      reprogramarFranjaInputs[c.id] ??
      (c.franjaHoraria !== 'Sin definir' ? c.franjaHoraria : 'Tarde');
    const horaValor = reprogramarHoraInputs[c.id] ?? '';
    const dirValor = reprogramarDirInputs[c.id] ?? c.calleOCruce ?? '';

    const hoyOption = obtenerPartesFechaHoraBA(ahoraCorteMs);
    const manianaOption = sumarDiasAFechaBA(ahoraCorteMs, 1);
    const dia2Option = sumarDiasAFechaBA(ahoraCorteMs, 2);
    const dia3Option = sumarDiasAFechaBA(ahoraCorteMs, 3);
    const dia5Option = sumarDiasAFechaBA(ahoraCorteMs, 5);

    const diasRapidos = [
      { label: `Mañana ${manianaOption.ddmm}`, ddmm: manianaOption.ddmm },
      { label: `${dia2Option.nombreDia.slice(0, 3)} ${dia2Option.ddmm}`, ddmm: dia2Option.ddmm },
      { label: `${dia3Option.nombreDia.slice(0, 3)} ${dia3Option.ddmm}`, ddmm: dia3Option.ddmm },
      { label: `${dia5Option.nombreDia.slice(0, 3)} ${dia5Option.ddmm}`, ddmm: dia5Option.ddmm },
      ...(!c.alertaVencido?.activa
        ? [{ label: `Hoy ${hoyOption.ddmm}`, ddmm: hoyOption.ddmm }]
        : []),
    ];

    const planesOpciones: {
      id: TipoRespuestaPropuestaAgenda;
      label: string;
      activeClass: string;
      inactiveClass: string;
    }[] = [
      {
        id: 'CONFIRMO_PROPUESTA',
        label: '✓ Confirmó Propuesta',
        activeClass: 'bg-emerald-700 text-white ring-2 ring-emerald-400 shadow-sm',
        inactiveClass: 'bg-emerald-600/90 hover:bg-emerald-700 text-white',
      },
      {
        id: 'DECLINO_CAFE_PASA_PUERTA_A_PUERTA',
        label: '🏠 Pasar a Puerta a Puerta',
        activeClass: 'bg-sky-700 text-white ring-2 ring-sky-400 shadow-sm',
        inactiveClass: 'bg-sky-600/90 hover:bg-sky-700 text-white',
      },
      {
        id: 'PASA_A_CAFE_HUB',
        label: '☕ Prefiere ir a Café',
        activeClass: 'bg-amber-400 text-amber-950 ring-2 ring-amber-600 shadow-sm',
        inactiveClass: 'bg-amber-200 hover:bg-amber-300 text-amber-950',
      },
      {
        id: 'REPROGRAMAR_DIA_HORA',
        label: '📅 Reprogramar Día / Turno',
        activeClass: 'bg-indigo-700 text-white ring-2 ring-indigo-400 shadow-sm',
        inactiveClass: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-950 border border-indigo-300',
      },
    ];

    const turnosRapidos: { id: FranjaHoraria; label: string }[] = [
      { id: 'Mañana', label: '🌅 Mañana (9–12:30)' },
      { id: 'Mediodía', label: '☀️ Mediodía (12:30–15)' },
      { id: 'Tarde', label: '🌤️ Tarde (15–18)' },
      { id: 'Vespertino', label: '🌆 Vespertino (18–20:30)' },
      { id: 'Fin de Semana', label: '📅 Fin de Semana' },
    ];

    return (
      <div
        data-testid={`panel-consolidar-${contextKey}-${c.id}`}
        className="space-y-2.5 bg-slate-50/90 border border-slate-200 rounded-lg p-2.5"
      >
        {/* Paso A: Seleccionar opción de plan */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-[11px] font-bold text-slate-800">
              1. Seleccioná el plan acordado con {c.primerNombre}:
            </span>
            <button
              type="button"
              onClick={() =>
                handleAplicarRespuestaAgenda1a1(c, bloqueTarget, 'YA_ADHIRIO')
              }
              className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border border-emerald-300"
            >
              ✓ Ya Adhirió (Descartar)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {planesOpciones.map((op) => {
              const isSelected = planElegido === op.id;
              return (
                <button
                  key={`${contextKey}-${c.id}-plan-${op.id}`}
                  type="button"
                  onClick={() => handleSeleccionarPlanContacto(c, bloqueTarget, op.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                    isSelected ? op.activeClass : op.inactiveClass
                  }`}
                >
                  {op.label}
                  {isSelected ? ' (Seleccionado)' : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* Paso B: Fijar Día, Turno / Franja, Hora puntual y Dirección + Botón de Confirmar y Guardar */}
        <div className="pt-2 border-t border-slate-200/90 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-[11px] font-bold text-slate-900">
              2. Fijar Día y Turno para este plan (se guarda en Agenda, Hoja de Ruta y Sheets):
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-semibold text-slate-600">Día rápido:</span>
              {diasRapidos.map((d) => (
                <button
                  key={`${contextKey}-${c.id}-dia-${d.ddmm}`}
                  type="button"
                  onClick={() =>
                    setReprogramarFechaInputs((prev) => ({
                      ...prev,
                      [c.id]: d.ddmm,
                    }))
                  }
                  className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                    fechaValor === d.ddmm
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Botones rápidos de Turno */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-semibold text-slate-600 mr-0.5">Turno:</span>
            {turnosRapidos.map((t) => (
              <button
                key={`${contextKey}-${c.id}-turno-${t.id}`}
                type="button"
                onClick={() =>
                  setReprogramarFranjaInputs((prev) => ({
                    ...prev,
                    [c.id]: t.id,
                  }))
                }
                className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                  franjaValor === t.id
                    ? 'bg-indigo-700 text-white border-indigo-700'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-indigo-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Inputs editables de Día, Turno, Hora puntual y Calle/Café + Botón Confirmar y Guardar */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <div className="flex items-center gap-1">
              <label
                htmlFor={`dia-input-${contextKey}-${c.id}`}
                className="text-[11px] font-bold text-slate-700"
              >
                Día:
              </label>
              <input
                id={`dia-input-${contextKey}-${c.id}`}
                type="text"
                value={fechaValor}
                onChange={(e) =>
                  setReprogramarFechaInputs((prev) => ({
                    ...prev,
                    [c.id]: e.target.value,
                  }))
                }
                placeholder={`Ej: ${fechaSugerida}`}
                className="w-24 px-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded bg-white text-slate-900"
              />
            </div>

            <div className="flex items-center gap-1">
              <label
                htmlFor={`franja-select-${contextKey}-${c.id}`}
                className="text-[11px] font-bold text-slate-700"
              >
                Turno:
              </label>
              <select
                id={`franja-select-${contextKey}-${c.id}`}
                aria-label={`Nueva franja ${contextKey} para ${c.nombreCompletoCorregido}`}
                value={franjaValor}
                onChange={(e) =>
                  setReprogramarFranjaInputs((prev) => ({
                    ...prev,
                    [c.id]: e.target.value as FranjaHoraria,
                  }))
                }
                className="px-2 py-1 text-xs font-semibold border border-slate-300 rounded bg-white text-slate-900"
              >
                <option value="Mañana">Mañana (9 a 12:30)</option>
                <option value="Mediodía">Mediodía (12:30 a 15)</option>
                <option value="Tarde">Tarde (15 a 18)</option>
                <option value="Vespertino">Vespertino (18 a 20:30)</option>
                <option value="Fin de Semana">Fin de Semana</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <label
                htmlFor={`hora-input-${contextKey}-${c.id}`}
                className="text-[11px] font-semibold text-slate-700"
              >
                Hora (opc.):
              </label>
              <input
                id={`hora-input-${contextKey}-${c.id}`}
                type="text"
                value={horaValor}
                onChange={(e) =>
                  setReprogramarHoraInputs((prev) => ({
                    ...prev,
                    [c.id]: e.target.value,
                  }))
                }
                placeholder="Ej: 11:00 o 15 a 17"
                className="w-28 px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-900"
              />
            </div>

            <input
              type="text"
              value={dirValor}
              onChange={(e) =>
                setReprogramarDirInputs((prev) => ({
                  ...prev,
                  [c.id]: e.target.value,
                }))
              }
              placeholder={c.calleOCruce || 'Calle, esquina o café...'}
              className="w-44 px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-900"
            />

            <button
              type="button"
              data-testid={`btn-confirmar-plan-dia-turno-${contextKey}-${c.id}`}
              onClick={() =>
                handleAplicarRespuestaAgenda1a1(c, bloqueTarget, planElegido, {
                  confirmarEncuentro: true,
                  fechaExplicit: fechaValor,
                  franjaExplicit: franjaValor,
                  horaExplicit: horaValor,
                  dirExplicit: dirValor,
                })
              }
              className="px-3 py-1.5 rounded-md text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-sm flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              Confirmar Plan y Guardar Día / Turno
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Abrir el grupo de personas de un bloque de la Agenda directamente filtrado en "1. Contacto y Respuestas"
  const handleAbrirGrupoEnSeccion1 = (bloque: BloqueAgendaRecomendado) => {
    const ids = bloque.contactosIncluidos.map((c) => c.id);
    setBandejaGrupoIdsFiltro(ids);
    setBandejaGrupoTitulo(`${bloque.diaEtiqueta} · ${bloque.barrio} (${ids.length} vecinos)`);
    setBarrioFiltro('Todos');
    setSituacionFiltro('TODOS');
    setEstadoFlujoFiltro('TODOS');
    setSearchQuery('');
    if (bloque.contactosIncluidos[0]) {
      setSelectedContactId(bloque.contactosIncluidos[0].id);
      setSelectedTemplate('propuesta_bloque_agenda');
    }
    setActiveTab('bandeja');
  };

  const handleCrearYEnviarPrimerMensaje = () => {
    if (!nuevoNombre.trim() && !nuevoTel.trim()) return;
    const maxIdExistente = rawContacts.reduce((max, r) => {
      const n = Number(String(r.id || '').replace(/\D/g, ''));
      return Number.isFinite(n) && n > max ? n : max;
    }, rawContacts.length);
    const newId = String(maxIdExistente + 1);
    const hoy = new Date().toISOString().slice(0, 10);
    const sinNom = esCeldaSinNombre(nuevoNombre);
    const estadoInicial: EstadoFlujo = sinNom
      ? 'FALTA_NOMBRE_Y_APELLIDO'
      : '1ER_MSJ_ENVIADO_SIN_RSP';
    const nuevoRaw: RawContactRow = {
      id: newId,
      nombre: nuevoNombre.trim(),
      barrio: nuevoBarrio,
      telRaw: nuevoTel.trim(),
      rsp: 'Nuevo',
      adhirio: 'Pendiente',
      comentario:
        nuevoComentario.trim() ||
        (sinNom
          ? 'Teléfono sin nombre cargado — se envió consulta sutil de nombre y apellido'
          : 'Contacto nuevo — 1er mensaje enviado'),
      estadoFlujo: estadoInicial,
      estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoInicial),
      enSheets: false,
      fechaAgregado: hoy,
      ultimoContacto: hoy,
      intentos: 0,
    };

    const proc = procesarContacto(nuevoRaw, profile);
    const msgPrimerContacto = generarMensajeContextual(
      proc,
      profile,
      'primer_contacto'
    ).texto;

    setRawContacts((prev) => [
      { ...nuevoRaw, rsp: 'No', enSheets: true, intentos: 1 },
      ...prev,
    ]);
    setSelectedContactId(newId);
    setShowPrimerMensajeModal(false);
    setNuevoNombre('');
    setNuevoTel('');
    setNuevoComentario('');

    if (nuevoRaw.telRaw.trim()) {
      handleOpenWhatsApp(proc, msgPrimerContacto);
    }
  };

  const handleGuardarNombreRecibido = (contactId: string) => {
    const limpio = nombreCompletarInput.trim();
    if (!limpio) return;
    const analisis = analizarYCorregirNombreCompleto(limpio);
    updateContactField(contactId, {
      nombre: analisis.nombreCompletoOrdenado,
      rsp: 'Sí',
      estadoFlujo: 'RESPONDIO_FALTA_DNI_O_ZONA',
    });
    setNombreCompletarInput('');
    setWorkspaceStatusMsg(
      `¡Nombre actualizado a "${analisis.nombreCompletoOrdenado}" (Saludo: "Hola, ${analisis.vocativo}") y estado pasado a Respondió Sí!`
    );
  };

  const handleAgregarEventoCalendarLocal = () => {
    if (!newCalSummary.trim()) return;
    const hoyBA = obtenerPartesFechaHoraBA();
    const partes = (newCalFecha || hoyBA.ddmm).split('/');
    const dd = String(Number(partes[0] || hoyBA.day)).padStart(2, '0');
    const mm = String(Number(partes[1] || hoyBA.month)).padStart(2, '0');
    const fechaNorm = `${dd}/${mm}`;
    const fechaISO = `${hoyBA.year}-${mm}-${dd}`;
    const nuevoEv: CalendarEventItem = {
      id: `cal-${Date.now()}`,
      summary: newCalSummary.trim(),
      location: newCalLocation.trim() || 'CABA',
      fecha: fechaNorm,
      fechaISO,
      startTime: newCalStart,
      endTime: newCalEnd,
      startIso: `${fechaISO}T${newCalStart}:00-03:00`,
      endIso: `${fechaISO}T${newCalEnd}:00-03:00`,
      calendarName: 'Agregado en App',
      source: 'manual',
    };
    setCalendarEvents((prev) => deduplicarEventosCalendar([...prev, nuevoEv]));
    setAhoraCorteMs(Date.now());
    setNewCalSummary('');
    setNewCalLocation('');
  };

  const handleExportarCSV = () => {
    const csv = exportarContactosACSV(contacts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Estatus_POPURRI_actualizado_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportarTSVoCSV = () => {
    const nuevos = parsearTSVoCSVContactos(csvImportText, true);
    if (nuevos.length === 0) return;
    const keysControl = obtenerKeysControlEnviados(controlEnvios);
    const { contactosFusionados, nuevosParaPrimerContactoCount } =
      fusionarContactosDesdeSheetsConControl(nuevos, rawContacts, keysControl);
    setRawContacts(contactosFusionados);
    setCsvImportText('');
    setShowSheetsConfigBar(false);
    setLastSyncInfo(`Importados ${contactosFusionados.length} contactos desde texto de Sheets`);
    setWorkspaceStatusMsg(
      `Se actualizaron ${contactosFusionados.length} contactos (${nuevosParaPrimerContactoCount} marcados para 1er Contacto; barrios verificados según dirección en Columna G).`
    );
  };

  const handleAgregarNuevoBarrioHub = () => {
    if (!nuevoBarrioHubNombre.trim() || !nuevoBarrioHubCafe.trim()) return;
    const bName = nuevoBarrioHubNombre.trim();
    const baseCoords = COORDENADAS_BARRIOS_CABA[bName] || {
      lat: -34.5835,
      lng: -58.4238,
    };
    setProfile((p) => ({
      ...p,
      cafesPorBarrio: {
        ...p.cafesPorBarrio,
        [bName]: {
          barrio: bName,
          nombre: nuevoBarrioHubCafe.trim(),
          direccion: `${nuevoBarrioHubEsquina.trim() || bName}, CABA`,
          esquina: nuevoBarrioHubEsquina.trim() || `Centro de ${bName}`,
          lat: baseCoords.lat,
          lng: baseCoords.lng,
          horariosSugeridos:
            nuevoBarrioHubHorarios.trim() || 'Viernes de 15:00 a 18:00 hs',
        },
      },
    }));
    setNuevoBarrioHubNombre('');
    setNuevoBarrioHubCafe('');
    setNuevoBarrioHubEsquina('');
    setNuevoBarrioHubHorarios('');
  };

  const handleSelectCafeHubFromCatalog = (cafe: CafeHubCurado) => {
    const bName = cafe.barrio.replace('GBA (Fuera de CABA)', 'GBA');
    setProfile((p) => ({
      ...p,
      cafesPorBarrio: {
        ...p.cafesPorBarrio,
        [bName]: {
          barrio: bName,
          nombre: cafe.nombre,
          direccion: cafe.direccion,
          esquina: cafe.direccion.split(',')[0] || cafe.nombre,
          lat: cafe.lat,
          lng: cafe.lng,
          horariosSugeridos:
            p.cafesPorBarrio[bName]?.horariosSugeridos ||
            'Miércoles o Viernes de 15:00 a 18:00 hs',
          urlGoogleMaps: cafe.urlGoogleMaps,
        },
      },
    }));
    setWorkspaceStatusMsg(
      `☕ Se fijó "${cafe.nombre}" (${cafe.direccion.split(',')[0]}) de tu lista de Google Maps como Café HUB oficial de ${bName}.`
    );
  };


  // =========================================================================
  // ESTADO Y HANDLERS PARA LA NUEVA UI SERENA & PIPELINE DE CANDIDATOS
  // =========================================================================
  const [whatsAppStatus, setWhatsAppStatus] = useState<string>('DISCONNECTED');
  useEffect(() => {
    let cancelled = false;
    const checkWA = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (res.ok && !cancelled) {
          const d = await res.json();
          setWhatsAppStatus(d.status || 'DISCONNECTED');
        }
      } catch {
        // Silencioso en caso de desconexión
      }
    };
    void checkWA();
    const timer = setInterval(checkWA, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const defaultAutoConfig: AutoFirstMessageConfig = useMemo(() => ({
    horaInicio: '10:30',
    horaVentanaInicio: '09:30',
    horaVentanaFin: '19:00',
    nivelWarmup: 'DIA_2_MAX_15',
    minCupo: 10,
    maxCupo: 15,
    cupoSorteado: 12,
    minIntervaloSeg: 45,
    maxIntervaloSeg: 95,
    lotePausaCafeCada: 8,
    minPausaCafeMinutos: 8,
    maxPausaCafeMinutos: 15,
    pausaExtraCada10Seg: 600,
    incluirOptOutBaja: false,
    modoRompehieloCorto: true,
    soloNumerosArgentina: true,
    usarVariabilidadIAGemini: true,
    barrioFiltro: 'Todos',
    modoCola: 'PRIMER_CONTACTO',
  }), []);

  const autoCampaignForPanel = useMemo(() => {
    return generarColaEnvioAutomaticoPrimerContacto(contacts, defaultAutoConfig, profile);
  }, [contacts, defaultAutoConfig, profile]);

  const handleUpdateContact = async (contactId: string, updates: Partial<Contact>) => {
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch {
      // Ignorar errores de red si está offline
    }

    setRawContacts((prev) =>
      prev.map((c) =>
        String(c.id) === String(contactId) ? { ...c, ...(updates as any) } : c
      )
    );
  };

  const handleSendDirectWA = async (
    phone: string,
    message: string,
    contactId: string,
    nombre: string,
    barrio: string
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/whatsapp/send-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          message,
          contactId,
          nombre,
          barrio,
          tipoAccion: 'mensaje_directo_ui',
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        setRawContacts((prev) =>
          prev.map((c) =>
            String(c.id) === String(contactId)
              ? {
                  ...c,
                  primerContactoEnviado: true,
                  estadoFlujo: '1ER_MSJ_ENVIADO_SIN_RSP',
                  ultimoContacto: new Date().toISOString().slice(0, 10),
                }
              : c
          )
        );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* 1. Barra de Navegación Serena y Minimalista */}
      <ModernNavbar
        activeTab={
          activeTab === 'bandeja' || activeTab === 'pipeline'
            ? 'pipeline'
            : activeTab === 'corte' || activeTab === 'plan_hoy'
            ? 'plan_hoy'
            : activeTab === 'whatsapp'
            ? 'whatsapp'
            : 'configuracion'
        }
        onTabChange={(tab) => {
          if (tab === 'pipeline') setActiveTab('bandeja');
          else if (tab === 'plan_hoy') setActiveTab('corte');
          else if (tab === 'whatsapp') setActiveTab('whatsapp');
          else setActiveTab('acceso_y_config');
        }}
        totalContacts={contacts.length}
        signedCount={kpis.adheridos}
        whatsAppStatus={whatsAppStatus}
        isSyncingSheets={isSyncingSheets}
        onSyncSheets={handleActualizarDesdeSheets}
        onOpenAutoWAModal={() => setShowAutoFirstMessageModal(true)}
      />

      {/* 2. Contenido Principal Desacoplado por Etapas */}
      <main className="flex-1 pb-16">
        {(activeTab === 'bandeja' || activeTab === 'pipeline') && (
          <CandidatePipelineView
            contacts={contacts}
            voiceProfile={profile}
            whatsAppReady={whatsAppStatus === 'READY'}
            onUpdateContact={handleUpdateContact}
            onSendDirectWA={handleSendDirectWA}
            onOpenAutoWAModal={() => setShowAutoFirstMessageModal(true)}
          />
        )}

        {(activeTab === 'corte' || activeTab === 'plan_hoy') && (
          <PlanHoyModernView
            corteResultado={corteResultado}
            voiceProfile={profile}
            whatsAppReady={whatsAppStatus === 'READY'}
            onRefreshCorte={() => setAhoraCorteMs(Date.now())}
            onUpdateContact={handleUpdateContact}
            onSendDirectWA={handleSendDirectWA}
          />
        )}

        {activeTab === 'whatsapp' && (
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
            <WhatsAppWebAutomationPanel
              campaign={autoCampaignForPanel}
              config={defaultAutoConfig}
              appsScriptUrl={appsScriptUrlInput}
              onApplyItemResult={handleApplyAutoItemResult}
            />
          </div>
        )}

        {(activeTab === 'acceso_y_config' || activeTab === 'configuracion') && (
          <ModernSettingsView
            profile={profile}
            sheetUrlInput={sheetUrlInput}
            appsScriptUrlInput={appsScriptUrlInput}
            calendarIcalUrlInput={calendarIcalUrlInput}
            totalContacts={contacts.length}
            totalControlEnvios={controlEnvios.length}
            onUpdateProfile={(up) => setProfile(up)}
            onUpdateSheetUrl={(u) => setSheetUrlInput(u)}
            onUpdateAppsScriptUrl={(u) => setAppsScriptUrlInput(u)}
            onUpdateCalendarIcalUrl={(u) => setCalendarIcalUrlInput(u)}
            onExportCSV={() => exportarContactosACSV(contacts)}
          />
        )}

        {activeTab === 'mapa' && (
          <div className="mx-auto max-w-6xl px-4 py-6">
            <InteractiveMapPanel
              contacts={contacts}
              clusters={microClusters}
              profile={profile}
              calendarEvents={calendarEvents}
              onOpenWhatsApp={(c) => {
                setSelectedContactId(c.id);
                setActiveTab('pipeline');
              }}
              onSelectContactForEdit={(c) => {
                setSelectedContactId(c.id);
                setActiveTab('pipeline');
              }}
            />
          </div>
        )}
      </main>

      {/* 3. Modal de Automatización WhatsApp Web & Campañas */}
      <AutoFirstMessageModal
        isOpen={showAutoFirstMessageModal}
        onClose={() => setShowAutoFirstMessageModal(false)}
        contacts={contacts}
        voiceProfile={profile}
        barriosDisponibles={todosLosBarrios}
        sheetUrlOrId={sheetUrlInput}
        appsScriptUrl={appsScriptUrlInput}
        onApplyItemResult={handleApplyAutoItemResult}
        onApplyBatchResults={handleApplyAutoBatchResults}
        onCleanFalseErrors={handleCleanFalseAutoErrors}
        initialModoCola={modoColaBotActivo}
      />
    </div>
  );
}
