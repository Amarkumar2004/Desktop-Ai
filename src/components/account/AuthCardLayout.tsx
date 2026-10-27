'use client';

import React from 'react';
import Link from 'next/link';

interface AuthCardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
  maxWidth?: string;
}

export default function AuthCardLayout({
  children,
  title,
  subtitle,
  backHref,
  backLabel,
  maxWidth = 'max-w-md',
}: AuthCardLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-[#FDFBF7] text-stone-800 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans antialiased selection:bg-amber-200">
      {/* Top Header with Logo */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between py-2">
        <Link href="/" className="flex items-center gap-3 group select-none">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500 shadow-sm text-white font-bold group-hover:scale-105 transition-transform">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-white">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-stone-900 tracking-tight text-base lg:text-lg">
                SUSI AI
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100/70 text-amber-800 border border-amber-200/60">
                v2.1
              </span>
            </div>
            <p className="text-[10px] font-medium text-stone-500 uppercase tracking-wider">
              Autonomous Workforce
            </p>
          </div>
        </Link>

        {backHref && (
          <Link
            href={backHref}
            className="text-xs font-semibold text-stone-500 hover:text-stone-900 px-3 py-1.5 rounded-lg hover:bg-stone-100/80 transition-colors"
          >
            {backLabel}
          </Link>
        )}
      </div>

      {/* Centered Auth Card */}
      <div className="flex-1 flex items-center justify-center py-8">
        <div className={`w-full ${maxWidth} animate-in fade-in zoom-in-95 duration-200`}>
          <div className="bg-white border border-stone-200/80 rounded-2xl shadow-[0_4px_28px_rgba(0,0,0,0.04)] p-6 sm:p-8 space-y-6">
            {/* Header / Titles */}
            <div className="space-y-1 text-center sm:text-left">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
                {title}
              </h1>
              <p className="text-xs sm:text-sm text-stone-500">{subtitle}</p>
            </div>

            {/* Body */}
            <div>{children}</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full max-w-6xl mx-auto py-4 text-center text-xs text-stone-400">
        <div className="flex flex-wrap items-center justify-center gap-4 text-[11px]">
          <span>© 2026 SUSI AI Technologies Inc.</span>
          <span>•</span>
          <span className="hover:text-stone-600 transition-colors cursor-pointer">Security Overview</span>
          <span>•</span>
          <span className="hover:text-stone-600 transition-colors cursor-pointer">Privacy Policy</span>
          <span>•</span>
          <span className="hover:text-stone-600 transition-colors cursor-pointer">Terms of Service</span>
        </div>
      </div>
    </div>
  );
}
