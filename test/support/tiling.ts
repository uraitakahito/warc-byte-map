import { tiles, type Span } from "../../src/map/span.ts";
import type { WarcMap } from "../../src/map/types.ts";

/**
 * byte の地図の芯の約束が破れている所を、読める文で並べる（空なら約束どおり）。
 *
 * - record と rest が、file を前から順に覆う
 * - record = header・block・separator、header = 版の行・欄の行・空行
 * - 欄の行 = 名前・コロン・空白・値・改行・折り返しの行、折り返しの行 = 字下げ・値・改行
 * - 問題の在り処は file の中に在る
 */
export const tilingViolations = (map: WarcMap, length: number): string[] => {
  const out: string[] = [];
  const check = (what: string, parent: Span, children: readonly Span[]): void => {
    if (!tiles(parent, children)) out.push(`${what}: ${JSON.stringify(parent)} ← ${JSON.stringify(children)}`);
  };
  check("file", { start: 0, end: length }, [...map.records.map((r) => r.record), ...(map.rest === undefined ? [] : [map.rest])]);
  for (const r of map.records) {
    const at = `record ${String(r.index)}`;
    check(at, r.record, [r.header, r.block, r.separator]);
    check(`${at} header`, r.header, [r.version.line, ...r.fields.map((f) => f.line), r.blank]);
    check(`${at} version`, r.version.line, [r.version.text, r.version.eol]);
    r.fields.forEach((f, i) => {
      const line = `${at} line ${String(i)}`;
      if (f.kind === "unreadable") {
        check(line, f.line, [f.content, f.eol]);
        return;
      }
      check(line, f.line, [f.name, f.colon, f.space, f.value, f.eol, ...f.folded.map((x) => x.line)]);
      f.folded.forEach((x, j) => {
        check(`${line} folded ${String(j)}`, x.line, [x.indent, x.value, x.eol]);
      });
    });
  }
  for (const p of [...map.problems, ...map.records.flatMap((r) => r.problems)]) {
    if (p.span.start < 0 || p.span.end < p.span.start || p.span.end > length) out.push(`problem ${p.code}: ${JSON.stringify(p.span)}`);
  }
  return out;
};
