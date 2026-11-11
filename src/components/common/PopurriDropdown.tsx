import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface PopurriDropdownOption<T extends string = string> {
  value: T;
  label: string;
  shortLabel?: string;
  badgeClass?: string;
}

interface PopurriDropdownProps<T extends string = string> {
  value: T;
  options: PopurriDropdownOption<T>[];
  onChange: (value: T) => void;
  headerLabel?: string;
  placeholder?: string;
  prefixLabel?: string;
  prefixText?: string;
  triggerClassName?: string;
  menuWidth?: number;
  maxHeight?: number;
  align?: 'left' | 'right';
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  title?: string;
}

export function PopurriDropdown<T extends string = string>({
  value,
  options,
  onChange,
  headerLabel,
  placeholder = 'Seleccionar...',
  prefixLabel,
  prefixText,
  triggerClassName,
  menuWidth,
  maxHeight: customMaxHeight,
  align = 'left',
  searchable = false,
  searchPlaceholder = 'Filtrar...',
  disabled = false,
  title,
}: PopurriDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    return options.filter((opt) =>
      opt.label
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(q)
    );
  }, [options, searchable, search]);

  const updateMenuPosition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn || typeof window === 'undefined') return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const desiredWidth = Math.min(
      Math.max(menuWidth || rect.width, rect.width, 200),
      vw - 16
    );

    let left =
      align === 'right' ? rect.right - desiredWidth : rect.left;
    left = Math.max(8, Math.min(left, vw - desiredWidth - 8));

    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < 230 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      160,
      Math.min(customMaxHeight || 420, openUpward ? spaceAbove - 4 : spaceBelow - 4)
    );

    if (openUpward) {
      setMenuStyle({
        position: 'fixed',
        bottom: vh - rect.top + 6,
        left,
        width: desiredWidth,
        maxHeight,
        zIndex: 99999,
      });
    } else {
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left,
        width: desiredWidth,
        maxHeight,
        zIndex: 99999,
      });
    }
  }, [align, menuWidth]);

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const displayLabel =
    selectedOption?.shortLabel || selectedOption?.label || placeholder;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={title || selectedOption?.label}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setIsOpen((prev) => !prev);
        }}
        className={
          triggerClassName ||
          'w-full inline-flex items-center justify-between gap-1.5 rounded-xl border-2 border-[#323232] bg-white px-2.5 py-1.5 text-xs font-bold font-display text-[#323232] hover:bg-[#FFF06B]/40 transition cursor-pointer min-w-0'
        }
      >
        <span className="truncate flex items-center gap-1 min-w-0">
          {(prefixLabel || prefixText) && (
            <span className="text-[10px] font-black uppercase text-[#5A5955] shrink-0">
              {prefixLabel || prefixText}
            </span>
          )}
          <span className="truncate">{displayLabel}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col rounded-2xl border-2 border-[#323232] bg-[#FFFDF5] p-1.5 shadow-[5px_5px_0px_#323232] overflow-hidden"
          >
            {headerLabel && (
              <div className="flex items-center justify-between px-2.5 py-1 border-b border-[#323232]/15 mb-1 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#5A5955] font-display truncate">
                  {headerLabel}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className="text-[11px] font-black text-[#323232] hover:text-[#FF2C00] px-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {searchable && (
              <div className="relative px-1 pb-1.5 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5A5955]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  autoFocus
                  className="w-full rounded-xl border border-[#323232] bg-white pl-7 pr-2.5 py-1 text-xs font-bold text-[#323232] focus:outline-hidden"
                />
              </div>
            )}

            <div className="overflow-y-auto popurri-dropdown-scroll space-y-0.5 pr-0.5 flex-1 min-h-0">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[#5A5955] italic text-center">
                  Sin coincidencias
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(opt.value);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      className={`w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold text-left transition cursor-pointer ${
                        isSelected
                          ? 'bg-[#FFF06B] text-[#323232] border border-[#323232] shadow-[1px_1px_0px_#323232]'
                          : 'text-[#323232] hover:bg-[#ECEAE2]/80 border border-transparent'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[#323232]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
