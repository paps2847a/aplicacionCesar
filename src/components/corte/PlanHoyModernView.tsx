import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Coffee,
  Navigation,
  Send,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Lock,
  Unlock,
  FilePlus2,
  Camera,
  UserCheck,
  Home,
  ArrowRight,
  Copy,
  Check,
  X,
  User,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CandidateCard } from '../pipeline/CandidateCard';
import { PopurriDropdown } from '../common/PopurriDropdown';
import type {
  CorteResultado,
  BloqueAgendaRecomendado,
  ParadaRuta,
  Contact,
  VoiceProfile,
  ModalidadEncuentroAgenda,
  ModoMensajeTerrenoRuta,
  TipoRespuestaPropuestaAgenda,
} from '../../types';
import { crearEnlaceWhatsApp } from '../../domain/messaging/greetingsAndTone';
import {
  aplicarRespuestaPropuestaAgenda,
  generarMensajePropuestaBloqueAgenda,
  generarMensajeTerrenoParadaRuta,
} from '../../domain/routing/routingEngine';
import { marcarEntregaFichasExtra } from '../../domain/sync/dataMerging';

interface PlanHoyModernViewProps {
  corteResultado: CorteResultado;
  voiceProfile: VoiceProfile;
  whatsAppReady: boolean;
  onRefreshCorte: () => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => Promise<void> | void;
  onUpdateProfile?: (patch: Partial<VoiceProfile>) => void;
  onSendDirectWA?: (
    phone: string,
    text: string,
    contactId: string,
    nombre: string,
    barrio: string
  ) => Promise<boolean>;
  onJumpToCandidate?: (contactId: string) => void;
  onOpenScannerModal?: () => void;
}

const MODOS_MENSAJE_TERRENO: { value: ModoMensajeTerrenoRuta; label: string; requiresConfirm?: boolean }[] = [
  { value: 'CONFIRMACION_HOY', label: '1. Confirmar horario de hoy (Pre-recorrido)' },
  { value: 'RECORDATORIO_MANIANA_ANTES_SALIR', label: '2. Recordatorio a la mañana antes de salir' },
  { value: 'EN_CAMINO_HORA_CALC', label: '3. Estoy en camino (Hora calculada)', requiresConfirm: true },
  { value: 'LLEGANDO_2_MIN', label: '4. Estoy llegando (A 2 minutos de la puerta)' },
  { value: 'DEMORADO_10_MIN', label: '5. Aviso de demora (+10-15 min por parada previa)' },
  { value: 'YA_EN_CAFE_HUB', label: '6. Ya estoy instalado en el Café del circuito' },
  { value: 'NO_ESTABA_REPROGRAMAR', label: '7. Pasé por la puerta y no nos cruzamos (Reprogramar)' },
  { value: 'DISCULPAS_CANCELACION_REPROGRAMAR', label: '8. Disculpas por compromiso vencido + Reprogramar' },
];

