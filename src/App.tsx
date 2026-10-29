import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  AutoFirstMessageCampaign,
  AutoFirstMessageConfig,
  CalendarEventItem,
  Contact,
  ControlEnvioRegistro,
  ModoColaAutomatizacionWA,
  RawContactRow,
  ResultadoEnvioAuto,
  SharedAppStateSnapshot,
  VoiceProfile,
} from './types';
import {
  DEFAULT_VOICE_PROFILE,
  INITIAL_CALENDAR_EVENTS,
  INITIAL_RAW_CONTACTS,
} from './data/estatusPopurriData';
import {
  aplicarResultadoEnvioAutoAContacto,
  construirMicroClusters,
  crearEnlaceWhatsApp,
  deduplicarEventosCalendar,
  exportarContactosACSV,
  fusionarContactosDesdeSheetsConControl,
  generarColaEnvioAutomaticoPrimerContacto,
  generarCorteEstrategicoLocal,
  normalizarTelefonoWA,
  parsearTSVoCSVContactos,
  procesarContacto,
} from './utils/logic';
import { ModernNavbar, ModernTabType } from './components/layout/ModernNavbar';
import { CandidatePipelineView } from './components/pipeline/CandidatePipelineView';
import { PlanHoyModernView } from './components/corte/PlanHoyModernView';
import { WhatsAppWebAutomationPanel } from './components/WhatsAppWebAutomationPanel';
import { ModernSettingsView } from './components/config/ModernSettingsView';
import { AutoFirstMessageModal } from './components/AutoFirstMessageModal';
import { InteractiveMapPanel } from './components/InteractiveMapPanel';

