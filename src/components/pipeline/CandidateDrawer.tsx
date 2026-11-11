import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  MapPin,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Save,
  Clock,
  ChevronRight,
  ChevronLeft,
  Wand2,
  FilePlus2,
  UserX,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  CalendarEventItem,
  Contact,
  VoiceProfile,
  TipoPlantillaWA,
  EstadoFlujo,
} from '../../types';
import {
  getMacroStageForContact,
  MACRO_STAGES,
  MACRO_STAGES_ORDER,
  MacroStageKey,
  getRecommendedActionForContact,
} from '../../domain/contacts/pipelineStages';
import {
  adaptarMensajeConRespuestaVecinoLocal,
  generarMensajeContextual,
} from '../../domain/messaging/messageTemplates';
import { crearEnlaceWhatsApp } from '../../domain/messaging/greetingsAndTone';
import { validarDireccionYHorarioContacto } from '../../domain/routing/routingEngine';
import { inferirBarrioDesdeDireccionOComentario } from '../../domain/geo/cabaLocations';
import { marcarEntregaFichasExtra } from '../../domain/sync/dataMerging';
import {
  formatAuditDate,
  LISTA_ESTADOS_FLUJO_UNIFICADOS,
  LISTA_PLANTILLAS_WA_COMPLETA,
} from './CandidateCard';
import { PopurriDropdown } from '../common/PopurriDropdown';

interface CandidateDrawerProps {
  contact: Contact | null;
  voiceProfile: VoiceProfile;
  whatsAppReady: boolean;
  allContacts?: Contact[];
  calendarEvents?: CalendarEventItem[];
  onClose: () => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => Promise<void> | void;
  onSendDirectWA?: (
    phone: string,
    text: string,
    contactId: string,
    nombre: string,
    barrio: string
  ) => Promise<boolean>;
  onNavigateRelative?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export const CandidateDrawer: React.FC<CandidateDrawerProps> = ({
  contact,
  voiceProfile,
  whatsAppReady,
  allContacts = [],
  calendarEvents = [],
  onClose,
  onUpdateContact,
  onSendDirectWA,
  onNavigateRelative,
  hasPrev = false,
  hasNext = false,
}) => {
  if (!contact) return null;

  const currentStageKey = getMacroStageForContact(contact);
  const currentStageDef = MACRO_STAGES[currentStageKey];
  const recAction = getRecommendedActionForContact(contact);

  const [selectedTemplate, setSelectedTemplate] = useState<TipoPlantillaWA>('auto');
  const [messageText, setMessageText] = useState<string>('');
  const [liveReplyInput, setLiveReplyInput] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isSendingDirect, setIsSendingDirect] = useState<boolean>(false);
  const [directSendSuccess, setDirectSendSuccess] = useState<boolean>(false);

