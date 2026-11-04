/**
 * WARC の bytes を record に区切り、byte の地図にする。
 *
 *   warc-record = header CRLF block CRLF CRLF   （WARC 1.1 の §4）
 *
 * record の終わりは Content-Length で決める。Content-Length が無い・数でない・その先に
 * record を閉じる並びが無いときは、次の record の頭（閉じる並びに続く `WARC/`）を探して
 * 区切り直す（wacz-validator の `warc-records.ts` と同じ規則）。block がたまたま同じ並びを
 * 含むと区切りを誤るが、そのときは長さの問題が先に出ている。
 */
import { ascii, indexOfSequence, startsWithAt } from "./bytes.ts";
import { fieldText, lastField } from "./fields.ts";
import { RECORD_HEAD, readHeader, type Header } from "./header.ts";
import { spanLength, type Span } from "./span.ts";
import type { Problem, RecordMap, WarcMap } from "./types.ts";

/** record を閉じる並び。header を閉じた空行と同じ改行で探す（LF で書いた record は LF LF で閉じる）。 */
const TERMINATORS = {
  crlf: { closing: ascii("\r\n\r\n"), beforeNext: ascii("\r\n\r\nWARC/") },
  lf: { closing: ascii("\n\n"), beforeNext: ascii("\n\nWARC/") },
} as const;
type Terminator = (typeof TERMINATORS)[keyof typeof TERMINATORS];

const DIGITS = /^\d+$/;

interface Body {
  readonly block: Span;
  readonly separator: Span;
}

/**
 * Content-Length で区切れなかった block の終わりを、次の record の頭から探す。
 * 見つからなければ file の終わりまでが block（終わりが閉じる並びなら、それは区切り）。
 */
const resync = (bytes: Uint8Array, bodyStart: number, terminator: Terminator): Body => {
  const next = indexOfSequence(bytes, terminator.beforeNext, bodyStart);
  if (next !== -1) {
    return { block: { start: bodyStart, end: next }, separator: { start: next, end: next + terminator.closing.length } };
  }
  const end = bytes.length;
  const closed = end - bodyStart >= terminator.closing.length && startsWithAt(bytes, terminator.closing, end - terminator.closing.length);
  const blockEnd = closed ? end - terminator.closing.length : end;
  return { block: { start: bodyStart, end: blockEnd }, separator: { start: blockEnd, end } };
};

const readBody = (bytes: Uint8Array, header: Header): { body: Body; problems: Problem[] } => {
  const bodyStart = header.blank.end;
  const terminator = spanLength(header.blank) === 2 ? TERMINATORS.crlf : TERMINATORS.lf;
  const field = lastField(bytes, header.fields, "Content-Length");
  if (field === undefined) {
    return { body: resync(bytes, bodyStart, terminator), problems: [{ code: "content-length-missing", span: header.header }] };
  }
  const text = fieldText(bytes, field);
  const declared = DIGITS.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(declared)) {
    return { body: resync(bytes, bodyStart, terminator), problems: [{ code: "content-length-form", span: field.value }] };
  }

  const blockEnd = bodyStart + declared;
  const after = blockEnd + terminator.closing.length;
  const closes = startsWithAt(bytes, terminator.closing, blockEnd);
  if (closes && (after === bytes.length || startsWithAt(bytes, RECORD_HEAD, after))) {
    return { body: { block: { start: bodyStart, end: blockEnd }, separator: { start: blockEnd, end: after } }, problems: [] };
  }
  if (blockEnd === bytes.length) {
    return { body: { block: { start: bodyStart, end: blockEnd }, separator: { start: blockEnd, end: blockEnd } }, problems: [] };
  }
  const body = resync(bytes, bodyStart, terminator);
  return {
    body,
    problems: [{ code: "content-length-mismatch", span: field.value, declared, actual: spanLength(body.block) }],
  };
};

const mapRecord = (bytes: Uint8Array, header: Header, index: number): RecordMap => {
  const { body, problems } = readBody(bytes, header);
  const terminatorProblems: Problem[] =
    spanLength(body.separator) === 0 ? [{ code: "no-terminator", span: body.separator }] : [];
  return {
    index,
    record: { start: header.header.start, end: body.separator.end },
    header: header.header,
    version: header.version,
    fields: header.fields,
    blank: header.blank,
    block: body.block,
    separator: body.separator,
    problems: [...header.problems, ...problems, ...terminatorProblems].sort((a, b) => a.span.start - b.span.start),
  };
};

/**
 * bytes（圧縮していない WARC。.warc.gz は解いた後の流れ）を byte の地図にする。
 * 版の行で始まらない所や、header が閉じない所に来たら、そこから先を rest にして止める。
 */
export const mapWarc = (bytes: Uint8Array): WarcMap => {
  const records: RecordMap[] = [];
  for (let start = 0; start < bytes.length; ) {
    const read = readHeader(bytes, start);
    if (!read.ok) return { records, rest: read.problem.span, problems: [read.problem] };
    const record = mapRecord(bytes, read.value, records.length);
    records.push(record);
    start = record.record.end;
  }
  return { records, problems: [] };
};
