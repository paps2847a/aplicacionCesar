import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ClipboardCheck,
  Camera,
  X,
  CheckCircle2,
  Copy,
  Check,
  RotateCcw,
  Upload,
  Plus,
  Loader2,
  Sparkles,
  UserCheck,
  ExternalLink,
  Send,
} from 'lucide-react';
import type {
  AutoFirstMessageCampaign,
  AutoFirstMessageConfig,
  CalendarEventItem,
  Contact,
  ControlEnvioRegistro,
  EstatusReporteApp,
  FichaEscaneadaRow,
  ModoColaAutomatizacionWA,
  RawContactRow,
  ResultadoEnvioAuto,
  SharedAppStateSnapshot,
  VoiceProfile,
} from './types';
import {
  DEFAULT_VOICE_PROFILE,
  INITIAL_CALENDAR_EVENTS,
  INITIAL_RAW_CONTACTS,
} from './data/estatusPopurriData';
import {
  actualizarDatosContactoEnApp,
  aplicarResultadoEnvioAutoAContacto,
  construirMicroClusters,
  crearEnlaceWhatsApp,
  deduplicarEventosCalendar,
  exportarContactosACSV,
  exportarContactosACSVExcelPuntoYComa,
  exportarContactosATSVParaExcel,
  filtrarEventosCalendarVigentes,
  fusionarContactosDesdeSheetsConControl,
  generarColaEnvioAutomaticoPrimerContacto,
  generarCorteEstrategicoLocal,
  generarPanelTareasDiarias,
  inferirBarrioDesdeTextoCABA,
  limpiarErroresFalsosRestriccionWA,
  normalizarTelefonoWA,
  obtenerEtiquetaEstadoFlujo,
  obtenerPartesFechaHoraBA,
  parsearICalEventos,
  parsearTSVoCSVContactos,
  procesarContacto,
  registrarEnvioMensajeContacto,
  sincronizarBarrioConDireccionComentario,
  sumarDiasAFechaBA,
} from './utils/logic';
import { ModernNavbar, ModernTabType } from './components/layout/ModernNavbar';
import { CandidatePipelineView } from './components/pipeline/CandidatePipelineView';
import { PlanHoyModernView } from './components/corte/PlanHoyModernView';
import { WhatsAppWebAutomationPanel } from './components/WhatsAppWebAutomationPanel';
import { ModernSettingsView } from './components/config/ModernSettingsView';
import { AutoFirstMessageModal } from './components/AutoFirstMessageModal';
import { InteractiveMapPanel } from './components/InteractiveMapPanel';
import { LoginModal, AppUserSession } from './components/auth/LoginModal';
import { AdminDashboardView, VolunteerUser } from './components/admin/AdminDashboardView';

const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1IjsWFTYXnFZPo76GVbEKngG5ksU5ZLpwxddV1cj6F8k/edit?gid=1772654652#gid=1772654652';

const OFFICIAL_ADHESIONES_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbxkUk-wAbfQY3JUooDEMVYC41FP08sV9xwFG0XbVF70v4sE1wc0qGR-jZ4H28U6i9sA/exec';

const OFFICIAL_DAILY_REPORT_FORM_ID =
  '1FAIpQLSciwCjJcAckOD9GwrE8jUko7IOCvAdQjv6EVBqUBHkx8scYaQ';

const ALL_7_ESTATUS_REPORTE: EstatusReporteApp[] = [
  'Adhirió',
  'Encuentro Confirmado',
  'En conversación (Falta dato/confirmar)',
  'Número inválido / No existe WA',
  'Sin DNI en CABA',
  'No vive en CABA',
  'Baja / No contactar',
];

const createEmptyFichaRow = (idx = 1): FichaEscaneadaRow => ({
  id: `scan-${Date.now()}-${idx}`,
  apellidoYNombre: '',
  nombrePadre: '',
  nombreMadre: '',
  dni: '',
  matriculaTipo: 'DNI',
  domicilio: '',
  lugarYFecha: `CABA ${new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })}`.toUpperCase(),
  partido: 'REGENERACIÓN',
  tieneFirma: true,
  barrio: '',
  fechaNacimiento: '',
  profesionUOficio: '',
  telefono: '',
  observaciones: '',
});

const normalizarTokensFicha = (texto: string): string[] =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);

const buscarCandidatoDeFichaEnPadron = (
  row: FichaEscaneadaRow,
  listaContactos: RawContactRow[]
): RawContactRow | undefined => {
  const telNorm = normalizarTelefonoWA(row.telefono);
  if (telNorm) {
    const porTel = listaContactos.find((c) => normalizarTelefonoWA(c.telRaw) === telNorm);
    if (porTel) return porTel;
  }

  const tokensFicha = normalizarTokensFicha(row.apellidoYNombre);
  if (tokensFicha.length >= 2) {
    // Coincidencia exacta de todos los tokens (soporta "Apellido y Nombre" vs "Nombre Apellido")
    const porTokensCompletos = listaContactos.find((c) => {
      const tokensContacto = normalizarTokensFicha(c.nombre);
      if (tokensContacto.length === 0) return false;
      return (
        tokensFicha.every((tf) => tokensContacto.includes(tf)) ||
        (tokensContacto.length >= 2 && tokensContacto.every((tc) => tokensFicha.includes(tc)))
      );
    });
    if (porTokensCompletos) return porTokensCompletos;
  }

  // Fallback: coincidencia de calle + altura en domicilio junto con al menos un apellido/nombre
  const tokensDom = normalizarTokensFicha(row.domicilio);
  const alturaDom = String(row.domicilio || '').match(/\b(\d{2,5})\b/)?.[1];
  if (alturaDom && tokensDom.length >= 1 && tokensFicha.length >= 1) {
    const porDomicilioYNombre = listaContactos.find((c) => {
      const dirContacto = `${c.calleOCruce || ''} ${c.comentario || ''}`;
      if (!dirContacto.includes(alturaDom)) return false;
      const tokensDirC = normalizarTokensFicha(dirContacto);
      const tokensNomC = normalizarTokensFicha(c.nombre);
      const calleCoincide = tokensDom.some((td) => td.length >= 4 && tokensDirC.includes(td));
      const nombreCoincide = tokensFicha.some((tn) => tokensNomC.includes(tn));
      return calleCoincide && nombreCoincide;
    });
    if (porDomicilioYNombre) return porDomicilioYNombre;
  }

  return undefined;
};

