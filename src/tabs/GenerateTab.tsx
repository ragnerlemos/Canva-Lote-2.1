import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  Info,
  Loader2,
  Lock,
  Play,
  X,
} from 'lucide-react';
import { TextPreviewBox } from '../components/TextPreviewBox';
import { GenerationMethodsHub } from '../components/GenerationMethodsHub';
import {
  triggerCanvaEditorExport,
  testDuplicatePageWithVideoInEditor,
  type DuplicatePageTestReport,
} from '../integrations/canva/designSdkClient';
import { isCanvaEditorHost } from '../intents/design_editor';
import {
  assessBatchStrategy,
  executeBatchItem,
  prepareCleanWebBackground,
  saveMultiPageEditableProjectToCanva,
  type CanvaSaveMode,
  type EditorExecutionMode,
} from '../services/batchGeneratorService';
import type { EditablePdfPageSpec } from '../services/pdfComposer';
import type {
  BatchPhraseItem,
  CanvaDesignSummary,
  CanvaTextLayer,
  GenerationResultItem,
  TextAppearanceConfig,
} from '../types/canva';

interface GenerateTabProps {
  selectedDesign: CanvaDesignSummary | null;
  selectedPageNumber: number;
  selectedPageThumbnailUrl?: string;
  selectedLayer: CanvaTextLayer | null;
  keywordFilter?: string;
  phrases: BatchPhraseItem[];
  appearance: TextAppearanceConfig;
}

