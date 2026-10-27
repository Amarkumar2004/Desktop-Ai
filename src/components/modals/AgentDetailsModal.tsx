'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Agent } from '@/types/dashboard';
import AgentAvatar from '@/components/common/AgentAvatar';

interface AgentDetailsModalProps {
  agent: Agent | null;
  onClose: () => void;
}

export default function AgentDetailsModal({ agent, onClose }: AgentDetailsModalProps) {
  if (!agent) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <AgentAvatar id={agent.id} size="lg" showStatus status={agent.status} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-stone-900">{agent.name}</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                  LVL {agent.level}
                </span>
              </div>
              <p className="text-xs text-stone-500 font-medium">{agent.role}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Workload */}
        <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-stone-500 font-medium">
            <span>Current Assignment</span>
            <span className="font-semibold text-emerald-600">{agent.status}</span>
          </div>
          <div className="font-semibold text-stone-800 text-[12.5px] leading-snug">
            {agent.currentTask}
          </div>
        </div>

        {/* Core Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/60 text-center">
            <div className="text-[10px] text-stone-500 font-medium">Efficiency</div>
            <div className="font-bold text-emerald-600 text-sm mt-0.5">{agent.efficiency}%</div>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/60 text-center">
            <div className="text-[10px] text-stone-500 font-medium">Memory Pool</div>
            <div className="font-bold text-stone-800 text-sm mt-0.5">{agent.memoryUsage}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/60 text-center">
            <div className="text-[10px] text-stone-500 font-medium">Active Tasks</div>
            <div className="font-bold text-amber-700 text-sm mt-0.5">{agent.taskCount}</div>
          </div>
        </div>

        {/* Specialty Capabilities */}
        <div className="space-y-1.5 text-xs">
          <span className="font-bold text-stone-800">Specialty Neural Domain:</span>
          <p className="text-stone-600 bg-stone-50/70 p-2.5 rounded-xl border border-stone-200/60 leading-relaxed">
            {agent.specialty}
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full py-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold rounded-xl transition-all shadow-xs"
        >
          Close Inspector
        </button>
      </div>
    </div>
  );
}
