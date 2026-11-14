import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomSheetPanel } from './components/BottomSheetPanel';
import { CanvaEditorBridgeCard } from './components/CanvaEditorBridgeCard';
import { CompactHeader } from './components/CompactHeader';
import { TopVideoViewer } from './components/TopVideoViewer';
import { useCanvaAuth } from './hooks/useCanvaAuth';
import { useCanvaDesigns } from './hooks/useCanvaDesigns';
import {
  lookupBridgeBatch,
  reportBridgeInspection,
  reportBridgeSyncResult,
} from './integrations/canva/bridgeClient';
import {
  applyBridgeBatchToOpenDesign,
  getCurrentEditorDesignIdentity,
  inspectEditorDesignSafety,
  readEditorVideoPagesSnapshot,
  triggerCanvaEditorExport,
} from './integrations/canva/designSdkClient';
import {
  exportDesignPageAsMp4,
  getProxiedImageUrl,
  getProxiedMediaUrl,
} from './integrations/canva/restApiClient';
import { isCanvaEditorHost } from './intents/design_editor';
import { OverlayExportTab } from './tabs/overlay/OverlayExportTab';
import { OverlayOutlineTab } from './tabs/overlay/OverlayOutlineTab';
import { OverlayPagesTab } from './tabs/overlay/OverlayPagesTab';
import { OverlayPositionTab } from './tabs/overlay/OverlayPositionTab';
import { OverlayStyleTab } from './tabs/overlay/OverlayStyleTab';
import { OverlayTextTab } from './tabs/overlay/OverlayTextTab';
import {
  DEFAULT_SOCIAL_CAPTION_STYLE,
  type BridgePageSyncReport,
  type CanvaBridgeBatch,
  type EditorSafetyInspection,
  type OverlayPageItem,
  type TabId,
  type TextEntryMode,
  type TextOverlayStyle,
} from './types/canva';

function cloneDefaultStyle(): TextOverlayStyle {
  return { ...DEFAULT_SOCIAL_CAPTION_STYLE };
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/') && file.type !== 'image/gif') return true;
  return /\.(png|jpe?g|webp|bmp|avif)$/i.test(file.name);
}

function readLocalImageDimensions(
  objectUrl: string
): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || undefined,
        height: img.naturalHeight || undefined,
      });
    };
    img.onerror = () => resolve({});
    img.src = objectUrl;
  });
}

function readLocalVideoMetadataAndPoster(
  objectUrl: string
): Promise<{ width?: number; height?: number; posterDataUrl?: string }> {
  return new Promise((resolve) => {
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.muted = true;
    vid.playsInline = true;
    let settled = false;

    const finish = (posterDataUrl?: string) => {
      if (settled) return;
      settled = true;
      const w = vid.videoWidth || undefined;
      const h = vid.videoHeight || undefined;
      vid.removeAttribute('src');
      vid.load();
      resolve({ width: w, height: h, posterDataUrl });
    };

    vid.onloadeddata = () => {
      try {
        vid.currentTime = Math.min(0.15, vid.duration ? vid.duration * 0.1 : 0);
      } catch {
        finish();
      }
    };

    vid.onseeked = () => {
      try {
        const w = vid.videoWidth || 360;
        const h = vid.videoHeight || 640;
        const scale = Math.min(1, 360 / Math.max(w, 1));
        const cw = Math.max(2, Math.round(w * scale));
        const ch = Math.max(2, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(vid, 0, 0, cw, ch);
          finish(canvas.toDataURL('image/jpeg', 0.8));
          return;
        }
      } catch {
        // Ignore canvas capture error
      }
      finish();
    };

    vid.onerror = () => finish();
    setTimeout(() => finish(), 2500);
    vid.src = objectUrl;
  });
}

/**
 * Maps each batch text line 1-to-1 to pages. When there are MORE non-empty phrases
 * than base pages (e.g. 4 phrases on 3 videos), pages 4..N automatically repeat
 * base pages 1..N in loop while reusing cached video/image assets.
 */
