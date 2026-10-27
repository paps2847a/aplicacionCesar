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

type ActiveTab = 'bandeja' | 'corte' | 'mapa' | 'acceso_y_config';

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

const CODIGO_APPS_SCRIPT_PUENTE = `// Puente Nativo Google Sheets + Todos tus Calendars para Rutas POPURRÍ (Sin bloqueo Error 400)
// 1. En tu Google Sheet "Estatus_POPURRÍ", abrí Extensiones -> Apps Script
// 2. Pegá este código y tocá "Implementar" -> "Nueva implementación" -> "Aplicación web"
// 3. Ejecutar como: "Yo" | Quién tiene acceso: "Cualquier persona" -> Copiá la URL y pegala en la app.

function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const lastRow = Math.max(1, sheet.getLastRow());
  const lastCol = Math.max(1, sheet.getLastColumn());
  const rows = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const now = new Date(Date.now() - 24 * 3600 * 1000);
  const endWindow = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const calendars = CalendarApp.getAllCalendars();
  const calEvents = [];
  calendars.forEach(cal => {
    const calName = cal.getName() || 'Mi Calendar';
    if (calName.toLowerCase().indexOf('feriado') !== -1 || calName.toLowerCase().indexOf('holiday') !== -1) return;
    cal.getEvents(now, endWindow).forEach(ev => {
      calEvents.push({
        id: cal.getId() + '-' + ev.getId(),
        summary: ev.getTitle() || 'Compromiso',
        location: ev.getLocation() || 'CABA',
        fecha: Utilities.formatDate(ev.getStartTime(), 'America/Argentina/Buenos_Aires', 'dd/MM'),
        fechaISO: Utilities.formatDate(ev.getStartTime(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd'),
        startTime: Utilities.formatDate(ev.getStartTime(), 'America/Argentina/Buenos_Aires', 'HH:mm'),
        endTime: Utilities.formatDate(ev.getEndTime(), 'America/Argentina/Buenos_Aires', 'HH:mm'),
        startIso: ev.getStartTime().toISOString(),
        endIso: ev.getEndTime().toISOString(),
        calendarName: calName,
        source: 'apps_script'
      });
    });
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows, calendarEvents: calEvents }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (body.action === 'replaceAll' && Array.isArray(body.payload)) {
    sheet.clearContents();
    sheet.getRange(1, 1, body.payload.length, body.payload[0].length).setValues(body.payload);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: 'replaceAll' })).setMimeType(ContentService.MimeType.JSON);
  }
  if (body.action === 'updateRow' && body.payload) {
    const p = body.payload;
    const data = sheet.getDataRange().getValues();
    const idTarget = String(p.id || '').trim();
    const telTarget = String(p.telefonoNorm || '').replace(/\\D+/g, '').slice(-8);
    for (var i = 1; i < data.length; i++) {
      var rowId = String(data[i][0] || '').trim();
      var rowTel = String(data[i][4] || '').replace(/\\D+/g, '').slice(-8);
      if ((idTarget && rowId === idTarget) || (telTarget && rowTel && rowTel === telTarget)) {
        if (p.rsp !== undefined) sheet.getRange(i + 1, 6).setValue(p.rsp);
        if (p.adhirio !== undefined) sheet.getRange(i + 1, 7).setValue(p.adhirio);
        if (p.comentarioNota) {
          var prevCom = String(data[i][7] || '').replace(/\\[Intento auto fallido[^\\]]*\\]/gi, '').trim();
          var nextCom = prevCom.indexOf(p.comentarioNota) >= 0 ? prevCom : (prevCom ? prevCom + ' · ' + p.comentarioNota : p.comentarioNota);
          sheet.getRange(i + 1, 8).setValue(nextCom);
        }
        if (p.estado) sheet.getRange(i + 1, 9).setValue(p.estado);
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, action: 'updateRow' })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}`;

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

  return (
    <div className="min-h-screen bg-[#F7F6F0] text-[#262626] flex flex-col overflow-x-hidden pb-28 md:pb-8">
      {/* Cabecera Oficial con Identidad Gráfica POPURRÍ + Flujo en 4 Pasos + Enfoque Diario */}
      <header className="bg-[#262626] text-white border-b-2 border-[#22ABFF] sticky top-0 z-30 shadow-md">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex flex-col md:flex-row md:flex-wrap md:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#F7F6F0] border-2 border-[#FBF165] p-1 flex items-center justify-center shrink-0 shadow-sm">
                <img
                  src="/assets/aistudio/logo-color-solo_40b14ef6.webp"
                  alt="Logo Hacemos Popurrí"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-sm sm:text-lg font-black tracking-tight text-white truncate">
                    Rutas <span className="bg-[#22ABFF] text-white px-1.5 py-0.5">POPURRÍ</span>
                  </h1>
                  <span className="text-[10px] sm:text-xs font-extrabold bg-[#FBF165] text-[#262626] px-1.5 py-0.5 shrink-0">
                    {profile.partidoLegal} · CABA
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-300 leading-snug mt-0.5">
                  <span className="sm:hidden">
                    Sheets activo · {kpis.pendientesActivos} pendientes · {kpis.adheridos} firmadas
                  </span>
                  <span className="hidden sm:inline">{lastSyncInfo}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Navegación por el Flujo de 4 Pasos Simplificado (Escritorio / Tablet) */}
          <nav
            aria-label="Flujo operativo principal"
            className="hidden md:flex flex-wrap items-center gap-1 bg-[#1b1b1b] p-1 rounded-xl border border-slate-700"
          >
            <button
              id="btn-toggle-daily-tasks-panel"
              type="button"
              onClick={() => setShowDailyTasksPanel((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors flex items-center gap-1.5 ${
                showDailyTasksPanel
                  ? 'bg-[#22ABFF] text-white shadow-sm'
                  : 'text-[#22ABFF] hover:bg-slate-800'
              }`}
              title="Mostrar u ocultar el Panel de Tareas Diarias y Cierre Google Forms"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Enfoque Diario + Forms
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bandeja')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'bandeja'
                  ? 'bg-[#F7F6F0] text-[#262626]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              1. Contacto y Respuestas ({kpis.pendientesActivos})
            </button>
            <button
              id="btn-hacer-corte"
              type="button"
              onClick={() => setActiveTab('corte')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'corte'
                  ? 'bg-[#FBF165] text-[#262626] font-extrabold'
                  : 'text-[#FBF165] hover:text-amber-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              2. Hacer Corte y Plan Hoy ({corteResultado.colaMensajes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mapa')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'mapa'
                  ? 'bg-[#F7F6F0] text-[#262626]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              3. Hoja de Ruta en Terreno ({corteResultado.agendaSugeridaDias[0]?.contactosIncluidos.length || 0} paradas)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('acceso_y_config')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'acceso_y_config'
                  ? 'bg-[#F7F6F0] text-[#262626]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              4. Instalar App / Error 400 / Perfil
            </button>
          </nav>

          {/* Botones de Acción Directa: Adaptados en grilla 2x2 para móvil y fila en escritorio */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 w-full md:w-auto">
            <button
              id="btn-actualizar-sheets"
              type="button"
              onClick={handleActualizarDesdeSheets}
              disabled={isSyncingSheets}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 flex items-center justify-center gap-1.5 truncate disabled:opacity-50"
              title="Carga automáticamente los datos actualizados desde tu documento de Google Sheets"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#22ABFF] shrink-0 ${
                  isSyncingSheets ? 'animate-spin' : ''
                }`}
              />
              <span className="truncate">
                {isSyncingSheets ? 'Actualizando...' : 'Actualizar Sheets'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowSheetsConfigBar((v) => !v)}
              className="px-2.5 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center gap-1 truncate"
              title="Configurar enlace de Google Sheets o sincronizar cambios de vuelta al documento"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Vincular / Guardar</span>
            </button>

            <button
              id="btn-enviar-primer-mensaje"
              type="button"
              onClick={() => setShowPrimerMensajeModal(true)}
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-extrabold bg-[#FBF165] hover:bg-amber-300 text-[#262626] flex items-center justify-center gap-1.5 shadow-sm transition-colors truncate"
            >
              <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">+ 1er Mensaje</span>
            </button>

            <button
              id="btn-open-auto-python-modal"
              type="button"
              onClick={() => {
                setModoColaBotActivo('PRIMER_CONTACTO');
                setShowAutoFirstMessageModal(true);
              }}
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-extrabold bg-[#22ABFF] hover:bg-sky-400 text-white flex items-center justify-center gap-1.5 transition-colors shadow-sm truncate"
              title="Bot de Automatización Multi-Etapa: 1eros mensajes (<45), recordatorios de la mañana, seguimientos 24h/48h y agradecimientos"
            >
              <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Bot Auto WA (&lt;45)</span>
            </button>
          </div>
        </div>

        {/* Barra Desplegable de Vinculación Automática con Google Sheets (Sin duplicar paneles) */}
        {showSheetsConfigBar && (
          <div className="bg-slate-900 border-t border-slate-800 px-4 sm:px-6 py-4">
            <div className="max-w-[1440px] mx-auto space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-emerald-300">
                  Conexión Bidireccional con tu Documento de Google Sheets (Sin bloqueo Error 400 de Protección Avanzada)
                </p>
                <button
                  type="button"
                  onClick={() => setShowSheetsConfigBar(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cerrar ×
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-5">
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    1. Link o ID de tu Google Sheets (compartido como &quot;Cualquier persona con el enlace&quot;)
                  </label>
                  <input
                    type="text"
                    value={sheetUrlInput}
                    onChange={(e) => setSheetUrlInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1abc.../edit#gid=0"
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    2. (Opcional) URL Puente Apps Script para Guardar en 1 Clic + Leer Calendar
                  </label>
                  <input
                    type="text"
                    value={appsScriptUrlInput}
                    onChange={(e) => setAppsScriptUrlInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
                <div className="md:col-span-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleActualizarDesdeSheets}
                    className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg"
                  >
                    Cargar Ahora
                  </button>
                  <button
                    id="btn-guardar-sheets"
                    type="button"
                    onClick={handleGuardarCambiosEnSheets}
                    className="flex-1 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-lg"
                  >
                    Guardar a Sheets
                  </button>
                </div>
              </div>

              {/* Opción rápida de pegar celdas directas, subir archivo CSV/TSV o exportar CSV */}
              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                  <input
                    type="text"
                    value={csvImportText}
                    onChange={(e) => setCsvImportText(e.target.value)}
                    placeholder="O pegá acá las filas copiadas de Google Sheets (Ctrl+V) y tocá Importar..."
                    className="flex-1 px-3 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={handleImportarTSVoCSV}
                    disabled={!csvImportText.trim()}
                    className="px-3 py-1 text-xs font-semibold bg-slate-800 text-white rounded hover:bg-slate-700 disabled:opacity-40"
                  >
                    Importar Filas
                  </button>
                  <label className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded cursor-pointer whitespace-nowrap">
                    Subir .CSV / .TSV
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const text = await file.text();
                        const nuevos = parsearTSVoCSVContactos(text, true);
                        if (nuevos.length > 0) {
                          const keysControl = obtenerKeysControlEnviados(controlEnvios);
                          const { contactosFusionados, nuevosParaPrimerContactoCount } =
                            fusionarContactosDesdeSheetsConControl(
                              nuevos,
                              rawContacts,
                              keysControl
                            );
                          setRawContacts(contactosFusionados);
                          setShowSheetsConfigBar(false);
                          const nowStr = new Date().toLocaleTimeString('es-AR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                          setLastSyncInfo(
                            `Cargado desde archivo "${file.name}" (${contactosFusionados.length} contactos · ${nowStr})`
                          );
                          setWorkspaceStatusMsg(
                            `¡Archivo "${file.name}" cargado con éxito! ${contactosFusionados.length} contactos (${nuevosParaPrimerContactoCount} marcados para 1er Contacto desde #${UMBRAL_ID_SIN_PRIMER_CONTACTO}/nuevos; barrios auto-corregidos según Col. G).`
                          );
                        } else {
                          setWorkspaceStatusMsg(
                            `No se detectaron filas válidas en "${file.name}". Asegurate de exportar desde Google Sheets como .csv o .tsv.`
                          );
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportarCSV}
                    className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 rounded flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descargar CSV para Sheets
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSheetsConfigBar(false);
                      setActiveTab('acceso_y_config');
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-amber-300 hover:underline"
                  >
                    ¿Cómo evitar Error 400 OAuth? Ver guía →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {workspaceStatusMsg && (
          <div className="bg-emerald-950/90 border-t border-emerald-800 px-4 sm:px-6 py-2">
            <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4 text-xs text-emerald-200">
              <span>{workspaceStatusMsg}</span>
              <button
                type="button"
                onClick={() => setWorkspaceStatusMsg('')}
                className="text-emerald-300 hover:text-white font-bold"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Cinta de Flujo de Trabajo y KPIs Operativos Clickeables (Visible en móvil y escritorio en todas las pestañas principales) */}
      <section
        aria-label="Resumen de estado e indicadores"
        className={`bg-white border-b border-slate-200 ${
          activeTab === 'bandeja' && mobileBandejaView === 'detail'
            ? 'hidden sm:block'
            : 'block'
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-2.5 sm:px-6 py-2 sm:py-3 grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 sm:gap-3">
          <button
            id="kpi-sin-primer-contacto"
            type="button"
            onClick={() => {
              setActiveTab('bandeja');
              setMobileBandejaView('list');
              setSituacionFiltro(
                situacionFiltro === 'NUEVOS_1ER_MENSAJE' ? 'TODOS' : 'NUEVOS_1ER_MENSAJE'
              );
            }}
            className={`text-left p-1.5 sm:p-2.5 rounded-lg border transition-colors min-w-0 ${
              situacionFiltro === 'NUEVOS_1ER_MENSAJE' && activeTab === 'bandeja'
                ? 'border-amber-600 bg-amber-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="text-[10px] sm:text-[11px] font-semibold text-amber-900 uppercase leading-tight truncate">
              Sin 1er Msj
            </p>
            <p className="text-base sm:text-xl font-bold font-mono tabular-nums text-amber-900 mt-0.5">
              {kpis.nuevosSinMensaje}
            </p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate hidden sm:block">
              Nuevos ingresos Sheets (#167+)
            </p>
          </button>

          <button
            id="kpi-pendientes-col-f"
            type="button"
            onClick={() => {
              setActiveTab('bandeja');
              setMobileBandejaView('list');
              setSituacionFiltro(
                situacionFiltro === 'PENDIENTES_ADHESION' ? 'TODOS' : 'PENDIENTES_ADHESION'
              );
            }}
            className={`text-left p-1.5 sm:p-2.5 rounded-lg border transition-colors min-w-0 ${
              situacionFiltro === 'PENDIENTES_ADHESION' && activeTab === 'bandeja'
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="text-[10px] sm:text-[11px] font-semibold text-amber-800 uppercase leading-tight truncate">
              Pendientes
            </p>
            <p className="text-base sm:text-xl font-bold font-mono tabular-nums text-amber-900 mt-0.5">
              {kpis.pendientesActivos}
            </p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate hidden sm:block">
              Col. F ≠ Sí ({kpis.archivadosSinDniCabaCount} Sin DNI archiv.)
            </p>
          </button>

          <button
            id="kpi-rsp-si-sin-info"
            type="button"
            onClick={() => {
              setActiveTab('bandeja');
              setMobileBandejaView('list');
              setSituacionFiltro(
                situacionFiltro === 'CAMBIO_CHIP' ? 'TODOS' : 'CAMBIO_CHIP'
              );
            }}
            className={`text-left p-1.5 sm:p-2.5 rounded-lg border transition-colors min-w-0 ${
              situacionFiltro === 'CAMBIO_CHIP' && activeTab === 'bandeja'
                ? 'border-amber-600 bg-amber-50/50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="text-[10px] sm:text-[11px] font-semibold text-amber-700 uppercase leading-tight truncate">
              RSP: Sí
            </p>
            <p className="text-base sm:text-xl font-bold font-mono tabular-nums text-amber-800 mt-0.5">
              {kpis.cambioChip}
            </p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate hidden sm:block">
              Col. E=Sí, sin Col. G ni confirm.
            </p>
          </button>

          <button
            id="kpi-sin-rsp-48h"
            type="button"
            onClick={() => {
              setActiveTab('bandeja');
              setMobileBandejaView('list');
              setSituacionFiltro(
                situacionFiltro === 'SIN_RESPUESTA_48H' ? 'TODOS' : 'SIN_RESPUESTA_48H'
              );
            }}
            className={`text-left p-1.5 sm:p-2.5 rounded-lg border transition-colors min-w-0 ${
              situacionFiltro === 'SIN_RESPUESTA_48H' && activeTab === 'bandeja'
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="text-[10px] sm:text-[11px] font-semibold text-slate-600 uppercase leading-tight truncate">
              Sin Rsp +48h
            </p>
            <p className="text-base sm:text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {kpis.sinRespuesta}
            </p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate hidden sm:block">
              {kpis.sinRespuestaPuraCount} sin rsp + {kpis.datoInsuficienteColGCount} dato insuf. Col. G
            </p>
          </button>

          <button
            id="kpi-visitas-retiros"
            type="button"
            onClick={() => {
              setActiveTab('bandeja');
              setMobileBandejaView('list');
              setSituacionFiltro(
                situacionFiltro === 'VISITAS_Y_RETIROS' ? 'TODOS' : 'VISITAS_Y_RETIROS'
              );
            }}
            className={`text-left p-1.5 sm:p-2.5 rounded-lg border transition-colors min-w-0 ${
              situacionFiltro === 'VISITAS_Y_RETIROS' && activeTab === 'bandeja'
                ? 'border-sky-600 bg-sky-50/40'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="text-[10px] sm:text-[11px] font-semibold text-sky-800 uppercase leading-tight truncate">
              Visitas / X2
            </p>
            <p className="text-base sm:text-xl font-bold font-mono tabular-nums text-sky-900 mt-0.5">
              {kpis.visitasYRetiros}
            </p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate hidden sm:block">
              {kpis.visitasConcretadasCount} visitas + {kpis.retirosFichasCount} retiros X1/X2
            </p>
          </button>

          <button
            id="kpi-firmadas-col-f"
            type="button"
            onClick={() => {
              setActiveTab('bandeja');
              setMobileBandejaView('list');
              setSituacionFiltro(
                situacionFiltro === 'YA_ADHIRIERON' ? 'TODOS' : 'YA_ADHIRIERON'
              );
            }}
            className={`text-left p-1.5 sm:p-2.5 rounded-lg border transition-colors min-w-0 ${
              situacionFiltro === 'YA_ADHIRIERON' && activeTab === 'bandeja'
                ? 'border-emerald-600 bg-emerald-50/50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="text-[10px] sm:text-[11px] font-semibold text-emerald-700 uppercase leading-tight truncate">
              Firmadas
            </p>
            <p className="text-base sm:text-xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              {kpis.adheridos}
            </p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate hidden sm:block">
              Col. F=Sí · Excluidos mapa y msj
            </p>
          </button>
        </div>
      </section>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-2.5 sm:px-6 py-3 sm:py-6 min-w-0 space-y-4">
        {/* PANEL DE ENFOQUE DIARIO POPURRÍ (7 Etapas + Seguimientos 24h/48h/Baja + Carga 1-Clic + Cierre Google Forms y Apps) */}
        {showDailyTasksPanel && (
          <DailyTasksAndFormsPanel
            contacts={contacts}
            corte={corteResultado}
            controlEnvios={controlEnvios}
            profile={profile}
            ahoraMs={ahoraCorteMs}
            onSendWhatsApp={(contact, texto, plantilla) =>
              handleOpenWhatsApp(contact, texto, plantilla as TipoPlantillaWA, false)
            }
            onQuickUpdateContact={(contactId, patch, notaFeedback) => {
              updateContactField(
                contactId,
                {
                  comentario: patch.comentario,
                  rsp: patch.rsp,
                  adhirio: patch.adhirio,
                  estadoFlujo: patch.estadoFlujo,
                  barrio: patch.barrio,
                },
                true
              );
              if (notaFeedback) {
                setWorkspaceStatusMsg(`✓ ${notaFeedback}`);
              }
            }}
            onOpenBotWithMode={(modoCola) => {
              setModoColaBotActivo(modoCola);
              setShowAutoFirstMessageModal(true);
            }}
            onNavigateToStep={(step) => {
              if (step === '1_padron') setActiveTab('bandeja');
              else if (step === '2_corte') setActiveTab('corte');
              else if (step === '3_mapa_ruta') setActiveTab('mapa');
            }}
          />
        )}

        {/* PASO 1: BANDEJA DE CONTACTO, CARGA DE RESPUESTA Y SEGUIMIENTO */}
        {activeTab === 'bandeja' && (
          <div className="space-y-3 sm:space-y-4 min-w-0">
            {/* Panel de Control de 1er Contacto (#167+ y Nuevos) y Automatización Excel / Google Sheets */}
            <div
              className={`bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-2.5 sm:space-y-3 ${
                mobileBandejaView === 'detail' ? 'hidden lg:block' : 'block'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-slate-900 text-white text-[11px] sm:text-xs font-bold shrink-0">
                    Paso 1 de 3
                  </span>
                  <div className="text-xs text-slate-700 space-y-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 sm:hidden">
                      <span className="font-bold text-slate-900 text-[11px] leading-snug">
                        1er Contacto ({kpis.nuevosSinMensaje} pend.) · Col. G ({kpis.conDireccionEnColG} en Mapa)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowMobileRulesInfo((v) => !v)}
                        className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded inline-flex items-center gap-0.5 shrink-0"
                      >
                        <span>{showMobileRulesInfo ? 'Ocultar' : 'Reglas'}</span>
                        {showMobileRulesInfo ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div className={`${showMobileRulesInfo ? 'block' : 'hidden'} sm:block space-y-0.5`}>
                      <p>
                        <strong>¿Cómo determina la app el 1er Contacto?</strong> Del <strong>#1 al #166</strong> figuran con 1er contacto histórico enviado; <strong>desde el #167 en adelante y toda persona nueva que se agregue al Google Sheets</strong> ingresa automáticamente como{' '}
                        <span className="font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded">
                          Sin 1er Contacto ({kpis.nuevosSinMensaje} pendientes)
                        </span>
                        . Al hacer clic en <strong>Enviar WA</strong>, su estado cambia automáticamente a{' '}
                        <code className="bg-slate-100 px-1 rounded">1er Msj Enviado</code> y se actualiza en el Control de Excel / Sheets.
                      </p>
                      <p className="text-slate-500">
                        <strong>Regla Geoespacial Columna G (&quot;Comentario&quot;):</strong> Sólo las personas con dirección o punto de encuentro en la Columna G ({kpis.conDireccionEnColG}) aparecen en el Mapa y Circuitos. Si la dirección en Columna G corresponde a otro barrio, el barrio se corrige automáticamente ({kpis.barriosAutocorregidos} auto-corregidos).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAutoFirstMessageModal(true)}
                    className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm truncate"
                  >
                    <Bot className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Auto Python (&lt;45)</span>
                  </button>

                  <button
                    id="btn-copiar-tabla-excel"
                    type="button"
                    onClick={handleCopiarTablaParaExcel}
                    className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 truncate"
                    title="Copia todas las filas con Estado y Barrio auto-corregido para pegar con Ctrl+V en tu Excel o Google Sheets"
                  >
                    {copiedExcelTable ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">¡Copiado Excel!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span className="truncate">Copiar Excel</span>
                      </>
                    )}
                  </button>

                  <button
                    id="btn-toggle-control-envios"
                    type="button"
                    onClick={() => setShowControlPanel((v) => !v)}
                    className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 truncate"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">Control ({controlEnvios.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('corte')}
                    className="px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 truncate"
                  >
                    <span className="truncate">Paso 2: Corte</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>
              </div>

              {showControlPanel && (
                <div className="pt-3 border-t border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-bold text-slate-900">
                        Bitácora de Control de 1er Contacto y Ediciones Sincronizadas ({controlEnvios.length})
                      </span>
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoSyncSheetsOnAction}
                          onChange={(e) => setAutoSyncSheetsOnAction(e.target.checked)}
                          className="rounded border-slate-300 text-slate-900"
                        />
                        Auto-sincronizar con Google Sheets al enviar / editar
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExportarCSV}
                        className="px-2.5 py-1 text-xs font-semibold bg-slate-900 text-white rounded hover:bg-slate-800 flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        Descargar Excel (.CSV)
                      </button>
                      <button
                        type="button"
                        onClick={handleGuardarCambiosEnSheets}
                        className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-slate-500"
                      >
                        Sincronizar Todo a Sheets Ahora
                      </button>
                    </div>
                  </div>

                  {controlEnvios.length === 0 ? (
                    <p className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      Aún no se registraron envíos o ediciones en esta sesión. Hacé clic en <strong>Enviar WA</strong> o editá cualquier contacto para ver cómo se actualiza automáticamente su estado acá y en la tabla de Excel / Sheets.
                    </p>
                  ) : (
                    <div className="max-h-40 overflow-x-auto overflow-y-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="py-1.5 px-2.5">Hora</th>
                            <th className="py-1.5 px-2.5">#</th>
                            <th className="py-1.5 px-2.5">Contacto</th>
                            <th className="py-1.5 px-2.5">Acción</th>
                            <th className="py-1.5 px-2.5">Transición Automática de Estado</th>
                            <th className="py-1.5 px-2.5">Barrio</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {controlEnvios.slice(0, 15).map((reg, idxReg) => (
                            <tr key={`reg-${reg.idRegistro}-${idxReg}`}>
                              <td className="py-1.5 px-2.5 font-mono text-slate-500">{reg.fechaHora}</td>
                              <td className="py-1.5 px-2.5 font-mono font-bold text-slate-700">#{reg.contactId}</td>
                              <td className="py-1.5 px-2.5 font-semibold text-slate-900">{reg.nombre}</td>
                              <td className="py-1.5 px-2.5 text-emerald-800 font-medium">{reg.tipoMensaje}</td>
                              <td className="py-1.5 px-2.5">
                                <span className="text-slate-500">{reg.estadoAnterior}</span>
                                {' → '}
                                <span className="font-bold text-slate-900">{reg.estadoNuevoEtiqueta}</span>
                              </td>
                              <td className="py-1.5 px-2.5 text-slate-700">{reg.barrio}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selector Rápido en Celular / Tablet: Alternar entre Lista del Padrón y Ficha + Mensaje del Contacto Seleccionado */}
            <div className="lg:hidden bg-slate-900 text-white p-1.5 rounded-xl grid grid-cols-2 gap-1.5 shadow-sm">
              <button
                type="button"
                onClick={() => setMobileBandejaView('list')}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  mobileBandejaView === 'list'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  Padrón ({filteredContacts.length})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMobileBandejaView('detail')}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  mobileBandejaView === 'detail'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-amber-300 hover:text-amber-200'
                }`}
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {selectedContact
                    ? `Ficha #${selectedContact.id} (${
                        selectedContact.primerNombre || 'Sin nombre'
                      })`
                    : 'Editar Ficha / WA'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start min-w-0">
              {/* Columna Izquierda (7 cols): Tabla en Escritorio + Tarjetas Táctiles en Móvil */}
              <div
                className={`lg:col-span-7 min-w-0 bg-white border border-slate-200 rounded-xl overflow-hidden ${
                  mobileBandejaView === 'detail' ? 'hidden lg:block' : 'block'
                }`}
              >
                <div className="p-3 sm:p-4 border-b border-slate-200 space-y-2.5 sm:space-y-3">
                  {bandejaGrupoIdsFiltro && (
                    <div className="p-2.5 rounded-lg bg-amber-100 border border-amber-400 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-bold text-slate-900">
                        📌 Viendo grupo confirmado de Agenda: <span className="text-amber-950">{bandejaGrupoTitulo}</span> ({filteredContacts.length} vecinos)
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab('corte')}
                          className="px-2.5 py-1 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                        >
                          Volver a Agenda
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBandejaGrupoIdsFiltro(null);
                            setBandejaGrupoTitulo('');
                          }}
                          className="px-2.5 py-1 rounded bg-white border border-amber-400 text-slate-800 text-xs font-semibold hover:bg-amber-50"
                        >
                          Quitar filtro de grupo
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                    <div className="relative sm:col-span-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar nombre, calle, tel..."
                        className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>

                    <div>
                      <select
                        aria-label="Filtrar por barrio"
                        value={barrioFiltro}
                        onChange={(e) => setBarrioFiltro(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
                      >
                        <option value="Todos">Todos los barrios ({contacts.length})</option>
                        {todosLosBarrios.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <select
                        aria-label="Filtrar por estado de seguimiento"
                        value={situacionFiltro}
                        onChange={(e) =>
                          setSituacionFiltro(e.target.value as FiltroSituacion)
                        }
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
                      >
                        <option value="TODOS">
                          Activos visibles ({contacts.length - kpis.archivadosSinDniCabaCount})
                        </option>
                        <option value="ALERTAS_VENCIDOS">
                          ⚠️ Alertas Vencidas / Sin Confirmar ({kpis.alertasVencidosCount})
                        </option>
                        <option value="CON_PUNTO_O_DIRECCION">
                          📍 Con Punto o Dirección para Agenda ({kpis.conPuntoEncuentro})
                        </option>
                        <option value="PENDIENTES_ADHESION">
                          Sólo Pendientes de Adhesión ({kpis.pendientesActivos})
                        </option>
                        <option value="SIN_NOMBRE_SHEETS">
                          Teléfonos sin nombre en Sheets ({kpis.sinNombreCount})
                        </option>
                        <option value="CAMBIO_CHIP">
                          RSP: Sí sin info en Col. G ni confirm. ({kpis.cambioChip})
                        </option>
                        <option value="SIN_RESPUESTA_48H">
                          Sin respuesta +48h ({kpis.sinRespuesta})
                        </option>
                        <option value="VISITAS_Y_RETIROS">
                          Visitas concretadas y Retiros ({kpis.visitasYRetiros})
                        </option>
                        <option value="NUEVOS_1ER_MENSAJE">
                          Nuevos sin 1er mensaje ({kpis.nuevosSinMensaje})
                        </option>
                        <option value="YA_ADHIRIERON">
                          ✅ Proceso terminado · Ya adhirieron ({kpis.adheridos})
                        </option>
                        <option value="ARCHIVADOS_SIN_DNI_CABA">
                          🗄️ Archivados Sin DNI CABA / Ya respondidos ({kpis.archivadosSinDniCabaCount})
                        </option>
                      </select>
                    </div>
                  </div>

                  {/* Filtro directo por la Casilla "Estado" vinculada a la Columna H de Google Sheets */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs font-semibold text-slate-600 shrink-0">
                        Col. &quot;Estado&quot;:
                      </span>
                      <select
                        aria-label="Filtrar por casilla de Estado de Google Sheets"
                        value={estadoFlujoFiltro}
                        onChange={(e) =>
                          setEstadoFlujoFiltro(e.target.value as 'TODOS' | EstadoFlujo)
                        }
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 text-slate-900 font-medium"
                      >
                        <option value="TODOS">
                          Todos los estados de la columna Estado ({contacts.length})
                        </option>
                        {ESTADOS_FLUJO_CATALOGO.map((est) => (
                          <option key={est.value} value={est.value}>
                            {est.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {kpis.archivadosSinDniCabaCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSituacionFiltro(
                              situacionFiltro === 'ARCHIVADOS_SIN_DNI_CABA'
                                ? 'TODOS'
                                : 'ARCHIVADOS_SIN_DNI_CABA'
                            )
                          }
                          className={`px-2.5 py-1.5 rounded-md text-xs font-bold border transition-colors text-center ${
                            situacionFiltro === 'ARCHIVADOS_SIN_DNI_CABA'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          {situacionFiltro === 'ARCHIVADOS_SIN_DNI_CABA'
                            ? `Viendo ${kpis.archivadosSinDniCabaCount} Sin DNI CABA archivados (Ocultar)`
                            : `${kpis.archivadosSinDniCabaCount} Sin DNI CABA ya respondidos (ocultos)`}
                        </button>
                      )}
                      {kpis.sinNombreCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSituacionFiltro(
                              situacionFiltro === 'SIN_NOMBRE_SHEETS'
                                ? 'TODOS'
                                : 'SIN_NOMBRE_SHEETS'
                            );
                          }}
                          className={`px-2.5 py-1.5 rounded-md text-xs font-bold border transition-colors text-center ${
                            situacionFiltro === 'SIN_NOMBRE_SHEETS'
                              ? 'bg-amber-400 text-slate-950 border-amber-500'
                              : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                          }`}
                        >
                          {kpis.sinNombreCount} Teléfono(s) sin nombre (Pregunta sutil activa)
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* VISTA MÓVIL (< md): Tarjetas Táctiles Adaptadas a Teléfono (Sin scroll horizontal) */}
                <div className="md:hidden divide-y divide-slate-200 max-h-[68vh] overflow-y-auto">
                  {filteredContacts.map((c, idxMob) => {
                    const isSelected = c.id === selectedContact?.id;
                    const esTerminadoAdherido = c.procesoCompletadoSinMensajes;
                    const esSinDniActivoParaCerrar =
                      c.situacion === 'DESCARTADO_NO_CABA' && !c.esCerradoOArchivadoSinDniCaba;
                    return (
                      <div
                        key={`mob-${c.id}-${idxMob}`}
                        className={`p-3 space-y-2.5 transition-colors ${
                          esTerminadoAdherido
                            ? 'bg-emerald-50/90 border-l-4 border-l-emerald-500'
                            : c.esCerradoOArchivadoSinDniCaba
                            ? 'bg-slate-100/80 border-l-4 border-l-slate-400'
                            : isSelected
                            ? 'bg-amber-50/70'
                            : 'bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs font-bold text-slate-500">
                                #{c.id}
                              </span>
                              <span className="font-bold text-sm text-slate-900">
                                {c.nombreCompletoCorregido}
                              </span>
                              {esTerminadoAdherido ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white">
                                  ✅ PROCESO TERMINADO · YA ADHIRIÓ
                                </span>
                              ) : c.esCerradoOArchivadoSinDniCaba ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-300">
                                  🗄️ Archivado (Sin DNI CABA · Ya respondido)
                                </span>
                              ) : c.sinNombre ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300">
                                  Sin nombre
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                  Hola, {c.primerNombre}
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span>
                                {c.barrio}
                                {c.calleOCruce ? ` · ${c.calleOCruce}` : ''}
                              </span>
                              {c.barrioCorregidoPorDireccion && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900">
                                  Barrio corregido (era {c.barrioOriginalSheet})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                              {c.telRaw || 'Sin teléfono'}
                              {c.email ? ` · ${c.email}` : ''}
                            </div>
                            {(c.comentario || c.motivoEstrategico) && (
                              <p className="text-xs text-slate-600 line-clamp-2 mt-1">
                                {c.comentario || c.motivoEstrategico}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Controles rápidos de Estado en Sheets, RSP y Adhirió en Móvil */}
                        <div className="space-y-1.5 pt-1">
                          <select
                            aria-label={`Estado en Google Sheets de ${c.nombreCompletoCorregido}`}
                            value={c.estadoFlujo}
                            onChange={(e) => {
                              const nextEstado = e.target.value as EstadoFlujo;
                              const patch: Partial<RawContactRow> = {
                                estadoFlujo: nextEstado,
                              };
                              if (nextEstado === 'YA_ADHIRIO_FIRMA_OK') {
                                patch.adhirio = 'Sí';
                                patch.rsp = 'Sí';
                              } else if (nextEstado === 'DESCARTADO_O_BAJA') {
                                patch.adhirio = 'No';
                                patch.referidosCabaYaEnviado = true;
                              } else if (
                                nextEstado === 'PASO_DATOS_FALTA_CONFIRMAR' ||
                                nextEstado === 'ENCUENTRO_CONFIRMADO' ||
                                nextEstado === 'RECORDATORIO_DIA_ENVIADO' ||
                                nextEstado === 'RESPONDIO_FALTA_DNI_O_ZONA'
                              ) {
                                patch.rsp = 'Sí';
                              }
                              updateContactField(c.id, patch, true);
                            }}
                            className={`w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border ${
                              c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
                              c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
                                ? 'bg-emerald-100 border-emerald-400 text-emerald-950'
                                : c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
                                  c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO'
                                ? 'bg-sky-50 border-sky-300 text-sky-950'
                                : c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
                                  c.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
                                ? 'bg-amber-50 border-amber-300 text-amber-950'
                                : 'bg-white border-slate-300 text-slate-800'
                            }`}
                          >
                            {ESTADOS_FLUJO_CATALOGO.map((est) => (
                              <option key={est.value} value={est.value}>
                                {est.shortLabel}
                              </option>
                            ))}
                          </select>

                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              aria-label={`Respuesta de ${c.nombreCompletoCorregido}`}
                              value={c.rsp}
                              onChange={(e) =>
                                updateContactField(
                                  c.id,
                                  {
                                    rsp: e.target.value as RawContactRow['rsp'],
                                  },
                                  true
                                )
                              }
                              className={`w-full text-xs font-semibold px-2 py-1 rounded-lg border ${
                                c.rsp === 'Sí'
                                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                                  : 'bg-white border-slate-300 text-slate-700'
                              }`}
                            >
                              <option value="Sí">RSP: Sí</option>
                              <option value="No">RSP: No</option>
                              <option value="Nuevo">RSP: Nuevo</option>
                            </select>

                            <select
                              aria-label={`Adhesión de ${c.nombreCompletoCorregido}`}
                              value={c.adhirio}
                              onChange={(e) =>
                                updateContactField(
                                  c.id,
                                  {
                                    adhirio: e.target.value as RawContactRow['adhirio'],
                                    estadoFlujo:
                                      e.target.value === 'Sí'
                                        ? 'YA_ADHIRIO_FIRMA_OK'
                                        : e.target.value === 'No'
                                        ? 'DESCARTADO_O_BAJA'
                                        : undefined,
                                  },
                                  true
                                )
                              }
                              className={`w-full text-xs font-semibold px-2 py-1 rounded-lg border ${
                                c.adhirio === 'Sí'
                                  ? 'bg-emerald-100 border-emerald-400 text-emerald-950'
                                  : c.adhirio === 'No'
                                  ? 'bg-red-50 border-red-200 text-red-800'
                                  : 'bg-white border-slate-300 text-slate-700'
                              }`}
                            >
                              <option value="Pendiente">Pendiente</option>
                              <option value="Sí">Adhirió: Sí</option>
                              <option value="No">No CABA/Baja</option>
                            </select>
                          </div>
                        </div>

                        {/* Botones Táctiles Principales en Móvil */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedContactId(c.id);
                              setSelectedTemplate('auto');
                              setMobileBandejaView('detail');
                            }}
                            className="py-2 px-3 rounded-lg text-xs font-bold border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-900 flex items-center justify-center gap-1.5"
                          >
                            Editar Ficha / Msj
                          </button>

                          {esTerminadoAdherido ? (
                            <button
                              type="button"
                              disabled
                              title="Esta persona ya adhirió. Para escribirle, cambiá su estatus arriba."
                              className="py-2 px-2.5 rounded-lg text-[11px] font-bold bg-emerald-200/80 text-emerald-900 border border-emerald-400 cursor-not-allowed flex items-center justify-center gap-1 text-center"
                            >
                              <span>🔒 Listo (Cambiar estatus p/ msj)</span>
                            </button>
                          ) : c.telWA ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenWhatsApp(c, c.mensajeSugerido)
                              }
                              className="py-2 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 shadow-sm"
                            >
                              <Send className="w-3.5 h-3.5 shrink-0" />
                              {c.enviadoEnSesion ? 'Reenviar WA' : 'Enviar WA'}
                            </button>
                          ) : (
                            <span className="py-2 px-3 rounded-lg text-xs text-slate-400 bg-slate-50 border border-slate-200 text-center">
                              Sin teléfono WA
                            </span>
                          )}
                        </div>

                        {esSinDniActivoParaCerrar && (
                          <button
                            type="button"
                            onClick={() => handleArchivarSinDniCabaYaRespondido(c)}
                            className="w-full py-1.5 px-2.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-900 text-amber-300 flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>✓ Ya se respondió referidos CABA (Sacar de pendientes)</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* VISTA ESCRITORIO / TABLET (md+): Tabla Completa del Padrón */}
                <div className="hidden md:block overflow-x-auto max-h-[640px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Contacto (Col. B Sheets)</th>
                        <th className="py-2.5 px-3">Barrio / Dirección</th>
                        <th className="py-2.5 px-3">Estado del Usuario (Sheets)</th>
                        <th className="py-2.5 px-3 text-right">WA 1-Clic</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredContacts.map((c, idxRow) => {
                        const isSelected = c.id === selectedContact?.id;
                        const esTerminadoAdherido = c.procesoCompletadoSinMensajes;
                        const esSinDniActivoParaCerrar =
                          c.situacion === 'DESCARTADO_NO_CABA' && !c.esCerradoOArchivadoSinDniCaba;
                        return (
                          <tr
                            key={`row-${c.id}-${idxRow}`}
                            onClick={() => {
                              setSelectedContactId(c.id);
                              setSelectedTemplate('auto');
                              setMobileBandejaView('detail');
                            }}
                            className={`cursor-pointer transition-colors ${
                              esTerminadoAdherido
                                ? 'bg-emerald-50/80 hover:bg-emerald-100/70 border-l-4 border-l-emerald-500'
                                : c.esCerradoOArchivadoSinDniCaba
                                ? 'bg-slate-100/80 hover:bg-slate-200/60 border-l-4 border-l-slate-400'
                                : isSelected
                                ? 'bg-amber-50/80'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-3 px-3 font-mono tabular-nums text-xs font-bold text-slate-500">
                              #{c.id}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                <span>{c.nombreCompletoCorregido}</span>
                                {esTerminadoAdherido ? (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white">
                                    ✅ Listo · Ya adhirió
                                  </span>
                                ) : c.esCerradoOArchivadoSinDniCaba ? (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-300">
                                    🗄️ Archivado Sin DNI CABA
                                  </span>
                                ) : c.sinNombre ? (
                                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300">
                                    Sin nombre · Preguntar en 1er Msj
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                    Hola, {c.primerNombre}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                                {c.telRaw || 'Sin teléfono'}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="text-xs font-semibold text-slate-800 flex items-center gap-1 flex-wrap">
                                <span>
                                  {c.barrio}{' '}
                                  {c.calleOCruce ? `· ${c.calleOCruce}` : ''}
                                </span>
                                {c.barrioCorregidoPorDireccion && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900">
                                    Auto-corregido
                                  </span>
                                )}
                              </div>
                              {c.email && (
                                <div className="text-[11px] text-slate-500 font-mono truncate max-w-[220px]">
                                  {c.email}
                                </div>
                              )}
                              <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                                {c.comentario || c.motivoEstrategico}
                              </div>
                            </td>
                            <td
                              className="py-3 px-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="space-y-1.5 min-w-[215px]">
                                <select
                                  aria-label={`Estado en Google Sheets de ${c.nombreCompletoCorregido}`}
                                  value={c.estadoFlujo}
                                  onChange={(e) => {
                                    const nextEstado = e.target.value as EstadoFlujo;
                                    const patch: Partial<RawContactRow> = {
                                      estadoFlujo: nextEstado,
                                    };
                                    if (nextEstado === 'YA_ADHIRIO_FIRMA_OK') {
                                      patch.adhirio = 'Sí';
                                      patch.rsp = 'Sí';
                                    } else if (nextEstado === 'DESCARTADO_O_BAJA') {
                                      patch.adhirio = 'No';
                                      patch.referidosCabaYaEnviado = true;
                                    } else if (
                                      nextEstado === 'PASO_DATOS_FALTA_CONFIRMAR' ||
                                      nextEstado === 'ENCUENTRO_CONFIRMADO' ||
                                      nextEstado === 'RECORDATORIO_DIA_ENVIADO' ||
                                      nextEstado === 'RESPONDIO_FALTA_DNI_O_ZONA'
                                    ) {
                                      patch.rsp = 'Sí';
                                    }
                                    updateContactField(c.id, patch, true);
                                  }}
                                  className={`w-full text-[11px] font-bold px-2 py-1 rounded border ${
                                    c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
                                    c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
                                      ? 'bg-emerald-100 border-emerald-400 text-emerald-950'
                                      : c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
                                        c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO'
                                      ? 'bg-sky-50 border-sky-300 text-sky-950'
                                      : c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
                                        c.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
                                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                                      : 'bg-white border-slate-300 text-slate-800'
                                  }`}
                                >
                                  {ESTADOS_FLUJO_CATALOGO.map((est) => (
                                    <option key={est.value} value={est.value}>
                                      {est.shortLabel}
                                    </option>
                                  ))}
                                </select>

                                <div className="flex items-center gap-1.5">
                                  <select
                                    aria-label={`Respuesta de ${c.nombreCompletoCorregido}`}
                                    value={c.rsp}
                                    onChange={(e) =>
                                      updateContactField(
                                        c.id,
                                        {
                                          rsp: e.target.value as RawContactRow['rsp'],
                                        },
                                        true
                                      )
                                    }
                                    className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${
                                      c.rsp === 'Sí'
                                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                                        : 'bg-white border-slate-300 text-slate-700'
                                    }`}
                                  >
                                    <option value="Sí">RSP: Sí</option>
                                    <option value="No">RSP: No</option>
                                    <option value="Nuevo">Nuevo</option>
                                  </select>

                                  <select
                                    aria-label={`Adhesión de ${c.nombreCompletoCorregido}`}
                                    value={c.adhirio}
                                    onChange={(e) =>
                                      updateContactField(
                                        c.id,
                                        {
                                          adhirio: e.target.value as RawContactRow['adhirio'],
                                          estadoFlujo:
                                            e.target.value === 'Sí'
                                              ? 'YA_ADHIRIO_FIRMA_OK'
                                              : e.target.value === 'No'
                                              ? 'DESCARTADO_O_BAJA'
                                              : undefined,
                                        },
                                        true
                                      )
                                    }
                                    className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${
                                      c.adhirio === 'Sí'
                                        ? 'bg-emerald-100 border-emerald-400 text-emerald-950'
                                        : c.adhirio === 'No'
                                        ? 'bg-red-50 border-red-200 text-red-800'
                                        : 'bg-white border-slate-300 text-slate-700'
                                    }`}
                                  >
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="Sí">Adhirió: Sí</option>
                                    <option value="No">No CABA/Baja</option>
                                  </select>
                                </div>
                              </div>
                            </td>
                            <td
                              className="py-3 px-3 text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {esTerminadoAdherido ? (
                                <div className="flex flex-col items-end gap-1">
                                  <button
                                    type="button"
                                    disabled
                                    title="Ya adhirió — Para volver a enviarle mensaje, cambiá su estatus en la columna de al lado."
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-200/80 text-emerald-900 border border-emerald-400 cursor-not-allowed inline-flex items-center gap-1"
                                  >
                                    <span>🔒 Ya adhirió (Sin msj)</span>
                                  </button>
                                  <span className="text-[10px] text-emerald-800">
                                    Cambiar estatus p/ escribir
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-end gap-1">
                                  {c.telWA ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenWhatsApp(c, c.mensajeSugerido)
                                      }
                                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1"
                                    >
                                      <Send className="w-3 h-3" />
                                      {c.enviadoEnSesion ? 'Reenviar' : 'Enviar WA'}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-slate-400">Sin WA</span>
                                  )}
                                  {esSinDniActivoParaCerrar && (
                                    <button
                                      type="button"
                                      onClick={() => handleArchivarSinDniCabaYaRespondido(c)}
                                      className="px-2 py-1 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-900 text-amber-300"
                                    >
                                      ✓ Ya respondido (Archivar)
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Columna Derecha (5 cols): Editor Completo de Datos del Contacto, Casilla Estado (Col. H Sheets) y Mensaje Personalizado */}
              {selectedContact && (
                <div
                  className={`lg:col-span-5 min-w-0 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 lg:sticky lg:top-20 ${
                    mobileBandejaView === 'list' ? 'hidden lg:block' : 'block'
                  }`}
                >
                  {/* Barra de navegación rápida en Móvil para volver a la lista o pasar al siguiente contacto */}
                  <div className="lg:hidden flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                    <button
                      type="button"
                      onClick={() => setMobileBandejaView('list')}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Volver al Padrón ({filteredContacts.length})</span>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const idx = filteredContacts.findIndex(
                            (item) => item.id === selectedContact.id
                          );
                          if (idx > 0) {
                            setSelectedContactId(filteredContacts[idx - 1].id);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-0.5"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Ant.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const idx = filteredContacts.findIndex(
                            (item) => item.id === selectedContact.id
                          );
                          if (idx >= 0 && idx < filteredContacts.length - 1) {
                            setSelectedContactId(filteredContacts[idx + 1].id);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-0.5"
                      >
                        <span>Sig.</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-200">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-mono font-bold text-slate-500">
                        FILA #{selectedContact.id} ·{' '}
                        {selectedContact.enSheets
                          ? 'Vinculado a Google Sheets'
                          : 'Nuevo Contacto'}
                      </span>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 break-words">
                        {selectedContact.nombreCompletoCorregido}
                      </h2>
                      <p className="text-xs text-slate-500 break-words">
                        Celda original: &quot;{selectedContact.nombre || '(Vacía — Sólo Teléfono)'}&quot; ·{' '}
                        {selectedContact.barrio} ·{' '}
                        {selectedContact.calleOCruce || 'Sin calle en Col. G (oculto en Mapa)'}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-900 shrink-0">
                      {selectedContact.modalidadSugerida === 'CAFE_HUB'
                        ? 'Sugerido: Café Hub'
                        : selectedContact.modalidadSugerida === 'PUERTA_A_PUERTA'
                        ? 'Sugerido: Puerta a Puerta'
                        : 'Punto / Remoto'}
                    </span>
                  </div>

                  {/* CASILLA VINCULADA A COLUMNA "ESTADO" DE GOOGLE SHEETS + CHECKLIST DE HITOS */}
                  <div className="p-3.5 bg-slate-900 text-white rounded-xl space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="contact-estado-flujo-select"
                        className="text-xs font-bold text-amber-300 uppercase tracking-wide"
                      >
                        Casilla de Estado del Usuario (Columna H en Google Sheets)
                      </label>
                      <span className="text-[11px] font-mono text-slate-300">
                        Se sincroniza con Sheets
                      </span>
                    </div>

                    <select
                      id="contact-estado-flujo-select"
                      value={selectedContact.estadoFlujo}
                      onChange={(e) => {
                        const nextEstado = e.target.value as EstadoFlujo;
                        const patch: Partial<RawContactRow> = {
                          estadoFlujo: nextEstado,
                        };
                        if (nextEstado === 'YA_ADHIRIO_FIRMA_OK') {
                          patch.adhirio = 'Sí';
                          patch.rsp = 'Sí';
                        } else if (nextEstado === 'DESCARTADO_O_BAJA') {
                          patch.adhirio = 'No';
                        } else if (
                          nextEstado === 'PASO_DATOS_FALTA_CONFIRMAR' ||
                          nextEstado === 'ENCUENTRO_CONFIRMADO' ||
                          nextEstado === 'RECORDATORIO_DIA_ENVIADO' ||
                          nextEstado === 'RESPONDIO_FALTA_DNI_O_ZONA'
                        ) {
                          patch.rsp = 'Sí';
                        }
                        updateContactField(selectedContact.id, patch, true);
                      }}
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg bg-slate-950 border border-slate-700 text-white"
                    >
                      {ESTADOS_FLUJO_CATALOGO.map((est) => (
                        <option key={est.value} value={est.value}>
                          {est.label}
                        </option>
                      ))}
                    </select>

                    {/* Indicadores visuales de qué etapas ya cumplió el usuario */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1 text-[11px]">
                      <div
                        className={`px-2 py-1 rounded border flex items-center gap-1.5 ${
                          !selectedContact.sinNombre
                            ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                            : 'bg-amber-950/80 border-amber-700 text-amber-200'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {!selectedContact.sinNombre
                            ? 'Nombre cargado'
                            : 'Falta Nombre'}
                        </span>
                      </div>

                      <div
                        className={`px-2 py-1 rounded border flex items-center gap-1.5 ${
                          Boolean(selectedContact.calleOCruce) ||
                          selectedContact.fechasMencionadas.length > 0 ||
                          selectedContact.franjaHoraria !== 'Flexible' ||
                          selectedContact.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
                          selectedContact.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
                          selectedContact.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO'
                            ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">Día/Hora/Direc.</span>
                      </div>

                      <div
                        className={`px-2 py-1 rounded border flex items-center gap-1.5 ${
                          selectedContact.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
                          selectedContact.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
                          selectedContact.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK'
                            ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">Confirmado</span>
                      </div>

                      <div
                        className={`px-2 py-1 rounded border flex items-center gap-1.5 ${
                          selectedContact.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
                          selectedContact.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK'
                            ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">Recordatorio Día</span>
                      </div>

                      <div
                        className={`px-2 py-1 rounded border flex items-center gap-1.5 ${
                          selectedContact.adhirio === 'Sí' ||
                          selectedContact.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
                          selectedContact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
                            ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">Ficha Firmada</span>
                      </div>
                    </div>
                  </div>

                  {/* Si es un teléfono sin nombre en Google Sheets: Caja rápida para cargar el nombre cuando responda */}
                  {selectedContact.sinNombre ? (
                    <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-amber-950">
                          Teléfono sin nombre en Google Sheets (Pregunta sutil incluida abajo)
                        </span>
                      </div>
                      <p className="text-xs text-amber-900 leading-relaxed">
                        El mensaje de abajo ya incluye una consulta natural y transparente para que te diga su <strong>nombre y apellido</strong> sin desconfiar. Cuando te responda, escribilo acá para actualizar la base:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={nombreCompletarInput}
                          onChange={(e) => setNombreCompletarInput(e.target.value)}
                          placeholder="Ej: Martín Ezequiel Gómez"
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-amber-400 rounded-lg bg-white text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => handleGuardarNombreRecibido(selectedContact.id)}
                          disabled={!nombreCompletarInput.trim()}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold rounded-lg shrink-0"
                        >
                          Guardar Nombre
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Desambiguador de Nombre y Vocativo */
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          Nombre detectado para saludo: &quot;Hola, {selectedContact.primerNombre}&quot;
                        </span>
                        <span className="text-[11px] font-mono text-emerald-700">
                          {selectedContact.analisisNombre.ordenDetectado ===
                            'APELLIDO_NOMBRE' ||
                          selectedContact.analisisNombre.ordenDetectado ===
                            'APELLIDO_COMA_NOMBRE'
                            ? 'Invertido Apellido→Nombre'
                            : 'Orden Nombre→Apellido'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor="vocativo-override-input"
                          className="text-xs font-medium text-slate-600 shrink-0"
                        >
                          Corregir vocativo manual:
                        </label>
                        <input
                          id="vocativo-override-input"
                          type="text"
                          value={selectedContact.vocativoOverride ?? ''}
                          onChange={(e) =>
                            updateContactField(selectedContact.id, {
                              vocativoOverride: e.target.value,
                            })
                          }
                          placeholder={selectedContact.analisisNombre.vocativo}
                          className="flex-1 min-w-0 px-2.5 py-1 text-xs border border-slate-300 rounded bg-white text-slate-900"
                        />
                      </div>
                    </div>
                  )}

                  {/* FICHA DE DATOS EDITABLES DEL CONTACTO (Nombre, Teléfono, Barrio, Email y Dirección en Col. G) */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        Modificar o Agregar Información del Contacto (Sincronizado con Sheets)
                      </span>
                      {selectedContact.tieneDireccionRealEnComentario ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                          ✓ Incluido en Mapa y Circuitos
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                          Sin dirección en Col. G (oculto en Mapa)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label
                          htmlFor="contact-nombre-edit-input"
                          className="block text-[11px] font-semibold text-slate-700 mb-1"
                        >
                          Nombre y Apellido (Col. B)
                        </label>
                        <input
                          id="contact-nombre-edit-input"
                          type="text"
                          value={selectedContact.nombre}
                          onChange={(e) =>
                            updateContactField(
                              selectedContact.id,
                              { nombre: e.target.value },
                              true
                            )
                          }
                          placeholder="Ej: María Belén Gómez"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="contact-tel-edit-input"
                          className="block text-[11px] font-semibold text-slate-700 mb-1"
                        >
                          Teléfono / WhatsApp (Col. E)
                        </label>
                        <input
                          id="contact-tel-edit-input"
                          type="text"
                          value={selectedContact.telRaw}
                          onChange={(e) =>
                            updateContactField(
                              selectedContact.id,
                              { telRaw: e.target.value },
                              true
                            )
                          }
                          placeholder="Ej: 11 4567 8901"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 font-mono"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="contact-barrio-edit-input"
                          className="block text-[11px] font-semibold text-slate-700 mb-1"
                        >
                          Barrio (Col. C · Auto-ajustable)
                        </label>
                        <input
                          id="contact-barrio-edit-input"
                          type="text"
                          list="barrios-caba-list"
                          value={selectedContact.barrio}
                          onChange={(e) =>
                            updateContactField(
                              selectedContact.id,
                              { barrio: e.target.value },
                              true
                            )
                          }
                          placeholder="Ej: Palermo, Belgrano..."
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="contact-email-edit-input"
                          className="block text-[11px] font-semibold text-slate-700 mb-1"
                        >
                          Email (Col. D · Opcional)
                        </label>
                        <input
                          id="contact-email-edit-input"
                          type="email"
                          value={selectedContact.email || ''}
                          onChange={(e) =>
                            updateContactField(
                              selectedContact.id,
                              { email: e.target.value },
                              true
                            )
                          }
                          placeholder="vecino@ejemplo.com"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                        />
                      </div>
                    </div>

                    {/* Edición de Comentario / Dirección / Punto de Encuentro en Columna G */}
                    <div>
                      <label
                        htmlFor="contact-comentario-input"
                        className="block text-[11px] font-semibold text-slate-700 mb-1"
                      >
                        Dirección / Punto de Encuentro / Comentario (Columna G de Google Sheets)
                      </label>
                      <input
                        id="contact-comentario-input"
                        type="text"
                        value={selectedContact.comentario}
                        onChange={(e) =>
                          updateContactField(
                            selectedContact.id,
                            {
                              comentario: e.target.value,
                            },
                            true
                          )
                        }
                        placeholder="Ej: Visita por confirmar (Av. Balbín y Larralde) después de las 15 hs"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                      />
                      {selectedContact.barrioCorregidoPorDireccion && (
                        <p className="text-[11px] text-emerald-800 font-semibold mt-1">
                          ✓ Barrio corregido automáticamente a <strong>{selectedContact.barrio}</strong> según la dirección en Columna G (decía &quot;{selectedContact.barrioOriginalSheet}&quot;).
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Selector de Plantilla Conversacional */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="template-selector"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Tipo de Mensaje (Voz de {profile.nombrePromotor})
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={profile.modoBreve}
                          onChange={(e) =>
                            setProfile((p) => ({
                              ...p,
                              modoBreve: e.target.checked,
                            }))
                          }
                          className="rounded border-slate-300 text-slate-900"
                        />
                        Modo Breve
                      </label>
                    </div>
                    <select
                      id="template-selector"
                      value={selectedTemplate}
                      onChange={(e) =>
                        setSelectedTemplate(e.target.value as TipoPlantillaWA)
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                    >
                      {PLANTILLAS_OPCIONES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Pegar respuesta de WhatsApp para adaptar con IA */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <label
                      htmlFor="vecino-reply-input"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      ¿Te respondió algo puntual recién? Pegalo para adaptar el mensaje:
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="vecino-reply-input"
                        type="text"
                        value={ultimoMensajeVecino}
                        onChange={(e) => setUltimoMensajeVecino(e.target.value)}
                        placeholder="Ej: 'Hola César, puedo el jueves después de las 16 por Plaza Italia'"
                        className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleRefineMessageWithAI(profile.modoBreve)}
                        disabled={isRefiningAI}
                        className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-md hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1 shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        {isRefiningAI ? 'Adaptando...' : 'Adaptar IA'}
                      </button>
                    </div>
                    {aiRefineNotice && (
                      <p className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                        {aiRefineNotice}
                      </p>
                    )}
                  </div>

                  {/* Área de texto del mensaje */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="wa-message-textarea"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Mensaje Personalizado Listo para Enviar
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRefineMessageWithAI(true)}
                        disabled={isRefiningAI}
                        className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
                      >
                        Acortar aún más
                      </button>
                    </div>
                    <textarea
                      id="wa-message-textarea"
                      rows={6}
                      value={customMessageText}
                      onChange={(e) => setCustomMessageText(e.target.value)}
                      className="w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  {/* Botones de Acción Principal */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenWhatsApp(selectedContact, customMessageText)
                      }
                      disabled={!selectedContact.telWA}
                      className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      Enviar por WhatsApp (1 Clic)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(selectedContact.id, customMessageText)
                      }
                      className="py-2.5 px-3 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
                    >
                      {copiedId === selectedContact.id ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copiar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PASO 2: HACER UN CORTE, AGENDA RECOMENDADA DÍA POR DÍA (FECHA/HORA ACTUAL), ALERTAS DE PENDIENTES VENCIDOS Y CONSOLIDACIÓN 1-A-1 */}
        {activeTab === 'corte' && (
          <div className="space-y-6">
            {/* Cabecera del Corte con Reloj en Vivo y Métricas Sincronizadas */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-400 text-slate-950">
                    Paso 2 · Agenda Recomendada Día por Día
                  </span>
                  <span
                    data-testid="corte-live-clock"
                    className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-slate-900 text-amber-300 inline-flex items-center gap-1"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    Fecha y hora actual considerada: {corteResultado.fechaHoraActualEtiqueta}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-900 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    {corteResultado.metricas.adheridosTotales} ya adheridos descartados
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-900 inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                    {corteResultado.metricas.conPuntoEncuentroDeterminado} con punto/dirección en Agenda
                  </span>
                  {corteResultado.metricas.alertasVencidasReprogramar > 0 && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                      {corteResultado.metricas.alertasVencidasReprogramar} pendientes vencidos / sin confirmar
                    </span>
                  )}
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Agenda Recomendada Día por Día (Sincronizada con Google Sheets, Sección 1 y Google Calendar)
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 max-w-4xl">
                  {corteResultado.resumenEjecutivo}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <select
                  aria-label="Filtrar corte por barrio"
                  value={corteBarrioFiltro}
                  onChange={(e) => setCorteBarrioFiltro(e.target.value)}
                  className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-900"
                >
                  <option value="Todos">Todos los barrios</option>
                  {todosLosBarrios.map((b) => (
                    <option key={b} value={b}>
                      Sólo {b}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleActualizarDesdeSheets}
                  disabled={isSyncingSheets}
                  className="px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                  Actualizar desde Sheets
                </button>

                <button
                  type="button"
                  onClick={handleEjecutarCorteIA}
                  disabled={aiCorteLoading}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  {aiCorteLoading
                    ? 'Actualizando Agenda con IA...'
                    : 'Profundizar Estrategia con IA'}
                </button>
              </div>
            </div>

            {/* PANEL DE ALERTAS DESTACADAS: PENDIENTES DE DÍAS U HORARIOS ANTERIORES SIN CAMBIO A "YA ADHIRIÓ" */}
            {(() => {
              const alertasActivasNoConsolidadas = corteResultado.alertasPendientesVencidos.filter(
                (c) => !alertaOcultaIds.has(c.id) && !respuestasConsolidadasLog[c.id]
              );
              const totalEnviadosEnAlertas = alertasActivasNoConsolidadas.filter(
                (c) => sentIdsInSession.has(c.id) || Boolean(c.ultimoMensajeCorteEnviadoAt)
              ).length;
              const alertasMostradas = ocultarEnviadosEnAlertas
                ? alertasActivasNoConsolidadas.filter(
                    (c) => !sentIdsInSession.has(c.id) && !c.ultimoMensajeCorteEnviadoAt
                  )
                : alertasActivasNoConsolidadas;

              if (alertasActivasNoConsolidadas.length === 0) return null;

              return (
                <div
                  data-testid="panel-alertas-vencidos"
                  className="bg-rose-50/90 border-2 border-rose-300 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-rose-200">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-rose-600 text-white uppercase tracking-wide">
                          ⚠️ Atención Prioritaria · Pendientes de Fecha / Hora Anterior
                        </span>
                        <span className="text-xs font-bold text-rose-900">
                          {alertasActivasNoConsolidadas.length} persona(s) activas al {corteResultado.fechaHoraActualEtiqueta}
                        </span>
                        {totalEnviadosEnAlertas > 0 && (
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                            ✓ {totalEnviadosEnAlertas} con mensaje enviado (esperando / cargando respuesta)
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                        Atención Prioritaria · Pendientes de Fecha / Hora Anterior
                      </h3>
                      <p className="text-xs text-slate-700 mt-0.5">
                        Al enviar el mensaje desde una tarjeta, esta <strong>cambia automáticamente</strong> al módulo de carga de respuesta (igual que abajo) y <strong>desaparece de este panel</strong> en cuanto registrás lo que te respondió o si elegís ocultarla.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {totalEnviadosEnAlertas > 0 && (
                        <button
                          type="button"
                          onClick={() => setOcultarEnviadosEnAlertas((v) => !v)}
                          className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-rose-300 text-xs font-bold"
                        >
                          {ocultarEnviadosEnAlertas
                            ? `Mostrar ${totalEnviadosEnAlertas} enviado(s)`
                            : `Ocultar ${totalEnviadosEnAlertas} ya enviado(s)`}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSituacionFiltro('ALERTAS_VENCIDOS');
                          setBandejaGrupoIdsFiltro(null);
                          setActiveTab('bandeja');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-900 hover:bg-rose-800 text-white text-xs font-bold"
                      >
                        Ver en Sección 1
                      </button>
                    </div>
                  </div>

                  {alertasMostradas.length === 0 ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-950">
                        ✓ Ya enviaste todos los mensajes de este módulo ({totalEnviadosEnAlertas}). Hacé clic en &quot;Mostrar enviado(s)&quot; cuando te respondan para cargar su nueva fecha o adhesión.
                      </span>
                      <button
                        type="button"
                        onClick={() => setOcultarEnviadosEnAlertas(false)}
                        className="px-2.5 py-1 rounded bg-emerald-700 text-white text-xs font-bold shrink-0"
                      >
                        Mostrar para cargar respuestas
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {alertasMostradas.map((c) => {
                        const alerta = c.alertaVencido!;
                        const msgAlerta =
                          corteEditedMessages[`alerta-${c.id}`] ??
                          alerta.mensajeDisculpasReprogramacion;
                        const isSent =
                          sentIdsInSession.has(c.id) || Boolean(c.ultimoMensajeCorteEnviadoAt);
                        const isMsgExpanded = expandirMensajeEnviadoIds.has(`alerta-${c.id}`);
                        const bloqueDeContacto =
                          corteResultado.agendaSugeridaDias.find((b) =>
                            b.contactosIncluidos.some((x) => x.id === c.id)
                          ) ||
                          corteResultado.agendaSugeridaDias[0] || {
                            id: 'bloque-alerta',
                            diaEtiqueta: 'Hoy',
                            fechaClave: obtenerPartesFechaHoraBA(ahoraCorteMs).ddmm,
                            franjaHoraria: '15:00 a 17:00 hs',
                            modalidad: 'PUERTA_A_PUERTA' as ModalidadEncuentroAgenda,
                            titulo: c.barrio,
                            puntoEncuentroODireccion: c.calleOCruce || c.barrio,
                            barrio: c.barrio,
                            contactosIncluidos: [c],
                            motivoClaro: '',
                          };

                        return (
                          <div
                            key={`alerta-card-${c.id}`}
                            data-testid={`alerta-card-${c.id}`}
                            className={`rounded-xl p-3.5 space-y-2.5 shadow-xs flex flex-col justify-between min-w-0 transition-all ${
                              isSent
                                ? 'bg-emerald-50/90 border-2 border-emerald-400'
                                : 'bg-white border border-rose-200'
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                                        isSent
                                          ? 'bg-emerald-600 text-white border-emerald-700'
                                          : 'bg-rose-100 text-rose-900 border-rose-300'
                                      }`}
                                    >
                                      {isSent
                                        ? '✓ MENSAJE ENVIADO · CARGAR RESPUESTA RECIBIDA'
                                        : alerta.titulo}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-600">
                                      Estado: <strong>{c.estadoFlujoEtiqueta}</strong>
                                    </span>
                                  </div>
                                  <h4 className="text-sm font-bold text-slate-900 mt-1 break-words">
                                    #{c.id} {c.nombreCompletoCorregido}{' '}
                                    <span className="text-xs font-semibold text-slate-600">
                                      ({c.barrio} · {c.calleOCruce || 'Punto barrial'})
                                    </span>
                                  </h4>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[11px] font-mono text-slate-500">
                                    {c.telRaw}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAlertaOcultaIds((prev) => {
                                        const next = new Set(prev);
                                        next.add(c.id);
                                        return next;
                                      })
                                    }
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-white hover:bg-slate-100 text-slate-600 border border-slate-300"
                                    title="Quitar esta tarjeta del panel superior (seguirá disponible en la lista de su bloque)"
                                  >
                                    Ocultar
                                  </button>
                                </div>
                              </div>

                              {!isSent ? (
                                <>
                                  <p className="text-xs text-slate-700 leading-relaxed">
                                    {alerta.motivo}
                                  </p>
                                  <p className="text-xs font-semibold text-amber-950 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                                    💡 <strong>Propuesta óptima según tus datos y agenda:</strong>{' '}
                                    {alerta.propuestaReprogramacion}
                                  </p>

                                  <textarea
                                    aria-label={`Mensaje de disculpas y reprogramación para ${c.nombreCompletoCorregido}`}
                                    rows={3}
                                    value={msgAlerta}
                                    onChange={(e) =>
                                      setCorteEditedMessages((prev) => ({
                                        ...prev,
                                        [`alerta-${c.id}`]: e.target.value,
                                      }))
                                    }
                                    className="w-full p-2 text-xs border border-slate-300 rounded-lg bg-slate-50 text-slate-900 leading-relaxed"
                                  />
                                </>
                              ) : (
                                <div className="bg-white border border-emerald-200 rounded-lg p-3 space-y-2.5">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className="text-xs font-bold text-emerald-950">
                                      2. Cargar la información o respuesta que recibas de {c.primerNombre}:
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandirMensajeEnviadoIds((prev) => {
                                          const next = new Set(prev);
                                          const k = `alerta-${c.id}`;
                                          if (next.has(k)) next.delete(k);
                                          else next.add(k);
                                          return next;
                                        })
                                      }
                                      className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline"
                                    >
                                      {isMsgExpanded ? 'Ocultar texto enviado' : 'Ver / Reenviar mensaje WA'}
                                    </button>
                                  </div>

                                  {isMsgExpanded && (
                                    <div className="space-y-1.5 pt-1 border-t border-slate-100">
                                      <textarea
                                        aria-label={`Mensaje de disculpas y reprogramación para ${c.nombreCompletoCorregido}`}
                                        rows={2}
                                        value={msgAlerta}
                                        onChange={(e) =>
                                          setCorteEditedMessages((prev) => ({
                                            ...prev,
                                            [`alerta-${c.id}`]: e.target.value,
                                          }))
                                        }
                                        className="w-full p-2 text-xs border border-slate-300 rounded-lg bg-slate-50 text-slate-900 leading-relaxed"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenWhatsApp(
                                            c,
                                            msgAlerta,
                                            'disculpas_y_reprogramacion'
                                          )
                                        }
                                        className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold inline-flex items-center gap-1"
                                      >
                                        <Send className="w-3 h-3" />
                                        Reenviar por WhatsApp
                                      </button>
                                    </div>
                                  )}

                                  {renderSelectorPlanDiaTurno(c, bloqueDeContacto, 'alerta')}
                                </div>
                              )}
                            </div>

                            {!isSent && (
                              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenWhatsApp(
                                        c,
                                        msgAlerta,
                                        'disculpas_y_reprogramacion'
                                      )
                                    }
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                    Enviar Disculpas y Reprogramar (WA)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenWhatsApp(
                                        c,
                                        msgAlerta,
                                        'disculpas_y_reprogramacion',
                                        true
                                      )
                                    }
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                                    title="Si ya le escribiste desde el celu o la PC, hacé clic para pasar a cargar su respuesta"
                                  >
                                    ✓ Ya le escribí (Cargar respuesta)
                                  </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAplicarRespuestaAgenda1a1(
                                        c,
                                        bloqueDeContacto,
                                        'YA_ADHIRIO'
                                      )
                                    }
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300"
                                    title="Si ya firmó la ficha, cambialo a Ya Adhirió para quitar la alerta y descartarlo de pendientes"
                                  >
                                    ✓ Ya Adhirió
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* BLOQUE ESTRELLA: AGENDA RECOMENDADA DÍA POR DÍA (Sólo NO adheridos con dirección/punto + Calendar) */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-900" />
                    Agenda Recomendada Día por Día (Contemplando tus Eventos de Google Calendar y Traslados)
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Incluye estrictamente a las <strong>{corteResultado.metricas.conPuntoEncuentroDeterminado} personas NO adheridas que ya tienen punto de encuentro, dirección o lugar determinado</strong> en Google Sheets o en la Sección 1. Podés <strong>elegir la modalidad de encuentro</strong> (Café HUB, Puerta a Puerta, Seguimiento Punto de Adhesión o Encuentro Sede) y el <strong>Café HUB de tu lista Google Maps</strong> para personalizar automáticamente todos los mensajes.
                  </p>
                </div>
                {bloqueAgendaActivoId && (
                  <button
                    type="button"
                    onClick={() => setBloqueAgendaActivoId(null)}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline shrink-0"
                  >
                    Ver cola completa ({corteResultado.colaMensajes.length})
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {corteResultado.agendaSugeridaDias.map((bloque: BloqueAgendaRecomendado) => {
                  const isSelected = bloqueAgendaActivoId === bloque.id;
                  const isConfirmed = bloquesConfirmadosIds.has(bloque.id);
                  const modElegida: ModalidadEncuentroAgenda =
                    modalidadOverrideByBloque[bloque.id] ?? bloque.modalidad;
                  const cafesFiltradosBarrio = CATALOGO_CAFES_HUB_CABA.filter(
                    (cf) => cf.barrio.toLowerCase() === bloque.barrio.toLowerCase()
                  );
                  const cafesCandidatosOrdenados =
                    bloque.cafesCandidatosCurados && bloque.cafesCandidatosCurados.length > 0
                      ? bloque.cafesCandidatosCurados
                      : cafesFiltradosBarrio.map((cf) => ({
                          nombre: cf.nombre,
                          direccion: cf.direccion,
                          barrio: cf.barrio,
                          distanciaPromedioMetros: 380,
                          coincidenciaFranjaYDia: `${bloque.diaEtiqueta} · ${bloque.franjaHoraria}`,
                          urlGoogleMaps: cf.urlGoogleMaps,
                        }));
                  const cafeActual = cafeHubOverrideByBloque[bloque.id] ?? {
                    nombre:
                      cafesCandidatosOrdenados[0]?.nombre ||
                      bloque.puntoEncuentroODireccion,
                    direccion:
                      cafesCandidatosOrdenados[0]?.direccion ||
                      bloque.barrio,
                  };

                  return (
                    <div
                      key={bloque.id}
                      className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 min-w-0 ${
                        isSelected
                          ? 'border-slate-900 bg-amber-50/40 ring-1 ring-slate-900'
                          : isConfirmed
                          ? 'border-emerald-500 bg-emerald-50/30'
                          : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-800">
                            {bloque.diaEtiqueta}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {Number(bloque.alertasIncluidasCount) > 0 && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-rose-100 text-rose-900 border border-rose-300">
                                ⚠️ {bloque.alertasIncluidasCount} pendiente(s) vencido(s)
                              </span>
                            )}
                            <span
                              className={`px-2.5 py-0.5 rounded-md text-xs font-bold inline-flex items-center gap-1 ${
                                modElegida === 'CAFE_HUB'
                                  ? 'bg-amber-200 text-amber-950'
                                  : modElegida === 'PUERTA_A_PUERTA'
                                  ? 'bg-sky-200 text-sky-950'
                                  : modElegida === 'SEGUIMIENTO_PUNTO_ADHESION'
                                  ? 'bg-emerald-200 text-emerald-950'
                                  : 'bg-indigo-200 text-indigo-950'
                              }`}
                            >
                              {modElegida === 'CAFE_HUB' ? (
                                <>
                                  <Coffee className="w-3.5 h-3.5" />
                                  HACER CAFÉ HUB
                                </>
                              ) : modElegida === 'PUERTA_A_PUERTA' ? (
                                <>
                                  <Footprints className="w-3.5 h-3.5" />
                                  RECORRIDO PUERTA A PUERTA
                                </>
                              ) : modElegida === 'SEGUIMIENTO_PUNTO_ADHESION' ? (
                                <>
                                  <MapPin className="w-3.5 h-3.5" />
                                  SEGUIMIENTO PUNTO ADHESIÓN
                                </>
                              ) : (
                                <>
                                  <MapPin className="w-3.5 h-3.5" />
                                  ENCUENTRO SEMANAL SEDE
                                </>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900">
                            {bloque.barrio} · {bloque.franjaHoraria}
                          </h4>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {bloque.resumenOperativoRuta ? (
                              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-950">
                                ⏱️ {bloque.resumenOperativoRuta}
                              </span>
                            ) : (
                              bloque.duracionEstimadaMin && (
                                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-950">
                                  ⏱️ ~{bloque.duracionEstimadaMin} min reales
                                </span>
                              )
                            )}
                            <span className="text-xs font-mono font-semibold text-slate-700">
                              {bloque.contactosIncluidos.length} vecino(s)
                            </span>
                          </div>
                        </div>

                        <p className="text-xs font-medium text-slate-800 break-words">
                          📍 <strong>Circuito y Punto Céntrico:</strong>{' '}
                          {modElegida === 'CAFE_HUB' || modElegida === 'SEGUIMIENTO_PUNTO_ADHESION'
                            ? `${cafeActual.nombre} (${cafeActual.direccion})`
                            : bloque.puntoEncuentroODireccion}
                        </p>

                        {bloque.paradasRutaSugerida && bloque.paradasRutaSugerida.length > 0 && (
                          <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1.5">
                            <span className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                              Cronograma de paradas en orden (sincronizado con Google Calendar y hora actual):
                            </span>
                            <div className="space-y-1">
                              {bloque.paradasRutaSugerida.map((p) => (
                                <div
                                  key={`blk-stop-${bloque.id}-${p.contact.id}`}
                                  className={`flex flex-wrap items-center justify-between gap-1.5 px-2 py-1 rounded text-[11px] border ${
                                    p.vencidaSinAdherir
                                      ? 'bg-rose-50 border-rose-300 text-rose-950'
                                      : 'bg-slate-50 border-slate-200 text-slate-800'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                    <span className="font-mono font-bold">
                                      #{p.orden} · {p.horaLlegada} hs
                                    </span>
                                    <span className="font-bold">
                                      {p.contact.nombreCompletoCorregido}
                                    </span>
                                    <span className="text-slate-600">
                                      ({p.contact.calleOCruce || p.contact.barrio})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {p.vencidaSinAdherir && (
                                      <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]">
                                        ⚠️ Horario vencido sin adherir — Reprogramar
                                      </span>
                                    )}
                                    {p.notaHorarioConveniente && !p.vencidaSinAdherir && (
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 font-semibold text-[10px]">
                                        ✓ Ajustado por Calendar
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recomendación integrada de Circuito y Punto Céntrico (Cercanía + Días y Franjas Horarias Compartidas) */}
                        <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2">
                          <span className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                            1. Elegir modalidad del circuito para personalizar mensajes y Hoja de Ruta:
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                            {(
                              [
                                { id: 'CAFE_HUB', label: '☕ Café HUB' },
                                { id: 'PUERTA_A_PUERTA', label: '🚶 Puerta a Puerta' },
                                { id: 'SEGUIMIENTO_PUNTO_ADHESION', label: '📍 Punto Adhesión' },
                                { id: 'ENCUENTRO_SEDE', label: '🏛️ Sede Semanal' },
                              ] as { id: ModalidadEncuentroAgenda; label: string }[]
                            ).map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setModalidadOverrideByBloque((prev) => ({
                                    ...prev,
                                    [bloque.id]: m.id,
                                  }));
                                  setPropuestaEditedMessages((prev) => {
                                    const next = { ...prev };
                                    bloque.contactosIncluidos.forEach((c) => {
                                      delete next[`${bloque.id}-${c.id}`];
                                    });
                                    return next;
                                  });
                                }}
                                className={`px-2 py-1 rounded text-[11px] font-bold text-center transition-colors ${
                                  modElegida === m.id
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>

                          {cafesCandidatosOrdenados.length > 0 && (
                            <div className="pt-1 border-t border-slate-100 space-y-1.5">
                              <label className="block text-[10px] font-bold text-amber-950">
                                ☕ 2. Selección de Café HUB sugerido (Ordenado por cercanía al centroide del grupo + coincidencia de día y franja horaria):
                              </label>
                              <div className="space-y-1">
                                {cafesCandidatosOrdenados.slice(0, 3).map((cf, idxCf) => {
                                  const isSelectedCafe =
                                    cafeActual.nombre === cf.nombre &&
                                    cafeActual.direccion === cf.direccion;
                                  return (
                                    <label
                                      key={`${bloque.id}-cf-${cf.nombre}-${cf.direccion}-${idxCf}`}
                                      className={`flex items-start gap-2 p-1.5 rounded-lg border text-[11px] cursor-pointer transition-colors ${
                                        isSelectedCafe
                                          ? 'bg-amber-100/90 border-amber-400 text-amber-950 font-bold'
                                          : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-amber-50/40'
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name={`cafe-bloque-${bloque.id}`}
                                        checked={isSelectedCafe}
                                        onChange={() => {
                                          setCafeHubOverrideByBloque((prev) => ({
                                            ...prev,
                                            [bloque.id]: {
                                              nombre: cf.nombre,
                                              direccion: cf.direccion,
                                            },
                                          }));
                                          setPropuestaEditedMessages((prev) => {
                                            const next = { ...prev };
                                            bloque.contactosIncluidos.forEach((c) => {
                                              delete next[`${bloque.id}-${c.id}`];
                                            });
                                            return next;
                                          });
                                        }}
                                        className="mt-0.5"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1 flex-wrap">
                                          <span className="truncate">
                                            {idxCf === 0 ? '⭐ Óptimo: ' : '☕ '}
                                            {cf.nombre} — {cf.direccion}
                                          </span>
                                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white border border-amber-300 text-amber-900 shrink-0">
                                            ~{cf.distanciaPromedioMetros}m prom.
                                          </span>
                                        </div>
                                        <span className="block text-[10px] text-slate-600 font-normal">
                                          Coincidencia: {cf.coincidenciaFranjaYDia}
                                        </span>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                          {bloque.motivoClaro}
                        </p>

                        {bloque.trasladoCalendarNota && (
                          <div className="p-2 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-700 flex items-start gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                            <span>
                              <strong>Cálculo Google Calendar y Traslado:</strong>{' '}
                              {bloque.trasladoCalendarNota}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-600 truncate max-w-[200px]">
                          Incluye:{' '}
                          {bloque.contactosIncluidos
                            .slice(0, 4)
                            .map((c) => c.primerNombre)
                            .join(', ')}
                          {bloque.contactosIncluidos.length > 4
                            ? ` +${bloque.contactosIncluidos.length - 4}`
                            : ''}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setBloquesConfirmadosIds((prev) => {
                                const next = new Set(prev);
                                next.add(bloque.id);
                                return next;
                              });
                              setBloqueAgendaActivoId(bloque.id);
                              setActiveTab('mapa');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-950 flex items-center gap-1"
                            title="Abrir este circuito y horario en la Pestaña 3: Hoja de Ruta en Terreno"
                          >
                            <Navigation className="w-3 h-3" />
                            Ir a 3. Hoja de Ruta
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBloqueAgendaActivoId(bloque.id);
                              const el = document.getElementById('mapa-pendientes-caba-tab2');
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-100 text-slate-800"
                            title="Ver este circuito en el Mapa de Pendientes CABA al final de esta pestaña"
                          >
                            Ver en Mapa
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBloquesConfirmadosIds((prev) => {
                                const next = new Set(prev);
                                next.add(bloque.id);
                                return next;
                              });
                              setBloqueAgendaActivoId(bloque.id);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                              isSelected
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                          >
                            {isSelected
                              ? '✓ Activo en Lista 1-a-1'
                              : 'Confirmar y Filtrar Lista 1-a-1'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* MÓDULO UNIFICADO: LISTA 1-A-1 DE CONFIRMACIÓN, SEGUIMIENTO, DISCULPAS Y CONSOLIDACIÓN DE AGENDA DIARIA */}
              {(() => {
                  const bloqueActivo = bloqueAgendaActivoId
                    ? corteResultado.agendaSugeridaDias.find(
                        (b) => b.id === bloqueAgendaActivoId
                      ) || null
                    : null;

                  const modElegidaBloque: ModalidadEncuentroAgenda = bloqueActivo
                    ? modalidadOverrideByBloque[bloqueActivo.id] ?? bloqueActivo.modalidad
                    : 'PUERTA_A_PUERTA';
                  const cafesFiltradosActivo = bloqueActivo
                    ? CATALOGO_CAFES_HUB_CABA.filter(
                        (cf) => cf.barrio.toLowerCase() === bloqueActivo.barrio.toLowerCase()
                      )
                    : [];
                  const cafesDelBarrioActivo =
                    bloqueActivo?.cafesCandidatosCurados &&
                    bloqueActivo.cafesCandidatosCurados.length > 0
                      ? bloqueActivo.cafesCandidatosCurados
                      : cafesFiltradosActivo;
                  const cafeElegidoBloque = bloqueActivo
                    ? cafeHubOverrideByBloque[bloqueActivo.id] ?? {
                        nombre:
                          cafesDelBarrioActivo[0]?.nombre ||
                          bloqueActivo.puntoEncuentroODireccion,
                        direccion:
                          cafesDelBarrioActivo[0]?.direccion ||
                          bloqueActivo.barrio,
                      }
                    : { nombre: '', direccion: '' };

                  // Evitar redundancia con el primer módulo superior (panel-alertas-vencidos):
                  // Si una persona ya se está gestionando arriba en el panel de Atención Prioritaria, no repetirla abajo salvo que la hayan ocultado arriba o filtren explícitamente por categoría "0."
                  const idsMostradosEnPanelAlertasSuperior = new Set(
                    corteResultado.alertasPendientesVencidos
                      .filter((c) => {
                        if (alertaOcultaIds.has(c.id) || respuestasConsolidadasLog[c.id]) {
                          return false;
                        }
                        if (
                          ocultarEnviadosEnAlertas &&
                          (sentIdsInSession.has(c.id) || Boolean(c.ultimoMensajeCorteEnviadoAt))
                        ) {
                          return false;
                        }
                        return true;
                      })
                      .map((c) => c.id)
                  );

                  // Construir la lista unificada: si hay bloqueActivo seleccionado, muestra sus integrantes (sin duplicar los que ya están abiertos en el módulo 1 superior);
                  // si el usuario elige "Toda la Cola de Seguimiento", muestra toda la cola filtrada por categoría
                  const itemsUnificados = bloqueActivo
                    ? bloqueActivo.contactosIncluidos
                        .filter((c) => !idsMostradosEnPanelAlertasSuperior.has(c.id))
                        .map((c) => {
                          const itemCola = corteResultado.colaMensajes.find(
                            (it) => it.contact.id === c.id
                          );
                          return {
                            contact: c,
                            categoriaCorte:
                              itemCola?.categoriaCorte ||
                              `Agenda: ${bloqueActivo.diaEtiqueta} (${bloqueActivo.franjaHoraria})`,
                            razonRecomendacion:
                              itemCola?.razonRecomendacion || bloqueActivo.motivoClaro,
                            mensajeColaGeneral: itemCola?.mensajePersonalizado || '',
                          };
                        })
                    : corteResultado.colaMensajes
                        .filter((item) => {
                          if (corteCategoriaFiltro === 'Todas') {
                            return !idsMostradosEnPanelAlertasSuperior.has(item.contact.id);
                          }
                          return item.categoriaCorte.startsWith(corteCategoriaFiltro);
                        })
                        .map((item) => ({
                          contact: item.contact,
                          categoriaCorte: item.categoriaCorte,
                          razonRecomendacion: item.razonRecomendacion,
                          mensajeColaGeneral: item.mensajePersonalizado,
                        }));

                  return (
                    <div
                      data-testid="panel-consolidacion-bloque-1a1"
                      className="mt-4 p-4 sm:p-5 rounded-xl bg-amber-50/70 border-2 border-slate-900 space-y-4"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-amber-200">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded bg-slate-900 text-amber-300 text-xs font-bold">
                              Lista 1-a-1 Unificada de Confirmación, Seguimiento, Disculpas y Consolidación
                            </span>
                            {bloqueActivo ? (
                              <span className="text-xs font-bold text-slate-800">
                                Filtrado por Bloque: {bloqueActivo.diaEtiqueta} · {bloqueActivo.barrio} ({bloqueActivo.franjaHoraria})
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-slate-800">
                                Mostrando Cola General de Seguimiento ({itemsUnificados.length} contactos sin repetir el módulo superior)
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                            {bloqueActivo
                              ? `Enviar propuesta personalizada (${
                                  modElegidaBloque === 'CAFE_HUB' ||
                                  modElegidaBloque === 'SEGUIMIENTO_PUNTO_ADHESION'
                                    ? `${cafeElegidoBloque.nombre} — ${cafeElegidoBloque.direccion}`
                                    : bloqueActivo.puntoEncuentroODireccion
                                }) y consolidar respuesta en 1 clic`
                              : 'Enviar mensajes de seguimiento o pedido estratégico de dirección/esquina y consolidar respuesta en 1 clic'}
                          </h4>
                          <p className="text-xs text-slate-700 mt-0.5">
                            Integra en un solo lugar la confirmación por bloque diario y la cola general de seguimiento (sin duplicar las alertas que ya tenés en el primer módulo de arriba). Cada respuesta que registres actualiza automáticamente la <strong>Pestaña 3 (Hoja de Ruta en Terreno)</strong> y Google Sheets.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {/* Selector de vista: Todos los pendientes de seguimiento o un bloque específico de la Agenda */}
                          <select
                            aria-label="Filtrar por Bloque de Agenda o Cola General"
                            value={bloqueAgendaActivoId || 'COLA_GENERAL'}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'COLA_GENERAL') {
                                setBloqueAgendaActivoId(null);
                              } else {
                                setBloqueAgendaActivoId(val);
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
                          >
                            <option value="COLA_GENERAL">
                              📋 Ver Toda la Cola de Seguimiento ({corteResultado.colaMensajes.length})
                            </option>
                            {corteResultado.agendaSugeridaDias.map((b) => (
                              <option key={b.id} value={b.id}>
                                📅 Bloque: {b.diaEtiqueta} · {b.barrio} ({b.franjaHoraria}) [{b.contactosIncluidos.length}]
                              </option>
                            ))}
                          </select>

                          {!bloqueActivo && (
                            <select
                              aria-label="Filtrar categoría de la cola de mensajes"
                              value={corteCategoriaFiltro}
                              onChange={(e) => setCorteCategoriaFiltro(e.target.value)}
                              className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-900"
                            >
                              <option value="Todas">
                                Todas las categorías (sin repetir módulo 1)
                              </option>
                              <option value="0.">
                                0. ⚠️ Pendientes Vencidos / Sin Confirmar ({corteResultado.metricas.alertasVencidasReprogramar})
                              </option>
                              <option value="1. Nuevo">1. Nuevos (1er Mensaje)</option>
                              <option value="2. Visita">2. Confirmar Visita Agendada</option>
                              <option value="3.">3. Cambió el Chip / Pedir Punto o Esquina</option>
                              <option value="4. Retiro">4. Retiro de Fichas (X1/X2/X3)</option>
                              <option value="5. Sin Respuesta">
                                5. Sin Respuesta +48h (Convocar a Café Hub)
                              </option>
                            </select>
                          )}

                          {bloqueActivo && (
                            <>
                              <select
                                aria-label="Cambiar modalidad del bloque activo"
                                value={modElegidaBloque}
                                onChange={(e) => {
                                  const nuevaMod = e.target.value as ModalidadEncuentroAgenda;
                                  setModalidadOverrideByBloque((prev) => ({
                                    ...prev,
                                    [bloqueActivo.id]: nuevaMod,
                                  }));
                                  setPropuestaEditedMessages((prev) => {
                                    const next = { ...prev };
                                    bloqueActivo.contactosIncluidos.forEach((c) => {
                                      delete next[`${bloqueActivo.id}-${c.id}`];
                                    });
                                    return next;
                                  });
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs font-bold"
                              >
                                <option value="CAFE_HUB">☕ Modalidad: Armar Café HUB</option>
                                <option value="PUERTA_A_PUERTA">🚶 Modalidad: Recorrido Puerta a Puerta</option>
                                <option value="SEGUIMIENTO_PUNTO_ADHESION">📍 Modalidad: Punto de Adhesión</option>
                                <option value="ENCUENTRO_SEDE">🏛️ Modalidad: Encuentro Semanal Sede</option>
                              </select>

                              {(modElegidaBloque === 'CAFE_HUB' ||
                                modElegidaBloque === 'SEGUIMIENTO_PUNTO_ADHESION') &&
                                cafesDelBarrioActivo.length > 0 && (
                                  <select
                                    aria-label="Cambiar Café HUB del bloque activo"
                                    value={`${cafeElegidoBloque.nombre}||${cafeElegidoBloque.direccion}`}
                                    onChange={(e) => {
                                      const found = cafesDelBarrioActivo.find(
                                        (cf) => `${cf.nombre}||${cf.direccion}` === e.target.value
                                      );
                                      if (found) {
                                        setCafeHubOverrideByBloque((prev) => ({
                                          ...prev,
                                          [bloqueActivo.id]: {
                                            nombre: found.nombre,
                                            direccion: found.direccion,
                                          },
                                        }));
                                        setPropuestaEditedMessages((prev) => {
                                          const next = { ...prev };
                                          bloqueActivo.contactosIncluidos.forEach((c) => {
                                            delete next[`${bloqueActivo.id}-${c.id}`];
                                          });
                                          return next;
                                        });
                                      }
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-950 text-xs font-bold"
                                  >
                                    {cafesDelBarrioActivo.map((cf, idxCf) => (
                                      <option
                                        key={`${bloqueActivo.id}-opt-${cf.nombre}-${cf.direccion}-${idxCf}`}
                                        value={`${cf.nombre}||${cf.direccion}`}
                                      >
                                        ☕ {cf.nombre} ({cf.direccion})
                                      </option>
                                    ))}
                                  </select>
                                )}

                              <button
                                type="button"
                                onClick={() => handleAbrirGrupoEnSeccion1(bloqueActivo)}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Abrir en Sección 1 ({bloqueActivo.contactosIncluidos.length})
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {itemsUnificados.length === 0 ? (
                        <p className="text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200">
                          No quedaron contactos adicionales pendientes en esta vista (o ya están arriba en el primer módulo listos para cargar su respuesta).
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {itemsUnificados.map(({ contact: c, categoriaCorte, razonRecomendacion, mensajeColaGeneral }) => {
                            const bloqueDeContacto =
                              bloqueActivo ||
                              corteResultado.agendaSugeridaDias.find((b) =>
                                b.contactosIncluidos.some((x) => x.id === c.id)
                              ) ||
                              corteResultado.agendaSugeridaDias[0];

                            const msgDefault = bloqueActivo
                              ? generarMensajePropuestaBloqueAgenda(
                                  c,
                                  bloqueActivo,
                                  profile,
                                  {
                                    modalidad: modElegidaBloque,
                                    cafeHubNombre: cafeElegidoBloque.nombre,
                                    cafeHubDireccion: cafeElegidoBloque.direccion,
                                  }
                                )
                              : mensajeColaGeneral ||
                                (bloqueDeContacto
                                  ? generarMensajePropuestaBloqueAgenda(c, bloqueDeContacto, profile)
                                  : '');

                            const msgKey = bloqueActivo ? `${bloqueActivo.id}-${c.id}` : `cola-${c.id}`;
                            const msgActual =
                              propuestaEditedMessages[msgKey] ??
                              corteEditedMessages[c.id] ??
                              msgDefault;
                            const isSent =
                              sentIdsInSession.has(c.id) || Boolean(c.ultimoMensajeCorteEnviadoAt);
                            const isMsgExpanded = expandirMensajeEnviadoIds.has(msgKey);
                            const logRsp = respuestasConsolidadasLog[c.id];
                            const bloqueRefParaConsolidar: BloqueAgendaRecomendado =
                              bloqueDeContacto || {
                                id: 'bloque-manual',
                                diaEtiqueta: 'Hoy',
                                fechaClave: obtenerPartesFechaHoraBA(ahoraCorteMs).ddmm,
                                franjaHoraria: '15:00 a 17:00 hs',
                                modalidad: 'PUERTA_A_PUERTA',
                                titulo: c.barrio,
                                puntoEncuentroODireccion: c.calleOCruce || c.barrio,
                                barrio: c.barrio,
                                contactosIncluidos: [c],
                                motivoClaro: '',
                              };

                            return (
                              <div
                                key={msgKey}
                                className={`p-3.5 rounded-xl border shadow-xs space-y-3 transition-all ${
                                  isSent
                                    ? 'bg-emerald-50/70 border-emerald-300'
                                    : 'bg-white border-slate-200'
                                }`}
                              >
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                                  {/* Datos del vecino y punto/dirección */}
                                  <div className="lg:col-span-4 space-y-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                          isSent
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-100 text-slate-800'
                                        }`}
                                      >
                                        {isSent ? '✓ 1. Mensaje enviado' : categoriaCorte}
                                      </span>
                                      <span className="font-mono text-xs font-bold text-slate-500">
                                        #{c.id}
                                      </span>
                                      <span className="font-bold text-sm text-slate-900">
                                        {c.nombreCompletoCorregido}
                                      </span>
                                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                                        {c.barrio}
                                      </span>
                                      {c.alertaVencido?.activa && (
                                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300">
                                          ⚠️ {c.alertaVencido.titulo}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs font-semibold text-slate-800 break-words">
                                      📍 Dirección / Punto en Col. G:{' '}
                                      <span className="text-emerald-900">
                                        {c.calleOCruce || c.comentario || 'Sin dirección aún (pedir esquina/cruce o proponer Café HUB)'}
                                      </span>
                                    </p>
                                    <p className="text-[11px] text-slate-600">
                                      Estado: <strong>{c.estadoFlujoEtiqueta}</strong> · Franja: <strong>{c.franjaHoraria}</strong>
                                      {razonRecomendacion ? ` · ${razonRecomendacion}` : ''}
                                    </p>
                                    {logRsp && (
                                      <p className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                                        ✓ Consolidado ({logRsp.hora} hs): {logRsp.etiqueta}
                                      </p>
                                    )}
                                  </div>

                                  {!isSent || isMsgExpanded ? (
                                    <>
                                      {/* Mensaje personalizado 1-a-1 sin metadatos internos */}
                                      <div className="lg:col-span-5 min-w-0">
                                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                          Mensaje 1-a-1 listo para enviar por WhatsApp:
                                        </label>
                                        <textarea
                                          aria-label={`Propuesta de agenda para ${c.nombreCompletoCorregido}`}
                                          rows={3}
                                          value={msgActual}
                                          onChange={(e) =>
                                            setPropuestaEditedMessages((prev) => ({
                                              ...prev,
                                              [msgKey]: e.target.value,
                                            }))
                                          }
                                          className="w-full p-2 text-xs border border-slate-300 rounded-lg bg-slate-50 text-slate-900 leading-relaxed"
                                        />
                                      </div>

                                      {/* Botones de envío 1-a-1 */}
                                      <div className="lg:col-span-3 flex flex-col gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleOpenWhatsApp(
                                              c,
                                              msgActual,
                                              bloqueActivo
                                                ? 'propuesta_bloque_agenda'
                                                : c.tipoPlantillaSugerida
                                            )
                                          }
                                          className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                                            isSent
                                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                          }`}
                                        >
                                          <Send className="w-3.5 h-3.5" />
                                          {isSent
                                            ? 'Reenviar por WhatsApp'
                                            : '1. Enviar por WhatsApp'}
                                        </button>
                                        {!isSent && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleOpenWhatsApp(
                                                c,
                                                msgActual,
                                                bloqueActivo
                                                  ? 'propuesta_bloque_agenda'
                                                  : c.tipoPlantillaSugerida,
                                                true
                                              )
                                            }
                                            className="w-full py-1.5 px-3 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                                          >
                                            ✓ Ya le escribí (Cargar respuesta)
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleCopyText(`prop-${msgKey}`, msgActual)}
                                          className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1"
                                        >
                                          {copiedId === `prop-${msgKey}` ? (
                                            <>
                                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                                              Texto Copiado
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3.5 h-3.5" />
                                              Copiar Mensaje
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="lg:col-span-8 flex items-center justify-between gap-2 bg-white border border-emerald-200 rounded-lg px-3 py-2">
                                      <span className="text-xs font-bold text-emerald-950">
                                        ✓ Paso 1 completado: ya le escribiste a {c.primerNombre}. Cuando te conteste, cargá su respuesta en el Paso 2 de abajo.
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandirMensajeEnviadoIds((prev) => {
                                            const next = new Set(prev);
                                            next.add(msgKey);
                                            return next;
                                          })
                                        }
                                        className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline shrink-0"
                                      >
                                        Ver / Reenviar mensaje
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Barra de Consolidación: Seleccionar Plan + Fijar Día, Turno y Dirección */}
                                <div className="pt-2 border-t border-slate-200/80">
                                  {renderSelectorPlanDiaTurno(c, bloqueRefParaConsolidar, 'lista')}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

              {/* CONSOLA DE SINCRONIZACIÓN DE MÁXIMA PRECISIÓN CON GOOGLE CALENDAR */}
              <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                {(() => {
                  const eventosVigentesUI = filtrarEventosCalendarVigentes(
                    calendarEvents,
                    ahoraCorteMs
                  );
                  return (
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-slate-900">
                            📅 Eventos vigentes de tu Google Calendar reflejados en la Agenda y Traslados ({eventosVigentesUI.length}):
                          </p>
                          <button
                            type="button"
                            onClick={() => void handleSincronizarCalendarPrecision()}
                            disabled={isSyncingCalendar}
                            className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${isSyncingCalendar ? 'animate-spin' : ''}`}
                            />
                            {isSyncingCalendar
                              ? 'Sincronizando Calendar...'
                              : 'Sincronizar Todos mis Calendars Ahora'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCalendarPrecisionModal((v) => !v)}
                            className="px-2.5 py-1 rounded-md border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-950 text-xs font-bold"
                          >
                            {showCalendarPrecisionModal
                              ? 'Ocultar Opciones de Precisión Calendar'
                              : '⚙️ ¿Falta algún evento de tu Calendar? Conectar iCal (.ics) / Pegar Agenda'}
                          </button>
                        </div>
                        {calendarSyncStatus && (
                          <p className="text-xs font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded">
                            {calendarSyncStatus}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {eventosVigentesUI.map((ev, idx) => (
                            <span
                              key={`${ev.id}-${ev.startIso || ev.fechaISO || ev.fecha || ''}-${idx}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-xs text-indigo-950"
                            >
                              <strong>
                                {ev.fecha || 'Hoy'} {ev.startTime}-{ev.endTime}:
                              </strong>{' '}
                              {ev.summary} ({ev.location || 'CABA'})
                              {ev.calendarName && (
                                <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded">
                                  {ev.calendarName}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setCalendarEvents((prev) =>
                                    prev.filter(
                                      (item) =>
                                        !(
                                          item.id === ev.id &&
                                          (item.startIso || item.fecha) ===
                                            (ev.startIso || ev.fecha)
                                        )
                                    )
                                  );
                                  setAhoraCorteMs(Date.now());
                                }}
                                className="text-indigo-500 hover:text-red-600 font-bold ml-1"
                                title="Quitar evento"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>

                  {/* Agregar compromiso puntual de Calendar con fecha y dirección */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="text"
                      value={newCalFecha}
                      onChange={(e) => setNewCalFecha(e.target.value)}
                      placeholder="Día (ej: 21/10)"
                      className="w-20 px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                    />
                    <input
                      type="text"
                      value={newCalSummary}
                      onChange={(e) => setNewCalSummary(e.target.value)}
                      placeholder="Nuevo evento (ej: Médico / Reunión)"
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    />
                    <input
                      type="text"
                      value={newCalLocation}
                      onChange={(e) => setNewCalLocation(e.target.value)}
                      placeholder="Dirección (ej: Cabildo 2040, Belgrano)"
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    />
                    <input
                      type="time"
                      value={newCalStart}
                      onChange={(e) => setNewCalStart(e.target.value)}
                      className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                    />
                    <input
                      type="time"
                      value={newCalEnd}
                      onChange={(e) => setNewCalEnd(e.target.value)}
                      className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleAgregarEventoCalendarLocal}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
                    >
                      + Sumar a Calendar
                    </button>
                  </div>
                </div>
                  );
                })()}

                {/* Panel desplegable de Máxima Precisión para Google Calendar (URL iCal .ics, Archivo .ics o Pegado Rápido) */}
                {showCalendarPrecisionModal && (
                  <div
                    data-testid="panel-precision-calendar"
                    className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold text-indigo-950">
                          Alternativas de Máxima Precisión para Reflejar el 100% de tus Eventos de Google Calendar (Principal + Secundarios + Recurrentes)
                        </h4>
                        <p className="text-xs text-slate-700 mt-0.5">
                          Si Google OAuth está bloqueado en tu cuenta o tenés eventos en calendarios secundarios, usá cualquiera de estas 3 vías directas con conversión automática al huso horario de Buenos Aires (UTC-3):
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCalendarPrecisionModal(false)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800"
                      >
                        Cerrar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Opción A: Dirección secreta iCal (.ics) en vivo */}
                      <div className="p-3 rounded-lg bg-white border border-indigo-200 space-y-2">
                        <p className="text-xs font-bold text-slate-900">
                          A) Enlace iCal (.ics) en Vivo (Recomendado · Sin OAuth)
                        </p>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          En Google Calendar (PC) abrí <strong>Configuración de tu calendario → Dirección secreta en formato iCal (.ics)</strong> y pegala acá:
                        </p>
                        <input
                          type="text"
                          value={calendarIcalUrlInput}
                          onChange={(e) => setCalendarIcalUrlInput(e.target.value)}
                          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-slate-50 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void handleSincronizarCalendarPrecision({
                              icalUrlOverride: calendarIcalUrlInput,
                            })
                          }
                          disabled={isSyncingCalendar || !calendarIcalUrlInput.trim()}
                          className="w-full py-1.5 px-3 rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold"
                        >
                          Sincronizar desde Enlace iCal (.ics)
                        </button>
                      </div>

                      {/* Opción B: Subir archivo .ics descargado de Google Calendar */}
                      <div className="p-3 rounded-lg bg-white border border-indigo-200 space-y-2">
                        <p className="text-xs font-bold text-slate-900">
                          B) Subir archivo .ics exportado de Google Calendar
                        </p>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Lee todos tus eventos puntuales y recurrentes semanales/diarios de las próximas 2 semanas con precisión exacta:
                        </p>
                        <label className="w-full py-2 px-3 rounded border border-dashed border-indigo-400 bg-indigo-50/50 hover:bg-indigo-100/60 text-indigo-950 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          Seleccionar archivo .ics
                          <input
                            type="file"
                            accept=".ics,text/calendar"
                            onChange={handleImportarArchivoIcsCalendar}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {/* Opción C: Pegar texto libre de tu agenda semanal */}
                      <div className="p-3 rounded-lg bg-white border border-indigo-200 space-y-2">
                        <p className="text-xs font-bold text-slate-900">
                          C) Pegar texto rápido de tu Agenda Semanal
                        </p>
                        <textarea
                          rows={2}
                          value={calendarQuickText}
                          onChange={(e) => setCalendarQuickText(e.target.value)}
                          placeholder={'Ej:\n21/10 11:00 - 12:30 Reunión | Cabildo 2040, Belgrano\n22/10 18:30 a 20:00 Sede | Chile 1408'}
                          className="w-full p-2 text-xs border border-slate-300 rounded bg-slate-50 font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleImportarTextoAgendaCalendar}
                          disabled={!calendarQuickText.trim()}
                          className="w-full py-1.5 px-3 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold"
                        >
                          Interpretar y Sumar Eventos
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {aiCorteText && (
              <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    Recomendación Táctica Generada por Gemini ({corteResultado.fechaHoraActualEtiqueta})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setAiCorteText('')}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Cerrar
                  </button>
                </div>
                <div className="text-xs sm:text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                  {aiCorteText}
                </div>
              </div>
            )}

            {/* MAPA DE PENDIENTES CABA INTEGRADO AL FINAL DE LA PESTAÑA "2. HACER CORTE Y PLAN HOY" (SIN HOJA DE RUTA NI CIRCUITOS DUPLICADOS) */}
            <div id="mapa-pendientes-caba-tab2" className="pt-4 border-t-2 border-slate-300 space-y-2">
              <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Ubicación Geoespacial de Pendientes, Cafés HUB y Eventos de Google Calendar
                  </span>
                  <h3 className="text-sm sm:text-base font-bold">
                    🗺️ Mapa de Pendientes CABA — Puntos Céntricos Café Hub y Rutas Casa x Casa
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('mapa');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shrink-0"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Ir a 3. Hoja de Ruta en Terreno</span>
                </button>
              </div>
              <InteractiveMapPanel
                mode="map_only"
                onGoToRouteTab={() => {
                  setActiveTab('mapa');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                contacts={contacts}
                clusters={microClusters}
                profile={profile}
                calendarEvents={calendarEvents}
                agendaBloques={corteResultado.agendaSugeridaDias}
                activeAgendaBloqueId={bloqueAgendaActivoId}
                onSelectAgendaBloque={(id: string) => setBloqueAgendaActivoId(id)}
                onOpenWhatsApp={(contact, text) => handleOpenWhatsApp(contact, text)}
                onSelectContactForEdit={(contact) => {
                  setSelectedContactId(contact.id);
                  setMobileBandejaView('detail');
                  setActiveTab('bandeja');
                }}
                onSelectCafeHubForBarrio={handleSelectCafeHubFromCatalog}
                onQuickStatusFromMap={(contactOrId, accion, detalleLugar) => {
                  const contact =
                    typeof contactOrId === 'string'
                      ? contacts.find((x) => x.id === contactOrId) || contacts[0]
                      : contactOrId;
                  if (!contact) return;
                  const idReg = `mapa-rsp-${Date.now()}-${contact.id}`;
                  const ahoraMs = Date.now();
                  setAhoraCorteMs(ahoraMs);
                  const horaStr = obtenerPartesFechaHoraBA(ahoraMs).hhmm;

                  let etiquetaAccion = 'Actualizado desde Mapa / Hoja de Ruta';
                  if (accion === 'YA_ADHIRIO') {
                    etiquetaAccion = '¡Ya Adhirió en terreno! (Excluido del mapa activo)';
                  } else if (accion === 'DEJE_FICHAS_EXTRAS' || accion === 'DEJE_FICHAS') {
                    etiquetaAccion = 'Adhirió + Se dejaron fichas extras para retirar';
                  } else if (accion === 'CONFIRMO_CAFE_HUB') {
                    etiquetaAccion = `Confirmó asistencia a Café HUB (${detalleLugar || contact.barrio})`;
                  } else if (accion === 'PASA_PUERTA_A_PUERTA') {
                    etiquetaAccion = 'Pasó a Recorrido Puerta a Puerta en su domicilio';
                  } else if (accion === 'REPROGRAMAR') {
                    etiquetaAccion = 'Reprogramar visita / No se encontraba en domicilio';
                  }

                  setRawContacts((prev) => {
                    const nextList = prev.map((row) => {
                      if (row.id !== contact.id) return row;
                      const procAntes = procesarContacto(row, profile, ahoraMs);
                      let nuevoAdhirio = row.adhirio;
                      let nuevoEstado: EstadoFlujo = row.estadoFlujo || procAntes.estadoFlujo;
                      let nuevoCom = row.comentario;

                      if (accion === 'YA_ADHIRIO') {
                        nuevoAdhirio = 'Sí';
                        nuevoEstado = 'YA_ADHIRIO_FIRMA_OK';
                        nuevoCom = row.comentario
                          ? `${row.comentario} · [Ya adhirió en ruta]`
                          : 'Ya adhirió en ruta';
                      } else if (accion === 'DEJE_FICHAS_EXTRAS' || accion === 'DEJE_FICHAS') {
                        nuevoAdhirio = 'Sí';
                        nuevoEstado = 'PENDIENTE_RETIRO_FICHAS';
                        nuevoCom = row.comentario
                          ? `${row.comentario} · [Dejé fichas extras para retirar]`
                          : 'Adhirió y se dejaron fichas extras para retirar';
                      } else if (accion === 'CONFIRMO_CAFE_HUB') {
                        nuevoEstado = 'PREFIERE_CAFE_HUB_O_SEDE';
                        if (detalleLugar && !row.comentario.includes(detalleLugar)) {
                          nuevoCom = row.comentario
                            ? `${row.comentario} · [Confirmó Café HUB: ${detalleLugar}]`
                            : `Confirmó Café HUB: ${detalleLugar}`;
                        }
                      } else if (accion === 'PASA_PUERTA_A_PUERTA') {
                        nuevoEstado = 'ENCUENTRO_CONFIRMADO';
                        nuevoCom = row.comentario
                          ? `${row.comentario} · [Declinó Café Hub -> Pasa a Puerta a Puerta]`
                          : 'Visita confirmada Puerta a Puerta en domicilio [Declinó Café Hub -> Pasa a Puerta a Puerta]';
                      } else if (accion === 'REPROGRAMAR') {
                        nuevoEstado = 'RESPONDIO_FALTA_DNI_O_ZONA';
                        nuevoCom = row.comentario
                          ? `${row.comentario} · [Reprogramar horario]`
                          : 'Pendiente reprogramar horario de visita';
                      }

                      const actualizado: RawContactRow = {
                        ...row,
                        rsp: 'Sí',
                        adhirio: nuevoAdhirio,
                        comentario: nuevoCom,
                        estadoFlujo: nuevoEstado,
                        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(nuevoEstado),
                        ultimoContacto: new Date(ahoraMs).toISOString().slice(0, 10),
                      };
                      const procDespues = procesarContacto(actualizado, profile, ahoraMs);
                      const registro: ControlEnvioRegistro = {
                        idRegistro: idReg,
                        contactId: actualizado.id,
                        nombre: procDespues.nombreCompletoCorregido,
                        barrio: actualizado.barrio,
                        telRaw: actualizado.telRaw,
                        tipoMensaje: `Mapa / Hoja de Ruta: ${etiquetaAccion}`,
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

                  setWorkspaceStatusMsg(
                    `✓ ${contact.nombreCompletoCorregido}: ${etiquetaAccion}. Agenda Día por Día, Hoja de Ruta y Google Sheets actualizados.`
                  );
                }}
              />
            </div>
          </div>
        )}

        {/* PASO 3: HOJA DE RUTA EN TERRENO · CASA X CASA Y CAFÉ HUB */}
        {activeTab === 'mapa' && (
          <InteractiveMapPanel
            mode="route_only"
            onBackToAgendaTab={() => {
              setActiveTab('corte');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            contacts={contacts}
            clusters={microClusters}
            profile={profile}
            calendarEvents={calendarEvents}
            agendaBloques={corteResultado.agendaSugeridaDias}
            activeAgendaBloqueId={bloqueAgendaActivoId}
            onSelectAgendaBloque={(id: string) => setBloqueAgendaActivoId(id)}
            onOpenWhatsApp={(contact, text) => handleOpenWhatsApp(contact, text)}
            onSelectContactForEdit={(contact) => {
              setSelectedContactId(contact.id);
              setMobileBandejaView('detail');
              setActiveTab('bandeja');
            }}
            onSelectCafeHubForBarrio={handleSelectCafeHubFromCatalog}
            onQuickStatusFromMap={(contactOrId, accion, detalleLugar) => {
              const contact =
                typeof contactOrId === 'string'
                  ? contacts.find((x) => x.id === contactOrId) || contacts[0]
                  : contactOrId;
              if (!contact) return;
              const idReg = `mapa-rsp-${Date.now()}-${contact.id}`;
              const ahoraMs = Date.now();
              setAhoraCorteMs(ahoraMs);
              const horaStr = obtenerPartesFechaHoraBA(ahoraMs).hhmm;

              let etiquetaAccion = 'Actualizado desde Mapa / Hoja de Ruta';
              if (accion === 'YA_ADHIRIO') {
                etiquetaAccion = '¡Ya Adhirió en terreno! (Excluido del mapa activo)';
              } else if (accion === 'DEJE_FICHAS_EXTRAS' || accion === 'DEJE_FICHAS') {
                etiquetaAccion = 'Adhirió + Se dejaron fichas extras para retirar';
              } else if (accion === 'CONFIRMO_CAFE_HUB') {
                etiquetaAccion = `Confirmó asistencia a Café HUB (${detalleLugar || contact.barrio})`;
              } else if (accion === 'PASA_PUERTA_A_PUERTA') {
                etiquetaAccion = 'Pasó a Recorrido Puerta a Puerta en su domicilio';
              } else if (accion === 'REPROGRAMAR') {
                etiquetaAccion = 'Reprogramar visita / No se encontraba en domicilio';
              }

              setRawContacts((prev) => {
                const nextList = prev.map((row) => {
                  if (row.id !== contact.id) return row;
                  const procAntes = procesarContacto(row, profile, ahoraMs);
                  let nuevoAdhirio = row.adhirio;
                  let nuevoEstado: EstadoFlujo = row.estadoFlujo || procAntes.estadoFlujo;
                  let nuevoCom = row.comentario;

                  if (accion === 'YA_ADHIRIO') {
                    nuevoAdhirio = 'Sí';
                    nuevoEstado = 'YA_ADHIRIO_FIRMA_OK';
                    nuevoCom = row.comentario
                      ? `${row.comentario} · [Ya adhirió en ruta]`
                      : 'Ya adhirió en ruta';
                  } else if (accion === 'DEJE_FICHAS_EXTRAS' || accion === 'DEJE_FICHAS') {
                    nuevoAdhirio = 'Sí';
                    nuevoEstado = 'PENDIENTE_RETIRO_FICHAS';
                    nuevoCom = row.comentario
                      ? `${row.comentario} · [Dejé fichas extras para retirar]`
                      : 'Adhirió y se dejaron fichas extras para retirar';
                  } else if (accion === 'CONFIRMO_CAFE_HUB') {
                    nuevoEstado = 'PREFIERE_CAFE_HUB_O_SEDE';
                    if (detalleLugar && !row.comentario.includes(detalleLugar)) {
                      nuevoCom = row.comentario
                        ? `${row.comentario} · [Confirmó Café HUB: ${detalleLugar}]`
                        : `Confirmó Café HUB: ${detalleLugar}`;
                    }
                  } else if (accion === 'PASA_PUERTA_A_PUERTA') {
                    nuevoEstado = 'ENCUENTRO_CONFIRMADO';
                    nuevoCom = row.comentario
                      ? `${row.comentario} · [Declinó Café Hub -> Pasa a Puerta a Puerta]`
                      : 'Visita confirmada Puerta a Puerta en domicilio [Declinó Café Hub -> Pasa a Puerta a Puerta]';
                  } else if (accion === 'REPROGRAMAR') {
                    nuevoEstado = 'RESPONDIO_FALTA_DNI_O_ZONA';
                    nuevoCom = row.comentario
                      ? `${row.comentario} · [Reprogramar horario]`
                      : 'Pendiente reprogramar horario de visita';
                  }

                  const actualizado: RawContactRow = {
                    ...row,
                    rsp: 'Sí',
                    adhirio: nuevoAdhirio,
                    comentario: nuevoCom,
                    estadoFlujo: nuevoEstado,
                    estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(nuevoEstado),
                    ultimoContacto: new Date(ahoraMs).toISOString().slice(0, 10),
                  };
                  const procDespues = procesarContacto(actualizado, profile, ahoraMs);
                  const registro: ControlEnvioRegistro = {
                    idRegistro: idReg,
                    contactId: actualizado.id,
                    nombre: procDespues.nombreCompletoCorregido,
                    barrio: actualizado.barrio,
                    telRaw: actualizado.telRaw,
                    tipoMensaje: `Mapa / Hoja de Ruta: ${etiquetaAccion}`,
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

              setWorkspaceStatusMsg(
                `✓ ${contact.nombreCompletoCorregido}: ${etiquetaAccion}. Mapa, tiempos de ruta y Google Sheets actualizados.`
              );
            }}
          />
        )}

        {/* PASO 4: INSTRUCTIVO CELULAR / PC + SOLUCIÓN ERROR 400 + PERFIL Y NUEVOS BARRIOS */}
        {activeTab === 'acceso_y_config' && (
          <div className="space-y-6">
            {/* 1. INSTRUCTIVO: CÓMO ACCEDER DESDE EL CELULAR O PC SIN ENTRAR A GOOGLE AI STUDIO */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-900">
                    Acceso Rápido en Terreno (Celular y Escritorio)
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">
                    Cómo abrir e instalar Rutas POPURRÍ en tu Celular o Computadora sin entrar a Google AI Studio
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Podés usar esta aplicación como una App nativa en la calle (con WhatsApp directo en tu teléfono) o en tu escritorio.
                  </p>
                </div>
              </div>

              {/* URL Directa de la App */}
              <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-amber-300 uppercase">
                    Enlace Directo de tu App (Guardalo en Favoritos o mandátelo por WhatsApp)
                  </p>
                  <p className="text-sm font-mono text-slate-100 mt-1 break-all">
                    {window.location.origin}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText('app-url-copy', window.location.origin)
                  }
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-lg shrink-0 flex items-center gap-1.5"
                >
                  {copiedId === 'app-url-copy' ? (
                    <>
                      <Check className="w-4 h-4" />
                      Enlace Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copiar Enlace de la App
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    1. En tu Celular (Android / Chrome)
                  </div>
                  <ol className="text-xs text-slate-700 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>
                      Mandate el enlace de arriba a tu propio WhatsApp y abrilo en <strong>Google Chrome</strong> en tu celular.
                    </li>
                    <li>
                      Tocá el ícono de los <strong>tres puntitos (⋮)</strong> arriba a la derecha en Chrome.
                    </li>
                    <li>
                      Elegí <strong>&quot;Agregar a la pantalla principal&quot;</strong> o <strong>&quot;Instalar aplicación&quot;</strong>.
                    </li>
                    <li>
                      ¡Listo! Te queda el ícono <strong>Rutas POPURRÍ</strong> en tu teléfono y al tocar &quot;Enviar WA&quot; te abre directo la app de WhatsApp de tu celular.
                    </li>
                  </ol>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                    <Smartphone className="w-4 h-4 text-slate-900" />
                    2. En iPhone (iOS / Safari)
                  </div>
                  <ol className="text-xs text-slate-700 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>
                      Abrí el enlace directo de la app en <strong>Safari</strong> desde tu iPhone.
                    </li>
                    <li>
                      Tocá el botón <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba en la barra inferior).
                    </li>
                    <li>
                      Deslizá hacia abajo y tocá <strong>&quot;Agregar a Inicio&quot; (Add to Home Screen)</strong>.
                    </li>
                    <li>
                      Tocá <strong>Agregar</strong> arriba a la derecha para entrar siempre con 1 toque sin pasar por AI Studio.
                    </li>
                  </ol>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                    <Monitor className="w-4 h-4 text-indigo-600" />
                    3. En tu Computadora (Chrome / Edge)
                  </div>
                  <ol className="text-xs text-slate-700 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>
                      Abrí el enlace directo en una pestaña nueva de Chrome o Edge (fuera del panel de edición de AI Studio).
                    </li>
                    <li>
                      En la barra de direcciones (arriba a la derecha), hacé clic en el ícono de <strong>Instalar / Crear acceso directo</strong> (o menú <strong>⋮ → Guardar y compartir → Crear acceso directo</strong>).
                    </li>
                    <li>
                      Marcá <strong>&quot;Abrir como ventana&quot;</strong>: así la tenés en tu Escritorio o Barra de Tareas como un programa independiente junto a WhatsApp Web.
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            {/* 2. SOLUCIÓN DEFINITIVA AL ERROR 400 (DÓNDE ESTÁ "TEST USERS" Y POR QUÉ SALTA ADVANCED PROTECTION) */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="border-b border-slate-200 pb-4">
                <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900">
                  Respuesta a tu captura: gen-lang-client-0359820832.firebaseapp.com · Error 400: policy_enforced
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-1">
                  ¿Dónde está &quot;Test users&quot; ahora en Google Cloud y por qué igual seguía apareciendo el cartel?
                </h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/60 space-y-2.5">
                  <h3 className="text-sm font-bold text-slate-900">
                    A. ¿Dónde escondió Google la sección &quot;Test users&quot;? (Nueva interfaz Google Auth Platform)
                  </h3>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Google actualizó la consola y reemplazó la vieja pantalla única de <em>OAuth consent screen</em> por el nuevo menú <strong>Google Auth Platform</strong>. Por eso no te aparecía en la primera pantalla:
                  </p>
                  <ol className="text-xs text-slate-800 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>
                      Entrá a{' '}
                      <a
                        href="https://console.cloud.google.com/auth/audience?project=gen-lang-client-0359820832"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold underline text-slate-900"
                      >
                        console.cloud.google.com/auth/audience?project=gen-lang-client-0359820832
                      </a>
                    </li>
                    <li>
                      En la columna izquierda de <strong>Google Auth Platform</strong>, hacé clic en la pestaña <strong>&quot;Audience&quot; (Público / Audiencia)</strong> (está debajo de <em>Overview</em> y <em>Branding</em>).
                    </li>
                    <li>
                      Ahí adentro, si el estado dice <em>Testing</em>, bajá hasta el subtítulo <strong>&quot;Test users&quot; (Usuarios de prueba)</strong> y tocá el botón <strong>&quot;+ Add users&quot;</strong> para escribir <code className="bg-white px-1 rounded">cesarincong@gmail.com</code>.
                    </li>
                  </ol>
                </div>

                <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/50 space-y-2.5">
                  <h3 className="text-sm font-bold text-slate-900">
                    B. ¡Importante! Por qué con Protección Avanzada el botón &quot;Actualizar desde Sheets&quot; es mejor que el popup OAuth
                  </h3>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Tu cuenta <code className="bg-white px-1 rounded">cesarincong@gmail.com</code> tiene activado el <strong>Programa de Protección Avanzada de Google</strong>. Esa política de seguridad bloquea por diseño (con <code className="bg-white px-1 rounded">Error 400: policy_enforced</code>) cualquier popup OAuth de proyectos en desarrollo (como <code className="bg-white px-1 rounded">gen-lang-client-0359820832.firebaseapp.com</code>) aunque estés en <em>Test users</em>, salvo que desactives la Protección Avanzada en{' '}
                    <a
                      href="https://myaccount.google.com/advancedprotection"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-semibold"
                    >
                      myaccount.google.com/advancedprotection
                    </a>
                    .
                  </p>
                  <p className="text-xs font-semibold text-emerald-950">
                    Para que NUNCA más reniegues con ese popup:
                  </p>
                  <ul className="text-xs text-slate-800 space-y-1 list-disc list-inside leading-relaxed">
                    <li>
                      <strong>Para leer tu Google Sheets en 1 clic:</strong> En tu archivo de Google Sheets tocá <em>Compartir → Cualquier persona con el enlace (Lector)</em>, pegá el link en el botón <strong>&quot;Vincular / Guardar Sheets&quot;</strong> de arriba y usá siempre el botón <strong>&quot;Actualizar desde Sheets&quot;</strong>. ¡No usa OAuth y nunca da Error 400!
                    </li>
                    <li>
                      <strong>Para guardar de vuelta en el Sheet y leer tu Google Calendar sin OAuth:</strong> Copiá el mini-código de <strong>Google Apps Script</strong> de acá abajo dentro de tu propia planilla (<em>Extensiones → Apps Script</em>). Como corre adentro de tu propio Google Drive, la Protección Avanzada lo autoriza siempre.
                    </li>
                  </ul>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText('apps-script-code', CODIGO_APPS_SCRIPT_PUENTE)
                      }
                      className="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 flex items-center gap-1.5"
                    >
                      {copiedId === 'apps-script-code' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Código Apps Script Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copiar Código Puente para tu Google Sheet
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. PERFIL PERSONALIZABLE Y GESTIÓN DINÁMICA DE BARRIOS / CAFÉS HUB */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="text-base font-bold text-slate-900">
                  Perfil Personalizable del Promotor y Punto Base (Km 0)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nombre
                    </label>
                    <input
                      type="text"
                      value={profile.nombrePromotor}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, nombrePromotor: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Apellido
                    </label>
                    <input
                      type="text"
                      value={profile.apellidoPromotor}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, apellidoPromotor: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Dirección de Partida Habitual (Km 0 para calcular rutas)
                    </label>
                    <input
                      type="text"
                      value={profile.direccionPartida}
                      onChange={(e) => {
                        const nuevaDir = e.target.value;
                        setProfile((p) => {
                          const actualizado = { ...p, direccionPartida: nuevaDir };
                          const coords = resolverCoordenadasPartidaPerfil(actualizado);
                          return {
                            ...actualizado,
                            latPartida: coords.lat,
                            lngPartida: coords.lng,
                          };
                        });
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="text-base font-bold text-slate-900">
                  Cafés Hub por Barrio (Sumá nuevos barrios a medida que crezca la planilla)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <input
                    type="text"
                    value={nuevoBarrioHubNombre}
                    onChange={(e) => setNuevoBarrioHubNombre(e.target.value)}
                    placeholder="Barrio (ej: Caballito, Belgrano...)"
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                  />
                  <input
                    type="text"
                    value={nuevoBarrioHubCafe}
                    onChange={(e) => setNuevoBarrioHubCafe(e.target.value)}
                    placeholder="Nombre del Café Hub"
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                  />
                  <input
                    type="text"
                    value={nuevoBarrioHubEsquina}
                    onChange={(e) => setNuevoBarrioHubEsquina(e.target.value)}
                    placeholder="Esquina céntrica (ej: Acoyte y Rivadavia)"
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nuevoBarrioHubHorarios}
                      onChange={(e) => setNuevoBarrioHubHorarios(e.target.value)}
                      placeholder="Franja sugerida (ej: Viernes 15 a 18 hs)"
                      className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAgregarNuevoBarrioHub}
                      className="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded hover:bg-slate-800 shrink-0"
                    >
                      + Guardar
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {Object.values(profile.cafesPorBarrio).map((cafe) => (
                    <div
                      key={cafe.barrio}
                      className="py-2 flex items-center justify-between gap-2"
                    >
                      <div>
                        <span className="font-bold text-slate-900">
                          {cafe.barrio}:
                        </span>{' '}
                        <span className="text-slate-700 font-semibold">{cafe.nombre}</span>{' '}
                        <span className="text-slate-500">({cafe.esquina})</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {cafe.urlGoogleMaps && (
                          <a
                            href={cafe.urlGoogleMaps}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-semibold hover:bg-emerald-100 inline-flex items-center gap-1"
                          >
                            Maps
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <span className="text-slate-500 font-mono">
                          {cafe.horariosSugeridos}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. CATÁLOGO OFICIAL DE LUGARES CAFÉ HUB (DESCARGADO DEL GOOGLE MAPS COMPARTIDO DEL USUARIO) */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-900 inline-flex items-center gap-1">
                    <Coffee className="w-3.5 h-3.5" />
                    Lista Oficial Google Maps Compartido · &quot;Café de especialidad&quot;
                  </span>
                  <h3 className="text-base font-bold text-slate-900 mt-1">
                    Catálogo de Cafés HUB Oficiales ({CATALOGO_CAFES_HUB_CABA.length} en CABA · {CATALOGO_CAFES_ESPECIALIDAD_HUB.length} totales en tu JSON)
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Todos los circuitos del Mapa (Paso 3) y las propuestas de punto de encuentro seleccionan automáticamente el café más cercano de esta lista oficial. También podés fijar cualquiera como Café Hub principal de su barrio en 1 clic.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filtroCatalogoCafeBarrio}
                    onChange={(e) => setFiltroCatalogoCafeBarrio(e.target.value)}
                    aria-label="Filtrar catálogo de Cafés Hub por barrio"
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    <option value="Todos">
                      Todos los lugares ({CATALOGO_CAFES_ESPECIALIDAD_HUB.length})
                    </option>
                    <option value="SOLO_CABA">
                      Sólo dentro de CABA ({CATALOGO_CAFES_HUB_CABA.length})
                    </option>
                    {Array.from(
                      new Set(CATALOGO_CAFES_ESPECIALIDAD_HUB.map((c) => c.barrio))
                    )
                      .sort()
                      .map((b) => (
                        <option key={b} value={b}>
                          {b} (
                          {
                            CATALOGO_CAFES_ESPECIALIDAD_HUB.filter(
                              (c) => c.barrio === b
                            ).length
                          }
                          )
                        </option>
                      ))}
                  </select>
                  <input
                    type="text"
                    value={busquedaCatalogoCafe}
                    onChange={(e) => setBusquedaCatalogoCafe(e.target.value)}
                    placeholder="Buscar por nombre o calle..."
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-1">
                {CATALOGO_CAFES_ESPECIALIDAD_HUB.filter((c) => {
                  if (filtroCatalogoCafeBarrio === 'SOLO_CABA' && !c.esCaba) {
                    return false;
                  }
                  if (
                    filtroCatalogoCafeBarrio !== 'Todos' &&
                    filtroCatalogoCafeBarrio !== 'SOLO_CABA' &&
                    c.barrio !== filtroCatalogoCafeBarrio
                  ) {
                    return false;
                  }
                  if (busquedaCatalogoCafe.trim()) {
                    const q = busquedaCatalogoCafe.toLowerCase();
                    return (
                      c.nombre.toLowerCase().includes(q) ||
                      c.direccion.toLowerCase().includes(q) ||
                      c.barrio.toLowerCase().includes(q)
                    );
                  }
                  return true;
                }).map((cafe) => {
                  const esActivoEnBarrio =
                    profile.cafesPorBarrio[cafe.barrio]?.nombre.includes(
                      cafe.nombre
                    );
                  return (
                    <div
                      key={cafe.id}
                      className={`p-3 rounded-lg border text-xs flex flex-col justify-between gap-2 ${
                        esActivoEnBarrio
                          ? 'border-emerald-500 bg-emerald-50/50'
                          : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-slate-900 text-sm">
                            {cafe.nombre}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              cafe.esCaba
                                ? 'bg-slate-200 text-slate-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {cafe.barrio}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-1">{cafe.direccion}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                        <a
                          href={cafe.urlGoogleMaps}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-800 font-semibold hover:underline inline-flex items-center gap-1"
                        >
                          Ver en Google Maps
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        {cafe.esCaba && (
                          <button
                            type="button"
                            onClick={() => handleSelectCafeHubFromCatalog(cafe)}
                            className={`px-2.5 py-1 rounded font-bold text-[11px] ${
                              esActivoEnBarrio
                                ? 'bg-emerald-700 text-white'
                                : 'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                          >
                            {esActivoEnBarrio
                              ? '★ Hub Activo'
                              : `Usar en ${cafe.barrio}`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal para Enviar el 1er Mensaje a un Contacto Nuevo */}
      {showPrimerMensajeModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-primer-mensaje-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                  Primer Contacto · Adhesión {profile.partidoLegal}
                </span>
                <h2
                  id="modal-primer-mensaje-title"
                  className="text-lg font-bold text-slate-900 mt-0.5"
                >
                  Enviar 1er Mensaje y Sumar a la Planilla
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPrimerMensajeModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="nuevo-nombre-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Celda de Nombre y Apellido (podés dejarla vacía si en el Sheet sólo está el teléfono)
                </label>
                <input
                  id="nuevo-nombre-input"
                  type="text"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Ej: GOMEZ ORTIZ MARIA BELEN (o dejalo vacío si no tiene nombre)"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                {nuevoNombre.trim().length > 1 ? (
                  <div className="mt-1.5 p-2 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Saludo detectado:{' '}
                      <strong>
                        &quot;Hola, {analizarYCorregirNombreCompleto(nuevoNombre).vocativo}&quot;
                      </strong>
                    </span>
                    <span className="font-mono text-[11px] text-emerald-800">
                      Nombre corregido:{' '}
                      {analizarYCorregirNombreCompleto(nuevoNombre).nombreCompletoOrdenado}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1.5 p-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-950">
                    <strong>Modo Teléfono Sin Nombre activo:</strong> se incluirá automáticamente una pregunta sutil y cálida (explicando que quedó en blanco la casilla al pasar el formulario) para obtener su <strong>nombre y apellido</strong> sin generar desconfianza.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="nuevo-tel-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Teléfono / WhatsApp
                  </label>
                  <input
                    id="nuevo-tel-input"
                    type="text"
                    value={nuevoTel}
                    onChange={(e) => setNuevoTel(e.target.value)}
                    placeholder="Ej: 11 4567 8901"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="nuevo-barrio-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Barrio (podés escribir cualquier barrio de CABA)
                  </label>
                  <input
                    id="nuevo-barrio-input"
                    type="text"
                    list="barrios-caba-list"
                    value={nuevoBarrio}
                    onChange={(e) => setNuevoBarrio(e.target.value)}
                    placeholder="Ej: Palermo, Saavedra, Caballito..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  />
                  <datalist id="barrios-caba-list">
                    {Object.keys(COORDENADAS_BARRIOS_CABA).map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label
                  htmlFor="nuevo-comentario-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nota o Dirección (opcional)
                </label>
                <input
                  id="nuevo-comentario-input"
                  type="text"
                  value={nuevoComentario}
                  onChange={(e) => setNuevoComentario(e.target.value)}
                  placeholder="Ej: (Av. Cabildo y Juramento) prefiere por la tarde"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPrimerMensajeModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCrearYEnviarPrimerMensaje}
                disabled={!nuevoNombre.trim() && !nuevoTel.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Agregar y Abrir WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación Obligatoria antes de escribir en Google Workspace */}
      {pendingWorkspaceAction && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              {pendingWorkspaceAction.title}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {pendingWorkspaceAction.description}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingWorkspaceAction(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = pendingWorkspaceAction.onConfirm;
                  setPendingWorkspaceAction(null);
                  try {
                    await fn();
                  } catch (e) {
                    setWorkspaceStatusMsg(
                      e instanceof Error ? e.message : 'Error ejecutando acción'
                    );
                  }
                }}
                className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800"
              >
                Confirmar y Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Navegación Inferior Fija para Móvil (md:hidden) */}
      <nav
        aria-label="Navegación inferior móvil"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800 px-1.5 py-1.5 grid grid-cols-4 gap-1 shadow-2xl"
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab('bandeja');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[11px] font-bold transition-colors ${
            activeTab === 'bandeja'
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <MessageSquare className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="truncate max-w-full">1. Contactos</span>
          <span className="text-[10px] font-mono opacity-80">
            ({kpis.pendientesActivos})
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('corte');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[11px] font-bold transition-colors ${
            activeTab === 'corte'
              ? 'bg-amber-400 text-slate-950 shadow-sm'
              : 'text-amber-300 hover:text-amber-200'
          }`}
        >
          <Zap className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="truncate max-w-full">2. Corte Hoy</span>
          <span className="text-[10px] font-mono opacity-85">
            ({corteResultado.colaMensajes.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('mapa');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[11px] font-bold transition-colors ${
            activeTab === 'mapa'
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Navigation className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="truncate max-w-full">3. Hoja Ruta</span>
          <span className="text-[10px] font-mono opacity-80">
            (Terreno)
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('acceso_y_config');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[11px] font-bold transition-colors ${
            activeTab === 'acceso_y_config'
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Smartphone className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="truncate max-w-full">4. Ajustes</span>
          <span className="text-[10px] font-mono opacity-80">
            Cafés Hub
          </span>
        </button>
      </nav>

      {/* Modal de Automatización Anti-Bloqueo Multi-Etapa (Python + IA Gemini < 45 msjs) */}
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
