/**
 * 試験の WARC を部品から組み立て、組み立てた位置をそのまま「期待の地図」にする。
 *
 * 期待を読み手の出力から写すと、読み手が自分と同じ誤りを正しいと言う。ここでは bytes を前から
 * 並べ、並べた位置を覚えるだけなので、読み手とは別の道で範囲が決まる。
 */
import type { Span } from "../../src/map/span.ts";
import type { ChunkMap, FieldMap, FoldedLine, HeaderLine, HttpMap, RecordMap, UnreadableLine } from "../../src/map/types.ts";

/** 欄の値にこれを書くと、block の octet の数に置き換わる。 */
export const BLOCK_LENGTH = Symbol("block length");

export type Eol = "\r\n" | "\n";

export interface FieldSpec {
  readonly name: string;
  readonly value: string | typeof BLOCK_LENGTH;
  /** コロンの後の空白（既定は空白 1 つ）。 */
  readonly space?: string;
  readonly eol?: Eol;
  readonly folded?: readonly { readonly indent: string; readonly value: string; readonly eol?: Eol }[];
}

/** 欄として読めない行。 */
export interface UnreadableSpec {
  readonly unreadable: string;
  readonly eol?: Eol;
}

export type LineSpec = FieldSpec | UnreadableSpec;

/** application/http の block。entity を文字列の並びで渡すと、chunked にして並べる。 */
export interface HttpSpec {
  readonly startLine: string;
  readonly lines: readonly LineSpec[];
  readonly entity: string | readonly string[];
}

export interface RecordSpec {
  /** 既定は `WARC/1.1`。 */
  readonly version?: string;
  readonly versionEol?: Eol;
  readonly lines: readonly LineSpec[];
  readonly blankEol?: Eol;
  readonly block?: string | HttpSpec;
  /** 既定は CR LF CR LF。 */
  readonly separator?: string;
}

/** payload は type ごとの定めで決まるので、試験が別に確かめる。 */
export type ExpectedRecord = Omit<RecordMap, "problems" | "payload">;

export interface BuiltWarc {
  readonly bytes: Uint8Array;
  readonly records: readonly ExpectedRecord[];
  /** trailing を足したときだけ: その範囲。 */
  readonly trailing?: Span;
}

const encoder = new TextEncoder();

/** 部品を前から並べ、並べた位置を範囲として返す。 */
const writer = () => {
  const chunks: Uint8Array[] = [];
  let length = 0;
  return {
    put(text: string | Uint8Array): Span {
      const bytes = typeof text === "string" ? encoder.encode(text) : text;
      chunks.push(bytes);
      const span = { start: length, end: length + bytes.length };
      length += bytes.length;
      return span;
    },
    bytes(): Uint8Array {
      const out = new Uint8Array(length);
      let at = 0;
      for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
      }
      return out;
    },
  };
};

type Writer = ReturnType<typeof writer>;

const putField = (w: Writer, spec: FieldSpec, blockLength: number): FieldMap => {
  const name = w.put(spec.name);
  const colon = w.put(":");
  const space = w.put(spec.space ?? " ");
  const value = w.put(spec.value === BLOCK_LENGTH ? String(blockLength) : spec.value);
  const eol = w.put(spec.eol ?? "\r\n");
  const folded: FoldedLine[] = (spec.folded ?? []).map((f) => {
    const indent = w.put(f.indent);
    const foldedValue = w.put(f.value);
    const foldedEol = w.put(f.eol ?? "\r\n");
    return { line: { start: indent.start, end: foldedEol.end }, indent, value: foldedValue, eol: foldedEol };
  });
  const end = (folded.at(-1)?.eol ?? eol).end;
  return { kind: "field", line: { start: name.start, end }, name, colon, space, value, eol, folded };
};

const putUnreadable = (w: Writer, spec: UnreadableSpec): UnreadableLine => {
  const content = w.put(spec.unreadable);
  const eol = w.put(spec.eol ?? "\r\n");
  return { kind: "unreadable", line: { start: content.start, end: eol.end }, content, eol };
};

