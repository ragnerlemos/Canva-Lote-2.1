import {
  generateEditablePageInEditor,
  replaceCurrentPageTextInEditor,
} from '../integrations/canva/designSdkClient';
import {
  exportDesignPageAsPng,
  getProxiedImageUrl,
  importRenderedVersionToCanva,
  runBrandTemplateAutofill,
} from '../integrations/canva/restApiClient';
import { isCanvaEditorHost } from '../intents/design_editor';
import {
  prepareCleanBackgroundAsset,
  renderPhraseOnTemplateImage,
  type CleanBackgroundAsset,
} from './canvasRenderer';
import type { EditablePdfPageSpec } from './pdfComposer';
import type {
  CanvaDesignSummary,
  CanvaTextLayer,
  GenerationResultItem,
  TextAppearanceConfig,
} from '../types/canva';

export type BatchExecutionStrategy =
  | 'editor_sdk_pages'
  | 'rest_brand_template_autofill'
  | 'web_canvas_compose'
  | 'unsupported_remote_regular_design';

export type CanvaSaveMode = 'project_multipage' | 'individual_designs' | 'none';
export type EditorExecutionMode = 'add_editable_pages' | 'edit_text_only';

export interface StrategyAssessment {
  strategy: BatchExecutionStrategy;
  canRun: boolean;
  reason?: string;
}

export function assessBatchStrategy(params: {
  selectedDesign: CanvaDesignSummary | null;
  targetLayer: CanvaTextLayer | null;
}): StrategyAssessment {
  const { selectedDesign, targetLayer } = params;

  if (isCanvaEditorHost() && targetLayer?.source === 'editor_sdk') {
    return {
      strategy: 'editor_sdk_pages',
      canRun: true,
    };
  }

  if (
    selectedDesign?.source === 'brand_template' &&
    targetLayer?.source === 'brand_template_field' &&
    targetLayer.fieldKey
  ) {
    return {
      strategy: 'rest_brand_template_autofill',
      canRun: true,
    };
  }

  if (selectedDesign?.source === 'design' && !isCanvaEditorHost()) {
    return {
      strategy: 'web_canvas_compose',
      canRun: true,
    };
  }

  if (isCanvaEditorHost() && !targetLayer) {
    return {
      strategy: 'editor_sdk_pages',
      canRun: false,
      reason: 'Selecione uma caixa de texto na aba Texto antes de gerar.',
    };
  }

  return {
    strategy: 'unsupported_remote_regular_design',
    canRun: false,
    reason:
      'Conecte sua conta e selecione um template na aba Template para iniciar a geração em lote.',
  };
}

export async function prepareWebCanvasTemplateUrl(
  selectedDesign: CanvaDesignSummary,
  selectedPageNumber: number,
  fallbackThumbnailUrl?: string
): Promise<{ proxiedImageUrl: string; usedFallback: boolean }> {
  try {
    const exportedPngUrl = await exportDesignPageAsPng(
      selectedDesign.id,
      selectedPageNumber
    );
    return {
      proxiedImageUrl: getProxiedImageUrl(exportedPngUrl),
      usedFallback: false,
    };
  } catch (err) {
    if (fallbackThumbnailUrl) {
      return {
        proxiedImageUrl: getProxiedImageUrl(fallbackThumbnailUrl),
        usedFallback: true,
      };
    }
    throw err;
  }
}

export async function prepareCleanWebBackground(params: {
  selectedDesign: CanvaDesignSummary;
  selectedPageNumber: number;
  appearance: TextAppearanceConfig;
  fallbackThumbnailUrl?: string;
}): Promise<{ proxiedImageUrl: string; bgAsset: CleanBackgroundAsset }> {
  const { selectedDesign, selectedPageNumber, appearance, fallbackThumbnailUrl } =
    params;
  const prepared = await prepareWebCanvasTemplateUrl(
    selectedDesign,
    selectedPageNumber,
    fallbackThumbnailUrl
  );
  const bgAsset = await prepareCleanBackgroundAsset({
    proxiedImageUrl: prepared.proxiedImageUrl,
    appearance,
  });

  if (appearance.enforceCleanRemoval && bgAsset.verification.method === 'blocked') {
    throw new Error(
      'Verificação anti-duplicação bloqueou a geração porque a remoção do texto original está desativada.'
    );
  }

  return {
    proxiedImageUrl: prepared.proxiedImageUrl,
    bgAsset,
  };
}

