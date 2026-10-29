import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  MapPin,
  Phone,
  Calendar,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Save,
  Clock,
  ShieldCheck,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Contact, VoiceProfile, TipoPlantillaWA, EstadoFlujo } from '../../types';
import {
  getMacroStageForContact,
  MACRO_STAGES,
  MACRO_STAGES_ORDER,
  MacroStageKey,
  getRecommendedActionForContact,
} from '../../domain/contacts/pipelineStages';
import { generarMensajeContextual } from '../../domain/messaging/messageTemplates';
import { crearEnlaceWhatsApp } from '../../domain/messaging/greetingsAndTone';
import { formatAuditDate } from './CandidateCard';

interface CandidateDrawerProps {
  contact: Contact | null;
  voiceProfile: VoiceProfile;
  whatsAppReady: boolean;
  onClose: () => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => Promise<void> | void;
  onSendDirectWA?: (phone: string, text: string, contactId: string, nombre: string, barrio: string) => Promise<boolean>;
}

export const CandidateDrawer: React.FC<CandidateDrawerProps> = ({
  contact,
  voiceProfile,
  whatsAppReady,
  onClose,
  onUpdateContact,
  onSendDirectWA,
}) => {
  if (!contact) return null;

  // Actualizaciones optimistas para respuesta visual inmediata al cambiar etapas o guardar datos
  const [optimisticUpdates, setOptimisticUpdates] = useState<{
    contactId: string;
    updates: Partial<Contact>;
  } | null>(null);

  useEffect(() => {
    if (optimisticUpdates && optimisticUpdates.contactId !== contact.id) {
      setOptimisticUpdates(null);
    }
  }, [contact.id, optimisticUpdates]);

  const activeContact: Contact = useMemo(() => {
    if (optimisticUpdates && optimisticUpdates.contactId === contact.id) {
      return { ...contact, ...optimisticUpdates.updates };
    }
    return contact;
  }, [contact, optimisticUpdates]);

  const currentStageKey = getMacroStageForContact(activeContact);
  const currentStageDef = MACRO_STAGES[currentStageKey];
  const recAction = getRecommendedActionForContact(activeContact);

  const [selectedTemplate, setSelectedTemplate] = useState<TipoPlantillaWA>('auto');
  const [messageText, setMessageText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isSendingDirect, setIsSendingDirect] = useState<boolean>(false);
  const [directSendSuccess, setDirectSendSuccess] = useState<boolean>(false);

  // Edit fields
  const cleanInitialComment = (activeContact.comentario || '')
    .replace(/\s*\[Modificado el [^\]]+\]/g, '')
    .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
    .trim();
  const [editCalle, setEditCalle] = useState<string>(activeContact.calleOCruce || '');
  const [editComentario, setEditComentario] = useState<string>(cleanInitialComment);
  const [editBarrio, setEditBarrio] = useState<string>(activeContact.barrio || '');
  const [isSavingDetails, setIsSavingDetails] = useState<boolean>(false);

  useEffect(() => {
    const cleanComment = (activeContact.comentario || '')
      .replace(/\s*\[Modificado el [^\]]+\]/g, '')
      .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
      .trim();
    setEditCalle(activeContact.calleOCruce || '');
    setEditComentario(cleanComment);
    setEditBarrio(activeContact.barrio || '');
    setDirectSendSuccess(false);

    if (selectedTemplate === 'auto' && activeContact.alertaVencido?.activa) {
      setMessageText(activeContact.alertaVencido.mensajeDisculpasReprogramacion);
    } else {
      const gen = generarMensajeContextual(activeContact, voiceProfile, selectedTemplate);
      setMessageText(gen.texto);
    }
  }, [activeContact, selectedTemplate, voiceProfile]);

  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const auditDate = formatAuditDate(activeContact);

  const handleStageChange = async (targetStage: MacroStageKey) => {
    let nextEstado: EstadoFlujo = activeContact.estadoFlujo || '1ER_MSJ_ENVIADO_SIN_RSP';
    let nextAdhirio = activeContact.adhirio;
    let nextRsp = activeContact.rsp;

    switch (targetStage) {
      case 'nuevos':
        nextEstado = 'SIN_CONTACTAR_1ER_MSJ';
        nextRsp = 'Nuevo';
        nextAdhirio = 'Pendiente';
        break;
      case 'conversacion':
        nextEstado = '1ER_MSJ_ENVIADO_SIN_RSP';
        nextRsp = activeContact.rsp === 'Sí' ? 'Sí' : 'No';
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

    const baseCom = (activeContact.comentario || '')
      .replace(/\s*\[Modificado el [^\]]+\]/g, '')
      .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
      .trim();
    const newComentario = baseCom
      ? `${baseCom} [Modificado el ${auditText} a "${targetDef.shortLabel}"]`
      : `[Modificado el ${auditText} a "${targetDef.shortLabel}"]`;

    const updates: Partial<Contact> = {
      estadoFlujo: nextEstado,
      adhirio: nextAdhirio,
      rsp: nextRsp,
      primerContactoEnviado: targetStage !== 'nuevos',
      comentario: newComentario,
      actualizadoEnAppAt: ahora.toISOString(),
    };

    // Actualización optimista instantánea en el Drawer
    setOptimisticUpdates({ contactId: contact.id, updates });

    await onUpdateContact(contact.id, updates);

    setFeedbackMsg(`✓ Etapa cambiada a "${targetDef.label}" (${auditText})`);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleSaveDetails = async () => {
    setIsSavingDetails(true);
    try {
      const ahora = new Date();
      const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const auditText = `${ddmm} a las ${hhmm} hs`;

      const baseCom = editComentario
        .replace(/\s*\[Modificado el [^\]]+\]/g, '')
        .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
        .trim();
      const newComentario = baseCom
        ? `${baseCom} [Modificado el ${auditText}]`
        : `[Modificado el ${auditText}]`;

      const updates: Partial<Contact> = {
        calleOCruce: editCalle.trim(),
        comentario: newComentario,
        barrio: editBarrio.trim(),
        actualizadoEnAppAt: ahora.toISOString(),
      };

      setOptimisticUpdates({ contactId: contact.id, updates });

      await onUpdateContact(contact.id, updates);

      setFeedbackMsg(`✓ Datos guardados en auditoría (${auditText})`);
      setTimeout(() => setFeedbackMsg(null), 3500);
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleSendDirect = async () => {
    if (!onSendDirectWA) return;
    setIsSendingDirect(true);
    try {
      const ok = await onSendDirectWA(
        activeContact.tel || activeContact.telRaw,
        messageText,
        activeContact.id,
        activeContact.primerNombre || activeContact.nombre,
        activeContact.barrio
      );
      if (ok) {
        setDirectSendSuccess(true);
        setTimeout(() => setDirectSendSuccess(false), 4000);
      }
    } finally {
      setIsSendingDirect(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const waLink = crearEnlaceWhatsApp(activeContact.tel || activeContact.telRaw, messageText);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/20 backdrop-blur-xs flex justify-end">
        {/* Backdrop click to close */}
        <div className="absolute inset-0" onClick={onClose} />

        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative z-10 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl border-l border-slate-200 overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-6 py-4 backdrop-blur-md">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-400">
                  #{activeContact.id}
                </span>
                <h3 className="truncate text-base font-black text-slate-900">
                  {activeContact.primerNombre || activeContact.nombre}
                </h3>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black ${currentStageDef.badgeBg} ${currentStageDef.badgeText} ${currentStageDef.badgeBorder}`}
                >
                  {currentStageDef.shortLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeContact.barrio || 'CABA'} · Tel: {activeContact.tel || activeContact.telRaw || 'Sin número'}
              </p>
              {auditDate && (
                <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                  <Clock className="h-2.5 w-2.5 text-slate-400" />
                  <span>Auditoría: Modificado el {auditDate}</span>
                </p>
              )}
            </div>

            <button
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Feedback Visual Toast en Drawer */}
          <AnimatePresence>
            {feedbackMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 text-xs font-bold text-emerald-800 flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{feedbackMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-6 space-y-6">
            {/* 1. Línea de Vida (Pipeline Stepper Interactivo) */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Línea de Vida del Candidato
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  Hacé clic en cualquier etapa para mover
                </span>
              </div>

              {/* Stepper horizontal */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {MACRO_STAGES_ORDER.map((stageKey) => {
                  const def = MACRO_STAGES[stageKey];
                  const isCurrent = stageKey === currentStageKey;

                  return (
                    <button
                      key={stageKey}
                      type="button"
                      onClick={() => handleStageChange(stageKey)}
                      className={`group relative flex flex-col items-center justify-center rounded-xl p-2 text-center transition-all ${
                        isCurrent
                          ? 'bg-white shadow-sm ring-2 ring-emerald-500/30 border border-emerald-500 font-black'
                          : 'bg-white/70 hover:bg-white border border-slate-200/80 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`mb-1 h-2 w-2 rounded-full ${
                          isCurrent ? def.dotColor : 'bg-slate-300 group-hover:bg-slate-400'
                        }`}
                      />
                      <span className={`text-[10px] ${isCurrent ? def.badgeText : 'text-slate-600'}`}>
                        {def.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Acción Recomendada Contextual */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                    Siguiente paso sugerido
                  </p>
                  <h4 className="text-sm font-black text-slate-900 mt-0.5">
                    {recAction.label}
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {recAction.hint}
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Redactor de Mensaje WhatsApp */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Mensaje WhatsApp Personalizado
                  </h4>
                </div>

                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value as TipoPlantillaWA)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700"
                >
                  <option value="auto">Automático según contexto</option>
                  <option value="primer_contacto">1er Contacto Rompehielo</option>
                  <option value="seguimiento_cambio_chip">Validar DNI CABA y Pedir Zona</option>
                  <option value="convocatoria_cafe_hub">Convocatoria a Café HUB</option>
                  <option value="confirmacion_visita">Confirmar Encuentro</option>
                  <option value="disculpas_y_reprogramacion">Reprogramar (Disculpas)</option>
                  <option value="seguimiento_sin_respuesta">Seguimiento Suave 24h / 48h</option>
                  <option value="baja_amable_sin_respuesta">Baja Amable (Último contacto)</option>
                </select>
              </div>

              {/* Textarea del mensaje */}
              <div className="relative">
                <textarea
                  rows={5}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-800 leading-relaxed font-sans focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
                  placeholder="Escribe o personaliza el mensaje..."
                />
              </div>

              {/* Botones de Envío */}
              <div className="flex flex-wrap items-center gap-2">
                {whatsAppReady && onSendDirectWA ? (
                  <button
                    type="button"
                    onClick={handleSendDirect}
                    disabled={isSendingDirect || !activeContact.tel}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-500 transition shadow-sm shadow-emerald-600/20 disabled:opacity-50"
                  >
                    <Send className={`h-3.5 w-3.5 ${isSendingDirect ? 'animate-spin' : ''}`} />
                    <span>{isSendingDirect ? 'Enviando...' : '⚡ Enviar por WhatsApp Web'}</span>
                  </button>
                ) : null}

                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    const ahora = new Date();
                    const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
                    const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                    const auditText = `${ddmm} a las ${hhmm} hs`;
                    const baseCom = (activeContact.comentario || '')
                      .replace(/\s*\[Modificado el [^\]]+\]/g, '')
                      .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
                      .trim();
                    const newComentario = baseCom
                      ? `${baseCom} [Modificado el ${auditText} a "1er msj wa.me"]`
                      : `[Modificado el ${auditText} a "1er msj wa.me"]`;

                    onUpdateContact(activeContact.id, {
                      primerContactoEnviado: true,
                      estadoFlujo: activeContact.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ? '1ER_MSJ_ENVIADO_SIN_RSP' : activeContact.estadoFlujo,
                      comentario: newComentario,
                      actualizadoEnAppAt: ahora.toISOString(),
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                  <span>Abrir wa.me</span>
                </a>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  <Copy className="h-3.5 w-3.5 text-slate-400" />
                  <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              {directSendSuccess && (
                <p className="text-xs font-bold text-emerald-700 flex items-center gap-1 animate-fade-in">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mensaje enviado y registrado en la base de datos con éxito.
                </p>
              )}
            </div>

            {/* 4. Edición de Dirección, Punto de Encuentro y Notas */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Datos de Terreno y Notas
                </h4>
                <button
                  type="button"
                  onClick={handleSaveDetails}
                  disabled={isSavingDetails}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition disabled:opacity-50"
                >
                  <Save className="h-3 w-3" />
                  <span>{isSavingDetails ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Calle, Altura o Cruce (Punto exacto)
                  </label>
                  <input
                    type="text"
                    value={editCalle}
                    onChange={(e) => setEditCalle(e.target.value)}
                    placeholder="Ej. Charcas 3700 / Scalabrini Ortiz"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Barrio de CABA
                  </label>
                  <input
                    type="text"
                    value={editBarrio}
                    onChange={(e) => setEditBarrio(e.target.value)}
                    placeholder="Ej. Palermo, Saavedra..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Comentario / Notas (Columna G)
                </label>
                <input
                  type="text"
                  value={editComentario}
                  onChange={(e) => setEditComentario(e.target.value)}
                  placeholder="Detalles sobre disponibilidad, franja u observaciones..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
};