function reconcilePagesWithBatchLines(
  prevPages: OverlayPageItem[],
  rawBatchText: string
): OverlayPageItem[] {
  const basePages = prevPages.filter((p) => !p.isLoopClone);
  if (basePages.length === 0) return prevPages;

  const lines = rawBatchText.replace(/\r\n/g, '\n').split('\n');
  let lastNonEmptyIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      lastNonEmptyIdx = i;
    }
  }

  const targetCount = Math.max(basePages.length, lastNonEmptyIdx + 1);
  const result: OverlayPageItem[] = [];

  for (let i = 0; i < targetCount; i++) {
    const phrase = lines[i] ?? '';
    if (i < basePages.length) {
      result.push({
        ...basePages[i],
        pageNumber: i + 1,
        isLoopClone: false,
        basePageNumber: basePages[i].pageNumber,
        phrase,
      });
    } else {
      const baseSource = basePages[i % basePages.length];
      const existingClone = prevPages[i];
      const canReuseCloneStyle =
        existingClone &&
        existingClone.isLoopClone &&
        existingClone.basePageNumber === baseSource.pageNumber;

      result.push({
        ...baseSource,
        id: `${baseSource.id}-loop-${i + 1}`,
        pageNumber: i + 1,
        title: `${baseSource.title} (Rep. ${i + 1})`,
        isLoopClone: true,
        basePageNumber: baseSource.pageNumber,
        phrase,
        style: canReuseCloneStyle
          ? { ...existingClone.style }
          : { ...baseSource.style },
      });
    }
  }

  return result;
}

