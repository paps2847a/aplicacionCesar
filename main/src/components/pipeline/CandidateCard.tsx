import React, { useState } from 'react';
import {
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Coffee,
  ChevronRight,
  Send,
  Phone,
  Copy,
  Check,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { Contact } from '../../types';
import {
  getMacroStageForContact,
  MACRO_STAGES,
  MACRO_STAGES_ORDER,
  MacroStageKey,
  getRecommendedActionForContact,
} from '../../domain/contacts/pipelineStages';

interface CandidateCardProps {
  contact: Contact;
  isSelected?: boolean;
  layoutMode?: 'horizontal' | 'compact';
  whatsAppReady?: boolean;
  onSelect: (contact: Contact) => void;
  onQuickAction?: (contact: Contact) => void;
  onStageChange?: (contact: Contact, targetStage: MacroStageKey) => void;
  onSendDirectWA?: (phone: string, text: string, contactId: string, nombre: string, barrio: string) => Promise<boolean>;
}

export function formatAuditDate(contact: Contact): string | null {
  if (contact.comentario) {
    const match = contact.comentario.match(/\[Modificado el ([^\]]+)\]/);
    if (match) return match[1];
    const matchOld = contact.comentario.match(/\[Último cambio:? ([^\]]+)\]/);
    if (matchOld) return matchOld[1];
  }
  if (contact.actualizadoEnAppAt) {
    const d = new Date(contact.actualizadoEnAppAt);
    if (!isNaN(d.getTime())) {
      const ddmm = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      const hhmm = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      return `${ddmm} a las ${hhmm} hs`;
    }
  }
  return null;
}

