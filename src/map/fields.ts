import { latin1 } from "./bytes.ts";
import type { FieldMap, HeaderLine } from "./types.ts";

/**
 * 欄の値を文字列で返す。折り返しは空白 1 つでつなぎ、前後の空白とタブを落とす。
 *
 * 値を読んで判断するため（Content-Length・WARC-Type など）の物で、地図の範囲は変えない。
 * 1 octet を 1 文字にするので、ASCII の外の値は表示に使わない（それは viewer が UTF-8 で読む）。
 */
export const fieldText = (bytes: Uint8Array, field: FieldMap): string =>
  [field.value, ...field.folded.map((f) => f.value)]
    .map((span) => latin1(bytes, span))
    .join(" ")
    .replace(/^[ \t]+|[ \t]+$/g, "");

/** 名前が name の欄を、書かれた順に全部。名前の大文字小文字は区別しない（WARC 1.1）。 */
export const fieldsNamed = (bytes: Uint8Array, lines: readonly HeaderLine[], name: string): FieldMap[] => {
  const wanted = name.toLowerCase();
  return lines.filter((line): line is FieldMap => line.kind === "field" && latin1(bytes, line.name).toLowerCase() === wanted);
};

/**
 * 名前が name の欄のうち、最後の物。
 * 同じ名前が繰り返されたときに後の物を使うのは、wacz-validator の読み手と同じ。
 */
export const lastField = (bytes: Uint8Array, lines: readonly HeaderLine[], name: string): FieldMap | undefined =>
  fieldsNamed(bytes, lines, name).at(-1);
