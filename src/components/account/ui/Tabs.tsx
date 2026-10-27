'use client';

import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export default function Tabs({
  tabs,
  activeTab,
  onChange,
  orientation = 'horizontal',
  className = '',
}: TabsProps) {
  if (orientation === 'vertical') {
    return (
      <nav className={`flex flex-col gap-1 w-full ${className}`} aria-label="Account Settings Tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 text-left select-none cursor-pointer ${
                isActive
                  ? 'bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.25)] font-bold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {tab.icon && (
                  <span className={`shrink-0 ${isActive ? 'text-white' : 'text-stone-500'}`}>
                    {tab.icon}
                  </span>
                )}
                <span>{tab.label}</span>
              </div>
              {tab.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                    isActive ? 'bg-amber-600 text-white' : 'bg-stone-200/80 text-stone-600'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <div
      className={`flex items-center gap-1 p-1 bg-stone-100/90 rounded-xl border border-stone-200/60 overflow-x-auto no-scrollbar ${className}`}
      aria-label="Tabs"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 select-none cursor-pointer ${
              isActive
                ? 'bg-white text-stone-900 shadow-xs border border-stone-200/70 font-bold'
                : 'text-stone-600 hover:text-stone-900 hover:bg-white/40'
            }`}
          >
            {tab.icon && (
              <span className={`shrink-0 ${isActive ? 'text-amber-600' : 'text-stone-500'}`}>
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-stone-100 text-stone-600 border border-stone-200/60">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
