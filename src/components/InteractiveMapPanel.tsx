import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Coffee,
  Navigation,
  Sparkles,
  ExternalLink,
  Footprints,
  Bus,
  Send,
  Layers,
  AlertTriangle,
  Calendar,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
  CheckCircle2,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BloqueAgendaRecomendado,
  CalendarEventItem,
  Contact,
  MicroCluster,
  ModalidadEncuentroAgenda,
  ModoMensajeTerrenoRuta,
  ParadaRuta,
  VoiceProfile,
} from '../types';
import {
  calcularHojaDeRuta,
  deduplicarEventosCalendar,
  esContactoConfirmadoEnLista1a1,
  geocodificarEventoCalendar,
  generarMensajePersonalizadoCircuitoMapa,
  generarMensajeTerrenoParadaRuta,
} from '../utils/logic';
import { COORDENADAS_BARRIOS_CABA } from '../data/estatusPopurriData';
import {
  CATALOGO_CAFES_HUB_CABA,
  CafeHubCurado,
} from '../data/cafesHubCatalog';

interface InteractiveMapPanelProps {
  contacts: Contact[];
  clusters: MicroCluster[];
  profile: VoiceProfile;
  calendarEvents: CalendarEventItem[];
  agendaBloques?: BloqueAgendaRecomendado[];
  activeAgendaBloqueId?: string | null;
  onSelectAgendaBloque?: (id: string) => void;
  mode?: 'full' | 'map_only' | 'route_only';
  onGoToRouteTab?: () => void;
  onBackToAgendaTab?: () => void;
  onOpenWhatsApp: (contact: Contact, customText?: string) => void;
  onSelectContactForEdit: (contact: Contact) => void;
  onSelectCafeHubForBarrio?: (cafe: CafeHubCurado) => void;
  onQuickStatusFromMap?: (
    contactOrId: Contact | string,
    action:
      | 'YA_ADHIRIO'
      | 'CONFIRMO_CAFE_HUB'
      | 'PASA_PUERTA_A_PUERTA'
      | 'DEJE_FICHAS'
      | 'DEJE_FICHAS_EXTRAS'
      | 'REPROGRAMAR',
    detailText?: string
  ) => void;
}

interface RouteOverlayProps {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  stops?: { lat: number; lng: number }[];
  travelMode: 'WALKING' | 'DRIVING' | 'TRANSIT';
}

