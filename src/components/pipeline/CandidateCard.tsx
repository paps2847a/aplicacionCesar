import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Send,
  Copy,
  Check,
  ChevronDown,
  Sparkles,
  Edit3,
  Save,
  X,
  ExternalLink,
  FilePlus2,
  UserX,
  UserCheck,
  Wand2,
  Trash2,
} from 'lucide-react';
import type {
  CalendarEventItem,
  Contact,
  EstadoFlujo,
  TipoPlantillaWA,
  VoiceProfile,
} from '../../types';
import {
  getMacroStageForContact,
  MACRO_STAGES,
  MACRO_STAGES_ORDER,
  MacroStageKey,
} from '../../domain/contacts/pipelineStages';
import {
  adaptarMensajeConRespuestaVecinoLocal,
  generarMensajeContextual,
} from '../../domain/messaging/messageTemplates';
import { crearEnlaceWhatsApp } from '../../domain/messaging/greetingsAndTone';
import { validarDireccionYHorarioContacto } from '../../domain/routing/routingEngine';
import { inferirBarrioDesdeDireccionOComentario } from '../../domain/geo/cabaLocations';
import { marcarEntregaFichasExtra } from '../../domain/sync/dataMerging';
import { DEFAULT_VOICE_PROFILE } from '../../data/estatusPopurriData';

function formatTimestampSutil(isoOrDate?: string): string {
  if (!isoOrDate || isoOrDate === '2025-05-14') return '';
  try {
    const d = new Date(isoOrDate);
    if (isNaN(d.getTime())) return String(isoOrDate);
    const ahora = new Date();
    const hoyIso = ahora.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
    const fechaIso = d.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
    const hora = d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    if (fechaIso === hoyIso) {
      return `Hoy a las ${hora} hs`;
    }
    const ayer = new Date(ahora.getTime() - 24 * 3600 * 1000);
    const ayerIso = ayer.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
    if (fechaIso === ayerIso) {
      return `Ayer a las ${hora} hs`;
    }
    const ddmm = d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    return `${ddmm} a las ${hora} hs`;
  } catch {
    return String(isoOrDate);
  }
}

function obtenerMarcaTemporalUltimoEnvioApp(contact: Contact): string | null {
  if (contact.ultimoMensajeCorteEnviadoAt) {
    const fmt = formatTimestampSutil(contact.ultimoMensajeCorteEnviadoAt);
    if (fmt) return fmt;
  }
  if (contact.comentario) {
    const mAuto = contact.comentario.match(/\[1er msj auto enviado el ([^\]]+)\]/i);
    if (mAuto) return `${mAuto[1]} hs`;
    const mEnv = contact.comentario.match(/\[(?:Msj|Mensaje) enviado el ([^\]]+)\]/i);
    if (mEnv) return mEnv[1];
  }
  if (contact.ultimoContacto && contact.ultimoContacto !== '2025-05-14') {
    const fmt = formatTimestampSutil(contact.ultimoContacto);
    if (fmt) return fmt;
  }
  return null;
}

export const LISTA_PLANTILLAS_WA_COMPLETA: { value: TipoPlantillaWA; label: string }[] = [
  { value: 'auto', label: '✨ Automático según contexto del contacto' },
  { value: 'primer_contacto', label: '1. Primer Contacto (Rompehielo / Sin nombre)' },
  { value: 'seguimiento_cambio_chip', label: '2. Respondió Sí: Validar DNI CABA y pedir esquina/franja' },
  { value: 'seguimiento_sin_respuesta', label: '3. Seguimiento Suave (+48h sin respuesta al 1er msj)' },
  { value: 'seguimiento_24h_falta_dato', label: '4. Seguimiento +24h: Falta dirección o franja horaria' },
  { value: 'seguimiento_24h_falta_confirmar', label: '5. Seguimiento +24h: Falta confirmar propuesta de cita' },
  { value: 'propuesta_bloque_agenda', label: '6. Propuesta de Encuentro (Domicilio o Café del circuito)' },
  { value: 'convocatoria_cafe_hub', label: '7. Convocatoria a Café de Cercanía (Vecinos del barrio)' },
  { value: 'confirmacion_visita', label: '8. Confirmación de Encuentro Agendado / Chile 1408' },
  { value: 'recordatorio_maniana_encuentro', label: '9. Recordatorio por la Mañana (Antes de salir al recorrido)' },
  { value: 'en_camino', label: '10. En Camino (Aviso 10-15 min antes de llegar)' },
  { value: 'llegando', label: '11. Estoy Llegando (A 2 minutos de la puerta/esquina)' },
  { value: 'demorado', label: '12. Aviso de Demora (+10-15 min por encuentro previo)' },
  { value: 'esperado_no_estaba_reprogramar', label: '13. Pasé por el lugar y no nos cruzamos (Reprogramar)' },
  { value: 'disculpas_y_reprogramacion', label: '14. Disculpas por compromiso vencido + Reprogramar' },
  { value: 'retiro_fichas', label: '15. Retiro de Fichas Extra (X1/X2/X3 a 1 semana)' },
  { value: 'mas_info', label: '16. Pidió Más Información (Los 5 ejes de Popurrí en CABA)' },
  { value: 'agradecimiento_post_firma', label: '17. Agradecimiento Post-Firma + Pedido de Referidos CABA' },
  { value: 'no_caba_referidos', label: '18. Sin DNI en CABA (Consultar referidos en Capital)' },
  { value: 'baja_amable_sin_respuesta', label: '19. Último Mensaje Amable (Baja por falta de respuesta)' },
  { value: 'baja_respetuosa', label: '20. Confirmación de Baja Respetuosa' },
];

