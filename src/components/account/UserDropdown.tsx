'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Bell,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/lib/toast/ToastContext';

interface UserDropdownProps {
  onOpenNotifications?: () => void;
  className?: string;
}

export default function UserDropdown({ onOpenNotifications, className = '' }: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user, logout } = useAuth();
  const { info } = useToast();

  const displayName = user?.fullName || 'Alex Rivera';
  const displayEmail = user?.email || 'alex.rivera@susi.ai';
  const displayRole = user?.role || 'Lead Architect';
  const displayInitials = user?.avatarInitials || 'AR';

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSignOut = async () => {
    setIsOpen(false);
    info('Signed out', 'You have been logged out of your workspace.');
    await logout();
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-full bg-stone-100/90 hover:bg-stone-200/90 border border-stone-200/70 transition-all cursor-pointer select-none group focus:outline-none focus:ring-2 focus:ring-amber-400 active:scale-95"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title="User Account & Workspace Options"
      >
        <div className="w-7 h-7 rounded-full bg-amber-500 group-hover:bg-amber-600 border border-amber-400/80 flex items-center justify-center font-bold text-white text-[11px] shadow-xs transition-colors">
          {displayInitials}
        </div>
        <div className="hidden sm:flex flex-col text-left leading-none pr-0.5">
          <span className="text-xs font-bold text-stone-800 group-hover:text-stone-950">
            {displayName}
          </span>
          <span className="text-[10px] font-medium text-stone-500">
            {displayRole}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-amber-600' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 origin-top-right rounded-2xl bg-white border border-stone-200/90 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 focus:outline-none divide-y divide-stone-100"
        >
          {/* Header Info */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-amber-100 border border-amber-300/80 flex items-center justify-center font-bold text-amber-900 text-xs shadow-2xs shrink-0">
                {displayInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-stone-900 truncate">
                  {displayName}
                </p>
                <p className="text-[11px] text-stone-500 truncate">{displayEmail}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60">
                    {displayRole}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <Link
              href="/account"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-stone-700 hover:text-stone-950 hover:bg-stone-50 transition-colors"
              role="menuitem"
            >
              <User className="w-4 h-4 text-amber-600" />
              <span>Account settings</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (onOpenNotifications) {
                  onOpenNotifications();
                } else {
                  router.push('/account?tab=notifications');
                }
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-stone-700 hover:text-stone-950 hover:bg-stone-50 transition-colors cursor-pointer text-left"
              role="menuitem"
            >
              <Bell className="w-4 h-4 text-blue-600" />
              <div className="flex items-center justify-between w-full">
                <span>Notifications</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  3 unread
                </span>
              </div>
            </button>
          </div>

          {/* Sign out */}
          <div className="py-1">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50/70 transition-colors cursor-pointer text-left"
              role="menuitem"
            >
              <LogOut className="w-4 h-4 text-red-500" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
