/**
 * 画面の言葉と、仕様の頁への行き先。
 *
 * 説明は自分の言葉で書き、仕様の本文は写さない（本文を使ってよい範囲が決まっていないため）。
 * 行き先は fork の注釈つき WARC 1.1 の頁の見出しの id で、番号はその頁が CSS で振る表示の番号。
 * id は推さずに公開の頁から写した（2026-11-05）。見出しが変われば、ここも直す。
 */
import type { PartKind } from "../map/parts.ts";
import type { ProblemCode } from "../map/types.ts";

export type Lang = "ja" | "en";

export const SPEC_PAGE = "https://uraitakahito.github.io/warc-specifications/specifications/warc-format/warc-1.1-annotated/";

export interface Section {
  /** fork の頁に出る番号（3.1.1 など）。 */
  readonly number: string;
  readonly anchor: string;
}

export interface Term {
  readonly label: Record<Lang, string>;
  readonly note?: Record<Lang, string>;
  readonly section?: Section;
}

const MODEL: Section = { number: "4", anchor: "file-and-record-model" };

export const TERMS: Record<PartKind, Term> = {
  record: {
    label: { ja: "WARC record", en: "WARC record" },
    note: {
      ja: "WARC の file を成す 1 単位。header・block・閉じる CRLF CRLF から成る。",
      en: "One unit of a WARC file: a header, a block, and a closing CRLF CRLF.",
    },
    section: { number: "3.1.1", anchor: "warc-record" },
  },
  header: {
    label: { ja: "WARC record header", en: "WARC record header" },
    note: { ja: "版の行と欄の行の並び。空行で閉じる。", en: "The version line and the field lines, closed by an empty line." },
    section: { number: "3.1.4", anchor: "warc-record-header" },
  },
  version: {
    label: { ja: "版の行", en: "Version line" },
    note: { ja: "record の頭。WARC/ と版の番号。", en: "The start of a record: WARC/ and a version number." },
    section: MODEL,
  },
  "version-text": { label: { ja: "版", en: "Version" }, section: MODEL },
  "line-end": {
    label: { ja: "改行", en: "Line end" },
    note: { ja: "CR LF（0D 0A）。LF だけなら 1 octet で、仕様の形ではない。", en: "CR LF (0D 0A). A bare LF is one octet and not the specified form." },
    section: MODEL,
  },
  field: {
    label: { ja: "named field（欄）", en: "Named field" },
    note: { ja: "名前・コロン・値の 1 組。", en: "A name, a colon and a value." },
    section: { number: "3.1.5", anchor: "warc-named-fields" },
  },
  "field-name": {
    label: { ja: "欄の名前", en: "Field name" },
    note: { ja: "大文字小文字を区別しない。", en: "Case-insensitive." },
    section: MODEL,
  },
  colon: { label: { ja: "コロン", en: "Colon" }, section: MODEL },
  space: {
    label: { ja: "値の前の空白", en: "Space before the value" },
    note: { ja: "§4 の文法では値の一部（LWS）。", en: "Part of the value (LWS) in the §4 grammar." },
    section: MODEL,
  },
  "field-value": { label: { ja: "欄の値", en: "Field value" }, section: MODEL },
  folded: {
    label: { ja: "折り返しの行", en: "Folded line" },
    note: {
      ja: "空白かタブで始まり、前の欄の値に続く。§4 は許すが、注釈は書かないよう勧める。",
      en: "Starts with a space or tab and continues the previous value. Allowed by §4; the annotations advise against it.",
    },
    section: MODEL,
  },
  indent: { label: { ja: "字下げ", en: "Indent" }, section: MODEL },
  unreadable: { label: { ja: "欄として読めない行", en: "Unreadable line" }, section: MODEL },
  "unreadable-content": { label: { ja: "行の中身", en: "Line content" } },
  blank: {
    label: { ja: "header を閉じる空行", en: "Empty line closing the header" },
    section: MODEL,
  },
  block: {
    label: { ja: "WARC record content block", en: "WARC record content block" },
    note: { ja: "header の後の、Content-Length 個の octet。", en: "The Content-Length octets after the header." },
    section: { number: "3.1.2", anchor: "warc-record-content-block" },
  },
  separator: {
    label: { ja: "record を閉じる CRLF CRLF", en: "CRLF CRLF closing the record" },
    note: { ja: "block の後の 2 つの改行。block の中身ではない。", en: "Two line ends after the block; not part of it." },
    section: MODEL,
  },
};