export default function App() {
  const inEditor = isCanvaEditorHost();
  const [activeTab, setActiveTab] = useState<TabId>('text');
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);

  const [textEntryMode, setTextEntryMode] = useState<TextEntryMode>('batch');
  const [batchText, setBatchText] = useState('');

  const [pages, setPages] = useState<OverlayPageItem[]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [isSyncingEditor, setIsSyncingEditor] = useState(false);
  const [editorSyncError, setEditorSyncError] = useState<string | null>(null);
  const [isLoadingAllVideos, setIsLoadingAllVideos] = useState(false);

  // Internal Canva Editor Bridge State (used only when inEditor === true)
  const [editorInspection, setEditorInspection] = useState<EditorSafetyInspection | null>(null);
  const [isInspectingEditor, setIsInspectingEditor] = useState(false);
  const [bridgeBatch, setBridgeBatch] = useState<CanvaBridgeBatch | null>(null);
  const [recentCandidatesCount, setRecentCandidatesCount] = useState(0);
  const [isLookingUpBridge, setIsLookingUpBridge] = useState(false);
  const [isSyncingBridgeBatch, setIsSyncingBridgeBatch] = useState(false);
  const [bridgeSyncError, setBridgeSyncError] = useState<string | null>(null);
  const [lastSyncedReports, setLastSyncedReports] = useState<BridgePageSyncReport[]>([]);
  const [lastOutlineNote, setLastOutlineNote] = useState<string | undefined>(undefined);

  const localObjectUrlsRef = useRef<string[]>([]);
  const lastLoadedDesignIdRef = useRef<string | null>(null);
  const batchTextRef = useRef('');
  batchTextRef.current = batchText;

  const auth = useCanvaAuth();
  const library = useCanvaDesigns(auth.connectionState === 'connected');

  useEffect(() => {
    return () => {
      for (const u of localObjectUrlsRef.current) {
        URL.revokeObjectURL(u);
      }
      localObjectUrlsRef.current = [];
    };
  }, []);

  const applyBridgeBatchStylesToPages = useCallback((batch: CanvaBridgeBatch) => {
    const sorted = [...batch.pages].sort((a, b) => a.pageNumber - b.pageNumber);
    const maxPage = sorted[sorted.length - 1]?.pageNumber || 0;
    const rawLines: string[] = [];
    for (let num = 1; num <= maxPage; num++) {
      rawLines.push(sorted.find((s) => s.pageNumber === num)?.phrase ?? '');
    }
    const nextBatchText = rawLines.join('\n');
    batchTextRef.current = nextBatchText;
    setBatchText(nextBatchText);

    setPages((prev) => {
      const reconciled = reconcilePagesWithBatchLines(prev, nextBatchText);
      return reconciled.map((p) => {
        const spec = sorted.find((s) => s.pageNumber === p.pageNumber);
        return spec ? { ...p, phrase: spec.phrase, style: { ...spec.style } } : p;
      });
    });
  }, []);

  const refreshEditorInspection = useCallback(
    async (batchToReport?: CanvaBridgeBatch | null): Promise<EditorSafetyInspection | null> => {
      if (!inEditor) return null;
      setIsInspectingEditor(true);
      try {
        const insp = await inspectEditorDesignSafety();
        setEditorInspection(insp);
        const targetBatch = batchToReport ?? bridgeBatch;
        if (targetBatch) {
          void reportBridgeInspection(targetBatch.batchId, insp).catch(() => {});
        }
        return insp;
      } catch {
        return null;
      } finally {
        setIsInspectingEditor(false);
      }
    },
    [inEditor, bridgeBatch]
  );

  const lookupBridgeForEditor = useCallback(
    async (explicitCode?: string) => {
      if (!inEditor) return;
      setIsLookingUpBridge(true);
      setBridgeSyncError(null);
      try {
        const identity = await getCurrentEditorDesignIdentity().catch(() => ({
          designId: undefined,
          designTitle: '',
          pageCount: 0,
        }));
        const res = await lookupBridgeBatch({
          code: explicitCode,
          designId: identity.designId,
          title: identity.designTitle,
          includeRecent: true,
        });
        setRecentCandidatesCount(res.candidates.length);
        if (res.batch) {
          setBridgeBatch(res.batch);
          setLastSyncedReports(res.batch.pageReports || []);
          setLastOutlineNote(res.batch.outlineSdkNote);
          applyBridgeBatchStylesToPages(res.batch);
          void refreshEditorInspection(res.batch);
        } else if (explicitCode) {
          setBridgeSyncError(`Nenhum lote encontrado com o código "${explicitCode}".`);
        }
      } catch (err) {
        setBridgeSyncError(
          err instanceof Error ? err.message : 'Erro ao buscar lote da ponte.'
        );
      } finally {
        setIsLookingUpBridge(false);
      }
    },
    [inEditor, applyBridgeBatchStylesToPages, refreshEditorInspection]
  );

  const handleApplyAndSyncBridgeBatch = useCallback(async () => {
    if (!inEditor || !bridgeBatch) return;
    setIsSyncingBridgeBatch(true);
    setBridgeSyncError(null);
    try {
      await reportBridgeSyncResult(bridgeBatch.batchId, {
        status: 'syncing',
        inspection: editorInspection || undefined,
      }).catch(() => {});

      const outcome = await applyBridgeBatchToOpenDesign(bridgeBatch);
      setEditorInspection(outcome.inspection);
      setLastSyncedReports(outcome.pageReports);
      setLastOutlineNote(outcome.outlineSdkNote);

      const hasFailedPage = outcome.pageReports.some((r) => r.status === 'error');
      const finalStatus = hasFailedPage ? 'failed' : 'synced';
      const updated = await reportBridgeSyncResult(bridgeBatch.batchId, {
        status: finalStatus,
        inspection: outcome.inspection,
        pageReports: outcome.pageReports,
        outlineSdkNote: outcome.outlineSdkNote,
        ...(hasFailedPage
          ? {
              errorMessage:
                outcome.pageReports.find((r) => r.errorMessage)?.errorMessage ||
                'Uma ou mais páginas falharam na verificação pós-sync.',
            }
          : {}),
      });
      setBridgeBatch(updated);
      if (hasFailedPage && updated.errorMessage) {
        setBridgeSyncError(updated.errorMessage);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao aplicar e sincronizar lote no Editor do Canva.';
      setBridgeSyncError(msg);
      if (bridgeBatch) {
        void reportBridgeSyncResult(bridgeBatch.batchId, {
          status: 'failed',
          errorMessage: msg,
        }).catch(() => {});
      }
    } finally {
      setIsSyncingBridgeBatch(false);
    }
  }, [inEditor, bridgeBatch, editorInspection]);

  const syncFromCanvaEditor = useCallback(async () => {
    if (!inEditor) return;
    setIsSyncingEditor(true);
    setEditorSyncError(null);
    try {
      const snapshot = await readEditorVideoPagesSnapshot();
      if (!snapshot.available) {
        setEditorSyncError(snapshot.error || 'Não foi possível ler o design aberto.');
        return;
      }

      setPages((prev) => {
        const baseItems: OverlayPageItem[] = snapshot.pages.map((ep) => {
          const existing = prev.find(
            (p) => !p.isLoopClone && p.pageNumber === ep.pageNumber
          );
          return {
            id: `editor-p-${ep.pageNumber}`,
            pageNumber: ep.pageNumber,
            title: snapshot.designTitle || `Página ${ep.pageNumber}`,
            source: 'canva_editor',
            hasVideo: ep.hasVideo,
            videoStatus: ep.hasVideo ? 'ready' : 'static',
            videoUrl: ep.videoUrl || existing?.videoUrl,
            videoBlob: existing?.videoBlob,
            thumbnailUrl: ep.thumbnailUrl || existing?.thumbnailUrl,
            width: ep.width,
            height: ep.height,
            phrase: existing?.phrase ?? '',
            style: existing?.style ? { ...existing.style } : cloneDefaultStyle(),
            editorVideoElementCount: ep.videoElementCount,
            isLoopClone: false,
            basePageNumber: ep.pageNumber,
          };
        });
        return reconcilePagesWithBatchLines(baseItems, batchTextRef.current);
      });
      setActivePageIndex(0);
    } catch (err) {
      setEditorSyncError(
        err instanceof Error ? err.message : 'Erro ao sincronizar páginas do Editor.'
      );
    } finally {
      setIsSyncingEditor(false);
    }
  }, [inEditor]);

  useEffect(() => {
    if (inEditor) {
      void (async () => {
        await syncFromCanvaEditor();
        await refreshEditorInspection(null);
        await lookupBridgeForEditor();
      })();
    }
  }, [inEditor, syncFromCanvaEditor]);

  // Populate OverlayPageItem[] whenever a Canva design's pages load
  useEffect(() => {
    const design = library.selectedDesign;
    if (!design) return;

    const isSameDesign = lastLoadedDesignIdRef.current === design.id;
    lastLoadedDesignIdRef.current = design.id;

    setPages((prev) => {
      const baseItems: OverlayPageItem[] = library.pages.map((p) => {
        const existing = isSameDesign
          ? prev.find((item) => !item.isLoopClone && item.pageNumber === p.index)
          : undefined;

        const thumb = p.thumbnailUrl
          ? getProxiedImageUrl(p.thumbnailUrl)
          : design.thumbnailUrl
            ? getProxiedImageUrl(design.thumbnailUrl)
            : undefined;

        return {
          id: `${design.id}-p-${p.index}`,
          pageNumber: p.index,
          title: `${design.title} — Pág. ${p.index}`,
          source: 'canva_design',
          hasVideo: existing?.hasVideo ?? true,
          videoStatus: existing?.videoStatus ?? 'idle',
          videoUrl: existing?.videoUrl,
          videoBlob: existing?.videoBlob,
          thumbnailUrl: thumb,
          width: p.width,
          height: p.height,
          phrase: existing?.phrase ?? '',
          style: existing?.style ? { ...existing.style } : cloneDefaultStyle(),
          isLoopClone: false,
          basePageNumber: p.index,
        };
      });
      return reconcilePagesWithBatchLines(baseItems, batchTextRef.current);
    });

    if (!isSameDesign) {
      setActivePageIndex(0);
    }
  }, [library.selectedDesign?.id, library.pages]);

  const handleChangeBatchText = useCallback((raw: string) => {
    setBatchText(raw);
    setPages((prev) => {
      const next = reconcilePagesWithBatchLines(prev, raw);
      setActivePageIndex((idx) =>
        next.length === 0 ? 0 : Math.min(idx, next.length - 1)
      );
      return next;
    });
  }, []);

  const handleUpdateSinglePagePhrase = useCallback(
    (pageIndex: number, phrase: string) => {
      setPages((prev) => {
        const next = prev.map((p, i) =>
          i === pageIndex ? { ...p, phrase } : p
        );
        setBatchText(next.map((p) => p.phrase).join('\n'));
        return next;
      });
    },
    []
  );

  const handleApplyPhraseToAllPages = useCallback((phrase: string) => {
    setPages((prev) => {
      const next = prev.map((p) => ({ ...p, phrase }));
      setBatchText(next.map((p) => p.phrase).join('\n'));
      return next;
    });
  }, []);

  const loadSinglePageVideo = useCallback(
    async (pageIdx: number): Promise<OverlayPageItem | null> => {
      const design = library.selectedDesign;
      const target = pages[pageIdx];
      if (!design || !target || target.source !== 'canva_design') {
        return target || null;
      }
      if (target.videoBlob && target.videoUrl) {
        return target;
      }

      const targetBaseNum = target.basePageNumber || target.pageNumber;
      const cachedBase = pages.find(
        (p) => !p.isLoopClone && p.pageNumber === targetBaseNum && p.videoUrl
      );
      if (cachedBase?.videoUrl) {
        let reusedItem: OverlayPageItem | null = null;
        setPages((prev) =>
          prev.map((p, i) => {
            if (i !== pageIdx) return p;
            reusedItem = {
              ...p,
              hasVideo: true,
              videoStatus: 'ready',
              videoUrl: cachedBase.videoUrl,
              videoBlob: cachedBase.videoBlob,
            };
            return reusedItem;
          })
        );
        return reusedItem;
      }

      setPages((prev) =>
        prev.map((p) =>
          p.pageNumber === target.pageNumber ||
          (p.isLoopClone && p.basePageNumber === targetBaseNum)
            ? { ...p, videoStatus: 'loading', errorMessage: undefined }
            : p
        )
      );

      try {
        const isLandscape = Boolean(
          target.width && target.height && target.width > target.height
        );
        const rawMp4Url = await exportDesignPageAsMp4(
          design.id,
          targetBaseNum,
          isLandscape ? 'horizontal_720p' : 'vertical_720p'
        );
        const proxiedUrl = getProxiedMediaUrl(rawMp4Url);
        let blob: Blob | undefined;
        let playableUrl = proxiedUrl;
        try {
          const resp = await fetch(proxiedUrl, { credentials: 'include' });
          if (resp.ok) {
            blob = await resp.blob();
            if (blob.size > 0) {
              playableUrl = URL.createObjectURL(blob);
              localObjectUrlsRef.current.push(playableUrl);
            }
          }
        } catch {
          // Stream URL still works in <video>
        }

        let updatedItem: OverlayPageItem | null = null;
        setPages((prev) =>
          prev.map((p, i) => {
            const matchesBase =
              (!p.isLoopClone && p.pageNumber === targetBaseNum) ||
              (p.isLoopClone && p.basePageNumber === targetBaseNum);
            if (!matchesBase) return p;
            const next = {
              ...p,
              hasVideo: true,
              videoStatus: 'ready' as const,
              videoUrl: playableUrl,
              videoBlob: blob,
            };
            if (i === pageIdx) updatedItem = next;
            return next;
          })
        );
        return updatedItem;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Não foi possível exportar MP4 desta página.';
        setPages((prev) =>
          prev.map((p) =>
            p.basePageNumber === targetBaseNum || p.pageNumber === targetBaseNum
              ? { ...p, videoStatus: 'error', errorMessage: msg }
              : p
          )
        );
        return null;
      }
    },
    [library.selectedDesign, pages]
  );

  const handleLoadAllPageVideos = useCallback(async () => {
    if (!library.selectedDesign || pages.length === 0) return;
    setIsLoadingAllVideos(true);
    try {
      for (let i = 0; i < pages.length; i++) {
        const item = pages[i];
        if (
          !item.isLoopClone &&
          item.source === 'canva_design' &&
          (!item.videoUrl || !item.videoBlob)
        ) {
          await loadSinglePageVideo(i);
        }
      }
    } finally {
      setIsLoadingAllVideos(false);
    }
  }, [library.selectedDesign, pages, loadSinglePageVideo]);

  const ensurePageVideosForExport = useCallback(async (): Promise<OverlayPageItem[]> => {
    const design = library.selectedDesign;
    const baseVideoCache = new Map<
      number,
      { videoUrl?: string; videoBlob?: Blob; hasVideo: boolean }
    >();
    const resultList: OverlayPageItem[] = [];

    for (let i = 0; i < pages.length; i++) {
      const current = pages[i];
      const baseNum = current.basePageNumber || current.pageNumber;

      // Reuse already-fetched base video for looped clones
      const cached = baseVideoCache.get(baseNum);
      if (cached) {
        const reused: OverlayPageItem = {
          ...current,
          hasVideo: cached.hasVideo,
          videoStatus: cached.videoBlob ? 'ready' : current.videoStatus,
          videoUrl: cached.videoUrl || current.videoUrl,
          videoBlob: cached.videoBlob || current.videoBlob,
        };
        resultList.push(reused);
        continue;
      }

      // Already has binary videoBlob ready (local video or cached Canva MP4)
      if (current.videoBlob && current.videoBlob.size > 0) {
        baseVideoCache.set(baseNum, {
          videoUrl: current.videoUrl,
          videoBlob: current.videoBlob,
          hasVideo: current.hasVideo,
        });
        resultList.push(current);
        continue;
      }

      // Static image page
      if (!current.hasVideo) {
        resultList.push(current);
        continue;
      }

      // Canva Editor page whose temporary video URL was resolved via @canva/asset
      if (current.source === 'canva_editor' && current.videoUrl) {
        try {
          const resp = await fetch(current.videoUrl, { credentials: 'include' });
          const blob = resp.ok ? await resp.blob() : undefined;
          const nextItem: OverlayPageItem = {
            ...current,
            videoBlob: blob,
            videoStatus: blob ? 'ready' : current.videoStatus,
          };
          baseVideoCache.set(baseNum, {
            videoUrl: current.videoUrl,
            videoBlob: blob,
            hasVideo: current.hasVideo,
          });
          resultList.push(nextItem);
          continue;
        } catch {
          resultList.push(current);
          continue;
        }
      }

      // Canva REST design page: export MP4 via /v1/exports
      if (current.source === 'canva_design' && design) {
        setPages((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, videoStatus: 'loading' } : p))
        );

        try {
          const isLandscape = Boolean(
            current.width && current.height && current.width > current.height
          );
          const rawMp4Url = await exportDesignPageAsMp4(
            design.id,
            baseNum,
            isLandscape ? 'horizontal_720p' : 'vertical_720p'
          );
          const proxiedUrl = getProxiedMediaUrl(rawMp4Url);
          const resp = await fetch(proxiedUrl, { credentials: 'include' });
          const blob = resp.ok ? await resp.blob() : undefined;

          const nextItem: OverlayPageItem = {
            ...current,
            hasVideo: Boolean(blob && blob.size > 0),
            videoStatus: blob ? 'ready' : 'static',
            videoUrl: proxiedUrl,
            videoBlob: blob,
          };
          baseVideoCache.set(baseNum, {
            videoUrl: proxiedUrl,
            videoBlob: blob,
            hasVideo: nextItem.hasVideo,
          });
          resultList.push(nextItem);
          setPages((prev) => prev.map((p, idx) => (idx === i ? nextItem : p)));
          continue;
        } catch (err) {
          const nextItem: OverlayPageItem = {
            ...current,
            videoStatus: 'error',
            errorMessage:
              err instanceof Error ? err.message : 'Falha ao baixar MP4.',
          };
          resultList.push(nextItem);
          setPages((prev) => prev.map((p, idx) => (idx === i ? nextItem : p)));
          continue;
        }
      }

      resultList.push(current);
    }

    return resultList;
  }, [library.selectedDesign, pages]);

  const handlePickLocalMedia = useCallback(async (files: FileList) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    const newItems: OverlayPageItem[] = [];
    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      const objectUrl = URL.createObjectURL(file);
      localObjectUrlsRef.current.push(objectUrl);

      if (isImageFile(file)) {
        const dims = await readLocalImageDimensions(objectUrl);
        newItems.push({
          id: `local-img-${Date.now()}-${i}`,
          pageNumber: i + 1,
          title: file.name,
          source: 'local_image',
          hasVideo: false,
          videoStatus: 'static',
          thumbnailUrl: objectUrl,
          imageBlob: file,
          width: dims.width || 1080,
          height: dims.height || 1920,
          phrase: '',
          style: cloneDefaultStyle(),
          isLoopClone: false,
          basePageNumber: i + 1,
        });
      } else {
        const meta = await readLocalVideoMetadataAndPoster(objectUrl);
        newItems.push({
          id: `local-vid-${Date.now()}-${i}`,
          pageNumber: i + 1,
          title: file.name,
          source: 'local_video',
          hasVideo: true,
          videoStatus: 'ready',
          videoUrl: objectUrl,
          videoBlob: file,
          thumbnailUrl: meta.posterDataUrl,
          width: meta.width || 1080,
          height: meta.height || 1920,
          phrase: '',
          style: cloneDefaultStyle(),
          isLoopClone: false,
          basePageNumber: i + 1,
        });
      }
    }

    setPages((prev) => {
      const existingBase = prev.filter((p) => !p.isLoopClone);
      const canAppend =
        existingBase.length > 0 &&
        existingBase.every(
          (p) => p.source === 'local_video' || p.source === 'local_image'
        );
      const combinedBase = (canAppend ? [...existingBase, ...newItems] : newItems).map(
        (p, idx) => ({
          ...p,
          pageNumber: idx + 1,
          basePageNumber: idx + 1,
          isLoopClone: false,
        })
      );
      return reconcilePagesWithBatchLines(combinedBase, batchTextRef.current);
    });
    setActivePageIndex(0);
    setActiveTab('text');
  }, []);

  const handleRemovePage = useCallback((idx: number) => {
    setPages((prev) => {
      const target = prev[idx];
      if (!target || target.isLoopClone) return prev;

      const remainingBase = prev
        .filter((p, i) => !p.isLoopClone && i !== idx)
        .map((p, i) => ({
          ...p,
          pageNumber: i + 1,
          basePageNumber: i + 1,
          isLoopClone: false,
        }));
      const next = reconcilePagesWithBatchLines(remainingBase, batchTextRef.current);
      setActivePageIndex((prevIdx) =>
        next.length === 0 ? 0 : Math.max(0, Math.min(prevIdx, next.length - 1))
      );
      return next;
    });
  }, []);

  const activePage = pages[activePageIndex] || null;

  const updateActivePageStyle = (patch: Partial<TextOverlayStyle>) => {
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === activePageIndex ? { ...p, style: { ...p.style, ...patch } } : p
      )
    );
  };

  const applyActiveStyleFieldsToAll = (keys: Array<keyof TextOverlayStyle>) => {
    if (!activePage) return;
    const sourceStyle = activePage.style;
    setPages((prev) =>
      prev.map((p) => {
        const nextStyle = { ...p.style };
        for (const key of keys) {
          (nextStyle[key] as TextOverlayStyle[typeof key]) = sourceStyle[key];
        }
        return { ...p, style: nextStyle };
      })
    );
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-slate-950 text-slate-900 overflow-hidden">
      <CompactHeader
        connectionState={auth.connectionState}
        authStatus={auth.status}
        errorMessage={auth.errorMessage}
        onConnect={auth.connect}
        onDisconnect={auth.disconnect}
      />

      {/* Mobile: Stacked Viewer + Bottom Sheet | Desktop (lg:): 2-Column Studio */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_430px] xl:grid-cols-[minmax(0,1fr)_460px]">
        <TopVideoViewer
          pages={pages}
          activePageIndex={activePageIndex}
          onSelectPageIndex={setActivePageIndex}
          onUpdatePosition={(xPercent, yPercent) =>
            updateActivePageStyle({
              positionXPercent: xPercent,
              positionYPercent: yPercent,
            })
          }
          onLoadPageVideo={(idx) => void loadSinglePageVideo(idx)}
          onOpenPagesTab={() => {
            setActiveTab('pages');
            setIsSheetExpanded(true);
          }}
          onPickLocalMedia={(files) => void handlePickLocalMedia(files)}
          isExpandedSheet={isSheetExpanded}
        />

        <BottomSheetPanel
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isExpanded={isSheetExpanded}
          onToggleExpand={setIsSheetExpanded}
          activePage={activePage}
          totalPages={pages.length}
          textEntryMode={textEntryMode}
          onChangeTextEntryMode={setTextEntryMode}
          batchText={batchText}
          onChangeBatchText={handleChangeBatchText}
          onQuickPhraseChange={(phrase) =>
            handleUpdateSinglePagePhrase(activePageIndex, phrase)
          }
          topBanner={
            inEditor ? (
              <CanvaEditorBridgeCard
                compact
                inspection={editorInspection}
                isInspecting={isInspectingEditor}
                activeBatch={bridgeBatch}
                recentCandidatesCount={recentCandidatesCount}
                isLookingUpBatch={isLookingUpBridge}
                isSyncingBridgeBatch={isSyncingBridgeBatch}
                syncError={bridgeSyncError}
                lastSyncedReports={lastSyncedReports}
                lastOutlineNote={lastOutlineNote}
                onRefreshInspection={() => void refreshEditorInspection()}
                onLookupByCode={(code) => void lookupBridgeForEditor(code)}
                onApplyAndSyncBatch={() => void handleApplyAndSyncBridgeBatch()}
                onTriggerNativeExport={() => void triggerCanvaEditorExport()}
                onOpenExportTab={() => {
                  setActiveTab('export');
                  setIsSheetExpanded(true);
                }}
              />
            ) : undefined
          }
        >
          {activeTab === 'text' && (
            <OverlayTextTab
              pages={pages}
              activePageIndex={activePageIndex}
              onSelectPageIndex={setActivePageIndex}
              textEntryMode={textEntryMode}
              onChangeTextEntryMode={setTextEntryMode}
              batchText={batchText}
              onChangeBatchText={handleChangeBatchText}
              onUpdatePagePhrase={handleUpdateSinglePagePhrase}
              onApplyPhraseToAllPages={handleApplyPhraseToAllPages}
              onGoToPagesTab={() => setActiveTab('pages')}
            />
          )}

          {activeTab === 'style' && (
            <OverlayStyleTab
              activePage={activePage}
              totalPages={pages.length}
              onUpdateStyle={updateActivePageStyle}
              onApplyStyleToAllPages={() =>
                applyActiveStyleFieldsToAll([
                  'fontFamily',
                  'fontSize',
                  'color',
                  'bold',
                  'italic',
                  'textAlign',
                  'lineHeight',
                  'boxWidthPercent',
                ])
              }
            />
          )}

          {activeTab === 'outline' && (
            <OverlayOutlineTab
              activePage={activePage}
              totalPages={pages.length}
              onUpdateStyle={updateActivePageStyle}
              onApplyOutlineToAllPages={() =>
                applyActiveStyleFieldsToAll([
                  'outlineEnabled',
                  'outlineColor',
                  'outlineWidth',
                ])
              }
            />
          )}

          {activeTab === 'position' && (
            <OverlayPositionTab
              activePage={activePage}
              totalPages={pages.length}
              onUpdateStyle={updateActivePageStyle}
              onApplyPositionToAllPages={() =>
                applyActiveStyleFieldsToAll([
                  'positionXPercent',
                  'positionYPercent',
                ])
              }
            />
          )}

          {activeTab === 'pages' && (
            <OverlayPagesTab
              connectionState={auth.connectionState}
              onConnect={auth.connect}
              libraryFilter={library.libraryFilter}
              onChangeLibraryFilter={library.setLibraryFilter}
              searchQuery={library.searchQuery}
              onChangeSearchQuery={library.setSearchQuery}
              onSearchSubmit={() =>
                void library.loadLibrary(library.searchQuery, library.libraryFilter)
              }
              designs={library.items}
              continuation={library.continuation}
              onLoadMoreDesigns={() =>
                void library.loadLibrary(
                  library.searchQuery,
                  library.libraryFilter,
                  library.continuation
                )
              }
              isLoadingDesigns={library.isLoading}
              designsError={library.error}
              selectedDesign={library.selectedDesign}
              onSelectDesign={(design) => {
                void library.selectDesign(design);
              }}
              pages={pages}
              activePageIndex={activePageIndex}
              onSelectPageIndex={setActivePageIndex}
              onRemovePage={handleRemovePage}
              isLoadingPages={library.isLoadingPages}
              onLoadPageVideo={(idx) => void loadSinglePageVideo(idx)}
              onLoadAllPageVideos={() => void handleLoadAllPageVideos()}
              isLoadingAllVideos={isLoadingAllVideos}
              onPickLocalMedia={(files) => void handlePickLocalMedia(files)}
              onSyncFromCanvaEditor={() => void syncFromCanvaEditor()}
              isSyncingEditor={isSyncingEditor}
              editorSyncError={editorSyncError}
            />
          )}

          {activeTab === 'export' && (
            <OverlayExportTab
              pages={pages}
              selectedDesign={library.selectedDesign}
              connectionState={auth.connectionState}
              onEnsurePageVideosForExport={ensurePageVideosForExport}
              editorBridge={
                inEditor
                  ? {
                      inspection: editorInspection,
                      isInspecting: isInspectingEditor,
                      activeBatch: bridgeBatch,
                      recentCandidatesCount,
                      isLookingUpBatch: isLookingUpBridge,
                      isSyncingBridgeBatch,
                      syncError: bridgeSyncError,
                      lastSyncedReports,
                      lastOutlineNote,
                      onRefreshInspection: () => void refreshEditorInspection(),
                      onLookupByCode: (code) => void lookupBridgeForEditor(code),
                      onApplyAndSyncBatch: () => void handleApplyAndSyncBridgeBatch(),
                    }
                  : undefined
              }
            />
          )}
        </BottomSheetPanel>
      </div>
    </div>
  );
}
