import React, { useState, useMemo } from 'react';
import {
  Shield,
  Users,
  UserPlus,
  Link2,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  Send,
  FileSpreadsheet,
  Eye,
  Filter,
  CheckCircle2,
  Clock,
  MapPin,
  ArrowRight,
  ExternalLink,
  Trash2,
  KeyRound,
  UserCheck,
} from 'lucide-react';
import type { Contact, ControlEnvioRegistro, EstadoFlujo } from '../../types';
import type { AppUserAccount } from '../auth/LoginModal';
import { crearEnlaceWhatsApp } from '../../domain/messaging/greetingsAndTone';

export type VolunteerUser = AppUserAccount;

const DEFAULT_BARRIOS_ADMIN = [
  'Palermo',
  'Belgrano',
  'Recoleta',
  'Caballito',
  'Villa Urquiza',
  'Almagro',
  'Colegiales',
  'Villa Crespo',
  'Núñez',
  'Chacarita',
  'Saavedra',
  'Coghlan',
  'Parque Chas',
  'San Telmo',
  'Balvanera',
];

interface AdminDashboardViewProps {
  contacts: Contact[];
  users?: AppUserAccount[];
  volunteers?: AppUserAccount[];
  controlEnvios?: ControlEnvioRegistro[];
  barriosDisponibles?: string[];
  inviteCode?: string;
  sheetUrlInput?: string;
  onRefreshVolunteers?: () => Promise<void> | void;
  onCreateVolunteer?: (data: {
    nombre: string;
    username: string;
    password: string;
    telefono: string;
    barrioAsignado: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  onAssignContactsToVolunteer: (
    contactIds: string[],
    volunteerUsername: string,
    syncSheetTab?: boolean
  ) => Promise<void>;
  onSyncVolunteerSheetTab?: (volunteerUsername: string) => Promise<{ ok: boolean; message: string }>;
  onJumpToCandidate: (contactId: string) => void;
  onDeleteContact?: (contactId: string) => Promise<void> | void;
  onOpenLoginModal?: () => void;
  onSendDirectWA?: (
    phone: string,
    text: string,
    contactId: string,
    nombre: string,
    barrio: string
  ) => Promise<boolean>;
  onSwitchToVolunteerView: (volunteer: AppUserAccount) => void;
  showNotice?: (text: string, type?: 'ok' | 'warn' | 'info') => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  contacts,
  users,
  volunteers: volunteersProp,
  controlEnvios = [],
  barriosDisponibles = DEFAULT_BARRIOS_ADMIN,
  inviteCode = 'POPURRI-VOL-2026',
  sheetUrlInput,
  onRefreshVolunteers,
  onCreateVolunteer,
  onAssignContactsToVolunteer,
  onSyncVolunteerSheetTab,
  onJumpToCandidate,
  onDeleteContact,
  onOpenLoginModal,
  onSendDirectWA,
  onSwitchToVolunteerView,
  showNotice,
}) => {
  const [selectedVolunteerUsername, setSelectedVolunteerUsername] = useState<string>('TODOS');
  const [assignBarrio, setAssignBarrio] = useState<string>('Todos');
  const [assignEstado, setAssignEstado] = useState<string>('SIN_CONTACTAR_1ER_MSJ');
  const [assignCantidad, setAssignCantidad] = useState<number>(10);
  const [assignTargetUser, setAssignTargetUser] = useState<string>('cesar');
  const [onlyUnassigned, setOnlyUnassigned] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modal / Formulario de Alta Manual de Voluntario
  const [showNewVolModal, setShowNewVolModal] = useState<boolean>(false);
  const [newVolNombre, setNewVolNombre] = useState('');
  const [newVolUsername, setNewVolUsername] = useState('');
  const [newVolPassword, setNewVolPassword] = useState('');
  const [newVolTel, setNewVolTel] = useState('');
  const [newVolBarrio, setNewVolBarrio] = useState('Palermo');

  // Reasignación rápida en alerta de 48/72h
  const [reassignTargetByFromUser, setReassignTargetByFromUser] = useState<Record<string, string>>({});
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncingTabUser, setSyncingTabUser] = useState<string | null>(null);