export const LISTA_ESTADOS_FLUJO_UNIFICADOS: {
  value: EstadoFlujo;
  label: string;
  shortLabel: string;
  rsp: 'Sí' | 'No' | 'Nuevo';
  adhirio: 'Sí' | 'Pendiente' | 'No';
}[] = [
  {
    value: 'SIN_CONTACTAR_1ER_MSJ',
    label: '1. Nuevo · Sin 1er mensaje',
    shortLabel: '1. Sin 1er Msj',
    rsp: 'Nuevo',
    adhirio: 'Pendiente',
  },
  {
    value: 'FALTA_NOMBRE_Y_APELLIDO',
    label: '1b. Nuevo · Falta Nombre',
    shortLabel: '1b. Falta Nombre',
    rsp: 'Nuevo',
    adhirio: 'Pendiente',
  },
  {
    value: '1ER_MSJ_ENVIADO_SIN_RSP',
    label: '2. 1er Msj Enviado · Esperando respuesta',
    shortLabel: '2. 1er Msj (Sin Rsp)',
    rsp: 'No',
    adhirio: 'Pendiente',
  },
  {
    value: 'RESPONDIO_FALTA_DNI_O_ZONA',
    label: '3. Respondió · Falta calle/esquina o día',
    shortLabel: '3. Falta Calle/Día',
    rsp: 'Sí',
    adhirio: 'Pendiente',
  },
  {
    value: 'PIDIO_MAS_INFO_ENVIADA',
    label: '3b. Pidió más info (5 ejes enviados)',
    shortLabel: '3b. Pidió Más Info',
    rsp: 'Sí',
    adhirio: 'Pendiente',
  },
  {
    value: 'PREFIERE_CAFE_HUB_O_SEDE',
    label: '3c. Prefiere Punto / Café / Sede',
    shortLabel: '3c. Prefiere Punto/Café',
    rsp: 'Sí',
    adhirio: 'Pendiente',
  },
  {
    value: 'PASO_DATOS_FALTA_CONFIRMAR',
    label: '4. Pasó dirección/horario · Falta confirmar',
    shortLabel: '4. Falta Confirmar',
    rsp: 'Sí',
    adhirio: 'Pendiente',
  },
  {
    value: 'ENCUENTRO_CONFIRMADO',
    label: '5. Encuentro Confirmado (En Ruta)',
    shortLabel: '5. Confirmado (Ruta)',
    rsp: 'Sí',
    adhirio: 'Pendiente',
  },
  {
    value: 'RECORDATORIO_DIA_ENVIADO',
    label: '6. Recordatorio / En Camino Enviado',
    shortLabel: '6. En Camino / Record.',
    rsp: 'Sí',
    adhirio: 'Pendiente',
  },
  {
    value: 'PENDIENTE_RETIRO_FICHAS',
    label: '7. Llevó Fichas Extra · Pendiente Retiro',
    shortLabel: '7. Retiro Fichas',
    rsp: 'Sí',
    adhirio: 'Sí',
  },
  {
    value: 'POSTERGO_SALUD_O_VIAJE',
    label: '8. En Pausa (Viaje / Salud / Más adelante)',
    shortLabel: '8. En Pausa',
    rsp: 'Sí',
    adhirio: 'Pendiente',
  },
  {
    value: 'YA_ADHIRIO_FIRMA_OK',
    label: '9. ✅ Ya Firmó · Adhesión Completada',
    shortLabel: '9. ✅ Ya Firmó',
    rsp: 'Sí',
    adhirio: 'Sí',
  },
  {
    value: 'SIN_DNI_CABA_PEDIR_REFERIDOS',
    label: '10. Sin DNI en CABA · Pedir Referidos',
    shortLabel: '10. Sin DNI CABA',
    rsp: 'Sí',
    adhirio: 'No',
  },
  {
    value: 'DESCARTADO_O_BAJA',
    label: '11. Baja / Número Inválido / Descartado',
    shortLabel: '11. Baja / Descartado',
    rsp: 'No',
    adhirio: 'No',
  },
];

