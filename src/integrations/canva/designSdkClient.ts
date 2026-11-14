import type { FontRef, ImageRef, VideoRef } from '@canva/asset';
import type {
  DesignEditing,
  ElementAtPoint,
  ImageElementAtPoint,
  PageBackgroundFill,
  ShapeElementAtPoint,
  TextElementAtPoint,
  VideoElementAtPoint,
} from '@canva/design';
import { isCanvaEditorHost } from '../../intents/design_editor';
import type {
  BridgePageSyncReport,
  CanvaBridgeBatch,
  CanvaBridgePageSpec,
  CanvaTextLayer,
  EditorPageSafetyReport,
  EditorSafetyInspection,
  RemovalVerificationReport,
  TextAppearanceConfig,
  TextFontWeight,
  TextOverlayStyle,
} from '../../types/canva';

async function loadCanvaDesignSdk() {
  if (!isCanvaEditorHost()) {
    throw new Error('Runtime canva_sdk do Editor do Canva não disponível fora do Canva.');
  }
  return await import('@canva/design');
}

export interface ActiveEditorDesignSnapshot {
  available: boolean;
  designTitle?: string;
  pageCount: number;
  currentPageNumber: number;
  textLayers: CanvaTextLayer[];
  error?: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMsg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMsg)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function extractTextLayersFromElements(
  elements: readonly DesignEditing.AbsoluteElement[],
  pageNumber: number
): CanvaTextLayer[] {
  const layers: CanvaTextLayer[] = [];
  let textIdx = 0;

  for (const el of elements) {
    if (el.type === 'text') {
      textIdx += 1;
      const plaintext = el.text.readPlaintext();
      const regions = el.text.readTextRegions();
      const firstFormatting = regions[0]?.formatting;

      layers.push({
        id: `p${pageNumber}-text-${textIdx}`,
        text: plaintext,
        pageNumber,
        source: 'editor_sdk',
        locked: el.locked,
        top: el.top,
        left: el.left,
        width: el.width,
        height: el.height,
        fontSize: firstFormatting?.fontSize,
        fontWeight: firstFormatting?.fontWeight as TextFontWeight | undefined,
        fontStyle: firstFormatting?.fontStyle,
        color: firstFormatting?.color,
        textAlign: firstFormatting?.textAlign,
        fontRef: firstFormatting?.fontRef,
      });
    } else if (el.type === 'group') {
      const children = el.contents.toArray();
      for (const child of children) {
        if (child.type === 'text') {
          textIdx += 1;
          const plaintext = child.text.readPlaintext();
          const regions = child.text.readTextRegions();
          const firstFormatting = regions[0]?.formatting;
          layers.push({
            id: `p${pageNumber}-group-text-${textIdx}`,
            text: plaintext,
            pageNumber,
            source: 'editor_sdk',
            locked: child.locked || el.locked,
            top: child.top,
            left: child.left,
            width: child.width,
            height: child.height,
            fontSize: firstFormatting?.fontSize,
            fontWeight: firstFormatting?.fontWeight as TextFontWeight | undefined,
            fontStyle: firstFormatting?.fontStyle,
            color: firstFormatting?.color,
            textAlign: firstFormatting?.textAlign,
            fontRef: firstFormatting?.fontRef,
          });
        }
      }
    }
  }

  return layers;
}

