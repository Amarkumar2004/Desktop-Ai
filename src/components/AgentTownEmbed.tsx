"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { StudioProvider } from "@/lib/store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GameErrorBoundary } from "@/components/game/GameErrorBoundary";
import TerminalModal from "@/components/panel/TerminalModal";
import WorkerSessionHistoryModal from "@/components/panel/WorkerSessionHistoryModal";
import GameHud from "@/components/hud/GameHud";
import { Maximize2, Minimize2 } from "lucide-react";

const PhaserGame = dynamic(() => import("@/components/game/PhaserGame"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[440px] bg-[#1a1814] flex flex-col items-center justify-center text-amber-400 font-mono text-xs gap-3">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
        <span>Loading Agent Town Pixel Engine...</span>
      </div>
      <span className="text-[10px] text-stone-500">Loading maps, tilesets & autonomous agents</span>
    </div>
  ),
});

interface AgentTownEmbedProps {
  fullHeight?: boolean;
}

export default function AgentTownEmbed({ fullHeight = false }: AgentTownEmbedProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const content = (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-stone-800 shadow-2xl transition-all ${
        isFullscreen
          ? "fixed inset-0 z-50 rounded-none border-none h-screen w-screen"
          : fullHeight
          ? "h-full min-h-[460px]"
          : "h-[440px] lg:h-[490px]"
      }`}
      style={{ background: "var(--pixel-bg, #1a1814)" }}
    >
      {/* Game Canvas Container */}
      <div className="absolute inset-0">
        <GameErrorBoundary>
          <PhaserGame />
        </GameErrorBoundary>
      </div>

      {/* Floating HUD overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
        <GameHud />
      </div>

      {/* Modals */}
      <TerminalModal />
      <WorkerSessionHistoryModal />

      {/* Fullscreen Control */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 pointer-events-auto">
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-1.5 rounded-lg bg-stone-900/80 hover:bg-stone-800 border border-stone-700 text-stone-300 hover:text-white transition-all shadow-md backdrop-blur-xs"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <StudioProvider>{content}</StudioProvider>
    </ErrorBoundary>
  );
}
