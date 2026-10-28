import React, { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Filter,
  LayoutGrid,
  List,
  Columns3,
  MapPin,
  ChevronRight,
  Sparkles,
  Users,
  CheckCircle2,
  Clock,
  Send,
  Layers,
  Check,
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
  onSendDirectWA?: (phone: string, text: string, contactId: string, nombre: string, barrio: string) => Promise<boolean>;
  onOpenAutoWAModal: () => void;
}

export const CandidatePipelineView: React.FC<CandidatePipelineViewProps> = ({
  contacts,
  voiceProfile,
  whatsAppReady,
  onUpdateContact,
  onSendDirectWA,
  onOpenAutoWAModal,
}) => {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBarrio, setSelectedBarrio] = useState<string>('Todos');
  const [activeStageFilter, setActiveStageFilter] = useState<MacroStageKey | 'TODOS'>('TODOS');
  const [viewMode, setViewMode] = useState<'lanes' | 'list' | 'board'>('lanes');

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

  // Filtrado de contactos
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      // 1. Filtro de búsqueda
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (c.nombre || '').toLowerCase().includes(q);
        const matchId = String(c.id || '') === q || `#${c.id}` === q;
        const matchTel = (c.tel || c.telRaw || '').includes(q);
        const matchBarrio = (c.barrio || '').toLowerCase().includes(q);
        const matchCalle = (c.calleOCruce || '').toLowerCase().includes(q);
        const matchCom = (c.comentario || '').toLowerCase().includes(q);
        if (!matchName && !matchId && !matchTel && !matchBarrio && !matchCalle && !matchCom) {
          return false;
        }
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

      return true;
    });
  }, [contacts, searchQuery, selectedBarrio, activeStageFilter]);

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

      const ahora = new Date();
      const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const auditText = `${ddmm} a las ${hhmm} hs`;
      const targetDef = MACRO_STAGES[targetStage];

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
        primerContactoEnviado: targetStage !== 'nuevos',
        comentario: newComentario,
        actualizadoEnAppAt: ahora.toISOString(),
      });

      const nom = contact.primerNombre || contact.nombre || `Contacto #${contact.id}`;
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
                setActiveStageFilter(isSelected ? 'TODOS' : stageKey);
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

      {/* 3. VISTAS PRINCIPALES */}

      {/* VISTA 1: CARRILES HORIZONTALES POR ETAPA (Recomendada y espaciosa) */}
      {viewMode === 'lanes' && (
        <div className="space-y-6">
          {MACRO_STAGES_ORDER.map((stageKey) => {
            const def = MACRO_STAGES[stageKey];
            const stageContacts = contactsByStage[stageKey];

            // Si hay un filtro por etapa y no es esta, ocultar
            if (activeStageFilter !== 'TODOS' && activeStageFilter !== stageKey) {
              return null;
            }

            return (
              <div
                key={stageKey}
                className="rounded-3xl border border-slate-200/80 bg-white/50 p-5 shadow-xs space-y-3"
              >
                {/* Cabecera de la Etapa */}
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-3 w-3 rounded-full ${def.dotColor}`} />
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      {def.label}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-700">
                      {stageContacts.length}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 hidden sm:block font-medium">
                    {def.description}
                  </p>
                </div>

                {/* Contenedor de Tarjetas Horizontales */}
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
                        isSelected={selectedContact?.id === c.id}
                        onSelect={(contact) => setSelectedContact(contact)}
                        onStageChange={handleDirectStageChange}
                        onSendDirectWA={onSendDirectWA}
                      />
                    ))}
                  </div>
                )}
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
                isSelected={selectedContact?.id === c.id}
                onSelect={(contact) => setSelectedContact(contact)}
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
                        isSelected={selectedContact?.id === c.id}
                        onSelect={(contact) => setSelectedContact(contact)}
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
        onClose={() => setSelectedContact(null)}
        onUpdateContact={async (id, updates) => {
          await onUpdateContact(id, updates);
          const nom = selectedContact?.primerNombre || selectedContact?.nombre || `Contacto #${id}`;
          showToast(`${nom} actualizado en auditoría`);
        }}
        onSendDirectWA={onSendDirectWA}
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
