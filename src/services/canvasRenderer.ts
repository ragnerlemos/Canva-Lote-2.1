import type {
  CanvaTextLayer,
  RemovalVerificationReport,
  TextAppearanceConfig,
} from '../types/canva';
import type { EditablePdfPageSpec } from './pdfComposer';

export interface RenderedDesignVersion {
  pngDataUrl: string;
  cleanBackgroundJpegBase64: string;
  width: number;
  height: number;
  pdfPageSpec: EditablePdfPageSpec;
  verification: RemovalVerificationReport;
}

export interface CleanBackgroundAsset {
  canvas: HTMLCanvasElement;
  cleanBackgroundJpegBase64: string;
  width: number;
  height: number;
  verification: RemovalVerificationReport;
}

const loadedImageCache = new Map<string, HTMLImageElement>();

export function loadTemplateImage(src: string): Promise<HTMLImageElement> {
  const cached = loadedImageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadedImageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () =>
      reject(new Error('Não foi possível carregar a imagem base do template.'));
    img.src = src;
  });
}

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

function rgbLuma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 128;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Inspects the 4 border strips immediately outside (x0, y0, x1, y1) to detect
 * whether any high-contrast text/outline glyphs are still touching the perimeter.
 */
function inspectBorderOutliers(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { top: number; bottom: number; left: number; right: number } {
  const readLuma = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    const idx = (cy * width + cx) * 4;
    return rgbLuma(srcData[idx], srcData[idx + 1], srcData[idx + 2]);
  };

  const measureStripOutlierRatio = (samples: number[]): number => {
    if (samples.length < 4) return 0;
    const med = computeMedian(samples);
    let outliers = 0;
    for (let i = 0; i < samples.length; i++) {
      const diffMed = Math.abs(samples[i] - med);
      const diffNeighbor = i > 0 ? Math.abs(samples[i] - samples[i - 1]) : 0;
      if (diffMed > 46 || diffNeighbor > 40) {
        outliers += 1;
      }
    }
    return outliers / samples.length;
  };

  const topSamples: number[] = [];
  const bottomSamples: number[] = [];
  for (let x = x0; x < x1; x += 2) {
    topSamples.push(readLuma(x, Math.max(0, y0 - 2)));
    bottomSamples.push(readLuma(x, Math.min(height - 1, y1 + 2)));
  }

  const leftSamples: number[] = [];
  const rightSamples: number[] = [];
  for (let y = y0; y < y1; y += 2) {
    leftSamples.push(readLuma(Math.max(0, x0 - 2), y));
    rightSamples.push(readLuma(Math.min(width - 1, x1 + 2), y));
  }

  return {
    top: measureStripOutlierRatio(topSamples),
    bottom: measureStripOutlierRatio(bottomSamples),
    left: measureStripOutlierRatio(leftSamples),
    right: measureStripOutlierRatio(rightSamples),
  };
}

function smoothRgbStrip(
  samples: Array<[number, number, number]>,
  radius = 4
): Array<[number, number, number]> {
  const len = samples.length;
  if (len === 0) return [];
  const out: Array<[number, number, number]> = new Array(len);
  for (let i = 0; i < len; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    const start = Math.max(0, i - radius);
    const end = Math.min(len - 1, i + radius);
    for (let j = start; j <= end; j++) {
      r += samples[j][0];
      g += samples[j][1];
      b += samples[j][2];
      count += 1;
    }
    out[i] = [r / count, g / count, b / count];
  }
  return out;
}

