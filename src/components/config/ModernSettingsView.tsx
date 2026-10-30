import React, { useState } from 'react';
import {
  Settings,
  Database,
  FileSpreadsheet,
  Calendar,
  User,
  Copy,
  Check,
  Download,
  Upload,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  X,
  Plus,
  Trash2,
  Clock,
  MapPin,
} from 'lucide-react';
import type { VoiceProfile, CalendarEventItem } from '../../types';
import { CODIGO_APPS_SCRIPT_PUENTE } from '../../data/appsScriptBridge';

interface ModernSettingsViewProps {
  profile: VoiceProfile;
  sheetUrlInput: string;
  appsScriptUrlInput: string;
  calendarIcalUrlInput: string;
  totalContacts: number;
  totalControlEnvios: number;
  calendarEvents?: CalendarEventItem[];
  onUpdateProfile: (updated: VoiceProfile) => void;
  onUpdateSheetUrl: (url: string) => void;
  onUpdateAppsScriptUrl: (url: string) => void;
  onUpdateCalendarIcalUrl: (url: string) => void;
  onExportCSV: () => void;
  onExportCSVExcel?: () => void;
  onCopyTSV?: () => void;
  onSyncCalendar?: () => void;
  onDeleteCalendarEvent?: (id: string) => void;
  onAddCalendarEvent?: (event: CalendarEventItem) => void;
}

