'use client';

import React from 'react';

export interface ToggleProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export default function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
  icon,
  disabled = false,
  className = '',
}: ToggleProps) {
  return (
    <div
      className={`flex items-center justify-between p-3.5 bg-stone-50/70 hover:bg-stone-50 border border-stone-200/70 rounded-xl transition-colors ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div className="space-y-0.5 pr-4 select-none">
        {label && (
          <div className="font-bold text-xs text-stone-800 flex items-center gap-2">
            {icon && <span className="shrink-0">{icon}</span>}
            <span>{label}</span>
          </div>
        )}
        {description && <p className="text-[11px] text-stone-500 leading-normal">{description}</p>}
      </div>

      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`w-11 h-6 shrink-0 rounded-full transition-colors duration-200 ease-in-out relative p-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:cursor-not-allowed ${
          checked ? 'bg-amber-500' : 'bg-stone-300'
        }`}
      >
        <div
          className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
