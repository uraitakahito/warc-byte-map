/**
 * application/http の block の中（start line・欄・空行・entity）を、位置つきで読む。
 *
 * 欄の行は WARC の header と同じ読み方（readFieldBlock）。Transfer-Encoding が chunked なら、
 * entity を chunk に割る（RFC 2616 の §3.6.1: 16 進の長さの行・data・改行の繰り返しと、長さ 0 の
 * 最後の chunk・trailer）。
 */
import { latin1 } from "./bytes.ts";
import { fieldText, lastField } from "./fields.ts";
import { readFieldBlock, readLine } from "./header.ts";
import { spanLength, type Span } from "./span.ts";
import type { ChunkMap, HeaderLine, HttpMap, Problem } from "./types.ts";

const HEX = /^[0-9A-Fa-f]+$/;

/** WARC の欄の Content-Type が application/http か（引数は見ない）。 */
export const isHttpBlock = (bytes: Uint8Array, fields: readonly HeaderLine[]): boolean => {
  const type = lastField(bytes, fields, "Content-Type");
  return type !== undefined && /^application\/http\s*(;|$)/i.test(fieldText(bytes, type));
};

/** entity を chunk に割る。chunk の形に読めなければ undefined。 */
const readChunks = (bytes: Uint8Array, entity: Span): HttpMap["chunked"] => {
  const chunks: ChunkMap[] = [];
  for (let at = entity.start; ; ) {
    const line = readLine(bytes, at, entity.end);
    if (line === undefined) return undefined;
    const sizeText = latin1(bytes, line.content).split(";")[0]?.trim() ?? "";
    if (!HEX.test(sizeText)) return undefined;
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isSafeInteger(size)) return undefined;
    if (size === 0) return { chunks, end: { start: line.line.start, end: entity.end } };
    const data = { start: line.line.end, end: line.line.end + size };
    const after = data.end <= entity.end ? readLine(bytes, data.end, entity.end) : undefined;
    if (after === undefined || spanLength(after.content) !== 0) return undefined;
    chunks.push({ line: { start: line.line.start, end: after.line.end }, size: line.content, sizeEol: line.eol, data, dataEol: after.eol });
    at = after.line.end;
  }
};

/** mapHttp の結果。http が無ければ、HTTP の header が block の中で閉じなかった。 */
export interface HttpRead {
  readonly http?: HttpMap;
  readonly problems: readonly Problem[];
}

/** block を HTTP の message として読む。 */
export const mapHttp = (bytes: Uint8Array, block: Span): HttpRead => {
  const start = readLine(bytes, block.start, block.end);
  const head = start === undefined ? undefined : readFieldBlock(bytes, start.line.end, block.end);
  if (start === undefined || head === undefined) return { problems: [{ code: "http-no-blank-line", span: block }] };
  const entity = { start: head.blank.end, end: block.end };
  const http: HttpMap = {
    head: { start: block.start, end: head.blank.end },
    startLine: { line: start.line, text: start.content, eol: start.eol },
    fields: head.fields,
    blank: head.blank,
    entity,
  };
  const coding = lastField(bytes, head.fields, "Transfer-Encoding");
  if (coding === undefined || !/(^|,)\s*chunked$/i.test(fieldText(bytes, coding))) return { http, problems: [] };
  const chunked = readChunks(bytes, entity);
  return chunked === undefined
    ? { http, problems: [{ code: "chunked-malformed", span: entity }] }
    : { http: { ...http, chunked }, problems: [] };
};