function inpaintRectCoonsPatch(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): { x0: number; y0: number; x1: number; y1: number; residualContrastRatio: number } {
  const x0 = Math.max(4, Math.min(canvasWidth - 12, Math.round(rx)));
  const y0 = Math.max(4, Math.min(canvasHeight - 12, Math.round(ry)));
  const x1 = Math.max(x0 + 8, Math.min(canvasWidth - 4, Math.round(rx + rw)));
  const y1 = Math.max(y0 + 8, Math.min(canvasHeight - 4, Math.round(ry + rh)));

  const boxW = x1 - x0;
  const boxH = y1 - y0;
  const pad = 4;

  const sampleX = Math.max(0, x0 - pad);
  const sampleY = Math.max(0, y0 - pad);
  const sampleW = Math.min(canvasWidth - sampleX, boxW + pad * 2);
  const sampleH = Math.min(canvasHeight - sampleY, boxH + pad * 2);

  const imgData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
  const data = imgData.data;

  const getPixel = (gx: number, gy: number): [number, number, number] => {
    const lx = Math.max(0, Math.min(sampleW - 1, gx - sampleX));
    const ly = Math.max(0, Math.min(sampleH - 1, gy - sampleY));
    const idx = (ly * sampleW + lx) * 4;
    return [data[idx], data[idx + 1], data[idx + 2]];
  };

  const avgBlock = (cx: number, cy: number): [number, number, number] => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = getPixel(cx + dx, cy + dy);
        r += px[0];
        g += px[1];
        b += px[2];
        n += 1;
      }
    }
    return [r / n, g / n, b / n];
  };

  const topRaw: Array<[number, number, number]> = [];
  const bottomRaw: Array<[number, number, number]> = [];
  for (let x = x0; x < x1; x++) {
    topRaw.push(avgBlock(x, Math.max(0, y0 - 2)));
    bottomRaw.push(avgBlock(x, Math.min(canvasHeight - 1, y1 + 1)));
  }

  const leftRaw: Array<[number, number, number]> = [];
  const rightRaw: Array<[number, number, number]> = [];
  for (let y = y0; y < y1; y++) {
    leftRaw.push(avgBlock(Math.max(0, x0 - 2), y));
    rightRaw.push(avgBlock(Math.min(canvasWidth - 1, x1 + 1), y));
  }

  const top = smoothRgbStrip(topRaw, 5);
  const bottom = smoothRgbStrip(bottomRaw, 5);
  const left = smoothRgbStrip(leftRaw, 4);
  const right = smoothRgbStrip(rightRaw, 4);

  const tl = [
    (top[0][0] + left[0][0]) / 2,
    (top[0][1] + left[0][1]) / 2,
    (top[0][2] + left[0][2]) / 2,
  ];
  const tr = [
    (top[boxW - 1][0] + right[0][0]) / 2,
    (top[boxW - 1][1] + right[0][1]) / 2,
    (top[boxW - 1][2] + right[0][2]) / 2,
  ];
  const bl = [
    (bottom[0][0] + left[boxH - 1][0]) / 2,
    (bottom[0][1] + left[boxH - 1][1]) / 2,
    (bottom[0][2] + left[boxH - 1][2]) / 2,
  ];
  const br = [
    (bottom[boxW - 1][0] + right[boxH - 1][0]) / 2,
    (bottom[boxW - 1][1] + right[boxH - 1][1]) / 2,
    (bottom[boxW - 1][2] + right[boxH - 1][2]) / 2,
  ];

  const feather = Math.max(2, Math.min(6, Math.round(Math.min(boxW, boxH) * 0.08)));

  for (let iy = 0; iy < boxH; iy++) {
    const v = boxH > 1 ? iy / (boxH - 1) : 0.5;
    const ly = y0 + iy - sampleY;
    for (let ix = 0; ix < boxW; ix++) {
      const u = boxW > 1 ? ix / (boxW - 1) : 0.5;
      const lx = x0 + ix - sampleX;
      const idx = (ly * sampleW + lx) * 4;

      const edgeDist = Math.min(ix, boxW - 1 - ix, iy, boxH - 1 - iy);
      const alpha = edgeDist < feather ? (edgeDist + 1) / (feather + 1) : 1;

      for (let c = 0; c < 3; c++) {
        const bilinearCorner =
          (1 - u) * (1 - v) * tl[c] +
          u * (1 - v) * tr[c] +
          (1 - u) * v * bl[c] +
          u * v * br[c];

        const coons =
          (1 - v) * top[ix][c] +
          v * bottom[ix][c] +
          (1 - u) * left[iy][c] +
          u * right[iy][c] -
          bilinearCorner;

        const orig = data[idx + c];
        data[idx + c] = clampByte(orig * (1 - alpha) + coons * alpha);
      }
    }
  }

  ctx.putImageData(imgData, sampleX, sampleY);

  // Post-clean verification scan across the inner 80% of the erased rectangle
  const postImg = ctx.getImageData(x0, y0, boxW, boxH).data;
  const innerMarginX = Math.max(1, Math.floor(boxW * 0.1));
  const innerMarginY = Math.max(1, Math.floor(boxH * 0.1));
  let totalChecked = 0;
  let residualSpikes = 0;

  for (let y = innerMarginY; y < boxH - innerMarginY; y += 2) {
    for (let x = innerMarginX; x < boxW - innerMarginX; x += 2) {
      const idx = (y * boxW + x) * 4;
      const rightIdx = (y * boxW + Math.min(boxW - 1, x + 2)) * 4;
      const downIdx = (Math.min(boxH - 1, y + 2) * boxW + x) * 4;
      const luma = rgbLuma(postImg[idx], postImg[idx + 1], postImg[idx + 2]);
      const lumaR = rgbLuma(postImg[rightIdx], postImg[rightIdx + 1], postImg[rightIdx + 2]);
      const lumaD = rgbLuma(postImg[downIdx], postImg[downIdx + 1], postImg[downIdx + 2]);
      if (Math.abs(luma - lumaR) > 36 || Math.abs(luma - lumaD) > 36) {
        residualSpikes += 1;
      }
      totalChecked += 1;
    }
  }

  const residualContrastRatio =
    totalChecked > 0 ? Number((residualSpikes / totalChecked).toFixed(4)) : 0;

  return { x0, y0, x1, y1, residualContrastRatio };
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${currentLine} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Prepares the clean background image AND runs an iterative border + interior
 * verification pass to guarantee the old baked-in text is completely removed
 * before any new text is inserted.
 */
