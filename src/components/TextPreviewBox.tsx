import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { getProxiedImageUrl } from '../integrations/canva/restApiClient';
import { renderPhraseOnTemplateImage } from '../services/canvasRenderer';
import type {
  CanvaTextLayer,
  RemovalVerificationReport,
  TextAppearanceConfig,
} from '../types/canva';

interface TextPreviewBoxProps {
  layer: CanvaTextLayer | null;
  keywordFilter: string;
  samplePhrase: string;
  appearance: TextAppearanceConfig;
  selectedPageThumbnailUrl?: string;
  onChangePosition?: (xPercent: number, yPercent: number) => void;
  readOnly?: boolean;
  headerLabel?: string;
}

export const TextPreviewBox: React.FC<TextPreviewBoxProps> = ({
  layer,
  keywordFilter,
  samplePhrase,
  appearance,
  selectedPageThumbnailUrl,
  onChangePosition,
  readOnly = false,
  headerLabel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [canvasError, setCanvasError] = useState(false);
  const [verification, setVerification] =
    useState<RemovalVerificationReport | null>(null);

  const originalText = layer?.text || '(frase)';
  const previewContent =
    keywordFilter.trim() && originalText.includes(keywordFilter.trim())
      ? originalText.replace(keywordFilter.trim(), samplePhrase || 'Sua nova frase')
      : samplePhrase || 'Sua nova frase';

  useEffect(() => {
    if (!selectedPageThumbnailUrl) {
      setCanvasReady(false);
      setVerification(null);
      return;
    }

    let cancelled = false;
    setCanvasError(false);

    const proxied = getProxiedImageUrl(selectedPageThumbnailUrl);

    void renderPhraseOnTemplateImage({
      proxiedImageUrl: proxied,
      phrase: previewContent,
      appearance,
      targetLayer: layer,
      targetCanvas: canvasRef.current,
      maxDimension: 520,
      exportEncoded: false,
    })
      .then((rendered) => {
        if (!cancelled) {
          setVerification(rendered.verification);
          setCanvasReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanvasError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPageThumbnailUrl, previewContent, appearance, layer]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onChangePosition) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPct = Math.max(
      5,
      Math.min(95, Math.round(((e.clientX - rect.left) / rect.width) * 100))
    );
    const yPct = Math.max(
      5,
      Math.min(95, Math.round(((e.clientY - rect.top) / rect.height) * 100))
    );
    onChangePosition(xPct, yPct);
  };

  const isCustom = appearance.mode === 'custom';
  const resolvedFontSize = Math.min(
    36,
    Math.max(12, isCustom ? appearance.fontSize : layer?.fontSize || 24)
  );
  const resolvedColor = isCustom ? appearance.color : layer?.color || '#facc15';
  const resolvedWeight = isCustom
    ? appearance.bold
      ? 700
      : 400
    : layer?.fontWeight === 'bold'
      ? 700
      : 600;
  const resolvedStyle = isCustom
    ? appearance.italic
      ? 'italic'
      : 'normal'
    : layer?.fontStyle || 'normal';
  const alignMap: Record<string, 'left' | 'center' | 'right' | 'justify'> = {
    start: 'left',
    center: 'center',
    end: 'right',
    justify: 'justify',
  };
  const resolvedAlign = alignMap[
    isCustom ? appearance.textAlign : layer?.textAlign || 'center'
  ];
  const outlineActive = isCustom ? appearance.outlineEnabled : true;
  const outlineColor = isCustom ? appearance.outlineColor : '#000000';
  const outlineWidth = isCustom ? appearance.outlineWidth : 2;
  const textShadowOutline =
    outlineActive && outlineWidth > 0
      ? `0 0 ${outlineWidth}px ${outlineColor}, ${outlineWidth}px ${outlineWidth}px 0 ${outlineColor}, -${outlineWidth}px -${outlineWidth}px 0 ${outlineColor}`
      : undefined;

  const isVisualCanvasMode = Boolean(selectedPageThumbnailUrl) && !canvasError;
  const activeBox = verification?.finalBoxPercent || {
    x: appearance.positionXPercent,
    y: appearance.positionYPercent,
    width: appearance.eraseWidthPercent,
    height: appearance.eraseHeightPercent,
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100/80 p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-slate-500 gap-2">
        <span>
          {headerLabel
            ? headerLabel
            : isVisualCanvasMode
              ? readOnly
                ? 'Prévia final da versão'
                : 'Prévia real (toque sobre o texto original para substituir)'
              : 'Prévia do texto substituído'}
        </span>
        <span className="font-mono-tabular shrink-0">
          {appearance.eraseMode === 'inpaint'
            ? 'Remoção suave'
            : appearance.eraseMode === 'solid'
              ? 'Faixa sólida'
              : 'Sem apagar'}
        </span>
      </div>

      {isVisualCanvasMode ? (
        <>
          <div className="rounded-lg bg-slate-900/5 border border-slate-200 p-2 flex items-center justify-center min-h-[180px]">
            <div
              onClick={readOnly ? undefined : handleCanvasClick}
              role={readOnly ? undefined : 'button'}
              tabIndex={readOnly ? undefined : 0}
              onKeyDown={(e) => {
                if (readOnly || !onChangePosition) return;
                if (e.key === 'ArrowUp')
                  onChangePosition(
                    appearance.positionXPercent,
                    Math.max(5, appearance.positionYPercent - 3)
                  );
                if (e.key === 'ArrowDown')
                  onChangePosition(
                    appearance.positionXPercent,
                    Math.min(95, appearance.positionYPercent + 3)
                  );
              }}
              className={`relative inline-block max-w-full select-none overflow-hidden rounded-lg shadow-sm bg-white ${
                readOnly || !onChangePosition ? '' : 'cursor-crosshair'
              }`}
            >
              {!canvasReady && (
                <div className="flex items-center justify-center gap-2 px-6 py-12 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Renderizando e verificando remoção...</span>
                </div>
              )}
              <canvas
                ref={canvasRef}
                className={`block max-h-[280px] w-auto max-w-full ${canvasReady ? '' : 'hidden'}`}
              />

              {/* Subtle dashed box showing verified erase+replace zone in edit mode */}
              {!readOnly && canvasReady && appearance.eraseMode !== 'none' && (
                <div
                  style={{
                    left: `${activeBox.x}%`,
                    top: `${activeBox.y}%`,
                    width: `${activeBox.width}%`,
                    height: `${activeBox.height}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  className="absolute pointer-events-none border border-dashed border-indigo-400/75 rounded-md"
                />
              )}
            </div>
          </div>

          {canvasReady && verification && (
            <div
              className={`px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-1.5 ${
                verification.verified
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {verification.verified ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              )}
              <span className="truncate">{verification.summary}</span>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg bg-white border border-slate-200 min-h-[76px] px-4 py-3 flex items-center justify-center overflow-hidden">
          <p
            className="w-full break-words leading-snug"
            style={{
              fontFamily: isCustom ? appearance.fontFamily : 'inherit',
              fontSize: `${resolvedFontSize}px`,
              color: resolvedColor,
              fontWeight: resolvedWeight,
              fontStyle: resolvedStyle,
              textAlign: resolvedAlign,
              textShadow: textShadowOutline,
            }}
          >
            {previewContent}
          </p>
        </div>
      )}
    </div>
  );
};