/** 名前の決まった欄の節（名前は小文字で引く）。 */
export const FIELD_SECTIONS: Readonly<Record<string, Section>> = {
  "warc-record-id": { number: "5.2", anchor: "warc-record-id-mandatory" },
  "content-length": { number: "5.3", anchor: "content-length-mandatory" },
  "warc-date": { number: "5.4", anchor: "warc-date-mandatory" },
  "warc-type": { number: "5.5", anchor: "warc-type-mandatory" },
  "content-type": { number: "5.6", anchor: "content-type" },
  "warc-concurrent-to": { number: "5.7", anchor: "warc-concurrent-to" },
  "warc-block-digest": { number: "5.8", anchor: "warc-block-digest" },
  "warc-payload-digest": { number: "5.9", anchor: "warc-payload-digest" },
  "warc-ip-address": { number: "5.10", anchor: "warc-ip-address" },
  "warc-refers-to": { number: "5.11", anchor: "warc-refers-to" },
  "warc-refers-to-target-uri": { number: "5.12", anchor: "warc-refers-to-target-uri" },
  "warc-refers-to-date": { number: "5.13", anchor: "warc-refers-to-date" },
  "warc-target-uri": { number: "5.14", anchor: "warc-target-uri" },
  "warc-truncated": { number: "5.15", anchor: "warc-truncated" },
  "warc-warcinfo-id": { number: "5.16", anchor: "warc-warcinfo-id" },
  "warc-filename": { number: "5.17", anchor: "warc-filename" },
  "warc-profile": { number: "5.18", anchor: "warc-profile" },
  "warc-identified-payload-type": { number: "5.19", anchor: "warc-identified-payload-type" },
  "warc-segment-number": { number: "5.20", anchor: "warc-segment-number" },
  "warc-segment-origin-id": { number: "5.21", anchor: "warc-segment-origin-id" },
  "warc-segment-total-length": { number: "5.22", anchor: "warc-segment-total-length" },
};

export const PROBLEMS: Record<ProblemCode, Record<Lang, string>> = {
  "no-version-line": { ja: "版の行（WARC/<版>）で始まらないので、ここから先は record として読めない。", en: "Does not start with a version line (WARC/<version>), so the rest cannot be read as records." },
  "no-blank-line": { ja: "header を閉じる空行の前に file が終わった。", en: "The file ends before the empty line that closes the header." },
  "lf-line-ending": { ja: "CR LF でなく LF だけで終わる行がある（最初の 1 つを指す）。", en: "A line ends with a bare LF instead of CR LF (the first one is marked)." },
  "bad-field-line": { ja: "欄（名前: 値）として読めない行。", en: "A line that cannot be read as a field (name: value)." },
  "folded-line": { ja: "値が次の行へ折り返されている。§4 は許すが、注釈は書かないよう勧める。", en: "A value is folded onto the next line. Allowed by §4; the annotations advise against it." },
  "content-length-missing": { ja: "Content-Length の欄が無いので、次の record の頭で block を区切った。", en: "No Content-Length field, so the block was cut at the start of the next record." },
  "content-length-form": { ja: "Content-Length の値が数でないので、次の record の頭で block を区切った。", en: "Content-Length is not a number, so the block was cut at the start of the next record." },
  "content-length-mismatch": { ja: "Content-Length の先に record を閉じる並びが無いので、区切り直した。", en: "No closing sequence where Content-Length points, so the block was cut again." },
  "no-terminator": { ja: "block の後に、record を閉じる CRLF CRLF が無い。", en: "No CRLF CRLF closes the record after the block." },
};

export const sectionUrl = (section: Section): string => `${SPEC_PAGE}#${section.anchor}`;
