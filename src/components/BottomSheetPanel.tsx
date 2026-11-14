import React, { useRef } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Layers,
  Move,
  Palette,
  SquareDot,
  Type,
} from 'lucide-react';
import type { OverlayPageItem, TabId, TextEntryMode } from '../types/canva';
import { BatchLinesTextarea } from './BatchLinesTextarea';

interface BottomSheetPanelProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  isExpanded: boolean;
  onToggleExpand: (expanded: boolean) => void;
  activePage: OverlayPageItem | null;
  totalPages: number;
  textEntryMode: TextEntryMode;
  onChangeTextEntryMode: (mode: TextEntryMode) => void;
  batchText: string;
  onChangeBatchText: (raw: string) => void;
  onQuickPhraseChange: (phrase: string) => void;
  topBanner?: React.ReactNode;
  children: React.ReactNode;
}

const OVERLAY_TABS: Array<{
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'text', label: 'Texto', icon: Type },
  { id: 'style', label: 'Estilo', icon: Palette },
  { id: 'outline', label: 'Contorno', icon: SquareDot },
  { id: 'position', label: 'Posição', icon: Move },
  { id: 'pages', label: 'Páginas', icon: Layers },
  { id: 'export', label: 'Exportação', icon: Download },
];

export const BottomSheetPanel: React.FC<BottomSheetPanelProps> = ({
  activeTab,
  onSelectTab,
  isExpanded,
  onToggleExpand,
  activePage,
  totalPages,
  textEntryMode,
  onChangeTextEntryMode,
  batchText,
  onChangeBatchText,
  onQuickPhraseChange,
  topBanner,
  children,
}) => {
  const dragStartYRef = useRef<number | null>(null);

  const handleDragStart = (e: React.PointerEvent) => {
    dragStartYRef.current = e.clientY;
  };

  const handleDragEnd = (e: React.PointerEvent) => {
    if (dragStartYRef.current === null) return;
    const deltaY = e.clientY - dragStartYRef.current;
    dragStartYRef.current = null;
    if (deltaY < -28) {
      onToggleExpand(true);
    } else if (deltaY > 28) {
      onToggleExpand(false);
    }
  };

  const batchCount = batchText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0).length;

  return (
    <aside
      aria-label="Painel de edição e exportação"
      className={`w-full bg-white border-t border-slate-200 lg:border-t-0 lg:border-l flex flex-col shadow-[0_-8px_30px_rgba(15,23,42,0.12)] lg:shadow-none z-20 ${
        isExpanded
          ? 'flex-1 min-h-0 lg:h-[calc(100dvh-52px)]'
          : 'shrink-0 max-h-[48dvh] lg:h-[calc(100dvh-52px)] lg:max-h-none'
      }`}
    >
      {/* Mobile Drag Handle + Expand/Collapse Trigger */}
      <div
        onPointerDown={handleDragStart}
        onPointerUp={handleDragEnd}
        className="lg:hidden flex items-center justify-between px-3 pt-1.5 pb-1 border-b border-slate-100 touch-none select-none cursor-grab active:cursor-grabbing shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-slate-600 truncate tabular-nums">
            {activePage
              ? `Pág. ${activePage.pageNumber} de ${totalPages}`
              : 'Painel de Edição'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onToggleExpand(!isExpanded)}
          aria-label={isExpanded ? 'Recolher painel' : 'Expandir painel'}
          className="flex flex-col items-center justify-center px-4 py-1 -my-1 cursor-pointer"
        >
          <span className="w-10 h-1.5 rounded-full bg-slate-300" />
        </button>

        <button
          type="button"
          onClick={() => onToggleExpand(!isExpanded)}
          className="min-h-[34px] px-2 rounded-lg text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
        >
          <span>{isExpanded ? 'Recolher' : 'Expandir'}</span>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {topBanner}

      {/* 6 Horizontal Touch Tabs */}
      <nav
        aria-label="Abas de configuração"
        className="flex items-stretch overflow-x-auto border-b border-slate-200 bg-slate-50/70 shrink-0 no-scrollbar"
      >
        {OVERLAY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                onSelectTab(tab.id);
                if (!isExpanded) {
                  onToggleExpand(true);
                }
              }}
              className={`min-h-[44px] px-3 sm:px-3.5 flex-1 min-w-[72px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-semibold border-b-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
                isActive
                  ? 'border-indigo-600 text-indigo-700 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Collapsed Quick Mode & Spacious Batch Text Area (Mobile initial view) */}
      {!isExpanded && (
        <div className="lg:hidden px-2.5 py-2.5 bg-white pb-safe space-y-2 overflow-y-auto">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChangeTextEntryMode('batch')}
              className={`flex-1 min-h-[40px] px-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer whitespace-nowrap ${
                textEntryMode === 'batch'
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-700'
              }`}
            >
              Texto em Lote
            </button>
            <button
              type="button"
              onClick={() => onChangeTextEntryMode('individual')}
              className={`flex-1 min-h-[40px] px-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer whitespace-nowrap ${
                textEntryMode === 'individual'
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-700'
              }`}
            >
              Texto Individual
            </button>
          </div>

          {textEntryMode === 'batch' ? (
            <div className="space-y-1">
              <BatchLinesTextarea
                value={batchText}
                onChange={onChangeBatchText}
                minHeightPx={136}
                maxHeightViewportRatio={0.28}
                placeholder={
                  'Linha 1 vai para Página 1\nLinha 2 vai para Página 2\nLinha 3 vai para Página 3\n(Cole ou digite várias frases — 1 por linha)'
                }
              />
              <div className="flex items-center justify-between px-0.5 text-[11px] text-slate-500 tabular-nums">
                <span>
                  {batchCount} frase(s) · 1 linha = 1 página
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('text');
                    onToggleExpand(true);
                  }}
                  className="font-semibold text-indigo-600 hover:underline cursor-pointer"
                >
                  Ampliar editor
                </button>
              </div>
            </div>
          ) : (
            <textarea
              rows={3}
              value={activePage?.phrase ?? ''}
              disabled={!activePage}
              onChange={(e) => onQuickPhraseChange(e.target.value)}
              placeholder={
                activePage
                  ? `Frase da página ${activePage.pageNumber}...`
                  : 'Carregue um vídeo ou imagem primeiro'
              }
              className="w-full min-h-[88px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:border-indigo-500 focus:outline-none text-base text-slate-900 leading-6 disabled:opacity-60 resize-y overflow-y-auto overscroll-contain"
            />
          )}
        </div>
      )}

      {/* Expanded Scrollable Tab Body (Always visible on desktop lg:, visible on mobile when expanded) */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 sm:px-5 py-3.5 pb-safe ${
          isExpanded ? 'block' : 'hidden lg:block'
        }`}
      >
        {children}
      </div>
    </aside>
  );
};
