'use client';

import React, { useState, forwardRef } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

export interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  showStrength?: boolean;
  containerClassName?: string;
}

export function checkPasswordStrength(password: string): {
  score: number;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
  color: string;
  hasLength: boolean;
  hasUpper: boolean;
  hasNumber: boolean;
} {
  const hasLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  let score = 0;
  if (hasLength) score += 1;
  if (hasUpper) score += 1;
  if (hasNumber) score += 1;
  if (hasSpecial && password.length >= 10) score += 1;

  if (score <= 1) {
    return { score: 1, label: 'Weak', color: 'bg-red-500', hasLength, hasUpper, hasNumber };
  }
  if (score === 2) {
    return { score: 2, label: 'Fair', color: 'bg-amber-500', hasLength, hasUpper, hasNumber };
  }
  if (score === 3) {
    return { score: 3, label: 'Good', color: 'bg-blue-500', hasLength, hasUpper, hasNumber };
  }
  return { score: 4, label: 'Strong', color: 'bg-emerald-500', hasLength, hasUpper, hasNumber };
}

const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  (
    {
      label = 'Password',
      error,
      helperText,
      showStrength = false,
      value = '',
      id,
      name = 'password',
      className = '',
      containerClassName = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const inputId = id || name;
    const strVal = typeof value === 'string' ? value : '';
    const strength = checkPasswordStrength(strVal);

    return (
      <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-stone-700 select-none flex items-center justify-between"
          >
            <span>{label}</span>
          </label>
        )}
        <div className="relative flex items-center">
          <div className="absolute left-3 flex items-center justify-center text-stone-400 pointer-events-none">
            <Lock className="w-4 h-4" />
          </div>
          <input
            ref={ref}
            id={inputId}
            name={name}
            type={showPassword ? 'text' : 'password'}
            value={value}
            disabled={disabled}
            className={`
              w-full text-xs font-medium text-stone-900 placeholder:text-stone-400 bg-white
              border rounded-xl transition-all duration-150 py-2.5 outline-none pl-9 pr-10
              ${
                error
                  ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-red-50/20'
                  : 'border-stone-200 hover:border-stone-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
              }
              ${disabled ? 'bg-stone-100/70 border-stone-200 text-stone-400 cursor-not-allowed' : ''}
              ${className}
            `}
            {...props}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors focus:outline-none"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Dynamic strength meter if enabled */}
        {showStrength && strVal.length > 0 && (
          <div className="mt-1 space-y-1 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-stone-500 font-medium">Password strength:</span>
              <span
                className={`font-bold ${
                  strength.label === 'Weak'
                    ? 'text-red-500'
                    : strength.label === 'Fair'
                    ? 'text-amber-500'
                    : strength.label === 'Good'
                    ? 'text-blue-500'
                    : 'text-emerald-500'
                }`}
              >
                {strength.label}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full bg-stone-100 rounded-full overflow-hidden p-0.5 border border-stone-200/50">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`h-full rounded-full transition-all duration-300 ${
                    strength.score >= step ? strength.color : 'bg-transparent'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {error ? (
          <p className="text-[11px] font-medium text-red-600 flex items-center gap-1 animate-in fade-in duration-150">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-[11px] text-stone-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

PasswordField.displayName = 'PasswordField';
export default PasswordField;