  const safeBarrios = useMemo(() => {
    if (Array.isArray(barriosDisponibles) && barriosDisponibles.length > 0) {
      return barriosDisponibles;
    }
    const fromContacts = Array.from(
      new Set(contacts.map((c) => (c.barrio || 'Palermo').trim()).filter(Boolean))
    );
    return fromContacts.length > 0 ? fromContacts : DEFAULT_BARRIOS_ADMIN;
  }, [barriosDisponibles, contacts]);

  const volunteers = useMemo(() => {
    const rawList = Array.isArray(users)
      ? users
      : Array.isArray(volunteersProp)
      ? volunteersProp
      : [];
    const list = rawList.filter((u) => {
      if (!u) return false;
      const roleLow = String(u.role || '').toLowerCase();
      const unameLow = String(u.username || '').toLowerCase();
      return roleLow === 'volunteer' || roleLow === 'voluntario' || unameLow === 'cesar';
    });
    if (list.length === 0) {
      return [
        {
          id: 'cesar',
          username: 'cesar',
          nombre: 'César Rincón',
          role: 'volunteer' as const,
          sheetTabName: 'Control',
          createdAt: '2026-10-01T00:00:00.000Z',
          canSwitchToAdmin: true,
        },
      ];
    }
    return list;
  }, [users, volunteersProp]);

  const hoyISO = useMemo(
    () =>
      new Date().toLocaleDateString('sv-SE', {
        timeZone: 'America/Argentina/Buenos_Aires',
      }),
    []
  );

  // Estadísticas Macro y Micro por Voluntario + Detección de inactividad 48/72 hs
  const volunteerStats = useMemo(() => {
    const nowMs = Date.now();
    return volunteers.map((vol) => {
      const assigned = contacts.filter((c) => {
        const owner = (c.asignadoA || 'cesar').toLowerCase();
        return owner === vol.username.toLowerCase();
      });

      const sinContactar = assigned.filter(
        (c) =>
          c.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
          c.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
      );

      // Contactos asignados hace >= 48 hs que siguen sin ser contactados
      const sinContactar48h = sinContactar.filter((c) => {
        if (!c.asignadoFecha) return false;
        const asigMs = Date.parse(c.asignadoFecha);
        if (isNaN(asigMs)) return false;
        return nowMs - asigMs >= 48 * 3600 * 1000;
      });

      const enviadosEsperando = assigned.filter(
        (c) => c.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP'
      );
      const enConversacion = assigned.filter(
        (c) =>
          c.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
          c.estadoFlujo === 'PIDIO_MAS_INFO_ENVIADA' ||
          c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
          c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR'
      );
      const confirmados = assigned.filter(
        (c) =>
          c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
          c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
          c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
      );
      const adheridos = assigned.filter(
        (c) => c.adhirio === 'Sí' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK'
      );

      const contactadosHoy = assigned.filter((c) => {
        if (!c.ultimoMensajeCorteEnviadoAt) return false;
        const dIso = new Date(c.ultimoMensajeCorteEnviadoAt).toLocaleDateString('sv-SE', {
          timeZone: 'America/Argentina/Buenos_Aires',
        });
        return dIso === hoyISO;
      });

      return {
        volunteer: vol,
        totalAsignados: assigned.length,
        sinContactarCount: sinContactar.length,
        sinContactar48h,
        enviadosEsperandoCount: enviadosEsperando.length,
        enConversacionCount: enConversacion.length,
        confirmadosCount: confirmados.length,
        adheridosCount: adheridos.length,
        contactadosHoyCount: contactadosHoy.length,
        assignedContacts: assigned,
      };
    });
  }, [volunteers, contacts, hoyISO]);

  // Alertas activas de voluntarios con contactos sin gestionar por +48/72 hs
  const alertasInactividad48h = useMemo(
    () => volunteerStats.filter((st) => st.sinContactar48h.length > 0),
    [volunteerStats]
  );

  // Candidatos elegibles según el filtro del panel de asignación
  const candidatosParaAsignar = useMemo(() => {
    return contacts.filter((c) => {
      if (assignBarrio !== 'Todos' && c.barrio !== assignBarrio) return false;
      if (assignEstado !== 'TODOS' && c.estadoFlujo !== assignEstado) return false;
      if (onlyUnassigned && c.asignadoA && c.asignadoA !== 'cesar') return false;
      return true;
    });
  }, [contacts, assignBarrio, assignEstado, onlyUnassigned]);

