import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Coffee,
  Navigation,
  Send,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  MessageSquare,
  Play,
  Pause,
  Square,
  ArrowUpDown,
  SlidersHorizontal,
  ShieldCheck,
  CheckSquare,
  Square as SquareIcon,
  Layers,
  ChevronRight,
  Footprints,
  Eye,
  Edit3,
  Flame,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  BloqueAgendaRecomendado,
  CalendarEventItem,
  Contact,
  CorteResultado,
  MicroCluster,
  ModalidadEncuentroAgenda,
  ParadaRuta,
  TipoPlantillaWA,
  VoiceProfile,
} from '../../types';
import {
  crearEnlaceWhatsApp,
  generarMensajeContextual,
  normalizarTelefonoWA,
  obtenerEtiquetaEstadoFlujo,
} from '../../utils/logic';
import {
  CATALOGO_CAFES_HUB_CABA,
  CafeHubCurado,
  listarCafesHubCercanos,
  buscarCafeHubMasCercano,
} from '../../data/cafesHubCatalog';
import { InteractiveMapPanel } from '../InteractiveMapPanel';

export interface SmartTerritoryPlanningViewProps {
  initialSubView?: 'itinerario' | 'mapa';
  contacts: Contact[];
  clusters: MicroCluster[];
  profile: VoiceProfile;
  calendarEvents: CalendarEventItem[];
  corteResultado: CorteResultado;
  whatsAppStatus: string;
  whatsAppReady: boolean;
  onRefreshCorte: () => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => Promise<void> | void;
  onSendDirectWA?: (
    phone: string,
    text: string,
    contactId: string,
    nombre: string,
    barrio: string,
    tipoPlantilla?: string
  ) => Promise<boolean>;
  onSelectContactForEdit: (contact: Contact) => void;
  onNavigateToWhatsApp?: () => void;
}

// Estados locales de campaña automatizada de propuestas
interface CampanaProgresoEstado {
  activa: boolean;
  pausada: boolean;
  bloqueId: string;
  total: number;
  enviados: number;
  indiceActual: number;
  contactosCola: {
    contact: Contact;
    mensaje: string;
    horaEstimada: string;
  }[];
  segundosRestantesProximo: number;
  logEnvios: {
    nombre: string;
    telefono: string;
    hora: string;
    exito: boolean;
    detalle: string;
  }[];
}