export default function App() {
  // 1. Navegación Principal, Usuario Activo y Foco de Contacto
  const [activeTab, setActiveTab] = useState<ModernTabType>('pipeline');
  const [focusedContactId, setFocusedContactId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUserSession>(() => {
    try {
      const saved = localStorage.getItem('popurri_current_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.username) return parsed;
      }
    } catch {}
    return {
      id: 'cesar',
      username: 'cesar',
      nombre: 'César Rincón',
      role: 'volunteer',
      barrioAsignado: 'Palermo',
    };
  });
  const [showLoginModal, setShowLoginModal] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return Boolean(params.get('invite'));
    } catch {
      return false;
    }
  });
  const [volunteersList, setVolunteersList] = useState<VolunteerUser[]>([
    {
      id: 'cesar',
      username: 'cesar',
      nombre: 'César Rincón',
      role: 'volunteer',
      telefono: '5491130730854',
      barrioAsignado: 'Palermo',
    },
    {
      id: 'admin',
      username: 'admin',
      nombre: 'Default / Admin (Coordinación)',
      role: 'admin',
    },
  ]);

  // 2. Estado de Datos y Persistencia
  const [rawContacts, setRawContacts] = useState<RawContactRow[]>(() => INITIAL_RAW_CONTACTS);
  const [controlEnvios, setControlEnvios] = useState<ControlEnvioRegistro[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>(
    () => INITIAL_CALENDAR_EVENTS
  );
  const [profile, setProfile] = useState<VoiceProfile>(() => DEFAULT_VOICE_PROFILE);

  // 3. Ajustes de Conectividad
  const [sheetUrlInput, setSheetUrlInput] = useState<string>(DEFAULT_SHEET_URL);
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState<string>('');
  const [calendarIcalUrlInput, setCalendarIcalUrlInput] = useState<string>('');
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState<boolean>(false);
  const [globalToast, setGlobalToast] = useState<{
    text: string;
    type: 'ok' | 'warn' | 'info';
  } | null>(null);

  // 4. Automatización WhatsApp Web y Modales Operativos
  const [whatsAppStatus, setWhatsAppStatus] = useState<string>('DISCONNECTED');
  const [showAutoFirstMessageModal, setShowAutoFirstMessageModal] = useState<boolean>(false);
  const [modoColaBotActivo, setModoColaBotActivo] =
    useState<ModoColaAutomatizacionWA>('PRIMER_CONTACTO');
  const [showDailyCloseModal, setShowDailyCloseModal] = useState<boolean>(false);
  const [copiedDailySummary, setCopiedDailySummary] = useState<boolean>(false);
  const [dailyStatusFilter, setDailyStatusFilter] = useState<EstatusReporteApp | 'TODOS'>('TODOS');
  const [adhesionesExtrasHoy, setAdhesionesExtrasHoy] = useState<number>(0);
  const [selectedCierreDate, setSelectedCierreDate] = useState<string>(() => {
    return obtenerPartesFechaHoraBA(Date.now()).isoDate;
  });
  const [excluidosCierreHoyIds, setExcluidosCierreHoyIds] = useState<string[]>(() => {
    try {
      const hoyIso = obtenerPartesFechaHoraBA(Date.now()).isoDate;
      const saved = localStorage.getItem(`popurri_excluidos_cierre_${hoyIso}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isSubmittingForms, setIsSubmittingForms] = useState<boolean>(false);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [isScanningFicha, setIsScanningFicha] = useState<boolean>(false);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanModalFeedback, setScanModalFeedback] = useState<{
    type: 'ok' | 'info' | 'warn';
    text: string;
  } | null>(null);
  const [scannedRows, setScannedRows] = useState<FichaEscaneadaRow[]>(() => [
    createEmptyFichaRow(1),
  ]);

  // 5. Reloj de Corte Territorial
  const [ahoraCorteMs, setAhoraCorteMs] = useState<number>(() => Date.now());

  // 6. Sistema Universal de Deshacer (8 segundos)
  const [undoAction, setUndoAction] = useState<{
    contactId: string;
    nombre: string;
    prevRow: RawContactRow;
    description: string;
    expiresAt: number;
  } | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState<number>(8);
  const isUndoRunningRef = useRef<boolean>(false);

  useEffect(() => {
    if (!undoAction) return;
    const interval = setInterval(() => {
      const diffMs = undoAction.expiresAt - Date.now();
      const secs = Math.max(0, Math.ceil(diffMs / 1000));
      setUndoSecondsLeft(secs);
      if (diffMs <= 0) {
        setUndoAction(null);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [undoAction]);

  const showNotice = useCallback(
    (text: string, type: 'ok' | 'warn' | 'info' = 'ok') => {
      setGlobalToast({ text, type });
      setTimeout(() => {
        setGlobalToast((prev) => (prev?.text === text ? null : prev));
      }, 5500);
    },
    []
  );

  // ----------------------------------------------------
  // CARGA INICIAL DESDE SQLITE / SERVIDOR
  // ----------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    async function loadInitialState() {
      try {
        const res = await fetch('/api/state');
        if (res.ok) {
          const data = await res.json();
          if (data?.state && isMounted) {
            const s = data.state as SharedAppStateSnapshot;
            if (Array.isArray(s.rawContacts) && s.rawContacts.length > 0) {
              setRawContacts(s.rawContacts);
            }
            if (Array.isArray(s.controlEnvios)) {
              setControlEnvios(s.controlEnvios);
            }
            // Respetar arreglo vacío si el usuario eliminó los eventos de muestra y filtrar sólo vigentes
            if (Array.isArray(s.calendarEvents)) {
              setCalendarEvents(
                filtrarEventosCalendarVigentes(deduplicarEventosCalendar(s.calendarEvents), Date.now())
              );
            }
            if (s.profile) setProfile(s.profile);
            if (s.sheetUrlInput) setSheetUrlInput(s.sheetUrlInput);
            if (s.appsScriptUrlInput) setAppsScriptUrlInput(s.appsScriptUrlInput);
            if (s.calendarIcalUrlInput) setCalendarIcalUrlInput(s.calendarIcalUrlInput);
          }
        }
      } catch (err) {
        console.warn('Iniciando con datos de respaldo local:', err);
      }
    }
    void loadInitialState();
    return () => {
      isMounted = false;
    };
  }, []);

  const refreshVolunteers = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.users) && data.users.length > 0) {
          setVolunteersList(data.users);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    void refreshVolunteers();
  }, [refreshVolunteers]);

  // ----------------------------------------------------
  // MONITOR DE ESTADO EN VIVO DE WHATSAPP WEB
  // ----------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const checkWA = async () => {
      try {
        const res = await fetch(
          `/api/whatsapp/status?userId=${encodeURIComponent(currentUser?.id || 'cesar')}`
        );
        if (res.ok && !cancelled) {
          const d = await res.json();
          setWhatsAppStatus(d.status || 'DISCONNECTED');
        }
      } catch {
        // Silencioso en caso de desconexión momentánea
      }
    };
    void checkWA();
    const timer = setInterval(checkWA, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentUser?.id]);

  // ----------------------------------------------------
  // DERIVADOS MEMOIZADOS (Dominio)
  // ----------------------------------------------------
  const contacts: Contact[] = useMemo(() => {
    const ultimoEnvioPorId = new Map<string, string>();
    const ultimoEnvioPorTel = new Map<string, string>();
    for (const reg of controlEnvios) {
      const ts = reg.fechaHora || '';
      if (!ts) continue;
      const cid = String(reg.contactId || '').trim();
      if (cid && !ultimoEnvioPorId.has(cid)) {
        ultimoEnvioPorId.set(cid, ts);
      }
      const telNorm = normalizarTelefonoWA(reg.telRaw || '');
      if (telNorm && !ultimoEnvioPorTel.has(telNorm)) {
        ultimoEnvioPorTel.set(telNorm, ts);
      }
    }

    return rawContacts.map((r) => {
      const cid = String(r.id || '').trim();
      const telNorm = normalizarTelefonoWA(r.telRaw || r.tel || '');
      const tsControl =
        r.ultimoMensajeCorteEnviadoAt ||
        ultimoEnvioPorId.get(cid) ||
        (telNorm ? ultimoEnvioPorTel.get(telNorm) : undefined);
      const enrichedRaw: RawContactRow = tsControl
        ? { ...r, ultimoMensajeCorteEnviadoAt: tsControl }
        : r;
      return procesarContacto(enrichedRaw, profile, ahoraCorteMs);
    });
  }, [rawContacts, controlEnvios, profile, ahoraCorteMs]);

  const kpis = useMemo(() => {
    const adheridos = contacts.filter(
      (c) => c.adhirio === 'Sí' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK'
    ).length;
    const vencidos = contacts.filter(
      (c) => Boolean(c.alertaVencido?.activa) && c.adhirio !== 'Sí'
    ).length;
    return {
      total: contacts.length,
      adheridos,
      vencidos,
    };
  }, [contacts]);

  const corteResultado = useMemo(() => {
    return generarCorteEstrategicoLocal(
      contacts,
      profile,
      'Todos',
      calendarEvents,
      ahoraCorteMs
    );
  }, [contacts, profile, calendarEvents, ahoraCorteMs]);

  const panelTareasDiarias = useMemo(() => {
    return generarPanelTareasDiarias(
      contacts,
      corteResultado,
      controlEnvios,
      profile,
      ahoraCorteMs,
      'AUTO_MISMO_DIA',
      excluidosCierreHoyIds
    );
  }, [contacts, corteResultado, controlEnvios, profile, ahoraCorteMs, excluidosCierreHoyIds]);

  const fechaCierreRefMs = useMemo(() => {
    try {
      const parts = selectedCierreDate.split('-');
      if (parts.length === 3) {
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0).getTime();
      }
    } catch {}
    return ahoraCorteMs;
  }, [selectedCierreDate, ahoraCorteMs]);

  const panelTareasDiariasCierre = useMemo(() => {
    return generarPanelTareasDiarias(
      contacts,
      corteResultado,
      controlEnvios,
      profile,
      fechaCierreRefMs,
      'AUTO_MISMO_DIA',
      excluidosCierreHoyIds
    );
  }, [contacts, corteResultado, controlEnvios, profile, fechaCierreRefMs, excluidosCierreHoyIds]);

  const defaultAutoConfig: AutoFirstMessageConfig = useMemo(
    () => ({
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
    }),
    []
  );

  const autoCampaignForPanel: AutoFirstMessageCampaign = useMemo(() => {
    return generarColaEnvioAutomaticoPrimerContacto(contacts, defaultAutoConfig, profile);
  }, [contacts, defaultAutoConfig, profile]);

  const microClusters = useMemo(() => {
    return construirMicroClusters(contacts, 15, 'Todos', profile, ahoraCorteMs);
  }, [contacts, profile, ahoraCorteMs]);

  const todosLosBarrios = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) {
      if (c.barrio && c.barrio !== 'Sin barrio' && c.barrio !== 'Todos') {
        set.add(c.barrio);
      }
    }
    return ['Todos', ...Array.from(set).sort()];
  }, [contacts]);

  // ----------------------------------------------------
  // HANDLERS DE OPERACIÓN & PERSISTENCIA
  // ----------------------------------------------------

  const rawContactsRef = useRef<RawContactRow[]>(rawContacts);
  rawContactsRef.current = rawContacts;
  const controlEnviosRef = useRef<ControlEnvioRegistro[]>(controlEnvios);
  controlEnviosRef.current = controlEnvios;
  const activePushCountRef = useRef<number>(0);
  const editEpochRef = useRef<number>(0);
  const recentLocalEditsByIdRef = useRef<
    Map<string, { timestamp: number; row: RawContactRow }>
  >(new Map());
  const lastSeenSheetRowsByIdRef = useRef<Map<string, RawContactRow>>(new Map());
  const deletedContactIdsRef = useRef<Set<string>>(new Set());

  // Push en vivo de una fila modificada a Google Sheets (vía gsheets CLI directo + fallback Apps Script)
  const pushUpdateToGoogleSheets = useCallback(
    async (
      updatedRow: RawContactRow,
      actionLabel = 'edicion_app',
      preserveIdentityColumns = false
    ) => {
      const idKey = String(updatedRow.id || '').trim();
      if (idKey) {
        recentLocalEditsByIdRef.current.set(idKey, {
          timestamp: Date.now(),
          row: updatedRow,
        });
        lastSeenSheetRowsByIdRef.current.set(idKey, updatedRow);
      }
      activePushCountRef.current += 1;
      editEpochRef.current += 1;

      const proc = procesarContacto(updatedRow, profile);
      const horarioSheet =
        updatedRow.horarioEncuentro !== undefined
          ? updatedRow.horarioEncuentro
          : updatedRow.horaInicio && updatedRow.horaFin && updatedRow.horaInicio !== updatedRow.horaFin
          ? `${updatedRow.horaInicio} a ${updatedRow.horaFin}`
          : updatedRow.horaInicio || '';
      const direccionSheet =
        updatedRow.calleOCruce !== undefined
          ? updatedRow.pisoDepto && !updatedRow.calleOCruce.includes(updatedRow.pisoDepto)
            ? `${updatedRow.calleOCruce} (${updatedRow.pisoDepto})`
            : updatedRow.calleOCruce
          : undefined;
      const itemUpdate = {
        id: updatedRow.id,
        contactId: updatedRow.id,
        nombre: updatedRow.nombre || proc.nombreCompletoCorregido,
        barrio: updatedRow.barrio,
        tel: updatedRow.telRaw,
        telRaw: updatedRow.telRaw,
        rsp: updatedRow.rsp,
        adhirio: updatedRow.adhirio,
        diasEncuentro: updatedRow.diasEncuentro ?? '',
        horarioEncuentro: horarioSheet ?? '',
        calleOCruce: direccionSheet ?? '',
        comentario: updatedRow.comentario,
        estado: proc.estadoFlujoEtiqueta,
        estadoFlujo: proc.estadoFlujoEtiqueta,
        action: actionLabel,
        preserveIdentityColumns,
      };
      try {
        await fetch('/api/sheets/push-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appsScriptUrl: appsScriptUrlInput.trim(),
            sheetUrlOrId: sheetUrlInput.trim() || DEFAULT_SHEET_URL,
            action: 'updateRow',
            payload: itemUpdate,
            updates: [itemUpdate],
          }),
        });
      } catch {
        // Silencioso en background
      } finally {
        activePushCountRef.current = Math.max(0, activePushCountRef.current - 1);
        editEpochRef.current += 1;
      }
    },
    [appsScriptUrlInput, sheetUrlInput, profile]
  );

  // Actualización atómica de un contacto (Dominio inteligente + SQLite + Google Sheets)
  const handleUpdateContact = useCallback(
    async (contactId: string, updates: Partial<Contact>) => {
      const cambiosInput: Partial<RawContactRow> = {};
      if (updates.nombre !== undefined) cambiosInput.nombre = updates.nombre;
      if (updates.barrio !== undefined) cambiosInput.barrio = updates.barrio;
      if (updates.telRaw !== undefined || updates.tel !== undefined) {
        cambiosInput.telRaw = updates.telRaw ?? updates.tel;
      }
      if (updates.rsp !== undefined) cambiosInput.rsp = updates.rsp;
      if (updates.adhirio !== undefined) cambiosInput.adhirio = updates.adhirio;
      if (updates.comentario !== undefined) cambiosInput.comentario = updates.comentario;
      if (updates.calleOCruce !== undefined) cambiosInput.calleOCruce = updates.calleOCruce;
      if (updates.diasEncuentro !== undefined) cambiosInput.diasEncuentro = updates.diasEncuentro;
      if (updates.horaInicio !== undefined) cambiosInput.horaInicio = updates.horaInicio;
      if (updates.horaFin !== undefined) cambiosInput.horaFin = updates.horaFin;
      if (updates.horarioEncuentro !== undefined) {
        cambiosInput.horarioEncuentro = updates.horarioEncuentro;
      }
      if (updates.pisoDepto !== undefined) cambiosInput.pisoDepto = updates.pisoDepto;
      if (updates.fichasExtrasCantidad !== undefined) {
        cambiosInput.fichasExtrasCantidad = updates.fichasExtrasCantidad;
      }
      if (updates.retiroConfirmado !== undefined) {
        cambiosInput.retiroConfirmado = updates.retiroConfirmado;
      }
      if (updates.fechaEstadoPuntoSede !== undefined) {
        cambiosInput.fechaEstadoPuntoSede = updates.fechaEstadoPuntoSede;
      }
      if (updates.estadoFlujo !== undefined) cambiosInput.estadoFlujo = updates.estadoFlujo;
      if (updates.vocativoOverride !== undefined) {
        cambiosInput.vocativoOverride = updates.vocativoOverride;
      }
      if (updates.primerContactoEnviado !== undefined) {
        cambiosInput.primerContactoEnviado = updates.primerContactoEnviado;
      }
      if (updates.fechaAdhesion !== undefined) {
        cambiosInput.fechaAdhesion = updates.fechaAdhesion;
      }
      if (updates.ultimoMensajeCorteEnviadoAt !== undefined) {
        cambiosInput.ultimoMensajeCorteEnviadoAt = updates.ultimoMensajeCorteEnviadoAt;
      }
      if (updates.alertaVencidoOcultaFecha !== undefined) {
        cambiosInput.alertaVencidoOcultaFecha = updates.alertaVencidoOcultaFecha;
      }
      if (updates.actualizadoEnAppAt !== undefined) {
        cambiosInput.actualizadoEnAppAt = updates.actualizadoEnAppAt;
      }
      if (updates.asignadoA !== undefined) {
        cambiosInput.asignadoA = updates.asignadoA;
      }
      if (updates.asignadoFecha !== undefined) {
        cambiosInput.asignadoFecha = updates.asignadoFecha;
      }

      const preserveIdentityColumns =
        updates.nombre === undefined &&
        updates.barrio === undefined &&
        updates.telRaw === undefined &&
        updates.tel === undefined &&
        updates.calleOCruce === undefined;

      const contactoActual = rawContactsRef.current.find(
        (c) => String(c.id) === String(contactId)
      );
      const resultadoCalc = contactoActual
        ? actualizarDatosContactoEnApp(contactoActual, cambiosInput)
        : null;
      const rowCalculada = resultadoCalc ? resultadoCalc.actualizado : null;

      editEpochRef.current += 1;
      if (rowCalculada) {
        const idKeyClean = String(contactId).trim();
        recentLocalEditsByIdRef.current.set(idKeyClean, {
          timestamp: Date.now(),
          row: rowCalculada,
        });
      }

      setRawContacts((prev) =>
        prev.map((c) => {
          if (String(c.id) !== String(contactId)) return c;
          return rowCalculada || actualizarDatosContactoEnApp(c, cambiosInput).actualizado;
        })
      );

      if (rowCalculada) {
        void pushUpdateToGoogleSheets(
          rowCalculada,
          'actualizacion_contacto',
          preserveIdentityColumns
        );
      }

      if (!isUndoRunningRef.current && contactoActual) {
        const nom = (rowCalculada?.nombre || contactoActual.nombre || `Contacto #${contactId}`).trim();
        const partesCambio: string[] = [];
        if (
          rowCalculada?.estadoFlujo &&
          rowCalculada.estadoFlujo !== contactoActual.estadoFlujo
        ) {
          partesCambio.push(
            `Estado → "${obtenerEtiquetaEstadoFlujo(rowCalculada.estadoFlujo)}"`
          );
        } else if (updates.adhirio === 'Sí' && contactoActual.adhirio !== 'Sí') {
          partesCambio.push('Marcado como ✓ Firmó');
        }
        if (
          resultadoCalc?.barrioAutocorregido &&
          resultadoCalc.barrioAnterior &&
          resultadoCalc.barrioFinal
        ) {
          partesCambio.push(
            `Barrio auto-corregido: ${resultadoCalc.barrioAnterior} → ${resultadoCalc.barrioFinal}`
          );
        } else if (
          updates.barrio !== undefined &&
          updates.barrio.trim() !== (contactoActual.barrio || '').trim()
        ) {
          partesCambio.push(`Barrio → ${updates.barrio.trim()}`);
        }
        if (
          updates.comentario !== undefined &&
          updates.comentario.trim() !== (contactoActual.comentario || '').trim()
        ) {
          partesCambio.push('Comentario/Dirección actualizado');
        }
        if (
          updates.nombre !== undefined &&
          updates.nombre.trim() !== (contactoActual.nombre || '').trim()
        ) {
          partesCambio.push(`Nombre → ${updates.nombre.trim()}`);
        }
        const desc =
          partesCambio.length > 0 ? partesCambio.join(' · ') : 'Datos actualizados';

        setUndoAction({
          contactId: String(contactId),
          nombre: nom,
          prevRow: { ...contactoActual },
          description: desc,
          expiresAt: Date.now() + 8000,
        });
        setUndoSecondsLeft(8);
        showNotice(`✓ Guardado #${contactId} (${nom}): ${desc}`, 'ok');
      }

      try {
        const payload = rowCalculada || cambiosInput;
        await fetch(`/api/contacts/${contactId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error('Error persistiendo contacto en SQLite:', err);
      }
    },
    [pushUpdateToGoogleSheets, showNotice]
  );

  // Deshacer el cambio recién hecho dentro de la ventana de 8 segundos
  const handleUndo = useCallback(async () => {
    if (!undoAction) return;
    const { contactId, nombre, prevRow } = undoAction;
    setUndoAction(null);
    isUndoRunningRef.current = true;
    try {
      editEpochRef.current += 1;
      recentLocalEditsByIdRef.current.set(String(contactId).trim(), {
        timestamp: Date.now(),
        row: prevRow,
      });
      setRawContacts((prev) =>
        prev.map((c) => (String(c.id) === String(contactId) ? prevRow : c))
      );
      void pushUpdateToGoogleSheets(prevRow, 'deshacer_cambio', false);
      await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prevRow),
      });
      showNotice(`↩ Se deshizo el cambio en ${nombre}.`, 'info');
    } catch (err) {
      console.error('Error al deshacer cambio:', err);
      showNotice('⚠️ No se pudo deshacer el cambio anterior.', 'warn');
    } finally {
      isUndoRunningRef.current = false;
    }
  }, [undoAction, pushUpdateToGoogleSheets, showNotice]);

  // Limpiar notas de falsos errores de restricción o timeouts en contactos
  const handleCleanFalseErrors = useCallback(() => {
    const { actualizados, limpiadosCount } = limpiarErroresFalsosRestriccionWA(rawContactsRef.current);
    if (limpiadosCount > 0) {
      setRawContacts(actualizados);
      void fetch('/api/contacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: actualizados }),
      });
      showNotice(`🧹 Se limpiaron notas de falsos errores en ${limpiadosCount} contacto(s).`, 'ok');
    } else {
      showNotice('No se encontraron contactos con notas de falsos errores para limpiar.', 'info');
    }
  }, [showNotice]);

  // Crear un nuevo contacto desde la App o el Escáner de Fichas
  const handleCreateContact = useCallback(
    async (nuevo: {
      nombre: string;
      barrio: string;
      telRaw: string;
      calleOCruce?: string;
      comentario?: string;
      adhirio?: 'Sí' | 'No' | 'Pendiente';
      rsp?: 'Sí' | 'No' | 'Nuevo';
    }) => {
      const maxId = rawContactsRef.current.reduce((acc, r) => {
        const num = parseInt(String(r.id), 10);
        return Number.isFinite(num) && num > acc ? num : acc;
      }, 0);
      const nextId = String(maxId + 1);
      const hoyBA = obtenerPartesFechaHoraBA();
      const calle = (nuevo.calleOCruce || '').trim();
      const comBase = (nuevo.comentario || '').trim();
      const comFinal =
        calle && !comBase.toLowerCase().includes(calle.toLowerCase())
          ? comBase
            ? `${calle} | ${comBase}`
            : calle
          : comBase;

      const rawNuevo: RawContactRow = sincronizarBarrioConDireccionComentario({
        id: nextId,
        nombre: nuevo.nombre.trim() || `Contacto #${nextId}`,
        barrio: nuevo.barrio.trim() || 'Palermo',
        telRaw: nuevo.telRaw.trim(),
        rsp: nuevo.rsp || (nuevo.adhirio === 'Sí' ? 'Sí' : 'Nuevo'),
        adhirio: nuevo.adhirio || 'Pendiente',
        primerContactoEnviado: nuevo.adhirio === 'Sí',
        comentario: comFinal,
        calleOCruce: calle || undefined,
        estadoFlujo:
          nuevo.adhirio === 'Sí' ? 'YA_ADHIRIO_FIRMA_OK' : 'SIN_CONTACTAR_1ER_MSJ',
        fechaAgregado: hoyBA.isoDate,
        fechaAdhesion: nuevo.adhirio === 'Sí' ? hoyBA.isoDate : undefined,
        actualizadoEnAppAt: new Date().toISOString(),
      });

      editEpochRef.current += 1;
      recentLocalEditsByIdRef.current.set(nextId, {
        timestamp: Date.now(),
        row: rawNuevo,
      });

      setRawContacts((prev) => [rawNuevo, ...prev]);
      setFocusedContactId(nextId);

      void pushUpdateToGoogleSheets(rawNuevo, 'nuevo_contacto', false);

      try {
        await fetch('/api/contacts/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: [rawNuevo] }),
        });
        showNotice(`✓ Contacto #${nextId} (${rawNuevo.nombre}) creado y guardado.`);
      } catch (err) {
        console.error('Error guardando nuevo contacto:', err);
      }
    },
    [pushUpdateToGoogleSheets, showNotice]
  );

  // Eliminar un contacto desde la App (Solo Admin: borra en React, SQLite y Google Sheets)
  const handleDeleteContact = useCallback(
    async (contactId: string) => {
      const idKey = String(contactId || '').trim();
      if (!idKey) return;

      const targetRow = rawContactsRef.current.find((c) => String(c.id).trim() === idKey);
      const label = targetRow?.nombre || `Contacto #${idKey}`;

      deletedContactIdsRef.current.add(idKey);
      recentLocalEditsByIdRef.current.delete(idKey);
      lastSeenSheetRowsByIdRef.current.delete(idKey);
      editEpochRef.current += 1;

      setRawContacts((prev) => prev.filter((c) => String(c.id).trim() !== idKey));

      try {
        await fetch('/api/admin/delete-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId: idKey,
            sheetUrlOrId: sheetUrlInput,
            appsScriptUrl: appsScriptUrlInput,
          }),
        });
        showNotice(
          `🗑️ Contacto #${idKey} (${label}) eliminado de la App, SQLite y Google Sheets.`,
          'ok'
        );
      } catch (err) {
        console.error('Error eliminando contacto:', err);
        showNotice(`⚠️ Contacto #${idKey} eliminado en la App, pero hubo un error al sincronizar.`, 'warn');
      }
    },
    [sheetUrlInput, appsScriptUrlInput, showNotice]
  );

  // Envío directo por WhatsApp Web (Simulación humana + avance inteligente de estado sin regresiones)
  const handleSendDirectWA = useCallback(
    async (
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
          let nuevoLog: ControlEnvioRegistro | null = null;
          let rowActualizada: RawContactRow | null = null;

          setRawContacts((prev) =>
            prev.map((c) => {
              if (String(c.id) !== String(contactId)) return c;
              const hoyISO = new Date().toISOString().slice(0, 10);
              const {
                actualizado,
                estadoAnteriorEtiqueta,
                estadoNuevo,
                estadoNuevoEtiqueta,
              } = registrarEnvioMensajeContacto(c, 'auto', hoyISO, message);
              const procDespues = procesarContacto(actualizado, profile);
              nuevoLog = {
                idRegistro: `wa-direct-${Date.now()}-${actualizado.id}`,
                contactId: actualizado.id,
                nombre: procDespues.nombreCompletoCorregido,
                barrio: actualizado.barrio,
                telRaw: actualizado.telRaw,
                tipoMensaje: 'Mensaje directo WA Web',
                estadoAnterior: estadoAnteriorEtiqueta,
                estadoNuevo,
                estadoNuevoEtiqueta,
                rspNuevo: (actualizado.rsp as any) || 'Sí',
                adhirioNuevo: (actualizado.adhirio as any) || 'Pendiente',
                comentario: actualizado.comentario,
                fechaHora: new Date().toLocaleTimeString('es-AR', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                sincronizadoSheets: true,
              };
              rowActualizada = actualizado;
              return actualizado;
            })
          );

          if (nuevoLog) {
            setControlEnvios((prevLogs) => [nuevoLog!, ...prevLogs].slice(0, 150));
            void fetch('/api/control-envios', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(nuevoLog),
            });
          }
          if (rowActualizada) {
            const idKeyClean = String((rowActualizada as RawContactRow).id || '').trim();
            if (idKeyClean) {
              recentLocalEditsByIdRef.current.set(idKeyClean, {
                timestamp: Date.now(),
                row: rowActualizada,
              });
            }
            void fetch(
              `/api/contacts/${encodeURIComponent(String((rowActualizada as RawContactRow).id))}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rowActualizada),
              }
            ).catch(() => {});
            void pushUpdateToGoogleSheets(rowActualizada, 'mensaje_wa_enviado', true);
          }
          return true;
        } else if (data?.resultado === 'NUMERO_INEXISTENTE') {
          let rowInvalida: RawContactRow | null = null;
          setRawContacts((prev) =>
            prev.map((c) => {
              if (String(c.id) !== String(contactId)) return c;
              const actualizado = aplicarResultadoEnvioAutoAContacto(
                c,
                'NUMERO_INEXISTENTE',
                data.detalle || 'El número no existe en WhatsApp'
              );
              rowInvalida = actualizado;
              return actualizado;
            })
          );
          if (rowInvalida) {
            const idKeyClean = String((rowInvalida as RawContactRow).id || '').trim();
            if (idKeyClean) {
              recentLocalEditsByIdRef.current.set(idKeyClean, {
                timestamp: Date.now(),
                row: rowInvalida,
              });
            }
            void fetch(
              `/api/contacts/${encodeURIComponent(String((rowInvalida as RawContactRow).id))}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rowInvalida),
              }
            ).catch(() => {});
            void pushUpdateToGoogleSheets(rowInvalida, 'numero_inexistente_wa', true);
            showNotice(
              `🚫 El número de #${contactId} (${nombre}) no existe en WhatsApp. Marcado como 11. Baja / Número Inválido.`,
              'warn'
            );
          }
          return false;
        }
        return false;
      } catch {
        return false;
      }
    },
    [profile, pushUpdateToGoogleSheets, showNotice]
  );

  // Sincronización en vivo con Google Sheets (Pestaña Control) — Manual y Automática en Segundo Plano
  const handleActualizarDesdeSheets = useCallback(
    async (
      overrideSheetUrl?: string,
      overrideAppsScriptUrl?: string,
      silentMode: boolean = false
    ) => {
      if (isSyncingSheets) return;
      if (silentMode && activePushCountRef.current > 0) return;

      const epochAtStart = editEpochRef.current;
      if (!silentMode) setIsSyncingSheets(true);

      const targetSheet = (overrideSheetUrl ?? sheetUrlInput).trim() || DEFAULT_SHEET_URL;
      const targetScript = (overrideAppsScriptUrl ?? appsScriptUrlInput).trim();

      try {
        const keysControl = new Set<string>();
        for (const reg of controlEnviosRef.current) {
          const tipoStr = `${reg.tipoMensaje || ''} ${reg.estadoNuevoEtiqueta || ''} ${reg.comentario || ''}`;
          const esFalloReintento = /fallo wa web|pendiente reintento|error_envio/i.test(tipoStr);
          if (esFalloReintento) continue;
          const esBajaInex =
            reg.estadoNuevo === 'DESCARTADO_O_BAJA' ||
            /inexistente|no existe en whatsapp|baja|inválido/i.test(tipoStr);
          if (reg.contactId) {
            const idClean = String(reg.contactId).trim();
            keysControl.add(`id:${idClean}`);
            if (esBajaInex) keysControl.add(`baja_id:${idClean}`);
          }
          const tNorm = normalizarTelefonoWA(reg.telRaw || '');
          if (tNorm) {
            keysControl.add(`tel:${tNorm}`);
            if (esBajaInex) keysControl.add(`baja_tel:${tNorm}`);
          }
        }

        const res = await fetch('/api/sheets/fetch-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheetUrlOrId: targetSheet,
            appsScriptUrl: targetScript,
          }),
        });

        // Si durante la lectura ocurrió una edición local en la App, descartar esta lectura silenciosa
        if (
          silentMode &&
          (activePushCountRef.current > 0 || editEpochRef.current !== epochAtStart)
        ) {
          return;
        }

        const rawText = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(rawText.trim());
        } catch {
          // Ignorar HTML
        }

        if (data && data.ok) {
          let parsed: RawContactRow[] = [];
          if (data.source === 'apps_script' && Array.isArray(data.rows)) {
            const textTsv = data.rows
              .map((r: unknown[]) => r.map((cell) => String(cell ?? '')).join('\t'))
              .join('\n');
            parsed = parsearTSVoCSVContactos(textTsv, true);
          } else if (data.csvText) {
            parsed = parsearTSVoCSVContactos(data.csvText, true);
          }

          if (parsed.length > 0) {
            const currentContacts = rawContactsRef.current;
            const { contactosFusionados: rawMerged } = fusionarContactosDesdeSheetsConControl(
              parsed,
              currentContacts,
              keysControl,
              !silentMode,
              lastSeenSheetRowsByIdRef.current
            );
            const nextSeenMap = new Map<string, RawContactRow>();
            for (const p of parsed) {
              if (p.id) nextSeenMap.set(String(p.id).trim(), p);
            }
            lastSeenSheetRowsByIdRef.current = nextSeenMap;

            const nowMs = Date.now();
            const contactosFusionados = rawMerged
              .filter((row) => !deletedContactIdsRef.current.has(String(row.id || '').trim()))
              .map((row) => {
                const idKey = String(row.id || '').trim();
                const recentLocal = recentLocalEditsByIdRef.current.get(idKey);
                if (
                  recentLocal &&
                  (activePushCountRef.current > 0 || nowMs - recentLocal.timestamp < 600000)
                ) {
                  return recentLocal.row;
                }
                return row;
              });

            // Verificar si hubo algún cambio real respecto del estado en memoria
            const hasDiff =
              contactosFusionados.length !== currentContacts.length ||
              contactosFusionados.some((c, i) => {
                const prev = currentContacts[i];
                if (!prev) return true;
                return (
                  String(c.id) !== String(prev.id) ||
                  c.estadoFlujo !== prev.estadoFlujo ||
                  c.estadoFlujoEtiqueta !== prev.estadoFlujoEtiqueta ||
                  (c.comentario || '') !== (prev.comentario || '') ||
                  (c.diasEncuentro || '') !== (prev.diasEncuentro || '') ||
                  (c.horarioEncuentro || '') !== (prev.horarioEncuentro || '') ||
                  (c.horaInicio || '') !== (prev.horaInicio || '') ||
                  (c.horaFin || '') !== (prev.horaFin || '') ||
                  (c.calleOCruce || '') !== (prev.calleOCruce || '') ||
                  c.adhirio !== prev.adhirio ||
                  c.rsp !== prev.rsp ||
                  c.nombre !== prev.nombre ||
                  c.barrio !== prev.barrio ||
                  c.telRaw !== prev.telRaw
                );
              });

            if (hasDiff || !silentMode) {
              setRawContacts(contactosFusionados);
              await fetch('/api/contacts/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contacts: contactosFusionados, replaceAll: true }),
              });
            }

            if (!silentMode) {
              showNotice(
                `✓ Sincronizado con Google Sheets: ${contactosFusionados.length} contactos actualizados y alineados con los 14 estados en Columna H.`,
                'ok'
              );
            }
          } else if (!silentMode) {
            showNotice(
              'Se conectó con Google Sheets pero no se detectaron filas nuevas.',
              'info'
            );
          }
        } else if (!silentMode) {
          showNotice(
            `⚠️ La planilla requiere permiso de lectura o configurar el Puente Apps Script en Configuración (${
              data?.error || 'Acceso privado'
            }). Base local activa (${rawContactsRef.current.length} contactos).`,
            'warn'
          );
        }
      } catch (err) {
        if (!silentMode) {
          console.error('Error sincronizando con Google Sheets:', err);
          showNotice(
            '⚠️ No se pudo conectar con Google Sheets en este momento. Tus cambios siguen guardados en SQLite.',
            'warn'
          );
        }
      } finally {
        if (!silentMode) setIsSyncingSheets(false);
      }
    },
    [
      isSyncingSheets,
      sheetUrlInput,
      appsScriptUrlInput,
      showNotice,
    ]
  );

  // Auto-sincronización bidireccional en tiempo real con Google Sheets (al abrir, cada 5s y al volver a la pestaña)
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      if (document.visibilityState === 'visible') {
        void handleActualizarDesdeSheets(undefined, undefined, true);
      }
    }, 1500);

    const intervalTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void handleActualizarDesdeSheets(undefined, undefined, true);
      }
    }, 5000);

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void handleActualizarDesdeSheets(undefined, undefined, true);
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [handleActualizarDesdeSheets]);

  // Sincronización con feed iCal (.ics) de Google Calendar (manual y automática en tiempo real)
  const handleSyncCalendarIcal = useCallback(
    async (
      icalUrl: string,
      silentMode = false
    ): Promise<{ ok: boolean; count?: number; message: string }> => {
      if (!icalUrl.trim() || isSyncingCalendar) {
        return { ok: false, message: 'Pegá la URL .ics de tu Google Calendar para sincronizar.' };
      }
      if (!silentMode) setIsSyncingCalendar(true);
      try {
        const res = await fetch('/api/calendar/fetch-ical', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ icalUrl: icalUrl.trim() }),
        });
        const data = await res.json();
        const ahoraReal = Date.now();
        // Priorizar el parseo del icsText en el cliente para aplicar el filtro estricto de vigencia y RRULE (COUNT/UNTIL/EXDATE)
        const rawEvents =
          typeof data?.icsText === 'string' && data.icsText.includes('BEGIN:VCALENDAR')
            ? parsearICalEventos(data.icsText, ahoraReal)
            : Array.isArray(data?.events)
            ? filtrarEventosCalendarVigentes(data.events, ahoraReal)
            : null;

        if (data?.ok && Array.isArray(rawEvents)) {
          const vigentes = filtrarEventosCalendarVigentes(
            deduplicarEventosCalendar(rawEvents),
            ahoraReal
          );
          setCalendarEvents(vigentes);
          await fetch('/api/calendar-events', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: vigentes, source: 'ical_sync' }),
          });
          const msg =
            vigentes.length > 0
              ? `📅 ¡Sincronización exitosa! Se importaron ${vigentes.length} compromiso(s) vigentes desde tu Google Calendar (.ics).`
              : '📅 El calendario .ics conectó correctamente y está al día (sin eventos futuros pendientes en los próximos 14 días).';
          if (!silentMode) {
            showNotice(msg, 'ok');
          }
          return { ok: true, count: vigentes.length, message: msg };
        } else {
          const errMsg = `⚠️ No se pudo leer el feed iCal: ${
            data?.error ||
            'En Google Calendar abrí "Configuración y uso compartido" -> "Integrar el calendario" -> copiá la "Dirección secreta en formato iCal (.ics)".'
          }`;
          if (!silentMode) showNotice(errMsg, 'warn');
          return { ok: false, message: errMsg };
        }
      } catch {
        const errMsg = '⚠️ Error de red al conectar con el enlace iCal de Google Calendar.';
        if (!silentMode) showNotice(errMsg, 'warn');
        return { ok: false, message: errMsg };
      } finally {
        if (!silentMode) setIsSyncingCalendar(false);
      }
    },
    [isSyncingCalendar, showNotice]
  );

  // Auto-sincronización automática de Google Calendar (.ics) al abrir, cada 45s y al volver a la pestaña
  useEffect(() => {
    const url = calendarIcalUrlInput.trim();
    if (!url || !url.startsWith('https://')) return;

    const initialTimer = setTimeout(() => {
      void handleSyncCalendarIcal(url, true);
    }, 1200);

    const intervalTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setAhoraCorteMs(Date.now());
        void handleSyncCalendarIcal(url, true);
      }
    }, 45000);

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        setAhoraCorteMs(Date.now());
        void handleSyncCalendarIcal(url, true);
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [calendarIcalUrlInput, handleSyncCalendarIcal]);

  // Quitar a una persona del recuento del Cierre Diario de HOY sin alterar su estado real ni bajar Adhesiones Acumuladas
  const handleQuitarDeCierreHoy = useCallback(
    (contactId: string) => {
      const cid = String(contactId).trim();
      if (!cid) return;
      const hoyIso = obtenerPartesFechaHoraBA(Date.now()).isoDate;
      setExcluidosCierreHoyIds((prev) => {
        const next = Array.from(new Set([...prev, cid]));
        try {
          localStorage.setItem(`popurri_excluidos_cierre_${hoyIso}`, JSON.stringify(next));
        } catch {
          // Ignore storage errors
        }
        return next;
      });
      setControlEnvios((prev) => prev.filter((l) => String(l.contactId) !== cid));
      showNotice(
        `✓ Contacto #${cid} quitado del recuento de hoy (su estado real y las Adhesiones Acumuladas se mantienen intactos).`,
        'info'
      );
    },
    [showNotice]
  );

  // Aplicar resultados individuales de la cola automática
  const handleApplyAutoItemResult = useCallback(
    (
      contactId: string,
      telefonoNorm: string,
      resultado: ResultadoEnvioAuto,
      detalle: string,
      fechaHoraISO?: string
    ) => {
      setRawContacts((prev) =>
        prev.map((c) => {
          const cTel = normalizarTelefonoWA(c.telRaw);
          const match =
            (contactId && String(c.id) === String(contactId)) ||
            (telefonoNorm &&
              cTel &&
              (cTel === telefonoNorm ||
                (cTel.length >= 8 &&
                  telefonoNorm.length >= 8 &&
                  cTel.slice(-8) === telefonoNorm.slice(-8))));
          if (!match) return c;
          const procAntes = procesarContacto(c, profile);
          const actualizado = aplicarResultadoEnvioAutoAContacto(
            c,
            resultado,
            detalle,
            fechaHoraISO
          );
          const procDespues = procesarContacto(actualizado, profile);

          const log: ControlEnvioRegistro = {
            idRegistro: `envio-${Date.now()}-${actualizado.id}`,
            contactId: actualizado.id,
            nombre: procDespues.nombreCompletoCorregido,
            barrio: actualizado.barrio,
            telRaw: actualizado.telRaw,
            tipoMensaje:
              resultado === 'ENVIADO_OK'
                ? '1er Contacto WA Web'
                : resultado === 'NUMERO_INEXISTENTE'
                ? 'N° Inexistente WA'
                : 'Fallo WA Web (Pendiente reintento)',
            estadoAnterior: procAntes.estadoFlujoEtiqueta,
            estadoNuevo: procDespues.estadoFlujo,
            estadoNuevoEtiqueta: procDespues.estadoFlujoEtiqueta,
            rspNuevo: (actualizado.rsp as any) || 'Nuevo',
            adhirioNuevo: (actualizado.adhirio as any) || 'Pendiente',
            comentario: detalle,
            fechaHora: new Date().toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            sincronizadoSheets:
              resultado === 'ENVIADO_OK' || resultado === 'NUMERO_INEXISTENTE',
          };

          setControlEnvios((prevLogs) => [log, ...prevLogs].slice(0, 150));
          void fetch('/api/control-envios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log),
          });

          // Sólo persistimos cambio de estado en SQLite y Google Sheets si fue ENVIADO_OK o NUMERO_INEXISTENTE.
          // Si fue ERROR_ENVIO, el estatus de la ficha permanece sin cambios para su posterior reintento.
          if (resultado === 'ENVIADO_OK' || resultado === 'NUMERO_INEXISTENTE') {
            void fetch(`/api/contacts/${encodeURIComponent(String(actualizado.id))}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(actualizado),
            }).catch(() => {});
            void pushUpdateToGoogleSheets(actualizado, 'auto_wa');
          }

          return actualizado;
        })
      );
    },
    [profile, pushUpdateToGoogleSheets]
  );

  // Aplicar resultados por lote de la cola automática
  const handleApplyAutoBatchResults = useCallback(
    (
      items: {
        contactId: string;
        telefonoNorm: string;
        resultado: ResultadoEnvioAuto;
        detalleResultado: string;
        fechaHoraResultadoISO?: string;
      }[]
    ) => {
      if (!items.length) return;
      const nuevosLogs: ControlEnvioRegistro[] = [];
      const contactosParaSincronizar: RawContactRow[] = [];

      setRawContacts((prev) => {
        let huboCambioEnContactos = false;
        const nextList = prev.map((row) => {
          const rowTel = normalizarTelefonoWA(row.telRaw);
          const match = items.find((it) => {
            if (it.contactId && String(it.contactId) === String(row.id)) return true;
            if (!it.telefonoNorm || !rowTel) return false;
            return (
              it.telefonoNorm === rowTel ||
              (rowTel.length >= 8 &&
                it.telefonoNorm.length >= 8 &&
                rowTel.slice(-8) === it.telefonoNorm.slice(-8))
            );
          });
          if (!match) return row;
          const procAntes = procesarContacto(row, profile);
          const actualizado = aplicarResultadoEnvioAutoAContacto(
            row,
            match.resultado,
            match.detalleResultado,
            match.fechaHoraResultadoISO
          );
          const procDespues = procesarContacto(actualizado, profile);

          if (
            match.resultado === 'ENVIADO_OK' ||
            match.resultado === 'NUMERO_INEXISTENTE'
          ) {
            huboCambioEnContactos = true;
            contactosParaSincronizar.push(actualizado);
          }

          nuevosLogs.push({
            idRegistro: `auto-batch-${Date.now()}-${actualizado.id}`,
            contactId: actualizado.id,
            nombre: procDespues.nombreCompletoCorregido,
            barrio: actualizado.barrio,
            telRaw: actualizado.telRaw,
            tipoMensaje:
              match.resultado === 'ENVIADO_OK'
                ? 'Auto WA Web OK'
                : match.resultado === 'NUMERO_INEXISTENTE'
                ? 'N° Inexistente WA'
                : 'Fallo WA Web (Pendiente reintento)',
            estadoAnterior: procAntes.estadoFlujoEtiqueta,
            estadoNuevo: procDespues.estadoFlujo,
            estadoNuevoEtiqueta: procDespues.estadoFlujoEtiqueta,
            rspNuevo: (actualizado.rsp as any) || 'Nuevo',
            adhirioNuevo: (actualizado.adhirio as any) || 'Pendiente',
            comentario: match.detalleResultado,
            fechaHora: new Date().toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            sincronizadoSheets:
              match.resultado === 'ENVIADO_OK' || match.resultado === 'NUMERO_INEXISTENTE',
          });

          return match.resultado === 'ENVIADO_OK' || match.resultado === 'NUMERO_INEXISTENTE'
            ? actualizado
            : row;
        });

        return huboCambioEnContactos ? nextList : prev;
      });

      for (const cSync of contactosParaSincronizar) {
        void fetch(`/api/contacts/${encodeURIComponent(String(cSync.id))}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cSync),
        }).catch(() => {});
        void pushUpdateToGoogleSheets(cSync, 'auto_wa');
      }

      if (nuevosLogs.length > 0) {
        setControlEnvios((prev) => [...nuevosLogs, ...prev].slice(0, 150));
        void fetch('/api/control-envios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nuevosLogs),
        });
      }
    },
    [profile, pushUpdateToGoogleSheets]
  );

  // Sincronización global en segundo plano entre los resultados/chats de WhatsApp Web y las fichas de candidatos
  const appliedWaSignaturesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const syncGlobalWaUpdates = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (!res.ok || cancelled) return;
        const data = await res.json();

        // 1. Aplicar resultados de envíos de cola o individuales (ENVIADO_OK, NUMERO_INEXISTENTE, ERROR_ENVIO)
        if (Array.isArray(data?.itemResults) && data.itemResults.length > 0) {
          const freshItems: {
            contactId: string;
            telefonoNorm: string;
            resultado: ResultadoEnvioAuto;
            detalleResultado: string;
            fechaHoraResultadoISO?: string;
          }[] = [];

          const nowMsWa = Date.now();
          for (const it of data.itemResults) {
            const sig = `res:${it.contactId || it.telefonoNorm}:${it.resultado}:${it.fechaHoraResultadoISO || ''}`;
            if (!appliedWaSignaturesRef.current.has(sig)) {
              appliedWaSignaturesRef.current.add(sig);
              const cidClean = String(it.contactId || '').trim();
              const recentDirect = cidClean ? recentLocalEditsByIdRef.current.get(cidClean) : undefined;
              // Si acaba de enviarse como mensaje directo desde la UI (< 20s), no duplicar transición
              if (
                it.resultado === 'ENVIADO_OK' &&
                recentDirect &&
                nowMsWa - recentDirect.timestamp < 20000
              ) {
                continue;
              }
              freshItems.push({
                contactId: String(it.contactId || ''),
                telefonoNorm: String(it.telefonoNorm || ''),
                resultado: it.resultado,
                detalleResultado: String(it.detalleResultado || ''),
                fechaHoraResultadoISO: it.fechaHoraResultadoISO,
              });
            }
          }
          if (freshItems.length > 0) {
            handleApplyAutoBatchResults(freshItems);
          }
        }

        // 2. Aplicar actualizaciones directas detectadas en chats activos de WhatsApp (respuestas entrantes / envíos manuales)
        if (Array.isArray(data?.updatedContacts) && data.updatedContacts.length > 0) {
          const freshUpdated: RawContactRow[] = [];
          for (const uc of data.updatedContacts as RawContactRow[]) {
            if (!uc || !uc.id) continue;
            const sig = `uc:${uc.id}:${uc.estadoFlujo || ''}:${uc.rsp || ''}:${uc.actualizadoEnAppAt || ''}`;
            if (!appliedWaSignaturesRef.current.has(sig)) {
              appliedWaSignaturesRef.current.add(sig);
              freshUpdated.push(uc);
            }
          }
          if (freshUpdated.length > 0) {
            const nowTime = Date.now();
            setRawContacts((prev) =>
              prev.map((row) => {
                const match = freshUpdated.find((u) => String(u.id) === String(row.id));
                if (!match) return row;
                const idKey = String(row.id || '').trim();
                const recentLocal = recentLocalEditsByIdRef.current.get(idKey);
                if (recentLocal && nowTime - recentLocal.timestamp < 180000) {
                  return row; // Proteger edición local reciente contra reversión
                }
                return { ...row, ...match };
              })
            );
            for (const u of freshUpdated) {
              void pushUpdateToGoogleSheets(u, 'auto_wa');
            }
          }
        }
      } catch {
        // Silencioso ante desconexiones momentáneas
      }
    };

    void syncGlobalWaUpdates();
    const timer = setInterval(syncGlobalWaUpdates, 3500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [handleApplyAutoBatchResults, pushUpdateToGoogleSheets]);

  // Subir o tomar foto de ficha física (Formulario 01) con compresión en Canvas para OCR rápido
  const handleUploadFichaImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    appendToExisting = false
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanningFicha(true);
    setScanModalFeedback({
      type: 'info',
      text: '⏳ Procesando imagen y leyendo campos del Formulario 01...',
    });
    try {
      const compressImageToBase64 = (inputFile: File): Promise<{ dataUrl: string; base64: string; mimeType: string }> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
          reader.onload = () => {
            const rawDataUrl = String(reader.result || '');
            const img = new Image();
            img.onerror = () => {
              const base64 = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;
              resolve({ dataUrl: rawDataUrl, base64, mimeType: inputFile.type || 'image/jpeg' });
            };
            img.onload = () => {
              try {
                const maxDim = 1280;
                let width = img.naturalWidth || img.width;
                let height = img.naturalHeight || img.height;
                if (width > maxDim || height > maxDim) {
                  if (width >= height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                  } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                  }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                  const base64 = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;
                  resolve({ dataUrl: rawDataUrl, base64, mimeType: inputFile.type || 'image/jpeg' });
                  return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                const compressedUrl = canvas.toDataURL('image/jpeg', 0.78);
                const base64 = compressedUrl.split(',')[1] || '';
                resolve({ dataUrl: compressedUrl, base64, mimeType: 'image/jpeg' });
              } catch {
                const base64 = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;
                resolve({ dataUrl: rawDataUrl, base64, mimeType: inputFile.type || 'image/jpeg' });
              }
            };
            img.src = rawDataUrl;
          };
          reader.readAsDataURL(inputFile);
        });

      const { dataUrl, base64: base64Data, mimeType } = await compressImageToBase64(file);
      setScanPreviewUrl(dataUrl);

      const res = await fetch('/api/gemini/scan-ficha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType,
        }),
      });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.rows) && data.rows.length > 0) {
        const enrichedRows: FichaEscaneadaRow[] = data.rows.map(
          (r: FichaEscaneadaRow, rIdx: number) => {
            const matched = buscarCandidatoDeFichaEnPadron(r, rawContacts);
            const fallbackBarrio = (r.barrio || matched?.barrio || 'Palermo').toUpperCase();
            const barrioInferido = (
              inferirBarrioDesdeTextoCABA(r.domicilio, fallbackBarrio) || fallbackBarrio
            ).toUpperCase();
            return {
              ...r,
              id: `scan-${Date.now()}-${rIdx + 1}`,
              apellidoYNombre: String(r.apellidoYNombre || '').toUpperCase(),
              nombrePadre: String(r.nombrePadre || '').toUpperCase(),
              nombreMadre: String(r.nombreMadre || '').toUpperCase(),
              dni: String(r.dni || '').replace(/[^\d]/g, ''),
              domicilio: String(r.domicilio || '').toUpperCase(),
              lugarYFecha: String(r.lugarYFecha || '').toUpperCase(),
              barrio: barrioInferido,
              telefono: String(r.telefono || matched?.telRaw || '').toUpperCase(),
              partido: String(r.partido || 'REGENERACIÓN').toUpperCase(),
            };
          }
        );
        setScannedRows((prev) => {
          const nonEmptyPrev = prev.filter(
            (p) => p.apellidoYNombre.trim() || p.dni.trim() || p.domicilio.trim()
          );
          return appendToExisting && nonEmptyPrev.length > 0
            ? [...nonEmptyPrev, ...enrichedRows]
            : enrichedRows;
        });
        const extractedAny = enrichedRows.some(
          (r) =>
            Boolean(r.apellidoYNombre?.trim()) ||
            Boolean(r.dni?.trim()) ||
            Boolean(r.domicilio?.trim())
        );
        if (extractedAny) {
          const engineLabel =
            data.mode === 'gemini'
              ? 'IA Vision'
              : data.mode === 'cloud_handwriting_ocr'
              ? 'OCR Manuscrito'
              : 'OCR Local';
          const msg = `✅ Formulario 01 leído (${engineLabel}): revisá los campos extraídos y confirmá abajo.`;
          setScanModalFeedback({ type: 'ok', text: msg });
          showNotice(msg, 'ok');
        } else {
          const warnMsg =
            '⚠️ No se pudo leer el texto manuscrito automáticamente. Completá los campos abajo o configurá la clave Gemini Vision.';
          setScanModalFeedback({ type: 'warn', text: warnMsg });
          showNotice(warnMsg, 'warn');
        }
      } else {
        const warnMsg =
          data?.message ||
          '⚠️ No se detectó texto nítido automáticamente. Podés completar o corregir los campos abajo.';
        setScanModalFeedback({ type: 'warn', text: warnMsg });
        showNotice(warnMsg, 'info');
      }
    } catch {
      const warnMsg = '⚠️ Error al procesar la foto. Podés completar los datos manualmente abajo.';
      setScanModalFeedback({ type: 'warn', text: warnMsg });
      showNotice(warnMsg, 'info');
    } finally {
      setIsScanningFicha(false);
      e.target.value = '';
    }
  };

  // Confirmar e impactar las filas escaneadas de una ficha física (Formulario 01)
  const handleConfirmScannedRows = async (keepOpenForNextScan = false) => {
    const validRows = scannedRows.filter(
      (r) =>
        r.apellidoYNombre.trim().length > 0 ||
        r.telefono.trim().length > 0 ||
        r.dni.trim().length > 0
    );
    if (validRows.length === 0) return;

    let actualizados = 0;
    let creados = 0;

    for (const row of validRows) {
      const existing = buscarCandidatoDeFichaEnPadron(row, rawContacts);
      const fallbackBarrio = row.barrio || existing?.barrio || 'Palermo';
      const barrioResuelto =
        inferirBarrioDesdeTextoCABA(row.domicilio, fallbackBarrio) || fallbackBarrio;

      const notaFicha = [
        row.dni ? `Matrícula/DNI: ${row.dni.toUpperCase()}` : '',
        row.domicilio ? `Domicilio DNI: ${row.domicilio.toUpperCase()}` : '',
        row.nombrePadre ? `Padre: ${row.nombrePadre.toUpperCase()}` : '',
        row.nombreMadre ? `Madre: ${row.nombreMadre.toUpperCase()}` : '',
        row.lugarYFecha ? `Fecha ficha: ${row.lugarYFecha.toUpperCase()}` : '',
        row.observaciones || '',
      ]
        .filter(Boolean)
        .join(' · ');

      if (existing) {
        await handleUpdateContact(existing.id, {
          adhirio: 'Sí',
          rsp: 'Sí',
          estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
          calleOCruce: row.domicilio.toUpperCase() || existing.calleOCruce,
          barrio: barrioResuelto || existing.barrio,
          comentario: existing.comentario
            ? `${existing.comentario} | ${notaFicha}`
            : notaFicha || 'Formulario 01 firmado',
        });
        actualizados++;
      } else {
        await handleCreateContact({
          nombre: row.apellidoYNombre.trim().toUpperCase() || 'FIRMANTE FORMULARIO 01',
          barrio: barrioResuelto || 'Palermo',
          telRaw: row.telefono.trim(),
          calleOCruce: row.domicilio.trim().toUpperCase(),
          comentario: notaFicha || 'Cargado desde escáner de Formulario 01',
          adhirio: 'Sí',
          rsp: 'Sí',
        });
        creados++;
      }
    }

    setScannedRows([createEmptyFichaRow(1)]);
    setScanPreviewUrl(null);
    if (keepOpenForNextScan) {
      setScanModalFeedback({
        type: 'ok',
        text: `✅ Ficha guardada en Padrón (${actualizados} actualizados, ${creados} nuevos). Ahora podés tomar foto o elegir imagen de la siguiente ficha.`,
      });
    } else {
      setShowScannerModal(false);
    }
    showNotice(
      `🎉 Formulario 01 guardado en SQLite y padrón: ${actualizados} contactos marcados como firmados y ${creados} nuevos agregados.`,
      'ok'
    );
  };

  // Saltar desde Planificador o Mapa directo a un contacto en la pestaña Candidatos
  const handleJumpToCandidate = useCallback((contactId: string) => {
    setFocusedContactId(contactId);
    setActiveTab('pipeline');
  }, []);

  return (
    <div className="min-h-screen w-full max-w-full min-w-0 overflow-x-clip bg-[#F5F4F0] text-[#323232] flex flex-col font-sans selection:bg-[#FFF06B] selection:text-[#323232]">
      {/* 1. Barra de Navegación Oficial Popurrí */}
      <ModernNavbar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        totalContacts={contacts.length}
        signedCount={kpis.adheridos}
        overdueCount={kpis.vencidos}
        whatsAppStatus={whatsAppStatus}
        isSyncingSheets={isSyncingSheets}
        onSyncSheets={() => handleActualizarDesdeSheets()}
        onOpenAutoWAModal={() => {
          setModoColaBotActivo('PRIMER_CONTACTO');
          setActiveTab('whatsapp');
        }}
        onOpenDailyCloseModal={() => setShowDailyCloseModal(true)}
        onOpenScannerModal={() => setShowScannerModal(true)}
        currentUser={currentUser}
        onOpenLoginModal={() => setShowLoginModal(true)}
        onLogout={() => {
          localStorage.removeItem('popurri_auth_token');
          setShowLoginModal(true);
        }}
        userAvatarUrl={profile.avatarUrl}
        onUpdateAvatarUrl={(avatarUrl) => {
          const next = { ...profile, avatarUrl };
          setProfile(next);
          void fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'profile', value: next }),
          });
        }}
      />

      {/* Aviso Flotante de Sincronización / Acciones */}
      {globalToast && (
        <div className="mx-auto max-w-7xl w-full px-3 sm:px-6 pt-3">
          <div
            className={`flex items-center justify-between gap-3 rounded-xl border-2 border-[#323232] px-4 py-2.5 text-xs font-bold shadow-[2px_2px_0px_#323232] ${
              globalToast.type === 'warn'
                ? 'bg-[#FFF06B] text-[#323232]'
                : globalToast.type === 'info'
                ? 'bg-[#DFF4FF] text-[#323232]'
                : 'bg-emerald-100 text-[#323232]'
            }`}
          >
            <span>{globalToast.text}</span>
            <div className="flex items-center gap-2 shrink-0">
              {globalToast.type === 'warn' && activeTab !== 'configuracion' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('configuracion');
                    setGlobalToast(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#323232] text-[#FFF06B] text-[11px] font-black"
                >
                  Ir a Configuración
                </button>
              )}
              <button
                type="button"
                onClick={() => setGlobalToast(null)}
                className="font-black text-[#323232]"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Vistas Principales Desacopladas por Etapas */}
      <main className="flex-1 w-full max-w-full min-w-0 overflow-x-hidden pb-16">
        {activeTab === 'pipeline' && (
          <CandidatePipelineView
            contacts={contacts}
            voiceProfile={profile}
            calendarEvents={calendarEvents}
            whatsAppReady={whatsAppStatus === 'READY'}
            focusedContactId={focusedContactId}
            onClearFocusedContact={() => setFocusedContactId(null)}
            onUpdateContact={handleUpdateContact}
            onCreateContact={handleCreateContact}
            onSendDirectWA={handleSendDirectWA}
            onOpenAutoWAModal={() => setActiveTab('whatsapp')}
            canDeleteContact={
              currentUser?.role === 'admin' ||
              currentUser?.username === 'cesar' ||
              Boolean(currentUser?.canSwitchToAdmin)
            }
            onDeleteContact={handleDeleteContact}
          />
        )}

        {activeTab === 'plan_hoy' && (
          <PlanHoyModernView
            corteResultado={corteResultado}
            voiceProfile={profile}
            whatsAppReady={whatsAppStatus === 'READY'}
            onRefreshCorte={() => setAhoraCorteMs(Date.now())}
            onUpdateContact={handleUpdateContact}
            onSendDirectWA={handleSendDirectWA}
            onJumpToCandidate={handleJumpToCandidate}
            onOpenScannerModal={() => setShowScannerModal(true)}
          />
        )}

        {activeTab === 'mapa' && (
          <div className="mx-auto w-full max-w-7xl min-w-0 overflow-x-hidden px-3 sm:px-6 py-4 sm:py-6">
            <InteractiveMapPanel
              contacts={contacts}
              clusters={microClusters}
              profile={profile}
              calendarEvents={calendarEvents}
              onOpenWhatsApp={(c, text) => {
                if (whatsAppStatus === 'READY') {
                  void handleSendDirectWA(c.tel || c.telRaw, text || '', c.id, c.nombre, c.barrio);
                } else {
                  const url = crearEnlaceWhatsApp(c.tel || c.telRaw, text || '');
                  window.open(url, '_blank');
                }
              }}
              onSelectContactForEdit={(c) => {
                handleJumpToCandidate(c.id);
              }}
              onUpdateProfile={(up) => {
                const next = { ...profile, ...up };
                setProfile(next);
                void fetch('/api/settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ key: 'profile', value: next }),
                });
              }}
              onQuickStatusFromMap={(contactOrId, action) => {
                const id = typeof contactOrId === 'string' ? contactOrId : contactOrId.id;
                if (action === 'YA_ADHIRIO') {
                  void handleUpdateContact(id, {
                    adhirio: 'Sí',
                    estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
                  });
                } else if (
                  action === 'CONFIRMO_CAFE_HUB' ||
                  action === 'PASA_PUERTA_A_PUERTA'
                ) {
                  void handleUpdateContact(id, { estadoFlujo: 'ENCUENTRO_CONFIRMADO' });
                }
              }}
            />
          </div>
        )}

        {activeTab === 'whatsapp' && (
          <AutoFirstMessageModal
            isOpen={true}
            inlineMode={true}
            onClose={() => setActiveTab('pipeline')}
            contacts={contacts}
            voiceProfile={profile}
            barriosDisponibles={todosLosBarrios}
            sheetUrlOrId={sheetUrlInput}
            appsScriptUrl={appsScriptUrlInput}
            onApplyItemResult={handleApplyAutoItemResult}
            onApplyBatchResults={handleApplyAutoBatchResults}
            onCleanFalseErrors={handleCleanFalseErrors}
            initialModoCola={modoColaBotActivo}
          />
        )}

        {activeTab === 'configuracion' && (
          <ModernSettingsView
            profile={profile}
            sheetUrlInput={sheetUrlInput}
            appsScriptUrlInput={appsScriptUrlInput}
            calendarIcalUrlInput={calendarIcalUrlInput}
            totalContacts={contacts.length}
            totalControlEnvios={controlEnvios.length}
            contacts={contacts}
            controlEnvios={controlEnvios}
            calendarEvents={calendarEvents}
            isSyncingSheets={isSyncingSheets}
            isSyncingCalendar={isSyncingCalendar}
            onUpdateProfile={(up) => {
              const next = { ...profile, ...up };
              setProfile(next);
              void fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'profile', value: next }),
              });
            }}
            onUpdateSheetUrl={(u) => {
              setSheetUrlInput(u);
              void fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'sheetUrlInput', value: u }),
              });
            }}
            onUpdateAppsScriptUrl={(u) => {
              setAppsScriptUrlInput(u);
              void fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'appsScriptUrlInput', value: u }),
              });
              if (u.trim().startsWith('https://script.google.com/')) {
                const estadosPorId: Record<string, string> = {};
                for (const c of contacts) {
                  estadosPorId[String(c.id).trim()] =
                    c.estadoFlujoEtiqueta || '1. Nuevo · Sin 1er mensaje';
                }
                void fetch('/api/sheets/push-live', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    appsScriptUrl: u.trim(),
                    sheetUrlOrId: sheetUrlInput.trim(),
                    action: 'syncEstadosChips',
                    estadosPorId,
                  }),
                }).catch(() => {});
              }
            }}
            onUpdateCalendarIcalUrl={(u) => {
              setCalendarIcalUrlInput(u);
              void fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'calendarIcalUrlInput', value: u }),
              });
            }}
            onSyncSheetsNow={(sheetU, scriptU) => handleActualizarDesdeSheets(sheetU, scriptU)}
            onSyncCalendarNow={(icalU) => handleSyncCalendarIcal(icalU)}
            onAddCalendarEvent={(ev) => {
              const next = deduplicarEventosCalendar([ev, ...calendarEvents]);
              setCalendarEvents(next);
              void fetch('/api/calendar-events', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: next, source: 'manual_add' }),
              });
            }}
            onDeleteCalendarEvent={(id) => {
              const next = calendarEvents.filter((e) => e.id !== id);
              setCalendarEvents(next);
              void fetch(`/api/calendar-events/${encodeURIComponent(id)}`, {
                method: 'DELETE',
              });
              void fetch('/api/calendar-events', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: next, source: 'delete_one' }),
              });
            }}
            onClearAllCalendarEvents={() => {
              setCalendarEvents([]);
              void fetch('/api/calendar-events', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: [], source: 'clear_all' }),
              });
            }}
            onImportCSVText={(text) => {
              const parsed = parsearTSVoCSVContactos(text, true);
              if (parsed.length > 0) {
                const { contactosFusionados } = fusionarContactosDesdeSheetsConControl(
                  parsed,
                  rawContacts,
                  new Set()
                );
                setRawContacts(contactosFusionados);
                void fetch('/api/contacts/bulk', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ contacts: contactosFusionados }),
                });
              }
            }}
            onExportCSV={() => {
              const csvContent = exportarContactosACSV(contacts);
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `contactos_popurri_${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              showNotice('✓ Archivo CSV descargado con éxito.', 'ok');
            }}
            onExportCSVExcel={() => {
              const csvContent = exportarContactosACSVExcelPuntoYComa(contacts);
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `contactos_popurri_excel_${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              showNotice('✓ CSV para Excel (;) descargado con éxito. Abre directo en columnas.', 'ok');
            }}
            onCopyTSV={() => {
              const tsv = exportarContactosATSVParaExcel(contacts);
              void navigator.clipboard.writeText(tsv);
              showNotice('✓ Padrón copiado al portapapeles. Pegá con Ctrl+V en Excel o Sheets.', 'ok');
            }}
          />
        )}

        {activeTab === 'admin' && (
          <AdminDashboardView
            contacts={contacts}
            volunteers={volunteersList}
            barriosDisponibles={todosLosBarrios}
            controlEnvios={controlEnvios}
            sheetUrlInput={sheetUrlInput}
            onRefreshVolunteers={refreshVolunteers}
            onAssignContactsToVolunteer={async (contactIds, volunteerUsername, syncSheetTab) => {
              const nowIso = new Date().toISOString();
              const updatedRows: RawContactRow[] = [];
              setRawContacts((prev) =>
                prev.map((c) => {
                  if (!contactIds.includes(String(c.id))) return c;
                  const nextRow: RawContactRow = {
                    ...c,
                    asignadoA: volunteerUsername,
                    asignadoFecha: nowIso,
                    actualizadoEnAppAt: nowIso,
                  };
                  updatedRows.push(nextRow);
                  return nextRow;
                })
              );
              await fetch('/api/admin/assign-contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contactIds,
                  volunteerUsername,
                  syncSheetTab,
                  sheetUrlOrId: sheetUrlInput,
                }),
              });
            }}
            onSendDirectWA={handleSendDirectWA}
            onDeleteContact={handleDeleteContact}
            onOpenLoginModal={() => setShowLoginModal(true)}
            onSwitchToVolunteerView={(vol) => {
              const targetUser: AppUserSession = vol
                ? {
                    id: vol.id || vol.username,
                    username: vol.username,
                    nombre: vol.nombre,
                    role: 'volunteer',
                    barrioAsignado: vol.barrioAsignado || 'Palermo',
                    canSwitchToAdmin: true,
                  }
                : {
                    id: 'cesar',
                    username: 'cesar',
                    nombre: 'César Rincón',
                    role: 'volunteer',
                    barrioAsignado: 'Palermo',
                    canSwitchToAdmin: true,
                  };
              setCurrentUser(targetUser);
              try {
                localStorage.setItem('popurri_current_user', JSON.stringify(targetUser));
              } catch {}
              setActiveTab('pipeline');
            }}
            onJumpToCandidate={handleJumpToCandidate}
            showNotice={showNotice}
          />
        )}
      </main>

      {/* Modal de Inicio de Sesión y Cambio de Usuario (Voluntario / Default-Admin) */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        currentUser={currentUser}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          try {
            localStorage.setItem('popurri_current_user', JSON.stringify(user));
          } catch {}
          void refreshVolunteers();
          if (user.role === 'admin') {
            setActiveTab('admin');
            showNotice('🛡️ Sesión iniciada en el Panel de Administrador (Default/Admin).', 'ok');
          } else {
            if (activeTab === 'admin') setActiveTab('pipeline');
            showNotice(`👤 Vista de Voluntario activa: ${user.nombre}.`, 'ok');
          }
        }}
      />

      {/* 3. Modal Auxiliar de Campañas Automáticas */}
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
        onCleanFalseErrors={handleCleanFalseErrors}
        initialModoCola={modoColaBotActivo}
      />

      {/* 4. Modal de Cierre Diario (Cierre Forms) con los 3 Contadores, los 7 Estatus y Automatización de Google Forms */}
      {showDailyCloseModal &&
        (() => {
          const rf = panelTareasDiariasCierre.resumenFormsYApps;
          const fechaIsoHoy = panelTareasDiariasCierre.fechaReferenciaBA;
          const hoyDateIso = obtenerPartesFechaHoraBA(Date.now()).isoDate;
          const ayerDateIso = sumarDiasAFechaBA(Date.now(), -1).isoDate;
          const anteayerDateIso = sumarDiasAFechaBA(Date.now(), -2).isoDate;
          const prefilledFormUrl = `https://docs.google.com/forms/d/e/${OFFICIAL_DAILY_REPORT_FORM_ID}/viewform?usp=pp_url&entry.1525073162=${encodeURIComponent(
            fechaIsoHoy
          )}&entry.280893168=${encodeURIComponent('Cesar Rincon')}&entry.2003193919=${
            rf.personasContactadasHoy
          }&entry.1258559532=${rf.adhesionesConseguidasHoy}&entry.1581392630=${adhesionesExtrasHoy}`;

          const filteredHabladosHoy =
            dailyStatusFilter === 'TODOS'
              ? rf.estatusPersonasHabladasHoy
              : rf.estatusPersonasHabladasHoy.filter((h) => h.estatusApp === dailyStatusFilter);

          const resumenTextoCompleto = [
            `📊 REPORTE DIARIO CASA X CASA — POPURRÍ (${rf.fechaHoyEtiqueta})`,
            `• ¿Quién carga el reporte?: Cesar Rincon`,
            `• Personas contactadas hoy: ${rf.personasContactadasHoy}`,
            `• Adhesiones de la base conseguidas hoy: ${rf.adhesionesConseguidasHoy}`,
            `• Adhesiones extras hoy: ${adhesionesExtrasHoy}`,
            `• Adhesiones totales acumuladas: ${rf.adhesionesTotalesAcumuladas}`,
            ``,
            `📌 DESGLOSE DE PERSONAS HABLADAS HOY EN LOS 7 ESTATUS (${rf.estatusPersonasHabladasHoy.length}):`,
            ...ALL_7_ESTATUS_REPORTE.map(
              (est) => `  - ${est}: ${rf.conteoPorEstatusHoy[est] || 0}`
            ),
            ...(rf.estatusPersonasHabladasHoy.length > 0
              ? [
                  ``,
                  `📋 DETALLE NOMINAL DEL DÍA:`,
                  ...rf.estatusPersonasHabladasHoy.map(
                    (item) =>
                      `  • [#${item.contactId}] ${item.nombre} (${item.barrio}) → ${item.estatusApp}${
                        item.direccion && item.direccion !== 'Sin dirección cargada'
                          ? ` | Dir: ${item.direccion}`
                          : ''
                      }`
                  ),
                ]
              : []),
          ].join('\n');

          const handleAutoSubmitGoogleForms = async () => {
            setIsSubmittingForms(true);
            try {
              const res = await fetch('/api/forms/submit-daily-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fechaISO: fechaIsoHoy,
                  promotor: 'Cesar Rincon',
                  contactadosHoy: rf.personasContactadasHoy,
                  adhesionesBaseHoy: rf.adhesionesConseguidasHoy,
                  adhesionesExtrasHoy,
                }),
              });
              const data = await res.json();
              if (data?.ok) {
                showNotice(
                  '✅ ¡Reporte diario enviado automáticamente a Google Forms con éxito!',
                  'ok'
                );
              } else {
                window.open(data?.prefilledUrl || prefilledFormUrl, '_blank', 'noopener,noreferrer');
                showNotice(
                  '📋 Se abrió el Google Forms con todos tus datos ya cargados para confirmar en 1 clic.',
                  'info'
                );
              }
            } catch {
              window.open(prefilledFormUrl, '_blank', 'noopener,noreferrer');
            } finally {
              setIsSubmittingForms(false);
            }
          };

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#323232]/60 p-2.5 sm:p-4 backdrop-blur-xs overflow-y-auto">
              <div className="w-full max-w-3xl rounded-2xl border-2 border-[#323232] bg-white shadow-[6px_6px_0px_#323232] overflow-hidden">
                <div className="border-b-2 border-[#323232] bg-[#FFF06B] px-4 sm:px-5 py-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <ClipboardCheck className="w-5 h-5 text-[#323232] shrink-0" />
                      <div>
                        <h3 className="text-sm sm:text-base font-black text-[#323232]">
                          Cierre Diario Casa x Casa (Google Forms + 7 Estatus)
                        </h3>
                        <p className="text-[11px] font-bold text-[#323232]/75">
                          Jornada {rf.fechaHoyEtiqueta} · Contadores del día seleccionado, 7 estatus y Google Forms oficial.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDailyCloseModal(false)}
                      className="p-1.5 rounded-lg bg-white border border-[#323232] text-[#323232] hover:bg-stone-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Selector de Fecha para revisar días anteriores */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#323232]/20">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-[#323232] uppercase">Revisar fecha:</span>
                      <button
                        type="button"
                        onClick={() => setSelectedCierreDate(hoyDateIso)}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition ${
                          selectedCierreDate === hoyDateIso
                            ? 'bg-[#323232] text-[#FFF06B] border-[#323232]'
                            : 'bg-white text-[#323232] border-[#323232]/40 hover:bg-[#F5F4F0]'
                        }`}
                      >
                        Hoy
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCierreDate(ayerDateIso)}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition ${
                          selectedCierreDate === ayerDateIso
                            ? 'bg-[#323232] text-[#FFF06B] border-[#323232]'
                            : 'bg-white text-[#323232] border-[#323232]/40 hover:bg-[#F5F4F0]'
                        }`}
                      >
                        Ayer
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCierreDate(anteayerDateIso)}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition ${
                          selectedCierreDate === anteayerDateIso
                            ? 'bg-[#323232] text-[#FFF06B] border-[#323232]'
                            : 'bg-white text-[#323232] border-[#323232]/40 hover:bg-[#F5F4F0]'
                        }`}
                      >
                        Anteayer
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-[#323232]/80">Elegir otro día:</span>
                      <input
                        type="date"
                        value={selectedCierreDate}
                        onChange={(e) => {
                          if (e.target.value) setSelectedCierreDate(e.target.value);
                        }}
                        className="rounded-lg border-2 border-[#323232] bg-white px-2 py-0.5 text-xs font-bold text-[#323232] shadow-[1px_1px_0px_#323232]"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-5 space-y-4 max-h-[82vh] overflow-y-auto">
                  {/* 1. Los 3 Contadores Principales + Adhesiones Extras del Formulario */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl border-2 border-[#323232] bg-[#F5F4F0] shadow-[2px_2px_0px_#323232]">
                      <span className="text-[10px] font-black uppercase text-[#323232]/70 block">
                        1. Personas Contactadas Hoy
                      </span>
                      <p className="text-2xl sm:text-3xl font-black text-[#323232] mt-0.5">
                        {rf.personasContactadasHoy}
                      </p>
                      <span className="text-[10px] font-semibold text-[#323232]/70">
                        Habladas / contactadas el {rf.fechaHoyEtiqueta}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl border-2 border-[#323232] bg-[#DFF4FF] shadow-[2px_2px_0px_#323232]">
                      <span className="text-[10px] font-black uppercase text-[#323232]/70 block">
                        2. Adhesiones Conseguidas Hoy
                      </span>
                      <div className="flex items-baseline justify-between gap-2 mt-0.5">
                        <p className="text-2xl sm:text-3xl font-black text-[#323232]">
                          {rf.adhesionesConseguidasHoy}
                        </p>
                        <div className="flex items-center gap-1 text-[11px] font-bold text-[#323232]">
                          <span>+ Extras:</span>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={adhesionesExtrasHoy}
                            onChange={(e) =>
                              setAdhesionesExtrasHoy(Math.max(0, Number(e.target.value) || 0))
                            }
                            className="w-12 px-1.5 py-0.5 text-center rounded border border-[#323232] bg-white font-black text-xs"
                            title="Adhesiones extras fuera de la base conseguidas hoy"
                          />
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-[#323232]/70">
                        De la base hoy ({rf.adhesionesConseguidasHoy}) + extras ({adhesionesExtrasHoy})
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl border-2 border-[#323232] bg-[#FFF06B] shadow-[2px_2px_0px_#323232]">
                      <span className="text-[10px] font-black uppercase text-[#323232]/70 block">
                        3. Adhesiones Acumuladas
                      </span>
                      <p className="text-2xl sm:text-3xl font-black text-[#323232] mt-0.5">
                        {rf.adhesionesTotalesAcumuladas}
                      </p>
                      <span className="text-[10px] font-semibold text-[#323232]/75">
                        Total histórico firmado en tu padrón
                      </span>
                    </div>
                  </div>

                  {/* 2. Clasificación en los 7 Estatus del Día */}
                  <div className="space-y-2.5 rounded-xl border-2 border-[#323232] bg-[#F5F4F0] p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase text-[#323232]">
                        Clasificación en los 7 Estatus de Personas Habladas Hoy ({rf.estatusPersonasHabladasHoy.length})
                      </h4>
                      {dailyStatusFilter !== 'TODOS' && (
                        <button
                          type="button"
                          onClick={() => setDailyStatusFilter('TODOS')}
                          className="text-[11px] font-black underline text-[#323232]"
                        >
                          Ver todos los estatus ({rf.estatusPersonasHabladasHoy.length})
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDailyStatusFilter('TODOS')}
                        className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-bold transition flex items-center justify-between ${
                          dailyStatusFilter === 'TODOS'
                            ? 'bg-[#323232] text-[#FFF06B] border-[#323232]'
                            : 'bg-white text-[#323232] border-[#323232]/40 hover:bg-[#FFF06B]/40'
                        }`}
                      >
                        <span className="truncate">Todos hoy</span>
                        <span className="font-black ml-1">{rf.estatusPersonasHabladasHoy.length}</span>
                      </button>

                      {ALL_7_ESTATUS_REPORTE.map((estatus) => {
                        const count = rf.conteoPorEstatusHoy[estatus] || 0;
                        const active = dailyStatusFilter === estatus;
                        return (
                          <button
                            key={estatus}
                            type="button"
                            onClick={() => setDailyStatusFilter(estatus)}
                            className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-bold transition flex items-center justify-between gap-1 ${
                              active
                                ? 'bg-[#2988FF] text-white border-[#323232] shadow-[1px_1px_0px_#323232]'
                                : 'bg-white text-[#323232] border-[#323232]/40 hover:bg-[#DFF4FF]'
                            }`}
                          >
                            <span className="truncate" title={estatus}>
                              {estatus.replace(' (Falta dato/confirmar)', '').replace(' / No existe WA', '')}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-black shrink-0 ${
                                active ? 'bg-[#323232] text-[#FFF06B]' : 'bg-[#F5F4F0] text-[#323232]'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Lista detallada de las personas habladas hoy según el filtro de los 7 estatus */}
                    {filteredHabladosHoy.length === 0 ? (
                      <p className="text-xs text-[#323232]/65 bg-white p-3 rounded-xl border border-[#323232]/20">
                        No hay personas registradas hoy bajo el estatus seleccionado.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {filteredHabladosHoy.map((item) => (
                          <div
                            key={`hablado-${item.contactId}`}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-[#323232]/30 text-xs hover:border-[#323232] transition"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowDailyCloseModal(false);
                                    handleJumpToCandidate(item.contactId);
                                  }}
                                  className="font-black text-[#323232] hover:underline text-left"
                                  title="Ir directamente a la ficha de este candidato"
                                >
                                  #{item.contactId} · {item.nombre}
                                </button>
                                <span className="text-[#323232]/70 font-semibold">({item.barrio})</span>
                                <span className="px-2 py-0.5 rounded-md bg-[#FFF06B] border border-[#323232] text-[10px] font-black text-[#323232]">
                                  {item.estatusApp}
                                </span>
                                {item.horaAccion && (
                                  <span className="text-[10px] font-mono text-[#323232]/60">
                                    {item.horaAccion} hs
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#323232]/75 truncate mt-0.5">
                                {item.direccion} · {item.detalleComentario}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowDailyCloseModal(false);
                                  handleJumpToCandidate(item.contactId);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#DFF4FF] border border-[#323232] text-[11px] font-black text-[#323232] hover:bg-[#29B8FF] inline-flex items-center gap-1"
                                title="Abrir la ficha completa en 1. Candidatos"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Ver Ficha</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleQuitarDeCierreHoy(item.contactId);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#F5F4F0] border border-[#323232] text-[11px] font-bold text-[#323232] hover:bg-[#FFF06B] inline-flex items-center gap-1"
                                title="Quitar del recuento de hoy sin alterar el estado real de la ficha ni las Adhesiones Acumuladas"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Quitar de hoy</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Lista de Adhesiones Conseguidas Hoy con botón para ver ficha, quitar de hoy (manteniendo Acumuladas) o desmarcar si fue prueba */}
                  {rf.adhesionesHoyDetalle.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-black uppercase text-[#323232]">
                        Detalle de Adhesiones Conseguidas Hoy ({rf.adhesionesHoyDetalle.length})
                      </h4>
                      <div className="space-y-1.5">
                        {rf.adhesionesHoyDetalle.map((c) => (
                          <div
                            key={`adherido-${c.id}`}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#DFF4FF]/60 border border-[#323232]/30 text-xs hover:border-[#323232] transition"
                          >
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowDailyCloseModal(false);
                                  handleJumpToCandidate(c.id);
                                }}
                                className="font-black text-[#323232] hover:underline text-left"
                                title="Ir directamente a la ficha de este candidato"
                              >
                                #{c.id} · {c.nombre}
                              </button>{' '}
                              <span className="text-[#323232]/70">({c.barrio})</span>
                              {c.comentario && (
                                <p className="text-[11px] text-[#323232]/70 truncate mt-0.5">
                                  {c.comentario}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap shrink-0 self-end sm:self-auto">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowDailyCloseModal(false);
                                  handleJumpToCandidate(c.id);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#FFF06B] border border-[#323232] text-[11px] font-black text-[#323232] hover:bg-[#ffe838] inline-flex items-center gap-1"
                                title="Abrir la ficha completa en 1. Candidatos"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Ver Ficha</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleQuitarDeCierreHoy(c.id);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white border border-[#323232] text-[11px] font-black text-[#323232] hover:bg-[#FFF06B] inline-flex items-center gap-1"
                                title="Quitar sólo de Adhesiones de Hoy (mantiene su firma en Adhesiones Acumuladas)"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Quitar de hoy</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleQuitarDeCierreHoy(c.id);
                                  void handleUpdateContact(c.id, {
                                    adhirio: 'Pendiente',
                                    estadoFlujo: 'SIN_CONTACTAR_1ER_MSJ',
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white border border-[#323232]/60 text-[11px] font-bold text-[#323232]/80 hover:bg-rose-50 hover:text-rose-800 inline-flex items-center gap-1"
                                title="Anular adhesión si fue una prueba (cambia Adhirió a Pendiente)"
                              >
                                <span>Desmarcar firma</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. Resumen Copiable al Portapapeles */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black uppercase text-[#323232]">
                      Resumen listo para copiar al portapapeles:
                    </label>
                    <pre className="p-3 rounded-xl bg-[#F5F4F0] border-2 border-[#323232] text-xs font-mono whitespace-pre-wrap text-[#323232] max-h-40 overflow-y-auto">
                      {resumenTextoCompleto}
                    </pre>
                  </div>

                  {/* 5. Botonera de Copia y Envío Automatizado / Pre-llenado al Google Forms Oficial */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#323232]/20">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(resumenTextoCompleto);
                        setCopiedDailySummary(true);
                        setTimeout(() => setCopiedDailySummary(false), 2000);
                      }}
                      className="px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#323232] text-[#323232] hover:bg-[#FFF06B] text-xs font-black inline-flex items-center gap-1.5 shadow-[2px_2px_0px_#323232]"
                    >
                      {copiedDailySummary ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedDailySummary ? '¡Resumen Copiado!' : 'Copiar Resumen al Portapapeles'}</span>
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={prefilledFormUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2.5 rounded-xl bg-[#DFF4FF] border-2 border-[#323232] text-[#323232] hover:bg-[#29B8FF] text-xs font-black inline-flex items-center gap-1.5 shadow-[2px_2px_0px_#323232]"
                        title="Abre el Google Forms oficial con Fecha, Cesar Rincon, Contactados y Adhesiones ya pre-cargados"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Abrir Google Forms Pre-llenado ↗</span>
                      </a>

                      <button
                        type="button"
                        onClick={handleAutoSubmitGoogleForms}
                        disabled={isSubmittingForms}
                        className="px-4 py-2.5 rounded-xl bg-[#323232] text-[#FFF06B] hover:bg-black text-xs font-black inline-flex items-center gap-1.5 shadow-[2px_2px_0px_#2988FF] disabled:opacity-60"
                      >
                        {isSubmittingForms ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        <span>
                          {isSubmittingForms
                            ? 'Enviando a Forms...'
                            : 'Enviar Reporte Automático a Forms'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* 5. Modal de Escáner de Fichas Físicas (Formulario 01 · Partido Regeneración · CABA) */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#323232]/60 p-2.5 sm:p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl border-2 border-[#323232] bg-white shadow-[6px_6px_0px_#323232] overflow-hidden">
            <div className="flex items-center justify-between border-b-2 border-[#323232] bg-[#FFF06B] px-4 sm:px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Camera className="w-5 h-5 text-[#323232] shrink-0" />
                <div>
                  <h3 className="text-sm sm:text-base font-black text-[#323232]">
                    Escanear Ficha Física (Formulario 01 · Regeneración)
                  </h3>
                  <p className="text-[11px] font-bold text-[#323232]/75">
                    Extrae Apellido y Nombre, Nombre del Padre, Nombre de la Madre, Matrícula (DNI), Domicilio y Lugar/Fecha.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScannerModal(false)}
                className="p-1.5 rounded-lg bg-white border border-[#323232] text-[#323232]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 max-h-[82vh] overflow-y-auto">
              <div className="p-3.5 rounded-xl border-2 border-dashed border-[#323232] bg-[#F5F4F0] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="text-xs text-[#323232]">
                  <p className="font-black">
                    📷 Capturar o subir foto del Formulario 01
                  </p>
                  <p className="text-[11px] text-[#323232]/75">
                    Extrae Apellido y Nombre, Padre, Madre, Matrícula (DNI), Domicilio y cruza con el padrón.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <label className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl bg-[#323232] text-[#FFF06B] text-xs font-black cursor-pointer inline-flex items-center gap-1.5 shadow-[2px_2px_0px_#323232]">
                    {isScanningFicha ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    <span>{isScanningFicha ? 'Leyendo...' : 'Tomar Foto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleUploadFichaImage}
                      disabled={isScanningFicha}
                      className="hidden"
                    />
                  </label>
                  <label className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl bg-white border-2 border-[#323232] text-[#323232] text-xs font-black cursor-pointer inline-flex items-center gap-1.5 shadow-[2px_2px_0px_#323232]">
                    <Upload className="w-4 h-4" />
                    <span>Elegir Imagen</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadFichaImage}
                      disabled={isScanningFicha}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {(scanModalFeedback || scanPreviewUrl) && (
                <div
                  className={`p-3 rounded-xl border-2 border-[#323232] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    scanModalFeedback?.type === 'ok'
                      ? 'bg-[#D6F5E3]'
                      : scanModalFeedback?.type === 'warn'
                      ? 'bg-[#FFF06B]/60'
                      : 'bg-[#E5F2FF]'
                  }`}
                >
                  <div className="text-xs font-black text-[#323232]">
                    {scanModalFeedback?.text || 'Foto cargada'}
                  </div>
                  {scanPreviewUrl && (
                    <img
                      src={scanPreviewUrl}
                      alt="Vista previa Formulario 01"
                      className="h-16 w-auto rounded-lg border border-[#323232] object-cover shrink-0 bg-white"
                    />
                  )}
                </div>
              )}

              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-black uppercase text-[#323232]">
                    Fichas Formulario 01 Detectadas / A Confirmar ({scannedRows.length})
                  </h4>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="px-2.5 py-1 rounded-lg bg-[#323232] text-[#FFF06B] border border-[#323232] text-[11px] font-black cursor-pointer inline-flex items-center gap-1 shadow-[1px_1px_0px_#323232]">
                      <Camera className="w-3 h-3" />
                      <span>📷 Escanear otra ficha</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadFichaImage(e, true)}
                        disabled={isScanningFicha}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setScannedRows((prev) => [...prev, createEmptyFichaRow(prev.length + 1)])
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#FFF06B] border border-[#323232] text-[11px] font-black text-[#323232] inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Fila Manual</span>
                    </button>
                  </div>
                </div>

                {scannedRows.map((row, idx) => {
                  const matchedContact = buscarCandidatoDeFichaEnPadron(row, rawContacts);
                  const domUpper = (row.domicilio || '').trim().toUpperCase();
                  const barrioUpper = (row.barrio || matchedContact?.barrio || '').trim().toUpperCase();
                  const direccionFormatoDNI = [
                    domUpper,
                    barrioUpper && !domUpper.includes(barrioUpper) ? barrioUpper : '',
                    !/CIUDAD.*BUENOS\s+AIRES|CABA/i.test(domUpper)
                      ? 'CIUDAD DE BUENOS AIRES'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(', ')
                    .toUpperCase();

                  return (
                    <div
                      key={row.id || `scan-row-${idx}`}
                      className="space-y-2.5 p-3 rounded-xl bg-[#F5F4F0] border-2 border-[#323232]/30"
                    >
                      {matchedContact && (
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-100 border border-[#323232] text-[11px] font-bold text-[#323232]">
                          <span>
                            ✅ Vinculado en Padrón: <strong>#{matchedContact.id} {matchedContact.nombre}</strong> ({matchedContact.barrio})
                          </span>
                          <span className="text-[10px] font-black uppercase bg-white px-2 py-0.5 rounded border border-[#323232]">
                            Se marcará 11. Ya Adhirió / Firmó ✅
                          </span>
                        </div>
                      )}

                      {/* Fila 1: Apellido y Nombre, Matrícula (DNI) y Domicilio (campos principales del Formulario 01 — SIEMPRE EN MAYÚSCULAS) */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={(row.apellidoYNombre || '').toUpperCase()}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setScannedRows((prev) =>
                              prev.map((r, i) => {
                                if (i !== idx) return r;
                                const nextRow = { ...r, apellidoYNombre: val };
                                const m = buscarCandidatoDeFichaEnPadron(nextRow, rawContacts);
                                return {
                                  ...nextRow,
                                  barrio: (nextRow.barrio || m?.barrio || '').toUpperCase(),
                                  telefono: (nextRow.telefono || m?.telRaw || '').toUpperCase(),
                                };
                              })
                            );
                          }}
                          placeholder="APELLIDO Y NOMBRE (FORMULARIO 01) *"
                          className="px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-white font-semibold uppercase"
                        />
                        <input
                          type="text"
                          value={row.dni}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^\d]/g, '');
                            setScannedRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, dni: val } : r))
                            );
                          }}
                          placeholder="MATRÍCULA / DNI (SIN PUNTOS) *"
                          className="px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-white font-mono uppercase"
                        />
                        <input
                          type="text"
                          value={(row.domicilio || '').toUpperCase()}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            const barrioAuto = (
                              inferirBarrioDesdeTextoCABA(val, row.barrio || 'Palermo') ||
                              row.barrio ||
                              'Palermo'
                            ).toUpperCase();
                            setScannedRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      domicilio: val,
                                      barrio: barrioAuto,
                                    }
                                  : r
                              )
                            );
                          }}
                          placeholder="DOMICILIO (CALLE, ALTURA, PISO/DEPTO) *"
                          className="px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-white uppercase"
                        />
                      </div>

                      {/* Fila 2: Nombre del Padre, Nombre de la Madre y Lugar + Fecha (Formulario 01 — SIEMPRE EN MAYÚSCULAS) */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={(row.nombrePadre || '').toUpperCase()}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setScannedRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, nombrePadre: val } : r))
                            );
                          }}
                          placeholder="NOMBRE DEL PADRE (NOMBRE Y APELLIDO)"
                          className="px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-white uppercase"
                        />
                        <input
                          type="text"
                          value={(row.nombreMadre || '').toUpperCase()}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setScannedRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, nombreMadre: val } : r))
                            );
                          }}
                          placeholder="NOMBRE DE LA MADRE (NOMBRE Y APELLIDO)"
                          className="px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-white uppercase"
                        />
                        <input
                          type="text"
                          value={(row.lugarYFecha || '').toUpperCase()}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setScannedRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, lugarYFecha: val } : r))
                            );
                          }}
                          placeholder="LUGAR Y FECHA (CABA + FECHA)"
                          className="px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-white uppercase"
                        />
                      </div>

                      {/* Fila 3: Barrio CABA y Teléfono (auto-completados desde el padrón o domicilio — SIEMPRE EN MAYÚSCULAS) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={(row.barrio || '').toUpperCase()}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setScannedRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, barrio: val } : r))
                            );
                          }}
                          placeholder="BARRIO CABA (INFERIDO DEL DOMICILIO O PADRÓN)"
                          className="px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-white uppercase"
                        />
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={(row.telefono || '').toUpperCase()}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setScannedRows((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, telefono: val } : r))
                              );
                            }}
                            placeholder="TELÉFONO (OPCIONAL / AUTO-VINCULADO DEL PADRÓN)"
                            className="flex-1 px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-white uppercase"
                          />
                          {scannedRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setScannedRows((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="px-2 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Botones rápidos para pegar en el Formulario Oficial de Carga de Adhesiones */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                        <span className="font-bold text-[#323232]/75">
                          Copiar rápido (MAYÚSCULAS):
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText((row.apellidoYNombre || '').toUpperCase());
                            showNotice('📋 Apellido y Nombre copiado en MAYÚSCULAS.', 'info');
                          }}
                          className="px-2 py-0.5 rounded bg-white border border-[#323232]/40 font-bold hover:bg-[#FFF06B]"
                        >
                          Apellido y Nombre
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText((row.dni || '').toUpperCase());
                            showNotice('📋 Matrícula / DNI sin puntos copiado.', 'info');
                          }}
                          className="px-2 py-0.5 rounded bg-white border border-[#323232]/40 font-bold hover:bg-[#FFF06B]"
                        >
                          Matrícula (DNI)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(direccionFormatoDNI);
                            showNotice(
                              `📋 Domicilio copiado: "${direccionFormatoDNI}"`,
                              'info'
                            );
                          }}
                          className="px-2 py-0.5 rounded bg-white border border-[#323232]/40 font-bold hover:bg-[#FFF06B]"
                        >
                          Domicilio DNI
                        </button>
                        {row.nombrePadre && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText((row.nombrePadre || '').toUpperCase());
                              showNotice('📋 Nombre del Padre copiado en MAYÚSCULAS.', 'info');
                            }}
                            className="px-2 py-0.5 rounded bg-white border border-[#323232]/40 font-bold hover:bg-[#FFF06B]"
                          >
                            Padre
                          </button>
                        )}
                        {row.nombreMadre && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText((row.nombreMadre || '').toUpperCase());
                              showNotice('📋 Nombre de la Madre copiado en MAYÚSCULAS.', 'info');
                            }}
                            className="px-2 py-0.5 rounded bg-white border border-[#323232]/40 font-bold hover:bg-[#FFF06B]"
                          >
                            Madre
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#323232]/20">
                <button
                  type="button"
                  onClick={() => setShowScannerModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-[#323232] bg-white text-xs font-bold text-[#323232]"
                >
                  Cerrar
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={OFFICIAL_ADHESIONES_WEBAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-[#DFF4FF] border-2 border-[#323232] text-xs font-black text-[#323232] inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Ir al Formulario de Adhesiones ↗</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleConfirmScannedRows(true)}
                    className="px-3.5 py-2 rounded-xl bg-[#FFF06B] border-2 border-[#323232] text-[#323232] text-xs font-black inline-flex items-center gap-1.5 shadow-[2px_2px_0px_#323232] hover:bg-[#ffe838]"
                    title="Guarda esta ficha en el Padrón y deja lista la ventana para escanear otra ficha"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Guardar y Escanear Otra</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmScannedRows(false)}
                    className="px-4 py-2 rounded-xl bg-[#323232] text-[#FFF06B] text-xs font-black inline-flex items-center gap-1.5 shadow-[2px_2px_0px_#2988FF]"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Confirmar y Cerrar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Banner Flotante Universal de Deshacer (8 segundos) */}
      {undoAction && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border-2 border-[#323232] bg-[#FFF06B] px-4 py-2.5 shadow-[4px_4px_0px_#323232] text-xs font-black text-[#323232] animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-[#323232]" />
            <span>
              Cambio en <strong>{undoAction.nombre}</strong> ({undoAction.description})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUndo}
              className="px-3 py-1.5 rounded-xl border border-[#323232] bg-[#323232] text-[#FFF06B] hover:bg-black font-black flex items-center gap-1.5 transition active:scale-95 shadow-xs cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Deshacer ({undoSecondsLeft}s)
            </button>
            <button
              type="button"
              onClick={() => setUndoAction(null)}
              className="p-1 rounded-lg hover:bg-black/10 transition font-bold cursor-pointer"
              title="Cerrar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