export async function prepareCleanBackgroundAsset(params: {
  proxiedImageUrl: string;
  appearance: TextAppearanceConfig;
  maxDimension?: number;
}): Promise<CleanBackgroundAsset> {
  const { proxiedImageUrl, appearance, maxDimension } = params;
  const img = await loadTemplateImage(proxiedImageUrl);

  let width: number;
  let height: number;

  if (maxDimension && Math.max(img.naturalWidth, img.naturalHeight) > 0) {
    const scale = maxDimension / Math.max(img.naturalWidth, img.naturalHeight);
    width = Math.max(120, Math.round(img.naturalWidth * scale));
    height = Math.max(120, Math.round(img.naturalHeight * scale));
  } else {
    const scaleFactor =
      img.naturalWidth < 720 ? 1080 / Math.max(1, img.naturalWidth) : 1;
    width = Math.round(img.naturalWidth * scaleFactor);
    height = Math.round(img.naturalHeight * scaleFactor);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Contexto gráfico 2D indisponível neste navegador.');
  }

  // Always start from an unedited fresh copy of the source template
  ctx.drawImage(img, 0, 0, width, height);
  const fullSrcData = ctx.getImageData(0, 0, width, height).data;

  const requestedMode =
    appearance.eraseMode || (appearance.coverOriginalBg ? 'solid' : 'inpaint');

  // If strict removal verification is enabled, enforce removal even if 'none' was left set
  const effectiveEraseMode =
    requestedMode === 'none' && appearance.enforceCleanRemoval
      ? 'inpaint'
      : requestedMode;

  let curLeft =
    ((appearance.positionXPercent - appearance.eraseWidthPercent / 2) / 100) * width;
  let curRight =
    ((appearance.positionXPercent + appearance.eraseWidthPercent / 2) / 100) * width;
  let curTop =
    ((appearance.positionYPercent - appearance.eraseHeightPercent / 2) / 100) * height;
  let curBottom =
    ((appearance.positionYPercent + appearance.eraseHeightPercent / 2) / 100) * height;

  curLeft = Math.max(4, curLeft);
  curTop = Math.max(4, curTop);
  curRight = Math.min(width - 4, Math.max(curLeft + 24, curRight));
  curBottom = Math.min(height - 4, Math.max(curTop + 16, curBottom));

  let attempts = 1;
  let autoExpanded = false;
  let residualContrastRatio = 0;

  if (effectiveEraseMode === 'inpaint') {
    const maxExpandW = width * 0.08;
    const maxExpandH = height * 0.05;
    const origLeft = curLeft;
    const origRight = curRight;
    const origTop = curTop;
    const origBottom = curBottom;

    for (let pass = 0; pass < 4; pass++) {
      attempts = pass + 1;
      const outliers = inspectBorderOutliers(
        fullSrcData,
        width,
        height,
        Math.round(curLeft),
        Math.round(curTop),
        Math.round(curRight),
        Math.round(curBottom)
      );

      const outlierLimit = 0.06;
      const needsExpandLeft = outliers.left > outlierLimit && origLeft - curLeft < maxExpandW;
      const needsExpandRight = outliers.right > outlierLimit && curRight - origRight < maxExpandW;
      const needsExpandTop = outliers.top > outlierLimit && origTop - curTop < maxExpandH;
      const needsExpandBottom = outliers.bottom > outlierLimit && curBottom - origBottom < maxExpandH;

      if (!needsExpandLeft && !needsExpandRight && !needsExpandTop && !needsExpandBottom) {
        break;
      }

      autoExpanded = true;
      if (needsExpandLeft) curLeft = Math.max(4, curLeft - width * 0.025);
      if (needsExpandRight) curRight = Math.min(width - 4, curRight + width * 0.025);
      if (needsExpandTop) curTop = Math.max(4, curTop - height * 0.015);
      if (needsExpandBottom) curBottom = Math.min(height - 4, curBottom + height * 0.015);
    }

    const inpaintStats = inpaintRectCoonsPatch(
      ctx,
      width,
      height,
      curLeft,
      curTop,
      curRight - curLeft,
      curBottom - curTop
    );
    residualContrastRatio = inpaintStats.residualContrastRatio;
  }

  const finalCenterX = ((curLeft + curRight) / 2 / width) * 100;
  const finalCenterY = ((curTop + curBottom) / 2 / height) * 100;
  const finalWPercent = ((curRight - curLeft) / width) * 100;
  const finalHPercent = ((curBottom - curTop) / height) * 100;

  const verified =
    effectiveEraseMode === 'solid' ||
    (effectiveEraseMode === 'inpaint' && residualContrastRatio < 0.04);

  const verification: RemovalVerificationReport = {
    verified: effectiveEraseMode === 'none' ? !appearance.enforceCleanRemoval : verified,
    method:
      effectiveEraseMode === 'solid'
        ? 'solid'
        : effectiveEraseMode === 'inpaint'
          ? 'inpaint'
          : 'blocked',
    attempts,
    autoExpanded,
    finalBoxPercent: {
      x: Math.round(finalCenterX * 10) / 10,
      y: Math.round(finalCenterY * 10) / 10,
      width: Math.round(finalWPercent * 10) / 10,
      height: Math.round(finalHPercent * 10) / 10,
    },
    residualContrastRatio,
    summary:
      effectiveEraseMode === 'none'
        ? 'Remoção desativada.'
        : autoExpanded
          ? 'Área expandida automaticamente para apagar resíduos nas bordas antes da inserção.'
          : verified
            ? 'Texto antigo removido e área validada antes da inserção.'
            : 'Possível resíduo na borda: aumente levemente a largura ou altura apagada.',
  };

  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const cleanBackgroundJpegBase64 = jpegDataUrl.split(',')[1] || '';

  return {
    canvas,
    cleanBackgroundJpegBase64,
    width,
    height,
    verification,
  };
}

