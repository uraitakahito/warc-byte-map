/**
 * digest を WebCrypto で計算する（読み手は範囲だけを返し、計算は viewer の側でする）。
 */
import type { Span } from "../map/span.ts";

/** WARC の欄の算法の名前 → WebCrypto の名前。md5 などは WebCrypto に無い。 */
const WEBCRYPTO: Readonly<Record<string, string>> = {
  sha1: "SHA-1",
  "sha-1": "SHA-1",
  sha256: "SHA-256",
  "sha-256": "SHA-256",
  sha384: "SHA-384",
  "sha-384": "SHA-384",
  sha512: "SHA-512",
  "sha-512": "SHA-512",
};

/** spans を前からつないだ bytes の hash。WebCrypto に無い算法なら undefined。 */
export const digestOf = async (algorithm: string, bytes: Uint8Array, spans: readonly Span[]): Promise<Uint8Array | undefined> => {
  const name = WEBCRYPTO[algorithm];
  if (name === undefined) return undefined;
  const joined = new Uint8Array(spans.reduce((n, s) => n + s.end - s.start, 0));
  let at = 0;
  for (const s of spans) {
    joined.set(bytes.subarray(s.start, s.end), at);
    at += s.end - s.start;
  }
  return new Uint8Array(await crypto.subtle.digest(name, joined));
};
