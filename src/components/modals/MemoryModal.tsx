'use client';

import React, { useState } from 'react';
import { Brain, Search, X } from 'lucide-react';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MEMORY_CHUNKS = [
  { id: 'mem-1', tag: 'LEX / Research', title: 'Q3 Market Strategic Synthesis', size: '1.4 MB', tokens: '42.8k', similarity: '99.2%', date: '10m ago' },
  { id: 'mem-2', tag: 'SUSI / Core', title: 'Swarm Task Routing Protocol v2.1', size: '840 KB', tokens: '28.1k', similarity: '96.5%', date: '25m ago' },
  { id: 'mem-3', tag: 'SPY / Security', title: 'Zero-Trust Audit Log #8492', size: '3.1 MB', tokens: '94.2k', similarity: '98.0%', date: '1h ago' },
  { id: 'mem-4', tag: 'YORU / Design', title: 'Vector UI Design System Tokens', size: '620 KB', tokens: '18.4k', similarity: '94.8%', date: '2h ago' },
];

export default function MemoryModal({ isOpen, onClose }: MemoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChunk, setSelectedChunk] = useState<typeof MEMORY_CHUNKS[0] | null>(null);

  if (!isOpen) return null;

  const filtered = MEMORY_CHUNKS.filter(
    (m) =>
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100/80 border border-amber-200/80 flex items-center justify-center text-amber-800">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Vector Memory & Neural Embeddings</h3>
              <p className="text-[11px] text-stone-500">Search active knowledge graph and vector context</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vector embeddings, documents, memory chunks..."
            className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 focus:bg-white focus:outline-none focus:border-amber-400 transition-all"
          />
        </div>

        {/* Memory Chunks Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[280px] overflow-y-auto pr-1">
          {filtered.map((chunk) => {
            const isSelected = selectedChunk?.id === chunk.id;
            return (
              <div
                key={chunk.id}
                onClick={() => setSelectedChunk(chunk)}
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-amber-50/70 border-amber-300 shadow-xs'
                    : 'bg-stone-50/50 border-stone-200/70 hover:bg-white hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-200/70 text-stone-700">
                    {chunk.tag}
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-600">{chunk.similarity} match</span>
                </div>
                <div className="font-bold text-stone-900 text-xs mb-1 line-clamp-1">{chunk.title}</div>
                <div className="flex items-center justify-between text-[10px] text-stone-400">
                  <span>Tokens: <strong className="text-stone-600">{chunk.tokens}</strong></span>
                  <span>{chunk.date}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Details preview banner */}
        {selectedChunk && (
          <div className="p-3 bg-stone-900 text-white rounded-xl text-xs space-y-1 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-400">{selectedChunk.title}</span>
              <span className="text-[10px] text-stone-400 font-mono">ID: {selectedChunk.id}</span>
            </div>
            <p className="text-stone-300 text-[11px] leading-relaxed">
              Vector embedding indexed in high-dimensional HNSW shard. Ready for semantic RAG recall and agent reasoning pipeline.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs text-stone-500">
          <span>Total Context: <strong>4.8M Tokens</strong></span>
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
