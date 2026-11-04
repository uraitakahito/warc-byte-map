import type { Span } from "./span.ts";

export const CR = 0x0d;
export const LF = 0x0a;
export const SP = 0x20;
export const HT = 0x09;
export const COLON = 0x3a;

/** ASCII だけの文字列を bytes にする（並びの定数のため）。 */
export const ascii = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0));

/** bytes の at から、needle がそのまま並んでいるか。 */
export const startsWithAt = (bytes: Uint8Array, needle: Uint8Array, at: number): boolean =>
  at >= 0 && at + needle.length <= bytes.length && needle.every((b, i) => bytes[at + i] === b);

/** bytes の from から後で、needle が最初に現れる位置。無ければ -1。 */
export const indexOfSequence = (bytes: Uint8Array, needle: Uint8Array, from: number): number => {
  const first = needle[0];
  if (first === undefined) return -1;
  for (let at = bytes.indexOf(first, from); at !== -1; at = bytes.indexOf(first, at + 1)) {
    if (startsWithAt(bytes, needle, at)) return at;
  }
  return -1;
};

/** 空白かタブ（§4 の LWS の 1 文字）。 */
export const isBlank = (b: number | undefined): boolean => b === SP || b === HT;

/** span の start から続く空白とタブの終わり（span の end を越えない）。 */
export const skipBlanks = (bytes: Uint8Array, span: Span): number => {
  let at = span.start;
  while (at < span.end && isBlank(bytes[at])) at++;
  return at;
};

/**
 * 範囲の bytes を、1 octet を 1 文字（U+0000〜U+00FF）にして文字列にする。
 *
 * 欄の名前・Content-Length・版のように、ASCII で決まる物を読むため。表示のための
 * 文字の変換（UTF-8）は viewer がする。読み手は TextDecoder（ES の外）に頼らない。
 */
export const latin1 = (bytes: Uint8Array, span: Span): string => {
  let out = "";
  for (let i = span.start; i < span.end; i++) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
};
