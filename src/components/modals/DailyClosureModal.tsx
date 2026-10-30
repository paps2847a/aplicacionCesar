import React, { useMemo, useState } from 'react';
import {
  X,
  FileSpreadsheet,
  Check,
  Copy,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Award,
  PhoneCall,
  UserX,
  MapPin,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  Contact,
  ControlEnvioRegistro,
  CorteResultado,
  EstatusReporteApp,
  VoiceProfile,
} from '../../types';
import { generarPanelTareasDiarias } from '../../domain/tasks/dailyTasks';

interface DailyClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  corteResultado: CorteResultado;
  controlEnvios: ControlEnvioRegistro[];
  profile: VoiceProfile;
  ahoraMs?: number;
}

export const DailyClosureModal: React.FC<DailyClosureModalProps> = ({
  isOpen,
  onClose,
  contacts,
  corteResultado,
  controlEnvios,
  profile,
  ahoraMs = Date.now(),
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [excludedContactIds, setExcludedContactIds] = useState<Set<string>>(new Set());

  const panel = useMemo(() => {
    return generarPanelTareasDiarias(
      contacts,
      corteResultado,
      controlEnvios,
      profile,
      ahoraMs
    );
  }, [contacts, corteResultado, controlEnvios, profile, ahoraMs]);

  const rawResumen = panel.resumenFormsYApps;

  const filteredPersonasHabladas = useMemo(() => {
    return rawResumen.estatusPersonasHabladasHoy.filter(
      (item) => !excludedContactIds.has(String(item.contactId))
    );
  }, [rawResumen.estatusPersonasHabladasHoy, excludedContactIds]);

  const conteoPorEstatus = useMemo(() => {
    const conteo: Record<EstatusReporteApp, number> = {
      'Adhirió': 0,
      'Encuentro Confirmado': 0,
      'En conversación (Falta dato/confirmar)': 0,
      'Número inválido / No existe WA': 0,
      'Sin DNI en CABA': 0,
      'No vive en CABA': 0,
      'Baja / No contactar': 0,
    };
    for (const item of filteredPersonasHabladas) {
      conteo[item.estatusApp] = (conteo[item.estatusApp] || 0) + 1;
    }
    return conteo;
  }, [filteredPersonasHabladas]);

  const personasContactadasHoy = filteredPersonasHabladas.length;
  const adhesionesHoy = conteoPorEstatus['Adhirió'] || 0;

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleExcludeContact = (contactId: string) => {
    setExcludedContactIds((prev) => {
      const next = new Set(prev);
      next.add(String(contactId));
      return next;
    });
  };

  const handleRestoreExcluded = () => {
    setExcludedContactIds(new Set());
  };

  const textoResumenGoogleForms = `Fecha: ${rawResumen.fechaHoyEtiqueta}
Personas contactadas hoy: ${personasContactadasHoy}
Adhesiones conseguidas hoy: ${adhesionesHoy}
Total adhesiones acumuladas: ${rawResumen.adhesionesTotalesAcumuladas}

Desglose por estatus:
- Adhirió: ${conteoPorEstatus['Adhirió'] || 0}
- Encuentro Confirmado: ${conteoPorEstatus['Encuentro Confirmado'] || 0}
- En conversación: ${conteoPorEstatus['En conversación (Falta dato/confirmar)'] || 0}
- Número inválido: ${conteoPorEstatus['Número inválido / No existe WA'] || 0}
- Sin DNI en CABA: ${conteoPorEstatus['Sin DNI en CABA'] || 0}
- No vive en CABA: ${conteoPorEstatus['No vive en CABA'] || 0}
- Baja: ${conteoPorEstatus['Baja / No contactar'] || 0}`;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                  Cierre Diario de Jornada & Google Forms
                </h3>
                <p className="text-xs text-slate-300 font-medium">
                  {panel.fechaReferenciaBA} · Totales listos para reportar
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            {/* 1. Tarjetas Principales (KPIs de Cierre) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-sky-800">
                    Contactados Hoy
                  </span>
                  <PhoneCall className="h-4 w-4 text-sky-600" />
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-3xl font-black text-sky-950">
                    {personasContactadasHoy}
                  </span>
                  <button
                    onClick={() => handleCopyText('cnt-hoy', String(personasContactadasHoy))}
                    className="text-[10px] font-bold text-sky-700 hover:underline inline-flex items-center gap-1"
                  >
                    {copiedKey === 'cnt-hoy' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copiar
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-300/80 bg-emerald-50/70 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-900">
                    Adhesiones Hoy
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-3xl font-black text-emerald-950">
                    {adhesionesHoy}
                  </span>
                  <button
                    onClick={() => handleCopyText('adh-hoy', String(adhesionesHoy))}
                    className="text-[10px] font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"
                  >
                    {copiedKey === 'adh-hoy' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copiar
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                    Total Acumulado
                  </span>
                  <Award className="h-4 w-4 text-slate-500" />
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-3xl font-black text-slate-900">
                    {rawResumen.adhesionesTotalesAcumuladas}
                  </span>
                  <button
                    onClick={() => handleCopyText('adh-tot', String(rawResumen.adhesionesTotalesAcumuladas))}
                    className="text-[10px] font-bold text-slate-600 hover:underline inline-flex items-center gap-1"
                  >
                    {copiedKey === 'adh-tot' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copiar
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Botón Destacado: Copiar Resumen para Google Forms */}
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-black text-slate-900">
                  Resumen Unificado para Google Forms
                </h4>
                <p className="text-[11px] text-slate-600">
                  Copia todos los datos clave en texto estructurado listo para pegar.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleCopyText('forms-completo', textoResumenGoogleForms)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-600 transition shadow-sm"
              >
                {copiedKey === 'forms-completo' ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span>¡Copiado al Portapapeles!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copiar Resumen para Google Forms</span>
                  </>
                )}
              </button>
            </div>

            {/* 3. Clasificación de las personas habladas hoy en los 7 estatus */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                Clasificación de Personas Habladas Hoy (7 Estatus)
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {Object.entries(conteoPorEstatus).map(([estatus, count]) => {
                  return (
                    <div
                      key={estatus}
                      className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs"
                    >
                      <span className="text-[10px] font-bold text-slate-500 block truncate">
                        {estatus}
                      </span>
                      <span className="text-lg font-black text-slate-900 mt-0.5 block">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. Listado Detallado de Personas Habladas Hoy */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Personas Habladas Hoy ({filteredPersonasHabladas.length})
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Con auditoría de hora y barrio
                  </span>
                </div>

                {excludedContactIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleRestoreExcluded}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 hover:bg-amber-100 transition shadow-2xs"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restaurar {excludedContactIds.size} contacto{excludedContactIds.size > 1 ? 's' : ''} descartado{excludedContactIds.size > 1 ? 's' : ''}
                  </button>
                )}
              </div>

              {filteredPersonasHabladas.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                  {excludedContactIds.size > 0
                    ? 'Todos los contactos de la jornada fueron descartados temporalmente.'
                    : 'Aún no se registraron envíos ni actualizaciones en la jornada de hoy.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white overflow-hidden max-h-56 overflow-y-auto">
                  {filteredPersonasHabladas.map((item) => (
                    <div
                      key={item.contactId}
                      className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/60 transition group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 truncate">
                            {item.nombre}
                          </span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            {item.horaAccion} hs
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {item.direccion} ({item.barrio})
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800 border border-emerald-200">
                          {item.estatusApp}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleExcludeContact(item.contactId)}
                          title="Descartar de la jornada de hoy (ej: contacto de prueba)"
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-6 py-3.5 bg-slate-50/80 flex items-center justify-end">
            <button
              onClick={onClose}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              Cerrar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
