import React, { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Filter,
  LayoutGrid,
  List,
  Columns3,
  MapPin,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Sparkles,
  Users,
  CheckCircle2,
  Clock,
  Send,
  Layers,
  Check,
  Plus,
  UserPlus,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Contact, EstadoFlujo, VoiceProfile } from '../../types';
import {
  getMacroStageForContact,
  MACRO_STAGES,
  MACRO_STAGES_ORDER,
  MacroStageKey,
} from '../../domain/contacts/pipelineStages';
import { CandidateCard } from './CandidateCard';
import { CandidateDrawer } from './CandidateDrawer';

interface CandidatePipelineViewProps {
  contacts: Contact[];
  voiceProfile: VoiceProfile;
  whatsAppReady: boolean;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => Promise<void> | void;
  onSendDirectWA?: (
    phone: string,
    text: string,
    contactId: string,
    nombre: string,
    barrio: string,
    tipoPlantilla?: string
  ) => Promise<boolean>;
  onOpenAutoWAModal: () => void;
  selectedContactId?: string | null;
  onSelectContactId?: (id: string | null) => void;
  onAddNewContact?: (newContact: {
    nombre: string;
    tel: string;
    barrio: string;
    calleOCruce?: string;
    comentario?: string;
  }) => Promise<void> | void;
}

