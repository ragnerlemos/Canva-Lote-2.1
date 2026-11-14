import React, { useState } from 'react';
import { Check, Layers } from 'lucide-react';
import type { OverlayPageItem, TextOverlayStyle } from '../../types/canva';

interface OverlayPositionTabProps {
  activePage: OverlayPageItem | null;
  totalPages: number;
  onUpdateStyle: (patch: Partial<TextOverlayStyle>) => void;
  onApplyPositionToAllPages: () => void;
}

const POSITION_PRESETS = [
  { label: 'Topo (18%)', x: 50, y: 18 },
  { label: 'Centro (50%)', x: 50, y: 50 },
  { label: 'Legenda (78%)', x: 50, y: 78 },
];

export const OverlayPositionTab: React.FC<OverlayPositionTabProps> = ({
  activePage,
  totalPages,
  onUpdateStyle,
  onApplyPositionToAllPages,
}) => {
  const [appliedMsg, setAppliedMsg] = useState(false);

  if (!activePage) {
    return (
      <p className="py-6 text-center text-xs text-slate-500">
        Selecione ou carregue uma página na aba Páginas para posicionar o texto.
      </p>
    );
  }

  const s = activePage.style;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Arraste o dedo diretamente sobre o vídeo no visualizador superior ou use os ajustes abaixo.
      </p>

      {/* Quick Presets */}
      <div className="grid grid-cols-3 gap-2">
        {POSITION_PRESETS.map((preset) => {
          const isCurrent =
            Math.abs(s.positionXPercent - preset.x) <= 2 &&
            Math.abs(s.positionYPercent - preset.y) <= 2;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() =>
                onUpdateStyle({
                  positionXPercent: preset.x,
                  positionYPercent: preset.y,
                })
              }
              className={`min-h-[44px] px-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                isCurrent
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Sliders X & Y */}
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="overlay-pos-x"
              className="text-xs font-semibold text-slate-600"
            >
              Posição Horizontal (X)
            </label>
            <span className="font-mono-tabular text-xs font-semibold text-slate-900">
              {s.positionXPercent}%
            </span>
          </div>
          <input
            id="overlay-pos-x"
            type="range"
            min={8}
            max={92}
            step={1}
            value={s.positionXPercent}
            onChange={(e) =>
              onUpdateStyle({ positionXPercent: Number(e.target.value) })
            }
            className="w-full h-9 accent-indigo-600 cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="overlay-pos-y"
              className="text-xs font-semibold text-slate-600"
            >
              Posição Vertical (Y)
            </label>
            <span className="font-mono-tabular text-xs font-semibold text-slate-900">
              {s.positionYPercent}%
            </span>
          </div>
          <input
            id="overlay-pos-y"
            type="range"
            min={8}
            max={92}
            step={1}
            value={s.positionYPercent}
            onChange={(e) =>
              onUpdateStyle({ positionYPercent: Number(e.target.value) })
            }
            className="w-full h-9 accent-indigo-600 cursor-pointer"
          />
        </div>
      </div>

      {totalPages > 1 && (
        <button
          type="button"
          onClick={() => {
            onApplyPositionToAllPages();
            setAppliedMsg(true);
            setTimeout(() => setAppliedMsg(false), 2500);
          }}
          className="w-full min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          {appliedMsg ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Posição aplicada em todas as {totalPages} páginas</span>
            </>
          ) : (
            <>
              <Layers className="w-4 h-4" />
              <span>Aplicar posição a todas as páginas ({totalPages})</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
