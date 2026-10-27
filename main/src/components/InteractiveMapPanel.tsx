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
  Clock,
  CheckCircle2,
} from 'lucide-react';
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
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {/* Selector Rápido en Celular / Tablet (<1024px) cuando mode === 'full' */}
      {mode === 'full' && (
      <div className="lg:hidden bg-slate-900 text-white p-1.5 rounded-xl grid grid-cols-3 gap-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setMobileMapSection('map_and_clusters')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
            mobileMapSection === 'map_and_clusters'
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Mapa ({visibleContacts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileMapSection('clusters_only')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
            mobileMapSection === 'clusters_only'
              ? 'bg-amber-400 text-slate-950 shadow-sm'
              : 'text-amber-300 hover:text-amber-200'
          }`}
        >
          <Coffee className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Circuitos ({visibleClusters.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileMapSection('route_only')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
            mobileMapSection === 'route_only'
              ? 'bg-emerald-500 text-slate-950 shadow-sm'
              : 'text-emerald-300 hover:text-emerald-200'
          }`}
        >
          <Navigation className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Ruta ({hojaDeRuta.length})</span>
        </button>
      </div>
      )}

      {/* Controles de Filtro Geoespacial, Punto de Partida (Base o Evento Calendar) y Parámetros */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 space-y-3 sm:space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] sm:text-xs font-bold bg-emerald-100 text-emerald-900">
              En Mapa y Circuitos: {nonAdheredContacts.length} con Dirección/Punto en Col. G
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] sm:text-xs font-medium bg-slate-100 text-slate-700">
              Ocultos ({excludedOnlyBarrioCount} sólo con barrio, sin dirección en Col. G)
            </span>
            <span className="hidden md:inline text-xs text-slate-500">
              Sólo se contemplan personas sin adherir con dirección/punto en Columna G y se agrupan respetando sus fechas.
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 items-end">
          <div>
            <label
              htmlFor="map-barrio-filter"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Filtrar por Barrio (Col. G)
            </label>
            <select
              id="map-barrio-filter"
              value={selectedBarrio}
              onChange={(e) => setSelectedBarrio(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="Todos">
                Todos los barrios ({nonAdheredContacts.length} con dir. en Col. G)
              </option>
              {dynamicBarrios.map(([barrio, count]) => (
                <option key={barrio} value={barrio}>
                  {barrio} ({count} con dir. en Col. G)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="map-franja-filter"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Franja Horaria Compatible
            </label>
            <select
              id="map-franja-filter"
              value={selectedFranja}
              onChange={(e) => setSelectedFranja(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="Todos">Todas las franjas</option>
              <option value="Mañana">Mañana (08:30 a 12:30)</option>
              <option value="Mediodía">Mediodía (12:00 a 15:00)</option>
              <option value="Tarde">Tarde (15:00 a 18:00)</option>
              <option value="Vespertino">Vespertino (18:00+)</option>
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-2">
            <label
              htmlFor="map-origen-select"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Punto de Partida (Base o Dirección de Evento en Google Calendar)
            </label>
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
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="base">
                Km 0 Base: {profile.direccionPartida}
              </option>
              {uniqueCalendarEvents.map((ev, evIdx) => (
                <option
                  key={`opt-cal-${ev.id}-${ev.fecha || ev.fechaISO || ''}-${ev.startTime || ''}-${evIdx}`}
                  value={ev.id}
                >
                  Desde Evento Calendar ({ev.endTime} hs): {ev.summary} —{' '}
                  {ev.location || 'CABA'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="map-hora-salida"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Hora Salida
              </label>
              <input
                id="map-hora-salida"
                type="time"
                value={horaSalida}
                onChange={(e) => setHoraSalida(e.target.value)}
                className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="map-buffer-min"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Min/Parada
              </label>
              <input
                id="map-buffer-min"
                type="number"
                min={10}
                max={45}
                value={bufferMinutos}
                onChange={(e) => setBufferMinutos(Number(e.target.value) || 20)}
                className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
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

      {/* Grilla Principal: Mapa Interactivo (En mode === 'route_only' se oculta porque vive al final de la Pestaña 2) */}
      {mode !== 'route_only' && (
      <div
        className={`grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start min-w-0 ${
          mobileMapSection === 'route_only' ? 'hidden lg:grid' : 'grid'
        }`}
      >
        {/* Mapa Interactivo CABA (12 cols cuando mode === 'map_only', 7 cols cuando mode === 'full') */}
        <div
          className={`${
            mode === 'map_only' ? 'lg:col-span-12' : 'lg:col-span-7'
          } min-w-0 bg-white border border-slate-200 rounded-xl overflow-hidden ${
            mobileMapSection === 'clusters_only' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="px-3.5 sm:px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Mapa de Pendientes CABA — Puntos Céntricos Café Hub y Rutas Casa x Casa
              </h2>
              <p className="text-xs text-slate-500">
                Mostrando únicamente los {visibleContacts.length} contactos que aún no adhirieron y tus eventos de Google Calendar
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono tabular-nums text-slate-600">
                {visibleContacts.length} pendientes · {visibleClusters.length} circuitos · {visibleCafesHub.length} Cafés HUB
              </span>
              {onGoToRouteTab && (
                <button
                  type="button"
                  onClick={onGoToRouteTab}
                  className="px-2.5 py-1 text-xs font-bold border border-emerald-600 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1 whitespace-nowrap shadow-sm"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Ir a 3. Hoja de Ruta ({hojaDeRuta.length} paradas)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCafesHubLayer((v) => !v)}
                className={`px-2.5 py-1 text-xs font-semibold border rounded-md flex items-center gap-1 whitespace-nowrap ${
                  showCafesHubLayer
                    ? 'border-amber-400 bg-amber-50 text-amber-950'
                    : 'border-slate-300 bg-slate-50 text-slate-600'
                }`}
              >
                <Coffee className="w-3.5 h-3.5 text-amber-700" />
                {showCafesHubLayer
                  ? `Cafés HUB Activos (${visibleCafesHub.length})`
                  : 'Mostrar Cafés HUB'}
              </button>
              <button
                type="button"
                onClick={() => setUseGoogleMapsView((v) => !v)}
                className="px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded-md bg-slate-50 text-slate-800 hover:bg-slate-100 whitespace-nowrap"
              >
                {useGoogleMapsView ? 'Ver Esquema Nodos' : 'Ver Google Maps'}
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
            <div className="relative bg-slate-950 text-white">
              <svg
                viewBox="0 0 800 480"
                className="w-full h-[460px] block select-none"
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
                      stroke="rgba(148, 163, 184, 0.12)"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="800" height="480" fill="#0f172a" />
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
                      fill="rgba(148, 163, 184, 0.45)"
                      fontSize="11"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      {barrioName.toUpperCase()}
                    </text>
                  );
                })}

                {/* Círculos de Radio de Caminata de los Micro-Clusters (sólo no adheridos) */}
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
                        r={cl.convieneCafeHub ? 42 : 24}
                        fill={
                          cl.convieneCafeHub
                            ? 'rgba(250, 204, 21, 0.12)'
                            : 'rgba(56, 189, 248, 0.1)'
                        }
                        stroke={cl.convieneCafeHub ? '#facc15' : '#38bdf8'}
                        strokeWidth={isFocused ? 2 : 1}
                        strokeDasharray={cl.convieneCafeHub ? 'none' : '4 4'}
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={5}
                        fill={cl.convieneCafeHub ? '#facc15' : '#38bdf8'}
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
                          stroke="#38bdf8"
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
                        x={pt.x - 6}
                        y={pt.y - 6}
                        width={12}
                        height={12}
                        rx={3}
                        fill="#6366f1"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      <text
                        x={pt.x + 10}
                        y={pt.y + 4}
                        fill="#a5b4fc"
                        fontSize="10"
                        fontWeight="600"
                      >
                        Calendar {ev.startTime}: {ev.summary.slice(0, 22)}
                      </text>
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
                        r={9}
                        fill="#facc15"
                        stroke="#0f172a"
                        strokeWidth="2"
                      />
                      <text
                        x={basePt.x + 12}
                        y={basePt.y + 4}
                        fill="#fde047"
                        fontSize="11"
                        fontWeight="700"
                      >
                        Partida ({effectiveProfile.direccionPartida.split(',')[0]})
                      </text>
                    </g>
                  );
                })()}

                {/* Marcadores de los Cafés HUB Oficiales en vista Esquema Nodos */}
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
                        stroke="#064e3b"
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
                  const fill =
                    c.situacion === 'VISITA_AGENDADA'
                      ? '#facc15'
                      : c.rsp === 'Sí'
                      ? '#fb923c'
                      : '#94a3b8';
                  return (
                    <g
                      key={`svg-pt-${c.id}-${idxSvgPt}`}
                      onClick={() => {
                        setSelectedCafeHubPin(null);
                        setSelectedMarkerContact(c);
                      }}
                      className="cursor-pointer"
                    >
                      {inRoute && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={11}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2"
                        />
                      )}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 8 : c.tieneCoordenadasExactas ? 6 : 4.5}
                        fill={fill}
                        stroke="#0f172a"
                        strokeWidth="1.5"
                      />
                      {c.tieneCoordenadasExactas && (
                        <text
                          x={pt.x + 8}
                          y={pt.y + 3}
                          fill="#f8fafc"
                          fontSize="10"
                          fontWeight="500"
                        >
                          #{c.id} {c.primerNombre}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {selectedCafeHubPin && (
                <div className="p-4 bg-slate-900/95 border-t border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <Coffee className="w-4 h-4 text-emerald-400" />
                      <span>{selectedCafeHubPin.nombre}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-emerald-300">{selectedCafeHubPin.barrio}</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      {selectedCafeHubPin.direccion} (Café HUB Oficial de tu lista Google Maps)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={selectedCafeHubPin.urlGoogleMaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-slate-900 hover:bg-slate-100 flex items-center gap-1 whitespace-nowrap"
                    >
                      Abrir en Google Maps
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    {onSelectCafeHubForBarrio && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCafeHubForBarrio(selectedCafeHubPin);
                          setSelectedCafeHubPin(null);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 whitespace-nowrap"
                      >
                        Fijar como Hub de {selectedCafeHubPin.barrio}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {selectedMarkerContact && (
                <div className="p-4 bg-slate-900/95 border-t border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <span>
                        #{selectedMarkerContact.id}{' '}
                        {selectedMarkerContact.nombreCompletoCorregido}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-amber-300">
                        {selectedMarkerContact.calleOCruce ||
                          selectedMarkerContact.barrio}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-xs text-slate-300">
                        {selectedMarkerContact.franjaHoraria}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      {selectedMarkerContact.comentario ||
                        selectedMarkerContact.motivoEstrategico}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleContactInRoute(selectedMarkerContact.id)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                    >
                      {selectedForRouteIds.has(selectedMarkerContact.id)
                        ? 'Quitar de Ruta'
                        : '+ Sumar a Ruta'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectContactForEdit(selectedMarkerContact)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-400 text-slate-950 hover:bg-amber-300 whitespace-nowrap"
                    >
                      Abrir en Bandeja
                    </button>
                    {selectedMarkerContact.telWA && (
                      <button
                        type="button"
                        onClick={() => onOpenWhatsApp(selectedMarkerContact)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Send className="w-3.5 h-3.5" />
                        WhatsApp 1-Clic
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Leyenda clara de pines (sólo no adheridos + Cafés HUB Oficiales + eventos Calendar) */}
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-900">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                Verde: Café HUB Oficial (Tu lista Google Maps)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                Amarillo: Visita agendada (Pendiente)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                Naranja: Cambió el chip (Respondió Sí)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
                Gris: Sin respuesta aún
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                Índigo: Evento Google Calendar
              </span>
            </div>
          </div>
        </div>

        {/* Columna Derecha (5 cols): Nodos de Micro-Clustering (Oculto cuando mode === 'map_only' porque ya está integrado en Agenda Recomendada Día por Día) */}
        {mode === 'full' && (
        <div
          className={`lg:col-span-5 min-w-0 space-y-4 ${
            mobileMapSection === 'route_only' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-700 shrink-0" />
                <span>Circuitos y Puntos Céntricos (Sólo No Adheridos)</span>
              </h3>
              <span className="text-xs text-slate-500 font-mono tabular-nums shrink-0">
                {visibleClusters.length} circuitos
              </span>
            </div>

            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              Agrupa vecinos sin adherir por cercanía y <strong>fecha en Columna G (&quot;Comentario&quot;)</strong>, alineado con la <strong>Agenda Día por Día</strong>. Elegí uno de los <strong>Cafés HUB de tu lista de Google Maps</strong> o cambiá la modalidad para <strong>personalizar automáticamente el mensaje</strong> de cada persona.
            </p>

            {/* Filtro rápido para mostrar sólo los Cafés HUB sugeridos para próximos días o todos los nodos */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3 pb-2.5 border-b border-slate-100">
              <button
                type="button"
                onClick={() => setSoloCafesHubSugeridosAgenda(false)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  !soloCafesHubSugeridosAgenda
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todos los circuitos ({clusters.length})
              </button>
              <button
                type="button"
                onClick={() => setSoloCafesHubSugeridosAgenda(true)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 ${
                  soloCafesHubSugeridosAgenda
                    ? 'bg-emerald-700 text-white'
                    : 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <Coffee className="w-3 h-3 shrink-0" />
                <span>Sólo Cafés HUB sugeridos próx. días</span>
              </button>
            </div>

            <div className="space-y-3.5 max-h-[560px] overflow-y-auto pr-1">
              {visibleClusters.map((cl) => {
                const grounding = groundingResultByCluster[cl.id];
                const isLoadingGrounding = groundingLoadingCluster === cl.id;
                const isActiveCluster = activeClusterId === cl.id;
                const cafeElegido = selectedCafeByCluster[cl.id] || cl.cafesHubCercanos?.[0];
                const modalidadCircuito: ModalidadEncuentroAgenda =
                  selectedModalidadByCluster[cl.id] ||
                  cl.modalidadRecomendadaAgenda ||
                  (cl.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');

                return (
                  <div
                    key={cl.id}
                    className={`p-3 sm:p-3.5 rounded-xl border transition-colors ${
                      isActiveCluster
                        ? 'border-slate-900 bg-slate-50/90 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                              cl.convieneCafeHub
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-sky-100 text-sky-900'
                            }`}
                          >
                            {cl.veredicto}
                          </span>
                          {cl.etiquetaFechaGrupo && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-200">
                              📅 {cl.etiquetaFechaGrupo}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-1 break-words">
                          {cl.nombreNodo}
                        </h4>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-slate-600 shrink-0">
                        Prom. {cl.mediaMinutos} min
                      </span>
                    </div>

                    {/* Recomendación sincronizada con la Agenda Día por Día (Pestaña 2) */}
                    {cl.recomendacionAgendaTexto && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-50/80 border border-amber-200 text-[11px] text-amber-950 leading-snug">
                        <strong>Vínculo con Agenda Día por Día:</strong> {cl.recomendacionAgendaTexto}
                      </div>
                    )}

                    {/* Selector de Modalidad para personalizar los mensajes de este circuito */}
                    <div className="mt-2.5">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                        1. Elegir modalidad para personalizar mensajes del circuito:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                        {(
                          [
                            { id: 'CAFE_HUB', label: '☕ Café HUB' },
                            { id: 'PUERTA_A_PUERTA', label: '🚶 Puerta a Puerta' },
                            { id: 'PUNTO_ADHESION', label: '📍 Punto Adhesión' },
                            { id: 'EVENTO_SEDE', label: '🏛️ Sede Chile' },
                          ] as { id: ModalidadEncuentroAgenda; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleCambiarModalidadCircuito(cl, opt.id)}
                            className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors truncate ${
                              modalidadCircuito === opt.id
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cafés HUB de la lista de Google Maps más cercanos (Al elegir uno, modifica automáticamente el mensaje personalizado) */}
                    {cl.cafesHubCercanos && cl.cafesHubCercanos.length > 0 && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="text-[11px] font-bold text-emerald-950 flex items-center gap-1">
                            <Coffee className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            <span>2. Cafés HUB de tu lista Google Maps (tocá uno para personalizar msjs):</span>
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {cl.cafesHubCercanos.slice(0, 3).map((cafe, cIdx) => {
                            const isSelectedCafe = cafeElegido?.id === cafe.id;
                            return (
                              <div
                                key={cafe.id}
                                className={`flex flex-wrap items-center justify-between gap-1.5 text-xs px-2 py-1.5 rounded border transition-colors ${
                                  isSelectedCafe
                                    ? 'bg-emerald-950 text-white border-emerald-800 shadow-sm'
                                    : 'bg-white/95 text-slate-900 border-emerald-100'
                                }`}
                              >
                                <div className="min-w-0 flex-1 flex items-center gap-1 flex-wrap">
                                  {isSelectedCafe ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  ) : (
                                    <Coffee className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                  )}
                                  <span className="font-bold">
                                    {cafe.nombre}
                                  </span>{' '}
                                  <span
                                    className={`text-[11px] ${
                                      isSelectedCafe ? 'text-emerald-200' : 'text-slate-600'
                                    }`}
                                  >
                                    ({cafe.direccion.split(',')[0]})
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span
                                    className={`text-[10px] font-mono ${
                                      isSelectedCafe ? 'text-emerald-300' : 'text-emerald-800'
                                    }`}
                                  >
                                    {cafe.minutosCaminando}m ({cafe.cuadrasAprox}c)
                                  </span>
                                  <a
                                    href={cafe.urlGoogleMaps}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Abrir este Café HUB en Google Maps"
                                    className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 text-white rounded hover:bg-slate-700 inline-flex items-center gap-0.5"
                                  >
                                    Maps
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleElegirCafeParaCircuito(cl, cafe)}
                                    className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                                      isSelectedCafe
                                        ? 'bg-amber-400 text-slate-950'
                                        : 'bg-emerald-700 text-white hover:bg-emerald-800'
                                    }`}
                                  >
                                    {isSelectedCafe ? 'Café Activo en Msj' : 'Elegir y Personalizar'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Botón para desplegar / ver los mensajes personalizados 1-a-1 de este circuito */}
                    <div className="mt-2.5 pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveClusterId(isActiveCluster ? null : cl.id)
                        }
                        className="px-2.5 py-1.5 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isActiveCluster
                            ? `Ocultar Mensajes (${cl.miembros.length})`
                            : `Personalizar y Enviar Msj 1-a-1 (${cl.miembros.length})`}
                        </span>
                        {isActiveCluster ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            cargarCircuitoDesdeCluster(cl);
                            setMobileMapSection('route_only');
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 flex items-center gap-1"
                        >
                          <Navigation className="w-3.5 h-3.5 shrink-0" />
                          <span>Cargar en Ruta ({cl.miembros.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => consultarCafesGrounding(cl)}
                          disabled={isLoadingGrounding}
                          className="px-2 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{isLoadingGrounding ? '...' : 'IA'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Lista 1-a-1 de Vecinos con Mensaje Personalizado según el Café HUB y Modalidad elegidos */}
                    {isActiveCluster && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200 space-y-2.5">
                        <p className="text-[11px] font-bold text-slate-800">
                          Mensajes personalizados ({modalidadCircuito === 'CAFE_HUB' ? `Café HUB: ${cafeElegido?.nombre || cl.cafeRecomendado}` : modalidadCircuito}):
                        </p>
                        {cl.miembros.map((m, idxM) => {
                          const msgKey = `${cl.id}-${m.contact.id}`;
                          const msgTexto =
                            customClusterMessages[msgKey] ??
                            generarMensajePersonalizadoCircuitoMapa(
                              m.contact,
                              cl,
                              profile,
                              {
                                modalidad: modalidadCircuito,
                                cafeSeleccionado: cafeElegido
                                  ? {
                                      nombre: cafeElegido.nombre,
                                      direccion: cafeElegido.direccion,
                                    }
                                  : undefined,
                              }
                            );

                          return (
                            <div
                              key={`cl-m-${cl.id}-${m.contact.id}-${idxM}`}
                              className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                                <span className="font-bold text-slate-900">
                                  #{m.contact.id} {m.contact.nombreCompletoCorregido}{' '}
                                  <span className="font-normal text-slate-500">
                                    ({m.contact.calleOCruce || m.contact.barrio} · {m.minutosCaminando} min)
                                  </span>
                                </span>
                                {m.contact.fechasMencionadas.length > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-900 font-mono text-[10px] font-bold">
                                    Col. G: {m.contact.fechasMencionadas.join(', ')}
                                  </span>
                                )}
                              </div>

                              <textarea
                                rows={3}
                                value={msgTexto}
                                onChange={(e) =>
                                  setCustomClusterMessages((prev) => ({
                                    ...prev,
                                    [msgKey]: e.target.value,
                                  }))
                                }
                                className="w-full p-2 text-xs border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                              />

                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <div className="flex flex-wrap items-center gap-1">
                                  {onQuickStatusFromMap && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onQuickStatusFromMap(
                                            m.contact.id,
                                            'CONFIRMO_CAFE_HUB',
                                            cafeElegido
                                              ? `${cafeElegido.nombre} (${cafeElegido.direccion.split(',')[0]})`
                                              : cl.cafeRecomendado
                                          )
                                        }
                                        className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100"
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
                                        className="px-2 py-1 rounded text-[10px] font-bold bg-amber-50 text-amber-950 border border-amber-300 hover:bg-amber-100"
                                        title="Si declina la propuesta de Café HUB, pasa automáticamente a Recorrido Puerta a Puerta"
                                      >
                                        🚶 Declinó Café → Puerta a Puerta
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onQuickStatusFromMap(m.contact.id, 'YA_ADHIRIO')
                                        }
                                        className="px-2 py-1 rounded text-[10px] font-bold bg-slate-900 text-white hover:bg-slate-800"
                                      >
                                        🎉 Ya Adhirió
                                      </button>
                                    </>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyMapText(msgKey, msgTexto)}
                                    className="px-2 py-1 rounded text-[11px] font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                                  >
                                    {copiedMapMsgId === msgKey ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        <span>Copiado</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copiar</span>
                                      </>
                                    )}
                                  </button>
                                  {m.contact.telWA && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenWhatsApp(m.contact, msgTexto)}
                                      className="px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 shadow-sm"
                                    >
                                      <Send className="w-3 h-3" />
                                      <span>Enviar WA</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {grounding && (
                      <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-slate-800 space-y-2">
                        <p className="font-semibold text-slate-900">
                          Análisis de Café Hub cerca de {cl.esquinaCentrica}:
                        </p>
                        <div className="whitespace-pre-line leading-relaxed">
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
                                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 underline hover:text-amber-900"
                              >
                                <MapPin className="w-3 h-3" />
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

      {/* Cronograma Paso a Paso y Hoja de Ruta Calculada (Exclusivo en Pestaña 3: mode === 'route_only' o 'full') */}
      {mode !== 'map_only' && (
      <div
        className={`bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 ${
          mobileMapSection === 'clusters_only' && mode !== 'route_only' ? 'hidden lg:block' : 'block'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Navigation className="w-4 h-4 text-slate-900 shrink-0" />
                <span>Hoja de Ruta en Terreno · Casa x Casa y Café HUB ({hojaDeRuta.length} paradas pendientes)</span>
              </h3>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[11px] font-bold">
                Mensajes en vivo según horario de llegada
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Ideal al momento de <strong>iniciar la recorrida puerta a puerta, instalarte en el Café HUB o retirar fichas extras</strong>: partiendo desde <strong>{effectiveProfile.direccionPartida}</strong> a las <strong>{horaSalida} hs</strong>, personaliza automáticamente el WhatsApp de cada parada con su hora estimada y te permite marcar quién ya firmó.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
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
                className="px-2.5 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 whitespace-nowrap shadow-xs"
              >
                📅 Todas las de HOY ({bloquesDelDiaHoy[0]?.fechaClave || 'Hoy'})
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

        {/* Barra de Situación en Terreno: cambia automáticamente todos los mensajes de la Hoja de Ruta */}
        <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1.5 flex-1">
            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Mensajes en Vivo según Situación en Terreno (y ajuste automático por choques con Google Calendar):</span>
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'RECORDATORIO_MANIANA_ANTES_SALIR', label: '🌅 Recordatorio mañana (antes de salir)' },
                  { id: 'EN_CAMINO_HORA_CALC', label: '🚗 En camino (Normal con hora)' },
                  { id: 'DEMORADO_10_MIN', label: '⏳ Aviso de Demora (+15/20 min)' },
                  { id: 'DISCULPAS_CANCELACION_REPROGRAMAR', label: '🗓️ Disculpas por Cancelación / Reprogramar' },
                  { id: 'NO_ESTABA_REPROGRAMAR', label: '🚪 Esperé y no estaba / Reprogramar' },
                  { id: 'LLEGANDO_2_MIN', label: '🔔 En la puerta (llego en 2 min)' },
                  { id: 'YA_EN_CAFE_HUB', label: '☕ Ya instalado en Café HUB' },
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
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors text-left truncate ${
                    modoTerrenoRuta === m.id
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {modoTerrenoRuta === 'YA_EN_CAFE_HUB' && (
            <div className="min-w-[220px]">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Café HUB donde estás instalado ahora:
              </label>
              <input
                type="text"
                value={cafeHubActivoEnRuta}
                onChange={(e) => {
                  setCafeHubActivoEnRuta(e.target.value);
                  setCustomRouteMessages({});
                }}
                placeholder="Ej: Café García (Av. San Isidro y Arias)"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
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
                          <div className="mt-1.5 p-2 rounded-md bg-amber-50/90 border border-amber-300 space-y-1 text-xs text-amber-950">
                            <div className="flex items-start gap-1.5 font-bold">
                              <Coffee className="w-3.5 h-3.5 text-amber-800 shrink-0 mt-0.5" />
                              <span>
                                {prefiereDomicilioConfirmado
                                  ? `Opción definida (Puerta a Puerta): acercarse a ${p.destinoNombre} a las ${p.horaLlegada} hs · Café HUB alternativo: ${cafeUnificadoParada}`
                                  : `Opción definida (Café HUB del bloque): proponer ${cafeUnificadoParada} o acercarse a ${p.destinoNombre} a las ${p.horaLlegada} hs`}
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-900">
                              {p.notaHorarioConveniente
                                ? `✓ ${p.notaHorarioConveniente} Café HUB sugerido en correspondencia con Pestaña 2: ${cafeUnificadoParada}.`
                                : `✓ Horario conveniente en Hoja de Ruta: ${p.horaLlegada} hs (ordenado por horario según la agenda del día). Café HUB del bloque: ${cafeUnificadoParada}.`}
                            </p>
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
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] font-bold uppercase text-slate-500 mr-1">
                            Situación de esta parada:
                          </span>
                          {(
                            [
                              { id: 'RECORDATORIO_MANIANA_ANTES_SALIR', label: '🌅 Recordatorio mañana' },
                              { id: 'EN_CAMINO_HORA_CALC', label: '🚗 En camino' },
                              { id: 'LLEGANDO_2_MIN', label: '🔔 En puerta (2m)' },
                              { id: 'YA_EN_CAFE_HUB', label: '☕ Ya en Café HUB' },
                              { id: 'DEMORADO_10_MIN', label: '⏳ Demora (+15/20m)' },
                              { id: 'DISCULPAS_CANCELACION_REPROGRAMAR', label: '🗓️ Disculpas / Reprogramar' },
                              { id: 'NO_ESTABA_REPROGRAMAR', label: '🚪 No estaba / Reprogramar' },
                            ] as { id: ModoMensajeTerrenoRuta; label: string }[]
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setModoTerrenoPorParada((prev) => ({
                                  ...prev,
                                  [p.contact.id]: opt.id,
                                }));
                                setCustomRouteMessages((prev) => {
                                  const next = { ...prev };
                                  delete next[p.contact.id];
                                  return next;
                                });
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                                modoEfectivoParada === opt.id
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
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
    </div>
  );
}
