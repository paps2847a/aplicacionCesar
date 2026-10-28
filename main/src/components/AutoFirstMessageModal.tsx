import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Coffee,
  Copy,
  Download,
  FileSpreadsheet,
  Flame,
  HelpCircle,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { WhatsAppWebAutomationPanel } from './WhatsAppWebAutomationPanel';
import {
  AutoFirstMessageCampaign,
  AutoFirstMessageConfig,
  AutoFirstMessageQueueItem,
  Contact,
  ModoColaAutomatizacionWA,
  NivelWarmupWA,
  ResultadoEnvioAuto,
  VoiceProfile,
} from '../types';
import {
  TOPE_MAXIMO_ANTI_BLOQUEO_WA,
  exportarReporteAuditoriaAutoWA,
  generarColaEnvioAutomaticoPrimerContacto,
  generarScriptPythonAutomatizador,
  obtenerRangoWarmup,
  sortearCupoSeguroAntiBloqueo,
} from '../utils/logic';

interface AutoFirstMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  voiceProfile: VoiceProfile;
  barriosDisponibles: string[];
  sheetUrlOrId: string;
  appsScriptUrl: string;
  onApplyItemResult: (
    contactId: string,
    telefonoNorm: string,
    resultado: ResultadoEnvioAuto,
    detalle: string,
    fechaHoraISO?: string
  ) => void;
  onApplyBatchResults: (
    items: {
      contactId: string;
      telefonoNorm: string;
      resultado: ResultadoEnvioAuto;
      detalleResultado: string;
      fechaHoraResultadoISO?: string;
    }[]
  ) => void;
  onCleanFalseErrors?: () => void;
  initialModoCola?: ModoColaAutomatizacionWA;
}

