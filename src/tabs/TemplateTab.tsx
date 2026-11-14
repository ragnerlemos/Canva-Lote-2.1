import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  ImageOff,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { LibraryFilter } from '../hooks/useCanvaDesigns';
import type {
  AuthConnectionState,
  CanvaAuthStatus,
  CanvaDesignPage,
  CanvaDesignSummary,
} from '../types/canva';

interface TemplateTabProps {
  connectionState: AuthConnectionState;
  authStatus: CanvaAuthStatus | null;
  authError: string | null;
  onConnect: () => void;
  libraryFilter: LibraryFilter;
  onChangeFilter: (filter: LibraryFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  onSearchSubmit: () => void;
  items: CanvaDesignSummary[];
  continuation?: string;
  onLoadMore: () => void;
  isLoading: boolean;
  error: string | null;
  selectedDesign: CanvaDesignSummary | null;
  onSelectDesign: (design: CanvaDesignSummary) => void;
  pages: CanvaDesignPage[];
  selectedPageNumber: number;
  onSelectPageNumber: (pageNum: number) => void;
  isLoadingPages: boolean;
  onGoToTextTab: () => void;
}

export const TemplateTab: React.FC<TemplateTabProps> = ({
  connectionState,
  authStatus,
  authError,
  onConnect,
  libraryFilter,
  onChangeFilter,
  searchQuery,
  onChangeSearchQuery,
  onSearchSubmit,
  items,
  continuation,
  onLoadMore,
  isLoading,
  error,
  selectedDesign,
  onSelectDesign,
  pages,
  selectedPageNumber,
  onSelectPageNumber,
  isLoadingPages,
  onGoToTextTab,
}) => {
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  const handleCopyRedirect = () => {
    if (!authStatus?.redirectUri) return;
    navigator.clipboard.writeText(authStatus.redirectUri);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 1800);
  };

  const totalPages = Math.max(1, pages.length || selectedDesign?.pageCount || 1);
  const activePage =
    pages.find((p) => p.index === selectedPageNumber) ||
    pages[selectedPageNumber - 1] ||
    pages[0];
  const activeThumbnailUrl =
    activePage?.thumbnailUrl ||
    (selectedPageNumber === 1 ? selectedDesign?.thumbnailUrl : undefined);

  const goPrevPage = () => {
    if (selectedPageNumber > 1) {
      onSelectPageNumber(selectedPageNumber - 1);
    }
  };

  const goNextPage = () => {
    if (selectedPageNumber < totalPages) {
      onSelectPageNumber(selectedPageNumber + 1);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
    const delta = endX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) goNextPage();
    else goPrevPage();
  };

