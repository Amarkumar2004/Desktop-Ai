'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { X, Settings, Volume2, Bell, Shield, Check, KeyRound, ChevronRight } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoDispatch, setAutoDispatch] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [telemetryFrequency, setTelemetryFrequency] = useState('Realtime (1s)');
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100/80 border border-amber-200/80 flex items-center justify-center text-amber-800">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">System Preferences</h3>
              <p className="text-[11px] text-stone-500">Autonomous workforce & voice settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toggles List */}
        <div className="space-y-3 text-xs">
          {/* Voice Intelligence */}
          <div className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200/60 rounded-xl">
            <div className="space-y-0.5">
              <div className="font-bold text-stone-800 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-amber-600" /> Oracle Neural Audio
              </div>
              <p className="text-[10.5px] text-stone-500">Enable voice responses and speech synthesis</p>
            </div>
            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                voiceEnabled ? 'bg-amber-500' : 'bg-stone-300'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                  voiceEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Autonomous Task Dispatch */}
          <div className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200/60 rounded-xl">
            <div className="space-y-0.5">
              <div className="font-bold text-stone-800 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-blue-600" /> Autonomous Task Dispatch
              </div>
              <p className="text-[10.5px] text-stone-500">Allow SUSI to orchestrate idle agents</p>
            </div>
            <button
              onClick={() => setAutoDispatch(!autoDispatch)}
              className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                autoDispatch ? 'bg-amber-500' : 'bg-stone-300'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                  autoDispatch ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Sound Effects */}
          <div className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200/60 rounded-xl">
            <div className="space-y-0.5">
              <div className="font-bold text-stone-800 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-emerald-600" /> UI Micro-Feedback Audio
              </div>
              <p className="text-[10.5px] text-stone-500">Play subtle chimes on command completion</p>
            </div>
            <button
              onClick={() => setSoundEffects(!soundEffects)}
              className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                soundEffects ? 'bg-amber-500' : 'bg-stone-300'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                  soundEffects ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Telemetry Interval */}
          <div className="p-3 bg-stone-50 border border-stone-200/60 rounded-xl flex items-center justify-between">
            <span className="font-bold text-stone-800">Telemetry Stream Rate</span>
            <select
              value={telemetryFrequency}
              onChange={(e) => setTelemetryFrequency(e.target.value)}
              className="px-2 py-1 bg-white border border-stone-200 rounded-lg text-[11px] font-semibold text-stone-700"
            >
              <option value="Realtime (1s)">Realtime (1s)</option>
              <option value="Standard (5s)">Standard (5s)</option>
              <option value="Eco (15s)">Eco (15s)</option>
            </select>
          </div>

          {/* AI Providers & API Keys (BYOK) Link */}
          <Link
            href="/settings/ai-providers"
            onClick={onClose}
            className="flex items-center justify-between p-3 bg-amber-50/70 hover:bg-amber-100/80 border border-amber-200/90 rounded-xl transition-all group cursor-pointer"
          >
            <div className="space-y-0.5">
              <div className="font-bold text-stone-900 flex items-center gap-1.5 text-xs">
                <KeyRound className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform" />
                <span>AI Providers & API Keys</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 uppercase">
                  BYOK
                </span>
              </div>
              <p className="text-[10.5px] text-stone-500">
                Connect Gemini, OpenAI, Claude, Groq & custom endpoints
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-amber-700 group-hover:translate-x-0.5 transition-all" />
          </Link>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-all"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : null}
            {saved ? 'Saved!' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
