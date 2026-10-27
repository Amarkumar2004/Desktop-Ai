'use client';

import React, { useState, useMemo } from 'react';
import { Globe, X, Radio } from 'lucide-react';
import { SystemMetrics, Agent, TaskItem } from '@/types/dashboard';
import { WORLD_MAP_PATH, WORLD_MAP_DOTS_PATH } from './worldMapData';
import {
  CountryHighlight,
  getCountryHotspotColor,
  COUNTRY_REGISTRY,
  resolveHotspotCollisions,
} from '@/lib/countryDetection';
import { useLiveAgentStatus } from '@/lib/agentStatusAdapter';
import { LiveEventMarker } from '@/lib/hooks/useNewsEventMarkers';

export interface GlobalOverviewCardProps {
  metrics?: SystemMetrics;
  agents?: Agent[];
  tasks?: TaskItem[];
  isSystemOffline?: boolean;
  highlightedCountries?: CountryHighlight[];
  selectedCountryCode?: string | null;
  onSelectCountry?: (countryCode: string | null) => void;
  isLoadingNews?: boolean;
  isStaleNews?: boolean;
  nodes?: MapNode[];
  /** Currently active 120-second live-event markers, keyed by country code (from useNewsEventMarkers). */
  liveEventMarkers?: Map<string, LiveEventMarker>;
}

export interface MapNode {
  id: string;
  name: string;
  region: string;
  x: number;
  y: number;
  status: 'online' | 'busy' | 'idle' | 'offline';
  agents: number;
  latency: string;
  color: string;
  pinType?: 'pin' | 'shield';
}

export interface MapPinSymbolProps {
  color: string;
  pinType?: 'pin' | 'shield';
  showShadow?: boolean;
}

/**
 * Reusable SVG Map Pin Symbol.
 * Preserves the project's original teardrop/shield visual treatment,
 * drop shadows, white perimeter stroke, and dual-circle center dot.
 */
export function MapPinSymbol({
  color,
  pinType = 'pin',
  showShadow = true,
}: MapPinSymbolProps) {
  return (
    <>
      {/* Ground Pin Shadow */}
      {showShadow && (
        <ellipse cx="0" cy="11" rx="4.5" ry="1.5" fill="#000000" opacity="0.2" />
      )}

      {pinType === 'shield' ? (
        // Shield Badge Pin
        <g filter="url(#pinShadow)">
          <path
            d="M 0 10 L -6 2 C -6 -6, -4 -9, 0 -9 C 4 -9, 6 -6, 6 2 Z"
            fill={color}
            stroke="#FFFFFF"
            strokeWidth="1.3"
          />
          <circle cx="0" cy="-1.5" r="2.2" fill="#FFFFFF" />
          <circle cx="0" cy="-1.5" r="1.1" fill={color} />
        </g>
      ) : (
        // Teardrop Map Pin
        <g filter="url(#pinShadow)">
          <path
            d="M 0 10 C -4 5, -6.5 2.5, -6.5 -1.5 C -6.5 -5.8, -3.6 -9, 0 -9 C 3.6 -9, 6.5 -5.8, 6.5 -1.5 C 6.5 2.5, 4 5, 0 10 Z"
            fill={color}
            stroke="#FFFFFF"
            strokeWidth="1.3"
          />
          <circle cx="0" cy="-2" r="2.2" fill="#FFFFFF" />
          <circle cx="0" cy="-2" r="1.1" fill={color} />
        </g>
      )}
    </>
  );
}

