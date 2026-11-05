/**
 * record の地図を、部分の木にする。viewer はこの木を描き、試験はこの木で覆う約束を確かめる。
 *
 * どの節も、子の範囲を前から並べると自分の範囲にちょうど等しい。
 */
import type { Span } from "./span.ts";
import type { HeaderLine, HttpMap, RecordMap } from "./types.ts";

export type PartKind =
  | "record"
  | "header"
  | "version"
  | "version-text"
  | "line-end"
  | "field"
  | "field-name"
  | "colon"
  | "space"
  | "field-value"
  | "folded"
  | "indent"
  | "unreadable"
  | "unreadable-content"
  | "blank"
  | "block"
  | "http-head"
  | "http-start-line"
  | "http-start-text"
  | "http-field"
  | "http-blank"
  | "entity"
  | "chunk"
  | "chunk-size"
  | "chunk-data"
  | "chunk-end"
  | "separator";

export interface PartNode {
  /** record の中で一意の名前。URL の hash の part= に書く。 */
  readonly id: string;
  readonly kind: PartKind;
  readonly span: Span;
  readonly children: readonly PartNode[];
}

const leaf = (id: string, kind: PartKind, span: Span): PartNode => ({ id, kind, span, children: [] });

/** 欄の行の節（WARC の header と HTTP の header で共通。欄の種類だけが違う）。 */
const lineNode = (id: string, line: HeaderLine, fieldKind: "field" | "http-field"): PartNode => {
  if (line.kind === "unreadable") {
    return {
      id,
      kind: "unreadable",
      span: line.line,
      children: [leaf(`${id}.content`, "unreadable-content", line.content), leaf(`${id}.eol`, "line-end", line.eol)],
    };
  }
  const folded = line.folded.map((f, j): PartNode => {
    const fid = `${id}.folded.${String(j)}`;
    return {
      id: fid,
      kind: "folded",
      span: f.line,
      children: [leaf(`${fid}.indent`, "indent", f.indent), leaf(`${fid}.value`, "field-value", f.value), leaf(`${fid}.eol`, "line-end", f.eol)],
    };
  });
  return {
    id,
    kind: fieldKind,
    span: line.line,
    children: [
      leaf(`${id}.name`, "field-name", line.name),
      leaf(`${id}.colon`, "colon", line.colon),
      leaf(`${id}.space`, "space", line.space),
      leaf(`${id}.value`, "field-value", line.value),
      leaf(`${id}.eol`, "line-end", line.eol),
      ...folded,
    ],
  };
};

/** block の節。application/http なら、HTTP の header と entity（chunked なら chunk）に割る。 */
const blockNode = (block: RecordMap["block"], http: HttpMap | undefined): PartNode => {
  if (http === undefined) return leaf("block", "block", block);
  const start: PartNode = {
    id: "block.head.start",
    kind: "http-start-line",
    span: http.startLine.line,
    children: [leaf("block.head.start.text", "http-start-text", http.startLine.text), leaf("block.head.start.eol", "line-end", http.startLine.eol)],
  };
  const head: PartNode = {
    id: "block.head",
    kind: "http-head",
    span: http.head,
    children: [
      start,
      ...http.fields.map((line, i) => lineNode(`block.head.line.${String(i)}`, line, "http-field")),
      leaf("block.head.blank", "http-blank", http.blank),
    ],
  };
  const chunks = http.chunked?.chunks.map((c, j): PartNode => {
    const id = `block.entity.chunk.${String(j)}`;
    return {
      id,
      kind: "chunk",
      span: c.line,
      children: [
        leaf(`${id}.size`, "chunk-size", c.size),
        leaf(`${id}.size-eol`, "line-end", c.sizeEol),
        leaf(`${id}.data`, "chunk-data", c.data),
        leaf(`${id}.data-eol`, "line-end", c.dataEol),
      ],
    };
  });
  const entity: PartNode =
    http.chunked === undefined || chunks === undefined
      ? leaf("block.entity", "entity", http.entity)
      : { id: "block.entity", kind: "entity", span: http.entity, children: [...chunks, leaf("block.entity.end", "chunk-end", http.chunked.end)] };
  return { id: "block", kind: "block", span: block, children: [head, entity] };
};

/** record の部分の木。根は record、その子は header・block・separator。 */
export const partTree = (record: RecordMap): PartNode => {
  const version: PartNode = {
    id: "version",
    kind: "version",
    span: record.version.line,
    children: [leaf("version.text", "version-text", record.version.text), leaf("version.eol", "line-end", record.version.eol)],
  };
  const header: PartNode = {
    id: "header",
    kind: "header",
    span: record.header,
    children: [version, ...record.fields.map((line, i) => lineNode(`line.${String(i)}`, line, "field")), leaf("blank", "blank", record.blank)],
  };
  return {
    id: "record",
    kind: "record",
    span: record.record,
    children: [header, blockNode(record.block, record.http), leaf("separator", "separator", record.separator)],
  };
};

/** offset の octet を含む、いちばん深い節。長さ 0 の節は octet を含まないので選ばれない。 */
export const deepestAt = (node: PartNode, offset: number): PartNode | undefined => {
  if (offset < node.span.start || offset >= node.span.end) return undefined;
  for (const child of node.children) {
    const hit = deepestAt(child, offset);
    if (hit !== undefined) return hit;
  }
  return node;
};

/** id の節。無ければ undefined。 */
export const findPart = (node: PartNode, id: string): PartNode | undefined => {
  if (node.id === id) return node;
  for (const child of node.children) {
    const hit = findPart(child, id);
    if (hit !== undefined) return hit;
  }
  return undefined;
};
