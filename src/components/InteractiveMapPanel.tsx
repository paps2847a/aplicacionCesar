import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Coffee,
  ExternalLink,
  Calendar,
  Plus,
  Search,
  UserCheck,
  Sparkles,
  Check,
  ArrowUpRight,
  Trash2,
} from 'lucide-react';
import {
  BloqueAgendaRecomendado,
  CalendarEventItem,
  Contact,
  MicroCluster,
  VoiceProfile,
} from '../types';
import {
  deduplicarEventosCalendar,
  geocodificarDireccionCABA,
  geocodificarEventoCalendar,
} from '../utils/logic';
import { COORDENADAS_BARRIOS_CABA } from '../data/estatusPopurriData';
import {
  CATALOGO_CAFES_HUB_CABA,
  CafeHubCurado,
} from '../data/cafesHubCatalog';

interface InteractiveMapPanelProps {
  contacts: Contact[];
  clusters?: MicroCluster[];
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
  onUpdateProfile?: (updated: VoiceProfile) => void;
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

const DEFAULT_GOOGLE_MAPS_API_KEY = 'AIzaSyA_yej0XtAZc54TYomzL1jqCiYSPiyAwwE';

export function InteractiveMapPanel({
  contacts,
  profile,
  calendarEvents,
  onSelectContactForEdit,
  onSelectCafeHubForBarrio,
  onUpdateProfile,
}: InteractiveMapPanelProps) {
  const apiKey =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || DEFAULT_GOOGLE_MAPS_API_KEY;
  const [mapViewEngine, setMapViewEngine] = useState<'google_maps' | 'vector'>(
    'google_maps'
  );
  const [selectedBarrio, setSelectedBarrio] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showCafesHubLayer, setShowCafesHubLayer] = useState<boolean>(true);
  const [selectedMarkerContact, setSelectedMarkerContact] = useState<Contact | null>(null);
  const [selectedCafeHubPin, setSelectedCafeHubPin] = useState<CafeHubCurado | null>(null);
  const [expandedBaseGmap, setExpandedBaseGmap] = useState<boolean>(false);
  const [expandedCalGmapId, setExpandedCalGmapId] = useState<string | null>(null);
  const [hoveredPinKey, setHoveredPinKey] = useState<string | null>(null);

