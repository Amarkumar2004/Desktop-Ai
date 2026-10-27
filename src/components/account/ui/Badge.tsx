'use client';

import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'amber' | 'emerald' | 'blue' | 'purple' | 'stone' | 'red';
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
}

export default function Badge({
  children,
  variant = 'amber',
  size = 'md',
  className = '',
  dot = false,
}: BadgeProps) {
  const variantStyles = {
    amber: 'bg-amber-100/80 text-amber-800 border-amber-300/80',
    emerald: 'bg-emerald-100/80 text-emerald-800 border-emerald-300/80',
    blue: 'bg-blue-100/80 text-blue-800 border-blue-300/80',
    purple: 'bg-purple-100/80 text-purple-800 border-purple-300/80',
    stone: 'bg-stone-100 text-stone-700 border-stone-200',
    red: 'bg-red-100/80 text-red-800 border-red-300/80',
  };

  const dotStyles = {
    amber: 'bg-amber-500',
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    stone: 'bg-stone-400',
    red: 'bg-red-500',
  };

  const sizeStyles = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-[11px] px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold rounded-lg border shadow-2xs select-none ${
        variantStyles[variant]
      } ${sizeStyles[size]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[variant]}`} />}
      {children}
    </span>
  );
}
