/**
 * [start, end) の octet の範囲。start は含み、end は含まない。
 * 位置は file の先頭から数える（.warc.gz では、解いた後の流れの先頭から）。
 */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** 範囲の octet の数。 */
export const spanLength = (span: Span): number => span.end - span.start;

/**
 * children が parent を、隙間も重なりも無く、前から順に覆っているか。
 *
 * byte の地図の芯の約束（親の範囲は、子の範囲を並べた物にちょうど等しい）を言う。
 * 長さ 0 の子（空の値など）は、覆いの途中に挟まってよい。
 */
export const tiles = (parent: Span, children: readonly Span[]): boolean => {
  let cursor = parent.start;
  for (const child of children) {
    if (child.start !== cursor || child.end < child.start) return false;
    cursor = child.end;
  }
  return cursor === parent.end;
};
