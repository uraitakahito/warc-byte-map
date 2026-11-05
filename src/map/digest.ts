/**
 * WARC-Block-Digest と WARC-Payload-Digest を、どの範囲に掛けた物かと一緒に返す。
 *
 * hash の計算そのものはしない（読み手を同期のまま保つため。viewer が WebCrypto で計算する）。
 * ここに在るのは、欄の値の読み方・hash を掛ける範囲・base32 と base16 の符号化だけ。
 */
import { fieldText, lastField } from "./fields.ts";
import type { Span } from "./span.ts";
import type { FieldMap, RecordMap } from "./types.ts";

/** `labelled-digest = algorithm ":" digest-value`（WARC 1.1 の §5.8）。算法は小文字にする。 */
export interface LabelledDigest {
  readonly algorithm: string;
  readonly value: string;
}

export const parseLabelledDigest = (text: string): LabelledDigest | undefined => {
  const m = /^([A-Za-z0-9-]+):(\S+)$/.exec(text.trim());
  const [, algorithm, value] = m ?? [];
  return algorithm === undefined || value === undefined ? undefined : { algorithm: algorithm.toLowerCase(), value };
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 の base32（大文字。= の埋めは付けない）。 */
export const base32 = (bytes: Uint8Array): string => {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31] ?? "";
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  return bits > 0 ? out + (ALPHABET[(buffer << (5 - bits)) & 31] ?? "") : out;
};

/** 16 進（小文字）。 */
export const base16 = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** 計算した hash が、欄の値（base32 か base16。大文字小文字と = の埋めは問わない）と同じか。 */
export const digestMatches = (hash: Uint8Array, value: string): boolean => {
  const v = value.replace(/=+$/, "").toUpperCase();
  return v === base32(hash) || v === base16(hash).toUpperCase();
};

export interface DigestCheck {
  readonly name: "WARC-Block-Digest" | "WARC-Payload-Digest";
  readonly field: FieldMap;
  /** 欄の値の形が違えば undefined。 */
  readonly declared?: LabelledDigest;
  /** hash を掛ける範囲。前からつないで 1 つの bytes にする。payload がこの record に無ければ空。 */
  readonly spans: readonly Span[];
  /**
   * chunked のときだけ: Transfer-Encoding を解かない entity。仕様の読み（解いた物）と違うが、
   * こちらに掛ける道具もありうるので、両方を計算して比べる。
   */
  readonly alternative?: readonly Span[];
}

/** record の 2 つの digest の欄（在る物だけ）と、それぞれが掛かる範囲。 */
export const digestChecks = (bytes: Uint8Array, record: RecordMap): DigestCheck[] => {
  const check = (name: DigestCheck["name"], spans: readonly Span[], alternative?: readonly Span[]): DigestCheck[] => {
    const field = lastField(bytes, record.fields, name);
    if (field === undefined) return [];
    const declared = parseLabelledDigest(fieldText(bytes, field));
    return [{ name, field, ...(declared !== undefined && { declared }), spans, ...(alternative !== undefined && { alternative }) }];
  };
  const payload = record.payload.kind === "here" ? record.payload.spans : [];
  const chunkedEntity = record.http?.chunked === undefined ? undefined : [record.http.entity];
  return [...check("WARC-Block-Digest", [record.block]), ...check("WARC-Payload-Digest", payload, chunkedEntity)];
};