export const ModernSettingsView: React.FC<ModernSettingsViewProps> = ({
  profile,
  sheetUrlInput,
  appsScriptUrlInput,
  calendarIcalUrlInput,
  totalContacts,
  totalControlEnvios,
  calendarEvents = [],
  onUpdateProfile,
  onUpdateSheetUrl,
  onUpdateAppsScriptUrl,
  onUpdateCalendarIcalUrl,
  onExportCSV,
  onExportCSVExcel,
  onCopyTSV,
  onSyncCalendar,
  onDeleteCalendarEvent,
  onAddCalendarEvent,
}) => {
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [copiedTsv, setCopiedTsv] = useState<boolean>(false);
  const [localProfile, setLocalProfile] = useState<VoiceProfile>(profile);
  const [localSheetUrl, setLocalSheetUrl] = useState<string>(sheetUrlInput);
  const [localAppsScriptUrl, setLocalAppsScriptUrl] = useState<string>(appsScriptUrlInput);
  const [localIcalUrl, setLocalIcalUrl] = useState<string>(calendarIcalUrlInput);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Compromiso manual de Calendar
  const [showAddEvent, setShowAddEvent] = useState<boolean>(false);
  const [newSummary, setNewSummary] = useState<string>('');
  const [newFecha, setNewFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [newStartTime, setNewStartTime] = useState<string>('14:30');
  const [newEndTime, setNewEndTime] = useState<string>('15:30');
  const [newLocation, setNewLocation] = useState<string>('Palermo, CABA');

  const handleAddManualEvent = () => {
    if (!newSummary.trim() || !onAddCalendarEvent) return;
    const fechaISO = newFecha || new Date().toISOString().slice(0, 10);
    const parts = fechaISO.split('-');
    const fechaDDMM = parts[2] && parts[1] ? `${parts[2]}/${parts[1]}` : 'HOY';
    const ev: CalendarEventItem = {
      id: `manual_cal_${Date.now()}`,
      summary: newSummary.trim(),
      location: newLocation.trim() || 'CABA',
      fecha: fechaDDMM,
      fechaISO,
      startTime: newStartTime || '14:30',
      endTime: newEndTime || '15:30',
    };
    onAddCalendarEvent(ev);
    setNewSummary('');
    setShowAddEvent(false);
  };

  const handleCopyAppsScript = () => {
    navigator.clipboard.writeText(CODIGO_APPS_SCRIPT_PUENTE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleSaveAll = () => {
    onUpdateProfile(localProfile);
    onUpdateSheetUrl(localSheetUrl);
    onUpdateAppsScriptUrl(localAppsScriptUrl);
    onUpdateCalendarIcalUrl(localIcalUrl);
    if (localIcalUrl.trim() && onSyncCalendar) {
      onSyncCalendar();
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900">Configuración & Integraciones</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ajustes de Google Sheets, Calendar, perfil de voz y base de datos SQLite.
          </p>
        </div>

        <button
          onClick={handleSaveAll}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 transition shadow-sm"
        >
          {savedSuccess ? '¡Guardado con éxito!' : 'Guardar Todo'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Base de Datos SQLite */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Base de Datos SQLite (popurri.db)
              </h4>
              <p className="text-[11px] text-slate-500">Almacenamiento persistente local de alta velocidad</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3.5 border border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Total Contactos</span>
              <p className="text-xl font-black text-slate-900">{totalContacts}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Envíos Registrados</span>
              <p className="text-xl font-black text-slate-900">{totalControlEnvios}</p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {onExportCSVExcel && (
              <button
                type="button"
                onClick={onExportCSVExcel}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500 transition shadow-xs"
                title="Separado por punto y coma (;) para abrir en Excel en español con todas las columnas divididas"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Descargar CSV para Excel (;)</span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onExportCSV}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                title="CSV estándar RFC 4180 separado por comas"
              >
                <Download className="h-3 w-3 text-slate-400" />
                <span>CSV Estándar (,)</span>
              </button>

              {onCopyTSV && (
                <button
                  type="button"
                  onClick={() => {
                    onCopyTSV();
                    setCopiedTsv(true);
                    setTimeout(() => setCopiedTsv(false), 2500);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                  title="Copia la tabla en portapapeles para pegar directo (Ctrl+V) en Excel o Google Sheets"
                >
                  {copiedTsv ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      <span className="text-emerald-700">¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-slate-400" />
                      <span>Copiar (TSV)</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 2. Google Sheets y Puente Apps Script */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Google Sheets & Puente Nativo
              </h4>
              <p className="text-[11px] text-slate-500">Evita el Error 400 por Google Advanced Protection</p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              1. Enlace o ID de Google Sheets (Lectura directa)
            </label>
            <input
              type="text"
              value={localSheetUrl}
              onChange={(e) => setLocalSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/... o ID de planilla"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              En Google Sheets: tocá "Compartir" y elegí "Cualquier persona con el enlace (Lector)".
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              2. URL de Web App Google Apps Script (Para sincronización bidireccional)
            </label>
            <input
              type="text"
              value={localAppsScriptUrl}
              onChange={(e) => setLocalAppsScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
            />
          </div>

          <button
            onClick={handleCopyAppsScript}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-extrabold text-indigo-900 hover:bg-indigo-100 transition shadow-2xs"
          >
            {copiedScript ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedScript ? '¡Código Copiado!' : 'Copiar Código de Apps Script'}</span>
          </button>
        </div>

        {/* 3. Google Calendar Anti-Choque */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-800">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Google Calendar (Feed iCal)
              </h4>
              <p className="text-[11px] text-slate-500">Para no solapar visitas con terapias o citas personales</p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              URL privada iCal (.ics)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={localIcalUrl}
                onChange={(e) => setLocalIcalUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
              />
              {onSyncCalendar && (
                <button
                  type="button"
                  onClick={onSyncCalendar}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 transition shadow-2xs whitespace-nowrap flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Sincronizar</span>
                </button>
              )}
            </div>
          </div>

          {/* Lista de Eventos y Compromisos Activos */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700">
                Compromisos Activos ({calendarEvents.length})
              </span>
              <button
                type="button"
                onClick={() => setShowAddEvent(!showAddEvent)}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-md hover:bg-blue-100 transition"
              >
                <Plus className="h-3 w-3" />
                <span>{showAddEvent ? 'Cerrar' : 'Agregar compromiso'}</span>
              </button>
            </div>

            {/* Formulario para agregar compromiso manual */}
            {showAddEvent && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Título / Motivo</label>
                  <input
                    type="text"
                    value={newSummary}
                    onChange={(e) => setNewSummary(e.target.value)}
                    placeholder="Ej. Terapia, Turno médico, Trámite personal"
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Fecha</label>
                    <input
                      type="date"
                      value={newFecha}
                      onChange={(e) => setNewFecha(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Desde</label>
                    <input
                      type="time"
                      value={newStartTime}
                      onChange={(e) => setNewStartTime(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Hasta</label>
                    <input
                      type="time"
                      value={newEndTime}
                      onChange={(e) => setNewEndTime(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Ubicación / Dirección</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="Ej. Godoy Cruz 3260, Palermo, CABA"
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddEvent(false)}
                    className="px-2.5 py-1 rounded-md text-slate-500 hover:bg-slate-200 text-xs font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleAddManualEvent}
                    className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 shadow-2xs"
                  >
                    Guardar Compromiso
                  </button>
                </div>
              </div>
            )}

            {/* Lista scrolleable de eventos */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {calendarEvents.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic py-2 text-center">
                  No hay eventos ni bloqueos cargados en el calendario.
                </p>
              ) : (
                calendarEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-xs hover:border-slate-300 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span className="truncate">{ev.summary}</span>
                        <span className="shrink-0 text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200/60">
                          {ev.fecha || ev.fechaISO || 'Hoy'} ({ev.startTime} - {ev.endTime} hs)
                        </span>
                      </div>
                      {ev.location && (
                        <p className="text-[10px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          <span>{ev.location}</span>
                        </p>
                      )}
                    </div>
                    {onDeleteCalendarEvent && (
                      <button
                        type="button"
                        onClick={() => onDeleteCalendarEvent(ev.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                        title="Eliminar este compromiso"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 4. Perfil de Voz y Base de Partida */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
              <User className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Punto de Partida & Perfil Territorial
              </h4>
              <p className="text-[11px] text-slate-500">Ubicación base para calcular traslados iniciales</p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Dirección de Partida en CABA
            </label>
            <input
              type="text"
              value={localProfile.direccionPartida}
              onChange={(e) =>
                setLocalProfile({ ...localProfile, direccionPartida: e.target.value })
              }
              placeholder="Godoy Cruz 3260, Palermo, CABA"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Sede Central (Miércoles de 18:30 a 20:30 hs)
            </label>
            <input
              type="text"
              value={localProfile.sedeCentral}
              onChange={(e) =>
                setLocalProfile({ ...localProfile, sedeCentral: e.target.value })
              }
              placeholder="Chile 1408, Monserrat, CABA"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