export const CandidateCard: React.FC<CandidateCardProps> = ({
  contact,
  isSelected,
  layoutMode = 'horizontal',
  whatsAppReady = false,
  onSelect,
  onQuickAction,
  onStageChange,
  onSendDirectWA,
}) => {
  const stageKey = getMacroStageForContact(contact);
  const stageDef = MACRO_STAGES[stageKey];
  const recAction = getRecommendedActionForContact(contact);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [showStageMenu, setShowStageMenu] = useState(false);

  const cleanComment = (contact.comentario || '')
    .replace(/\[Modificado el [^\]]+\]/g, '')
    .replace(/\[Último cambio:? [^\]]+\]/g, '')
    .trim();

  const auditDate = formatAuditDate(contact);
  const phone = contact.tel || contact.telRaw;
  const fullName = contact.nombreCompletoCorregido || contact.nombre || `Contacto #${contact.id}`;

  const handleCopyPhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (phone) {
      navigator.clipboard.writeText(phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  // ==========================================
  // MODO HORIZONTAL AMPLIO (Recomendado y Armonioso)
  // ==========================================
  if (layoutMode === 'horizontal') {
    return (
      <motion.div
        layout
        whileHover={{ y: -1 }}
        onClick={() => onSelect(contact)}
        className={`group relative cursor-pointer rounded-2xl border bg-white p-5 transition-all duration-200 ${
          isSelected
            ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
            : 'border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:border-slate-300 hover:shadow-md'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          {/* 1. Columna de Identidad & Contacto */}
          <div className="lg:w-1/3 min-w-[240px] space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-black text-slate-700">
                #{contact.id}
              </span>
              <h4 className="text-base font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                {fullName}
              </h4>
            </div>

            {/* Teléfono con botón de un clic para copiar */}
            {phone && (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="font-mono font-bold">{phone}</span>
                <button
                  type="button"
                  onClick={handleCopyPhone}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200 transition"
                  title="Copiar teléfono"
                >
                  {copiedPhone ? (
                    <>
                      <Check className="h-2.5 w-2.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-2.5 w-2.5 text-slate-500" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Auditoría Discreta */}
            <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
              <Clock className="h-3 w-3 text-slate-400 shrink-0" />
              <span>{auditDate ? `Modificado: ${auditDate}` : 'Sin cambios recientes'}</span>
            </div>
          </div>

          {/* 2. Columna de Ubicación & Logística */}
          <div className="lg:w-1/4 min-w-[200px] space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800 border border-emerald-200/70">
                <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                {contact.barrio || 'CABA'}
              </span>

              {contact.franjaHoraria && contact.franjaHoraria !== 'Flexible' && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                  <Clock className="h-3 w-3 text-slate-500" />
                  {contact.franjaHoraria}
                </span>
              )}
            </div>

            {contact.calleOCruce && (
              <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="line-clamp-2">{contact.calleOCruce}</span>
              </p>
            )}

            {contact.alertaVencido?.activa && (
              <div className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 border border-rose-200">
                <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                <span>Cita pendiente por reprogramar</span>
              </div>
            )}
          </div>

          {/* 3. Columna de Notas de Columna G (Directamente visible sin abrir cajón) */}
          <div className="lg:w-1/3 min-w-[220px]">
            {cleanComment ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs text-slate-700 font-medium">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                  Nota territorial:
                </span>
                <p className="line-clamp-3 leading-relaxed">&ldquo;{cleanComment}&rdquo;</p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-2.5 text-[11px] text-slate-400 text-center italic">
                Sin notas adicionales en Columna G
              </div>
            )}
          </div>

          {/* 4. Columna de Acciones Rápidas Directas */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-end justify-between gap-2 shrink-0">
            {/* Stage Badge con Dropdown de cambio rápido */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStageMenu((prev) => !prev);
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-black tracking-tight transition shadow-xs hover:opacity-90 ${stageDef.badgeBg} ${stageDef.badgeText} ${stageDef.badgeBorder}`}
              >
                <span>{stageDef.label}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>

              {showStageMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1.5 z-30 w-48 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
                >
                  <span className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-400 block">
                    Mover a etapa:
                  </span>
                  {MACRO_STAGES_ORDER.map((stKey) => {
                    const st = MACRO_STAGES[stKey];
                    const isCur = stKey === stageKey;
                    return (
                      <button
                        key={stKey}
                        type="button"
                        onClick={() => {
                          setShowStageMenu(false);
                          if (onStageChange) onStageChange(contact, stKey);
                        }}
                        className={`w-full flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-bold text-left transition ${
                          isCur
                            ? 'bg-slate-100 text-slate-900 font-black'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span>{st.label}</span>
                        {isCur && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center gap-1.5">
              {stageKey !== 'adheridos' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onStageChange) onStageChange(contact, 'adheridos');
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
                  title="Marcar como firma oficial completada"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Firmó</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(contact);
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 transition shadow-2xs"
              >
                <span>Detalles</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ==========================================
  // MODO COMPACTO (Para vista Kanban opcional)
  // ==========================================
  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      onClick={() => onSelect(contact)}
      className={`group relative cursor-pointer rounded-2xl border bg-white p-4 transition-all duration-200 ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
          : 'border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:border-slate-300 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-bold text-slate-400">
              #{contact.id}
            </span>
            <h4 className="truncate text-sm font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
              {fullName}
            </h4>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
              <MapPin className="h-3 w-3 text-slate-400" />
              {contact.barrio || 'CABA'}
            </span>
            {contact.franjaHoraria && contact.franjaHoraria !== 'Flexible' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                <Clock className="h-3 w-3 text-slate-400" />
                {contact.franjaHoraria}
              </span>
            )}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black tracking-tight ${stageDef.badgeBg} ${stageDef.badgeText} ${stageDef.badgeBorder}`}
        >
          {stageDef.shortLabel}
        </span>
      </div>

      {contact.calleOCruce ? (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-50/80 rounded-lg px-2.5 py-1 border border-slate-100">
          <MapPin className="h-3 w-3 text-emerald-600 shrink-0" />
          <span className="truncate">{contact.calleOCruce}</span>
        </div>
      ) : cleanComment ? (
        <p className="mt-2 text-[11px] text-slate-500 line-clamp-2 italic">
          &ldquo;{cleanComment}&rdquo;
        </p>
      ) : null}

      {/* Auditoría Discreta */}
      {auditDate && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 font-medium">
          <Clock className="h-2.5 w-2.5 text-slate-400 shrink-0" />
          <span>{auditDate}</span>
        </div>
      )}

      {contact.alertaVencido?.activa && (
        <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
          <AlertCircle className="h-3 w-3 text-rose-600 shrink-0" />
          <span className="truncate">Cita pendiente sin concretar</span>
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
        <span className="text-[11px] text-slate-400 font-medium">
          {contact.primerContactoEnviado ? '1er msj enviado' : 'Sin contactar'}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onQuickAction) {
              onQuickAction(contact);
            } else {
              onSelect(contact);
            }
          }}
          className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700 hover:text-emerald-800 transition"
        >
          <span>{recAction.shortLabel}</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
};
