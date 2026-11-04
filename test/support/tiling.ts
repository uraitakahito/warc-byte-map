import { partTree, type PartNode } from "../../src/map/parts.ts";
import { tiles, type Span } from "../../src/map/span.ts";
import type { WarcMap } from "../../src/map/types.ts";

/**
 * byte の地図の芯の約束が破れている所を、読める文で並べる（空なら約束どおり）。
 *
 * - record と rest が、file を前から順に覆う
 * - 部分の木（partTree）のどの節も、子の範囲を並べると自分の範囲になる
 * - 問題の在り処は file の中に在る
 */
export const tilingViolations = (map: WarcMap, length: number): string[] => {
  const out: string[] = [];
  const check = (what: string, parent: Span, children: readonly Span[]): void => {
    if (!tiles(parent, children)) out.push(`${what}: ${JSON.stringify(parent)} ← ${JSON.stringify(children)}`);
  };
  const walk = (at: string, node: PartNode): void => {
    if (node.children.length === 0) return;
    check(`${at} ${node.id}`, node.span, node.children.map((c) => c.span));
    for (const child of node.children) walk(at, child);
  };
  check("file", { start: 0, end: length }, [...map.records.map((r) => r.record), ...(map.rest === undefined ? [] : [map.rest])]);
  for (const r of map.records) walk(`record ${String(r.index)}`, partTree(r));
  for (const p of [...map.problems, ...map.records.flatMap((r) => r.problems)]) {
    if (p.span.start < 0 || p.span.end < p.span.start || p.span.end > length) out.push(`problem ${p.code}: ${JSON.stringify(p.span)}`);
  }
  return out;
};