export const GenerateTab: React.FC<GenerateTabProps> = ({
  selectedDesign,
  selectedPageNumber,
  selectedPageThumbnailUrl,
  selectedLayer,
  keywordFilter,
  phrases,
  appearance,
}) => {
  const [versionLimit, setVersionLimit] = useState<number>(0); // 0 = all
  const [canvaSaveMode, setCanvaSaveMode] =
    useState<CanvaSaveMode>('project_multipage');
  const [editorMode, setEditorMode] =
    useState<EditorExecutionMode>('add_editable_pages');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [isExportingEditor, setIsExportingEditor] = useState(false);
  const [editorExportMessage, setEditorExportMessage] = useState<string | null>(
    null
  );
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [results, setResults] = useState<GenerationResultItem[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [projectResult, setProjectResult] = useState<{
    designId: string;
    editUrl?: string;
    pageCount: number;
  } | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [duplicateTestRunning, setDuplicateTestRunning] = useState(false);
  const [duplicateTestReport, setDuplicateTestReport] =
    useState<DuplicatePageTestReport | null>(null);
  const [duplicateTestError, setDuplicateTestError] = useState<string | null>(
    null
  );

  const handleRunDuplicatePageTest = async () => {
    setDuplicateTestRunning(true);
    setDuplicateTestReport(null);
    setDuplicateTestError(null);
    try {
      const rep = await testDuplicatePageWithVideoInEditor({
        sourcePageNumber: selectedPageNumber,
        testPhrase: activePreviewPhrase || 'Teste de Frase Duplicada',
      });
      setDuplicateTestReport(rep);
    } catch (err) {
      setDuplicateTestError(
        err instanceof Error
          ? err.message
          : 'Falha ao executar teste de duplicação com duplicatePage.'
      );
    } finally {
      setDuplicateTestRunning(false);
    }
  };

  const effectiveCount =
    versionLimit > 0 ? Math.min(versionLimit, phrases.length) : phrases.length;
  const targetPhrases = phrases.slice(0, effectiveCount);

  useEffect(() => {
    if (targetPhrases.length === 0) {
      setPreviewIndex(0);
    } else if (previewIndex >= targetPhrases.length) {
      setPreviewIndex(targetPhrases.length - 1);
    }
  }, [targetPhrases.length, previewIndex]);

  const activePreviewPhrase =
    targetPhrases[previewIndex]?.text || phrases[0]?.text || 'Sua nova frase';

  const assessment = assessBatchStrategy({
    selectedDesign,
    targetLayer: selectedLayer,
  });

  const handleStartBatch = async () => {
    if (!assessment.canRun) return;
    if (
      assessment.strategy === 'editor_sdk_pages' &&
      editorMode === 'edit_text_only'
    ) {
      const chosenPhrase =
        targetPhrases[previewIndex] || phrases[0];
      if (!chosenPhrase) return;

      setIsRunning(true);
      setCompletedCount(0);
      setStatusLabel('Editando apenas o texto mantendo o design intacto...');
      setProjectResult(null);
      setProjectError(null);
      setEditorExportMessage(null);

      const singleQueue: GenerationResultItem[] = [
        {
          id: chosenPhrase.id,
          index: previewIndex + 1,
          phrase: chosenPhrase.text,
          status: 'processing',
        },
      ];
      setResults(singleQueue);

      try {
        const { resultItem } = await executeBatchItem({
          strategy: assessment.strategy,
          selectedDesign,
          selectedPageNumber,
          targetLayer: selectedLayer,
          phrase: chosenPhrase.text,
          keywordFilter,
          appearance,
          batchIndex: previewIndex + 1,
          editorExecutionMode: 'edit_text_only',
        });
        setResults([{ ...singleQueue[0], ...resultItem, status: 'success' }]);
        setCompletedCount(1);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Falha ao editar texto no Editor.';
        setResults([
          { ...singleQueue[0], status: 'error', errorMessage: msg },
        ]);
        setCompletedCount(1);
      } finally {
        setStatusLabel(null);
        setIsRunning(false);
      }
      return;
    }

    if (targetPhrases.length === 0) return;

    setIsRunning(true);
    setCompletedCount(0);
    setStatusLabel(null);
    setProjectResult(null);
    setProjectError(null);
    setEditorExportMessage(null);

    const queue: GenerationResultItem[] = targetPhrases.map((item, idx) => ({
      id: item.id,
      index: idx + 1,
      phrase: item.text,
      status: 'pending',
    }));
    setResults(queue);

    let proxiedBaseImageUrl: string | undefined;
    let precomputedBackground:
      | Awaited<ReturnType<typeof prepareCleanWebBackground>>['bgAsset']
      | undefined;

    if (assessment.strategy === 'web_canvas_compose' && selectedDesign) {
      setStatusLabel('Preparando fundo intacto e removendo texto antigo...');
      try {
        const prepared = await prepareCleanWebBackground({
          selectedDesign,
          selectedPageNumber,
          appearance,
          fallbackThumbnailUrl: selectedPageThumbnailUrl,
        });
        proxiedBaseImageUrl = prepared.proxiedImageUrl;
        precomputedBackground = prepared.bgAsset;
      } catch (err) {
        const errMsg =
          err instanceof Error
            ? err.message
            : 'Falha ao exportar página base do Canva.';
        setResults((prev) =>
          prev.map((r) => ({ ...r, status: 'error', errorMessage: errMsg }))
        );
        setStatusLabel(null);
        setIsRunning(false);
        return;
      }
    }

    setStatusLabel(
      canvaSaveMode === 'individual_designs' &&
        assessment.strategy === 'web_canvas_compose'
        ? 'Gerando e salvando novas versões editáveis...'
        : 'Gerando versões em lote...'
    );

    const collectedPdfPages: EditablePdfPageSpec[] = [];

    for (let i = 0; i < queue.length; i++) {
      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: 'processing' } : r))
      );

      try {
        const { resultItem, pdfPageSpec } = await executeBatchItem({
          strategy: assessment.strategy,
          selectedDesign,
          selectedPageNumber,
          targetLayer: selectedLayer,
          phrase: queue[i].phrase,
          keywordFilter,
          appearance,
          batchIndex: i + 1,
          proxiedBaseImageUrl,
          precomputedBackground,
          canvaSaveMode,
          editorExecutionMode: editorMode,
        });

        if (pdfPageSpec) {
          collectedPdfPages.push(pdfPageSpec);
        }

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, ...resultItem, status: 'success' } : r
          )
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Falha ao gerar versão.';
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: 'error', errorMessage: msg } : r
          )
        );
      }
      setCompletedCount(i + 1);
    }

    if (
      assessment.strategy === 'web_canvas_compose' &&
      canvaSaveMode === 'project_multipage' &&
      precomputedBackground &&
      collectedPdfPages.length > 0 &&
      selectedDesign
    ) {
      setStatusLabel('Salvando nova versão editável no Canva...');
      try {
        const importedProject = await saveMultiPageEditableProjectToCanva({
          title: `${selectedDesign.title || 'Canva Lote'} (Nova Versão Editável)`,
          bgAsset: precomputedBackground,
          pages: collectedPdfPages,
        });
        setProjectResult({
          designId: importedProject.designId,
          editUrl: importedProject.editUrl,
          pageCount: collectedPdfPages.length,
        });
      } catch (err) {
        setProjectError(
          err instanceof Error
            ? err.message
            : 'Falha ao importar projeto editável no Canva.'
        );
      }
    }

    setStatusLabel(null);
    setIsRunning(false);
  };

  const handleEditorNativeExport = async () => {
    setIsExportingEditor(true);
    setEditorExportMessage(null);
    try {
      const res = await triggerCanvaEditorExport();
      if (res.status === 'aborted') {
        setEditorExportMessage('Exportação cancelada no Editor do Canva.');
      } else {
        setEditorExportMessage(
          `Arquivo exportado pelo Canva (${res.downloadUrls.length} arquivo(s)).`
        );
      }
    } catch (err) {
      setEditorExportMessage(
        err instanceof Error
          ? err.message
          : 'Não foi possível abrir o exportador nativo do Canva.'
      );
    } finally {
      setIsExportingEditor(false);
    }
  };

  const downloadableResults = results.filter(
    (r) => r.status === 'success' && r.imageDataUrl
  );

  const handleDownloadAllPngs = async () => {
    for (const item of downloadableResults) {
      if (!item.imageDataUrl) continue;
      const link = document.createElement('a');
      link.href = item.imageDataUrl;
      link.download = `canva-lote-${String(item.index).padStart(2, '0')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  };

  const progressPct =
    results.length > 0 ? Math.round((completedCount / results.length) * 100) : 0;
  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  const activeLightboxItem =
    lightboxIndex !== null ? results[lightboxIndex] || null : null;

  return (
    <div className="py-3 space-y-4">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-sm sm:text-base font-bold text-slate-900">
          04 — Gerar em Lote (Central de Métodos)
        </h1>
        <p className="text-xs text-slate-500">
          Selecione o método oficial Canva desejado, configure as frases e gere suas páginas mantendo o original intacto.
        </p>
      </div>

      <GenerationMethodsHub
        phrases={phrases.map((p) => p.text)}
        selectedDesign={selectedDesign}
        selectedPageNumber={selectedPageNumber}
        selectedLayer={selectedLayer}
        targetText={selectedLayer?.text}
        appearance={appearance}
      />

      {/* Live Visual Preview right in Part 4 */}
      {(selectedDesign || isCanvaEditorHost()) && (
        <div className="space-y-2">
          <TextPreviewBox
            layer={selectedLayer}
            keywordFilter={keywordFilter || ''}
            samplePhrase={activePreviewPhrase}
            appearance={appearance}
            selectedPageThumbnailUrl={selectedPageThumbnailUrl}
            readOnly
            headerLabel={
              targetPhrases.length > 0
                ? `Visualização (${previewIndex + 1} de ${targetPhrases.length})`
                : 'Visualização no template'
            }
          />

          {targetPhrases.length > 1 && (
            <div className="flex items-center justify-between gap-2 px-1">
              <button
                type="button"
                onClick={() =>
                  setPreviewIndex((idx) =>
                    idx > 0 ? idx - 1 : targetPhrases.length - 1
                  )
                }
                className="min-h-[38px] px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              <span className="text-[11px] font-mono-tabular font-semibold text-slate-600 truncate px-2">
                {previewIndex + 1}/{targetPhrases.length} · “{activePreviewPhrase}”
              </span>

              <button
                type="button"
                onClick={() =>
                  setPreviewIndex((idx) =>
                    idx + 1 < targetPhrases.length ? idx + 1 : 0
                  )
                }
                className="min-h-[38px] px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Próxima</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Compact Summary + Save / Preservation Options */}
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 text-xs">
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
          <span className="text-slate-500">Template</span>
          <span className="font-semibold text-slate-900 truncate max-w-[210px]">
            {selectedDesign
              ? `${selectedDesign.title} (Pág. ${selectedPageNumber})`
              : isCanvaEditorHost()
                ? `Design aberto no Editor (Pág. ${selectedPageNumber})`
                : 'Não selecionado'}
          </span>
        </div>
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
          <span className="text-slate-500">Texto alvo</span>
          <span className="font-semibold text-slate-900 truncate max-w-[210px]">
            {selectedLayer?.text || '(frase)'}
          </span>
        </div>

        {!(
          assessment.strategy === 'editor_sdk_pages' &&
          editorMode === 'edit_text_only'
        ) && (
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
            <span className="text-slate-500">Quantidade de versões</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={phrases.length || 999}
                value={versionLimit === 0 ? phrases.length : versionLimit}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVersionLimit(val >= phrases.length ? 0 : Math.max(1, val));
                }}
                className="w-16 h-8 px-2 rounded-lg border border-slate-200 text-right font-mono-tabular font-semibold text-slate-900"
              />
              <span className="text-slate-500 font-mono-tabular">
                de {phrases.length}
              </span>
            </div>
          </div>
        )}

        {/* Editor SDK Mode: Choose between keeping design 100% intact & editing ONLY text OR adding new editable pages */}
        {assessment.strategy === 'editor_sdk_pages' && (
          <div className="px-3.5 py-3 space-y-2">
            <div className="font-semibold text-slate-800">
              Modo de edição no Canva
            </div>
            <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 gap-1">
              {(
                [
                  ['edit_text_only', 'Só editar texto (100% intacto)'],
                  ['add_editable_pages', 'Novas páginas editáveis'],
                ] as Array<[EditorExecutionMode, string]>
              ).map(([modeKey, label]) => (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => setEditorMode(modeKey)}
                  className={`min-h-[38px] px-2 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                    editorMode === modeKey
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {editorMode === 'edit_text_only'
                ? `Altera apenas o texto selecionado para a frase ${previewIndex + 1} (${activePreviewPhrase}), mantendo fontes, efeitos, vídeos e demais camadas 100% intactos.`
                : 'Mantém a página original intacta e cria novas páginas editáveis dentro deste design para cada frase do lote.'}
            </p>

            {/* Live Technical Audit / duplicatePage Testing Card */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-700">
                  Auditoria Técnica: Teste de Duplicação com Vídeo
                </span>
                <span className="text-[10px] font-mono-tabular bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">
                  @canva/design@2.14.1-beta.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Testa a API oficial <code className="bg-slate-100 px-1 rounded text-slate-800">duplicatePage()</code> em 1 página com vídeo: preserva vídeos MP4 originais, insere a nova frase na cópia e confirma que a página original não foi modificada.
              </p>
              <button
                type="button"
                onClick={() => void handleRunDuplicatePageTest()}
                disabled={duplicateTestRunning}
                className="w-full min-h-[38px] rounded-lg border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition"
              >
                {duplicateTestRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-700" />
                    <span>Executando auditoria na página {selectedPageNumber}...</span>
                  </>
                ) : (
                  <span>Executar Teste Real de Duplicação (1 Página com Vídeo)</span>
                )}
              </button>

              {duplicateTestError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{duplicateTestError}</span>
                </div>
              )}

              {duplicateTestReport && (
                <div className="p-3 rounded-xl bg-slate-900 text-white text-xs space-y-2 font-mono">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-700">
                    <span className="text-emerald-400 font-bold">✓ TESTE DE DUPLICAÇÃO CONCLUÍDO</span>
                    <span className="text-[10px] text-slate-400">{duplicateTestReport.sdkVersion}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                    <div>Método: <strong className="text-white">{duplicateTestReport.duplicateMethodUsed === 'duplicatePage_preview' ? 'duplicatePage() Preview' : 'addPage() Fallback'}</strong></div>
                    <div>Página Origem: <span className="text-amber-300">#{duplicateTestReport.sourcePageNumber} ({duplicateTestReport.sourcePageId || 'id'})</span></div>
                    <div>Página Criada: <span className="text-emerald-300">{duplicateTestReport.duplicatedPageId}</span></div>
                    <div>Vídeo Preservado: <span className="text-emerald-400">{duplicateTestReport.videoStillVideo ? 'SIM (Vídeo Nativo)' : 'Não'}</span></div>
                    <div>Vídeo Reproduz: <span className="text-emerald-400">{duplicateTestReport.videoPlays ? 'SIM (Reproduzível)' : 'Não'}</span></div>
                    <div>Pág. Origem Intacta: <span className="text-emerald-400">{duplicateTestReport.sourcePageRemainsIntact ? 'SIM (100% inalterada)' : 'Não'}</span></div>
                    <div>Texto Editável: <span className="text-emerald-400">{duplicateTestReport.textReplacedSuccessfully ? 'SIM (Nativo)' : 'Não'}</span></div>
                    <div>Sync Canva: <span className="text-emerald-400">{duplicateTestReport.syncSuccess ? 'OK (session.sync)' : 'Falhou'}</span></div>
                  </div>
                  <div className="pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 max-h-32 overflow-y-auto space-y-0.5">
                    {duplicateTestReport.details.map((line, lIdx) => (
                      <div key={lIdx} className="leading-tight">{line}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Web Mode: Original Intact + Save New Editable Version */}
        {assessment.strategy === 'web_canvas_compose' && (
          <div className="px-3.5 py-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">
                Salvar nova versão editável no Canva
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                <Lock className="w-3 h-3" />
                Original intacto
              </span>
            </div>
            <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-100 gap-1">
              {(
                [
                  ['project_multipage', 'Projeto Único'],
                  ['individual_designs', 'Separados'],
                  ['none', 'Só PNGs'],
                ] as Array<[CanvaSaveMode, string]>
              ).map(([modeKey, label]) => (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => setCanvaSaveMode(modeKey)}
                  className={`min-h-[36px] px-2 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                    canvaSaveMode === modeKey
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {canvaSaveMode === 'project_multipage'
                ? 'Seu design original nunca é alterado. Cria 1 nova versão editável no Canva com todas as páginas, fundo preservado e texto editável.'
                : canvaSaveMode === 'individual_designs'
                  ? 'Seu design original permanece intacto e cada frase é salva como um novo arquivo editável separado no Canva.'
                  : 'Mantém o design do Canva intacto e baixa apenas as imagens PNG.'}
            </p>
          </div>
        )}
      </div>

      {/* Strategy / Validation Notice */}
      {!assessment.canRun && assessment.reason && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2 leading-relaxed">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>{assessment.reason}</span>
          </div>
        </div>
      )}

      {/* Primary Action CTA */}
      <button
        type="button"
        onClick={handleStartBatch}
        disabled={
          isRunning ||
          !assessment.canRun ||
          (assessment.strategy === 'editor_sdk_pages' &&
          editorMode === 'edit_text_only'
            ? phrases.length === 0
            : effectiveCount === 0)
        }
        className="w-full min-h-[48px] rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
      >
        {isRunning ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>
              PROCESSANDO ({completedCount}/{results.length})...
            </span>
          </>
        ) : assessment.strategy === 'editor_sdk_pages' &&
          editorMode === 'edit_text_only' ? (
          <>
            <Play className="w-4 h-4 fill-current" />
            <span>APLICAR FRASE {previewIndex + 1} (SÓ TEXTO)</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4 fill-current" />
            <span>GERAR EM LOTE ({effectiveCount})</span>
          </>
        )}
      </button>

      {/* Native Canva Export inside Editor SDK OR Direct Link to Editor from Web */}
      {assessment.strategy === 'editor_sdk_pages' ? (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => void handleEditorNativeExport()}
            disabled={isExportingEditor}
            className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            {isExportingEditor ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>Exportar / Salvar Cópia pelo Canva (PNG / PDF / PPTX)</span>
          </button>
          {editorExportMessage && (
            <p className="text-[11px] text-center text-slate-600">
              {editorExportMessage}
            </p>
          )}
        </div>
      ) : (
        selectedDesign?.editUrl && (
          <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-3 space-y-2 text-[11px] text-slate-600">
            <div className="leading-relaxed">
              Quer editar <strong>somente a caixa de texto</strong> dentro do próprio arquivo original do Canva sem gerar PDF/imagem? A API do Canva exige abrir o design no Editor:
            </div>
            <a
              href={selectedDesign.editUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold flex items-center justify-center gap-1.5"
            >
              <span>Abrir original no Editor do Canva (editar só o texto)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )
      )}

      {/* Multi-page Editable Canva Project Result Banner */}
      {projectResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 space-y-2.5">
          <div className="flex items-start gap-2 text-xs text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">
                Nova versão editável salva no Canva ({projectResult.pageCount}{' '}
                {projectResult.pageCount === 1 ? 'página' : 'páginas'})
              </div>
              <div className="text-[11px] text-emerald-800 mt-0.5">
                Design original preservado intacto. Nova cópia criada com fundo limpo e caixas de texto editáveis.
              </div>
            </div>
          </div>
          {projectResult.editUrl && (
            <a
              href={projectResult.editUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[42px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <span>Abrir Nova Versão Editável no Canva</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {projectError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{projectError}</span>
        </div>
      )}

      {/* Progress & Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono-tabular">
              <span className="text-slate-600">
                {isRunning
                  ? statusLabel || 'Processando versões...'
                  : `Concluído: ${successCount} ok · ${errorCount} erro(s)`}
              </span>
              <span className="font-semibold text-slate-900">{progressPct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {!isRunning &&
              successCount > 0 &&
              results.some((r) => r.verification?.verified) && (
                <div className="text-[11px] text-emerald-700 flex items-center gap-1.5 pt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {results.find((r) => r.verification?.verified)?.verification?.summary ||
                      'Texto antigo removido e verificado antes da inserção.'}
                  </span>
                </div>
              )}
          </div>

          {!isRunning && downloadableResults.length > 1 && (
            <button
              type="button"
              onClick={() => void handleDownloadAllPngs()}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Baixar todas as imagens ({downloadableResults.length} PNGs)</span>
            </button>
          )}

          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white max-h-[360px] overflow-y-auto">
            {results.map((item, idx) => (
              <div
                key={item.id}
                className="px-3 py-2.5 flex items-center justify-between gap-2.5 text-xs"
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  {item.imageDataUrl ? (
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(idx)}
                      className="relative group shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer"
                      aria-label={`Visualizar versão ${item.index}`}
                    >
                      <img
                        src={item.imageDataUrl}
                        alt={`Resultado ${item.index}`}
                        className="w-12 h-16 object-cover"
                      />
                    </button>
                  ) : (
                    <span className="font-mono-tabular text-slate-400 shrink-0 w-5 text-center">
                      {item.index}.
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-slate-900 font-medium truncate">
                      {item.phrase}
                    </div>
                    {item.errorMessage && (
                      <div className="text-red-600 text-[11px] truncate">
                        {item.errorMessage}
                      </div>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {item.status === 'pending' && (
                    <span className="text-slate-400">Na fila</span>
                  )}
                  {item.status === 'processing' && (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  )}
                  {item.status === 'success' && (
                    <>
                      {item.imageDataUrl && (
                        <>
                          <button
                            type="button"
                            onClick={() => setLightboxIndex(idx)}
                            className="min-h-[34px] px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ver</span>
                          </button>
                          <a
                            href={item.imageDataUrl}
                            download={`canva-lote-${String(item.index).padStart(2, '0')}.png`}
                            className="min-h-[34px] px-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold inline-flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>PNG</span>
                          </a>
                        </>
                      )}
                      {!item.imageDataUrl && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                      {item.editUrl && (
                        <a
                          href={item.editUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[34px] px-2 rounded-lg bg-indigo-50 text-indigo-700 font-semibold inline-flex items-center gap-1"
                        >
                          <span>Abrir</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </>
                  )}
                  {item.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Visual Preview Lightbox Modal for Generated Items */}
      {activeLightboxItem && activeLightboxItem.imageDataUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 flex flex-col items-center justify-center p-3 sm:p-6"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900">
                  Versão {activeLightboxItem.index} de {results.length}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {activeLightboxItem.phrase}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                aria-label="Fechar visualização"
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-100 flex items-center justify-center overflow-auto">
              <img
                src={activeLightboxItem.imageDataUrl}
                alt={`Prévia versão ${activeLightboxItem.index}`}
                className="max-h-[56vh] w-auto max-w-full rounded-lg shadow-sm"
              />
            </div>

            <div className="p-3 border-t border-slate-200 space-y-2 bg-white">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex((i) =>
                      i !== null && i > 0 ? i - 1 : results.length - 1
                    )
                  }
                  className="min-h-[38px] px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Anterior</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex((i) =>
                      i !== null && i + 1 < results.length ? i + 1 : 0
                    )
                  }
                  className="min-h-[38px] px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Próxima</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={activeLightboxItem.imageDataUrl}
                  download={`canva-lote-${String(activeLightboxItem.index).padStart(2, '0')}.png`}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar PNG</span>
                </a>
                {(activeLightboxItem.editUrl || projectResult?.editUrl) && (
                  <a
                    href={activeLightboxItem.editUrl || projectResult?.editUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] rounded-lg bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <span>Abrir Editável</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
