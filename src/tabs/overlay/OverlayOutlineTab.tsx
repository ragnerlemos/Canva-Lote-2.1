import React, { useState } from 'react';
import { Check, Info, Layers } from 'lucide-react';
import type { OverlayPageItem, TextOverlayStyle } from '../../types/canva';

interface OverlayOutlineTabProps {
  activePage: OverlayPageItem | null;
  totalPages: number;
  onUpdateStyle: (patch: Partial<TextOverlayStyle>) => void;
  onApplyOutlineToAllPages: () => void;
}

const OUTLINE_SWATCHES = ['#000000', '#ffffff', '#0f172a', '#dc2626', '#4f46e5'];

export const OverlayOutlineTab: React.FC<OverlayOutlineTabProps> = ({
  activePage,
  totalPages,
  onUpdateStyle,
  onApplyOutlineToAllPages,
}) => {
  const [appliedMsg, setAppliedMsg] = useState(false);

  if (!activePage) {
    return (
      <p className="py-6 text-center text-xs text-slate-500">
        Selecione ou carregue uma página na aba Páginas para configurar o contorno.
      </p>
    );
  }

  const s = activePage.style;

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <label className="min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 cursor-pointer">
        <div>
          <span className="text-sm font-semibold text-slate-900 block">
            Contorno no texto
          </span>
          <span className="text-[11px] text-slate-500">
            Legibilidade tipo legenda de vídeo sem achatar o texto como imagem
          </span>
        </div>
        <input
          type="checkbox"
          checked={s.outlineEnabled}
          onChange={(e) => onUpdateStyle({ outlineEnabled: e.target.checked })}
          className="w-5 h-5 accent-indigo-600 cursor-pointer shrink-0"
        />
      </label>

      {s.outlineEnabled && (
        <>
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600 block">
              Cor do contorno
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="min-h-[44px] px-2.5 rounded-xl border border-slate-300 bg-white inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="color"
                  value={s.outlineColor}
                  onChange={(e) => onUpdateStyle({ outlineColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                />
                <span className="font-mono-tabular text-xs font-medium text-slate-700 uppercase">
                  {s.outlineColor}
                </span>
              </label>
              {OUTLINE_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onUpdateStyle({ outlineColor: hex })}
                  aria-label={`Cor de contorno ${hex}`}
                  style={{ backgroundColor: hex }}
                  className={`w-9 h-9 rounded-full border-2 cursor-pointer transition ${
                    s.outlineColor.toLowerCase() === hex
                      ? 'border-indigo-600 scale-105'
                      : 'border-slate-300'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="overlay-outline-width"
                className="text-xs font-semibold text-slate-600"
              >
                Espessura do contorno
              </label>
              <span className="font-mono-tabular text-xs font-semibold text-slate-900">
                {s.outlineWidth}px
              </span>
            </div>
            <input
              id="overlay-outline-width"
              type="range"
              min={1}
              max={12}
              step={1}
              value={s.outlineWidth}
              onChange={(e) =>
                onUpdateStyle({ outlineWidth: Number(e.target.value) })
              }
              className="w-full h-9 accent-indigo-600 cursor-pointer"
            />
          </div>
        </>
      )}

      <div className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          No PowerPoint (.pptx), o contorno é gravado diretamente como traço vetorial editável no texto (OOXML). No Editor do Canva, a API atual cria a camada de texto editável e permite ajustar efeitos extras em <strong>Efeitos → Contorno</strong> sem achatar o texto.
        </p>
      </div>

      {totalPages > 1 && (
        <button
          type="button"
          onClick={() => {
            onApplyOutlineToAllPages();
            setAppliedMsg(true);
            setTimeout(() => setAppliedMsg(false), 2500);
          }}
          className="w-full min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          {appliedMsg ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Contorno aplicado em todas as {totalPages} páginas</span>
            </>
          ) : (
            <>
              <Layers className="w-4 h-4" />
              <span>Aplicar contorno a todas as páginas ({totalPages})</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