export const CandidatePipelineView: React.FC<CandidatePipelineViewProps> = ({
  contacts,
  voiceProfile,
  whatsAppReady,
  onUpdateContact,
  onSendDirectWA,
  onOpenAutoWAModal,
  selectedContactId,
  onSelectContactId,
  onAddNewContact,
}) => {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const activeSelectedId = selectedContactId !== undefined ? selectedContactId : internalSelectedId;

  const handleSelectContact = useCallback(
    (id: string | null) => {
      if (onSelectContactId) onSelectContactId(id);
      setInternalSelectedId(id);
    },
    [onSelectContactId]
  );

  // Mantener el contacto seleccionado sincronizado en tiempo real con la lista viva de contactos
  const selectedContact = useMemo(() => {
    if (!activeSelectedId) return null;
    return contacts.find((c) => String(c.id) === String(activeSelectedId)) || null;
  }, [contacts, activeSelectedId]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBarrio, setSelectedBarrio] = useState<string>('Todos');
  const [activeStageFilter, setActiveStageFilter] = useState<MacroStageKey | 'TODOS'>('TODOS');
  const [operationalFilter, setOperationalFilter] = useState<
    'TODOS' | 'SIN_RSP_48H' | 'FALTA_CONFIRMAR' | 'FALTAN_DATOS' | 'RETIRO_FICHAS'
  >('TODOS');
  const [viewMode, setViewMode] = useState<'lanes' | 'list' | 'board'>('lanes');

  // Estado del modal de nuevo contacto
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [nuevoNombre, setNuevoNombre] = useState<string>('');
  const [nuevoTel, setNuevoTel] = useState<string>('');
  const [nuevoBarrio, setNuevoBarrio] = useState<string>('Palermo');
  const [nuevaCalle, setNuevaCalle] = useState<string>('');
  const [nuevoComentario, setNuevoComentario] = useState<string>('');

  // Estado de etapas retraíbles (Por defecto TODAS retraídas a pedido del usuario)
  const [expandedStages, setExpandedStages] = useState<Record<MacroStageKey, boolean>>({
    nuevos: false,
    conversacion: false,
    agendados: false,
    pausa: false,
    adheridos: false,
    descartados: false,
  });

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

  // Feedback Visual Toast
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
    }, 4000);
  }, []);

  // Conteo dinámico por etapa
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

  // Lista de barrios disponibles
  const availableBarrios = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contacts) {
      const b = (c.barrio || 'CABA').trim();
      map.set(b, (map.get(b) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [contacts]);

  // Conteo de filtros operativos
  const operationalCounts = useMemo(() => {
    let sinRsp = 0;
    let faltaConf = 0;
    let faltanDatos = 0;
    let retiroFichas = 0;

    for (const c of contacts) {
      if (c.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP') sinRsp++;
      if (c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR') faltaConf++;
      if (
        c.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
        (!c.calleOCruce && !(c.comentario || '').match(/\b(calle|av|av\.|avenida)\b/i))
      ) {
        faltanDatos++;
      }
      if (
        c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
        (c.comentario || '').toLowerCase().includes('ficha')
      ) {
        retiroFichas++;
      }
    }
    return { sinRsp, faltaConf, faltanDatos, retiroFichas };
  }, [contacts]);

  // Filtrado de contactos
  // Filtrado de contactos omnisciente y universal
  const filteredContacts = useMemo(() => {
    const qRaw = searchQuery.trim();
    const hasSearch = qRaw.length > 0;
    const q = qRaw.toLowerCase();
    const qDigits = qRaw.replace(/\D/g, '');

    return contacts.filter((c) => {
      // 1. Filtro de búsqueda universal (Nombre, DNI, Teléfono formateado o dígitos limpios, Barrio, Calle, Comentarios)
      if (hasSearch) {
        const nom = (c.nombre || '').toLowerCase();
        const matchName = nom.includes(q);
        const matchId = String(c.id || '') === q || `#${c.id}` === q || (qDigits.length > 0 && String(c.id) === qDigits);
        
        // Búsqueda por teléfono: tolera sin espacios, sin guiones, con o sin 54/9/15
        const rawTelDigits = (c.telRaw || '').replace(/\D/g, '');
        const normTelDigits = (c.tel || (c as any).tel_norm || '').replace(/\D/g, '');
        const matchTel =
          (c.tel || c.telRaw || '').toLowerCase().includes(q) ||
          (qDigits.length >= 3 && (rawTelDigits.includes(qDigits) || normTelDigits.includes(qDigits)));

        // Búsqueda por DNI (del campo explícito o en comentarios/notas)
        const dniDigits = ((c as any).dni || '').replace(/\D/g, '');
        const matchDni =
          (qDigits.length >= 4 && dniDigits.includes(qDigits)) ||
          ((c as any).dni || '').toLowerCase().includes(q);

        const matchBarrio = (c.barrio || '').toLowerCase().includes(q);
        const matchCalle = (c.calleOCruce || '').toLowerCase().includes(q);
        const matchCom = (c.comentario || '').toLowerCase().includes(q);

        const matchesQuery = matchName || matchId || matchTel || matchDni || matchBarrio || matchCalle || matchCom;
        if (!matchesQuery) return false;

        // Cuando el usuario busca explícitamente a alguien por nombre, teléfono, DNI o dato,
        // la búsqueda es universal para encontrarlo sí o sí en toda la base sin que otros filtros lo oculten.
        return true;
      }

      // 2. Filtro de barrio
      if (selectedBarrio !== 'Todos' && (c.barrio || 'CABA').trim() !== selectedBarrio) {
        return false;
      }

      // 3. Filtro de etapa macro
      if (activeStageFilter !== 'TODOS') {
        const stage = getMacroStageForContact(c);
        if (stage !== activeStageFilter) {
          return false;
        }
      }

      // 4. Filtro operativo
      if (operationalFilter === 'SIN_RSP_48H') {
        if (c.estadoFlujo !== '1ER_MSJ_ENVIADO_SIN_RSP') return false;
      } else if (operationalFilter === 'FALTA_CONFIRMAR') {
        if (c.estadoFlujo !== 'PASO_DATOS_FALTA_CONFIRMAR') return false;
      } else if (operationalFilter === 'FALTAN_DATOS') {
        const hasCalle = c.calleOCruce || (c.comentario && /\b(calle|av|av\.|avenida)\b/i.test(c.comentario));
        if (c.estadoFlujo !== 'RESPONDIO_FALTA_DNI_O_ZONA' && hasCalle) return false;
      } else if (operationalFilter === 'RETIRO_FICHAS') {
        const hasFichas =
          c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
          (c.comentario || '').toLowerCase().includes('ficha');
        if (!hasFichas) return false;
      }

      return true;
    });
  }, [contacts, searchQuery, selectedBarrio, activeStageFilter, operationalFilter]);

  // Navegación secuencial entre candidatos en el drawer
  const currentIndex = useMemo(() => {
    if (!selectedContact) return -1;
    return filteredContacts.findIndex((c) => String(c.id) === String(selectedContact.id));
  }, [filteredContacts, selectedContact]);

  const hasPrevContact = currentIndex > 0;
  const hasNextContact = currentIndex >= 0 && currentIndex < filteredContacts.length - 1;

  const handlePrevContact = useCallback(() => {
    if (hasPrevContact) {
      handleSelectContact(filteredContacts[currentIndex - 1].id);
    }
  }, [hasPrevContact, currentIndex, filteredContacts, handleSelectContact]);

  const handleNextContact = useCallback(() => {
    if (hasNextContact) {
      handleSelectContact(filteredContacts[currentIndex + 1].id);
    }
  }, [hasNextContact, currentIndex, filteredContacts, handleSelectContact]);

  // Agrupación por etapas
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

  // Handler para cambio directo de etapa con auditoría de fecha y hora
  const handleDirectStageChange = useCallback(
    async (contact: Contact, targetStage: MacroStageKey) => {
      const ahora = new Date();
      const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const auditText = `${ddmm} a las ${hhmm} hs`;
      const targetDef = MACRO_STAGES[targetStage];
      const nom = contact.primerNombre || contact.nombre || `Contacto #${contact.id}`;

      if (targetStage === 'nuevos') {
        const baseCom = (contact.comentario || '')
          .replace(/\s*\[Modificado el [^\]]+\]/g, '')
          .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
          .replace(/\s*\[Firmó el [^\]]+\]/g, '')
          .trim();
        await onUpdateContact(contact.id, {
          estadoFlujo: 'SIN_CONTACTAR_1ER_MSJ',
          adhirio: 'Pendiente',
          rsp: 'Nuevo',
          primerContactoEnviado: false,
          comentario: baseCom,
          actualizadoEnAppAt: '',
        });
        showToast(`${nom} devuelto a "Nuevos" (limpio de auditoría)`);
        return;
      }

      if (targetStage === 'adheridos') {
        const baseCom = (contact.comentario || '')
          .replace(/\s*\[Modificado el [^\]]+\]/g, '')
          .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
          .replace(/\s*\[Firmó el [^\]]+\]/g, '')
          .trim();
        const newComentario = baseCom
          ? `${baseCom} [Firmó el ${auditText}]`
          : `[Firmó el ${auditText}]`;

        await onUpdateContact(contact.id, {
          estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
          adhirio: 'Sí',
          rsp: 'Sí',
          primerContactoEnviado: true,
          comentario: newComentario,
          actualizadoEnAppAt: ahora.toISOString(),
        });
        showToast(`✓ ¡Firma oficial registrada para ${nom}!`);
        return;
      }

      let nextEstado: EstadoFlujo = contact.estadoFlujo || '1ER_MSJ_ENVIADO_SIN_RSP';
      let nextAdhirio = contact.adhirio;
      let nextRsp = contact.rsp;

      switch (targetStage) {
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
        case 'descartados':
          nextEstado = 'DESCARTADO_O_BAJA';
          nextAdhirio = 'No';
          break;
      }

      const baseCom = (contact.comentario || '')
        .replace(/\s*\[Modificado el [^\]]+\]/g, '')
        .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
        .trim();
      const newComentario = baseCom
        ? `${baseCom} [Modificado el ${auditText} a "${targetDef.shortLabel}"]`
        : `[Modificado el ${auditText} a "${targetDef.shortLabel}"]`;

      await onUpdateContact(contact.id, {
        estadoFlujo: nextEstado,
        adhirio: nextAdhirio,
        rsp: nextRsp,
        primerContactoEnviado: true,
        comentario: newComentario,
        actualizadoEnAppAt: ahora.toISOString(),
      });

      showToast(`${nom} movido a "${targetDef.label}"`);
    },
    [onUpdateContact, showToast]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* 1. Barra Superior de Métricas de Etapa (KPI Cards con filtro interactivo) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
              className={`group flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-all duration-200 ${
                isSelected
                  ? 'bg-white ring-2 ring-emerald-500/40 border-emerald-500 shadow-md'
                  : 'bg-white/80 hover:bg-white border-slate-200/80 hover:border-slate-300 shadow-[0_2px_6px_rgba(0,0,0,0.02)] hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  {def.shortLabel}
                </span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${def.dotColor} ${
                    isSelected ? 'ring-2 ring-emerald-300' : ''
                  }`}
                />
              </div>

              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                  {count}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {Math.round((count / Math.max(1, contacts.length)) * 100)}%
                </span>
              </div>

              <p className="mt-1 text-[10px] text-slate-500 truncate">
                {def.tagline}
              </p>
            </button>
          );
        })}
      </div>

      {/* 2. Barra de Búsqueda, Filtros y Switch de Vistas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        {/* Input de Búsqueda */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, barrio, calle o teléfono..."
            className="w-full rounded-xl border border-slate-200/80 bg-slate-50/60 pl-10 pr-4 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:border-emerald-500 focus:outline-hidden transition"
          />
        </div>

        {/* Selector de Barrio & Modo de Vista */}
        <div className="flex items-center gap-2">
          {/* Barrio */}
          <select
            value={selectedBarrio}
            onChange={(e) => setSelectedBarrio(e.target.value)}
            className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 text-xs font-bold text-slate-700 focus:bg-white focus:border-emerald-500 focus:outline-hidden"
          >
            <option value="Todos">Todos los barrios ({contacts.length})</option>
            {availableBarrios.map(([b, cnt]) => (
              <option key={b} value={b}>
                {b} ({cnt})
              </option>
            ))}
          </select>

          {/* Botón limpiar filtros */}
          {(activeStageFilter !== 'TODOS' || selectedBarrio !== 'Todos' || searchQuery) && (
            <button
              onClick={() => {
                setActiveStageFilter('TODOS');
                setSelectedBarrio('Todos');
                setSearchQuery('');
              }}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition"
              title="Limpiar filtros"
            >
              Limpiar
            </button>
          )}

          {/* Botón Plegar / Desplegar todas las etapas (Sólo en modo carriles) */}
          {viewMode === 'lanes' && (
            <button
              type="button"
              onClick={toggleAllStages}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-2xs"
              title={areAllExpanded ? 'Plegar todas las etapas' : 'Desplegar todas las etapas'}
            >
              <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
              <span className="hidden sm:inline">
                {areAllExpanded ? 'Plegar todas' : 'Desplegar todas'}
              </span>
            </button>
          )}

          {/* Switch de Vistas: Carriles Horizontales (Lanes) vs Lista (List) vs Tablero (Board) */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200/60">
            <button
              type="button"
              onClick={() => setViewMode('lanes')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                viewMode === 'lanes'
                  ? 'bg-white text-slate-900 shadow-xs font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Carriles amplios horizontales por etapa"
            >
              <Layers className="h-3.5 w-3.5 text-emerald-600" />
              <span className="hidden md:inline">Carriles Amplios</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-xs font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Lista horizontal continua"
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Lista</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                viewMode === 'board'
                  ? 'bg-white text-slate-900 shadow-xs font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Tablero Kanban de 6 columnas"
            >
              <Columns3 className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Kanban</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2.5 Chips de Filtros Operativos Rápidos + Botón Nuevo Contacto */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Filtro operativo:
          </span>
          <button
            type="button"
            onClick={() => setOperationalFilter('TODOS')}
            className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
              operationalFilter === 'TODOS'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Todos ({contacts.length})
          </button>
          <button
            type="button"
            onClick={() => setOperationalFilter(operationalFilter === 'SIN_RSP_48H' ? 'TODOS' : 'SIN_RSP_48H')}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition ${
              operationalFilter === 'SIN_RSP_48H'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <span>💬 Sin Rsp 1er msj</span>
            <span className="rounded-full bg-white/60 px-1.5 py-0.2 text-[10px] font-black">
              {operationalCounts.sinRsp}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setOperationalFilter(operationalFilter === 'FALTA_CONFIRMAR' ? 'TODOS' : 'FALTA_CONFIRMAR')}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition ${
              operationalFilter === 'FALTA_CONFIRMAR'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-sky-50 border border-sky-200 text-sky-800 hover:bg-sky-100'
            }`}
          >
            <span>📍 Falta confirmar</span>
            <span className="rounded-full bg-white/60 px-1.5 py-0.2 text-[10px] font-black">
              {operationalCounts.faltaConf}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setOperationalFilter(operationalFilter === 'FALTAN_DATOS' ? 'TODOS' : 'FALTAN_DATOS')}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition ${
              operationalFilter === 'FALTAN_DATOS'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-orange-50 border border-orange-200 text-orange-800 hover:bg-orange-100'
            }`}
          >
            <span>⚠️ Faltan datos</span>
            <span className="rounded-full bg-white/60 px-1.5 py-0.2 text-[10px] font-black">
              {operationalCounts.faltanDatos}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setOperationalFilter(operationalFilter === 'RETIRO_FICHAS' ? 'TODOS' : 'RETIRO_FICHAS')}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition ${
              operationalFilter === 'RETIRO_FICHAS'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 border border-purple-200 text-purple-800 hover:bg-purple-100'
            }`}
          >
            <span>📋 Retiro de Fichas</span>
            <span className="rounded-full bg-white/60 px-1.5 py-0.2 text-[10px] font-black">
              {operationalCounts.retiroFichas}
            </span>
          </button>
        </div>

        {/* Botón Agregar Candidato */}
        {onAddNewContact && (
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold shadow-xs transition"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>+ Nuevo Contacto</span>
          </button>
        )}
      </div>

      {/* Modal Nuevo Contacto */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <UserPlus className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">Agregar Nuevo Contacto</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!nuevoNombre.trim()) return;
                if (onAddNewContact) {
                  await onAddNewContact({
                    nombre: nuevoNombre.trim(),
                    tel: nuevoTel.trim(),
                    barrio: nuevoBarrio.trim(),
                    calleOCruce: nuevaCalle.trim(),
                    comentario: nuevoComentario.trim(),
                  });
                }
                setNuevoNombre('');
                setNuevoTel('');
                setNuevaCalle('');
                setNuevoComentario('');
                setIsAddModalOpen(false);
                showToast(`Contacto "${nuevoNombre.trim()}" agregado`);
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Nombre y Apellido *
                </label>
                <input
                  type="text"
                  required
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Ej: Sofía Gómez"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={nuevoTel}
                    onChange={(e) => setNuevoTel(e.target.value)}
                    placeholder="Ej: 11 1234 5678"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Barrio
                  </label>
                  <input
                    type="text"
                    value={nuevoBarrio}
                    onChange={(e) => setNuevoBarrio(e.target.value)}
                    placeholder="Palermo, Recoleta..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Calle / Cruce / Dirección
                </label>
                <input
                  type="text"
                  value={nuevaCalle}
                  onChange={(e) => setNuevaCalle(e.target.value)}
                  placeholder="Ej: Av. Santa Fe 3200 o Gurruchaga y Honduras"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Comentario / Notas
                </label>
                <textarea
                  rows={2}
                  value={nuevoComentario}
                  onChange={(e) => setNuevoComentario(e.target.value)}
                  placeholder="Ej: Se contactó por Instagram, prefiere horario tarde"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition"
                >
                  Guardar Contacto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. VISTAS PRINCIPALES */}

      {/* VISTA 1: CARRILES HORIZONTALES POR ETAPA RETRAÍBLES (Por defecto retraídas) */}
      {viewMode === 'lanes' && (
        <div className="space-y-4">
          {MACRO_STAGES_ORDER.map((stageKey) => {
            const def = MACRO_STAGES[stageKey];
            const stageContacts = contactsByStage[stageKey];
            const hasActiveSearch = searchQuery.trim().length > 0;
            const isExpanded = hasActiveSearch ? stageContacts.length > 0 : !!expandedStages[stageKey];

            // Si hay un filtro por etapa y no es esta, ocultar (salvo cuando se está buscando específicamente)
            if (!hasActiveSearch && activeStageFilter !== 'TODOS' && activeStageFilter !== stageKey) {
              return null;
            }

            return (
              <div
                key={stageKey}
                className="rounded-3xl border border-slate-200/80 bg-white shadow-xs overflow-hidden transition-all duration-200 hover:shadow-sm"
              >
                {/* Cabecera Clickeable para Desplegar / Retraer en un Clic */}
                <button
                  type="button"
                  onClick={() => toggleStage(stageKey)}
                  className="w-full flex items-center justify-between p-4 sm:p-5 text-left transition hover:bg-slate-50/80 select-none group focus:outline-hidden"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`h-3.5 w-3.5 rounded-full ${def.dotColor} shrink-0 ring-4 ring-slate-100 group-hover:ring-slate-200/70 transition-all`}
                    />
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-sm font-black text-slate-900 tracking-tight group-hover:text-emerald-700 transition-colors">
                        {def.label}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-700 border border-slate-200/60">
                        {stageContacts.length}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 hidden lg:block font-medium truncate">
                      — {def.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 ml-3">
                    <span className="text-[11px] font-bold text-slate-500 hidden sm:inline">
                      {isExpanded ? 'Plegar etapa' : `Desplegar (${stageContacts.length})`}
                    </span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-slate-200/70 transition-colors">
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180 text-emerald-600' : 'text-slate-500'
                        }`}
                      />
                    </div>
                  </div>
                </button>

                {/* Contenedor de Tarjetas Horizontales Desplegable */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key={`content-${stageKey}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: 'easeInOut' }}
                      className="overflow-hidden border-t border-slate-100"
                    >
                      <div className="p-4 sm:p-5 bg-slate-50/40">
                        {stageContacts.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-400 font-medium">
                            Sin candidatos en la etapa {def.label}
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {stageContacts.map((c) => (
                              <CandidateCard
                                key={c.id}
                                contact={c}
                                layoutMode="horizontal"
                                whatsAppReady={whatsAppReady}
                                isSelected={activeSelectedId === c.id}
                                onSelect={(contact) => handleSelectContact(contact.id)}
                                onStageChange={handleDirectStageChange}
                                onSendDirectWA={onSendDirectWA}
                              />
                            ))}
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
        <div className="space-y-2.5">
          {filteredContacts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
              No se encontraron candidatos que coincidan con la búsqueda.
            </div>
          ) : (
            filteredContacts.map((c) => (
              <CandidateCard
                key={c.id}
                contact={c}
                layoutMode="horizontal"
                whatsAppReady={whatsAppReady}
                isSelected={activeSelectedId === c.id}
                onSelect={(contact) => handleSelectContact(contact.id)}
                onStageChange={handleDirectStageChange}
                onSendDirectWA={onSendDirectWA}
              />
            ))
          )}
        </div>
      )}

      {/* VISTA 3: TABLERO KANBAN DE 6 COLUMNAS COMPACTAS */}
      {viewMode === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
          {MACRO_STAGES_ORDER.map((stageKey) => {
            const def = MACRO_STAGES[stageKey];
            const stageContacts = contactsByStage[stageKey];

            return (
              <div
                key={stageKey}
                className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 shadow-2xs"
              >
                {/* Cabecera de Columna */}
                <div className="flex items-center justify-between pb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${def.dotColor}`} />
                    <h3 className="text-xs font-black text-slate-800">
                      {def.shortLabel}
                    </h3>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-700 shadow-2xs border border-slate-200/60">
                    {stageContacts.length}
                  </span>
                </div>

                {/* Lista de Tarjetas Compactas */}
                <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
                  {stageContacts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                      Sin candidatos
                    </div>
                  ) : (
                    stageContacts.map((c) => (
                      <CandidateCard
                        key={c.id}
                        contact={c}
                        layoutMode="compact"
                        whatsAppReady={whatsAppReady}
                        isSelected={activeSelectedId === c.id}
                        onSelect={(contact) => handleSelectContact(contact.id)}
                        onStageChange={handleDirectStageChange}
                        onSendDirectWA={onSendDirectWA}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Inspector Lateral / Candidate Drawer */}
      <CandidateDrawer
        contact={selectedContact}
        voiceProfile={voiceProfile}
        whatsAppReady={whatsAppReady}
        onClose={() => handleSelectContact(null)}
        onUpdateContact={async (id, updates) => {
          await onUpdateContact(id, updates);
          const nom = selectedContact?.primerNombre || selectedContact?.nombre || `Contacto #${id}`;
          showToast(`${nom} actualizado en auditoría`);
        }}
        onSendDirectWA={onSendDirectWA}
        onNextContact={handleNextContact}
        onPrevContact={handlePrevContact}
        hasNextContact={hasNextContact}
        hasPrevContact={hasPrevContact}
      />

      {/* 5. Feedback Visual Flotante (Toast de Auditoría) */}
      <AnimatePresence>
        {feedbackToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-300 bg-white px-4 py-3 shadow-xl text-slate-800"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-900">{feedbackToast.message}</p>
              <p className="text-[11px] text-slate-500 font-medium">
                🕒 Registrado en auditoría a las {feedbackToast.timestamp} hs
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
