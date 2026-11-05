/**
 * byte の地図の形。
 *
 * どの部分も [start, end) の範囲で持ち、子の範囲を並べると親の範囲にちょうど等しい
 * （隙間も重なりも無い）。file 全体は records の record と rest が覆う。
 * 値は整えない: 空白も、改行の CR の有無も、折り返しも、書かれたとおりの範囲のまま返す。
 */
import type { Span } from "./span.ts";

/** 版の行（`WARC/1.1` と改行）。 */
export interface VersionLine {
  readonly line: Span;
  /** `WARC/1.1` の部分。改行は含まない。 */
  readonly text: Span;
  readonly eol: Span;
}

/** 折り返して続く行。前の欄の値の続き。 */
export interface FoldedLine {
  readonly line: Span;
  /** 行の頭の空白かタブ。 */
  readonly indent: Span;
  readonly value: Span;
  readonly eol: Span;
}

/** `名前: 値` の欄。line = name・colon・space・value・eol・folded の各行。 */
export interface FieldMap {
  readonly kind: "field";
  /** 欄の全体。折り返しの行も含む。 */
  readonly line: Span;
  readonly name: Span;
  /** `:` の 1 octet。 */
  readonly colon: Span;
  /** コロンの後の空白とタブ（無ければ長さ 0）。§4 の文法では値の前の LWS。 */
  readonly space: Span;
  /** 1 行目の値。行の終わりの空白も含む。 */
  readonly value: Span;
  /** 1 行目の改行。CR LF なら 2 octet、LF だけなら 1 octet。 */
  readonly eol: Span;
  readonly folded: readonly FoldedLine[];
}

/** 欄として読めない行（名前が token でない・コロンが無い・前の欄が無いのに折り返している）。 */
export interface UnreadableLine {
  readonly kind: "unreadable";
  readonly line: Span;
  readonly content: Span;
  readonly eol: Span;
}

export type HeaderLine = FieldMap | UnreadableLine;

export type ProblemCode =
  /** 版の行（`WARC/<版>`）で始まらない。そこから file の終わりまでを rest にする。 */
  | "no-version-line"
  /** header を閉じる空行が無いまま、file が終わった。その record の頭から rest にする。 */
  | "no-blank-line"
  /** header の行が CR LF でなく LF だけで終わっている。span は最初のその改行。 */
  | "lf-line-ending"
  /** 欄として読めない行が在る。 */
  | "bad-field-line"
  /** 値が次の行へ折り返されている。§4 の文法では合法で、注釈つきの頁の注は書かないよう勧める。 */
  | "folded-line"
  /** Content-Length の欄が無い。span は header。 */
  | "content-length-missing"
  /** Content-Length の値が数（1*DIGIT）でない。span はその値。 */
  | "content-length-form"
  /** Content-Length の値の先に、record を閉じる並びが無い。span はその値。 */
  | "content-length-mismatch"
  /** block の後に、record を閉じる並びが無い。span は長さ 0 の区切り。 */
  | "no-terminator"
  /** application/http の block の中に、HTTP の header を閉じる空行が無い。span は block。 */
  | "http-no-blank-line"
  /** Transfer-Encoding: chunked と言うのに、chunk の形に読めない。span は entity。 */
  | "chunked-malformed";

export interface Problem {
  readonly code: ProblemCode;
  /** 問題の在り処。viewer はここを強調する。 */
  readonly span: Span;
  /** content-length-mismatch のときだけ: 宣言した長さ。 */
  readonly declared?: number;
  /** content-length-mismatch のときだけ: 次の record の頭で区切り直して数えた block の長さ。 */
  readonly actual?: number;
}

/** HTTP の start line（`HTTP/1.1 200 OK` や `GET / HTTP/1.1`）と改行。 */
export interface StartLine {
  readonly line: Span;
  readonly text: Span;
  readonly eol: Span;
}

/** chunked の 1 つの chunk。line = size・sizeEol・data・dataEol。 */
export interface ChunkMap {
  readonly line: Span;
  /** 長さの行の中身（16 進の長さと、在れば chunk の拡張）。 */
  readonly size: Span;
  readonly sizeEol: Span;
  readonly data: Span;
  readonly dataEol: Span;
}

/**
 * application/http の block の中。block = head・entity、head = start line・欄・空行。
 * chunked なら entity = chunks・end。
 */
export interface HttpMap {
  readonly head: Span;
  readonly startLine: StartLine;
  readonly fields: readonly HeaderLine[];
  readonly blank: Span;
  /** 空行の後の、block の終わりまで（HTTP の message-body）。 */
  readonly entity: Span;
  readonly chunked?: {
    readonly chunks: readonly ChunkMap[];
    /** 長さ 0 の最後の chunk・trailer・終わりの改行（entity の終わりまで）。 */
    readonly end: Span;
  };
}

/** payload の在り処。record の type ごとの定め（WARC 1.1 の §6）で決める。 */
export type Payload =
  /** この record の中に在る。chunked なら chunk の data ごとの範囲が並ぶ（つなぐと payload）。 */
  | { readonly kind: "here"; readonly spans: readonly Span[] }
  /** 別の record の物（revisit の元の record・segment に割った logical record）。 */
  | { readonly kind: "elsewhere"; readonly reason: "revisit" | "segment" }
  /** この type（や scheme）の payload を、仕様が定めていない。 */
  | { readonly kind: "not-defined" }
  /** 定めは在るが、block を読めないので範囲を決められない。 */
  | { readonly kind: "unreadable" };

/** 1 つの record。record = header・block・separator、header = version・fields・blank。 */
export interface RecordMap {
  /** file の中の順番（0 から）。 */
  readonly index: number;
  readonly record: Span;
  readonly header: Span;
  readonly version: VersionLine;
  readonly fields: readonly HeaderLine[];
  /** header を閉じる空行（CR LF か LF）。 */
  readonly blank: Span;
  readonly block: Span;
  /** block が application/http で、その header を読めたとき: block の中。 */
  readonly http?: HttpMap;
  readonly payload: Payload;
  /** record を閉じる並び（CR LF CR LF。LF で書いた record は LF LF）。無ければ長さ 0。 */
  readonly separator: Span;
  readonly problems: readonly Problem[];
}

export interface WarcMap {
  readonly records: readonly RecordMap[];
  /** record として読めなかった、file の終わりまでの bytes。全部読めたときは無い。 */
  readonly rest?: Span;
  /** rest の問題（no-version-line か no-blank-line）。record ごとの問題は RecordMap に在る。 */
  readonly problems: readonly Problem[];
}
