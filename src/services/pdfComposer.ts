export interface EditablePdfTextLine {
  text: string;
  widthRatio: number; // fraction of page width (0..1)
}

export interface EditablePdfPageSpec {
  lines: EditablePdfTextLine[];
  fontSizePx: number;
  colorHex: string;
  bold: boolean;
  italic: boolean;
  textAlign: 'start' | 'center' | 'end' | 'justify';
  anchorXRatio: number; // 0..1
  anchorYRatio: number; // 0..1 from top
  solidBox?: {
    xRatio: number;
    yRatio: number;
    wRatio: number;
    hRatio: number;
    colorHex: string;
  };
}

function hexToPdfRgb(hex: string): string {
  const clean = (hex || '#facc15').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return '0.980 0.800 0.082';
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

/**
 * Encodes Unicode text to WinAnsi (ISO-8859-1 subset) and escapes PDF string delimiters.
 */
function encodeWinAnsiPdfLiteral(input: string): string {
  const normalized = input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...');

  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    let ch: string;
    if (code >= 0x20 && code <= 0xff) {
      ch = normalized[i];
    } else if (code === 0x09) {
      ch = ' ';
    } else {
      ch = '?';
    }
    if (ch === '\\' || ch === '(' || ch === ')') {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return `(${out})`;
}

/**
 * Builds a multi-layer, 1-or-more-page %PDF-1.4 document with:
 *  - Clean background JPEG Image XObject (/Im0, shared across all pages)
 *  - Real PDF vector Type1 Font text objects (BT ... Tf ... Tm ... Tj ET)
 * So Canva Connect POST /v1/imports parses the text as NATIVE EDITABLE TEXT LAYERS
 * sitting independently above the background image.
 */
export function buildEditableCanvaPdf(params: {
  backgroundJpegBytes: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  pages: EditablePdfPageSpec[];
}): Buffer {
  const { backgroundJpegBytes, pixelWidth, pixelHeight, pages } = params;
  const safePages = pages.length > 0 ? pages : [];
  if (safePages.length === 0) {
    throw new Error('Nenhuma página fornecida para montar o PDF editável.');
  }

  const scale = pixelWidth > 1440 ? 1440 / pixelWidth : 1;
  const ptWidth = Math.max(72, Math.round(pixelWidth * scale));
  const ptHeight = Math.max(72, Math.round(pixelHeight * scale));

  // Determine base font variant from first page (also support all 4 standard Helvetica variants)
  const chunks: Buffer[] = [];
  const offsets: number[] = [0];
  let byteLength = 0;

  const pushStr = (str: string) => {
    const buf = Buffer.from(str, 'latin1');
    chunks.push(buf);
    byteLength += buf.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    const buf = Buffer.from(bytes);
    chunks.push(buf);
    byteLength += buf.length;
  };

  pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Object 1: Catalog
  offsets.push(byteLength);
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages root
  const pageObjIds = safePages.map((_, idx) => 8 + idx * 2);
  offsets.push(byteLength);
  pushStr(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${safePages.length} >>\nendobj\n`
  );

  // Objects 3..6: 4 Helvetica variants with WinAnsiEncoding
  const fontVariants: Array<[number, string, string]> = [
    [3, 'F1', 'Helvetica'],
    [4, 'F2', 'Helvetica-Bold'],
    [5, 'F3', 'Helvetica-Oblique'],
    [6, 'F4', 'Helvetica-BoldOblique'],
  ];
  for (const [, , baseFont] of fontVariants) {
    offsets.push(byteLength);
    pushStr(
      `${offsets.length - 1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding >>\nendobj\n`
    );
  }

  // Object 7: Shared Background JPEG Image XObject (/Im0)
  offsets.push(byteLength);
  pushStr(
    `7 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${backgroundJpegBytes.length} >>\nstream\n`
  );
  pushBytes(backgroundJpegBytes);
  pushStr('\nendstream\nendobj\n');

  // Objects 8..: Page + Content stream pairs
  for (let idx = 0; idx < safePages.length; idx++) {
    const spec = safePages[idx];
    const pageObjId = 8 + idx * 2;
    const contentObjId = pageObjId + 1;

    // Page object
    offsets.push(byteLength);
    pushStr(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptWidth} ${ptHeight}] /Resources << /XObject << /Im0 7 0 R >> /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    // Content stream
    const streamParts: string[] = [];
    // Layer 1: Background image
    streamParts.push(`q\n${ptWidth} 0 0 ${ptHeight} 0 0 cm\n/Im0 Do\nQ\n`);

    // Layer 2: Optional solid vector cover box
    if (spec.solidBox) {
      const boxW = spec.solidBox.wRatio * ptWidth;
      const boxH = spec.solidBox.hRatio * ptHeight;
      const boxX = spec.solidBox.xRatio * ptWidth - boxW / 2;
      const boxYFromTop = spec.solidBox.yRatio * ptHeight - boxH / 2;
      const boxY = ptHeight - boxYFromTop - boxH;
      streamParts.push(
        `q\n${hexToPdfRgb(spec.solidBox.colorHex)} rg\n${boxX.toFixed(2)} ${boxY.toFixed(2)} ${boxW.toFixed(2)} ${boxH.toFixed(2)} re f\nQ\n`
      );
    }

    // Layer 3: Real PDF Editable Text Object(s)
    const fontKey =
      spec.bold && spec.italic
        ? 'F4'
        : spec.bold
          ? 'F2'
          : spec.italic
            ? 'F3'
            : 'F1';
    const fontSizePt = Math.max(8, Number((spec.fontSizePx * scale).toFixed(2)));
    const lineHeightPt = fontSizePt * 1.24;
    const anchorXPt = spec.anchorXRatio * ptWidth;
    const anchorYPtFromTop = spec.anchorYRatio * ptHeight;
    const rgbStr = hexToPdfRgb(spec.colorHex);

    const validLines = spec.lines.length > 0 ? spec.lines : [{ text: '', widthRatio: 0 }];
    const boxWidthRatio = spec.solidBox?.wRatio ?? 0.46;

    for (let li = 0; li < validLines.length; li++) {
      const line = validLines[li];
      if (!line.text) continue;
      const lineWidthPt = line.widthRatio * ptWidth;
      const yFromTop =
        anchorYPtFromTop - ((validLines.length - 1) * lineHeightPt) / 2 + li * lineHeightPt;
      const baselineY = Math.max(
        6,
        Math.min(ptHeight - fontSizePt * 0.5, ptHeight - yFromTop - fontSizePt * 0.34)
      );

      let startX = anchorXPt - lineWidthPt / 2;
      if (spec.textAlign === 'start') {
        startX = Math.max(ptWidth * 0.06, anchorXPt - (boxWidthRatio * ptWidth) / 2);
      } else if (spec.textAlign === 'end') {
        startX =
          Math.min(ptWidth * 0.94, anchorXPt + (boxWidthRatio * ptWidth) / 2) -
          lineWidthPt;
      }
      startX = Math.max(8, Math.min(ptWidth - 16, startX));

      streamParts.push(
        `BT\n/${fontKey} ${fontSizePt} Tf\n${rgbStr} rg\n0 Tr\n1 0 0 1 ${startX.toFixed(2)} ${baselineY.toFixed(2)} Tm\n${encodeWinAnsiPdfLiteral(line.text)} Tj\nET\n`
      );
    }

    const contentStream = streamParts.join('');
    const contentBuf = Buffer.from(contentStream, 'latin1');

    offsets.push(byteLength);
    pushStr(`${contentObjId} 0 obj\n<< /Length ${contentBuf.length} >>\nstream\n`);
    pushBytes(contentBuf);
    pushStr('endstream\nendobj\n');
  }

  // xref table
  const xrefOffset = byteLength;
  pushStr(`xref\n0 ${offsets.length}\n`);
  pushStr('0000000000 65535 f \n');
  for (let i = 1; i < offsets.length; i++) {
    pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }

  pushStr(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return Buffer.concat(chunks);
}
