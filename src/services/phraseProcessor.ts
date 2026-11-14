import type { BatchPhraseItem } from '../types/canva';

export interface PhraseAnalysis {
  validPhrases: BatchPhraseItem[];
  emptyLinesCount: number;
  totalRawLines: number;
}

export function analyzePhrases(rawText: string): PhraseAnalysis {
  if (!rawText) {
    return { validPhrases: [], emptyLinesCount: 0, totalRawLines: 0 };
  }

  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const validPhrases: BatchPhraseItem[] = [];
  let emptyLinesCount = 0;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      emptyLinesCount += 1;
    } else {
      validPhrases.push({
        id: `phrase-${idx}-${trimmed.slice(0, 12)}`,
        lineNumber: idx + 1,
        text: trimmed,
      });
    }
  });

  return {
    validPhrases,
    emptyLinesCount,
    totalRawLines: lines.length,
  };
}

export function removeEmptyLines(rawText: string): string {
  return rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

export function parseImportedFileText(content: string, filename: string): string {
  const normalized = content.replace(/\r\n/g, '\n');
  const isCsv = filename.toLowerCase().endsWith('.csv');

  if (!isCsv) {
    return removeEmptyLines(normalized);
  }

  // Parse first column of each CSV row cleanly, stripping surrounding quotes
  const rows = normalized
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const match = row.match(/^"((?:[^"]|"")*)"|([^,;]+)/);
      const cell = match ? (match[1] ?? match[2] ?? '') : row;
      return cell.replace(/""/g, '"').trim();
    })
    .filter(Boolean);

  return rows.join('\n');
}
