'use client';

import React from 'react';
import Link from 'next/link';
import {
  Settings,
  User,
  Sliders,
  KeyRound,
  ChevronRight,
  Shield,
  Bell,
  Sparkles,
} from 'lucide-react';

interface SettingsViewProps {
  onOpenSystemPreferences?: () => void;
  onNavigateToAiProviders?: () => void;
  onNavigateToAccount?: () => void;
  onNavigateToDashboard?: () => void;
}

export default function SettingsView({
  onOpenSystemPreferences,
  onNavigateToAiProviders,
  onNavigateToAccount,
  onNavigateToDashboard,
}: SettingsViewProps) {
  const settingsSections = [
    {
      id: 'ai-providers',
      title: 'AI Providers & API Keys',
      description: 'Connect Gemini, OpenAI, Claude, Groq & custom endpoints (BYOK architecture).',
      icon: KeyRound,
      badge: 'BYOK Architecture',
      href: '/settings/ai-providers',
      onClick: onNavigateToAiProviders,
      accentColor: 'text-amber-600 bg-amber-100/80 border-amber-200/80',
    },
    {
      id: 'account',
      title: 'Account & Workspace Settings',
      description: 'Manage your profile, team workspace members, security, and notification preferences.',
      icon: User,
      badge: 'Profile & Security',
      href: '/account',
      onClick: onNavigateToAccount,
      accentColor: 'text-blue-600 bg-blue-100/80 border-blue-200/80',
    },
    {
      id: 'system-preferences',
      title: 'System & Audio Preferences',
      description: 'Configure neural audio synthesis, telemetry stream rate, and autonomous dispatch.',
      icon: Sliders,
      badge: 'Realtime Controls',
      onClick: onOpenSystemPreferences,
      accentColor: 'text-emerald-600 bg-emerald-100/80 border-emerald-200/80',
    },
  ];

  return (
    <div className="w-full max-w-[1200px] mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-stone-200/80 rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
              Settings & Configurations
            </h1>
            <p className="text-xs text-stone-500">
              Manage your AI workforce providers, personal profile, and system preferences.
            </p>
          </div>
        </div>

        {onNavigateToDashboard && (
          <button
            onClick={onNavigateToDashboard}
            className="self-start sm:self-center px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl transition-colors"
          >
            ← Back to Dashboard
          </button>
        )}
      </div>

      {/* Settings Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {settingsSections.map((section) => {
          const Icon = section.icon;

          const content = (
            <div className="bg-white border border-stone-200/80 hover:border-amber-300 rounded-2xl p-5 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between h-full group cursor-pointer space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center font-bold shadow-xs ${section.accentColor}`}
                  >
                    <Icon className="w-5 h-5 group-hover:scale-105 transition-transform" />
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200/60">
                    {section.badge}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-stone-900 text-sm group-hover:text-amber-700 transition-colors">
                    {section.title}
                  </h3>
                  <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                    {section.description}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-semibold text-stone-600 group-hover:text-amber-700">
                <span>Configure</span>
                <ChevronRight className="w-4 h-4 text-stone-400 group-hover:translate-x-1 group-hover:text-amber-700 transition-all" />
              </div>
            </div>
          );

          if (section.href && !section.onClick) {
            return (
              <Link key={section.id} href={section.href} className="block h-full">
                {content}
              </Link>
            );
          }

          return (
            <div
              key={section.id}
              onClick={section.onClick}
              className="block h-full"
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
