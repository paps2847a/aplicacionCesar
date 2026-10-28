import React from 'react';
import {
  Users,
  MapPin,
  Calendar,
  Smartphone,
  Settings,
  RefreshCw,
  Search,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { motion } from 'motion/react';

export type ModernTabType = 'pipeline' | 'mapa' | 'plan_hoy' | 'whatsapp' | 'configuracion';

interface ModernNavbarProps {
  activeTab: ModernTabType;
  onTabChange: (tab: ModernTabType) => void;
  totalContacts: number;
  signedCount: number;
  whatsAppStatus: string;
  isSyncingSheets: boolean;
  onSyncSheets: () => void;
  onOpenAutoWAModal: () => void;
}

export const ModernNavbar: React.FC<ModernNavbarProps> = ({
  activeTab,
  onTabChange,
  totalContacts,
  signedCount,
  whatsAppStatus,
  isSyncingSheets,
  onSyncSheets,
  onOpenAutoWAModal,
}) => {
  const tabs = [
    {
      id: 'pipeline' as ModernTabType,
      label: 'Candidatos',
      icon: Users,
      badge: totalContacts,
    },
    {
      id: 'mapa' as ModernTabType,
      label: 'Mapa & Cafés',
      icon: MapPin,
    },
    {
      id: 'plan_hoy' as ModernTabType,
      label: 'Plan de Hoy',
      icon: Calendar,
    },
    {
      id: 'whatsapp' as ModernTabType,
      label: 'WhatsApp Web',
      icon: Smartphone,
      isWA: true,
    },
    {
      id: 'configuracion' as ModernTabType,
      label: 'Configuración',
      icon: Settings,
    },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 sm:h-18 max-w-[1600px] w-full items-center justify-between px-4 sm:px-8 gap-4">
        {/* Brand & Campaign Tag */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm shadow-emerald-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-tight text-slate-900">
                Popurrí
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200/60">
                CABA
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
              Gestión Territorial · <span className="font-bold text-emerald-700">{signedCount}</span> firmas oficiales
            </p>
          </div>
        </div>

        {/* Central Segmented Tab Control */}
        <nav className="hidden md:flex items-center gap-1 rounded-2xl bg-slate-100/90 p-1.5 border border-slate-200/60 shadow-inner shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-colors ${
                  isActive ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 rounded-xl bg-white shadow-sm border border-slate-200/60"
                    transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-black text-slate-700">
                      {tab.badge}
                    </span>
                  )}
                  {tab.isWA && (
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        whatsAppStatus === 'READY'
                          ? 'bg-emerald-500 animate-pulse'
                          : whatsAppStatus === 'QR_READY'
                          ? 'bg-amber-500'
                          : 'bg-slate-300'
                      }`}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onSyncSheets}
            disabled={isSyncingSheets}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50 whitespace-nowrap"
            title="Sincronizar con Google Sheets"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isSyncingSheets ? 'animate-spin' : ''}`} />
            <span>Sheets</span>
          </button>

          <button
            onClick={onOpenAutoWAModal}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white hover:bg-emerald-500 transition shadow-sm shadow-emerald-600/20 whitespace-nowrap"
          >
            <Smartphone className="h-4 w-4" />
            <span>Campaña WA</span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="flex md:hidden border-t border-slate-200/60 bg-white px-2 py-1 justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center py-1 px-3 text-[10px] font-bold ${
                isActive ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              <Icon className="h-4 w-4 mb-0.5" />
              {tab.label.split(' ')[0]}
            </button>
          );
        })}
      </div>
    </header>
  );
};
