import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Coffee,
  Copy,
  FileSpreadsheet,
  Filter,
  MapPin,
  MessageSquare,
  Navigation,
  PhoneOff,
  Send,
  Sparkles,
  UserCheck,
  UserX,
  Zap,
} from 'lucide-react';
import {
  Contact,
  ControlEnvioRegistro,
  CorteResultado,
  EstadoFlujo,
  EstatusReporteApp,
  EtapaProcesoTerritorial,
  ModoColaAutomatizacionWA,
  ModoSaludoMismoDia,
  TareaDiariaItem,
  TipoPlantillaWA,
  VoiceProfile,
} from '../types';
import {
  aplicarReglaSaludoMismoDia,
  corregirPelonesDiaSemanaEnTexto,
  generarMensajeContextual,
  generarPanelTareasDiarias,
} from '../utils/logic';

interface DailyTasksAndFormsPanelProps {
  contacts: Contact[];
  corte: CorteResultado;
  controlEnvios: ControlEnvioRegistro[];
  profile: VoiceProfile;
  ahoraMs: number;
  onSendWhatsApp: (contact: Contact, texto: string, tipoPlantilla: string) => void;
  onQuickUpdateContact: (
    contactId: string,
    changes: {
      rsp?: 'Sí' | 'No' | 'Nuevo';
      adhirio?: 'Sí' | 'Pendiente' | 'No';
      estadoFlujo?: EstadoFlujo;
      comentario?: string;
      barrio?: string;
    },
    motivoLog: string
  ) => void;
  onOpenBotWithMode: (modoCola: ModoColaAutomatizacionWA) => void;
  onNavigateToStep: (step: '1_padron' | '2_corte' | '3_mapa_ruta') => void;
}

const BOTONES_ETAPA_MENSAJE: {
  id: TipoPlantillaWA;
  label: string;
  etapaBadge: string;
}[] = [
  { id: 'primer_contacto', label: '1er Contacto', etapaBadge: 'Etapa 1' },
  { id: 'seguimiento_cambio_chip', label: 'Validar DNI CABA + Pedir Dir/Franja', etapaBadge: 'Etapa 2-3' },
  { id: 'propuesta_bloque_agenda', label: 'Proponer Visita o Café', etapaBadge: 'Etapa 4' },
  { id: 'convocatoria_cafe_hub', label: 'Invitar a Café Céntrico', etapaBadge: 'Etapa 4 Café' },
  { id: 'confirmacion_visita', label: 'Confirmar Día/Hora/Dir', etapaBadge: 'Etapa 5' },
  { id: 'recordatorio_maniana_encuentro', label: 'Recordatorio Mañana (Antes de salir)', etapaBadge: 'Etapa 6' },
  { id: 'en_camino', label: 'En Camino (10-15m)', etapaBadge: 'Etapa 6' },
  { id: 'demorado', label: 'Demorado (+15/20m)', etapaBadge: 'Etapa 6' },
  { id: 'disculpas_y_reprogramacion', label: 'Disculpas Cancelación / Reprogramar', etapaBadge: 'Etapa 6' },
  { id: 'esperado_no_estaba_reprogramar', label: 'Esperé y No Estaba / Reprogramar', etapaBadge: 'Etapa 6' },
  { id: 'llegando', label: 'En la Puerta (2 min)', etapaBadge: 'Etapa 6' },
  { id: 'agradecimiento_post_firma', label: 'Agradecimiento Post-Adhesión', etapaBadge: 'Etapa 7' },
  { id: 'seguimiento_24h_falta_dato', label: 'Seguimiento 24h (Falta Dato)', etapaBadge: '24 hs' },
  { id: 'seguimiento_24h_falta_confirmar', label: 'Seguimiento 24h (Sin Confirmar)', etapaBadge: '24 hs' },
  { id: 'seguimiento_sin_respuesta', label: 'Seguimiento 48h (Sin Rsp)', etapaBadge: '48 hs' },
  { id: 'baja_amable_sin_respuesta', label: 'Último Msj Baja Amable (No molestar)', etapaBadge: 'Cierre' },
];

