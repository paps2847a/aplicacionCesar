import React, { useState } from 'react';
import { Shield, User, Lock, KeyRound, UserPlus, X, LogIn } from 'lucide-react';

export interface AppUserSession {
  id: string;
  username: string;
  nombre: string;
  apellido?: string;
  role: 'admin' | 'volunteer' | 'ADMIN' | 'VOLUNTARIO';
  telefono?: string;
  barrioAsignado?: string;
  sheetTabName?: string;
  createdAt?: string;
  canSwitchToAdmin?: boolean;
}

export type AppUserAccount = AppUserSession;

export const isAdminUserRole = (role?: string | null): boolean => {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'administrador';
};

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
  currentUser?: AppUserSession | null;
  users?: AppUserSession[];
  inviteCodeFromUrl?: string | null;
  onLoginSuccess: (user: AppUserSession) => void;
  onRegisterVolunteer?: (data: {
    nombre: string;
    username: string;
    password: string;
    telefono: string;
    inviteCode: string;
  }) => Promise<{ ok: boolean; message?: string; user?: AppUserSession }>;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  users = [],
  inviteCodeFromUrl,
  onLoginSuccess,
  onRegisterVolunteer,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(
    inviteCodeFromUrl ? 'register' : 'login'
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [regNombre, setRegNombre] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regTelefono, setRegTelefono] = useState('');
  const [regInviteCode, setRegInviteCode] = useState(inviteCodeFromUrl || 'POPURRI-VOL-2026');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const safeUsers = Array.isArray(users) ? users : [];
  const activeUsername = String(currentUser?.username || 'cesar').toLowerCase();
  const activeIsAdmin = isAdminUserRole(currentUser?.role);

  const normalizeUser = (u: Partial<AppUserSession>, fallbackRole: 'admin' | 'volunteer' = 'volunteer'): AppUserSession => {
    const uname = String(u.username || 'cesar').trim().toLowerCase();
    const roleNorm: 'admin' | 'volunteer' =
      uname === 'admin' || isAdminUserRole(u.role) ? 'admin' : fallbackRole;
    return {
      id: String(u.id || uname),
      username: uname,
      nombre: String(u.nombre || (roleNorm === 'admin' ? 'Default / Admin' : 'César Rincón')),
      role: roleNorm,
      telefono: u.telefono,
      barrioAsignado: u.barrioAsignado || 'Palermo',
      sheetTabName: u.sheetTabName || (uname === 'cesar' ? 'Control' : `Voluntario - ${u.nombre || uname}`),
      createdAt: u.createdAt || new Date().toISOString(),
      canSwitchToAdmin: true,
    };
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanU = username.trim().toLowerCase();
    if (!cleanU) {
      setErrorMsg('Ingresá tu nombre de usuario (ej. cesar o admin).');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanU, password }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.user) {
        setErrorMsg(data?.error || data?.message || 'Usuario o contraseña incorrectos.');
      } else {
        onLoginSuccess(normalizeUser(data.user));
        if (onClose) onClose();
      }
    } catch {
      const found = safeUsers.find((u) => String(u.username || '').toLowerCase() === cleanU);
      if (found) {
        onLoginSuccess(normalizeUser(found));
        if (onClose) onClose();
      } else if (cleanU === 'cesar' || cleanU === 'admin') {
        onLoginSuccess(
          normalizeUser(
            {
              id: cleanU,
              username: cleanU,
              nombre: cleanU === 'admin' ? 'Default / Admin (Coordinación)' : 'César Rincón',
              role: cleanU === 'admin' ? 'admin' : 'volunteer',
            },
            cleanU === 'admin' ? 'admin' : 'volunteer'
          )
        );
        if (onClose) onClose();
      } else {
        setErrorMsg('No se pudo verificar el acceso.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!regNombre.trim() || !regUsername.trim() || !regPassword.trim()) {
      setErrorMsg('Completá nombre, usuario y contraseña.');
      return;
    }
    setLoading(true);
    try {
      if (onRegisterVolunteer) {
        const res = await onRegisterVolunteer({
          nombre: regNombre.trim(),
          username: regUsername.trim().toLowerCase(),
          password: regPassword,
          telefono: regTelefono.trim(),
          inviteCode: regInviteCode.trim(),
        });
        if (!res.ok || !res.user) {
          setErrorMsg(res.message || 'No se pudo completar el registro.');
        } else {
          onLoginSuccess(normalizeUser(res.user, 'volunteer'));
          if (onClose) onClose();
        }
        return;
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: regNombre.trim(),
          username: regUsername.trim().toLowerCase(),
          password: regPassword,
          telefono: regTelefono.trim(),
          inviteCode: regInviteCode.trim() || 'POPURRI-VOL-2026',
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok || !data?.user) {
        setErrorMsg(data?.error || data?.message || 'No se pudo completar el registro.');
      } else {
        onLoginSuccess(normalizeUser(data.user, 'volunteer'));
        if (onClose) onClose();
      }
    } catch {
      setErrorMsg('Error de conexión al registrar el voluntario.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border-2 border-[#323232] bg-white shadow-[6px_6px_0px_#323232] overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b-2 border-[#323232] bg-[#FFF06B] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl border-2 border-[#323232] bg-[#323232] p-2 text-[#FFF06B]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black font-display text-[#323232]">
                Acceso a POPURRÍ · CABA
              </h3>
              <p className="text-xs font-bold text-[#323232]/80">
                Sesión actual: {currentUser?.nombre || 'César Rincón'} (
                {activeIsAdmin ? 'Administrador' : 'Voluntario'})
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border-2 border-[#323232] bg-white p-1.5 text-[#323232] hover:bg-[#FF2C00] hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Acceso rápido 1 clic entre César (Voluntario) y Default/Admin */}
          <div className="rounded-xl border-2 border-[#323232] bg-[#F5F4F0] p-3 space-y-2">
            <span className="block text-[10px] font-black uppercase tracking-wider text-[#5A5955]">
              Cambio rápido de perfil (César / Admin):
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  const foundCesar = safeUsers.find(
                    (u) => String(u.username || '').toLowerCase() === 'cesar'
                  );
                  const cesar = normalizeUser(
                    foundCesar || {
                      id: 'cesar',
                      username: 'cesar',
                      nombre: 'César Rincón',
                      role: 'volunteer',
                      barrioAsignado: 'Palermo',
                      sheetTabName: 'Control',
                    },
                    'volunteer'
                  );
                  onLoginSuccess(cesar);
                  if (onClose) onClose();
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl border-2 border-[#323232] px-3 py-2 text-xs font-black transition shadow-[2px_2px_0px_#323232] cursor-pointer ${
                  !activeIsAdmin && activeUsername === 'cesar'
                    ? 'bg-[#FFF06B] text-[#323232]'
                    : 'bg-white text-[#323232] hover:bg-[#ECEAE2]'
                }`}
              >
                <User className="h-3.5 w-3.5" />
                <span>Voluntario (César)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const foundAdmin = safeUsers.find(
                    (u) => String(u.username || '').toLowerCase() === 'admin'
                  );
                  const admin = normalizeUser(
                    foundAdmin || {
                      id: 'admin',
                      username: 'admin',
                      nombre: 'Default / Admin (Coordinación)',
                      role: 'admin',
                      sheetTabName: 'Control',
                    },
                    'admin'
                  );
                  onLoginSuccess(admin);
                  if (onClose) onClose();
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl border-2 border-[#323232] px-3 py-2 text-xs font-black transition shadow-[2px_2px_0px_#323232] cursor-pointer ${
                  activeIsAdmin
                    ? 'bg-[#29B8FF] text-[#323232]'
                    : 'bg-white text-[#323232] hover:bg-[#DFF4FF]'
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                <span>Default / Admin</span>
              </button>
            </div>
          </div>

          {/* Pestañas Iniciar Sesión vs Registro por Invitación */}
          <div className="flex rounded-xl border-2 border-[#323232] bg-[#ECEAE2] p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-black transition ${
                mode === 'login' ? 'bg-[#323232] text-[#FFF06B]' : 'text-[#323232]'
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
              }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-black transition ${
                mode === 'register' ? 'bg-[#323232] text-[#FFF06B]' : 'text-[#323232]'
              }`}
            >
              Registrarme con Invitación
            </button>
          </div>

          {errorMsg && (
            <div className="rounded-xl border-2 border-[#323232] bg-[#F5817F]/30 px-3 py-2 text-xs font-bold text-[#323232]">
              ⚠️ {errorMsg}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#323232] mb-1">
                  Usuario
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-[#5A5955] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ej: cesar, admin o tu usuario de voluntario"
                    className="w-full rounded-xl border-2 border-[#323232] bg-white pl-9 pr-3 py-2 text-xs font-bold text-[#323232]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#323232] mb-1">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-[#5A5955] absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border-2 border-[#323232] bg-white pl-9 pr-3 py-2 text-xs font-bold text-[#323232]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-4 py-2.5 text-xs font-black text-[#323232] shadow-[3px_3px_0px_#323232] hover:bg-[#ffe838] transition"
              >
                <LogIn className="h-4 w-4" />
                <span>{loading ? 'Ingresando...' : 'Ingresar a la Plataforma'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#323232] mb-1">
                  Código de Invitación (provisto por el Administrador)
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-[#5A5955] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={regInviteCode}
                    onChange={(e) => setRegInviteCode(e.target.value)}
                    placeholder="Ej: POPURRI-VOL-2026"
                    className="w-full rounded-xl border-2 border-[#323232] bg-[#FFF06B]/30 pl-9 pr-3 py-2 text-xs font-mono font-bold text-[#323232]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#323232] mb-1">
                  Nombre y Apellido
                </label>
                <input
                  type="text"
                  value={regNombre}
                  onChange={(e) => setRegNombre(e.target.value)}
                  placeholder="Ej: Sofía Gómez"
                  className="w-full rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-bold text-[#323232]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#323232] mb-1">
                    Usuario elegido
                  </label>
                  <input
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="Ej: sofia"
                    className="w-full rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-bold text-[#323232]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#323232] mb-1">
                    WhatsApp (para alertas)
                  </label>
                  <input
                    type="text"
                    value={regTelefono}
                    onChange={(e) => setRegTelefono(e.target.value)}
                    placeholder="11 1234-5678"
                    className="w-full rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-bold text-[#323232]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#323232] mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Elegí tu contraseña"
                  className="w-full rounded-xl border-2 border-[#323232] bg-white px-3 py-2 text-xs font-bold text-[#323232]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#323232] bg-emerald-400 px-4 py-2.5 text-xs font-black text-[#323232] shadow-[3px_3px_0px_#323232] hover:bg-emerald-300 transition"
              >
                <UserPlus className="h-4 w-4" />
                <span>{loading ? 'Creando cuenta...' : 'Crear Cuenta de Voluntario'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