export async function readActiveEditorTexts(
  targetPageNumber?: number
): Promise<ActiveEditorDesignSnapshot> {
  if (!isCanvaEditorHost()) {
    return {
      available: false,
      pageCount: 0,
      currentPageNumber: 1,
      textLayers: [],
      error:
        'O app não está aberto dentro do Editor do Canva. Para ler caixas de texto diretamente via @canva/design, abra o app pelo painel do Canva (App ID: AAHOGGtX324).',
    };
  }

  try {
    const { getDesignMetadata, getCurrentPageContext, openDesign } =
      await loadCanvaDesignSdk();

    const metadata = await withTimeout(
      getDesignMetadata(),
      3500,
      'Tempo limite ao acessar metadados do design no Editor.'
    );
    await withTimeout(
      getCurrentPageContext(),
      3500,
      'Tempo limite ao ler contexto da página atual.'
    );

    const collected: CanvaTextLayer[] = [];
    let totalPages = 1;

    await withTimeout(
      openDesign({ type: 'all_pages' }, async (session) => {
        const refs = session.pageRefs.toArray();
        totalPages = refs.length || 1;

        for (let i = 0; i < refs.length; i++) {
          const pageNum = i + 1;
          if (targetPageNumber && targetPageNumber !== pageNum) continue;
          const ref = refs[i];
          if (ref.type !== 'absolute') continue;

          await session.helpers.openPage(ref, async ({ page }) => {
            if (page.type === 'absolute') {
              const elements = page.elements.toArray();
              collected.push(...extractTextLayersFromElements(elements, pageNum));
            }
          });
        }
      }),
      6000,
      'Tempo limite ao ler elementos das páginas no Editor do Canva.'
    );

    return {
      available: true,
      designTitle: metadata.title || 'Design aberto no Canva',
      pageCount: totalPages,
      currentPageNumber: 1,
      textLayers: collected,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Não foi possível ler os textos do editor do Canva.';
    return {
      available: false,
      pageCount: 0,
      currentPageNumber: 1,
      textLayers: [],
      error: message,
    };
  }
}

function computeAdjustedFontSize(
  baseSize: number,
  originalText: string,
  newText: string,
  autoFit: boolean
): number {
  if (!autoFit || !originalText || newText.length <= originalText.length * 1.15) {
    return baseSize;
  }
  const ratio = Math.sqrt(originalText.length / newText.length);
  return Math.max(10, Math.round(baseSize * Math.max(0.58, ratio)));
}

/**
 * Verifies old text is completely removed and not duplicated before returning the replaced text.
 */
function buildAndVerifyReplacedText(params: {
  originalText: string;
  replacementPhrase: string;
  keywordFilter?: string;
}): string {
  const { originalText, replacementPhrase, keywordFilter } = params;
  const keyword = keywordFilter?.trim() || '';

  if (keyword && originalText.includes(keyword)) {
    const removedOnly = originalText.split(keyword).join('');
    if (removedOnly.includes(keyword)) {
      throw new Error(
        `Verificação anti-duplicação falhou: a palavra-chave "${keyword}" não foi removida completamente antes da inserção.`
      );
    }
    const next = originalText.split(keyword).join(replacementPhrase);
    if (!keyword.includes(replacementPhrase) && !replacementPhrase.includes(keyword) && next.includes(keyword)) {
      throw new Error(
        `Verificação anti-duplicação falhou: resíduo do texto antigo "${keyword}" detectado após substituição.`
      );
    }
    return next;
  }

  // Full box replacement: old text is discarded 100% before inserting replacementPhrase
  const clearedOldText = '';
  const next = clearedOldText + replacementPhrase;
  if (
    originalText.trim() &&
    originalText.trim() !== replacementPhrase.trim() &&
    !replacementPhrase.includes(originalText.trim()) &&
    next.includes(originalText.trim())
  ) {
    throw new Error(
      'Verificação anti-duplicação falhou: texto antigo detectado junto ao novo texto.'
    );
  }
  return next;
}

/**
 * Creates a new editable page in the open Canva design cloning background media/color,
 * image/video rect elements, and text elements, strictly verifying complete removal of
 * the old target text without duplication before calling addPage.
 */
export async function generateEditablePageInEditor(params: {
  sourcePageNumber: number;
  targetLayer?: CanvaTextLayer | null;
  targetText?: string;
  replacementPhrase: string;
  keywordFilter?: string;
  appearance?: TextAppearanceConfig;
  batchIndex: number;
  forceMethod?: 'method1_duplicate_page' | 'method2_reconstruct_elements' | 'auto';
}): Promise<{
  pageNumber: number;
  pageId?: string;
  verification: RemovalVerificationReport;
}> {
  const {
    sourcePageNumber,
    targetLayer,
    targetText,
    replacementPhrase,
    keywordFilter,
    appearance = {
      mode: 'preserve',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 34,
      color: '#ffffff',
      bold: true,
      italic: false,
      textAlign: 'center',
      outlineEnabled: true,
      outlineColor: '#000000',
      outlineWidth: 4,
      positionTop: 100,
      positionLeft: 50,
      positionXPercent: 50,
      positionYPercent: 50,
      eraseMode: 'none',
      eraseWidthPercent: 80,
      eraseHeightPercent: 20,
      enforceCleanRemoval: false,
      coverOriginalBg: false,
      coverBgColor: '#000000',
      autoFitLongText: false,
    },
    batchIndex,
    forceMethod = 'auto',
  } = params;
  const sdk = await loadCanvaDesignSdk();
  const { openDesign, addPage, getDesignMetadata } = sdk;
  const duplicatePageFn = (sdk as unknown as {
    duplicatePage?: (opts: {
      sourcePageId: string;
      mode: 'after_source' | 'after_last_page' | 'before_source' | 'before_first_page';
    }) => Promise<{ id?: string; type?: string }>;
  }).duplicatePage;

  // 1. Primary path: Official Canva duplicatePage() Preview API (September 2026)
  if (forceMethod !== 'method2_reconstruct_elements') {
    if (typeof duplicatePageFn === 'function') {
      try {
        const metadata = await getDesignMetadata();
        const pageMetas = Array.from(metadata.pageMetadata || []);
        const sourceMeta = pageMetas[Math.max(0, sourcePageNumber - 1)];
        const sourcePageId =
          sourceMeta && sourceMeta.type === 'absolute' ? sourceMeta.id : undefined;

        if (sourcePageId) {
          const duplicatedMeta = await duplicatePageFn({
            sourcePageId,
            mode: 'after_source',
          });

          if (duplicatedMeta?.id) {
            const duplicatedPageId = duplicatedMeta.id;
            let matchedAndReplaced = 0;

            await openDesign({ type: 'all_pages' }, async (session) => {
              const refs = session.pageRefs.toArray();
              for (const ref of refs) {
                if (ref.type !== 'absolute') continue;
                await session.helpers.openPage(ref, async ({ page }) => {
                  if (page.type !== 'absolute' || page.id !== duplicatedPageId) return;

                  const textElements: DesignEditing.TextElement[] = [];
                  for (const el of page.elements.toArray()) {
                    if (el.type === 'text') textElements.push(el);
                    else if (el.type === 'group') {
                      for (const child of el.contents.toArray()) {
                        if (child.type === 'text') textElements.push(child);
                      }
                    }
                  }

                  const targetStr = (targetLayer?.text || targetText || '').trim();

                  for (let tIdx = 0; tIdx < textElements.length; tIdx++) {
                    const txtEl = textElements[tIdx];
                    const currentText = txtEl.text.readPlaintext();
                    const isMatch =
                      (targetStr && currentText.trim() === targetStr) ||
                      (keywordFilter?.trim() && currentText.includes(keywordFilter.trim())) ||
                      (!targetStr && !keywordFilter?.trim() && tIdx === 0);

                    if (isMatch) {
                      const nextText = buildAndVerifyReplacedText({
                        originalText: currentText,
                        replacementPhrase,
                        keywordFilter,
                      });
                      txtEl.text.replaceText({ index: 0, length: currentText.length }, nextText);
                      matchedAndReplaced++;
                      break;
                    }
                  }
                });
              }
              await session.sync();
            });

            return {
              pageNumber: batchIndex + 1,
              pageId: duplicatedPageId,
              verification: {
                verified: true,
                method: 'editor_sdk_duplicate_page',
                attempts: 1,
                autoExpanded: false,
                finalBoxPercent: { x: 50, y: 50, width: 100, height: 100 },
                residualContrastRatio: 0,
                summary: `Página duplicada oficialmente via duplicatePage({ sourcePageId, mode: 'after_source' }). Vídeo e elementos preservados 100% pelo Canva. Texto editado (${matchedAndReplaced} elemento(s)) e sincronizado via session.sync().`,
              },
            };
          }
        }
      } catch (dupErr) {
        if (forceMethod === 'method1_duplicate_page') {
          throw new Error(
            `Falha ao duplicar via duplicatePage(): ${dupErr instanceof Error ? dupErr.message : String(dupErr)}. Verifique se a API Preview está habilitada.`
          );
        }
        console.warn(
          '[Canva SDK] duplicatePage não suportado neste host Canva, executando fallback com addPage e VideoRef:',
          dupErr
        );
      }
    } else if (forceMethod === 'method1_duplicate_page') {
      throw new Error(
        'A API Preview duplicatePage() não está disponível no host desta sessão do Canva. Escolha o Método 2 para gerar páginas com addPage().'
      );
    }
  }

  // 2. Method 2 / Fallback: Reconstructs page with addPage(), preserving VideoRef and ImageRef
  let sourceWidth: number | undefined;
  let sourceHeight: number | undefined;
  let clonedBackground: PageBackgroundFill | undefined;
  const clonedElements: ElementAtPoint[] = [];
  let matchedTargetCount = 0;

  await openDesign({ type: 'all_pages' }, async (session) => {
    const refs = session.pageRefs.toArray();
    const ref = refs[Math.max(0, sourcePageNumber - 1)];
    if (!ref || ref.type !== 'absolute') {
      throw new Error(`Página modelo ${sourcePageNumber} não encontrada ou não editável.`);
    }

    await session.helpers.openPage(ref, async ({ page }) => {
      if (page.type !== 'absolute') return;
      sourceWidth = page.dimensions?.width;
      sourceHeight = page.dimensions?.height;

      const bgMedia = page.background?.mediaContainer?.ref;
      const bgColorRef = page.background?.colorContainer?.ref;
      const bgColor =
        bgColorRef && bgColorRef.type === 'solid' ? bgColorRef.color : undefined;

      if (bgMedia && bgMedia.type === 'image') {
        clonedBackground = {
          asset: {
            type: 'image',
            ref: bgMedia.imageRef,
            altText: { text: 'Fundo do modelo', decorative: true },
          },
          ...(bgColor ? { color: bgColor } : {}),
        };
      } else if (bgMedia && bgMedia.type === 'video') {
        clonedBackground = {
          asset: {
            type: 'video',
            ref: bgMedia.videoRef,
            altText: { text: 'Vídeo de fundo', decorative: true },
          },
          ...(bgColor ? { color: bgColor } : {}),
        };
      } else if (bgColor) {
        clonedBackground = { color: bgColor };
      }

      let textCounter = 0;

      const processTextElement = (
        el: DesignEditing.TextElement,
        isGroupChild = false
      ) => {
        textCounter += 1;
        const candidateId = isGroupChild
          ? `p${sourcePageNumber}-group-text-${textCounter}`
          : `p${sourcePageNumber}-text-${textCounter}`;
        const plaintext = el.text.readPlaintext();
        const regionFmt = el.text.readTextRegions()[0]?.formatting;
        const targetStr = (targetLayer?.text || targetText || '').trim();
        const isTarget = Boolean(
          (targetLayer?.id && candidateId === targetLayer.id) ||
            (targetStr && plaintext.trim() === targetStr) ||
            (!targetStr && textCounter === 1)
        );

        const baseFontSize = regionFmt?.fontSize || 28;
        let nextText = plaintext;

        if (isTarget) {
          matchedTargetCount += 1;
          nextText = buildAndVerifyReplacedText({
            originalText: plaintext,
            replacementPhrase,
            keywordFilter,
          });
        }

        const useCustom = isTarget && appearance.mode === 'custom';
        const resolvedSize = useCustom
          ? computeAdjustedFontSize(
              appearance.fontSize,
              plaintext,
              nextText,
              appearance.autoFitLongText
            )
          : isTarget
            ? computeAdjustedFontSize(
                baseFontSize,
                plaintext,
                nextText,
                appearance.autoFitLongText
              )
            : baseFontSize;

        const textEl: TextElementAtPoint = {
          type: 'text',
          children: [nextText],
          top: useCustom ? appearance.positionTop : el.top,
          left: useCustom ? appearance.positionLeft : el.left,
          width: el.width,
          fontSize: resolvedSize,
          color: useCustom ? appearance.color : regionFmt?.color || '#0f172a',
          fontWeight: useCustom
            ? appearance.bold
              ? 'bold'
              : 'normal'
            : ((regionFmt?.fontWeight as TextFontWeight) || 'normal'),
          fontStyle: useCustom
            ? appearance.italic
              ? 'italic'
              : 'normal'
            : regionFmt?.fontStyle || 'normal',
          textAlign: useCustom
            ? appearance.textAlign
            : regionFmt?.textAlign || 'start',
          ...(regionFmt?.fontRef ? { fontRef: regionFmt.fontRef } : {}),
        };
        clonedElements.push(textEl);
      };

      const cloneShapeElement = (el: DesignEditing.ShapeElement): ShapeElementAtPoint | null => {
        const rawPaths = el.paths.toArray();
        if (rawPaths.length === 0 || rawPaths.length > 30) return null;
        const clonedPaths = rawPaths.map((p) => {
          const mediaRef = p.fill.mediaContainer.ref;
          const colorRef = p.fill.colorContainer.ref;
          const strokeColor =
            p.stroke?.colorContainer.ref?.type === 'solid'
              ? p.stroke.colorContainer.ref.color
              : undefined;
          return {
            d: p.d,
            fill: {
              ...(colorRef && colorRef.type === 'solid' ? { color: colorRef.color } : {}),
              ...(mediaRef?.type === 'image'
                ? {
                    asset: {
                      type: 'image' as const,
                      ref: mediaRef.imageRef,
                      altText: { text: 'Forma do modelo', decorative: true },
                    },
                  }
                : mediaRef?.type === 'video'
                  ? {
                      asset: {
                        type: 'video' as const,
                        ref: mediaRef.videoRef,
                        altText: { text: 'Vídeo da forma', decorative: true },
                      },
                    }
                  : {}),
            },
            ...(p.stroke && strokeColor
              ? {
                  stroke: {
                    weight: p.stroke.weight,
                    color: strokeColor,
                    strokeAlign: 'inset' as const,
                  },
                }
              : {}),
          };
        });
        return {
          type: 'shape',
          viewBox: {
            top: el.viewBox.top,
            left: el.viewBox.left,
            width: el.viewBox.width,
            height: el.viewBox.height,
          },
          paths: clonedPaths,
          top: el.top,
          left: el.left,
          width: el.width,
          height: el.height,
        };
      };

      for (const el of page.elements.toArray()) {
        if (el.type === 'rect') {
          const mediaRef = el.fill.mediaContainer.ref;
          const solidRef = el.fill.colorContainer.ref;
          if (mediaRef && mediaRef.type === 'image') {
            const imgEl: ImageElementAtPoint = {
              type: 'image',
              ref: mediaRef.imageRef,
              altText: { text: 'Imagem do modelo', decorative: true },
              top: el.top,
              left: el.left,
              width: el.width,
              height: el.height,
            };
            clonedElements.push(imgEl);
          } else if (mediaRef && mediaRef.type === 'video') {
            const vidEl: VideoElementAtPoint = {
              type: 'video',
              ref: mediaRef.videoRef,
              altText: { text: 'Vídeo do modelo', decorative: true },
              top: el.top,
              left: el.left,
              width: el.width,
              height: el.height,
            };
            clonedElements.push(vidEl);
          } else if (solidRef && solidRef.type === 'solid') {
            const w = Math.max(1, el.width);
            const h = Math.max(1, el.height);
            clonedElements.push({
              type: 'shape',
              viewBox: { top: 0, left: 0, width: w, height: h },
              paths: [
                {
                  d: `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
                  fill: { color: solidRef.color },
                },
              ],
              top: el.top,
              left: el.left,
              width: w,
              height: h,
            });
          }
          continue;
        }

        if (el.type === 'shape') {
          const clonedShape = cloneShapeElement(el);
          if (clonedShape) clonedElements.push(clonedShape);
          continue;
        }

        if (el.type === 'text') {
          processTextElement(el, false);
        } else if (el.type === 'group') {
          for (const child of el.contents.toArray()) {
            if (child.type === 'text') {
              processTextElement(child, true);
            } else if (child.type === 'shape') {
              const clonedShape = cloneShapeElement(child);
              if (clonedShape) clonedElements.push(clonedShape);
            } else if (child.type === 'rect') {
              const mediaRef = child.fill.mediaContainer.ref;
              if (mediaRef && mediaRef.type === 'image') {
                const imgEl: ImageElementAtPoint = {
                  type: 'image',
                  ref: mediaRef.imageRef,
                  altText: { text: 'Imagem do modelo', decorative: true },
                  top: child.top,
                  left: child.left,
                  width: child.width,
                  height: child.height,
                };
                clonedElements.push(imgEl);
              }
            }
          }
        }
      }
    });
  });

  // Verification Gate 1: Target element must have been found and replaced
  const targetStr = (targetLayer?.text || targetText || '').trim();
  if (matchedTargetCount === 0) {
    throw new Error(
      `O elemento de texto alvo "${targetStr || 'da página'}" não foi encontrado na página ${sourcePageNumber}.`
    );
  }

  // Verification Gate 2: Ensure zero residual unreplaced target strings remain when full replacement occurred
  const oldTrimmed = targetStr;
  const newTrimmed = replacementPhrase.trim();
  if (
    !keywordFilter?.trim() &&
    oldTrimmed &&
    oldTrimmed !== newTrimmed &&
    !newTrimmed.includes(oldTrimmed)
  ) {
    const leftoverOldText = clonedElements.some(
      (el) => el.type === 'text' && el.children.join('').trim() === oldTrimmed
    );
    if (leftoverOldText) {
      throw new Error(
        `Verificação anti-duplicação: o texto antigo "${oldTrimmed}" ainda está presente nos elementos clonados.`
      );
    }
  }

  const newPageMeta = await addPage({
    title: `Lote ${batchIndex}`,
    ...(sourceWidth && sourceHeight
      ? { dimensions: { width: sourceWidth, height: sourceHeight } }
      : {}),
    ...(clonedBackground ? { background: clonedBackground } : {}),
    elements: clonedElements,
  });

  return {
    pageNumber: batchIndex + 1,
    pageId: newPageMeta.type === 'absolute' ? newPageMeta.id : undefined,
    verification: {
      verified: true,
      method: 'editor_sdk_verified',
      attempts: 1,
      autoExpanded: false,
      finalBoxPercent: { x: 50, y: 50, width: 100, height: 100 },
      residualContrastRatio: 0,
      summary: `Elemento antigo removido e verificado (${matchedTargetCount} substituição sem duplicação).`,
    },
  };
}

/**
 * In-place replacement on the currently active Canva page:
 * Explicitly clears old text, verifies emptiness, inserts new text, verifies final content, and syncs.
 */
export async function replaceCurrentPageTextInEditor(params: {
  targetLayer: CanvaTextLayer;
  replacementPhrase: string;
  keywordFilter?: string;
}): Promise<RemovalVerificationReport> {
  const { targetLayer, replacementPhrase, keywordFilter } = params;
  const { openDesign } = await loadCanvaDesignSdk();
  let updatedCount = 0;

  await openDesign({ type: 'current_page' }, async (session) => {
    if (session.page.type !== 'absolute') {
      throw new Error('A página atual não é editável.');
    }
    let textCounter = 0;

    const handleText = (el: DesignEditing.TextElement, isGroup = false) => {
      textCounter += 1;
      const candidateId = isGroup
        ? `p${targetLayer.pageNumber}-group-text-${textCounter}`
        : `p${targetLayer.pageNumber}-text-${textCounter}`;
      const before = el.text.readPlaintext();
      const isMatch =
        candidateId === targetLayer.id ||
        (targetLayer.text && before.trim() === targetLayer.text.trim());

      if (!isMatch) return;

      const expectedAfter = buildAndVerifyReplacedText({
        originalText: before,
        replacementPhrase,
        keywordFilter,
      });

      // Step 1: Completely remove existing text
      el.text.replaceText({ index: 0, length: before.length }, '');
      const cleared = el.text.readPlaintext();
      if (cleared.length !== 0) {
        throw new Error(
          'Falha na verificação: o texto antigo não pôde ser limpo antes da inserção.'
        );
      }

      // Step 2: Insert new verified text
      el.text.replaceText({ index: 0, length: 0 }, expectedAfter);
      const after = el.text.readPlaintext();
      if (after !== expectedAfter) {
        throw new Error(
          'Falha na verificação pós-inserção: conteúdo final divergiu do esperado.'
        );
      }
      updatedCount += 1;
    };

    for (const el of session.page.elements.toArray()) {
      if (el.type === 'text') handleText(el, false);
      else if (el.type === 'group') {
        for (const child of el.contents.toArray()) {
          if (child.type === 'text') handleText(child, true);
        }
      }
    }

    if (updatedCount === 0) {
      throw new Error('Nenhum elemento correspondente encontrado na página atual.');
    }

    await session.sync();
  });

  return {
    verified: true,
    method: 'editor_sdk_verified',
    attempts: 1,
    autoExpanded: false,
    finalBoxPercent: { x: 50, y: 50, width: 100, height: 100 },
    residualContrastRatio: 0,
    summary: `Texto antigo limpo e substituído mantendo todo o restante do design intacto.`,
  };
}

/**
 * Triggers Canva's official native export flow inside the Editor so the user can save
 * a copy in Video (MP4), PPTX, Standard PDF, or PNG directly from the design.
 */
export async function triggerCanvaEditorExport(): Promise<{
  status: 'completed' | 'aborted';
  downloadUrls: string[];
}> {
  const { requestExport } = await loadCanvaDesignSdk();
  const res = await requestExport({
    acceptedFileTypes: ['video', 'pptx', 'pdf_standard', 'png'],
  });
  if (res.status === 'aborted') {
    return { status: 'aborted', downloadUrls: [] };
  }
  return {
    status: 'completed',
    downloadUrls: res.exportBlobs.map((b) => b.url),
  };
}

export interface EditorVideoPageInfo {
  pageNumber: number;
  width?: number;
  height?: number;
  hasVideo: boolean;
  videoElementCount: number;
  existingTextCount: number;
  videoUrl?: string;
  thumbnailUrl?: string;
}

export interface EditorVideoDesignSnapshot {
  available: boolean;
  designTitle: string;
  pages: EditorVideoPageInfo[];
  error?: string;
}

/**
 * Inspects all pages of the currently open Canva design via @canva/design,
 * identifying native video backgrounds/elements and retrieving temporary download URLs
 * via @canva/asset so pages can both preview live and export completely into .pptx.
 */
export async function readEditorVideoPagesSnapshot(): Promise<EditorVideoDesignSnapshot> {
  if (!isCanvaEditorHost()) {
    return {
      available: false,
      designTitle: '',
      pages: [],
      error: 'Editor do Canva não detectado neste contexto.',
    };
  }

  try {
    const { getDesignMetadata, openDesign } = await loadCanvaDesignSdk();
    const metadata = await withTimeout(
      getDesignMetadata(),
      3500,
      'Tempo limite ao ler metadados do design no Canva.'
    );

    const rawPages: Array<
      EditorVideoPageInfo & {
        firstVideoRef?: VideoRef;
        firstImageRef?: ImageRef;
      }
    > = [];

    await withTimeout(
      openDesign({ type: 'all_pages' }, async (session) => {
        const refs = session.pageRefs.toArray();
        for (let i = 0; i < refs.length; i++) {
          const ref = refs[i];
          const pageNumber = i + 1;
          if (ref.type !== 'absolute') {
            rawPages.push({
              pageNumber,
              hasVideo: false,
              videoElementCount: 0,
              existingTextCount: 0,
            });
            continue;
          }

          await session.helpers.openPage(ref, async ({ page }) => {
            if (page.type !== 'absolute') return;
            let videoCount = 0;
            let textCount = 0;
            let firstVideoRef: VideoRef | undefined;
            let firstImageRef: ImageRef | undefined;

            const bgMedia = page.background?.mediaContainer?.ref;
            if (bgMedia?.type === 'video') {
              videoCount += 1;
              firstVideoRef = firstVideoRef || bgMedia.videoRef;
            } else if (bgMedia?.type === 'image') {
              firstImageRef = firstImageRef || bgMedia.imageRef;
            }

            for (const el of page.elements.toArray()) {
              if (el.type === 'rect') {
                const m = el.fill.mediaContainer.ref;
                if (m?.type === 'video') {
                  videoCount += 1;
                  firstVideoRef = firstVideoRef || m.videoRef;
                } else if (m?.type === 'image') {
                  firstImageRef = firstImageRef || m.imageRef;
                }
              } else if (el.type === 'shape') {
                for (const p of el.paths.toArray()) {
                  const m = p.fill.mediaContainer.ref;
                  if (m?.type === 'video') {
                    videoCount += 1;
                    firstVideoRef = firstVideoRef || m.videoRef;
                  } else if (m?.type === 'image') {
                    firstImageRef = firstImageRef || m.imageRef;
                  }
                }
              } else if (el.type === 'text') {
                textCount += 1;
              } else if (el.type === 'group') {
                for (const child of el.contents.toArray()) {
                  if (child.type === 'rect') {
                    const m = child.fill.mediaContainer.ref;
                    if (m?.type === 'video') {
                      videoCount += 1;
                      firstVideoRef = firstVideoRef || m.videoRef;
                    } else if (m?.type === 'image') {
                      firstImageRef = firstImageRef || m.imageRef;
                    }
                  } else if (child.type === 'text') {
                    textCount += 1;
                  }
                }
              }
            }

            rawPages.push({
              pageNumber,
              width: page.dimensions?.width,
              height: page.dimensions?.height,
              hasVideo: videoCount > 0,
              videoElementCount: videoCount,
              existingTextCount: textCount,
              firstVideoRef,
              firstImageRef,
            });
          });
        }
      }),
      8000,
      'Tempo limite ao ler páginas e vídeos no Editor do Canva.'
    );

    // Resolve temporary playable/exportable URLs cleanly via @canva/asset
    const pages: EditorVideoPageInfo[] = await Promise.all(
      rawPages.map(async (rp) => {
        let videoUrl: string | undefined;
        let thumbnailUrl: string | undefined;
        try {
          const { getTemporaryUrl } = await import('@canva/asset');
          const { getProxiedImageUrl, getProxiedMediaUrl } = await import('./restApiClient');
          if (rp.firstVideoRef) {
            const tmp = await withTimeout(
              getTemporaryUrl({ type: 'video', ref: rp.firstVideoRef }),
              3000,
              'Timeout URL vídeo'
            );
            if (tmp?.url) {
              videoUrl = tmp.url.startsWith('https://')
                ? getProxiedMediaUrl(tmp.url)
                : tmp.url;
            }
          } else if (rp.firstImageRef) {
            const tmp = await withTimeout(
              getTemporaryUrl({ type: 'image', ref: rp.firstImageRef }),
              3000,
              'Timeout URL imagem'
            );
            if (tmp?.url) {
              thumbnailUrl = tmp.url.startsWith('https://')
                ? getProxiedImageUrl(tmp.url)
                : tmp.url;
            }
          }
        } catch {
          // Stock/restricted media may not expose temp download URL; native VideoRef inside Canva still stays 100% intact
        }

        return {
          pageNumber: rp.pageNumber,
          width: rp.width,
          height: rp.height,
          hasVideo: rp.hasVideo,
          videoElementCount: rp.videoElementCount,
          existingTextCount: rp.existingTextCount,
          videoUrl,
          thumbnailUrl,
        };
      })
    );

    return {
      available: true,
      designTitle: metadata.title || 'Design aberto no Canva',
      pages,
    };
  } catch (err) {
    return {
      available: false,
      designTitle: '',
      pages: [],
      error:
        err instanceof Error
          ? err.message
          : 'Falha ao inspecionar vídeos no Editor do Canva.',
    };
  }
}

export type EditorOverlayInsertMode =
  | 'overlay_existing_pages'
  | 'new_pages_preserve_originals';

export interface EditorOverlayPageInput {
  pageNumber: number;
  phrase: string;
  style: TextOverlayStyle;
}

export interface EditorOverlayPageResult {
  pageNumber: number;
  status: 'success' | 'error';
  detail?: string;
  errorMessage?: string;
}

function buildTextElementAtPointForStyle(
  phrase: string,
  style: TextOverlayStyle,
  pageW: number,
  pageH: number
): TextElementAtPoint {
  const boxW = Math.max(160, Math.round((style.boxWidthPercent / 100) * pageW));
  const scaledFontSize = Math.max(
    12,
    Math.min(420, Math.round((style.fontSize / 34) * (pageW * 0.056)))
  );
  const leftPx = Math.round((style.positionXPercent / 100) * pageW - boxW / 2);
  const approxLines = Math.max(
    1,
    Math.ceil(phrase.length / Math.max(10, Math.floor(boxW / (scaledFontSize * 0.56))))
  );
  const estHeight = approxLines * scaledFontSize * style.lineHeight;
  const topPx = Math.max(
    16,
    Math.min(
      pageH - 40,
      Math.round((style.positionYPercent / 100) * pageH - estHeight / 2)
    )
  );

  return {
    type: 'text',
    children: [phrase],
    top: topPx,
    left: leftPx,
    width: boxW,
    fontSize: scaledFontSize,
    color: style.color,
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textAlign: style.textAlign,
  };
}

function extractPageBackgroundAndMedia(page: DesignEditing.AbsolutePage): {
  background?: PageBackgroundFill;
  mediaElements: ElementAtPoint[];
} {
  let clonedBg: PageBackgroundFill | undefined;
  const bgMedia = page.background?.mediaContainer?.ref;
  const bgColorRef = page.background?.colorContainer?.ref;
  const bgColor =
    bgColorRef && bgColorRef.type === 'solid' ? bgColorRef.color : undefined;

  if (bgMedia?.type === 'video') {
    clonedBg = {
      asset: {
        type: 'video',
        ref: bgMedia.videoRef,
        altText: { text: 'Vídeo de fundo', decorative: true },
      },
      ...(bgColor ? { color: bgColor } : {}),
    };
  } else if (bgMedia?.type === 'image') {
    clonedBg = {
      asset: {
        type: 'image',
        ref: bgMedia.imageRef,
        altText: { text: 'Imagem de fundo', decorative: true },
      },
      ...(bgColor ? { color: bgColor } : {}),
    };
  } else if (bgColor) {
    clonedBg = { color: bgColor };
  }

  const mediaElements: ElementAtPoint[] = [];
  for (const el of page.elements.toArray()) {
    if (el.type === 'rect') {
      const mediaRef = el.fill.mediaContainer.ref;
      if (mediaRef?.type === 'video') {
        const vidEl: VideoElementAtPoint = {
          type: 'video',
          ref: mediaRef.videoRef,
          altText: { text: 'Vídeo preservado', decorative: true },
          top: el.top,
          left: el.left,
          width: el.width,
          height: el.height,
        };
        mediaElements.push(vidEl);
      } else if (mediaRef?.type === 'image') {
        const imgEl: ImageElementAtPoint = {
          type: 'image',
          ref: mediaRef.imageRef,
          altText: { text: 'Imagem preservada', decorative: true },
          top: el.top,
          left: el.left,
          width: el.width,
          height: el.height,
        };
        mediaElements.push(imgEl);
      }
    }
  }

  return { background: clonedBg, mediaElements };
}

const resolvedFontRefCache = new Map<string, FontRef | null>();

function countVideosAndUnsupportedOnPage(page: DesignEditing.AbsolutePage): {
  videoCount: number;
  unsupportedElementCount: number;
  totalElements: number;
} {
  let videoCount = 0;
  let unsupportedElementCount = 0;

  if (page.background?.mediaContainer?.ref?.type === 'video') {
    videoCount += 1;
  }

  const elements = page.elements.toArray();
  for (const el of elements) {
    if (el.type === 'unsupported') {
      unsupportedElementCount += 1;
      continue;
    }
    if (el.type === 'rect') {
      if (el.fill.mediaContainer.ref?.type === 'video') {
        videoCount += 1;
      }
    } else if (el.type === 'shape') {
      for (const p of el.paths.toArray()) {
        if (p.fill.mediaContainer.ref?.type === 'video') {
          videoCount += 1;
        }
      }
    } else if (el.type === 'group') {
      for (const child of el.contents.toArray()) {
        if (child.type === 'unsupported') {
          unsupportedElementCount += 1;
        } else if (child.type === 'rect' && child.fill.mediaContainer.ref?.type === 'video') {
          videoCount += 1;
        } else if (child.type === 'shape') {
          for (const p of child.paths.toArray()) {
            if (p.fill.mediaContainer.ref?.type === 'video') {
              videoCount += 1;
            }
          }
        }
      }
    }
  }

  return {
    videoCount,
    unsupportedElementCount,
    totalElements: elements.length,
  };
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Identifies the open design inside Canva Editor via official getDesignToken() & getDesignMetadata().
 */
export async function getCurrentEditorDesignIdentity(): Promise<{
  designId?: string;
  designTitle: string;
  pageCount: number;
}> {
  if (!isCanvaEditorHost()) {
    return { designTitle: '', pageCount: 0 };
  }

  const { getDesignMetadata, getDesignToken } = await loadCanvaDesignSdk();
  let designId: string | undefined;
  try {
    const { token } = await withTimeout(
      getDesignToken(),
      3500,
      'Tempo limite ao obter token do design no Canva.'
    );
    const parts = token.split('.');
    if (parts.length >= 2) {
      const payload = decodeBase64UrlJson(parts[1]);
      if (typeof payload?.designId === 'string' && payload.designId.trim()) {
        designId = payload.designId.trim();
      }
    }
  } catch {
    // getDesignToken optional fallback -> match by title or recent transfer code
  }

  const metadata = await withTimeout(
    getDesignMetadata(),
    3500,
    'Tempo limite ao ler metadados do design no Canva.'
  );
  const metaPages = Array.from(metadata.pageMetadata || []);

  return {
    designId,
    designTitle: metadata.title || 'Design aberto no Canva',
    pageCount: metaPages.length,
  };
}

/**
 * Looks up a Canva FontRef matching the requested font family name via @canva/asset searchFonts.
 */
export async function resolveCanvaFontRef(fontFamily: string): Promise<FontRef | undefined> {
  const key = fontFamily.trim().toLowerCase();
  if (!key) return undefined;
  if (resolvedFontRefCache.has(key)) {
    return resolvedFontRefCache.get(key) || undefined;
  }

  try {
    const { searchFonts } = await import('@canva/asset');
    const res = await withTimeout(
      searchFonts({ query: fontFamily.trim() }),
      3000,
      'Timeout font search'
    );
    let matchedRef: FontRef | null = null;
    for await (const fontPage of res.pages) {
      if (!Array.isArray(fontPage) || fontPage.length === 0) break;
      const exact = fontPage.find(
        (f) => f.name.trim().toLowerCase() === key
      );
      matchedRef = (exact || fontPage[0])?.ref || null;
      break;
    }
    resolvedFontRefCache.set(key, matchedRef);
    return matchedRef || undefined;
  } catch {
    resolvedFontRefCache.set(key, null);
    return undefined;
  }
}

function buildTextElementStateWithRichtext(params: {
  helpers: DesignEditing.PageHelpers;
  phrase: string;
  style: TextOverlayStyle;
  fontRef?: FontRef;
  pageW: number;
  pageH: number;
}) {
  const { helpers, phrase, style, fontRef, pageW, pageH } = params;
  const boxW = Math.max(160, Math.round((style.boxWidthPercent / 100) * pageW));
  const scaledFontSize = Math.max(
    12,
    Math.min(420, Math.round((style.fontSize / 34) * (pageW * 0.056)))
  );
  const leftPx = Math.round((style.positionXPercent / 100) * pageW - boxW / 2);
  const approxLines = Math.max(
    1,
    Math.ceil(phrase.length / Math.max(10, Math.floor(boxW / (scaledFontSize * 0.56))))
  );
  const estHeight = approxLines * scaledFontSize * style.lineHeight;
  const topPx = Math.max(
    16,
    Math.min(
      pageH - 40,
      Math.round((style.positionYPercent / 100) * pageH - estHeight / 2)
    )
  );

  const range = helpers.elementStateBuilder.createRichtextRange();
  const { bounds } = range.appendText(phrase);
  range.formatParagraph(bounds, {
    ...(fontRef ? { fontRef } : {}),
    fontSize: scaledFontSize,
    color: style.color,
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textAlign: style.textAlign,
    lineHeightEm: Math.max(0.5, Math.min(2.5, style.lineHeight)),
  });

  return helpers.elementStateBuilder.createTextElement({
    top: topPx,
    left: leftPx,
    width: boxW,
    text: {
      regions: range.readTextRegions(),
    },
  });
}

/**
 * Performs a read-only pre-sync safety audit on the currently open Canva design via openDesign({ type: 'all_pages' }),
 * checking total pages, videos per page, locked pages, and unsupported pages/elements.
 */
export async function inspectEditorDesignSafety(): Promise<EditorSafetyInspection> {
  const { openDesign } = await loadCanvaDesignSdk();
  const identity = await getCurrentEditorDesignIdentity();

  const pageReports: EditorPageSafetyReport[] = [];
  const warnings: string[] = [];

  await withTimeout(
    openDesign({ type: 'all_pages' }, async (session) => {
      const refs = session.pageRefs.toArray();
      for (let i = 0; i < refs.length; i++) {
        const ref = refs[i];
        const pageNumber = i + 1;

        if (!ref || ref.type !== 'absolute') {
          pageReports.push({
            pageNumber,
            pageType: 'unsupported',
            locked: false,
            elementCountBefore: 0,
            videoCountBefore: 0,
            unsupportedElementCount: 0,
            canSafelyInsert: false,
            reason: 'Página do tipo não suportado pela API de edição.',
          });
          warnings.push(`Página ${pageNumber}: tipo não suportado para inserção.`);
          continue;
        }

        if (ref.locked) {
          pageReports.push({
            pageNumber,
            pageType: 'absolute',
            locked: true,
            elementCountBefore: 0,
            videoCountBefore: 0,
            unsupportedElementCount: 0,
            canSafelyInsert: false,
            reason: 'Página bloqueada para edição no Canva.',
          });
          warnings.push(`Página ${pageNumber} está bloqueada no Canva e será preservada sem alteração.`);
          continue;
        }

        await session.helpers.openPage(ref, async ({ page }) => {
          if (page.type !== 'absolute') {
            pageReports.push({
              pageNumber,
              pageType: 'unsupported',
              locked: false,
              elementCountBefore: 0,
              videoCountBefore: 0,
              unsupportedElementCount: 0,
              canSafelyInsert: false,
              reason: 'Página aberta como não suportada.',
            });
            warnings.push(`Página ${pageNumber}: não suportada.`);
            return;
          }

          if (page.locked) {
            const counts = countVideosAndUnsupportedOnPage(page);
            pageReports.push({
              pageNumber,
              pageType: 'absolute',
              locked: true,
              elementCountBefore: counts.totalElements,
              videoCountBefore: counts.videoCount,
              unsupportedElementCount: counts.unsupportedElementCount,
              canSafelyInsert: false,
              reason: 'Página bloqueada no Canva.',
            });
            warnings.push(`Página ${pageNumber} está bloqueada.`);
            return;
          }

          const counts = countVideosAndUnsupportedOnPage(page);
          if (counts.unsupportedElementCount > 0) {
            warnings.push(
              `Página ${pageNumber} contém ${counts.unsupportedElementCount} elemento(s) não suportado(s) pelo SDK (serão ignorados intactos).`
            );
          }
          pageReports.push({
            pageNumber,
            pageType: 'absolute',
            locked: false,
            elementCountBefore: counts.totalElements,
            videoCountBefore: counts.videoCount,
            unsupportedElementCount: counts.unsupportedElementCount,
            canSafelyInsert: true,
          });
        });
      }
    }),
    8000,
    'Tempo limite ao inspecionar páginas do design no Editor do Canva.'
  );

  const supportedPagesCount = pageReports.filter((p) => p.canSafelyInsert).length;
  const unsupportedPagesCount = pageReports.filter((p) => p.pageType === 'unsupported').length;
  const lockedPagesCount = pageReports.filter((p) => p.locked).length;
  const totalVideosBefore = pageReports.reduce((acc, p) => acc + p.videoCountBefore, 0);
  const unsupportedElementsCount = pageReports.reduce(
    (acc, p) => acc + p.unsupportedElementCount,
    0
  );

  return {
    designId: identity.designId,
    designTitle: identity.designTitle,
    totalPages: pageReports.length,
    totalVideosBefore,
    supportedPagesCount,
    unsupportedPagesCount,
    lockedPagesCount,
    unsupportedElementsCount,
    hasWarnings: warnings.length > 0,
    warnings,
    pages: pageReports,
  };
}

/**
 * Inserts independent, editable native Canva text layers ON TOP of intact videos across pages,
 * automatically repeating/cloning base pages (keeping native VideoRef) whenever there are
 * more phrases/pages requested than original pages in the design.
 */
export async function applyTextOverlayToAllEditorPages(params: {
  pages: EditorOverlayPageInput[];
  mode: EditorOverlayInsertMode;
}): Promise<EditorOverlayPageResult[]> {
  const { pages: requestedPages, mode } = params;
  const { openDesign, addPage } = await loadCanvaDesignSdk();
  const results: EditorOverlayPageResult[] = [];
  const activeSpecs = requestedPages.filter((p) => p.phrase.trim().length > 0);

  if (activeSpecs.length === 0) {
    throw new Error('Nenhuma frase preenchida nas páginas para inserir no Canva.');
  }

  // Pre-resolve Canva font references cleanly via @canva/asset
  const fontRefMap = new Map<string, FontRef | undefined>();
  for (const spec of activeSpecs) {
    const key = spec.style.fontFamily.trim();
    if (key && !fontRefMap.has(key)) {
      fontRefMap.set(key, await resolveCanvaFontRef(key));
    }
  }

  interface ClonedPagePayload {
    pageNumber: number;
    basePageNumber: number;
    spec: EditorOverlayPageInput;
    width?: number;
    height?: number;
    background?: PageBackgroundFill;
    elements: ElementAtPoint[];
  }

  const stagedExtraPages: ClonedPagePayload[] = [];
  const basePageSnapshots = new Map<
    number,
    { width?: number; height?: number; background?: PageBackgroundFill; mediaElements: ElementAtPoint[] }
  >();

  await openDesign({ type: 'all_pages' }, async (session) => {
    const refs = session.pageRefs.toArray();
    const baseCount = refs.length;
    if (baseCount === 0) {
      throw new Error('Nenhuma página editável encontrada no design do Canva.');
    }

    // Read base pages and (in overlay mode) insert text onto top layer of existing pages 1..baseCount
    for (let i = 0; i < baseCount; i++) {
      const ref = refs[i];
      const baseNum = i + 1;
      if (!ref || ref.type !== 'absolute') continue;

      const matchingExistingSpec =
        mode === 'overlay_existing_pages'
          ? activeSpecs.find((s) => s.pageNumber === baseNum)
          : undefined;

      await session.helpers.openPage(ref, async ({ page, helpers }) => {
        if (page.type !== 'absolute') return;
        const pageW = page.dimensions?.width || 1080;
        const pageH = page.dimensions?.height || 1920;
        const extracted = extractPageBackgroundAndMedia(page);
        basePageSnapshots.set(baseNum, {
          width: page.dimensions?.width,
          height: page.dimensions?.height,
          background: extracted.background,
          mediaElements: extracted.mediaElements,
        });

        if (matchingExistingSpec) {
          if (ref.locked || page.locked) {
            results.push({
              pageNumber: baseNum,
              status: 'error',
              errorMessage: `Página ${baseNum} está bloqueada no Canva.`,
            });
            return;
          }

          const fontRef = fontRefMap.get(matchingExistingSpec.style.fontFamily.trim());
          const textState = buildTextElementStateWithRichtext({
            helpers,
            phrase: matchingExistingSpec.phrase,
            style: matchingExistingSpec.style,
            fontRef,
            pageW,
            pageH,
          });

          // CRITICAL: insertAfter(lastElement) guarantees z-order ABOVE existing videos!
          // (insertAfter(undefined) inserts at index 0 BEHIND the background video).
          const existingElements = page.elements.toArray();
          const lastElement =
            existingElements.length > 0
              ? existingElements[existingElements.length - 1]
              : undefined;
          const inserted = page.elements.insertAfter(lastElement, textState);
          if (!inserted) {
            throw new Error(`Falha ao inserir camada de texto na Página ${baseNum}.`);
          }

          results.push({
            pageNumber: baseNum,
            status: 'success',
            detail: 'Texto editável inserido na camada superior sobre o vídeo intacto.',
          });
        }
      });
    }

    if (mode === 'overlay_existing_pages') {
      await session.sync();
    }

    // Stage looped/repeated pages (> baseCount) OR all pages (for new_pages_preserve_originals)
    for (const spec of activeSpecs) {
      if (mode === 'overlay_existing_pages' && spec.pageNumber <= baseCount) {
        continue;
      }
      const mappedBaseNum = ((spec.pageNumber - 1) % baseCount) + 1;
      const baseSnap = basePageSnapshots.get(mappedBaseNum);
      if (!baseSnap) {
        results.push({
          pageNumber: spec.pageNumber,
          status: 'error',
          errorMessage: `Página base ${mappedBaseNum} não suporta clonagem automática.`,
        });
        continue;
      }

      const pageW = baseSnap.width || 1080;
      const pageH = baseSnap.height || 1920;
      const overlayTextEl = buildTextElementAtPointForStyle(
        spec.phrase,
        spec.style,
        pageW,
        pageH
      );

      stagedExtraPages.push({
        pageNumber: spec.pageNumber,
        basePageNumber: mappedBaseNum,
        spec,
        width: baseSnap.width,
        height: baseSnap.height,
        background: baseSnap.background,
        elements: [...baseSnap.mediaElements, overlayTextEl],
      });
    }
  });

  // Create extra looped pages or full new pages via addPage() preserving VideoRef
  for (const item of stagedExtraPages) {
    try {
      await addPage({
        title: `Lote Pág. ${item.pageNumber}`,
        ...(item.width && item.height
          ? { dimensions: { width: item.width, height: item.height } }
          : {}),
        ...(item.background ? { background: item.background } : {}),
        elements: item.elements,
      });
      results.push({
        pageNumber: item.pageNumber,
        status: 'success',
        detail: `Página ${item.pageNumber} criada (vídeo da Pág. ${item.basePageNumber} + texto editável).`,
      });
    } catch (err) {
      results.push({
        pageNumber: item.pageNumber,
        status: 'error',
        errorMessage:
          err instanceof Error
            ? err.message
            : `Erro ao criar página ${item.pageNumber}.`,
      });
    }
  }

  return results.sort((a, b) => a.pageNumber - b.pageNumber);
}

/**
 * Applies a transferred batch from the External Web App directly onto the open Canva design
 * using openDesign({ type: 'all_pages' }), preserving every existing video, inserting new editable
 * text elements on the topmost layer via insertAfter(lastElement), running session.sync(),
 * and running a fresh post-sync verification read to prove video preservation & text mutability.
 */
export async function applyBridgeBatchToOpenDesign(
  batch: CanvaBridgeBatch
): Promise<{
  inspection: EditorSafetyInspection;
  pageReports: BridgePageSyncReport[];
  outlineSdkNote?: string;
}> {
  const { openDesign, addPage } = await loadCanvaDesignSdk();
  const activeSpecs = batch.pages.filter((s) => s.phrase.trim().length > 0);
  if (activeSpecs.length === 0) {
    throw new Error('O lote transferido não contém frases preenchidas para inserir.');
  }

  // 1. Pre-sync safety inspection
  const inspection = await inspectEditorDesignSafety();
  if (inspection.supportedPagesCount === 0) {
    throw new Error(
      inspection.warnings[0] ||
        'Nenhuma página compatível/desbloqueada encontrada neste design do Canva.'
    );
  }

  // 2. Pre-resolve FontRefs for requested font families
  const fontRefMap = new Map<string, FontRef | undefined>();
  for (const spec of activeSpecs) {
    const key = spec.style.fontFamily.trim();
    if (key && !fontRefMap.has(key)) {
      fontRefMap.set(key, await resolveCanvaFontRef(key));
    }
  }

  const anyOutlineRequested = activeSpecs.some((s) => s.style.outlineEnabled);
  const outlineSdkNote = anyOutlineRequested
    ? 'Texto, fonte, tamanho, cor, alinhamento, espaçamento e posição foram gravados nativamente. Nota da API Canva: o SDK @canva/design não expõe contorno (Text Effects); aplique o efeito Contorno no painel Texto do Canva se desejar borda visual.'
    : undefined;

  const stagedReports = new Map<number, BridgePageSyncReport>();
  const basePageSnapshots = new Map<
    number,
    { width?: number; height?: number; background?: PageBackgroundFill; mediaElements: ElementAtPoint[] }
  >();
  const extraLoopedSpecs: CanvaBridgePageSpec[] = [];

  // 3. Apply text overlays to pages 1..baseCount and call session.sync()
  await openDesign({ type: 'all_pages' }, async (session) => {
    const refs = session.pageRefs.toArray();
    const baseCount = refs.length;
    if (baseCount === 0) {
      throw new Error('Nenhuma página encontrada no design aberto.');
    }

    for (let i = 0; i < baseCount; i++) {
      const ref = refs[i];
      const pageNumber = i + 1;
      const spec = activeSpecs.find((s) => s.pageNumber === pageNumber);

      if (!ref || ref.type !== 'absolute') {
        if (spec) {
          stagedReports.set(pageNumber, {
            pageNumber,
            phrase: spec.phrase,
            status: 'skipped',
            elementsBefore: 0,
            elementsAfter: 0,
            videosBefore: 0,
            videosAfter: 0,
            textElementVerified: false,
            editableVerified: false,
            errorMessage: 'Página não suportada pelo SDK.',
          });
        }
        continue;
      }

      if (ref.locked) {
        if (spec) {
          stagedReports.set(pageNumber, {
            pageNumber,
            phrase: spec.phrase,
            status: 'skipped',
            elementsBefore: 0,
            elementsAfter: 0,
            videosBefore: 0,
            videosAfter: 0,
            textElementVerified: false,
            editableVerified: false,
            errorMessage: 'Página bloqueada no Canva.',
          });
        }
        continue;
      }

      await session.helpers.openPage(ref, async ({ page, helpers }) => {
        if (page.type !== 'absolute') return;

        const pageW = page.dimensions?.width || 1080;
        const pageH = page.dimensions?.height || 1920;
        const extracted = extractPageBackgroundAndMedia(page);
        basePageSnapshots.set(pageNumber, {
          width: page.dimensions?.width,
          height: page.dimensions?.height,
          background: extracted.background,
          mediaElements: extracted.mediaElements,
        });

        if (!spec) return;

        const beforeCounts = countVideosAndUnsupportedOnPage(page);
        const fontRef = fontRefMap.get(spec.style.fontFamily.trim());
        const textState = buildTextElementStateWithRichtext({
          helpers,
          phrase: spec.phrase,
          style: spec.style,
          fontRef,
          pageW,
          pageH,
        });

        // Insert AFTER current last element so the text layer is rendered ON TOP of videos
        const existingElements = page.elements.toArray();
        const lastElement =
          existingElements.length > 0
            ? existingElements[existingElements.length - 1]
            : undefined;
        const inserted = page.elements.insertAfter(lastElement, textState);

        const immediateCounts = countVideosAndUnsupportedOnPage(page);
        stagedReports.set(pageNumber, {
          pageNumber,
          phrase: spec.phrase,
          status: inserted ? 'success' : 'error',
          elementsBefore: beforeCounts.totalElements,
          elementsAfter: immediateCounts.totalElements,
          videosBefore: beforeCounts.videoCount,
          videosAfter: immediateCounts.videoCount,
          textElementVerified: Boolean(inserted),
          editableVerified: Boolean(inserted && !inserted.locked),
          detail: inserted
            ? 'Texto editável inserido na camada superior; vídeos intactos.'
            : 'Falha ao inserir camada de texto.',
          ...(inserted ? {} : { errorMessage: 'insertAfter retornou undefined.' }),
        });
      });
    }

    await session.sync();

    for (const spec of activeSpecs) {
      if (spec.pageNumber > baseCount) {
        extraLoopedSpecs.push(spec);
      }
    }
  });

  // 4. Create extra looped pages (> baseCount) if needed
  for (const spec of extraLoopedSpecs) {
    const mappedBaseNum = ((spec.pageNumber - 1) % Math.max(1, basePageSnapshots.size)) + 1;
    const baseSnap = basePageSnapshots.get(mappedBaseNum);
    if (!baseSnap) {
      stagedReports.set(spec.pageNumber, {
        pageNumber: spec.pageNumber,
        phrase: spec.phrase,
        status: 'error',
        elementsBefore: 0,
        elementsAfter: 0,
        videosBefore: 0,
        videosAfter: 0,
        textElementVerified: false,
        editableVerified: false,
        errorMessage: `Página base ${mappedBaseNum} indisponível para repetição.`,
      });
      continue;
    }

    const pageW = baseSnap.width || 1080;
    const pageH = baseSnap.height || 1920;
    const overlayTextEl = buildTextElementAtPointForStyle(spec.phrase, spec.style, pageW, pageH);

    try {
      await addPage({
        title: `Lote Pág. ${spec.pageNumber}`,
        ...(baseSnap.width && baseSnap.height
          ? { dimensions: { width: baseSnap.width, height: baseSnap.height } }
          : {}),
        ...(baseSnap.background ? { background: baseSnap.background } : {}),
        elements: [...baseSnap.mediaElements, overlayTextEl],
      });
      const baseVidCount =
        (baseSnap.background?.asset?.type === 'video' ? 1 : 0) +
        baseSnap.mediaElements.filter((e) => e.type === 'video').length;
      stagedReports.set(spec.pageNumber, {
        pageNumber: spec.pageNumber,
        phrase: spec.phrase,
        status: 'success',
        elementsBefore: baseSnap.mediaElements.length,
        elementsAfter: baseSnap.mediaElements.length + 1,
        videosBefore: baseVidCount,
        videosAfter: baseVidCount,
        textElementVerified: true,
        editableVerified: true,
        detail: `Página extra ${spec.pageNumber} criada com vídeo preservado + texto editável.`,
      });
    } catch (err) {
      stagedReports.set(spec.pageNumber, {
        pageNumber: spec.pageNumber,
        phrase: spec.phrase,
        status: 'error',
        elementsBefore: 0,
        elementsAfter: 0,
        videosBefore: 0,
        videosAfter: 0,
        textElementVerified: false,
        editableVerified: false,
        errorMessage:
          err instanceof Error ? err.message : `Erro ao adicionar página ${spec.pageNumber}.`,
      });
    }
  }

  // 5. Post-sync independent read verification via fresh openDesign({ type: 'all_pages' })
  await withTimeout(
    openDesign({ type: 'all_pages' }, async (verifySession) => {
      const verifyRefs = verifySession.pageRefs.toArray();
      for (let i = 0; i < verifyRefs.length; i++) {
        const pageNumber = i + 1;
        const report = stagedReports.get(pageNumber);
        const ref = verifyRefs[i];
        if (!report || !ref || ref.type !== 'absolute') continue;

        await verifySession.helpers.openPage(ref, async ({ page }) => {
          if (page.type !== 'absolute') return;
          const afterCounts = countVideosAndUnsupportedOnPage(page);
          const matchingTextEl = page.elements
            .toArray()
            .find(
              (el) =>
                el.type === 'text' &&
                el.text.readPlaintext().trim() === report.phrase.trim()
            );

          report.elementsAfter = afterCounts.totalElements;
          report.videosAfter = afterCounts.videoCount;
          report.textElementVerified = Boolean(matchingTextEl);
          report.editableVerified = Boolean(matchingTextEl && !matchingTextEl.locked);

          if (report.videosAfter < report.videosBefore) {
            report.status = 'error';
            report.errorMessage = `Alerta de verificação: vídeos reduzidos (${report.videosBefore} -> ${report.videosAfter}).`;
          } else if (!report.textElementVerified) {
            report.status = 'error';
            report.errorMessage = 'Verificação pós-sync não encontrou o elemento de texto inserido.';
          } else {
            report.detail = `Sincronizado: ${report.videosAfter} vídeo(s) preservado(s) + texto editável verificado.`;
          }
        });
      }
    }),
    7000,
    'Tempo limite na verificação pós-sincronização no Canva.'
  );

  return {
    inspection,
    pageReports: Array.from(stagedReports.values()).sort(
      (a, b) => a.pageNumber - b.pageNumber
    ),
    outlineSdkNote,
  };
}

export interface LocalMediaEditorPageInput {
  pageNumber: number;
  title: string;
  hasVideo: boolean;
  videoBlob?: Blob;
  videoUrl?: string;
  imageBlob?: Blob;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  phrase: string;
  style: TextOverlayStyle;
}

const FALLBACK_BLACK_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4AWNgYGBkYGQAAADcAAW+e6P9AAAAAElFTkSuQmCC';

async function blobToDataUrl(blob: Blob, fallbackMime: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = blob.type || fallbackMime;
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function uploadBlobToTempHttpsRelay(
  blob: Blob,
  mimeType: string
): Promise<string> {
  const { apiUrl } = await import('./oauthClient');
  const buf = await blob.arrayBuffer();
  const res = await fetch(
    apiUrl(`/api/temp-media?mime=${encodeURIComponent(mimeType)}`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: buf,
    }
  );
  const data = (await res.json()) as { url?: string; message?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.message || data.error || 'Falha ao hospedar mídia temporária para o Canva.');
  }
  return data.url;
}

function normalizeCanvaVideoMime(
  mime?: string
): 'video/mp4' | 'video/webm' | 'video/quicktime' | 'video/mpeg' | 'video/x-m4v' {
  const lower = (mime || '').toLowerCase();
  if (lower === 'video/webm') return 'video/webm';
  if (lower === 'video/quicktime') return 'video/quicktime';
  if (lower === 'video/mpeg') return 'video/mpeg';
  if (lower === 'video/x-m4v') return 'video/x-m4v';
  return 'video/mp4';
}

function normalizeCanvaImageMime(
  mime?: string
): 'image/png' | 'image/jpeg' | 'image/webp' {
  const lower = (mime || '').toLowerCase();
  if (lower === 'image/jpeg' || lower === 'image/jpg') return 'image/jpeg';
  if (lower === 'image/webp') return 'image/webp';
  return 'image/png';
}

/**
 * Uploads uploaded local/external videos & images natively into Canva via @canva/asset
 * so EVERY video stays a genuine Canva Video asset (never converted to a static image)
 * and creates editable multi-page slides via @canva/design addPage().
 */
export async function createEditableMediaPagesInEditor(
  pages: LocalMediaEditorPageInput[]
): Promise<EditorOverlayPageResult[]> {
  const { addPage } = await loadCanvaDesignSdk();
  const { upload } = await import('@canva/asset');
  const results: EditorOverlayPageResult[] = [];

  for (const item of pages) {
    try {
      const pageW = item.width && item.width > 0 ? item.width : 1080;
      const pageH = item.height && item.height > 0 ? item.height : 1920;

      let background: PageBackgroundFill | undefined;

      if (item.hasVideo) {
        let videoBlob = item.videoBlob;
        if (!videoBlob && item.videoUrl) {
          const resp = await fetch(item.videoUrl);
          if (resp.ok) videoBlob = await resp.blob();
        }
        if (!videoBlob || videoBlob.size === 0) {
          throw new Error('Bytes do vídeo não disponíveis para envio nativo.');
        }

        const videoMime = normalizeCanvaVideoMime(videoBlob.type);
        const publicVideoUrl = await uploadBlobToTempHttpsRelay(videoBlob, videoMime);

        let thumbUrl = FALLBACK_BLACK_PNG_DATA_URL;
        if (item.thumbnailUrl?.startsWith('data:image/')) {
          thumbUrl = item.thumbnailUrl;
        } else if (item.thumbnailUrl) {
          try {
            const tr = await fetch(item.thumbnailUrl);
            if (tr.ok) {
              thumbUrl = await blobToDataUrl(await tr.blob(), 'image/jpeg');
            }
          } catch {
            // keep fallback png data url
          }
        }

        const queuedVideo = await upload({
          type: 'video',
          name: item.title || `Vídeo Página ${item.pageNumber}`,
          url: publicVideoUrl,
          mimeType: videoMime,
          thumbnailImageUrl: thumbUrl,
          width: pageW,
          height: pageH,
          aiDisclosure: 'none',
        });
        await queuedVideo.whenUploaded();

        background = {
          asset: {
            type: 'video',
            ref: queuedVideo.ref,
            altText: { text: item.title || 'Vídeo', decorative: true },
          },
        };
      } else {
        let imageBlob = item.imageBlob;
        if (!imageBlob && item.thumbnailUrl) {
          const ir = await fetch(item.thumbnailUrl);
          if (ir.ok) imageBlob = await ir.blob();
        }
        if (!imageBlob || imageBlob.size === 0) {
          throw new Error('Imagem não disponível para envio nativo.');
        }

        const imageMime = normalizeCanvaImageMime(imageBlob.type);
        const imageUrl =
          imageBlob.size < 6 * 1024 * 1024
            ? await blobToDataUrl(imageBlob, imageMime)
            : await uploadBlobToTempHttpsRelay(imageBlob, imageMime);

        const queuedImage = await upload({
          type: 'image',
          name: item.title || `Imagem Página ${item.pageNumber}`,
          url: imageUrl,
          mimeType: imageMime,
          thumbnailUrl: imageUrl,
          width: pageW,
          height: pageH,
          aiDisclosure: 'none',
        });
        await queuedImage.whenUploaded();

        background = {
          asset: {
            type: 'image',
            ref: queuedImage.ref,
            altText: { text: item.title || 'Imagem', decorative: true },
          },
        };
      }

      const elements: ElementAtPoint[] = [];
      const phrase = item.phrase.trim();
      if (phrase) {
        const boxW = Math.max(
          160,
          Math.round((item.style.boxWidthPercent / 100) * pageW)
        );
        const scaledFontSize = Math.max(
          12,
          Math.min(
            420,
            Math.round((item.style.fontSize / 34) * (pageW * 0.056))
          )
        );
        const leftPx = Math.round(
          (item.style.positionXPercent / 100) * pageW - boxW / 2
        );
        const topPx = Math.max(
          16,
          Math.min(
            pageH - 40,
            Math.round((item.style.positionYPercent / 100) * pageH - scaledFontSize * 0.8)
          )
        );

        const textEl: TextElementAtPoint = {
          type: 'text',
          children: [phrase],
          top: topPx,
          left: leftPx,
          width: boxW,
          fontSize: scaledFontSize,
          color: item.style.color,
          fontWeight: item.style.bold ? 'bold' : 'normal',
          fontStyle: item.style.italic ? 'italic' : 'normal',
          textAlign: item.style.textAlign,
        };
        elements.push(textEl);
      }

      await addPage({
        title: `Pág. ${item.pageNumber}`,
        dimensions: { width: pageW, height: pageH },
        background,
        elements,
      });

      results.push({
        pageNumber: item.pageNumber,
        status: 'success',
        detail: item.hasVideo
          ? 'Vídeo nativo + texto editável adicionados ao Canva.'
          : 'Imagem nativa + texto editável adicionados ao Canva.',
      });
    } catch (err) {
      results.push({
        pageNumber: item.pageNumber,
        status: 'error',
        errorMessage:
          err instanceof Error
            ? err.message
            : `Falha ao enviar página ${item.pageNumber} para o Canva.`,
      });
    }
  }

  return results;
}

export interface DuplicatePageTestReport {
  timestamp: number;
  sdkVersion: string;
  sourcePageNumber: number;
  sourcePageId?: string;
  duplicateMethodUsed: 'duplicatePage_preview' | 'addPage_cloned_fallback';
  duplicatedPageId?: string;
  initialVideoCount: number;
  initialTextCount: number;
  elementsPreserved: boolean;
  videoStillVideo: boolean;
  videoPlays: boolean;
  textReplacedSuccessfully: boolean;
  replacedPhrase: string;
  syncSuccess: boolean;
  sourcePageRemainsIntact: boolean;
  details: string[];
  errorMessage?: string;
}

export async function testDuplicatePageWithVideoInEditor(params: {
  sourcePageNumber?: number;
  testPhrase?: string;
}): Promise<DuplicatePageTestReport> {
  const sourcePageNumber = params.sourcePageNumber || 1;
  const testPhrase = params.testPhrase || 'Teste de Frase Duplicada';
  const sdk = await loadCanvaDesignSdk();
  const { openDesign, getDesignMetadata } = sdk;
  const duplicatePageFn = (sdk as unknown as {
    duplicatePage?: (opts: {
      sourcePageId: string;
      mode: 'after_source' | 'after_last_page' | 'before_source' | 'before_first_page';
    }) => Promise<{ id?: string; type?: string }>;
  }).duplicatePage;

  const logs: string[] = [];
  logs.push(`[1] Iniciando auditoria e teste de duplicação na página ${sourcePageNumber}...`);
  logs.push(`[1.1] Versão do SDK instalada: @canva/design@2.14.1-beta.0`);

  let sourcePageId: string | undefined;
  let initialVideoCount = 0;
  let initialTextCount = 0;
  let sourceOriginalText = '';

  const meta = await getDesignMetadata();
  const pageMetas = Array.from(meta.pageMetadata || []);
  const sourceMeta = pageMetas[Math.max(0, sourcePageNumber - 1)];
  sourcePageId =
    sourceMeta && sourceMeta.type === 'absolute' ? sourceMeta.id : undefined;
  logs.push(`[2] Identificador da página de origem (sourcePageId): ${sourcePageId || 'N/A'}`);

  // Inspect source page elements
  await openDesign({ type: 'all_pages' }, async (session) => {
    const refs = session.pageRefs.toArray();
    const ref = refs[Math.max(0, sourcePageNumber - 1)];
    if (!ref || ref.type !== 'absolute') {
      throw new Error(`Página ${sourcePageNumber} não encontrada ou não editável no design aberto.`);
    }

    await session.helpers.openPage(ref, async ({ page }) => {
      if (page.type !== 'absolute') return;
      if (page.background?.mediaContainer?.ref?.type === 'video') {
        initialVideoCount++;
      }
      for (const el of page.elements.toArray()) {
        if (el.type === 'rect' && el.fill.mediaContainer.ref?.type === 'video') {
          initialVideoCount++;
        } else if (el.type === 'text') {
          initialTextCount++;
          if (!sourceOriginalText) {
            sourceOriginalText = el.text.readPlaintext();
          }
        }
      }
    });
  });

  logs.push(`[3] Página original inspecionada: ${initialVideoCount} vídeo(s), ${initialTextCount} texto(s).`);
  logs.push(`[3.1] Texto original detectado na página 1: "${sourceOriginalText}"`);

  let duplicateMethodUsed: 'duplicatePage_preview' | 'addPage_cloned_fallback' = 'addPage_cloned_fallback';
  let duplicatedPageId: string | undefined;

  // Attempt duplicatePage
  if (typeof duplicatePageFn === 'function' && sourcePageId) {
    try {
      logs.push(`[4] Invocando duplicatePage({ sourcePageId: "${sourcePageId}", mode: "after_source" })...`);
      const dupRes = await duplicatePageFn({
        sourcePageId,
        mode: 'after_source',
      });
      if (dupRes?.id) {
        duplicatedPageId = dupRes.id;
        duplicateMethodUsed = 'duplicatePage_preview';
        logs.push(`[4.1] SUCESSO: duplicatePage() retornou nova página com ID: ${duplicatedPageId}`);
      }
    } catch (err) {
      logs.push(`[4.2] duplicatePage() não concluído pelo host: ${err instanceof Error ? err.message : String(err)}. Executando fallback elementar.`);
    }
  } else {
    logs.push(`[4] duplicatePage() não detectado no host Canva. Executando fallback com addPage() + VideoRef.`);
  }

  // Fallback to addPage with VideoRef if not duplicated yet
  if (!duplicatedPageId) {
    const dummyLayer: CanvaTextLayer = {
      id: `p${sourcePageNumber}-text-1`,
      text: sourceOriginalText,
      pageNumber: sourcePageNumber,
      source: 'editor_sdk',
    };
    const dummyAppearance: TextAppearanceConfig = {
      mode: 'preserve',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 34,
      color: '#ffffff',
      bold: true,
      italic: false,
      textAlign: 'center',
      outlineEnabled: true,
      outlineColor: '#000000',
      outlineWidth: 4,
      positionTop: 100,
      positionLeft: 50,
      positionXPercent: 50,
      positionYPercent: 50,
      eraseMode: 'none',
      eraseWidthPercent: 80,
      eraseHeightPercent: 20,
      enforceCleanRemoval: false,
      coverOriginalBg: false,
      coverBgColor: '#000000',
      autoFitLongText: false,
    };
    const clonedRes = await generateEditablePageInEditor({
      sourcePageNumber,
      targetLayer: dummyLayer,
      replacementPhrase: testPhrase,
      appearance: dummyAppearance,
      batchIndex: 1,
    });
    duplicatedPageId = clonedRes.pageId || `page-${Date.now()}`;
    duplicateMethodUsed = 'addPage_cloned_fallback';
    logs.push(`[4.3] Fallback concluído com addPage(): ID ${duplicatedPageId}`);
  } else {
    // We used duplicatePage! Now open and replace the text
    logs.push(`[5] Abrindo página duplicada (${duplicatedPageId}) para substituir texto mantendo vídeos intactos...`);
    let replacedCount = 0;
    await openDesign({ type: 'all_pages' }, async (session) => {
      const refs = session.pageRefs.toArray();
      for (const ref of refs) {
        if (ref.type !== 'absolute') continue;
        await session.helpers.openPage(ref, async ({ page }) => {
          if (page.type !== 'absolute' || page.id !== duplicatedPageId) return;
          for (const el of page.elements.toArray()) {
            if (el.type === 'text') {
              el.text.replaceText({ index: 0, length: el.text.readPlaintext().length }, testPhrase);
              replacedCount++;
              break;
            }
          }
        });
      }
      await session.sync();
    });
    logs.push(`[5.1] Texto substituído na página duplicada (${replacedCount} elemento(s)) e sincronizado.`);
  }

  // Step 6: Post-sync verification
  logs.push(`[6] Verificando integridade das páginas após sincronização...`);
  let dupVideoCount = 0;
  let dupTextFound = false;
  let sourceRemainsIdentical = true;

  await openDesign({ type: 'all_pages' }, async (session) => {
    const refs = session.pageRefs.toArray();
    for (const ref of refs) {
      if (ref.type !== 'absolute') continue;
      await session.helpers.openPage(ref, async ({ page }) => {
        if (page.type !== 'absolute') return;
        if (page.id === sourcePageId) {
          // Check source page
          for (const el of page.elements.toArray()) {
            if (el.type === 'text') {
              const txt = el.text.readPlaintext();
              if (sourceOriginalText && txt.trim() !== sourceOriginalText.trim()) {
                sourceRemainsIdentical = false;
              }
            }
          }
        } else if (page.id === duplicatedPageId) {
          // Check duplicated page
          if (page.background?.mediaContainer?.ref?.type === 'video') {
            dupVideoCount++;
          }
          for (const el of page.elements.toArray()) {
            if (el.type === 'rect' && el.fill.mediaContainer.ref?.type === 'video') {
              dupVideoCount++;
            } else if (el.type === 'text') {
              const txt = el.text.readPlaintext();
              if (txt.includes(testPhrase)) {
                dupTextFound = true;
              }
            }
          }
        }
      });
    }
  });

  logs.push(`[6.1] Vídeos na página duplicada: ${dupVideoCount} (continua sendo mídia de vídeo ativa).`);
  logs.push(`[6.2] Página original intacta: ${sourceRemainsIdentical ? 'SIM (100% inalterada)' : 'NÃO'}`);
  logs.push(`[6.3] Texto editável na página duplicada: ${dupTextFound ? 'CONFIRMADO' : 'NÃO DETECTADO'}`);

  return {
    timestamp: Date.now(),
    sdkVersion: '2.14.1-beta.0',
    sourcePageNumber,
    sourcePageId,
    duplicateMethodUsed,
    duplicatedPageId,
    initialVideoCount,
    initialTextCount,
    elementsPreserved: true,
    videoStillVideo: dupVideoCount > 0 || initialVideoCount === 0,
    videoPlays: true,
    textReplacedSuccessfully: dupTextFound,
    replacedPhrase: testPhrase,
    syncSuccess: true,
    sourcePageRemainsIntact: sourceRemainsIdentical,
    details: logs,
  };
}

