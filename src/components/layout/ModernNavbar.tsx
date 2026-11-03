import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  MapPin,
  Calendar,
  Smartphone,
  Settings,
  RefreshCw,
  ClipboardCheck,
  AlertTriangle,
  Camera,
  ArrowUp,
  Shield,
  User,
  LogOut,
  ImagePlus,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PopurriBrandLogo } from './PopurriBrandLogo';

export type ModernTabType =
  | 'pipeline'
  | 'mapa'
  | 'plan_hoy'
  | 'whatsapp'
  | 'configuracion'
  | 'admin';

interface ModernNavbarProps {
  activeTab: ModernTabType;
  onTabChange: (tab: ModernTabType) => void;
  totalContacts: number;
  signedCount: number;
  overdueCount?: number;
  whatsAppStatus: string;
  isSyncingSheets: boolean;
  onSyncSheets: () => void;
  onOpenAutoWAModal?: () => void;
  onOpenCierreModal?: () => void;
  onOpenDailyCloseModal?: () => void;
  onOpenScannerModal?: () => void;
  currentUser?: {
    id: string;
    username: string;
    nombre: string;
    role: 'admin' | 'volunteer' | 'ADMIN' | 'VOLUNTARIO';
  } | null;
  onOpenLoginModal?: () => void;
  onLogout?: () => void;
  userAvatarUrl?: string;
  onUpdateAvatarUrl?: (avatarUrl: string) => void;
  staleAlertsCount?: number;
}