export default function App() {
  // 1. Navegación Principal Serena
  const [activeTab, setActiveTab] = useState<ModernTabType>('pipeline');

  // 2. Estado de Datos y Persistencia
  const [rawContacts, setRawContacts] = useState<RawContactRow[]>(() => INITIAL_RAW_CONTACTS);
  const [controlEnvios, setControlEnvios] = useState<ControlEnvioRegistro[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>(() => INITIAL_CALENDAR_EVENTS);
  const [profile, setProfile] = useState<VoiceProfile>(() => DEFAULT_VOICE_PROFILE);

  // 3. Ajustes de Conectividad
  const [sheetUrlInput, setSheetUrlInput] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_SHEET_URL as string) || (import.meta.env.VITE_SHEET_URL as string) || ''
  );
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState<string>(
    () => (import.meta.env.VITE_APPS_SCRIPT_URL as string) || ''
  );
  const [calendarIcalUrlInput, setCalendarIcalUrlInput] = useState<string>(
    () => (import.meta.env.VITE_CALENDAR_ICAL_URL as string) || ''
  );
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<{
    message: string;
    type: 'success' | 'warn' | 'error' | 'info';
  } | null>(null);

  useEffect(() => {
    if (!syncToast) return;
    const timer = setTimeout(() => {
      setSyncToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [syncToast]);

  // 4. Automatización WhatsApp Web
  const [whatsAppStatus, setWhatsAppStatus] = useState<string>('DISCONNECTED');
  const [showAutoFirstMessageModal, setShowAutoFirstMessageModal] = useState<boolean>(false);
  const [modoColaBotActivo, setModoColaBotActivo] = useState<ModoColaAutomatizacionWA>('PRIMER_CONTACTO');

  // 5. Reloj de Corte Territorial
  const [ahoraCorteMs, setAhoraCorteMs] = useState<number>(() => Date.now());

  // ----------------------------------------------------
  // CARGA INICIAL DESDE SQLITE / SERVIDOR
  // ----------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    async function loadInitialState() {
      try {
        const res = await fetch('/api/state');
        if (res.ok) {
          const data = await res.json();
          if (data?.state && isMounted) {
            const s = data.state as SharedAppStateSnapshot;
            if (Array.isArray(s.rawContacts) && s.rawContacts.length > 0) {
              setRawContacts(s.rawContacts);
            }
            if (Array.isArray(s.controlEnvios) && s.controlEnvios.length > 0) {
              setControlEnvios(s.controlEnvios);
            }
            if (Array.isArray(s.calendarEvents) && s.calendarEvents.length > 0) {
              setCalendarEvents(deduplicarEventosCalendar(s.calendarEvents));
            }
            if (s.profile) setProfile(s.profile);
            if (s.sheetUrlInput) setSheetUrlInput(s.sheetUrlInput);
            if (s.appsScriptUrlInput) setAppsScriptUrlInput(s.appsScriptUrlInput);
            if (s.calendarIcalUrlInput) setCalendarIcalUrlInput(s.calendarIcalUrlInput);
          }
        }
      } catch (err) {
        console.warn('Iniciando con datos de respaldo local:', err);
      }
    }
    void loadInitialState();
    return () => {
      isMounted = false;
    };
  }, []);

  // ----------------------------------------------------
  // MONITOR DE ESTADO EN VIVO DE WHATSAPP WEB
  // ----------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const checkWA = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (res.ok && !cancelled) {
          const d = await res.json();
          setWhatsAppStatus(d.status || 'DISCONNECTED');
        }
      } catch {
        // Silencioso en caso de desconexión momentánea
      }
    };
    void checkWA();
    const timer = setInterval(checkWA, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // ----------------------------------------------------
  // DERIVADOS MEMOIZADOS (Dominio)
  // ----------------------------------------------------
  const contacts: Contact[] = useMemo(() => {
    return rawContacts.map((r) => procesarContacto(r, profile, ahoraCorteMs));
  }, [rawContacts, profile, ahoraCorteMs]);

  const kpis = useMemo(() => {
    const adheridos = contacts.filter(
      (c) => c.adhirio === 'Sí' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK'
    ).length;
    return {
      total: contacts.length,
      adheridos,
    };
  }, [contacts]);

  const corteResultado = useMemo(() => {
    return generarCorteEstrategicoLocal(contacts, profile, 'Todos', calendarEvents, ahoraCorteMs);
  }, [contacts, profile, calendarEvents, ahoraCorteMs]);

  const defaultAutoConfig: AutoFirstMessageConfig = useMemo(
    () => ({
      horaInicio: '10:30',
      horaVentanaInicio: '09:30',
      horaVentanaFin: '19:00',
      nivelWarmup: 'DIA_2_MAX_15',
      minCupo: 10,
      maxCupo: 15,
      cupoSorteado: 12,
      minIntervaloSeg: 45,
      maxIntervaloSeg: 95,
      lotePausaCafeCada: 8,
      minPausaCafeMinutos: 8,
      maxPausaCafeMinutos: 15,
      pausaExtraCada10Seg: 600,
      incluirOptOutBaja: false,
      modoRompehieloCorto: true,
      soloNumerosArgentina: true,
      usarVariabilidadIAGemini: true,
      barrioFiltro: 'Todos',
      modoCola: 'PRIMER_CONTACTO',
    }),
    []
  );

  const autoCampaignForPanel: AutoFirstMessageCampaign = useMemo(() => {
    return generarColaEnvioAutomaticoPrimerContacto(contacts, defaultAutoConfig, profile);
  }, [contacts, defaultAutoConfig, profile]);

  const microClusters = useMemo(() => {
    return construirMicroClusters(contacts, 15, 'Todos', profile, ahoraCorteMs);
  }, [contacts, profile, ahoraCorteMs]);

  const todosLosBarrios = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) {
      if (c.barrio && c.barrio !== 'Sin barrio' && c.barrio !== 'Todos') {
        set.add(c.barrio);
      }
    }
    return ['Todos', ...Array.from(set).sort()];
  }, [contacts]);

  // ----------------------------------------------------
  // HANDLERS DE OPERACIÓN & PERSISTENCIA
  // ----------------------------------------------------

  // Actualización atómica de un contacto (UI inmediata + persistencia SQLite)
  const handleUpdateContact = useCallback(
    async (contactId: string, updates: Partial<Contact>) => {
      const ahora = new Date();
      const nowIso = ahora.toISOString();
      const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const auditText = `${ddmm} a las ${hhmm} hs`;

      let calculatedComentario = updates.comentario;

      setRawContacts((prev) =>
        prev.map((c) => {
          if (String(c.id) !== String(contactId)) return c;

          let finalComentario = updates.comentario !== undefined ? updates.comentario : c.comentario;
          if (
            updates.comentario === undefined &&
            (updates.estadoFlujo !== undefined || updates.adhirio !== undefined)
          ) {
            const baseCom = (c.comentario || '')
              .replace(/\s*\[Modificado el [^\]]+\]/g, '')
              .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
              .trim();
            const tagLabel = updates.estadoFlujo ? ` a "${updates.estadoFlujo}"` : '';
            finalComentario = baseCom
              ? `${baseCom} [Modificado el ${auditText}${tagLabel}]`
              : `[Modificado el ${auditText}${tagLabel}]`;
            calculatedComentario = finalComentario;
          }

          return {
            ...c,
            ...updates,
            comentario: finalComentario,
            actualizadoEnAppAt: updates.actualizadoEnAppAt || nowIso,
          };
        })
      );

      const enrichedUpdates = {
        ...updates,
        ...(calculatedComentario !== undefined ? { comentario: calculatedComentario } : {}),
        actualizadoEnAppAt: updates.actualizadoEnAppAt || nowIso,
      };

      try {
        const res = await fetch(`/api/contacts/${contactId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enrichedUpdates),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.contact) {
            setRawContacts((prev) =>
              prev.map((c) => (String(c.id) === String(contactId) ? { ...c, ...data.contact } : c))
            );
          }
        }
      } catch (err) {
        console.error('Error persistiendo contacto en SQLite:', err);
      }
    },
    []
  );

  // Envío directo por WhatsApp Web (Simulación de escritura humana + SQLite)
  const handleSendDirectWA = useCallback(
    async (
      phone: string,
      message: string,
      contactId: string,
      nombre: string,
      barrio: string
    ): Promise<boolean> => {
      try {
        const res = await fetch('/api/whatsapp/send-one', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            message,
            contactId,
            nombre,
            barrio,
            tipoAccion: 'mensaje_directo_ui',
          }),
        });
        const data = await res.json();
        if (data?.ok) {
          const nowIso = new Date().toISOString();
          const ahora = new Date();
          const ddmm = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
          const hhmm = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
          const auditText = `${ddmm} a las ${hhmm} hs`;

          setRawContacts((prev) =>
            prev.map((c) => {
              if (String(c.id) !== String(contactId)) return c;
              const baseCom = (c.comentario || '')
                .replace(/\s*\[Modificado el [^\]]+\]/g, '')
                .replace(/\s*\[Último cambio:? [^\]]+\]/g, '')
                .trim();
              const newCom = baseCom
                ? `${baseCom} [Modificado el ${auditText} a "1er mensaje enviado"]`
                : `[Modificado el ${auditText} a "1er mensaje enviado"]`;
              return {
                ...c,
                primerContactoEnviado: true,
                estadoFlujo: '1ER_MSJ_ENVIADO_SIN_RSP',
                ultimoContacto: nowIso.slice(0, 10),
                actualizadoEnAppAt: nowIso,
                comentario: newCom,
              };
            })
          );
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    []
  );

  // Sincronización en vivo con Google Sheets vía Apps Script
  const handleActualizarDesdeSheets = useCallback(async () => {
    if (isSyncingSheets) return;

    // 1. Si no hay ni Sheet URL ni Apps Script configurado, avisar y guiar a Configuración
    if (!sheetUrlInput.trim() && !appsScriptUrlInput.trim()) {
      setSyncToast({
        message: 'Por favor pegá el enlace de tu Google Sheets en la pestaña Configuración para sincronizar.',
        type: 'warn',
      });
      setActiveTab('configuracion');
      return;
    }

    setIsSyncingSheets(true);
    setSyncToast({
      message: 'Conectando y leyendo datos de Google Sheets...',
      type: 'info',
    });

    try {
      const keysControl = new Set<string>();
      for (const reg of controlEnvios) {
        if (reg.contactId) keysControl.add(`id:${String(reg.contactId).trim()}`);
      }

      const res = await fetch('/api/sheets/fetch-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetUrlOrId: sheetUrlInput.trim(),
          appsScriptUrl: appsScriptUrlInput.trim(),
        }),
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(rawText.trim());
      } catch {
        // Ignorar HTML
      }

      if (data && data.ok) {
        let parsed: RawContactRow[] = [];
        if (data.source === 'apps_script' && Array.isArray(data.rows)) {
          const textTsv = data.rows
            .map((r: unknown[]) => r.map((cell) => String(cell ?? '')).join('\t'))
            .join('\n');
          parsed = parsearTSVoCSVContactos(textTsv, true);
        } else if (data.csvText) {
          parsed = parsearTSVoCSVContactos(data.csvText, true);
        }

        if (parsed.length > 0) {
          const { contactosFusionados } = fusionarContactosDesdeSheetsConControl(
            parsed,
            rawContacts,
            keysControl
          );
          setRawContacts(contactosFusionados);

          // Guardar masivamente en SQLite
          void fetch('/api/contacts/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: contactosFusionados }),
          });

          if (Array.isArray(data.calendarEvents) && data.calendarEvents.length > 0) {
            const nextCal = deduplicarEventosCalendar([
              ...calendarEvents,
              ...data.calendarEvents,
            ]);
            setCalendarEvents(nextCal);
            void fetch('/api/calendar-events', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ events: nextCal, source: 'sheets_sync' }),
            });
          }

          setSyncToast({
            message: `✓ Sincronizados ${contactosFusionados.length} contactos desde Google Sheets con éxito.`,
            type: 'success',
          });
        } else {
          setSyncToast({
            message: 'Se conectó a Sheets pero no se detectaron filas de contactos válidas.',
            type: 'warn',
          });
        }
      } else {
        const errMsg =
          data?.error ||
          'No se pudo sincronizar con Google Sheets. Verificá que esté compartido como Lector o que la URL sea válida.';
        setSyncToast({
          message: errMsg,
          type: 'error',
        });
      }
    } catch (err) {
      console.error('Error sincronizando con Google Sheets:', err);
      setSyncToast({
        message: 'Error de red o conexión al intentar conectar con Google Sheets.',
        type: 'error',
      });
    } finally {
      setIsSyncingSheets(false);
    }
  }, [isSyncingSheets, controlEnvios, sheetUrlInput, appsScriptUrlInput, rawContacts, calendarEvents]);

  // Aplicar resultados individuales de la cola automática
  const handleApplyAutoItemResult = useCallback(
    (
      contactId: string,
      telefonoNorm: string,
      resultado: ResultadoEnvioAuto,
      detalle: string,
      fechaHoraISO?: string
    ) => {
      setRawContacts((prev) =>
        prev.map((c) => {
          const match =
            (contactId && String(c.id) === String(contactId)) ||
            (telefonoNorm && normalizarTelefonoWA(c.telRaw) === telefonoNorm);
          if (!match) return c;
          const procAntes = procesarContacto(c, profile);
          const actualizado = aplicarResultadoEnvioAutoAContacto(
            c,
            resultado,
            detalle,
            fechaHoraISO
          );
          const procDespues = procesarContacto(actualizado, profile);

          const log: ControlEnvioRegistro = {
            idRegistro: `envio-${Date.now()}-${actualizado.id}`,
            contactId: actualizado.id,
            nombre: procDespues.nombreCompletoCorregido,
            barrio: actualizado.barrio,
            telRaw: actualizado.telRaw,
            tipoMensaje: resultado === 'ENVIADO_OK' ? '1er Contacto WA Web' : 'Fallo WA Web',
            estadoAnterior: procAntes.estadoFlujoEtiqueta,
            estadoNuevo: procDespues.estadoFlujo,
            estadoNuevoEtiqueta: procDespues.estadoFlujoEtiqueta,
            rspNuevo: (actualizado.rsp as any) || 'Nuevo',
            adhirioNuevo: (actualizado.adhirio as any) || 'Pendiente',
            comentario: detalle,
            fechaHora: new Date().toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            sincronizadoSheets: false,
          };

          setControlEnvios((prevLogs) => [log, ...prevLogs].slice(0, 150));
          void fetch('/api/control-envios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log),
          });

          return actualizado;
        })
      );
    },
    [profile]
  );

  // Aplicar resultados por lote de la cola automática
  const handleApplyAutoBatchResults = useCallback(
    (
      items: {
        contactId: string;
        telefonoNorm: string;
        resultado: ResultadoEnvioAuto;
        detalleResultado: string;
        fechaHoraResultadoISO?: string;
      }[]
    ) => {
      if (!items.length) return;
      const nuevosLogs: ControlEnvioRegistro[] = [];

      setRawContacts((prev) =>
        prev.map((row) => {
          const rowTel = normalizarTelefonoWA(row.telRaw);
          const match = items.find(
            (it) =>
              (it.contactId && String(it.contactId) === String(row.id)) ||
              (it.telefonoNorm && rowTel && it.telefonoNorm === rowTel)
          );
          if (!match) return row;
          const procAntes = procesarContacto(row, profile);
          const actualizado = aplicarResultadoEnvioAutoAContacto(
            row,
            match.resultado,
            match.detalleResultado,
            match.fechaHoraResultadoISO
          );
          const procDespues = procesarContacto(actualizado, profile);

          nuevosLogs.push({
            idRegistro: `auto-batch-${Date.now()}-${actualizado.id}`,
            contactId: actualizado.id,
            nombre: procDespues.nombreCompletoCorregido,
            barrio: actualizado.barrio,
            telRaw: actualizado.telRaw,
            tipoMensaje:
              match.resultado === 'ENVIADO_OK' ? 'Auto WA Web OK' : 'Fallo WA Web',
            estadoAnterior: procAntes.estadoFlujoEtiqueta,
            estadoNuevo: procDespues.estadoFlujo,
            estadoNuevoEtiqueta: procDespues.estadoFlujoEtiqueta,
            rspNuevo: (actualizado.rsp as any) || 'Nuevo',
            adhirioNuevo: (actualizado.adhirio as any) || 'Pendiente',
            comentario: match.detalleResultado,
            fechaHora: new Date().toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            sincronizadoSheets: false,
          });

          return actualizado;
        })
      );

      if (nuevosLogs.length > 0) {
        setControlEnvios((prev) => [...nuevosLogs, ...prev].slice(0, 150));
        void fetch('/api/control-envios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nuevosLogs),
        });
      }
    },
    [profile]
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* 1. Barra de Navegación Serena y Minimalista */}
      <ModernNavbar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        totalContacts={contacts.length}
        signedCount={kpis.adheridos}
        whatsAppStatus={whatsAppStatus}
        isSyncingSheets={isSyncingSheets}
        onSyncSheets={handleActualizarDesdeSheets}
        onOpenAutoWAModal={() => {
          setModoColaBotActivo('PRIMER_CONTACTO');
          setShowAutoFirstMessageModal(true);
        }}
      />

      {/* 2. Vistas Principales Desacopladas por Etapas */}
      <main className="flex-1 pb-16">
        {activeTab === 'pipeline' && (
          <CandidatePipelineView
            contacts={contacts}
            voiceProfile={profile}
            whatsAppReady={whatsAppStatus === 'READY'}
            onUpdateContact={handleUpdateContact}
            onSendDirectWA={handleSendDirectWA}
            onOpenAutoWAModal={() => setShowAutoFirstMessageModal(true)}
          />
        )}

        {activeTab === 'mapa' && (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
            <InteractiveMapPanel
              contacts={contacts}
              clusters={microClusters}
              profile={profile}
              calendarEvents={calendarEvents}
              onOpenWhatsApp={(c, text) => {
                if (whatsAppStatus === 'READY') {
                  void handleSendDirectWA(c.tel || c.telRaw, text || '', c.id, c.nombre, c.barrio);
                } else {
                  const url = crearEnlaceWhatsApp(c.tel || c.telRaw, text || '');
                  window.open(url, '_blank');
                }
              }}
              onSelectContactForEdit={() => {
                setActiveTab('pipeline');
              }}
              onQuickStatusFromMap={(contactOrId, action) => {
                const id = typeof contactOrId === 'string' ? contactOrId : contactOrId.id;
                if (action === 'YA_ADHIRIO') {
                  void handleUpdateContact(id, { adhirio: 'Sí', estadoFlujo: 'YA_ADHIRIO_FIRMA_OK' });
                } else if (action === 'CONFIRMO_CAFE_HUB' || action === 'PASA_PUERTA_A_PUERTA') {
                  void handleUpdateContact(id, { estadoFlujo: 'ENCUENTRO_CONFIRMADO' });
                }
              }}
            />
          </div>
        )}

        {activeTab === 'plan_hoy' && (
          <PlanHoyModernView
            corteResultado={corteResultado}
            voiceProfile={profile}
            whatsAppReady={whatsAppStatus === 'READY'}
            onRefreshCorte={() => setAhoraCorteMs(Date.now())}
            onUpdateContact={handleUpdateContact}
            onSendDirectWA={handleSendDirectWA}
          />
        )}

        {activeTab === 'whatsapp' && (
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
            <WhatsAppWebAutomationPanel
              campaign={autoCampaignForPanel}
              config={defaultAutoConfig}
              appsScriptUrl={appsScriptUrlInput}
              onApplyItemResult={handleApplyAutoItemResult}
            />
          </div>
        )}

        {activeTab === 'configuracion' && (
          <ModernSettingsView
            profile={profile}
            sheetUrlInput={sheetUrlInput}
            appsScriptUrlInput={appsScriptUrlInput}
            calendarIcalUrlInput={calendarIcalUrlInput}
            totalContacts={contacts.length}
            totalControlEnvios={controlEnvios.length}
            onUpdateProfile={(up) => {
              const next = { ...profile, ...up };
              setProfile(next);
              void fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'profile', value: next }),
              });
            }}
            onUpdateSheetUrl={(u) => {
              setSheetUrlInput(u);
              void fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'sheetUrlInput', value: u }),
              });
            }}
            onUpdateAppsScriptUrl={(u) => {
              setAppsScriptUrlInput(u);
              void fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'appsScriptUrlInput', value: u }),
              });
            }}
            onUpdateCalendarIcalUrl={(u) => {
              setCalendarIcalUrlInput(u);
              void fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'calendarIcalUrlInput', value: u }),
              });
            }}
            onExportCSV={() => exportarContactosACSV(contacts)}
          />
        )}
      </main>

      {/* 3. Modal Auxiliar de Campañas Automáticas */}
      <AutoFirstMessageModal
        isOpen={showAutoFirstMessageModal}
        onClose={() => setShowAutoFirstMessageModal(false)}
        contacts={contacts}
        voiceProfile={profile}
        barriosDisponibles={todosLosBarrios}
        sheetUrlOrId={sheetUrlInput}
        appsScriptUrl={appsScriptUrlInput}
        onApplyItemResult={handleApplyAutoItemResult}
        onApplyBatchResults={handleApplyAutoBatchResults}
        initialModoCola={modoColaBotActivo}
      />

      {/* 4. Notificaciones Flotantes de Sincronización y Estado */}
      <AnimatePresence>
        {syncToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed bottom-6 right-6 z-50 max-w-md flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl border text-xs font-bold ${
              syncToast.type === 'success'
                ? 'bg-slate-900 text-white border-emerald-500/50 shadow-emerald-950/20'
                : syncToast.type === 'error'
                ? 'bg-rose-950 text-rose-50 border-rose-500/50 shadow-rose-950/30'
                : syncToast.type === 'warn'
                ? 'bg-amber-950 text-amber-50 border-amber-500/50 shadow-amber-950/30'
                : 'bg-slate-900 text-white border-slate-700 shadow-black/20'
            }`}
          >
            {syncToast.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
            {syncToast.type === 'error' && <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />}
            {syncToast.type === 'warn' && <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />}
            {syncToast.type === 'info' && <RefreshCw className="h-4 w-4 text-indigo-400 animate-spin shrink-0" />}
            <span className="flex-1 leading-snug">{syncToast.message}</span>
            <button
              type="button"
              onClick={() => setSyncToast(null)}
              className="text-slate-400 hover:text-white px-1 text-xs"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
