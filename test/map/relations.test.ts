import { describe, expect, it } from "vitest";
import { mapWarc } from "../../src/map/record.ts";
import { relationsOf } from "../../src/map/relations.ts";
import { BLOCK_LENGTH, buildWarc, type LineSpec, type RecordSpec } from "../support/build-warc.ts";

const id = (n: number) => `<urn:uuid:00000000-0000-4000-8000-00000000000${String(n)}>`;
const rec = (n: number, extra: readonly LineSpec[]): RecordSpec => ({
  lines: [{ name: "WARC-Type", value: "metadata" }, { name: "WARC-Record-ID", value: id(n) }, ...extra, { name: "Content-Length", value: BLOCK_LENGTH }],
  block: "x",
});

describe("relationsOf", () => {
  const built = buildWarc([
    rec(1, []),
    rec(2, [{ name: "WARC-Warcinfo-ID", value: id(1) }, { name: "WARC-Concurrent-To", value: id(3) }, { name: "WARC-Concurrent-To", value: id(9) }]),
    rec(3, [{ name: "warc-refers-to", value: id(2) }]),
  ]);
  const relations = relationsOf(built.bytes, mapWarc(built.bytes).records);

  it("指す欄を書かれた順に読み、同じ file に在る相手の順番を返す（WARC-Concurrent-To は繰り返してよい）", () => {
    expect(relations.outgoing[1]!.map((r) => [r.name, r.target])).toEqual([
      ["WARC-Concurrent-To", 2],
      ["WARC-Concurrent-To", undefined],
      ["WARC-Warcinfo-ID", 0],
    ]);
    expect(relations.outgoing[1]![1]!.value).toBe(id(9));
  });

  it("欄の名前の大文字小文字を区別しない", () => {
    expect(relations.outgoing[2]!.map((r) => [r.name, r.target])).toEqual([["WARC-Refers-To", 1]]);
  });

  it("相手の側からは、指してくる record が引ける", () => {
    expect(relations.incoming).toEqual([
      [{ name: "WARC-Warcinfo-ID", from: 1 }],
      [{ name: "WARC-Refers-To", from: 2 }],
      [{ name: "WARC-Concurrent-To", from: 1 }],
    ]);
  });
});
