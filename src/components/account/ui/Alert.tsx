'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export interface AlertProps {
  variant?: 'error' | 'success' | 'warning' | 'info';
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export default function Alert({
  variant = 'info',
  title,
  children,
  onClose,
  className = '',
}: AlertProps) {
  const styles = {
    error: {
      container: 'bg-red-50/80 border-red-200/90 text-red-900',
      icon: <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />,
      closeBtn: 'text-red-500 hover:text-red-700 hover:bg-red-100',
    },
    success: {
      container: 'bg-emerald-50/80 border-emerald-200/90 text-emerald-900',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />,
      closeBtn: 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100',
    },
    warning: {
      container: 'bg-amber-50/80 border-amber-200/90 text-amber-900',
      icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />,
      closeBtn: 'text-amber-500 hover:text-amber-700 hover:bg-amber-100',
    },
    info: {
      container: 'bg-blue-50/80 border-blue-200/90 text-blue-900',
      icon: <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />,
      closeBtn: 'text-blue-500 hover:text-blue-700 hover:bg-blue-100',
    },
  };

  const config = styles[variant];

  return (
    <div
      role="alert"
      className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 shadow-2xs animate-in fade-in duration-150 ${config.container} ${className}`}
    >
      {config.icon}
      <div className="flex-1 space-y-0.5">
        {title && <h4 className="font-bold text-xs">{title}</h4>}
        <div className="text-[11.5px] leading-relaxed opacity-90">{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className={`p-1 rounded-lg transition-colors ${config.closeBtn}`}
          aria-label="Dismiss alert"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
