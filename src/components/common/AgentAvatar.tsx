'use client';

import React from 'react';
import { AgentId } from '@/types/dashboard';

interface AgentAvatarProps {
  id: AgentId;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  status?: string;
  className?: string;
}

export default function AgentAvatar({
  id,
  size = 'md',
  showStatus = false,
  status = 'Online',
  className = '',
}: AgentAvatarProps) {
  const sizeMap = {
    xs: 'w-6 h-6 text-[8px]',
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-12 h-12 text-sm',
    xl: 'w-16 h-16 text-base',
  };

  const statusColorMap: Record<string, string> = {
    Online: 'bg-emerald-500 ring-white',
    Busy: 'bg-blue-500 ring-white',
    Idle: 'bg-amber-400 ring-white',
    Offline: 'bg-stone-400 ring-white',
  };

  // Dedicated SVG pixel/anime portraits for each agent
  const renderAvatarContent = () => {
    switch (id) {
      case 'lex':
        return (
          <svg viewBox="0 0 48 48" className="w-full h-full rounded-lg" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="48" height="48" rx="8" fill="#F3E8FF" />
            {/* Lex - Violet hair with cyber research headset */}
            {/* Hair back */}
            <path d="M12 20C12 12 18 8 24 8C30 8 36 12 36 20V32C36 36 33 40 33 40H15C15 40 12 36 12 32V20Z" fill="#7C3AED" />
            {/* Face */}
            <path d="M16 18C16 14 19 12 24 12C29 12 32 14 32 18V26C32 30 28 34 24 34C20 34 16 30 16 26V18Z" fill="#FDE047" opacity="0.4" />
            <path d="M16 19C16 15 19 14 24 14C29 14 32 15 32 19V26C32 29 28 33 24 33C20 33 16 29 16 26V19Z" fill="#FFE4D6" />
            {/* Hair bangs */}
            <path d="M14 16C16 22 22 23 24 20C26 23 32 22 34 16C33 11 29 9 24 9C19 9 15 11 14 16Z" fill="#6D28D9" />
            {/* Eyes */}
            <circle cx="20" cy="22" r="2.5" fill="#4C1D95" />
            <circle cx="28" cy="22" r="2.5" fill="#4C1D95" />
            <circle cx="21" cy="21" r="0.9" fill="white" />
            <circle cx="29" cy="21" r="0.9" fill="white" />
            {/* Smart Glasses */}
            <rect x="17" y="19" width="6" height="5" rx="1.5" stroke="#A855F7" strokeWidth="1.5" fill="#A855F7" fillOpacity="0.2" />
            <rect x="25" y="19" width="6" height="5" rx="1.5" stroke="#A855F7" strokeWidth="1.5" fill="#A855F7" fillOpacity="0.2" />
            <path d="M23 21H25" stroke="#A855F7" strokeWidth="1.5" />
            {/* Blush & Smile */}
            <circle cx="17.5" cy="25" r="1.5" fill="#F472B6" opacity="0.5" />
            <circle cx="30.5" cy="25" r="1.5" fill="#F472B6" opacity="0.5" />
            <path d="M22.5 27C23.5 28 24.5 28 25.5 27" stroke="#7C3AED" strokeWidth="1.2" strokeLinecap="round" />
            {/* Headset mic */}
            <path d="M13 22C13 18 14 14 17 12" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
            <circle cx="13" cy="23" r="2" fill="#8B5CF6" />
            <path d="M13 24L17 28" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="17.5" cy="28.5" r="1" fill="#C084FC" />
          </svg>
        );
      case 'susi':
        return (
          <svg viewBox="0 0 48 48" className="w-full h-full rounded-lg" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="48" height="48" rx="8" fill="#DBEAFE" />
            {/* Susi - Blue twin hair with neon audio antenna */}
            <path d="M10 22C10 12 17 8 24 8C31 8 38 12 38 22V36C38 38 35 41 33 41H15C13 41 10 38 10 36V22Z" fill="#2563EB" />
            {/* Twin tail accents */}
            <path d="M8 22C6 28 8 36 12 40" stroke="#1D4ED8" strokeWidth="3" strokeLinecap="round" />
            <path d="M40 22C42 28 40 36 36 40" stroke="#1D4ED8" strokeWidth="3" strokeLinecap="round" />
            {/* Face */}
            <path d="M16 19C16 15 19 14 24 14C29 14 32 15 32 19V26C32 29 28 33 24 33C20 33 16 29 16 26V19Z" fill="#FFEBE0" />
            {/* Bangs */}
            <path d="M13 16C15 22 21 24 24 21C27 24 33 22 35 16C34 11 30 9 24 9C18 9 14 11 13 16Z" fill="#1D4ED8" />
            {/* Eyes */}
            <ellipse cx="20" cy="22" rx="2.5" ry="3" fill="#1E40AF" />
            <ellipse cx="28" cy="22" rx="2.5" ry="3" fill="#1E40AF" />
            <circle cx="21" cy="21" r="1" fill="#93C5FD" />
            <circle cx="29" cy="21" r="1" fill="#93C5FD" />
            <circle cx="21.5" cy="20.5" r="0.5" fill="white" />
            <circle cx="29.5" cy="20.5" r="0.5" fill="white" />
            {/* Cyber Star mark on cheek */}
            <path d="M17 25.5L18 24.5L19 25.5L18 26.5Z" fill="#38BDF8" />
            <circle cx="30" cy="25.5" r="1.5" fill="#F472B6" opacity="0.4" />
            {/* Smile */}
            <path d="M22.5 28C23.5 29 24.5 29 25.5 28" stroke="#1E40AF" strokeWidth="1.2" strokeLinecap="round" />
            {/* Cyber Headdress */}
            <rect x="12" y="11" width="4" height="6" rx="2" fill="#0284C7" />
            <rect x="32" y="11" width="4" height="6" rx="2" fill="#0284C7" />
            <path d="M14 11C14 7 34 7 34 11" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 'spy':
        return (
          <svg viewBox="0 0 48 48" className="w-full h-full rounded-lg" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="48" height="48" rx="8" fill="#FEF3C7" />
            {/* Spy - Tactical golden cowl & ninja visor mask */}
            {/* Hood / Shroud */}
            <path d="M11 22C11 11 18 7 24 7C30 7 37 11 37 22V36C37 39 34 42 24 42C14 42 11 39 11 36V22Z" fill="#1C1917" />
            {/* Shroud highlight */}
            <path d="M14 18C14 12 18 9 24 9C30 9 34 12 34 18" stroke="#D97706" strokeWidth="1.5" />
            {/* Tactical Visor Glass */}
            <path d="M15 20C15 18 18 17 24 17C30 17 33 18 33 20V26C33 27 31 28 24 28C17 28 15 27 15 26V20Z" fill="#B45309" />
            {/* Glowing Golden Eyes in Visor */}
            <rect x="18" y="21.5" width="4.5" height="2.5" rx="1.2" fill="#FBBF24" />
            <rect x="25.5" y="21.5" width="4.5" height="2.5" rx="1.2" fill="#FBBF24" />
            <circle cx="19.5" cy="22.5" r="0.7" fill="#FEF08A" />
            <circle cx="27" cy="22.5" r="0.7" fill="#FEF08A" />
            {/* Tactical Face Mask Plate */}
            <path d="M16 28L24 33L32 28V33C32 37 28 39 24 39C20 39 16 37 16 33V28Z" fill="#292524" />
            {/* Filter vent lines */}
            <line x1="22" y1="34" x2="26" y2="34" stroke="#F59E0B" strokeWidth="1" strokeLinecap="round" />
            <line x1="23" y1="36" x2="25" y2="36" stroke="#F59E0B" strokeWidth="1" strokeLinecap="round" />
            {/* Amber shoulder crest */}
            <path d="M18 41L24 38L30 41" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 'yoru':
        return (
          <svg viewBox="0 0 48 48" className="w-full h-full rounded-lg" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="48" height="48" rx="8" fill="#D1FAE5" />
            {/* Yoru - Emerald green hair with artist stylist beret */}
            {/* Hair Base */}
            <path d="M11 20C11 12 17 8 24 8C31 8 37 12 37 20V34C37 38 33 41 24 41C15 41 11 38 11 34V20Z" fill="#059669" />
            {/* Artist Beret */}
            <path d="M10 16C12 9 20 6 26 7C32 8 38 11 38 15C38 17 33 19 24 19C15 19 10 18 10 16Z" fill="#047857" />
            <circle cx="28" cy="7" r="1.5" fill="#34D399" />
            {/* Face */}
            <path d="M16 19C16 15 19 14 24 14C29 14 32 15 32 19V26C32 29 28 33 24 33C20 33 16 29 16 26V19Z" fill="#FFF1E6" />
            {/* Bangs */}
            <path d="M13 18C15 23 20 25 24 22C28 25 33 23 35 18C33 14 29 12 24 12C19 12 15 14 13 18Z" fill="#059669" />
            {/* Eyes */}
            <ellipse cx="20" cy="22" rx="2.5" ry="3" fill="#065F46" />
            <ellipse cx="28" cy="22" rx="2.5" ry="3" fill="#065F46" />
            <circle cx="21" cy="21" r="1" fill="#6EE7B7" />
            <circle cx="29" cy="21" r="1" fill="#6EE7B7" />
            <circle cx="21.5" cy="20.5" r="0.5" fill="white" />
            <circle cx="29.5" cy="20.5" r="0.5" fill="white" />
            {/* Cheek blush */}
            <circle cx="17.5" cy="25" r="1.5" fill="#F472B6" opacity="0.4" />
            <circle cx="30.5" cy="25" r="1.5" fill="#F472B6" opacity="0.4" />
            {/* Smile */}
            <path d="M22.5 27.5C23.5 28.5 24.5 28.5 25.5 27.5" stroke="#065F46" strokeWidth="1.2" strokeLinecap="round" />
            {/* Stylus clip */}
            <rect x="34" y="17" width="2" height="7" rx="1" fill="#10B981" />
          </svg>
        );
      default:
        return (
          <div className="w-full h-full rounded-lg bg-stone-200 flex items-center justify-center font-bold text-stone-700">
            {String(id).toUpperCase().slice(0, 2)}
          </div>
        );
    }
  };

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${sizeMap[size]} ${className}`}>
      {renderAvatarContent()}
      {showStatus && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ${
            statusColorMap[status] || 'bg-emerald-500 ring-white'
          }`}
        />
      )}
    </div>
  );
}