export default function GlobalOverviewCard({
  metrics,
  agents,
  tasks,
  isSystemOffline = false,
  highlightedCountries = [],
  selectedCountryCode = null,
  onSelectCountry,
  isLoadingNews = false,
  isStaleNews = false,
  nodes = [],
  liveEventMarkers = new Map(),
}: GlobalOverviewCardProps) {
  const [hoveredNode, setHoveredNode] = useState<MapNode | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<CountryHighlight | null>(null);

  // Reactive agent status resolution with meaningful deterministic semantics
  const liveStatusCounts = useLiveAgentStatus(agents, tasks, {
    isDisconnected: isSystemOffline,
  });

  // Use live status counts when available; never fall back to hardcoded sample data
  const onlineCount = liveStatusCounts.isLive
    ? liveStatusCounts.online
    : (metrics?.onlineCount ?? 0);
  const busyCount = liveStatusCounts.isLive
    ? liveStatusCounts.busy
    : (metrics?.busyCount ?? 0);
  const idleCount = liveStatusCounts.isLive
    ? liveStatusCounts.idle
    : (metrics?.idleCount ?? 0);
  const offlineCount = liveStatusCounts.isLive
    ? liveStatusCounts.offline
    : (metrics?.offlineCount ?? 0);

  // Filter strictly for verified locations derived from actual news articles
  // NEVER generate fallback, random, default, or example coordinates
  const activeValidCountries = (highlightedCountries || []).filter(
    (c) =>
      c &&
      c.articleCount > 0 &&
      typeof c.x === 'number' &&
      typeof c.y === 'number' &&
      !isNaN(c.x) &&
      !isNaN(c.y) &&
      c.x > 0 &&
      c.y > 0 &&
      typeof c.code === 'string' &&
      c.code.trim().length > 0
  );

  const positionedCountries = useMemo(
    () => resolveHotspotCollisions(activeValidCountries, 26),
    [activeValidCountries]
  );

  const activeCountriesCount = activeValidCountries.length;
  const selectedCountry = activeValidCountries.find((c) => c.code === selectedCountryCode);

  return (
    <div className="bg-white border border-stone-100 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-amber-500" />
          <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            Global Overview
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {nodes.length > 0 && (
            <span className="text-[10px] font-medium text-stone-400">
              {nodes.length} Nodes
            </span>
          )}
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60 flex items-center gap-1">
            <Radio className="w-2.5 h-2.5 text-amber-500 animate-pulse" />
            {activeCountriesCount} Hotspots
          </span>
          {isStaleNews && activeCountriesCount > 0 && (
            <span
              className="text-[9px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200"
              title="Hotspots derived strictly from cached news articles during external API outage"
            >
              Cached
            </span>
          )}
          {isLoadingNews && (
            <span className="text-[10px] font-medium text-stone-400 animate-pulse">
              Syncing...
            </span>
          )}
        </div>
      </div>

      {/* Active Filter Notification Banner */}
      {selectedCountry && (() => {
        const countryColor = getCountryHotspotColor(selectedCountry.code);
        return (
          <div
            className="mt-2 flex items-center justify-between text-[11px] rounded-xl px-2.5 py-1 text-stone-800 animate-in fade-in duration-150 border"
            style={{
              backgroundColor: `${countryColor.primary}12`,
              borderColor: `${countryColor.border}66`,
            }}
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span>{selectedCountry.flag}</span>
              <span>
                Filtering map & feed for <strong>{selectedCountry.name}</strong> ({selectedCountry.articleCount} {selectedCountry.articleCount === 1 ? 'article' : 'articles'})
              </span>
            </span>
            <button
              onClick={() => onSelectCountry?.(null)}
              className="p-0.5 hover:bg-stone-200/60 rounded text-stone-700 transition-colors"
              title="Clear filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })()}

      {/* Dotted World Map Canvas (Natural Earth Projection) */}
      <div className="relative my-2 py-2 flex items-center justify-center bg-stone-50/50 rounded-xl border border-stone-100 overflow-hidden">
        <svg
          viewBox="0 0 800 390"
          className="w-full h-auto max-h-[125px] select-none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Arcs Gradient */}
            <linearGradient id="mapArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.4" />
              <stop offset="35%" stopColor="#3B82F6" stopOpacity="0.5" />
              <stop offset="70%" stopColor="#F59E0B" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.4" />
            </linearGradient>

            {/* Drop Shadow for pins */}
            <filter id="pinShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="1.8" floodOpacity="0.3" />
            </filter>

            {/* Glowing filter for highlighted countries */}
            <filter id="glowGold" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#F59E0B" floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Real Continent Landmass Backdrops */}
          <path
            d={WORLD_MAP_PATH}
            fill="#E7E5E4"
            opacity="0.3"
            stroke="#D6D3D1"
            strokeWidth="0.5"
          />

          {/* Authentic Real World Map Dots (Mapped to Real Continents & Islands) */}
          <path
            d={WORLD_MAP_DOTS_PATH}
            fill="#78716C"
            opacity="0.65"
          />

          {/* Dynamic Global News Connection Arcs (rendered dynamically between verified news hotspots when 2+ exist) */}
          {activeValidCountries.length >= 2 &&
            activeValidCountries.slice(0, Math.min(activeValidCountries.length - 1, 4)).map((c1, i) => {
              const c2 = activeValidCountries[i + 1];
              const midX = (c1.x + c2.x) / 2;
              const midY = Math.min(c1.y, c2.y) - 25;
              return (
                <path
                  key={`news-arc-${c1.code}-${c2.code}`}
                  d={`M ${c1.x} ${c1.y} Q ${midX} ${midY} ${c2.x} ${c2.y}`}
                  stroke="url(#mapArcGrad)"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                  fill="none"
                />
              );
            })}

          {/* Infrastructure Connection Arcs (only when nodes are explicitly provided as props) */}
          {nodes.length >= 2 &&
            nodes.slice(0, Math.min(nodes.length - 1, 4)).map((n1, i) => {
              const n2 = nodes[i + 1];
              const midX = (n1.x + n2.x) / 2;
              const midY = Math.min(n1.y, n2.y) - 25;
              return (
                <path
                  key={`node-arc-${n1.id}-${n2.id}`}
                  d={`M ${n1.x} ${n1.y} Q ${midX} ${midY} ${n2.x} ${n2.y}`}
                  stroke="url(#mapArcGrad)"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                  fill="none"
                />
              );
            })}

          {/* Country News Hotspots Layer: Collision-aware positioning ensures zero pin overlap */}
          {positionedCountries.map((country) => {
              const isSelected = selectedCountryCode === country.code;
              const isHovered = hoveredCountry?.code === country.code;
              const color = getCountryHotspotColor(country.code);
              const liveMarker = liveEventMarkers.get(country.code);
              const hasLiveEvent = Boolean(liveMarker);
              const posX = country.x + country.dx;
              const posY = country.y + country.dy;

              return (
                <g key={`country-spot-${country.code}`} id={`country-spot-${country.code}`}>
                  {/* Subtle hairline leader and true geographic anchor dot when displaced */}
                  {country.isDisplaced && (
                    <g className="pointer-events-none">
                      <circle
                        cx={country.x}
                        cy={country.y}
                        r="2.2"
                        fill={color.primary}
                        opacity="0.8"
                      />
                      <line
                        x1={country.x}
                        y1={country.y}
                        x2={posX}
                        y2={posY}
                        stroke={color.border}
                        strokeWidth="0.8"
                        strokeDasharray="2 2"
                        opacity="0.55"
                      />
                    </g>
                  )}

                  <g
                    transform={`translate(${posX}, ${posY})`}
                    className="cursor-pointer transition-transform duration-200"
                    style={{
                      transform: isHovered || isSelected
                        ? `translate(${posX}px, ${posY - 3}px) scale(1.2)`
                        : `translate(${posX}px, ${posY}px)`,
                      transformOrigin: '0 0',
                    }}
                    onClick={() => onSelectCountry?.(country.code)}
                    onMouseEnter={() => setHoveredCountry(country)}
                    onMouseLeave={() => setHoveredCountry(null)}
                  >
                  {/* Subtle outer glow on the country's landmass coordinates */}
                  <circle
                    cx="0"
                    cy="0"
                    r={isSelected ? '14' : '9'}
                    fill={color.primary}
                    opacity={isSelected ? 0.35 : 0.16}
                  />

                  {/* Live-event outer ring: only visible during the 120-second window */}
                  {hasLiveEvent && (
                    <circle
                      cx="0"
                      cy="0"
                      r="18"
                      fill="none"
                      stroke={color.primary}
                      strokeWidth="1.8"
                      strokeDasharray="4 3"
                      opacity="0.7"
                      className="animate-spin"
                      style={{ animationDuration: '8s', transformOrigin: '0 0' }}
                    />
                  )}

                  {/* Soft pulsing halo ONLY for countries receiving newly detected news */}
                  {(country.hasNewArticles || hasLiveEvent) && (
                    <circle
                      cx="0"
                      cy="0"
                      r="14"
                      fill={color.primary}
                      opacity="0.32"
                      className="animate-pulse"
                    />
                  )}

                  {/* Short beacon animation ONLY for genuinely new articles */}
                  {country.hasNewArticles && (
                    <circle
                      cx="0"
                      cy="0"
                      r="16"
                      fill={color.primary}
                      opacity="0.45"
                      className="animate-ping"
                      style={{ animationIterationCount: 3, animationDuration: '1.6s' }}
                    />
                  )}

                  {/* Active selection rotating dashed halo */}
                  {isSelected && (
                    <circle
                      cx="0"
                      cy="0"
                      r="15"
                      fill="none"
                      stroke={color.border}
                      strokeWidth="1.4"
                      strokeDasharray="3 2"
                    />
                  )}

                  {/* Reused original colourful SVG map pin symbol */}
                  <MapPinSymbol color={color.primary} pinType="pin" />

                  {/* Small, polished country intelligence badge pill */}
                  <g
                    transform="translate(0, -14)"
                    filter="url(#pinShadow)"
                  >
                    <rect
                      x="-11.5"
                      y="-9.5"
                      width="23"
                      height="10"
                      rx="5"
                      fill={isSelected ? color.badgeBg : '#18181B'}
                      stroke={isSelected ? '#FFFFFF' : color.border}
                      strokeWidth={isSelected ? '1.4' : '0.9'}
                    />
                    <text
                      x="-2.5"
                      y="-3.2"
                      fontSize="5.5"
                      fontWeight="bold"
                      fill="#FFFFFF"
                      textAnchor="middle"
                      fontFamily="system-ui, -apple-system, sans-serif"
                    >
                      {country.code}
                    </text>
                    <circle cx="5.5" cy="-4.7" r="2.8" fill={color.primary} />
                    <text
                      x="5.5"
                      y="-2.9"
                      fontSize="4.2"
                      fontWeight="bold"
                      fill="#FFFFFF"
                      textAnchor="middle"
                      fontFamily="system-ui, -apple-system, sans-serif"
                    >
                      {country.articleCount}
                    </text>
                  </g>
                </g>
              </g>
            );
          })}

          {/* Standalone live-event markers: countries with an active 120-second marker
               but NO baseline hotspot article in the current news dataset yet.
               These appear as lightweight pulsing beacons to signal incoming events. */}
          {Array.from(liveEventMarkers.entries())
            .filter(([code]) => !activeValidCountries.some((c) => c.code === code))
            .map(([code, marker]) => {
              const reg = COUNTRY_REGISTRY[code];
              if (!reg || typeof reg.x !== 'number' || typeof reg.y !== 'number') return null;
              if (isNaN(reg.x) || isNaN(reg.y) || reg.x <= 0 || reg.y <= 0) return null;

              const color = getCountryHotspotColor(code);
              const isSelected = selectedCountryCode === code;

              return (
                <g
                  key={`live-event-${code}`}
                  id={`live-event-${code}`}
                  transform={`translate(${reg.x}, ${reg.y})`}
                  className="cursor-pointer"
                  onClick={() => onSelectCountry?.(code)}
                >
                  {/* Outer pulsing ring */}
                  <circle
                    cx="0" cy="0" r="14"
                    fill={color.primary}
                    opacity="0.22"
                    className="animate-ping"
                    style={{ animationDuration: '2s', animationIterationCount: 'infinite' }}
                  />
                  {/* Spinning dashed ring */}
                  <circle
                    cx="0" cy="0" r="10"
                    fill="none"
                    stroke={color.primary}
                    strokeWidth="1.4"
                    strokeDasharray="3 3"
                    opacity="0.8"
                    className="animate-spin"
                    style={{ animationDuration: '6s', transformOrigin: '0 0' }}
                  />
                  {/* Inner dot */}
                  <circle
                    cx="0" cy="0" r="4"
                    fill={color.primary}
                    opacity={isSelected ? 1 : 0.85}
                  />
                  {/* Live badge */}
                  <text
                    x="0" y="-13"
                    fontSize="5"
                    fontWeight="bold"
                    fill={color.primary}
                    textAnchor="middle"
                    fontFamily="system-ui, -apple-system, sans-serif"
                    opacity="0.9"
                  >
                    {code}
                  </text>
                  {/* LIVE indicator */}
                  <circle cx="7" cy="-12" r="2" fill="#EF4444" className="animate-pulse" />
                </g>
              );
            })}

          {/* Location Map Pins (Datacenter Nodes) */}
          {nodes.map((node) => {
            const isHovered = hoveredNode?.id === node.id;

            return (
              <g
                key={node.id}
                id={`node-${node.id}`}
                transform={`translate(${node.x}, ${node.y})`}
                className="cursor-pointer transition-transform duration-200"
                style={{
                  transform: isHovered
                    ? `translate(${node.x}px, ${node.y - 3}px) scale(1.2)`
                    : `translate(${node.x}px, ${node.y}px)`,
                  transformOrigin: '0 0',
                }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Pulsing Beacon */}
                {node.status === 'online' && (
                  <circle
                    cx="0"
                    cy="0"
                    r="8"
                    fill={node.color}
                    opacity="0.25"
                    className="animate-ping"
                  />
                )}

                {/* Reused original colourful SVG map pin symbol */}
                <MapPinSymbol color={node.color} pinType={node.pinType} />
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay for Country Hotspot */}
        {hoveredCountry && (() => {
          const hoverColor = getCountryHotspotColor(hoveredCountry.code);
          return (
            <div
              className="absolute top-2 right-2 bg-stone-900/95 backdrop-blur-xs text-white text-[10px] px-2.5 py-2 rounded-xl shadow-xl pointer-events-none z-20 animate-in fade-in zoom-in-95 duration-150 max-w-[220px] border"
              style={{ borderColor: hoverColor.border }}
            >
              <div className="flex items-center justify-between gap-1.5 font-bold mb-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-sm">{hoveredCountry.flag}</span>
                  <span className="text-white">{hoveredCountry.name}</span>
                </span>
                <span
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
                  style={{
                    backgroundColor: hoverColor.badgeBg,
                    borderColor: hoverColor.border,
                    color: hoverColor.badgeText,
                  }}
                >
                  {hoveredCountry.code} • {hoveredCountry.code3}
                </span>
              </div>
              <div
                className="text-[9.5px] font-medium flex items-center gap-1"
                style={{ color: hoverColor.border }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ backgroundColor: hoverColor.primary }}
                />
                {hoveredCountry.articleCount} {hoveredCountry.articleCount === 1 ? 'article' : 'articles'} monitored
              </div>
              {hoveredCountry.recentHeadlines[0] && (
                <p className="text-[9px] text-stone-300 line-clamp-2 mt-1 italic border-t border-stone-800 pt-1 leading-snug">
                  "{hoveredCountry.recentHeadlines[0]}"
                </p>
              )}
              <div className="text-[8.5px] font-semibold mt-1" style={{ color: hoverColor.primary }}>
                Click to filter News Feed
              </div>
            </div>
          );
        })()}

        {/* Hover Tooltip Overlay for Datacenter Node (Infrastructure, never a news hotspot) */}
        {hoveredNode && !hoveredCountry && (
          <div className="absolute top-2 right-2 bg-stone-900/95 backdrop-blur-xs text-white text-[10px] px-2.5 py-1.5 rounded-lg shadow-lg border border-stone-800/80 pointer-events-none z-20 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between gap-2 font-bold">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: hoveredNode.color }}
                />
                <span>{hoveredNode.name}</span>
                <span className="text-stone-400 font-normal">({hoveredNode.region})</span>
              </div>
              <span className="text-[8.5px] uppercase tracking-wider font-semibold text-stone-400 bg-stone-800 px-1.5 py-0.5 rounded border border-stone-700/60">
                Infrastructure
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-stone-300 text-[9.5px]">
              <span>Agents: <strong className="text-white">{hoveredNode.agents}</strong></span>
              <span>•</span>
              <span>Ping: <strong className="text-emerald-400">{hoveredNode.latency}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Agent Status Breakdown Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-center text-xs">
        <div>
          <span className="block text-[10px] text-stone-400 font-medium">Online</span>
          <span className="font-bold text-emerald-600">{onlineCount}</span>
        </div>
        <div>
          <span className="block text-[10px] text-stone-400 font-medium">Busy</span>
          <span className="font-bold text-blue-600">{busyCount}</span>
        </div>
        <div>
          <span className="block text-[10px] text-stone-400 font-medium">Idle</span>
          <span className="font-bold text-amber-500">{idleCount}</span>
        </div>
        <div>
          <span className="block text-[10px] text-stone-400 font-medium">Offline</span>
          <span className="font-bold text-stone-400">{offlineCount}</span>
        </div>
      </div>
    </div>
  );
}
