import { useCallback, useEffect, useState } from 'react';
import {
  getDesignPages,
  listBrandTemplates,
  listUserDesigns,
} from '../integrations/canva/restApiClient';
import type { CanvaDesignPage, CanvaDesignSummary } from '../types/canva';

export type LibraryFilter = 'designs' | 'brand_templates';

export function useCanvaDesigns(isConnected: boolean) {
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('designs');
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<CanvaDesignSummary[]>([]);
  const [continuation, setContinuation] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDesign, setSelectedDesign] = useState<CanvaDesignSummary | null>(null);
  const [pages, setPages] = useState<CanvaDesignPage[]>([]);
  const [selectedPageNumber, setSelectedPageNumber] = useState<number>(1);
  const [isLoadingPages, setIsLoadingPages] = useState(false);

  const loadLibrary = useCallback(
    async (queryText = searchQuery, filter = libraryFilter, nextToken?: string) => {
      if (!isConnected) {
        setItems([]);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const res =
          filter === 'brand_templates'
            ? await listBrandTemplates(queryText, nextToken)
            : await listUserDesigns(queryText, nextToken);

        setItems((prev) => (nextToken ? [...prev, ...res.items] : res.items));
        setContinuation(res.continuation);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Erro ao listar templates do Canva.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isConnected, libraryFilter, searchQuery]
  );

  useEffect(() => {
    if (isConnected) {
      void loadLibrary(searchQuery, libraryFilter);
    } else {
      setItems([]);
      setSelectedDesign(null);
      setPages([]);
    }
  }, [isConnected, libraryFilter]);

  const selectDesign = useCallback(async (design: CanvaDesignSummary) => {
    setSelectedDesign(design);
    setSelectedPageNumber(1);
    setPages([{ index: 1, thumbnailUrl: design.thumbnailUrl }]);

    if (design.source === 'design') {
      setIsLoadingPages(true);
      try {
        const fetchedPages = await getDesignPages(design.id);
        if (fetchedPages.length > 0) {
          const sorted = [...fetchedPages]
            .sort((a, b) => a.index - b.index)
            .map((p) => ({
              ...p,
              thumbnailUrl:
                p.thumbnailUrl || (p.index === 1 ? design.thumbnailUrl : undefined),
            }));
          setPages(sorted);
        } else {
          setPages(
            Array.from({ length: design.pageCount || 1 }, (_, i) => ({
              index: i + 1,
              thumbnailUrl: i === 0 ? design.thumbnailUrl : undefined,
            }))
          );
        }
      } catch {
        setPages(
          Array.from({ length: design.pageCount || 1 }, (_, i) => ({
            index: i + 1,
            thumbnailUrl: i === 0 ? design.thumbnailUrl : undefined,
          }))
        );
      } finally {
        setIsLoadingPages(false);
      }
    } else {
      setPages([{ index: 1, thumbnailUrl: design.thumbnailUrl }]);
    }
  }, []);

  return {
    libraryFilter,
    setLibraryFilter,
    searchQuery,
    setSearchQuery,
    items,
    continuation,
    isLoading,
    error,
    loadLibrary,
    selectedDesign,
    selectDesign,
    pages,
    selectedPageNumber,
    setSelectedPageNumber,
    isLoadingPages,
  };
}
