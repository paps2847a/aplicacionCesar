import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
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
  Users,
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
    'config_cola' | 'vista_cola' | 'whatsapp_web_directo' | 'monitor_resultados'
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
    const totalEleg = nuevaCamp.totalElegiblesEnBase ?? nuevaCamp.totalElegiblesEnPadron ?? nuevaCamp.items.length;
    setStatusNotice(
      `🎲 Nuevo cupo anti-bloqueo sorteado: ${nuevoCupo} primeros mensajes (de ${totalEleg} elegibles sin 1er contacto)${primeroTxt}.`
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl">
        {/* Header Sereno y Luminoso */}
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm shadow-emerald-500/20 shrink-0">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-slate-900">
                  Campaña de Automatización WhatsApp
                </h2>
                <span className="rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  Tope seguro &lt; 45 msjs/día
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Voz de César · Variabilidad Spintax e IA · Pausas humanas de café · 0 bloqueos
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition shadow-2xs"
            title="Cerrar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selector de Etapa de la Campaña */}
        <div className="border-b border-slate-200/80 bg-slate-50/70 px-6 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 mr-1">
            Etapa:
          </span>
          {(
            [
              {
                id: 'PRIMER_CONTACTO',
                label: '1. Primeros Mensajes (<45/d)',
              },
              {
                id: 'RECORDATORIO_MANIANA_HOY',
                label: '2. Recordatorios de Encuentro',
              },
              {
                id: 'SEGUIMIENTO_24H_48H_BAJA',
                label: '3. Seguimientos 24h / 48h',
              },
              {
                id: 'AGRADECIMIENTO_POST_FIRMA',
                label: '4. Agradecimientos Post-Firma',
              },
            ] as { id: ModoColaAutomatizacionWA; label: string }[]
          ).map((m) => {
            const isSelected = (config.modoCola || 'PRIMER_CONTACTO') === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleRegenerarCola({ modoCola: m.id })}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs font-black'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/70 hover:bg-slate-50'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Sub-navegación de Pestañas Serena */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white px-6 py-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveTab('config_cola')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeTab === 'config_cola'
                  ? 'bg-slate-100 text-slate-900 font-black shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>1. Ajustes Anti-Bloqueo</span>
            </button>

            <button
              onClick={() => setActiveTab('vista_cola')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeTab === 'vista_cola'
                  ? 'bg-slate-100 text-slate-900 font-black shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <span>2. Cola de Contactos ({campaign.items.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('whatsapp_web_directo')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeTab === 'whatsapp_web_directo'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-black shadow-2xs'
                  : 'text-slate-500 hover:text-emerald-700'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
              <span>3. ⚡ WhatsApp Web Directo</span>
            </button>

            <button
              onClick={() => setActiveTab('monitor_resultados')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeTab === 'monitor_resultados'
                  ? 'bg-slate-100 text-slate-900 font-black shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>4. Auditoría ({stats.enviadosOk} OK)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('whatsapp_web_directo')}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-black text-white shadow-xs hover:bg-emerald-500 transition"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Ejecutar WhatsApp Web</span>
            </button>
          </div>
        </div>

        {/* Banner de Aviso Dinámico */}
        {statusNotice && (
          <div className="flex items-center justify-between bg-emerald-50 border-b border-emerald-200/80 px-6 py-2 text-xs font-medium text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 ml-4 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Contenido Principal Desplazable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {/* TAB 1: AJUSTES DE CAMPAÑA Y ANTI-BLOQUEO */}
          {activeTab === 'config_cola' && (
            <div className="space-y-5">
              {/* Resumen de Capas Stealth Anti-Restricción */}
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-2xs shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-slate-900">
                      8 Capas Stealth Anti-Restricción Activas
                    </h3>
                    <p className="text-[11px] text-slate-600 font-medium">
                      Navegación SPA sin recarga · Simulación de tipeo humano · Pausas de café automáticas · Ventana diurna
                    </p>
                  </div>
                </div>
                <div className="text-[11px] font-bold text-emerald-800 shrink-0">
                  Elegibles en base: {campaign.totalElegiblesEnBase ?? campaign.totalElegiblesEnPadron ?? campaign.items.length} · En tanda hoy: {campaign.items.length} (&lt; 45)
                </div>
              </div>

              {/* Controles de Configuración en 3 Tarjetas Blancas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Bloque A: Horario & Ventana Diurna */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-3.5 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-700" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      A. Horario & Ventana Diurna
                    </h4>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Hora de inicio del primer envío:
                    </label>
                    <input
                      type="time"
                      value={config.horaInicio}
                      onChange={(e) => handleRegenerarCola({ horaInicio: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Apertura diurna:
                      </label>
                      <input
                        type="time"
                        value={config.horaVentanaInicio}
                        onChange={(e) => handleRegenerarCola({ horaVentanaInicio: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Corte nocturno:
                      </label>
                      <input
                        type="time"
                        value={config.horaVentanaFin}
                        onChange={(e) => handleRegenerarCola({ horaVentanaFin: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    🛡️ <strong>Protección anti-madrugada:</strong> Cero envíos fuera de hora. Fin estimado: <strong className="text-slate-800">{stats.ultimaHora} hs</strong>.
                  </p>
                </div>

                {/* Bloque B: Calentamiento & Cupo */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-3.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4 text-amber-600" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        B. Calentamiento & Cupo
                      </h4>
                    </div>
                    <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-900">
                      Cupo: {config.cupoSorteado} msjs
                    </span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Nivel de calentamiento (Warm-up):
                    </label>
                    <select
                      value={config.nivelWarmup}
                      onChange={(e) => handleSelectWarmup(e.target.value as NivelWarmupWA)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden"
                    >
                      <option value="DIA_1_MAX_10">Día 1 (Inicial) — 7 a 10 msjs</option>
                      <option value="DIA_2_MAX_15">Día 2 — Máx 15 msjs (11 a 15)</option>
                      <option value="DIA_3_MAX_25">Día 3 — Máx 25 msjs (18 a 25)</option>
                      <option value="DIA_4_MAX_35">Día 4 — Máx 35 msjs (26 a 35)</option>
                      <option value="DIA_5_MADURO_MENOS_45">Día 5+ (Maduro) — Aleatorio &lt; 45 (28 a 44)</option>
                    </select>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={handleSortearNuevoCupo}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                      Sortear Nuevo Cupo (&lt; 45)
                    </button>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Filtrar tanda por barrio:
                    </label>
                    <select
                      value={config.barrioFiltro}
                      onChange={(e) => handleRegenerarCola({ barrioFiltro: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs font-bold text-slate-700"
                    >
                      <option value="Todos">Todos los barrios CABA</option>
                      {barriosDisponibles.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Bloque C: Pausas & Variabilidad */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-3.5 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-amber-700" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      C. Pausas & Variabilidad
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Pausa mín (seg):
                      </label>
                      <input
                        type="number"
                        min={45}
                        max={180}
                        value={config.minIntervaloSeg}
                        onChange={(e) => handleRegenerarCola({ minIntervaloSeg: Number(e.target.value) || 65 })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Pausa máx (seg):
                      </label>
                      <input
                        type="number"
                        min={60}
                        max={300}
                        value={config.maxIntervaloSeg}
                        onChange={(e) => handleRegenerarCola({ maxIntervaloSeg: Number(e.target.value) || 145 })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.modoRompehieloCorto !== false}
                        onChange={(e) => handleRegenerarCola({ modoRompehieloCorto: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>🛡️ Modo Rompehielo Corto (&lt; 210 car.)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.soloNumerosArgentina !== false}
                        onChange={(e) => handleRegenerarCola({ soloNumerosArgentina: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>🇦🇷 Priorizar números locales (+54)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.usarVariabilidadIAGemini}
                        onChange={(e) => handleRegenerarCola({ usarVariabilidadIAGemini: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Variabilidad con IA Gemini</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Botón para pasar a revisar la cola */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-800">
                    Cola calculada: {campaign.items.length} contactos
                  </span>
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                    ☕ {stats.pausasCafe} Pausas de café
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('vista_cola')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 transition"
                >
                  <span>Revisar Cola ({campaign.items.length})</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: PREVISUALIZACIÓN DE COLA DE CONTACTOS */}
          {activeTab === 'vista_cola' && (
            <div className="space-y-4">
              {/* Barra de Acciones de la Cola */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-slate-900">
                    Cola programada: {campaign.items.length} contactos
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                    🕒 {config.horaInicio} hs → {stats.ultimaHora} hs
                  </span>
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                    ☕ {stats.pausasCafe} Pausas de café
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReescribirLoteIA}
                    disabled={rewritingAllIA}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50 transition"
                  >
                    {rewritingAllIA ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                    )}
                    <span>Variantes IA</span>
                  </button>

                  <button
                    onClick={handleDescargarColaJSON}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>

              {/* Lista de Tarjetas de Candidatos en Cola */}
              <div className="space-y-3">
                {campaign.items.map((item) => {
                  const isExpanded = expandedItemOrder === item.orden;
                  return (
                    <React.Fragment key={`${item.contactId}-${item.orden}`}>
                      {item.esPausaCafeAntes && (
                        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-xs font-bold text-amber-900">
                          <Coffee className="h-4 w-4 text-amber-700 shrink-0" />
                          <span>
                            ☕ Pausa de café humana antes de #{item.orden}: descanso orgánico de {Math.round(item.intervaloSegundos / 60)} min.
                          </span>
                        </div>
                      )}

                      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3 transition hover:shadow-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-700">
                              #{item.orden}
                            </span>
                            <span className="text-xs font-mono font-bold text-slate-500">
                              🕒 {item.horaProgramada}
                            </span>
                            <span className="text-xs font-black text-slate-900">
                              #{item.contactId} · {item.nombre}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              {item.barrio}
                            </span>
                            <span className="text-[11px] font-mono text-slate-600">
                              {item.telRaw}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                            <span>⌨️ {item.segundosEscrituraSimulada}s tipeo</span>
                            <span>·</span>
                            <span>⏱️ +{item.intervaloSegundos}s espera</span>
                          </div>
                        </div>

                        {/* Previsualización del Mensaje */}
                        <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 p-3 text-xs text-slate-800 leading-relaxed font-normal">
                          {isExpanded ? (
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
                              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:outline-hidden"
                            />
                          ) : (
                            <p className="line-clamp-2">{item.mensajePrimerContacto}</p>
                          )}
                        </div>

                        {/* Botones de Acción */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedItemOrder(isExpanded ? null : item.orden)}
                              className="text-[11px] font-bold text-slate-600 hover:text-slate-900"
                            >
                              {isExpanded ? 'Ocultar edición' : 'Editar texto'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(item.mensajePrimerContacto);
                                setStatusNotice(`Texto copiado al portapapeles.`);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900"
                            >
                              <Copy className="h-3 w-3" />
                              Copiar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReescribirConGemini(item)}
                              disabled={rewritingOrder === item.orden}
                              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                            >
                              {rewritingOrder === item.orden ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="h-3 w-3 text-indigo-600" />
                              )}
                              Variante IA
                            </button>
                          </div>

                          {/* Marcado de Resultado */}
                          <div className="flex items-center gap-1.5">
                            {item.resultado === 'ENVIADO_OK' ? (
                              <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                                ✅ Enviado OK
                              </span>
                            ) : item.resultado === 'NUMERO_INEXISTENTE' ? (
                              <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-black text-rose-800">
                                🚫 Inexistente
                              </span>
                            ) : item.resultado === 'ERROR_ENVIO' ? (
                              <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-800">
                                ⚠️ Falló
                              </span>
                            ) : (
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                ⏳ En cola
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleMarcarResultadoItem(item, 'ENVIADO_OK')}
                              className="rounded-lg border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 px-2 py-1 text-[10px] font-bold text-slate-700 hover:text-emerald-800 transition"
                            >
                              ✅ OK
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarcarResultadoItem(item, 'NUMERO_INEXISTENTE')}
                              className="rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 px-2 py-1 text-[10px] font-bold text-slate-700 hover:text-rose-800 transition"
                            >
                              🚫 No existe
                            </button>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: WHATSAPP WEB DIRECTO */}
          {activeTab === 'whatsapp_web_directo' && (
            <div className="space-y-4">
              <WhatsAppWebAutomationPanel
                campaign={campaign}
                config={config}
                appsScriptUrl={appsScriptUrl}
                onApplyItemResult={onApplyItemResult}
              />
            </div>
          )}

          {/* TAB 4: AUDITORÍA Y RESULTADOS */}
          {activeTab === 'monitor_resultados' && (
            <div className="space-y-5">
              {/* Tarjetas de Métricas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                  <span className="text-[10px] font-black uppercase text-slate-400">En Cola</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">{stats.pendientes}</div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Tope seguro &lt; 45</p>
                </div>
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-2xs">
                  <span className="text-[10px] font-black uppercase text-emerald-700">Enviados OK</span>
                  <div className="text-2xl font-black text-emerald-900 mt-1">{stats.enviadosOk}</div>
                  <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">Sheets: 1er contacto enviado</p>
                </div>
                <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-4 shadow-2xs">
                  <span className="text-[10px] font-black uppercase text-rose-700">N° Inexistente</span>
                  <div className="text-2xl font-black text-rose-900 mt-1">{stats.inexistentes}</div>
                  <p className="text-[11px] text-rose-700 mt-0.5 font-medium">Sheets: Descartado / N° inex.</p>
                </div>
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-2xs">
                  <span className="text-[10px] font-black uppercase text-amber-700">Fallos / Error</span>
                  <div className="text-2xl font-black text-amber-900 mt-1">{stats.errores}</div>
                  <p className="text-[11px] text-amber-700 mt-0.5 font-medium">Pendientes de reintento</p>
                </div>
              </div>

              {/* Barra de Filtros y CSV */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['TODOS', 'ENVIADO_OK', 'NUMERO_INEXISTENTE', 'ERROR_ENVIO', 'PENDIENTE'] as const).map(
                    (f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFiltroResultado(f)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                          filtroResultado === f
                            ? 'bg-slate-900 text-white font-black'
                            : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f === 'TODOS'
                          ? `Todos (${campaign.items.length})`
                          : f === 'ENVIADO_OK'
                          ? `OK (${stats.enviadosOk})`
                          : f === 'NUMERO_INEXISTENTE'
                          ? `Inexistentes (${stats.inexistentes})`
                          : f === 'ERROR_ENVIO'
                          ? `Errores (${stats.errores})`
                          : `Pendientes (${stats.pendientes})`}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleDescargarAuditoriaCSV}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-black text-white hover:bg-emerald-500 transition shadow-2xs"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Descargar CSV Auditoría
                </button>
              </div>

              {/* Lista de Registros Auditados */}
              <div className="space-y-2">
                {itemsFiltrados.map((item) => (
                  <div
                    key={`audit-${item.contactId}-${item.orden}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-xs shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-slate-400">#{item.orden}</span>
                      <span className="font-black text-slate-900">#{item.contactId} · {item.nombre}</span>
                      <span className="text-slate-400">({item.barrio})</span>
                      <span className="font-mono text-slate-600">{item.telRaw}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.resultado === 'ENVIADO_OK' ? (
                        <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                          ✅ ENVIADO OK
                        </span>
                      ) : item.resultado === 'NUMERO_INEXISTENTE' ? (
                        <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-black text-rose-800">
                          🚫 NO EXISTE
                        </span>
                      ) : item.resultado === 'ERROR_ENVIO' ? (
                        <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-800">
                          ⚠️ FALLÓ
                        </span>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          ⏳ En cola
                        </span>
                      )}

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMarcarResultadoItem(item, 'ENVIADO_OK')}
                          className="rounded-lg border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMarcarResultadoItem(item, 'NUMERO_INEXISTENTE')}
                          className="rounded-lg border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-800"
                        >
                          No existe
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-white px-6 py-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Protección anti-bloqueo activa (&lt; 45 msjs/día) · {stats.enviadosOk} enviados con éxito
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Cerrar
            </button>
            {activeTab !== 'whatsapp_web_directo' && (
              <button
                type="button"
                onClick={() => setActiveTab('whatsapp_web_directo')}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-500 transition shadow-sm shadow-emerald-600/20"
              >
                <Smartphone className="h-4 w-4" />
                <span>Ejecutar WhatsApp Web</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
