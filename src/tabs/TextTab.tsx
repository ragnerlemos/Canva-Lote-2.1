import React from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CheckCircle2,
  Info,
  Italic,
  RefreshCw,
} from 'lucide-react';
import { TextPreviewBox } from '../components/TextPreviewBox';
import type {
  CanvaDesignSummary,
  CanvaTextLayer,
  EraseOriginalMode,
  TextAppearanceConfig,
} from '../types/canva';

interface TextTabProps {
  selectedDesign: CanvaDesignSummary | null;
  selectedPageNumber: number;
  selectedPageThumbnailUrl?: string;
  textLayers: CanvaTextLayer[];
  selectedLayer: CanvaTextLayer | null;
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onUpdateManualLayerText?: (text: string) => void;
  isLoading: boolean;
  infoMessage: string | null;
  onReloadTexts: () => void;
  keywordFilter: string;
  onChangeKeywordFilter: (keyword: string) => void;
  appearance: TextAppearanceConfig;
  onChangeAppearance: (next: TextAppearanceConfig) => void;
  samplePhrase: string;
  onGoToBatchTab: () => void;
}

const AVAILABLE_FONTS = [
  'Plus Jakarta Sans',
  'Montserrat',
  'Oswald',
  'Playfair Display',
  'DM Sans',
  'JetBrains Mono',
];