export const PlanHoyModernView: React.FC<PlanHoyModernViewProps> = ({
  corteResultado,
  voiceProfile,
  whatsAppReady,
  onRefreshCorte,
  onUpdateContact,
  onUpdateProfile,
  onSendDirectWA,
  onJumpToCandidate,
  onOpenScannerModal,
}) => {
  const bloques = useMemo(() => {
    return (corteResultado.agendaSugeridaDias || [])
      .filter((b) => b.id !== 'agenda-sede-chile-1408')
      .map((b) => ({
        ...b,
        contactosIncluidos: b.contactosIncluidos.filter(
          (c) =>
            c.estadoFlujo !== 'PREFIERE_CAFE_HUB_O_SEDE' && c.situacion !== 'PREFIERE_PUNTO'
        ),
        paradasRutaSugerida: (b.paradasRutaSugerida || []).filter(
          (p) =>
            p.contact.estadoFlujo !== 'PREFIERE_CAFE_HUB_O_SEDE' &&
            p.contact.situacion !== 'PREFIERE_PUNTO'
        ),
      }))
      .filter((b) => b.contactosIncluidos.length > 0);
  }, [corteResultado.agendaSugeridaDias]);
  const alertasVencidos = useMemo(
    () =>
      (corteResultado.alertasPendientesVencidos || []).filter(
        (c) =>
          c.estadoFlujo !== 'PREFIERE_CAFE_HUB_O_SEDE' && c.situacion !== 'PREFIERE_PUNTO'
      ),
    [corteResultado.alertasPendientesVencidos]
  );

  // Por defecto abrimos en "1. Planificador de Propuestas" para que el usuario envíe propuestas
  // y marque "✓ Confirmó Cita"; en "2. Hoja de Ruta en Terreno" solo aparecen las citas explícitamente confirmadas.
  const [activeSubMode, setActiveSubMode] = useState<'planificador' | 'terreno'>(() => {
    try {
      const saved = sessionStorage.getItem('popurri_plan_submode_v1');
      if (saved === 'planificador' || saved === 'terreno') return saved;
    } catch {
      // ignore
    }
    return 'planificador';
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('popurri_plan_submode_v1', activeSubMode);
    } catch {
      // ignore
    }
  }, [activeSubMode]);

  const diasUnicos = useMemo(() => {
    const list: string[] = [];
    for (const b of bloques) {
      if (!list.includes(b.diaEtiqueta)) {
        list.push(b.diaEtiqueta);
      }
    }
    return list;
  }, [bloques]);

  const [selectedDia, setSelectedDia] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem('popurri_plan_selected_dia_v1');
      if (saved && (saved === 'Todos' || diasUnicos.includes(saved))) return saved;
    } catch {
      // ignore
    }
    return diasUnicos[0] || 'Todos';
  });
  const [expandedBloqueId, setExpandedBloqueId] = useState<string | null>(() => {
    try {
      const saved = sessionStorage.getItem('popurri_plan_expanded_bloque_v1');
      if (saved && bloques.some((b) => b.id === saved)) return saved;
    } catch {
      // ignore
    }
    return bloques[0]?.id || null;
  });

  useEffect(() => {
    if (selectedDia !== 'Todos' && !diasUnicos.includes(selectedDia)) {
      setSelectedDia(diasUnicos[0] || 'Todos');
    } else {
      try {
        sessionStorage.setItem('popurri_plan_selected_dia_v1', selectedDia);
      } catch {
        // ignore
      }
    }
  }, [diasUnicos, selectedDia]);

  useEffect(() => {
    try {
      if (expandedBloqueId) {
        sessionStorage.setItem('popurri_plan_expanded_bloque_v1', expandedBloqueId);
      }
    } catch {
      // ignore
    }
  }, [expandedBloqueId]);

  // Overrides persistentes por bloque en el Planificador (modalidad y café único elegido)
  const [bloqueModalidadOverride, setBloqueModalidadOverride] = useState<
    Record<string, ModalidadEncuentroAgenda>
  >(() => {
    try {
      const raw = localStorage.getItem('popurri_bloque_modalidad_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [bloqueCafeOverride, setBloqueCafeOverride] = useState<
    Record<string, { nombre: string; direccion: string }>
  >(() => {
    try {
      const raw = localStorage.getItem('popurri_bloque_cafe_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('popurri_bloque_modalidad_v1', JSON.stringify(bloqueModalidadOverride));
    } catch {
      // ignore
    }
  }, [bloqueModalidadOverride]);

  useEffect(() => {
    try {
      localStorage.setItem('popurri_bloque_cafe_v1', JSON.stringify(bloqueCafeOverride));
    } catch {
      // ignore
    }
  }, [bloqueCafeOverride]);

  const getBloqueOverrideKey = (b: BloqueAgendaRecomendado): string =>
    `${b.fechaClave || b.diaEtiqueta}_${(b.barrio || '').toLowerCase()}`;
  const getModalidadOver = (b: BloqueAgendaRecomendado): ModalidadEncuentroAgenda | undefined =>
    bloqueModalidadOverride[b.id] || bloqueModalidadOverride[getBloqueOverrideKey(b)];
  const getCafeOver = (
    b: BloqueAgendaRecomendado
  ): { nombre: string; direccion: string } | undefined =>
    bloqueCafeOverride[b.id] || bloqueCafeOverride[getBloqueOverrideKey(b)];

  // Mensajes editables por contacto en el Planificador
  const [propuestaTexts, setPropuestaTexts] = useState<Record<string, string>>({});
  // Snapshot de horarios y textos por bloque al iniciar el envío de propuestas para evitar que al enviar al 1er vecino salten los horarios de los demás
  const [lockedBloqueSnapshots, setLockedBloqueSnapshots] = useState<
    Record<
      string,
      {
        franjaHoraria: string;
        paradasHoras: Record<string, string>;
        textosPorContacto: Record<string, string>;
      }
    >
  >({});
  // Reprogramación / Edición de planificación por contacto (día, hora puntual, dirección, modalidad, café)
  const [reprogFecha, setReprogFecha] = useState<Record<string, string>>({});
  const [reprogHora, setReprogHora] = useState<Record<string, string>>({});
  const [reprogDireccion, setReprogDireccion] = useState<Record<string, string>>({});
  const [reprogModalidad, setReprogModalidad] = useState<
    Record<string, 'PUERTA_A_PUERTA' | 'CAFE_HUB'>
  >({});
  const [reprogCafe, setReprogCafe] = useState<Record<string, string>>({});

  // Estado por parada en la Hoja de Ruta en Terreno
  const [paradaModoMsj, setParadaModoMsj] = useState<Record<string, ModoMensajeTerrenoRuta>>({});
  const [paradaTextoEditado, setParadaTextoEditado] = useState<Record<string, string>>({});
  const [paradaUnlockEnCamino, setParadaUnlockEnCamino] = useState<Record<string, boolean>>({});
  // Punto 9 y Punto 15 Calibración: Corrimiento de horario en cascada (+10/+15 min por demora o -9 min si alguien no estaba)
  const [paradaTimeAdjustMin, setParadaTimeAdjustMin] = useState<Record<string, number>>({});
  // Punto 10 y Punto 12 Calibración: Pestañas desplegables "Aprovechar viaje" por bloque
  const [openAprovecharSinDir, setOpenAprovecharSinDir] = useState<Record<string, boolean>>({});
  const [openAprovecharFichas, setOpenAprovecharFichas] = useState<Record<string, boolean>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [countdownSending, setCountdownSending] = useState<{
    contactId: string;
    secondsLeft: number;
    timer: any;
  } | null>(null);
  const [sentSuccessIds, setSentSuccessIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [editingConfirmedIds, setEditingConfirmedIds] = useState<Record<string, boolean>>({});
  const [showVencidosSection, setShowVencidosSection] = useState<boolean>(false);
  const [syncingCalendarRoute, setSyncingCalendarRoute] = useState<boolean>(false);
  const [calendarQuickLinks, setCalendarQuickLinks] = useState<{ summary: string; url: string }[]>([]);
  const [modalContactId, setModalContactId] = useState<string | null>(null);
  const [fichasPickerParadaId, setFichasPickerParadaId] = useState<string | null>(null);

  const modalContact = useMemo(() => {
    if (!modalContactId) return null;
    for (const b of bloques) {
      const inB = b.contactosIncluidos.find((c) => c.id === modalContactId);
      if (inB) return inB;
      const inP = (b.paradasRutaSugerida || []).find((p) => p.contact.id === modalContactId);
      if (inP) return inP.contact;
    }
    return alertasVencidos.find((c) => c.id === modalContactId) || null;
  }, [modalContactId, bloques, alertasVencidos]);

  const handleQuitarDelPlanificador = async (contact: Contact) => {
    const esRetiro = contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS';
    await onUpdateContact(contact.id, {
      rsp: 'Sí',
      adhirio: esRetiro ? 'Sí' : 'Pendiente',
      diasEncuentro: '',
      horarioEncuentro: '',
      horaInicio: '',
      horaFin: '',
      retiroConfirmado: false,
      estadoFlujo: esRetiro ? 'PENDIENTE_RETIRO_FICHAS' : 'RESPONDIO_FALTA_DNI_O_ZONA',
      comentario: contact.comentario || '',
    });
    triggerToast(
      `✓ #${contact.id} ${contact.primerNombre || contact.nombre}: Quitado del Planificador`
    );
  };

  const handleMarcarReprogramacionVencido = async (contact: Contact) => {
    const esRetiro = contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS';
    await onUpdateContact(contact.id, {
      rsp: 'Sí',
      adhirio: esRetiro ? 'Sí' : 'Pendiente',
      diasEncuentro: '',
      horarioEncuentro: '',
      horaInicio: '',
      horaFin: '',
      retiroConfirmado: false,
      estadoFlujo: esRetiro ? 'PENDIENTE_RETIRO_FICHAS' : 'RESPONDIO_FALTA_DNI_O_ZONA',
      comentario: contact.comentario || '',
    });
    triggerToast(
      `✓ #${contact.id} ${contact.primerNombre || contact.nombre}: Movido a espera de nuevo día/hora`
    );
  };

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const abrirEdicionPlanContacto = (
    contact: Contact,
    bloque: BloqueAgendaRecomendado,
    paradaRef?: ParadaRuta
  ) => {
    const com = contact.comentario || '';
    const horaEnCom =
      contact.horaInicio ||
      contact.horarioEncuentro ||
      com.match(/a\s+las\s+(\d{1,2}:\d{2})/i)?.[1];
    const cafeEnCom = com.match(/Caf[eé]\s*Hub:\s*([^\])·]+)/i)?.[1]?.trim();
    const esCafeActual =
      /caf[eé]\s*hub/i.test(com) ||
      (!/puerta\s+a\s+puerta/i.test(com) &&
        (getModalidadOver(bloque) || bloque.modalidad) === 'CAFE_HUB');
    const cafeDefault =
      cafeEnCom ||
      (getCafeOver(bloque)
        ? `${getCafeOver(bloque)!.nombre} (${getCafeOver(bloque)!.direccion.split(',')[0]})`
        : bloque.cafesHubOpciones?.[0]
        ? `${bloque.cafesHubOpciones[0].nombre} (${
            bloque.cafesHubOpciones[0].direccion.split(',')[0]
          })`
        : '');

    setReprogFecha((prev) => ({
      ...prev,
      [contact.id]:
        contact.diasEncuentro ||
        contact.fechasMencionadas[0] ||
        bloque.fechaClave ||
        prev[contact.id] ||
        '',
    }));
    setReprogHora((prev) => ({
      ...prev,
      [contact.id]:
        horaEnCom || paradaRef?.horaLlegada || bloque.horaInicioCalculada || prev[contact.id] || '',
    }));
    setReprogDireccion((prev) => ({
      ...prev,
      [contact.id]: contact.calleOCruce || prev[contact.id] || '',
    }));
    setReprogModalidad((prev) => ({
      ...prev,
      [contact.id]: esCafeActual ? 'CAFE_HUB' : 'PUERTA_A_PUERTA',
    }));
    if (cafeDefault) {
      setReprogCafe((prev) => ({
        ...prev,
        [contact.id]: cafeDefault,
      }));
    }
    setEditingConfirmedIds((prev) => ({
      ...prev,
      [contact.id]: true,
    }));
  };

  const bloquesFiltrados = useMemo(() => {
    if (selectedDia === 'Todos') return bloques;
    return bloques.filter((b) => b.diaEtiqueta === selectedDia);
  }, [bloques, selectedDia]);

  // Determina si un vecino fue explícitamente confirmado 1-a-1 para salir a la Hoja de Ruta en Terreno.
  const esConfirmadoParaHojaDeRuta = (contact: Contact): boolean => {
    if (contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS') {
      return Boolean(contact.retiroConfirmado) || Boolean(paradaUnlockEnCamino[contact.id]);
    }
    const com = contact.comentario || '';
    const tieneTagConfirmado =
      /\[confirmado\s+1-a-1|visita\s+confirmada|encuentro\s+confirmado\s+en\s+caf[eé]\s*hub|confirm[oó]\s+caf[eé]\s*hub|\[declin[oó]\s+caf[eé]\s*hub/i.test(
        com
      );
    if (
      contact.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
      contact.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
      tieneTagConfirmado
    ) {
      return true;
    }
    if (contact.alertaVencido?.activa) {
      return false;
    }
    if (paradaUnlockEnCamino[contact.id]) {
      return true;
    }
    return false;
  };

  const totalConfirmadosDiaSeleccionado = useMemo(() => {
    const ids = new Set<string>();
    for (const b of bloquesFiltrados) {
      for (const c of b.contactosIncluidos) {
        if (esConfirmadoParaHojaDeRuta(c)) {
          ids.add(c.id);
        }
      }
    }
    return ids.size;
  }, [bloquesFiltrados, paradaUnlockEnCamino]);

  const bloquesParaMostrar = useMemo(() => {
    if (activeSubMode === 'planificador') {
      return bloquesFiltrados;
    }
    return bloquesFiltrados.filter((b) =>
      b.contactosIncluidos.some((c) => esConfirmadoParaHojaDeRuta(c))
    );
  }, [activeSubMode, bloquesFiltrados, paradaUnlockEnCamino]);

  const handleQuitarConfirmacionPlanificador = async (contact: Contact) => {
    setParadaUnlockEnCamino((prev) => {
      const next = { ...prev };
      delete next[contact.id];
      return next;
    });
    const esRetiro = contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS';
    await onUpdateContact(contact.id, {
      estadoFlujo: esRetiro ? 'PENDIENTE_RETIRO_FICHAS' : 'PASO_DATOS_FALTA_CONFIRMAR',
      retiroConfirmado: false,
      comentario: contact.comentario || '',
    });
    setEditingConfirmedIds((prev) => ({
      ...prev,
      [contact.id]: false,
    }));
    triggerToast(
      `↺ ${contact.primerNombre || contact.nombre}: Quitado de Hoja de Ruta en Terreno (vuelve a Por Confirmar)`
    );
  };

  const obtenerTextoPropuestaContacto = (contact: Contact, bloque: BloqueAgendaRecomendado) => {
    const key = `${bloque.id}_${contact.id}`;
    if (propuestaTexts[key] !== undefined) return propuestaTexts[key];
    const lockedText = lockedBloqueSnapshots[bloque.id]?.textosPorContacto?.[contact.id];
    if (lockedText !== undefined) return lockedText;
    const modOver = getModalidadOver(bloque);
    const cafeOver = getCafeOver(bloque);
    return generarMensajePropuestaBloqueAgenda(contact, bloque, voiceProfile, {
      modalidad: modOver,
      cafeHubNombre: cafeOver?.nombre,
      cafeHubDireccion: cafeOver?.direccion,
    });
  };

  const congelarSnapshotBloqueAlEnviar = (bloque: BloqueAgendaRecomendado) => {
    const paradasHoras: Record<string, string> = {};
    for (const p of bloque.paradasRutaSugerida || []) {
      if (p.horaLlegada) {
        paradasHoras[p.contact.id] = p.horaLlegada;
      }
    }
    const textosPorContacto: Record<string, string> = {};
    const nuevosPropuestaTexts: Record<string, string> = {};
    for (const c of bloque.contactosIncluidos) {
      const k = `${bloque.id}_${c.id}`;
      const txt = obtenerTextoPropuestaContacto(c, bloque);
      textosPorContacto[c.id] = txt;
      nuevosPropuestaTexts[k] = txt;
    }
    setLockedBloqueSnapshots((prev) => ({
      ...prev,
      [bloque.id]: prev[bloque.id] || {
        franjaHoraria: bloque.franjaHoraria,
        paradasHoras,
        textosPorContacto,
      },
    }));
    setPropuestaTexts((prev) => ({
      ...nuevosPropuestaTexts,
      ...prev,
    }));
  };

  const limpiarSnapshotBloque = (bloqueId: string) => {
    setLockedBloqueSnapshots((prev) => {
      if (!prev[bloqueId]) return prev;
      const next = { ...prev };
      delete next[bloqueId];
      return next;
    });
    setPropuestaTexts((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${bloqueId}_`)) delete next[k];
      }
      return next;
    });
  };

  const obtenerModoEfectivoParada = (p: ParadaRuta): ModoMensajeTerrenoRuta => {
    const elegido = paradaModoMsj[p.contact.id];
    if (elegido) return elegido;
    if (p.vencidaSinAdherir) return 'DISCULPAS_CANCELACION_REPROGRAMAR';
    if (!p.confirmadoEnLista1a1 && !paradaUnlockEnCamino[p.contact.id]) {
      return 'CONFIRMACION_HOY';
    }
    return 'EN_CAMINO_HORA_CALC';
  };

  const sumarMinutosHoraUI = (hhmm: string, deltaMin: number): string => {
    if (!hhmm || !deltaMin) return hhmm;
    const [hStr, mStr] = hhmm.split(':');
    const total = Math.max(
      0,
      Math.min(23 * 60 + 59, (Number(hStr) || 0) * 60 + (Number(mStr) || 0) + deltaMin)
    );
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(
      2,
      '0'
    )}`;
  };

  const obtenerParadaConAjusteEnVivo = (p: ParadaRuta): ParadaRuta => {
    const delta = paradaTimeAdjustMin[p.contact.id] || 0;
    if (!delta) return p;
    return {
      ...p,
      horaSalida: sumarMinutosHoraUI(p.horaSalida, delta),
      horaLlegada: sumarMinutosHoraUI(p.horaLlegada, delta),
      horaFinVisita: sumarMinutosHoraUI(p.horaFinVisita, delta),
    };
  };

  const obtenerTextoEfectivoParada = (p: ParadaRuta, bloque: BloqueAgendaRecomendado): string => {
    const modo = obtenerModoEfectivoParada(p);
    const key = `${p.contact.id}_${modo}`;
    if (paradaTextoEditado[key] !== undefined) return paradaTextoEditado[key];
    const cafeOver = getCafeOver(bloque);
    const cafePrincipal = cafeOver || bloque.cafesHubOpciones?.[0];
    const cafeTexto = cafePrincipal
      ? `${cafePrincipal.nombre} (${cafePrincipal.direccion.split(',')[0]})`
      : undefined;
    const paradaAjustada = obtenerParadaConAjusteEnVivo(p);
    return generarMensajeTerrenoParadaRuta(paradaAjustada, modo, voiceProfile, cafeTexto);
  };

  // Punto 9 Calibración: Corrimiento en vivo en la calle (+10 min / +15 min en cascada)
  const handleCascadeDelayParadas = (
    paradasBloque: ParadaRuta[],
    fromIdx: number,
    deltaMin: 10 | 15
  ) => {
    const siguientes = paradasBloque.slice(fromIdx + 1);
    const afectados = siguientes.length > 0 ? siguientes : [paradasBloque[fromIdx]].filter(Boolean);
    if (afectados.length === 0) return;

    setParadaTimeAdjustMin((prev) => {
      const next = { ...prev };
      for (const p of afectados) {
        next[p.contact.id] = (next[p.contact.id] || 0) + deltaMin;
      }
      return next;
    });
    setParadaModoMsj((prev) => {
      const next = { ...prev };
      for (const p of afectados) {
        next[p.contact.id] = 'DEMORADO_10_MIN';
      }
      return next;
    });
    setParadaTextoEditado((prev) => {
      const next = { ...prev };
      for (const p of afectados) {
        delete next[`${p.contact.id}_DEMORADO_10_MIN`];
      }
      return next;
    });
    triggerToast(
      `⏱️ Horario corrido +${deltaMin} min en cascada para ${afectados.length} vecino(s) y aviso de demora habilitado.`
    );
  };

  // Punto 15 Calibración: Acción rápida "🚪 No estaba / Reprogramar" en 2. Ruta
  const handleNoEstabaEnRuta = async (
    parada: ParadaRuta,
    paradasBloque: ParadaRuta[],
    idxActual: number,
    bloque: BloqueAgendaRecomendado
  ) => {
    const c = parada.contact;
    const cafeOver = getCafeOver(bloque);
    const cafePrincipal = cafeOver || bloque.cafesHubOpciones?.[0];
    const cafeTexto = cafePrincipal
      ? `${cafePrincipal.nombre} (${cafePrincipal.direccion.split(',')[0]})`
      : undefined;
    const msgNoEstaba = generarMensajeTerrenoParadaRuta(
      obtenerParadaConAjusteEnVivo(parada),
      'NO_ESTABA_REPROGRAMAR',
      voiceProfile,
      cafeTexto
    );

    const otrasFechasVecino = (c.fechasMencionadas || []).filter((f) => f !== bloque.fechaClave);
    const manianaDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const manianaDDMM = `${String(manianaDate.getDate()).padStart(2, '0')}/${String(
      manianaDate.getMonth() + 1
    ).padStart(2, '0')}`;
    const proximoDia = otrasFechasVecino[0] || manianaDDMM;

    const comentarioBase = (c.comentario || '')
      .replace(/Visita confirmada Puerta a Puerta[^\n·]*/gi, '')
      .replace(/Encuentro confirmado en Caf[eé] Hub[^\n·]*/gi, '')
      .replace(/\[Confirmado 1-a-1[^\]]*\]/gi, '')
      .replace(/^\s*[·—-]\s*|\s*[·—-]\s*$/g, '')
      .trim();

    await onUpdateContact(c.id, {
      estadoFlujo: 'PASO_DATOS_FALTA_CONFIRMAR',
      diasEncuentro: proximoDia,
      comentario: [comentarioBase, `No estaba en puerta (${bloque.fechaClave}) · Reprogramar para ${proximoDia}`]
        .filter(Boolean)
        .join(' · '),
    });

    // Adelantar 9 min las paradas siguientes de ese bloque
    const siguientes = paradasBloque.slice(idxActual + 1);
    if (siguientes.length > 0) {
      setParadaTimeAdjustMin((prev) => {
        const next = { ...prev };
        for (const p of siguientes) {
          next[p.contact.id] = (next[p.contact.id] || 0) - 9;
        }
        return next;
      });
    }

    const phone = c.tel || c.telRaw || c.telWA || '';
    if (onSendDirectWA && phone && whatsAppReady) {
      handleSendWA(c, msgNoEstaba);
    } else if (phone) {
      window.open(crearEnlaceWhatsApp(phone, msgNoEstaba), '_blank', 'noopener,noreferrer');
    }

    triggerToast(
      `🚪 ${c.primerNombre || c.nombre} volvió a "4. Falta Confirmar" (${proximoDia})${
        siguientes.length > 0 ? ` y se adelantaron 9 min las ${siguientes.length} paradas siguientes.` : '.'
      }`
    );
  };

  // Punto 16 Calibración: En Modo Lluvia, postergar en 1 clic recorridos a pie al próximo día
  const handlePostergarRutaPorLluvia = async (bloque: BloqueAgendaRecomendado) => {
    const manianaDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const manianaDDMM = `${String(manianaDate.getDate()).padStart(2, '0')}/${String(
      manianaDate.getMonth() + 1
    ).padStart(2, '0')}`;
    for (const c of bloque.contactosIncluidos) {
      const otrasFechas = (c.fechasMencionadas || []).filter((f) => f !== bloque.fechaClave);
      const proxFecha = otrasFechas[0] || manianaDDMM;
      await onUpdateContact(c.id, {
        diasEncuentro: proxFecha,
        estadoFlujo: 'PASO_DATOS_FALTA_CONFIRMAR',
      });
    }
    triggerToast(
      `🌧️ Recorrido a pie en ${bloque.barrio} (${bloque.contactosIncluidos.length} vecinos) postergado al próximo día por lluvia.`
    );
  };

  const handleConsolidarRespuestaPlanificador = async (
    contact: Contact,
    bloque: BloqueAgendaRecomendado,
    respuesta: TipoRespuestaPropuestaAgenda,
    paradaRef?: ParadaRuta
  ) => {
    const modOver = getModalidadOver(bloque);
    const cafeOver = getCafeOver(bloque);
    const bloqueConOverrides: BloqueAgendaRecomendado = {
      ...bloque,
      modalidad: modOver || bloque.modalidad,
      cafeElegidoUsuario: cafeOver
        ? `${cafeOver.nombre} (${cafeOver.direccion.split(',')[0]})`
        : bloque.cafeElegidoUsuario,
    };

    const horaPuntualContacto =
      contact.horaInicio && !contact.horaFin
        ? contact.horaInicio
        : /^\d{1,2}:\d{2}(?:\s*hs)?$/i.test((contact.horarioEncuentro || '').trim())
        ? (contact.horarioEncuentro || '').trim().replace(/\s*hs$/i, '')
        : '';
    const horaSugeridaParada =
      reprogHora[contact.id]?.trim() ||
      horaPuntualContacto ||
      paradaRef?.horaLlegada ||
      bloque.paradasRutaSugerida?.find((p) => p.contact.id === contact.id)?.horaLlegada;

    const actualizado = aplicarRespuestaPropuestaAgenda(
      contact,
      bloqueConOverrides,
      respuesta,
      {
        nuevaFecha: reprogFecha[contact.id],
        nuevoHorarioPuntual: horaSugeridaParada,
        nuevaDireccion: reprogDireccion[contact.id],
        nuevaModalidad: reprogModalidad[contact.id],
        nuevoCafe: reprogCafe[contact.id],
        confirmarEncuentro: true,
        mantenerComentarioInterno: true,
      },
      voiceProfile
    );

    const modalidadElegida =
      reprogModalidad[contact.id] ||
      (respuesta === 'DECLINO_CAFE_PASA_PUERTA_A_PUERTA'
        ? 'PUERTA_A_PUERTA'
        : respuesta === 'PASA_A_CAFE_HUB'
        ? 'CAFE_HUB'
        : undefined);
    if (modalidadElegida) {
      setBloqueModalidadOverride((prev) => ({
        ...prev,
        [bloque.id]: modalidadElegida,
        [getBloqueOverrideKey(bloque)]: modalidadElegida,
      }));
    }

    await onUpdateContact(contact.id, {
      rsp: actualizado.rsp,
      adhirio: actualizado.adhirio,
      estadoFlujo: actualizado.estadoFlujo,
      diasEncuentro: actualizado.diasEncuentro,
      horaInicio: actualizado.horaInicio,
      horaFin: actualizado.horaFin,
      horarioEncuentro: actualizado.horarioEncuentro,
      retiroConfirmado: actualizado.retiroConfirmado,
      comentario: actualizado.comentario,
      calleOCruce: actualizado.calleOCruce,
    });

    // Limpiar texto cacheado de parada para que refleje el nuevo horario/modalidad al instante
    setParadaTextoEditado((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${contact.id}_`)) delete next[k];
      }
      return next;
    });

    triggerToast(
      `✓ ${contact.primerNombre || contact.nombre}: ${
        respuesta === 'CONFIRMO_PROPUESTA'
          ? 'Encuentro confirmado (listo en Hoja de Ruta y en Candidatos)'
          : respuesta === 'DECLINO_CAFE_PASA_PUERTA_A_PUERTA'
          ? 'Confirmado Puerta a Puerta en domicilio'
          : respuesta === 'PASA_A_CAFE_HUB'
          ? 'Confirmado en Café del circuito'
          : 'Planificación actualizada y guardada'
      }`
    );
  };

  const handleSendWA = (
    contact: Contact,
    text: string,
    onAfterSent?: () => Promise<void> | void
  ) => {
    const phone = contact.tel || contact.telRaw || contact.telWA || '';
    if (!phone || !onSendDirectWA) return;

    // Si ya hay una cuenta regresiva activa para este contacto, el clic funciona como BOTÓN DE ARREPENTIMIENTO
    if (countdownSending && countdownSending.contactId === contact.id) {
      if (countdownSending.timer) clearInterval(countdownSending.timer);
      setCountdownSending(null);
      triggerToast('⏹️ Envío cancelado.');
      return;
    }

    // Iniciar cuenta regresiva de 3 segundos para confirmación / arrepentimiento
    let seconds = 3;
    const timer = setInterval(async () => {
      seconds -= 1;
      if (seconds > 0) {
        setCountdownSending({ contactId: contact.id, secondsLeft: seconds, timer });
      } else {
        clearInterval(timer);
        setCountdownSending(null);
        setSendingId(contact.id);
        try {
          const ok = await onSendDirectWA(
            phone,
            text,
            contact.id,
            contact.primerNombre || contact.nombre || `Contacto #${contact.id}`,
            contact.barrio
          );
          if (ok) {
            setSentSuccessIds((prev) => new Set(prev).add(contact.id));
            if (onAfterSent) {
              await onAfterSent();
            } else {
              triggerToast(`✅ Mensaje enviado a ${contact.primerNombre || contact.nombre}`);
            }
          }
        } finally {
          setSendingId(null);
        }
      }
    }, 1000);

    setCountdownSending({ contactId: contact.id, secondsLeft: 3, timer });
  };

  const handleMarkFichasParada = async (contact: Contact, cant: 1 | 2 | 3 | 4 | 5) => {
    const xCant: 'X1' | 'X2' | 'X3' | 'X4' | 'X5' =
      cant === 1
        ? 'X1'
        : cant === 3
        ? 'X3'
        : cant === 4
        ? 'X4'
        : cant === 5
        ? 'X5'
        : 'X2';
    const actualizado = marcarEntregaFichasExtra(contact, xCant, Date.now());
    await onUpdateContact(contact.id, {
      rsp: actualizado.rsp,
      adhirio: actualizado.adhirio,
      estadoFlujo: 'PENDIENTE_RETIRO_FICHAS',
      comentario: actualizado.comentario,
      fechaAdhesion: actualizado.fechaAdhesion,
    });
    setFichasPickerParadaId(null);
    triggerToast(
      `✓ ${contact.primerNombre || contact.nombre}: Firmó y se dejaron X${cant} fichas (retiro 1 sem)`
    );
  };

  const handleSyncConfirmedRouteToCalendar = async () => {
    const bloquesConConfirmados = bloquesFiltrados.filter((b) =>
      b.contactosIncluidos.some((c) => esConfirmadoParaHojaDeRuta(c))
    );
    if (bloquesConConfirmados.length === 0) {
      triggerToast('⚠️ No hay citas confirmadas 1-a-1 en este día para bloquear en Calendar.');
      return;
    }

    setSyncingCalendarRoute(true);
    try {
      const eventsPayload = bloquesConConfirmados.map((b) => {
        const confirmados = b.contactosIncluidos.filter((c) => esConfirmadoParaHojaDeRuta(c));
        const paradasConf = (b.paradasRutaSugerida || []).filter((p) =>
          esConfirmadoParaHojaDeRuta(p.contact)
        );
        const mRange = (b.franjaHoraria || '').match(/(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2})/);
        const startHHMM =
          (confirmados.length === 1 && confirmados[0]?.horaInicio) ||
          paradasConf[0]?.horaLlegada ||
          paradasConf[0]?.horaSalida ||
          (mRange ? mRange[1] : '11:00');
        const rawEndHHMM =
          paradasConf[paradasConf.length - 1]?.horaFinVisita || (mRange ? mRange[2] : '13:00');
        const padHHMM = (s: string) => {
          const [hh, mm] = s.split(':');
          return `${String(hh || '11').padStart(2, '0')}:${String(mm || '00').padStart(2, '0')}`;
        };
        const sTime = padHHMM(startHHMM);
        const [sH, sM] = sTime.split(':').map(Number);
        const [eH, eM] = padHHMM(rawEndHHMM).split(':').map(Number);
        const sTotalMin = sH * 60 + sM;
        const eTotalMin = Math.max(sTotalMin + 20, eH * 60 + eM);
        const eTime = `${String(Math.floor(eTotalMin / 60)).padStart(2, '0')}:${String(
          eTotalMin % 60
        ).padStart(2, '0')}`;

        // Extraer DD/MM de diaEtiqueta (ej: "MAÑANA · Martes 03/11")
        const mDate = (b.diaEtiqueta || '').match(/(\d{1,2})\/(\d{1,2})/);
        const yearNow = new Date().getFullYear();
        const fechaISO = mDate
          ? `${yearNow}-${String(mDate[2]).padStart(2, '0')}-${String(mDate[1]).padStart(2, '0')}`
          : new Date().toISOString().slice(0, 10);

        const descLines = confirmados.map((c) => {
          const p = paradasConf.find((pr) => pr.contact.id === c.id);
          const hora = c.horaInicio ? `${c.horaInicio} hs: ` : p ? `${p.horaLlegada} hs: ` : '';
          return `• ${hora}#${c.id} ${c.nombreCompletoCorregido || c.nombre} (${c.calleOCruce || c.barrio})`;
        });

        const modEfectiva = getModalidadOver(b) || b.modalidad;
        const locationEfectiva =
          confirmados.length === 1 && confirmados[0].calleOCruce
            ? `${confirmados[0].calleOCruce} — ${b.barrio}, CABA`
            : paradasConf.length === 1 && paradasConf[0].destinoNombre
            ? paradasConf[0].destinoNombre
            : modEfectiva === 'PUERTA_A_PUERTA'
            ? confirmados
                .map((c) => c.calleOCruce)
                .filter(Boolean)
                .join(' → ') || `${b.barrio}, CABA`
            : b.puntoEncuentroODireccion || `${b.barrio}, CABA`;

        return {
          id: `route-${fechaISO}-${b.barrio.toLowerCase().replace(/\s+/g, '-')}`,
          summary:
            confirmados.length === 1
              ? `🏠 Visita #${confirmados[0].id} ${
                  confirmados[0].nombreCompletoCorregido || confirmados[0].nombre
                } (${confirmados[0].calleOCruce || b.barrio})`
              : `🏠 Recorrido Puerta a Puerta: ${b.barrio} (${confirmados.length} vecinos confirmados)`,
          location: locationEfectiva,
          description: `Ruta Casa x Casa en ${b.barrio}:\n${descLines.join('\n')}`,
          fecha: b.diaEtiqueta,
          fechaISO,
          startTime: sTime,
          endTime: eTime,
          startIso: `${fechaISO}T${sTime}:00-03:00`,
          endIso: `${fechaISO}T${eTime}:00-03:00`,
        };
      });

      const res = await fetch('/api/calendar/sync-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: eventsPayload }),
      });
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.templateUrls)) {
          setCalendarQuickLinks(data.templateUrls);
        }
        onRefreshCorte();
        triggerToast(
          data.method === 'gcalendar_cli' || data.method === 'apps_script'
            ? `📅 ¡${eventsPayload.length} bloque(s) de ruta agendados en Google Calendar y bloqueados en la App!`
            : `📅 ¡${eventsPayload.length} bloque(s) bloqueados en la Agenda de la App! Podés abrirlos en 1 clic en Google Calendar.`
        );
      } else {
        triggerToast(`⚠️ ${data.error || 'No se pudo sincronizar la ruta con el calendario'}`);
      }
    } catch {
      triggerToast('⚠️ Error de red al sincronizar la ruta con el calendario.');
    } finally {
      setSyncingCalendarRoute(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 overflow-x-clip px-2.5 sm:px-6 py-3 sm:py-5 space-y-4">
      {/* 1. Cabecera Compacta con Conmutador de Modo + Selector Desplegable de Día */}
      <div className="rounded-2xl border-2 border-[#323232] bg-white p-3.5 sm:p-4 shadow-[4px_4px_0px_#323232] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold font-display text-[#323232]">
              Planificador &amp; Hoja de Ruta
            </h2>
            <span className="rounded-lg bg-[#FFF06B] px-2 py-0.5 text-[11px] font-bold font-display text-[#323232] border border-[#323232]">
              {corteResultado.fechaHoraActualEtiqueta || 'Hoy'}
            </span>
          </div>

          {/* Switch en 1 fila (Mobile y Desktop) */}
          <div className="grid grid-cols-2 sm:flex items-center rounded-xl border-2 border-[#323232] bg-[#ECEAE2] p-1 gap-1 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveSubMode('planificador')}
              className={`flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold font-display transition cursor-pointer ${
                activeSubMode === 'planificador'
                  ? 'bg-[#FFF06B] text-[#323232] border border-[#323232] shadow-[2px_2px_0px_#323232]'
                  : 'text-[#5A5955] hover:text-[#323232]'
              }`}
            >
              <span>📋 1. Propuestas</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubMode('terreno')}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold font-display transition cursor-pointer ${
                activeSubMode === 'terreno'
                  ? 'bg-[#29B8FF] text-[#323232] border border-[#323232] shadow-[2px_2px_0px_#323232]'
                  : 'text-[#5A5955] hover:text-[#323232]'
              }`}
            >
              <span>🚶‍♂️ 2. Ruta</span>
              <span
                className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold border border-[#323232] ${
                  totalConfirmadosDiaSeleccionado > 0
                    ? 'bg-emerald-200 text-emerald-950'
                    : 'bg-white text-[#5A5955]'
                }`}
              >
                {totalConfirmadosDiaSeleccionado}
              </span>
            </button>
          </div>
        </div>

        {/* Barra Compacta: Selector de Día (Dropdown) + Calendar + Recalcular */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#323232]/15">
          <div className="flex items-center gap-2 flex-1 min-w-[210px] sm:flex-initial">
            <label className="text-xs font-bold font-display uppercase text-[#5A5955] shrink-0">
              Día:
            </label>
            <div className="flex-1 sm:w-64 min-w-0">
              <PopurriDropdown
                value={selectedDia}
                onChange={(val) => setSelectedDia(val)}
                headerLabel="Elegir día del recorrido:"
                menuWidth={280}
                options={[
                  ...diasUnicos.map((dia) => ({
                    value: dia,
                    label: /hoy/i.test(dia) ? `🔴 ${dia}` : dia,
                  })),
                  { value: 'Todos', label: `📅 Todos los días (${bloques.length} circuitos)` },
                ]}
                triggerClassName="w-full flex items-center justify-between gap-2 rounded-xl border-2 border-[#323232] bg-[#FFF06B]/60 px-3 py-1.5 text-xs font-bold font-display text-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-[#FFF06B] transition cursor-pointer"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {totalConfirmadosDiaSeleccionado > 0 && (
              <button
                type="button"
                onClick={handleSyncConfirmedRouteToCalendar}
                disabled={syncingCalendarRoute}
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-emerald-200 px-3 py-1.5 text-xs font-bold font-display text-emerald-950 hover:bg-emerald-300 transition shadow-[2px_2px_0px_#323232] cursor-pointer"
                title="Bloquear este recorrido confirmado en Calendar"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {syncingCalendarRoute
                    ? 'Sincronizando...'
                    : `Agendar Calendar (${totalConfirmadosDiaSeleccionado})`}
                </span>
              </button>
            )}
            {calendarQuickLinks.map((lnk, idx) => (
              <a
                key={idx}
                href={lnk.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-[#DFF4FF] px-2 py-1 text-[11px] font-bold text-[#323232] hover:bg-[#29B8FF]"
              >
                <ExternalLink className="h-3 w-3" />
                <span>GCal #{idx + 1}</span>
              </a>
            ))}
            <button
              type="button"
              onClick={() => {
                const nextRain = !voiceProfile.modoLluvia;
                onUpdateProfile?.({ modoLluvia: nextRain });
                triggerToast(
                  nextRain
                    ? '🌧️ Modo Lluvia activado: prioriza Café HUB bajo techo (desde 2 vecinos) y habilita postergar caminatas.'
                    : '☀️ Modo Lluvia desactivado: vuelve a prioridad normal (Café HUB desde 3 vecinos).'
                );
              }}
              className={`inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] px-2.5 py-1.5 text-xs font-bold font-display transition shadow-[2px_2px_0px_#323232] cursor-pointer ${
                voiceProfile.modoLluvia
                  ? 'bg-[#29B8FF] text-[#323232]'
                  : 'bg-white text-[#5A5955] hover:bg-[#ECEAE2]'
              }`}
              title="Activar/Desactivar Modo Lluvia (prioriza Café HUB bajo techo desde 2 vecinos y permite postergar caminatas)"
            >
              <span>{voiceProfile.modoLluvia ? '🌧️ Modo Lluvia: ON' : '🌧️ Modo Lluvia'}</span>
            </button>
            <button
              type="button"
              onClick={onRefreshCorte}
              className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#ECEAE2] transition shadow-[2px_2px_0px_#323232] cursor-pointer"
              title="Recalcular circuitos y horarios"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Recalcular</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. ACORDEÓN COLAPSABLE: Citas Vencidas / Sin Concretar */}
      {alertasVencidos.length > 0 && (
        <div className="rounded-2xl border-2 border-[#323232] bg-[#F5817F]/25 px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-[3px_3px_0px_#323232] space-y-2.5">
          <div
            onClick={() => setShowVencidosSection((prev) => !prev)}
            className="flex cursor-pointer items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-[#323232] bg-[#FF2C00] text-white">
                <AlertCircle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold font-display text-[#323232] truncate">
                  ⚠️ Citas Vencidas ({alertasVencidos.length})
                </h3>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#FFF06B] shrink-0 cursor-pointer"
            >
              <span>{showVencidosSection ? 'Plegar' : `Desplegar (${alertasVencidos.length})`}</span>
              {showVencidosSection ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          {showVencidosSection && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
              {alertasVencidos.map((c) => {
                const phone = c.tel || c.telRaw || c.telWA || '';
                const msgDisculpas =
                  c.alertaVencido?.mensajeDisculpasReprogramacion || c.mensajeSugerido || '';
                const waLink = crearEnlaceWhatsApp(phone, msgDisculpas);

                return (
                  <div
                    key={c.id}
                    className="rounded-xl border-2 border-[#323232] bg-white p-3 shadow-[2px_2px_0px_#323232] flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-xs font-bold text-[#323232] truncate">
                          #{c.id} {c.nombreCompletoCorregido || c.nombre} ({c.barrio})
                        </span>
                        <span className="rounded bg-[#FF2C00] px-1.5 py-0.5 text-[10px] font-bold text-white shrink-0">
                          {c.alertaVencido?.fechaVencida || 'Vencido'}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-[#5A5955] mt-0.5 truncate">
                        📍 {c.calleOCruce || c.comentario}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {onSendDirectWA && phone && (
                        <button
                          type="button"
                          onClick={() =>
                            handleSendWA(c, msgDisculpas, () => handleMarcarReprogramacionVencido(c))
                          }
                          disabled={sendingId === c.id}
                          className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#FFF06B] px-2.5 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] cursor-pointer"
                          title="Envía disculpas por WhatsApp y mueve automáticamente a 3. Falta calle/día"
                        >
                          <Send className="h-3 w-3" />
                          <span>
                            {countdownSending?.contactId === c.id
                              ? `⏳ ${countdownSending.secondsLeft}s (Cancelar)`
                              : 'Disculpas + Reprogramar'}
                          </span>
                        </button>
                      )}
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => handleMarcarReprogramacionVencido(c)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#F5F4F0] px-2 py-1 text-xs font-bold text-[#323232] hover:bg-[#ECEAE2]"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>wa.me</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => handleMarcarReprogramacionVencido(c)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#DFF4FF] px-2 py-1 text-[11px] font-bold text-[#323232] hover:bg-[#29B8FF] cursor-pointer"
                        title="Pasar a '3. Falta calle/día' y quitar de citas vencidas"
                      >
                        <span>↺ Quitar vencido</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateContact(c.id, {
                            adhirio: 'Sí',
                            rsp: 'Sí',
                            estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-950 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Firmó</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalContactId(c.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-white px-2 py-1 text-[11px] font-bold text-[#323232] hover:bg-[#FFF06B] cursor-pointer"
                      >
                        <User className="h-3 w-3" />
                        <span>Ficha</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. Bloques de Recorrido del Día Seleccionado */}
      {bloquesParaMostrar.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#323232] bg-white p-8 sm:p-12 text-center space-y-3 shadow-[3px_3px_0px_#323232]">
          {activeSubMode === 'terreno' ? (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[#323232] bg-[#FFF06B] text-[#323232] shadow-[2px_2px_0px_#323232]">
                <Navigation className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold font-display text-[#323232]">
                Todavía no hay citas confirmadas para salir a terreno en {selectedDia}
              </h3>
              <p className="mx-auto max-w-xl text-xs font-medium text-[#5A5955] leading-relaxed">
                En <strong className="text-[#323232]">&ldquo;2. Hoja de Ruta en Terreno&rdquo;</strong> únicamente aparecen los vecinos a los que ya les confirmaste la cita tocando{' '}
                <strong className="text-[#323232]">&ldquo;✓ Confirmó Cita&rdquo;</strong>,{' '}
                <strong className="text-[#323232]">&ldquo;Pasa a Domicilio&rdquo;</strong> o{' '}
                <strong className="text-[#323232]">&ldquo;Va al Café&rdquo;</strong> dentro del Planificador de Propuestas.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveSubMode('planificador')}
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-4 py-2 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] shadow-[3px_3px_0px_#323232]"
                >
                  <span>📋 Ir a 1. Planificador de Propuestas ({bloquesFiltrados.length} circuitos sugeridos)</span>
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm font-bold text-[#5A5955]">
              No hay circuitos pendientes con ubicación determinada para este día.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {bloquesParaMostrar.map((bloque) => {
            const isExpanded = expandedBloqueId === bloque.id;
            const todasParadas = bloque.paradasRutaSugerida || [];
            const paradasConfirmadas = todasParadas.filter((p) =>
              esConfirmadoParaHojaDeRuta(p.contact)
            );
            const paradas = activeSubMode === 'terreno' ? paradasConfirmadas : todasParadas;
            const contactosMostradosCabecera =
              activeSubMode === 'terreno'
                ? bloque.contactosIncluidos.filter((c) => esConfirmadoParaHojaDeRuta(c))
                : bloque.contactosIncluidos;
            const modalidadActiva = getModalidadOver(bloque) || bloque.modalidad;
            const esCafe = modalidadActiva === 'CAFE_HUB';
            const esSede =
              modalidadActiva === 'EVENTO_SEDE' || modalidadActiva === 'ENCUENTRO_SEDE';
            const cafeUnicoCircuito =
              getCafeOver(bloque) || bloque.cafesHubOpciones?.[0];

            return (
              <div
                key={bloque.id}
                className="overflow-hidden rounded-2xl border-2 border-[#323232] bg-white shadow-[4px_4px_0px_#323232]"
              >
                {/* Cabecera del Bloque */}
                <div
                  onClick={() => setExpandedBloqueId(isExpanded ? null : bloque.id)}
                  className="flex cursor-pointer flex-col md:flex-row md:items-center justify-between gap-3 p-4 sm:p-5 bg-[#ECEAE2]/50 hover:bg-[#ECEAE2] transition-colors"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#323232] text-[#323232] shadow-[2px_2px_0px_#323232] ${
                        esCafe
                          ? 'bg-[#FFF06B]'
                          : esSede
                          ? 'bg-[#F5817F]'
                          : 'bg-[#29B8FF]'
                      }`}
                    >
                      {esCafe ? (
                        <Coffee className="h-5 w-5" />
                      ) : esSede ? (
                        <MapPin className="h-5 w-5" />
                      ) : (
                        <Navigation className="h-5 w-5" />
                      )}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold font-display text-[#323232]">
                          {bloque.barrio}
                        </span>
                        <span className="rounded-lg bg-white px-2.5 py-0.5 text-xs font-bold font-display text-[#323232] border border-[#323232]">
                          {lockedBloqueSnapshots[bloque.id]?.franjaHoraria || bloque.franjaHoraria}
                        </span>
                        <span
                          className={`rounded-lg px-2.5 py-0.5 text-xs font-bold font-display border border-[#323232] ${
                            esCafe
                              ? 'bg-[#FFF06B] text-[#323232]'
                              : esSede
                              ? 'bg-[#F5817F] text-[#323232]'
                              : 'bg-[#DFF4FF] text-[#323232]'
                          }`}
                        >
                          {esCafe
                            ? `☕ Café Único del Circuito: ${cafeUnicoCircuito?.nombre || bloque.barrio}`
                            : esSede
                            ? '🏛️ Sede Chile 1408 (Miércoles 18:30 a 20:00 hs)'
                            : '🏠 Recorrido Puerta a Puerta'}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-[#323232] mt-1">
                        📍 {bloque.puntoEncuentroODireccion}
                      </p>
                      <p className="text-[11px] font-medium text-[#5A5955] mt-0.5">
                        {bloque.trasladoCalendarNota}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                    <div className="text-right">
                      <span className="text-xs font-bold font-display text-[#323232] block">
                        {contactosMostradosCabecera.length} vecino
                        {contactosMostradosCabecera.length === 1 ? '' : 's'}
                        {activeSubMode === 'terreno' ? ' confirmado(s)' : ' sugerido(s)'}
                      </span>
                      <span className="text-[11px] font-semibold text-[#5A5955]">
                        ~{bloque.duracionTotalMinutos || 45} min totales
                      </span>
                    </div>
                    <div className="rounded-xl border-2 border-[#323232] bg-white p-1.5 text-[#323232]">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Contenido Desplegable según Sub-Modo (Planificador de Propuestas vs Hoja de Ruta en Terreno) */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t-2 border-[#323232] bg-[#F5F4F0] p-5 space-y-4"
                    >
                      {/* Barra de Ajuste del Circuito (Cambiar entre Domicilio y Café del Circuito) */}
                      {!esSede && (
                        <div className="rounded-xl border-2 border-[#323232] bg-white p-3 shadow-[2px_2px_0px_#323232] space-y-2 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold font-display text-[#323232]">
                                Modalidad:
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  limpiarSnapshotBloque(bloque.id);
                                  setBloqueModalidadOverride((prev) => ({
                                    ...prev,
                                    [bloque.id]: 'PUERTA_A_PUERTA',
                                    [getBloqueOverrideKey(bloque)]: 'PUERTA_A_PUERTA',
                                  }));
                                }}
                                className={`inline-flex items-center gap-1 rounded-lg border border-[#323232] px-2.5 py-1 text-xs font-bold font-display cursor-pointer ${
                                  modalidadActiva === 'PUERTA_A_PUERTA'
                                    ? 'bg-[#29B8FF] text-[#323232]'
                                    : 'bg-[#F5F4F0] text-[#5A5955]'
                                }`}
                              >
                                <span>🏠 Domicilio</span>
                                {(bloque.modalidadRecomendada === 'PUERTA_A_PUERTA' ||
                                  bloque.contactosIncluidos.length < 2) && (
                                  <span className="rounded bg-[#FFF06B] px-1 py-0.2 text-[9px] font-black text-[#323232] border border-[#323232]">
                                    ⭐ Rec.
                                  </span>
                                )}
                              </button>
                              {bloque.cafesHubOpciones && bloque.cafesHubOpciones.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    limpiarSnapshotBloque(bloque.id);
                                    setBloqueModalidadOverride((prev) => ({
                                      ...prev,
                                      [bloque.id]: 'CAFE_HUB',
                                      [getBloqueOverrideKey(bloque)]: 'CAFE_HUB',
                                    }));
                                  }}
                                  className={`inline-flex items-center gap-1 rounded-lg border border-[#323232] px-2.5 py-1 text-xs font-bold font-display cursor-pointer ${
                                    modalidadActiva === 'CAFE_HUB'
                                      ? 'bg-[#FFF06B] text-[#323232]'
                                      : 'bg-[#F5F4F0] text-[#5A5955]'
                                  }`}
                                >
                                  <span>☕ Café</span>
                                  {bloque.modalidadRecomendada === 'CAFE_HUB' && (
                                    <span className="rounded bg-[#323232] px-1 py-0.2 text-[9px] font-black text-[#FFF06B]">
                                      ⭐ Rec.
                                    </span>
                                  )}
                                </button>
                              )}
                            </div>

                            {/* Café único recomendado para este circuito (100% responsive sin desborde en móvil) */}
                            {bloque.cafesHubOpciones && bloque.cafesHubOpciones.length > 0 && (
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 w-full sm:w-auto min-w-0">
                                <span className="text-[11px] font-bold text-[#5A5955] shrink-0">
                                  Café:
                                </span>
                                <div className="w-full sm:w-72 min-w-0">
                                  <PopurriDropdown
                                    value={
                                      cafeUnicoCircuito?.nombre || bloque.cafesHubOpciones[0].nombre
                                    }
                                    onChange={(val) => {
                                      const found = bloque.cafesHubOpciones?.find(
                                        (cf) => cf.nombre === val
                                      );
                                      if (found) {
                                        limpiarSnapshotBloque(bloque.id);
                                        const nextCafe = {
                                          nombre: found.nombre,
                                          direccion: found.direccion,
                                        };
                                        setBloqueCafeOverride((prev) => ({
                                          ...prev,
                                          [bloque.id]: nextCafe,
                                          [getBloqueOverrideKey(bloque)]: nextCafe,
                                        }));
                                      }
                                    }}
                                    headerLabel="Café Hub recomendado para el circuito:"
                                    menuWidth={320}
                                    options={bloque.cafesHubOpciones.map((cf, i) => ({
                                      value: cf.nombre,
                                      label: `${i === 0 ? '⭐ ' : ''}${cf.nombre} (${
                                        cf.direccion.split(',')[0]
                                      } · ~${cf.minutosCaminando} min)`,
                                    }))}
                                    triggerClassName="w-full flex items-center justify-between gap-1.5 rounded-lg border-2 border-[#323232] bg-[#FFF06B]/40 px-2.5 py-1 text-xs font-bold text-[#323232] hover:bg-[#FFF06B] transition cursor-pointer"
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Banner conciso en 1 línea + Opción Modo Lluvia */}
                          <div className="rounded-lg border border-[#323232]/20 bg-[#FFF06B]/25 px-2.5 py-1.5 text-[11px] font-semibold text-[#323232] flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="shrink-0 font-black">💡 Sugerido:</span>
                              <span className="truncate">
                                {bloque.modalidadRecomendada === 'CAFE_HUB'
                                  ? `Café del circuito (${bloque.contactosIncluidos.length} vecinos cercanos)${
                                      voiceProfile.modoLluvia ? ' · 🌧️ Priorizado bajo techo' : ''
                                    }`
                                  : 'Domicilio Puerta a Puerta (9-10 min buffer por parada)'}
                              </span>
                            </div>
                            {voiceProfile.modoLluvia && modalidadActiva === 'PUERTA_A_PUERTA' && (
                              <button
                                type="button"
                                onClick={() => handlePostergarRutaPorLluvia(bloque)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#29B8FF] px-2 py-0.5 text-[11px] font-bold font-display text-[#323232] hover:bg-[#1aa8f0] cursor-pointer"
                              >
                                <span>🌧️ Postergar caminata al próximo día</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ========================================================= */}
                      {/* MODO A: PLANIFICADOR DE PROPUESTAS & CONFIRMACIÓN 1-A-1   */}
                      {/* ========================================================= */}
                      {activeSubMode === 'planificador' && (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[#323232] font-display">
                              Propuestas Individuales ({bloque.contactosIncluidos.length})
                            </h4>
                            <span className="text-[11px] font-semibold text-[#5A5955]">
                              Al marcar &ldquo;Confirmó Cita&rdquo;, pasa a 2. Ruta en Terreno.
                            </span>
                          </div>

                          {bloque.contactosIncluidos.map((contact) => {
                            const key = `${bloque.id}_${contact.id}`;
                            const textoProp = obtenerTextoPropuestaContacto(contact, bloque);
                            const phone = contact.tel || contact.telRaw || contact.telWA || '';
                            const waLink = crearEnlaceWhatsApp(phone, textoProp);
                            const paradaRef = todasParadas.find((p) => p.contact.id === contact.id);
                            const yaConfirmado = esConfirmadoParaHojaDeRuta(contact);
                            const isEditingConfirmed = Boolean(editingConfirmedIds[contact.id]);

                            return (
                              <div
                                key={contact.id}
                                className={`rounded-2xl border-2 p-3.5 sm:p-4 shadow-[2px_2px_0px_#323232] space-y-2.5 transition-colors ${
                                  yaConfirmado
                                    ? 'border-emerald-700 bg-emerald-50/60'
                                    : 'border-[#323232] bg-white'
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="rounded bg-[#323232] px-2 py-0.5 font-mono text-xs font-bold text-[#FFF06B]">
                                      #{contact.id}
                                    </span>
                                    <h5 className="text-sm font-bold font-display text-[#323232]">
                                      {contact.nombreCompletoCorregido || contact.nombre}
                                    </h5>
                                    {contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' && (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-[#FFF06B] px-2 py-0.5 text-xs font-black text-[#323232] border border-[#323232]">
                                        📦 Retiro Fichas ({contact.fichasExtrasCantidad || 'X2'})
                                      </span>
                                    )}
                                    <span className="rounded-md bg-[#DFF4FF] px-2 py-0.5 text-xs font-bold text-[#323232] border border-[#323232]/40">
                                      📍 {contact.calleOCruce || contact.barrio}
                                    </span>
                                    {(contact.diasEncuentro || contact.fechasMencionadas.length > 0) && (
                                      <span className="rounded-md bg-[#ECEAE2] px-2 py-0.5 text-xs font-bold text-[#323232] border border-[#323232]/30">
                                        📅 {contact.diasEncuentro || contact.fechasMencionadas.join(', ')}
                                      </span>
                                    )}
                                    {(contact.horarioEncuentro || contact.franjaHoraria !== 'Flexible') && (
                                      <span className="rounded-md bg-[#ECEAE2] px-2 py-0.5 text-xs font-bold text-[#323232] border border-[#323232]/30">
                                        ⏰ {contact.horarioEncuentro || contact.franjaHoraria}
                                      </span>
                                    )}
                                    {paradaRef && (
                                      <span className="rounded-md bg-[#FFF06B] px-2 py-0.5 font-mono text-xs font-bold text-[#323232] border border-[#323232]">
                                        {yaConfirmado ? 'Ruta:' : 'Sugerido:'}{' '}
                                        {lockedBloqueSnapshots[bloque.id]?.paradasHoras?.[contact.id] ||
                                          paradaRef.horaLlegada}{' '}
                                        hs
                                      </span>
                                    )}
                                    {contact.alertaVencido?.activa && (
                                      <span className="rounded-md bg-[#FF2C00] px-2 py-0.5 text-xs font-bold text-white border border-[#323232]">
                                        ⚠️ Vencido ({contact.alertaVencido.fechaVencida || 'pasado'})
                                      </span>
                                    )}
                                    {yaConfirmado ? (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white border border-[#323232] shadow-[1px_1px_0px_#323232]">
                                        ✓ Confirmado
                                      </span>
                                    ) : (
                                      <span className="rounded-md bg-[#ECEAE2] px-2 py-0.5 text-[11px] font-bold text-[#5A5955] border border-[#323232]/30">
                                        Por confirmar
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setModalContactId(contact.id)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#F5F4F0] px-2.5 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#FFF06B] cursor-pointer"
                                      title="Ver y editar ficha completa sin salir del Planificador"
                                    >
                                      <User className="h-3 w-3" />
                                      <span>Ficha / Editar</span>
                                    </button>
                                    {!yaConfirmado && (
                                      <button
                                        type="button"
                                        onClick={() => handleQuitarDelPlanificador(contact)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100 cursor-pointer"
                                        title="Quitar del Planificador y devolver a '3. Falta calle/día'"
                                      >
                                        <span>✕ Quitar</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {(() => {
                                  const notaLimpia = (contact.comentario || '')
                                    .replace(/Visita confirmada Puerta a Puerta en [^\n·]+/gi, '')
                                    .replace(/Encuentro confirmado en Caf[eé] Hub [^\n·]+/gi, '')
                                    .replace(/Visita reprogramada para el [^\n·]+/gi, '')
                                    .replace(/\[Confirmado 1-a-1[^\]]*\]/gi, '')
                                    .replace(/^\s*[·—-]\s*|\s*[·—-]\s*$/g, '')
                                    .trim();
                                  return notaLimpia ? (
                                    <p className="text-xs text-[#5A5955] font-medium">
                                      Nota interna: &ldquo;{notaLimpia}&rdquo;
                                    </p>
                                  ) : null;
                                })()}

                                {/* Punto 8 Calibración ("Reservas fantasma"): Sin confirmar a <= 60 min de salir */}
                                {!yaConfirmado && paradaRef?.reservaFantasmaSinConfirmarHoy && (
                                  <div className="rounded-xl border-2 border-amber-600 bg-amber-50 p-2.5 flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs font-bold text-amber-950">
                                      ⏳ Sin confirmar a tiempo ({paradaRef.minutosParaSalidaHoy ?? 45} min para salir) — Separado de la ruta firme
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {paradaRef.mensajeReconfirmacionRapidaHoy && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const msg = paradaRef.mensajeReconfirmacionRapidaHoy!;
                                              setPropuestaTexts((prev) => ({
                                                ...prev,
                                                [key]: msg,
                                              }));
                                              if (onSendDirectWA && phone && whatsAppReady) {
                                                handleSendWA(contact, msg);
                                              }
                                            }}
                                            className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#FFF06B] px-2.5 py-1 text-[11px] font-bold font-display text-[#323232] hover:bg-[#ffe838] cursor-pointer"
                                          >
                                            <Send className="h-3 w-3" />
                                            <span>¿Llegás a estar hoy o lo pasamos para mañana?</span>
                                          </button>
                                          <a
                                            href={crearEnlaceWhatsApp(
                                              phone,
                                              paradaRef.mensajeReconfirmacionRapidaHoy
                                            )}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-white px-2 py-1 text-[11px] font-bold text-[#323232] hover:bg-[#ECEAE2]"
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                            <span>wa.me</span>
                                          </a>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Punto 14 Calibración: Sugerencia de mover horario puntual <= 30 min para optimizar ruta */}
                                {paradaRef?.sugerenciaMover30Min && (
                                  <div className="rounded-xl border border-[#323232] bg-[#DFF4FF]/60 p-2.5 flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-[11px] font-bold text-[#323232]">
                                      💡 Sugerencia ruta (≤30 min): {paradaRef.sugerenciaMover30Min.motivo}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const msg = paradaRef.sugerenciaMover30Min!.mensajePropuestaCambio;
                                        setPropuestaTexts((prev) => ({
                                          ...prev,
                                          [key]: msg,
                                        }));
                                        setReprogHora((prev) => ({
                                          ...prev,
                                          [contact.id]: paradaRef.sugerenciaMover30Min!.horaSugerida,
                                        }));
                                        triggerToast(
                                          `💬 Propuesta cargada para mover de ${paradaRef.sugerenciaMover30Min!.horaOriginal} a ${paradaRef.sugerenciaMover30Min!.horaSugerida} hs.`
                                        );
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#FFF06B] px-2.5 py-1 text-[11px] font-bold font-display text-[#323232] hover:bg-[#ffe838] cursor-pointer"
                                    >
                                      <span>
                                        Proponer {paradaRef.sugerenciaMover30Min.horaSugerida} hs
                                      </span>
                                    </button>
                                  </div>
                                )}

                                {yaConfirmado && !isEditingConfirmed ? (
                                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-emerald-700 bg-emerald-100/80 px-3 py-2">
                                    <span className="text-xs font-bold text-emerald-950">
                                      ✅ Cita confirmada y lista en 2. Ruta en Terreno.
                                    </span>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setActiveSubMode('terreno')}
                                        className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#29B8FF] px-2.5 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#1aa8f0] shadow-[2px_2px_0px_#323232] cursor-pointer"
                                      >
                                        <Navigation className="h-3.5 w-3.5" />
                                        <span>🚶‍♂️ Ver en Ruta</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          abrirEdicionPlanContacto(contact, bloque, paradaRef)
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#FFF06B] px-2.5 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] shadow-[1px_1px_0px_#323232] cursor-pointer"
                                      >
                                        <span>✏️ Cambiar Día/Hora/Lugar</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleQuitarConfirmacionPlanificador(contact)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-white px-2 py-1 text-xs font-bold text-[#FF2C00] hover:bg-[#F5817F]/20 cursor-pointer"
                                        title="Quitar de la Hoja de Ruta en Terreno"
                                      >
                                        <span>↺ Quitar</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : yaConfirmado && isEditingConfirmed ? (
                                  <div className="rounded-xl border-2 border-[#323232] bg-white p-3.5 shadow-[3px_3px_0px_#323232] space-y-3">
                                    <div className="flex items-center justify-between border-b border-[#323232]/20 pb-2">
                                      <span className="text-xs font-bold font-display text-[#323232]">
                                        ✏️ Modificar Planificación Confirmada de{' '}
                                        {contact.primerNombre || contact.nombre}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingConfirmedIds((prev) => ({
                                            ...prev,
                                            [contact.id]: false,
                                          }))
                                        }
                                        className="rounded-lg border border-[#323232] bg-[#ECEAE2] px-2.5 py-0.5 text-[11px] font-bold text-[#323232] hover:bg-[#d8d5ca]"
                                      >
                                        ✕ Cerrar
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                                      <div>
                                        <label className="block text-[11px] font-bold text-[#5A5955] mb-1">
                                          Día (DD/MM):
                                        </label>
                                        <input
                                          type="text"
                                          value={reprogFecha[contact.id] ?? ''}
                                          onChange={(e) =>
                                            setReprogFecha((prev) => ({
                                              ...prev,
                                              [contact.id]: e.target.value,
                                            }))
                                          }
                                          placeholder="Ej: 03/11"
                                          className="w-full rounded-lg border-2 border-[#323232] bg-[#F5F4F0] px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-[11px] font-bold text-[#5A5955] mb-1">
                                          Hora puntual (HH:MM):
                                        </label>
                                        <input
                                          type="text"
                                          value={reprogHora[contact.id] ?? ''}
                                          onChange={(e) =>
                                            setReprogHora((prev) => ({
                                              ...prev,
                                              [contact.id]: e.target.value,
                                            }))
                                          }
                                          placeholder="Ej: 12:00"
                                          className="w-full rounded-lg border-2 border-[#323232] bg-[#F5F4F0] px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-[11px] font-bold text-[#5A5955] mb-1">
                                          Modalidad del encuentro:
                                        </label>
                                        <PopurriDropdown
                                          value={reprogModalidad[contact.id] || 'PUERTA_A_PUERTA'}
                                          onChange={(val) =>
                                            setReprogModalidad((prev) => ({
                                              ...prev,
                                              [contact.id]: val as 'PUERTA_A_PUERTA' | 'CAFE_HUB',
                                            }))
                                          }
                                          options={[
                                            {
                                              value: 'PUERTA_A_PUERTA',
                                              label: '🏠 Pasar por su Domicilio',
                                            },
                                            {
                                              value: 'CAFE_HUB',
                                              label: '☕ Encuentro en Café Hub',
                                            },
                                          ]}
                                          triggerClassName="w-full flex items-center justify-between gap-1.5 rounded-lg border-2 border-[#323232] bg-[#FFF06B]/50 px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#FFF06B] transition cursor-pointer"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-[11px] font-bold text-[#5A5955] mb-1">
                                          {(reprogModalidad[contact.id] || 'PUERTA_A_PUERTA') ===
                                          'CAFE_HUB'
                                            ? 'Café elegido:'
                                            : 'Dirección / Esquina:'}
                                        </label>
                                        {(reprogModalidad[contact.id] || 'PUERTA_A_PUERTA') ===
                                          'CAFE_HUB' &&
                                        bloque.cafesHubOpciones &&
                                        bloque.cafesHubOpciones.length > 0 ? (
                                          <PopurriDropdown
                                            value={
                                              reprogCafe[contact.id] ||
                                              `${bloque.cafesHubOpciones[0].nombre} (${
                                                bloque.cafesHubOpciones[0].direccion.split(',')[0]
                                              })`
                                            }
                                            onChange={(val) =>
                                              setReprogCafe((prev) => ({
                                                ...prev,
                                                [contact.id]: val,
                                              }))
                                            }
                                            menuWidth={300}
                                            options={bloque.cafesHubOpciones.map((cf) => {
                                              const val = `${cf.nombre} (${
                                                cf.direccion.split(',')[0]
                                              })`;
                                              return { value: val, label: val };
                                            })}
                                            triggerClassName="w-full flex items-center justify-between gap-1.5 rounded-lg border-2 border-[#323232] bg-[#F5F4F0] px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]/40 transition cursor-pointer"
                                          />
                                        ) : (
                                          <input
                                            type="text"
                                            value={reprogDireccion[contact.id] ?? ''}
                                            onChange={(e) =>
                                              setReprogDireccion((prev) => ({
                                                ...prev,
                                                [contact.id]: e.target.value,
                                              }))
                                            }
                                            placeholder="Calle y altura o esquina"
                                            className="w-full rounded-lg border-2 border-[#323232] bg-[#F5F4F0] px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                                          />
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await handleConsolidarRespuestaPlanificador(
                                            contact,
                                            bloque,
                                            'REPROGRAMAR_DIA_HORA',
                                            paradaRef
                                          );
                                          setEditingConfirmedIds((prev) => ({
                                            ...prev,
                                            [contact.id]: false,
                                          }));
                                        }}
                                        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-emerald-300 px-3.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-emerald-400 shadow-[2px_2px_0px_#323232]"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        <span>💾 Guardar Nueva Planificación Confirmada</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleQuitarConfirmacionPlanificador(contact)}
                                        className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#FF2C00] hover:bg-[#F5817F]/20"
                                      >
                                        <span>↺ Volver a Pendiente de Confirmar</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {/* Textarea editable de la propuesta (SÓLO para contactos aún NO confirmados) */}
                                    <textarea
                                      rows={3}
                                      value={textoProp}
                                      onChange={(e) =>
                                        setPropuestaTexts((prev) => ({
                                          ...prev,
                                          [key]: e.target.value,
                                        }))
                                      }
                                      className="w-full rounded-xl border-2 border-[#323232] bg-[#F5F4F0] p-2.5 text-xs font-medium text-[#323232]"
                                    />

                                    {/* Botonera de Envío de Propuesta + Consolidación de Respuesta */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {onSendDirectWA && phone && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              congelarSnapshotBloqueAlEnviar(bloque);
                                              handleSendWA(contact, textoProp);
                                            }}
                                            disabled={sendingId === contact.id}
                                            className={`inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] px-3 py-1.5 text-xs font-bold font-display transition shadow-[2px_2px_0px_#323232] ${
                                              countdownSending?.contactId === contact.id
                                                ? 'bg-amber-400 text-[#323232] animate-pulse hover:bg-amber-500'
                                                : sentSuccessIds.has(contact.id)
                                                ? 'bg-emerald-200 text-emerald-900 border-emerald-700'
                                                : 'bg-[#FFF06B] text-[#323232] hover:bg-[#ffe838]'
                                            }`}
                                            title={countdownSending?.contactId === contact.id ? 'Click para cancelar el envío' : ''}
                                          >
                                            <Send className="h-3.5 w-3.5" />
                                            <span>
                                              {sendingId === contact.id
                                                ? 'Enviando...'
                                                : countdownSending?.contactId === contact.id
                                                ? `⏳ Enviar en ${countdownSending.secondsLeft}s (Cancelar)`
                                                : sentSuccessIds.has(contact.id)
                                                ? '✅ Enviado'
                                                : '⚡ Enviar Propuesta WA'}
                                            </span>
                                          </button>
                                        )}
                                        <a
                                          href={waLink}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#ECEAE2]"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                          <span>wa.me</span>
                                        </a>
                                      </div>

                                      {/* Botones de Consolidación 1-a-1 */}
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleConsolidarRespuestaPlanificador(
                                              contact,
                                              bloque,
                                              'CONFIRMO_PROPUESTA',
                                              paradaRef
                                            );
                                            setEditingConfirmedIds((prev) => ({
                                              ...prev,
                                              [contact.id]: false,
                                            }));
                                          }}
                                          className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-emerald-100 px-2.5 py-1.5 text-xs font-bold font-display text-emerald-950 hover:bg-emerald-200"
                                        >
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          <span>✓ Confirmó Cita</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleConsolidarRespuestaPlanificador(
                                              contact,
                                              bloque,
                                              'DECLINO_CAFE_PASA_PUERTA_A_PUERTA',
                                              paradaRef
                                            );
                                            setEditingConfirmedIds((prev) => ({
                                              ...prev,
                                              [contact.id]: false,
                                            }));
                                          }}
                                          className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-[#DFF4FF] px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#29B8FF]"
                                        >
                                          <Home className="h-3.5 w-3.5" />
                                          <span>Pasa a Domicilio</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleConsolidarRespuestaPlanificador(
                                              contact,
                                              bloque,
                                              'PASA_A_CAFE_HUB',
                                              paradaRef
                                            );
                                            setEditingConfirmedIds((prev) => ({
                                              ...prev,
                                              [contact.id]: false,
                                            }));
                                          }}
                                          className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-[#FFF06B]/60 px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]"
                                        >
                                          <Coffee className="h-3.5 w-3.5" />
                                          <span>Va al Café</span>
                                        </button>
                                      </div>
                                    </div>

                                    {/* Fila rápida para reprogramar día/hora puntual */}
                                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#323232]/15 text-xs">
                                      <span className="font-bold text-[#5A5955]">
                                        ¿Pidió otro día u horario?:
                                      </span>
                                      <input
                                        type="text"
                                        value={reprogFecha[contact.id] || ''}
                                        onChange={(e) =>
                                          setReprogFecha((prev) => ({
                                            ...prev,
                                            [contact.id]: e.target.value,
                                          }))
                                        }
                                        placeholder="Día (ej: 04/11)"
                                        className="w-28 rounded-lg border border-[#323232] bg-[#F5F4F0] px-2 py-1 text-xs font-semibold"
                                      />
                                      <input
                                        type="text"
                                        value={reprogHora[contact.id] || ''}
                                        onChange={(e) =>
                                          setReprogHora((prev) => ({
                                            ...prev,
                                            [contact.id]: e.target.value,
                                          }))
                                        }
                                        placeholder="Hora (ej: 16:30)"
                                        className="w-28 rounded-lg border border-[#323232] bg-[#F5F4F0] px-2 py-1 text-xs font-semibold"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleConsolidarRespuestaPlanificador(
                                            contact,
                                            bloque,
                                            'REPROGRAMAR_DIA_HORA',
                                            paradaRef
                                          );
                                          setEditingConfirmedIds((prev) => ({
                                            ...prev,
                                            [contact.id]: false,
                                          }));
                                        }}
                                        className="rounded-lg border border-[#323232] bg-[#323232] px-2.5 py-1 text-xs font-bold text-[#FFF06B]"
                                      >
                                        Guardar y Confirmar Horario
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}

                          {/* Punto 10 Calibración: Pestaña "Aprovechar viaje: vecinos del mismo barrio sin dirección" (3. Falta Dir/Día) */}
                          {bloque.vecinosMismoBarrioSinDireccion &&
                            bloque.vecinosMismoBarrioSinDireccion.length > 0 && (
                              <div className="rounded-2xl border-2 border-[#323232] bg-[#DFF4FF]/45 p-3 shadow-[2px_2px_0px_#323232] space-y-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenAprovecharSinDir((prev) => ({
                                      ...prev,
                                      [bloque.id]: !prev[bloque.id],
                                    }))
                                  }
                                  className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="rounded-lg border border-[#323232] bg-[#FFF06B] px-2 py-0.5 text-[11px] font-black text-[#323232] shrink-0">
                                      ✨ Aprovechar viaje
                                    </span>
                                    <span className="text-xs font-bold font-display text-[#323232] truncate">
                                      {bloque.vecinosMismoBarrioSinDireccion.length} vecino(s) de {bloque.barrio} sin dirección (3. Falta Dir/Día)
                                    </span>
                                  </div>
                                  <span className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-white px-2 py-0.5 text-[11px] font-bold text-[#323232] shrink-0">
                                    {openAprovecharSinDir[bloque.id] ? 'Ocultar' : 'Ver y escribir en 1 clic'}
                                    {openAprovecharSinDir[bloque.id] ? (
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                </button>

                                {openAprovecharSinDir[bloque.id] && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                                    {bloque.vecinosMismoBarrioSinDireccion.map((item) => {
                                      const v = item.contact;
                                      const phoneV = v.tel || v.telRaw || v.telWA || '';
                                      const waLinkV = crearEnlaceWhatsApp(
                                        phoneV,
                                        item.mensajeWhatsAppSugerido
                                      );
                                      return (
                                        <div
                                          key={v.id}
                                          className="rounded-xl border border-[#323232] bg-white p-2.5 flex flex-col justify-between gap-2"
                                        >
                                          <div className="flex items-center justify-between gap-1.5">
                                            <span className="text-xs font-bold font-display text-[#323232] truncate">
                                              #{v.id} {v.nombreCompletoCorregido || v.nombre}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => setModalContactId(v.id)}
                                              className="rounded border border-[#323232] bg-[#F5F4F0] px-1.5 py-0.5 text-[10px] font-bold text-[#323232] hover:bg-[#FFF06B] cursor-pointer"
                                            >
                                              Ficha
                                            </button>
                                          </div>
                                          <p className="text-[11px] text-[#5A5955] line-clamp-2">
                                            &ldquo;{item.mensajeWhatsAppSugerido}&rdquo;
                                          </p>
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            {onSendDirectWA && phoneV && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleSendWA(v, item.mensajeWhatsAppSugerido)
                                                }
                                                disabled={sendingId === v.id}
                                                className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#FFF06B] px-2 py-1 text-[11px] font-bold font-display text-[#323232] hover:bg-[#ffe838] cursor-pointer"
                                              >
                                                <Send className="h-3 w-3" />
                                                <span>Consultar calle/esquina</span>
                                              </button>
                                            )}
                                            <a
                                              href={waLinkV}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#F5F4F0] px-2 py-1 text-[11px] font-bold text-[#323232] hover:bg-[#ECEAE2]"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              <span>wa.me</span>
                                            </a>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                          {/* Punto 12 Calibración: Pestaña "Aprovechar viaje: retiros de fichas extra en el barrio" (7. Retiro Fichas sin confirmar) */}
                          {bloque.retirosFichasMismoBarrioSugeridos &&
                            bloque.retirosFichasMismoBarrioSugeridos.length > 0 && (
                              <div className="rounded-2xl border-2 border-[#323232] bg-[#FFF06B]/30 p-3 shadow-[2px_2px_0px_#323232] space-y-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenAprovecharFichas((prev) => ({
                                      ...prev,
                                      [bloque.id]: !prev[bloque.id],
                                    }))
                                  }
                                  className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="rounded-lg border border-[#323232] bg-[#323232] px-2 py-0.5 text-[11px] font-black text-[#FFF06B] shrink-0">
                                      📦 Retiro Fichas de paso
                                    </span>
                                    <span className="text-xs font-bold font-display text-[#323232] truncate">
                                      {bloque.retirosFichasMismoBarrioSugeridos.length} vecino(s) con fichas extra en {bloque.barrio} (sin confirmar si están listas)
                                    </span>
                                  </div>
                                  <span className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-white px-2 py-0.5 text-[11px] font-bold text-[#323232] shrink-0">
                                    {openAprovecharFichas[bloque.id] ? 'Ocultar' : 'Ver y consultar'}
                                    {openAprovecharFichas[bloque.id] ? (
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                </button>

                                {openAprovecharFichas[bloque.id] && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                                    {bloque.retirosFichasMismoBarrioSugeridos.map((item) => {
                                      const v = item.contact;
                                      const phoneV = v.tel || v.telRaw || v.telWA || '';
                                      const waLinkV = crearEnlaceWhatsApp(
                                        phoneV,
                                        item.mensajeWhatsAppSugerido
                                      );
                                      return (
                                        <div
                                          key={v.id}
                                          className="rounded-xl border border-[#323232] bg-white p-2.5 flex flex-col justify-between gap-2"
                                        >
                                          <div className="flex items-center justify-between gap-1.5">
                                            <span className="text-xs font-bold font-display text-[#323232] truncate">
                                              #{v.id} {v.nombreCompletoCorregido || v.nombre} ({v.calleOCruce || v.barrio})
                                            </span>
                                            <span className="rounded bg-[#FFF06B] px-1.5 py-0.5 text-[10px] font-black text-[#323232] border border-[#323232]">
                                              {v.fichasExtrasCantidad || 'X2'}
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-[#5A5955] line-clamp-2">
                                            &ldquo;{item.mensajeWhatsAppSugerido}&rdquo;
                                          </p>
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            {onSendDirectWA && phoneV && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleSendWA(v, item.mensajeWhatsAppSugerido)
                                                }
                                                disabled={sendingId === v.id}
                                                className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#FFF06B] px-2 py-1 text-[11px] font-bold font-display text-[#323232] hover:bg-[#ffe838] cursor-pointer"
                                              >
                                                <Send className="h-3 w-3" />
                                                <span>Preguntar si están listas</span>
                                              </button>
                                            )}
                                            <a
                                              href={waLinkV}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#F5F4F0] px-2 py-1 text-[11px] font-bold text-[#323232] hover:bg-[#ECEAE2]"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              <span>wa.me</span>
                                            </a>
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                await onUpdateContact(v.id, {
                                                  retiroConfirmado: true,
                                                  diasEncuentro: bloque.fechaClave,
                                                  comentario: [
                                                    (v.comentario || '').trim(),
                                                    '[Retiro confirmado]',
                                                  ]
                                                    .filter(Boolean)
                                                    .join(' · '),
                                                });
                                                triggerToast(
                                                  `✅ ${v.primerNombre || v.nombre}: Fichas listas confirmadas y sumado a la ruta de ${bloque.barrio}.`
                                                );
                                              }}
                                              className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-emerald-200 px-2 py-1 text-[11px] font-bold font-display text-emerald-950 hover:bg-emerald-300 cursor-pointer"
                                            >
                                              <CheckCircle2 className="h-3 w-3" />
                                              <span>✅ Ya las tiene listas · Sumar a ruta</span>
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                        </div>
                      )}

                      {/* ========================================================= */}
                      {/* MODO B: HOJA DE RUTA EN TERRENO (EJECUCIÓN PASO A PASO)    */}
                      {/* ========================================================= */}
                      {activeSubMode === 'terreno' && (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[#323232] font-display">
                              Hoja de Ruta Secuencial (10 min de espera por parada · Google Maps en 1 clic)
                            </h4>
                            <span className="text-[11px] font-bold text-[#5A5955]">
                              Origen inicial: {voiceProfile.direccionPartida}
                            </span>
                          </div>

                          {paradas.length === 0 ? (
                            <div className="rounded-xl border-2 border-[#323232] bg-white p-4 text-xs font-bold text-[#323232]">
                              Encuentro grupal en {bloque.puntoEncuentroODireccion} con{' '}
                              {bloque.contactosIncluidos.length} personas.
                            </div>
                          ) : (
                            paradas.map((parada, idx) => {
                              const c = parada.contact;
                              const paradaAjustada = obtenerParadaConAjusteEnVivo(parada);
                              const ajusteMin = paradaTimeAdjustMin[c.id] || 0;
                              const phone = c.tel || c.telRaw || c.telWA || '';
                              const modoActual = obtenerModoEfectivoParada(parada);
                              const textoActual = obtenerTextoEfectivoParada(parada, bloque);
                              const waLink = crearEnlaceWhatsApp(phone, textoActual);
                              const editKey = `${c.id}_${modoActual}`;
                              const estaConfirmado =
                                parada.confirmadoEnLista1a1 ||
                                c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
                                Boolean(paradaUnlockEnCamino[c.id]);

                              return (
                                <div
                                  key={c.id}
                                  className={`rounded-2xl border-2 bg-white p-4 shadow-[3px_3px_0px_#323232] space-y-3 ${
                                    parada.vencidaSinAdherir
                                      ? 'border-[#FF2C00]'
                                      : 'border-[#323232]'
                                  }`}
                                >
                                  {/* Cabecera de la Parada */}
                                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 border-[#323232] bg-[#FFF06B] font-display text-sm font-bold text-[#323232]">
                                        {idx + 1}
                                      </div>
                                      <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <h5 className="text-sm font-bold font-display text-[#323232]">
                                            #{c.id} {c.nombreCompletoCorregido || c.nombre}
                                          </h5>
                                          <span className="rounded-lg bg-[#323232] px-2.5 py-0.5 font-mono text-xs font-bold text-[#FFF06B]">
                                            Llegada {paradaAjustada.horaLlegada} hs (Salida{' '}
                                            {paradaAjustada.horaSalida} · Fin {paradaAjustada.horaFinVisita})
                                          </span>
                                          {ajusteMin !== 0 && (
                                            <span
                                              className={`rounded-md px-2 py-0.5 text-[11px] font-bold border border-[#323232] ${
                                                ajusteMin > 0
                                                  ? 'bg-amber-200 text-[#323232]'
                                                  : 'bg-emerald-200 text-emerald-950'
                                              }`}
                                            >
                                              {ajusteMin > 0
                                                ? `⏱️ +${ajusteMin} min en cascada`
                                                : `⏩ ${ajusteMin} min adelantado`}
                                            </span>
                                          )}
                                          <span className="rounded-md bg-[#DFF4FF] px-2 py-0.5 text-[11px] font-bold text-[#323232] border border-[#323232]/40">
                                            +{parada.minutosEncuentro} min buffer espera
                                          </span>
                                        </div>

                                        <p className="text-xs font-bold text-[#323232] mt-1">
                                          📍 Destino: {parada.destinoNombre}
                                        </p>
                                        <p className="text-[11px] font-medium text-[#5A5955] mt-0.5">
                                          🚶 {parada.detalleTransporte}
                                        </p>

                                        {parada.conflictoCalendar && (
                                          <p className="mt-1 rounded-lg bg-[#FFF06B] px-2.5 py-1 text-[11px] font-bold text-[#323232] border border-[#323232]">
                                            ⚠️ {parada.conflictoCalendar}
                                          </p>
                                        )}

                                        {parada.vencidaSinAdherir && (
                                          <p className="mt-1 rounded-lg bg-[#FF2C00] px-2.5 py-1 text-[11px] font-bold text-white">
                                            ⚠️ {parada.motivoVencimiento}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Botones de Navegación Maps + Demora en cascada + Estado de Confirmación */}
                                    <div className="flex flex-wrap items-center gap-2 self-end lg:self-auto shrink-0">
                                      {/* Punto 9 Calibración: Corrimiento en vivo en la calle (+10 / +15 min en cascada) */}
                                      <button
                                        type="button"
                                        onClick={() => handleCascadeDelayParadas(paradas, idx, 10)}
                                        className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-amber-100 px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-amber-200 shadow-[2px_2px_0px_#323232] cursor-pointer"
                                        title="Corre +10 min el horario de las paradas siguientes de este bloque y activa el mensaje de aviso de demora"
                                      >
                                        <Clock className="h-3.5 w-3.5" />
                                        <span>⏱️ Me demoré +10 min</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleCascadeDelayParadas(paradas, idx, 15)}
                                        className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-amber-50 px-2 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-amber-200 cursor-pointer"
                                        title="Corre +15 min el horario de las paradas siguientes de este bloque y activa el mensaje de aviso de demora"
                                      >
                                        <span>+15 min</span>
                                      </button>

                                      <a
                                        href={parada.urlGoogleMapsTramo}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#29B8FF] px-3 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#1aa8f0] shadow-[2px_2px_0px_#323232]"
                                        title={
                                          idx === 0
                                            ? 'Abrir indicaciones en Google Maps desde tu Punto de Partida'
                                            : 'Abrir indicaciones en Google Maps desde tu ubicación actual (GPS)'
                                        }
                                      >
                                        <MapPin className="h-3.5 w-3.5" />
                                        <span>Ir a Maps</span>
                                      </a>

                                      {!estaConfirmado ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setParadaUnlockEnCamino((prev) => ({
                                              ...prev,
                                              [c.id]: true,
                                            }));
                                            setParadaModoMsj((prev) => ({
                                              ...prev,
                                              [c.id]: 'EN_CAMINO_HORA_CALC',
                                            }));
                                          }}
                                          className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-2.5 py-1.5 text-xs font-bold font-display text-[#323232]"
                                          title="Tocá para desbloquear 'Estoy en camino'."
                                        >
                                          <Lock className="h-3.5 w-3.5 text-[#FF2C00]" />
                                          <span>Desbloquear En Camino</span>
                                        </button>
                                      ) : (
                                        <>
                                          <span className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-950">
                                            <Unlock className="h-3.5 w-3.5 text-emerald-700" />
                                            <span>Confirmado</span>
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              editingConfirmedIds[c.id]
                                                ? setEditingConfirmedIds((prev) => ({
                                                    ...prev,
                                                    [c.id]: false,
                                                  }))
                                                : abrirEdicionPlanContacto(c, bloque, parada)
                                            }
                                            className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] shadow-[2px_2px_0px_#323232] cursor-pointer"
                                          >
                                            <span>
                                              {editingConfirmedIds[c.id]
                                                ? '✕ Cerrar'
                                                : '✏️ Cambiar Plan'}
                                            </span>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {editingConfirmedIds[c.id] && (
                                    <div className="rounded-xl border-2 border-[#323232] bg-[#FFF06B]/20 p-3.5 space-y-3">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                                        <div>
                                          <label className="block text-[11px] font-bold text-[#5A5955] mb-1">
                                            Día (DD/MM):
                                          </label>
                                          <input
                                            type="text"
                                            value={reprogFecha[c.id] ?? ''}
                                            onChange={(e) =>
                                              setReprogFecha((prev) => ({
                                                ...prev,
                                                [c.id]: e.target.value,
                                              }))
                                            }
                                            placeholder="Ej: 03/11"
                                            className="w-full rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                                          />
                                        </div>

                                        <div>
                                          <label className="block text-[11px] font-bold text-[#5A5955] mb-1">
                                            Hora puntual (HH:MM):
                                          </label>
                                          <input
                                            type="text"
                                            value={reprogHora[c.id] ?? ''}
                                            onChange={(e) =>
                                              setReprogHora((prev) => ({
                                                ...prev,
                                                [c.id]: e.target.value,
                                              }))
                                            }
                                            placeholder="Ej: 12:00"
                                            className="w-full rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                                          />
                                        </div>

                                        <div>
                                          <label className="block text-[11px] font-bold text-[#5A5955] mb-1">
                                            Modalidad:
                                          </label>
                                          <PopurriDropdown
                                            value={reprogModalidad[c.id] || 'PUERTA_A_PUERTA'}
                                            onChange={(val) =>
                                              setReprogModalidad((prev) => ({
                                                ...prev,
                                                [c.id]: val as 'PUERTA_A_PUERTA' | 'CAFE_HUB',
                                              }))
                                            }
                                            options={[
                                              {
                                                value: 'PUERTA_A_PUERTA',
                                                label: '🏠 Pasar por su Domicilio',
                                              },
                                              {
                                                value: 'CAFE_HUB',
                                                label: '☕ Encuentro en Café Hub',
                                              },
                                            ]}
                                            triggerClassName="w-full flex items-center justify-between gap-1.5 rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]/40 transition cursor-pointer"
                                          />
                                        </div>

                                        <div>
                                          <label className="block text-[11px] font-bold text-[#5A5955] mb-1">
                                            {(reprogModalidad[c.id] || 'PUERTA_A_PUERTA') ===
                                            'CAFE_HUB'
                                              ? 'Café elegido:'
                                              : 'Dirección / Esquina:'}
                                          </label>
                                          {(reprogModalidad[c.id] || 'PUERTA_A_PUERTA') ===
                                            'CAFE_HUB' &&
                                          bloque.cafesHubOpciones &&
                                          bloque.cafesHubOpciones.length > 0 ? (
                                            <PopurriDropdown
                                              value={
                                                reprogCafe[c.id] ||
                                                `${bloque.cafesHubOpciones[0].nombre} (${
                                                  bloque.cafesHubOpciones[0].direccion.split(',')[0]
                                                })`
                                              }
                                              onChange={(val) =>
                                                setReprogCafe((prev) => ({
                                                  ...prev,
                                                  [c.id]: val,
                                                }))
                                              }
                                              menuWidth={300}
                                              options={bloque.cafesHubOpciones.map((cf) => {
                                                const val = `${cf.nombre} (${
                                                  cf.direccion.split(',')[0]
                                                })`;
                                                return { value: val, label: val };
                                              })}
                                              triggerClassName="w-full flex items-center justify-between gap-1.5 rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]/40 transition cursor-pointer"
                                            />
                                          ) : (
                                            <input
                                              type="text"
                                              value={reprogDireccion[c.id] ?? ''}
                                              onChange={(e) =>
                                                setReprogDireccion((prev) => ({
                                                  ...prev,
                                                  [c.id]: e.target.value,
                                                }))
                                              }
                                              placeholder="Calle y altura o esquina"
                                              className="w-full rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                                            />
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            await handleConsolidarRespuestaPlanificador(
                                              c,
                                              bloque,
                                              'REPROGRAMAR_DIA_HORA',
                                              parada
                                            );
                                            setEditingConfirmedIds((prev) => ({
                                              ...prev,
                                              [c.id]: false,
                                            }));
                                          }}
                                          className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-emerald-300 px-3.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-emerald-400 shadow-[2px_2px_0px_#323232]"
                                        >
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          <span>💾 Guardar Cambio de Planificación</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleQuitarConfirmacionPlanificador(c)}
                                          className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#FF2C00] hover:bg-[#F5817F]/20"
                                        >
                                          <span>↺ Quitar de Ruta Confirmada</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Selector de los 8 Modos de Mensaje en Terreno + Edición del Mensaje */}
                                  <div className="rounded-xl border-2 border-[#323232]/40 bg-[#F5F4F0] p-3 space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#323232] font-display">
                                        Mensaje en Vivo para esta Parada (Editable):
                                      </label>
                                      <div className="w-full sm:w-80">
                                        <PopurriDropdown
                                          value={modoActual}
                                          onChange={(val) => {
                                            const nextModo = val as ModoMensajeTerrenoRuta;
                                            if (
                                              nextModo === 'EN_CAMINO_HORA_CALC' &&
                                              !estaConfirmado
                                            ) {
                                              setParadaUnlockEnCamino((prev) => ({
                                                ...prev,
                                                [c.id]: true,
                                              }));
                                            }
                                            setParadaModoMsj((prev) => ({
                                              ...prev,
                                              [c.id]: nextModo,
                                            }));
                                          }}
                                          headerLabel="Modo de mensaje para esta parada:"
                                          align="right"
                                          menuWidth={320}
                                          options={MODOS_MENSAJE_TERRENO}
                                          triggerClassName="w-full flex items-center justify-between gap-1.5 rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]/40 transition cursor-pointer"
                                        />
                                      </div>
                                    </div>

                                    <textarea
                                      rows={3}
                                      value={textoActual}
                                      onChange={(e) =>
                                        setParadaTextoEditado((prev) => ({
                                          ...prev,
                                          [editKey]: e.target.value,
                                        }))
                                      }
                                      className="w-full rounded-xl border-2 border-[#323232] bg-white p-2.5 text-xs font-medium text-[#323232]"
                                    />

                                    {/* Acciones en Terreno: Enviar WA, wa.me, Copiar, Firmó, +Fichas (1 sem), Ver en Candidatos */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {onSendDirectWA && phone && (
                                          <button
                                            type="button"
                                            onClick={() => handleSendWA(c, textoActual)}
                                            disabled={sendingId === c.id}
                                            className={`inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] px-3.5 py-1.5 text-xs font-bold font-display transition shadow-[2px_2px_0px_#323232] ${
                                              countdownSending?.contactId === c.id
                                                ? 'bg-amber-400 text-[#323232] animate-pulse hover:bg-amber-500'
                                                : sentSuccessIds.has(c.id)
                                                ? 'bg-emerald-200 text-emerald-900 border-emerald-700'
                                                : 'bg-[#FFF06B] text-[#323232] hover:bg-[#ffe838]'
                                            }`}
                                            title={countdownSending?.contactId === c.id ? 'Click para cancelar el envío' : ''}
                                          >
                                            <Send className="h-3.5 w-3.5" />
                                            <span>
                                              {sendingId === c.id
                                                ? 'Enviando...'
                                                : countdownSending?.contactId === c.id
                                                ? `⏳ Enviar en ${countdownSending.secondsLeft}s (Cancelar)`
                                                : sentSuccessIds.has(c.id)
                                                ? '✅ Enviado'
                                                : whatsAppReady
                                                ? '⚡ Enviar por WhatsApp Web'
                                                : 'Enviar / Registrar WA'}
                                            </span>
                                          </button>
                                        )}

                                        <a
                                          href={waLink}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#ECEAE2]"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                          <span>wa.me</span>
                                        </a>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard.writeText(textoActual);
                                            setCopiedId(c.id);
                                            setTimeout(() => setCopiedId(null), 2000);
                                          }}
                                          className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                                        >
                                          {copiedId === c.id ? (
                                            <Check className="h-3.5 w-3.5 text-emerald-700" />
                                          ) : (
                                            <Copy className="h-3.5 w-3.5" />
                                          )}
                                          <span>{copiedId === c.id ? 'Copiado' : 'Copiar'}</span>
                                        </button>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ? (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              await onUpdateContact(c.id, {
                                                adhirio: 'Sí',
                                                rsp: 'Sí',
                                                retiroConfirmado: false,
                                                estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
                                              });
                                              triggerToast(
                                                `✅ ¡Fichas retiradas de ${c.primerNombre || c.nombre}!`
                                              );
                                            }}
                                            className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-emerald-100 px-2.5 py-1.5 text-xs font-bold font-display text-emerald-950 hover:bg-emerald-200 shadow-[2px_2px_0px_#323232] cursor-pointer"
                                          >
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                                            <span>✅ Fichas Retiradas</span>
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              await onUpdateContact(c.id, {
                                                adhirio: 'Sí',
                                                rsp: 'Sí',
                                                estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
                                              });
                                              triggerToast(
                                                `🎉 ¡${c.primerNombre || c.nombre} marcado como Ya Firmó!`
                                              );
                                            }}
                                            className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-emerald-100 px-2.5 py-1.5 text-xs font-bold font-display text-emerald-950 hover:bg-emerald-200 shadow-[2px_2px_0px_#323232] cursor-pointer"
                                          >
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                                            <span>✓ Firmó</span>
                                          </button>
                                        )}

                                        {fichasPickerParadaId === c.id ? (
                                          <div className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#DFF4FF] px-2 py-1 text-[11px] font-bold font-display text-[#323232]">
                                            <span className="text-[10px] font-black">Fichas:</span>
                                            {([1, 2, 3, 4, 5] as const).map((cant) => (
                                              <button
                                                key={cant}
                                                type="button"
                                                onClick={() => handleMarkFichasParada(c, cant)}
                                                className="rounded border border-[#323232] bg-white px-1.5 py-0.5 text-[11px] font-black text-[#323232] hover:bg-[#FFF06B] cursor-pointer"
                                              >
                                                {cant}
                                              </button>
                                            ))}
                                            <button
                                              type="button"
                                              onClick={() => setFichasPickerParadaId(null)}
                                              className="ml-0.5 text-[#5A5955] hover:text-[#323232] cursor-pointer"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setFichasPickerParadaId(c.id)}
                                            className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-[#DFF4FF] px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#29B8FF] cursor-pointer"
                                            title="Dejar fichas extra para retirar en 1 semana"
                                          >
                                            <FilePlus2 className="h-3.5 w-3.5" />
                                            <span>+ Fichas</span>
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleNoEstabaEnRuta(parada, paradas, idx, bloque)
                                          }
                                          className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-[#F5817F]/40 px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#F5817F] cursor-pointer"
                                          title="Envía el mensaje de desencuentro, devuelve el contacto a '4. Falta Confirmar' para su próximo día disponible y adelanta 9 min las paradas restantes"
                                        >
                                          <span>🚪 No estaba / Reprogramar</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => setModalContactId(c.id)}
                                          className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#FFF06B] cursor-pointer"
                                        >
                                          <User className="h-3.5 w-3.5" />
                                          <span>Ficha</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Flotante con la Ficha Completa del Candidato (sin salir de Planificador & Hoy) */}
      <AnimatePresence>
        {modalContact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-2.5 sm:p-5 overflow-y-auto overflow-x-hidden"
            onClick={() => setModalContactId(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-5xl max-h-[92vh] overflow-y-auto overflow-x-hidden popurri-dropdown-scroll rounded-2xl border-2 border-[#323232] bg-[#F5F4F0] p-3 sm:p-4 shadow-[6px_6px_0px_#323232] space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#323232] pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-[#323232] px-2 py-0.5 font-mono text-xs font-bold text-[#FFF06B]">
                    #{modalContact.id}
                  </span>
                  <h3 className="text-sm sm:text-base font-bold font-display text-[#323232]">
                    Ficha de {modalContact.nombreCompletoCorregido || modalContact.nombre}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {onJumpToCandidate && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = modalContact.id;
                        setModalContactId(null);
                        onJumpToCandidate(targetId);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-white px-2.5 py-1 text-xs font-bold text-[#323232] hover:bg-[#DFF4FF] cursor-pointer"
                    >
                      <span>Ir a Candidatos</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setModalContactId(null)}
                    className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-3 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cerrar</span>
                  </button>
                </div>
              </div>

              <CandidateCard
                contact={modalContact}
                isSelected={true}
                isExpanded={true}
                whatsAppReady={whatsAppReady}
                voiceProfile={voiceProfile}
                allContacts={bloques.flatMap((b) => b.contactosIncluidos)}
                onSelect={() => {}}
                onUpdateContact={onUpdateContact}
                onSendDirectWA={onSendDirectWA}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast de confirmación */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50 rounded-2xl border-2 border-[#323232] bg-[#FFF06B] px-4 py-3 text-xs font-bold font-display text-[#323232] shadow-[4px_4px_0px_#323232]"
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
