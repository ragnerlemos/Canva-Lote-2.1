import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Image as ImageIcon,
  Loader2,
  Pause,
  Play,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { OverlayPageItem } from '../types/canva';

interface TopVideoViewerProps {
  pages: OverlayPageItem[];
  activePageIndex: number;
  onSelectPageIndex: (idx: number) => void;
  onUpdatePosition: (xPercent: number, yPercent: number) => void;
  onLoadPageVideo?: (pageIndex: number) => void;
  onOpenPagesTab: () => void;
  onPickLocalMedia: (files: FileList) => void;
  isExpandedSheet: boolean;
}

export const TopVideoViewer: React.FC<TopVideoViewerProps> = ({
  pages,
  activePageIndex,
  onSelectPageIndex,
  onUpdatePosition,
  onLoadPageVideo,
  onOpenPagesTab,
  onPickLocalMedia,
  isExpandedSheet,
}) => {
  const activePage = pages[activePageIndex] || null;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const miniVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [playingMiniId, setPlayingMiniId] = useState<string | null>(null);

  // Sync main video playback when switching pages
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !activePage?.videoUrl) return;
    vid.currentTime = 0;
    if (isPlaying) {
      void vid.play().catch(() => {
        setIsPlaying(false);
      });
    }
  }, [activePage?.id, activePage?.videoUrl]);

  // Sync inline miniature playback when playingMiniId changes or videoUrl becomes ready
  useEffect(() => {
    for (const [id, el] of Object.entries(miniVideoRefs.current)) {
      if (!el) continue;
      if (id === playingMiniId) {
        void el.play().catch(() => {});
      } else {
        el.pause();
      }
    }
  }, [playingMiniId, pages]);

  const togglePlayPause = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      void vid.play().catch(() => {});
      setIsPlaying(true);
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const vid = videoRef.current;
    if (vid) {
      vid.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  const toggleMiniPlay = (e: React.MouseEvent, page: OverlayPageItem, idx: number) => {
    e.stopPropagation();
    if (!page.videoUrl) {
      if (page.source === 'canva_design' && onLoadPageVideo) {
        setPlayingMiniId(page.id);
        onLoadPageVideo(idx);
      }
      return;
    }
    setPlayingMiniId((curr) => (curr === page.id ? null : page.id));
  };

  const updatePosFromPointer = (clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPct = Math.max(
      8,
      Math.min(92, Math.round(((clientX - rect.left) / rect.width) * 100))
    );
    const yPct = Math.max(
      8,
      Math.min(92, Math.round(((clientY - rect.top) / rect.height) * 100))
    );
    onUpdatePosition(xPct, yPct);
  };

  const aspectRatio =
    activePage?.width && activePage?.height
      ? activePage.width / activePage.height
      : 9 / 16;

  const style = activePage?.style;
  const stageFontPx = style
    ? Math.max(
        13,
        Math.round(
          style.fontSize *
            (isExpandedSheet ? 0.54 : 0.68) *
            (aspectRatio > 1 ? 0.85 : 1)
        )
      )
    : 22;

  const strokePx =
    style && style.outlineEnabled
      ? Math.max(1.5, Number((style.outlineWidth * (isExpandedSheet ? 0.72 : 0.9)).toFixed(1)))
      : 0;

  return (
    <section
      aria-label="Visualizador de mídia e texto"
      className={`relative w-full bg-slate-950 flex flex-col justify-between overflow-hidden select-none transition-all duration-200 ${
        isExpandedSheet
          ? 'h-[35dvh] min-h-[215px] shrink-0 lg:h-[calc(100dvh-52px)]'
          : 'flex-1 min-h-[245px] lg:h-[calc(100dvh-52px)]'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*,.mp4,.mov,.webm,.png,.jpg,.jpeg,.webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onPickLocalMedia(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {!activePage ? (
        <div className="flex-1 flex flex-col items-center justify-center px-5 text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300">
            <Film className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-xs">
            <h2 className="text-sm font-semibold text-white">
              Nenhum projeto ou mídia carregada
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Envie vídeos ou imagens limpas do seu aparelho ou abra um design multi-páginas do Canva.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Vídeos ou Imagens</span>
            </button>
            <button
              type="button"
              onClick={onOpenPagesTab}
              className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Designs do Canva
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Media + Live Text Overlay Stage */}
          <div className="flex-1 min-h-0 flex items-center justify-center p-2 sm:p-4">
            <div
              ref={stageRef}
              onPointerDown={(e) => {
                setIsDraggingText(true);
                e.currentTarget.setPointerCapture(e.pointerId);
                updatePosFromPointer(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (!isDraggingText) return;
                updatePosFromPointer(e.clientX, e.clientY);
              }}
              onPointerUp={() => setIsDraggingText(false)}
              onPointerCancel={() => setIsDraggingText(false)}
              style={{ aspectRatio: String(aspectRatio) }}
              className="relative h-full max-h-full max-w-full rounded-xl overflow-hidden bg-slate-900 shadow-2xl border border-slate-800/80 touch-none cursor-crosshair"
            >
              {activePage.videoUrl ? (
                <video
                  ref={videoRef}
                  key={activePage.videoUrl}
                  src={activePage.videoUrl}
                  poster={activePage.thumbnailUrl}
                  playsInline
                  loop
                  muted={isMuted}
                  autoPlay
                  onCanPlay={(e) => {
                    if (isPlaying && e.currentTarget.paused) {
                      void e.currentTarget.play().catch(() => {});
                    }
                  }}
                  className="w-full h-full object-cover pointer-events-none"
                />
              ) : activePage.thumbnailUrl ? (
                <img
                  src={activePage.thumbnailUrl}
                  alt={activePage.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                  {activePage.hasVideo ? (
                    <Film className="w-7 h-7" />
                  ) : (
                    <ImageIcon className="w-7 h-7" />
                  )}
                  <span className="text-[11px]">Página {activePage.pageNumber}</span>
                </div>
              )}

              {activePage.videoStatus === 'loading' && (
                <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-slate-950/75 backdrop-blur-sm text-white text-[11px] font-medium flex items-center gap-1.5 pointer-events-none">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Carregando vídeo...</span>
                </div>
              )}

              {/* Live Independent Text Overlay Layer with real outer stroke */}
              {style && activePage.phrase.trim() && (
                <div
                  style={{
                    left: `${style.positionXPercent}%`,
                    top: `${style.positionYPercent}%`,
                    width: `${style.boxWidthPercent}%`,
                    transform: 'translate(-50%, -50%)',
                    textAlign:
                      style.textAlign === 'start'
                        ? 'left'
                        : style.textAlign === 'end'
                          ? 'right'
                          : style.textAlign,
                  }}
                  className="absolute pointer-events-none px-1"
                >
                  <p
                    className="whitespace-pre-wrap break-words"
                    style={{
                      fontFamily: `"${style.fontFamily}", sans-serif`,
                      fontSize: `${stageFontPx}px`,
                      fontWeight: style.bold ? 700 : 400,
                      fontStyle: style.italic ? 'italic' : 'normal',
                      color: style.color,
                      lineHeight: style.lineHeight,
                      WebkitTextStroke:
                        strokePx > 0 ? `${strokePx}px ${style.outlineColor}` : undefined,
                      paintOrder: strokePx > 0 ? 'stroke fill' : undefined,
                    }}
                  >
                    {activePage.phrase}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* InShot-style Horizontal Playable Miniature Reel (always visible when pages exist) */}
          {pages.length > 0 && (
            <div className="px-2.5 py-1.5 bg-slate-900/95 border-t border-slate-800/80 overflow-x-auto no-scrollbar flex shrink-0 gap-2 items-center">
              {pages.map((p, idx) => {
                const isSelected = idx === activePageIndex;
                const isMiniPlaying = playingMiniId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => onSelectPageIndex(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectPageIndex(idx);
                      }
                    }}
                    className={`relative rounded-lg overflow-hidden shrink-0 border-2 transition cursor-pointer bg-slate-800 ${
                      isExpandedSheet ? 'w-11 h-14' : 'w-12 h-16'
                    } ${
                      isSelected ? 'border-indigo-500 ring-1 ring-indigo-400' : 'border-slate-700'
                    }`}
                  >
                    {p.videoUrl && isMiniPlaying ? (
                      <video
                        ref={(el) => {
                          miniVideoRefs.current[p.id] = el;
                        }}
                        src={p.videoUrl}
                        poster={p.thumbnailUrl}
                        muted
                        loop
                        playsInline
                        autoPlay
                        onLoadedData={(e) => {
                          if (e.currentTarget.paused) {
                            void e.currentTarget.play().catch(() => {});
                          }
                        }}
                        onCanPlay={(e) => {
                          if (e.currentTarget.paused) {
                            void e.currentTarget.play().catch(() => {});
                          }
                        }}
                        className="w-full h-full object-cover"
                      />
                    ) : p.thumbnailUrl ? (
                      <img
                        src={p.thumbnailUrl}
                        alt={`Miniatura ${p.pageNumber}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : p.videoUrl ? (
                      <video
                        src={p.videoUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        {p.hasVideo ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                      </div>
                    )}

                    {/* Mini Play/Pause button directly on thumbnail (InShot style) */}
                    {(p.hasVideo || p.videoUrl) && (
                      <button
                        type="button"
                        onClick={(e) => toggleMiniPlay(e, p, idx)}
                        aria-label={
                          isMiniPlaying
                            ? `Pausar miniatura ${p.pageNumber}`
                            : `Reproduzir miniatura ${p.pageNumber}`
                        }
                        className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-slate-950/70 hover:bg-slate-950/90 text-white flex items-center justify-center z-10 cursor-pointer"
                      >
                        {p.videoStatus === 'loading' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isMiniPlaying ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </button>
                    )}

                    <span className="absolute bottom-0.5 left-0.5 px-1 rounded bg-slate-950/75 text-[9px] font-mono-tabular font-bold text-white pointer-events-none">
                      {p.pageNumber}
                    </span>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Adicionar mais vídeos ou imagens"
                aria-label="Adicionar mais vídeos ou imagens"
                className={`rounded-lg border border-dashed border-slate-600 hover:border-slate-400 bg-slate-900/60 flex flex-col items-center justify-center text-slate-300 shrink-0 cursor-pointer gap-0.5 ${
                  isExpandedSheet ? 'w-11 h-14' : 'w-12 h-16'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="text-[9px] font-semibold">+Mídia</span>
              </button>
            </div>
          )}

          {/* Bottom Viewer Controls Strip */}
          <div className="px-3 py-1 bg-slate-950/95 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs text-slate-200">
            <div className="flex items-center gap-1">
              {activePage.videoUrl ? (
                <>
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo'}
                    className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-slate-800 flex items-center justify-center text-white cursor-pointer"
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Ativar áudio' : 'Silenciar áudio'}
                    className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-300 cursor-pointer"
                  >
                    {isMuted ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                </>
              ) : activePage.source === 'canva_design' &&
                activePage.videoStatus !== 'loading' &&
                onLoadPageVideo ? (
                <button
                  type="button"
                  onClick={() => onLoadPageVideo(activePageIndex)}
                  className="min-h-[36px] px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Carregar MP4</span>
                </button>
              ) : (
                <span className="text-[11px] text-slate-400 px-1.5 whitespace-nowrap">
                  {activePage.source === 'local_image'
                    ? 'Imagem local'
                    : activePage.source === 'canva_editor'
                      ? activePage.hasVideo
                        ? 'Vídeo nativo (Canva)'
                        : 'Página Canva'
                      : activePage.videoStatus === 'loading'
                        ? 'Exportando MP4...'
                        : 'Prévia'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onSelectPageIndex(
                    activePageIndex > 0 ? activePageIndex - 1 : pages.length - 1
                  )
                }
                disabled={pages.length <= 1}
                aria-label="Página anterior"
                className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-slate-800 disabled:opacity-35 flex items-center justify-center text-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono-tabular text-xs font-semibold text-white px-1.5 whitespace-nowrap">
                {activePage.pageNumber} / {pages.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  onSelectPageIndex(
                    activePageIndex + 1 < pages.length ? activePageIndex + 1 : 0
                  )
                }
                disabled={pages.length <= 1}
                aria-label="Próxima página"
                className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-slate-800 disabled:opacity-35 flex items-center justify-center text-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
