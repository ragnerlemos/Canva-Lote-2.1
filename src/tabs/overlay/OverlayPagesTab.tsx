import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Film,
  Image as ImageIcon,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { LibraryFilter } from '../../hooks/useCanvaDesigns';
import { isCanvaEditorHost } from '../../intents/design_editor';
import type {
  AuthConnectionState,
  CanvaDesignSummary,
  OverlayPageItem,
} from '../../types/canva';

interface OverlayPagesTabProps {
  connectionState: AuthConnectionState;
  onConnect: () => void;
  libraryFilter: LibraryFilter;
  onChangeLibraryFilter: (filter: LibraryFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  onSearchSubmit: () => void;
  designs: CanvaDesignSummary[];
  continuation?: string;
  onLoadMoreDesigns: () => void;
  isLoadingDesigns: boolean;
  designsError: string | null;
  selectedDesign: CanvaDesignSummary | null;
  onSelectDesign: (design: CanvaDesignSummary) => void;
  pages: OverlayPageItem[];
  activePageIndex: number;
  onSelectPageIndex: (idx: number) => void;
  onRemovePage: (idx: number) => void;
  isLoadingPages: boolean;
  onLoadPageVideo: (idx: number) => void;
  onLoadAllPageVideos: () => void;
  isLoadingAllVideos: boolean;
  onPickLocalMedia: (files: FileList) => void;
  onSyncFromCanvaEditor: () => void;
  isSyncingEditor: boolean;
  editorSyncError: string | null;
}

export const OverlayPagesTab: React.FC<OverlayPagesTabProps> = ({
  connectionState,
  onConnect,
  libraryFilter,
  onChangeLibraryFilter,
  searchQuery,
  onChangeSearchQuery,
  onSearchSubmit,
  designs,
  continuation,
  onLoadMoreDesigns,
  isLoadingDesigns,
  designsError,
  selectedDesign,
  onSelectDesign,
  pages,
  activePageIndex,
  onSelectPageIndex,
  onRemovePage,
  isLoadingPages,
  onLoadPageVideo,
  onLoadAllPageVideos,
  isLoadingAllVideos,
  onPickLocalMedia,
  onSyncFromCanvaEditor,
  isSyncingEditor,
  editorSyncError,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [playingThumbId, setPlayingThumbId] = useState<string | null>(null);
  const inEditor = isCanvaEditorHost();

  const videoReadyCount = pages.filter(
    (p) => Boolean(p.videoUrl) || (p.source === 'canva_editor' && p.hasVideo)
  ).length;
  const imageCount = pages.filter((p) => p.source === 'local_image').length;

  const toggleThumbPlay = (e: React.MouseEvent, p: OverlayPageItem, idx: number) => {
    e.stopPropagation();
    if (!p.videoUrl) {
      if (p.source === 'canva_design') {
        setPlayingThumbId(p.id);
        onLoadPageVideo(idx);
      }
      return;
    }
    setPlayingThumbId((curr) => (curr === p.id ? null : p.id));
  };

  return (
    <div className="space-y-4">
      {/* Quick Source Actions */}
      <div className="flex flex-wrap items-center gap-2">
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

        {inEditor && (
          <button
            type="button"
            disabled={isSyncingEditor}
            onClick={onSyncFromCanvaEditor}
            className="min-h-[44px] px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            {isSyncingEditor ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>Ler páginas do Editor Canva</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>Adicionar vídeos ou imagens</span>
        </button>
      </div>

      {editorSyncError && (
        <p className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          {editorSyncError}
        </p>
      )}

      {/* Loaded Pages Strip / List with InShot-style Playable Thumbnails */}
      {pages.length > 0 && (
        <div className="space-y-2.5 border-b border-slate-200 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                Páginas carregadas ({pages.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                {videoReadyCount} vídeo(s){imageCount > 0 ? ` · ${imageCount} imagem(ns)` : ''}
              </p>
            </div>

            {selectedDesign &&
              pages.some((p) => p.source === 'canva_design' && !p.videoUrl) && (
                <button
                  type="button"
                  disabled={isLoadingAllVideos}
                  onClick={onLoadAllPageVideos}
                  className="min-h-[38px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {isLoadingAllVideos ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Film className="w-3.5 h-3.5" />
                  )}
                  <span>Carregar MP4s</span>
                </button>
              )}
          </div>

          {isLoadingPages ? (
            <div className="py-4 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Carregando páginas do design...</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-[270px] overflow-y-auto pr-1">
              {pages.map((p, idx) => {
                const isActive = idx === activePageIndex;
                const isPlayingHere = playingThumbId === p.id;

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
                    className={`flex items-center gap-3 p-2 rounded-xl border transition cursor-pointer ${
                      isActive
                        ? 'border-indigo-600 bg-indigo-50/70'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {/* Playable Thumbnail Miniature (InShot-style) */}
                    <div className="relative w-14 h-20 rounded-lg bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center">
                      {p.videoUrl && isPlayingHere ? (
                        <video
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
                          alt={`Página ${p.pageNumber}`}
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
                      ) : p.hasVideo ? (
                        <Film className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      )}

                      {(p.hasVideo || p.videoUrl) && (
                        <button
                          type="button"
                          onClick={(e) => toggleThumbPlay(e, p, idx)}
                          aria-label={
                            isPlayingHere
                              ? `Pausar vídeo da página ${p.pageNumber}`
                              : `Reproduzir vídeo da página ${p.pageNumber}`
                          }
                          className="absolute inset-0 m-auto w-9 h-9 rounded-full bg-slate-950/65 hover:bg-slate-950/85 text-white flex items-center justify-center shadow cursor-pointer"
                        >
                          {p.videoStatus === 'loading' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : isPlayingHere ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono-tabular text-xs font-bold text-slate-900">
                          Pág. {p.pageNumber}
                        </span>
                        <span className="text-[11px] text-slate-400">·</span>
                        <span className="text-[11px] font-medium text-slate-600 truncate">
                          {p.isLoopClone && p.basePageNumber
                            ? `Repete Pág. ${p.basePageNumber}`
                            : p.source === 'local_image'
                              ? 'Imagem'
                              : p.videoUrl
                                ? 'Vídeo pronto'
                                : p.source === 'canva_editor' && p.hasVideo
                                  ? `Vídeo nativo (${p.editorVideoElementCount || 1})`
                                  : p.videoStatus === 'loading'
                                    ? 'Baixando MP4...'
                                    : p.videoStatus === 'error'
                                      ? 'Estática / fallback'
                                      : 'Toque ▶ para abrir'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 truncate mt-0.5">
                        {p.phrase.trim() || 'Sem frase nesta página'}
                      </p>
                    </div>

                    {!p.isLoopClone &&
                      (p.source === 'local_video' || p.source === 'local_image') && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemovePage(idx);
                          }}
                          aria-label={`Remover página ${p.pageNumber}`}
                          className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Canva REST Library Picker */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Designs da conta Canva
          </h3>
          {connectionState === 'connected' && (
            <button
              type="button"
              onClick={onSearchSubmit}
              className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
            >
              Atualizar lista
            </button>
          )}
        </div>

        {connectionState !== 'connected' ? (
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
            <p className="text-xs text-slate-600">
              Conecte sua conta Canva para listar e importar seus designs multi-páginas com vídeo.
            </p>
            <button
              type="button"
              onClick={onConnect}
              className="min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
            >
              Conectar conta Canva
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
              <button
                type="button"
                onClick={() => onChangeLibraryFilter('designs')}
                className={`flex-1 min-h-[36px] px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  libraryFilter === 'designs'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Meus Designs
              </button>
              <button
                type="button"
                onClick={() => onChangeLibraryFilter('brand_templates')}
                className={`flex-1 min-h-[36px] px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  libraryFilter === 'brand_templates'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Brand Templates
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSearchSubmit();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onChangeSearchQuery(e.target.value)}
                  placeholder="Buscar design no Canva..."
                  className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="min-h-[44px] px-4 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer shrink-0"
              >
                Buscar
              </button>
            </form>

            {designsError && (
              <p className="text-xs text-red-600">{designsError}</p>
            )}

            {isLoadingDesigns && designs.length === 0 ? (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Buscando seus designs no Canva...</span>
              </div>
            ) : designs.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">
                Nenhum design encontrado com este filtro.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {designs.map((design) => {
                  const selected = selectedDesign?.id === design.id;
                  return (
                    <button
                      key={design.id}
                      type="button"
                      onClick={() => onSelectDesign(design)}
                      className={`group text-left rounded-xl border overflow-hidden transition cursor-pointer ${
                        selected
                          ? 'border-indigo-600 ring-2 ring-indigo-600/20 bg-indigo-50/40'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="aspect-[9/12] bg-slate-100 relative overflow-hidden">
                        {design.thumbnailUrl ? (
                          <img
                            src={design.thumbnailUrl}
                            alt={design.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <Film className="w-5 h-5" />
                          </div>
                        )}
                        {selected && (
                          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {design.title}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {design.pageCount ? `${design.pageCount} pág.` : 'Design Canva'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {continuation && (
              <button
                type="button"
                disabled={isLoadingDesigns}
                onClick={onLoadMoreDesigns}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                {isLoadingDesigns ? 'Carregando...' : 'Carregar mais designs'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