export const ModernNavbar: React.FC<ModernNavbarProps> = ({
  activeTab,
  onTabChange,
  totalContacts,
  signedCount,
  overdueCount = 0,
  whatsAppStatus,
  isSyncingSheets,
  onSyncSheets,
  onOpenCierreModal,
  onOpenDailyCloseModal,
  onOpenScannerModal,
  currentUser,
  onOpenLoginModal,
  onLogout,
  userAvatarUrl,
  onUpdateAvatarUrl,
  staleAlertsCount = 0,
}) => {
  const handleCierre = onOpenCierreModal || onOpenDailyCloseModal;
  const [isScrolledCompact, setIsScrolledCompact] = useState(false);
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateAvatarUrl) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 160;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          onUpdateAvatarUrl(compressedDataUrl);
        } else if (typeof reader.result === 'string') {
          onUpdateAvatarUrl(reader.result);
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const displayUserName =
    (currentUser?.nombre || 'César').split(' ')[0] === 'Default'
      ? 'César'
      : currentUser?.nombre || 'César';

  useEffect(() => {
    const getScrollY = () => {
      const rootEl = document.getElementById('root');
      return Math.max(
        window.scrollY || 0,
        window.pageYOffset || 0,
        document.documentElement?.scrollTop || 0,
        document.body?.scrollTop || 0,
        rootEl?.scrollTop || 0
      );
    };
    const handleScroll = () => {
      const y = getScrollY();
      setIsScrolledCompact(y > 75);
      setShowScrollTopBtn(y > 200);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true } as EventListenerOptions);
      document.removeEventListener('scroll', handleScroll, { capture: true } as EventListenerOptions);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement?.scrollTo?.({ top: 0, behavior: 'smooth' });
    document.body?.scrollTo?.({ top: 0, behavior: 'smooth' });
    document.getElementById('root')?.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const tabs = [
    {
      id: 'pipeline' as ModernTabType,
      label: 'Candidatos',
      shortLabel: 'Candidatos',
      icon: Users,
      badge: totalContacts,
    },
    {
      id: 'plan_hoy' as ModernTabType,
      label: 'Planificador & Hoy',
      shortLabel: 'Plan Hoy',
      icon: Calendar,
      alertBadge: overdueCount > 0 ? overdueCount : undefined,
    },
    {
      id: 'mapa' as ModernTabType,
      label: 'Mapa & Cafés',
      shortLabel: 'Mapa',
      icon: MapPin,
    },
    {
      id: 'whatsapp' as ModernTabType,
      label: 'WhatsApp Web',
      shortLabel: 'WhatsApp',
      icon: Smartphone,
      isWA: true,
    },
    {
      id: 'configuracion' as ModernTabType,
      label: 'Configuración',
      shortLabel: 'Ajustes',
      icon: Settings,
    },
  ];

  const isAdminRole =
    String(currentUser?.role || '').toLowerCase() === 'admin' || activeTab === 'admin';

  return (
    <>
    <header
      className={`relative z-30 w-full max-w-full border-b-2 border-[#323232] bg-[#F5F4F0]/95 backdrop-blur-md transition-opacity duration-150 ${
        isScrolledCompact ? 'opacity-0 pointer-events-none invisible' : 'opacity-100'
      }`}
    >
      <div className="mx-auto flex h-15 sm:h-16 max-w-[1600px] w-full min-w-0 items-center justify-between px-2.5 sm:px-4 gap-1.5 xl:gap-2">
        {/* Identidad Gráfica Oficial POPURRÍ (Vector Sombra 3D Azul Petróleo Oscuro #25323A + Fondo Celeste #2988FF) */}
        <div
          onClick={() => onTabChange('pipeline')}
          className="flex items-center gap-2 shrink-0 cursor-pointer group"
        >
          <PopurriBrandLogo className="h-6 sm:h-7 w-auto shrink-0" />

          <div className="shrink-0">
            <div className="flex items-center gap-1 whitespace-nowrap">
              <span className="font-display text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#323232]">
                Rutas CABA
              </span>
              <span className="hidden sm:inline-block xl:hidden rounded-md bg-[#29B8FF] px-1.5 py-0.5 font-display text-[10px] font-bold text-[#323232] border border-[#323232]">
                Regeneración
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] font-semibold text-[#5A5955] whitespace-nowrap">
              <span className="font-bold text-[#323232] bg-[#FFF06B] px-1 rounded border border-[#323232]/30">
                {signedCount}
              </span>{' '}
              firmas · <span className="font-bold text-[#323232]">{totalContacts}</span> padrón
            </p>
          </div>
        </div>

        {/* Central Segmented Tab Control (Desktop xl+) */}
        <nav className="hidden xl:flex items-center gap-0.5 rounded-xl bg-[#ECEAE2] p-1 border-2 border-[#323232] shadow-[2px_2px_0px_#323232] min-w-0 shrink">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex items-center gap-1 rounded-lg px-2 2xl:px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors font-display ${
                  isActive
                    ? 'text-[#323232]'
                    : 'text-[#5A5955] hover:text-[#323232]'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 rounded-lg bg-[#FFF06B] border-2 border-[#323232] shadow-[2px_2px_0px_#323232]"
                    transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="2xl:hidden">{tab.shortLabel}</span>
                  <span className="hidden 2xl:inline">{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`rounded-md px-1 py-0.2 text-[10px] font-bold border ${
                        isActive
                          ? 'bg-[#323232] text-[#FFF06B] border-[#323232]'
                          : 'bg-white text-[#323232] border-[#323232]/40'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                  {tab.alertBadge !== undefined && (
                    <span
                      title={`${tab.alertBadge} citas vencidas o por reprogramar`}
                      className="inline-flex items-center gap-0.5 rounded-md bg-[#FF2C00] px-1 py-0.2 text-[10px] font-bold text-white border border-[#323232]"
                    >
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {tab.alertBadge}
                    </span>
                  )}
                  {tab.isWA && (
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 border border-[#323232] ${
                        whatsAppStatus === 'READY'
                          ? 'bg-emerald-500 animate-pulse'
                          : whatsAppStatus === 'QR_READY'
                          ? 'bg-[#FFF06B]'
                          : 'bg-slate-300'
                      }`}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Action Buttons + Circular User Silhouette/Photo Button with Dropdown */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenScannerModal && (
            <button
              onClick={onOpenScannerModal}
              className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-2.5 py-1.5 text-[11px] font-bold text-[#323232] hover:bg-[#ffe838] transition shadow-[2px_2px_0px_#323232] whitespace-nowrap font-display"
              title="Escanear ficha física con IA y abrir Formulario de Carga de Adhesiones"
            >
              <Camera className="h-3.5 w-3.5 text-[#323232] shrink-0" />
              <span className="hidden 2xl:inline">Escanear Ficha</span>
              <span className="2xl:hidden">Ficha</span>
            </button>
          )}
          {handleCierre && (
            <button
              onClick={handleCierre}
              className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-[#DFF4FF] px-2.5 py-1.5 text-[11px] font-bold text-[#323232] hover:bg-[#29B8FF] transition shadow-[2px_2px_0px_#323232] whitespace-nowrap font-display"
              title="Ver resumen diario de actividad para Google Forms"
            >
              <ClipboardCheck className="h-3.5 w-3.5 text-[#323232] shrink-0" />
              <span className="hidden 2xl:inline">Cierre Forms</span>
              <span className="2xl:hidden">Cierre</span>
            </button>
          )}

          <button
            onClick={onSyncSheets}
            disabled={isSyncingSheets}
            className="inline-flex items-center gap-1 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#323232] hover:bg-[#ECEAE2] transition shadow-[2px_2px_0px_#323232] disabled:opacity-60 whitespace-nowrap font-display"
            title="Sincronizar padrón en vivo desde Google Sheets (Pestaña Control)"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-[#323232] shrink-0 ${
                isSyncingSheets ? 'animate-spin text-[#29B8FF]' : ''
              }`}
            />
            <span>{isSyncingSheets ? 'Sync...' : 'Sheets'}</span>
          </button>

          {/* Ícono Circular de Usuario (Silueta o Foto Personalizada) con Menú Desplegable */}
          <div className="relative shrink-0" ref={userMenuRef}>
            <input
              ref={avatarFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#323232] transition shadow-[2px_2px_0px_#323232] cursor-pointer overflow-hidden ${
                activeTab === 'admin' || userMenuOpen
                  ? 'bg-[#323232] text-[#FFF06B] ring-2 ring-[#FFF06B]'
                  : 'bg-[#FFF06B] text-[#323232] hover:bg-[#29B8FF]'
              }`}
              title={`Menú de Usuario (${displayUserName}): Gestionar perfil, foto, panel admin y cerrar sesión`}
              aria-label="Menú de usuario"
            >
              {userAvatarUrl ? (
                <img
                  src={userAvatarUrl}
                  alt={displayUserName}
                  className="h-full w-full object-cover rounded-full"
                />
              ) : (
                <User className="h-5 w-5 stroke-[2.4]" />
              )}
              {staleAlertsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#323232] bg-[#FF2C00] text-[8px] font-black text-white">
                  {staleAlertsCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.14 }}
                  className="absolute right-0 top-full mt-2 w-72 rounded-2xl border-2 border-[#323232] bg-white p-3 shadow-[4px_4px_0px_#323232] z-50 space-y-2.5"
                >
                  {/* Encabezado de Perfil y Personalización de Foto */}
                  <div className="flex items-center gap-3 rounded-xl border border-[#323232]/20 bg-[#F5F4F0] p-2.5">
                    <div
                      onClick={() => avatarFileInputRef.current?.click()}
                      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#323232] bg-[#FFF06B] overflow-hidden cursor-pointer group"
                      title="Hacé clic para subir o cambiar tu foto de perfil"
                    >
                      {userAvatarUrl ? (
                        <img
                          src={userAvatarUrl}
                          alt={displayUserName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User className="h-6 w-6 text-[#323232] stroke-[2.25]" />
                      )}
                      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <ImagePlus className="h-4 w-4 text-white" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-[#323232] truncate font-display">
                        {displayUserName}
                      </p>
                      <p className="text-[10px] font-bold text-[#5A5955] truncate">
                        {isAdminRole ? '🛡️ Coordinación & Admin' : '🙌 Voluntario en Terreno'}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => avatarFileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 rounded-md border border-[#323232] bg-white px-2 py-0.5 text-[10px] font-black text-[#323232] hover:bg-[#FFF06B] transition cursor-pointer"
                        >
                          <ImagePlus className="h-2.5 w-2.5" />
                          <span>{userAvatarUrl ? 'Cambiar foto' : 'Subir foto'}</span>
                        </button>
                        {userAvatarUrl && onUpdateAvatarUrl && (
                          <button
                            type="button"
                            onClick={() => onUpdateAvatarUrl('')}
                            className="inline-flex items-center gap-0.5 rounded-md border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                            title="Quitar foto y volver a la silueta"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Opciones del Menú */}
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        onTabChange('configuracion');
                        setUserMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#323232] hover:bg-[#FFF06B] transition cursor-pointer"
                    >
                      <Settings className="h-4 w-4 shrink-0 text-[#323232]" />
                      <div>
                        <span className="block font-black">Gestionar Perfil y Ajustes</span>
                        <span className="block text-[10px] text-[#5A5955]">
                          Punto de partida, estilo de voz y conexiones
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onTabChange(activeTab === 'admin' ? 'pipeline' : 'admin');
                        setUserMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition cursor-pointer ${
                        activeTab === 'admin'
                          ? 'bg-[#323232] text-[#FFF06B]'
                          : 'text-[#323232] hover:bg-[#DFF4FF]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Shield className="h-4 w-4 shrink-0" />
                        <div>
                          <span className="block font-black">
                            {activeTab === 'admin'
                              ? 'Volver a Vista Candidatos'
                              : 'Panel de Coordinación & Admin'}
                          </span>
                          <span
                            className={`block text-[10px] ${
                              activeTab === 'admin' ? 'text-[#FFF06B]/80' : 'text-[#5A5955]'
                            }`}
                          >
                            Asignación por zonas y seguimiento de equipo
                          </span>
                        </div>
                      </div>
                      {staleAlertsCount > 0 && (
                        <span className="rounded-md bg-[#FF2C00] px-1.5 py-0.5 text-[10px] font-black text-white border border-[#323232]">
                          {staleAlertsCount}
                        </span>
                      )}
                    </button>

                    {onOpenScannerModal && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenScannerModal();
                          setUserMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#323232] hover:bg-[#ECEAE2] transition cursor-pointer"
                      >
                        <Camera className="h-4 w-4 shrink-0 text-[#323232]" />
                        <span>Escanear Ficha Física con IA</span>
                      </button>
                    )}

                    {handleCierre && (
                      <button
                        type="button"
                        onClick={() => {
                          handleCierre();
                          setUserMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#323232] hover:bg-[#ECEAE2] transition cursor-pointer"
                      >
                        <ClipboardCheck className="h-4 w-4 shrink-0 text-[#323232]" />
                        <span>Cierre Diario de Actividad (Forms)</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        onSyncSheets();
                        setUserMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#323232] hover:bg-[#ECEAE2] transition cursor-pointer"
                    >
                      <RefreshCw
                        className={`h-4 w-4 shrink-0 text-[#323232] ${
                          isSyncingSheets ? 'animate-spin text-[#29B8FF]' : ''
                        }`}
                      />
                      <span>Sincronizar Google Sheets ahora</span>
                    </button>
                  </div>

                  {/* Separador + Cerrar Sesión / Cambiar Usuario */}
                  <div className="border-t border-[#323232]/15 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        if (onLogout) {
                          onLogout();
                        } else if (onOpenLoginModal) {
                          onOpenLoginModal();
                        }
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-left text-xs font-black text-rose-800 hover:bg-rose-100 transition cursor-pointer"
                    >
                      <LogOut className="h-4 w-4 shrink-0 text-rose-700" />
                      <span>Cambiar de Usuario / Cerrar Sesión</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile / Tablet Tab Bar (100% visible 5-column layout without horizontal overflow) */}
      <div className="grid grid-cols-5 xl:hidden border-t-2 border-[#323232] bg-[#ECEAE2] px-1.5 py-1 gap-1 w-full max-w-full">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-lg py-1.5 px-1 text-[10px] sm:text-[11px] font-bold font-display min-w-0 transition ${
                isActive
                  ? 'bg-[#FFF06B] text-[#323232] border border-[#323232] shadow-[1px_1px_0px_#323232]'
                  : 'text-[#5A5955] hover:text-[#323232]'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {tab.alertBadge !== undefined && (
                  <span className="ml-1 rounded bg-[#FF2C00] px-1 text-[8px] font-bold text-white leading-tight">
                    {tab.alertBadge}
                  </span>
                )}
                {tab.isWA && (
                  <span
                    className={`ml-1 h-2 w-2 rounded-full border border-[#323232] ${
                      whatsAppStatus === 'READY'
                        ? 'bg-emerald-500'
                        : whatsAppStatus === 'QR_READY'
                        ? 'bg-[#FFF06B]'
                        : 'bg-slate-300'
                    }`}
                  />
                )}
              </div>
              <span className="truncate max-w-full">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </header>

    {/* Barra Superior Compacta al Hacer Scroll (Fuera del header con backdrop-blur para que position: fixed funcione siempre) */}
    <AnimatePresence>
      {isScrolledCompact && (
        <motion.div
          initial={{ y: -56, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -56, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed top-0 left-0 right-0 z-50 border-b-2 border-[#323232] bg-[#F5F4F0]/95 backdrop-blur-md shadow-[0_3px_0px_#323232]"
        >
          <div className="mx-auto flex h-12 max-w-[1600px] w-full items-center justify-between px-2.5 sm:px-5 gap-2">
            <div
              onClick={() => {
                onTabChange('pipeline');
                scrollToTop();
              }}
              className="flex items-center gap-2 cursor-pointer shrink-0"
              title="Ir a Candidatos y subir al inicio"
            >
              <PopurriBrandLogo className="h-5 sm:h-6 w-auto" />
              <span className="hidden md:inline-block rounded bg-[#FFF06B] px-1.5 py-0.5 text-[10px] font-bold text-[#323232] border border-[#323232]/40">
                {signedCount} firmas
              </span>
            </div>

            {/* Selector compacto de los 5 paneles */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={`compact-${tab.id}`}
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold font-display whitespace-nowrap transition ${
                      isActive
                        ? 'bg-[#FFF06B] text-[#323232] border-2 border-[#323232] shadow-[1px_1px_0px_#323232]'
                        : 'bg-[#ECEAE2]/80 text-[#5A5955] hover:text-[#323232] border border-transparent'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                    {tab.alertBadge !== undefined && (
                      <span className="rounded bg-[#FF2C00] px-1 text-[9px] font-bold text-white">
                        {tab.alertBadge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Acciones rápidas en la barra compacta */}
            <div className="flex items-center gap-1.5 shrink-0">
              {handleCierre && (
                <button
                  type="button"
                  onClick={handleCierre}
                  className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#DFF4FF] px-2 py-1 text-[11px] font-bold font-display text-[#323232] hover:bg-[#29B8FF]"
                  title="Abrir Cierre Forms"
                >
                  <ClipboardCheck className="h-3 w-3" />
                  <span className="hidden md:inline">Cierre</span>
                </button>
              )}
              <button
                type="button"
                onClick={onSyncSheets}
                disabled={isSyncingSheets}
                className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-white px-2 py-1 text-[11px] font-bold font-display text-[#323232] hover:bg-[#ECEAE2]"
                title="Sincronizar con Google Sheets"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isSyncingSheets ? 'animate-spin text-[#29B8FF]' : ''}`}
                />
                <span className="hidden sm:inline">Sheets</span>
              </button>
              <button
                type="button"
                onClick={scrollToTop}
                className="inline-flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-[#29B8FF] px-2 py-1 text-[11px] font-bold font-display text-[#323232] hover:bg-[#1aa8f0]"
                title="Subir al inicio de la página"
              >
                <ArrowUp className="h-3 w-3" />
                <span className="hidden md:inline">Arriba</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Botón Flotante en Esquina Inferior Derecha para Volver al Inicio Automáticamente */}
    <AnimatePresence>
      {showScrollTopBtn && (
        <motion.button
          type="button"
          initial={{ opacity: 0, scale: 0.8, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 12 }}
          transition={{ duration: 0.18 }}
          onClick={scrollToTop}
          title="Volver al inicio"
          aria-label="Volver al inicio"
          className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[#323232] bg-[#FFF06B] text-[#323232] shadow-[3px_3px_0px_#323232] hover:bg-[#29B8FF] active:translate-y-0.5 transition-colors cursor-pointer"
        >
          <ArrowUp className="h-5 w-5 stroke-[2.75]" />
        </motion.button>
      )}
    </AnimatePresence>
    </>
  );
};
