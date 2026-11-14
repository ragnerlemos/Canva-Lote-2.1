import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import type { OverlayPageItem, TextOverlayStyle } from '../types/canva';

export interface PptxBuildResult {
  blob: Blob;
  slideCount: number;
  embeddedVideoCount: number;
  editableTextCount: number;
  verifiedOutlineSlides: number;
}

function normalizeHex6(hex: string, fallback = 'FFFFFF'): string {
  const clean = (hex || '').replace('#', '').trim().toUpperCase();
  return /^[0-9A-F]{6}$/.test(clean) ? clean : fallback;
}

async function blobToBase64DataUrl(blob: Blob, fallbackMime: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = blob.type || fallbackMime;
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function urlToJpegDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await blobToBase64DataUrl(blob, blob.type || 'image/png');
  } catch {
    return undefined;
  }
}

function resolveSlideDimensionsInches(
  widthPx?: number,
  heightPx?: number
): { w: number; h: number } {
  const w = widthPx && widthPx > 0 ? widthPx : 1080;
  const h = heightPx && heightPx > 0 ? heightPx : 1920;
  const maxSide = 10;
  if (h >= w) {
    return {
      w: Number(((w / h) * maxSide).toFixed(3)),
      h: maxSide,
    };
  }
  return {
    w: maxSide,
    h: Number(((h / w) * maxSide).toFixed(3)),
  };
}

function mapTextAlign(align: TextOverlayStyle['textAlign']): 'left' | 'center' | 'right' | 'justify' {
  if (align === 'start') return 'left';
  if (align === 'end') return 'right';
  if (align === 'justify') return 'justify';
  return 'center';
}

/**
 * Ensures every <a:rPr> inside the overlay text shape contains a genuine OOXML
 * character outline (<a:ln ...><a:solidFill><a:srgbClr val="..."/></a:solidFill><a:round/></a:ln>)
 * right before <a:solidFill> per ECMA-376 CT_TextCharacterProperties element ordering.
 */
function ensureCharacterOutlineInSlideXml(
  slideXml: string,
  outlineColorHex: string,
  outlineWidthPx: number
): { xml: string; applied: boolean } {
  const targetMarker = 'name="CanvaLoteOverlayText"';
  const markerIdx = slideXml.indexOf(targetMarker);
  if (markerIdx === -1) {
    return { xml: slideXml, applied: false };
  }

  const spStart = slideXml.lastIndexOf('<p:sp', markerIdx);
  const spEnd = slideXml.indexOf('</p:sp>', markerIdx);
  if (spStart === -1 || spEnd === -1) {
    return { xml: slideXml, applied: false };
  }

  const beforeSp = slideXml.slice(0, spStart);
  const spBlock = slideXml.slice(spStart, spEnd + '</p:sp>'.length);
  const afterSp = slideXml.slice(spEnd + '</p:sp>'.length);

  // Convert UI outline px (1..12) to PowerPoint EMU stroke width (1 pt = 12700 EMU)
  const ptStroke = Math.max(0.75, Math.min(6, outlineWidthPx * 0.55));
  const emuWidth = Math.round(ptStroke * 12700);
  const lnXml = `<a:ln w="${emuWidth}" cap="rnd" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="${outlineColorHex}"/></a:solidFill><a:round/></a:ln>`;

  let patchedAny = false;
  // Remove any malformed/duplicate <a:ln> inside <a:rPr> then inject clean <a:ln> as first child
  const updatedSp = spBlock.replace(
    /<a:rPr([^>]*)>([\s\S]*?)<\/a:rPr>/g,
    (_full, attrs: string, inner: string) => {
      patchedAny = true;
      const cleanedInner = inner.replace(/<a:ln[\s\S]*?<\/a:ln>/g, '');
      return `<a:rPr${attrs}>${lnXml}${cleanedInner}</a:rPr>`;
    }
  );

  return {
    xml: beforeSp + updatedSp + afterSp,
    applied: patchedAny,
  };
}

/**
 * Guarantees every <p:cNvPr id="..."> on a slide has a strictly unique positive integer ID
 * (1 for the root group shape, then 2, 3, 4... sequentially for videos, images, and text boxes).
 */
function normalizeSlideShapeIds(slideXml: string): string {
  let nextId = 1;
  return slideXml.replace(
    /<p:cNvPr\b([^>]*?)\bid="[^"]*"([^>]*)>/g,
    (_full, before: string, after: string) => {
      const assigned = nextId;
      nextId += 1;
      return `<p:cNvPr${before}id="${assigned}"${after}>`;
    }
  );
}

export interface BuildPptxOptions {
  projectTitle: string;
  includeVideos: boolean;
  onProgress?: (current: number, total: number, label: string) => void;
}

/**
 * Generates an editable PowerPoint (.pptx) presentation containing:
 * - Clean video elements embedded on each slide (when includeVideos=true and video bytes exist)
 * - Independent editable text boxes with font, size, color, alignment, line spacing, and real OOXML character outline
 */
