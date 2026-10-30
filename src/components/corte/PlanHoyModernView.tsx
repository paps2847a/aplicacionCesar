import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Coffee,
  Footprints,
  Navigation,
  Send,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  MessageSquare,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  CorteResultado,
  BloqueAgendaRecomendado,
  ParadaRuta,
  Contact,
  VoiceProfile,
  TipoPlantillaWA,
} from '../../types';
import { crearEnlaceWhatsApp } from '../../domain/messaging/greetingsAndTone';
import { generarMensajeContextual } from '../../domain/messaging/messageTemplates';

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
    barrio: string,
    tipoPlantilla?: string
  ) => Promise<boolean>;
}

export const PlanHoyModernView: React.FC<PlanHoyModernViewProps> = ({
  corteResultado,
  voiceProfile,
  whatsAppReady,
  onRefreshCorte,
  onUpdateContact,
  onSendDirectWA,
}) => {
  const bloques = corteResultado.agendaSugeridaDias || [];

  // Estado de mensajes y previsualización por parada
  const [paradaMensajes, setParadaMensajes] = useState<
    Record<
      string,
      {
        plantilla: TipoPlantillaWA;
        texto: string;
        isOpen: boolean;
      }
    >
  >({});
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const getMensajeForParada = (parada: ParadaRuta) => {
    const custom = paradaMensajes[parada.contact.id];
    if (custom) return custom;
    const def = parada.mensajeTerrenoSugerido || '';
    return {
      plantilla: 'en_camino' as TipoPlantillaWA,
      texto: def,
      isOpen: false,
    };
  };

  const handleSelectSituacion = (parada: ParadaRuta, plantilla: TipoPlantillaWA) => {
    const res = generarMensajeContextual(parada.contact, voiceProfile, plantilla);
    setParadaMensajes((prev) => ({
      ...prev,
      [parada.contact.id]: {
        plantilla,
        texto: res.texto,
        isOpen: true,
      },
    }));
  };

  const handleCopyText = (contactId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiadoId(contactId);
    setTimeout(() => setCopiadoId(null), 2500);
  };

  const handleOpenMaps = (parada: ParadaRuta) => {
    const destino =
      parada.destinoNombre ||
      parada.contact.calleOCruce ||
      `${parada.contact.barrio || 'CABA'}, Argentina`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`;
    window.open(url, '_blank');
  };

  const handleYaAdhirio = (parada: ParadaRuta) => {
    const ahora = new Date();
    const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const auditText = `${ddmm} a las ${hhmm} hs`;
    const baseCom = (parada.contact.comentario || '')
      .replace(/\s*\[Modificado el [^\]]+\]/g, '')
      .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
      .trim();
    const newComentario = baseCom
      ? `${baseCom} [Modificado el ${auditText} a "Firmaron"]`
      : `[Modificado el ${auditText} a "Firmaron"]`;

    onUpdateContact(parada.contact.id, {
      adhirio: 'Sí',
      estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
      primerContactoEnviado: true,
      comentario: newComentario,
      actualizadoEnAppAt: ahora.toISOString(),
    });
  };

  const handleRetiroFichas = (parada: ParadaRuta) => {
    const ahora = new Date();
    const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const auditText = `${ddmm} a las ${hhmm} hs`;
    const baseCom = (parada.contact.comentario || '')
      .replace(/\s*\[Modificado el [^\]]+\]/g, '')
      .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
      .trim();
    const newComentario = baseCom
      ? `${baseCom} [Modificado el ${auditText} a "Retiro de Fichas"]`
      : `[Modificado el ${auditText} a "Retiro de Fichas"]`;

    onUpdateContact(parada.contact.id, {
      estadoFlujo: 'PENDIENTE_RETIRO_FICHAS',
      comentario: newComentario,
      actualizadoEnAppAt: ahora.toISOString(),
    });
  };

  // Agrupar bloques por día
  const diasUnicos = useMemo(() => {
    const list: string[] = [];
    for (const b of bloques) {
      if (!list.includes(b.diaEtiqueta)) {
        list.push(b.diaEtiqueta);
      }
    }
    return list;
  }, [bloques]);

  const [selectedDia, setSelectedDia] = useState<string>(() => diasUnicos[0] || 'Todos');
  const [expandedBloqueId, setExpandedBloqueId] = useState<string | null>(() => bloques[0]?.id || null);

  const bloquesFiltrados = useMemo(() => {
    if (selectedDia === 'Todos') return bloques;
    return bloques.filter((b) => b.diaEtiqueta === selectedDia);
  }, [bloques, selectedDia]);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-6">
      {/* 1. Header con Información Ejecutiva y Sincronización */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-900">
              Planificación Territorial & Hoja de Ruta
            </h2>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-black text-emerald-800 border border-emerald-200">
              {corteResultado.fechaHoraActualEtiqueta || 'Hoy'}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Circuitos organizados por cercanía barrial. Acotados a horario diurno (&lt; 21:00 hs) y libres de choques con tu Google Calendar.
          </p>
        </div>

        <button
          onClick={onRefreshCorte}
          className="inline-flex items-center gap-2 self-start md:self-auto rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
        >
          <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          <span>Recalcular Rutas</span>
        </button>
      </div>

      {/* 2. Selector de Día (Pills Limpios) */}
      {diasUnicos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3">
          <span className="text-xs font-bold text-slate-500 mr-1">Día:</span>
          {diasUnicos.map((dia) => {
            const isSelected = selectedDia === dia;
            const esHoy = /hoy/i.test(dia);

            return (
              <button
                key={dia}
                onClick={() => setSelectedDia(dia)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition-all ${
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
            className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
              selectedDia === 'Todos'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            Ver todos los días
          </button>
        </div>
      )}

      {/* 3. Lista de Bloques del Día */}
      {bloquesFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          No hay bloques de recorrido programados para este día.
        </div>
      ) : (
        <div className="space-y-4">
          {bloquesFiltrados.map((bloque) => {
            const isExpanded = expandedBloqueId === bloque.id;
            const paradas = bloque.paradasRutaSugerida || [];
            const esCafe = bloque.modalidad === 'CAFE_HUB';
            const esSede = bloque.modalidad === 'EVENTO_SEDE' || bloque.modalidad === 'ENCUENTRO_SEDE';

            return (
              <motion.div
                key={bloque.id}
                layout
                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs hover:border-slate-300 transition-colors"
              >
                {/* Cabecera del Bloque */}
                <div
                  onClick={() => setExpandedBloqueId(isExpanded ? null : bloque.id)}
                  className="flex cursor-pointer flex-col md:flex-row md:items-center justify-between gap-3 p-5 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-xs ${
                        esCafe
                          ? 'bg-amber-600'
                          : esSede
                          ? 'bg-purple-600'
                          : 'bg-emerald-600'
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
                        <span className="text-sm font-black text-slate-900">
                          {bloque.barrio}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-700">
                          {bloque.franjaHoraria}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                            esCafe
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : esSede
                              ? 'bg-purple-50 text-purple-800 border border-purple-200'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {esCafe
                            ? 'Café HUB de Cercanía'
                            : esSede
                            ? 'Sede Central (Chile 1408)'
                            : 'Puerta a Puerta'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5 font-medium">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold">{bloque.puntoEncuentroODireccion}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-auto">
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-900">
                        {bloque.contactosIncluidos.length} persona{bloque.contactosIncluidos.length === 1 ? '' : 's'}
                      </span>
                      <p className="text-[11px] text-slate-500">
                        ~{bloque.duracionTotalMinutos || 45} min
                      </p>
                    </div>

                    <div className="rounded-lg p-1 text-slate-400">
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </div>
                </div>

                {/* Contenido Desplegable: Paradas Secuenciales y Acciones */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                          Hoja de Ruta Secuencial del Circuito
                        </h4>
                        <span className="text-[11px] text-slate-500 font-medium">
                          Libre de choques con tu Google Calendar
                        </span>
                      </div>

                      {/* Paradas */}
                      <div className="space-y-3">
                        {paradas.length === 0 ? (
                          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                            Encuentro grupal en punto fijo con {bloque.contactosIncluidos.length} personas.
                          </div>
                        ) : (
                          paradas.map((parada, idx) => {
                            const tel = parada.contact.tel || parada.contact.telRaw;
                            const currentMsg = getMensajeForParada(parada);
                            const waLink = crearEnlaceWhatsApp(tel, currentMsg.texto);
                            const isMsgOpen = currentMsg.isOpen;
                            const isSigned =
                              parada.contact.adhirio === 'Sí' ||
                              parada.contact.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK';
                            const isRetiro =
                              parada.contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS';

                            return (
                              <div
                                key={parada.contact.id}
                                className={`rounded-2xl border transition-all ${
                                  isSigned
                                    ? 'border-emerald-200 bg-emerald-50/30'
                                    : isRetiro
                                    ? 'border-purple-200 bg-purple-50/30'
                                    : 'border-slate-200/80 bg-white'
                                } p-4 shadow-2xs space-y-3`}
                              >
                                {/* Fila Principal: Datos de la Parada + Acciones Rápidas */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white shadow-2xs">
                                      {idx + 1}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h5 className="text-xs font-black text-slate-900">
                                          {parada.contact.primerNombre || parada.contact.nombre}
                                        </h5>
                                        <span className="font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                                          Llegada {parada.horaLlegada} hs
                                        </span>
                                        {isSigned && (
                                          <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                                            ✓ Ya Adhirió
                                          </span>
                                        )}
                                        {isRetiro && (
                                          <span className="text-[10px] font-black text-purple-800 bg-purple-100 px-2 py-0.5 rounded-full">
                                            📋 Retiro Fichas
                                          </span>
                                        )}
                                      </div>

                                      <p className="text-[11px] font-semibold text-slate-600 mt-0.5 flex items-center gap-1">
                                        <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                                        <span>{parada.destinoNombre}</span>
                                      </p>
                                      <p className="text-[10px] text-slate-400 mt-0.5">
                                        {parada.detalleTransporte}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Botones de Acción de Estado y Navegación */}
                                  <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-auto">
                                    {/* Botón Google Maps */}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenMaps(parada)}
                                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                                      title="Abrir indicaciones en Google Maps"
                                    >
                                      <Navigation className="h-3.5 w-3.5 text-sky-600" />
                                      <span>Maps</span>
                                    </button>

                                    {/* Botón Editar / Ver Mensaje */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setParadaMensajes((prev) => ({
                                          ...prev,
                                          [parada.contact.id]: {
                                            ...currentMsg,
                                            isOpen: !isMsgOpen,
                                          },
                                        }));
                                      }}
                                      className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition shadow-2xs ${
                                        isMsgOpen
                                          ? 'bg-slate-900 text-white'
                                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                      }`}
                                    >
                                      <MessageSquare className="h-3.5 w-3.5" />
                                      <span>{isMsgOpen ? 'Ocultar Msj' : 'Mensaje'}</span>
                                    </button>

                                    {/* Botón Retiro Fichas Extras */}
                                    <button
                                      type="button"
                                      onClick={() => handleRetiroFichas(parada)}
                                      className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition shadow-2xs ${
                                        isRetiro
                                          ? 'bg-purple-600 text-white'
                                          : 'border border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100'
                                      }`}
                                      title="Registrar retiro de fichas extras"
                                    >
                                      <FileText className="h-3.5 w-3.5" />
                                      <span>+ Fichas</span>
                                    </button>

                                    {/* Botón Ya Adhirió / Firmó */}
                                    <button
                                      type="button"
                                      onClick={() => handleYaAdhirio(parada)}
                                      className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition shadow-2xs ${
                                        isSigned
                                          ? 'bg-emerald-600 text-white'
                                          : 'border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                                      }`}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      <span>{isSigned ? 'Adhesión OK' : '✓ Ya Adhirió'}</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Selector de Situaciones Operativas en Vivo (Los 7 botones solicitados) */}
                                <div className="pt-2 border-t border-slate-100">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                                    Situación en vivo (WhatsApp):
                                  </span>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSelectSituacion(parada, 'recordatorio_maniana_encuentro')
                                      }
                                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                                        currentMsg.plantilla === 'recordatorio_maniana_encuentro' &&
                                        isMsgOpen
                                          ? 'bg-indigo-600 text-white shadow-2xs'
                                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200'
                                      }`}
                                    >
                                      ☀️ Recordatorio hoy
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleSelectSituacion(parada, 'en_camino')}
                                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                                        currentMsg.plantilla === 'en_camino' && isMsgOpen
                                          ? 'bg-emerald-600 text-white shadow-2xs'
                                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200'
                                      }`}
                                    >
                                      🚶 En camino (15m)
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleSelectSituacion(parada, 'llegando')}
                                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                                        currentMsg.plantilla === 'llegando' && isMsgOpen
                                          ? 'bg-teal-600 text-white shadow-2xs'
                                          : 'bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200'
                                      }`}
                                    >
                                      🚪 En puerta (2 min)
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSelectSituacion(parada, 'convocatoria_cafe_hub')
                                      }
                                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                                        currentMsg.plantilla === 'convocatoria_cafe_hub' && isMsgOpen
                                          ? 'bg-amber-600 text-white shadow-2xs'
                                          : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
                                      }`}
                                    >
                                      ☕ En Café HUB
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleSelectSituacion(parada, 'demorado')}
                                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                                        currentMsg.plantilla === 'demorado' && isMsgOpen
                                          ? 'bg-orange-600 text-white shadow-2xs'
                                          : 'bg-orange-50 hover:bg-orange-100 text-orange-900 border border-orange-200'
                                      }`}
                                    >
                                      ⏱️ Demora (+15m)
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSelectSituacion(parada, 'disculpas_y_reprogramacion')
                                      }
                                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                                        currentMsg.plantilla === 'disculpas_y_reprogramacion' &&
                                        isMsgOpen
                                          ? 'bg-rose-600 text-white shadow-2xs'
                                          : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200'
                                      }`}
                                    >
                                      🙏 Disculpas / Reprog
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSelectSituacion(
                                          parada,
                                          'esperado_no_estaba_reprogramar'
                                        )
                                      }
                                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                                        currentMsg.plantilla ===
                                          'esperado_no_estaba_reprogramar' && isMsgOpen
                                          ? 'bg-slate-700 text-white shadow-2xs'
                                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                                      }`}
                                    >
                                      🏠 No estaba / Reprog
                                    </button>
                                  </div>
                                </div>

                                {/* Editor y Preview del Mensaje (Desplegable) */}
                                <AnimatePresence>
                                  {isMsgOpen && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden pt-2"
                                    >
                                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                            Previsualización & Edición:
                                          </span>
                                          <span className="text-[10px] font-bold text-slate-400">
                                            Plantilla: {currentMsg.plantilla}
                                          </span>
                                        </div>

                                        <textarea
                                          rows={3}
                                          value={currentMsg.texto}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setParadaMensajes((prev) => ({
                                              ...prev,
                                              [parada.contact.id]: {
                                                ...currentMsg,
                                                texto: val,
                                              },
                                            }));
                                          }}
                                          className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden leading-relaxed shadow-2xs"
                                        />

                                        <div className="flex items-center justify-end gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleCopyText(parada.contact.id, currentMsg.texto)
                                            }
                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                                          >
                                            {copiadoId === parada.contact.id ? (
                                              <>
                                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                                                <span>Copiado</span>
                                              </>
                                            ) : (
                                              <>
                                                <Copy className="h-3.5 w-3.5" />
                                                <span>Copiar</span>
                                              </>
                                            )}
                                          </button>

                                          {whatsAppReady && onSendDirectWA ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                onSendDirectWA(
                                                  tel,
                                                  currentMsg.texto,
                                                  parada.contact.id,
                                                  parada.contact.primerNombre ||
                                                    parada.contact.nombre,
                                                  parada.contact.barrio,
                                                  currentMsg.plantilla
                                                );
                                              }}
                                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-2xs"
                                            >
                                              <Send className="h-3.5 w-3.5" />
                                              <span>Enviar Directo WA</span>
                                            </button>
                                          ) : (
                                            <a
                                              href={waLink}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-2xs"
                                            >
                                              <ExternalLink className="h-3.5 w-3.5" />
                                              <span>Abrir en WhatsApp</span>
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })
                        )}
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
  );
};
