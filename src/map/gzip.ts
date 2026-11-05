/**
 * .warc.gz（gzip の member を並べた file）を解き、member ごとに 2 つの範囲を返す。
 * 圧縮した file の中の範囲と、解いた流れの中の範囲。WARC の地図は、解いた流れの上に作る。
 *
 * - 1 回目: fflate の流して解く Gunzip に通し、onmember が知らせる member の頭を集める。
 *   最初の member の頭（0）は知らせない（2026-11-05 に hello-world.warc.gz で確かめた）
 * - 2 回目: member を 1 つずつ切り出して gunzipSync で解き、解いた長さを足して、解いた流れの
 *   側の境目を出す。member は 1 つずつが正しい gzip なので、こう切れる。callback の順番には頼らない
 *
 * WARC 1.1 の Annex D は 1 record 1 member を勧めるだけなので、1 つの member に record が
 * いくつあっても、record が member をまたいでも、そのまま読む。
 */
import { Gunzip, gunzipSync } from "fflate";
import type { Span } from "./span.ts";

export interface MemberMap {
  /** file の中の順番（0 から）。 */
  readonly index: number;
  /** 圧縮した file の中の範囲（gzip の header・deflate の本体・trailer）。 */
  readonly compressed: Span;
  /** 解いた流れの中の範囲。 */
  readonly inflated: Span;
}

export interface Inflated {
  /** 解いた流れ（解けた member の分だけ）。 */
  readonly bytes: Uint8Array;
  readonly members: readonly MemberMap[];
  /** 途中で止まったとき: どの member で、なぜ。 */
  readonly error?: { readonly kind: "corrupt" | "too-large"; readonly member: Span; readonly message: string };
}

export const isGzip = (bytes: Uint8Array): boolean => bytes[0] === 0x1f && bytes[1] === 0x8b;

/** member の頭の位置。壊れた所に来たら、そこまでに知らされた分だけを返す（壊れた member は 2 回目で分かる）。 */
const memberStarts = (bytes: Uint8Array): number[] => {
  const starts = [0];
  const stream = new Gunzip(() => undefined);
  stream.onmember = (offset) => {
    starts.push(offset);
  };
  try {
    stream.push(bytes, true);
  } catch {
    // 壊れた member の頭までは starts に在る
  }
  return starts;
};

/** member の trailer の ISIZE（解いた長さを 2^32 で割った余り。little endian）。 */
const isize = (bytes: Uint8Array, member: Span): number => {
  const at = member.end - 4;
  return at < member.start ? 0 : ((bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16) | ((bytes[at + 3] ?? 0) << 24)) >>> 0;
};

const join = (parts: readonly Uint8Array[], length: number): Uint8Array => {
  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/**
 * gzip の file を、member ごとに解く。limit を越える長さに解ける file は、解く前に断る
 * （member の trailer の ISIZE を足して見積もる）。
 */
export const gunzipMembers = (bytes: Uint8Array, limit = Number.POSITIVE_INFINITY): Inflated => {
  const starts = memberStarts(bytes);
  const spans = starts.map((start, i): Span => ({ start, end: starts[i + 1] ?? bytes.length }));
  const estimate = spans.reduce((n, member) => n + isize(bytes, member), 0);
  if (estimate > limit) {
    return { bytes: new Uint8Array(), members: [], error: { kind: "too-large", member: { start: 0, end: bytes.length }, message: String(estimate) } };
  }

  const parts: Uint8Array[] = [];
  const members: MemberMap[] = [];
  let inflatedAt = 0;
  for (const [index, compressed] of spans.entries()) {
    let out: Uint8Array;
    try {
      out = gunzipSync(bytes.subarray(compressed.start, compressed.end));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { bytes: join(parts, inflatedAt), members, error: { kind: "corrupt", member: compressed, message } };
    }
    members.push({ index, compressed, inflated: { start: inflatedAt, end: inflatedAt + out.length } });
    parts.push(out);
    inflatedAt += out.length;
  }
  return { bytes: join(parts, inflatedAt), members };
};