export const AutoFirstMessageModal: React.FC<AutoFirstMessageModalProps> = ({
  isOpen,
  onClose,
  contacts,
  voiceProfile,
  barriosDisponibles,
  sheetUrlOrId,
  appsScriptUrl,
  onApplyItemResult,
  onApplyBatchResults,
  onCleanFalseErrors,
  initialModoCola = 'PRIMER_CONTACTO',
}) => {
  const [activeTab, setActiveTab] = useState<
    'config_cola' | 'whatsapp_web_directo' | 'monitor_resultados'
  >('config_cola');

  const [config, setConfig] = useState<AutoFirstMessageConfig>(() => {
    const cupoInicial = sortearCupoSeguroAntiBloqueo(7, 10);
    return {
      horaInicio: '10:30',
      horaVentanaInicio: '09:30',
      horaVentanaFin: '19:00',
      nivelWarmup: 'DIA_1_MAX_10',
      minCupo: 7,
      maxCupo: 10,
      cupoSorteado: cupoInicial,
      minIntervaloSeg: 65,
      maxIntervaloSeg: 145,
      lotePausaCafeCada: 8,
      minPausaCafeMinutos: 12,
      maxPausaCafeMinutos: 22,
      pausaExtraCada10Seg: 900,
      incluirOptOutBaja: false,
      modoRompehieloCorto: true,
      soloNumerosArgentina: true,
      usarVariabilidadIAGemini: true,
      barrioFiltro: 'Todos',
      modoCola: initialModoCola,
    };
  });

  useEffect(() => {
    if (isOpen && initialModoCola && config.modoCola !== initialModoCola) {
      handleRegenerarCola({ modoCola: initialModoCola });
    }
  }, [initialModoCola, isOpen]);

  const [semillaSorteo, setSemillaSorteo] = useState<number>(0);

  const [campaign, setCampaign] = useState<AutoFirstMessageCampaign>(() =>
    generarColaEnvioAutomaticoPrimerContacto(contacts, config, voiceProfile)
  );

  const [filtroResultado, setFiltroResultado] = useState<'TODOS' | ResultadoEnvioAuto>('TODOS');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [rewritingOrder, setRewritingOrder] = useState<number | null>(null);
  const [rewritingAllIA, setRewritingAllIA] = useState(false);
  const [pollingActive, setPollingActive] = useState(true);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [expandedItemOrder, setExpandedItemOrder] = useState<number | null>(1);

  // Mantener la cola sincronizada cuando se actualiza la lista de contactos o se abre el modal
  useEffect(() => {
    setCampaign((prev) => {
      const recienCalculada = generarColaEnvioAutomaticoPrimerContacto(
        contacts,
        { ...config, semillaSorteo },
        voiceProfile
      );
      if (prev.items.length === 0) return recienCalculada;
      const mapaResultadosPrevios = new Map(
        prev.items
          .filter((it) => it.resultado && it.resultado !== 'PENDIENTE')
          .map((it) => [String(it.contactId), it])
      );
      if (mapaResultadosPrevios.size === 0) {
        return recienCalculada;
      }
      return {
        ...recienCalculada,
        items: recienCalculada.items.map((it) => {
          const prevIt = mapaResultadosPrevios.get(String(it.contactId));
          return prevIt
            ? {
                ...it,
                resultado: prevIt.resultado,
                detalleResultado: prevIt.detalleResultado,
                fechaHoraResultadoISO: prevIt.fechaHoraResultadoISO,
              }
            : it;
        }),
      };
    });
  }, [contacts, isOpen]);

  // Recalcular campaña cuando el usuario cambia parámetros clave
  const handleRegenerarCola = (
    overrideConfig?: Partial<AutoFirstMessageConfig>,
    overrideSemilla?: number
  ) => {
    const nextSemilla = overrideSemilla ?? semillaSorteo;
    const nextCfg: AutoFirstMessageConfig = {
      ...config,
      ...overrideConfig,
      maxCupo: Math.min(TOPE_MAXIMO_ANTI_BLOQUEO_WA, overrideConfig?.maxCupo ?? config.maxCupo),
      cupoSorteado: Math.min(
        TOPE_MAXIMO_ANTI_BLOQUEO_WA,
        overrideConfig?.cupoSorteado ?? config.cupoSorteado
      ),
    };
    setConfig(nextCfg);
    const nueva = generarColaEnvioAutomaticoPrimerContacto(
      contacts,
      { ...nextCfg, semillaSorteo: nextSemilla },
      voiceProfile
    );
    setCampaign(nueva);

    // Sincronizar cola con el servidor local para que Python pueda reportar sobre ella
    fetch('/api/auto-wa/campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign: nueva }),
    }).catch(() => {});

    return nueva;
  };

  // Cambiar nivel de calentamiento (Warm-up Día 1 a Día 5+)
  const handleSelectWarmup = (nivel: NivelWarmupWA) => {
    const rango = obtenerRangoWarmup(nivel);
    const nuevoSorteo = sortearCupoSeguroAntiBloqueo(
      rango.minCupo,
      rango.maxCupo,
      Math.random,
      config.cupoSorteado
    );
    const nextSemilla = semillaSorteo + 1;
    setSemillaSorteo(nextSemilla);
    handleRegenerarCola(
      {
        nivelWarmup: nivel,
        minCupo: rango.minCupo,
        maxCupo: rango.maxCupo,
        cupoSorteado: nuevoSorteo,
      },
      nextSemilla
    );
    setStatusNotice(
      `Nivel Warm-up actualizado: ${rango.etiqueta}. Cupo aleatorio sorteado: ${nuevoSorteo} mensajes (< 45).`
    );
  };

  const handleSortearNuevoCupo = () => {
    const nuevoCupo = sortearCupoSeguroAntiBloqueo(
      config.minCupo,
      config.maxCupo,
      Math.random,
      config.cupoSorteado
    );
    const nextSemilla = semillaSorteo + 1;
    setSemillaSorteo(nextSemilla);
    const nuevaCamp = handleRegenerarCola({ cupoSorteado: nuevoCupo }, nextSemilla);
    const primeroTxt = nuevaCamp.items[0]
      ? ` · Inicia con #${nuevaCamp.items[0].contactId} ${nuevaCamp.items[0].nombre}`
      : '';
    setStatusNotice(
      `🎲 Nuevo cupo anti-bloqueo sorteado: ${nuevoCupo} primeros mensajes (de ${nuevaCamp.totalElegiblesEnPadron} elegibles sin 1er contacto)${primeroTxt}.`
    );
  };

  // Polling ligero contra /api/auto-wa/status para recibir reportes en vivo desde el script Python
  useEffect(() => {
    if (!isOpen || !pollingActive) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/auto-wa/status');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.reports) && data.reports.length > 0) {
          const nuevosImpactos: {
            contactId: string;
            telefonoNorm: string;
            resultado: ResultadoEnvioAuto;
            detalleResultado: string;
            fechaHoraResultadoISO?: string;
          }[] = [];

          setCampaign((prev) => {
            let huboCambio = false;
            const nextItems = prev.items.map((item) => {
              const rep = data.reports.find(
                (r: { contactId?: string; telefonoNorm?: string }) =>
                  (r.contactId && String(r.contactId) === String(item.contactId)) ||
                  (r.telefonoNorm && String(r.telefonoNorm) === String(item.telefonoNorm))
              );
              if (rep && rep.resultado !== item.resultado) {
                huboCambio = true;
                nuevosImpactos.push({
                  contactId: item.contactId,
                  telefonoNorm: item.telefonoNorm,
                  resultado: rep.resultado,
                  detalleResultado: rep.detalleResultado || '',
                  fechaHoraResultadoISO: rep.fechaHoraResultadoISO,
                });
                return {
                  ...item,
                  resultado: rep.resultado as ResultadoEnvioAuto,
                  detalleResultado: rep.detalleResultado || item.detalleResultado,
                  fechaHoraResultadoISO: rep.fechaHoraResultadoISO,
                  sincronizadoSheets: Boolean(rep.sincronizadoSheets),
                };
              }
              return item;
            });
            return huboCambio ? { ...prev, items: nextItems } : prev;
          });

          if (nuevosImpactos.length > 0) {
            onApplyBatchResults(nuevosImpactos);
          }
        }
      } catch {
        // Silencioso en polling
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [isOpen, pollingActive, onApplyBatchResults]);

  // Reescribir una fila con Gemini AI (/api/gemini/variante-primer-contacto)
  const handleReescribirConGemini = async (item: AutoFirstMessageQueueItem) => {
    setRewritingOrder(item.orden);
    try {
      const res = await fetch('/api/gemini/variante-primer-contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: item.primerNombre || item.nombre,
          sinNombre: item.sinNombre,
          barrio: item.barrio,
          mensajeBase: item.mensajePrimerContacto,
          iteracion: item.orden + Math.floor(Math.random() * 100),
          incluirOptOutBaja: config.incluirOptOutBaja,
        }),
      });
      const data = await res.json();
      if (data.ok && data.mensaje) {
        setCampaign((prev) => ({
          ...prev,
          items: prev.items.map((it) =>
            it.orden === item.orden
              ? {
                  ...it,
                  mensajePrimerContacto: data.mensaje,
                  segundosEscrituraSimulada: Math.max(5, Math.round(data.mensaje.length / 17)),
                }
              : it
          ),
        }));
        setStatusNotice(`Variante única generada con IA Gemini para #${item.contactId} (${item.nombre}).`);
      }
    } catch {
      setStatusNotice('Se mantuvo la variante polimórfica Spintax local.');
    } finally {
      setRewritingOrder(null);
    }
  };

  // Reescribir las primeras N variantes con IA Gemini
  const handleReescribirLoteIA = async () => {
    setRewritingAllIA(true);
    try {
      const updatedItems = [...campaign.items];
      const toProcess = Math.min(updatedItems.length, 8);
      for (let i = 0; i < toProcess; i++) {
        const it = updatedItems[i];
        try {
          const res = await fetch('/api/gemini/variante-primer-contacto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: it.primerNombre || it.nombre,
              sinNombre: it.sinNombre,
              barrio: it.barrio,
              mensajeBase: it.mensajePrimerContacto,
              iteracion: i + 1 + Math.floor(Math.random() * 50),
              incluirOptOutBaja: config.incluirOptOutBaja,
            }),
          });
          const data = await res.json();
          if (data.ok && data.mensaje) {
            updatedItems[i] = {
              ...it,
              mensajePrimerContacto: data.mensaje,
              segundosEscrituraSimulada: Math.max(5, Math.round(data.mensaje.length / 17)),
            };
          }
        } catch {
          // Seguir con el siguiente
        }
      }
      setCampaign((prev) => ({ ...prev, items: updatedItems }));
      setStatusNotice(
        'Variantes polimórficas enriquecidas con IA Gemini (saludos variados, cero enlaces y cláusula Baja).'
      );
    } finally {
      setRewritingAllIA(false);
    }
  };

  // Marcar resultado manual o desde prueba rápida y actualizar App + Google Sheets
  const handleMarcarResultadoItem = (
    item: AutoFirstMessageQueueItem,
    resultado: ResultadoEnvioAuto,
    detalleCustom?: string
  ) => {
    const ahoraISO = new Date().toISOString();
    const detalle =
      detalleCustom ||
      (resultado === 'ENVIADO_OK'
        ? 'Primer mensaje enviado con éxito (Estado actualizado en App y Sheets)'
        : resultado === 'NUMERO_INEXISTENTE'
        ? 'El número no existe en WhatsApp (Marcado como Descartado / N° inexistente)'
        : resultado === 'ERROR_ENVIO'
        ? 'No se pudo enviar (Queda pendiente para próximo intento)'
        : 'En cola');

    setCampaign((prev) => ({
      ...prev,
      items: prev.items.map((it) =>
        it.orden === item.orden
          ? {
              ...it,
              resultado,
              detalleResultado: detalle,
              fechaHoraResultadoISO: ahoraISO,
              sincronizadoSheets: true,
            }
          : it
      ),
    }));

    onApplyItemResult(item.contactId, item.telefonoNorm, resultado, detalle, ahoraISO);

    // También registrar en el servidor local
    fetch('/api/auto-wa/report-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: campaign.campaignId,
        contactId: item.contactId,
        telefonoNorm: item.telefonoNorm,
        nombre: item.nombre,
        barrio: item.barrio,
        resultado,
        detalleResultado: detalle,
        fechaHoraResultadoISO: ahoraISO,
        appsScriptUrl,
      }),
    }).catch(() => {});

    setStatusNotice(
      `Contacto #${item.contactId} (${item.nombre}) actualizado a ${resultado} en la App y Google Sheets.`
    );
  };

  // Descargar script Python preconfigurado
  const handleDescargarScriptPython = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const codigoPy = generarScriptPythonAutomatizador(
      campaign,
      origin,
      sheetUrlOrId,
      appsScriptUrl
    );
    const blob = new Blob([codigoPy], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'automatizador_wa_popurri.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusNotice(
      'Script "automatizador_wa_popurri.py" descargado con las 7 capas anti-bloqueo y tu cola (< 45 msjs) preconfigurada.'
    );
  };

  // Descargar cola JSON
  const handleDescargarColaJSON = () => {
    const jsonStr = JSON.stringify(campaign, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cola_primer_contacto_popurri.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Descargar auditoría CSV para Excel
  const handleDescargarAuditoriaCSV = () => {
    const csv = exportarReporteAuditoriaAutoWA(campaign);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_auditoria_1er_contacto_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Importar reporte_envios_popurri.json generado por el script de Python
  const handleImportarReportePythonJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const lista = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];
      if (lista.length === 0) {
        setStatusNotice('El archivo JSON no contiene ítems de reporte válidos.');
        return;
      }

      const impactos: {
        contactId: string;
        telefonoNorm: string;
        resultado: ResultadoEnvioAuto;
        detalleResultado: string;
        fechaHoraResultadoISO?: string;
      }[] = [];

      setCampaign((prev) => {
        const nextItems = prev.items.map((it) => {
          const found = lista.find(
            (r: { contactId?: string; telefonoNorm?: string }) =>
              (r.contactId && String(r.contactId) === String(it.contactId)) ||
              (r.telefonoNorm && String(r.telefonoNorm) === String(it.telefonoNorm))
          );
          if (found && found.resultado) {
            impactos.push({
              contactId: it.contactId,
              telefonoNorm: it.telefonoNorm,
              resultado: found.resultado as ResultadoEnvioAuto,
              detalleResultado: found.detalleResultado || '',
              fechaHoraResultadoISO: found.fechaHoraResultadoISO,
            });
            return {
              ...it,
              resultado: found.resultado as ResultadoEnvioAuto,
              detalleResultado: found.detalleResultado || it.detalleResultado,
              fechaHoraResultadoISO: found.fechaHoraResultadoISO,
              sincronizadoSheets: true,
            };
          }
          return it;
        });
        return { ...prev, items: nextItems };
      });

      if (impactos.length > 0) {
        onApplyBatchResults(impactos);
        setStatusNotice(
          `¡Reporte Python importado con éxito! Se actualizaron ${impactos.length} contactos en la App y Google Sheets.`
        );
        setActiveTab('monitor_resultados');
      }
    } catch {
      setStatusNotice('No se pudo leer el archivo JSON de reporte. Verificá que sea reporte_envios_popurri.json.');
    } finally {
      e.target.value = '';
    }
  };

  const copyCommand = (cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const stats = useMemo(() => {
    const total = campaign.items.length;
    const enviadosOk = campaign.items.filter((i) => i.resultado === 'ENVIADO_OK').length;
    const inexistentes = campaign.items.filter((i) => i.resultado === 'NUMERO_INEXISTENTE').length;
    const errores = campaign.items.filter((i) => i.resultado === 'ERROR_ENVIO').length;
    const pendientes = campaign.items.filter((i) => i.resultado === 'PENDIENTE').length;
    const pausasCafe = campaign.items.filter((i) => i.esPausaCafeAntes).length;
    const ultimaHora = campaign.items[campaign.items.length - 1]?.horaProgramada || config.horaInicio;
    return { total, enviadosOk, inexistentes, errores, pendientes, pausasCafe, ultimaHora };
  }, [campaign.items, config.horaInicio]);

  const itemsFiltrados = useMemo(() => {
    if (filtroResultado === 'TODOS') return campaign.items;
    return campaign.items.filter((i) => i.resultado === filtroResultado);
  }, [campaign.items, filtroResultado]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-2 sm:p-3 backdrop-blur-sm overflow-y-auto">
      <div className="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-slate-700 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-2.5 border-b border-slate-800 bg-slate-900 px-3.5 sm:px-6 py-3 sm:py-4 text-white">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 font-black shadow">
              <Bot className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-sm sm:text-lg font-extrabold tracking-tight">
                  Automatizador Multi-Etapa Anti-Bloqueo (Voz Real de César)
                </h2>
                <span className="rounded-md bg-emerald-500/20 border border-emerald-400/40 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-emerald-300">
                  &lt; 45 msjs ({campaign.items.length} en tanda)
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 line-clamp-2 sm:line-clamp-none mt-0.5">
                Automatiza el envío de <strong>1° mensajes en frío (&lt;45/día)</strong>, <strong>recordatorios de la mañana</strong> antes de salir al recorrido/café, <strong>seguimientos 24h/48h/baja</strong> y <strong>agradecimientos post-adhesión</strong> con validador anti-pelones de fechas.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 sm:p-2 text-slate-300 hover:bg-slate-700 hover:text-white shrink-0"
            title="Cerrar"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Selector de Etapa a Automatizar */}
        <div className="bg-[#F7F6F0] border-b border-slate-300 px-3 sm:px-6 py-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-[#262626] uppercase">
            Etapa de la cola:
          </span>
          {(
            [
              {
                id: 'PRIMER_CONTACTO',
                label: '1. Primeros Mensajes (<45/día)',
              },
              {
                id: 'RECORDATORIO_MANIANA_HOY',
                label: '2. Recordatorios de la Mañana (Encuentros/Café Hoy)',
              },
              {
                id: 'SEGUIMIENTO_24H_48H_BAJA',
                label: '3. Seguimientos 24h / 48h y Baja Amable',
              },
              {
                id: 'AGRADECIMIENTO_POST_FIRMA',
                label: '4. Agradecimientos Post-Adhesión',
              },
            ] as { id: ModoColaAutomatizacionWA; label: string }[]
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleRegenerarCola({ modoCola: m.id })}
              className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition border ${
                (config.modoCola || 'PRIMER_CONTACTO') === m.id
                  ? 'bg-[#262626] text-[#FBF165] border-[#262626]'
                  : 'bg-white text-[#262626] border-slate-300 hover:bg-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Sub-navegación de pestañas */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100 px-3 sm:px-6 py-2">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <button
              onClick={() => setActiveTab('config_cola')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-extrabold transition ${
                activeTab === 'config_cola'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>1. Configurar Cola ({campaign.items.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('whatsapp_web_directo')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-extrabold transition ${
                activeTab === 'whatsapp_web_directo'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100 border border-emerald-300'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>2. ⚡ WhatsApp Web Directo</span>
            </button>
            <button
              onClick={() => setActiveTab('monitor_resultados')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-extrabold transition ${
                activeTab === 'monitor_resultados'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>
                3. Auditoría: OK ({stats.enviadosOk}) · Inexist. ({stats.inexistentes})
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('whatsapp_web_directo')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-black text-white shadow-sm hover:bg-emerald-500 transition"
            >
              <Smartphone className="h-3.5 w-3.5 shrink-0" />
              <span>Ejecutar con WhatsApp Web</span>
            </button>
          </div>
        </div>
        </div>

        {/* Banner de aviso si existe */}
        {statusNotice && (
          <div className="flex items-center justify-between bg-indigo-950 px-4 sm:px-6 py-2 text-xs font-semibold text-indigo-100">
            <span>{statusNotice}</span>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-indigo-300 hover:text-white ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Contenido principal desplazable */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-5 sm:space-y-6">
          {/* TAB 1: CONFIGURACIÓN DE LAS 7 CAPAS ANTI-BLOQUEO Y COLA */}
          {activeTab === 'config_cola' && (
            <>
              {/* Información de Automatización Nativa WhatsApp Web */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 space-y-2 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-black text-slate-900">
                        ⚡ Automatización Integrada con WhatsApp Web (whatsapp-web.js)
                      </h3>
                      <p className="text-[11px] text-slate-600 font-medium">
                        Envío directo en segundo plano con simulación de tipeo humano, pausas automáticas de café y registro en SQLite.
                      </p>
                    </div>
                  </div>
                  {onCleanFalseErrors && (
                    <button
                      type="button"
                      onClick={() => {
                        onCleanFalseErrors();
                        handleRegenerarCola();
                        setStatusNotice(
                          'Se verificaron y limpiaron los estados de la cola de contactos.'
                        );
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-[11px] font-extrabold shrink-0 flex items-center gap-1.5 shadow-2xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Revalidar cola
                    </button>
                  )}
                </div>
              </div>

              {/* Resumen de las 8 Capas Stealth v2.0 Anti-Bloqueo de Meta activas */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-700" />
                    <h3 className="text-sm font-black text-emerald-950">
                      8 Capas Stealth v2.0 Anti-Restricción de Dispositivos Vinculados Activas
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-emerald-800">
                    Elegibles (+54 CABA) sin 1er contacto: {campaign.totalElegiblesEnBase} personas · Seleccionados hoy: {campaign.items.length} (&lt; 45)
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 text-xs">
                  <div className="rounded-lg bg-white p-2.5 border border-emerald-200">
                    <p className="font-extrabold text-slate-900">1. Navegación SPA (Cero Recarga)</p>
                    <p className="text-slate-600 mt-0.5">
                      Abre cada chat desde el router interno DOM sin usar <code>page.goto</code> ni cortar el WebSocket.
                    </p>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-emerald-200">
                    <p className="font-extrabold text-slate-900">2. Rompehielo Corto (&lt; 210 chars)</p>
                    <p className="text-slate-600 mt-0.5">
                      Pregunta breve y 100% humana (sin pie robótico &quot;respondé Baja&quot;) para lograr respuesta rápida.
                    </p>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-emerald-200">
                    <p className="font-extrabold text-slate-900">3. Chrome Real + Circuit Breaker</p>
                    <p className="text-slate-600 mt-0.5">
                      Oculta <code>navigator.webdriver</code> y frena en seco si WhatsApp cierra la sesión vinculada.
                    </p>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-emerald-200">
                    <p className="font-extrabold text-slate-900">4. Guardia Horaria + Sólo +54</p>
                    <p className="text-slate-600 mt-0.5">
                      Bloquea envíos de madrugada (&lt; 09:00 AM) y salta números extranjeros (+34) en frío.
                    </p>
                  </div>
                </div>
              </div>

              {/* Panel de controles de programación */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Bloque A: Horario de inicio y Ventana Comercial */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-800" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      A. Hora de Inicio y Ventana Diurna Segura
                    </h4>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Hora exacta para empezar (recomendado &gt;= 09:30):
                    </label>
                    <input
                      type="time"
                      value={config.horaInicio}
                      onChange={(e) => handleRegenerarCola({ horaInicio: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Apertura diurna (&gt;=09:00):
                      </label>
                      <input
                        type="time"
                        value={config.horaVentanaInicio}
                        onChange={(e) => handleRegenerarCola({ horaVentanaInicio: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Corte nocturno (Pausa):
                      </label>
                      <input
                        type="time"
                        value={config.horaVentanaFin}
                        onChange={(e) => handleRegenerarCola({ horaVentanaFin: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    <strong>Protección anti-madrugada activa:</strong> El script nunca enviará antes de las 09:00 AM. Fin estimado hoy: <strong>{stats.ultimaHora}</strong>.
                  </p>
                </div>

                {/* Bloque B: Calentamiento (Warm-up) y Sorteo < 45 mensajes */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4 text-amber-600" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        B. Calentamiento (Warm-up) y Cupo &lt; 45
                      </h4>
                    </div>
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-900">
                      Cupo hoy: {config.cupoSorteado} msjs
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Etapa de calentamiento de tu número:
                    </label>
                    <select
                      value={config.nivelWarmup}
                      onChange={(e) => handleSelectWarmup(e.target.value as NivelWarmupWA)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-900"
                    >
                      <option value="DIA_1_MAX_10">Día 1 (Post-restricción / Inicial) — 7 a 10 msjs</option>
                      <option value="DIA_2_MAX_15">Día 2 — Máximo 15 mensajes (11 a 15)</option>
                      <option value="DIA_3_MAX_25">Día 3 — Máximo 25 mensajes (18 a 25)</option>
                      <option value="DIA_4_MAX_35">Día 4 — Máximo 35 mensajes (26 a 35)</option>
                      <option value="DIA_5_MADURO_MENOS_45">
                        Día 5+ (Cuenta activa) — Aleatorio siempre &lt; 45 (28 a 44)
                      </option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSortearNuevoCupo}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-extrabold text-white hover:bg-slate-800 transition"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
                      Sortear Nuevo Cupo Aleatorio (&lt; 45)
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Filtrar cola de 1er mensaje por barrio:
                    </label>
                    <select
                      value={config.barrioFiltro}
                      onChange={(e) => handleRegenerarCola({ barrioFiltro: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      <option value="Todos">Todos los barrios CABA</option>
                      {barriosDisponibles.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Bloque C: Pausas Humanas No Lineales, Rompehielo Corto y Filtro +54 */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-amber-700" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      C. Pausas y Protección Stealth v2.0
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Pausa corta mín (seg):
                      </label>
                      <input
                        type="number"
                        min={45}
                        max={180}
                        value={config.minIntervaloSeg}
                        onChange={(e) =>
                          handleRegenerarCola({ minIntervaloSeg: Number(e.target.value) || 65 })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Pausa corta máx (seg):
                      </label>
                      <input
                        type="number"
                        min={60}
                        max={300}
                        value={config.maxIntervaloSeg}
                        onChange={(e) =>
                          handleRegenerarCola({ maxIntervaloSeg: Number(e.target.value) || 145 })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center gap-2 text-xs font-bold text-emerald-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.modoRompehieloCorto !== false}
                        onChange={(e) =>
                          handleRegenerarCola({ modoRompehieloCorto: e.target.checked })
                        }
                        className="rounded border-slate-300 text-emerald-700"
                      />
                      <span>
                        🛡️ Modo Rompehielo Corto (&lt; 210 chars, sin pie de bot) — <strong>Recomendado</strong>
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-emerald-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.soloNumerosArgentina !== false}
                        onChange={(e) =>
                          handleRegenerarCola({ soloNumerosArgentina: e.target.checked })
                        }
                        className="rounded border-slate-300 text-emerald-700"
                      />
                      <span>
                        🇦🇷 Sólo números de Argentina (+54) en lote auto (salta #167 +34 España)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.usarVariabilidadIAGemini}
                        onChange={(e) =>
                          handleRegenerarCola({ usarVariabilidadIAGemini: e.target.checked })
                        }
                        className="rounded border-slate-300 text-slate-900"
                      />
                      Reescribir con IA Gemini en el bucle Python
                    </label>
                  </div>
                </div>
              </div>

              {/* Barra de acciones sobre la cola generada */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold text-slate-900">
                    Cola programada de primeros mensajes: {campaign.items.length} contactos
                  </span>
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                    ☕ {stats.pausasCafe} Pausa(s) de Café incluidas
                  </span>
                  <button
                    onClick={handleReescribirLoteIA}
                    disabled={rewritingAllIA}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {rewritingAllIA ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                    )}
                    Generar nuevas variantes con IA Gemini
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleDescargarColaJSON}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Cola .JSON
                  </button>
                  <button
                    onClick={handleDescargarScriptPython}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-slate-800"
                  >
                    <Terminal className="h-3.5 w-3.5 text-amber-400" />
                    Descargar automatizador_wa_popurri.py
                  </button>
                </div>
              </div>

              {/* Tabla de la cola programada */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-900 text-white text-[11px] uppercase tracking-wider z-10">
                      <tr>
                        <th className="py-2.5 px-3">Orden / Hora</th>
                        <th className="py-2.5 px-3">Contacto (Sólo 1er Msj)</th>
                        <th className="py-2.5 px-3">Intervalo y Escritura Humana</th>
                        <th className="py-2.5 px-3">Variante Polimórfica (Sin links + Baja)</th>
                        <th className="py-2.5 px-3">Estado / Marcar o Probar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {campaign.items.map((item) => {
                        const isExpanded = expandedItemOrder === item.orden;
                        return (
                          <React.Fragment key={`${item.contactId}-${item.orden}`}>
                            {item.esPausaCafeAntes && (
                              <tr className="bg-amber-50/90 border-y border-amber-200">
                                <td colSpan={5} className="py-2 px-4 text-xs font-bold text-amber-900">
                                  ☕ PAUSA DE CAFÉ HUMANA ANTES DEL ENVÍO #{item.orden}: El script descansa{' '}
                                  {Math.round(item.intervaloSegundos / 60)} minutos para simular comportamiento humano orgánico.
                                </td>
                              </tr>
                            )}
                            <tr className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                <div>#{item.orden} · {item.horaProgramada}</div>
                                {item.fueraDeVentanaHoraria && (
                                  <span className="inline-block mt-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-sans font-bold text-rose-800">
                                    Pausa nocturna (&gt;{config.horaVentanaFin})
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">
                                  #{item.contactId} · {item.nombre}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {item.barrio} · {item.telRaw}
                                  {item.sinNombre && (
                                    <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                      Pregunta sutil de nombre activa
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="font-semibold text-slate-800">
                                  {item.orden === 1
                                    ? 'Inicio puntual'
                                    : `+${item.intervaloSegundos}s espera`}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  ⌨️ {item.segundosEscrituraSimulada}s tipeo simulado
                                </div>
                              </td>
                              <td className="py-2.5 px-3 max-w-md">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="rounded bg-slate-100 border border-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                                    Variante #{item.varianteIndice}
                                  </span>
                                  <button
                                    onClick={() =>
                                      setExpandedItemOrder(isExpanded ? null : item.orden)
                                    }
                                    className="text-[11px] font-bold text-indigo-600 hover:underline"
                                  >
                                    {isExpanded ? 'Ocultar texto' : 'Ver / Editar texto único'}
                                  </button>
                                  <button
                                    onClick={() => handleReescribirConGemini(item)}
                                    disabled={rewritingOrder === item.orden}
                                    className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100"
                                    title="Reescribir esta variante con IA Gemini"
                                  >
                                    {rewritingOrder === item.orden ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Sparkles className="h-3 w-3" />
                                    )}
                                    IA
                                  </button>
                                </div>
                                <p className="truncate text-[11px] text-slate-600">
                                  {item.mensajePrimerContacto}
                                </p>
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  {item.resultado === 'ENVIADO_OK' ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-900">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                      Enviado con éxito
                                    </span>
                                  ) : item.resultado === 'NUMERO_INEXISTENTE' ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-900">
                                      <XCircle className="h-3.5 w-3.5 text-rose-600" />
                                      N° WA no existe
                                    </span>
                                  ) : item.resultado === 'ERROR_ENVIO' ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-900">
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                      Falló envío
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                      En cola
                                    </span>
                                  )}

                                  <div className="flex items-center gap-1 ml-1">
                                    <button
                                      onClick={() => handleMarcarResultadoItem(item, 'ENVIADO_OK')}
                                      className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
                                      title="Marcar como Enviado con éxito y actualizar Sheets"
                                    >
                                      ✅ OK
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleMarcarResultadoItem(item, 'NUMERO_INEXISTENTE')
                                      }
                                      className="rounded border border-rose-300 bg-rose-50 px-1.5 py-1 text-[10px] font-bold text-rose-800 hover:bg-rose-100"
                                      title="Marcar que el número de WhatsApp no existe y actualizar Sheets"
                                    >
                                      🚫 No existe
                                    </button>
                                    <button
                                      onClick={() => handleMarcarResultadoItem(item, 'ERROR_ENVIO')}
                                      className="rounded border border-amber-300 bg-amber-50 px-1.5 py-1 text-[10px] font-bold text-amber-900 hover:bg-amber-100"
                                      title="Marcar fallo de envío"
                                    >
                                      ⚠️ Falló
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-slate-50/90">
                                <td colSpan={5} className="p-3">
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                    Texto único de 1er contacto para {item.nombre} (sin URLs + cláusula amigable &quot;Baja&quot;):
                                  </label>
                                  <textarea
                                    rows={4}
                                    value={item.mensajePrimerContacto}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCampaign((prev) => ({
                                        ...prev,
                                        items: prev.items.map((it) =>
                                          it.orden === item.orden
                                            ? { ...it, mensajePrimerContacto: val }
                                            : it
                                        ),
                                      }));
                                    }}
                                    className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-800"
                                  />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: WHATSAPP WEB DIRECTO (whatsapp-web.js) */}
          {activeTab === 'whatsapp_web_directo' && (
            <WhatsAppWebAutomationPanel
              campaign={campaign}
              config={config}
              appsScriptUrl={appsScriptUrl}
              onApplyItemResult={onApplyItemResult}
            />
          )}

          {/* TAB 3: MONITOR DE RESULTADOS Y AUDITORÍA CON GOOGLE SHEETS */}
          {activeTab === 'monitor_resultados' && (
            <div className="space-y-5">
              {/* Tarjetas de estado del lote */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <span className="text-[11px] font-bold uppercase text-slate-500">
                    En Cola Pendientes
                  </span>
                  <div className="text-2xl font-black text-slate-900 mt-1">{stats.pendientes}</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Esperando turno dentro del tope &lt; 45
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <span className="text-[11px] font-bold uppercase text-emerald-800">
                    ✅ Enviados con Éxito
                  </span>
                  <div className="text-2xl font-black text-emerald-900 mt-1">{stats.enviadosOk}</div>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Pasan a &quot;2. 1er contacto enviado&quot; en Sheets
                  </p>
                </div>

                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
                  <span className="text-[11px] font-bold uppercase text-rose-800">
                    🚫 N° WhatsApp No Existe
                  </span>
                  <div className="text-2xl font-black text-rose-900 mt-1">{stats.inexistentes}</div>
                  <p className="text-[11px] text-rose-800 mt-0.5">
                    Pasan a &quot;10. Descartado / N° inexistente&quot; en Sheets
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <span className="text-[11px] font-bold uppercase text-amber-800">
                    ⚠️ No Enviados / Error
                  </span>
                  <div className="text-2xl font-black text-amber-900 mt-1">{stats.errores}</div>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Quedan pendientes para reintentar
                  </p>
                </div>
              </div>

              {/* Barra de importación de reporte Python y descarga Excel */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Filtrar auditoría:</span>
                  {(['TODOS', 'ENVIADO_OK', 'NUMERO_INEXISTENTE', 'ERROR_ENVIO', 'PENDIENTE'] as const).map(
                    (f) => (
                      <button
                        key={f}
                        onClick={() => setFiltroResultado(f)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                          filtroResultado === f
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {f === 'TODOS'
                          ? `Todos (${campaign.items.length})`
                          : f === 'ENVIADO_OK'
                          ? `✅ Enviados OK (${stats.enviadosOk})`
                          : f === 'NUMERO_INEXISTENTE'
                          ? `🚫 N° Inexistente (${stats.inexistentes})`
                          : f === 'ERROR_ENVIO'
                          ? `⚠️ Falló (${stats.errores})`
                          : `Pendientes (${stats.pendientes})`}
                      </button>
                    )
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100 cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    Importar reporte_envios_popurri.json
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportarReportePythonJSON}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={handleDescargarAuditoriaCSV}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Descargar Excel/CSV de Auditoría
                  </button>
                </div>
              </div>

              {/* Tabla de auditoría */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-900 text-white text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Contacto</th>
                        <th className="py-2.5 px-3">Teléfono</th>
                        <th className="py-2.5 px-3">Resultado en WhatsApp</th>
                        <th className="py-2.5 px-3">Impacto en Google Sheets y App</th>
                        <th className="py-2.5 px-3">Cambiar Estado Manual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {itemsFiltrados.map((item) => (
                        <tr key={`audit-${item.contactId}-${item.orden}`} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                            #{item.orden}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">
                              #{item.contactId} · {item.nombre}
                            </div>
                            <div className="text-[11px] text-slate-500">{item.barrio}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">{item.telRaw}</td>
                          <td className="py-2.5 px-3">
                            {item.resultado === 'ENVIADO_OK' && (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                                ✅ ENVIADO CON ÉXITO
                              </span>
                            )}
                            {item.resultado === 'NUMERO_INEXISTENTE' && (
                              <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-900">
                                🚫 NÚMERO NO EXISTE EN WHATSAPP
                              </span>
                            )}
                            {item.resultado === 'ERROR_ENVIO' && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                                ⚠️ ERROR / NO ENVIADO
                              </span>
                            )}
                            {item.resultado === 'PENDIENTE' && (
                              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                ⏳ Pendiente en cola ({item.horaProgramada})
                              </span>
                            )}
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {item.detalleResultado}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {item.resultado === 'ENVIADO_OK' ? (
                              <span className="font-semibold text-emerald-800">
                                Col. H: &quot;2. 1er contacto enviado&quot; · RSP: No
                              </span>
                            ) : item.resultado === 'NUMERO_INEXISTENTE' ? (
                              <span className="font-semibold text-rose-800">
                                Col. H: &quot;10. Descartado / N° inexistente&quot; · Adhirió: No
                              </span>
                            ) : item.resultado === 'ERROR_ENVIO' ? (
                              <span className="font-semibold text-amber-800">
                                Mantiene &quot;1. Enviar 1er msj&quot; para próximo intento
                              </span>
                            ) : (
                              <span className="text-slate-500">Sin cambios aún</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleMarcarResultadoItem(item, 'ENVIADO_OK')}
                                className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
                              >
                                ✅ Enviado OK
                              </button>
                              <button
                                onClick={() => handleMarcarResultadoItem(item, 'NUMERO_INEXISTENTE')}
                                className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-800 hover:bg-rose-100"
                              >
                                🚫 N° Inexistente
                              </button>
                              <button
                                onClick={() => handleMarcarResultadoItem(item, 'ERROR_ENVIO')}
                                className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-900 hover:bg-amber-100"
                              >
                                ⚠️ Falló
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>
              Sincronización en vivo con Python activa · Tope anti-bloqueo bloqueado en &lt; 45 mensajes por tanda
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Cerrar panel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