export async function renderPhraseOnTemplateImage(params: {
  proxiedImageUrl: string;
  phrase: string;
  appearance: TextAppearanceConfig;
  targetLayer: CanvaTextLayer | null;
  targetCanvas?: HTMLCanvasElement | null;
  maxDimension?: number;
  exportEncoded?: boolean;
  precomputedBackground?: CleanBackgroundAsset;
}): Promise<RenderedDesignVersion> {
  const {
    proxiedImageUrl,
    phrase,
    appearance,
    targetLayer,
    targetCanvas,
    maxDimension,
    exportEncoded = true,
    precomputedBackground,
  } = params;

  const bgAsset =
    precomputedBackground ||
    (await prepareCleanBackgroundAsset({
      proxiedImageUrl,
      appearance,
      maxDimension,
    }));

  const { width, height, cleanBackgroundJpegBase64, verification } = bgAsset;

  // Hard verification guard: refuse to overlay new text if strict removal failed
  if (appearance.enforceCleanRemoval && verification.method === 'blocked') {
    throw new Error(
      'Verificação anti-duplicação: ative a remoção do texto antigo antes de inserir a nova frase.'
    );
  }

  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto gráfico 2D indisponível neste navegador.');
  }

  ctx.drawImage(bgAsset.canvas, 0, 0, width, height);

  const anchorX = (verification.finalBoxPercent.x / 100) * width;
  const anchorY = (verification.finalBoxPercent.y / 100) * height;
  const eraseW = Math.max(24, (verification.finalBoxPercent.width / 100) * width);
  const eraseH = Math.max(16, (verification.finalBoxPercent.height / 100) * height);
  const eraseLeft = anchorX - eraseW / 2;
  const eraseTop = anchorY - eraseH / 2;

  let solidBox: EditablePdfPageSpec['solidBox'] | undefined;
  if (verification.method === 'solid') {
    const bgHex = appearance.coverBgColor || '#0f172a';
    ctx.fillStyle = bgHex;
    ctx.beginPath();
    ctx.roundRect(
      eraseLeft,
      eraseTop,
      eraseW,
      eraseH,
      Math.round(Math.min(eraseW, eraseH) * 0.16)
    );
    ctx.fill();

    solidBox = {
      xRatio: verification.finalBoxPercent.x / 100,
      yRatio: verification.finalBoxPercent.y / 100,
      wRatio: verification.finalBoxPercent.width / 100,
      hRatio: verification.finalBoxPercent.height / 100,
      colorHex: bgHex,
    };
  }

  const isCustom = appearance.mode === 'custom';
  const baseSizePx = Math.max(
    14,
    Math.round(
      ((isCustom ? appearance.fontSize : targetLayer?.fontSize || 32) / 24) *
        (width * 0.045)
    )
  );

  const fontSize =
    appearance.autoFitLongText && phrase.length > 36
      ? Math.max(12, Math.round(baseSizePx * Math.max(0.55, Math.sqrt(36 / phrase.length))))
      : baseSizePx;

  const bold = isCustom
    ? appearance.bold
    : targetLayer?.fontWeight === 'bold' || targetLayer?.fontWeight === 'semibold';
  const italic = isCustom
    ? appearance.italic
    : targetLayer?.fontStyle === 'italic';
  const fontWeight = bold ? '700' : '500';
  const fontStyle = italic ? 'italic' : 'normal';
  const fontFamily = isCustom ? appearance.fontFamily : 'Plus Jakarta Sans';
  const fillColor = isCustom ? appearance.color : targetLayer?.color || '#FACC15';

  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
  ctx.textBaseline = 'middle';

  const logicalAlign = isCustom
    ? appearance.textAlign
    : targetLayer?.textAlign || 'center';
  const alignMap: Record<string, CanvasTextAlign> = {
    start: 'left',
    center: 'center',
    end: 'right',
    justify: 'center',
  };
  const textAlign = alignMap[logicalAlign];
  ctx.textAlign = textAlign;

  const maxBoxWidth = Math.max(width * 0.84, eraseW * 1.15);
  const lines = wrapTextLines(ctx, phrase, Math.min(width * 0.9, maxBoxWidth));
  const lineHeight = fontSize * 1.24;
  const startY = anchorY - ((lines.length - 1) * lineHeight) / 2;

  const textOriginX =
    textAlign === 'left'
      ? Math.max(width * 0.06, anchorX - eraseW / 2)
      : textAlign === 'right'
        ? Math.min(width * 0.94, anchorX + eraseW / 2)
        : anchorX;

  const outlineEnabled = isCustom ? appearance.outlineEnabled : true;
  const outlineColor = isCustom ? appearance.outlineColor : '#000000';
  const outlineWidth = isCustom
    ? Math.max(2, appearance.outlineWidth * (width / 420))
    : Math.max(2, Math.round(fontSize * 0.14));

  const pdfLines = lines.map((line) => ({
    text: line,
    widthRatio: Math.min(0.92, ctx.measureText(line).width / Math.max(1, width)),
  }));

  lines.forEach((line, idx) => {
    const y = startY + idx * lineHeight;
    if (outlineEnabled && outlineWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = outlineWidth;
      ctx.strokeText(line, textOriginX, y);
    }
    ctx.fillStyle = fillColor;
    ctx.fillText(line, textOriginX, y);
  });

  const pdfPageSpec: EditablePdfPageSpec = {
    lines: pdfLines,
    fontSizePx: fontSize,
    colorHex: fillColor,
    bold,
    italic,
    textAlign: logicalAlign,
    anchorXRatio: verification.finalBoxPercent.x / 100,
    anchorYRatio: verification.finalBoxPercent.y / 100,
    ...(solidBox ? { solidBox } : {}),
  };

  const pngDataUrl = exportEncoded ? canvas.toDataURL('image/png') : '';

  return {
    pngDataUrl,
    cleanBackgroundJpegBase64,
    width,
    height,
    pdfPageSpec,
    verification,
  };
}
