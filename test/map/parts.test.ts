import { describe, expect, it } from "vitest";
import { deepestAt, findPart, partTree, type PartNode } from "../../src/map/parts.ts";
import { mapWarc } from "../../src/map/record.ts";
import { asField, buildWarc } from "../support/build-warc.ts";
import { minimalRecords } from "../support/examples.ts";

const built = buildWarc([
  {
    ...minimalRecords[0]!,
    lines: [...minimalRecords[0]!.lines, { name: "X-Note", value: "a", folded: [{ indent: " ", value: "b" }] }, { unreadable: "?" }],
  },
]);
const record = mapWarc(built.bytes).records[0]!;
const tree = partTree(record);

const all = (node: PartNode): PartNode[] => [node, ...node.children.flatMap(all)];

describe("partTree", () => {
  it("根は record で、その子は header・block・separator", () => {
    expect(tree.span).toEqual(record.record);
    expect(tree.children.map((c) => c.kind)).toEqual(["header", "block", "separator"]);
  });

  it("どの節の id も、record の中で一意", () => {
    const ids = all(tree).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("欄・折り返し・読めない行の葉を、書かれた順に持つ", () => {
    const header = tree.children[0]!;
    expect(header.children.map((c) => c.kind)).toEqual(["version", ...record.fields.map((f) => f.kind), "blank"]);
    const note = findPart(tree, `line.${String(record.fields.length - 2)}`)!;
    expect(note.children.map((c) => c.kind)).toEqual(["field-name", "colon", "space", "field-value", "line-end", "folded"]);
    expect(note.children.at(-1)!.children.map((c) => c.kind)).toEqual(["indent", "field-value", "line-end"]);
  });
});

describe("deepestAt", () => {
  it("octet を含む、いちばん深い葉を返す", () => {
    const type = asField(record.fields[0]);
    expect(deepestAt(tree, type.colon.start)?.id).toBe("line.0.colon");
    expect(deepestAt(tree, record.block.start)?.id).toBe("block");
  });

  it("長さ 0 の葉は選ばず、範囲の外なら undefined", () => {
    const empty = { ...tree, children: [{ id: "empty", kind: "space" as const, span: { start: 0, end: 0 }, children: [] }, ...tree.children] };
    expect(deepestAt(empty, 0)?.id).not.toBe("empty");
    expect(deepestAt(tree, record.record.end)).toBeUndefined();
  });
});

describe("findPart", () => {
  it("id の節を返し、無ければ undefined", () => {
    expect(findPart(tree, "separator")?.span).toEqual(record.separator);
    expect(findPart(tree, "line.99")).toBeUndefined();
  });
});
