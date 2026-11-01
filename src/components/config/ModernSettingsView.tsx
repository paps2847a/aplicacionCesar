import React, { useState } from 'react';
import {
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
  Trash2,
  Plus,
  Code2,
  History,
  MapPin,
} from 'lucide-react';
import type { VoiceProfile, CalendarEventItem, ControlEnvioRegistro, Contact } from '../../types';
import { CODIGO_APPS_SCRIPT_PUENTE } from '../../data/appsScriptBridge';
import {
  geocodificarDireccionCABA,
  inferirBarrioDesdeTextoCABA,
} from '../../utils/logic';

interface ModernSettingsViewProps {
  profile: VoiceProfile;
  sheetUrlInput: string;
  appsScriptUrlInput: string;
  calendarIcalUrlInput: string;
  totalContacts: number;
  totalControlEnvios: number;
  contacts?: Contact[];
  controlEnvios?: ControlEnvioRegistro[];
  calendarEvents?: CalendarEventItem[];
  isSyncingSheets?: boolean;
  isSyncingCalendar?: boolean;
  onUpdateProfile: (updated: VoiceProfile) => void;
  onUpdateSheetUrl: (url: string) => void;
  onUpdateAppsScriptUrl: (url: string) => void;
  onUpdateCalendarIcalUrl: (url: string) => void;
  onSyncSheetsNow?: (sheetUrl: string, appsScriptUrl: string) => Promise<void> | void;
  onSyncCalendarNow?: (
    icalUrl: string
  ) => Promise<{ ok: boolean; count?: number; message: string } | void> | void;
  onAddCalendarEvent?: (ev: CalendarEventItem) => void;
  onDeleteCalendarEvent?: (id: string) => void;
  onClearAllCalendarEvents?: () => void;
  onImportCSVText?: (text: string) => void;
  onExportCSV: () => void;
}

