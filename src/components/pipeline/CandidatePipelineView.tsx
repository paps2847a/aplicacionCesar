import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Search,
  List,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CheckCircle2,
  Layers,
  AlertTriangle,
  Clock,
  FilePlus2,
  UserPlus,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  CalendarEventItem,
  Contact,
  EstadoFlujo,
  VoiceProfile,
} from '../../types';
import {
  coincideBusquedaUniversal,
  getMacroStageForContact,
  MACRO_STAGES,
  MACRO_STAGES_ORDER,
  MacroStageKey,
} from '../../domain/contacts/pipelineStages';
import { esMovimientoDeHoy } from '../../domain/messaging/greetingsAndTone';
import {
  CandidateCard,
  LISTA_ESTADOS_FLUJO_UNIFICADOS,
} from './CandidateCard';
import { CandidateDrawer } from './CandidateDrawer';

export type QuickOperationalFilter =
  | 'TODOS'
  | 'MOVIMIENTOS_HOY'
  | 'VENCIDOS_REPROGRAMAR'
  | 'SIN_RSP_48H'
  | 'FALTAN_DATOS'
  | 'POR_CONFIRMAR'
  | 'CITA_CONFIRMADA'
  | 'RETIRO_FICHAS_1SEM'
  | 'YA_FIRMARON_FIN'
  | 'SIN_DNI_CABA_O_BAJA';

interface CandidatePipelineViewProps {
  contacts: Contact[];
  voiceProfile: VoiceProfile;
  whatsAppReady: boolean;
  calendarEvents?: CalendarEventItem[];
  focusedContactId?: string | null;
  onClearFocusedContact?: () => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => Promise<void> | void;
  onCreateContact?: (newContact: {
    nombre: string;
    barrio: string;
    telRaw: string;
    calleOCruce?: string;
    comentario?: string;
    adhirio?: 'Sí' | 'No' | 'Pendiente';
    rsp?: 'Sí' | 'No' | 'Nuevo';
  }) => Promise<void> | void;
  onSendDirectWA?: (
    phone: string,
    text: string,
    contactId: string,
    nombre: string,
    barrio: string
  ) => Promise<boolean>;
  onOpenAutoWAModal: () => void;
  canDeleteContact?: boolean;
  onDeleteContact?: (contactId: string) => Promise<void> | void;
}

