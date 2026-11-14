import React, { useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Italic,
  Layers,
} from 'lucide-react';
import type { OverlayPageItem, TextOverlayStyle } from '../../types/canva';

interface OverlayStyleTabProps {
  activePage: OverlayPageItem | null;
  totalPages: number;
  onUpdateStyle: (patch: Partial<TextOverlayStyle>) => void;
  onApplyStyleToAllPages: () => void;
}

const FONT_OPTIONS = [
  'Plus Jakarta Sans',
  'Inter',
  'Montserrat',
  'Poppins',
  'Oswald',
  'Bebas Neue',
  'Roboto',
  'Arial',
];

const COLOR_SWATCHES = [
  '#ffffff',
  '#facc15',
  '#000000',
  '#22d3ee',
  '#fb7185',
  '#4ade80',
];

export const OverlayStyleTab: React.FC<OverlayStyleTabProps> = ({
  activePage,
  totalPages,
  onUpdateStyle,
  onApplyStyleToAllPages,
}) => {
  const [appliedMsg, setAppliedMsg] = useState(false);

  if (!activePage) {
    return (
      <p className="py-6 text-center text-xs text-slate-500">
        Selecione ou carregue uma página na aba Páginas para ajustar o estilo.
      </p>
    );
  }

  const s = activePage.style;

  return (
    <div className="space-y-4">
      {/* Font + Bold/Italic */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 items-end">
        <div className="space-y-1">
          <label
            htmlFor="overlay-font-family"
            className="text-xs font-semibold text-slate-600"
          >
            Fonte
          </label>
          <select
            id="overlay-font-family"
            value={s.fontFamily}
            onChange={(e) => onUpdateStyle({ fontFamily: e.target.value })}
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onUpdateStyle({ bold: !s.bold })}
            aria-pressed={s.bold}
            title="Negrito"
            className={`min-h-[44px] min-w-[44px] px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer ${
              s.bold
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white border-slate-300 text-slate-700'
            }`}
          >
            <Bold className="w-4 h-4" />
            <span>Negrito</span>
          </button>
          <button
            type="button"
            onClick={() => onUpdateStyle({ italic: !s.italic })}
            aria-pressed={s.italic}
            title="Itálico"
            className={`min-h-[44px] min-w-[44px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer ${
              s.italic
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white border-slate-300 text-slate-700'
            }`}
          >
            <Italic className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Color Picker + Swatches */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-slate-600 block">
          Cor do texto
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-h-[44px] px-2.5 rounded-xl border border-slate-300 bg-white inline-flex items-center gap-2 cursor-pointer">
            <input
              type="color"
              value={s.color}
              onChange={(e) => onUpdateStyle({ color: e.target.value })}
              className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
            />
            <span className="font-mono-tabular text-xs font-medium text-slate-700 uppercase">
              {s.color}
            </span>
          </label>
          {COLOR_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => onUpdateStyle({ color: hex })}
              aria-label={`Cor ${hex}`}
              style={{ backgroundColor: hex }}
              className={`w-9 h-9 rounded-full border-2 cursor-pointer transition ${
                s.color.toLowerCase() === hex
                  ? 'border-indigo-600 scale-105'
                  : 'border-slate-300'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Font Size & Alignment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="overlay-font-size"
              className="text-xs font-semibold text-slate-600"
            >
              Tamanho da fonte
            </label>
            <span className="font-mono-tabular text-xs font-semibold text-slate-900">
              {s.fontSize}px
            </span>
          </div>
          <input
            id="overlay-font-size"
            type="range"
            min={16}
            max={72}
            step={1}
            value={s.fontSize}
            onChange={(e) => onUpdateStyle({ fontSize: Number(e.target.value) })}
            className="w-full h-9 accent-indigo-600 cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-slate-600 block">
            Alinhamento
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'start' as const, icon: AlignLeft, label: 'Esquerda' },
              { id: 'center' as const, icon: AlignCenter, label: 'Centro' },
              { id: 'end' as const, icon: AlignRight, label: 'Direita' },
              { id: 'justify' as const, icon: AlignJustify, label: 'Justificar' },
            ].map((item) => {
              const Icon = item.icon;
              const active = s.textAlign === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.label}
                  onClick={() => onUpdateStyle({ textAlign: item.id })}
                  className={`min-h-[44px] rounded-xl border flex items-center justify-center cursor-pointer ${
                    active
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Line Spacing & Block Width */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="overlay-line-height"
              className="text-xs font-semibold text-slate-600"
            >
              Espaçamento entre linhas
            </label>
            <span className="font-mono-tabular text-xs font-semibold text-slate-900">
              {s.lineHeight.toFixed(2)}x
            </span>
          </div>
          <input
            id="overlay-line-height"
            type="range"
            min={0.95}
            max={1.9}
            step={0.05}
            value={s.lineHeight}
            onChange={(e) => onUpdateStyle({ lineHeight: Number(e.target.value) })}
            className="w-full h-9 accent-indigo-600 cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="overlay-box-width"
              className="text-xs font-semibold text-slate-600"
            >
              Largura do bloco (quebra)
            </label>
            <span className="font-mono-tabular text-xs font-semibold text-slate-900">
              {s.boxWidthPercent}%
            </span>
          </div>
          <input
            id="overlay-box-width"
            type="range"
            min={40}
            max={96}
            step={2}
            value={s.boxWidthPercent}
            onChange={(e) =>
              onUpdateStyle({ boxWidthPercent: Number(e.target.value) })
            }
            className="w-full h-9 accent-indigo-600 cursor-pointer"
          />
        </div>
      </div>

      {/* Apply to all pages */}
      {totalPages > 1 && (
        <div className="pt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onApplyStyleToAllPages();
              setAppliedMsg(true);
              setTimeout(() => setAppliedMsg(false), 2500);
            }}
            className="w-full min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            {appliedMsg ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Estilo aplicado em todas as {totalPages} páginas</span>
              </>
            ) : (
              <>
                <Layers className="w-4 h-4" />
                <span>Aplicar estilo a todas as páginas ({totalPages})</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
