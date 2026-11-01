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
  const [activeSubMode, setActiveSubMode] = useState<'planificador' | 'terreno'>('planificador');

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
  const [expandedBloqueId, setExpandedBloqueId] = useState<string | null>(
    () => bloques[0]?.id || null
  );

  useEffect(() => {
    if (selectedDia !== 'Todos' && !diasUnicos.includes(selectedDia)) {
      setSelectedDia(diasUnicos[0] || 'Todos');
    }
  }, [diasUnicos, selectedDia]);

  // Overrides locales por bloque en el Planificador (modalidad y café único elegido)
  const [bloqueModalidadOverride, setBloqueModalidadOverride] = useState<
    Record<string, ModalidadEncuentroAgenda>
  >({});
  const [bloqueCafeOverride, setBloqueCafeOverride] = useState<
    Record<string, { nombre: string; direccion: string }>
  >({});

  // Mensajes editables por contacto en el Planificador
  const [propuestaTexts, setPropuestaTexts] = useState<Record<string, string>>({});
  // Reprogramación rápida de fecha/hora en el Planificador
  const [reprogFecha, setReprogFecha] = useState<Record<string, string>>({});
  const [reprogHora, setReprogHora] = useState<Record<string, string>>({});

  // Estado por parada en la Hoja de Ruta en Terreno
  const [paradaModoMsj, setParadaModoMsj] = useState<Record<string, ModoMensajeTerrenoRuta>>({});
  const [paradaTextoEditado, setParadaTextoEditado] = useState<Record<string, string>>({});
  const [paradaUnlockEnCamino, setParadaUnlockEnCamino] = useState<Record<string, boolean>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const bloquesFiltrados = useMemo(() => {
    if (selectedDia === 'Todos') return bloques;
    return bloques.filter((b) => b.diaEtiqueta === selectedDia);
  }, [bloques, selectedDia]);

  // Determina si un vecino fue explícitamente confirmado 1-a-1 para salir a la Hoja de Ruta en Terreno.
  // Regla estricta: si tiene una fecha vencida del pasado (ej. 23/10 sin concretar) o solo dejó una dirección/franja
  // sin que se haya marcado "✓ Confirmó Cita", NO figura como confirmado ni entra en "2. Hoja de Ruta en Terreno".
  const esConfirmadoParaHojaDeRuta = (contact: Contact): boolean => {
    if (contact.alertaVencido?.activa) {
      return false;
    }
    if (paradaUnlockEnCamino[contact.id]) {
      return true;
    }
    const com = contact.comentario || '';
    return /\[confirmado\s+1-a-1\]|visita\s+confirmada|confirm[oó]\s+caf[eé]\s*hub|\[declin[oó]\s+caf[eé]\s*hub/i.test(
      com
    );
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
      .replace(/\s*\[Confirmado\s+1-a-1\]/gi, '')
      .replace(/\s*\[Declinó\s+Café\s+Hub[^\]]*\]/gi, '')
      .replace(/Visita\s+confirmada\s+Puerta\s+a\s+Puerta/gi, 'Visita por confirmar')
      .replace(/Prefiere\s+punto\s+de\s+encuentro\s+Café\s+Hub\s+confirmado/gi, 'Prefiere Café Hub')
      .trim();
    await onUpdateContact(contact.id, {
      estadoFlujo: 'PASO_DATOS_FALTA_CONFIRMAR',
      comentario: comLimpio,
    });
    triggerToast(
      `↺ ${contact.primerNombre || contact.nombre}: Quitado de Hoja de Ruta en Terreno (vuelve a Por Confirmar)`
    );
  };

  const obtenerTextoPropuestaContacto = (contact: Contact, bloque: BloqueAgendaRecomendado) => {
    const key = `${bloque.id}_${contact.id}`;
    if (propuestaTexts[key] !== undefined) return propuestaTexts[key];
    const modOver = bloqueModalidadOverride[bloque.id];
    const cafeOver = bloqueCafeOverride[bloque.id];
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
    const cafeOver = bloqueCafeOverride[bloque.id];
    const cafePrincipal = cafeOver || bloque.cafesHubOpciones?.[0];
    const cafeTexto = cafePrincipal
      ? `${cafePrincipal.nombre} (${cafePrincipal.direccion.split(',')[0]})`
      : undefined;
    return generarMensajeTerrenoParadaRuta(p, modo, voiceProfile, cafeTexto);
  };

  const handleConsolidarRespuestaPlanificador = async (
    contact: Contact,
    bloque: BloqueAgendaRecomendado,
    respuesta: TipoRespuestaPropuestaAgenda
  ) => {
    const bloqueConOverrides: BloqueAgendaRecomendado = {
      ...bloque,
      modalidad: bloqueModalidadOverride[bloque.id] || bloque.modalidad,
      cafeElegidoUsuario: bloqueCafeOverride[bloque.id]
        ? `${bloqueCafeOverride[bloque.id].nombre} (${
            bloqueCafeOverride[bloque.id].direccion.split(',')[0]
          })`
        : bloque.cafeElegidoUsuario,
    };

    const actualizado = aplicarRespuestaPropuestaAgenda(
      contact,
      bloqueConOverrides,
      respuesta,
      {
        nuevaFecha: reprogFecha[contact.id],
        nuevoHorarioPuntual: reprogHora[contact.id],
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

    triggerToast(
      `✓ ${contact.primerNombre || contact.nombre}: ${
        respuesta === 'CONFIRMO_PROPUESTA'
          ? 'Encuentro confirmado (listo en Hoja de Ruta)'
          : respuesta === 'DECLINO_CAFE_PASA_PUERTA_A_PUERTA'
          ? 'Pasó a recorrido Puerta a Puerta'
          : respuesta === 'PASA_A_CAFE_HUB'
          ? 'Confirmado en Café del circuito'
          : 'Reprogramado con éxito'
      }`
    );
  };

  const handleSendWA = async (contact: Contact, text: string) => {
    const phone = contact.tel || contact.telRaw || contact.telWA || '';
    if (!phone) return;
    if (onSendDirectWA) {
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
          triggerToast(`✓ Mensaje enviado a ${contact.primerNombre || contact.nombre}`);
        }
      } finally {
        setSendingId(null);
      }
    }
  };

  const handleMarkFichasParada = async (contact: Contact, cant: 1 | 2 | 3) => {
    const actualizado = marcarEntregaFichasExtra(contact, cant, 7);
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

      {/* 2. SECCIÓN PRIORITARIA SIEMPRE ARRIBA: Citas Vencidas / Sin Confirmar para Reprogramar */}
      {alertasVencidos.length > 0 && (
        <div className="rounded-2xl border-2 border-[#323232] bg-[#F5817F]/25 p-4 sm:p-5 shadow-[4px_4px_0px_#323232] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border-2 border-[#323232] bg-[#FF2C00] text-white">
                <AlertCircle className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold font-display text-[#323232]">
                  ⚠️ Prioridad 1: Citas Vencidas o Sin Concretar ({alertasVencidos.length})
                </h3>
                <p className="text-xs font-medium text-[#323232]/80">
                  Vecinos con fecha/hora pasada que aún no figuran como &ldquo;Adhirió: Sí&rdquo;. Enviá disculpas y reprogramá en 1 clic.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        </div>
      )}

      {/* 3. Selector de Día Operativo */}
      {diasUnicos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b-2 border-[#323232]/20 pb-3">
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
            const modalidadActiva = bloqueModalidadOverride[bloque.id] || bloque.modalidad;
            const esCafe = modalidadActiva === 'CAFE_HUB';
            const esSede =
              modalidadActiva === 'EVENTO_SEDE' || modalidadActiva === 'ENCUENTRO_SEDE';
            const cafeUnicoCircuito =
              bloqueCafeOverride[bloque.id] || bloque.cafesHubOpciones?.[0];

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
                              {bloque.contactosIncluidos.length >= 2 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBloqueModalidadOverride((prev) => ({
                                      ...prev,
                                      [bloque.id]: 'CAFE_HUB',
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
                                      setBloqueCafeOverride((prev) => ({
                                        ...prev,
                                        [bloque.id]: {
                                          nombre: found.nombre,
                                          direccion: found.direccion,
                                        },
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

                            return (
                              <div
                                key={contact.id}
                                className="rounded-2xl border-2 border-[#323232] bg-white p-4 shadow-[2px_2px_0px_#323232] space-y-3"
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
                                        Horario sugerido: {paradaRef.horaLlegada} hs
                                      </span>
                                    )}
                                    {contact.alertaVencido?.activa && (
                                      <span className="rounded-md bg-[#FF2C00] px-2 py-0.5 text-xs font-bold text-white border border-[#323232]">
                                        ⚠️ Fecha vencida ({contact.alertaVencido.fechaVencida || 'pasada'}) · Reprogramar
                                      </span>
                                    )}
                                    {yaConfirmado ? (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900 border border-[#323232]">
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

                                {/* Textarea editable de la propuesta */}
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
                                        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-3 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] shadow-[2px_2px_0px_#323232]"
                                      >
                                        <Send className="h-3.5 w-3.5" />
                                        <span>
                                          {sendingId === contact.id
                                            ? 'Enviando...'
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
                                      onClick={() =>
                                        handleConsolidarRespuestaPlanificador(
                                          contact,
                                          bloque,
                                          'CONFIRMO_PROPUESTA'
                                        )
                                      }
                                      className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-emerald-100 px-2.5 py-1.5 text-xs font-bold font-display text-emerald-950 hover:bg-emerald-200"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      <span>✓ Confirmó Cita</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleConsolidarRespuestaPlanificador(
                                          contact,
                                          bloque,
                                          'DECLINO_CAFE_PASA_PUERTA_A_PUERTA'
                                        )
                                      }
                                      className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-[#DFF4FF] px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#29B8FF]"
                                    >
                                      <Home className="h-3.5 w-3.5" />
                                      <span>Pasa a Domicilio</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleConsolidarRespuestaPlanificador(
                                          contact,
                                          bloque,
                                          'PASA_A_CAFE_HUB'
                                        )
                                      }
                                      className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-[#FFF06B]/60 px-2.5 py-1.5 text-xs font-bold text-[#323232] hover:bg-[#FFF06B]"
                                    >
                                      <Coffee className="h-3.5 w-3.5" />
                                      <span>Va al Café</span>
                                    </button>

                                    {yaConfirmado && (
                                      <button
                                        type="button"
                                        onClick={() => handleQuitarConfirmacionPlanificador(contact)}
                                        className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold text-[#FF2C00] hover:bg-[#F5817F]/20"
                                        title="Quitar de la Hoja de Ruta en Terreno"
                                      >
                                        <span>↺ Quitar confirmación</span>
                                      </button>
                                    )}
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
                                    placeholder="Día (ej: 24/10)"
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
                                    onClick={() =>
                                      handleConsolidarRespuestaPlanificador(
                                        contact,
                                        bloque,
                                        'REPROGRAMAR_DIA_HORA'
                                      )
                                    }
                                    className="rounded-lg border border-[#323232] bg-[#323232] px-2.5 py-1 text-xs font-bold text-[#FFF06B]"
                                  >
                                    Guardar Nuevo Horario
                                  </button>
                                </div>
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
                                        <span className="inline-flex items-center gap-1 rounded-xl border border-[#323232] bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-950">
                                          <Unlock className="h-3.5 w-3.5 text-emerald-700" />
                                          <span>Cita Confirmada</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>

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
                                            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-3.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#ffe838] shadow-[2px_2px_0px_#323232]"
                                          >
                                            <Send className="h-3.5 w-3.5" />
                                            <span>
                                              {sendingId === c.id
                                                ? 'Enviando...'
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