  const inviteUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${origin}/?invite=${encodeURIComponent(inviteCode)}`;
  }, [inviteCode]);

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  };

  const handleAssignBatch = async () => {
    const slice = candidatosParaAsignar.slice(0, Math.max(1, assignCantidad));
    if (slice.length === 0) {
      setNotice('⚠️ No hay contactos que coincidan con esos filtros para asignar.');
      return;
    }
    const targetVol = volunteers.find((v) => v.username === assignTargetUser);
    await onAssignContactsToVolunteer(
      slice.map((c) => c.id),
      assignTargetUser,
      true
    );
    setNotice(
      `✅ Se asignaron ${slice.length} contacto(s) a ${targetVol?.nombre || assignTargetUser} y se sincronizó su pestaña en Google Sheets.`
    );
  };

  const handleCreateManualVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVolNombre.trim() || !newVolUsername.trim() || !newVolPassword.trim()) {
      setNotice('⚠️ Completá Nombre, Usuario y Contraseña provisional.');
      return;
    }
    let res: { ok: boolean; message?: string } = { ok: false };
    if (onCreateVolunteer) {
      res = await onCreateVolunteer({
        nombre: newVolNombre.trim(),
        username: newVolUsername.trim().toLowerCase(),
        password: newVolPassword.trim(),
        telefono: newVolTel.trim(),
        barrioAsignado: newVolBarrio,
      });
    } else {
      try {
        const r = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: newVolNombre.trim(),
            username: newVolUsername.trim().toLowerCase(),
            password: newVolPassword.trim(),
            telefono: newVolTel.trim(),
            barrioAsignado: newVolBarrio,
            createdByAdmin: true,
          }),
        });
        const d = await r.json();
        res = { ok: Boolean(r.ok && d?.ok), message: d?.error || d?.message };
        if (res.ok && onRefreshVolunteers) {
          await onRefreshVolunteers();
        }
      } catch (err: any) {
        res = { ok: false, message: err?.message || 'Error al registrar voluntario.' };
      }
    }
    if (res.ok) {
      const msg = `✅ Voluntario "${newVolNombre.trim()}" (@${newVolUsername.trim().toLowerCase()}) dado de alta con su propia pestaña en Google Sheets.`;
      setNotice(msg);
      if (showNotice) showNotice(msg, 'ok');
      setNewVolNombre('');
      setNewVolUsername('');
      setNewVolPassword('');
      setNewVolTel('');
      setShowNewVolModal(false);
    } else {
      setNotice(`⚠️ ${res.message || 'No se pudo crear el voluntario.'}`);
    }
  };

  const microContacts = useMemo(() => {
    if (selectedVolunteerUsername === 'TODOS') return contacts.slice(0, 60);
    const st = volunteerStats.find(
      (v) => v.volunteer.username.toLowerCase() === selectedVolunteerUsername.toLowerCase()
    );
    return st ? st.assignedContacts : [];
  }, [selectedVolunteerUsername, volunteerStats, contacts]);

  return (
    <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 py-5 space-y-6">
      {/* CABECERA DEL PANEL DE ADMINISTRADOR */}
      <div className="rounded-2xl border-2 border-[#323232] bg-[#FFF06B] p-4 sm:p-5 shadow-[4px_4px_0px_#323232] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border-2 border-[#323232] bg-[#323232] p-2.5 text-[#FFF06B] shrink-0">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black font-display text-[#323232]">
                Panel de Administrador &amp; Coordinación de Voluntarios
              </h1>
              <span className="rounded-lg border-2 border-[#323232] bg-white px-2.5 py-0.5 text-xs font-black text-[#323232]">
                {volunteers.length} voluntario{volunteers.length === 1 ? '' : 's'} activo{volunteers.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-xs font-bold text-[#323232]/80 mt-0.5">
              Monitoreo Macro y Micro · Asignación por Barrio/Estado con Pestañas Separadas en Google Sheets · Política de Reasignación 48/72 hs
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onSwitchToVolunteerView({
                id: 'cesar',
                username: 'cesar',
                nombre: 'César Rincón',
                role: 'volunteer',
                barrioAsignado: 'Palermo',
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-white px-3.5 py-2 text-xs font-black text-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-[#ECEAE2] transition"
            title="Volver a la vista operativa de Candidatos como César"
          >
            <UserCheck className="h-4 w-4" />
            <span>Vista Voluntario (César)</span>
          </button>

          {onOpenLoginModal && (
            <button
              type="button"
              onClick={onOpenLoginModal}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#DFF4FF] px-3.5 py-2 text-xs font-black text-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-[#29B8FF] transition"
              title="Abrir modal de acceso o cambiar de cuenta de voluntario"
            >
              <KeyRound className="h-4 w-4" />
              <span>Cambiar Cuenta / Acceso</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowNewVolModal((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#323232] px-3.5 py-2 text-xs font-black text-[#FFF06B] shadow-[2px_2px_0px_#323232] hover:opacity-90 transition"
          >
            <UserPlus className="h-4 w-4" />
            <span>+ Dar de Alta Voluntario</span>
          </button>

          <button
            type="button"
            onClick={handleCopyInviteLink}
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-white px-3.5 py-2 text-xs font-black text-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-[#DFF4FF] transition"
            title={inviteUrl}
          >
            {copiedInvite ? <Check className="h-4 w-4 text-emerald-700" /> : <Link2 className="h-4 w-4" />}
            <span>{copiedInvite ? '¡Enlace de invitación copiado!' : `Copiar Link Invitación (${inviteCode})`}</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border-2 border-[#323232] bg-emerald-100 px-4 py-3 flex items-center justify-between text-xs font-bold text-[#323232] shadow-[2px_2px_0px_#323232]">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-4 font-black hover:text-[#FF2C00]"
          >
            ✕
          </button>
        </div>
      )}

      {/* MODAL / PANEL DE ALTA MANUAL DE VOLUNTARIO */}
      {showNewVolModal && (
        <form
          onSubmit={handleCreateManualVolunteer}
          className="rounded-2xl border-2 border-[#323232] bg-white p-5 shadow-[4px_4px_0px_#323232] space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[#323232]/20 pb-2.5">
            <h3 className="text-sm font-black font-display text-[#323232] flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Alta Manual de Nuevo Voluntario (también pueden registrarse con el enlace {inviteUrl})
            </h3>
            <button
              type="button"
              onClick={() => setShowNewVolModal(false)}
              className="text-xs font-bold text-[#5A5955] hover:text-[#323232]"
            >
              Cerrar ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#323232] mb-1">
                Nombre y Apellido
              </label>
              <input
                type="text"
                value={newVolNombre}
                onChange={(e) => setNewVolNombre(e.target.value)}
                placeholder="Ej: Martín Gómez"
                className="w-full rounded-xl border-2 border-[#323232] px-3 py-1.5 text-xs font-bold text-[#323232]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#323232] mb-1">
                Usuario de acceso
              </label>
              <input
                type="text"
                value={newVolUsername}
                onChange={(e) => setNewVolUsername(e.target.value)}
                placeholder="Ej: martin"
                className="w-full rounded-xl border-2 border-[#323232] px-3 py-1.5 text-xs font-bold text-[#323232]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#323232] mb-1">
                Contraseña provisional
              </label>
              <input
                type="text"
                value={newVolPassword}
                onChange={(e) => setNewVolPassword(e.target.value)}
                placeholder="Ej: popurri123"
                className="w-full rounded-xl border-2 border-[#323232] px-3 py-1.5 text-xs font-bold text-[#323232]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#323232] mb-1">
                WhatsApp del voluntario
              </label>
              <input
                type="text"
                value={newVolTel}
                onChange={(e) => setNewVolTel(e.target.value)}
                placeholder="11 2345-6789"
                className="w-full rounded-xl border-2 border-[#323232] px-3 py-1.5 text-xs font-bold text-[#323232]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#323232] mb-1">
                Barrio / Zona base
              </label>
              <select
                value={newVolBarrio}
                onChange={(e) => setNewVolBarrio(e.target.value)}
                className="w-full rounded-xl border-2 border-[#323232] bg-white px-3 py-1.5 text-xs font-bold text-[#323232]"
              >
                {safeBarrios.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-emerald-400 px-4 py-2 text-xs font-black text-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-emerald-300"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Crear Voluntario y Pestaña en Sheets</span>
            </button>
          </div>
        </form>
      )}

      {/* 1. POLÍTICA DE REASIGNACIÓN DE CONTACTOS (+48/72 HS SIN CONTACTAR) */}
      {alertasInactividad48h.length > 0 && (
        <div className="rounded-2xl border-2 border-[#FF2C00] bg-[#F5817F]/15 p-4 sm:p-5 shadow-[4px_4px_0px_#FF2C00] space-y-3">
          <div className="flex items-center gap-2 text-sm font-black font-display text-[#FF2C00]">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>
              Alerta de Seguimiento (48/72 hs): {alertasInactividad48h.length} voluntario(s) con contactos asignados hace +48 hs sin primer mensaje
            </span>
          </div>

          <div className="space-y-2.5">
            {alertasInactividad48h.map((alerta) => {
              const vol = alerta.volunteer;
              const targetReassign =
                reassignTargetByFromUser[vol.username] ||
                volunteers.find((v) => v.username !== vol.username)?.username ||
                'cesar';
              const reminderMsg = `Hola ${vol.nombre.split(' ')[0]}, ¿cómo estás? Te escribo desde la coordinación de *Hacemos Popurrí* porque vimos que te quedaron ${alerta.sinContactar48h.length} contactos asignados hace más de 48 hs pendientes de primer mensaje. ¿Podés escribirles hoy o preferís que los reasignemos a otro voluntario para darte una mano?`;
              const waReminderUrl = vol.telefono
                ? crearEnlaceWhatsApp(vol.telefono, reminderMsg)
                : `https://wa.me/?text=${encodeURIComponent(reminderMsg)}`;

