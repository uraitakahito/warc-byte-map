import type { Span } from "../map/span.ts";

/**
 * hex の pane に描く範囲。record が長ければ、頭と尻だけを描く（間は「省いた」の行にする）。
 * 1 octet に 2 つの要素を作るので、画像の record のように大きな block を全部は描かない。
 */
export const visibleRanges = (record: Span, limit = 16 * 1024, tail = 4 * 1024): Span[] =>
  record.end - record.start <= limit
    ? [record]
    : [
        { start: record.start, end: record.start + limit - tail },
        { start: record.end - tail, end: record.end },
      ];

/** text の列に描く 1 文字。CR と LF と空白は記号で、印字できない octet は点で描く。 */
export const glyph = (b: number): string => {
  if (b === 0x0d) return "␍";
  if (b === 0x0a) return "␊";
  if (b === 0x20) return "·";
  if (b === 0x09) return "⇥";
  return b > 0x20 && b < 0x7f ? String.fromCharCode(b) : ".";
};

export const hex2 = (b: number): string => b.toString(16).padStart(2, "0");