export const DailyTasksAndFormsPanel: React.FC<DailyTasksAndFormsPanelProps> = ({
  contacts,
  corte,
  controlEnvios,
  profile,
  ahoraMs,
  onSendWhatsApp,
  onQuickUpdateContact,
  onOpenBotWithMode,
  onNavigateToStep,
}) => {
  const [subTab, setSubTab] = useState<'tareas_hoy' | 'cierre_forms_apps' | 'metodo_cafe_hub'>('tareas_hoy');
  const [filtroCategoria, setFiltroCategoria] = useState<
    | 'TODAS'
    | 'URGENTE_HOY'
    | 'SEGUIMIENTOS_24_48_BAJA'
    | 'ETAPA_2_3_DATOS'
    | 'ETAPA_7_AGRADECER'
    | 'ETAPA_1_PRIMER_MSJ'
  >('TODAS');
  const [modoSaludo, setModoSaludo] = useState<ModoSaludoMismoDia>('AUTO_MISMO_DIA');
  const [busqueda, setBusqueda] = useState('');
  const [barrioFiltro, setBarrioFiltro] = useState('Todos');

  // Estado local de edición rápida por contacto (dirección/horario y mensaje personalizado)
  const [quickInputByContact, setQuickInputByContact] = useState<Record<string, string>>({});
  const [plantillaOverrideByContact, setPlantillaOverrideByContact] = useState<
    Record<string, TipoPlantillaWA>
  >({});
  const [customMsgByContact, setCustomMsgByContact] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllTasks, setShowAllTasks] = useState(false);

  const panel = useMemo(
    () =>
      generarPanelTareasDiarias(
        contacts,
        corte,
        controlEnvios,
        profile,
        ahoraMs,
        modoSaludo
      ),
    [contacts, corte, controlEnvios, profile, ahoraMs, modoSaludo]
  );

  const barriosDisponibles = useMemo(() => {
    const setB = new Set<string>();
    contacts.forEach((c) => {
      if (c.barrio) setB.add(c.barrio);
    });
    return ['Todos', ...Array.from(setB).sort()];
  }, [contacts]);

  const tareasFiltradas = useMemo(() => {
    return panel.tareasPriorizadas.filter((t) => {
      if (barrioFiltro !== 'Todos' && t.contact.barrio !== barrioFiltro) return false;
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        const match =
          t.contact.nombreCompletoCorregido.toLowerCase().includes(q) ||
          t.contact.telRaw.toLowerCase().includes(q) ||
          (t.contact.comentario || '').toLowerCase().includes(q) ||
          (t.contact.barrio || '').toLowerCase().includes(q) ||
          t.contact.id.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (filtroCategoria === 'URGENTE_HOY') {
        return (
          t.etapaCodigo === 'ETAPA_6_TERRENO_HOY_Y_RECORDATORIO' ||
          t.etapaCodigo === 'ETAPA_5_CONFIRMAR_ENCUENTRO' ||
          t.etapaCodigo === 'ETAPA_4_PROPONER_ENCUENTRO_O_CAFE'
        );
      }
      if (filtroCategoria === 'SEGUIMIENTOS_24_48_BAJA') {
        return (
          t.etapaCodigo === 'SEGUIMIENTO_24H_FALTA_DATO' ||
          t.etapaCodigo === 'SEGUIMIENTO_24H_FALTA_CONFIRMAR' ||
          t.etapaCodigo === 'SEGUIMIENTO_48H_SIN_RSP' ||
          t.etapaCodigo === 'ULTIMO_MSJ_BAJA_AMABLE'
        );
      }
      if (filtroCategoria === 'ETAPA_2_3_DATOS') {
        return (
          t.etapaCodigo === 'ETAPA_2_VALIDAR_DNI_CABA' ||
          t.etapaCodigo === 'ETAPA_3_PEDIR_DIRECCION_Y_FRANJA'
        );
      }
      if (filtroCategoria === 'ETAPA_7_AGRADECER') {
        return t.etapaCodigo === 'ETAPA_7_AGRADECIMIENTO_POST_FIRMA';
      }
      if (filtroCategoria === 'ETAPA_1_PRIMER_MSJ') {
        return t.etapaCodigo === 'ETAPA_1_PRIMER_CONTACTO';
      }
      return true;
    });
  }, [panel.tareasPriorizadas, barrioFiltro, busqueda, filtroCategoria]);

  const conteosCategorias = useMemo(() => {
    const c = panel.conteoPorEtapa;
    return {
      urgentesHoy:
        c.ETAPA_6_TERRENO_HOY_Y_RECORDATORIO +
        c.ETAPA_5_CONFIRMAR_ENCUENTRO +
        c.ETAPA_4_PROPONER_ENCUENTRO_O_CAFE,
      seguimientos:
        c.SEGUIMIENTO_24H_FALTA_DATO +
        c.SEGUIMIENTO_24H_FALTA_CONFIRMAR +
        c.SEGUIMIENTO_48H_SIN_RSP +
        c.ULTIMO_MSJ_BAJA_AMABLE,
      datosEtapa2y3: c.ETAPA_2_VALIDAR_DNI_CABA + c.ETAPA_3_PEDIR_DIRECCION_Y_FRANJA,
      agradecerEtapa7: c.ETAPA_7_AGRADECIMIENTO_POST_FIRMA,
      primerContactoEtapa1: c.ETAPA_1_PRIMER_CONTACTO,
    };
  }, [panel.conteoPorEtapa]);

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleSelectPlantillaForTask = (t: TareaDiariaItem, tpl: TipoPlantillaWA) => {
    setPlantillaOverrideByContact((prev) => ({ ...prev, [t.contact.id]: tpl }));
    const gen = generarMensajeContextual(t.contact, profile, tpl, {
      modoSaludo: tpl === 'primer_contacto' ? 'SIEMPRE_SALUDAR' : modoSaludo,
      ahoraMs,
    });
    setCustomMsgByContact((prev) => ({
      ...prev,
      [t.contact.id]: gen.texto,
    }));
  };

  const handleSaveQuickDato = (c: Contact) => {
    const val = (quickInputByContact[c.id] ?? c.comentario ?? '').trim();
    if (!val) return;
    // Al guardar una dirección o franja, pasa automáticamente a PASO_DATOS_FALTA_CONFIRMAR o ENCUENTRO_CONFIRMADO
    const tieneConfirmado = /confirmad|visita\s+\d{1,2}\/\d{1,2}/i.test(val);
    const nuevoEstado: EstadoFlujo = tieneConfirmado
      ? 'ENCUENTRO_CONFIRMADO'
      : 'PASO_DATOS_FALTA_CONFIRMAR';
    onQuickUpdateContact(
      c.id,
      {
        rsp: 'Sí',
        comentario: val,
        estadoFlujo: nuevoEstado,
      },
      `Dato cargado en Panel Diario: ${val}`
    );
  };

  const tareasVisibles = showAllTasks ? tareasFiltradas : tareasFiltradas.slice(0, 18);

  return (
    <section className="mb-6 rounded-2xl border-2 border-[#262626] bg-[#F7F6F0] shadow-[4px_4px_0px_#262626] overflow-hidden">
      {/* CABECERA IDENTIDAD POPURRÍ */}
      <div className="bg-[#262626] text-[#F7F6F0] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src="/assets/aistudio/logo-color-solo_40b14ef6.webp"
            alt="Popurrí"
            className="w-9 h-9 object-contain rounded-lg bg-[#F7F6F0] p-1"
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-[#22ABFF] text-white font-black text-xs uppercase tracking-wider px-2 py-0.5">
                ENFOQUE DIARIO POPURRÍ
              </span>
              <span className="bg-[#FBF165] text-[#262626] font-extrabold text-xs px-2 py-0.5">
                {panel.fechaReferenciaBA}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
              Panel de Tareas del Día, Mensajes sin Pelones y Cierre Diario (Forms + Apps)
            </h2>
          </div>
        </div>

        {/* Pestañas internas del Panel Diario */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#1a1a1a] p-1 rounded-xl border border-stone-700">
          <button
            type="button"
            onClick={() => setSubTab('tareas_hoy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 ${
              subTab === 'tareas_hoy'
                ? 'bg-[#FBF165] text-[#262626] shadow-sm'
                : 'text-stone-300 hover:text-white'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            1. Tareas de Hoy ({panel.tareasPriorizadas.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('cierre_forms_apps')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 ${
              subTab === 'cierre_forms_apps'
                ? 'bg-[#22ABFF] text-white shadow-sm'
                : 'text-stone-300 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            2. Google Forms + Adhesiones + Estatus (
            {panel.resumenFormsYApps.personasContactadasHoy} hablados /{' '}
            {panel.resumenFormsYApps.adhesionesConseguidasHoy} adh. hoy)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('metodo_cafe_hub')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 ${
              subTab === 'metodo_cafe_hub'
                ? 'bg-[#FBF165] text-[#262626] shadow-sm'
                : 'text-stone-300 hover:text-white'
            }`}
          >
            <Coffee className="w-3.5 h-3.5" />
            3. Estrategia Café HUB + Recorridos
          </button>
        </div>
      </div>

      {/* BARRA RÁPIDA DE AUTOMATIZACIONES MULTI-ETAPA + REGLA DE SALUDO MISMO DÍA */}
      <div className="bg-white border-b border-stone-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-[#262626] flex items-center gap-1">
            <Bot className="w-3.5 h-3.5 text-[#22ABFF]" />
            Automatizar sin bloqueo:
          </span>
          <button
            type="button"
            onClick={() => onOpenBotWithMode('PRIMER_CONTACTO')}
            className="px-2.5 py-1 rounded-lg bg-[#262626] hover:bg-stone-800 text-[#FBF165] text-xs font-bold transition flex items-center gap-1"
          >
            <span>1er Msj en Frío ({conteosCategorias.primerContactoEtapa1})</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenBotWithMode('RECORDATORIO_MANIANA_HOY')}
            className="px-2.5 py-1 rounded-lg bg-[#22ABFF] hover:bg-sky-600 text-white text-xs font-bold transition flex items-center gap-1"
          >
            <span>Recordatorios Mañana ({panel.conteoPorEtapa.ETAPA_6_TERRENO_HOY_Y_RECORDATORIO})</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenBotWithMode('SEGUIMIENTO_24H_48H_BAJA')}
            className="px-2.5 py-1 rounded-lg bg-[#FBF165] hover:bg-yellow-300 text-[#262626] border border-[#262626] text-xs font-extrabold transition flex items-center gap-1"
          >
            <span>Seguimientos 24h / 48h / Baja ({conteosCategorias.seguimientos})</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenBotWithMode('AGRADECIMIENTO_POST_FIRMA')}
            className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition flex items-center gap-1"
          >
            <span>Agradecer Adhesión ({conteosCategorias.agradecerEtapa7})</span>
          </button>
        </div>

        {/* Selector de Regla de Saludo por Marca Temporal */}
        <div className="flex items-center gap-2 bg-[#F7F6F0] px-2.5 py-1 rounded-lg border border-stone-300">
          <Clock className="w-3.5 h-3.5 text-[#262626]" />
          <span className="text-[11px] font-bold text-[#262626]">Saludo hoy:</span>
          <select
            value={modoSaludo}
            onChange={(e) => setModoSaludo(e.target.value as ModoSaludoMismoDia)}
            className="text-xs font-extrabold bg-white border border-stone-300 rounded px-2 py-0.5 text-[#262626]"
          >
            <option value="AUTO_MISMO_DIA">
              Auto por marca temporal (Sin saludo si ya hablé hoy)
            </option>
            <option value="SIN_SALUDO">Directo al grano (Omitir saludo siempre)</option>
            <option value="SIEMPRE_SALUDAR">Saludar siempre ("Hola, Nombre...")</option>
          </select>
        </div>
      </div>

      {/* CONTENIDO DE PESTAÑA 1: TAREAS DIARIAS POR ETAPA */}
      {subTab === 'tareas_hoy' && (
        <div className="p-4 space-y-4">
          {/* Tarjetas Resumen de las Etapas (Estilo gráfico Popurrí) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <button
              type="button"
              onClick={() => setFiltroCategoria('TODAS')}
              className={`text-left p-2.5 rounded-xl border-2 transition ${
                filtroCategoria === 'TODAS'
                  ? 'border-[#262626] bg-[#262626] text-white'
                  : 'border-stone-300 bg-white text-[#262626] hover:border-[#262626]'
              }`}
            >
              <span className="inline-block bg-[#FBF165] text-[#262626] font-black text-[11px] px-1.5 py-0.2">
                TODAS
              </span>
              <div className="text-xl font-black mt-1">{panel.tareasPriorizadas.length}</div>
              <div className="text-[11px] opacity-80 font-semibold">Pendientes en total</div>
            </button>

            <button
              type="button"
              onClick={() => setFiltroCategoria('URGENTE_HOY')}
              className={`text-left p-2.5 rounded-xl border-2 transition ${
                filtroCategoria === 'URGENTE_HOY'
                  ? 'border-[#262626] bg-[#FBF165] text-[#262626]'
                  : 'border-stone-300 bg-white text-[#262626] hover:border-[#262626]'
              }`}
            >
              <span className="inline-block bg-[#262626] text-[#FBF165] font-black text-[11px] px-1.5 py-0.2">
                ETAPAS 4, 5 Y 6
              </span>
              <div className="text-xl font-black mt-1">{conteosCategorias.urgentesHoy}</div>
              <div className="text-[11px] font-bold">Salidas Hoy / Proponer / Confirmar</div>
            </button>

            <button
              type="button"
              onClick={() => setFiltroCategoria('SEGUIMIENTOS_24_48_BAJA')}
              className={`text-left p-2.5 rounded-xl border-2 transition ${
                filtroCategoria === 'SEGUIMIENTOS_24_48_BAJA'
                  ? 'border-[#262626] bg-[#22ABFF] text-white'
                  : 'border-stone-300 bg-white text-[#262626] hover:border-[#262626]'
              }`}
            >
              <span className="inline-block bg-[#FBF165] text-[#262626] font-black text-[11px] px-1.5 py-0.2">
                24H · 48H · BAJA
              </span>
              <div className="text-xl font-black mt-1">{conteosCategorias.seguimientos}</div>
              <div className="text-[11px] font-bold">Seguimientos y bajas amables</div>
            </button>

            <button
              type="button"
              onClick={() => setFiltroCategoria('ETAPA_2_3_DATOS')}
              className={`text-left p-2.5 rounded-xl border-2 transition ${
                filtroCategoria === 'ETAPA_2_3_DATOS'
                  ? 'border-[#262626] bg-[#262626] text-white'
                  : 'border-stone-300 bg-white text-[#262626] hover:border-[#262626]'
              }`}
            >
              <span className="inline-block bg-[#22ABFF] text-white font-black text-[11px] px-1.5 py-0.2">
                ETAPAS 2 Y 3
              </span>
              <div className="text-xl font-black mt-1">{conteosCategorias.datosEtapa2y3}</div>
              <div className="text-[11px] font-bold">Confirmar DNI CABA + Dirección</div>
            </button>

            <button
              type="button"
              onClick={() => setFiltroCategoria('ETAPA_7_AGRADECER')}
              className={`text-left p-2.5 rounded-xl border-2 transition ${
                filtroCategoria === 'ETAPA_7_AGRADECER'
                  ? 'border-[#262626] bg-emerald-700 text-white'
                  : 'border-stone-300 bg-white text-[#262626] hover:border-[#262626]'
              }`}
            >
              <span className="inline-block bg-emerald-200 text-emerald-950 font-black text-[11px] px-1.5 py-0.2">
                ETAPA 7
              </span>
              <div className="text-xl font-black mt-1">{conteosCategorias.agradecerEtapa7}</div>
              <div className="text-[11px] font-bold">Agradecer adhesión firmada</div>
            </button>

            <button
              type="button"
              onClick={() => setFiltroCategoria('ETAPA_1_PRIMER_MSJ')}
              className={`text-left p-2.5 rounded-xl border-2 transition ${
                filtroCategoria === 'ETAPA_1_PRIMER_MSJ'
                  ? 'border-[#262626] bg-[#262626] text-[#FBF165]'
                  : 'border-stone-300 bg-white text-[#262626] hover:border-[#262626]'
              }`}
            >
              <span className="inline-block bg-[#262626] text-white font-black text-[11px] px-1.5 py-0.2">
                ETAPA 1 (&lt;45/DÍA)
              </span>
              <div className="text-xl font-black mt-1">{conteosCategorias.primerContactoEtapa1}</div>
              <div className="text-[11px] font-bold">Sin 1er mensaje enviado</div>
            </button>
          </div>

          {/* Buscador y filtro de barrio */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-stone-300">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <Filter className="w-4 h-4 text-stone-500" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar vecino por nombre, #ID, teléfono, dirección o comentario..."
                className="w-full text-xs font-medium bg-transparent focus:outline-none text-[#262626]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-600">Barrio:</span>
              <select
                value={barrioFiltro}
                onChange={(e) => setBarrioFiltro(e.target.value)}
                className="text-xs font-bold bg-[#F7F6F0] border border-stone-300 rounded-lg px-2.5 py-1 text-[#262626]"
              >
                {barriosDisponibles.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lista de Tareas Accionables */}
          <div className="space-y-3">
            {tareasVisibles.map((t) => {
              const c = t.contact;
              const quickVal = quickInputByContact[c.id] ?? c.comentario ?? '';
              const activeTpl = plantillaOverrideByContact[c.id] || t.tipoPlantillaSugerida;
              const rawMsg = customMsgByContact[c.id] ?? t.mensajeListo;
              const mensajeFinal = corregirPelonesDiaSemanaEnTexto(
                aplicarReglaSaludoMismoDia(
                  rawMsg,
                  c,
                  activeTpl === 'primer_contacto' ? 'SIEMPRE_SALUDAR' : modoSaludo,
                  ahoraMs
                )
              );

              return (
                <div
                  key={t.id}
                  className="bg-white rounded-xl border-2 border-[#262626] p-3.5 shadow-[2px_2px_0px_#262626] space-y-2.5"
                >
                  {/* Fila superior: Etapa + Datos del Vecino + Botones de Estatus en 1 Clic */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-[#262626] text-[#FBF165] font-black text-xs px-2 py-0.5">
                          {t.etapaNumero}.
                        </span>
                        <span className="bg-[#22ABFF] text-white font-extrabold text-xs px-2 py-0.5">
                          {t.etapaTitulo}
                        </span>
                        <span className="font-black text-sm text-[#262626]">
                          #{c.id} · {c.nombreCompletoCorregido}
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#F7F6F0] border border-stone-300 text-[#262626]">
                          {c.barrio}
                        </span>
                        <span className="text-xs font-mono text-stone-600">{c.telRaw}</span>
                        {t.yaSeHabloHoy && (
                          <span className="text-[11px] font-extrabold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300">
                            ✓ Hablado hoy (Saludo omitido en modo auto)
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-stone-700">
                        <strong className="text-[#262626]">Diagnóstico:</strong> {t.motivoTarea} —{' '}
                        <span className="bg-[#FBF165] text-[#262626] font-bold px-1">
                          {t.accionConcreta}
                        </span>
                      </p>
                    </div>

                    {/* Botonera 1-Clic de Estatus (Actualiza Tabla + Forms + Apps al instante) */}
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onQuickUpdateContact(
                            c.id,
                            {
                              rsp: 'Sí',
                              adhirio: 'Sí',
                              estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
                            },
                            'Marcado Ya Adhirió en 1 clic'
                          )
                        }
                        className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold transition"
                        title="Marcar que ya firmó la ficha de adhesión"
                      >
                        ✅ ¡Adhirió!
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onQuickUpdateContact(
                            c.id,
                            {
                              rsp: 'Sí',
                              adhirio: 'Pendiente',
                              estadoFlujo: 'ENCUENTRO_CONFIRMADO',
                            },
                            'Encuentro confirmado en 1 clic'
                          )
                        }
                        className="px-2 py-1 rounded bg-[#22ABFF] hover:bg-sky-600 text-white text-[11px] font-extrabold transition"
                      >
                        📅 Confirmó Encuentro
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onQuickUpdateContact(
                            c.id,
                            {
                              rsp: 'Sí',
                              adhirio: 'Pendiente',
                              estadoFlujo: 'PREFIERE_CAFE_HUB_O_SEDE',
                            },
                            'Prefiere acercarse a Café en 1 clic'
                          )
                        }
                        className="px-2 py-1 rounded bg-[#FBF165] hover:bg-yellow-300 text-[#262626] border border-[#262626] text-[11px] font-extrabold transition"
                      >
                        ☕ Va a Café
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onQuickUpdateContact(
                            c.id,
                            {
                              rsp: 'Sí',
                              adhirio: 'No',
                              estadoFlujo: 'SIN_DNI_CABA_PEDIR_REFERIDOS',
                              comentario: `${c.comentario ? c.comentario + ' — ' : ''}Sin DNI en CABA`,
                            },
                            'Marcado Sin DNI en CABA'
                          )
                        }
                        className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-[11px] font-bold transition"
                      >
                        🪪 Sin DNI CABA
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onQuickUpdateContact(
                            c.id,
                            {
                              rsp: 'Sí',
                              adhirio: 'No',
                              estadoFlujo: 'DESCARTADO_O_BAJA',
                              comentario: `${c.comentario ? c.comentario + ' — ' : ''}No vive en CABA`,
                            },
                            'Marcado No vive en CABA'
                          )
                        }
                        className="px-2 py-1 rounded bg-orange-100 hover:bg-orange-200 text-orange-900 border border-orange-300 text-[11px] font-bold transition"
                      >
                        📍 No vive acá
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onQuickUpdateContact(
                            c.id,
                            {
                              rsp: 'No',
                              adhirio: 'No',
                              estadoFlujo: 'DESCARTADO_O_BAJA',
                              comentario: `${c.comentario ? c.comentario + ' — ' : ''}Número inválido / No existe en WhatsApp`,
                            },
                            'Marcado Número inválido'
                          )
                        }
                        className="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 text-[11px] font-bold transition"
                      >
                        📵 N° Inválido
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onQuickUpdateContact(
                            c.id,
                            {
                              rsp: 'No',
                              adhirio: 'No',
                              estadoFlujo: 'DESCARTADO_O_BAJA',
                              comentario: `${c.comentario ? c.comentario + ' — ' : ''}Baja solicitada / Sin respuesta definitiva`,
                            },
                            'Marcado Baja'
                          )
                        }
                        className="px-2 py-1 rounded bg-stone-200 hover:bg-stone-300 text-stone-800 text-[11px] font-bold transition"
                      >
                        👋 Baja
                      </button>
                    </div>
                  </div>

                  {/* Carga rápida en 1 línea: Dirección / Esquina / Día y Franja -> Auto-actualiza Tabla + Ruta + Café HUB */}
                  <div className="flex flex-wrap items-center gap-2 bg-[#F7F6F0] p-2 rounded-lg border border-stone-300">
                    <MapPin className="w-4 h-4 text-[#22ABFF] shrink-0" />
                    <input
                      type="text"
                      value={quickVal}
                      onChange={(e) =>
                        setQuickInputByContact((prev) => ({
                          ...prev,
                          [c.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveQuickDato(c);
                      }}
                      placeholder="Escribí dirección/esquina y día/franja (ej: Charcas 3702, viernes 23/10 de 10 a 13 hs) y presioná Enter..."
                      className="flex-1 min-w-[240px] text-xs font-semibold bg-white border border-stone-300 rounded px-2.5 py-1 text-[#262626]"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveQuickDato(c)}
                      className="px-3 py-1 rounded bg-[#262626] hover:bg-stone-800 text-[#FBF165] text-xs font-extrabold transition"
                    >
                      Guardar y Sumar a Ruta / Café
                    </button>
                  </div>

                  {/* Selector rápido de etapa de mensaje + Textarea con anti-pelones activo */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[11px] font-bold text-stone-500 mr-1">
                        Cambiar mensaje a:
                      </span>
                      {BOTONES_ETAPA_MENSAJE.map((btn) => (
                        <button
                          key={btn.id}
                          type="button"
                          onClick={() => handleSelectPlantillaForTask(t, btn.id)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition border ${
                            activeTpl === btn.id
                              ? 'bg-[#262626] text-[#FBF165] border-[#262626]'
                              : 'bg-[#F7F6F0] text-[#262626] border-stone-300 hover:bg-stone-200'
                          }`}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 items-stretch">
                      <textarea
                        rows={3}
                        value={mensajeFinal}
                        onChange={(e) =>
                          setCustomMsgByContact((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                        className="flex-1 text-xs font-medium bg-[#F7F6F0] border border-stone-300 rounded-lg p-2.5 text-[#262626] leading-relaxed"
                      />
                      <div className="flex sm:flex-col justify-between gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSendWhatsApp(c, mensajeFinal, activeTpl)}
                          className="flex-1 px-3.5 py-2 rounded-lg bg-[#262626] hover:bg-stone-800 text-[#FBF165] font-black text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Enviar WA y Registrar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyText(`msg-${c.id}`, mensajeFinal)}
                          className="px-3 py-1.5 rounded-lg bg-white hover:bg-stone-100 text-[#262626] border border-[#262626] font-bold text-xs transition flex items-center justify-center gap-1"
                        >
                          {copiedId === `msg-${c.id}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copiar texto
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {tareasFiltradas.length > 18 && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowAllTasks((prev) => !prev)}
                  className="px-4 py-2 rounded-xl bg-[#262626] text-[#FBF165] font-extrabold text-xs hover:bg-stone-800 transition"
                >
                  {showAllTasks
                    ? 'Mostrar menos tareas'
                    : `Ver las ${tareasFiltradas.length - 18} tareas restantes...`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTENIDO DE PESTAÑA 2: PANEL DE CIERRE DIARIO (GOOGLE FORMS + APP ADHESIONES + APP ESTATUS) */}
      {subTab === 'cierre_forms_apps' && (
        <div className="p-4 space-y-5">
          {/* Bloque 1: Google Forms Diario */}
          <div className="bg-white rounded-xl border-2 border-[#262626] p-4 shadow-[2px_2px_0px_#262626]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <span className="bg-[#22ABFF] text-white font-black text-xs px-2 py-0.5 uppercase">
                  1. PARA TU GOOGLE FORMS DIARIO ({panel.resumenFormsYApps.fechaHoyEtiqueta})
                </span>
                <h3 className="text-base font-black text-[#262626] mt-1">
                   Totales del Día listos para copiar y pegar en el Formulario
                </h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleCopyText(
                    'forms-resumen',
                    `Fecha: ${panel.resumenFormsYApps.fechaHoyEtiqueta}\nPersonas contactadas hoy: ${panel.resumenFormsYApps.personasContactadasHoy}\nAdhesiones conseguidas hoy: ${panel.resumenFormsYApps.adhesionesConseguidasHoy}\nTotal adhesiones acumuladas: ${panel.resumenFormsYApps.adhesionesTotalesAcumuladas}`
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-[#262626] text-[#FBF165] font-extrabold text-xs flex items-center gap-1.5"
              >
                {copiedId === 'forms-resumen' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copiar Resumen para Google Forms
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-[#F7F6F0] border-2 border-[#262626] flex items-center justify-between">
                <div>
                  <div className="text-xs font-extrabold uppercase text-stone-600">
                    Personas contactadas hoy
                  </div>
                  <div className="text-3xl font-black text-[#262626]">
                    {panel.resumenFormsYApps.personasContactadasHoy}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText(
                      'forms-contactadas',
                      String(panel.resumenFormsYApps.personasContactadasHoy)
                    )
                  }
                  className="px-2.5 py-1.5 rounded bg-white border border-[#262626] text-xs font-bold text-[#262626]"
                >
                  {copiedId === 'forms-contactadas' ? '¡Copiado!' : 'Copiar N°'}
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#FBF165] border-2 border-[#262626] flex items-center justify-between">
                <div>
                  <div className="text-xs font-extrabold uppercase text-[#262626]">
                    Adhesiones conseguidas hoy
                  </div>
                  <div className="text-3xl font-black text-[#262626]">
                    {panel.resumenFormsYApps.adhesionesConseguidasHoy}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText(
                      'forms-adh-hoy',
                      String(panel.resumenFormsYApps.adhesionesConseguidasHoy)
                    )
                  }
                  className="px-2.5 py-1.5 rounded bg-[#262626] text-[#FBF165] text-xs font-bold"
                >
                  {copiedId === 'forms-adh-hoy' ? '¡Copiado!' : 'Copiar N°'}
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#22ABFF] text-white border-2 border-[#262626] flex items-center justify-between">
                <div>
                  <div className="text-xs font-extrabold uppercase">
                    Adhesiones acumuladas en planilla
                  </div>
                  <div className="text-3xl font-black">
                    {panel.resumenFormsYApps.adhesionesTotalesAcumuladas}
                  </div>
                </div>
                <CheckCircle2 className="w-8 h-8 opacity-90" />
              </div>
            </div>
          </div>

          {/* Bloque 2: Para cargar en la App de Adhesiones Conseguidas */}
          <div className="bg-white rounded-xl border-2 border-[#262626] p-4 shadow-[2px_2px_0px_#262626]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <span className="bg-[#FBF165] text-[#262626] font-black text-xs px-2 py-0.5 uppercase">
                  2. PARA CARGAR EN LA APP DE ADHESIONES
                </span>
                <h3 className="text-base font-black text-[#262626] mt-1">
                  Datos de las personas que adhirieron (copiables en 1 clic)
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {panel.resumenFormsYApps.adhesionesHoyDetalle.map((adh) => (
                <div
                  key={adh.id}
                  className="p-3 rounded-lg bg-[#F7F6F0] border border-stone-300 flex items-center justify-between gap-2"
                >
                  <div className="text-xs space-y-0.5">
                    <div className="font-black text-[#262626]">
                      #{adh.id} · {adh.nombre}
                    </div>
                    <div className="text-stone-600 font-semibold">
                      {adh.barrio} · {adh.direccion} · <span className="font-mono">{adh.telRaw}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyText(`adh-nom-${adh.id}`, adh.nombre)}
                      className="px-2 py-1 rounded bg-white border border-stone-300 text-[11px] font-bold text-[#262626] hover:bg-stone-100"
                    >
                      {copiedId === `adh-nom-${adh.id}` ? '✓ Nombre' : 'Copiar Nombre'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyText(`adh-tel-${adh.id}`, adh.telRaw)}
                      className="px-2 py-1 rounded bg-[#262626] text-[#FBF165] text-[11px] font-bold"
                    >
                      {copiedId === `adh-tel-${adh.id}` ? '✓ Tel' : 'Copiar Tel'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bloque 3: Para marcar en la App de Estatus de cada persona con la que hablaste */}
          <div className="bg-white rounded-xl border-2 border-[#262626] p-4 shadow-[2px_2px_0px_#262626]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <span className="bg-[#262626] text-[#FBF165] font-black text-xs px-2 py-0.5 uppercase">
                  3. PARA MARCAR EN LA APP DE ESTATUS ({panel.resumenFormsYApps.estatusPersonasHabladasHoy.length})
                </span>
                <h3 className="text-base font-black text-[#262626] mt-1">
                  Estatus de cada persona con la que hablaste hoy (DNI CABA, N° inválido, No vive acá, Confirmado, Adhirió)
                </h3>
              </div>
            </div>

            {/* Píldoras de conteo por estatus */}
            <div className="flex flex-wrap gap-2 mb-3">
              {(Object.entries(panel.resumenFormsYApps.conteoPorEstatusHoy) as [EstatusReporteApp, number][]).map(
                ([est, count]) => (
                  <div
                    key={est}
                    className="px-2.5 py-1 rounded-lg bg-[#F7F6F0] border border-stone-300 text-xs font-extrabold text-[#262626]"
                  >
                    {est}: <span className="font-black text-[#22ABFF]">{count}</span>
                  </div>
                )
              )}
            </div>

            {panel.resumenFormsYApps.estatusPersonasHabladasHoy.length === 0 ? (
              <div className="p-4 rounded-lg bg-[#F7F6F0] text-xs font-semibold text-stone-600">
                A medida que envíes mensajes o marques respuestas hoy, acá aparecerá automáticamente cada persona con su estatus listo para pasar a la App.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-[#262626] text-[#262626] font-black uppercase">
                      <th className="py-2 px-2"># / Nombre</th>
                      <th className="py-2 px-2">Teléfono</th>
                      <th className="py-2 px-2">Barrio / Dirección</th>
                      <th className="py-2 px-2">Estatus para marcar en la App</th>
                      <th className="py-2 px-2">Cambiar rápido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {panel.resumenFormsYApps.estatusPersonasHabladasHoy.map((item) => (
                      <tr key={item.contactId} className="hover:bg-[#F7F6F0]">
                        <td className="py-2 px-2 font-bold text-[#262626]">
                          #{item.contactId} · {item.nombre}
                        </td>
                        <td className="py-2 px-2 font-mono text-stone-700">{item.telRaw}</td>
                        <td className="py-2 px-2 text-stone-700">
                          {item.barrio} ({item.direccion})
                        </td>
                        <td className="py-2 px-2">
                          <span className="font-extrabold px-2 py-0.5 rounded bg-[#FBF165] text-[#262626] border border-[#262626]">
                            {item.estatusApp}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onQuickUpdateContact(
                                  item.contactId,
                                  { rsp: 'Sí', adhirio: 'Sí', estadoFlujo: 'YA_ADHIRIO_FIRMA_OK' },
                                  'Adhirió desde tabla estatus hoy'
                                )
                              }
                              className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold"
                            >
                              Adhirió
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onQuickUpdateContact(
                                  item.contactId,
                                  {
                                    rsp: 'Sí',
                                    adhirio: 'No',
                                    estadoFlujo: 'SIN_DNI_CABA_PEDIR_REFERIDOS',
                                    comentario: 'Sin DNI en CABA',
                                  },
                                  'Sin DNI CABA desde tabla estatus hoy'
                                )
                              }
                              className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 text-[10px] font-bold"
                            >
                              Sin DNI CABA
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onQuickUpdateContact(
                                  item.contactId,
                                  {
                                    rsp: 'Sí',
                                    adhirio: 'No',
                                    estadoFlujo: 'DESCARTADO_O_BAJA',
                                    comentario: 'No vive en CABA',
                                  },
                                  'No vive en CABA desde tabla estatus hoy'
                                )
                              }
                              className="px-1.5 py-0.5 rounded bg-orange-200 text-orange-950 text-[10px] font-bold"
                            >
                              No vive acá
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onQuickUpdateContact(
                                  item.contactId,
                                  {
                                    rsp: 'No',
                                    adhirio: 'No',
                                    estadoFlujo: 'DESCARTADO_O_BAJA',
                                    comentario: 'Número inválido / No existe en WhatsApp',
                                  },
                                  'N° inválido desde tabla estatus hoy'
                                )
                              }
                              className="px-1.5 py-0.5 rounded bg-rose-200 text-rose-950 text-[10px] font-bold"
                            >
                              N° inválido
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTENIDO DE PESTAÑA 3: EXPLICACIÓN Y CONTROL DEL MÉTODO HÍBRIDO CAFÉ HUB + SATÉLITES */}
      {subTab === 'metodo_cafe_hub' && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-xl border-2 border-[#262626] p-4 shadow-[2px_2px_0px_#262626] space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-[#262626] text-[#FBF165] font-black text-xs px-2 py-0.5">
                ESTRATEGIA RECOMENDADA E IMPLEMENTADA
              </span>
              <span className="bg-[#22ABFF] text-white font-extrabold text-xs px-2 py-0.5">
                {panel.recomendacionEstrategiaCafeHub.titulo}
              </span>
            </div>

            <p className="text-xs sm:text-sm font-medium text-[#262626] leading-relaxed">
              {panel.recomendacionEstrategiaCafeHub.explicacionCorta}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-[#F7F6F0] border-2 border-[#262626]">
                <span className="bg-[#262626] text-[#FBF165] font-black text-xs px-1.5 py-0.5">
                  1. NO ENFRIAR RESPUESTAS
                </span>
                <p className="text-xs font-semibold text-stone-700 mt-1.5">
                  Si esperás a acumular 8 o 10 direcciones en un barrio antes de proponer un café, quienes te respondieron el lunes se enfrían para el jueves. Con un umbral mínimo de <strong>≥ 2 vecinos a ≤ 12 min a pie</strong> en la misma franja, la app ya activa automáticamente el Café de Especialidad más concéntrico.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#F7F6F0] border-2 border-[#262626]">
                <span className="bg-[#22ABFF] text-white font-black text-xs px-1.5 py-0.5">
                  2. PROPUESTA DOBLE EN 1 MENSAJE
                </span>
                <p className="text-xs font-semibold text-stone-700 mt-1.5">
                  En la Etapa 4 le ofrecés ambas opciones juntas: <em>"Voy a estar en el café X (a tantos minutos de tu esquina) en tal franja, o al terminar paso 2 minutos por tu puerta"</em>. Quien prefiere acercarse al café te ahorra traslado, y quien prefiere en su puerta queda enganchado como parada satélite antes o después del café.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#FBF165] border-2 border-[#262626]">
                <span className="bg-[#262626] text-white font-black text-xs px-1.5 py-0.5">
                  3. ESTADO ACTUAL EN TU BASE
                </span>
                <div className="mt-2 space-y-1 text-xs font-extrabold text-[#262626]">
                  <div>• Bloques con Café activo: {panel.recomendacionEstrategiaCafeHub.clustersActivosHoy}</div>
                  <div>• Vecinos agrupados en Café: {panel.recomendacionEstrategiaCafeHub.contactosEnClusters}</div>
                  <div>• Visitas Puerta a Puerta: {panel.recomendacionEstrategiaCafeHub.contactosPuertaAPuerta}</div>
                </div>
                <div className="flex gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => onNavigateToStep('2_corte')}
                    className="px-2.5 py-1 rounded bg-[#262626] text-[#FBF165] text-xs font-black"
                  >
                    Ver Bloques en Paso 2
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateToStep('3_mapa_ruta')}
                    className="px-2.5 py-1 rounded bg-white text-[#262626] border border-[#262626] text-xs font-black"
                  >
                    Ver Mapa y Cafés en Paso 3
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
