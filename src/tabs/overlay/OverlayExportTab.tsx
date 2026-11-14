import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { CanvaEditorBridgeCard } from '../../components/CanvaEditorBridgeCard';
import {
  applyTextOverlayToAllEditorPages,
  createEditableMediaPagesInEditor,
  triggerCanvaEditorExport,
  type EditorOverlayInsertMode,
} from '../../integrations/canva/designSdkClient';
import {
  getBrandTemplateTextFields,
  runBrandTemplateAutofill,
} from '../../integrations/canva/restApiClient';
import { isCanvaEditorHost } from '../../intents/design_editor';
import { buildEditableOverlayPptx } from '../../services/pptxGenerator';
import type {
  AuthConnectionState,
  BridgePageSyncReport,
  CanvaBridgeBatch,
  CanvaDesignSummary,
  EditorSafetyInspection,
  OverlayPageItem,
  PageExportStatus,
} from '../../types/canva';

export interface OverlayEditorBridgeProps {
  inspection: EditorSafetyInspection | null;
  isInspecting: boolean;
  activeBatch: CanvaBridgeBatch | null;
  recentCandidatesCount: number;
  isLookingUpBatch: boolean;
  isSyncingBridgeBatch: boolean;
  syncError: string | null;
  lastSyncedReports: BridgePageSyncReport[];
  lastOutlineNote?: string;
  onRefreshInspection: () => void;
  onLookupByCode: (code?: string) => void;
  onApplyAndSyncBatch: () => void;
}

interface OverlayExportTabProps {
  pages: OverlayPageItem[];
  selectedDesign: CanvaDesignSummary | null;
  connectionState: AuthConnectionState;
  onEnsurePageVideosForExport: () => Promise<OverlayPageItem[]>;
  editorBridge?: OverlayEditorBridgeProps;
}

