import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  Check,
  MessageSquareText,
} from 'lucide-react';
import { inferirBarrioDesdeTextoCABA, obtenerPartesFechaHoraBA } from '../../utils/logic';

interface CabaSuggestion {
  direccionFormateada: string;
  nombreCalle: string;
  altura: number | null;
  esCalleSinAltura: boolean;
  esCruce: boolean;
  barrio: string;
}

export interface ScheduleAndAddressValues {
  diasEncuentro: string;
  horaInicio: string;
  horaFin: string;
  horarioEncuentro: string;
  calleOCruce: string;
  pisoDepto: string;
  barrio: string;
  comentario: string;
}

interface ScheduleAndAddressPickerProps {
  values: ScheduleAndAddressValues;
  onChange: (next: ScheduleAndAddressValues) => void;
  showInternalComment?: boolean;
  compact?: boolean;
  addressLabel?: string;
}

const NOMBRES_MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const DIAS_SEMANA_CORTOS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const NOMBRES_DIA_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatDdMm(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

function parseDdMmToDate(ddmm: string, defaultYear: number): Date | null {
  const m = ddmm.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(defaultYear, month - 1, day, 12, 0, 0);
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatReadableSummary(diasEncuentro: string, year: number): string {
  const raw = (diasEncuentro || '').trim();
  if (!raw) return 'Sin fecha seleccionada';
  const rangeMatch = raw.match(/^(\d{1,2}\/\d{1,2})\s+al\s+(\d{1,2}\/\d{1,2})$/i);
  if (rangeMatch) {
    const d1 = parseDdMmToDate(rangeMatch[1], year);
    const d2 = parseDdMmToDate(rangeMatch[2], year);
    if (d1 && d2) {
      return `${NOMBRES_DIA_CORTOS[d1.getDay()]} ${formatDdMm(d1)} al ${
        NOMBRES_DIA_CORTOS[d2.getDay()]
      } ${formatDdMm(d2)}`;
    }
  }
  const parts = raw
    .split(/\s*(?:,|o|y)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 0 && parts.every((p) => /^\d{1,2}\/\d{1,2}$/.test(p))) {
    return parts
      .map((p) => {
        const dt = parseDdMmToDate(p, year);
        return dt ? `${NOMBRES_DIA_CORTOS[dt.getDay()]} ${formatDdMm(dt)}` : p;
      })
      .join(', ');
  }
  return raw;
}

export const ScheduleAndAddressPicker: React.FC<ScheduleAndAddressPickerProps> = ({
  values,
  onChange,
  showInternalComment = true,
  compact = false,
  addressLabel = 'Dirección o Punto de Encuentro (CABA)',
}) => {
  const hoyBA = useMemo(() => obtenerPartesFechaHoraBA(), []);
  const currentYear = hoyBA.year || 2026;

  // Modo de selección de fechas: 'rango' (estilo aerolínea: desde -> hasta) o 'separados' (días sueltos)
  const [calendarMode, setCalendarMode] = useState<'rango' | 'separados'>(() =>
    /\bal\b/i.test(values.diasEncuentro || '') ? 'rango' : 'rango'
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<number>(() => (hoyBA.month || 11) - 1);
  const [viewYear, setViewYear] = useState<number>(() => currentYear);

  // Estado interno para selección de rango o días separados
  const [rangeStart, setRangeStart] = useState<Date | null>(() => {
    const m = (values.diasEncuentro || '').match(/(\d{1,2}\/\d{1,2})\s+al\s+(\d{1,2}\/\d{1,2})/i);
    if (m) return parseDdMmToDate(m[1], currentYear);
    const single = (values.diasEncuentro || '').match(/^(\d{1,2}\/\d{1,2})$/);
    if (single) return parseDdMmToDate(single[1], currentYear);
    return null;
  });
  const [rangeEnd, setRangeEnd] = useState<Date | null>(() => {
    const m = (values.diasEncuentro || '').match(/(\d{1,2}\/\d{1,2})\s+al\s+(\d{1,2}\/\d{1,2})/i);
    if (m) return parseDdMmToDate(m[2], currentYear);
    return null;
  });
  const [separateDates, setSeparateDates] = useState<Date[]>(() => {
    if (/\bal\b/i.test(values.diasEncuentro || '')) return [];
    const tokens = (values.diasEncuentro || '').match(/\b\d{1,2}\/\d{1,2}\b/g) || [];
    return tokens
      .map((t) => parseDdMmToDate(t, currentYear))
      .filter((d): d is Date => d !== null);
  });

  // Autocompletado de calles CABA (USIG + Geodatos)
  const [suggestions, setSuggestions] = useState<CabaSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pendingStreetWithoutNumber, setPendingStreetWithoutNumber] = useState<string | null>(null);
  const [streetNumberInput, setStreetNumberInput] = useState('');
  const calendarRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const calendarPopupRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLDivElement>(null);
  const [floatingStyle, setFloatingStyle] = useState<React.CSSProperties>({});

  const updateCalendarPosition = useCallback(() => {
    const btn = triggerButtonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const popupWidth = Math.min(Math.max(rect.width, 296), window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popupWidth - 8));
    const estimatedHeight = 325;
    const fitsBelow = rect.bottom + 6 + estimatedHeight <= window.innerHeight || rect.top < estimatedHeight;
    setFloatingStyle({
      position: 'fixed',
      top: fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - estimatedHeight - 6),
      left,
      width: popupWidth,
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    if (!isCalendarOpen) return;
    updateCalendarPosition();
    window.addEventListener('scroll', updateCalendarPosition, true);
    window.addEventListener('resize', updateCalendarPosition);
    return () => {
      window.removeEventListener('scroll', updateCalendarPosition, true);
      window.removeEventListener('resize', updateCalendarPosition);
    };
  }, [isCalendarOpen, updateCalendarPosition]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = calendarRef.current && calendarRef.current.contains(target);
      const insidePopup = calendarPopupRef.current && calendarPopupRef.current.contains(target);
      if (!insideTrigger && !insidePopup) {
        setIsCalendarOpen(false);
      }
      if (addressRef.current && !addressRef.current.contains(target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Buscar sugerencias en USIG CABA cuando escribe dirección
  useEffect(() => {
    const q = (values.calleOCruce || '').trim();
    if (q.length < 3 || !showSuggestions) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/autocomplete-caba?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data?.ok && Array.isArray(data.suggestions)) {
          setSuggestions(data.suggestions);
        }
      } catch {
        setSuggestions([]);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [values.calleOCruce, showSuggestions]);

  const updateHorarioPair = (newIni: string, newFin: string) => {
    const iniClean = newIni.trim();
    const finClean = newFin.trim();
    const horarioEncuentro =
      iniClean && finClean && finClean !== iniClean
        ? `${iniClean} a ${finClean}`
        : iniClean || finClean || '';
    onChange({
      ...values,
      horaInicio: iniClean,
      horaFin: finClean,
      horarioEncuentro,
    });
  };

  const handleDayClick = (clickedDate: Date) => {
    if (calendarMode === 'rango') {
      if (!rangeStart || (rangeStart && rangeEnd)) {
        setRangeStart(clickedDate);
        setRangeEnd(null);
        const ddmm = formatDdMm(clickedDate);
        onChange({ ...values, diasEncuentro: ddmm });
      } else {
        if (sameCalendarDay(clickedDate, rangeStart)) {
          setRangeEnd(null);
          const ddmm = formatDdMm(clickedDate);
          onChange({ ...values, diasEncuentro: ddmm });
          setIsCalendarOpen(false);
        } else {
          const [first, second] =
            clickedDate.getTime() < rangeStart.getTime()
              ? [clickedDate, rangeStart]
              : [rangeStart, clickedDate];
          setRangeStart(first);
          setRangeEnd(second);
          onChange({
            ...values,
            diasEncuentro: `${formatDdMm(first)} al ${formatDdMm(second)}`,
          });
        }
      }
    } else {
      // Modo días por separado
      const exists = separateDates.some((d) => sameCalendarDay(d, clickedDate));
      const nextDates = exists
        ? separateDates.filter((d) => !sameCalendarDay(d, clickedDate))
        : [...separateDates, clickedDate].sort((a, b) => a.getTime() - b.getTime());
      setSeparateDates(nextDates);
      const formatted = nextDates.map((d) => formatDdMm(d)).join(', ');
      onChange({
        ...values,
        diasEncuentro: formatted,
      });
    }
  };

  const handleQuickDateOffset = (daysOffset: number) => {
    const base = new Date(currentYear, (hoyBA.month || 11) - 1, hoyBA.day || 4, 12, 0, 0);
    base.setDate(base.getDate() + daysOffset);
    const ddmm = formatDdMm(base);
    setRangeStart(base);
    setRangeEnd(null);
    setSeparateDates([base]);
    onChange({ ...values, diasEncuentro: ddmm });
  };

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1, 12, 0, 0);
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    // Lunes = 0 ... Domingo = 6
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) {
      cells.push(new Date(viewYear, viewMonth, d, 12, 0, 0));
    }
    return cells;
  }, [viewMonth, viewYear]);

  const isDateInSelectedRange = (dt: Date): boolean => {
    if (calendarMode !== 'rango' || !rangeStart || !rangeEnd) return false;
    const t = dt.getTime();
    return t > rangeStart.getTime() && t < rangeEnd.getTime();
  };

  const isDateSelectedEndpoint = (dt: Date): boolean => {
    if (calendarMode === 'rango') {
      return Boolean(
        (rangeStart && sameCalendarDay(dt, rangeStart)) ||
          (rangeEnd && sameCalendarDay(dt, rangeEnd))
      );
    }
    return separateDates.some((d) => sameCalendarDay(dt, d));
  };

  const handleSelectSuggestion = (s: CabaSuggestion) => {
    setShowSuggestions(false);
    if (s.esCalleSinAltura && !s.esCruce) {
      setPendingStreetWithoutNumber(s.nombreCalle);
      setStreetNumberInput('');
      onChange({
        ...values,
        calleOCruce: s.nombreCalle,
        barrio: s.barrio || values.barrio,
      });
    } else {
      setPendingStreetWithoutNumber(null);
      const nuevoBarrio =
        s.barrio ||
        inferirBarrioDesdeTextoCABA(s.direccionFormateada, values.barrio) ||
        values.barrio;
      onChange({
        ...values,
        calleOCruce: s.direccionFormateada,
        barrio: nuevoBarrio,
      });
    }
  };

  const handleConfirmStreetNumber = () => {
    if (!pendingStreetWithoutNumber) return;
    const numClean = streetNumberInput.trim();
    const fullAddress = numClean
      ? `${pendingStreetWithoutNumber} ${numClean}`
      : `${pendingStreetWithoutNumber} S/N`;
    const barrioDetectado =
      inferirBarrioDesdeTextoCABA(fullAddress, values.barrio) || values.barrio;
    setPendingStreetWithoutNumber(null);
    setStreetNumberInput('');
    onChange({
      ...values,
      calleOCruce: fullAddress,
      barrio: barrioDetectado,
    });
  };

  const mapsQueryUrl = useMemo(() => {
    const dir = (values.calleOCruce || '').trim();
    if (!dir) return null;
    const q = `${dir}, ${values.barrio || 'CABA'}, Ciudad Autónoma de Buenos Aires, Argentina`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }, [values.calleOCruce, values.barrio]);

  const timeOptions = useMemo(() => {
    const list: string[] = [];
    for (let h = 8; h <= 21; h++) {
      const hh = String(h).padStart(2, '0');
      list.push(`${hh}:00`);
      list.push(`${hh}:30`);
    }
    return list;
  }, []);

  return (
    <div className={`space-y-2.5 ${compact ? 'text-xs' : ''}`}>
      {/* Fila 1: Día(s) (Calendario interactivo Rango / Días sueltos) + Horario (Hora o Desde/Hasta) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
        {/* Selector de Día(s) */}
        <div className="md:col-span-6 relative" ref={calendarRef}>
          <div className="flex items-center justify-between gap-1 mb-1">
            <label className="flex items-center gap-1 text-[10px] font-black uppercase text-[#323232]">
              <CalendarIcon className="w-3.5 h-3.5 text-[#323232]" />
              Día(s) de Encuentro
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleQuickDateOffset(0)}
                className="px-1.5 py-0.5 rounded border border-[#323232]/40 bg-white hover:bg-[#FFF06B] text-[10px] font-black text-[#323232] cursor-pointer"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => handleQuickDateOffset(1)}
                className="px-1.5 py-0.5 rounded border border-[#323232]/40 bg-white hover:bg-[#FFF06B] text-[10px] font-black text-[#323232] cursor-pointer"
              >
                Mañana
              </button>
              {values.diasEncuentro && (
                <button
                  type="button"
                  onClick={() => {
                    setRangeStart(null);
                    setRangeEnd(null);
                    setSeparateDates([]);
                    onChange({ ...values, diasEncuentro: '' });
                  }}
                  className="px-1.5 py-0.5 rounded border border-rose-300 bg-rose-50 hover:bg-rose-100 text-[10px] font-black text-rose-700 cursor-pointer"
                  title="Limpiar fechas"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              ref={triggerButtonRef}
              type="button"
              onClick={() => setIsCalendarOpen((prev) => !prev)}
              className="flex-1 min-w-0 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border-2 border-[#323232] bg-white hover:bg-[#FFF06B]/30 text-left text-xs font-bold text-[#323232] cursor-pointer"
            >
              <span className="truncate">
                {values.diasEncuentro
                  ? `${values.diasEncuentro} · (${formatReadableSummary(values.diasEncuentro, currentYear)})`
                  : 'Elegir fecha o rango en calendario...'}
              </span>
              <CalendarIcon className="w-3.5 h-3.5 shrink-0 text-[#323232]" />
            </button>
          </div>

          {/* Calendario interactivo flotante en Portal (se despliega por encima de todos los elementos) */}
          {isCalendarOpen &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                ref={calendarPopupRef}
                style={floatingStyle}
                onClick={(e) => e.stopPropagation()}
                className="rounded-2xl border-2 border-[#323232] bg-white p-3 shadow-[4px_4px_0px_#323232] space-y-2.5"
              >
                {/* Selector de Modo: Rango de días vs Días por separado */}
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#ECEAE2] p-1 border border-[#323232]">
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarMode('rango');
                      setRangeStart(null);
                      setRangeEnd(null);
                    }}
                    className={`py-1 px-2 rounded-lg text-[10px] font-black uppercase transition cursor-pointer ${
                      calendarMode === 'rango'
                        ? 'bg-[#FFF06B] text-[#323232] border border-[#323232]'
                        : 'text-[#5A5955] hover:text-[#323232]'
                    }`}
                  >
                    ↔ Rango de días
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarMode('separados');
                    }}
                    className={`py-1 px-2 rounded-lg text-[10px] font-black uppercase transition cursor-pointer ${
                      calendarMode === 'separados'
                        ? 'bg-[#29B8FF] text-[#323232] border border-[#323232]'
                        : 'text-[#5A5955] hover:text-[#323232]'
                    }`}
                  >
                    ＋ Días sueltos
                  </button>
                </div>

                <p className="text-[10px] font-bold text-[#5A5955]">
                  {calendarMode === 'rango'
                    ? 'Tocá el día de inicio y luego el día de fin (o un solo día).'
                    : 'Tocá cada uno de los días sueltos en los que puede recibirte.'}
                </p>

                {/* Navegación de Mes */}
                <div className="flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (viewMonth === 0) {
                        setViewMonth(11);
                        setViewYear((y) => y - 1);
                      } else {
                        setViewMonth((m) => m - 1);
                      }
                    }}
                    className="p-1 rounded-lg border border-[#323232] bg-[#F5F4F0] hover:bg-[#FFF06B] cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-black uppercase text-[#323232]">
                    {NOMBRES_MESES[viewMonth]} {viewYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (viewMonth === 11) {
                        setViewMonth(0);
                        setViewYear((y) => y + 1);
                      } else {
                        setViewMonth((m) => m + 1);
                      }
                    }}
                    className="p-1 rounded-lg border border-[#323232] bg-[#F5F4F0] hover:bg-[#FFF06B] cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Grilla del Calendario */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {DIAS_SEMANA_CORTOS.map((d) => (
                    <div key={d} className="text-[10px] font-black text-[#5A5955] py-0.5">
                      {d}
                    </div>
                  ))}
                  {calendarDays.map((cellDate, idx) => {
                    if (!cellDate) {
                      return <div key={`empty-${idx}`} className="h-7" />;
                    }
                    const selectedEnd = isDateSelectedEndpoint(cellDate);
                    const inRange = isDateInSelectedRange(cellDate);
                    const isToday =
                      cellDate.getDate() === hoyBA.day &&
                      cellDate.getMonth() + 1 === hoyBA.month &&
                      cellDate.getFullYear() === currentYear;

                    return (
                      <button
                        key={cellDate.toISOString()}
                        type="button"
                        onClick={() => handleDayClick(cellDate)}
                        className={`h-7 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center justify-center ${
                          selectedEnd
                            ? 'bg-[#323232] text-[#FFF06B] border-2 border-[#323232] shadow-[1px_1px_0px_#323232]'
                            : inRange
                            ? 'bg-[#FFF06B] text-[#323232] border border-[#323232]/40'
                            : isToday
                            ? 'bg-[#DFF4FF] text-[#323232] border border-[#323232]'
                            : 'bg-[#F5F4F0] text-[#323232] hover:bg-[#FFF06B]/60'
                        }`}
                      >
                        {cellDate.getDate()}
                      </button>
                    );
                  })}
                </div>

                {/* Pie del Calendario con entrada manual rápida y botón Listo */}
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#323232]/15">
                  <input
                    type="text"
                    value={values.diasEncuentro}
                    onChange={(e) => onChange({ ...values, diasEncuentro: e.target.value })}
                    placeholder="Ej: 04/11 al 06/11"
                    className="min-w-0 flex-1 px-2 py-1 rounded-lg border border-[#323232] text-[11px] font-bold text-[#323232]"
                  />
                  <button
                    type="button"
                    onClick={() => setIsCalendarOpen(false)}
                    className="px-2.5 py-1 rounded-lg border border-[#323232] bg-[#FFF06B] text-[11px] font-black text-[#323232] hover:bg-[#ffe838] cursor-pointer shrink-0"
                  >
                    Listo
                  </button>
                </div>
              </div>,
              document.body
            )}
        </div>

        {/* Selector de Horario (Hora puntual o Rango Desde / Hasta) */}
        <div className="md:col-span-6">
          <div className="flex items-center justify-between gap-1 mb-1">
            <label className="flex items-center gap-1 text-[10px] font-black uppercase text-[#323232]">
              <Clock className="w-3.5 h-3.5 text-[#323232]" />
              Horario (Puntual o Franja)
            </label>
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => updateHorarioPair('10:00', '13:00')}
                className="px-1.5 py-0.5 rounded border border-[#323232]/40 bg-white hover:bg-[#FFF06B] text-[10px] font-bold text-[#323232] cursor-pointer"
              >
                Mañana
              </button>
              <button
                type="button"
                onClick={() => updateHorarioPair('15:00', '19:00')}
                className="px-1.5 py-0.5 rounded border border-[#323232]/40 bg-white hover:bg-[#FFF06B] text-[10px] font-bold text-[#323232] cursor-pointer"
              >
                Tarde
              </button>
              {(values.horaInicio || values.horaFin || values.horarioEncuentro) && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...values, horaInicio: '', horaFin: '', horarioEncuentro: '' })
                  }
                  className="px-1.5 py-0.5 rounded border border-rose-300 bg-rose-50 text-[10px] font-black text-rose-700 cursor-pointer"
                  title="Limpiar horario"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-white px-2 py-1">
              <span className="text-[10px] font-black uppercase text-[#5A5955] shrink-0">
                Hora/Desde:
              </span>
              <select
                value={values.horaInicio}
                onChange={(e) => updateHorarioPair(e.target.value, values.horaFin)}
                className="min-w-0 flex-1 bg-transparent text-xs font-black text-[#323232] focus:outline-none cursor-pointer"
              >
                <option value="">--:--</option>
                {timeOptions.map((t) => (
                  <option key={`ini-${t}`} value={t}>
                    {t} hs
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 rounded-lg border-2 border-[#323232] bg-white px-2 py-1">
              <span className="text-[10px] font-black uppercase text-[#5A5955] shrink-0">
                Hasta (opc.):
              </span>
              <select
                value={values.horaFin}
                onChange={(e) => updateHorarioPair(values.horaInicio, e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs font-black text-[#323232] focus:outline-none cursor-pointer"
              >
                <option value="">Puntual</option>
                {timeOptions.map((t) => (
                  <option key={`fin-${t}`} value={t}>
                    {t} hs
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Fila 2: Dirección / Punto con Autocompletado CABA (USIG + Google Maps) + Piso/Depto + Barrio */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5" ref={addressRef}>
        <div className="md:col-span-8 relative">
          <div className="flex items-center justify-between gap-1 mb-1">
            <label className="flex items-center gap-1 text-[10px] font-black uppercase text-[#323232]">
              <MapPin className="w-3.5 h-3.5 text-[#323232]" />
              {addressLabel}
            </label>
            {mapsQueryUrl && (
              <a
                href={mapsQueryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-black text-sky-800 hover:underline"
                title="Abrir ubicación en Google Maps"
              >
                <span>Ver en Maps</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={values.calleOCruce}
              onFocus={() => setShowSuggestions(true)}
              onChange={(e) => {
                const nextCalle = e.target.value;
                setShowSuggestions(true);
                setPendingStreetWithoutNumber(null);
                const barrioAuto =
                  inferirBarrioDesdeTextoCABA(nextCalle, values.barrio) || values.barrio;
                onChange({
                  ...values,
                  calleOCruce: nextCalle,
                  barrio: barrioAuto !== 'CABA' ? barrioAuto : values.barrio,
                });
              }}
              placeholder="Ej: Holmberg 2847, Perú 150 o Callao y Corrientes..."
              className="min-w-0 flex-1 px-2.5 py-1.5 rounded-lg border-2 border-[#323232] bg-white text-xs font-bold text-[#323232]"
            />
            {values.calleOCruce && (
              <button
                type="button"
                onClick={() => {
                  setPendingStreetWithoutNumber(null);
                  onChange({ ...values, calleOCruce: '' });
                }}
                className="p-1.5 rounded-lg border border-[#323232]/30 bg-white hover:bg-stone-100 text-[#323232] cursor-pointer shrink-0"
                title="Limpiar dirección"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Aviso interactivo si eligió una calle sin altura numérica */}
          {pendingStreetWithoutNumber && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-[#323232] bg-[#FFF06B] px-2.5 py-1.5">
              <span className="text-[11px] font-black text-[#323232]">
                📍 ¿Qué altura de {pendingStreetWithoutNumber}?
              </span>
              <input
                type="text"
                value={streetNumberInput}
                onChange={(e) => setStreetNumberInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmStreetNumber();
                  }
                }}
                placeholder="Ej: 150 o al 200"
                className="w-28 px-2 py-0.5 rounded-lg border border-[#323232] bg-white text-xs font-bold text-[#323232]"
                autoFocus
              />
              <button
                type="button"
                onClick={handleConfirmStreetNumber}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[#323232] bg-[#323232] text-[#FFF06B] text-[10px] font-black cursor-pointer"
              >
                <Check className="w-3 h-3" />
                Fijar altura
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingStreetWithoutNumber(null);
                }}
                className="px-2 py-0.5 rounded-lg border border-[#323232]/40 bg-white text-[10px] font-bold text-[#323232] cursor-pointer"
              >
                Calle S/N
              </button>
            </div>
          )}

          {/* Lista desplegable de sugerencias USIG / CABA */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border-2 border-[#323232] bg-white shadow-[4px_4px_0px_#323232] overflow-hidden divide-y divide-stone-200">
              {suggestions.map((s, idx) => (
                <button
                  key={`${s.direccionFormateada}-${idx}`}
                  type="button"
                  onClick={() => handleSelectSuggestion(s)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold text-[#323232] hover:bg-[#FFF06B] transition cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-[#323232]" />
                    <span className="truncate">{s.direccionFormateada}</span>
                    {s.esCalleSinAltura && !s.esCruce && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300 shrink-0">
                        + Elegir altura
                      </span>
                    )}
                  </div>
                  {s.barrio && (
                    <span className="px-1.5 py-0.5 rounded bg-[#DFF4FF] border border-[#323232] text-[10px] font-black text-[#323232] shrink-0">
                      {s.barrio}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Piso / Depto / Timbre */}
        <div className="md:col-span-4">
          <label className="block text-[10px] font-black uppercase text-[#323232] mb-1">
            Piso / Depto / Timbre (opc.)
          </label>
          <input
            type="text"
            value={values.pisoDepto}
            onChange={(e) => onChange({ ...values, pisoDepto: e.target.value })}
            placeholder='Ej: 8 "A", PB 2, Timbre B'
            className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#323232] bg-white text-xs font-bold text-[#323232]"
          />
        </div>
      </div>

      {/* Fila 3: Recuadro de Comentario Interno (sólo para consumo humano / aclaraciones) */}
      {showInternalComment && (
        <div>
          <label className="flex items-center gap-1 text-[10px] font-black uppercase text-[#5A5955] mb-1">
            <MessageSquareText className="w-3.5 h-3.5 text-[#5A5955]" />
            Comentario interno (aclaraciones / contexto de la persona)
          </label>
          <input
            type="text"
            value={values.comentario}
            onChange={(e) => onChange({ ...values, comentario: e.target.value })}
            placeholder="Nota interna (ej: 'Su hija está enferma', 'Viene con su pareja', 'Timbre no anda')..."
            className="w-full px-2.5 py-1.5 rounded-lg border border-[#323232]/50 bg-[#F5F4F0] focus:bg-white text-xs font-semibold text-[#323232]"
          />
        </div>
      )}
    </div>
  );
};
