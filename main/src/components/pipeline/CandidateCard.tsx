import React from 'react';
import {
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Coffee,
  ChevronRight,
  Send,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { Contact } from '../../types';
import {
  getMacroStageForContact,
  MACRO_STAGES,
  getRecommendedActionForContact,
} from '../../domain/contacts/pipelineStages';

interface CandidateCardProps {
  contact: Contact;
  isSelected?: boolean;
  onSelect: (contact: Contact) => void;
  onQuickAction?: (contact: Contact) => void;
}

export const CandidateCard: React.FC<CandidateCardProps> = ({
  contact,
  isSelected,
  onSelect,
  onQuickAction,
}) => {
  const stageKey = getMacroStageForContact(contact);
  const stageDef = MACRO_STAGES[stageKey];
  const recAction = getRecommendedActionForContact(contact);

  const cleanComment = (contact.comentario || '')
    .replace(/\[[^\]]+\]/g, '')
    .trim();

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
      {/* Header: Name and Neighborhood */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-bold text-slate-400">
              #{contact.id}
            </span>
            <h4 className="truncate text-sm font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
              {contact.primerNombre || contact.nombre}
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

        {/* Stage Badge */}
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black tracking-tight ${stageDef.badgeBg} ${stageDef.badgeText} ${stageDef.badgeBorder}`}
        >
          {stageDef.shortLabel}
        </span>
      </div>

      {/* Snippet / Dirección / Comentario si existe */}
      {contact.calleOCruce ? (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-50/80 rounded-lg px-2.5 py-1 border border-slate-100">
          <MapPin className="h-3 w-3 text-emerald-600 shrink-0" />
          <span className="truncate">{contact.calleOCruce}</span>
        </div>
      ) : cleanComment ? (
        <p className="mt-2 text-[11px] text-slate-500 line-clamp-1 italic">
          &ldquo;{cleanComment}&rdquo;
        </p>
      ) : null}

      {/* Alerta de reprogramación si la cita venció */}
      {contact.alertaVencido?.activa && (
        <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
          <AlertCircle className="h-3 w-3 text-rose-600 shrink-0" />
          <span className="truncate">Cita pendiente sin concretar</span>
        </div>
      )}

      {/* Footer: Quick Action Hint */}
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