export async function buildEditableOverlayPptx(
  pages: OverlayPageItem[],
  options: BuildPptxOptions
): Promise<PptxBuildResult> {
  if (pages.length === 0) {
    throw new Error('Nenhuma página disponível para exportar em PPTX.');
  }

  const first = pages[0];
  const { w: slideW, h: slideH } = resolveSlideDimensionsInches(
    first.width,
    first.height
  );

  const pptx = new PptxGenJS();
  pptx.title = options.projectTitle || 'Canva Lote 2.0';
  pptx.subject = 'Vídeos limpos com sobreposição de texto editável';
  pptx.author = 'Canva Lote 2.0';
  pptx.defineLayout({ name: 'CANVA_LOTE_CUSTOM', width: slideW, height: slideH });
  pptx.layout = 'CANVA_LOTE_CUSTOM';

  let embeddedVideoCount = 0;
  let editableTextCount = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    options.onProgress?.(
      i + 1,
      pages.length,
      `Montando slide ${i + 1} de ${pages.length}...`
    );

    const slide = pptx.addSlide();
    slide.background = { color: '0F172A' };

    const posterDataUrl = page.imageBlob
      ? await blobToBase64DataUrl(page.imageBlob, page.imageBlob.type || 'image/png')
      : page.thumbnailUrl
        ? page.thumbnailUrl.startsWith('data:')
          ? page.thumbnailUrl
          : await urlToJpegDataUrl(page.thumbnailUrl)
        : undefined;

    let addedVideo = false;
    if (options.includeVideos) {
      let videoBlob = page.videoBlob;
      if (!videoBlob && page.videoUrl) {
        try {
          const resp = await fetch(page.videoUrl, { credentials: 'include' });
          if (resp.ok) {
            videoBlob = await resp.blob();
          }
        } catch {
          // Fallback to poster thumbnail below if video stream could not be fetched
        }
      }

      if (videoBlob && videoBlob.size > 0) {
        const videoDataUrl = await blobToBase64DataUrl(videoBlob, 'video/mp4');
        slide.addMedia({
          type: 'video',
          data: videoDataUrl,
          extn: 'mp4',
          ...(posterDataUrl ? { cover: posterDataUrl } : {}),
          x: 0,
          y: 0,
          w: slideW,
          h: slideH,
          objectName: `CanvaLoteVideo_${page.pageNumber}`,
        });
        addedVideo = true;
        embeddedVideoCount += 1;
      }
    }

    if (!addedVideo && posterDataUrl) {
      slide.addImage({
        data: posterDataUrl,
        x: 0,
        y: 0,
        w: slideW,
        h: slideH,
        objectName: `CanvaLoteBackground_${page.pageNumber}`,
      });
    }

    const phrase = page.phrase.trim();
    if (phrase) {
      const style = page.style;
      const boxWInches = Number(
        Math.max(1.5, (style.boxWidthPercent / 100) * slideW).toFixed(3)
      );
      const boxHInches = Number(Math.max(1.1, slideH * 0.34).toFixed(3));
      const rawX = (style.positionXPercent / 100) * slideW - boxWInches / 2;
      const rawY = (style.positionYPercent / 100) * slideH - boxHInches / 2;
      const xInches = Number(
        Math.max(0.15, Math.min(slideW - boxWInches - 0.15, rawX)).toFixed(3)
      );
      const yInches = Number(
        Math.max(0.15, Math.min(slideH - boxHInches - 0.15, rawY)).toFixed(3)
      );

      // Scale UI font size cleanly to inches-based slide dimensions
      const scaledPt = Math.max(
        10,
        Math.min(120, Math.round(style.fontSize * (slideW / 6.2)))
      );

      slide.addText(phrase, {
        x: xInches,
        y: yInches,
        w: boxWInches,
        h: boxHInches,
        fontFace: style.fontFamily || 'Plus Jakarta Sans',
        fontSize: scaledPt,
        color: normalizeHex6(style.color, 'FFFFFF'),
        bold: style.bold,
        italic: style.italic,
        align: mapTextAlign(style.textAlign),
        valign: 'middle',
        lineSpacingMultiple: Math.max(0.85, Math.min(2.2, style.lineHeight)),
        margin: 0,
        wrap: true,
        isTextBox: true,
        objectName: 'CanvaLoteOverlayText',
      });
      editableTextCount += 1;
    }
  }

  options.onProgress?.(
    pages.length,
    pages.length,
    'Verificando contornos e estrutura editável do PPTX...'
  );

  const rawArrayBuffer = (await pptx.write({
    outputType: 'arraybuffer',
  })) as ArrayBuffer;

  const zip = await JSZip.loadAsync(rawArrayBuffer);
  let verifiedOutlineSlides = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const slidePath = `ppt/slides/slide${i + 1}.xml`;
    const file = zip.file(slidePath);
    if (!file) continue;

    let xml = await file.async('string');
    xml = normalizeSlideShapeIds(xml);

    if (page.phrase.trim() && page.style.outlineEnabled) {
      const outlineHex = normalizeHex6(page.style.outlineColor, '000000');
      const patched = ensureCharacterOutlineInSlideXml(
        xml,
        outlineHex,
        page.style.outlineWidth
      );
      xml = patched.xml;
      if (patched.applied) {
        verifiedOutlineSlides += 1;
      }
    }

    zip.file(slidePath, xml);
  }

  // Ensure Content_Types explicitly registers mp4 when videos are embedded
  if (embeddedVideoCount > 0) {
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      const ctXml = await ctFile.async('string');
      if (!ctXml.includes('Extension="mp4"')) {
        const updatedCt = ctXml.replace(
          '</Types>',
          '<Default Extension="mp4" ContentType="video/mp4"/></Types>'
        );
        zip.file('[Content_Types].xml', updatedCt);
      }
    }
  }

  const finalBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const blob = new Blob([new Uint8Array(finalBytes)], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });

  return {
    blob,
    slideCount: pages.length,
    embeddedVideoCount,
    editableTextCount,
    verifiedOutlineSlides,
  };
}
