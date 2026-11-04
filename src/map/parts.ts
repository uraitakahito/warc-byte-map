/**
 * record の地図を、部分の木にする。viewer はこの木を描き、試験はこの木で覆う約束を確かめる。
 *
 * どの節も、子の範囲を前から並べると自分の範囲にちょうど等しい。
 */
import type { Span } from "./span.ts";
import type { RecordMap } from "./types.ts";

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
  | "separator";

export interface PartNode {
  /** record の中で一意の名前。URL の hash の part= に書く。 */
  readonly id: string;
  readonly kind: PartKind;
  readonly span: Span;
  readonly children: readonly PartNode[];
}

const leaf = (id: string, kind: PartKind, span: Span): PartNode => ({ id, kind, span, children: [] });

/** record の部分の木。根は record、その子は header・block・separator。 */
export const partTree = (record: RecordMap): PartNode => {
  const version: PartNode = {
    id: "version",
    kind: "version",
    span: record.version.line,
    children: [leaf("version.text", "version-text", record.version.text), leaf("version.eol", "line-end", record.version.eol)],
  };
  const lines = record.fields.map((line, i): PartNode => {
    const id = `line.${String(i)}`;
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
      kind: "field",
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
  });
  const header: PartNode = {
    id: "header",
    kind: "header",
    span: record.header,
    children: [version, ...lines, leaf("blank", "blank", record.blank)],
  };
  return {
    id: "record",
    kind: "record",
    span: record.record,
    children: [header, leaf("block", "block", record.block), leaf("separator", "separator", record.separator)],
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