interface CandidateCardProps {
  contact: Contact;
  isSelected?: boolean;
  isExpanded?: boolean;
  layoutMode?: 'horizontal' | 'compact';
  whatsAppReady?: boolean;
  voiceProfile?: VoiceProfile;
  allContacts?: Contact[];
  calendarEvents?: CalendarEventItem[];
  onSelect: (contact: Contact) => void;
  onToggleExpand?: (contact: Contact) => void;
  onUpdateContact?: (contactId: string, updates: Partial<Contact>) => Promise<void> | void;
  onStageChange?: (contact: Contact, targetStage: MacroStageKey) => void;
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
  canDeleteContact?: boolean;
  onDeleteContact?: (contactId: string) => Promise<void> | void;
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
  isExpanded = false,
  layoutMode = 'horizontal',
  whatsAppReady = false,
  voiceProfile = DEFAULT_VOICE_PROFILE,
  allContacts = [],
  calendarEvents = [],
  onSelect,
  onToggleExpand,
  onUpdateContact,
  onStageChange,
  onSendDirectWA,
  onNavigateRelative,
  hasPrev = false,
  hasNext = false,
  canDeleteContact = false,
  onDeleteContact,
}) => {
  const stageKey = getMacroStageForContact(contact);
  const stageDef = MACRO_STAGES[stageKey];
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Estado de edición inline directa en la tarjeta
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [editNombre, setEditNombre] = useState(contact.nombre || '');
  const [editVocativo, setEditVocativo] = useState(contact.vocativoOverride || contact.primerNombre || '');
  const [editTel, setEditTel] = useState(contact.telRaw || contact.tel || contact.telWA || '');
  const [editCalle, setEditCalle] = useState(contact.calleOCruce || '');
  const [editBarrio, setEditBarrio] = useState(contact.barrio || 'Palermo');
  const [editComentario, setEditComentario] = useState(
    (contact.comentario || '')
      .replace(/\s*\[Modificado el [^\]]+\]/g, '')
      .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
      .trim()
  );
  const [editEstadoFlujo, setEditEstadoFlujo] = useState<EstadoFlujo>(
    contact.estadoFlujo || 'SIN_CONTACTAR_1ER_MSJ'
  );
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [savedBadgeVisible, setSavedBadgeVisible] = useState(false);

  // Input rápido para completar Nombre y Apellido cuando Columna B está vacía
  const [quickFullName, setQuickFullName] = useState(contact.nombre || '');

  // Estado del panel de mensaje expandible inline
  const [selectedTemplate, setSelectedTemplate] = useState<TipoPlantillaWA>('auto');
  const [messageText, setMessageText] = useState<string>('');
  const [liveReplyInput, setLiveReplyInput] = useState<string>('');
  const [isSendingWA, setIsSendingWA] = useState<boolean>(false);
  const [copiedMsg, setCopiedMsg] = useState<boolean>(false);
  const [sentSuccess, setSentSuccess] = useState<boolean>(false);
  const [showFichasMenu, setShowFichasMenu] = useState<boolean>(false);

  useEffect(() => {
    setEditNombre(contact.nombre || '');
    setEditVocativo(contact.vocativoOverride || contact.primerNombre || '');
    setEditTel(contact.telRaw || contact.tel || contact.telWA || '');
    setEditCalle(contact.calleOCruce || '');
    setEditBarrio(contact.barrio || 'Palermo');
    setEditComentario(
      (contact.comentario || '')
        .replace(/\s*\[Modificado el [^\]]+\]/g, '')
        .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
        .trim()
    );
    setEditEstadoFlujo(contact.estadoFlujo || 'SIN_CONTACTAR_1ER_MSJ');
    setQuickFullName(contact.nombre || '');
  }, [contact]);

  useEffect(() => {
    if (!isExpanded) return;
    if (selectedTemplate === 'auto' && contact.alertaVencido?.activa) {
      setMessageText(contact.alertaVencido.mensajeDisculpasReprogramacion);
    } else if (selectedTemplate === 'auto' && contact.diagnostico48h?.aplica) {
      setMessageText(contact.diagnostico48h.mensajePersonalizado48h);
    } else {
      const gen = generarMensajeContextual(contact, voiceProfile, selectedTemplate);
      setMessageText(gen.texto);
    }
  }, [isExpanded, selectedTemplate, contact, voiceProfile]);

  // Validación en vivo de dirección y horario mientras se edita
  const validacionEnVivo = useMemo(() => {
    if (!isEditingInline) return null;
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
    isEditingInline,
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

  const cleanComment = (contact.comentario || '')
    .replace(/\[Modificado el [^\]]+\]/g, '')
    .replace(/\[Último cambio:? [^\]]+\]/g, '')
    .trim();

  const auditDate = formatAuditDate(contact);
  const lastSentAppDate = obtenerMarcaTemporalUltimoEnvioApp(contact);
  const phone = contact.tel || contact.telRaw || contact.telWA || '';
  const hasValidPhone = Boolean(phone && phone !== 'N/A' && phone.replace(/\D/g, '').length >= 6);
  const fullName =
    contact.nombreCompletoCorregido ||
    (contact.nombre && contact.nombre.trim()) ||
    `Contacto #${contact.id}`;

  const handleCopyPhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (phone) {
      navigator.clipboard.writeText(phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const handleSaveInlineEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateContact) return;
    setIsSavingEdit(true);
    try {
      const barrioInferido = editCalle.trim()
        ? inferirBarrioDesdeDireccionOComentario(editCalle.trim(), `${editCalle} ${editComentario}`)
        : null;
      const barrioFinal = barrioInferido || editBarrio.trim() || contact.barrio || 'Palermo';

      const defEstado = LISTA_ESTADOS_FLUJO_UNIFICADOS.find((it) => it.value === editEstadoFlujo);
      const esRevertidoANuevo =
        editEstadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' || editEstadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO';

      await onUpdateContact(contact.id, {
        nombre: editNombre.trim(),
        vocativoOverride: editVocativo.trim() || undefined,
        telRaw: editTel.trim(),
        calleOCruce: editCalle.trim(),
        barrio: barrioFinal,
        comentario: editComentario.trim(),
        estadoFlujo: editEstadoFlujo,
        rsp: defEstado ? defEstado.rsp : contact.rsp,
        adhirio: defEstado ? defEstado.adhirio : contact.adhirio,
        primerContactoEnviado: !esRevertidoANuevo,
      });
      setIsEditingInline(false);
      setSavedBadgeVisible(true);
      setTimeout(() => setSavedBadgeVisible(false), 3500);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleSaveQuickName = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateContact || !quickFullName.trim()) return;
    await onUpdateContact(contact.id, {
      nombre: quickFullName.trim(),
      estadoFlujo:
        contact.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
          ? 'SIN_CONTACTAR_1ER_MSJ'
          : contact.estadoFlujo,
    });
  };

  const handleAdaptWithReply = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!liveReplyInput.trim()) return;
    const adapted = adaptarMensajeConRespuestaVecinoLocal(
      contact,
      liveReplyInput.trim(),
      messageText,
      voiceProfile
    );
    setMessageText(adapted);
  };

  const handleShortenMsg = (e: React.MouseEvent) => {
    e.stopPropagation();
    const shortened = adaptarMensajeConRespuestaVecinoLocal(
      contact,
      'acortar en 2-3 líneas',
      messageText,
      voiceProfile
    );
    setMessageText(shortened);
  };

  const handleSendWAInline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSendDirectWA || !hasValidPhone) return;
    setIsSendingWA(true);
    try {
      const ok = await onSendDirectWA(
        phone,
        messageText,
        contact.id,
        contact.primerNombre || contact.nombre || `Contacto #${contact.id}`,
        contact.barrio
      );
      if (ok) {
        setSentSuccess(true);
        setTimeout(() => setSentSuccess(false), 3500);
      }
    } finally {
      setIsSendingWA(false);
    }
  };

  const handleMarkSinDniCaba = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateContact) return;
    const baseCom = cleanComment.replace(/No tiene domicilio en CABA\.?\s*/gi, '').trim();
    const nuevoCom = baseCom
      ? `No tiene domicilio en CABA · ${baseCom}`
      : 'No tiene domicilio en CABA';
    await onUpdateContact(contact.id, {
      rsp: 'Sí',
      adhirio: 'No',
      estadoFlujo: 'SIN_DNI_CABA_PEDIR_REFERIDOS',
      comentario: nuevoCom,
    });
    setSelectedTemplate('no_caba_referidos');
    const gen = generarMensajeContextual(
      { ...contact, situacion: 'DESCARTADO_NO_CABA', estadoFlujo: 'SIN_DNI_CABA_PEDIR_REFERIDOS' },
      voiceProfile,
      'no_caba_referidos'
    );
    setMessageText(gen.texto);
  };

  const handleMarkFichasExtra = async (cantidad: 1 | 2 | 3, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateContact) return;
    const xCant: 'X1' | 'X2' | 'X3' = cantidad === 1 ? 'X1' : cantidad === 3 ? 'X3' : 'X2';
    const actualizado = marcarEntregaFichasExtra(contact, xCant, Date.now());
    await onUpdateContact(contact.id, {
      rsp: actualizado.rsp,
      adhirio: actualizado.adhirio,
      estadoFlujo: 'PENDIENTE_RETIRO_FICHAS',
      comentario: actualizado.comentario,
      fechaAdhesion: actualizado.fechaAdhesion,
    });
    setShowFichasMenu(false);
  };

  const handleGranularStatusSelect = async (nuevoEstado: EstadoFlujo, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowStageMenu(false);
    if (!onUpdateContact) return;
    const def = LISTA_ESTADOS_FLUJO_UNIFICADOS.find((it) => it.value === nuevoEstado);
    const esNuevo =
      nuevoEstado === 'SIN_CONTACTAR_1ER_MSJ' || nuevoEstado === 'FALTA_NOMBRE_Y_APELLIDO';
    await onUpdateContact(contact.id, {
      estadoFlujo: nuevoEstado,
      rsp: def ? def.rsp : contact.rsp,
      adhirio: def ? def.adhirio : contact.adhirio,
      primerContactoEnviado: !esNuevo,
    });
    setSavedBadgeVisible(true);
    setTimeout(() => setSavedBadgeVisible(false), 3500);
  };

  const waLink = crearEnlaceWhatsApp(phone, messageText || contact.mensajeSugerido || '');
  const officialChipLabel =
    LISTA_ESTADOS_FLUJO_UNIFICADOS.find((it) => it.value === contact.estadoFlujo)?.label ||
    contact.estadoFlujoEtiqueta ||
    stageDef.label;

  // ==========================================
  // MODO COMPACTO (Para vista Kanban)
  // ==========================================
  if (layoutMode === 'compact') {
    return (
      <div
        onClick={() => (onToggleExpand ? onToggleExpand(contact) : onSelect(contact))}
        className={`group relative cursor-pointer rounded-2xl border-2 bg-white p-3.5 transition-all duration-150 ${
          isSelected || isExpanded
            ? 'border-[#323232] bg-[#FFF06B]/20 shadow-[3px_3px_0px_#323232]'
            : contact.alertaVencido?.activa
            ? 'border-[#FF2C00] bg-[#F5817F]/10 shadow-[2px_2px_0px_#FF2C00]'
            : 'border-[#323232]/80 hover:border-[#323232] shadow-[2px_2px_0px_#323232]'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="rounded bg-[#323232] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#FFF06B]">
                #{contact.id}
              </span>
              <h4 className="truncate text-xs font-bold font-display text-[#323232]">
                {fullName}
              </h4>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded bg-[#DFF4FF] px-1.5 py-0.5 font-bold text-[#323232] border border-[#323232]/30">
                <MapPin className="h-2.5 w-2.5" />
                {contact.barrio || 'CABA'}
              </span>
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold border border-[#323232]/40 truncate max-w-full ${stageDef.badgeBg} ${stageDef.badgeText}`}
              >
                {officialChipLabel}
              </span>
              {contact.sinNombre && (
                <span className="rounded bg-[#FFF06B] px-1.5 py-0.5 text-[10px] font-bold text-[#323232] border border-[#323232]/40">
                  Sin nombre
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleExpand) {
                onToggleExpand(contact);
              } else {
                onSelect(contact);
              }
            }}
            className="rounded-lg border border-[#323232] bg-white p-1 text-[#323232] hover:bg-[#FFF06B]"
            title="Editar / Abrir ficha"
          >
            <Edit3 className="h-3 w-3" />
          </button>
        </div>

        {contact.calleOCruce && (
          <p className="mt-2 truncate text-[11px] font-bold text-[#323232] bg-[#F5F4F0] rounded px-2 py-1 border border-[#323232]/20">
            📍 {contact.calleOCruce}
          </p>
        )}

        <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-[#5A5955]">
          <Send className="h-2.5 w-2.5 shrink-0 text-[#29B8FF]" />
          <span className="truncate">
            {lastSentAppDate ? `Último msj app: ${lastSentAppDate}` : 'Sin msj enviado desde la app'}
          </span>
        </p>

        {contact.alertaVencido?.activa && (
          <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-white bg-[#FF2C00] px-2 py-0.5 rounded">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span className="truncate">Vencido · Reprogramar</span>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // MODO HORIZONTAL COMPLETO (Con Edición Inline y Desplegable de Mensajes en 1 Clic)
  // ==========================================
  return (
    <div
      className={`relative rounded-2xl border-2 bg-white transition-all duration-150 ${
        showStageMenu ? 'z-40' : 'z-0'
      } ${
        contact.alertaVencido?.activa
          ? 'border-[#FF2C00] shadow-[4px_4px_0px_#FF2C00]'
          : isExpanded || isSelected
          ? 'border-[#323232] shadow-[4px_4px_0px_#323232]'
          : 'border-[#323232]/85 hover:border-[#323232] shadow-[2px_2px_0px_#323232]'
      }`}
    >
      {/* CABECERA DE TARJETA (En modo lectura o edición directa in-place sobre la misma fila blanca) */}
      <div
        onClick={() => {
          if (isEditingInline) return;
          if (onToggleExpand) onToggleExpand(contact);
          else onSelect(contact);
        }}
        className={`${isEditingInline ? 'bg-[#FFFDF5]' : 'cursor-pointer'} p-3.5 sm:p-5 w-full min-w-0 rounded-2xl transition-colors`}
      >
        {isEditingInline ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="space-y-3 w-full min-w-0"
          >
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3.5 sm:gap-4 w-full min-w-0">
              {/* 1. Identidad, Vocativo y Teléfono editables en su misma columna */}
              <div className="w-full min-w-0 lg:w-1/3 lg:min-w-[220px] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-[#323232] px-2 py-0.5 font-mono text-xs font-bold text-[#FFF06B] shrink-0">
                    #{contact.id}
                  </span>
                  <input
                    type="text"
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    placeholder="Nombre y Apellido"
                    className="w-full min-w-0 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1 text-xs font-bold text-[#323232] focus:outline-hidden focus:ring-2 focus:ring-[#FFF06B]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-[#5A5955] mb-0.5">
                      Vocativo (Saludo WA)
                    </label>
                    <input
                      type="text"
                      value={editVocativo}
                      onChange={(e) => setEditVocativo(e.target.value)}
                      placeholder="Ej. Laura"
                      className="w-full rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1 text-xs font-semibold text-[#323232]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-[#5A5955] mb-0.5">
                      Teléfono WA
                    </label>
                    <input
                      type="text"
                      value={editTel}
                      onChange={(e) => setEditTel(e.target.value)}
                      placeholder="54 9 11 1234-5678"
                      className="w-full rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1 text-xs font-mono font-semibold text-[#323232]"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Barrio y Calle/Esquina editables en su misma columna */}
              <div className="w-full min-w-0 lg:w-1/4 lg:min-w-[180px] space-y-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-[#5A5955] mb-0.5">
                    Barrio CABA (Auto)
                  </label>
                  <input
                    type="text"
                    value={editBarrio}
                    onChange={(e) => setEditBarrio(e.target.value)}
                    placeholder="Ej. Palermo, Caballito..."
                    className="w-full rounded-xl border-2 border-[#323232] bg-[#DFF4FF]/60 px-2.5 py-1 text-xs font-bold text-[#323232]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-[#5A5955] mb-0.5">
                    Calle, Altura o Esquina
                  </label>
                  <input
                    type="text"
                    value={editCalle}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditCalle(val);
                      const inf = inferirBarrioDesdeDireccionOComentario(val, `${val} ${editComentario}`);
                      if (inf) setEditBarrio(inf);
                    }}
                    placeholder="Ej. Charcas 3702 o Vidal y García del Río"
                    className="w-full rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1 text-xs font-semibold text-[#323232]"
                  />
                </div>
              </div>

              {/* 3. Comentario editable en su mismo recuadro */}
              <div className="w-full min-w-0 lg:w-1/4 lg:min-w-[180px]">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5A5955] mb-0.5 font-display">
                  Comentario (Día, horario o dirección):
                </label>
                <div className="rounded-xl border-2 border-[#323232] bg-[#F5F4F0] focus-within:bg-white overflow-hidden">
                  <textarea
                    rows={3}
                    value={editComentario}
                    onChange={(e) => setEditComentario(e.target.value)}
                    placeholder="Ej. Visita 23/10 entre 15 y 18 (Charcas 3702)"
                    className="w-full border-0 bg-transparent p-2 text-xs font-semibold text-[#323232] leading-relaxed resize-y focus:outline-hidden block"
                  />
                </div>
              </div>

              {/* 4. Selector de Estado Operativo + Guardar / Cancelar en la misma columna derecha */}
              <div className="w-full lg:w-auto flex flex-wrap lg:flex-col items-start lg:items-end justify-between gap-2 shrink-0 min-w-0">
                <div className="w-full lg:w-64">
                  <label className="block text-[10px] font-bold uppercase text-[#5A5955] mb-0.5 lg:text-right">
                    Estado Operativo
                  </label>
                  <select
                    value={editEstadoFlujo}
                    onChange={(e) => setEditEstadoFlujo(e.target.value as EstadoFlujo)}
                    className="w-full rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232] shadow-[2px_2px_0px_#323232]"
                  >
                    {LISTA_ESTADOS_FLUJO_UNIFICADOS.map((st) => (
                      <option key={st.value} value={st.value}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {canDeleteContact && onDeleteContact && (
                    confirmingDelete ? (
                      <div className="inline-flex items-center gap-1 rounded-xl border-2 border-[#FF2C00] bg-[#F5817F]/20 px-2 py-1">
                        <span className="text-[10px] font-bold text-[#FF2C00]">¿Borrar #{contact.id}?</span>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={async () => {
                            setIsDeleting(true);
                            try {
                              await onDeleteContact(contact.id);
                            } finally {
                              setIsDeleting(false);
                              setConfirmingDelete(false);
                            }
                          }}
                          className="rounded-lg bg-[#FF2C00] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
                        >
                          {isDeleting ? '...' : 'Sí, borrar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(false)}
                          className="rounded-lg bg-white border border-[#323232] px-1.5 py-0.5 text-[10px] font-bold text-[#323232]"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#F5817F]/30 px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#F5817F] transition shadow-[2px_2px_0px_#323232]"
                        title="Eliminar contacto (Solo Admin)"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[#FF2C00]" />
                        <span>Eliminar</span>
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setIsEditingInline(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-3 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#ECEAE2] transition shadow-[2px_2px_0px_#323232]"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cancelar</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveInlineEdit}
                    disabled={isSavingEdit}
                    className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-3.5 py-1.5 text-xs font-bold font-display text-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-[#ffe838] transition"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{isSavingEdit ? 'Guardando...' : 'Guardar Cambios'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Alertas de validación geoespacial y de choques horarios en tiempo real */}
            {validacionEnVivo &&
              (validacionEnVivo.advertenciaDireccion ||
                validacionEnVivo.advertenciasHorario.length > 0) && (
                <div className="rounded-xl border-2 border-[#323232] bg-[#FFF06B] p-2.5 text-xs space-y-1">
                  {validacionEnVivo.advertenciaDireccion && (
                    <p className="font-bold text-[#323232]">{validacionEnVivo.advertenciaDireccion}</p>
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
        ) : (
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3.5 sm:gap-4 w-full min-w-0">
            {/* 1. Identidad, Vocativo y Teléfono */}
            <div className="w-full min-w-0 lg:w-1/3 lg:min-w-[220px] space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-lg bg-[#323232] px-2 py-0.5 font-mono text-xs font-bold text-[#FFF06B]">
                  #{contact.id}
                </span>
                <h4 className="text-base font-bold font-display text-[#323232] break-words">
                  {fullName}
                </h4>
                {contact.sinNombre && (
                  <span className="rounded-md bg-[#FFF06B] px-2 py-0.5 text-[10px] font-bold text-[#323232] border border-[#323232]">
                    Sin nombre
                  </span>
                )}
                {!contact.sinNombre && contact.primerNombre && (
                  <span className="rounded-md bg-[#ECEAE2] px-2 py-0.5 text-[10px] font-bold text-[#5A5955]">
                    Vocativo: {contact.primerNombre}
                  </span>
                )}
                {savedBadgeVisible && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-[#323232] bg-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-950 shadow-[1px_1px_0px_#323232]">
                    <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                    ✓ Guardado en App y Sheets
                  </span>
                )}
              </div>

              {phone ? (
                <div className="flex items-center gap-2 text-xs text-[#323232] flex-wrap">
                  <span className="font-mono font-bold">{phone}</span>
                  <button
                    type="button"
                    onClick={handleCopyPhone}
                    className="inline-flex items-center gap-1 rounded-md border border-[#323232]/30 bg-[#F5F4F0] px-1.5 py-0.5 text-[10px] font-bold text-[#323232] hover:bg-[#FFF06B] transition"
                  >
                    {copiedPhone ? (
                      <>
                        <Check className="h-2.5 w-2.5 text-emerald-700" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-2.5 w-2.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-xs font-bold text-[#FF2C00]">Sin teléfono válido en planilla</p>
              )}

              <div className="flex items-center gap-1.5 text-[11px] text-[#5A5955] font-medium">
                <Send className={`h-3 w-3 shrink-0 ${lastSentAppDate ? 'text-[#29B8FF]' : 'text-[#5A5955]/70'}`} />
                <span className={`truncate ${lastSentAppDate ? 'font-semibold text-[#323232]' : ''}`}>
                  {lastSentAppDate ? `Último msj app: ${lastSentAppDate}` : 'Sin msj enviado desde la app'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-[#5A5955] font-medium">
                <Clock className="h-3 w-3 shrink-0" />
                <span className="truncate">{auditDate ? `Modificado: ${auditDate}` : 'Sin cambios manuales en app'}</span>
              </div>
            </div>

            {/* 2. Barrio, Dirección y Alertas Vencidas */}
            <div className="w-full min-w-0 lg:w-1/4 lg:min-w-[180px] space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#DFF4FF] px-2.5 py-1 text-xs font-bold text-[#323232] border border-[#323232]">
                  <MapPin className="h-3.5 w-3.5 text-[#323232]" />
                  {contact.barrio || 'CABA'}
                </span>

                {contact.barrioCorregidoPorDireccion && contact.barrioOriginalSheet && (
                  <span
                    className="rounded-md bg-[#FFF06B] px-1.5 py-0.5 text-[10px] font-bold text-[#323232] border border-[#323232]/40"
                    title={`En Sheet decía ${contact.barrioOriginalSheet}; se corrigió por su dirección`}
                  >
                    Corregido (era {contact.barrioOriginalSheet})
                  </span>
                )}

                {contact.franjaHoraria && contact.franjaHoraria !== 'Flexible' && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[#ECEAE2] px-2 py-0.5 text-xs font-bold text-[#323232]">
                    <Clock className="h-3 w-3" />
                    {contact.franjaHoraria}
                  </span>
                )}
              </div>

              {contact.calleOCruce ? (
                <p className="text-xs font-bold text-[#323232] flex items-center gap-1.5 break-words">
                  <span className="h-2 w-2 rounded-full bg-[#29B8FF] border border-[#323232] shrink-0" />
                  <span>{contact.calleOCruce}</span>
                </p>
              ) : (
                <p className="text-[11px] text-[#5A5955] italic">
                  Sin calle/esquina determinada aún
                </p>
              )}

              {contact.alertaVencido?.activa && (
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF2C00] px-2.5 py-1 text-xs font-bold text-white border border-[#323232] shadow-[2px_2px_0px_#323232]">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {contact.alertaVencido.fechaVencida
                      ? `Vencido (${contact.alertaVencido.fechaVencida}) · Reprogramar`
                      : 'Cita vencida · Reprogramar'}
                  </span>
                </div>
              )}

              {(contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
                contact.situacion === 'RETIRO_FICHAS') && (
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFF06B] px-2.5 py-1 text-xs font-bold text-[#323232] border border-[#323232]">
                  <FilePlus2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Pendiente Retiro de Fichas Extra</span>
                </div>
              )}
            </div>

            {/* 3. Comentario */}
            <div className="w-full min-w-0 lg:w-1/4 lg:min-w-[180px]">
              {cleanComment ? (
                <div className="rounded-xl border border-[#323232]/30 bg-[#F5F4F0] p-2.5 text-xs text-[#323232] font-medium break-words">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A5955] block mb-0.5 font-display">
                    Comentario:
                  </span>
                  <p className="line-clamp-3 leading-relaxed">&ldquo;{cleanComment}&rdquo;</p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#323232]/30 p-2.5 text-[11px] text-[#5A5955] text-center italic">
                  Sin comentario
                </div>
              )}
            </div>

            {/* 4. Selector de Estado Unificado & Botones Rápidos (Editar, Firmó, Mensaje) */}
            <div className="w-full lg:w-auto flex flex-wrap lg:flex-col items-start lg:items-end justify-between gap-2 shrink-0 min-w-0">
              {/* Selector directo de Estado Operativo (mismos estados del filtro) */}
              <div className="relative max-w-full" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setShowStageMenu((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 max-w-full rounded-xl border-2 border-[#323232] px-2.5 sm:px-3 py-1 text-xs font-bold font-display transition shadow-[2px_2px_0px_#323232] ${stageDef.badgeBg} ${stageDef.badgeText}`}
                >
                  <span className="truncate">{officialChipLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </button>

                {showStageMenu && (
                  <>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowStageMenu(false);
                      }}
                      className="fixed inset-0 z-[65] bg-black/30 lg:bg-transparent"
                    />
                    <div className="fixed inset-x-3 bottom-4 lg:absolute lg:inset-auto lg:right-0 lg:top-full lg:mt-1.5 z-[70] lg:w-80 max-h-[72vh] lg:max-h-80 overflow-y-auto rounded-2xl border-2 border-[#323232] bg-white p-2 shadow-[6px_6px_0px_#323232]">
                      <div className="flex items-center justify-between px-2.5 py-1 border-b border-[#323232]/15 mb-1">
                        <span className="text-[10px] font-bold uppercase text-[#5A5955] font-display">
                          Estado de #{contact.id}:
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowStageMenu(false);
                          }}
                          className="text-xs font-bold text-[#323232] px-1 lg:hidden"
                        >
                          ✕
                        </button>
                      </div>
                      {LISTA_ESTADOS_FLUJO_UNIFICADOS.map((item) => {
                        const isCur = contact.estadoFlujo === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={(e) => handleGranularStatusSelect(item.value, e)}
                            className={`w-full flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-bold text-left transition ${
                              isCur
                                ? 'bg-[#FFF06B] text-[#323232]'
                                : 'text-[#323232] hover:bg-[#F5F4F0]'
                            }`}
                          >
                            <span className="truncate">{item.label}</span>
                            {isCur && <Check className="h-3.5 w-3.5 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Botones de Acción Directa en la Tarjeta */}
              <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                {canDeleteContact && onDeleteContact && (
                  confirmingDelete ? (
                    <div className="inline-flex items-center gap-1 rounded-xl border-2 border-[#FF2C00] bg-[#F5817F]/20 px-2 py-1 shadow-[2px_2px_0px_#323232]">
                      <span className="text-[10px] font-bold text-[#FF2C00]">¿Borrar #{contact.id}?</span>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={async () => {
                          setIsDeleting(true);
                          try {
                            await onDeleteContact(contact.id);
                          } finally {
                            setIsDeleting(false);
                            setConfirmingDelete(false);
                          }
                        }}
                        className="rounded-lg bg-[#FF2C00] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
                      >
                        {isDeleting ? '...' : 'Sí'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className="rounded-lg bg-white border border-[#323232] px-1.5 py-0.5 text-[10px] font-bold text-[#323232]"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      className="inline-flex items-center justify-center rounded-xl border-2 border-[#323232] bg-white px-2 py-1.5 text-xs font-bold font-display text-[#FF2C00] hover:bg-[#F5817F]/30 transition shadow-[2px_2px_0px_#323232]"
                      title="Eliminar contacto de la App y Google Sheets (Solo Admin)"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingInline(true)}
                  className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#ECEAE2] transition shadow-[2px_2px_0px_#323232]"
                  title="Editar nombre, dirección, barrio, teléfono o comentario directamente sobre esta fila"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Editar</span>
                </button>

                {contact.adhirio !== 'Sí' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onStageChange) onStageChange(contact, 'adheridos');
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-emerald-100 px-2.5 py-1.5 text-xs font-bold font-display text-emerald-950 hover:bg-emerald-200 transition shadow-[2px_2px_0px_#323232]"
                    title="Marcar que ya firmó la ficha física"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Firmó</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => (onToggleExpand ? onToggleExpand(contact) : onSelect(contact))}
                  className={`inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] px-3 py-1.5 text-xs font-bold font-display transition shadow-[2px_2px_0px_#323232] ${
                    isExpanded
                      ? 'bg-[#29B8FF] text-[#323232]'
                      : 'bg-[#FFF06B] text-[#323232] hover:bg-[#ffe838]'
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>{isExpanded ? 'Ocultar Msj' : 'Mensaje WA'}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PANEL DESPLEGABLE DE MENSAJES Y ACCIONES RÁPIDAS (Se abre al hacer clic en el contacto) */}
      {isExpanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="border-t-2 border-[#323232] bg-[#F5F4F0] p-4 sm:p-5 space-y-4 rounded-b-2xl"
        >
          {/* Barra superior del desplegable: Navegación < Anterior | Siguiente > + Abrir Ficha Lateral */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#323232]/20">
            <div className="flex items-center gap-2">
              {onNavigateRelative && (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!hasPrev}
                    onClick={() => onNavigateRelative('prev')}
                    className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1 text-xs font-bold font-display text-[#323232] disabled:opacity-40 hover:bg-[#FFF06B]"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Anterior</span>
                  </button>
                  <button
                    type="button"
                    disabled={!hasNext}
                    onClick={() => onNavigateRelative('next')}
                    className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1 text-xs font-bold font-display text-[#323232] disabled:opacity-40 hover:bg-[#FFF06B]"
                  >
                    <span>Siguiente</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <span className="text-xs font-bold text-[#5A5955]">
                Redactor contextual · #{contact.id} {fullName}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Botón rápido: Entregué Fichas Extra (X1/X2/X3 · Retiro en 1 semana) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFichasMenu((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#DFF4FF] px-2.5 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#29B8FF]"
                  title="Registrar que se le dejaron fichas extra para retirar en 1 semana"
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  <span>+ Fichas (Retiro 1 sem)</span>
                </button>
                {showFichasMenu && (
                  <div className="absolute right-0 top-full mt-1 z-40 w-56 rounded-xl border-2 border-[#323232] bg-white p-1.5 shadow-[4px_4px_0px_#323232]">
                    <p className="px-2 py-1 text-[10px] font-bold uppercase text-[#5A5955]">
                      Agendar retiro en 7 días:
                    </p>
                    {([1, 2, 3] as const).map((cant) => (
                      <button
                        key={cant}
                        type="button"
                        onClick={(e) => handleMarkFichasExtra(cant, e)}
                        className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]"
                      >
                        Dejé X{cant} ficha{cant > 1 ? 's' : ''} (Retirar en 1 sem)
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Botón rápido: Sin DNI CABA */}
              <button
                type="button"
                onClick={handleMarkSinDniCaba}
                className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#F5817F]/30"
                title="Marcar que no tiene domicilio de CABA en el DNI y preparar mensaje pidiendo referidos"
              >
                <UserX className="h-3.5 w-3.5 text-[#FF2C00]" />
                <span>Sin DNI CABA</span>
              </button>
            </div>
          </div>

          {/* Apartado especial cuando el contacto NO tiene nombre (ej. Contacto #197) */}
          {contact.sinNombre && (
            <div className="rounded-xl border-2 border-[#323232] bg-[#FFF06B] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-[2px_2px_0px_#323232]">
              <div className="text-xs text-[#323232]">
                <span className="font-bold font-display block">
                  👤 Este contacto figura sin nombre (#{contact.id})
                </span>
                <span>
                  Cuando te responda su nombre y apellido, cargalo acá para actualizar la planilla:
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={quickFullName}
                  onChange={(e) => setQuickFullName(e.target.value)}
                  placeholder="Nombre y Apellido..."
                  className="rounded-lg border-2 border-[#323232] bg-white px-3 py-1.5 text-xs font-bold text-[#323232] min-w-[190px]"
                />
                <button
                  type="button"
                  onClick={handleSaveQuickName}
                  className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#323232] px-3 py-1.5 text-xs font-bold font-display text-[#FFF06B] hover:opacity-90"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Guardar Nombre</span>
                </button>
              </div>
            </div>
          )}

          {/* Selector de las 20+ plantillas + Adaptador según respuesta en vivo */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#323232] mb-1 font-display">
                Tipo de Mensaje WhatsApp ({LISTA_PLANTILLAS_WA_COMPLETA.length} opciones):
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value as TipoPlantillaWA)}
                className="w-full rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-bold text-[#323232]"
              >
                {LISTA_PLANTILLAS_WA_COMPLETA.map((tpl) => (
                  <option key={tpl.value} value={tpl.value}>
                    {tpl.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#323232] mb-1 font-display">
                ¿Te respondió algo puntual recién? Pegalo para adaptar el mensaje:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={liveReplyInput}
                  onChange={(e) => setLiveReplyInput(e.target.value)}
                  placeholder="Ej: 'Puedo mañana jueves después de las 17 hs por casa'"
                  className="flex-1 rounded-xl border-2 border-[#323232] bg-white px-3 py-1.5 text-xs font-medium text-[#323232]"
                />
                <button
                  type="button"
                  onClick={handleAdaptWithReply}
                  className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#DFF4FF] px-3 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#29B8FF] shrink-0"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>Adaptar</span>
                </button>
                <button
                  type="button"
                  onClick={handleShortenMsg}
                  className="rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#323232] hover:bg-[#ECEAE2] shrink-0"
                  title="Resumir mensaje en 2-3 líneas directas"
                >
                  2-3 líneas
                </button>
              </div>
            </div>
          </div>

          {/* Textarea editable del mensaje */}
          <div className="rounded-xl border-2 border-[#323232] bg-white overflow-hidden">
            <textarea
              rows={4}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full border-0 bg-transparent p-3 text-xs text-[#323232] leading-relaxed font-medium focus:outline-hidden block"
            />
          </div>

          {/* Botonera de envío WhatsApp en 1 clic */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {onSendDirectWA && (
                <button
                  type="button"
                  onClick={handleSendWAInline}
                  disabled={isSendingWA || !hasValidPhone}
                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-4 py-2 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] transition shadow-[2px_2px_0px_#323232] disabled:opacity-50"
                >
                  <Send className={`h-3.5 w-3.5 ${isSendingWA ? 'animate-spin' : ''}`} />
                  <span>
                    {isSendingWA
                      ? 'Enviando...'
                      : whatsAppReady
                      ? '⚡ Enviar directo por WhatsApp Web'
                      : 'Enviar / Registrar por WhatsApp'}
                  </span>
                </button>
              )}

              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  if (onUpdateContact) {
                    const esNuevo =
                      contact.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
                      contact.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO';
                    onUpdateContact(contact.id, {
                      primerContactoEnviado: true,
                      estadoFlujo: esNuevo ? '1ER_MSJ_ENVIADO_SIN_RSP' : contact.estadoFlujo,
                    });
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-white px-3.5 py-2 text-xs font-bold font-display text-[#323232] hover:bg-[#ECEAE2] transition shadow-[2px_2px_0px_#323232]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Abrir wa.me</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(messageText);
                  setCopiedMsg(true);
                  setTimeout(() => setCopiedMsg(false), 2000);
                }}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-bold text-[#323232] hover:bg-[#ECEAE2]"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{copiedMsg ? '¡Copiado!' : 'Copiar texto'}</span>
              </button>
            </div>

            {sentSuccess && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100 border border-[#323232] px-3 py-1 rounded-lg">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mensaje enviado y estado actualizado
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