              return (
                <div
                  key={vol.username}
                  className="rounded-xl border-2 border-[#323232] bg-white p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-xs font-black text-[#323232]">
                      👤 {vol.nombre} (@{vol.username}) tiene{' '}
                      <span className="text-[#FF2C00] underline">
                        {alerta.sinContactar48h.length} contacto(s)
                      </span>{' '}
                      asignados hace +48/72 hs sin contactar.
                    </p>
                    <p className="text-[11px] font-medium text-[#5A5955]">
                      Contactos demorados:{' '}
                      {alerta.sinContactar48h
                        .slice(0, 5)
                        .map((c) => `#${c.id} ${c.nombre || c.primerNombre} (${c.barrio})`)
                        .join(' · ')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      value={targetReassign}
                      onChange={(e) =>
                        setReassignTargetByFromUser((prev) => ({
                          ...prev,
                          [vol.username]: e.target.value,
                        }))
                      }
                      className="rounded-xl border-2 border-[#323232] bg-[#F5F4F0] px-2.5 py-1.5 text-xs font-bold text-[#323232]"
                    >
                      {volunteers
                        .filter((v) => v.username !== vol.username)
                        .map((v) => (
                          <option key={v.username} value={v.username}>
                            Reasignar a: {v.nombre}
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      onClick={async () => {
                        await onAssignContactsToVolunteer(
                          alerta.sinContactar48h.map((c) => c.id),
                          targetReassign,
                          true
                        );
                        setNotice(
                          `🔄 Se reasignaron ${alerta.sinContactar48h.length} contacto(s) demorados de ${vol.nombre} a @${targetReassign}.`
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-3 py-1.5 text-xs font-black text-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-[#ffe838]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Reasignar en 1 Clic</span>
                    </button>

                    <a
                      href={waReminderUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={async (e) => {
                        if (vol.telefono && onSendDirectWA) {
                          e.preventDefault();
                          await onSendDirectWA(
                            vol.telefono,
                            reminderMsg,
                            `vol-${vol.username}`,
                            vol.nombre,
                            vol.barrioAsignado || 'CABA'
                          );
                          setNotice(`📲 Recordatorio enviado por WhatsApp a ${vol.nombre}.`);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#DFF4FF] px-3 py-1.5 text-xs font-black text-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-[#29B8FF]"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Enviar Mensaje al Voluntario</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. ASIGNADOR DE CONTACTOS POR BARRIO, ESTADO Y CANTIDAD */}
      <div className="rounded-2xl border-2 border-[#323232] bg-white p-5 shadow-[4px_4px_0px_#323232] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#323232]/15 pb-3">
          <div>
            <h2 className="text-sm font-black font-display text-[#323232] flex items-center gap-2">
              <Filter className="h-4 w-4 text-[#29B8FF]" />
              Asignar Contactos a Voluntarios (con Pestaña Propia en Google Sheets)
            </h2>
            <p className="text-xs text-[#5A5955] font-medium">
              Los contactos asignados aparecen en la vista del voluntario y se sincronizan en su pestaña individual de Google Sheets.
            </p>
          </div>
          <span className="rounded-xl bg-[#DFF4FF] border border-[#323232] px-3 py-1 text-xs font-black text-[#323232]">
            {candidatosParaAsignar.length} disponibles con este filtro
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold text-[#323232] mb-1">
              1. Filtrar por Barrio:
            </label>
            <select
              value={assignBarrio}
              onChange={(e) => setAssignBarrio(e.target.value)}
              className="w-full rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-bold text-[#323232]"
            >
              <option value="Todos">Todos los barrios CABA</option>
              {safeBarrios.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#323232] mb-1">
              2. Filtrar por Estado:
            </label>
            <select
              value={assignEstado}
              onChange={(e) => setAssignEstado(e.target.value)}
              className="w-full rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-bold text-[#323232]"
            >
              <option value="SIN_CONTACTAR_1ER_MSJ">1. Nuevo · Sin 1er mensaje</option>
              <option value="FALTA_NOMBRE_Y_APELLIDO">1b. Nuevo · Falta Nombre</option>
              <option value="1ER_MSJ_ENVIADO_SIN_RSP">2. 1er Msj Enviado · Esperando respuesta</option>
              <option value="RESPONDIO_FALTA_DNI_O_ZONA">3. Respondió · Falta calle/esquina o día</option>
              <option value="PASO_DATOS_FALTA_CONFIRMAR">4. Pasó dirección/horario · Falta confirmar</option>
              <option value="ENCUENTRO_CONFIRMADO">5. Encuentro Confirmado (En Ruta)</option>
              <option value="TODOS">Todos los estados</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#323232] mb-1">
              3. Cantidad a asignar:
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={assignCantidad}
              onChange={(e) => setAssignCantidad(Number(e.target.value) || 10)}
              className="w-full rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-bold text-[#323232]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#323232] mb-1">
              4. Asignar al Voluntario:
            </label>
            <select
              value={assignTargetUser}
              onChange={(e) => setAssignTargetUser(e.target.value)}
              className="w-full rounded-xl border-2 border-[#323232] bg-[#FFF06B]/40 px-3 py-2 text-xs font-black text-[#323232]"
            >
              {volunteers.map((v) => (
                <option key={v.username} value={v.username}>
                  {v.nombre} (@{v.username})
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              type="button"
              onClick={handleAssignBatch}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-4 py-2 text-xs font-black text-[#323232] shadow-[2px_2px_0px_#323232] hover:bg-[#ffe838] transition"
            >
              <ArrowRight className="h-4 w-4" />
              <span>Asignar Lote ({Math.min(assignCantidad, candidatosParaAsignar.length)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. MONITOR MACRO DE VOLUNTARIOS */}
      <div className="rounded-2xl border-2 border-[#323232] bg-white p-5 shadow-[4px_4px_0px_#323232] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#323232]/15 pb-3">
          <div>
            <h2 className="text-sm font-black font-display text-[#323232] flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-700" />
              Monitoreo Macro por Voluntario (Rendimiento y Pestañas en Google Sheets)
            </h2>
            <p className="text-xs text-[#5A5955] font-medium">
              Hacé clic en &ldquo;Ver Auditoría Micro&rdquo; para inspeccionar las fichas de un voluntario o en &ldquo;Sincronizar Pestaña Sheets&rdquo; para actualizar su hoja individual.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {volunteerStats.map((st) => {
            const isSelected = selectedVolunteerUsername === st.volunteer.username;
            const tabName =
              st.volunteer.username === 'cesar'
                ? 'Control (Principal) + Voluntario - César'
                : st.volunteer.sheetTabName || `Voluntario - ${st.volunteer.nombre}`;
            return (
              <div
                key={st.volunteer.username}
                className={`rounded-2xl border-2 p-4 space-y-3 transition ${
                  isSelected
                    ? 'border-[#323232] bg-[#FFF06B]/20 shadow-[4px_4px_0px_#323232]'
                    : 'border-[#323232] bg-white shadow-[2px_2px_0px_#323232]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black font-display text-[#323232]">
                        {st.volunteer.nombre}
                      </h3>
                      <span className="rounded bg-[#323232] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#FFF06B]">
                        @{st.volunteer.username}
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold text-[#5A5955] mt-0.5">
                      📑 Pestaña Sheets: <strong className="text-[#323232]">{tabName}</strong>
                    </p>
                  </div>

                  <span className="rounded-lg bg-[#DFF4FF] border border-[#323232] px-2 py-0.5 text-xs font-black text-[#323232]">
                    {st.totalAsignados} asignados
                  </span>
                </div>

                {/* KPIs resumidos del voluntario */}
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="rounded-xl border border-[#323232]/30 bg-[#F5F4F0] p-2">
                    <span className="block text-[10px] font-bold uppercase text-[#5A5955]">
                      Sin 1er Msj
                    </span>
                    <span className="text-sm font-black text-[#323232]">
                      {st.sinContactarCount}
                    </span>
                  </div>
                  <div className="rounded-xl border border-[#323232]/30 bg-[#DFF4FF]/60 p-2">
                    <span className="block text-[10px] font-bold uppercase text-[#5A5955]">
                      En Convers.
                    </span>
                    <span className="text-sm font-black text-[#323232]">
                      {st.enConversacionCount + st.confirmadosCount}
                    </span>
                  </div>
                  <div className="rounded-xl border border-[#323232]/30 bg-emerald-100 p-2">
                    <span className="block text-[10px] font-bold uppercase text-emerald-950">
                      Firmaron
                    </span>
                    <span className="text-sm font-black text-emerald-950">
                      {st.adheridosCount}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-bold text-[#5A5955]">
                  <span>⚡ Contactados hoy: {st.contactadosHoyCount}</span>
                  {st.sinContactar48h.length > 0 ? (
                    <span className="text-[#FF2C00] font-black">
                      ⚠️ {st.sinContactar48h.length} sin tocar (+48h)
                    </span>
                  ) : (
                    <span className="text-emerald-800">✅ Al día (&lt;48h)</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#323232]/15">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedVolunteerUsername(
                        isSelected ? 'TODOS' : st.volunteer.username
                      )
                    }
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1.5 text-[11px] font-black text-[#323232] hover:bg-[#FFF06B]"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{isSelected ? 'Viendo Micro' : 'Auditoría Micro'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={syncingTabUser === st.volunteer.username}
                    onClick={async () => {
                      setSyncingTabUser(st.volunteer.username);
                      try {
                        if (onSyncVolunteerSheetTab) {
                          const r = await onSyncVolunteerSheetTab(st.volunteer.username);
                          setNotice(r.message);
                        } else {
                          const resp = await fetch('/api/admin/sync-volunteer-sheet', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              volunteerUsername: st.volunteer.username,
                              volunteerName: st.volunteer.nombre,
                              sheetUrlOrId: sheetUrlInput,
                            }),
                          });
                          const d = await resp.json();
                          const msg = d?.ok
                            ? `✅ Pestaña "${d.tabName}" sincronizada (${d.rowCount} contactos).`
                            : `⚠️ ${d?.error || 'No se pudo sincronizar la pestaña.'}`;
                          setNotice(msg);
                          if (showNotice) showNotice(msg, d?.ok ? 'ok' : 'warn');
                        }
                      } finally {
                        setSyncingTabUser(null);
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border-2 border-[#323232] bg-emerald-100 px-2.5 py-1.5 text-[11px] font-black text-emerald-950 hover:bg-emerald-200"
                    title="Crear o actualizar la pestaña individual de este voluntario en Google Sheets"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span>
                      {syncingTabUser === st.volunteer.username ? 'Sincronizando...' : 'Pestaña Sheets'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSwitchToVolunteerView(st.volunteer)}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border-2 border-[#323232] bg-[#DFF4FF] px-2.5 py-1.5 text-[11px] font-black text-[#323232] hover:bg-[#29B8FF]"
                    title="Abrir la vista de trabajo de este voluntario"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Vista</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. AUDITORÍA MICRO DE CONTACTOS DEL VOLUNTARIO SELECCIONADO */}
      <div className="rounded-2xl border-2 border-[#323232] bg-white p-5 shadow-[4px_4px_0px_#323232] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#323232]/15 pb-3">
          <div>
            <h2 className="text-sm font-black font-display text-[#323232]">
              🔍 Auditoría Micro de Fichas Asignadas (
              {selectedVolunteerUsername === 'TODOS'
                ? 'Vista general · primeros 60'
                : `@${selectedVolunteerUsername} · ${microContacts.length} contactos`}
              )
            </h2>
            <p className="text-xs text-[#5A5955] font-medium">
              Detalle contacto por contacto: estado actual, último mensaje enviado desde la app y comentario.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedVolunteerUsername('TODOS')}
              className={`rounded-xl border-2 border-[#323232] px-3 py-1 text-xs font-black ${
                selectedVolunteerUsername === 'TODOS'
                  ? 'bg-[#323232] text-[#FFF06B]'
                  : 'bg-white text-[#323232]'
              }`}
            >
              Todos
            </button>
            {volunteers.map((v) => (
              <button
                key={v.username}
                type="button"
                onClick={() => setSelectedVolunteerUsername(v.username)}
                className={`rounded-xl border-2 border-[#323232] px-3 py-1 text-xs font-black ${
                  selectedVolunteerUsername === v.username
                    ? 'bg-[#FFF06B] text-[#323232]'
                    : 'bg-white text-[#323232]'
                }`}
              >
                {v.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
          {microContacts.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-[#323232]/30 bg-[#F5F4F0]/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#323232] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#FFF06B]">
                    #{c.id}
                  </span>
                  <span className="font-black text-[#323232]">
                    {c.nombreCompletoCorregido || c.nombre || `Contacto #${c.id}`}
                  </span>
                  <span className="rounded bg-[#DFF4FF] border border-[#323232]/30 px-2 py-0.5 text-[10px] font-bold text-[#323232]">
                    <MapPin className="h-2.5 w-2.5 inline mr-0.5" />
                    {c.barrio}
                  </span>
                  <span className="rounded bg-[#FFF06B] border border-[#323232]/40 px-2 py-0.5 text-[10px] font-bold text-[#323232]">
                    {c.estadoFlujoEtiqueta}
                  </span>
                  <span className="rounded bg-white border border-[#323232]/30 px-2 py-0.5 text-[10px] font-bold text-[#5A5955]">
                    👤 Voluntario: @{c.asignadoA || 'cesar'}
                  </span>
                </div>
                <p className="text-[11px] text-[#5A5955] truncate">
                  {c.comentario || 'Sin comentario'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onJumpToCandidate(c.id)}
                  className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-3 py-1 text-xs font-black text-[#323232] hover:bg-[#FFF06B]"
                >
                  <span>Abrir Ficha</span>
                </button>
                {onDeleteContact &&
                  (confirmDeleteId === String(c.id) ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          setConfirmDeleteId(null);
                          await onDeleteContact(String(c.id));
                        }}
                        className="rounded-xl border-2 border-[#323232] bg-[#FF2C00] px-2.5 py-1 text-[11px] font-black text-white hover:opacity-90"
                      >
                        Confirmar Borrar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-xl border border-[#323232] bg-white px-2 py-1 text-[11px] font-bold text-[#323232]"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(String(c.id))}
                      className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#F5817F]/30 px-2.5 py-1 text-xs font-black text-[#323232] hover:bg-[#FF2C00] hover:text-white transition"
                      title="Eliminar contacto del padrón y de Google Sheets (Sólo Administrador)"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Eliminar</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