  // Estado de Zoom y Paneo interactivo para el Esquema Vectorial
  const [vectorZoom, setVectorZoom] = useState<number>(1);
  const [vectorPan, setVectorPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingVector, setIsDraggingVector] = useState<boolean>(false);
  const vectorDragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null
  );

  const cafeCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleSelectCafeFromMap = (cafe: CafeHubCurado) => {
    setSelectedMarkerContact(null);
    setSelectedCafeHubPin(cafe);
    if (selectedBarrio !== 'Todos' && selectedBarrio !== cafe.barrio) {
      setSelectedBarrio('Todos');
    }
    setTimeout(() => {
      const cardEl = cafeCardRefs.current[cafe.id];
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 80);
  };

  // Estado para agregar o editar un Café de Especialidad en la lista
  const [showAddCafeForm, setShowAddCafeForm] = useState<boolean>(false);
  const [newCafeNombre, setNewCafeNombre] = useState<string>('');
  const [newCafeDireccion, setNewCafeDireccion] = useState<string>('');
  const [newCafeBarrio, setNewCafeBarrio] = useState<string>('Palermo');
  const [newCafeUrl, setNewCafeUrl] = useState<string>('');
  const [customCafesAdded, setCustomCafesAdded] = useState<CafeHubCurado[]>(() => {
    try {
      const saved = localStorage.getItem('popurri_custom_cafes_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [cafeNotice, setCafeNotice] = useState<string | null>(null);

  const uniqueCalendarEvents = useMemo(
    () => deduplicarEventosCalendar(calendarEvents),
    [calendarEvents]
  );

  // Combinar catálogo oficial con cafés personalizados agregados por el usuario
  const allCafesCatalog = useMemo(() => {
    const mapById = new globalThis.Map<string, CafeHubCurado>();
    for (const c of customCafesAdded) {
      mapById.set(c.id, c);
    }
    for (const c of CATALOGO_CAFES_HUB_CABA) {
      if (!mapById.has(c.id)) {
        mapById.set(c.id, c);
      }
    }
    // También incorporar los cafés personalizados guardados en profile.cafesPorBarrio si no están en el catálogo
    if (profile?.cafesPorBarrio && typeof profile.cafesPorBarrio === 'object') {
      Object.entries(profile.cafesPorBarrio).forEach(([barrio, rawCafeEntry]) => {
        if (!rawCafeEntry) return;
        const entryNombre =
          typeof rawCafeEntry === 'string'
            ? rawCafeEntry.split('(')[0]?.trim() || rawCafeEntry
            : String((rawCafeEntry as any).nombre || '').trim();
        const entryDireccion =
          typeof rawCafeEntry === 'string'
            ? rawCafeEntry.split('(')[1]?.replace(')', '').trim() || barrio
            : String((rawCafeEntry as any).direccion || (rawCafeEntry as any).esquina || barrio).trim();

        if (!entryNombre) return;

        const alreadyExists = Array.from(mapById.values()).some(
          (cf) =>
            cf.barrio === barrio &&
            entryNombre.toLowerCase().includes((cf.nombre || '').toLowerCase())
        );
        if (!alreadyExists) {
          const geo =
            typeof rawCafeEntry === 'object' &&
            typeof (rawCafeEntry as any).lat === 'number' &&
            typeof (rawCafeEntry as any).lng === 'number'
              ? { lat: (rawCafeEntry as any).lat, lng: (rawCafeEntry as any).lng }
              : geocodificarDireccionCABA(entryDireccion, barrio);
          const idCustom = `profile-cafe-${barrio}`;
          mapById.set(idCustom, {
            id: idCustom,
            nombre: entryNombre,
            direccion: entryDireccion,
            barrio,
            esCaba: true,
            lat: geo.lat,
            lng: geo.lng,
            urlGoogleMaps:
              (typeof rawCafeEntry === 'object' && (rawCafeEntry as any).urlGoogleMaps) ||
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${entryNombre} ${entryDireccion} ${barrio} CABA`
              )}`,
          });
        }
      });
    }
    return Array.from(mapById.values());
  }, [customCafesAdded, profile?.cafesPorBarrio]);

  const visibleCafesHub = useMemo(() => {
    if (!showCafesHubLayer) return [];
    return allCafesCatalog.filter((c) => {
      if (selectedBarrio !== 'Todos' && c.barrio !== selectedBarrio) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCafe =
          c.nombre.toLowerCase().includes(q) ||
          c.direccion.toLowerCase().includes(q) ||
          c.barrio.toLowerCase().includes(q);
        if (!matchCafe) return false;
      }
      return true;
    });
  }, [showCafesHubLayer, allCafesCatalog, selectedBarrio, searchQuery]);

  // Contactos pendientes en CABA
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

  const contactsWithLocation = useMemo(
    () =>
      allPendingCabaContacts.filter((c) =>
        Boolean(c.calleOCruce && c.calleOCruce.trim().length > 0)
      ),
    [allPendingCabaContacts]
  );

  const dynamicBarrios = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of allPendingCabaContacts) {
      const b = (c.barrio || 'CABA').trim();
      counts[b] = (counts[b] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allPendingCabaContacts]);

  const visibleContacts = useMemo(() => {
    return contactsWithLocation.filter((c) => {
      if (selectedBarrio !== 'Todos' && c.barrio !== selectedBarrio) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          c.nombreCompletoCorregido.toLowerCase().includes(q) ||
          (c.calleOCruce || '').toLowerCase().includes(q) ||
          c.barrio.toLowerCase().includes(q) ||
          String(c.id).includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [contactsWithLocation, selectedBarrio, searchQuery]);

  const visibleDirectoryContacts = useMemo(() => {
    return allPendingCabaContacts.filter((c) => {
      if (selectedBarrio !== 'Todos' && c.barrio !== selectedBarrio) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          c.nombreCompletoCorregido.toLowerCase().includes(q) ||
          (c.calleOCruce || '').toLowerCase().includes(q) ||
          c.barrio.toLowerCase().includes(q) ||
          String(c.id).includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [allPendingCabaContacts, selectedBarrio, searchQuery]);

  const handleSaveNewCafe = (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = newCafeNombre.trim();
    const direccion = newCafeDireccion.trim();
    const barrio = newCafeBarrio.trim() || 'Palermo';
    if (!nombre || !direccion) return;

    const geo = geocodificarDireccionCABA(direccion, barrio);
    const url =
      newCafeUrl.trim() ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${nombre}, ${direccion}, ${barrio}, CABA`
      )}`;

    const nuevoCafe: CafeHubCurado = {
      id: `custom-cafe-${Date.now()}`,
      nombre,
      direccion,
      barrio,
      esCaba: true,
      lat: geo.lat,
      lng: geo.lng,
      urlGoogleMaps: url,
    };

    const nextCustom = [nuevoCafe, ...customCafesAdded];
    setCustomCafesAdded(nextCustom);
    try {
      localStorage.setItem('popurri_custom_cafes_v1', JSON.stringify(nextCustom));
    } catch {
      // ignore storage error
    }

    if (onSelectCafeHubForBarrio) {
      onSelectCafeHubForBarrio(nuevoCafe);
    }
    if (onUpdateProfile) {
      onUpdateProfile({
        ...profile,
        cafesPorBarrio: {
          ...(profile.cafesPorBarrio || {}),
          [barrio]: {
            barrio,
            nombre,
            direccion: `${direccion}, ${barrio}, CABA`,
            esquina: direccion,
            lat: geo.lat,
            lng: geo.lng,
            horariosSugeridos: 'Entre las 15:00 y las 18:00 hs',
            urlGoogleMaps: url,
          },
        },
      });
    }

    setNewCafeNombre('');
    setNewCafeDireccion('');
    setNewCafeUrl('');
    setShowAddCafeForm(false);
    setCafeNotice(`☕ "${nombre}" agregado y fijado como Café preferido en ${barrio}.`);
    setTimeout(() => setCafeNotice(null), 4000);
  };

  const handleDeleteCustomCafe = (id: string) => {
    const next = customCafesAdded.filter((c) => c.id !== id);
    setCustomCafesAdded(next);
    try {
      localStorage.setItem('popurri_custom_cafes_v1', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const isCafePreferredInBarrio = (cafe: CafeHubCurado): boolean => {
    const rawPref = profile?.cafesPorBarrio?.[cafe.barrio];
    if (!rawPref) return false;
    const prefNombre =
      typeof rawPref === 'string'
        ? rawPref.toLowerCase()
        : String((rawPref as any).nombre || '').toLowerCase();
    const prefDir =
      typeof rawPref === 'string'
        ? rawPref.toLowerCase()
        : String((rawPref as any).direccion || (rawPref as any).esquina || '').toLowerCase();
    const cafeNombreLow = (cafe.nombre || '').toLowerCase().trim();
    const cafeCalleLow = (cafe.direccion || '').split(',')[0].toLowerCase().trim();
    if (!prefNombre || !cafeNombreLow) return false;
    const matchNombre = prefNombre.includes(cafeNombreLow) || cafeNombreLow.includes(prefNombre);
    if (!matchNombre) return false;
    if (prefDir && cafeCalleLow) {
      return prefDir.includes(cafeCalleLow) || cafeCalleLow.includes(prefDir.split(',')[0].trim());
    }
    return true;
  };

  const handleSetPreferredCafe = (cafe: CafeHubCurado) => {
    const yaActivo = isCafePreferredInBarrio(cafe);

    if (yaActivo) {
      // Deseleccionar café favorito al volver a hacer clic encima
      const nextCafesPorBarrio = { ...(profile?.cafesPorBarrio || {}) };
      delete nextCafesPorBarrio[cafe.barrio];
      if (onUpdateProfile) {
        onUpdateProfile({
          ...profile,
          cafesPorBarrio: nextCafesPorBarrio,
        });
      }
      setCafeNotice(
        `↺ Se deseleccionó "${cafe.nombre}" en ${cafe.barrio}. El Planificador sugiere siempre el café más cercano en distancia a cada grupo.`
      );
      setTimeout(() => setCafeNotice(null), 3500);
      return;
    }

    if (onSelectCafeHubForBarrio) {
      onSelectCafeHubForBarrio(cafe);
    }
    if (onUpdateProfile) {
      onUpdateProfile({
        ...profile,
        cafesPorBarrio: {
          ...(profile.cafesPorBarrio || {}),
          [cafe.barrio]: {
            barrio: cafe.barrio,
            nombre: cafe.nombre,
            direccion: cafe.direccion.includes(cafe.barrio)
              ? cafe.direccion
              : `${cafe.direccion}, ${cafe.barrio}, CABA`,
            esquina: cafe.direccion.split(',')[0]?.trim() || cafe.direccion,
            lat: cafe.lat,
            lng: cafe.lng,
            horariosSugeridos: 'Entre las 15:00 y las 18:00 hs',
            urlGoogleMaps: cafe.urlGoogleMaps,
          },
        },
      });
    }
    setCafeNotice(
      `✓ "${cafe.nombre}" marcado como favorito en ${cafe.barrio} (hacé clic de nuevo en "✓ Activo" cuando quieras deseleccionarlo).`
    );
    setTimeout(() => setCafeNotice(null), 3500);
  };

  // Coordenadas para vista Esquema SVG
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
      {/* Encabezado & Filtros Limpios */}
      <div className="bg-white border-2 border-[#323232] rounded-2xl p-4 sm:p-5 shadow-[4px_4px_0px_#323232] space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#323232]/15 pb-3.5">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase bg-[#FFF06B] text-[#323232] border border-[#323232]">
                Mapa Territorial & Cafés
              </span>
              <h2 className="text-base sm:text-lg font-black text-[#323232] tracking-tight">
                Ubicación de Contactos y Catálogo de Cafés de Especialidad
              </h2>
            </div>
            <p className="text-xs text-[#323232]/75 mt-1">
              Visualizá dónde están ubicados los vecinos pendientes de firma, consultá o agregá cafés de especialidad por barrio y abrí cualquier ficha directo en <strong>Candidatos</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowAddCafeForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-[#FFF06B] text-[#323232] border-2 border-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-[#ffe838] transition"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddCafeForm ? 'Cerrar Formulario' : '+ Agregar Café de Especialidad'}</span>
            </button>
          </div>
        </div>

        {cafeNotice && (
          <div className="flex items-center justify-between rounded-xl bg-[#DFF4FF] border-2 border-[#323232] px-4 py-2.5 text-xs font-bold text-[#323232]">
            <span>{cafeNotice}</span>
            <button
              type="button"
              onClick={() => setCafeNotice(null)}
              className="font-black text-[#323232] ml-3"
            >
              ✕
            </button>
          </div>
        )}

        {/* Formulario para Agregar o Personalizar Café de Especialidad */}
        {showAddCafeForm && (
          <form
            onSubmit={handleSaveNewCafe}
            className="rounded-xl bg-[#F5F4F0] border-2 border-[#323232] p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#323232] flex items-center gap-1.5">
                <Coffee className="w-4 h-4 text-[#323232]" />
                <span>Agregar Nuevo Café de Especialidad al Catálogo y Mapa</span>
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#323232] mb-1">
                  Nombre del Café *
                </label>
                <input
                  type="text"
                  required
                  value={newCafeNombre}
                  onChange={(e) => setNewCafeNombre(e.target.value)}
                  placeholder="Ej: Cuervo Café / Lab Tostadores"
                  className="w-full px-3 py-2 text-xs border-2 border-[#323232] rounded-lg bg-white text-[#323232] font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#323232] mb-1">
                  Dirección o Esquina *
                </label>
                <input
                  type="text"
                  required
                  value={newCafeDireccion}
                  onChange={(e) => setNewCafeDireccion(e.target.value)}
                  placeholder="Ej: Costa Rica 5801"
                  className="w-full px-3 py-2 text-xs border-2 border-[#323232] rounded-lg bg-white text-[#323232] font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#323232] mb-1">
                  Barrio CABA *
                </label>
                <select
                  value={newCafeBarrio}
                  onChange={(e) => setNewCafeBarrio(e.target.value)}
                  className="w-full px-3 py-2 text-xs border-2 border-[#323232] rounded-lg bg-white text-[#323232] font-semibold"
                >
                  {Object.keys(COORDENADAS_BARRIOS_CABA)
                    .sort()
                    .map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#323232] mb-1">
                  Link Google Maps (opcional)
                </label>
                <input
                  type="url"
                  value={newCafeUrl}
                  onChange={(e) => setNewCafeUrl(e.target.value)}
                  placeholder="https://maps.app.goo.gl/..."
                  className="w-full px-3 py-2 text-xs border-2 border-[#323232] rounded-lg bg-white text-[#323232]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddCafeForm(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#323232] bg-white text-[#323232]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg text-xs font-black bg-[#323232] text-[#FFF06B] hover:bg-black transition"
              >
                Guardar Café y Fijar en {newCafeBarrio}
              </button>
            </div>
          </form>
        )}

        {/* Controles de Filtro por Barrio y Búsqueda */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label
              htmlFor="map-barrio-filter"
              className="block text-xs font-bold text-[#323232] mb-1"
            >
              Filtrar por Barrio
            </label>
            <select
              id="map-barrio-filter"
              value={selectedBarrio}
              onChange={(e) => setSelectedBarrio(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border-2 border-[#323232] rounded-xl bg-white text-[#323232] font-bold focus:outline-none"
            >
              <option value="Todos">
                Todos los barrios ({allPendingCabaContacts.length} pendientes · {allCafesCatalog.length} cafés)
              </option>
              {dynamicBarrios.map(([barrio, count]) => (
                <option key={barrio} value={barrio}>
                  {barrio} ({count} vecinos)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="map-search-input"
              className="block text-xs font-bold text-[#323232] mb-1"
            >
              Buscar Contacto, Calle o Café
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#323232]/50 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="map-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ej: Palermo, Malabia, Laura, Cuervo..."
                className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm border-2 border-[#323232] rounded-xl bg-white text-[#323232] font-medium focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCafesHubLayer((v) => !v)}
              className={`px-3 py-2 text-xs font-black border-2 border-[#323232] rounded-xl flex items-center gap-1.5 transition ${
                showCafesHubLayer
                  ? 'bg-[#FFF06B] text-[#323232]'
                  : 'bg-[#ECEAE2] text-[#323232]/70'
              }`}
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>Cafés ({visibleCafesHub.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grilla Principal: Mapa (7 cols) + Catálogo de Cafés de Especialidad (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Columna Izquierda: Mapa Limpio */}
        <div className="lg:col-span-7 bg-white border-2 border-[#323232] rounded-2xl overflow-hidden shadow-[4px_4px_0px_#323232]">
          <div className="px-4 py-3 border-b-2 border-[#323232] bg-[#ECEAE2] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-[#323232]">
                Mapa Territorial CABA · Contactos ({visibleContacts.length}) y Cafés ({visibleCafesHub.length})
              </h3>
              <p className="text-[11px] text-[#323232]/75">
                Pasá el cursor o hacé clic sobre cualquier ícono (🏠, 📍, ☕ o 📅) para ver su información detallada.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMapViewEngine('google_maps')}
                className={`px-2.5 py-1.5 text-[11px] font-black border-2 border-[#323232] rounded-xl transition ${
                  mapViewEngine === 'google_maps'
                    ? 'bg-[#323232] text-[#FFF06B] shadow-[2px_2px_0px_#2988FF]'
                    : 'bg-white text-[#323232] hover:bg-[#FFF06B]/50'
                }`}
              >
                Google Maps
              </button>
              <button
                type="button"
                onClick={() => setMapViewEngine('vector')}
                className={`px-2.5 py-1.5 text-[11px] font-black border-2 border-[#323232] rounded-xl transition ${
                  mapViewEngine === 'vector'
                    ? 'bg-[#323232] text-[#FFF06B] shadow-[2px_2px_0px_#2988FF]'
                    : 'bg-white text-[#323232] hover:bg-[#FFF06B]/50'
                }`}
              >
                Esquema Vectorial
              </button>
            </div>
          </div>

          {mapViewEngine === 'google_maps' && apiKey ? (
            <div className="w-full h-[420px] sm:h-[480px] relative">
              <APIProvider apiKey={apiKey} language="es" region="AR">
                <Map
                  defaultCenter={{ lat: -34.588, lng: -58.435 }}
                  defaultZoom={13}
                  mapId="DEMO_MAP_ID"
                  gestureHandling="greedy"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  {/* 1. Marcador de Base Km 0 (🏠 solo ícono por defecto; texto aparece en hover o clic) */}
                  {(() => {
                    const basePinKey = 'base-km-0';
                    const isBaseOpen = expandedBaseGmap || hoveredPinKey === basePinKey;
                    return (
                      <AdvancedMarker
                        position={{
                          lat: profile.latPartida,
                          lng: profile.lngPartida,
                        }}
                        title={`Base Km 0: ${profile.direccionPartida}`}
                        onClick={() => setExpandedBaseGmap((v) => !v)}
                        zIndex={isBaseOpen ? 9999 : 900}
                      >
                        <div
                          onMouseEnter={() => setHoveredPinKey(basePinKey)}
                          onMouseLeave={() =>
                            setHoveredPinKey((prev) => (prev === basePinKey ? null : prev))
                          }
                          className={`popurri-exp-pin ${isBaseOpen ? 'is-expanded' : ''}`}
                          style={{
                            background: '#323232',
                            color: '#FFF06B',
                            borderColor: '#FFF06B',
                          }}
                        >
                          <span className="popurri-exp-emoji">🏠</span>
                          {isBaseOpen && (
                            <span
                              className="popurri-exp-label"
                              style={{ display: 'inline-flex' }}
                            >
                              Base Km 0 ·{' '}
                              {profile.direccionPartida.split(',')[0] || profile.direccionPartida}
                            </span>
                          )}
                        </div>
                      </AdvancedMarker>
                    );
                  })()}

                  {/* 2. Marcadores de Eventos de Google Calendar (📅 solo ícono por defecto; texto en hover o clic) */}
                  {uniqueCalendarEvents.map((ev, evIdx) => {
                    const geo = geocodificarEventoCalendar(ev, profile);
                    const evKey = `cal-${ev.id}-${evIdx}`;
                    const isExp = expandedCalGmapId === evKey || hoveredPinKey === evKey;
                    return (
                      <AdvancedMarker
                        key={evKey}
                        position={{ lat: geo.lat, lng: geo.lng }}
                        title={`Calendar (${ev.startTime}-${ev.endTime}): ${ev.summary} — ${geo.label}`}
                        onClick={() =>
                          setExpandedCalGmapId((prev) => (prev === evKey ? null : evKey))
                        }
                        zIndex={isExp ? 9999 : 400}
                      >
                        <div
                          onMouseEnter={() => setHoveredPinKey(evKey)}
                          onMouseLeave={() =>
                            setHoveredPinKey((prev) => (prev === evKey ? null : prev))
                          }
                          className={`popurri-exp-pin ${isExp ? 'is-expanded' : ''}`}
                          style={{
                            background: '#29B8FF',
                            color: '#323232',
                            borderColor: '#323232',
                          }}
                        >
                          <span className="popurri-exp-emoji">📅</span>
                          {isExp && (
                            <span
                              className="popurri-exp-label"
                              style={{ display: 'inline-flex' }}
                            >
                              {ev.summary} · {ev.startTime}-{ev.endTime} ({geo.label})
                            </span>
                          )}
                        </div>
                      </AdvancedMarker>
                    );
                  })}

                  {/* 3. Marcadores de Cafés de Especialidad (☕ solo ícono por defecto; texto en hover o clic) */}
                  {visibleCafesHub.map((cafe) => {
                    const cafeKey = `cafe-${cafe.id}`;
                    const isSelected = selectedCafeHubPin?.id === cafe.id;
                    const isOpen = isSelected || hoveredPinKey === cafeKey;
                    return (
                      <AdvancedMarker
                        key={cafe.id}
                        position={{ lat: cafe.lat, lng: cafe.lng }}
                        title={`☕ ${cafe.nombre} (${cafe.barrio}) — ${cafe.direccion}`}
                        onClick={() => handleSelectCafeFromMap(cafe)}
                        zIndex={isOpen ? 9999 : 250}
                      >
                        <div
                          onMouseEnter={() => setHoveredPinKey(cafeKey)}
                          onMouseLeave={() =>
                            setHoveredPinKey((prev) => (prev === cafeKey ? null : prev))
                          }
                          className={`popurri-exp-pin ${isOpen ? 'is-expanded' : ''}`}
                          style={{
                            background: isSelected ? '#FFF06B' : '#059669',
                            color: isSelected ? '#323232' : '#ffffff',
                            borderColor: '#323232',
                          }}
                        >
                          <span className="popurri-exp-emoji">☕</span>
                          {isOpen && (
                            <span
                              className="popurri-exp-label"
                              style={{ display: 'inline-flex' }}
                            >
                              {cafe.nombre} · {cafe.direccion}
                            </span>
                          )}
                        </div>
                      </AdvancedMarker>
                    );
                  })}

                  {/* 4. Marcadores de Contactos Pendientes (📍 solo ícono por defecto; texto + ↗ en hover o clic) */}
                  {visibleContacts.map((c, idxPin) => {
                    const contactKey = `contact-${c.id}`;
                    const isSelected = selectedMarkerContact?.id === c.id;
                    const isOpen = isSelected || hoveredPinKey === contactKey;
                    const bg =
                      c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' || c.situacion === 'VISITA_AGENDADA'
                        ? '#FFF06B'
                        : c.rsp === 'Sí'
                        ? '#F5817F'
                        : '#29B8FF';
                    return (
                      <AdvancedMarker
                        key={`pin-${c.id}-${idxPin}`}
                        position={{ lat: c.lat, lng: c.lng }}
                        onClick={() => {
                          if (isSelected) {
                            onSelectContactForEdit(c);
                          } else {
                            setSelectedCafeHubPin(null);
                            setSelectedMarkerContact(c);
                          }
                        }}
                        zIndex={isOpen ? 9999 : 600}
                      >
                        <div
                          onMouseEnter={() => setHoveredPinKey(contactKey)}
                          onMouseLeave={() =>
                            setHoveredPinKey((prev) => (prev === contactKey ? null : prev))
                          }
                          className={`popurri-exp-pin ${isOpen ? 'is-expanded' : ''}`}
                          style={{
                            background: bg,
                            color: '#323232',
                            borderColor: '#323232',
                          }}
                        >
                          <span className="popurri-exp-emoji">📍</span>
                          {isOpen && (
                            <>
                              <span
                                className="popurri-exp-label"
                                style={{ display: 'inline-flex' }}
                              >
                                #{c.id} {c.nombreCompletoCorregido} · {c.calleOCruce || c.barrio}
                              </span>
                              <span
                                className="popurri-exp-arrow"
                                style={{ display: 'inline-flex' }}
                                title="Ir a la ficha en Candidatos"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectContactForEdit(c);
                                }}
                              >
                                ↗
                              </span>
                            </>
                          )}
                        </div>
                      </AdvancedMarker>
                    );
                  })}
                </Map>
              </APIProvider>
            </div>
          ) : (
            <div
              className="relative bg-[#25323A] text-white overflow-hidden select-none h-[420px] sm:h-[480px]"
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.35 : -0.35;
                setVectorZoom((z) => {
                  const next = Math.max(1, Math.min(5, Number((z + delta).toFixed(2))));
                  if (next === 1) setVectorPan({ x: 0, y: 0 });
                  return next;
                });
              }}
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).closest('button, a')) return;
                setIsDraggingVector(true);
                vectorDragStartRef.current = {
                  x: e.clientX,
                  y: e.clientY,
                  panX: vectorPan.x,
                  panY: vectorPan.y,
                };
              }}
              onMouseMove={(e) => {
                if (!isDraggingVector || !vectorDragStartRef.current) return;
                const dx = e.clientX - vectorDragStartRef.current.x;
                const dy = e.clientY - vectorDragStartRef.current.y;
                setVectorPan({
                  x: Math.max(-450, Math.min(450, vectorDragStartRef.current.panX + dx)),
                  y: Math.max(-320, Math.min(320, vectorDragStartRef.current.panY + dy)),
                });
              }}
              onMouseUp={() => {
                setIsDraggingVector(false);
                vectorDragStartRef.current = null;
              }}
              onMouseLeave={() => {
                setIsDraggingVector(false);
                vectorDragStartRef.current = null;
              }}
            >
              {/* Controles de Zoom y Paneo del Esquema Vectorial */}
              <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-[#323232]/90 border-2 border-[#FFF06B] rounded-xl p-1 shadow-[2px_2px_0px_#000000]">
                <button
                  type="button"
                  onClick={() =>
                    setVectorZoom((z) => Math.min(5, Number((z + 0.5).toFixed(2))))
                  }
                  className="px-2.5 py-1 rounded-lg bg-[#FFF06B] text-[#323232] text-xs font-black hover:bg-[#ffe838] transition"
                  title="Acercar zoom vectorial"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setVectorZoom((z) => {
                      const next = Math.max(1, Number((z - 0.5).toFixed(2)));
                      if (next === 1) setVectorPan({ x: 0, y: 0 });
                      return next;
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-white text-[#323232] text-xs font-black hover:bg-[#ECEAE2] transition"
                  title="Alejar zoom vectorial"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVectorZoom(1);
                    setVectorPan({ x: 0, y: 0 });
                  }}
                  className="px-2 py-1 rounded-lg bg-[#29B8FF] text-[#323232] text-[10px] font-black hover:bg-[#1aa8f0] transition"
                  title="Restablecer vista CABA"
                >
                  {vectorZoom.toFixed(1)}x · Centrar
                </button>
              </div>

              <div className="absolute top-3 left-3 z-20 pointer-events-none rounded-lg bg-[#323232]/85 border border-white/20 px-2.5 py-1 text-[10px] font-bold text-[#F5F4F0]">
                Esquema Vectorial Interactivo · Arrastrá para mover, usá la rueda o +/- para zoom y tocá cualquier punto
              </div>

              <svg
                viewBox="0 0 800 480"
                className={`w-full h-full block ${
                  isDraggingVector ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                role="img"
                aria-label="Mapa vectorial interactivo de contactos y cafés en CABA"
              >
                <rect width="800" height="480" fill="#25323A" />

                <g
                  transform={`translate(${400 + vectorPan.x}, ${240 + vectorPan.y}) scale(${vectorZoom}) translate(-400, -240)`}
                >
                  {/* Cuadrícula de referencia territorial CABA */}
                  {[120, 240, 360, 480, 600, 720].map((gx) => (
                    <line
                      key={`grid-x-${gx}`}
                      x1={gx}
                      y1={0}
                      x2={gx}
                      y2={480}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth={1 / vectorZoom}
                    />
                  ))}
                  {[96, 192, 288, 384].map((gy) => (
                    <line
                      key={`grid-y-${gy}`}
                      x1={0}
                      y1={gy}
                      x2={800}
                      y2={gy}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth={1 / vectorZoom}
                    />
                  ))}

                  {/* Etiquetas de Barrios de fondo */}
                  {dynamicBarrios.map(([barrioName]) => {
                    const coords =
                      COORDENADAS_BARRIOS_CABA[barrioName] ||
                      COORDENADAS_BARRIOS_CABA.Palermo;
                    const pt = projectToSvg(coords.lat, coords.lng);
                    return (
                      <text
                        key={barrioName}
                        x={pt.x}
                        y={pt.y - 12 / Math.sqrt(vectorZoom)}
                        fill="rgba(245, 244, 240, 0.35)"
                        fontSize={10 / Math.sqrt(vectorZoom)}
                        fontWeight="800"
                        textAnchor="middle"
                        className="pointer-events-none"
                      >
                        {barrioName.toUpperCase()}
                      </text>
                    );
                  })}

                  {/* 1. Base Km 0 en Esquema Vectorial */}
                  {Number.isFinite(profile.latPartida) &&
                    Number.isFinite(profile.lngPartida) &&
                    (() => {
                      const pt = projectToSvg(profile.latPartida, profile.lngPartida);
                      const isActive =
                        expandedBaseGmap || hoveredPinKey === 'base-km-0';
                      return (
                        <g
                          transform={`translate(${pt.x}, ${pt.y})`}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredPinKey('base-km-0')}
                          onMouseLeave={() =>
                            setHoveredPinKey((p) => (p === 'base-km-0' ? null : p))
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedBaseGmap((v) => !v);
                          }}
                        >
                          <circle
                            r={(isActive ? 12 : 9) / Math.sqrt(vectorZoom)}
                            fill="#323232"
                            stroke="#FFF06B"
                            strokeWidth={2 / Math.sqrt(vectorZoom)}
                          />
                          <text
                            y={3.5 / Math.sqrt(vectorZoom)}
                            fontSize={10 / Math.sqrt(vectorZoom)}
                            textAnchor="middle"
                          >
                            🏠
                          </text>
                        </g>
                      );
                    })()}

                  {/* 2. Eventos Calendar en Esquema Vectorial */}
                  {uniqueCalendarEvents.map((ev, evIdx) => {
                    const geo = geocodificarEventoCalendar(ev, profile);
                    const pt = projectToSvg(geo.lat, geo.lng);
                    const evKey = `cal-${ev.id}-${evIdx}`;
                    const isActive =
                      expandedCalGmapId === evKey || hoveredPinKey === evKey;
                    return (
                      <g
                        key={`svg-${evKey}`}
                        transform={`translate(${pt.x}, ${pt.y})`}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPinKey(evKey)}
                        onMouseLeave={() =>
                          setHoveredPinKey((p) => (p === evKey ? null : p))
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedCalGmapId((prev) => (prev === evKey ? null : evKey));
                        }}
                      >
                        <circle
                          r={(isActive ? 11 : 8) / Math.sqrt(vectorZoom)}
                          fill="#29B8FF"
                          stroke="#ffffff"
                          strokeWidth={1.8 / Math.sqrt(vectorZoom)}
                        />
                        <text
                          y={3.5 / Math.sqrt(vectorZoom)}
                          fontSize={9 / Math.sqrt(vectorZoom)}
                          textAnchor="middle"
                        >
                          📅
                        </text>
                      </g>
                    );
                  })}

                  {/* 3. Cafés de Especialidad en Esquema Vectorial (sin texto fijo; se despliega en hover o clic) */}
                  {visibleCafesHub.map((cafe) => {
                    const pt = projectToSvg(cafe.lat, cafe.lng);
                    const cafeKey = `cafe-${cafe.id}`;
                    const isSelected = selectedCafeHubPin?.id === cafe.id;
                    const isHovered = hoveredPinKey === cafeKey;
                    const isActive = isSelected || isHovered;
                    return (
                      <g
                        key={`svg-cafe-${cafe.id}`}
                        transform={`translate(${pt.x}, ${pt.y})`}
                        onMouseEnter={() => setHoveredPinKey(cafeKey)}
                        onMouseLeave={() =>
                          setHoveredPinKey((p) => (p === cafeKey ? null : p))
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectCafeFromMap(cafe);
                        }}
                        className="cursor-pointer"
                      >
                        <circle
                          r={(isActive ? 10 : 6.5) / Math.sqrt(vectorZoom)}
                          fill={isActive ? '#FFF06B' : '#10b981'}
                          stroke={isActive ? '#323232' : '#ffffff'}
                          strokeWidth={(isActive ? 2.5 : 1.5) / Math.sqrt(vectorZoom)}
                        />
                        {isActive && (
                          <text
                            y={3 / Math.sqrt(vectorZoom)}
                            fontSize={9 / Math.sqrt(vectorZoom)}
                            textAnchor="middle"
                          >
                            ☕
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* 4. Contactos Pendientes en Esquema Vectorial (solo punto/ícono limpio; info aparece en hover o clic) */}
                  {visibleContacts.map((c, idxSvgPt) => {
                    const pt = projectToSvg(c.lat, c.lng);
                    const contactKey = `contact-${c.id}`;
                    const isSelected = selectedMarkerContact?.id === c.id;
                    const isHovered = hoveredPinKey === contactKey;
                    const isActive = isSelected || isHovered;
                    const fill =
                      c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
                      c.situacion === 'VISITA_AGENDADA'
                        ? '#FFF06B'
                        : c.rsp === 'Sí'
                        ? '#F5817F'
                        : '#29B8FF';
                    return (
                      <g
                        key={`svg-pt-${c.id}-${idxSvgPt}`}
                        transform={`translate(${pt.x}, ${pt.y})`}
                        onMouseEnter={() => setHoveredPinKey(contactKey)}
                        onMouseLeave={() =>
                          setHoveredPinKey((p) => (p === contactKey ? null : p))
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSelected) {
                            onSelectContactForEdit(c);
                          } else {
                            setSelectedCafeHubPin(null);
                            setSelectedMarkerContact(c);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <circle
                          r={(isActive ? 11 : 7) / Math.sqrt(vectorZoom)}
                          fill={fill}
                          stroke={isActive ? '#FFF06B' : '#323232'}
                          strokeWidth={(isActive ? 2.8 : 1.6) / Math.sqrt(vectorZoom)}
                        />
                        {isActive && (
                          <text
                            y={3.5 / Math.sqrt(vectorZoom)}
                            fontSize={9 / Math.sqrt(vectorZoom)}
                            textAnchor="middle"
                          >
                            📍
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* Tarjeta Flotante Interactiva dentro del Esquema Vectorial al hacer Hover o Clic en un Punto */}
              {(() => {
                const hoveredContact = hoveredPinKey?.startsWith('contact-')
                  ? visibleContacts.find((c) => `contact-${c.id}` === hoveredPinKey) || null
                  : null;
                const activeContact = hoveredContact || selectedMarkerContact;

                const hoveredCafe = hoveredPinKey?.startsWith('cafe-')
                  ? visibleCafesHub.find((cf) => `cafe-${cf.id}` === hoveredPinKey) || null
                  : null;
                const activeCafe = !hoveredContact ? hoveredCafe || selectedCafeHubPin : null;

                const isBaseActive =
                  hoveredPinKey === 'base-km-0' ||
                  (!activeContact && !activeCafe && expandedBaseGmap);

                if (activeContact) {
                  return (
                    <div className="absolute bottom-3 left-3 right-3 z-30 rounded-xl border-2 border-[#323232] bg-white text-[#323232] p-3 shadow-[4px_4px_0px_#000000] flex flex-wrap items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-[#323232] text-[#FFF06B] text-[10px] font-black font-mono">
                            #{activeContact.id}
                          </span>
                          <span className="text-xs font-black truncate">
                            {activeContact.nombreCompletoCorregido}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#DFF4FF] border border-[#323232] text-[10px] font-black">
                            {activeContact.barrio}
                          </span>
                        </div>
                        <p className="text-[11px] font-bold text-[#323232]/85 mt-0.5 truncate">
                          📍 {activeContact.calleOCruce || activeContact.barrio} ·{' '}
                          {activeContact.estadoFlujoEtiqueta}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSelectContactForEdit(activeContact)}
                          className="px-3 py-1.5 rounded-lg bg-[#323232] text-[#FFF06B] text-[11px] font-black inline-flex items-center gap-1 hover:bg-black transition"
                        >
                          <span>Abrir Ficha</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                        {selectedMarkerContact && (
                          <button
                            type="button"
                            onClick={() => setSelectedMarkerContact(null)}
                            className="px-2 py-1.5 rounded-lg bg-[#ECEAE2] text-[#323232] text-[11px] font-black"
                            title="Cerrar detalle"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                if (activeCafe) {
                  return (
                    <div className="absolute bottom-3 left-3 right-3 z-30 rounded-xl border-2 border-[#323232] bg-white text-[#323232] p-3 shadow-[4px_4px_0px_#000000] flex flex-wrap items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-emerald-700 text-white text-[10px] font-black">
                            ☕ Café
                          </span>
                          <span className="text-xs font-black truncate">{activeCafe.nombre}</span>
                          <span className="px-2 py-0.5 rounded bg-[#FFF06B] border border-[#323232] text-[10px] font-black">
                            {activeCafe.barrio}
                          </span>
                        </div>
                        <p className="text-[11px] font-bold text-[#323232]/85 mt-0.5 truncate">
                          📍 {activeCafe.direccion}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSetPreferredCafe(activeCafe)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#FFF06B] border border-[#323232] text-[#323232] text-[11px] font-black hover:bg-[#ffe838] transition"
                        >
                          Fijar en {activeCafe.barrio}
                        </button>
                        {selectedCafeHubPin && (
                          <button
                            type="button"
                            onClick={() => setSelectedCafeHubPin(null)}
                            className="px-2 py-1.5 rounded-lg bg-[#ECEAE2] text-[#323232] text-[11px] font-black"
                            title="Cerrar detalle"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                if (isBaseActive) {
                  return (
                    <div className="absolute bottom-3 left-3 right-3 z-30 rounded-xl border-2 border-[#FFF06B] bg-[#323232] text-[#FFF06B] p-3 shadow-[4px_4px_0px_#000000] flex items-center justify-between gap-2">
                      <div className="text-xs font-black">
                        🏠 Base Km 0 · Punto de Partida: {profile.direccionPartida}
                      </div>
                      {expandedBaseGmap && (
                        <button
                          type="button"
                          onClick={() => setExpandedBaseGmap(false)}
                          className="px-2 py-1 rounded bg-white/15 text-white text-[11px] font-black"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          )}

          {/* Barra inferior del mapa cuando se selecciona un contacto o café */}
          {selectedMarkerContact && (
            <div className="p-3.5 bg-[#FFF06B]/40 border-t-2 border-[#323232] flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[#323232]">
                  #{selectedMarkerContact.id} · {selectedMarkerContact.nombreCompletoCorregido} ({selectedMarkerContact.barrio})
                </p>
                <p className="text-[11px] text-[#323232]/80">
                  📍 {selectedMarkerContact.calleOCruce || 'Sin calle exacta'} · {selectedMarkerContact.estadoFlujoEtiqueta}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${selectedMarkerContact.calleOCruce || selectedMarkerContact.barrio}, CABA, Argentina`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-white border-2 border-[#323232] text-[#323232] text-xs font-black inline-flex items-center gap-1 hover:bg-[#ECEAE2] transition"
                >
                  <span>Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={() => onSelectContactForEdit(selectedMarkerContact)}
                  className="px-3.5 py-1.5 rounded-xl bg-[#323232] text-[#FFF06B] text-xs font-black inline-flex items-center gap-1.5 hover:bg-black transition"
                >
                  <span>Abrir en Candidatos</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {selectedCafeHubPin && (
            <div className="p-3.5 bg-[#DFF4FF]/60 border-t-2 border-[#323232] flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[#323232]">
                  ☕ {selectedCafeHubPin.nombre} ({selectedCafeHubPin.barrio})
                </p>
                <p className="text-[11px] text-[#323232]/80">
                  📍 {selectedCafeHubPin.direccion}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={selectedCafeHubPin.urlGoogleMaps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-white border-2 border-[#323232] text-[#323232] text-xs font-black inline-flex items-center gap-1 hover:bg-[#ECEAE2] transition"
                >
                  <span>Ver en Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    handleSetPreferredCafe(selectedCafeHubPin);
                    setSelectedCafeHubPin(null);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#FFF06B] border-2 border-[#323232] text-[#323232] text-xs font-black hover:bg-[#ffe838] transition"
                >
                  Fijar en {selectedCafeHubPin.barrio}
                </button>
              </div>
            </div>
          )}

          {/* Leyenda de Pines Emojis Desplegables */}
          <div className="px-4 py-2.5 bg-[#F5F4F0] border-t border-[#323232]/20 flex flex-wrap items-center gap-4 text-[11px] font-bold text-[#323232]">
            <span className="inline-flex items-center gap-1.5">
              <span>🏠</span> Base Km 0
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span>☕</span> Café de Especialidad (clic refleja en lista)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span>📍</span> Vecino con dirección (2° clic o ↗ abre ficha)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span>📅</span> Evento Calendar
            </span>
          </div>
        </div>

        {/* Columna Derecha: Catálogo de Cafés de Especialidad Disponibles */}
        <div className="lg:col-span-5 bg-white border-2 border-[#323232] rounded-2xl p-4 sm:p-5 shadow-[4px_4px_0px_#323232] space-y-3.5">
          <div className="flex items-center justify-between gap-2 border-b border-[#323232]/15 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-black text-[#323232] flex items-center gap-2">
                <Coffee className="w-4 h-4 text-[#323232]" />
                <span>Cafés de Especialidad Disponibles ({visibleCafesHub.length})</span>
              </h3>
              <p className="text-[11px] text-[#323232]/70 mt-0.5">
                Al tocar cualquier pin ☕ en el mapa se resalta acá automáticamente. También podés tocar un café de esta lista para resaltarlo en el mapa.
              </p>
            </div>
            {profile?.cafesPorBarrio && Object.keys(profile.cafesPorBarrio).length > 0 && onUpdateProfile && (
              <button
                type="button"
                onClick={() => {
                  onUpdateProfile({
                    ...profile,
                    cafesPorBarrio: {},
                  });
                  setCafeNotice('↺ Se deseleccionaron todos los cafés favoritos.');
                  setTimeout(() => setCafeNotice(null), 3500);
                }}
                className="shrink-0 px-2.5 py-1.5 rounded-lg border border-[#323232] bg-[#F5F4F0] hover:bg-[#FFF06B] text-[11px] font-bold text-[#323232] transition"
                title="Deseleccionar todos los cafés marcados como favoritos"
              >
                Deseleccionar todos
              </button>
            )}
          </div>

          <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1 scroll-smooth">
            {visibleCafesHub.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#323232]/60 bg-[#F5F4F0] rounded-xl border border-[#323232]/20">
                No hay cafés cargados para este filtro. Usá el botón &quot;+ Agregar Café de Especialidad&quot; para sumar uno.
              </div>
            ) : (
              visibleCafesHub.map((cafe) => {
                const esPreferidoBarrio = isCafePreferredInBarrio(cafe);
                const esSeleccionadoEnMapa = selectedCafeHubPin?.id === cafe.id;
                const esCustom = cafe.id.startsWith('custom-cafe-');

                return (
                  <div
                    key={cafe.id}
                    ref={(el) => {
                      cafeCardRefs.current[cafe.id] = el;
                    }}
                    onClick={() => {
                      setSelectedMarkerContact(null);
                      setSelectedCafeHubPin((prev) => (prev?.id === cafe.id ? null : cafe));
                    }}
                    className={`p-3 rounded-xl border-2 transition cursor-pointer ${
                      esSeleccionadoEnMapa
                        ? 'border-[#323232] bg-[#DFF4FF] ring-2 ring-[#2988FF] shadow-[3px_3px_0px_#323232]'
                        : esPreferidoBarrio
                        ? 'border-[#323232] bg-[#FFF06B]/35'
                        : 'border-[#323232]/20 bg-[#F5F4F0]/60 hover:border-[#323232]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-[#323232] text-[#FFF06B]">
                            {cafe.barrio}
                          </span>
                          {esSeleccionadoEnMapa && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-[#2988FF] text-white border border-[#323232] inline-flex items-center gap-1">
                              ☕ Seleccionado en Mapa
                            </span>
                          )}
                          {esPreferidoBarrio && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-400 inline-flex items-center gap-1">
                              <Check className="w-3 h-3" /> Favorito (clic en ✓ Activo para quitar)
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs sm:text-sm font-black text-[#323232] mt-1">
                          {cafe.nombre}
                        </h4>
                        <p className="text-[11px] text-[#323232]/75 font-medium">
                          📍 {cafe.direccion}
                        </p>
                      </div>

                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a
                          href={cafe.urlGoogleMaps}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-[#323232] text-[#323232] hover:bg-[#ECEAE2] inline-flex items-center gap-1"
                          title="Abrir ubicación en Google Maps"
                        >
                          <span>Maps</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleSetPreferredCafe(cafe)}
                          title={
                            esPreferidoBarrio
                              ? 'Hacé clic de nuevo para deseleccionar este café favorito'
                              : 'Marcar como café favorito del barrio'
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black border border-[#323232] transition ${
                            esPreferidoBarrio
                              ? 'bg-[#323232] text-[#FFF06B] hover:bg-rose-700 hover:text-white'
                              : 'bg-[#FFF06B] text-[#323232] hover:bg-[#ffe838]'
                          }`}
                        >
                          {esPreferidoBarrio ? '✓ Activo' : 'Usar en Barrio'}
                        </button>
                        {esCustom && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomCafe(cafe.id)}
                            className="p-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50"
                            title="Eliminar café agregado manualmente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Directorio Rápido de Contactos por Barrio con botón directo "Abrir en Candidatos" */}
      <div className="bg-white border-2 border-[#323232] rounded-2xl p-4 sm:p-5 shadow-[4px_4px_0px_#323232] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#323232]/15 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-[#323232]">
              Contactos Pendientes en {selectedBarrio === 'Todos' ? 'CABA' : selectedBarrio} ({visibleDirectoryContacts.length})
            </h3>
            <p className="text-xs text-[#323232]/70">
              Listado informativo con acceso directo en 1 clic a la tarjeta de cada persona en la primera página (<strong>Candidatos</strong>).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
          {visibleDirectoryContacts.slice(0, 60).map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-xl border border-[#323232]/25 bg-[#F5F4F0]/60 hover:bg-white hover:border-[#323232] transition flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-black text-[#323232] truncate">
                    #{c.id} · {c.nombreCompletoCorregido}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#ECEAE2] text-[#323232]">
                    {c.barrio}
                  </span>
                </div>
                <p className="text-[11px] text-[#323232]/80 truncate mt-0.5">
                  {c.calleOCruce ? `📍 ${c.calleOCruce}` : 'Sin calle exacta cargada'}
                </p>
                <p className="text-[10px] font-bold text-[#323232]/65 truncate mt-0.5">
                  {c.estadoFlujoEtiqueta}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onSelectContactForEdit(c)}
                className="px-2.5 py-1.5 rounded-lg bg-[#FFF06B] hover:bg-[#ffe838] text-[#323232] border border-[#323232] text-[11px] font-black shrink-0 inline-flex items-center gap-1 shadow-[1px_1px_0px_#323232]"
              >
                <span>Abrir</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
