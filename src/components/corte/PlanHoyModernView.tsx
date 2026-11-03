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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  onSendDirectWA,
  onJumpToCandidate,
  onOpenScannerModal,
}) => {
  const bloques = corteResultado.agendaSugeridaDias || [];
  const alertasVencidos = corteResultado.alertasPendientesVencidos || [];

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
    const horaEnCom = com.match(/a\s+las\s+(\d{1,2}:\d{2})/i)?.[1];
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
      [contact.id]: prev[contact.id] || contact.fechasMencionadas[0] || bloque.fechaClave || '',
    }));
    setReprogHora((prev) => ({
      ...prev,
      [contact.id]:
        prev[contact.id] || horaEnCom || paradaRef?.horaLlegada || bloque.horaInicioCalculada || '',
    }));
    setReprogDireccion((prev) => ({
      ...prev,
      [contact.id]: prev[contact.id] || contact.calleOCruce || '',
    }));
    setReprogModalidad((prev) => ({
      ...prev,
      [contact.id]: prev[contact.id] || (esCafeActual ? 'CAFE_HUB' : 'PUERTA_A_PUERTA'),
    }));
    if (cafeDefault) {
      setReprogCafe((prev) => ({
        ...prev,
        [contact.id]: prev[contact.id] || cafeDefault,
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
    if (
      contact.fechasMencionadas.length > 0 &&
      contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
    ) {
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
    const comLimpio = (contact.comentario || '')
      .replace(/\s*\[Confirmado\s+1-a-1[^\]]*\]/gi, '')
      .replace(/\s*\[Declinó\s+Café\s+Hub[^\]]*\]/gi, '')
      .replace(/Visita\s+confirmada\s+Puerta\s+a\s+Puerta\s+en\s+/gi, 'Visita por confirmar en ')
      .replace(/Visita\s+confirmada\s+Puerta\s+a\s+Puerta/gi, 'Visita por confirmar')
      .replace(/Encuentro\s+confirmado\s+en\s+Café\s+Hub/gi, 'Prefiere Café Hub')
      .replace(/Prefiere\s+punto\s+de\s+encuentro\s+Café\s+Hub\s+confirmado/gi, 'Prefiere Café Hub')
      .trim();
    await onUpdateContact(contact.id, {
      estadoFlujo: 'PASO_DATOS_FALTA_CONFIRMAR',
      comentario: comLimpio,
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
    const modOver = getModalidadOver(bloque);
    const cafeOver = getCafeOver(bloque);
    return generarMensajePropuestaBloqueAgenda(contact, bloque, voiceProfile, {
      modalidad: modOver,
      cafeHubNombre: cafeOver?.nombre,
      cafeHubDireccion: cafeOver?.direccion,
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

  const obtenerTextoEfectivoParada = (p: ParadaRuta, bloque: BloqueAgendaRecomendado): string => {
    const modo = obtenerModoEfectivoParada(p);
    const key = `${p.contact.id}_${modo}`;
    if (paradaTextoEditado[key] !== undefined) return paradaTextoEditado[key];
    const cafeOver = getCafeOver(bloque);
    const cafePrincipal = cafeOver || bloque.cafesHubOpciones?.[0];
    const cafeTexto = cafePrincipal
      ? `${cafePrincipal.nombre} (${cafePrincipal.direccion.split(',')[0]})`
      : undefined;
    return generarMensajeTerrenoParadaRuta(p, modo, voiceProfile, cafeTexto);
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

    const horaSugeridaParada =
      reprogHora[contact.id]?.trim() ||
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
      },
      voiceProfile
    );

    await onUpdateContact(contact.id, {
      rsp: actualizado.rsp,
      adhirio: actualizado.adhirio,
      estadoFlujo: actualizado.estadoFlujo,
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

  const handleSendWA = (contact: Contact, text: string) => {
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
            triggerToast(`✅ Mensaje enviado a ${contact.primerNombre || contact.nombre}`);
          }
        } finally {
          setSendingId(null);
        }
      }
    }, 1000);

    setCountdownSending({ contactId: contact.id, secondsLeft: 3, timer });
  };

  const handleMarkFichasParada = async (contact: Contact, cant: 1 | 2 | 3) => {
    const xCant: 'X1' | 'X2' | 'X3' = cant === 1 ? 'X1' : cant === 3 ? 'X3' : 'X2';
    const actualizado = marcarEntregaFichasExtra(contact, xCant, Date.now());
    await onUpdateContact(contact.id, {
      rsp: actualizado.rsp,
      adhirio: actualizado.adhirio,
      estadoFlujo: 'PENDIENTE_RETIRO_FICHAS',
      comentario: actualizado.comentario,
      fechaAdhesion: actualizado.fechaAdhesion,
    });
    triggerToast(
      `✓ ${contact.primerNombre || contact.nombre}: Firmó y se dejaron X${cant} fichas (retiro en 1 semana)`
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
        const startHHMM = paradasConf[0]?.horaSalida || (mRange ? mRange[1] : '11:00');
        const endHHMM =
          paradasConf[paradasConf.length - 1]?.horaFinVisita || (mRange ? mRange[2] : '13:00');
        const padHHMM = (s: string) => {
          const [hh, mm] = s.split(':');
          return `${String(hh || '11').padStart(2, '0')}:${String(mm || '00').padStart(2, '0')}`;
        };
        const sTime = padHHMM(startHHMM);
        const eTime = padHHMM(endHHMM);

        // Extraer DD/MM de diaEtiqueta (ej: "MAÑANA · Martes 03/11")
        const mDate = (b.diaEtiqueta || '').match(/(\d{1,2})\/(\d{1,2})/);
        const yearNow = new Date().getFullYear();
        const fechaISO = mDate
          ? `${yearNow}-${String(mDate[2]).padStart(2, '0')}-${String(mDate[1]).padStart(2, '0')}`
          : new Date().toISOString().slice(0, 10);

        const descLines = confirmados.map((c) => {
          const p = paradasConf.find((pr) => pr.contact.id === c.id);
          const hora = p ? `${p.horaLlegada} hs: ` : '';
          return `• ${hora}#${c.id} ${c.nombreCompletoCorregido || c.nombre} (${c.calleOCruce || c.barrio})`;
        });

        return {
          id: `route-${fechaISO}-${b.barrio.toLowerCase().replace(/\s+/g, '-')}`,
          summary: `🏠 Recorrido Puerta a Puerta: ${b.barrio} (${confirmados.length} vecino${
            confirmados.length === 1 ? '' : 's'
          } confirmado${confirmados.length === 1 ? '' : 's'})`,
          location: b.puntoEncuentroODireccion || `${b.barrio}, CABA`,
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
    <div className="mx-auto w-full max-w-6xl min-w-0 overflow-x-hidden px-3 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
      {/* 1. Cabecera Principal con Conmutador Planificador vs Hoja de Ruta en Terreno + Escáner OCR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border-2 border-[#323232] bg-white p-4 sm:p-5 shadow-[4px_4px_0px_#323232]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold font-display text-[#323232]">
              Planificador Inteligente & Hoja de Ruta en Terreno
            </h2>
            <span className="rounded-lg bg-[#FFF06B] px-2.5 py-0.5 text-xs font-bold font-display text-[#323232] border border-[#323232]">
              {corteResultado.fechaHoraActualEtiqueta || 'Hoy'}
            </span>
          </div>
          <p className="text-xs font-medium text-[#5A5955] mt-1 max-w-2xl">
            En <strong className="text-[#323232]">1. Planificador de Propuestas</strong> enviás las propuestas por barrio y marcás quién confirmó. En{' '}
            <strong className="text-[#323232]">2. Hoja de Ruta en Terreno</strong> aparecen únicamente las citas confirmadas con{' '}
            <strong className="text-[#323232]">✓ Confirmó Cita</strong> (con 10 min de buffer entre paradas).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Switch de modo: Planificador de Propuestas vs Hoja de Ruta en Terreno */}
          <div className="flex flex-wrap items-center rounded-xl border-2 border-[#323232] bg-[#ECEAE2] p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveSubMode('planificador')}
              className={`rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-bold font-display transition ${
                activeSubMode === 'planificador'
                  ? 'bg-[#FFF06B] text-[#323232] border border-[#323232] shadow-[2px_2px_0px_#323232]'
                  : 'text-[#5A5955] hover:text-[#323232]'
              }`}
            >
              📋 1. Planificador de Propuestas
            </button>
            <button
              type="button"
              onClick={() => setActiveSubMode('terreno')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-bold font-display transition ${
                activeSubMode === 'terreno'
                  ? 'bg-[#29B8FF] text-[#323232] border border-[#323232] shadow-[2px_2px_0px_#323232]'
                  : 'text-[#5A5955] hover:text-[#323232]'
              }`}
            >
              <span>🚶‍♂️ 2. Hoja de Ruta en Terreno</span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold border border-[#323232] ${
                  totalConfirmadosDiaSeleccionado > 0
                    ? 'bg-emerald-200 text-emerald-950'
                    : 'bg-white text-[#5A5955]'
                }`}
              >
                {totalConfirmadosDiaSeleccionado} conf.
              </span>
            </button>
          </div>

          {onOpenScannerModal && (
            <button
              type="button"
              onClick={onOpenScannerModal}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#DFF4FF] px-3 py-2 text-xs font-bold font-display text-[#323232] hover:bg-[#29B8FF] transition shadow-[2px_2px_0px_#323232]"
              title="Escanear foto de ficha de adhesión física con IA para actualizar contactos"
            >
              <Camera className="h-4 w-4" />
              <span>Escanear Ficha</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefreshCorte}
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-bold font-display text-[#323232] hover:bg-[#ECEAE2] transition shadow-[2px_2px_0px_#323232]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Recalcular</span>
          </button>
        </div>
      </div>

      {/* 2. Selector de Día Operativo + Sincronización de Ruta con Google Calendar (SIEMPRE ARRIBA) */}
      {diasUnicos.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[#323232] bg-white px-4 py-3 shadow-[3px_3px_0px_#323232]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold font-display uppercase text-[#5A5955] mr-1">
              Día del recorrido:
            </span>
            {diasUnicos.map((dia) => {
              const isSelected = selectedDia === dia;
              const esHoy = /hoy/i.test(dia);

              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => setSelectedDia(dia)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] px-3.5 py-1.5 text-xs font-bold font-display transition-all ${
                    isSelected
                      ? 'bg-[#FFF06B] text-[#323232] shadow-[2px_2px_0px_#323232]'
                      : 'bg-white text-[#323232] hover:bg-[#ECEAE2]'
                  }`}
                >
                  {esHoy && (
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FF2C00] border border-[#323232]" />
                  )}
                  {dia}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSelectedDia('Todos')}
              className={`rounded-xl border-2 border-[#323232] px-3 py-1.5 text-xs font-bold font-display transition ${
                selectedDia === 'Todos'
                  ? 'bg-[#323232] text-[#FFF06B]'
                  : 'bg-white text-[#323232] hover:bg-[#ECEAE2]'
              }`}
            >
              Todos los días ({bloques.length})
            </button>
          </div>

          {totalConfirmadosDiaSeleccionado > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSyncConfirmedRouteToCalendar}
                disabled={syncingCalendarRoute}
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-emerald-200 px-3.5 py-1.5 text-xs font-bold font-display text-emerald-950 hover:bg-emerald-300 transition shadow-[2px_2px_0px_#323232]"
                title="Bloquear las franjas de este recorrido confirmado en el Calendario de la App y Google Calendar"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {syncingCalendarRoute
                    ? 'Sincronizando Calendar...'
                    : `📅 Agendar Ruta en Calendar (${totalConfirmadosDiaSeleccionado} conf.)`}
                </span>
              </button>
              {calendarQuickLinks.map((lnk, idx) => (
                <a
                  key={idx}
                  href={lnk.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-[#DFF4FF] px-2.5 py-1 text-[11px] font-bold text-[#323232] hover:bg-[#29B8FF]"
                  title={`Abrir "${lnk.summary}" en Google Calendar Web`}
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>GCal #{idx + 1}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. SECCIÓN COLAPSABLE: Citas Vencidas / Sin Confirmar para Reprogramar */}
      {alertasVencidos.length > 0 && (
        <div className="rounded-2xl border-2 border-[#323232] bg-[#F5817F]/25 p-3.5 sm:p-4 shadow-[3px_3px_0px_#323232] space-y-3">
          <div
            onClick={() => setShowVencidosSection((prev) => !prev)}
            className="flex cursor-pointer flex-wrap items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border-2 border-[#323232] bg-[#FF2C00] text-white">
                <AlertCircle className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold font-display text-[#323232]">
                  ⚠️ Prioridad 1: Citas Vencidas o Sin Concretar ({alertasVencidos.length})
                </h3>
                <p className="text-xs font-medium text-[#323232]/80">
                  Vecinos con fecha/hora pasada sin concretar. Tocá para {showVencidosSection ? 'ocultar' : 'desplegar y reprogramar'}.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-3 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#FFF06B]"
            >
              <span>{showVencidosSection ? 'Ocultar vencidas' : `Ver ${alertasVencidos.length} vencidas`}</span>
              {showVencidosSection ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          {showVencidosSection && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {alertasVencidos.slice(0, 6).map((c) => {
                const phone = c.tel || c.telRaw || c.telWA || '';
                const msgDisculpas =
                  c.alertaVencido?.mensajeDisculpasReprogramacion || c.mensajeSugerido || '';
                const waLink = crearEnlaceWhatsApp(phone, msgDisculpas);

                return (
                  <div
                    key={c.id}
                    className="rounded-xl border-2 border-[#323232] bg-white p-3.5 shadow-[2px_2px_0px_#323232] flex flex-col justify-between gap-2.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-xs font-bold text-[#323232]">
                          #{c.id} {c.nombreCompletoCorregido || c.nombre} ({c.barrio})
                        </span>
                        <span className="rounded bg-[#FF2C00] px-2 py-0.5 text-[10px] font-bold text-white">
                          {c.alertaVencido?.fechaVencida || 'Vencido'}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-[#5A5955] mt-1">
                        📍 {c.calleOCruce || c.comentario}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {onSendDirectWA && phone && (
                        <button
                          type="button"
                          onClick={() => handleSendWA(c, msgDisculpas)}
                          disabled={sendingId === c.id}
                          className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#FFF06B] px-2.5 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838]"
                        >
                          <Send className="h-3 w-3" />
                          <span>Enviar Disculpas + Reprogramar</span>
                        </button>
                      )}
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#F5F4F0] px-2.5 py-1 text-xs font-bold text-[#323232] hover:bg-[#ECEAE2]"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>wa.me</span>
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateContact(c.id, {
                            adhirio: 'Sí',
                            rsp: 'Sí',
                            estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-950"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Ya Firmó</span>
                      </button>
                      {onJumpToCandidate && (
                        <button
                          type="button"
                          onClick={() => onJumpToCandidate(c.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#323232]/40 bg-white px-2 py-1 text-[11px] font-bold text-[#323232] hover:bg-[#ECEAE2]"
                        >
                          <span>Editar</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
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
                          {bloque.franjaHoraria}
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
                      {/* Barra de Ajuste del Circuito (Cambiar entre Puerta a Puerta y Café Único del Circuito) */}
                      {!esSede && (
                        <div className="rounded-xl border-2 border-[#323232] bg-white p-3.5 shadow-[2px_2px_0px_#323232] space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold font-display text-[#323232]">
                                Modalidad del circuito:
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setBloqueModalidadOverride((prev) => ({
                                    ...prev,
                                    [bloque.id]: 'PUERTA_A_PUERTA',
                                    [getBloqueOverrideKey(bloque)]: 'PUERTA_A_PUERTA',
                                  }))
                                }
                                className={`inline-flex items-center gap-1.5 rounded-lg border border-[#323232] px-2.5 py-1 text-xs font-bold font-display ${
                                  modalidadActiva === 'PUERTA_A_PUERTA'
                                    ? 'bg-[#29B8FF] text-[#323232]'
                                    : 'bg-[#F5F4F0] text-[#5A5955]'
                                }`}
                              >
                                <span>🏠 Puerta a Puerta (10 min buffer)</span>
                                {(bloque.modalidadRecomendada === 'PUERTA_A_PUERTA' ||
                                  bloque.contactosIncluidos.length < 2) && (
                                  <span className="rounded bg-[#FFF06B] px-1.5 py-0.2 text-[10px] font-black text-[#323232] border border-[#323232]">
                                    ⭐ Recomendado
                                  </span>
                                )}
                              </button>
                              {bloque.cafesHubOpciones && bloque.cafesHubOpciones.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBloqueModalidadOverride((prev) => ({
                                      ...prev,
                                      [bloque.id]: 'CAFE_HUB',
                                      [getBloqueOverrideKey(bloque)]: 'CAFE_HUB',
                                    }))
                                  }
                                  className={`inline-flex items-center gap-1.5 rounded-lg border border-[#323232] px-2.5 py-1 text-xs font-bold font-display ${
                                    modalidadActiva === 'CAFE_HUB'
                                      ? 'bg-[#FFF06B] text-[#323232]'
                                      : 'bg-[#F5F4F0] text-[#5A5955]'
                                  }`}
                                >
                                  <span>☕ Convocar al Café Óptimo</span>
                                  {bloque.modalidadRecomendada === 'CAFE_HUB' && (
                                    <span className="rounded bg-[#323232] px-1.5 py-0.2 text-[10px] font-black text-[#FFF06B]">
                                      ⭐ Recomendado
                                    </span>
                                  )}
                                </button>
                              )}
                            </div>

                            {/* Café único recomendado para este circuito (por menor distancia geográfica real a los vecinos) */}
                            {bloque.cafesHubOpciones && bloque.cafesHubOpciones.length > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-[#5A5955]">
                                  Café más cercano al grupo:
                                </span>
                                <select
                                  value={
                                    cafeUnicoCircuito?.nombre || bloque.cafesHubOpciones[0].nombre
                                  }
                                  onChange={(e) => {
                                    const found = bloque.cafesHubOpciones?.find(
                                      (cf) => cf.nombre === e.target.value
                                    );
                                    if (found) {
                                      const val = {
                                        nombre: found.nombre,
                                        direccion: found.direccion,
                                      };
                                      setBloqueCafeOverride((prev) => ({
                                        ...prev,
                                        [bloque.id]: val,
                                        [getBloqueOverrideKey(bloque)]: val,
                                      }));
                                    }
                                  }}
                                  className="rounded-lg border-2 border-[#323232] bg-[#FFF06B]/40 px-2.5 py-1 text-xs font-bold text-[#323232]"
                                >
                                  {bloque.cafesHubOpciones.map((cf, i) => (
                                    <option key={cf.nombre} value={cf.nombre}>
                                      {i === 0 ? '⭐ Más cercano: ' : ''}
                                      {cf.nombre} ({cf.direccion.split(',')[0]} · ~
                                      {cf.minutosCaminando} min a pie)
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>

                          {/* Banner con la recomendación de eficiencia según ubicaciones, distancias y franjas horarias */}
                          {bloque.motivoRecomendacionModalidad && (
                            <div className="rounded-lg border border-[#323232]/25 bg-[#FFF06B]/30 px-3 py-2 text-xs font-semibold text-[#323232] flex items-start gap-2">
                              <span className="shrink-0 font-black">💡 Opción más eficiente:</span>
                              <span>{bloque.motivoRecomendacionModalidad}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ========================================================= */}
                      {/* MODO A: PLANIFICADOR DE PROPUESTAS & CONFIRMACIÓN 1-A-1   */}
                      {/* ========================================================= */}
                      {activeSubMode === 'planificador' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[#323232] font-display">
                              Propuestas Individuales y Consolidación de Confirmaciones
                            </h4>
                            <span className="text-[11px] font-semibold text-[#5A5955]">
                              Al marcar &ldquo;Confirmó&rdquo;, se habilita el botón &ldquo;Estoy en camino&rdquo; en la Hoja de Ruta.
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
                                className={`rounded-2xl border-2 p-4 shadow-[2px_2px_0px_#323232] space-y-3 transition-colors ${
                                  yaConfirmado
                                    ? 'border-emerald-700 bg-emerald-50/60'
                                    : 'border-[#323232] bg-white'
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="rounded bg-[#323232] px-2 py-0.5 font-mono text-xs font-bold text-[#FFF06B]">
                                      #{contact.id}
                                    </span>
                                    <h5 className="text-sm font-bold font-display text-[#323232]">
                                      {contact.nombreCompletoCorregido || contact.nombre}
                                    </h5>
                                    <span className="rounded-md bg-[#DFF4FF] px-2 py-0.5 text-xs font-bold text-[#323232] border border-[#323232]/40">
                                      📍 {contact.calleOCruce || contact.barrio}
                                    </span>
                                    {paradaRef && (
                                      <span className="rounded-md bg-[#FFF06B] px-2 py-0.5 font-mono text-xs font-bold text-[#323232] border border-[#323232]">
                                        {yaConfirmado ? 'Horario en Ruta:' : 'Horario sugerido:'}{' '}
                                        {paradaRef.horaLlegada} hs
                                      </span>
                                    )}
                                    {contact.alertaVencido?.activa && (
                                      <span className="rounded-md bg-[#FF2C00] px-2 py-0.5 text-xs font-bold text-white border border-[#323232]">
                                        ⚠️ Fecha vencida ({contact.alertaVencido.fechaVencida || 'pasada'}) · Reprogramar
                                      </span>
                                    )}
                                    {yaConfirmado ? (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white border border-[#323232] shadow-[1px_1px_0px_#323232]">
                                        ✓ Confirmado 1-a-1 (En Hoja de Ruta)
                                      </span>
                                    ) : (
                                      <span className="rounded-md bg-[#ECEAE2] px-2 py-0.5 text-[11px] font-bold text-[#5A5955] border border-[#323232]/30">
                                        Pendiente de confirmar cita
                                      </span>
                                    )}
                                  </div>

                                  {onJumpToCandidate && (
                                    <button
                                      type="button"
                                      onClick={() => onJumpToCandidate(contact.id)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-[#F5F4F0] px-2.5 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#FFF06B]"
                                    >
                                      <span>Abrir en Candidatos</span>
                                      <ArrowRight className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>

                                <p className="text-xs text-[#5A5955] font-medium">
                                  Comentario: &ldquo;{contact.comentario || 'Sin comentario'}&rdquo;
                                </p>

                                {yaConfirmado && !isEditingConfirmed ? (
                                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-emerald-700 bg-emerald-100/80 px-3.5 py-2.5">
                                    <span className="text-xs font-bold text-emerald-950">
                                      ✅ Cita confirmada y sincronizada con Candidatos y con 2. Hoja de Ruta en Terreno.
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setActiveSubMode('terreno')}
                                        className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#29B8FF] px-3 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#1aa8f0] shadow-[2px_2px_0px_#323232]"
                                      >
                                        <Navigation className="h-3.5 w-3.5" />
                                        <span>🚶‍♂️ Ver en 2. Hoja de Ruta en Terreno</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          abrirEdicionPlanContacto(contact, bloque, paradaRef)
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#FFF06B] px-2.5 py-1 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] shadow-[1px_1px_0px_#323232]"
                                      >
                                        <span>✏️ Cambiar Planificación (Día / Hora / Lugar)</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleQuitarConfirmacionPlanificador(contact)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-[#323232] bg-white px-2.5 py-1 text-xs font-bold text-[#FF2C00] hover:bg-[#F5817F]/20"
                                        title="Quitar de la Hoja de Ruta en Terreno"
                                      >
                                        <span>↺ Quitar confirmación</span>
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
                                        <select
                                          value={reprogModalidad[contact.id] || 'PUERTA_A_PUERTA'}
                                          onChange={(e) =>
                                            setReprogModalidad((prev) => ({
                                              ...prev,
                                              [contact.id]: e.target.value as
                                                | 'PUERTA_A_PUERTA'
                                                | 'CAFE_HUB',
                                            }))
                                          }
                                          className="w-full rounded-lg border-2 border-[#323232] bg-[#FFF06B]/50 px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                                        >
                                          <option value="PUERTA_A_PUERTA">
                                            🏠 Pasar por su Domicilio
                                          </option>
                                          <option value="CAFE_HUB">
                                            ☕ Encuentro en Café Hub
                                          </option>
                                        </select>
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
                                          <select
                                            value={
                                              reprogCafe[contact.id] ||
                                              `${bloque.cafesHubOpciones[0].nombre} (${
                                                bloque.cafesHubOpciones[0].direccion.split(',')[0]
                                              })`
                                            }
                                            onChange={(e) =>
                                              setReprogCafe((prev) => ({
                                                ...prev,
                                                [contact.id]: e.target.value,
                                              }))
                                            }
                                            className="w-full rounded-lg border-2 border-[#323232] bg-[#F5F4F0] px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                                          >
                                            {bloque.cafesHubOpciones.map((cf) => {
                                              const val = `${cf.nombre} (${
                                                cf.direccion.split(',')[0]
                                              })`;
                                              return (
                                                <option key={cf.nombre} value={val}>
                                                  {val}
                                                </option>
                                              );
                                            })}
                                          </select>
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
                                            onClick={() => handleSendWA(contact, textoProp)}
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
                                            Llegada {parada.horaLlegada} hs (Salida{' '}
                                            {parada.horaSalida} · Fin {parada.horaFinVisita})
                                          </span>
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

                                    {/* Botones de Navegación Maps + Estado de Confirmación */}
                                    <div className="flex flex-wrap items-center gap-2 self-end lg:self-auto shrink-0">
                                      <a
                                        href={parada.urlGoogleMapsTramo}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#29B8FF] px-3 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#1aa8f0] shadow-[2px_2px_0px_#323232]"
                                        title="Abrir indicaciones paso a paso en Google Maps desde la parada anterior"
                                      >
                                        <MapPin className="h-3.5 w-3.5" />
                                        <span>Abrir Tramo en Maps</span>
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
                                          title="La visita aún no figura confirmada 1-a-1. Tocá para confirmar/desbloquear 'Estoy en camino'."
                                        >
                                          <Lock className="h-3.5 w-3.5 text-[#FF2C00]" />
                                          <span>Sin confirmar (Desbloquear En Camino)</span>
                                        </button>
                                      ) : (
                                        <>
                                          <span className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-950">
                                            <Unlock className="h-3.5 w-3.5 text-emerald-700" />
                                            <span>Cita Confirmada</span>
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
                                            className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] shadow-[2px_2px_0px_#323232]"
                                          >
                                            <span>
                                              {editingConfirmedIds[c.id]
                                                ? '✕ Cerrar Edición'
                                                : '✏️ Cambiar Plan / Horario'}
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
                                          <select
                                            value={reprogModalidad[c.id] || 'PUERTA_A_PUERTA'}
                                            onChange={(e) =>
                                              setReprogModalidad((prev) => ({
                                                ...prev,
                                                [c.id]: e.target.value as
                                                  | 'PUERTA_A_PUERTA'
                                                  | 'CAFE_HUB',
                                              }))
                                            }
                                            className="w-full rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                                          >
                                            <option value="PUERTA_A_PUERTA">
                                              🏠 Pasar por su Domicilio
                                            </option>
                                            <option value="CAFE_HUB">
                                              ☕ Encuentro en Café Hub
                                            </option>
                                          </select>
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
                                            <select
                                              value={
                                                reprogCafe[c.id] ||
                                                `${bloque.cafesHubOpciones[0].nombre} (${
                                                  bloque.cafesHubOpciones[0].direccion.split(',')[0]
                                                })`
                                              }
                                              onChange={(e) =>
                                                setReprogCafe((prev) => ({
                                                  ...prev,
                                                  [c.id]: e.target.value,
                                                }))
                                              }
                                              className="w-full rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                                            >
                                              {bloque.cafesHubOpciones.map((cf) => {
                                                const val = `${cf.nombre} (${
                                                  cf.direccion.split(',')[0]
                                                })`;
                                                return (
                                                  <option key={cf.nombre} value={val}>
                                                    {val}
                                                  </option>
                                                );
                                              })}
                                            </select>
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
                                      <select
                                        value={modoActual}
                                        onChange={(e) => {
                                          const nextModo = e.target.value as ModoMensajeTerrenoRuta;
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
                                        className="rounded-lg border-2 border-[#323232] bg-white px-2.5 py-1 text-xs font-bold text-[#323232]"
                                      >
                                        {MODOS_MENSAJE_TERRENO.map((m) => (
                                          <option key={m.value} value={m.value}>
                                            {m.label}
                                          </option>
                                        ))}
                                      </select>
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
                                          className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-emerald-100 px-3 py-1.5 text-xs font-bold font-display text-emerald-950 hover:bg-emerald-200 shadow-[2px_2px_0px_#323232]"
                                        >
                                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                                          <span>✓ Firmó</span>
                                        </button>

                                        {([1, 2, 3] as const).map((cant) => (
                                          <button
                                            key={cant}
                                            type="button"
                                            onClick={() => handleMarkFichasParada(c, cant)}
                                            className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-[#DFF4FF] px-2 py-1.5 text-[11px] font-bold font-display text-[#323232] hover:bg-[#29B8FF]"
                                            title="Dejar fichas extra para retirar en 1 semana"
                                          >
                                            <FilePlus2 className="h-3 w-3" />
                                            <span>+X{cant} (1 sem)</span>
                                          </button>
                                        ))}

                                        {onJumpToCandidate && (
                                          <button
                                            type="button"
                                            onClick={() => onJumpToCandidate(c.id)}
                                            className="rounded-xl border border-[#323232] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#323232] hover:bg-[#ECEAE2]"
                                          >
                                            Editar ficha
                                          </button>
                                        )}
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
