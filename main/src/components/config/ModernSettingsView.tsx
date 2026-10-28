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
  onUpdateProfile: (updated: VoiceProfile) => void;
  onUpdateSheetUrl: (url: string) => void;
  onUpdateAppsScriptUrl: (url: string) => void;
  onUpdateCalendarIcalUrl: (url: string) => void;
  onExportCSV: () => void;
}

export const ModernSettingsView: React.FC<ModernSettingsViewProps> = ({
  profile,
  sheetUrlInput,
  appsScriptUrlInput,
  calendarIcalUrlInput,
  totalContacts,
  totalControlEnvios,
  onUpdateProfile,
  onUpdateSheetUrl,
  onUpdateAppsScriptUrl,
  onUpdateCalendarIcalUrl,
  onExportCSV,
}) => {
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [localProfile, setLocalProfile] = useState<VoiceProfile>(profile);
  const [localSheetUrl, setLocalSheetUrl] = useState<string>(sheetUrlInput);
  const [localAppsScriptUrl, setLocalAppsScriptUrl] = useState<string>(appsScriptUrlInput);
  const [localIcalUrl, setLocalIcalUrl] = useState<string>(calendarIcalUrlInput);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

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

          <button
            onClick={onExportCSV}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Descargar Padrón Completo en CSV</span>
          </button>
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
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              URL de Web App Google Apps Script
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
            <input
              type="text"
              value={localIcalUrl}
              onChange={(e) => setLocalIcalUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-hidden"
            />
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
