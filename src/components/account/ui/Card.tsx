'use client';

import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export default function Card({
  children,
  title,
  subtitle,
  headerAction,
  footer,
  className = '',
  bodyClassName = '',
  ...props
}: CardProps) {
  return (
    <div
      className={`bg-white border border-stone-200/80 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden transition-shadow ${className}`}
      {...props}
    >
      {(title || subtitle || headerAction) && (
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between gap-3">
          <div>
            {typeof title === 'string' ? (
              <h3 className="text-sm font-bold text-stone-900">{title}</h3>
            ) : (
              title
            )}
            {subtitle && <p className="text-[11px] text-stone-500 mt-0.5">{subtitle}</p>}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}

      <div className={`p-5 ${bodyClassName}`}>{children}</div>

      {footer && (
        <div className="px-5 py-3.5 bg-stone-50/70 border-t border-stone-100 flex items-center justify-between">
          {footer}
        </div>
      )}
    </div>
  );
}