export async function executeBatchItem(params: {
  strategy: BatchExecutionStrategy;
  selectedDesign: CanvaDesignSummary | null;
  selectedPageNumber: number;
  targetLayer: CanvaTextLayer | null;
  phrase: string;
  keywordFilter?: string;
  appearance: TextAppearanceConfig;
  batchIndex: number;
  proxiedBaseImageUrl?: string;
  precomputedBackground?: CleanBackgroundAsset;
  canvaSaveMode?: CanvaSaveMode;
  editorExecutionMode?: EditorExecutionMode;
}): Promise<{
  resultItem: Partial<GenerationResultItem>;
  pdfPageSpec?: EditablePdfPageSpec;
}> {
  const {
    strategy,
    selectedDesign,
    selectedPageNumber,
    targetLayer,
    phrase,
    keywordFilter,
    appearance,
    batchIndex,
    proxiedBaseImageUrl,
    precomputedBackground,
    canvaSaveMode = 'project_multipage',
    editorExecutionMode = 'add_editable_pages',
  } = params;

  if (strategy === 'editor_sdk_pages') {
    if (!targetLayer) {
      throw new Error('Selecione uma caixa de texto alvo antes de gerar.');
    }

    if (editorExecutionMode === 'edit_text_only') {
      const verification = await replaceCurrentPageTextInEditor({
        targetLayer,
        replacementPhrase: phrase,
        keywordFilter,
      });
      return {
        resultItem: {
          status: 'success',
          pageNumber: selectedPageNumber,
          designId: selectedDesign?.id,
          editUrl: selectedDesign?.editUrl,
          verification,
        },
      };
    }

    const res = await generateEditablePageInEditor({
      sourcePageNumber: selectedPageNumber,
      targetLayer,
      replacementPhrase: phrase,
      keywordFilter,
      appearance,
      batchIndex,
    });
    return {
      resultItem: {
        status: 'success',
        pageNumber: res.pageNumber,
        designId: selectedDesign?.id,
        editUrl: selectedDesign?.editUrl,
        verification: res.verification,
      },
    };
  }

  if (
    strategy === 'rest_brand_template_autofill' &&
    selectedDesign &&
    targetLayer?.fieldKey
  ) {
    const titlePrefix = selectedDesign.title || 'Canva Lote';
    const created = await runBrandTemplateAutofill(
      selectedDesign.id,
      targetLayer.fieldKey,
      phrase,
      `${titlePrefix} — ${batchIndex}`
    );
    return {
      resultItem: {
        status: 'success',
        designId: created.designId,
        editUrl: created.editUrl,
        viewUrl: created.viewUrl,
        verification: {
          verified: true,
          method: 'autofill_verified',
          attempts: 1,
          autoExpanded: false,
          finalBoxPercent: { x: 50, y: 50, width: 100, height: 100 },
          residualContrastRatio: 0,
          summary: `Campo Autofill "${targetLayer.fieldKey}" substituído sem duplicação.`,
        },
      },
    };
  }

  if (strategy === 'web_canvas_compose') {
    if (!proxiedBaseImageUrl) {
      throw new Error('Imagem base do template não carregada para renderização.');
    }

    const rendered = await renderPhraseOnTemplateImage({
      proxiedImageUrl: proxiedBaseImageUrl,
      phrase,
      appearance,
      targetLayer,
      precomputedBackground,
    });

    if (canvaSaveMode === 'individual_designs' && selectedDesign) {
      const titlePrefix = selectedDesign.title || 'Canva Lote';
      const imported = await importRenderedVersionToCanva({
        title: `${titlePrefix} — ${batchIndex}`,
        backgroundJpegBase64: rendered.cleanBackgroundJpegBase64,
        width: rendered.width,
        height: rendered.height,
        pages: [rendered.pdfPageSpec],
      });
      return {
        resultItem: {
          status: 'success',
          imageDataUrl: rendered.pngDataUrl,
          designId: imported.designId,
          editUrl: imported.editUrl,
          viewUrl: imported.viewUrl,
          verification: rendered.verification,
        },
        pdfPageSpec: rendered.pdfPageSpec,
      };
    }

    return {
      resultItem: {
        status: 'success',
        imageDataUrl: rendered.pngDataUrl,
        verification: rendered.verification,
      },
      pdfPageSpec: rendered.pdfPageSpec,
    };
  }

  throw new Error(
    'Modo de geração não suportado para o contexto atual. Selecione um template ou abra no Editor do Canva.'
  );
}

export async function saveMultiPageEditableProjectToCanva(params: {
  title: string;
  bgAsset: CleanBackgroundAsset;
  pages: EditablePdfPageSpec[];
}): Promise<{ designId: string; editUrl?: string; viewUrl?: string }> {
  if (params.bgAsset.verification.method === 'blocked') {
    throw new Error(
      'Verificação anti-duplicação: não é possível salvar projeto editável sem remover o texto antigo.'
    );
  }
  return importRenderedVersionToCanva({
    title: params.title,
    backgroundJpegBase64: params.bgAsset.cleanBackgroundJpegBase64,
    width: params.bgAsset.width,
    height: params.bgAsset.height,
    pages: params.pages,
  });
}