function ModernRouteOverlay({
  originLat,
  originLng,
  destLat,
  destLng,
  stops = [],
  travelMode,
}: RouteOverlayProps) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const polylinesRef = useRef<any[]>([]);

  const stopsKey = useMemo(
    () =>
      stops
        .map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`)
        .join('|'),
    [stops]
  );

  useEffect(() => {
    if (
      !map ||
      !Number.isFinite(originLat) ||
      !Number.isFinite(originLng) ||
      !Number.isFinite(destLat) ||
      !Number.isFinite(destLng)
    ) {
      return;
    }

    const clearPolylines = () => {
      polylinesRef.current.forEach((p) => {
        try {
          p.setMap(null);
        } catch {
          // ignore cleanup error
        }
      });
      polylinesRef.current = [];
    };

    clearPolylines();

    const PolylineCtor =
      (mapsLib as any)?.Polyline || (window as any)?.google?.maps?.Polyline;
    if (typeof PolylineCtor !== 'function') {
      return () => clearPolylines();
    }

    const routePath =
      stops.length > 0
        ? [{ lat: originLat, lng: originLng }, ...stops]
        : [
            { lat: originLat, lng: originLng },
            { lat: destLat, lng: destLng },
          ];

    const polyline = new PolylineCtor({
      path: routePath,
      geodesic: true,
      strokeColor: travelMode === 'WALKING' ? '#059669' : '#0f172a',
      strokeOpacity: 0.88,
      strokeWeight: 4,
    });
    polyline.setMap(map);
    polylinesRef.current = [polyline];

    return () => {
      clearPolylines();
    };
  }, [mapsLib, map, originLat, originLng, destLat, destLng, travelMode, stopsKey]);

  return null;
}

export function InteractiveMapPanel({
  contacts,
  clusters,
  profile,
  calendarEvents,
  agendaBloques = [],
  activeAgendaBloqueId = null,
  onSelectAgendaBloque,
  mode = 'full',
  onGoToRouteTab,
  onBackToAgendaTab,
  onOpenWhatsApp,
  onSelectContactForEdit,
  onSelectCafeHubForBarrio,
  onQuickStatusFromMap,
}: InteractiveMapPanelProps) {
  const apiKey =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';
  const [useGoogleMapsView, setUseGoogleMapsView] = useState<boolean>(true);
  const [selectedBarrio, setSelectedBarrio] = useState<string>('Todos');
  const [selectedFranja, setSelectedFranja] = useState<string>('Todos');
  const [activeClusterId, setActiveClusterId] = useState<string | null>(
    clusters[0]?.id || null
  );
  const [selectedMarkerContact, setSelectedMarkerContact] = useState<Contact | null>(
    null
  );
  const [showCafesHubLayer, setShowCafesHubLayer] = useState<boolean>(true);
  const [selectedCafeHubPin, setSelectedCafeHubPin] = useState<CafeHubCurado | null>(
    null
  );
  const [horaSalida, setHoraSalida] = useState<string>(
    () => agendaBloques[0]?.horaInicioCalculada || '10:30'
  );
  const [bufferMinutos, setBufferMinutos] = useState<number>(15);
  const [origenPersonalizadoId, setOrigenPersonalizadoId] = useState<string>('base');
  const [filtroRutaSoloConfirmados, setFiltroRutaSoloConfirmados] = useState<boolean>(false);

  // Selector de sub-vista para móvil (Mapa / Circuitos y Cafés HUB / Hoja de Ruta)
  const [mobileMapSection, setMobileMapSection] = useState<'map_and_clusters' | 'clusters_only' | 'route_only'>(
    mode === 'route_only' ? 'route_only' : 'map_and_clusters'
  );

  // Filtro en Circuitos: Mostrar sólo los Cafés HUB sugeridos para los próximos días según Agenda Día x Día o todos
  const [soloCafesHubSugeridosAgenda, setSoloCafesHubSugeridosAgenda] = useState<boolean>(false);

  // Café HUB de Google Maps elegido para cada circuito (personaliza automáticamente los mensajes del circuito)
  const [selectedCafeByCluster, setSelectedCafeByCluster] = useState<
    Record<string, { id: string; nombre: string; direccion: string; urlGoogleMaps: string }>
  >({});

  // Modalidad elegida por circuito (CAFE_HUB, PUERTA_A_PUERTA, PUNTO_ADHESION, EVENTO_SEDE)
  const [selectedModalidadByCluster, setSelectedModalidadByCluster] = useState<
    Record<string, ModalidadEncuentroAgenda>
  >({});

  // Mensajes personalizados editables por vecino dentro de un circuito
  const [customClusterMessages, setCustomClusterMessages] = useState<Record<string, string>>({});

  // Modo de mensaje en terreno para la Hoja de Ruta Casa x Casa / Café HUB
  const [modoTerrenoRuta, setModoTerrenoRuta] = useState<ModoMensajeTerrenoRuta>('EN_CAMINO_HORA_CALC');
  const [modoTerrenoPorParada, setModoTerrenoPorParada] = useState<Record<string, ModoMensajeTerrenoRuta>>({});
  const [cafeHubActivoEnRuta, setCafeHubActivoEnRuta] = useState<string>('');
  const [customRouteMessages, setCustomRouteMessages] = useState<Record<string, string>>({});
  const [expandedRouteStopId, setExpandedRouteStopId] = useState<string | null>(null);
  const [copiedMapMsgId, setCopiedMapMsgId] = useState<string | null>(null);
  const [drawerCluster, setDrawerCluster] = useState<MicroCluster | null>(null);
  const [changingCafeForClusterId, setChangingCafeForClusterId] = useState<string | null>(null);

  const uniqueCalendarEvents = useMemo(
    () => deduplicarEventosCalendar(calendarEvents),
    [calendarEvents]
  );

  const visibleCafesHub = useMemo(() => {
    if (!showCafesHubLayer) return [];
    if (selectedBarrio === 'Todos') return CATALOGO_CAFES_HUB_CABA;
    return CATALOGO_CAFES_HUB_CABA.filter((c) => c.barrio === selectedBarrio);
  }, [showCafesHubLayer, selectedBarrio]);

  // Regla estricta: el mapa y los circuitos SÓLO consideran personas que AÚN NO HAN ADHERIDO
  // Y que además tienen una DIRECCIÓN o PUNTO DE ENCUENTRO cargado en la Columna "G" ("Comentario") del Google Sheets
  const allPendingCabaContacts = useMemo(
    () =>
      contacts.filter(
        (c) =>
          c.adhirio !== 'Sí' &&
          c.situacion !== 'DESCARTADO_NO_CABA' &&
          c.situacion !== 'YA_ADHIRIO' &&
          c.estadoFlujo !== 'YA_ADHIRIO_FIRMA_OK' &&
          c.estadoFlujo !== 'DESCARTADO_O_BAJA' &&
          !c.esCerradoOArchivadoSinDniCaba
      ),
    [contacts]
  );

  const nonAdheredContacts = useMemo(
    () =>
      allPendingCabaContacts.filter((c) =>
        Boolean(c.calleOCruce && c.calleOCruce.trim().length > 0)
      ),
    [allPendingCabaContacts]
  );

  const excludedOnlyBarrioCount =
    allPendingCabaContacts.length - nonAdheredContacts.length;

  // Barrios dinámicos detectados en los contactos pendientes con dirección/punto en Columna G
  const dynamicBarrios = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of nonAdheredContacts) {
      const b = (c.barrio || 'CABA').trim();
      counts[b] = (counts[b] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [nonAdheredContacts]);

  // Bloque de Agenda Día por Día actualmente sincronizado con la Hoja de Ruta
  const activeAgendaBloque = useMemo(() => {
    if (!agendaBloques || agendaBloques.length === 0) return null;
    if (activeAgendaBloqueId) {
      const found = agendaBloques.find((b) => b.id === activeAgendaBloqueId);
      if (found) return found;
    }
    return agendaBloques[0];
  }, [agendaBloques, activeAgendaBloqueId]);

  // Bloques programados para HOY (o para el primer día de la agenda si no hay bloques HOY)
  const bloquesDelDiaHoy = useMemo(() => {
    if (!agendaBloques || agendaBloques.length === 0) return [];
    const hoyBlocks = agendaBloques.filter((b) => b.diaEtiqueta.toUpperCase().startsWith('HOY'));
    if (hoyBlocks.length > 0) return hoyBlocks;
    const firstFecha = agendaBloques[0]?.fechaClave;
    return firstFecha ? agendaBloques.filter((b) => b.fechaClave === firstFecha) : [agendaBloques[0]];
  }, [agendaBloques]);

  const [selectedForRouteIds, setSelectedForRouteIds] = useState<Set<string>>(() => {
    if (agendaBloques.length > 0) {
      const hoyBlocks = agendaBloques.filter((b) => b.diaEtiqueta.toUpperCase().startsWith('HOY'));
      const baseBlocks = hoyBlocks.length > 0 ? hoyBlocks : [agendaBloques[0]];
      const idsHoy = baseBlocks.flatMap((b) => b.contactosIncluidos.map((c) => c.id));
      if (idsHoy.length > 0) {
        return new Set(idsHoy);
      }
    }
    const initial = contacts
      .filter(
        (c) =>
          c.adhirio !== 'Sí' &&
          c.situacion !== 'DESCARTADO_NO_CABA' &&
          !c.esCerradoOArchivadoSinDniCaba &&
          Boolean(c.calleOCruce && c.calleOCruce.trim().length > 0)
      )
      .slice(0, 8)
      .map((c) => c.id);
    return new Set(initial);
  });

  // Café HUB unificado del bloque activo (fuente única de verdad entre Pestaña 2 y Pestaña 3)
  const cafeBloqueSincronizado = useMemo(() => {
    if (!activeAgendaBloque) return undefined;
    if (activeAgendaBloque.cafeElegidoUsuario) {
      const partes = activeAgendaBloque.cafeElegidoUsuario.split('(');
      const nombre = partes[0]?.trim() || activeAgendaBloque.cafeElegidoUsuario;
      const direccion = partes[1]?.replace(')', '').trim() || activeAgendaBloque.barrio;
      const matchOpt = activeAgendaBloque.cafesHubOpciones?.find(
        (cf) => cf.nombre.toLowerCase() === nombre.toLowerCase()
      );
      return {
        nombre,
        direccion: matchOpt?.direccion || direccion,
        lat: matchOpt?.lat,
        lng: matchOpt?.lng,
      };
    }
    const cfOpt = activeAgendaBloque.cafesHubOpciones?.[0];
    if (cfOpt) {
      return {
        nombre: cfOpt.nombre,
        direccion: cfOpt.direccion,
        lat: cfOpt.lat,
        lng: cfOpt.lng,
      };
    }
    const cfCurado = activeAgendaBloque.cafesCandidatosCurados?.[0];
    if (cfCurado) {
      return {
        nombre: cfCurado.nombre,
        direccion: cfCurado.direccion,
      };
    }
    return undefined;
  }, [activeAgendaBloque]);

  // Sincronización inteligente en vivo entre Agenda Recomendada Día por Día + Respuestas Lista 1-a-1 y la Hoja de Ruta:
  // - Si el usuario seleccionó un bloque puntual (`activeAgendaBloqueId !== null`), carga las paradas de ese bloque.
  // - Si no hay un bloque puntual forzado (`activeAgendaBloqueId === null`), carga TODAS las paradas pautadas para HOY en orden cronológico
  //   para que ninguna visita de hoy (ej. Laura Masson 10:00 hs, Alejandra 12:30 hs, Felipe 15:00 hs, etc.) quede oculta.
  useEffect(() => {
    if (!activeAgendaBloque) return;
    const validPendingIds = new Set(nonAdheredContacts.map((c) => c.id));

    const bloquesBase = activeAgendaBloqueId
      ? [activeAgendaBloque]
      : bloquesDelDiaHoy.length > 0
      ? bloquesDelDiaHoy
      : [activeAgendaBloque];

    const idsBloques = bloquesBase
      .flatMap((b) => b.contactosIncluidos.map((c) => c.id))
      .filter((id) => validPendingIds.has(id));

    // Si estamos mostrando el día completo de HOY, sumar también cualquier vecino con fecha explícita de hoy (ej. 21/10) que aún no haya adherido
    const fechaObjetivoRef = activeAgendaBloque.fechaClave;
    const idsExplicitosFecha =
      !activeAgendaBloqueId && fechaObjetivoRef
        ? nonAdheredContacts
            .filter((c) => c.fechasMencionadas.includes(fechaObjetivoRef))
            .map((c) => c.id)
        : [];

    const combinedIds = Array.from(new Set([...idsBloques, ...idsExplicitosFecha]));
    if (filtroRutaSoloConfirmados) {
      const soloConf = combinedIds.filter((id) => {
        const contactObj = nonAdheredContacts.find((x) => x.id === id);
        return contactObj && esContactoConfirmadoEnLista1a1(contactObj);
      });
      setSelectedForRouteIds(new Set(soloConf.length > 0 ? soloConf : combinedIds));
    } else {
      setSelectedForRouteIds(new Set(combinedIds));
    }

    const primerBloqueConHora = bloquesBase[0] || activeAgendaBloque;
    if (primerBloqueConHora.horaInicioCalculada) {
      setHoraSalida(primerBloqueConHora.horaInicioCalculada);
    }
    if (cafeBloqueSincronizado) {
      setCafeHubActivoEnRuta(
        `${cafeBloqueSincronizado.nombre} (${cafeBloqueSincronizado.direccion.split(',')[0]})`
      );
    }
    if (activeAgendaBloque.clusterIdVinculado) {
      setActiveClusterId(activeAgendaBloque.clusterIdVinculado);
    }
  }, [
    activeAgendaBloque,
    activeAgendaBloqueId,
    bloquesDelDiaHoy,
    cafeBloqueSincronizado,
    nonAdheredContacts,
    filtroRutaSoloConfirmados,
  ]);
  const [groundingLoadingCluster, setGroundingLoadingCluster] = useState<string | null>(null);
  const [groundingResultByCluster, setGroundingResultByCluster] = useState<
    Record<string, { texto: string; links: { titulo: string; uri: string }[] }>
  >({});

  const visibleContacts = useMemo(() => {
    return nonAdheredContacts.filter((c) => {
      if (selectedBarrio !== 'Todos' && c.barrio !== selectedBarrio) return false;
      if (
        selectedFranja !== 'Todos' &&
        c.franjaHoraria !== selectedFranja &&
        c.franjaHoraria !== 'Flexible'
      ) {
        return false;
      }
      return true;
    });
  }, [nonAdheredContacts, selectedBarrio, selectedFranja]);

  const visibleClusters = useMemo(() => {
    return clusters.filter((cl) => {
      if (
        selectedBarrio !== 'Todos' &&
        cl.barrioPrincipal !== selectedBarrio &&
        !cl.miembros.some((m) => m.contact.barrio === selectedBarrio)
      ) {
        return false;
      }
      if (
        selectedFranja !== 'Todos' &&
        !cl.franjasCompatibles.includes(selectedFranja) &&
        !cl.franjasCompatibles.includes('Flexible')
      ) {
        return false;
      }
      if (soloCafesHubSugeridosAgenda && !cl.convieneCafeHub && !cl.esSugeridoProximosDias) {
        return false;
      }
      return true;
    });
  }, [clusters, selectedBarrio, selectedFranja, soloCafesHubSugeridosAgenda]);

  // Perfil ajustado si el usuario elige partir desde la dirección de un evento de Google Calendar
  const effectiveProfile: VoiceProfile = useMemo(() => {
    if (origenPersonalizadoId === 'base') return profile;
    const ev = uniqueCalendarEvents.find((e) => e.id === origenPersonalizadoId);
    if (!ev) return profile;
    const geo = geocodificarEventoCalendar(ev, profile);
    return {
      ...profile,
      direccionPartida: `${ev.location || geo.label} (Salida tras "${ev.summary}")`,
      latPartida: geo.lat,
      lngPartida: geo.lng,
    };
  }, [origenPersonalizadoId, uniqueCalendarEvents, profile]);

  const paradasSeleccionadas = nonAdheredContacts.filter((c) =>
    selectedForRouteIds.has(c.id)
  );
  const hojaDeRuta: ParadaRuta[] = calcularHojaDeRuta(
    paradasSeleccionadas,
    horaSalida,
    bufferMinutos,
    effectiveProfile,
    uniqueCalendarEvents,
    activeAgendaBloque?.fechaClave,
    {
      cafeHubBloque: cafeBloqueSincronizado,
      modalidadBloque:
        activeAgendaBloque?.modalidadElegidaUsuario ||
        activeAgendaBloque?.modalidad,
      contactosMismoDia: nonAdheredContacts,
    }
  );

  const toggleContactInRoute = useCallback((id: string) => {
    setSelectedForRouteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const cargarCircuitoDesdeCluster = (cl: MicroCluster) => {
    setActiveClusterId(cl.id);
    setSelectedForRouteIds(new Set(cl.miembros.map((m) => m.contact.id)));
    const cafeSel = selectedCafeByCluster[cl.id];
    if (cafeSel) {
      setCafeHubActivoEnRuta(`${cafeSel.nombre} (${cafeSel.direccion.split(',')[0]})`);
    } else if (cl.cafesHubCercanos?.[0]) {
      setCafeHubActivoEnRuta(
        `${cl.cafesHubCercanos[0].nombre} (${cl.cafesHubCercanos[0].direccion.split(',')[0]})`
      );
    }
  };

  const handleElegirCafeParaCircuito = (
    cl: MicroCluster,
    cafe: { id: string; nombre: string; direccion: string; lat: number; lng: number; urlGoogleMaps: string }
  ) => {
    setActiveClusterId(cl.id);
    setSelectedCafeByCluster((prev) => ({
      ...prev,
      [cl.id]: {
        id: cafe.id,
        nombre: cafe.nombre,
        direccion: cafe.direccion,
        urlGoogleMaps: cafe.urlGoogleMaps,
      },
    }));
    // Al elegir un Café HUB de la lista de Google Maps, pasar la modalidad del circuito a CAFE_HUB
    // y regenerar automáticamente el mensaje personalizado de cada miembro del circuito
    const modActual = selectedModalidadByCluster[cl.id] || 'CAFE_HUB';
    setSelectedModalidadByCluster((prev) => ({
      ...prev,
      [cl.id]: modActual,
    }));
    const nuevosMensajes: Record<string, string> = {};
    for (const m of cl.miembros) {
      nuevosMensajes[`${cl.id}-${m.contact.id}`] = generarMensajePersonalizadoCircuitoMapa(
        m.contact,
        cl,
        profile,
        {
          modalidad: modActual,
          cafeSeleccionado: { nombre: cafe.nombre, direccion: cafe.direccion },
        }
      );
    }
    setCustomClusterMessages((prev) => ({ ...prev, ...nuevosMensajes }));
    setCafeHubActivoEnRuta(`${cafe.nombre} (${cafe.direccion.split(',')[0]})`);

    if (onSelectCafeHubForBarrio) {
      onSelectCafeHubForBarrio({
        id: cafe.id,
        nombre: cafe.nombre,
        direccion: cafe.direccion,
        barrio: cl.barrioPrincipal,
        esCaba: true,
        lat: cafe.lat,
        lng: cafe.lng,
        urlGoogleMaps: cafe.urlGoogleMaps,
      });
    }
  };

  const handleCambiarModalidadCircuito = (
    cl: MicroCluster,
    nuevaModalidad: ModalidadEncuentroAgenda
  ) => {
    setActiveClusterId(cl.id);
    setSelectedModalidadByCluster((prev) => ({
      ...prev,
      [cl.id]: nuevaModalidad,
    }));
    const cafeElegido = selectedCafeByCluster[cl.id] || cl.cafesHubCercanos?.[0];
    const nuevosMensajes: Record<string, string> = {};
    for (const m of cl.miembros) {
      nuevosMensajes[`${cl.id}-${m.contact.id}`] = generarMensajePersonalizadoCircuitoMapa(
        m.contact,
        cl,
        profile,
        {
          modalidad: nuevaModalidad,
          cafeSeleccionado: cafeElegido
            ? { nombre: cafeElegido.nombre, direccion: cafeElegido.direccion }
            : undefined,
        }
      );
    }
    setCustomClusterMessages((prev) => ({ ...prev, ...nuevosMensajes }));
  };

  const handleCopyMapText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMapMsgId(key);
    setTimeout(() => setCopiedMapMsgId(null), 1800);
  };

  const consultarCafesGrounding = async (cluster: MicroCluster) => {
    setGroundingLoadingCluster(cluster.id);
    try {
      const res = await fetch('/api/gemini/places-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          esquina: cluster.esquinaCentrica,
          barrio: cluster.barrioPrincipal,
          lat: cluster.centroLat,
          lng: cluster.centroLng,
          cantidadVecinos: cluster.miembros.length,
        }),
      });
      const rawText = await res.text();
      if (!/^<!doctype/i.test(rawText.trim()) && !/^<html/i.test(rawText.trim())) {
        const data = JSON.parse(rawText);
        if (data?.ok) {
          setGroundingResultByCluster((prev) => ({
            ...prev,
            [cluster.id]: {
              texto: data.recomendacion,
              links: data.lugaresMaps || [],
            },
          }));
        }
      }
    } catch (e) {
      console.error('Error buscando cafés con Maps Grounding:', e);
    } finally {
      setGroundingLoadingCluster(null);
    }
  };

  // Bounding coordinates for the interactive CABA SVG map canvas
  const minLat = -34.63;
  const maxLat = -34.54;
  const minLng = -58.515;
  const maxLng = -58.37;

  const projectToSvg = (lat: number, lng: number) => {
    const x = ((lng - minLng) / (maxLng - minLng)) * 760 + 20;
    const y = ((maxLat - lat) / (maxLat - minLat)) * 440 + 20;
    return {
      x: Math.max(20, Math.min(780, x)),
      y: Math.max(20, Math.min(460, y)),
    };
  };

  return (
    <div className="space-y-5 min-w-0">
      {/* 1. Barra Unificada Superior: Métricas Territoriales + Filtros + Vista */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-xs space-y-3">
        {/* Fila Superior: Métricas Territoriales en Píldoras + Tab Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-50 text-slate-800 border border-slate-200/70">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-2xs shadow-emerald-500/40" />
              <span>{nonAdheredContacts.length} en Territorio</span>
              <span className="text-slate-400 font-normal">({excludedOnlyBarrioCount} s/calle)</span>
            </span>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-50 text-slate-800 border border-slate-200/70">
              <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-2xs shadow-indigo-500/40" />
              <span>{visibleClusters.length} Circuitos</span>
            </span>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-50 text-slate-800 border border-slate-200/70">
              <Coffee className="w-3.5 h-3.5 text-amber-600" />
              <span>{visibleCafesHub.length} Cafés HUB</span>
            </span>

            <button
              type="button"
              onClick={() => setMobileMapSection('route_only')}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/70 transition"
              title="Ir a Hoja de Ruta"
            >
              <Navigation className="w-3.5 h-3.5 text-sky-600" />
              <span>Ruta: {hojaDeRuta.length} paradas</span>
              <span className="text-slate-400 font-mono text-[11px]">({horaSalida} hs)</span>
            </button>
          </div>

          {/* Switcher de Vista */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100/80 p-0.5 shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setMobileMapSection('map_and_clusters')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                mobileMapSection !== 'route_only'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mapa & Circuitos
            </button>
            <button
              type="button"
              onClick={() => setMobileMapSection('route_only')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                mobileMapSection === 'route_only'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Hoja de Ruta</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                mobileMapSection === 'route_only'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-700'
              }`}>
                {hojaDeRuta.length}
              </span>
            </button>
          </div>
        </div>

        {/* Fila Inferior: Filtros Territoriales y Capas */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {/* Barrio */}
            <div className="relative min-w-[170px] sm:min-w-[190px]">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                id="map-barrio-filter"
                value={selectedBarrio}
                onChange={(e) => setSelectedBarrio(e.target.value)}
                className="w-full pl-8 pr-7 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 hover:bg-slate-100/70 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 transition-colors cursor-pointer"
              >
                <option value="Todos">
                  Todos los barrios ({nonAdheredContacts.length})
                </option>
                {dynamicBarrios.map(([barrio, count]) => (
                  <option key={barrio} value={barrio}>
                    {barrio} ({count})
                  </option>
                ))}
              </select>
            </div>

            {/* Franja Horaria */}
            <div className="relative min-w-[130px] sm:min-w-[155px]">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                id="map-franja-filter"
                value={selectedFranja}
                onChange={(e) => setSelectedFranja(e.target.value)}
                className="w-full pl-8 pr-7 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 hover:bg-slate-100/70 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 transition-colors cursor-pointer"
              >
                <option value="Todos">Todas las franjas</option>
                <option value="Mañana">Mañana (08:30 a 12:30)</option>
                <option value="Mediodía">Mediodía (12:00 a 15:00)</option>
                <option value="Tarde">Tarde (15:00 a 18:00)</option>
                <option value="Vespertino">Vespertino (18:00+)</option>
              </select>
            </div>

            {/* Punto de Partida */}
            <div className="relative min-w-[200px] flex-1">
              <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                id="map-origen-select"
                value={origenPersonalizadoId}
                onChange={(e) => {
                  const val = e.target.value;
                  setOrigenPersonalizadoId(val);
                  if (val !== 'base') {
                    const ev = uniqueCalendarEvents.find((item) => item.id === val);
                    if (ev?.endTime) setHoraSalida(ev.endTime);
                  }
                }}
                className="w-full pl-8 pr-7 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 hover:bg-slate-100/70 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 transition-colors cursor-pointer truncate"
              >
                <option value="base">
                  Partida Base: {profile.direccionPartida}
                </option>
                {uniqueCalendarEvents.map((ev, evIdx) => (
                  <option
                    key={`opt-cal-${ev.id}-${ev.fecha || ev.fechaISO || ''}-${ev.startTime || ''}-${evIdx}`}
                    value={ev.id}
                  >
                    Desde Calendar ({ev.endTime} hs): {ev.summary}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Acciones de Vista y Capas */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Toggle Cafés HUB */}
            <button
              type="button"
              onClick={() => setShowCafesHubLayer((v) => !v)}
              className={`px-3 py-2 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all shadow-2xs ${
                showCafesHubLayer
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Coffee className="w-3.5 h-3.5 text-amber-600" />
              <span>Cafés HUB ({visibleCafesHub.length})</span>
            </button>

            {/* Toggle Modo Vista (Maps vs Esquema) */}
            <button
              type="button"
              onClick={() => setUseGoogleMapsView((v) => !v)}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all shadow-2xs flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>{useGoogleMapsView ? 'Google Maps' : 'Nodos'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* En modo route_only (Pestaña 3): Selector Integrado con Agenda Recomendada Día por Día y Lista 1-a-1 */}
      {mode === 'route_only' && agendaBloques.length > 0 && (
        <div className="bg-indigo-950 text-white rounded-xl p-3.5 sm:p-4 border border-indigo-800 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold uppercase tracking-wider">
                  Sincronizado con Pestaña 2
                </span>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Correspondencia con Agenda Recomendada Día por Día y Confirmaciones 1-a-1
                </h3>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5">
                Seleccioná qué bloque horario no superpuesto querés recorrer. Las respuestas consolidadas en la &quot;Lista 1-a-1 Unificada&quot; actualizan el bloque y activan automáticamente los mensajes en terreno acá abajo.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltroRutaSoloConfirmados((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  filtroRutaSoloConfirmados
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-indigo-900/80 text-indigo-100 border-indigo-700 hover:bg-indigo-800'
                }`}
              >
                {filtroRutaSoloConfirmados
                  ? '✓ Mostrando Sólo Confirmados'
                  : 'Mostrar Todos del Bloque (Propuestos + Confirmados)'}
              </button>
              {onBackToAgendaTab && (
                <button
                  type="button"
                  onClick={onBackToAgendaTab}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  ← Volver a 2. Agenda y Corte
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {agendaBloques.map((blk) => {
              const isSelected = activeAgendaBloque?.id === blk.id;
              const confirmadosCount = blk.contactosIncluidos.filter((cObj) => {
                const liveObj = nonAdheredContacts.find((x) => x.id === cObj.id) || cObj;
                return esContactoConfirmadoEnLista1a1(liveObj);
              }).length;
              const modBlk = blk.modalidadElegidaUsuario || blk.modalidad;
              const cafeUnificadoBlk =
                blk.cafeElegidoUsuario ||
                (blk.cafesHubOpciones?.[0]
                  ? `${blk.cafesHubOpciones[0].nombre} (${blk.cafesHubOpciones[0].direccion.split(',')[0]})`
                  : blk.cafesCandidatosCurados?.[0]?.nombre);

              return (
                <button
                  key={blk.id}
                  type="button"
                  onClick={() => {
                    if (onSelectAgendaBloque) onSelectAgendaBloque(blk.id);
                    if (blk.horaInicioCalculada) setHoraSalida(blk.horaInicioCalculada);
                    setSelectedForRouteIds(new Set(blk.contactosIncluidos.map((c) => c.id)));
                  }}
                  className={`text-left p-2.5 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-white text-slate-900 border-amber-400 ring-2 ring-amber-400/50 shadow-sm'
                      : 'bg-indigo-900/50 text-indigo-100 border-indigo-800 hover:bg-indigo-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                        isSelected
                          ? 'bg-slate-900 text-white'
                          : 'bg-indigo-800 text-indigo-200'
                      }`}
                    >
                      {blk.diaEtiqueta}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        isSelected ? 'text-emerald-700' : 'text-emerald-300'
                      }`}
                    >
                      {confirmadosCount}/{blk.contactosIncluidos.length} conf.
                    </span>
                  </div>
                  <p
                    className={`text-xs font-bold mt-1.5 truncate ${
                      isSelected ? 'text-slate-900' : 'text-white'
                    }`}
                  >
                    {blk.barrio} · {blk.franjaHoraria}
                  </p>
                  <p
                    className={`text-[11px] mt-0.5 truncate ${
                      isSelected ? 'text-slate-600' : 'text-indigo-200'
                    }`}
                  >
                    {modBlk === 'CAFE_HUB' || modBlk === 'PUNTO_ADHESION'
                      ? `☕ Hub: ${cafeUnificadoBlk || blk.barrio}`
                      : `🚶 Casa x Casa (${blk.contactosIncluidos.length} paradas · Hub alt: ${cafeUnificadoBlk?.split('(')[0]?.trim() || blk.barrio})`}
                  </p>
                </button>
              );
            })}
          </div>

          {activeAgendaBloque && (
            <div className="p-2.5 rounded-lg bg-indigo-900/70 border border-indigo-700/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <p className="font-bold text-amber-300">
                  Bloque activo sincronizado: {activeAgendaBloque.diaEtiqueta} · {activeAgendaBloque.franjaHoraria} ({activeAgendaBloque.barrio})
                </p>
                <p className="text-indigo-100 text-[11px]">
                  {(activeAgendaBloque.modalidadElegidaUsuario || activeAgendaBloque.modalidad) === 'PUERTA_A_PUERTA'
                    ? `🏠 Estrategia: Recorrido Puerta a Puerta ordenado por horario conveniente (${horaSalida} hs) · Café HUB alternativo del bloque: ${cafeHubActivoEnRuta || activeAgendaBloque.barrio}.`
                    : `☕ Estrategia: Café HUB en ${cafeHubActivoEnRuta || activeAgendaBloque.puntoEncuentroODireccion}. Quienes prefieran domicilio quedan ordenados abajo por horario conveniente.`}
                </p>
              </div>
              <span className="px-2 py-1 rounded bg-indigo-950/90 border border-indigo-700 text-[11px] font-mono text-emerald-300 shrink-0">
                Salida ruta: {horaSalida} hs · {hojaDeRuta.filter((p) => p.confirmadoEnLista1a1).length}/{hojaDeRuta.length} activos
              </span>
            </div>
          )}
        </div>
      )}

      {/* Grilla Principal: Mapa Interactivo y Circuitos (Aislada de Hoja de Ruta para evitar sobrecarga visual) */}
      {mode !== 'route_only' && mobileMapSection !== 'route_only' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start min-w-0">
        {/* Mapa Interactivo CABA (12 cols cuando mode === 'map_only', 7 cols cuando mode === 'full') */}
        <div
          className={`${
            mode === 'map_only' ? 'lg:col-span-12' : 'lg:col-span-7'
          } min-w-0 bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs ${
            mobileMapSection === 'clusters_only' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Cabecera Limpia del Mapa */}
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900 truncate">
                  Cobertura Territorial & Puntos de Encuentro
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200/70">
                  En vivo
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {visibleContacts.length} contactos pendientes con dirección · {visibleClusters.length} circuitos sugeridos
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/80">
                {selectedBarrio === 'Todos' ? 'Toda CABA' : selectedBarrio}
              </span>
              <button
                type="button"
                onClick={() => setUseGoogleMapsView((v) => !v)}
                className="px-2.5 py-1 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
                title="Alternar entre Google Maps y Esquema de Nodos"
              >
                {useGoogleMapsView ? 'Ver Nodos' : 'Ver Maps'}
              </button>
            </div>
          </div>

          {apiKey && useGoogleMapsView ? (
            <div className="w-full h-[340px] sm:h-[460px] relative">
              <APIProvider apiKey={apiKey} language="es" region="AR">
                <Map
                  defaultCenter={{ lat: -34.568, lng: -58.455 }}
                  defaultZoom={13}
                  mapId="DEMO_MAP_ID"
                  gestureHandling="greedy"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  {/* Marcador de Base de Salida o Evento de Calendar seleccionado */}
                  <AdvancedMarker
                    position={{
                      lat: effectiveProfile.latPartida,
                      lng: effectiveProfile.lngPartida,
                    }}
                    title={`Partida: ${effectiveProfile.direccionPartida}`}
                  >
                    <Pin background="#0f172a" glyphColor="#fde047" borderColor="#0f172a" />
                  </AdvancedMarker>

                  {/* Marcadores de Eventos de Google Calendar */}
                  {uniqueCalendarEvents.map((ev, evIdx) => {
                    const geo = geocodificarEventoCalendar(ev, profile);
                    return (
                      <AdvancedMarker
                        key={`cal-${ev.id}-${ev.fecha || ev.fechaISO || ''}-${ev.startTime || ''}-${evIdx}`}
                        position={{ lat: geo.lat, lng: geo.lng }}
                        title={`Calendar (${ev.startTime}-${ev.endTime}): ${ev.summary} — ${geo.label}`}
                      >
                        <Pin background="#4f46e5" glyphColor="#ffffff" borderColor="#312e81" />
                      </AdvancedMarker>
                    );
                  })}

                  {/* Marcadores de los Cafés HUB Oficiales (Lista Google Maps del usuario) */}
                  {visibleCafesHub.map((cafe) => (
                    <AdvancedMarker
                      key={cafe.id}
                      position={{ lat: cafe.lat, lng: cafe.lng }}
                      title={`☕ Café HUB (${cafe.barrio}): ${cafe.nombre} — ${cafe.direccion}`}
                      onClick={() => {
                        setSelectedMarkerContact(null);
                        setSelectedCafeHubPin(cafe);
                      }}
                    >
                      <Pin background="#059669" glyphColor="#ffffff" borderColor="#064e3b" />
                    </AdvancedMarker>
                  ))}

                  {/* Marcadores de Contactos Pendientes (No Adheridos) */}
                  {visibleContacts.map((c, idxPin) => (
                    <AdvancedMarker
                      key={`pin-${c.id}-${idxPin}`}
                      position={{ lat: c.lat, lng: c.lng }}
                      onClick={() => {
                        setSelectedCafeHubPin(null);
                        setSelectedMarkerContact(c);
                      }}
                    >
                      <Pin
                        background={
                          c.situacion === 'VISITA_AGENDADA'
                            ? '#eab308'
                            : c.rsp === 'Sí'
                            ? '#f97316'
                            : '#64748b'
                        }
                        glyphColor="#ffffff"
                        borderColor="#0f172a"
                      />
                    </AdvancedMarker>
                  ))}

                  {selectedCafeHubPin && (
                    <InfoWindow
                      position={{
                        lat: selectedCafeHubPin.lat,
                        lng: selectedCafeHubPin.lng,
                      }}
                      onCloseClick={() => setSelectedCafeHubPin(null)}
                    >
                      <div className="p-1.5 max-w-xs text-slate-900 space-y-1.5">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                          <Coffee className="w-3 h-3" />
                          CAFÉ HUB OFICIAL · {selectedCafeHubPin.barrio}
                        </div>
                        <p className="font-bold text-sm">{selectedCafeHubPin.nombre}</p>
                        <p className="text-xs text-slate-600">{selectedCafeHubPin.direccion}</p>
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <a
                            href={selectedCafeHubPin.urlGoogleMaps}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-slate-900 text-white text-xs font-semibold rounded hover:bg-slate-800 inline-flex items-center gap-1"
                          >
                            Abrir en Google Maps
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          {onSelectCafeHubForBarrio && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectCafeHubForBarrio(selectedCafeHubPin);
                                setSelectedCafeHubPin(null);
                              }}
                              className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-semibold rounded hover:bg-emerald-700"
                            >
                              Usar como Hub de {selectedCafeHubPin.barrio}
                            </button>
                          )}
                        </div>
                      </div>
                    </InfoWindow>
                  )}

                  {selectedMarkerContact && (
                    <InfoWindow
                      position={{
                        lat: selectedMarkerContact.lat,
                        lng: selectedMarkerContact.lng,
                      }}
                      onCloseClick={() => setSelectedMarkerContact(null)}
                    >
                      <div className="p-1 max-w-xs text-slate-900">
                        <p className="font-bold text-sm">
                          #{selectedMarkerContact.id} {selectedMarkerContact.nombreCompletoCorregido}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {selectedMarkerContact.calleOCruce || selectedMarkerContact.barrio} ·{' '}
                          {selectedMarkerContact.franjaHoraria}
                        </p>
                        <p className="text-xs text-slate-700 mt-1">
                          {selectedMarkerContact.comentario || 'Sin comentario'}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => onOpenWhatsApp(selectedMarkerContact)}
                            className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700"
                          >
                            Enviar WA
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleContactInRoute(selectedMarkerContact.id)}
                            className="px-2.5 py-1 bg-slate-900 text-white text-xs font-medium rounded hover:bg-slate-800"
                          >
                            {selectedForRouteIds.has(selectedMarkerContact.id)
                              ? 'Quitar de Ruta'
                              : 'Sumar a Ruta'}
                          </button>
                        </div>
                      </div>
                    </InfoWindow>
                  )}

                  {hojaDeRuta.length >= 1 && (
                    <ModernRouteOverlay
                      originLat={effectiveProfile.latPartida}
                      originLng={effectiveProfile.lngPartida}
                      destLat={hojaDeRuta[0].destinoLat}
                      destLng={hojaDeRuta[0].destinoLng}
                      stops={hojaDeRuta.map((p) => ({
                        lat: p.destinoLat,
                        lng: p.destinoLng,
                      }))}
                      travelMode={hojaDeRuta[0].modoTraslado}
                    />
                  )}
                </Map>
              </APIProvider>
            </div>
          ) : (
            <div className="relative bg-slate-50 text-slate-800">
              <svg
                viewBox="0 0 800 480"
                className="w-full h-[460px] block select-none bg-slate-50"
                role="img"
                aria-label="Mapa geoespacial interactivo de contactos pendientes y circuitos en CABA"
              >
                <defs>
                  <pattern
                    id="caba-grid"
                    width="40"
                    height="40"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 40 0 L 0 0 0 40"
                      fill="none"
                      stroke="rgba(203, 213, 225, 0.45)"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="800" height="480" fill="#f8fafc" />
                <rect width="800" height="480" fill="url(#caba-grid)" />

                {/* Etiquetas dinámicas de todos los barrios con contactos pendientes */}
                {dynamicBarrios.map(([barrioName]) => {
                  const coords =
                    COORDENADAS_BARRIOS_CABA[barrioName] ||
                    COORDENADAS_BARRIOS_CABA.Palermo;
                  const pt = projectToSvg(coords.lat, coords.lng);
                  return (
                    <text
                      key={barrioName}
                      x={pt.x}
                      y={pt.y - 12}
                      fill="#94a3b8"
                      fontSize="10"
                      fontWeight="700"
                      textAnchor="middle"
                      letterSpacing="0.05em"
                    >
                      {barrioName.toUpperCase()}
                    </text>
                  );
                })}

                {/* Círculos de Radio de Caminata de los Micro-Clusters */}
                {visibleClusters.map((cl) => {
                  const pt = projectToSvg(cl.centroLat, cl.centroLng);
                  const isFocused = activeClusterId === cl.id;
                  return (
                    <g
                      key={cl.id}
                      onClick={() => setActiveClusterId(cl.id)}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isFocused ? (cl.convieneCafeHub ? 45 : 28) : (cl.convieneCafeHub ? 38 : 22)}
                        fill={
                          isFocused
                            ? 'rgba(16, 185, 129, 0.12)'
                            : cl.convieneCafeHub
                            ? 'rgba(245, 158, 11, 0.05)'
                            : 'rgba(14, 165, 233, 0.05)'
                        }
                        stroke={isFocused ? '#10b981' : cl.convieneCafeHub ? '#f59e0b' : '#38bdf8'}
                        strokeWidth={isFocused ? 2 : 1}
                        strokeDasharray={isFocused ? 'none' : '3 3'}
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isFocused ? 5.5 : 3.5}
                        fill={isFocused ? '#10b981' : cl.convieneCafeHub ? '#f59e0b' : '#38bdf8'}
                      />
                    </g>
                  );
                })}

                {/* Polilínea de la Hoja de Ruta Activa */}
                {hojaDeRuta.length > 0 && (
                  <g>
                    {hojaDeRuta.map((tramo) => {
                      const p1 = projectToSvg(tramo.origenLat, tramo.origenLng);
                      const p2 = projectToSvg(tramo.destinoLat, tramo.destinoLng);
                      return (
                        <line
                          key={`leg-${tramo.orden}`}
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke="#0284c7"
                          strokeWidth="2.5"
                          strokeDasharray={
                            tramo.modoTraslado === 'WALKING' ? '4 4' : 'none'
                          }
                        />
                      );
                    })}
                  </g>
                )}

                {/* Marcadores de Eventos de Google Calendar */}
                {uniqueCalendarEvents.map((ev, evIdx) => {
                  const geo = geocodificarEventoCalendar(ev, profile);
                  const pt = projectToSvg(geo.lat, geo.lng);
                  return (
                    <g key={`svg-cal-${ev.id}-${ev.fecha || ev.fechaISO || ''}-${ev.startTime || ''}-${evIdx}`}>
                      <rect
                        x={pt.x - 5}
                        y={pt.y - 5}
                        width={10}
                        height={10}
                        rx={2.5}
                        fill="#6366f1"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    </g>
                  );
                })}

                {/* Punto de Partida */}
                {(() => {
                  const basePt = projectToSvg(
                    effectiveProfile.latPartida,
                    effectiveProfile.lngPartida
                  );
                  return (
                    <g>
                      <circle
                        cx={basePt.x}
                        cy={basePt.y}
                        r={8}
                        fill="#0f172a"
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                      <circle
                        cx={basePt.x}
                        cy={basePt.y}
                        r={3}
                        fill="#facc15"
                      />
                    </g>
                  );
                })()}

                {/* Marcadores de los Cafés HUB Oficiales */}
                {visibleCafesHub.map((cafe) => {
                  const pt = projectToSvg(cafe.lat, cafe.lng);
                  return (
                    <g
                      key={`svg-cafe-${cafe.id}`}
                      onClick={() => {
                        setSelectedMarkerContact(null);
                        setSelectedCafeHubPin(cafe);
                      }}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={4.5}
                        fill="#10b981"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    </g>
                  );
                })}

                {/* Marcadores de Contactos Pendientes */}
                {visibleContacts.map((c, idxSvgPt) => {
                  const pt = projectToSvg(c.lat, c.lng);
                  const inRoute = selectedForRouteIds.has(c.id);
                  const isSelected = selectedMarkerContact?.id === c.id;
                  const isClusterMember = activeClusterId
                    ? visibleClusters.find((x) => x.id === activeClusterId)?.miembros.some((m) => m.contact.id === c.id)
                    : false;

                  const fill =
                    c.situacion === 'VISITA_AGENDADA'
                      ? '#f59e0b'
                      : c.rsp === 'Sí'
                      ? '#ea580c'
                      : '#64748b';

                  return (
                    <g
                      key={`svg-pt-${c.id}-${idxSvgPt}`}
                      onClick={() => {
                        setSelectedCafeHubPin(null);
                        setSelectedMarkerContact(c);
                      }}
                      className="cursor-pointer"
                    >
                      {(inRoute || isClusterMember) && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isClusterMember ? 12 : 10}
                          fill="none"
                          stroke={isClusterMember ? '#10b981' : '#0284c7'}
                          strokeWidth={isClusterMember ? 2 : 1.5}
                          strokeDasharray={isClusterMember ? 'none' : '3 3'}
                        />
                      )}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected || isClusterMember ? 7 : c.tieneCoordenadasExactas ? 5 : 4}
                        fill={isClusterMember ? '#10b981' : fill}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      {(isSelected || isClusterMember) && (
                        <text
                          x={pt.x + 9}
                          y={pt.y + 3.5}
                          fill="#0f172a"
                          fontSize="10"
                          fontWeight="700"
                          className="select-none"
                        >
                          #{c.id} {c.primerNombre}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {selectedCafeHubPin && (
                <div className="p-3.5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-black text-slate-900">
                      <Coffee className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{selectedCafeHubPin.nombre}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[10px] font-bold">
                        {selectedCafeHubPin.barrio}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {selectedCafeHubPin.direccion} · Café HUB Oficial
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={selectedCafeHubPin.urlGoogleMaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1.5 shadow-2xs transition"
                    >
                      <span>Ver en Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {onSelectCafeHubForBarrio && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCafeHubForBarrio(selectedCafeHubPin);
                          setSelectedCafeHubPin(null);
                        }}
                        className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 shadow-2xs transition"
                      >
                        Fijar como Hub de {selectedCafeHubPin.barrio}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedCafeHubPin(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {selectedMarkerContact && (
                <div className="p-3.5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-black text-slate-900">
                      <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>#{selectedMarkerContact.id} {selectedMarkerContact.nombreCompletoCorregido}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-600 text-[11px] font-medium">
                        {selectedMarkerContact.calleOCruce || selectedMarkerContact.barrio} · {selectedMarkerContact.franjaHoraria}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Col. G: {selectedMarkerContact.comentario || 'Sin comentario'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenWhatsApp(selectedMarkerContact)}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 shadow-2xs transition flex items-center gap-1.5"
                    >
                      <Send className="w-3 h-3" />
                      <span>Enviar WA</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleContactInRoute(selectedMarkerContact.id)}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 shadow-2xs transition"
                    >
                      {selectedForRouteIds.has(selectedMarkerContact.id) ? 'Quitar de Ruta' : 'Sumar a Ruta'}
                    </button>
                    {onSelectContactForEdit && (
                      <button
                        type="button"
                        onClick={() => onSelectContactForEdit(selectedMarkerContact)}
                        className="px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 shadow-2xs transition"
                      >
                        Ficha
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedMarkerContact(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Leyenda clara de pines */}
          <div className="px-5 py-3 bg-white border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 font-medium">
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
                Café HUB Oficial
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold text-amber-700">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                Visita Agendada
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold text-orange-700">
                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                Respondió Sí
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold text-slate-600">
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                Sin respuesta
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold text-indigo-700">
                <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
                Google Calendar
              </span>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Nodos de Micro-Clustering */}
        {mode === 'full' && (
        <div className="lg:col-span-5 min-w-0 space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Circuitos & Puntos Céntricos</span>
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Vecinos agrupados por cercanía geográfica y fechas en Col. G
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full shrink-0">
                {visibleClusters.length}
              </span>
            </div>

            {/* Selector de Filtro de Circuitos */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60">
              <button
                type="button"
                onClick={() => setSoloCafesHubSugeridosAgenda(false)}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center ${
                  !soloCafesHubSugeridosAgenda
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos los circuitos ({clusters.length})
              </button>
              <button
                type="button"
                onClick={() => setSoloCafesHubSugeridosAgenda(true)}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-center ${
                  soloCafesHubSugeridosAgenda
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Coffee className="w-3.5 h-3.5 text-amber-600" />
                <span>Cafés HUB sugeridos</span>
              </button>
            </div>

            <div className="space-y-3.5 max-h-[580px] overflow-y-auto pr-1">
              {visibleClusters.map((cl) => {
                const grounding = groundingResultByCluster[cl.id];
                const isLoadingGrounding = groundingLoadingCluster === cl.id;
                const isActiveCluster = activeClusterId === cl.id;
                const cafeElegido = selectedCafeByCluster[cl.id] || cl.cafesHubCercanos?.[0];
                const modalidadCircuito: ModalidadEncuentroAgenda =
                  selectedModalidadByCluster[cl.id] ||
                  cl.modalidadRecomendadaAgenda ||
                  (cl.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');

                if (!isActiveCluster) {
                  return (
                    <div
                      key={cl.id}
                      onClick={() => setActiveClusterId(cl.id)}
                      className="p-3.5 rounded-xl border border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                            cl.convieneCafeHub
                              ? 'bg-amber-100/70 text-amber-700'
                              : 'bg-sky-100/70 text-sky-700'
                          }`}
                        >
                          {cl.convieneCafeHub ? (
                            <Coffee className="w-4 h-4" />
                          ) : (
                            <Footprints className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-black text-slate-900 truncate">
                              {cl.nombreNodo}
                            </h4>
                            {cl.etiquetaFechaGrupo && (
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded shrink-0">
                                {cl.etiquetaFechaGrupo}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {cafeElegido ? `☕ ${cafeElegido.nombre}` : '🚶 Puerta a Puerta'} · {cl.miembros.length} vecinos ({cl.miembros.map((m) => m.contact.primerNombre || m.contact.nombre).join(', ')})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          ~{cl.mediaMinutos}m
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition" />
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={cl.id}
                    onClick={() => setActiveClusterId(cl.id)}
                    className="p-4 rounded-2xl border-2 border-emerald-500 ring-4 ring-emerald-500/10 bg-slate-50/70 shadow-sm transition-all"
                  >
                    {/* Header del Circuito */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${
                              cl.convieneCafeHub
                                ? 'bg-amber-50 text-amber-900 border-amber-200'
                                : 'bg-sky-50 text-sky-900 border-sky-200'
                            }`}
                          >
                            {cl.convieneCafeHub ? '☕ Café HUB' : '🚶 Casa x Casa'}
                          </span>
                          {cl.etiquetaFechaGrupo && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-200/70">
                              📅 {cl.etiquetaFechaGrupo}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-black text-slate-900 truncate">
                          {cl.nombreNodo}
                        </h4>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-500 shrink-0 bg-slate-100 px-2 py-0.5 rounded-md">
                        ~{cl.mediaMinutos}m a pie
                      </span>
                    </div>

                    {/* Vínculo y Estrategia recomendada (Concisa) */}
                    {cl.recomendacionAgendaTexto && (
                      <div className="mt-2.5 p-2 rounded-xl bg-amber-50/70 border border-amber-200/70 text-[11px] text-amber-950 flex items-start gap-1.5 leading-snug">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">
                          <strong className="font-bold">Estrategia:</strong> {cl.recomendacionAgendaTexto.replace(/^Recomendación Agenda Día por Día \([^)]+\):\s*/i, '')}
                        </span>
                      </div>
                    )}

                    {/* Selector de Modalidad Compacto */}
                    <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-4 gap-1 p-0.5 rounded-xl bg-slate-100/80 border border-slate-200/60">
                        {(
                          [
                            { id: 'CAFE_HUB', label: '☕ Café' },
                            { id: 'PUERTA_A_PUERTA', label: '🚶 Casa' },
                            { id: 'PUNTO_ADHESION', label: '📍 Punto' },
                            { id: 'EVENTO_SEDE', label: '🏛️ Sede' },
                          ] as { id: ModalidadEncuentroAgenda; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleCambiarModalidadCircuito(cl, opt.id)}
                            className={`py-1 rounded-lg text-[10px] font-black transition-all truncate text-center ${
                              modalidadCircuito === opt.id
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Café HUB Elegido + Dropdown Cambiar */}
                    {modalidadCircuito === 'CAFE_HUB' && cafeElegido && (
                      <div className="mt-2.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                          <div className="min-w-0 flex-1 flex items-center gap-1.5">
                            <Coffee className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="font-bold text-slate-900 truncate">{cafeElegido.nombre}</span>
                            <span className="text-[10px] text-slate-500 shrink-0">
                              · {cafeElegido.direccion.split(',')[0]}{'minutosCaminando' in cafeElegido ? ` (~${(cafeElegido as any).minutosCaminando}m)` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={cafeElegido.urlGoogleMaps}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Ver en Google Maps"
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            {cl.cafesHubCercanos && cl.cafesHubCercanos.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setChangingCafeForClusterId(
                                    changingCafeForClusterId === cl.id ? null : cl.id
                                  )
                                }
                                className="text-[10px] font-bold text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded-lg bg-slate-200/80 hover:bg-slate-300 transition"
                              >
                                {changingCafeForClusterId === cl.id ? 'Cerrar' : 'Cambiar'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Desplegable de selección si hace clic en Cambiar */}
                        {changingCafeForClusterId === cl.id && cl.cafesHubCercanos && (
                          <div className="p-2 rounded-xl bg-slate-100 border border-slate-200 space-y-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1">
                              Elegir Café HUB alternativo:
                            </span>
                            {cl.cafesHubCercanos.slice(0, 3).map((cafe) => {
                              const isSelected = cafeElegido.id === cafe.id;
                              return (
                                <div
                                  key={cafe.id}
                                  className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs transition ${
                                    isSelected
                                      ? 'bg-slate-900 text-white border-slate-900'
                                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-bold truncate">{cafe.nombre}</p>
                                    <p className={`text-[10px] truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                      {cafe.direccion.split(',')[0]} · {cafe.minutosCaminando} min
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleElegirCafeParaCircuito(cl, cafe);
                                      setChangingCafeForClusterId(null);
                                    }}
                                    className={`px-2 py-1 text-[10px] font-bold rounded-md shrink-0 transition ${
                                      isSelected
                                        ? 'bg-amber-400 text-slate-950'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    }`}
                                  >
                                    {isSelected ? '✓ Activo' : 'Elegir'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Resumen de vecinos */}
                    <div className="mt-2.5 flex items-center justify-between text-xs text-slate-600">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-slate-800 shrink-0">{cl.miembros.length} vecinos:</span>
                        <span className="truncate text-slate-500 text-[11px]">
                          {cl.miembros.map((m) => m.contact.primerNombre || m.contact.nombre).join(', ')}
                        </span>
                      </div>
                    </div>

                    {/* Acciones del Circuito */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setDrawerCluster(cl)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs"
                      >
                        <Send className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Personalizar WA ({cl.miembros.length})</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            cargarCircuitoDesdeCluster(cl);
                            setMobileMapSection('route_only');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs"
                          title="Cargar circuito en Hoja de Ruta"
                        >
                          <Navigation className="w-3.5 h-3.5 text-slate-500" />
                          <span>Ruta</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => consultarCafesGrounding(cl)}
                          disabled={isLoadingGrounding}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition disabled:opacity-50 shadow-2xs"
                          title="Consultar sugerencias con Gemini AI Grounding"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>{isLoadingGrounding ? '...' : 'IA'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Grounding result si existe */}
                    {grounding && (
                      <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-slate-800 space-y-2">
                        <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                          <span>Análisis de Café HUB cerca de {cl.esquinaCentrica}:</span>
                        </p>
                        <div className="whitespace-pre-line leading-relaxed text-[11px]">
                          {grounding.texto}
                        </div>
                        {grounding.links.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {grounding.links.map((lk, i) => (
                              <a
                                key={i}
                                href={lk.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-900 underline hover:text-amber-900"
                              >
                                <MapPin className="w-3 h-3 text-emerald-600" />
                                {lk.titulo}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        )}
      </div>
      )}

      {/* Cronograma Paso a Paso y Hoja de Ruta Calculada */}
      {mode !== 'map_only' && (
      <div
        className={`bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4 ${
          mobileMapSection === 'route_only' || mode === 'route_only' ? 'block' : 'hidden'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Navigation className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Hoja de Ruta en Terreno ({hojaDeRuta.length} paradas pendientes)</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70 text-[10px] font-black">
                En vivo
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Partida desde <strong className="text-slate-800">{effectiveProfile.direccionPartida}</strong> a las <strong className="text-slate-800">{horaSalida} hs</strong> · Personaliza los WhatsApp en vivo según tu hora estimada de llegada.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMapSection('map_and_clusters')}
              className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition shadow-2xs"
            >
              ← Volver a Mapa & Circuitos
            </button>
            {bloquesDelDiaHoy.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (onSelectAgendaBloque) onSelectAgendaBloque('');
                  const fechaRef = bloquesDelDiaHoy[0]?.fechaClave;
                  const idsBloques = bloquesDelDiaHoy.flatMap((b) =>
                    b.contactosIncluidos.map((c) => c.id)
                  );
                  const idsFecha = fechaRef
                    ? nonAdheredContacts
                        .filter((c) => c.fechasMencionadas.includes(fechaRef))
                        .map((c) => c.id)
                    : [];
                  const todosHoy = Array.from(new Set([...idsBloques, ...idsFecha]));
                  setSelectedForRouteIds(new Set(todosHoy));
                  if (bloquesDelDiaHoy[0]?.horaInicioCalculada) {
                    setHoraSalida(bloquesDelDiaHoy[0].horaInicioCalculada);
                  }
                }}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 whitespace-nowrap shadow-xs"
              >
                📅 Todas las de HOY
              </button>
            )}
            {dynamicBarrios.map(([barrio, count]) => (
              <button
                key={barrio}
                type="button"
                onClick={() => {
                  const fechaRef =
                    activeAgendaBloque?.fechaClave || bloquesDelDiaHoy[0]?.fechaClave;
                  const delBarrio = nonAdheredContacts.filter((c) => c.barrio === barrio);
                  const delBarrioEnFecha = fechaRef
                    ? delBarrio.filter((c) => c.fechasMencionadas.includes(fechaRef))
                    : [];
                  const ids = (delBarrioEnFecha.length > 0 ? delBarrioEnFecha : delBarrio).map(
                    (c) => c.id
                  );
                  setSelectedForRouteIds(new Set(ids));
                }}
                className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 text-slate-800 rounded-lg hover:bg-slate-200 whitespace-nowrap"
              >
                Circuito {barrio} ({count})
              </button>
            ))}
          </div>
        </div>

        {/* Barra de Situación en Terreno */}
        <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-2 flex-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Situación en Terreno (adapta todos los mensajes en 1 clic):</span>
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'RECORDATORIO_MANIANA_ANTES_SALIR', label: '🌅 Antes de salir' },
                  { id: 'EN_CAMINO_HORA_CALC', label: '🚗 En camino (Hora)' },
                  { id: 'DEMORADO_10_MIN', label: '⏳ Demorado (+15m)' },
                  { id: 'LLEGANDO_2_MIN', label: '🔔 En la puerta (2 min)' },
                  { id: 'YA_EN_CAFE_HUB', label: '☕ En Café HUB' },
                  { id: 'NO_ESTABA_REPROGRAMAR', label: '🚪 No estaba' },
                  { id: 'DISCULPAS_CANCELACION_REPROGRAMAR', label: '🗓️ Reprogramar' },
                ] as { id: ModoMensajeTerrenoRuta; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setModoTerrenoRuta(m.id);
                    setModoTerrenoPorParada({});
                    setCustomRouteMessages({});
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                    modoTerrenoRuta === m.id
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {modoTerrenoRuta === 'YA_EN_CAFE_HUB' && (
            <div className="min-w-[220px]">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Café HUB instalado:
              </label>
              <input
                type="text"
                value={cafeHubActivoEnRuta}
                onChange={(e) => {
                  setCafeHubActivoEnRuta(e.target.value);
                  setCustomRouteMessages({});
                }}
                placeholder="Ej: Café García (Av. San Isidro y Arias)"
                className="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}
        </div>

        {hojaDeRuta.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            Seleccioná un circuito de barrio arriba o hacé clic en &quot;Cargar en Ruta&quot; en cualquiera de los circuitos.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {hojaDeRuta.map((p, idxStop) => {
              const modoIndividual = modoTerrenoPorParada[p.contact.id];
              const modoEfectivoParada: ModoMensajeTerrenoRuta =
                modoIndividual ||
                ((p.conflictoCalendar || p.vencidaSinAdherir) &&
                modoTerrenoRuta === 'EN_CAMINO_HORA_CALC'
                  ? 'DISCULPAS_CANCELACION_REPROGRAMAR'
                  : modoTerrenoRuta);

              // Café HUB unificado entre Agenda Día por Día (Pestaña 2), recuadro amarillo y Mensaje WA personalizado
              const cafeUnificadoParada =
                cafeHubActivoEnRuta ||
                (p.cafeHubAsignado
                  ? `${p.cafeHubAsignado.nombre} (${p.cafeHubAsignado.direccion.split(',')[0]})`
                  : cafeBloqueSincronizado
                  ? `${cafeBloqueSincronizado.nombre} (${cafeBloqueSincronizado.direccion.split(',')[0]})`
                  : p.contact.barrio);

              const msgRuta =
                customRouteMessages[p.contact.id] ??
                generarMensajeTerrenoParadaRuta(
                  p,
                  modoEfectivoParada,
                  effectiveProfile,
                  cafeUnificadoParada
                );
              const isExpanded = expandedRouteStopId === p.contact.id;
              const estaConfirmado1a1 = Boolean(
                p.confirmadoEnLista1a1 || esContactoConfirmadoEnLista1a1(p.contact)
              );
              const modBloqueActivo =
                activeAgendaBloque?.modalidadElegidaUsuario || activeAgendaBloque?.modalidad;
              const prefiereDomicilioConfirmado =
                /declin[oó]\s+caf[eé]|puerta\s+a\s+puerta/i.test(p.contact.comentario || '') ||
                modBloqueActivo === 'PUERTA_A_PUERTA';

              return (
                <div
                  key={`stop-${p.contact.id}-${idxStop}`}
                  className={`p-3 sm:p-4 rounded-xl border transition-colors space-y-2.5 ${
                    p.vencidaSinAdherir
                      ? 'border-rose-400 bg-rose-50/40'
                      : p.conflictoCalendar
                      ? 'border-amber-400 bg-amber-50/30'
                      : estaConfirmado1a1
                      ? 'border-emerald-300 bg-emerald-50/10'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold shrink-0 ${
                          p.vencidaSinAdherir
                            ? 'bg-rose-700 text-white'
                            : 'bg-slate-900 text-white'
                        }`}
                      >
                        #{p.orden} · {p.horaLlegada} hs
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm flex flex-wrap items-center gap-1.5">
                          <span>
                            #{p.contact.id} {p.contact.nombreCompletoCorregido}
                          </span>
                          <span className="text-xs font-normal text-slate-500">
                            ({p.destinoNombre})
                          </span>
                          {p.vencidaSinAdherir && (
                            <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold">
                              ⚠️ Horario vencido sin adherir — Reprogramar
                            </span>
                          )}
                          {estaConfirmado1a1 ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-bold">
                              ✓ Confirmado en Lista 1-a-1 (Mensajes Activos)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                              ⏳ Pendiente confirmar respuesta en Lista 1-a-1
                            </span>
                          )}
                          {p.contact.situacion === 'RETIRO_FICHAS' && (
                            <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-900 text-[10px] font-bold">
                              📄 Llevar/Retirar Fichas Extras
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-800">
                            {p.modoTraslado === 'WALKING' ? (
                              <Footprints className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Bus className="w-3.5 h-3.5 shrink-0" />
                            )}
                            {p.detalleTransporte}
                          </span>
                          <span>·</span>
                          <span className="text-slate-500">
                            Col. G: {p.contact.comentario || 'Sin nota extra'}
                          </span>
                        </div>
                        {p.vencidaSinAdherir && p.motivoVencimiento && (
                          <div className="mt-1.5 p-2 rounded-md bg-rose-100/90 border border-rose-300 text-xs text-rose-950 font-semibold">
                            ⚠️ {p.motivoVencimiento} (Mensaje de disculpas y reprogramación listo para enviar abajo).
                          </div>
                        )}
                        {p.conflictoCalendar ? (
                          <div className="mt-1.5 p-2 rounded-md bg-amber-100/90 border border-amber-300 space-y-1 text-xs text-amber-950">
                            <div className="flex items-start gap-1.5 font-bold">
                              <Calendar className="w-3.5 h-3.5 text-amber-800 shrink-0 mt-0.5" />
                              <span>{p.conflictoCalendar}</span>
                            </div>
                            <p className="text-[11px] text-amber-900">
                              ⚡ <strong>Alternativa óptima sincronizada:</strong> pasar por {p.destinoNombre} en horario libre o encontrarnos en el Café HUB del bloque <strong>{cafeUnificadoParada}</strong>.
                            </p>
                          </div>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 bg-slate-50/80 px-2.5 py-1.5 rounded-xl border border-slate-200/60">
                            <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                              <Coffee className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>{prefiereDomicilioConfirmado ? 'Puerta a Puerta' : `Café HUB: ${cafeUnificadoParada}`}</span>
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-[11px] text-slate-500">
                              {p.notaHorarioConveniente || `Horario conveniente: ${p.horaLlegada} hs`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {onQuickStatusFromMap && (
                        <>
                          <button
                            type="button"
                            onClick={() => onQuickStatusFromMap(p.contact.id, 'YA_ADHIRIO')}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-300 hover:bg-emerald-200 flex items-center gap-1"
                            title="Marcar que ya firmó la ficha de adhesión (sale de pendientes y actualiza tiempos de las paradas siguientes)"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Ya Adhirió</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onQuickStatusFromMap(p.contact.id, 'DEJE_FICHAS')}
                            className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-900 border border-sky-200 hover:bg-sky-100"
                            title="Registrar que se dejaron fichas extras pendientes de retirar"
                          >
                            +Fichas
                          </button>
                        </>
                      )}

                      <a
                        href={p.urlGoogleMapsTramo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100"
                      >
                        Maps
                      </a>

                      {estaConfirmado1a1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRouteStopId(isExpanded ? null : p.contact.id)
                          }
                          className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-800 hover:bg-slate-100"
                        >
                          {isExpanded ? 'Ocultar Msj' : 'Editar Msj'}
                        </button>
                      )}

                      {p.contact.telWA && (
                        <button
                          type="button"
                          disabled={!estaConfirmado1a1}
                          onClick={() => {
                            if (!estaConfirmado1a1) return;
                            onOpenWhatsApp(p.contact, msgRuta);
                          }}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm transition-colors ${
                            estaConfirmado1a1
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                          }`}
                          title={
                            estaConfirmado1a1
                              ? 'Enviar mensaje de terreno por WhatsApp'
                              : 'Se activa automáticamente una vez confirmada la respuesta de la persona en la Lista 1-a-1 Unificada'
                          }
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>
                            {!estaConfirmado1a1
                              ? '🔒 Se activa al confirmar 1-a-1'
                              : modoEfectivoParada === 'DISCULPAS_CANCELACION_REPROGRAMAR'
                              ? 'Enviar Disculpa/Reprog.'
                              : modoEfectivoParada === 'NO_ESTABA_REPROGRAMAR'
                              ? 'Enviar No Estaba'
                              : `Enviar WA (${p.horaLlegada})`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Activación de mensajes de Hoja de Ruta una vez confirmada la respuesta en la Lista 1-a-1 Unificada */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    {!estaConfirmado1a1 ? (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-300 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-700">
                            🔒 <strong>Mensajes de terreno en espera de confirmación 1-a-1:</strong> consolidá la respuesta de <strong>{p.contact.nombreCompletoCorregido}</strong> en la <em>Lista 1-a-1 Unificada</em> (Paso 2) o directamente acá para activar su mensaje de Hoja de Ruta y adecuar el bloque horario:
                          </p>
                          {onBackToAgendaTab && (
                            <button
                              type="button"
                              onClick={onBackToAgendaTab}
                              className="px-2 py-1 rounded text-[11px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100 shrink-0"
                            >
                              Ir a Lista 1-a-1 (Paso 2)
                            </button>
                          )}
                        </div>
                        {onQuickStatusFromMap && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-bold text-slate-600">
                              Consolidar respuesta (activa Hoja de Ruta):
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onQuickStatusFromMap(
                                  p.contact.id,
                                  prefiereDomicilioConfirmado
                                    ? 'PASA_PUERTA_A_PUERTA'
                                    : 'CONFIRMO_CAFE_HUB',
                                  cafeUnificadoParada
                                )
                              }
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                              ✓ Confirmó Propuesta
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onQuickStatusFromMap(p.contact.id, 'PASA_PUERTA_A_PUERTA')
                              }
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200"
                            >
                              🏠 Declinó Café HUB → Pasar a Puerta a Puerta
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onQuickStatusFromMap(
                                  p.contact.id,
                                  'CONFIRMO_CAFE_HUB',
                                  cafeUnificadoParada
                                )
                              }
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-100 text-indigo-950 border border-indigo-300 hover:bg-indigo-200"
                            >
                              ☕ Prefiere ir a Café HUB
                            </button>
                            <button
                              type="button"
                              onClick={() => onQuickStatusFromMap(p.contact.id, 'YA_ADHIRIO')}
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-800"
                            >
                              ✓ Ya Adhirió (Descartar)
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Situación de parada:
                          </span>
                          <select
                            value={modoEfectivoParada}
                            onChange={(e) => {
                              const optId = e.target.value as ModoMensajeTerrenoRuta;
                              setModoTerrenoPorParada((prev) => ({
                                ...prev,
                                [p.contact.id]: optId,
                              }));
                              setCustomRouteMessages((prev) => {
                                const next = { ...prev };
                                delete next[p.contact.id];
                                return next;
                              });
                            }}
                            className="px-2.5 py-1 text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-800 hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
                          >
                            <option value="RECORDATORIO_MANIANA_ANTES_SALIR">🌅 Recordatorio mañana antes de salir</option>
                            <option value="EN_CAMINO_HORA_CALC">🚗 En camino (Hora calculada)</option>
                            <option value="LLEGANDO_2_MIN">🔔 En la puerta (2 min)</option>
                            <option value="YA_EN_CAFE_HUB">☕ Ya en Café HUB</option>
                            <option value="DEMORADO_10_MIN">⏳ Demorado (+15/20 min)</option>
                            <option value="DISCULPAS_CANCELACION_REPROGRAMAR">🗓️ Disculpas / Reprogramar</option>
                            <option value="NO_ESTABA_REPROGRAMAR">🚪 No estaba en domicilio</option>
                          </select>
                        </div>

                        {isExpanded ? (
                          <textarea
                            rows={3}
                            value={msgRuta}
                            onChange={(e) =>
                              setCustomRouteMessages((prev) => ({
                                ...prev,
                                [p.contact.id]: e.target.value,
                              }))
                            }
                            className="w-full p-2 text-xs border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:bg-white"
                          />
                        ) : (
                          <p className="text-xs text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/80 whitespace-pre-line">
                            <strong className="text-slate-900">Mensaje WA personalizado:</strong>{' '}
                            {msgRuta}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Drawer Lateral para Personalizar y Enviar WA de los Vecinos del Circuito */}
      <AnimatePresence>
        {drawerCluster && (
          <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/30 backdrop-blur-xs flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0" onClick={() => setDrawerCluster(null)} />

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
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200/70">
                      {drawerCluster.miembros.length} vecinos
                    </span>
                    <h3 className="truncate text-base font-black text-slate-900">
                      {drawerCluster.nombreNodo}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {(() => {
                      const mod =
                        selectedModalidadByCluster[drawerCluster.id] ||
                        drawerCluster.modalidadRecomendadaAgenda ||
                        (drawerCluster.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
                      const cafe =
                        selectedCafeByCluster[drawerCluster.id] ||
                        drawerCluster.cafesHubCercanos?.[0];
                      return mod === 'CAFE_HUB'
                        ? `☕ Café HUB: ${cafe?.nombre || drawerCluster.cafeRecomendado}`
                        : mod === 'PUERTA_A_PUERTA'
                        ? '🚶 Modalidad: Casa x Casa'
                        : mod === 'PUNTO_ADHESION'
                        ? '📍 Modalidad: Punto de Adhesión'
                        : '🏛️ Modalidad: Evento en Sede';
                    })()}{' '}
                    · ~{drawerCluster.mediaMinutos}m a pie
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setDrawerCluster(null)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Contenido del Drawer */}
              <div className="p-6 space-y-6">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">
                    Mensajes 1-a-1 personalizados según modalidad y café HUB.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      cargarCircuitoDesdeCluster(drawerCluster);
                      setDrawerCluster(null);
                      setMobileMapSection('route_only');
                    }}
                    className="px-2.5 py-1 text-xs font-bold bg-white text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-100 shadow-2xs shrink-0"
                  >
                    Cargar en Ruta →
                  </button>
                </div>

                <div className="space-y-4">
                  {drawerCluster.miembros.map((m, idxM) => {
                    const msgKey = `${drawerCluster.id}-${m.contact.id}`;
                    const modCircuito =
                      selectedModalidadByCluster[drawerCluster.id] ||
                      drawerCluster.modalidadRecomendadaAgenda ||
                      (drawerCluster.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
                    const cafeElegidoDrawer =
                      selectedCafeByCluster[drawerCluster.id] ||
                      drawerCluster.cafesHubCercanos?.[0];

                    const msgTexto =
                      customClusterMessages[msgKey] ??
                      generarMensajePersonalizadoCircuitoMapa(
                        m.contact,
                        drawerCluster,
                        profile,
                        {
                          modalidad: modCircuito,
                          cafeSeleccionado: cafeElegidoDrawer
                            ? {
                                nombre: cafeElegidoDrawer.nombre,
                                direccion: cafeElegidoDrawer.direccion,
                              }
                            : undefined,
                        }
                      );

                    return (
                      <div
                        key={`drawer-m-${drawerCluster.id}-${m.contact.id}-${idxM}`}
                        className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3"
                      >
                        {/* Cabecera del Vecino */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-slate-400">
                                #{m.contact.id}
                              </span>
                              <h4 className="text-sm font-black text-slate-900 truncate">
                                {m.contact.nombreCompletoCorregido}
                              </h4>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {m.contact.calleOCruce || m.contact.barrio} · {m.minutosCaminando} min a pie
                            </p>
                          </div>

                          {m.contact.fechasMencionadas.length > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 font-mono text-[10px] font-bold border border-indigo-200/70">
                              Col. G: {m.contact.fechasMencionadas.join(', ')}
                            </span>
                          )}
                        </div>

                        {/* Textarea */}
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                            Mensaje WhatsApp:
                          </label>
                          <textarea
                            rows={3}
                            value={msgTexto}
                            onChange={(e) =>
                              setCustomClusterMessages((prev) => ({
                                ...prev,
                                [msgKey]: e.target.value,
                              }))
                            }
                            className="w-full p-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50/60 text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                          />
                        </div>

                        {/* Botones de Acción */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                          <div className="flex flex-wrap items-center gap-1">
                            {onQuickStatusFromMap && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onQuickStatusFromMap(
                                      m.contact.id,
                                      'CONFIRMO_CAFE_HUB',
                                      cafeElegidoDrawer
                                        ? `${cafeElegidoDrawer.nombre} (${cafeElegidoDrawer.direccion.split(',')[0]})`
                                        : drawerCluster.cafeRecomendado
                                    )
                                  }
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100 transition shadow-2xs"
                                >
                                  ✓ Confirmó Café
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onQuickStatusFromMap(
                                      m.contact.id,
                                      'PASA_PUERTA_A_PUERTA'
                                    )
                                  }
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-950 border border-amber-300 hover:bg-amber-100 transition shadow-2xs"
                                  title="Si declina la propuesta de Café HUB, pasa automáticamente a Recorrido Puerta a Puerta"
                                >
                                  🚶 Casa x Casa
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onQuickStatusFromMap(m.contact.id, 'YA_ADHIRIO')
                                  }
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-2xs"
                                >
                                  🎉 Ya Adhirió
                                </button>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopyMapText(msgKey, msgTexto)}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center gap-1 transition shadow-2xs"
                            >
                              {copiedMapMsgId === msgKey ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Copiado</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copiar</span>
                                </>
                              )}
                            </button>
                            {m.contact.telWA && (
                              <button
                                type="button"
                                onClick={() => onOpenWhatsApp(m.contact, msgTexto)}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-2xs transition"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Enviar WA</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