export const OverlayExportTab: React.FC<OverlayExportTabProps> = ({
  pages,
  selectedDesign,
  connectionState,
  onEnsurePageVideosForExport,
  editorBridge,
}) => {
  const inEditor = isCanvaEditorHost();

  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const [pptxProgressText, setPptxProgressText] = useState<string | null>(null);
  const [pptxSummary, setPptxSummary] = useState<{
    filename: string;
    slideCount: number;
    embeddedVideoCount: number;
    editableTextCount: number;
    verifiedOutlineSlides: number;
  } | null>(null);

  const [editorMode, setEditorMode] = useState<EditorOverlayInsertMode>(
    'overlay_existing_pages'
  );
  const [isSavingCanva, setIsSavingCanva] = useState(false);
  const [canvaResult, setCanvaResult] = useState<{
    type: 'editor' | 'brand_template';
    designUrl?: string;
    createdLinks?: Array<{ title: string; url: string }>;
    message: string;
  } | null>(null);

  const [pageStatuses, setPageStatuses] = useState<PageExportStatus[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);

  const pagesWithPhrase = pages.filter((p) => p.phrase.trim().length > 0);
  const hasOnlyEditorPages =
    pages.length > 0 && pages.every((p) => p.source === 'canva_editor');
  const isBrandTemplate = selectedDesign?.source === 'brand_template';

  const projectBaseName = (
    selectedDesign?.title ||
    pages[0]?.title ||
    'Canva_Lote_Overlay'
  )
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 42);

  // Sync per-page table whenever internal editor bridge finishes applying
  useEffect(() => {
    if (!inEditor || !editorBridge?.lastSyncedReports.length) return;
    setPageStatuses(
      editorBridge.lastSyncedReports.map((r) => ({
        pageNumber: r.pageNumber,
        title: `Pág. ${r.pageNumber}`,
        phrase: r.phrase,
        status: r.status === 'success' ? 'success' : 'error',
        detail: r.detail,
        errorMessage: r.errorMessage,
      }))
    );
  }, [inEditor, editorBridge?.lastSyncedReports]);

  const handleExportEditableProject = async () => {
    if (pages.length === 0) return;
    setIsExportingPptx(true);
    setExportError(null);
    setPptxSummary(null);
    setPageStatuses(
      pages.map((p) => ({
        pageNumber: p.pageNumber,
        title: p.title,
        phrase: p.phrase,
        status: 'pending',
      }))
    );

    try {
      setPptxProgressText('Preparando vídeos MP4 e imagens de cada página...');
      const hydratedPages = await onEnsurePageVideosForExport();

      const result = await buildEditableOverlayPptx(hydratedPages, {
        projectTitle: selectedDesign?.title || 'Canva Lote 2.0',
        includeVideos: true,
        onProgress: (_cur, _tot, label) => {
          setPptxProgressText(label);
        },
      });

      const filename = `${projectBaseName || 'Canva_Lote'}_Projeto_Editavel.pptx`;
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      setPageStatuses(
        hydratedPages.map((p) => ({
          pageNumber: p.pageNumber,
          title: p.title,
          phrase: p.phrase,
          status: 'success',
          detail: p.videoBlob || p.videoUrl ? 'Vídeo MP4 + Texto Editável' : 'Imagem + Texto Editável',
        }))
      );

      setPptxSummary({
        filename,
        slideCount: result.slideCount,
        embeddedVideoCount: result.embeddedVideoCount,
        editableTextCount: result.editableTextCount,
        verifiedOutlineSlides: result.verifiedOutlineSlides,
      });
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Erro ao gerar projeto editável.'
      );
    } finally {
      setIsExportingPptx(false);
      setPptxProgressText(null);
    }
  };

  const handleSaveToCanvaNative = async () => {
    if (pages.length === 0) return;
    setIsSavingCanva(true);
    setExportError(null);
    setCanvaResult(null);

    try {
      if (inEditor) {
        if (hasOnlyEditorPages) {
          if (pagesWithPhrase.length === 0) {
            throw new Error(
              'Preencha ao menos uma frase na aba Texto antes de salvar no Canva.'
            );
          }

          const results = await applyTextOverlayToAllEditorPages({
            pages: pages.map((p) => ({
              pageNumber: p.pageNumber,
              phrase: p.phrase,
              style: p.style,
            })),
            mode: editorMode,
          });

          setPageStatuses(
            results.map((r) => {
              const srcPage = pages.find((p) => p.pageNumber === r.pageNumber);
              return {
                pageNumber: r.pageNumber,
                title: srcPage?.title || `Página ${r.pageNumber}`,
                phrase: srcPage?.phrase || '',
                status: r.status === 'success' ? 'success' : 'error',
                detail: r.detail,
                errorMessage: r.errorMessage,
              };
            })
          );

          const okCount = results.filter((r) => r.status === 'success').length;
          setCanvaResult({
            type: 'editor',
            message: `${okCount} página(s) salva(s) no Editor do Canva mantendo todos os vídeos nativos intactos.`,
          });
        } else {
          const hydratedPages = await onEnsurePageVideosForExport();
          const results = await createEditableMediaPagesInEditor(
            hydratedPages.map((p) => ({
              pageNumber: p.pageNumber,
              title: p.title,
              hasVideo: p.hasVideo,
              videoBlob: p.videoBlob,
              videoUrl: p.videoUrl,
              imageBlob: p.imageBlob,
              thumbnailUrl: p.thumbnailUrl,
              width: p.width,
              height: p.height,
              phrase: p.phrase,
              style: p.style,
            }))
          );

          setPageStatuses(
            results.map((r) => {
              const srcPage = hydratedPages.find((p) => p.pageNumber === r.pageNumber);
              return {
                pageNumber: r.pageNumber,
                title: srcPage?.title || `Página ${r.pageNumber}`,
                phrase: srcPage?.phrase || '',
                status: r.status === 'success' ? 'success' : 'error',
                detail: r.detail,
                errorMessage: r.errorMessage,
              };
            })
          );

          const okCount = results.filter((r) => r.status === 'success').length;
          setCanvaResult({
            type: 'editor',
            message: `${okCount} página(s) salva(s) no Editor do Canva com vídeos nativos preservados e texto editável.`,
          });
        }
        return;
      }

      if (connectionState !== 'connected') {
        throw new Error(
          'Conecte sua conta Canva no cabeçalho para executar ações no Canva.'
        );
      }

      if (isBrandTemplate && selectedDesign) {
        if (pagesWithPhrase.length === 0) {
          throw new Error(
            'Digite ao menos uma frase na aba Texto para preencher o Brand Template.'
          );
        }

        const fields = await getBrandTemplateTextFields(selectedDesign.id);
        if (fields.length === 0 || !fields[0].fieldKey) {
          throw new Error(
            'Este Brand Template não possui campos de texto configurados para preenchimento automático (/dataset).'
          );
        }

        const targetFieldKey = fields[0].fieldKey;
        const createdLinks: Array<{ title: string; url: string }> = [];
        const statuses: PageExportStatus[] = [];

        for (let i = 0; i < pagesWithPhrase.length; i++) {
          const p = pagesWithPhrase[i];
          const itemTitle = `${selectedDesign.title} — ${i + 1}`;
          try {
            const created = await runBrandTemplateAutofill(
              selectedDesign.id,
              targetFieldKey,
              p.phrase,
              itemTitle
            );
            const url = created.editUrl || created.viewUrl || '';
            if (url) createdLinks.push({ title: itemTitle, url });
            statuses.push({
              pageNumber: p.pageNumber,
              title: itemTitle,
              phrase: p.phrase,
              status: 'success',
              detail: 'Salvo via Brand Template Autofill',
            });
          } catch (err) {
            statuses.push({
              pageNumber: p.pageNumber,
              title: itemTitle,
              phrase: p.phrase,
              status: 'error',
              errorMessage: err instanceof Error ? err.message : 'Erro no Autofill',
            });
          }
        }

        setPageStatuses(statuses);
        const okCount = statuses.filter((s) => s.status === 'success').length;
        if (okCount === 0) {
          throw new Error(
            statuses[0]?.errorMessage || 'Não foi possível criar designs via Brand Template.'
          );
        }

        setCanvaResult({
          type: 'brand_template',
          designUrl: createdLinks[0]?.url,
          createdLinks,
          message: `${okCount} design(s) editável(is) salvo(s) na sua conta Canva via Brand Template.`,
        });
        return;
      }

      throw new Error(
        'A inserção nativa em designs comuns exige que o aplicativo esteja aberto dentro do Editor do Canva. Abra seu design no Canva e abra o app Canva Lote 2.0 na barra lateral para aplicar as frases instantaneamente com session.sync().'
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Falha ao executar operação no Canva.'
      );
    } finally {
      setIsSavingCanva(false);
    }
  };

  if (pages.length === 0 && !(inEditor && editorBridge?.activeBatch)) {
    return (
      <div className="space-y-4">
        {inEditor && editorBridge && (
          <CanvaEditorBridgeCard
            inspection={editorBridge.inspection}
            isInspecting={editorBridge.isInspecting}
            activeBatch={editorBridge.activeBatch}
            recentCandidatesCount={editorBridge.recentCandidatesCount}
            isLookingUpBatch={editorBridge.isLookingUpBatch}
            isSyncingBridgeBatch={editorBridge.isSyncingBridgeBatch}
            syncError={editorBridge.syncError}
            lastSyncedReports={editorBridge.lastSyncedReports}
            lastOutlineNote={editorBridge.lastOutlineNote}
            onRefreshInspection={editorBridge.onRefreshInspection}
            onLookupByCode={editorBridge.onLookupByCode}
            onApplyAndSyncBatch={editorBridge.onApplyAndSyncBatch}
            onTriggerNativeExport={() => void triggerCanvaEditorExport()}
          />
        )}
        <p className="py-4 text-center text-xs text-slate-500">
          Carregue vídeos, imagens ou um design na aba Páginas antes de salvar ou exportar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Overview */}
      <div className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-800 truncate">
          {selectedDesign?.title || 'Projeto Canva Lote'}
        </span>
        <span className="font-mono-tabular tabular-nums text-slate-600 shrink-0">
          {pages.length} pág. · {pagesWithPhrase.length} frase(s)
        </span>
      </div>

      {/* INTERNAL CANVA EDITOR BRIDGE PANEL */}
      {inEditor && editorBridge && (
        <CanvaEditorBridgeCard
          inspection={editorBridge.inspection}
          isInspecting={editorBridge.isInspecting}
          activeBatch={editorBridge.activeBatch}
          recentCandidatesCount={editorBridge.recentCandidatesCount}
          isLookingUpBatch={editorBridge.isLookingUpBatch}
          isSyncingBridgeBatch={editorBridge.isSyncingBridgeBatch}
          syncError={editorBridge.syncError}
          lastSyncedReports={editorBridge.lastSyncedReports}
          lastOutlineNote={editorBridge.lastOutlineNote}
          onRefreshInspection={editorBridge.onRefreshInspection}
          onLookupByCode={editorBridge.onLookupByCode}
          onApplyAndSyncBatch={editorBridge.onApplyAndSyncBatch}
          onTriggerNativeExport={() => void triggerCanvaEditorExport()}
        />
      )}

      {/* ARCHITECTURE NOTICE WHEN OUTSIDE CANVA EDITOR */}
      {!inEditor && (
        <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950 space-y-2">
          <p className="font-bold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Como funciona a edição nativa no Canva</span>
          </p>
          <p className="text-[11px] text-indigo-900 leading-relaxed">
            Para que o Canva permita inserir camadas de texto editáveis sobre os vídeos originais, abra o seu design diretamente no <strong>Editor do Canva</strong> e abra o aplicativo <strong>Canva Lote 2.0</strong> na barra lateral. O app lê suas páginas automaticamente e aplica todas as frases em 1 clique com <code>session.sync()</code>.
          </p>
          {(selectedDesign?.editUrl || selectedDesign?.viewUrl) && (
            <a
              href={selectedDesign.editUrl || selectedDesign.viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[38px] px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <span>Abrir Design no Editor do Canva</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          )}
        </div>
      )}

      {/* OPTION 1: SALVAR NO CANVA (NATIVO VIA APPS SDK) */}
      <div className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {inEditor ? 'Aplicar Frases no Design Atual (session.sync)' : 'Salvar no Canva (Requer Editor do Canva Aberto)'}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              {inEditor
                ? 'Insere todas as frases como camadas de texto editáveis mantendo os vídeos intactos em 1 clique.'
                : 'Utiliza o Canva Apps SDK para gravar as camadas de texto diretamente no design aberto.'}
            </p>
          </div>
          <Sparkles className="w-5 h-5 text-slate-800 shrink-0" />
        </div>

        <button
          type="button"
          disabled={isSavingCanva || isExportingPptx}
          onClick={() => void handleSaveToCanvaNative()}
          className="w-full min-h-[46px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-55 text-white text-xs sm:text-sm font-bold tracking-wide inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
        >
          {isSavingCanva ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>APLICANDO NO CANVA...</span>
            </>
          ) : (
            <span>{inEditor ? 'APLICAR FRASES NO DESIGN (session.sync)' : 'SALVAR NO CANVA'}</span>
          )}
        </button>

        {canvaResult && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-2">
            <div className="flex items-start gap-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{canvaResult.message}</span>
            </div>
            {canvaResult.designUrl && (
              <a
                href={canvaResult.designUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <span>Abrir projeto no Canva</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* OPTION 2: BAIXAR PROJETO EDITÁVEL (.PPTX COM VÍDEOS) */}
      <div className="p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Baixar Projeto Editável (.PPTX com Vídeos)
            </h3>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
              Gera e baixa instantaneamente um arquivo PowerPoint completo contendo todos os vídeos MP4 incorporados como mídia real, frases em caixas de texto independentes, contornos e proporções originais.
            </p>
          </div>
          <FileSpreadsheet className="w-5 h-5 text-indigo-600 shrink-0" />
        </div>

        <button
          type="button"
          disabled={isExportingPptx || isSavingCanva}
          onClick={() => void handleExportEditableProject()}
          className="w-full min-h-[46px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-55 text-white text-xs sm:text-sm font-bold tracking-wide inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shadow-sm"
        >
          {isExportingPptx ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{pptxProgressText || 'GERANDO PPTX...'}</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>BAIXAR PROJETO EDITÁVEL (.PPTX COM VÍDEOS)</span>
            </>
          )}
        </button>

        {pptxSummary && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <p className="text-[11px] text-emerald-800 tabular-nums">
              {pptxSummary.slideCount} slide(s) · {pptxSummary.embeddedVideoCount} vídeo(s) MP4 ·{' '}
              {pptxSummary.editableTextCount} texto(s) editáveis · {pptxSummary.verifiedOutlineSlides} com contorno OOXML
            </p>
          </div>
        )}
      </div>

      {exportError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{exportError}</span>
        </div>
      )}

      {/* Per-page status log */}
      {pageStatuses.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Status por página
          </h4>
          <div className="space-y-1 max-h-[160px] overflow-y-auto">
            {pageStatuses.map((st) => (
              <div
                key={st.pageNumber}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    Pág. {st.pageNumber}
                  </span>
                  <span className="text-slate-400 mx-1.5">·</span>
                  <span className="text-slate-600 truncate">
                    {st.errorMessage || st.detail || st.phrase || 'OK'}
                  </span>
                </div>
                {st.status === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : st.status === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
