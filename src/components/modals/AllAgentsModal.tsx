'use client';

import React from 'react';
import { X, Users } from 'lucide-react';
import { Agent } from '@/types/dashboard';
import AgentAvatar from '@/components/common/AgentAvatar';
import { ROOMS_DATA } from '@/data/initialData';

interface AllAgentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
}

export default function AllAgentsModal({
  isOpen,
  onClose,
  agents,
  onSelectAgent,
}: AllAgentsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100/80 border border-amber-200/80 flex items-center justify-center text-amber-800">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Autonomous Workforce Fleet</h3>
              <p className="text-[11px] text-stone-500">Active neural agents and room assignments</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Agents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => {
                onSelectAgent(agent);
                onClose();
              }}
              className="p-3.5 rounded-xl border border-stone-200/80 bg-stone-50/60 hover:bg-white hover:border-amber-300 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-3">
                  <AgentAvatar id={agent.id} size="md" showStatus status={agent.status} />
                  <div>
                    <div className="font-bold text-stone-900 text-sm group-hover:text-amber-800 transition-colors">
                      {agent.name}
                    </div>
                    <div className="text-xs text-stone-500 font-medium">{agent.role}</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  {agent.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs border-t border-stone-100 pt-2 text-stone-600">
                <div className="text-[11px] truncate">
                  <span className="font-semibold text-stone-700">Station:</span>{' '}
                  {ROOMS_DATA[agent.room]?.name || 'Plaza'}
                </div>
                <div className="text-[11px] truncate">
                  <span className="font-semibold text-stone-700">Current Task:</span>{' '}
                  {agent.currentTask}
                </div>
                <div className="flex items-center justify-between text-[10.5px] font-medium pt-1 text-stone-500">
                  <span>Efficiency: <b className="text-stone-800">{agent.efficiency}%</b></span>
                  <span>Memory: <b className="text-stone-800">{agent.memoryUsage}</b></span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-stone-100">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-medium rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