  // Edit fields
  const [editNombre, setEditNombre] = useState<string>(contact.nombre || '');
  const [editVocativo, setEditVocativo] = useState<string>(
    contact.vocativoOverride || contact.primerNombre || ''
  );
  const [editTel, setEditTel] = useState<string>(
    contact.telRaw || contact.tel || contact.telWA || ''
  );
  const [editCalle, setEditCalle] = useState<string>(contact.calleOCruce || '');
  const [editComentario, setEditComentario] = useState<string>(
    (contact.comentario || '')
      .replace(/\s*\[Modificado el [^\]]+\]/g, '')
      .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
      .trim()
  );
  const [editBarrio, setEditBarrio] = useState<string>(contact.barrio || '');
  const [editEstadoFlujo, setEditEstadoFlujo] = useState<EstadoFlujo>(
    contact.estadoFlujo || 'SIN_CONTACTAR_1ER_MSJ'
  );
  const [isSavingDetails, setIsSavingDetails] = useState<boolean>(false);

  useEffect(() => {
    setEditNombre(contact.nombre || '');
    setEditVocativo(contact.vocativoOverride || contact.primerNombre || '');
    setEditTel(contact.telRaw || contact.tel || contact.telWA || '');
    setEditCalle(contact.calleOCruce || '');
    setEditComentario(
      (contact.comentario || '')
        .replace(/\s*\[Modificado el [^\]]+\]/g, '')
        .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
        .trim()
    );
    setEditBarrio(contact.barrio || '');
    setEditEstadoFlujo(contact.estadoFlujo || 'SIN_CONTACTAR_1ER_MSJ');
    setDirectSendSuccess(false);

    if (selectedTemplate === 'auto' && contact.alertaVencido?.activa) {
      setMessageText(contact.alertaVencido.mensajeDisculpasReprogramacion);
    } else if (selectedTemplate === 'auto' && contact.diagnostico48h?.aplica) {
      setMessageText(contact.diagnostico48h.mensajePersonalizado48h);
    } else {
      const gen = generarMensajeContextual(contact, voiceProfile, selectedTemplate);
      setMessageText(gen.texto);
    }
  }, [contact, selectedTemplate, voiceProfile]);

  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const auditDate = formatAuditDate(contact);
  const effectivePhone = contact.tel || contact.telRaw || contact.telWA || '';
  const hasValidPhone = Boolean(
    effectivePhone && effectivePhone !== 'N/A' && effectivePhone.replace(/\D/g, '').length >= 6
  );

  // Validación en vivo de dirección y horario
  const validacionEnVivo = useMemo(() => {
    return validarDireccionYHorarioContacto(
      {
        id: contact.id,
        nombre: editNombre || contact.nombre,
        barrio: editBarrio || contact.barrio,
        lat: contact.lat,
        lng: contact.lng,
      },
      editCalle,
      editComentario,
      allContacts,
      calendarEvents,
      voiceProfile
    );
  }, [
    contact.id,
    contact.nombre,
    contact.barrio,
    contact.lat,
    contact.lng,
    editNombre,
    editBarrio,
    editCalle,
    editComentario,
    allContacts,
    calendarEvents,
    voiceProfile,
  ]);

  const handleStageChange = async (targetStage: MacroStageKey) => {
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

    setFeedbackMsg(`✓ Etapa cambiada a "${targetDef.label}"`);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleSaveDetails = async () => {
    setIsSavingDetails(true);
    try {
      const barrioInferido = editCalle.trim()
        ? inferirBarrioDesdeDireccionOComentario(editCalle.trim(), `${editCalle} ${editComentario}`)
        : null;
      const barrioFinal = barrioInferido || editBarrio.trim() || contact.barrio || 'Palermo';
      const defEstado = LISTA_ESTADOS_FLUJO_UNIFICADOS.find((it) => it.value === editEstadoFlujo);
      const esNuevo =
        editEstadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
        editEstadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO';

      await onUpdateContact(contact.id, {
        nombre: editNombre.trim(),
        vocativoOverride: editVocativo.trim() || undefined,
        telRaw: editTel.trim(),
        calleOCruce: editCalle.trim(),
        comentario: editComentario.trim(),
        barrio: barrioFinal,
        estadoFlujo: editEstadoFlujo,
        rsp: defEstado ? defEstado.rsp : contact.rsp,
        adhirio: defEstado ? defEstado.adhirio : contact.adhirio,
        primerContactoEnviado: !esNuevo,
      });

      setFeedbackMsg(`✓ Datos guardados y sincronizados con éxito`);
      setTimeout(() => setFeedbackMsg(null), 3500);
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleSendDirect = async () => {
    if (!onSendDirectWA || !hasValidPhone) return;
    setIsSendingDirect(true);
    try {
      const ok = await onSendDirectWA(
        effectivePhone,
        messageText,
        contact.id,
        contact.primerNombre || contact.nombre || `Contacto #${contact.id}`,
        contact.barrio
      );
      if (ok) {
        setDirectSendSuccess(true);
        setTimeout(() => setDirectSendSuccess(false), 4000);
      }
    } finally {
      setIsSendingDirect(false);
    }
  };

  const handleAdaptWithReply = () => {
    if (!liveReplyInput.trim()) return;
    const adapted = adaptarMensajeConRespuestaVecinoLocal(
      contact,
      liveReplyInput.trim(),
      messageText,
      voiceProfile
    );
    setMessageText(adapted);
  };

  const handleMarkFichas = async (cant: 1 | 2 | 3) => {
    const xCant: 'X1' | 'X2' | 'X3' = cant === 1 ? 'X1' : cant === 3 ? 'X3' : 'X2';
    const actualizado = marcarEntregaFichasExtra(contact, xCant, Date.now());
    await onUpdateContact(contact.id, {
      rsp: actualizado.rsp,
      adhirio: actualizado.adhirio,
      estadoFlujo: 'PENDIENTE_RETIRO_FICHAS',
      comentario: actualizado.comentario,
      fechaAdhesion: actualizado.fechaAdhesion,
    });
    setFeedbackMsg(`✓ Agendado retiro de fichas X${cant} para dentro de 1 semana`);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleMarkSinDni = async () => {
    const nuevoCom = editComentario
      ? `No tiene domicilio en CABA · ${editComentario}`
      : 'No tiene domicilio en CABA';
    await onUpdateContact(contact.id, {
      rsp: 'Sí',
      adhirio: 'No',
      estadoFlujo: 'SIN_DNI_CABA_PEDIR_REFERIDOS',
      comentario: nuevoCom,
    });
    setSelectedTemplate('no_caba_referidos');
    setFeedbackMsg('✓ Marcado como Sin DNI en CABA (mensaje de referidos listo)');
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const waLink = crearEnlaceWhatsApp(effectivePhone, messageText);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden bg-[#323232]/40 backdrop-blur-xs flex justify-end">
        <div className="absolute inset-0" onClick={onClose} />

        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-[#F5F4F0] shadow-2xl border-l-2 border-[#323232] overflow-y-auto"
        >
          {/* Header fijo superior con navegación ‹ Anterior | Siguiente › y botón ✕ */}
          <div className="sticky top-0 z-20 flex flex-col gap-2.5 border-b-2 border-[#323232] bg-white px-3.5 sm:px-5 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-2">
              {onNavigateRelative ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!hasPrev}
                    onClick={() => onNavigateRelative('prev')}
                    className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#ECEAE2] px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#FFF06B] disabled:opacity-40 shadow-[2px_2px_0px_#323232]"
                    title="Contacto anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Anterior</span>
                  </button>
                  <button
                    type="button"
                    disabled={!hasNext}
                    onClick={() => onNavigateRelative('next')}
                    className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#ECEAE2] px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#FFF06B] disabled:opacity-40 shadow-[2px_2px_0px_#323232]"
                    title="Siguiente contacto"
                  >
                    <span>Siguiente</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div />
              )}

              <button
                onClick={onClose}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#FF2C00] hover:text-white transition shadow-[2px_2px_0px_#323232]"
                title="Cerrar ficha"
              >
                <X className="h-4 w-4" />
                <span>Cerrar</span>
              </button>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded bg-[#323232] px-2 py-0.5 text-xs font-mono font-bold text-[#FFF06B]">
                  #{contact.id}
                </span>
                <h3 className="truncate text-base font-bold font-display text-[#323232]">
                  {contact.nombreCompletoCorregido || contact.nombre || `Contacto #${contact.id}`}
                </h3>
                <span
                  className={`rounded-lg border border-[#323232] px-2.5 py-0.5 text-[11px] font-bold font-display ${currentStageDef.badgeBg} ${currentStageDef.badgeText}`}
                >
                  {contact.estadoFlujoEtiqueta || currentStageDef.shortLabel}
                </span>
              </div>
              <p className="text-xs font-semibold text-[#5A5955] mt-0.5">
                {contact.barrio || 'CABA'} · Tel: {effectivePhone || 'Sin número'}
              </p>
              {auditDate && (
                <p className="text-[10px] text-[#5A5955] font-medium flex items-center gap-1 mt-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  <span>Modificado: {auditDate}</span>
                </p>
              )}
            </div>
          </div>

          <AnimatePresence>
            {feedbackMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-[#FFF06B] border-b-2 border-[#323232] px-6 py-2.5 text-xs font-bold text-[#323232] flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{feedbackMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-5 space-y-5">
            {/* 1. Línea de Vida + Botones Operativos Rápidos */}
            <div className="rounded-2xl border-2 border-[#323232] bg-white p-4 space-y-3 shadow-[3px_3px_0px_#323232]">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#323232] font-display">
                  Etapa Macro y Acciones en 1 Clic
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {([1, 2, 3] as const).map((cant) => (
                    <button
                      key={cant}
                      type="button"
                      onClick={() => handleMarkFichas(cant)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#DFF4FF] px-2 py-1 text-[11px] font-bold font-display text-[#323232] hover:bg-[#29B8FF]"
                      title="Marcar entrega de fichas extra para retirar en 1 semana"
                    >
                      <FilePlus2 className="h-3 w-3" />
                      <span>+Fichas X{cant} (1 sem)</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleMarkSinDni}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#F5817F]/30 px-2 py-1 text-[11px] font-bold font-display text-[#323232] hover:bg-[#F5817F]"
                  >
                    <UserX className="h-3 w-3 text-[#FF2C00]" />
                    <span>Sin DNI CABA</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {MACRO_STAGES_ORDER.map((stageKey) => {
                  const def = MACRO_STAGES[stageKey];
                  const isCurrent = stageKey === currentStageKey;
                  return (
                    <button
                      key={stageKey}
                      type="button"
                      onClick={() => handleStageChange(stageKey)}
                      className={`flex flex-col items-center justify-center rounded-xl p-2 text-center transition-all border ${
                        isCurrent
                          ? 'bg-[#FFF06B] border-[#323232] font-bold shadow-[2px_2px_0px_#323232]'
                          : 'bg-[#F5F4F0] hover:bg-white border-[#323232]/40'
                      }`}
                    >
                      <div
                        className={`mb-1 h-2 w-2 rounded-full ${
                          isCurrent ? 'bg-[#323232]' : def.dotColor
                        }`}
                      />
                      <span className="text-[10px] font-display text-[#323232]">
                        {def.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Redactor de Mensaje WhatsApp con 21 Plantillas + Adaptador de Respuesta */}
            <div className="rounded-2xl border-2 border-[#323232] bg-white p-5 shadow-[3px_3px_0px_#323232] space-y-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[#323232]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#323232] font-display">
                    Mensaje WhatsApp Personalizado ({LISTA_PLANTILLAS_WA_COMPLETA.length} opciones)
                  </h4>
                </div>

                <PopurriDropdown
                  value={selectedTemplate}
                  onChange={(val) => setSelectedTemplate(val as TipoPlantillaWA)}
                  options={LISTA_PLANTILLAS_WA_COMPLETA}
                  headerLabel="Elegir plantilla de mensaje WhatsApp:"
                  menuWidth={360}
                  maxHeight={320}
                  triggerClassName="w-full flex items-center justify-between gap-2 rounded-xl border-2 border-[#323232] bg-[#F5F4F0] px-3 py-2 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]/40 transition cursor-pointer"
                />
              </div>

              {/* Adaptador en vivo según lo que respondió */}
              <div className="rounded-xl border border-[#323232]/40 bg-[#F5F4F0] p-3 space-y-1.5">
                <label className="block text-[11px] font-bold text-[#323232] font-display">
                  ¿Te respondió algo puntual recién? Pegalo para adaptar el mensaje:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={liveReplyInput}
                    onChange={(e) => setLiveReplyInput(e.target.value)}
                    placeholder="Ej: 'Puedo el viernes a la tarde por mi casa'"
                    className="flex-1 rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs text-[#323232]"
                  />
                  <button
                    type="button"
                    onClick={handleAdaptWithReply}
                    className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#DFF4FF] px-3 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#29B8FF]"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    <span>Adaptar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMessageText(
                        adaptarMensajeConRespuestaVecinoLocal(
                          contact,
                          'acortar en 2-3 líneas',
                          messageText,
                          voiceProfile
                        )
                      )
                    }
                    className="rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#323232] hover:bg-[#ECEAE2]"
                  >
                    2-3 líneas
                  </button>
                </div>
              </div>

              <textarea
                rows={5}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="w-full rounded-xl border-2 border-[#323232] bg-[#F5F4F0]/50 p-3 text-xs text-[#323232] leading-relaxed font-medium focus:bg-white focus:outline-hidden"
                placeholder="Escribe o personaliza el mensaje..."
              />

              <div className="flex flex-wrap items-center gap-2">
                {onSendDirectWA && (
                  <button
                    type="button"
                    onClick={handleSendDirect}
                    disabled={isSendingDirect || !hasValidPhone}
                    className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-4 py-2.5 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] transition shadow-[2px_2px_0px_#323232] disabled:opacity-50"
                  >
                    <Send className={`h-3.5 w-3.5 ${isSendingDirect ? 'animate-spin' : ''}`} />
                    <span>
                      {isSendingDirect
                        ? 'Enviando...'
                        : whatsAppReady
                        ? '⚡ Enviar por WhatsApp Web'
                        : 'Enviar / Registrar por WhatsApp'}
                    </span>
                  </button>
                )}

                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    const esNuevo =
                      contact.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
                      contact.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO';
                    onUpdateContact(contact.id, {
                      primerContactoEnviado: true,
                      estadoFlujo: esNuevo ? '1ER_MSJ_ENVIADO_SIN_RSP' : contact.estadoFlujo,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-white px-3.5 py-2.5 text-xs font-bold font-display text-[#323232] hover:bg-[#ECEAE2] transition shadow-[2px_2px_0px_#323232]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Abrir wa.me</span>
                </a>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-3 py-2.5 text-xs font-bold text-[#323232] hover:bg-[#ECEAE2] transition"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              {directSendSuccess && (
                <p className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mensaje enviado y registrado en base de datos + Google Sheets.
                </p>
              )}
            </div>

            {/* 3. Edición Completa de Datos del Contacto */}
            <div className="rounded-2xl border-2 border-[#323232] bg-white p-5 shadow-[3px_3px_0px_#323232] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#323232] font-display">
                  Edición de Datos del Contacto (Sincroniza con Google Sheets)
                </h4>
                <button
                  type="button"
                  onClick={handleSaveDetails}
                  disabled={isSavingDetails}
                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-3.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] transition shadow-[2px_2px_0px_#323232] disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{isSavingDetails ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#323232] mb-1">
                    Nombre y Apellido
                  </label>
                  <input
                    type="text"
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    placeholder="Nombre completo"
                    className="w-full rounded-xl border-2 border-[#323232] px-3 py-2 text-xs font-semibold text-[#323232]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#323232] mb-1">
                    Vocativo (Saludo en mensajes)
                  </label>
                  <input
                    type="text"
                    value={editVocativo}
                    onChange={(e) => setEditVocativo(e.target.value)}
                    placeholder="Ej. Laura"
                    className="w-full rounded-xl border-2 border-[#323232] px-3 py-2 text-xs font-semibold text-[#323232]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#323232] mb-1">
                    Teléfono WhatsApp
                  </label>
                  <input
                    type="text"
                    value={editTel}
                    onChange={(e) => setEditTel(e.target.value)}
                    placeholder="54 9 11 ..."
                    className="w-full rounded-xl border-2 border-[#323232] px-3 py-2 text-xs font-mono font-semibold text-[#323232]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#323232] mb-1">
                    Estado Operativo
                  </label>
                  <PopurriDropdown
                    value={editEstadoFlujo}
                    onChange={(val) => setEditEstadoFlujo(val as EstadoFlujo)}
                    options={LISTA_ESTADOS_FLUJO_UNIFICADOS}
                    headerLabel={`Estado Operativo de #${contact.id}:`}
                    align="right"
                    menuWidth={310}
                    maxHeight={320}
                    triggerClassName="w-full flex items-center justify-between gap-1.5 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-2 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]/40 transition cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#323232] mb-1">
                    Calle, Altura o Cruce (Punto exacto)
                  </label>
                  <input
                    type="text"
                    value={editCalle}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditCalle(val);
                      const inf = inferirBarrioDesdeDireccionOComentario(
                        val,
                        `${val} ${editComentario}`
                      );
                      if (inf) setEditBarrio(inf);
                    }}
                    placeholder="Ej. Charcas 3702 / Scalabrini Ortiz"
                    className="w-full rounded-xl border-2 border-[#323232] px-3 py-2 text-xs font-semibold text-[#323232]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#323232] mb-1">
                    Barrio de CABA (Auto-corregible)
                  </label>
                  <input
                    type="text"
                    value={editBarrio}
                    onChange={(e) => setEditBarrio(e.target.value)}
                    placeholder="Ej. Palermo, Saavedra..."
                    className="w-full rounded-xl border-2 border-[#323232] px-3 py-2 text-xs font-semibold text-[#323232]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#323232] mb-1">
                  Comentario (Disponibilidad horaria, detalles de encuentro)
                </label>
                <textarea
                  rows={3}
                  value={editComentario}
                  onChange={(e) => setEditComentario(e.target.value)}
                  placeholder="Ej. Visita jueves después de las 18 hs (El Salvador y Acuña de Figueroa)"
                  className="w-full rounded-xl border-2 border-[#323232] p-3 text-xs font-semibold text-[#323232]"
                />
              </div>

              {validacionEnVivo &&
                (validacionEnVivo.advertenciaDireccion ||
                  validacionEnVivo.advertenciasHorario.length > 0) && (
                  <div className="rounded-xl border-2 border-[#323232] bg-[#FFF06B] p-3 text-xs space-y-1">
                    {validacionEnVivo.advertenciaDireccion && (
                      <p className="font-bold text-[#323232]">
                        {validacionEnVivo.advertenciaDireccion}
                      </p>
                    )}
                    {validacionEnVivo.advertenciasHorario.map((adv, i) => (
                      <p key={i} className="font-bold text-[#FF2C00]">
                        {adv}
                      </p>
                    ))}
                    {validacionEnVivo.sugerenciaAlternativa && (
                      <p className="font-semibold text-[#323232]">
                        💡 {validacionEnVivo.sugerenciaAlternativa}
                      </p>
                    )}
                  </div>
                )}
            </div>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
};