export const ModernSettingsView: React.FC<ModernSettingsViewProps> = ({
  profile,
  sheetUrlInput,
  appsScriptUrlInput,
  calendarIcalUrlInput,
  totalContacts,
  totalControlEnvios,
  contacts = [],
  controlEnvios = [],
  calendarEvents = [],
  isSyncingSheets = false,
  isSyncingCalendar = false,
  onUpdateProfile,
  onUpdateSheetUrl,
  onUpdateAppsScriptUrl,
  onUpdateCalendarIcalUrl,
  onSyncSheetsNow,
  onSyncCalendarNow,
  onAddCalendarEvent,
  onDeleteCalendarEvent,
  onClearAllCalendarEvents,
  onImportCSVText,
  onExportCSV,
}) => {
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [showScriptCode, setShowScriptCode] = useState<boolean>(false);
  const [localProfile, setLocalProfile] = useState<VoiceProfile>(profile);
  const [localSheetUrl, setLocalSheetUrl] = useState<string>(sheetUrlInput);
  const [localAppsScriptUrl, setLocalAppsScriptUrl] = useState<string>(appsScriptUrlInput);
  const [localIcalUrl, setLocalIcalUrl] = useState<string>(calendarIcalUrlInput);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [calendarSyncFeedback, setCalendarSyncFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Estado para agregar un evento manual a Calendar
  const [newEvFecha, setNewEvFecha] = useState<string>('');
  const [newEvStart, setNewEvStart] = useState<string>('14:00');
  const [newEvEnd, setNewEvEnd] = useState<string>('15:00');
  const [newEvSummary, setNewEvSummary] = useState<string>('');
  const [newEvLocation, setNewEvLocation] = useState<string>('');

  // Estado para importar CSV/TSV o ver historial
  const [showImportBox, setShowImportBox] = useState<boolean>(false);
  const [csvImportText, setCsvImportText] = useState<string>('');
  const [showHistoryTable, setShowHistoryTable] = useState<boolean>(false);

  const handleCopyAppsScript = () => {
    navigator.clipboard.writeText(CODIGO_APPS_SCRIPT_PUENTE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  // Auto-detectar barrio y coordenadas al editar la dirección de partida
  const handleChangeDireccionPartida = (nuevaDir: string) => {
    const barrioDetectado = inferirBarrioDesdeTextoCABA(nuevaDir) || 'Palermo';
    const geo = geocodificarDireccionCABA(nuevaDir, barrioDetectado);
    setLocalProfile((prev) => ({
      ...prev,
      direccionPartida: nuevaDir,
      latPartida: geo.lat,
      lngPartida: geo.lng,
    }));
  };

  const handleSaveAll = () => {
    const dirLimpia = localProfile.direccionPartida.trim();
    const barrioInf = inferirBarrioDesdeTextoCABA(dirLimpia) || 'Palermo';
    const geo = geocodificarDireccionCABA(dirLimpia, barrioInf);
    const dirConBarrio =
      dirLimpia.toLowerCase().includes(barrioInf.toLowerCase())
        ? dirLimpia
        : `${dirLimpia}, ${barrioInf}, CABA`;

    const updatedProfile: VoiceProfile = {
      ...localProfile,
      direccionPartida: dirConBarrio,
      latPartida: geo.lat,
      lngPartida: geo.lng,
    };
    setLocalProfile(updatedProfile);
    onUpdateProfile(updatedProfile);
    onUpdateSheetUrl(localSheetUrl.trim());
    onUpdateAppsScriptUrl(localAppsScriptUrl.trim());
    onUpdateCalendarIcalUrl(localIcalUrl.trim());
    setSavedSuccess(true);
    setSettingsNotice(
      `✓ Configuración guardada. Punto de partida actualizado en ${barrioInf} (${dirConBarrio}).`
    );
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleAddEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvSummary.trim() || !newEvFecha.trim() || !onAddCalendarEvent) return;
    const partes = newEvFecha.trim().split('/');
    const dd = (partes[0] || '01').padStart(2, '0');
    const mm = (partes[1] || '10').padStart(2, '0');
    const fechaNorm = `${dd}/${mm}`;
    const year = new Date().getFullYear();

    onAddCalendarEvent({
      id: `cal-manual-${Date.now()}`,
      summary: newEvSummary.trim(),
      startTime: newEvStart || '14:00',
      endTime: newEvEnd || '15:00',
      location: newEvLocation.trim() || 'CABA',
      fecha: fechaNorm,
      fechaISO: `${year}-${mm}-${dd}`,
      status: 'confirmed',
    });

    setNewEvSummary('');
    setNewEvLocation('');
    setSettingsNotice(`📅 Compromiso "${newEvSummary.trim()}" (${fechaNorm} ${newEvStart}-${newEvEnd}) agregado.`);
  };

  const barrioActualPartida =
    inferirBarrioDesdeTextoCABA(localProfile.direccionPartida) || 'Palermo';

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 overflow-x-hidden px-3 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
      {/* Header Popurrí */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border-2 border-[#323232] rounded-2xl p-4 sm:p-5 shadow-[4px_4px_0px_#323232]">
        <div>
          <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase bg-[#FFF06B] text-[#323232] border border-[#323232] mb-1">
            Configuración &amp; Integraciones
          </span>
          <h2 className="text-lg sm:text-xl font-black text-[#323232]">
            Conexión con Google Sheets, Calendar, Punto de Partida y Base SQLite
          </h2>
          <p className="text-xs text-[#323232]/75 mt-0.5">
            Todos los cambios se guardan de forma persistente en tu base local <code>popurri.db</code> y sincronizan con la pestaña <strong>Control</strong> de tu Google Sheet.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          className="inline-flex items-center gap-2 rounded-xl bg-[#323232] px-5 py-2.5 text-xs font-black text-[#FFF06B] hover:bg-black transition shadow-[2px_2px_0px_#29B8FF]"
        >
          {savedSuccess ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span>¡Guardado con éxito!</span>
            </>
          ) : (
            <span>Guardar Todos los Cambios</span>
          )}
        </button>
      </div>

      {settingsNotice && (
        <div className="flex items-center justify-between rounded-xl bg-[#DFF4FF] border-2 border-[#323232] px-4 py-2.5 text-xs font-bold text-[#323232]">
          <span>{settingsNotice}</span>
          <button
            type="button"
            onClick={() => setSettingsNotice(null)}
            className="font-black text-[#323232] ml-4"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Google Sheets y Puente Apps Script */}
        <div className="rounded-2xl border-2 border-[#323232] bg-white p-5 shadow-[4px_4px_0px_#323232] space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF06B] border border-[#323232] text-[#323232]">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#323232]">
                  1. Google Sheets (Pestaña &quot;Control&quot;)
                </h4>
                <p className="text-[11px] text-[#323232]/70">
                  Sincronización de columnas: #, Nombre, Barrio, Tel, RSP, Adhirió, Comentario, Estado
                </p>
              </div>
            </div>
            {localSheetUrl && (
              <a
                href={localSheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#F5F4F0] border border-[#323232] text-[#323232] hover:bg-[#FFF06B] inline-flex items-center gap-1 shrink-0"
              >
                <span>Abrir Sheet</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#323232] mb-1">
              URL de tu Planilla Google Sheets (lectura directa o vía puente)
            </label>
            <input
              type="text"
              value={localSheetUrl}
              onChange={(e) => {
                setLocalSheetUrl(e.target.value);
                onUpdateSheetUrl(e.target.value);
              }}
              placeholder="https://docs.google.com/spreadsheets/d/1IjsWFTYXnFZPo76GVbEKngG5ksU5ZLpwxddV1cj6F8k/edit?gid=1772654652"
              className="w-full rounded-xl border-2 border-[#323232] px-3 py-2 text-xs text-[#323232] font-medium focus:bg-[#FFF06B]/15 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#323232] mb-1">
              URL de Web App Google Apps Script (escritura bidireccional en vivo)
            </label>
            <input
              type="text"
              value={localAppsScriptUrl}
              onChange={(e) => {
                setLocalAppsScriptUrl(e.target.value);
                onUpdateAppsScriptUrl(e.target.value);
              }}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full rounded-xl border-2 border-[#323232] px-3 py-2 text-xs text-[#323232] font-medium focus:bg-[#FFF06B]/15 focus:outline-none"
            />
            <p className="text-[10px] text-[#323232]/70 mt-1">
              Con la URL de Google Sheets ya podés <strong>leer e importar</strong> la pestaña Control (si tiene permiso de lectura). Para que la app <strong>escriba automáticamente</strong> cada cambio en las celdas de Google Sheets, pegá el código de abajo en <em>Extensiones &gt; Apps Script</em> y publicá como Aplicación Web.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {onSyncSheetsNow && (
              <button
                type="button"
                disabled={isSyncingSheets}
                onClick={() => onSyncSheetsNow(localSheetUrl.trim(), localAppsScriptUrl.trim())}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFF06B] border-2 border-[#323232] px-3 py-2.5 text-xs font-black text-[#323232] hover:bg-[#ffe838] disabled:opacity-50 transition shadow-[2px_2px_0px_#323232]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                <span>{isSyncingSheets ? 'Sincronizando...' : 'Sincronizar con Google Sheets Ahora'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyAppsScript}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-[#323232] bg-white px-3 py-2.5 text-xs font-bold text-[#323232] hover:bg-[#ECEAE2] transition"
            >
              {copiedScript ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedScript ? '¡Código Copiado!' : 'Copiar Apps Script'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowScriptCode((v) => !v)}
              className="inline-flex items-center justify-center gap-1 rounded-xl border-2 border-[#323232] bg-[#F5F4F0] px-2.5 py-2.5 text-xs font-bold text-[#323232]"
              title="Ver instrucciones y código de Apps Script"
            >
              <Code2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {showScriptCode && (
            <div className="rounded-xl bg-[#F5F4F0] border border-[#323232] p-3 space-y-2 text-[11px] text-[#323232]">
              <p className="font-bold">
                Pasos para activar la escritura automática y los Chips Desplegables en tu planilla &quot;Control&quot;:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[#323232]/85">
                <li>En tu Google Sheet, abrí el menú <strong>Extensiones &gt; Apps Script</strong>.</li>
                <li>Borrá lo que haya, pegá el código copiado (incluye <code>instalarChipsEstadoPopurri</code> con los 14 chips oficiales) y tocá <strong>Implementar &gt; Nueva implementación</strong> (o <em>Gestionar implementaciones &gt; Editar &gt; Nueva versión</em>).</li>
                <li>Elegí tipo <strong>Aplicación web</strong>, acceso <strong>Cualquier persona</strong>, y pegá la URL <code>.../exec</code> arriba.</li>
              </ol>
              <pre className="max-h-40 overflow-y-auto rounded-lg bg-[#323232] text-[#F5F4F0] p-2.5 text-[10px] font-mono">
                {CODIGO_APPS_SCRIPT_PUENTE}
              </pre>
            </div>
          )}
        </div>

        {/* 2. Punto de Partida & Perfil Territorial */}
        <div className="rounded-2xl border-2 border-[#323232] bg-white p-5 shadow-[4px_4px_0px_#323232] space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DFF4FF] border border-[#323232] text-[#323232]">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-[#323232]">
                2. Punto de Partida &amp; Sede Central
              </h4>
              <p className="text-[11px] text-[#323232]/70">
                Detecta automáticamente el barrio y las coordenadas para la Hoja de Ruta
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-[#323232]">
                Dirección de Partida en CABA (Km 0)
              </label>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FFF06B] border border-[#323232] text-[10px] font-black text-[#323232]">
                <MapPin className="w-3 h-3" />
                Barrio detectado: {barrioActualPartida}
              </span>
            </div>
            <input
              type="text"
              value={localProfile.direccionPartida}
              onChange={(e) => handleChangeDireccionPartida(e.target.value)}
              placeholder="Ej: Godoy Cruz 3260, Palermo, CABA"
              className="w-full rounded-xl border-2 border-[#323232] px-3 py-2 text-xs text-[#323232] font-bold focus:bg-[#FFF06B]/15 focus:outline-none"
            />
            <p className="text-[10px] text-[#323232]/70 mt-1">
              Al escribir una calle de otro barrio (ej. <em>Av. Cabildo 2000</em> → Belgrano, o <em>Av. Rivadavia 5000</em> → Caballito), se actualiza automáticamente el barrio y el cálculo de tiempos en <strong>Planificador &amp; Hoy</strong>.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#323232] mb-1">
                Nombre del Promotor (Firma de WA)
              </label>
              <input
                type="text"
                value={localProfile.nombrePromotor}
                onChange={(e) =>
                  setLocalProfile({ ...localProfile, nombrePromotor: e.target.value })
                }
                placeholder="César"
                className="w-full rounded-xl border-2 border-[#323232] px-3 py-2 text-xs text-[#323232] font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#323232] mb-1">
                Sede Central (Miércoles 18:30 a 20:00 hs)
              </label>
              <input
                type="text"
                value={localProfile.sedeCentral}
                onChange={(e) =>
                  setLocalProfile({ ...localProfile, sedeCentral: e.target.value })
                }
                placeholder="Chile 1408, Monserrat, CABA"
                className="w-full rounded-xl border-2 border-[#323232] px-3 py-2 text-xs text-[#323232] font-semibold"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveAll}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#323232] text-[#FFF06B] px-3 py-2 text-xs font-black hover:bg-black transition"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Aplicar Punto de Partida ({barrioActualPartida})</span>
          </button>
        </div>

        {/* 3. Google Calendar Anti-Choque y Gestor de Eventos */}
        <div className="rounded-2xl border-2 border-[#323232] bg-white p-5 shadow-[4px_4px_0px_#323232] space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DFF4FF] border border-[#323232] text-[#323232]">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#323232]">
                    3. Google Calendar &amp; Compromisos ({calendarEvents.length})
                  </h4>
                  {localIcalUrl.trim().startsWith('https://') && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 border border-[#323232] text-[10px] font-black text-emerald-950">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                      Auto-Sync .ics Activo
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#323232]/70">
                  Sincroniza automáticamente al agregar, modificar o eliminar eventos (solo vigentes desde hoy)
                </p>
              </div>
            </div>

            {calendarEvents.length > 0 && onClearAllCalendarEvents && (
              <button
                type="button"
                onClick={() => {
                  onClearAllCalendarEvents();
                  setSettingsNotice('🗑️ Se vaciaron todos los eventos del calendario y se guardó en SQLite.');
                }}
                className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Vaciar todos ({calendarEvents.length})</span>
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
            <input
              type="text"
              value={localIcalUrl}
              onChange={(e) => {
                setLocalIcalUrl(e.target.value);
                onUpdateCalendarIcalUrl(e.target.value);
                if (calendarSyncFeedback) setCalendarSyncFeedback(null);
              }}
              placeholder="URL secreta iCal (.ics): https://calendar.google.com/calendar/ical/.../private-.../basic.ics"
              className="flex-1 min-w-0 w-full rounded-xl border-2 border-[#323232] px-3 py-2 text-xs text-[#323232]"
            />
            {onSyncCalendarNow && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isSyncingCalendar || !localIcalUrl.trim()}
                  onClick={async () => {
                    setCalendarSyncFeedback({
                      ok: true,
                      message: '⏳ Conectando con Google Calendar y leyendo eventos .ics...',
                    });
                    const res = await onSyncCalendarNow(localIcalUrl.trim());
                    if (res && typeof res === 'object' && 'message' in res) {
                      setCalendarSyncFeedback({ ok: res.ok, message: res.message });
                      setSettingsNotice(res.message);
                    } else {
                      setCalendarSyncFeedback({
                        ok: true,
                        message: `✓ Sincronización completada (${calendarEvents.length} compromisos activos en agenda).`,
                      });
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-[#FFF06B] border-2 border-[#323232] text-xs font-black text-[#323232] hover:bg-[#ffe838] disabled:opacity-50 shrink-0 inline-flex items-center justify-center gap-1 shadow-[2px_2px_0px_#323232]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCalendar ? 'animate-spin' : ''}`} />
                  <span>{isSyncingCalendar ? 'Sincronizando...' : 'Sincronizar .ics'}</span>
                </button>

                <label
                  className="px-2.5 py-2 rounded-xl bg-[#DFF4FF] border-2 border-[#323232] text-xs font-black text-[#323232] hover:bg-[#29B8FF] cursor-pointer shrink-0 inline-flex items-center justify-center gap-1 shadow-[2px_2px_0px_#323232]"
                  title="Subir directamente un archivo .ics exportado desde tu Google Calendar"
                >
                  <span>📂 Subir .ics</span>
                  <input
                    type="file"
                    accept=".ics,text/calendar"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !onSyncCalendarNow) return;
                      try {
                        const text = await file.text();
                        const res = await onSyncCalendarNow(text);
                        if (res && typeof res === 'object' && 'message' in res) {
                          setCalendarSyncFeedback({ ok: res.ok, message: res.message });
                          setSettingsNotice(res.message);
                        }
                      } catch {
                        setCalendarSyncFeedback({
                          ok: false,
                          message: '⚠️ No se pudo leer el archivo .ics seleccionado.',
                        });
                      } finally {
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          {/\/public\/basic\.ics/i.test(localIcalUrl) && (
            <div className="rounded-xl border-2 border-[#323232] bg-[#FFF06B] p-3 text-xs text-[#323232] space-y-1.5 shadow-[2px_2px_0px_#323232]">
              <p className="font-black">
                ⚠️ Atención: pegaste la &ldquo;Dirección pública&rdquo; (<code>/public/basic.ics</code>)
              </p>
              <p className="text-[11px] leading-relaxed">
                Si tu calendario es privado, Google bloquea <code>/public/basic.ics</code> con <strong>Error 404</strong>. Para que funcione en el acto tenés 3 opciones:
              </p>
              <ol className="list-decimal list-inside text-[11px] space-y-1 font-semibold">
                <li>
                  <strong>(Recomendado)</strong> En esa misma pantalla de Google Calendar (<em>Integrar el calendario</em>), justo debajo de la dirección pública, copiá la <strong>&ldquo;Dirección secreta en formato iCal&rdquo;</strong> (tiene el ícono 👁️ y dice <code>/private-xxxx/basic.ics</code>).
                </li>
                <li>
                  O bien, en Google Calendar marcá la casilla <strong>&ldquo;Compartir públicamente&rdquo;</strong> para habilitar ese enlace público.
                </li>
                <li>
                  O tocá el botón celeste <strong>&ldquo;📂 Subir .ics&rdquo;</strong> de arriba si exportaste el archivo desde Google Calendar.
                </li>
              </ol>
            </div>
          )}

          <p className="text-[11px] text-[#323232]/75 leading-relaxed">
            💡 <strong>¿Cómo obtener tu enlace .ics?:</strong> En Google Calendar (web) abrí{' '}
            <em>Configuración y uso compartido</em> → bajá hasta <em>Integrar el calendario</em> → copiá la{' '}
            <strong>&ldquo;Dirección secreta en formato iCal&rdquo;</strong> (con <code>/private-.../basic.ics</code>) y pegala arriba, o subí tu archivo con <strong>📂 Subir .ics</strong>.
          </p>

          {calendarSyncFeedback && (
            <div
              className={`rounded-xl border-2 border-[#323232] p-3 text-xs font-bold flex items-start justify-between gap-2 ${
                calendarSyncFeedback.ok
                  ? 'bg-emerald-100 text-emerald-950'
                  : 'bg-[#F5817F]/35 text-[#323232]'
              }`}
            >
              <span className="leading-relaxed">{calendarSyncFeedback.message}</span>
              <button
                type="button"
                onClick={() => setCalendarSyncFeedback(null)}
                className="font-black text-[#323232] shrink-0 px-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* Lista de eventos activos con botón para eliminar cualquiera */}
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {calendarEvents.length === 0 ? (
              <div className="p-3 rounded-xl bg-[#F5F4F0] border border-[#323232]/20 text-center text-xs text-[#323232]/65">
                No hay eventos cargados en el calendario. Podés importar tu feed <code>.ics</code> arriba o cargar un compromiso abajo.
              </div>
            ) : (
              calendarEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F5F4F0] border border-[#323232]/25 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-black text-[#323232]">
                      {ev.fecha || 'Hoy'} · {ev.startTime} a {ev.endTime} hs
                    </span>{' '}
                    <span className="font-semibold text-[#323232]/90">— {ev.summary}</span>
                    {ev.location && (
                      <span className="text-[11px] text-[#323232]/65 block truncate">
                        📍 {ev.location}
                      </span>
                    )}
                  </div>
                  {onDeleteCalendarEvent && (
                    <button
                      type="button"
                      onClick={() => onDeleteCalendarEvent(ev.id)}
                      className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-100 shrink-0"
                      title="Eliminar este evento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Formulario rápido para sumar un compromiso manual */}
          {onAddCalendarEvent && (
            <form
              onSubmit={handleAddEventSubmit}
              className="pt-2 border-t border-[#323232]/15 space-y-2 min-w-0"
            >
              <span className="block text-[11px] font-black text-[#323232]">
                + Bloquear Horario / Agregar Compromiso Manual:
              </span>
              <div className="grid grid-cols-3 gap-2 min-w-0">
                <input
                  type="text"
                  required
                  value={newEvFecha}
                  onChange={(e) => setNewEvFecha(e.target.value)}
                  placeholder="Fecha DD/MM (ej: 31/10)"
                  className="min-w-0 w-full px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-[#F5F4F0]"
                />
                <input
                  type="time"
                  value={newEvStart}
                  onChange={(e) => setNewEvStart(e.target.value)}
                  className="min-w-0 w-full px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-[#F5F4F0]"
                />
                <input
                  type="time"
                  value={newEvEnd}
                  onChange={(e) => setNewEvEnd(e.target.value)}
                  className="min-w-0 w-full px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-[#F5F4F0]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                <input
                  type="text"
                  required
                  value={newEvSummary}
                  onChange={(e) => setNewEvSummary(e.target.value)}
                  placeholder="Motivo (ej: Médico / Reunión)"
                  className="min-w-0 w-full px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-[#F5F4F0]"
                />
                <div className="flex items-center gap-1.5 min-w-0 w-full">
                  <input
                    type="text"
                    value={newEvLocation}
                    onChange={(e) => setNewEvLocation(e.target.value)}
                    placeholder="Dirección CABA (opcional)"
                    className="flex-1 min-w-0 w-full px-2.5 py-1.5 text-xs border border-[#323232] rounded-lg bg-[#F5F4F0]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-[#323232] text-[#FFF06B] text-xs font-black shrink-0 inline-flex items-center justify-center gap-1 hover:bg-black transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Sumar</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* 4. Base de Datos SQLite, Exportación CSV e Historial de Envíos */}
        <div className="rounded-2xl border-2 border-[#323232] bg-white p-5 shadow-[4px_4px_0px_#323232] space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF06B] border border-[#323232] text-[#323232]">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-[#323232]">
                4. Base de Datos SQLite (<code>popurri.db</code>)
              </h4>
              <p className="text-[11px] text-[#323232]/70">
                Respaldo local instantáneo, importación y auditoría de envíos
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#F5F4F0] p-3.5 border-2 border-[#323232]">
            <div>
              <span className="text-[10px] font-black uppercase text-[#323232]/65">
                Total Contactos en Base
              </span>
              <p className="text-2xl font-black text-[#323232]">{totalContacts}</p>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-[#323232]/65">
                Envíos Registrados
              </span>
              <p className="text-2xl font-black text-[#323232]">{totalControlEnvios}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onExportCSV}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-3 py-2.5 text-xs font-black text-[#323232] hover:bg-[#ffe838] transition shadow-[2px_2px_0px_#323232]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar Padrón CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setShowImportBox((v) => !v)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#323232] bg-white px-3 py-2.5 text-xs font-bold text-[#323232] hover:bg-[#ECEAE2] transition"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Importar / Pegar TSV o CSV</span>
            </button>
          </div>

          {showImportBox && onImportCSVText && (
            <div className="p-3 rounded-xl bg-[#F5F4F0] border border-[#323232] space-y-2">
              <label className="block text-[11px] font-bold text-[#323232]">
                Pegá acá las filas copiadas desde Google Sheets o Excel (incluyendo o no el encabezado):
              </label>
              <textarea
                rows={4}
                value={csvImportText}
                onChange={(e) => setCsvImportText(e.target.value)}
                placeholder="#	Nombre	Barrio	Tel	RSP	Adhirió	Comentario	Estado"
                className="w-full p-2 text-xs border border-[#323232] rounded-lg bg-white font-mono"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportBox(false)}
                  className="px-3 py-1 rounded-lg text-xs font-bold border border-[#323232] bg-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!csvImportText.trim()) return;
                    onImportCSVText(csvImportText);
                    setCsvImportText('');
                    setShowImportBox(false);
                    setSettingsNotice('✓ Filas importadas y fusionadas en la base de datos.');
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-black bg-[#323232] text-[#FFF06B]"
                >
                  Fusionar Contactos
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowHistoryTable((v) => !v)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#323232]/30 bg-[#F5F4F0] px-3 py-2 text-xs font-bold text-[#323232] hover:bg-[#ECEAE2]"
          >
            <History className="h-3.5 w-3.5" />
            <span>
              {showHistoryTable
                ? 'Ocultar Historial de Envíos'
                : `Ver Historial de Envíos (${controlEnvios.length})`}
            </span>
          </button>

          {showHistoryTable && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-[#323232]/25 bg-[#F5F4F0] p-2 space-y-1.5 text-[11px]">
              {controlEnvios.length === 0 ? (
                <p className="text-center text-[#323232]/60 py-3">
                  Aún no hay envíos registrados en esta sesión.
                </p>
              ) : (
                controlEnvios.slice(0, 40).map((log) => (
                  <div
                    key={log.idRegistro}
                    className="p-2 rounded-lg bg-white border border-[#323232]/15 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="font-black text-[#323232]">
                        #{log.contactId} · {log.nombre}
                      </span>{' '}
                      <span className="text-[#323232]/70">({log.barrio})</span>
                      <span className="block text-[10px] text-[#323232]/75 truncate">
                        {log.tipoMensaje} → {log.estadoNuevoEtiqueta}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-[#323232]/60 shrink-0">
                      {log.fechaHora}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
