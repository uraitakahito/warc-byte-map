import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { gunzipMembers, isGzip } from "../../src/map/gzip.ts";
import { mapWarc } from "../../src/map/record.ts";
import { buildWarc, withoutProblems } from "../support/build-warc.ts";
import { minimalRecords } from "../support/examples.ts";

/** record ごとの bytes（組み立てた位置で切る）。 */
const built = buildWarc(minimalRecords);
const recordBytes = built.records.map((r) => built.bytes.subarray(r.record.start, r.record.end));

/** 部品の並びを、1 つずつ gzip の member にしてつなぐ。Node の zlib で作る（fflate と別の実装）。 */
const gzipMembers = (groups: readonly Uint8Array[][]) => {
  const members = groups.map((group) => new Uint8Array(gzipSync(Buffer.concat(group))));
  const bytes = new Uint8Array(Buffer.concat(members));
  let at = 0;
  const compressed = members.map((m) => {
    const span = { start: at, end: at + m.length };
    at += m.length;
    return span;
  });
  return { bytes, compressed };
};

describe("gunzipMembers", () => {
  it.each([
    ["1 record 1 member", [[0], [1], [2], [3]]],
    ["1 member に 3 record と 1 record", [[0, 1, 2], [3]]],
    ["file 全体で 1 member", [[0, 1, 2, 3]]],
  ] as const)("%s: member ごとの 2 つの範囲を返し、解いた流れは元の WARC と同じ", (_title, groups) => {
    const gz = gzipMembers(groups.map((g) => g.map((i) => recordBytes[i]!)));
    const inflated = gunzipMembers(gz.bytes);
    expect(inflated.error).toBeUndefined();
    expect(inflated.bytes).toEqual(built.bytes);
    let at = 0;
    const expected = groups.map((g, index) => {
      const length = g.reduce<number>((n, i) => n + recordBytes[i]!.length, 0);
      const inflatedSpan = { start: at, end: at + length };
      at += length;
      return { index, compressed: gz.compressed[index], inflated: inflatedSpan };
    });
    expect(inflated.members).toEqual(expected);
    expect(withoutProblems(mapWarc(inflated.bytes).records)).toEqual(built.records);
  });

  it("壊れた member に来たら、そこまでを返し、どの member かを言う", () => {
    const gz = gzipMembers([[recordBytes[0]!], [recordBytes[1]!], [recordBytes[2]!]]);
    const broken = gz.bytes.slice();
    const second = gz.compressed[1]!;
    broken.fill(0xff, second.start + 12, second.end - 8);
    const inflated = gunzipMembers(broken);
    expect(inflated.members.map((m) => m.index)).toEqual([0]);
    expect(inflated.bytes).toEqual(recordBytes[0]);
    expect(inflated.error?.kind).toBe("corrupt");
    expect(inflated.error?.member.start).toBe(second.start);
  });

  it("解いた長さの見積もりが上限を越えれば、解く前に断る", () => {
    const gz = gzipMembers([[recordBytes[0]!, recordBytes[1]!]]);
    const inflated = gunzipMembers(gz.bytes, recordBytes[0]!.length);
    expect(inflated.members).toEqual([]);
    expect(inflated.error?.kind).toBe("too-large");
  });
});

describe("isGzip", () => {
  it("gzip の magic（1f 8b）で始まるか", () => {
    expect(isGzip(Uint8Array.of(0x1f, 0x8b, 0x08))).toBe(true);
    expect(isGzip(new TextEncoder().encode("WARC/1.1"))).toBe(false);
    expect(isGzip(new Uint8Array())).toBe(false);
  });
});