export const CandidatePipelineView: React.FC<CandidatePipelineViewProps> = ({
  contacts,
  voiceProfile,
  whatsAppReady,
  calendarEvents = [],
  focusedContactId,
  onClearFocusedContact,
  onUpdateContact,
  onCreateContact,
  onSendDirectWA,
  canDeleteContact = false,
  onDeleteContact,
}) => {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    try {
      return sessionStorage.getItem('popurri_pipeline_search') || '';
    } catch {
      return '';
    }
  });

  const handleUpdateSearch = (q: string) => {
    setSearchQuery(q);
    try {
      if (q) {
        sessionStorage.setItem('popurri_pipeline_search', q);
      } else {
        sessionStorage.removeItem('popurri_pipeline_search');
      }
    } catch {}
  };
  const [selectedBarrio, setSelectedBarrio] = useState<string>('Todos');
  const [activeStageFilter, setActiveStageFilter] = useState<MacroStageKey | 'TODOS'>('TODOS');
  const [quickFilter, setQuickFilter] = useState<QuickOperationalFilter>('TODOS');
  const [granularEstadoFilter, setGranularEstadoFilter] = useState<EstadoFlujo | 'TODOS'>('TODOS');
  const [viewMode, setViewMode] = useState<'lanes' | 'list'>('lanes');
  const quickFiltersScrollRef = useRef<HTMLDivElement | null>(null);

  const scrollQuickFilters = useCallback((dir: 'left' | 'right') => {
    const el = quickFiltersScrollRef.current;
    if (!el) return;
    const offset = dir === 'left' ? -300 : 300;
    el.scrollBy({ left: offset, behavior: 'smooth' });
  }, []);

  // Modal para crear nuevo contacto rápidamente
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newTel, setNewTel] = useState('');
  const [newBarrio, setNewBarrio] = useState('Palermo');
  const [newCalle, setNewCalle] = useState('');
  const [newCom, setNewCom] = useState('');
  const [newEstadoInicial, setNewEstadoInicial] = useState<'NUEVO' | 'YA_FIRMO'>('NUEVO');

  const [expandedStages, setExpandedStages] = useState<Record<MacroStageKey, boolean>>({
    nuevos: false,
    conversacion: false,
    agendados: false,
    pausa: false,
    adheridos: false,
    descartados: false,
  });

  // Si venimos redirigidos desde el Mapa, Planificador o Cierre Diario con un contacto puntual, abrirlo y expandir su carril exclusivamente
  useEffect(() => {
    if (!focusedContactId) return;
    const target = contacts.find((c) => String(c.id).trim() === String(focusedContactId).trim());
    if (target) {
      const st = getMacroStageForContact(target);
      setExpandedStages({
        nuevos: st === 'nuevos',
        conversacion: st === 'conversacion',
        agendados: st === 'agendados',
        pausa: st === 'pausa',
        adheridos: st === 'adheridos',
        descartados: st === 'descartados',
      });
      setExpandedContactId(target.id);
      setSelectedContactId(null);
      setActiveStageFilter('TODOS');
      setQuickFilter('TODOS');
      setGranularEstadoFilter('TODOS');
      setSelectedBarrio('Todos');
      handleUpdateSearch(`#${target.id}`);
    }
    if (onClearFocusedContact) onClearFocusedContact();
  }, [focusedContactId, contacts, onClearFocusedContact]);

  const toggleStage = useCallback((stageKey: MacroStageKey) => {
    setExpandedStages((prev) => ({
      ...prev,
      [stageKey]: !prev[stageKey],
    }));
  }, []);

  const areAllExpanded = useMemo(() => {
    return Object.values(expandedStages).every(Boolean);
  }, [expandedStages]);

  const toggleAllStages = useCallback(() => {
    const nextState = !Object.values(expandedStages).every(Boolean);
    setExpandedStages({
      nuevos: nextState,
      conversacion: nextState,
      agendados: nextState,
      pausa: nextState,
      adheridos: nextState,
      descartados: nextState,
    });
  }, [expandedStages]);

  const [feedbackToast, setFeedbackToast] = useState<{
    id: string;
    message: string;
    timestamp: string;
  } | null>(null);

  const showToast = useCallback((message: string) => {
    const ahora = new Date();
    const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    setFeedbackToast({
      id: String(Date.now()),
      message,
      timestamp: hhmm,
    });
    setTimeout(() => {
      setFeedbackToast(null);
    }, 3500);
  }, []);

  // Conteos por etapa macro
  const stageCounts = useMemo(() => {
    const counts: Record<MacroStageKey, number> = {
      nuevos: 0,
      conversacion: 0,
      agendados: 0,
      pausa: 0,
      adheridos: 0,
      descartados: 0,
    };
    for (const c of contacts) {
      const stage = getMacroStageForContact(c);
      counts[stage]++;
    }
    return counts;
  }, [contacts]);

  // Función evaluadora de filtros operativos rápidos (unificados con los estados del contacto)
  const matchesQuickFilter = useCallback(
    (c: Contact, filter: QuickOperationalFilter): boolean => {
      switch (filter) {
        case 'TODOS':
          return true;
        case 'MOVIMIENTOS_HOY':
          return esMovimientoDeHoy(c);
        case 'VENCIDOS_REPROGRAMAR':
          return Boolean(c.alertaVencido?.activa) && c.adhirio !== 'Sí';
        case 'SIN_RSP_48H':
          return (
            (Boolean(c.esSinRsp48h) || Boolean(c.diagnostico48h?.aplica)) &&
            c.adhirio !== 'Sí'
          );
        case 'FALTAN_DATOS':
          return (
            (c.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
              c.estadoFlujo === 'PIDIO_MAS_INFO_ENVIADA' ||
              Boolean(c.esRspSiSinInfoColG)) &&
            c.adhirio !== 'Sí'
          );
        case 'POR_CONFIRMAR':
          return (
            (c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
              c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE') &&
            c.adhirio !== 'Sí'
          );
        case 'CITA_CONFIRMADA':
          return (
            (c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
              c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO') &&
            c.adhirio !== 'Sí'
          );
        case 'RETIRO_FICHAS_1SEM':
          return (
            c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' || c.situacion === 'RETIRO_FICHAS'
          );
        case 'YA_FIRMARON_FIN':
          return (
            (c.adhirio === 'Sí' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') &&
            c.estadoFlujo !== 'PENDIENTE_RETIRO_FICHAS' &&
            c.situacion !== 'RETIRO_FICHAS'
          );
        case 'SIN_DNI_CABA_O_BAJA':
          return (
            c.situacion === 'DESCARTADO_NO_CABA' ||
            c.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
            c.estadoFlujo === 'DESCARTADO_O_BAJA'
          );
      }
    },
    []
  );

  const quickFilterCounts = useMemo(() => {
    const res: Record<QuickOperationalFilter, number> = {
      TODOS: contacts.length,
      MOVIMIENTOS_HOY: 0,
      VENCIDOS_REPROGRAMAR: 0,
      SIN_RSP_48H: 0,
      FALTAN_DATOS: 0,
      POR_CONFIRMAR: 0,
      CITA_CONFIRMADA: 0,
      RETIRO_FICHAS_1SEM: 0,
      YA_FIRMARON_FIN: 0,
      SIN_DNI_CABA_O_BAJA: 0,
    };
    for (const c of contacts) {
      if (matchesQuickFilter(c, 'MOVIMIENTOS_HOY')) res.MOVIMIENTOS_HOY++;
      if (matchesQuickFilter(c, 'VENCIDOS_REPROGRAMAR')) res.VENCIDOS_REPROGRAMAR++;
      if (matchesQuickFilter(c, 'SIN_RSP_48H')) res.SIN_RSP_48H++;
      if (matchesQuickFilter(c, 'FALTAN_DATOS')) res.FALTAN_DATOS++;
      if (matchesQuickFilter(c, 'POR_CONFIRMAR')) res.POR_CONFIRMAR++;
      if (matchesQuickFilter(c, 'CITA_CONFIRMADA')) res.CITA_CONFIRMADA++;
      if (matchesQuickFilter(c, 'RETIRO_FICHAS_1SEM')) res.RETIRO_FICHAS_1SEM++;
      if (matchesQuickFilter(c, 'YA_FIRMARON_FIN')) res.YA_FIRMARON_FIN++;
      if (matchesQuickFilter(c, 'SIN_DNI_CABA_O_BAJA')) res.SIN_DNI_CABA_O_BAJA++;
    }
    return res;
  }, [contacts, matchesQuickFilter]);

  const availableBarrios = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contacts) {
      const b = (c.barrio || 'CABA').trim();
      map.set(b, (map.get(b) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [contacts]);

  // Filtrado universal insensible a tildes y diacríticos
  const filteredContacts = useMemo(() => {
    const list = contacts.filter((c) => {
      if (searchQuery.trim() && !coincideBusquedaUniversal(c, searchQuery)) {
        return false;
      }
      if (selectedBarrio !== 'Todos' && (c.barrio || 'CABA').trim() !== selectedBarrio) {
        return false;
      }
      if (activeStageFilter !== 'TODOS' && getMacroStageForContact(c) !== activeStageFilter) {
        return false;
      }
      if (quickFilter !== 'TODOS' && !matchesQuickFilter(c, quickFilter)) {
        return false;
      }
      if (granularEstadoFilter !== 'TODOS' && c.estadoFlujo !== granularEstadoFilter) {
        return false;
      }
      return true;
    });

    // Ordenar poniendo siempre primero a los contactos con cita vencida pendiente de reprogramar
    return [...list].sort((a, b) => {
      const aVenc = a.alertaVencido?.activa && a.adhirio !== 'Sí' ? 0 : 1;
      const bVenc = b.alertaVencido?.activa && b.adhirio !== 'Sí' ? 0 : 1;
      if (aVenc !== bVenc) return aVenc - bVenc;
      return 0;
    });
  }, [
    contacts,
    searchQuery,
    selectedBarrio,
    activeStageFilter,
    quickFilter,
    granularEstadoFilter,
    matchesQuickFilter,
  ]);

  const hasActiveSearchOrFilter =
    Boolean(searchQuery.trim()) ||
    quickFilter !== 'TODOS' ||
    granularEstadoFilter !== 'TODOS' ||
    selectedBarrio !== 'Todos';

  const contactsByStage = useMemo(() => {
    const groups: Record<MacroStageKey, Contact[]> = {
      nuevos: [],
      conversacion: [],
      agendados: [],
      pausa: [],
      adheridos: [],
      descartados: [],
    };
    for (const c of filteredContacts) {
      const st = getMacroStageForContact(c);
      groups[st].push(c);
    }
    return groups;
  }, [filteredContacts]);

  // Auto-expandir automáticamente las etapas con resultados cuando el usuario escribe en el buscador o activa un filtro
  useEffect(() => {
    if (!hasActiveSearchOrFilter) return;
    setExpandedStages((prev) => {
      const next = { ...prev };
      for (const st of MACRO_STAGES_ORDER) {
        next[st] = contactsByStage[st].length > 0;
      }
      return next;
    });
    if (searchQuery.trim().startsWith('#') && filteredContacts.length === 1) {
      setExpandedContactId(filteredContacts[0].id);
    }
  }, [hasActiveSearchOrFilter, contactsByStage, searchQuery, filteredContacts]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || null,
    [contacts, selectedContactId]
  );

  // En móvil (< 1024px) tocar una tarjeta o "Mensaje WA" abre el Drawer lateral con cabecera fija (< Anterior | Siguiente > | X).
  // En computadora (>= 1024px) despliega la ficha completa inline dentro de la misma tarjeta, sin panel lateral.
  const handleCardActivate = useCallback((contact: Contact) => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setExpandedContactId(null);
      setSelectedContactId(contact.id);
    } else {
      setSelectedContactId(null);
      setExpandedContactId((prev) => (prev === contact.id ? null : contact.id));
    }
  }, []);

  // Navegación < Anterior | Siguiente > tanto para el contacto expandido inline como para el Drawer
  const navigateContact = useCallback(
    (currentId: string, direction: 'prev' | 'next', isDrawer: boolean) => {
      const idx = filteredContacts.findIndex((c) => c.id === currentId);
      if (idx === -1) return;
      const nextIdx = direction === 'prev' ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= filteredContacts.length) return;
      const target = filteredContacts[nextIdx];
      const st = getMacroStageForContact(target);
      setExpandedStages((prev) => ({ ...prev, [st]: true }));
      if (isDrawer) {
        setSelectedContactId(target.id);
      } else {
        setExpandedContactId(target.id);
      }
    },
    [filteredContacts]
  );

  const handleDirectStageChange = useCallback(
    async (contact: Contact, targetStage: MacroStageKey) => {
      let nextEstado: EstadoFlujo = contact.estadoFlujo || '1ER_MSJ_ENVIADO_SIN_RSP';
      let nextAdhirio = contact.adhirio;
      let nextRsp = contact.rsp;

      switch (targetStage) {
        case 'nuevos':
          nextEstado = 'SIN_CONTACTAR_1ER_MSJ';
          nextRsp = 'Nuevo';
          nextAdhirio = 'Pendiente';
          break;
        case 'conversacion':
          nextEstado = '1ER_MSJ_ENVIADO_SIN_RSP';
          nextRsp = contact.rsp === 'Sí' ? 'Sí' : 'No';
          nextAdhirio = 'Pendiente';
          break;
        case 'agendados':
          nextEstado = 'ENCUENTRO_CONFIRMADO';
          nextRsp = 'Sí';
          nextAdhirio = 'Pendiente';
          break;
        case 'pausa':
          nextEstado = 'POSTERGO_SALUD_O_VIAJE';
          break;
        case 'adheridos':
          nextEstado = 'YA_ADHIRIO_FIRMA_OK';
          nextAdhirio = 'Sí';
          nextRsp = 'Sí';
          break;
        case 'descartados':
          nextEstado = 'DESCARTADO_O_BAJA';
          nextAdhirio = 'No';
          break;
      }

      const targetDef = MACRO_STAGES[targetStage];
      await onUpdateContact(contact.id, {
        estadoFlujo: nextEstado,
        adhirio: nextAdhirio,
        rsp: nextRsp,
        primerContactoEnviado: targetStage !== 'nuevos',
      });

      const nom = contact.primerNombre || contact.nombre || `Contacto #${contact.id}`;
      showToast(`${nom} movido a "${targetDef.label}"`);
    },
    [onUpdateContact, showToast]
  );

  const handleCreateNewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateContact || (!newNombre.trim() && !newTel.trim())) return;
    const esYaFirmo = newEstadoInicial === 'YA_FIRMO';
    await onCreateContact({
      nombre: newNombre.trim(),
      barrio: newBarrio.trim() || 'Palermo',
      telRaw: newTel.trim(),
      calleOCruce: newCalle.trim() || undefined,
      comentario: newCom.trim() || (esYaFirmo ? 'Firmó ficha presencial hoy' : undefined),
      adhirio: esYaFirmo ? 'Sí' : 'Pendiente',
      rsp: esYaFirmo ? 'Sí' : 'Nuevo',
    });
    const targetStage: MacroStageKey = esYaFirmo ? 'adheridos' : 'nuevos';
    setExpandedStages((prev) => ({ ...prev, [targetStage]: true }));
    setNewNombre('');
    setNewTel('');
    setNewCalle('');
    setNewCom('');
    setNewEstadoInicial('NUEVO');
    setShowNewContactModal(false);
    showToast(
      esYaFirmo
        ? '✅ Contacto agregado directamente en "5. Adhesión Exitosa" y contabilizado hoy'
        : 'Nuevo contacto agregado en "1. Nuevos por Contactar" y Google Sheets'
    );
  };

  const quickPills: {
    key: QuickOperationalFilter;
    label: string;
    count: number;
    urgent?: boolean;
  }[] = [
    {
      key: 'MOVIMIENTOS_HOY',
      label: '🔥 Movimientos de hoy',
      count: quickFilterCounts.MOVIMIENTOS_HOY,
    },
    {
      key: 'VENCIDOS_REPROGRAMAR',
      label: '⚠️ Citas Vencidas / Reprogramar',
      count: quickFilterCounts.VENCIDOS_REPROGRAMAR,
      urgent: true,
    },
    {
      key: 'SIN_RSP_48H',
      label: '⏳ Sin Respuesta +48h',
      count: quickFilterCounts.SIN_RSP_48H,
    },
    {
      key: 'FALTAN_DATOS',
      label: '📍 Respondió · Faltan Datos',
      count: quickFilterCounts.FALTAN_DATOS,
    },
    {
      key: 'POR_CONFIRMAR',
      label: '📅 Por Confirmar Visita/Café',
      count: quickFilterCounts.POR_CONFIRMAR,
    },
    {
      key: 'CITA_CONFIRMADA',
      label: '✅ Cita Confirmada',
      count: quickFilterCounts.CITA_CONFIRMADA,
    },
    {
      key: 'RETIRO_FICHAS_1SEM',
      label: '🗂️ Retiro Fichas (1 sem)',
      count: quickFilterCounts.RETIRO_FICHAS_1SEM,
    },
    {
      key: 'YA_FIRMARON_FIN',
      label: '🎉 Ya Firmaron (Proceso terminado)',
      count: quickFilterCounts.YA_FIRMARON_FIN,
    },
    {
      key: 'SIN_DNI_CABA_O_BAJA',
      label: '🚫 Sin DNI CABA / Baja',
      count: quickFilterCounts.SIN_DNI_CABA_O_BAJA,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 overflow-x-hidden px-3 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
      {/* 1. Tarjetas Superiores de las 6 Macro-Etapas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 w-full min-w-0">
        {MACRO_STAGES_ORDER.map((stageKey) => {
          const def = MACRO_STAGES[stageKey];
          const count = stageCounts[stageKey];
          const isSelected = activeStageFilter === stageKey;

          return (
            <button
              key={stageKey}
              type="button"
              onClick={() => {
                if (isSelected) {
                  setActiveStageFilter('TODOS');
                } else {
                  setActiveStageFilter(stageKey);
                  setExpandedStages((prev) => ({ ...prev, [stageKey]: true }));
                }
              }}
              className={`group flex flex-col justify-between rounded-2xl border-2 border-[#323232] p-2.5 sm:p-3.5 text-left transition-all duration-150 min-w-0 ${
                isSelected
                  ? 'bg-[#FFF06B] shadow-[3px_3px_0px_#323232] sm:shadow-[4px_4px_0px_#323232] translate-x-[-1px] translate-y-[-1px]'
                  : 'bg-white hover:bg-[#ECEAE2]/60 shadow-[2px_2px_0px_#323232]'
              }`}
            >
              <div className="flex items-center justify-between gap-1 min-w-0">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#323232] font-display truncate">
                  {def.shortLabel}
                </span>
                <span
                  className={`h-2.5 w-2.5 rounded-full border border-[#323232] shrink-0 ${def.dotColor}`}
                />
              </div>

              <div className="mt-1.5 sm:mt-2 flex items-baseline justify-between">
                <span className="text-xl sm:text-2xl font-bold font-display text-[#323232]">
                  {count}
                </span>
                <span className="text-[10px] text-[#5A5955] font-bold">
                  {Math.round((count / Math.max(1, contacts.length)) * 100)}%
                </span>
              </div>

              <p className="mt-1 text-[10px] text-[#5A5955] font-medium truncate">
                {def.tagline}
              </p>
            </button>
          );
        })}
      </div>

      {/* 2. Píldoras de Prioridad Operativa (con Citas Vencidas / Reprogramar siempre primero + Flechas de Desplazamiento) */}
      <div className="relative flex items-center gap-1.5 w-full max-w-full min-w-0">
        <button
          type="button"
          onClick={() => scrollQuickFilters('left')}
          title="Desplazar filtros hacia la izquierda"
          aria-label="Desplazar filtros hacia la izquierda"
          className="shrink-0 flex items-center justify-center h-8 w-8 rounded-xl border-2 border-[#323232] bg-white text-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-[#FFF06B] active:translate-y-0.5 transition cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4 stroke-[2.5]" />
        </button>

        <div
          ref={quickFiltersScrollRef}
          className="flex-1 flex items-center gap-2 overflow-x-auto py-1 no-scrollbar w-full max-w-full min-w-0 scroll-smooth"
        >
          <button
            type="button"
            onClick={() => {
              setQuickFilter('TODOS');
              setGranularEstadoFilter('TODOS');
            }}
            className={`shrink-0 rounded-xl border-2 border-[#323232] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold font-display transition ${
              quickFilter === 'TODOS' && granularEstadoFilter === 'TODOS'
                ? 'bg-[#323232] text-[#FFF06B] shadow-[2px_2px_0px_#323232]'
                : 'bg-white text-[#323232] hover:bg-[#ECEAE2]'
            }`}
          >
            Todos ({contacts.length})
          </button>

          {quickPills.map((pill) => {
            const active = quickFilter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => {
                  const next = active ? 'TODOS' : pill.key;
                  setQuickFilter(next);
                  setGranularEstadoFilter('TODOS');
                }}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold font-display transition ${
                  active
                    ? pill.urgent
                      ? 'bg-[#FF2C00] text-white shadow-[3px_3px_0px_#323232]'
                      : 'bg-[#FFF06B] text-[#323232] shadow-[3px_3px_0px_#323232]'
                    : pill.urgent && pill.count > 0
                    ? 'bg-[#F5817F]/35 text-[#323232] hover:bg-[#F5817F]/60 shadow-[2px_2px_0px_#323232]'
                    : 'bg-white text-[#323232] hover:bg-[#ECEAE2]'
                }`}
              >
                <span>{pill.label}</span>
                <span
                  className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold border border-[#323232]/40 ${
                    active && pill.urgent
                      ? 'bg-white text-[#FF2C00]'
                      : 'bg-[#ECEAE2] text-[#323232]'
                  }`}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scrollQuickFilters('right')}
          title="Desplazar filtros hacia la derecha"
          aria-label="Desplazar filtros hacia la derecha"
          className="shrink-0 flex items-center justify-center h-8 w-8 rounded-xl border-2 border-[#323232] bg-white text-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-[#FFF06B] active:translate-y-0.5 transition cursor-pointer"
        >
          <ChevronRight className="h-4 w-4 stroke-[2.5]" />
        </button>
      </div>

      {/* 3. Barra de Búsqueda Universal (sin tildes), Filtro por Estado Exacto, Barrio y Vistas */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3 rounded-2xl border-2 border-[#323232] bg-white p-2.5 sm:p-3 shadow-[3px_3px_0px_#323232] w-full max-w-full min-w-0">
        <div className="relative flex-1 w-full min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5A5955]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleUpdateSearch(e.target.value)}
            placeholder="Buscar sin tildes por nombre, apellido, #ID, barrio, calle o teléfono..."
            className="w-full min-w-0 rounded-xl border-2 border-[#323232] bg-[#F5F4F0] pl-9 sm:pl-10 pr-8 py-2 text-xs font-semibold text-[#323232] placeholder-[#5A5955] focus:bg-white focus:outline-hidden transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleUpdateSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5A5955] hover:text-[#323232]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto min-w-0">
          {/* Selector de Estado Exacto (los mismos estados que tiene cada contacto) */}
          <select
            value={granularEstadoFilter}
            onChange={(e) => {
              setGranularEstadoFilter(e.target.value as EstadoFlujo | 'TODOS');
              setQuickFilter('TODOS');
            }}
            className="w-full sm:w-auto flex-1 sm:flex-initial min-w-0 max-w-full sm:max-w-[230px] truncate rounded-xl border-2 border-[#323232] bg-[#F5F4F0] px-2.5 py-2 text-xs font-bold text-[#323232] focus:bg-white focus:outline-hidden"
            title="Filtrar por el mismo estado operativo del contacto"
          >
            <option value="TODOS">Todos los estados ({contacts.length})</option>
            {LISTA_ESTADOS_FLUJO_UNIFICADOS.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </select>

          {/* Selector de Barrio */}
          <select
            value={selectedBarrio}
            onChange={(e) => setSelectedBarrio(e.target.value)}
            className="w-full sm:w-auto flex-1 sm:flex-initial min-w-0 max-w-full truncate rounded-xl border-2 border-[#323232] bg-[#F5F4F0] px-2.5 py-2 text-xs font-bold text-[#323232] focus:bg-white focus:outline-hidden"
          >
            <option value="Todos">Todos los barrios ({contacts.length})</option>
            {availableBarrios.map(([b, cnt]) => (
              <option key={b} value={b}>
                {b} ({cnt})
              </option>
            ))}
          </select>

          {(activeStageFilter !== 'TODOS' ||
            selectedBarrio !== 'Todos' ||
            quickFilter !== 'TODOS' ||
            granularEstadoFilter !== 'TODOS' ||
            searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setActiveStageFilter('TODOS');
                setSelectedBarrio('Todos');
                setQuickFilter('TODOS');
                setGranularEstadoFilter('TODOS');
                setSearchQuery('');
              }}
              className="rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-2.5 py-2 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838]"
            >
              Limpiar filtros
            </button>
          )}

          {onCreateContact && (
            <button
              type="button"
              onClick={() => setShowNewContactModal(true)}
              className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#DFF4FF] px-3 py-2 text-xs font-bold font-display text-[#323232] hover:bg-[#29B8FF]"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>+ Contacto</span>
            </button>
          )}

          {viewMode === 'lanes' && (
            <button
              type="button"
              onClick={toggleAllStages}
              className="flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-2 text-xs font-bold font-display text-[#323232] hover:bg-[#ECEAE2]"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {areAllExpanded ? 'Plegar' : 'Desplegar'}
              </span>
            </button>
          )}

          {/* Switch de Vistas */}
          <div className="flex items-center rounded-xl bg-[#ECEAE2] p-1 border-2 border-[#323232]">
            <button
              type="button"
              onClick={() => setViewMode('lanes')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold font-display transition ${
                viewMode === 'lanes'
                  ? 'bg-[#FFF06B] text-[#323232] border border-[#323232]'
                  : 'text-[#5A5955] hover:text-[#323232]'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Carriles</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold font-display transition ${
                viewMode === 'list'
                  ? 'bg-[#FFF06B] text-[#323232] border border-[#323232]'
                  : 'text-[#5A5955] hover:text-[#323232]'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Lista</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal rápido para Nuevo Contacto */}
      {showNewContactModal && (
        <form
          onSubmit={handleCreateNewSubmit}
          className="rounded-2xl border-2 border-[#323232] bg-[#FFF06B]/40 p-4 shadow-[4px_4px_0px_#323232] space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="font-display text-sm font-bold text-[#323232]">
              ➕ Agregar Nuevo Contacto al Padrón y Google Sheets
            </h4>
            <button
              type="button"
              onClick={() => setShowNewContactModal(false)}
              className="rounded-lg p-1 text-[#323232]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
            <input
              type="text"
              value={newNombre}
              onChange={(e) => setNewNombre(e.target.value)}
              placeholder="Nombre y Apellido *"
              className="rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-semibold"
            />
            <input
              type="text"
              value={newTel}
              onChange={(e) => setNewTel(e.target.value)}
              placeholder="Teléfono WhatsApp (opcional si firmó)"
              className="rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-mono font-semibold"
            />
            <input
              type="text"
              value={newBarrio}
              onChange={(e) => setNewBarrio(e.target.value)}
              placeholder="Barrio (ej: Palermo)"
              className="rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-semibold"
            />
            <input
              type="text"
              value={newCalle}
              onChange={(e) => setNewCalle(e.target.value)}
              placeholder="Calle y altura / esquina"
              className="rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-semibold"
            />
            <select
              value={newEstadoInicial}
              onChange={(e) => setNewEstadoInicial(e.target.value as 'NUEVO' | 'YA_FIRMO')}
              className="rounded-xl border-2 border-[#323232] bg-white px-2.5 py-2 text-xs font-bold text-[#323232]"
              title="Elegí si es nuevo para contactar o si ya firmó ficha física hoy"
            >
              <option value="NUEVO">1. Nuevo por contactar</option>
              <option value="YA_FIRMO">✅ 5. Ya firmó ficha hoy</option>
            </select>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCom}
                onChange={(e) => setNewCom(e.target.value)}
                placeholder="Comentario / horario"
                className="flex-1 min-w-0 rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-semibold"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl border-2 border-[#323232] bg-[#323232] px-4 py-2 text-xs font-bold font-display text-[#FFF06B]"
              >
                Guardar
              </button>
            </div>
          </div>
        </form>
      )}

      {/* 4. VISTAS PRINCIPALES */}
      {viewMode === 'lanes' && (
        <div className="space-y-4">
          {MACRO_STAGES_ORDER.map((stageKey) => {
            const def = MACRO_STAGES[stageKey];
            const stageContacts = contactsByStage[stageKey];
            const isExpanded = Boolean(expandedStages[stageKey]);

            if (activeStageFilter !== 'TODOS' && activeStageFilter !== stageKey) {
              return null;
            }
            if (hasActiveSearchOrFilter && stageContacts.length === 0) {
              return null;
            }

            return (
              <div
                key={stageKey}
                className="rounded-2xl border-2 border-[#323232] bg-white shadow-[3px_3px_0px_#323232] overflow-visible"
              >
                <button
                  type="button"
                  onClick={() => toggleStage(stageKey)}
                  className="w-full flex items-center justify-between p-4 text-left transition hover:bg-[#ECEAE2]/50 select-none rounded-t-2xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`h-3.5 w-3.5 rounded-full border border-[#323232] ${def.dotColor} shrink-0`}
                    />
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-sm font-bold font-display text-[#323232]">
                        {def.label}
                      </h3>
                      <span className="rounded-lg bg-[#FFF06B] px-2.5 py-0.5 text-xs font-bold font-display text-[#323232] border border-[#323232]">
                        {stageContacts.length}
                      </span>
                    </div>
                    <p className="text-xs text-[#5A5955] hidden lg:block font-medium truncate">
                      — {def.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[11px] font-bold font-display text-[#323232] hidden sm:inline">
                      {isExpanded ? 'Plegar' : `Desplegar (${stageContacts.length})`}
                    </span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-[#323232] bg-[#ECEAE2] text-[#323232]">
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key={`content-${stageKey}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="border-t-2 border-[#323232] overflow-visible"
                    >
                      <div className="p-2.5 sm:p-4 bg-[#F5F4F0] overflow-visible">
                        {stageContacts.length === 0 ? (
                          <div className="rounded-xl border-2 border-dashed border-[#323232]/30 bg-white p-6 text-center text-xs text-[#5A5955] font-medium">
                            Sin candidatos en {def.label}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {stageContacts.map((c) => {
                              const idxInFiltered = filteredContacts.findIndex(
                                (item) => item.id === c.id
                              );
                              return (
                                <CandidateCard
                                  key={c.id}
                                  contact={c}
                                  layoutMode="horizontal"
                                  whatsAppReady={whatsAppReady}
                                  voiceProfile={voiceProfile}
                                  allContacts={contacts}
                                  calendarEvents={calendarEvents}
                                  isSelected={selectedContactId === c.id}
                                  isExpanded={expandedContactId === c.id}
                                  onSelect={handleCardActivate}
                                  onToggleExpand={handleCardActivate}
                                  onUpdateContact={async (id, updates) => {
                                    await onUpdateContact(id, updates);
                                    showToast(`Contacto #${id} actualizado`);
                                  }}
                                  onStageChange={handleDirectStageChange}
                                  onSendDirectWA={onSendDirectWA}
                                  hasPrev={idxInFiltered > 0}
                                  hasNext={
                                    idxInFiltered >= 0 &&
                                    idxInFiltered < filteredContacts.length - 1
                                  }
                                  onNavigateRelative={(dir) =>
                                    navigateContact(c.id, dir, false)
                                  }
                                  canDeleteContact={canDeleteContact}
                                  onDeleteContact={onDeleteContact}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* VISTA 2: LISTA HORIZONTAL CONTINUA */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {filteredContacts.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[#323232] bg-white p-10 text-center text-sm font-bold text-[#5A5955]">
              No se encontraron candidatos que coincidan con la búsqueda o filtro activo.
            </div>
          ) : (
            filteredContacts.map((c, idx) => (
              <CandidateCard
                key={c.id}
                contact={c}
                layoutMode="horizontal"
                whatsAppReady={whatsAppReady}
                voiceProfile={voiceProfile}
                allContacts={contacts}
                calendarEvents={calendarEvents}
                isSelected={selectedContactId === c.id}
                isExpanded={expandedContactId === c.id}
                onSelect={handleCardActivate}
                onToggleExpand={handleCardActivate}
                onUpdateContact={async (id, updates) => {
                  await onUpdateContact(id, updates);
                  showToast(`Contacto #${id} actualizado`);
                }}
                onStageChange={handleDirectStageChange}
                onSendDirectWA={onSendDirectWA}
                hasPrev={idx > 0}
                hasNext={idx < filteredContacts.length - 1}
                onNavigateRelative={(dir) => navigateContact(c.id, dir, false)}
                canDeleteContact={canDeleteContact}
                onDeleteContact={onDeleteContact}
              />
            ))
          )}
        </div>
      )}

      {/* Inspector Lateral / Candidate Drawer */}
      {selectedContact && (
        <CandidateDrawer
          contact={selectedContact}
          voiceProfile={voiceProfile}
          whatsAppReady={whatsAppReady}
          allContacts={contacts}
          calendarEvents={calendarEvents}
          onClose={() => setSelectedContactId(null)}
          onUpdateContact={async (id, updates) => {
            await onUpdateContact(id, updates);
            const nom =
              selectedContact?.primerNombre || selectedContact?.nombre || `Contacto #${id}`;
            showToast(`${nom} actualizado y sincronizado`);
          }}
          onSendDirectWA={onSendDirectWA}
          hasPrev={
            filteredContacts.findIndex((c) => c.id === selectedContact.id) > 0
          }
          hasNext={
            filteredContacts.findIndex((c) => c.id === selectedContact.id) >= 0 &&
            filteredContacts.findIndex((c) => c.id === selectedContact.id) <
              filteredContacts.length - 1
          }
          onNavigateRelative={(dir) => navigateContact(selectedContact.id, dir, true)}
        />
      )}

      {/* Feedback Visual Flotante */}
      <AnimatePresence>
        {feedbackToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border-2 border-[#323232] bg-[#FFF06B] px-4 py-3 shadow-[4px_4px_0px_#323232] text-[#323232]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#323232] bg-[#323232] text-[#FFF06B]">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold font-display text-[#323232]">
                {feedbackToast.message}
              </p>
              <p className="text-[11px] text-[#323232]/80 font-medium">
                🕒 Sincronizado a las {feedbackToast.timestamp} hs
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