export const SmartTerritoryPlanningView: React.FC<SmartTerritoryPlanningViewProps> = ({
  initialSubView = 'itinerario',
  contacts,
  clusters,
  profile,
  calendarEvents,
  corteResultado,
  whatsAppStatus,
  whatsAppReady,
  onRefreshCorte,
  onUpdateContact,
  onSendDirectWA,
  onSelectContactForEdit,
  onNavigateToWhatsApp,
}) => {
  // --------------------------------------------------------------------------
  // 1. Navegación Unificada de Subvistas: Itinerario & Campaña vs. Mapa Territorial
  // --------------------------------------------------------------------------
  const [subView, setSubView] = useState<'itinerario' | 'mapa'>(initialSubView);
  const [activeBloqueIdEnMapa, setActiveBloqueIdEnMapa] = useState<string | null>(null);

  // Sincronizar subView si cambia initialSubView externamente
  useEffect(() => {
    if (initialSubView) {
      setSubView(initialSubView);
    }
  }, [initialSubView]);

  // --------------------------------------------------------------------------
  // 2. Filtro y Selección de Día de Planificación
  // --------------------------------------------------------------------------
  const rawBloques = corteResultado.agendaSugeridaDias || [];

  const diasDisponibles = useMemo(() => {
    const list: string[] = [];
    for (const b of rawBloques) {
      if (b.diaEtiqueta && !list.includes(b.diaEtiqueta)) {
        list.push(b.diaEtiqueta);
      }
    }
    return list;
  }, [rawBloques]);

  const [selectedDia, setSelectedDia] = useState<string>(() => diasDisponibles[0] || 'Todos');

  // Si se actualizan los bloques y el día actual no existe, reajustar
  useEffect(() => {
    if (diasDisponibles.length > 0 && selectedDia !== 'Todos' && !diasDisponibles.includes(selectedDia)) {
      setSelectedDia(diasDisponibles[0]);
    }
  }, [diasDisponibles, selectedDia]);

  // --------------------------------------------------------------------------
  // 3. Ajustes Manuales del Planificador por Bloque (Fase 2)
  // --------------------------------------------------------------------------
  // Hora de salida base personalizada por bloque: { [bloqueId]: "10:30" }
  const [horaInicioOverrides, setHoraInicioOverrides] = useState<Record<string, string>>({});
  // Modalidad personalizada por bloque: { [bloqueId]: "CAFE_HUB" | "PUERTA_A_PUERTA" | "EVENTO_SEDE" }
  const [modalidadOverrides, setModalidadOverrides] = useState<Record<string, ModalidadEncuentroAgenda>>({});
  // Café HUB personalizado por bloque: { [bloqueId]: CafeHubCurado }
  const [cafeOverrides, setCafeOverrides] = useState<Record<string, CafeHubCurado>>({});
  // Contactos excluidos de la campaña por bloque: { [bloqueId]: Set<contactId> }
  const [contactosExcluidosPorBloque, setContactosExcluidosPorBloque] = useState<Record<string, string[]>>({});
  // Contactos reordenados por bloque: { [bloqueId]: contactId[] }
  const [ordenContactosPorBloque, setOrdenContactosPorBloque] = useState<Record<string, string[]>>({});
  // Mensajes de propuesta personalizados editados a mano: { [contactId]: string }
  const [mensajesPropuestaEditados, setMensajesPropuestaEditados] = useState<Record<string, string>>({});

  // Bloque desplegado
  const [expandedBloqueId, setExpandedBloqueId] = useState<string | null>(() => rawBloques[0]?.id || null);

  // Estados visuales de interacción
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [editingMessageContactId, setEditingMessageContactId] = useState<string | null>(null);
  const [selectorCafeAbiertoBloqueId, setSelectorCafeAbiertoBloqueId] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // 4. Bloques Calculados Dinámicamente con Ajustes del Planificador
  // --------------------------------------------------------------------------
  const bloquesAjustados = useMemo(() => {
    return rawBloques.map((bloque) => {
      const horaBase = horaInicioOverrides[bloque.id] || bloque.horaInicioCalculada || '10:30';
      const modalidad = modalidadOverrides[bloque.id] || bloque.modalidad || 'PUERTA_A_PUERTA';
      const cafeElegido = cafeOverrides[bloque.id];

      // Exclusiones y reordenamientos
      const excluidos = new Set(contactosExcluidosPorBloque[bloque.id] || []);
      const ordenCustom = ordenContactosPorBloque[bloque.id];

      let listaContactos = [...bloque.contactosIncluidos];
      if (ordenCustom && ordenCustom.length > 0) {
        listaContactos.sort((a, b) => {
          const idxA = ordenCustom.indexOf(a.id);
          const idxB = ordenCustom.indexOf(b.id);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return 0;
        });
      }

      // Re-sincronizar contactos con la lista global en vivo para reflejar firmas o confirmaciones recientes
      const contactosSincronizados = listaContactos.map((c) => {
        const globalContact = contacts.find((gc) => gc.id === c.id);
        return globalContact || c;
      });

      // Calcular paradas secuenciales y tiempos estimados de llegada
      let [currentH, currentM] = horaBase.split(':').map((v) => parseInt(v, 10) || 0);

      const paradasRecalculadas = contactosSincronizados.map((c, idx) => {
        const horaLlegada = `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`;
        // Visita promedio: 15 minutos en puerta a puerta, 20 en café hub
        const duracionVisita = modalidad === 'CAFE_HUB' ? 20 : 15;
        const duracionTraslado = idx === 0 ? 0 : 8; // ~8 minutos promedio caminando en microcluster

        currentM += duracionTraslado;
        if (currentM >= 60) {
          currentH += Math.floor(currentM / 60);
          currentM = currentM % 60;
        }

        const horaLlegadaEstimada = `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`;
        currentM += duracionVisita;
        if (currentM >= 60) {
          currentH += Math.floor(currentM / 60);
          currentM = currentM % 60;
        }
        const horaFinVisita = `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`;

        return {
          orden: idx + 1,
          contact: c,
          horaLlegada: horaLlegadaEstimada,
          horaFinVisita,
          excluidoDeCampana: excluidos.has(c.id),
        };
      });

      const puntoEncuentroFinal =
        modalidad === 'CAFE_HUB'
          ? cafeElegido
            ? `${cafeElegido.nombre} (${cafeElegido.direccion})`
            : bloque.puntoEncuentroODireccion
          : modalidad === 'EVENTO_SEDE'
          ? profile.sedeCentral || 'Chile 1408, Monserrat'
          : bloque.puntoEncuentroODireccion;

      return {
        ...bloque,
        horaInicioEfectiva: horaBase,
        modalidadEfectiva: modalidad,
        cafeElegidoEfectivo: cafeElegido,
        puntoEncuentroEfectivo: puntoEncuentroFinal,
        paradasAjustadas: paradasRecalculadas,
        contactosAjustados: contactosSincronizados,
      };
    });
  }, [
    rawBloques,
    horaInicioOverrides,
    modalidadOverrides,
    cafeOverrides,
    contactosExcluidosPorBloque,
    ordenContactosPorBloque,
    contacts,
    profile.sedeCentral,
  ]);

  // Filtrar bloques según el día seleccionado
  const bloquesFiltrados = useMemo(() => {
    if (selectedDia === 'Todos') return bloquesAjustados;
    return bloquesAjustados.filter((b) => b.diaEtiqueta === selectedDia);
  }, [bloquesAjustados, selectedDia]);

  // --------------------------------------------------------------------------
  // 5. KPIs y Métricas Ejecutivas del Módulo de Planificación
  // --------------------------------------------------------------------------
  const resumenKPIs = useMemo(() => {
    let totalContactosEnCircuito = 0;
    let confirmados = 0;
    let esperandoRespuesta = 0;
    let reprogramar = 0;
    let firmaron = 0;

    for (const b of bloquesFiltrados) {
      for (const p of b.paradasAjustadas) {
        totalContactosEnCircuito += 1;
        const c = p.contact;
        const isSigned = c.adhirio === 'Sí' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK';
        if (isSigned) {
          firmaron += 1;
        } else if (c.estadoFlujo === 'ENCUENTRO_CONFIRMADO') {
          confirmados += 1;
        } else if (
          c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
          (c.comentario && /propuesta\s+enviada/i.test(c.comentario))
        ) {
          esperandoRespuesta += 1;
        } else if (c.estadoFlujo === 'POSTERGO_SALUD_O_VIAJE') {
          reprogramar += 1;
        }
      }
    }

    return {
      totalContactosEnCircuito,
      totalCircuitos: bloquesFiltrados.length,
      confirmados,
      esperandoRespuesta,
      reprogramar,
      firmaron,
    };
  }, [bloquesFiltrados]);

  // --------------------------------------------------------------------------
  // 6. Generador Inteligente de Mensaje de Propuesta de Visita
  // --------------------------------------------------------------------------
  const getPropuestaMensaje = useCallback(
    (
      contact: Contact,
      bloque: typeof bloquesAjustados[0],
      horaEstimada: string
    ): string => {
      if (mensajesPropuestaEditados[contact.id]) {
        return mensajesPropuestaEditados[contact.id];
      }

      const primerNombre = contact.primerNombre || contact.nombre?.split(' ')[0] || '';
      const saludo = primerNombre ? `Hola, ${primerNombre}` : 'Hola';
      const diaTexto = bloque.diaEtiqueta || 'esta semana';
      const promotor = `${profile.nombrePromotor || 'César'} ${profile.apellidoPromotor || 'Biondini'}`.trim();
      const espacio = profile.espacioPolitico || 'Popurrí CABA';
      const partido = profile.partidoLegal || 'Partido Popurrí';

      const posdataNombre = contact.sinNombre
        ? '\n\n_(Al pasar los teléfonos me quedó en blanco tu nombre; ¿me recordarías tu nombre y apellido así te agendo bien?)_'
        : '';

      if (bloque.modalidadEfectiva === 'CAFE_HUB') {
        const cafeNom = bloque.cafeElegidoEfectivo?.nombre || 'el Café HUB de la zona';
        const cafeDir = bloque.cafeElegidoEfectivo?.direccion ? ` (${bloque.cafeElegidoEfectivo.direccion})` : '';
        return `${saludo}, ¿cómo estás? Te escribe ${promotor}, de *${espacio}*.\n\nEstoy armando la coordinación territorial en *${bloque.barrio}* y quería proponerte encontrarnos este *${diaTexto}* alrededor de las *${horaEstimada} hs* en *${cafeNom}*${cafeDir} para sumar tu firma de adhesión para constituir el partido (*${partido}*).\n\nSon 2 minutos de charla y firma en papel (acordate de tener a mano el DNI físico de CABA). ¿Me confirmás si te viene bien ese horario o preferís coordinar en otro momento?${posdataNombre}`;
      }

      if (bloque.modalidadEfectiva === 'EVENTO_SEDE') {
        const sedeDir = profile.sedeCentral || 'Chile 1408, Monserrat';
        return `${saludo}, ¿cómo estás? Te escribe ${promotor}, de *${espacio}*.\n\nTe propongo sumarte este *${diaTexto}* a las *${horaEstimada} hs* en la sede central (*${sedeDir}*) para la reunión semanal y sumar tu firma de adhesión ciudadana en papel (*${partido}*).\n\n¿Te queda cómodo acercarte? Avisame sin compromiso.${posdataNombre}`;
      }

      // Puerta a Puerta por defecto
      const dirContacto = contact.calleOCruce ? `pasar 2 minutos por *${contact.calleOCruce}*` : `pasar por tu cuadra en *${contact.barrio || 'el barrio'}*`;
      return `${saludo}, ¿cómo estás? Te escribe ${promotor}, de *${espacio}*.\n\nEstoy cerrando el recorrido de visitas por *${bloque.barrio}* y quería proponerte ${dirContacto} este *${diaTexto}* alrededor de las *${horaEstimada} hs* para sumar tu firma de adhesión en papel (*${partido}*).\n\nAcordate sólo de tener a mano el DNI físico de CABA. ¿Me confirmás si te queda bien esa franja horaria o en qué momento te resulta más cómodo?${posdataNombre}`;
    },
    [mensajesPropuestaEditados, profile]
  );

  // --------------------------------------------------------------------------
  // 7. Difusión Automatizada de Campaña (Fase 3: Campaña de Propuestas)
  // --------------------------------------------------------------------------
  const [campanaEstado, setCampanaEstado] = useState<CampanaProgresoEstado>({
    activa: false,
    pausada: false,
    bloqueId: '',
    total: 0,
    enviados: 0,
    indiceActual: 0,
    contactosCola: [],
    segundosRestantesProximo: 0,
    logEnvios: [],
  });

  // Estados para validación visual de WhatsApp Web y Reprogramación in-situ
  const [showWarnWhatsAppModal, setShowWarnWhatsAppModal] = useState<{
    bloqueNombre: string;
    totalPendientes: number;
    bloque: typeof bloquesAjustados[0];
  } | null>(null);

  const [reprogramandoItem, setReprogramandoItem] = useState<{
    contact: Contact;
    horaLlegada: string;
  } | null>(null);
  const [motivoReprogramacionInput, setMotivoReprogramacionInput] = useState<string>('');

  const campanaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Iniciar campaña de difusión masiva para un bloque
  const handleIniciarCampanaBloque = (bloque: typeof bloquesAjustados[0]) => {
    // Filtrar contactos no excluidos y no firmados
    const candidatos = bloque.paradasAjustadas.filter((p) => {
      const isSigned = p.contact.adhirio === 'Sí' || p.contact.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK';
      return !p.excluidoDeCampana && !isSigned;
    });

    if (candidatos.length === 0) {
      alert('No hay contactos pendientes de propuesta para enviar en este bloque.');
      return;
    }

    // Validación visual de WhatsApp Web: si no está conectado, advertir al usuario y ofrecer opciones
    if (!whatsAppReady) {
      setShowWarnWhatsAppModal({
        bloqueNombre: bloque.nombre,
        totalPendientes: candidatos.length,
        bloque,
      });
      return;
    }

    const cola = candidatos.map((p) => ({
      contact: p.contact,
      mensaje: getPropuestaMensaje(p.contact, bloque, p.horaLlegada),
      horaEstimada: p.horaLlegada,
    }));

    setCampanaEstado({
      activa: true,
      pausada: false,
      bloqueId: bloque.id,
      total: cola.length,
      enviados: 0,
      indiceActual: 0,
      contactosCola: cola,
      segundosRestantesProximo: 2, // Primer envío casi inmediato
      logEnvios: [],
    });
  };

  // Temporizador de despacho anti-ban para la campaña activa
  useEffect(() => {
    if (!campanaEstado.activa || campanaEstado.pausada) {
      if (campanaTimerRef.current) clearInterval(campanaTimerRef.current);
      return;
    }

    campanaTimerRef.current = setInterval(async () => {
      setCampanaEstado((prev) => {
        if (!prev.activa || prev.pausada) return prev;

        if (prev.segundosRestantesProximo > 1) {
          return { ...prev, segundosRestantesProximo: prev.segundosRestantesProximo - 1 };
        }

        // Momento de enviar el contacto en indiceActual
        const itemActual = prev.contactosCola[prev.indiceActual];
        if (!itemActual) {
          // Campaña terminada
          return { ...prev, activa: false, segundosRestantesProximo: 0 };
        }

        void (async () => {
          const ahora = new Date();
          const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
          const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

          let exito = false;
          let detalle = '';

          try {
            if (whatsAppReady && onSendDirectWA) {
              exito = await onSendDirectWA(
                itemActual.contact.tel || itemActual.contact.telRaw,
                itemActual.mensaje,
                itemActual.contact.id,
                itemActual.contact.nombre,
                itemActual.contact.barrio,
                'propuesta_visita'
              );
              detalle = exito ? 'Enviado por WhatsApp Web' : 'Fallo en la conexión WA';
            } else {
              // Modo enlace manual / no conectado
              detalle = 'Generado para envío manual (WA Web no listo)';
              exito = true;
            }

            // Actualizar estado dinámicamente (Fase 4)
            const baseCom = (itemActual.contact.comentario || '')
              .replace(/\s*\[Propuesta enviada el [^\]]+\]/g, '')
              .trim();
            const nuevoComentario = baseCom
              ? `${baseCom} [Propuesta enviada el ${ddmm} a las ${hhmm} hs para las ${itemActual.horaEstimada} hs]`
              : `[Propuesta enviada el ${ddmm} a las ${hhmm} hs para las ${itemActual.horaEstimada} hs]`;

            void onUpdateContact(itemActual.contact.id, {
              estadoFlujo: 'PASO_DATOS_FALTA_CONFIRMAR',
              comentario: nuevoComentario,
              primerContactoEnviado: true,
              actualizadoEnAppAt: ahora.toISOString(),
            });
          } catch (err: any) {
            detalle = err?.message || 'Error en envío';
            exito = false;
          }

          // Intervalo seguro anti-ban aleatorizado entre 18 y 35 segundos
          const proximoDelay = Math.floor(Math.random() * (35 - 18 + 1)) + 18;

          setCampanaEstado((p2) => {
            const nextIdx = p2.indiceActual + 1;
            const finalizada = nextIdx >= p2.contactosCola.length;
            const logItem = {
              nombre: itemActual.contact.nombre,
              telefono: itemActual.contact.tel || itemActual.contact.telRaw,
              hora: hhmm,
              exito,
              detalle,
            };

            return {
              ...p2,
              enviados: p2.enviados + (exito ? 1 : 0),
              indiceActual: nextIdx,
              activa: !finalizada,
              segundosRestantesProximo: finalizada ? 0 : proximoDelay,
              logEnvios: [logItem, ...p2.logEnvios],
            };
          });
        })();

        return { ...prev, segundosRestantesProximo: 999 }; // Lock temporal mientras corre el fetch
      });
    }, 1000);

    return () => {
      if (campanaTimerRef.current) clearInterval(campanaTimerRef.current);
    };
  }, [campanaEstado.activa, campanaEstado.pausada, whatsAppReady, onSendDirectWA, onUpdateContact]);

  // Envío individual directo de propuesta (1-a-1)
  const handleEnviarPropuestaIndividual = async (
    contact: Contact,
    bloque: typeof bloquesAjustados[0],
    horaEstimada: string
  ) => {
    const texto = getPropuestaMensaje(contact, bloque, horaEstimada);
    const ahora = new Date();
    const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    if (whatsAppReady && onSendDirectWA) {
      const ok = await onSendDirectWA(
        contact.tel || contact.telRaw,
        texto,
        contact.id,
        contact.nombre,
        contact.barrio,
        'propuesta_visita'
      );
      if (ok) {
        const baseCom = (contact.comentario || '')
          .replace(/\s*\[Propuesta enviada el [^\]]+\]/g, '')
          .trim();
        const nuevoComentario = baseCom
          ? `${baseCom} [Propuesta enviada el ${ddmm} a las ${hhmm} hs para las ${horaEstimada} hs]`
          : `[Propuesta enviada el ${ddmm} a las ${hhmm} hs para las ${horaEstimada} hs]`;

        await onUpdateContact(contact.id, {
          estadoFlujo: 'PASO_DATOS_FALTA_CONFIRMAR',
          comentario: nuevoComentario,
          primerContactoEnviado: true,
          actualizadoEnAppAt: ahora.toISOString(),
        });
      }
    } else {
      const url = crearEnlaceWhatsApp(contact.tel || contact.telRaw, texto);
      window.open(url, '_blank');

      const baseCom = (contact.comentario || '')
        .replace(/\s*\[Propuesta enviada el [^\]]+\]/g, '')
        .trim();
      const nuevoComentario = baseCom
        ? `${baseCom} [Propuesta enviada el ${ddmm} a las ${hhmm} hs para las ${horaEstimada} hs]`
        : `[Propuesta enviada el ${ddmm} a las ${hhmm} hs para las ${horaEstimada} hs]`;

      await onUpdateContact(contact.id, {
        estadoFlujo: 'PASO_DATOS_FALTA_CONFIRMAR',
        comentario: nuevoComentario,
        primerContactoEnviado: true,
        actualizadoEnAppAt: ahora.toISOString(),
      });
    }
  };

  // --------------------------------------------------------------------------
  // 8. Fase de Confirmación Dinámica (Fase 4: Confirmaciones y Semáforo)
  // --------------------------------------------------------------------------
  const handleConfirmarPropuesta = async (contact: Contact, horaEstimada?: string) => {
    const ahora = new Date();
    const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const tagHora = horaEstimada ? ` para las ${horaEstimada} hs` : '';

    // Si ya estaba confirmado, permitir alternar/desmarcar
    if (contact.estadoFlujo === 'ENCUENTRO_CONFIRMADO') {
      const baseCom = (contact.comentario || '')
        .replace(/\s*\[Confirmó propuesta [^\]]+\]/g, '')
        .trim();
      await onUpdateContact(contact.id, {
        estadoFlujo: 'PASO_DATOS_FALTA_CONFIRMAR',
        comentario: baseCom,
        actualizadoEnAppAt: ahora.toISOString(),
      });
      return;
    }

    const baseCom = (contact.comentario || '')
      .replace(/\s*\[Confirmó propuesta [^\]]+\]/g, '')
      .trim();
    const nuevoComentario = baseCom
      ? `${baseCom} [Confirmó propuesta el ${ddmm} a las ${hhmm} hs${tagHora}]`
      : `[Confirmó propuesta el ${ddmm} a las ${hhmm} hs${tagHora}]`;

    await onUpdateContact(contact.id, {
      estadoFlujo: 'ENCUENTRO_CONFIRMADO',
      rsp: 'Sí',
      comentario: nuevoComentario,
      actualizadoEnAppAt: ahora.toISOString(),
    });
  };

  const handleReprogramarPropuesta = async (contact: Contact, motivo: string) => {
    const ahora = new Date();
    const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    const baseCom = (contact.comentario || '')
      .replace(/\s*\[Reprogramar: [^\]]+\]/g, '')
      .trim();
    const nuevoComentario = baseCom
      ? `${baseCom} [Reprogramar: ${motivo} (${ddmm} ${hhmm} hs)]`
      : `[Reprogramar: ${motivo} (${ddmm} ${hhmm} hs)]`;

    await onUpdateContact(contact.id, {
      estadoFlujo: 'POSTERGO_SALUD_O_VIAJE',
      comentario: nuevoComentario,
      actualizadoEnAppAt: ahora.toISOString(),
    });
  };

  const handleDeshacerReprogramacion = async (contact: Contact) => {
    const ahora = new Date();
    const baseCom = (contact.comentario || '')
      .replace(/\s*\[Reprogramar: [^\]]+\]/g, '')
      .trim();

    await onUpdateContact(contact.id, {
      estadoFlujo: 'PASO_DATOS_FALTA_CONFIRMAR',
      comentario: baseCom,
      actualizadoEnAppAt: ahora.toISOString(),
    });
    setReprogramandoItem(null);
  };

  // Semáforo de Firma (Rojo ✗ No firmó / Verde Oscuro ✓ Firmó)
  const handleToggleFirmaSemaforo = async (contact: Contact) => {
    const isSigned = contact.adhirio === 'Sí' || contact.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK';
    const ahora = new Date();
    const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    if (isSigned) {
      // Revertir a pendiente
      const baseCom = (contact.comentario || '')
        .replace(/\s*\[Firmó el [^\]]+\]/g, '')
        .trim();
      await onUpdateContact(contact.id, {
        adhirio: 'Pendiente',
        estadoFlujo: 'ENCUENTRO_CONFIRMADO',
        comentario: baseCom,
        actualizadoEnAppAt: ahora.toISOString(),
      });
    } else {
      // Marcar firmado oficialmente
      const baseCom = (contact.comentario || '')
        .replace(/\s*\[Firmó el [^\]]+\]/g, '')
        .trim();
      const nuevoComentario = baseCom
        ? `${baseCom} [Firmó el ${ddmm} a las ${hhmm} hs]`
        : `[Firmó el ${ddmm} a las ${hhmm} hs]`;

      await onUpdateContact(contact.id, {
        adhirio: 'Sí',
        estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
        comentario: nuevoComentario,
        actualizadoEnAppAt: ahora.toISOString(),
      });
    }
  };

  // Helper de copia en portapapeles
  const handleCopyText = (contactId: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiadoId(contactId);
    setTimeout(() => setCopiadoId(null), 2500);
  };

  // --------------------------------------------------------------------------
  // 9. RENDER PRINCIPAL
  // --------------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* CABECERA CONSOLIDADA & SELECTOR DE SUBVISTA */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-700 text-white shadow-sm shadow-indigo-500/20">
              <CompassIcon className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-900">
              Planificación Territorial & Campañas
            </h1>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-200/60">
              Módulo Unificado
            </span>
          </div>
          <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
            Organización inteligente de circuitos por cercanía barrial, ajuste manual de horarios y cafés ancla, difusión automatizada de propuestas y confirmación en tiempo real.
          </p>
        </div>

        {/* Selector de Subvista: Itinerario vs. Mapa & Estado WhatsApp */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {/* Validación Visual de WhatsApp Web */}
          {whatsAppReady ? (
            <div
              className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-50 border border-emerald-200/90 px-3 py-2 text-xs font-bold text-emerald-800 shadow-2xs"
              title="WhatsApp Web vinculado y listo para automatización de campañas"
            >
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:inline">WhatsApp Web:</span>
              <span className="font-black text-emerald-900">Conectado</span>
            </div>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 rounded-2xl bg-amber-50 border border-amber-300 px-3 py-2 text-xs font-bold text-amber-900 shadow-2xs"
              title="WhatsApp Web desconectado. Podés vincularlo escaneando el código QR."
            >
              <span className="flex h-2 w-2 rounded-full bg-amber-500" />
              <span className="hidden sm:inline">WhatsApp:</span>
              <span className="font-black text-amber-950">Desconectado</span>
              {onNavigateToWhatsApp && (
                <button
                  type="button"
                  onClick={onNavigateToWhatsApp}
                  className="ml-1 rounded-lg bg-amber-200 hover:bg-amber-300 px-2 py-0.5 text-[11px] font-black text-amber-950 transition"
                  title="Ir a pestaña WhatsApp Web para escanear código QR"
                >
                  Vincular QR →
                </button>
              )}
            </div>
          )}

          <div className="flex items-center rounded-2xl bg-slate-100 p-1.5 border border-slate-200/80 shadow-inner">
            <button
              onClick={() => setSubView('itinerario')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
                subView === 'itinerario'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="h-4 w-4 text-indigo-600" />
              <span>Itinerario & Campaña</span>
            </button>
            <button
              onClick={() => setSubView('mapa')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
                subView === 'mapa'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapPin className="h-4 w-4 text-emerald-600" />
              <span>Mapa Territorial & Cafés</span>
            </button>
          </div>

          <button
            onClick={onRefreshCorte}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
            title="Recalcular con el motor de optimización"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Recalcular</span>
          </button>
        </div>
      </div>

      {/* RENDER CONDICIONAL SEGÚN SUBVISTA */}
      {subView === 'mapa' ? (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-black text-slate-800">
                Visualización Geoespacial CABA (Clusters, Cafés & Contactos)
              </h3>
            </div>
            <button
              onClick={() => setSubView('itinerario')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
            >
              <span>Volver a Hoja de Ruta</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <InteractiveMapPanel
            contacts={contacts}
            clusters={clusters}
            profile={profile}
            calendarEvents={calendarEvents}
            agendaBloques={rawBloques}
            activeAgendaBloqueId={activeBloqueIdEnMapa}
            onSelectAgendaBloque={(id) => setActiveBloqueIdEnMapa(id)}
            onOpenWhatsApp={(c, text) => {
              if (whatsAppReady && onSendDirectWA) {
                void onSendDirectWA(c.tel || c.telRaw, text || '', c.id, c.nombre, c.barrio);
              } else {
                const url = crearEnlaceWhatsApp(c.tel || c.telRaw, text || '');
                window.open(url, '_blank');
              }
            }}
            onSelectContactForEdit={onSelectContactForEdit}
            onQuickStatusFromMap={(contactOrId, action) => {
              const id = typeof contactOrId === 'string' ? contactOrId : contactOrId.id;
              if (action === 'YA_ADHIRIO') {
                void onUpdateContact(id, { adhirio: 'Sí', estadoFlujo: 'YA_ADHIRIO_FIRMA_OK' });
              } else if (action === 'CONFIRMO_CAFE_HUB' || action === 'PASA_PUERTA_A_PUERTA') {
                void onUpdateContact(id, { estadoFlujo: 'ENCUENTRO_CONFIRMADO' });
              }
            }}
          />
        </div>
      ) : (
        /* SUBVISTA ITINERARIO & CAMPAÑA: 4 FASES OPERATIVAS */
        <div className="space-y-6">
          {/* BANNER DE KPIS Y RESUMEN OPERATIVO */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                En Circuito
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-black text-slate-900">
                  {resumenKPIs.totalContactosEnCircuito}
                </span>
                <span className="text-[11px] font-medium text-slate-500">vecinos</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Circuitos Hoy
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-black text-indigo-700">
                  {resumenKPIs.totalCircuitos}
                </span>
                <span className="text-[11px] font-medium text-slate-500">bloques</span>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                Confirmados
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-black text-emerald-900">
                  {resumenKPIs.confirmados}
                </span>
                <span className="text-[11px] font-bold text-emerald-700">pactados</span>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3.5 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                Propuestas
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-black text-amber-900">
                  {resumenKPIs.esperandoRespuesta}
                </span>
                <span className="text-[11px] font-bold text-amber-700">esperando</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Reprogramar
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-black text-slate-800">
                  {resumenKPIs.reprogramar}
                </span>
                <span className="text-[11px] font-medium text-slate-500">avisos</span>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-300 bg-emerald-100/60 p-3.5 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                Firmas Oficiales
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-black text-emerald-950">
                  {resumenKPIs.firmaron}
                </span>
                <span className="text-[11px] font-extrabold text-emerald-800">✓ listos</span>
              </div>
            </div>
          </div>

          {/* SELECTOR DE DÍA */}
          {diasDisponibles.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3">
              <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Día:
              </span>
              {diasDisponibles.map((dia) => {
                const isSelected = selectedDia === dia;
                const esHoy = /hoy/i.test(dia);

                return (
                  <button
                    key={dia}
                    onClick={() => setSelectedDia(dia)}
                    className={`inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-1.5 text-xs font-black transition-all ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
                    }`}
                  >
                    {esHoy && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
                    {dia}
                  </button>
                );
              })}
              <button
                onClick={() => setSelectedDia('Todos')}
                className={`rounded-2xl px-3.5 py-1.5 text-xs font-bold transition ${
                  selectedDia === 'Todos'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                Ver todos los días
              </button>
            </div>
          )}

          {/* PANEL FLOTANTE / ACTIVO DE CAMPAÑA AUTOMATIZADA EN CURSO */}
          {campanaEstado.activa && (
            <div className="rounded-3xl border-2 border-indigo-400 bg-indigo-50/90 p-5 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white animate-pulse">
                    <Send className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-indigo-950">
                      Campaña de Propuestas en Ejecución
                    </h3>
                    <p className="text-xs text-indigo-700 font-medium">
                      Despachando propuestas personalizadas con intervalos anti-ban de seguridad
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setCampanaEstado((prev) => ({ ...prev, pausada: !prev.pausada }))
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-white px-3 py-1.5 text-xs font-black text-indigo-900 hover:bg-indigo-50 shadow-xs"
                  >
                    {campanaEstado.pausada ? (
                      <>
                        <Play className="h-3.5 w-3.5 text-emerald-600 fill-emerald-600" />
                        <span>Reanudar</span>
                      </>
                    ) : (
                      <>
                        <Pause className="h-3.5 w-3.5 text-amber-600 fill-amber-600" />
                        <span>Pausar</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() =>
                      setCampanaEstado((prev) => ({ ...prev, activa: false, pausada: false }))
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-50 shadow-xs"
                  >
                    <Square className="h-3.5 w-3.5 fill-rose-600" />
                    <span>Detener</span>
                  </button>
                </div>
              </div>

              {/* Barra de progreso */}
              <div>
                <div className="flex items-center justify-between text-xs font-black text-indigo-900 mb-1.5">
                  <span>
                    Progreso: {campanaEstado.enviados} de {campanaEstado.total} vecinos contactados
                  </span>
                  <span>
                    {campanaEstado.segundosRestantesProximo > 0 && !campanaEstado.pausada
                      ? `Próximo envío en ~${campanaEstado.segundosRestantesProximo}s`
                      : campanaEstado.pausada
                      ? 'Campaña pausada'
                      : 'Procesando...'}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-indigo-200/80 overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.round((campanaEstado.enviados / (campanaEstado.total || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* LISTADO DE BLOQUES / CIRCUITOS */}
          {bloquesFiltrados.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 space-y-2">
              <Calendar className="h-8 w-8 mx-auto text-slate-400" />
              <p className="text-sm font-bold">No hay circuitos programados para este día.</p>
              <p className="text-xs text-slate-400">
                Probá seleccionando "Ver todos los días" o haciendo click en "Recalcular con Motor IA".
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {bloquesFiltrados.map((bloque) => {
                const isExpanded = expandedBloqueId === bloque.id;
                const paradas = bloque.paradasAjustadas || [];
                const esCafe = bloque.modalidadEfectiva === 'CAFE_HUB';
                const esSede = bloque.modalidadEfectiva === 'EVENTO_SEDE';

                // Curaduría de cafés cercanos al bloque para el selector manual
                const centroCoordenadas = bloque.paradasAjustadas[0]?.contact || { lat: -34.588, lng: -58.43 };
                const cafesDisponiblesParaBarrio = listarCafesHubCercanos(
                  centroCoordenadas.lat || -34.588,
                  centroCoordenadas.lng || -58.43,
                  5,
                  true
                );

                const totalPendientes = paradas.filter(
                  (p) => p.contact.adhirio !== 'Sí' && p.contact.estadoFlujo !== 'YA_ADHIRIO_FIRMA_OK'
                ).length;

                return (
                  <motion.div
                    key={bloque.id}
                    layout
                    className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xs hover:border-slate-300 transition-all"
                  >
                    {/* CABECERA DEL CIRCUITO / BLOQUE */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6 bg-slate-50/40 border-b border-slate-100">
                      <div className="flex items-start gap-3.5">
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm ${
                            esCafe
                              ? 'bg-amber-600 shadow-amber-600/20'
                              : esSede
                              ? 'bg-purple-600 shadow-purple-600/20'
                              : 'bg-emerald-600 shadow-emerald-600/20'
                          }`}
                        >
                          {esCafe ? (
                            <Coffee className="h-6 w-6" />
                          ) : esSede ? (
                            <MapPin className="h-6 w-6" />
                          ) : (
                            <Navigation className="h-6 w-6" />
                          )}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-black text-slate-900">
                              {bloque.barrio}
                            </span>
                            <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-black text-slate-700">
                              {bloque.diaEtiqueta} · {bloque.horaInicioEfectiva} hs
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${
                                esCafe
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : esSede
                                  ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              }`}
                            >
                              {esCafe
                                ? 'Café HUB de Especialidad'
                                : esSede
                                ? 'Sede Central (Chile 1408)'
                                : 'Puerta a Puerta'}
                            </span>
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-800 border border-emerald-200">
                              ✓ Sin choques Calendar
                            </span>
                          </div>

                          <p className="text-xs text-slate-600 mt-1.5 flex items-center gap-1.5 font-medium">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-800">
                              {bloque.puntoEncuentroEfectivo}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* ACCIONES PRINCIPALES DEL BLOQUE */}
                      <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
                        {/* Botón Disparar Campaña Masiva de Propuestas */}
                        <button
                          onClick={() => handleIniciarCampanaBloque(bloque)}
                          disabled={totalPendientes === 0 || campanaEstado.activa}
                          className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-black transition shadow-sm disabled:opacity-50 ${
                            !whatsAppReady
                              ? 'bg-slate-800 hover:bg-slate-700 text-white border border-amber-400/50 shadow-slate-900/10'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                          }`}
                          title={
                            !whatsAppReady
                              ? "WhatsApp Web desconectado. Clic para ver opciones o vincular QR."
                              : "Enviar propuestas personalizadas por WhatsApp a todos los vecinos del bloque"
                          }
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>Disparar Campaña ({totalPendientes})</span>
                          {!whatsAppReady && (
                            <span className="rounded-md bg-amber-400 text-amber-950 px-1.5 py-0.2 text-[10px] font-black">
                              Sin WA
                            </span>
                          )}
                        </button>

                        {/* Botón Ver en Mapa */}
                        <button
                          onClick={() => {
                            setActiveBloqueIdEnMapa(bloque.id);
                            setSubView('mapa');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                        >
                          <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Ver Mapa</span>
                        </button>

                        {/* Toggle Desplegable */}
                        <button
                          onClick={() => setExpandedBloqueId(isExpanded ? null : bloque.id)}
                          className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900 transition shadow-2xs"
                          title={isExpanded ? 'Contraer' : 'Expandir'}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* FASE 2: BARRA DE AJUSTE MANUAL DEL PLANIFICADOR */}
                    <div className="bg-slate-100/70 px-5 sm:px-6 py-3 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-extrabold text-slate-700 flex items-center gap-1">
                          <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" />
                          Ajustes del Planificador:
                        </span>

                        {/* Ajuste de Hora de Salida Base */}
                        <div className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-200/80 shadow-2xs">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[11px] font-bold text-slate-600">Salida:</span>
                          <input
                            type="time"
                            value={bloque.horaInicioEfectiva}
                            onChange={(e) => {
                              const val = e.target.value;
                              setHoraInicioOverrides((prev) => ({ ...prev, [bloque.id]: val }));
                            }}
                            className="text-xs font-black text-slate-800 bg-transparent focus:outline-hidden"
                          />
                        </div>

                        {/* Cambio de Modalidad */}
                        <div className="inline-flex items-center rounded-xl bg-white p-0.5 border border-slate-200/80 shadow-2xs">
                          <button
                            onClick={() =>
                              setModalidadOverrides((prev) => ({ ...prev, [bloque.id]: 'PUERTA_A_PUERTA' }))
                            }
                            className={`px-2.5 py-1 text-[11px] font-extrabold rounded-lg transition ${
                              bloque.modalidadEfectiva === 'PUERTA_A_PUERTA'
                                ? 'bg-slate-900 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Puerta a Puerta
                          </button>
                          <button
                            onClick={() =>
                              setModalidadOverrides((prev) => ({ ...prev, [bloque.id]: 'CAFE_HUB' }))
                            }
                            className={`px-2.5 py-1 text-[11px] font-extrabold rounded-lg transition ${
                              bloque.modalidadEfectiva === 'CAFE_HUB'
                                ? 'bg-amber-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Café HUB
                          </button>
                          <button
                            onClick={() =>
                              setModalidadOverrides((prev) => ({ ...prev, [bloque.id]: 'EVENTO_SEDE' }))
                            }
                            className={`px-2.5 py-1 text-[11px] font-extrabold rounded-lg transition ${
                              bloque.modalidadEfectiva === 'EVENTO_SEDE'
                                ? 'bg-purple-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Sede Central
                          </button>
                        </div>

                        {/* Selector de Café HUB Curado */}
                        {bloque.modalidadEfectiva === 'CAFE_HUB' && (
                          <div className="relative">
                            <button
                              onClick={() =>
                                setSelectorCafeAbiertoBloqueId(
                                  selectorCafeAbiertoBloqueId === bloque.id ? null : bloque.id
                                )
                              }
                              className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-950 border border-amber-300/80 px-2.5 py-1 rounded-xl text-[11px] font-extrabold hover:bg-amber-100 transition shadow-2xs"
                            >
                              <Coffee className="h-3 w-3 text-amber-600" />
                              <span>
                                {bloque.cafeElegidoEfectivo?.nombre || 'Seleccionar Café Ancla'}
                              </span>
                              <ChevronDown className="h-3 w-3 text-amber-700" />
                            </button>

                            {/* Dropdown de Cafés Curados */}
                            {selectorCafeAbiertoBloqueId === bloque.id && (
                              <div className="absolute left-0 mt-1 z-20 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl space-y-1">
                                <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                  Cafés de especialidad cercanos a {bloque.barrio}
                                </div>
                                {cafesDisponiblesParaBarrio.map((cafe) => (
                                  <button
                                    key={cafe.id}
                                    onClick={() => {
                                      setCafeOverrides((prev) => ({ ...prev, [bloque.id]: cafe }));
                                      setSelectorCafeAbiertoBloqueId(null);
                                    }}
                                    className="w-full text-left rounded-xl p-2 hover:bg-amber-50/70 transition flex items-center justify-between gap-2"
                                  >
                                    <div>
                                      <p className="text-xs font-black text-slate-900">{cafe.nombre}</p>
                                      <p className="text-[10px] text-slate-500 truncate">{cafe.direccion}</p>
                                    </div>
                                    <span className="shrink-0 text-[10px] font-extrabold text-amber-700">
                                      ~{cafe.minutosCaminando} min
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 font-medium">
                        Total {paradas.length} paradas · {totalPendientes} pendientes de propuesta
                      </div>
                    </div>

                    {/* FASE 3 & 4: PARADAS SECUENCIALES Y CONFIRMACIÓN DINÁMICA */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="p-5 sm:p-6 space-y-3 bg-white"
                        >
                          <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                            <span>Itinerario Secuencial de Visitas</span>
                            <span>Acciones & Semáforo de Firma</span>
                          </div>

                          <div className="space-y-3">
                            {paradas.map((parada, idx) => {
                              const c = parada.contact;
                              const isSigned = c.adhirio === 'Sí' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK';
                              const isConfirmed = c.estadoFlujo === 'ENCUENTRO_CONFIRMADO';
                              const isReprogram = c.estadoFlujo === 'POSTERGO_SALUD_O_VIAJE';
                              const proposalSent =
                                c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
                                (c.comentario && /propuesta\s+enviada/i.test(c.comentario));

                              const mensajePropuesta = getPropuestaMensaje(c, bloque, parada.horaLlegada);
                              const isEditingMessage = editingMessageContactId === c.id;

                              return (
                                <div
                                  key={c.id}
                                  className={`rounded-2xl border p-4 transition-all ${
                                    isSigned
                                      ? 'border-emerald-300 bg-emerald-50/40'
                                      : isConfirmed
                                      ? 'border-indigo-300 bg-indigo-50/30'
                                      : isReprogram
                                      ? 'border-slate-300 bg-slate-50/70 opacity-75'
                                      : 'border-slate-200/90 bg-white hover:border-slate-300 shadow-2xs'
                                  }`}
                                >
                                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                    {/* Orden, Contacto y Domicilio */}
                                    <div className="flex items-start gap-3">
                                      <div
                                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                                          isSigned
                                            ? 'bg-emerald-600 text-white'
                                            : isConfirmed
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                                        }`}
                                      >
                                        #{parada.orden}
                                      </div>

                                      <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <button
                                            onClick={() => onSelectContactForEdit(c)}
                                            className="text-sm font-black text-slate-900 hover:text-indigo-600 hover:underline transition text-left"
                                          >
                                            {c.nombreCompletoCorregido || c.nombre}
                                          </button>

                                          <span className="text-xs font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                                            {parada.horaLlegada} hs
                                          </span>

                                          {/* Badges de Estado Dinámico (Fase 4) */}
                                          {isSigned ? (
                                            <span className="rounded-full bg-emerald-600 text-white px-2.5 py-0.5 text-[10px] font-black flex items-center gap-1">
                                              <Check className="h-3 w-3 stroke-[3]" />
                                              Firmó Oficialmente
                                            </span>
                                          ) : isConfirmed ? (
                                            <span className="rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300 px-2.5 py-0.5 text-[10px] font-black flex items-center gap-1">
                                              <CheckCircle2 className="h-3 w-3 text-indigo-700 stroke-[2.5]" />
                                              Encuentro Confirmado
                                            </span>
                                          ) : proposalSent ? (
                                            <span className="rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 text-[10px] font-black">
                                              Propuesta Enviada · Esperando
                                            </span>
                                          ) : isReprogram ? (
                                            <span className="rounded-full bg-slate-200 text-slate-800 px-2.5 py-0.5 text-[10px] font-black">
                                              A Reprogramar
                                            </span>
                                          ) : (
                                            <span className="rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-bold">
                                              Pendiente de propuesta
                                            </span>
                                          )}
                                        </div>

                                        <p className="text-xs text-slate-600 mt-0.5 font-medium flex items-center gap-1">
                                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                                          <span>
                                            {c.calleOCruce || c.barrio || 'CABA'}
                                          </span>
                                          {c.comentario && (
                                            <span className="text-slate-400 italic text-[11px] truncate max-w-xs">
                                              · "{c.comentario}"
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </div>

                                    {/* CONTROLES DE LA FASE 4: CONFIRMACIÓN & SEMÁFORO DE FIRMA */}
                                    <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                                      {/* SEMÁFORO DE FIRMA RÁPIDO (Rojo ✗ vs Verde Oscuro ✓) */}
                                      <button
                                        onClick={() => handleToggleFirmaSemaforo(c)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition shadow-2xs ${
                                          isSigned
                                            ? 'bg-emerald-800 text-white hover:bg-emerald-900'
                                            : 'bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100'
                                        }`}
                                        title={isSigned ? 'Click para desmarcar firma' : 'Click para marcar como FIRMÓ'}
                                      >
                                        {isSigned ? (
                                          <>
                                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                                            <span>Firmó</span>
                                          </>
                                        ) : (
                                          <>
                                            <X className="h-3.5 w-3.5 stroke-[3]" />
                                            <span>No firmó</span>
                                          </>
                                        )}
                                      </button>

                                      {/* BOTONES DE CONFIRMACIÓN DE ENCUENTRO */}
                                      {!isSigned && (
                                        <>
                                          <button
                                            onClick={() => handleConfirmarPropuesta(c, parada.horaLlegada)}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${
                                              isConfirmed
                                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                : 'bg-white border border-slate-300 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800'
                                            }`}
                                            title={isConfirmed ? "Encuentro confirmado (click para desmarcar)" : "Confirmar encuentro pactado en agenda"}
                                          >
                                            <CheckCircle2
                                              className={`h-3.5 w-3.5 shrink-0 ${
                                                isConfirmed ? 'text-white stroke-[2.5]' : 'text-emerald-600 stroke-[2.2]'
                                              }`}
                                            />
                                            <span>Confirmó</span>
                                          </button>

                                          <button
                                            onClick={() => {
                                              setReprogramandoItem({ contact: c, horaLlegada: parada.horaLlegada });
                                              setMotivoReprogramacionInput('Pidió otro día/horario');
                                            }}
                                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${
                                              isReprogram
                                                ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                            title={isReprogram ? "En reprogramación (clic para ver o cambiar motivo)" : "Rechazó horario o solicitó reprogramar"}
                                          >
                                            <Clock className="h-3 w-3 text-slate-400" />
                                            <span>{isReprogram ? 'Reprogramado' : 'Reprogramar'}</span>
                                          </button>
                                        </>
                                      )}

                                      {/* BOTÓN ENVIAR PROPUESTA 1-A-1 POR BOT WA */}
                                      {!isSigned && (
                                        <button
                                          onClick={() =>
                                            handleEnviarPropuestaIndividual(c, bloque, parada.horaLlegada)
                                          }
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-600 text-white hover:bg-emerald-500 transition shadow-2xs"
                                          title="Enviar propuesta de visita por WhatsApp"
                                        >
                                          <Send className="h-3 w-3" />
                                          <span>Enviar WA</span>
                                        </button>
                                      )}

                                      {/* Toggle Ver/Editar Mensaje de Propuesta */}
                                      <button
                                        onClick={() =>
                                          setEditingMessageContactId(isEditingMessage ? null : c.id)
                                        }
                                        className="p-1.5 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 bg-white transition"
                                        title="Ver o personalizar mensaje de propuesta"
                                      >
                                        <MessageSquare className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* PANEL EXPANDIBLE DE EDICIÓN DEL MENSAJE DE LA PROPUESTA */}
                                  {isEditingMessage && (
                                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                                          Propuesta de Visita Personalizada (WhatsApp)
                                        </span>
                                        <button
                                          onClick={() => handleCopyText(c.id, mensajePropuesta)}
                                          className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900"
                                        >
                                          {copiadoId === c.id ? (
                                            <>
                                              <Check className="h-3 w-3 text-emerald-600" />
                                              <span>¡Copiado!</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="h-3 w-3" />
                                              <span>Copiar texto</span>
                                            </>
                                          )}
                                        </button>
                                      </div>

                                      <textarea
                                        rows={4}
                                        value={mensajePropuesta}
                                        onChange={(e) =>
                                          setMensajesPropuestaEditados((prev) => ({
                                            ...prev,
                                            [c.id]: e.target.value,
                                          }))
                                        }
                                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                                      />
                                      <p className="text-[10px] text-slate-500 italic">
                                        Podés editar el texto libremente antes de enviar la propuesta masiva o individual.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* MODAL DE REPROGRAMACIÓN MODERNO (SIN PROMPT) */}
      <AnimatePresence>
        {reprogramandoItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Reprogramar Visita
                    </h3>
                    <p className="text-xs text-slate-500 font-medium truncate max-w-[220px]">
                      {reprogramandoItem.contact.nombreCompletoCorregido || reprogramandoItem.contact.nombre} (#{reprogramandoItem.contact.id})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReprogramandoItem(null)}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700">
                  Elegí un motivo rápido o nuevo horario:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Pidió más tarde (hoy)',
                    'Prefiere otro día',
                    'Postergó por salud / viaje',
                    'Prefiere fin de semana',
                    'Pidió punto de encuentro en café',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMotivoReprogramacionInput(preset)}
                      className={`rounded-xl px-2.5 py-1 text-xs font-bold transition border ${
                        motivoReprogramacionInput === preset
                          ? 'bg-amber-100 border-amber-300 text-amber-900 font-black'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-500">
                    Detalle o nuevo horario solicitado:
                  </label>
                  <input
                    type="text"
                    value={motivoReprogramacionInput}
                    onChange={(e) => setMotivoReprogramacionInput(e.target.value)}
                    placeholder="Ej. Pidió coordinar para las 18 hs o sábado"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {reprogramandoItem.contact.estadoFlujo === 'POSTERGO_SALUD_O_VIAJE' ? (
                  <button
                    type="button"
                    onClick={() => handleDeshacerReprogramacion(reprogramandoItem.contact)}
                    className="text-xs font-bold text-rose-600 hover:text-rose-800 transition"
                  >
                    ↺ Deshacer reprogramación
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReprogramandoItem(null)}
                    className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (reprogramandoItem && motivoReprogramacionInput.trim()) {
                        await handleReprogramarPropuesta(reprogramandoItem.contact, motivoReprogramacionInput.trim());
                        setReprogramandoItem(null);
                      }
                    }}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-500 transition shadow-sm shadow-amber-600/20"
                  >
                    Guardar Reprogramación
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE ADVERTENCIA: WHATSAPP WEB DESCONECTADO */}
      <AnimatePresence>
        {showWarnWhatsAppModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      WhatsApp Web no está conectado
                    </h3>
                    <p className="text-xs text-amber-800 font-medium">
                      Campaña para {showWarnWhatsAppModal.bloqueNombre} ({showWarnWhatsAppModal.totalPendientes} contactos)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWarnWhatsAppModal(null)}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-2xl bg-amber-50/70 border border-amber-200 p-4 space-y-2 text-xs text-amber-950">
                <p className="font-semibold">
                  Para que el sistema despache automáticamente los mensajes con demoras anti-bloqueo (18-35 seg), necesitás conectar tu WhatsApp Web escaneando el código QR.
                </p>
                <p className="text-amber-800">
                  Podés vincular tu WhatsApp Web ahora o enviar las propuestas una por una con el botón <strong>"Enviar WA"</strong> de cada parada.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowWarnWhatsAppModal(null)}
                  className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Entendido
                </button>
                {onNavigateToWhatsApp && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowWarnWhatsAppModal(null);
                      onNavigateToWhatsApp();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-500 transition shadow-sm shadow-emerald-600/20"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Vincular WhatsApp Web (Escanear QR)</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Icono auxiliar de Brújula para la cabecera
function CompassIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}
