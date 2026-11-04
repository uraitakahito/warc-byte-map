/**
 * record の header（版の行・欄の行・header を閉じる空行）を、位置つきで読む。
 *
 * WARC 1.1 の §4 の形:
 *
 *   header      = version warc-fields
 *   version     = "WARC/1.1" CRLF
 *   warc-fields = *( named-field CRLF )
 *   named-field = field-name ":" [ field-value ]
 *
 * 行は LF で探し、直前が CR かを行ごとに見る（LF だけの行も読み、lf-line-ending を言う）。
 * 空白かタブで始まる行は、前の欄の値の続き（折り返し）。読み方の規則は wacz-validator の
 * `warc-records.ts`・`named-fields.ts` から写した。違うのは、値を整えずに範囲で返すこと。
 */
import { COLON, CR, LF, ascii, isBlank, latin1, skipBlanks, startsWithAt } from "./bytes.ts";
import { spanLength, type Span } from "./span.ts";
import type { FieldMap, FoldedLine, HeaderLine, Problem, VersionLine } from "./types.ts";

/** record の頭。版の行はこれで始まる。 */
export const RECORD_HEAD = ascii("WARC/");

const VERSION = /^WARC\/\d+\.\d+$/;
/** 版の行の長さの上限の目安。これより長い行は、文字にして確かめるまでもなく版の行でない。 */
const VERSION_MAX = 32;

/** RFC 7230 の tchar。欄の名前に許される文字。 */
const TCHAR = new Set(
  Array.from("!#$%&'*+-.^_`|~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", (c) => c.charCodeAt(0)),
);

interface Line {
  readonly line: Span;
  readonly content: Span;
  readonly eol: Span;
}

/** start から LF までの 1 行。LF が無ければ undefined（行が閉じていない）。 */
const readLine = (bytes: Uint8Array, start: number): Line | undefined => {
  const lf = bytes.indexOf(LF, start);
  if (lf === -1) return undefined;
  const eolStart = lf > start && bytes[lf - 1] === CR ? lf - 1 : lf;
  return { line: { start, end: lf + 1 }, content: { start, end: eolStart }, eol: { start: eolStart, end: lf + 1 } };
};

/** 欄の 1 行目を読む。名前が token でない・コロンが無いなら undefined。 */
const readFieldStart = (bytes: Uint8Array, line: Line): Omit<FieldMap, "line" | "folded"> | undefined => {
  const colonAt = bytes.indexOf(COLON, line.content.start);
  if (colonAt === -1 || colonAt >= line.content.end || colonAt === line.content.start) return undefined;
  for (let i = line.content.start; i < colonAt; i++) {
    if (!TCHAR.has(bytes[i] ?? -1)) return undefined;
  }
  const afterColon = { start: colonAt + 1, end: line.content.end };
  const valueStart = skipBlanks(bytes, afterColon);
  return {
    kind: "field",
    name: { start: line.content.start, end: colonAt },
    colon: { start: colonAt, end: colonAt + 1 },
    space: { start: colonAt + 1, end: valueStart },
    value: { start: valueStart, end: line.content.end },
    eol: line.eol,
  };
};

const foldedLine = (bytes: Uint8Array, line: Line): FoldedLine => {
  const valueStart = skipBlanks(bytes, line.content);
  return {
    line: line.line,
    indent: { start: line.content.start, end: valueStart },
    value: { start: valueStart, end: line.content.end },
    eol: line.eol,
  };
};

export interface Header {
  readonly header: Span;
  readonly version: VersionLine;
  readonly fields: readonly HeaderLine[];
  readonly blank: Span;
  readonly problems: readonly Problem[];
}

export type HeaderResult =
  | { readonly ok: true; readonly value: Header }
  /** 読めない。problem の span は、start から file の終わりまで。 */
  | { readonly ok: false; readonly problem: Problem };

/**
 * start から header を読む。版の行で始まらない・空行の前に file が終わる、のどちらかなら
 * 読めない（ok: false）。
 */
export const readHeader = (bytes: Uint8Array, start: number): HeaderResult => {
  const rest = { start, end: bytes.length };
  const first = readLine(bytes, start);
  if (first === undefined) {
    const code = startsWithAt(bytes, RECORD_HEAD, start) ? "no-blank-line" : "no-version-line";
    return { ok: false, problem: { code, span: rest } };
  }
  if (spanLength(first.content) > VERSION_MAX || !VERSION.test(latin1(bytes, first.content))) {
    return { ok: false, problem: { code: "no-version-line", span: rest } };
  }

  const problems: Problem[] = [];
  const fields: HeaderLine[] = [];
  let bareLf = spanLength(first.eol) === 1 ? first.eol : undefined;
  // 折り返しの行が続いてよい欄。次の欄の行・読めない行・空行で閉じて fields に入れる。
  let open: { start: Omit<FieldMap, "line" | "folded">; folded: FoldedLine[] } | undefined;
  const close = (): void => {
    if (open === undefined) return;
    const end = (open.folded.at(-1)?.line ?? open.start.eol).end;
    fields.push({ ...open.start, line: { start: open.start.name.start, end }, folded: open.folded });
    open = undefined;
  };

  for (let at = first.line.end; ; ) {
    const line = readLine(bytes, at);
    if (line === undefined) return { ok: false, problem: { code: "no-blank-line", span: rest } };
    if (bareLf === undefined && spanLength(line.eol) === 1) bareLf = line.eol;
    at = line.line.end;

    if (spanLength(line.content) === 0) {
      close();
      if (bareLf !== undefined) problems.push({ code: "lf-line-ending", span: bareLf });
      return {
        ok: true,
        value: {
          header: { start, end: line.line.end },
          version: { line: first.line, text: first.content, eol: first.eol },
          fields,
          blank: line.line,
          problems,
        },
      };
    }

    if (isBlank(bytes[line.content.start]) && open !== undefined) {
      open.folded.push(foldedLine(bytes, line));
      problems.push({ code: "folded-line", span: line.line });
      continue;
    }

    close();
    const field = isBlank(bytes[line.content.start]) ? undefined : readFieldStart(bytes, line);
    if (field === undefined) {
      fields.push({ kind: "unreadable", line: line.line, content: line.content, eol: line.eol });
      problems.push({ code: "bad-field-line", span: line.line });
    } else {
      open = { start: field, folded: [] };
    }
  }
};