export const TextTab: React.FC<TextTabProps> = ({
  selectedDesign,
  selectedPageNumber,
  selectedPageThumbnailUrl,
  textLayers,
  selectedLayer,
  selectedLayerId,
  onSelectLayer,
  onUpdateManualLayerText,
  isLoading,
  infoMessage,
  onReloadTexts,
  keywordFilter,
  onChangeKeywordFilter,
  appearance,
  onChangeAppearance,
  samplePhrase,
  onGoToBatchTab,
}) => {
  const updateAppearance = (patch: Partial<TextAppearanceConfig>) => {
    onChangeAppearance({ ...appearance, ...patch });
  };

  const isManualWebMode = selectedLayer?.source === 'manual_keyword';

  return (
    <div className="py-3 space-y-4">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2.5 min-w-0">
          {selectedPageThumbnailUrl && (
            <img
              src={selectedPageThumbnailUrl}
              alt={`Miniatura página ${selectedPageNumber}`}
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              02 — Texto e Aparência
            </h1>
            <p className="text-xs text-slate-500 truncate">
              {selectedDesign
                ? `${selectedDesign.title} · Pág. ${selectedPageNumber}`
                : 'Selecione uma caixa de texto editável'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onReloadTexts}
          disabled={isLoading}
          className="min-h-[40px] px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Live Preview */}
      <TextPreviewBox
        layer={selectedLayer}
        keywordFilter={keywordFilter}
        samplePhrase={samplePhrase}
        appearance={appearance}
        selectedPageThumbnailUrl={selectedPageThumbnailUrl}
        onChangePosition={(xPercent, yPercent) =>
          updateAppearance({
            positionXPercent: xPercent,
            positionYPercent: yPercent,
          })
        }
      />

      {/* Detected Text Layers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700">
            {isManualWebMode
              ? 'Alvo da substituição no template'
              : `Caixas de texto detectadas (${textLayers.length})`}
          </span>
        </div>

        {infoMessage && (
          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-start gap-2 leading-relaxed">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {isManualWebMode && selectedLayer && onUpdateManualLayerText ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Texto / marcador original no seu template (ex: (frase))
            </label>
            <input
              type="text"
              value={selectedLayer.text}
              onChange={(e) => onUpdateManualLayerText(e.target.value)}
              placeholder="Ex: (frase)"
              className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600"
            />
          </div>
        ) : (
          textLayers.length > 0 && (
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white overflow-hidden">
              {textLayers.map((layer) => {
                const isSelected = selectedLayerId === layer.id;
                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => onSelectLayer(layer.id)}
                    className={`w-full min-h-[52px] px-3.5 py-2.5 text-left flex items-center justify-between gap-3 transition cursor-pointer ${
                      isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {layer.text || '(Caixa vazia)'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                        Pág. {layer.pageNumber}
                        {layer.fontSize ? ` · ${layer.fontSize}pt` : ''}
                        {layer.locked ? ' · Bloqueado' : ''}
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* Keyword / Substring Target (for Editor SDK / multi-word text boxes) */}
        {!isManualWebMode && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Palavra-chave específica dentro da caixa (opcional)
            </label>
            <input
              type="text"
              value={keywordFilter}
              onChange={(e) => onChangeKeywordFilter(e.target.value)}
              placeholder="Deixe vazio para substituir a caixa inteira"
              className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600"
            />
          </div>
        )}
      </div>

      {/* Erase Original Text & Position Controls for Web Canvas Compose */}
      {isManualWebMode && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-800">
              Substituição do texto original no fundo
            </div>
            <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-100 gap-1">
              {(
                [
                  ['inpaint', 'Apagar Suave'],
                  ['solid', 'Faixa Sólida'],
                  ['none', 'Sem apagar'],
                ] as Array<[EraseOriginalMode, string]>
              ).map(([modeKey, label]) => (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() =>
                    updateAppearance({
                      eraseMode: modeKey,
                      coverOriginalBg: modeKey === 'solid',
                      enforceCleanRemoval:
                        modeKey === 'none' ? false : appearance.enforceCleanRemoval,
                    })
                  }
                  className={`min-h-[36px] px-2 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                    appearance.eraseMode === modeKey
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between gap-2 min-h-[36px] pt-1 border-t border-slate-100 cursor-pointer">
            <span className="text-xs font-medium text-slate-700">
              Verificar e garantir remoção do texto antigo antes de inserir
            </span>
            <input
              type="checkbox"
              checked={appearance.enforceCleanRemoval}
              onChange={(e) => {
                const checked = e.target.checked;
                updateAppearance({
                  enforceCleanRemoval: checked,
                  eraseMode:
                    checked && appearance.eraseMode === 'none'
                      ? 'inpaint'
                      : appearance.eraseMode,
                });
              }}
              className="w-4 h-4 accent-indigo-600 shrink-0"
            />
          </label>

          {appearance.eraseMode === 'solid' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-600 shrink-0">Cor da faixa:</span>
              <input
                type="color"
                value={appearance.coverBgColor}
                onChange={(e) =>
                  updateAppearance({ coverBgColor: e.target.value })
                }
                className="w-10 h-9 p-0.5 rounded-lg border border-slate-200 bg-white cursor-pointer"
              />
              <input
                type="text"
                value={appearance.coverBgColor}
                onChange={(e) =>
                  updateAppearance({ coverBgColor: e.target.value })
                }
                className="flex-1 min-h-[36px] px-2.5 rounded-lg border border-slate-200 font-mono-tabular text-xs text-slate-900"
              />
            </div>
          )}

          {appearance.eraseMode !== 'none' && (
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                  <span>Largura apagada</span>
                  <span className="font-mono-tabular font-semibold">
                    {appearance.eraseWidthPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={92}
                  value={appearance.eraseWidthPercent}
                  onChange={(e) =>
                    updateAppearance({ eraseWidthPercent: Number(e.target.value) })
                  }
                  className="w-full h-9 accent-indigo-600"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                  <span>Altura apagada</span>
                  <span className="font-mono-tabular font-semibold">
                    {appearance.eraseHeightPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={40}
                  value={appearance.eraseHeightPercent}
                  onChange={(e) =>
                    updateAppearance({ eraseHeightPercent: Number(e.target.value) })
                  }
                  className="w-full h-9 accent-indigo-600"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                <span>Posição X</span>
                <span className="font-mono-tabular font-semibold">
                  {appearance.positionXPercent}%
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={95}
                value={appearance.positionXPercent}
                onChange={(e) =>
                  updateAppearance({ positionXPercent: Number(e.target.value) })
                }
                className="w-full h-9 accent-indigo-600"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                <span>Posição Y</span>
                <span className="font-mono-tabular font-semibold">
                  {appearance.positionYPercent}%
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={95}
                value={appearance.positionYPercent}
                onChange={(e) =>
                  updateAppearance({ positionYPercent: Number(e.target.value) })
                }
                className="w-full h-9 accent-indigo-600"
              />
            </div>
          </div>
        </div>
      )}

      {/* Style Mode Segmented Switch */}
      <div className="space-y-3 pt-1">
        <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-200/70">
          <button
            type="button"
            onClick={() => updateAppearance({ mode: 'preserve' })}
            className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
              appearance.mode === 'preserve'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            PRESERVAR ESTILO
          </button>
          <button
            type="button"
            onClick={() => updateAppearance({ mode: 'custom' })}
            className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
              appearance.mode === 'custom'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            PERSONALIZAR ESTILO
          </button>
        </div>

        {appearance.mode === 'preserve' ? (
          <p className="text-xs text-slate-600 px-1">
            {isManualWebMode
              ? 'Usa fonte em destaque com contorno preto padrão. Toque em "PERSONALIZAR ESTILO" para ajustar cor, fonte, tamanho e espessura do contorno.'
              : 'Mantém fonte, cor, tamanho, alinhamento e posição originais da caixa de texto selecionada no Canva, alterando apenas o conteúdo.'}
          </p>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3.5">
            {/* Font & Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Fonte
                </label>
                <select
                  value={appearance.fontFamily}
                  onChange={(e) => updateAppearance({ fontFamily: e.target.value })}
                  className="w-full min-h-[42px] px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  {AVAILABLE_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Tamanho (pt)
                </label>
                <input
                  type="number"
                  min={8}
                  max={240}
                  value={appearance.fontSize}
                  onChange={(e) =>
                    updateAppearance({ fontSize: Number(e.target.value) || 24 })
                  }
                  className="w-full min-h-[42px] px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular text-slate-900 focus:outline-none focus:border-indigo-600"
                />
              </div>
            </div>

            {/* Color + Bold/Italic + Align */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Cor do texto
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={appearance.color}
                    onChange={(e) => updateAppearance({ color: e.target.value })}
                    className="w-11 h-[42px] p-1 rounded-lg border border-slate-200 bg-white cursor-pointer"
                  />
                  <input
                    type="text"
                    value={appearance.color}
                    onChange={(e) => updateAppearance({ color: e.target.value })}
                    className="flex-1 min-h-[42px] px-2.5 rounded-lg border border-slate-200 font-mono-tabular text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Formato e Alinhamento
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateAppearance({ bold: !appearance.bold })}
                    aria-label="Negrito"
                    className={`min-h-[42px] min-w-[42px] rounded-lg border flex items-center justify-center cursor-pointer ${
                      appearance.bold
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    <Bold className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateAppearance({ italic: !appearance.italic })}
                    aria-label="Itálico"
                    className={`min-h-[42px] min-w-[42px] rounded-lg border flex items-center justify-center cursor-pointer ${
                      appearance.italic
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    <Italic className="w-4 h-4" />
                  </button>
                  {(
                    [
                      ['start', AlignLeft],
                      ['center', AlignCenter],
                      ['end', AlignRight],
                      ['justify', AlignJustify],
                    ] as const
                  ).map(([alignKey, Icon]) => (
                    <button
                      key={alignKey}
                      type="button"
                      onClick={() => updateAppearance({ textAlign: alignKey })}
                      aria-label={`Alinhar ${alignKey}`}
                      className={`min-h-[42px] flex-1 rounded-lg border flex items-center justify-center cursor-pointer ${
                        appearance.textAlign === alignKey
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Outline (Contorno) */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <label className="flex items-center justify-between min-h-[36px] cursor-pointer">
                <span className="text-xs font-semibold text-slate-700">
                  Contorno no texto
                </span>
                <input
                  type="checkbox"
                  checked={appearance.outlineEnabled}
                  onChange={(e) =>
                    updateAppearance({ outlineEnabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-indigo-600"
                />
              </label>

              {appearance.outlineEnabled && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Cor do contorno
                      </label>
                      <input
                        type="color"
                        value={appearance.outlineColor}
                        onChange={(e) =>
                          updateAppearance({ outlineColor: e.target.value })
                        }
                        className="w-full h-10 p-1 rounded-lg border border-slate-200 bg-white cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Espessura ({appearance.outlineWidth}px)
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={8}
                        value={appearance.outlineWidth}
                        onChange={(e) =>
                          updateAppearance({ outlineWidth: Number(e.target.value) })
                        }
                        className="w-full h-10 accent-indigo-600"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                    {isManualWebMode
                      ? 'Contorno aplicado diretamente na renderização final das imagens e PDFs importados para o Canva.'
                      : 'Nota SDK: no modo interno @canva/design, o contorno aparece na prévia e pode ser refinado no efeito de texto do Canva após gerar.'}
                  </p>
                </div>
              )}
            </div>

            {/* Editor SDK absolute position (only shown when using Editor SDK) */}
            {!isManualWebMode && (
              <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Posição Y (Top px)
                  </label>
                  <input
                    type="number"
                    value={appearance.positionTop}
                    onChange={(e) =>
                      updateAppearance({ positionTop: Number(e.target.value) || 0 })
                    }
                    className="w-full min-h-[42px] px-3 rounded-lg border border-slate-200 font-mono-tabular text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Posição X (Left px)
                  </label>
                  <input
                    type="number"
                    value={appearance.positionLeft}
                    onChange={(e) =>
                      updateAppearance({ positionLeft: Number(e.target.value) || 0 })
                    }
                    className="w-full min-h-[42px] px-3 rounded-lg border border-slate-200 font-mono-tabular text-xs text-slate-900"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Auto-fit long phrases */}
        <label className="flex items-center justify-between min-h-[44px] px-1 cursor-pointer">
          <span className="text-xs font-medium text-slate-700">
            Ajustar tamanho automaticamente se a frase for maior
          </span>
          <input
            type="checkbox"
            checked={appearance.autoFitLongText}
            onChange={(e) =>
              updateAppearance({ autoFitLongText: e.target.checked })
            }
            className="w-4 h-4 accent-indigo-600"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={onGoToBatchTab}
        className="w-full min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition cursor-pointer"
      >
        Ir para Lote de Frases
      </button>
    </div>
  );
};
