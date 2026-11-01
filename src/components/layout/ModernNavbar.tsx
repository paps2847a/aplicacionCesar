import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PopurriBrandLogo } from './PopurriBrandLogo';

export type ModernTabType = 'pipeline' | 'mapa' | 'plan_hoy' | 'whatsapp' | 'configuracion';

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
}) => {
  const handleCierre = onOpenCierreModal || onOpenDailyCloseModal;
  const [isScrolledCompact, setIsScrolledCompact] = useState(false);
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false);

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

  return (
    <>
    <header
      className={`relative z-30 w-full max-w-full border-b-2 border-[#323232] bg-[#F5F4F0]/95 backdrop-blur-md transition-opacity duration-150 ${
        isScrolledCompact ? 'opacity-0 pointer-events-none invisible' : 'opacity-100'
      }`}
    >
      <div className="mx-auto flex h-15 sm:h-18 max-w-[1600px] w-full min-w-0 items-center justify-between px-3 sm:px-6 gap-2 sm:gap-3">
        {/* Identidad Gráfica Oficial POPURRÍ (Vector Sombra 3D Azul Petróleo Oscuro #25323A + Fondo Celeste #2988FF) */}
        <div
          onClick={() => onTabChange('pipeline')}
          className="flex items-center gap-2.5 sm:gap-3 min-w-0 cursor-pointer group"
        >
          <PopurriBrandLogo className="h-6 sm:h-8 w-auto" />

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-display text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#323232] truncate">
                Rutas CABA
              </span>
              <span className="hidden xs:inline-block rounded-md bg-[#29B8FF] px-1.5 py-0.5 font-display text-[10px] font-bold text-[#323232] border border-[#323232]">
                Regeneración
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] font-semibold text-[#5A5955] truncate">
              <span className="font-bold text-[#323232] bg-[#FFF06B] px-1 rounded border border-[#323232]/30">
                {signedCount}
              </span>{' '}
              firmas · <span className="font-bold text-[#323232]">{totalContacts}</span> padrón
            </p>
          </div>
        </div>

        {/* Central Segmented Tab Control (Desktop lg+) */}
        <nav className="hidden lg:flex items-center gap-1 rounded-xl bg-[#ECEAE2] p-1 border-2 border-[#323232] shadow-[2px_2px_0px_#323232] shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors font-display ${
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
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold border ${
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
                      className="inline-flex items-center gap-0.5 rounded-md bg-[#FF2C00] px-1.5 py-0.2 text-[10px] font-bold text-white border border-[#323232]"
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

        {/* Action Buttons (Compact & Mobile-Safe) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onOpenScannerModal && (
            <button
              onClick={onOpenScannerModal}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#323232] hover:bg-[#ffe838] transition shadow-[2px_2px_0px_#323232] whitespace-nowrap font-display"
              title="Escanear ficha física con IA y abrir Formulario de Carga de Adhesiones"
            >
              <Camera className="h-3.5 w-3.5 text-[#323232] shrink-0" />
              <span className="hidden sm:inline">Escanear Ficha</span>
              <span className="sm:hidden">Ficha</span>
            </button>
          )}
          {handleCierre && (
            <button
              onClick={handleCierre}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#DFF4FF] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#323232] hover:bg-[#29B8FF] transition shadow-[2px_2px_0px_#323232] whitespace-nowrap font-display"
              title="Ver resumen diario de actividad para Google Forms"
            >
              <ClipboardCheck className="h-3.5 w-3.5 text-[#323232] shrink-0" />
              <span className="hidden sm:inline">Cierre Forms</span>
              <span className="sm:hidden">Cierre</span>
            </button>
          )}

          <button
            onClick={onSyncSheets}
            disabled={isSyncingSheets}
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-white px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#323232] hover:bg-[#ECEAE2] transition shadow-[2px_2px_0px_#323232] disabled:opacity-60 whitespace-nowrap font-display"
            title="Sincronizar padrón en vivo desde Google Sheets (Pestaña Control)"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-[#323232] shrink-0 ${
                isSyncingSheets ? 'animate-spin text-[#29B8FF]' : ''
              }`}
            />
            <span>{isSyncingSheets ? 'Sync...' : 'Sheets'}</span>
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Tab Bar (100% visible 5-column layout without horizontal overflow) */}
      <div className="grid grid-cols-5 lg:hidden border-t-2 border-[#323232] bg-[#ECEAE2] px-1.5 py-1 gap-1 w-full max-w-full">
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