  if (connectionState !== 'connected') {
    return (
      <div className="py-4 space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <h1 className="text-base font-bold text-slate-900">01 — Escolher template</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Conecte sua conta Canva para pesquisar e selecionar designs reais.
          </p>
        </div>

        {authError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{authError}</span>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-900">
            Conexão OAuth 2.0 com Canva
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            A listagem da sua biblioteca de designs utiliza as APIs REST oficiais do Canva
            (PKCE). Seus tokens ficam protegidos exclusivamente no servidor.
          </p>

          {authStatus && !authStatus.configured && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2 text-xs text-amber-900">
              <div className="font-semibold">
                Credenciais OAuth pendentes no servidor
              </div>
              <p className="leading-relaxed">
                Configure <code className="font-mono-tabular">CANVA_CLIENT_ID</code> e{' '}
                <code className="font-mono-tabular">CANVA_CLIENT_SECRET</code> nas
                variáveis de ambiente para o App ID{' '}
                <strong className="font-mono-tabular">{authStatus.appId}</strong> e
                registre esta URL de callback no Canva Developers:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-white border border-amber-200 px-2 py-1.5 font-mono-tabular text-[11px] text-slate-800">
                  {authStatus.redirectUri}
                </code>
                <button
                  type="button"
                  onClick={handleCopyRedirect}
                  className="min-h-[36px] px-2.5 rounded bg-white border border-amber-300 text-amber-900 font-medium flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {copiedRedirect ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onConnect}
            disabled={connectionState === 'connecting'}
            className="w-full min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {connectionState === 'connecting' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Conectando ao Canva...</span>
              </>
            ) : (
              <span>Conectar minha conta Canva</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-3 space-y-3">
      {/* Compact Search & Filter Row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit();
          }}
          className="flex-1 flex gap-1.5"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              placeholder="Pesquisar designs pelo nome..."
              className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-60"
          >
            Buscar
          </button>
        </form>

        <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-200/70 shrink-0">
          <button
            type="button"
            onClick={() => onChangeFilter('designs')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              libraryFilter === 'designs'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Meus Designs
          </button>
          <button
            type="button"
            onClick={() => onChangeFilter('brand_templates')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              libraryFilter === 'brand_templates'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Brand Templates
          </button>
        </div>
      </div>

      {/* Selected Template Page Thumbnail Viewer */}
      {selectedDesign && (
        <div className="rounded-xl border border-indigo-200 bg-white overflow-hidden">
          <div className="px-3.5 py-2.5 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-indigo-700">
                Visualizador do template
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {selectedDesign.title}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {selectedDesign.editUrl && (
                <a
                  href={selectedDesign.editUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-2.5 rounded-lg border border-indigo-200 bg-white text-indigo-700 text-xs font-semibold flex items-center gap-1 hover:bg-indigo-50"
                >
                  <span>Abrir</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={onGoToTextTab}
                className="min-h-[38px] px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Usar esta página
              </button>
            </div>
          </div>

          {/* Large Page Preview Area with Swipe & Prev/Next Arrows */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative bg-slate-100 h-[210px] sm:h-[250px] flex items-center justify-center p-3 select-none"
          >
            {isLoadingPages ? (
              <div className="flex flex-col items-center gap-2 text-slate-500 text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                <span>Carregando miniaturas das páginas...</span>
              </div>
            ) : activeThumbnailUrl ? (
              <img
                src={activeThumbnailUrl}
                alt={`${selectedDesign.title} — Página ${selectedPageNumber}`}
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full object-contain rounded-lg shadow-sm border border-slate-200 bg-white"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 text-center px-4">
                <ImageOff className="w-6 h-6 mb-1.5" />
                <span className="text-xs font-medium text-slate-600">
                  Miniatura da página {selectedPageNumber} indisponível
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5">
                  Toque em &quot;Abrir&quot; para editar diretamente no Canva.
                </span>
              </div>
            )}

            {totalPages > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrevPage}
                  disabled={selectedPageNumber <= 1}
                  aria-label="Página anterior"
                  className="absolute left-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] rounded-full bg-white/90 border border-slate-200 shadow-sm flex items-center justify-center text-slate-800 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={goNextPage}
                  disabled={selectedPageNumber >= totalPages}
                  aria-label="Próxima página"
                  className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] rounded-full bg-white/90 border border-slate-200 shadow-sm flex items-center justify-center text-slate-800 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          {/* Horizontal Page Thumbnail Carousel */}
          <div className="px-3 py-2.5 border-t border-slate-200 bg-white space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold font-mono-tabular text-slate-700">
                Página {selectedPageNumber} de {totalPages}
              </span>
              {totalPages > 1 && (
                <span className="text-[11px] text-slate-400">
                  Deslize e toque para selecionar
                </span>
              )}
            </div>

            {(() => {
              const carouselPages =
                pages.length > 0
                  ? pages
                  : Array.from({ length: totalPages }, (_, idx) => ({
                      index: idx + 1,
                      thumbnailUrl: idx === 0 ? selectedDesign.thumbnailUrl : undefined,
                    }));

              return (
                <div className="flex items-stretch gap-2 overflow-x-auto snap-x snap-mandatory pb-1">
                  {carouselPages.map((p) => {
                    const isActive = selectedPageNumber === p.index;
                    const thumbSrc =
                      p.thumbnailUrl || (p.index === 1 ? selectedDesign.thumbnailUrl : undefined);

                    return (
                      <button
                        key={p.index}
                        type="button"
                        onClick={() => onSelectPageNumber(p.index)}
                        aria-label={`Selecionar página ${p.index}`}
                        aria-pressed={isActive}
                        className={`snap-start shrink-0 w-[78px] rounded-xl border overflow-hidden text-left transition cursor-pointer flex flex-col bg-slate-50 ${
                          isActive
                            ? 'border-indigo-600 ring-2 ring-indigo-600/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="aspect-[4/3] w-full bg-slate-100 flex items-center justify-center overflow-hidden">
                          {thumbSrc ? (
                            <img
                              src={thumbSrc}
                              alt={`Página ${p.index}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageOff className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div
                          className={`px-1.5 py-1 text-[11px] font-semibold font-mono-tabular text-center truncate ${
                            isActive
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-slate-700'
                          }`}
                        >
                          Pág. {p.index}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={onSearchSubmit}
            className="min-h-[34px] px-2.5 rounded-lg bg-white border border-red-200 text-red-700 font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Recarregar</span>
          </button>
        </div>
      )}

      {/* Library Grid */}
      {isLoading && items.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-200 bg-white overflow-hidden animate-pulse"
            >
              <div className="aspect-[4/3] bg-slate-200" />
              <div className="p-2.5 space-y-1.5">
                <div className="h-3.5 bg-slate-200 rounded w-4/5" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center space-y-2">
          <p className="text-sm font-medium text-slate-800">
            {libraryFilter === 'brand_templates'
              ? 'Nenhum Brand Template encontrado na sua conta.'
              : 'Nenhum design encontrado na sua conta Canva.'}
          </p>
          <p className="text-xs text-slate-500">
            {libraryFilter === 'brand_templates'
              ? 'Brand Templates exigem conta Canva Teams ou Enterprise com templates publicados.'
              : 'Tente alterar o termo de pesquisa ou atualizar a lista.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {items.map((design) => {
            const isSelected = selectedDesign?.id === design.id;
            return (
              <button
                key={design.id}
                type="button"
                onClick={() => onSelectDesign(design)}
                className={`text-left rounded-xl border bg-white overflow-hidden transition cursor-pointer flex flex-col ${
                  isSelected
                    ? 'border-indigo-600 ring-2 ring-indigo-600/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="aspect-[4/3] w-full bg-slate-100 relative overflow-hidden flex items-center justify-center">
                  {design.thumbnailUrl ? (
                    <img
                      src={design.thumbnailUrl}
                      alt={design.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                      <ImageOff className="w-5 h-5 mb-1" />
                      <span className="text-[11px]">Sem prévia</span>
                    </div>
                  )}
                  {isSelected && (
                    <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <div className="p-2.5 min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {design.title}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                    {design.source === 'brand_template'
                      ? 'Brand Template'
                      : `${design.pageCount || 1} ${
                          (design.pageCount || 1) === 1 ? 'página' : 'páginas'
                        }`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {continuation && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoading}
          className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
        >
          {isLoading ? 'Carregando...' : 'Carregar mais designs'}
        </button>
      )}
    </div>
  );
};
