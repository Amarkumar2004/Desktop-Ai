'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger-outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2.5 text-xs font-bold gap-2 shadow-2xs',
    lg: 'px-5 py-3 text-sm font-bold gap-2.5 shadow-xs',
  };

  const variantClasses = {
    primary:
      'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-400 border border-amber-600/30 shadow-[0_2px_8px_rgba(245,158,11,0.25)] hover:shadow-[0_4px_12px_rgba(245,158,11,0.35)]',
    secondary:
      'bg-stone-100 hover:bg-stone-200 text-stone-800 focus:ring-stone-400 border border-stone-200/80 shadow-2xs',
    outline:
      'bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 focus:ring-stone-400 shadow-2xs',
    ghost:
      'bg-transparent hover:bg-stone-100 text-stone-600 hover:text-stone-900 focus:ring-stone-300',
    'danger-outline':
      'bg-white hover:bg-red-50 text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 focus:ring-red-400 shadow-2xs',
    danger:
      'bg-red-600 hover:bg-red-700 text-white focus:ring-red-400 border border-red-700 shadow-2xs',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`
        ${baseClasses}
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-current" />
          <span>{children}</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="shrink-0">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span className="shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}