const putLine = (w: Writer, spec: LineSpec, blockLength: number): HeaderLine =>
  "unreadable" in spec ? putUnreadable(w, spec) : putField(w, spec, blockLength);

/** HTTP の block を、block の頭を 0 とした位置で組み立てる。 */
const buildHttp = (spec: HttpSpec): { bytes: Uint8Array; http: HttpMap } => {
  const w = writer();
  const text = w.put(spec.startLine);
  const startEol = w.put("\r\n");
  const fields = spec.lines.map((line) => putLine(w, line, 0));
  const blank = w.put("\r\n");
  let chunked: HttpMap["chunked"];
  if (typeof spec.entity === "string") {
    w.put(spec.entity);
  } else {
    const chunks = spec.entity.map((data): ChunkMap => {
      const size = w.put(encoder.encode(data).length.toString(16));
      const sizeEol = w.put("\r\n");
      const dataSpan = w.put(data);
      const dataEol = w.put("\r\n");
      return { line: { start: size.start, end: dataEol.end }, size, sizeEol, data: dataSpan, dataEol };
    });
    const last = w.put("0\r\n\r\n");
    chunked = { chunks, end: last };
  }
  const bytes = w.bytes();
  const http: HttpMap = {
    head: { start: 0, end: blank.end },
    startLine: { line: { start: text.start, end: startEol.end }, text, eol: startEol },
    fields,
    blank,
    entity: { start: blank.end, end: bytes.length },
    ...(chunked !== undefined && { chunked }),
  };
  return { bytes, http };
};

/** 範囲（start と end を持つ物）を、木の全部で by だけずらす。 */
const shift = <T,>(value: T, by: number): T => {
  if (Array.isArray(value)) return (value as unknown[]).map((v) => shift(v, by)) as T;
  if (typeof value !== "object" || value === null) return value;
  const entries = Object.entries(value as Record<string, unknown>).map(([k, v]): [string, unknown] => [
    k,
    (k === "start" || k === "end") && typeof v === "number" ? v + by : shift(v, by),
  ]);
  return Object.fromEntries(entries) as T;
};

/** records を並べた WARC と、その期待の地図。trailing は最後の record の後に足す bytes。 */
export const buildWarc = (specs: readonly RecordSpec[], trailing?: string): BuiltWarc => {
  const w = writer();
  const records = specs.map((spec, index): ExpectedRecord => {
    const built = typeof spec.block === "object" ? buildHttp(spec.block) : { bytes: encoder.encode(spec.block ?? "") };
    const text = w.put(spec.version ?? "WARC/1.1");
    const versionEol = w.put(spec.versionEol ?? "\r\n");
    const fields = spec.lines.map((line) => putLine(w, line, built.bytes.length));
    const blank = w.put(spec.blankEol ?? "\r\n");
    const block = w.put(built.bytes);
    const separator = w.put(spec.separator ?? "\r\n\r\n");
    return {
      index,
      record: { start: text.start, end: separator.end },
      header: { start: text.start, end: blank.end },
      version: { line: { start: text.start, end: versionEol.end }, text, eol: versionEol },
      fields,
      blank,
      block,
      ...("http" in built && { http: shift(built.http, block.start) }),
      separator,
    };
  });
  const tail = trailing === undefined ? undefined : w.put(trailing);
  return { bytes: w.bytes(), records, ...(tail !== undefined && { trailing: tail }) };
};

/** 地図から problems と payload を外す（期待の地図と比べるため）。 */
export const withoutProblems = (records: readonly RecordMap[]): ExpectedRecord[] =>
  records.map(({ problems: _problems, payload: _payload, ...rest }) => rest);

/** 地図の行を欄として取り出す。欄でなければ投げる（試験の組み立ての誤り）。 */
export const asField = (line: HeaderLine | undefined): FieldMap => {
  if (line?.kind !== "field") throw new Error("欄でない行を、欄として読もうとした");
  return line;
};
