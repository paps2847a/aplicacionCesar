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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  CorteResultado,
  BloqueAgendaRecomendado,
  ParadaRuta,
  Contact,
  VoiceProfile,
} from '../../types';
import { crearEnlaceWhatsApp } from '../../domain/messaging/greetingsAndTone';

interface PlanHoyModernViewProps {
  corteResultado: CorteResultado;
  voiceProfile: VoiceProfile;
  whatsAppReady: boolean;
  onRefreshCorte: () => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => Promise<void> | void;
  onSendDirectWA?: (phone: string, text: string, contactId: string, nombre: string, barrio: string) => Promise<boolean>;
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
                            const msgTerreno = parada.mensajeTerrenoSugerido || '';
                            const waLink = crearEnlaceWhatsApp(tel, msgTerreno);

                            return (
                              <div
                                key={parada.contact.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-black text-white">
                                    {idx + 1}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h5 className="text-xs font-black text-slate-900">
                                        {parada.contact.primerNombre || parada.contact.nombre}
                                      </h5>
                                      <span className="font-mono text-[11px] font-bold text-emerald-700">
                                        Llegada {parada.horaLlegada} hs
                                      </span>
                                    </div>

                                    <p className="text-[11px] text-slate-600 mt-0.5">
                                      {parada.destinoNombre}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                      {parada.detalleTransporte}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                  {whatsAppReady && onSendDirectWA ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onSendDirectWA(
                                          tel,
                                          msgTerreno,
                                          parada.contact.id,
                                          parada.contact.primerNombre || parada.contact.nombre,
                                          parada.contact.barrio
                                        );
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-2xs"
                                    >
                                      <Send className="h-3 w-3" />
                                      <span>Avisar En Camino</span>
                                    </button>
                                  ) : (
                                    <a
                                      href={waLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                                    >
                                      <Send className="h-3 w-3 text-emerald-600" />
                                      <span>Enviar WA</span>
                                    </a>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      onUpdateContact(parada.contact.id, {
                                        adhirio: 'Sí',
                                        estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
                                      });
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition"
                                  >
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                    <span>Firmó</span>
                                  </button>
                                </div>
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
