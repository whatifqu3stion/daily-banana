// components/CustomSelect.tsx
// A styled dropdown that supports per-option hover tooltips.
// Replaces native <select> where individual option descriptions are needed.
import React, { useState, useRef, useEffect } from 'react';
import Tooltip from './Tooltip';

export interface CustomSelectOption {
  value: string;
  label: string;
  tooltip?: string;
}

interface CustomSelectProps {
  id?: string;
  value: string;
  options: CustomSelectOption[];
  extraOption?: { value: string; label: string };
  onChange: (value: string) => void;
}

const ChevronDown: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 9l-7 7-7-7" />
  </svg>
);

const CustomSelect: React.FC<CustomSelectProps> = ({ id, value, options, extraOption, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const allOptions: CustomSelectOption[] = extraOption
    ? [...options, { value: extraOption.value, label: extraOption.label }]
    : options;

  const selected = allOptions.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  const optionClass = (val: string, isExtra = false) =>
    `w-full px-4 py-2.5 text-left font-special-elite text-base transition-colors ${
      val === value
        ? 'bg-black text-white'
        : isExtra
          ? 'text-gray-500 hover:bg-stone-100'
          : 'text-gray-700 hover:bg-stone-100'
    }`;

  return (
    <div ref={ref} className="relative w-full">
      {/* Trigger button — matches existing select styling */}
      <button
        id={id}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full p-3 h-14 bg-white border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-lg hover:bg-stone-200 transition-colors flex items-center justify-between"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? 'text-gray-700' : 'text-gray-400'}>
          {selected?.label ?? 'Select…'}
        </span>
        <ChevronDown open={open} />
      </button>

      {/* Dropdown list — overflow: visible so tooltip bubbles escape the box */}
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white border-2 border-black rounded-lg shadow-xl py-1"
          style={{ overflow: 'visible' }}
        >
          {options.map((opt, i) => (
            <li key={opt.value} role="option" aria-selected={opt.value === value}>
              {opt.tooltip ? (
                <Tooltip text={opt.tooltip} position="top-left" wrapperClassName="w-full">
                  <button
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`${optionClass(opt.value)} ${i === 0 ? 'rounded-t-md' : ''}`}
                  >
                    {opt.label}
                  </button>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`${optionClass(opt.value)} ${i === 0 ? 'rounded-t-md' : ''}`}
                >
                  {opt.label}
                </button>
              )}
            </li>
          ))}
          {extraOption && (
            <li role="option" aria-selected={extraOption.value === value} className="border-t border-stone-200 mt-1">
              <button
                type="button"
                onClick={() => handleSelect(extraOption.value)}
                className={`${optionClass(extraOption.value, true)} rounded-b-md`}
              >
                {extraOption.label}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default CustomSelect;
