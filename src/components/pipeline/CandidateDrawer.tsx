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
  ChevronLeft,
  UserCheck,
  User,
  Coffee,
  Home,
  UserX,
  Sparkle,
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
import { analizarYCorregirNombreCompleto } from '../../domain/contacts/nameCorrection';
import { geocodificarContactoLocal } from '../../utils/logic';
import { formatAuditDate } from './CandidateCard';

interface CandidateDrawerProps {
  contact: Contact | null;
  voiceProfile: VoiceProfile;
  whatsAppReady: boolean;
  onClose: () => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => Promise<void> | void;
  onSendDirectWA?: (
    phone: string,
    text: string,
    contactId: string,
    nombre: string,
    barrio: string,
    tipoPlantilla?: string
  ) => Promise<boolean>;
  onNextContact?: () => void;
  onPrevContact?: () => void;
  hasNextContact?: boolean;
  hasPrevContact?: boolean;
}

export const CandidateDrawer: React.FC<CandidateDrawerProps> = ({
  contact,
  voiceProfile,
  whatsAppReady,
  onClose,
  onUpdateContact,
  onSendDirectWA,
  onNextContact,
  onPrevContact,
  hasNextContact,
  hasPrevContact,
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
  const [editNombre, setEditNombre] = useState<string>(activeContact.nombre || '');
  const [editPrimerNombre, setEditPrimerNombre] = useState<string>(activeContact.primerNombre || '');
  const [editTel, setEditTel] = useState<string>(activeContact.telRaw || activeContact.tel || '');
  const [editCalle, setEditCalle] = useState<string>(activeContact.calleOCruce || '');
  const [editComentario, setEditComentario] = useState<string>(cleanInitialComment);
  const [editBarrio, setEditBarrio] = useState<string>(activeContact.barrio || '');
  const [isSavingDetails, setIsSavingDetails] = useState<boolean>(false);

  // Helper para autocompletar Nombre cuando responde en WA
  const [nombrePegadoInput, setNombrePegadoInput] = useState<string>('');
  const [respuestaAdaptarInput, setRespuestaAdaptarInput] = useState<string>('');

  const addressValidation = useMemo(() => {
    const raw = editCalle.trim();
    if (!raw || raw.length < 3) return null;
    return geocodificarContactoLocal(raw, editBarrio || 'Palermo', activeContact.id);
  }, [editCalle, editBarrio, activeContact.id]);

  useEffect(() => {
    const cleanComment = (activeContact.comentario || '')
      .replace(/\s*\[Modificado el [^\]]+\]/g, '')
      .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
      .trim();
    setEditNombre(activeContact.nombre || '');
    setEditPrimerNombre(activeContact.primerNombre || '');
    setEditTel(activeContact.telRaw || activeContact.tel || '');
    setEditCalle(activeContact.calleOCruce || '');
    setEditComentario(cleanComment);
    setEditBarrio(activeContact.barrio || '');
    setDirectSendSuccess(false);
    setNombrePegadoInput('');
    setRespuestaAdaptarInput('');

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

      let baseCom = editComentario
        .replace(/\s*\[Modificado el [^\]]+\]/g, '')
        .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
        .trim();

      // Sincronizar dirección editada dentro del comentario para garantizar persistencia y auto-corrección de barrio
      const calleTrim = editCalle.trim();
      if (calleTrim && !baseCom.toLowerCase().includes(calleTrim.toLowerCase())) {
        baseCom = baseCom ? `${calleTrim}. ${baseCom}` : calleTrim;
      }

      const newComentario = baseCom
        ? `${baseCom} [Modificado el ${auditText}]`
        : `[Modificado el ${auditText}]`;

      const updates: Partial<Contact> = {
        nombre: editNombre.trim() || activeContact.nombre,
        primerNombre: editPrimerNombre.trim() || undefined,
        telRaw: editTel.trim() || activeContact.telRaw,
        calleOCruce: calleTrim,
        comentario: newComentario,
        barrio: editBarrio.trim(),
        actualizadoEnAppAt: ahora.toISOString(),
      };

      setOptimisticUpdates({ contactId: contact.id, updates });
      await onUpdateContact(contact.id, updates);

      setFeedbackMsg(`✓ Datos guardados con éxito (${auditText})`);
      setTimeout(() => setFeedbackMsg(null), 3500);
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleSendDirect = async () => {
    if (!onSendDirectWA) return;
    setIsSendingDirect(true);
    try {
      const targetPhone = activeContact.telWA || activeContact.tel || activeContact.telRaw;
      const ok = await onSendDirectWA(
        targetPhone,
        messageText,
        activeContact.id,
        activeContact.primerNombre || activeContact.nombre,
        activeContact.barrio,
        selectedTemplate
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

  // Autocompletar nombre pegando texto de WhatsApp
  const handleAutoCompletarNombre = () => {
    if (!nombrePegadoInput.trim()) return;
    const analisis = analizarYCorregirNombreCompleto(nombrePegadoInput);
    if (analisis.nombreCompletoOrdenado && !analisis.sinNombre) {
      setEditNombre(analisis.nombreCompletoOrdenado);
      setEditPrimerNombre(analisis.vocativo);
      setFeedbackMsg(`✓ Nombre ordenado: "${analisis.nombreCompletoOrdenado}"`);
      setTimeout(() => setFeedbackMsg(null), 3500);
    }
  };

  // Adaptar mensaje pegando lo que respondió la persona recién
  const handleAdaptarRespuesta = () => {
    if (!respuestaAdaptarInput.trim()) return;
    const resp = respuestaAdaptarInput.trim();
    const saludo = activeContact.primerNombre ? `Hola, ${activeContact.primerNombre}` : 'Hola';
    const adaptado = `${saludo}, dale, buenísimo. En base a lo que me comentás ("${resp}"), ¿te queda cómodo que coordinemos en esa franja o preferís que nos veamos directamente en un café de la zona? Recordá tener a mano tu DNI con domicilio en CABA.`;
    setMessageText(adaptado);
    setFeedbackMsg('✓ Mensaje adaptado con la respuesta recibida.');
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Acción rápida Sin DNI en CABA (Pedir referidos)
  const handleMarcarSinDniCaba = async () => {
    const ahora = new Date();
    const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const auditText = `${ddmm} a las ${hhmm} hs`;

    const baseCom = (activeContact.comentario || '')
      .replace(/\s*\[Modificado el [^\]]+\]/g, '')
      .trim();
    const newCom = baseCom
      ? `${baseCom} [Modificado el ${auditText} a "Sin DNI CABA / Referidos"]`
      : `[Modificado el ${auditText} a "Sin DNI CABA / Referidos"]`;

    const updates: Partial<Contact> = {
      estadoFlujo: 'SIN_DNI_CABA_PEDIR_REFERIDOS',
      adhirio: 'No',
      comentario: newCom,
      actualizadoEnAppAt: ahora.toISOString(),
    };

    setOptimisticUpdates({ contactId: contact.id, updates });
    await onUpdateContact(contact.id, updates);
    setSelectedTemplate('no_caba_referidos');
    setFeedbackMsg(`✓ Marcado como Sin DNI en CABA (${auditText})`);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const phoneForWA = activeContact.telWA || activeContact.tel || activeContact.telRaw;
  const canSendWA = Boolean(phoneForWA && phoneForWA.replace(/\D+/g, '').length >= 8);
  const waLink = crearEnlaceWhatsApp(phoneForWA, messageText);

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
          {/* Header con Navegación Siguiente / Anterior */}
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-6 py-4 backdrop-blur-md">
            <div className="min-w-0 flex-1 mr-2">
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
                {activeContact.barrio || 'CABA'} · Tel: {phoneForWA || 'Sin número'}
              </p>
              {auditDate && (
                <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                  <Clock className="h-2.5 w-2.5 text-slate-400" />
                  <span>Auditoría: Modificado el {auditDate}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onPrevContact && (
                <button
                  type="button"
                  onClick={onPrevContact}
                  disabled={!hasPrevContact}
                  title="Contacto anterior"
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition disabled:opacity-25 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {onNextContact && (
                <button
                  type="button"
                  onClick={onNextContact}
                  disabled={!hasNextContact}
                  title="Contacto siguiente"
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition disabled:opacity-25 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition ml-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
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
                  Tocá cualquier etapa para mover
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

              {/* Selector Desplegable de los 14 Estatus Granulares */}
              <div className="pt-2 border-t border-slate-200/60">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600">
                    Estatus Granular Detallado
                  </label>
                  <button
                    type="button"
                    onClick={handleMarcarSinDniCaba}
                    className="text-[10px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 hover:bg-amber-100 transition"
                  >
                    🚫 Marcar Sin DNI en CABA
                  </button>
                </div>
                <select
                  value={activeContact.estadoFlujo || '1ER_MSJ_ENVIADO_SIN_RSP'}
                  onChange={(e) => {
                    const est = e.target.value as EstadoFlujo;
                    onUpdateContact(activeContact.id, { estadoFlujo: est });
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-hidden"
                >
                  <option value="SIN_CONTACTAR_1ER_MSJ">1. Sin contactar (Enviar 1er mensaje)</option>
                  <option value="FALTA_NOMBRE_Y_APELLIDO">2. Teléfono sin nombre (Pedir nombre y apellido)</option>
                  <option value="1ER_MSJ_ENVIADO_SIN_RSP">3. 1er mensaje enviado (Sin respuesta aún)</option>
                  <option value="RESPONDIO_FALTA_DNI_O_ZONA">4. Respondió Sí — Falta corroborar DNI CABA / zona</option>
                  <option value="PIDIO_MAS_INFO_ENVIADA">5. Pidió más info (5 ejes enviados)</option>
                  <option value="PREFIERE_CAFE_HUB_O_SEDE">6. Prefiere Punto / Café Hub / Sede Chile 1408</option>
                  <option value="PASO_DATOS_FALTA_CONFIRMAR">7. Pasó día/franja/dirección — Falta confirmar encuentro</option>
                  <option value="ENCUENTRO_CONFIRMADO">8. Encuentro confirmado (En agenda de ruta)</option>
                  <option value="RECORDATORIO_DIA_ENVIADO">9. Recordatorio del día / En camino enviado</option>
                  <option value="YA_ADHIRIO_FIRMA_OK">10. Proceso terminado — Ya adhirió (Listo)</option>
                  <option value="PENDIENTE_RETIRO_FICHAS">11. Adhirió + Retirar fichas extra (X1/X2/X3)</option>
                  <option value="POSTERGO_SALUD_O_VIAJE">12. En pausa temporal (Salud / Viaje)</option>
                  <option value="SIN_DNI_CABA_PEDIR_REFERIDOS">13. Sin DNI en CABA (Consultar referidos CABA — Pendiente envío)</option>
                  <option value="DESCARTADO_O_BAJA">14. Archivado / Sin DNI CABA ya respondido / Baja</option>
                </select>
              </div>
            </div>

            {/* 2. Fijar Día y Turno Rápido (Selector de Plan acordado) */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Plan Acordado & Turno Rápido
                </span>
                <span className="text-[10px] text-slate-500">Se guarda en Agenda y Sheets</span>
              </div>

              {/* Botones de Plan Acordado */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleStageChange('adheridos')}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-extrabold text-emerald-800 hover:bg-emerald-100 transition"
                >
                  ✓ Ya Adhirió
                </button>
                <button
                  type="button"
                  onClick={() => handleStageChange('agendados')}
                  className="rounded-xl border border-emerald-600 bg-emerald-600 px-2.5 py-1.5 text-[11px] font-black text-white hover:bg-emerald-500 transition shadow-2xs"
                >
                  ✓ Confirmó Propuesta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateContact(activeContact.id, {
                      estadoFlujo: 'ENCUENTRO_CONFIRMADO',
                      comentario: `${activeContact.comentario || ''} [Prefiere Puerta a Puerta]`.trim(),
                    });
                  }}
                  className="rounded-xl border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-[11px] font-extrabold text-sky-800 hover:bg-sky-100 transition flex items-center gap-1"
                >
                  <Home className="h-3 w-3" />
                  Puerta a Puerta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateContact(activeContact.id, {
                      estadoFlujo: 'PREFIERE_CAFE_HUB_O_SEDE',
                      comentario: `${activeContact.comentario || ''} [Prefiere Café Hub]`.trim(),
                    });
                  }}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-extrabold text-amber-800 hover:bg-amber-100 transition flex items-center gap-1"
                >
                  <Coffee className="h-3 w-3" />
                  Prefiere Café
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTemplate('disculpas_y_reprogramacion')}
                  className="rounded-xl border border-purple-300 bg-purple-50 px-2.5 py-1.5 text-[11px] font-extrabold text-purple-800 hover:bg-purple-100 transition flex items-center gap-1"
                >
                  <Calendar className="h-3 w-3" />
                  Reprogramar
                </button>
              </div>

              {/* Pills de Turnos Rápidos */}
              <div>
                <span className="text-[10px] font-bold text-slate-500 block mb-1">
                  Turno habitual del vecino:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Mañana (9-12:30)', franja: 'Mañana' },
                    { label: 'Mediodía (12:30-15)', franja: 'Mediodía' },
                    { label: 'Tarde (15-18)', franja: 'Tarde' },
                    { label: 'Vespertino (18-20:30)', franja: 'Vespertino' },
                    { label: 'Fin de Semana', franja: 'Fin de Semana' },
                  ].map((t) => (
                    <button
                      key={t.franja}
                      type="button"
                      onClick={() => {
                        const base = activeContact.comentario || '';
                        const updated = `${base} [Turno: ${t.franja}]`.trim();
                        onUpdateContact(activeContact.id, { comentario: updated });
                        setFeedbackMsg(`✓ Turno fijado: ${t.label}`);
                        setTimeout(() => setFeedbackMsg(null), 3000);
                      }}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100 transition"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Redactor de Mensaje WhatsApp con Todas las Plantillas */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Mensaje WhatsApp Personalizado
                  </h4>
                </div>

                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value as TipoPlantillaWA)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 max-w-xs truncate"
                >
                  <option value="auto">Automático según contexto</option>
                  <option value="primer_contacto">1er Contacto Rompehielo</option>
                  <option value="seguimiento_cambio_chip">Validar DNI CABA y Pedir Zona</option>
                  <option value="convocatoria_cafe_hub">Convocatoria a Café HUB</option>
                  <option value="confirmacion_visita">Confirmar Encuentro</option>
                  <option value="recordatorio_maniana_encuentro">Recordatorio Mañana antes de salir</option>
                  <option value="en_camino">Aviso: Estoy en camino (hora exacta)</option>
                  <option value="llegando">Aviso: Estoy en la puerta (2 min)</option>
                  <option value="demorado">Aviso: Demorado (+15/20 min)</option>
                  <option value="disculpas_y_reprogramacion">Disculpas y Reprogramación</option>
                  <option value="esperado_no_estaba_reprogramar">Esperé un rato y no estaba</option>
                  <option value="agradecimiento_post_firma">Agradecimiento Post-Firma</option>
                  <option value="retiro_fichas">Retiro de Fichas Extra (X1/X2/X3)</option>
                  <option value="no_caba_referidos">Sin DNI en CABA (Pedir referidos)</option>
                  <option value="mas_info">Pidió más info (5 Ejes Popurrí)</option>
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

              {/* Adaptar mensaje pegando lo que respondió el vecino recién */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                <label className="text-[11px] font-bold text-amber-900 block">
                  ¿Te respondió algo puntual recién? Pegalo para adaptar el mensaje:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={respuestaAdaptarInput}
                    onChange={(e) => setRespuestaAdaptarInput(e.target.value)}
                    placeholder="Ej. 'Trabajo hasta las 18 hs' o 'pasá por mi laburo'..."
                    className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAdaptarRespuesta}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 transition whitespace-nowrap shadow-2xs"
                  >
                    Adaptar
                  </button>
                </div>
              </div>

              {/* Botones de Envío */}
              <div className="flex flex-wrap items-center gap-2">
                {whatsAppReady && onSendDirectWA ? (
                  <button
                    type="button"
                    onClick={handleSendDirect}
                    disabled={isSendingDirect || !canSendWA}
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
                      ? `${baseCom} [Modificado el ${auditText} a "Envío wa.me"]`
                      : `[Modificado el ${auditText} a "Envío wa.me"]`;

                    onUpdateContact(activeContact.id, {
                      primerContactoEnviado: true,
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

            {/* 4. Edición de Datos Personales, Terreno y Notas */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Datos Personales, Dirección y Notas
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

              {/* Helper para ordenar nombre cuando responde por WA */}
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 space-y-2">
                <label className="text-[11px] font-bold text-sky-900 block">
                  ¿El vecino respondió su nombre? Pegalo acá para ordenarlo automáticamente:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nombrePegadoInput}
                    onChange={(e) => setNombrePegadoInput(e.target.value)}
                    placeholder="Ej. 'Soy Riera Pablo' o 'Me llamo Martina Gomez'..."
                    className="flex-1 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAutoCompletarNombre}
                    className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-600 transition whitespace-nowrap shadow-2xs"
                  >
                    Ordenar
                  </button>
                </div>
              </div>

              {/* Inputs de Nombre, Vocativo y Teléfono */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Nombre y Apellido
                  </label>
                  <input
                    type="text"
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Vocativo (Primer Nombre)
                  </label>
                  <input
                    type="text"
                    value={editPrimerNombre}
                    onChange={(e) => setEditPrimerNombre(e.target.value)}
                    placeholder="Ej. Juan"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={editTel}
                    onChange={(e) => setEditTel(e.target.value)}
                    placeholder="Ej. 54 9 11 1234-5678"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Dirección y Barrio */}
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
                  {addressValidation && (
                    <div className="mt-1">
                      {addressValidation.exacta ? (
                        <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                          <span>Ubicada en {addressValidation.barrio}</span>
                          {addressValidation.barrio && addressValidation.barrio.toLowerCase() !== editBarrio.toLowerCase() && (
                            <button
                              type="button"
                              onClick={() => setEditBarrio(addressValidation.barrio)}
                              className="underline text-emerald-800 hover:text-emerald-950 font-black ml-1"
                            >
                              (Auto-corregir barrio)
                            </button>
                          )}
                        </p>
                      ) : (
                        <p className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 text-amber-600 shrink-0" />
                          <span>Dirección no reconocida en CABA. Verificá altura o esquinas.</span>
                        </p>
                      )}
                    </div>
                  )}
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
